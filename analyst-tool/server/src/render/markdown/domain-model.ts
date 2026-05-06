/**
 * domain-model.ts — deterministic Markdown renderer for the full domain model.
 *
 * Cypher copied verbatim from nacl-render/SKILL.md lines 439-448.
 * Full classDiagram with dedup rule: SKILL.md lines 458-483.
 * Template: SKILL.md lines 487-521.
 *
 * Output path: docs/12-domain/_domain-model.md
 */
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import path from 'node:path';
import { buildClassDiagram, type AttrInput, type RelInput, type EnumInput } from './mermaid.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function toList<T>(v: unknown): T[] {
  if (!Array.isArray(v)) return [];
  return v as T[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cypher (verbatim from SKILL.md lines 439-448)
// ---------------------------------------------------------------------------

// Note: enumerations fetched separately to avoid "nested aggregate" error in Neo4j 5.
const DOMAIN_MODEL_QUERY = `
MATCH (de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de,
       collect(DISTINCT da) AS attributes,
       collect(DISTINCT {target_id: de2.id, target_name: de2.name, rel_type: rel.rel_type, cardinality: rel.cardinality}) AS relationships,
       m.name AS module_name;
`;

// Separate enum query per SKILL.md fallback pattern (lines 94-97)
const ENUM_QUERY = `
MATCH (de:DomainEntity)-[:HAS_ENUM]->(en:Enumeration)
OPTIONAL MATCH (en)-[:HAS_VALUE]->(ev:EnumValue)
RETURN de.id AS entity_id, en.id AS enum_id, en.name AS enum_name,
       collect(ev.value) AS values;
`;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface EntityRecord {
  id: string;
  name: string;
  description: string | null;
  module_name: string | null;
  attributes: AttrInput[];
  relationships: RelInput[];
  enumerations: EnumInput[];
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchDomainModelData(driver: Driver): Promise<EntityRecord[]> {
  const [mainResult, enumResult] = await Promise.all([
    (async () => {
      const session = driver.session({ defaultAccessMode: neo4j.session.READ });
      try {
        return await session.run(DOMAIN_MODEL_QUERY);
      } finally {
        await session.close();
      }
    })(),
    (async () => {
      const session = driver.session({ defaultAccessMode: neo4j.session.READ });
      try {
        return await session.run(ENUM_QUERY);
      } finally {
        await session.close();
      }
    })(),
  ]);

  // Build enum lookup: entity_id → enum records
  const enumsByEntity = new Map<string, EnumInput[]>();
  for (const r of enumResult.records) {
    const entityId = toStr(r.get('entity_id')) ?? '';
    if (!entityId) continue;
    const enumInput: EnumInput = {
      enum_id: toStr(r.get('enum_id')),
      enum_name: toStr(r.get('enum_name')),
      values: toList<unknown>(r.get('values')).map((v) => String(v ?? '')).filter(Boolean),
    };
    const list = enumsByEntity.get(entityId) ?? [];
    list.push(enumInput);
    enumsByEntity.set(entityId, list);
  }

  return mainResult.records
    .map((r) => {
      const de = r.get('de') as { properties: Record<string, unknown> };
      const props = de?.properties ?? {};
      const entityId = toStr(props['id']) ?? '';

      const attributes = toList<Record<string, unknown>>(r.get('attributes'))
        .filter((a) => a && toStr(a['name']) !== null)
        .map((a) => ({
          name: toStr(a['name']),
          data_type: toStr(a['data_type']),
        }))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

      const relationships = toList<Record<string, unknown>>(r.get('relationships'))
        .filter((rel) => rel && toStr(rel['target_id']) !== null)
        .map((rel) => ({
          target_id: toStr(rel['target_id']),
          target_name: toStr(rel['target_name']),
          rel_type: toStr(rel['rel_type']),
          cardinality: toStr(rel['cardinality']),
        }))
        .sort((a, b) => (a.target_id ?? '').localeCompare(b.target_id ?? ''));

      const enumerations = (enumsByEntity.get(entityId) ?? [])
        .sort((a, b) => (a.enum_id ?? '').localeCompare(b.enum_id ?? ''));

      return {
        id: entityId,
        name: toStr(props['name']) ?? '',
        description: toStr(props['description']),
        module_name: toStr(r.get('module_name')),
        attributes,
        relationships,
        enumerations,
      };
    })
    .filter((e) => e.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderDomainModelContent(entities: EntityRecord[]): string {
  const date = today();

  // Build full class diagram with deduplication
  const diagram = buildClassDiagram(entities, true);

  // Collect unique enumerations across all entities
  const allEnums = new Map<string, { name: string; values: string[] }>();
  for (const entity of entities) {
    for (const en of entity.enumerations) {
      if (en.enum_id && !allEnums.has(en.enum_id)) {
        allEnums.set(en.enum_id, { name: en.enum_name ?? '', values: en.values });
      }
    }
  }

  // Collect all relationships (deduplication: A.name < B.name)
  const allRels: { source: string; target: string; rel_type: string; cardinality: string }[] = [];
  const seenRels = new Set<string>();
  for (const entity of entities) {
    for (const rel of entity.relationships) {
      if (!rel.target_name || !rel.target_id) continue;
      const [sortedFrom, sortedTo] = [entity.name, rel.target_name].sort();
      const key = `${sortedFrom}::${sortedTo}::${rel.rel_type ?? ''}`;
      if (seenRels.has(key)) continue;
      seenRels.add(key);
      allRels.push({
        source: entity.name,
        target: rel.target_name,
        rel_type: rel.rel_type ?? '',
        cardinality: rel.cardinality ?? '',
      });
    }
  }

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push('title: "Domain Model"');
  lines.push('type: domain-model');
  lines.push('generated_from: graph');
  lines.push(`date: ${date}`);
  lines.push('---');
  lines.push('');

  // Header
  lines.push('# Domain Model');
  lines.push('');

  // Class diagram
  lines.push('## Диаграмма классов');
  lines.push('');
  lines.push('```mermaid');
  lines.push(diagram);
  lines.push('```');
  lines.push('');

  // Entities table
  lines.push('## Сущности');
  lines.push('');
  lines.push('| Сущность | Модуль | Атрибутов | Связей | Описание |');
  lines.push('|----------|--------|-----------|--------|----------|');
  for (const entity of entities) {
    lines.push(
      `| ${entity.name} | ${entity.module_name ?? ''} | ${entity.attributes.length} | ${entity.relationships.length} | ${entity.description ?? ''} |`,
    );
  }
  lines.push('');

  // Enumerations table (omit if none)
  if (allEnums.size > 0) {
    lines.push('## Справочники');
    lines.push('');
    lines.push('| Справочник | Значения |');
    lines.push('|------------|----------|');
    // Sort by enum_id for determinism
    for (const [, en] of [...allEnums.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`| ${en.name} | ${en.values.join(', ')} |`);
    }
    lines.push('');
  }

  // Key relationships table (omit if none)
  if (allRels.length > 0) {
    lines.push('## Ключевые связи');
    lines.push('');
    lines.push('| Источник | Цель | Тип | Кардинальность |');
    lines.push('|----------|------|-----|----------------|');
    for (const rel of allRels.sort((a, b) =>
      `${a.source}::${a.target}`.localeCompare(`${b.source}::${b.target}`),
    )) {
      lines.push(`| ${rel.source} | ${rel.target} | ${rel.rel_type} | ${rel.cardinality} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderResult {
  path: string;
  content: string;
}

/**
 * Render the full domain model as Markdown.
 *
 * @param driver      Neo4j driver
 * @param projectRoot Absolute project root
 */
export async function renderDomainModelMd(
  driver: Driver,
  projectRoot: string,
): Promise<RenderResult> {
  const entities = await fetchDomainModelData(driver);

  const filePath = path.join(projectRoot, 'docs', '12-domain', '_domain-model.md');
  const content = renderDomainModelContent(entities);

  return { path: filePath, content };
}

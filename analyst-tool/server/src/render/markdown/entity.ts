/**
 * entity.ts — deterministic Markdown renderer for a single DomainEntity.
 *
 * Cypher copied verbatim from nacl-render/SKILL.md lines 78-97.
 * Template from SKILL.md lines 133-188.
 *
 * Output path: resolved from node.source_file (project-relative).
 * Throws MissingSourceFileError when source_file is absent — Wave 1 is read-only.
 */
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import path from 'node:path';
import {
  buildClassDiagram,
  type AttrInput,
  type RelInput,
  type EnumInput,
} from './mermaid.js';
import { MissingSourceFileError } from './errors.js';

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
  // Deterministic within a day; test harness normalises this field.
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cypher (verbatim from SKILL.md lines 78-89)
// ---------------------------------------------------------------------------

// Note: enumerations are fetched via a separate query (ENUM_QUERY) to avoid
// Neo4j's "nested aggregate functions" restriction (SKILL.md lines 92-97).
const ENTITY_QUERY = `
MATCH (de:DomainEntity {id: $entityId})
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
OPTIONAL MATCH (de)<-[:REALIZED_AS]-(be:BusinessEntity)
OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de,
       collect(DISTINCT da) AS attributes,
       collect(DISTINCT {target_id: de2.id, target_name: de2.name, rel_type: rel.rel_type, cardinality: rel.cardinality}) AS relationships,
       be.id AS ba_source_id, be.name AS ba_source_name,
       m.id AS module_id, m.name AS module_name,
       de.source_file AS source_file;
`;

// Fallback enum query (SKILL.md lines 94-97) — used if nested collect fails
const ENUM_QUERY = `
MATCH (de:DomainEntity {id: $entityId})-[:HAS_ENUM]->(en:Enumeration)
OPTIONAL MATCH (en)-[:HAS_VALUE]->(ev:EnumValue)
RETURN en.id, en.name, collect(ev.value) AS values;
`;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface EntityData {
  id: string;
  name: string;
  description: string | null;
  source_file: string | null;
  module_id: string | null;
  module_name: string | null;
  ba_source_id: string | null;
  ba_source_name: string | null;
  attributes: AttrInput[];
  relationships: RelInput[];
  enumerations: EnumInput[];
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchEntityData(driver: Driver, entityId: string): Promise<EntityData | null> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(ENTITY_QUERY, { entityId });
    if (result.records.length === 0) return null;

    const r = result.records[0];
    const de = r.get('de') as { properties: Record<string, unknown> };
    const props = de?.properties ?? {};

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

    return {
      id: toStr(props['id']) ?? entityId,
      name: toStr(props['name']) ?? entityId,
      description: toStr(props['description']),
      source_file: toStr(r.get('source_file')),
      module_id: toStr(r.get('module_id')),
      module_name: toStr(r.get('module_name')),
      ba_source_id: toStr(r.get('ba_source_id')),
      ba_source_name: toStr(r.get('ba_source_name')),
      attributes,
      relationships,
      enumerations: [], // filled below via separate query
    };
  } finally {
    await session.close();
  }
}

async function fetchEnums(driver: Driver, entityId: string): Promise<EnumInput[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(ENUM_QUERY, { entityId });
    return result.records
      .map((r) => ({
        enum_id: toStr(r.get('en.id')),
        enum_name: toStr(r.get('en.name')),
        values: toList<unknown>(r.get('values')).map((v) => String(v ?? '')).filter(Boolean),
      }))
      .filter((e) => e.enum_id !== null)
      .sort((a, b) => (a.enum_id ?? '').localeCompare(b.enum_id ?? ''));
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderEntityContent(data: EntityData): string {
  const { name, description, module_name, ba_source_id, ba_source_name,
          attributes, relationships, enumerations } = data;

  const date = today();

  // Build class diagram
  const diagram = buildClassDiagram([{
    name,
    attributes,
    relationships,
    enumerations,
  }]);

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: "${name}"`);
  lines.push('type: entity');
  lines.push(`module: ${module_name ?? ''}`);
  lines.push('generated_from: graph');
  lines.push(`date: ${date}`);
  lines.push('---');
  lines.push('');

  // Header
  lines.push(`# ${name}`);
  lines.push('');

  // Description
  lines.push('## Описание');
  lines.push('');
  lines.push(description ?? '');
  lines.push('');

  // BA source (omit if null)
  if (ba_source_id) {
    lines.push('## BA-источник');
    lines.push('');
    lines.push('| BA-сущность | ID |');
    lines.push('|---|---|');
    lines.push(`| ${ba_source_name ?? ''} | ${ba_source_id} |`);
    lines.push('');
  }

  // Class diagram
  lines.push('## Диаграмма классов');
  lines.push('');
  lines.push('```mermaid');
  lines.push(diagram);
  lines.push('```');
  lines.push('');

  // Attributes table
  lines.push('## Атрибуты');
  lines.push('');
  lines.push('| Атрибут | Тип | Обязательный | Описание |');
  lines.push('|---------|-----|--------------|----------|');
  for (const attr of attributes) {
    const required = (attr as { required?: boolean | string }).required ?? '';
    const attrDesc = (attr as { description?: string }).description ?? '';
    lines.push(`| ${attr.name ?? ''} | ${attr.data_type ?? ''} | ${required} | ${attrDesc} |`);
  }
  lines.push('');

  // Relationships table
  if (relationships.length > 0) {
    lines.push('## Связи');
    lines.push('');
    lines.push('| Связь | Целевая сущность | Кардинальность | Тип |');
    lines.push('|-------|-------------------|----------------|-----|');
    for (const rel of relationships) {
      lines.push(`| ${rel.rel_type ?? ''} | ${rel.target_name ?? ''} | ${rel.cardinality ?? ''} | ${rel.rel_type ?? ''} |`);
    }
    lines.push('');
  }

  // Enumerations table (omit if none)
  if (enumerations.length > 0) {
    lines.push('## Справочники');
    lines.push('');
    lines.push('| Справочник | Значения |');
    lines.push('|------------|----------|');
    for (const en of enumerations) {
      lines.push(`| ${en.enum_name ?? ''} | ${en.values.join(', ')} |`);
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
 * Render a DomainEntity as Markdown.
 *
 * @param driver    Neo4j driver
 * @param entityId  DomainEntity.id (e.g. "DE-Order")
 * @param projectRoot  Absolute project root (for path computation)
 */
export async function renderEntityMd(
  driver: Driver,
  entityId: string,
  projectRoot: string,
): Promise<RenderResult> {
  const [data, enumerations] = await Promise.all([
    fetchEntityData(driver, entityId),
    fetchEnums(driver, entityId),
  ]);

  if (!data) {
    throw Object.assign(
      new Error(`DomainEntity "${entityId}" not found in graph`),
      { statusCode: 404, code: 'entity_not_found' },
    );
  }

  data.enumerations = enumerations;

  if (!data.source_file) {
    throw new MissingSourceFileError('DomainEntity', data.id);
  }

  const filePath = path.resolve(projectRoot, data.source_file);
  const content = renderEntityContent(data);

  return { path: filePath, content };
}

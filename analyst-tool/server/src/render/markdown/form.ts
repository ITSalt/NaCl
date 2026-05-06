/**
 * form.ts — deterministic Markdown renderer for a Form.
 *
 * Cypher copied verbatim from nacl-render/SKILL.md lines 344-359.
 * Mapping flowchart: SKILL.md lines 366-389.
 * Template: SKILL.md lines 393-427.
 *
 * Output path: resolved from node.source_file (project-relative).
 * Throws MissingSourceFileError when source_file is absent — Wave 1 is read-only.
 */
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import path from 'node:path';
import { buildFormMappingFlowchart, type FieldMappingInput } from './mermaid.js';
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
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cypher (verbatim from SKILL.md lines 344-359)
// ---------------------------------------------------------------------------

const FORM_QUERY = `
MATCH (f:Form {id: $formId})-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc:UseCase)-[:USES_FORM]->(f)
RETURN f,
       collect(DISTINCT {
         field_name: ff.name,
         field_id: ff.id,
         field_type: ff.field_type,
         field_label: ff.label,
         attr_name: da.name,
         attr_id: da.id,
         attr_type: da.data_type,
         entity_name: de.name,
         entity_id: de.id
       }) AS field_mappings,
       collect(DISTINCT uc) AS use_cases,
       f.source_file AS source_file;
`;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface UcRef {
  id: string;
  name: string | null;
}

interface FormData {
  id: string;
  name: string;
  source_file: string | null;
  fieldMappings: FieldMappingInput[];
  useCases: UcRef[];
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

function nodeProps(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') return {};
  const node = v as { properties?: Record<string, unknown> };
  return node.properties ?? (v as Record<string, unknown>);
}

async function fetchFormData(driver: Driver, formId: string): Promise<FormData | null> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(FORM_QUERY, { formId });
    if (result.records.length === 0) return null;

    const r = result.records[0];
    const fNode = r.get('f') as { properties: Record<string, unknown> } | null;
    if (!fNode) return null;
    const fProps = fNode.properties;

    const fieldMappings: FieldMappingInput[] = toList<Record<string, unknown>>(r.get('field_mappings'))
      .filter((fm) => fm && toStr(fm['field_id']) !== null)
      .map((fm) => ({
        field_name: toStr(fm['field_name']),
        field_id: toStr(fm['field_id']),
        field_type: toStr(fm['field_type']),
        field_label: toStr(fm['field_label']),
        attr_name: toStr(fm['attr_name']),
        attr_id: toStr(fm['attr_id']),
        attr_type: toStr(fm['attr_type']),
        entity_name: toStr(fm['entity_name']),
        entity_id: toStr(fm['entity_id']),
      }))
      .sort((a, b) => (a.field_id ?? '').localeCompare(b.field_id ?? ''));

    const useCases: UcRef[] = toList<unknown>(r.get('use_cases'))
      .map((uc) => {
        const p = nodeProps(uc);
        return { id: toStr(p['id']) ?? '', name: toStr(p['name']) };
      })
      .filter((uc) => uc.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    return {
      id: toStr(fProps['id']) ?? formId,
      name: toStr(fProps['name']) ?? formId,
      source_file: toStr(r.get('source_file')),
      fieldMappings,
      useCases,
    };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderFormContent(data: FormData): string {
  const { name, fieldMappings, useCases } = data;

  const date = today();

  // Coverage stats
  const total_fields = new Set(fieldMappings.map((fm) => fm.field_id).filter(Boolean)).size;
  const mapped_count = new Set(
    fieldMappings.filter((fm) => fm.attr_id !== null).map((fm) => fm.field_id).filter(Boolean),
  ).size;
  const unmapped_count = total_fields - mapped_count;
  const mapped_pct = total_fields > 0 ? Math.round((mapped_count / total_fields) * 100) : 0;

  // Build flowchart
  const flowchart = buildFormMappingFlowchart(name, fieldMappings);

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: "Форма: ${name}"`);
  lines.push('type: form-mapping');
  lines.push('generated_from: graph');
  lines.push(`date: ${date}`);
  lines.push('---');
  lines.push('');

  // Header
  lines.push(`# Форма: ${name}`);
  lines.push('');

  // Related UC
  lines.push('## Связанные UC');
  lines.push('');
  lines.push('| UC | Название |');
  lines.push('|----|----------|');
  if (useCases.length > 0) {
    for (const uc of useCases) {
      lines.push(`| ${uc.id} | ${uc.name ?? ''} |`);
    }
  } else {
    lines.push('| — | — |');
  }
  lines.push('');

  // Mapping diagram
  lines.push('## Диаграмма маппинга');
  lines.push('');
  lines.push('```mermaid');
  lines.push(flowchart);
  lines.push('```');
  lines.push('');

  // Fields table
  lines.push('## Таблица полей');
  lines.push('');
  lines.push('| Поле | Label | Тип поля | Атрибут | Тип атрибута | Сущность |');
  lines.push('|------|-------|----------|---------|--------------|----------|');

  // Unique per field_id (show one row per field)
  const seenFields = new Set<string>();
  for (const fm of fieldMappings) {
    if (!fm.field_id || seenFields.has(fm.field_id)) continue;
    seenFields.add(fm.field_id);
    lines.push(
      `| ${fm.field_name ?? ''} | ${fm.field_label ?? ''} | ${fm.field_type ?? ''} | ${fm.attr_name ?? ''} | ${fm.attr_type ?? ''} | ${fm.entity_name ?? ''} |`,
    );
  }
  lines.push('');

  // Coverage
  lines.push('## Покрытие');
  lines.push('');
  lines.push(`- Полей: ${total_fields}`);
  lines.push(`- Замаплено: ${mapped_count} (${mapped_pct}%)`);
  lines.push(`- Незамаплено: ${unmapped_count}`);
  lines.push('');

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
 * Render a Form as Markdown.
 *
 * @param driver      Neo4j driver
 * @param formId      Form.id (e.g. "SCR-001" or "FORM-OrderCreate")
 * @param projectRoot Absolute project root
 */
export async function renderFormMd(
  driver: Driver,
  formId: string,
  projectRoot: string,
): Promise<RenderResult> {
  const data = await fetchFormData(driver, formId);
  if (!data) {
    throw Object.assign(
      new Error(`Form "${formId}" not found in graph`),
      { statusCode: 404, code: 'form_not_found' },
    );
  }

  if (!data.source_file) {
    throw new MissingSourceFileError('Form', data.id);
  }

  const filePath = path.resolve(projectRoot, data.source_file);
  const content = renderFormContent(data);

  return { path: filePath, content };
}

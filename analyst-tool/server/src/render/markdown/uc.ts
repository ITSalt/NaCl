/**
 * uc.ts — deterministic Markdown renderer for a single UseCase.
 *
 * Cypher copied verbatim from nacl-render/SKILL.md lines 201-217.
 * Activity flowchart algorithm: SKILL.md lines 219-268.
 * Template: SKILL.md lines 273-331.
 *
 * Output path: resolved from node.source_file (project-relative).
 * Throws MissingSourceFileError when source_file is absent — Wave 1 is read-only.
 */
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import path from 'node:path';
import { buildActivityFlowchart, type StepInput } from './mermaid.js';
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

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cypher (verbatim from SKILL.md lines 201-217)
// ---------------------------------------------------------------------------

const UC_QUERY = `
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(dep:UseCase)
RETURN uc,
       collect(DISTINCT as_step) AS activity_steps,
       collect(DISTINCT f) AS forms,
       collect(DISTINCT {field: ff, attr: da, entity: de}) AS field_mappings,
       collect(DISTINCT rq) AS requirements,
       collect(DISTINCT sr) AS roles,
       m.id AS module_id, m.name AS module_name,
       collect(DISTINCT dep) AS dependencies,
       uc.source_file AS source_file;
`;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface StepRecord {
  id: string;
  step_number: number;
  description: string | null;
  step_type: string | null;
  actor: string | null;
}

interface FormRecord {
  id: string;
  name: string | null;
}

interface FieldMappingRecord {
  field_name: string | null;
  attr_name: string | null;
  entity_name: string | null;
}

interface RequirementRecord {
  id: string;
  description: string | null;
  type: string | null;
  priority: string | null;
}

interface RoleRecord {
  id: string;
  name: string | null;
}

interface DepRecord {
  id: string;
  name: string | null;
}

interface UcData {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  benefit: string | null;
  priority: string | null;
  source_file: string | null;
  module_id: string | null;
  module_name: string | null;
  activity_steps: StepRecord[];
  forms: FormRecord[];
  field_mappings: FieldMappingRecord[];
  requirements: RequirementRecord[];
  roles: RoleRecord[];
  dependencies: DepRecord[];
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

function nodeProps(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') return {};
  const node = v as { properties?: Record<string, unknown> };
  return node.properties ?? (v as Record<string, unknown>);
}

async function fetchUcData(driver: Driver, ucId: string): Promise<UcData | null> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(UC_QUERY, { ucId });
    if (result.records.length === 0) return null;

    const r = result.records[0];
    const ucNode = r.get('uc') as { properties: Record<string, unknown> } | null;
    if (!ucNode) return null;
    const uc = ucNode.properties;

    const activitySteps: StepRecord[] = toList<unknown>(r.get('activity_steps'))
      .map((step) => {
        const p = nodeProps(step);
        return {
          id: toStr(p['id']) ?? '',
          step_number: toNum(p['step_number']),
          description: toStr(p['description']),
          step_type: toStr(p['step_type']),
          actor: toStr(p['actor']),
        };
      })
      .filter((s) => s.id.length > 0)
      .sort((a, b) => a.step_number - b.step_number);

    const forms: FormRecord[] = toList<unknown>(r.get('forms'))
      .map((f) => {
        const p = nodeProps(f);
        return { id: toStr(p['id']) ?? '', name: toStr(p['name']) };
      })
      .filter((f) => f.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    const fieldMappings: FieldMappingRecord[] = toList<unknown>(r.get('field_mappings'))
      .map((fm) => {
        const m = fm as Record<string, unknown>;
        const ff = nodeProps(m['field']);
        const da = nodeProps(m['attr']);
        const de = nodeProps(m['entity']);
        return {
          field_name: toStr(ff['name']),
          attr_name: toStr(da['name']),
          entity_name: toStr(de['name']),
        };
      })
      .filter((fm) => fm.field_name !== null);

    const requirements: RequirementRecord[] = toList<unknown>(r.get('requirements'))
      .map((rq) => {
        const p = nodeProps(rq);
        return {
          id: toStr(p['id']) ?? '',
          description: toStr(p['description']),
          type: toStr(p['type']),
          priority: toStr(p['priority']),
        };
      })
      .filter((rq) => rq.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    const roles: RoleRecord[] = toList<unknown>(r.get('roles'))
      .map((sr) => {
        const p = nodeProps(sr);
        return { id: toStr(p['id']) ?? '', name: toStr(p['name']) };
      })
      .filter((sr) => sr.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    const dependencies: DepRecord[] = toList<unknown>(r.get('dependencies'))
      .map((dep) => {
        const p = nodeProps(dep);
        return { id: toStr(p['id']) ?? '', name: toStr(p['name']) };
      })
      .filter((d) => d.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    return {
      id: toStr(uc['id']) ?? ucId,
      name: toStr(uc['name']) ?? ucId,
      description: toStr(uc['description']),
      goal: toStr(uc['goal']),
      benefit: toStr(uc['benefit']),
      priority: toStr(uc['priority']),
      source_file: toStr(r.get('source_file')),
      module_id: toStr(r.get('module_id')),
      module_name: toStr(r.get('module_name')),
      activity_steps: activitySteps,
      forms,
      field_mappings: fieldMappings,
      requirements,
      roles,
      dependencies,
    };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderUcContent(data: UcData): string {
  const { id, name, description, goal, benefit, priority,
          module_id, module_name, activity_steps, forms,
          field_mappings, requirements, roles, dependencies } = data;

  const date = today();

  // Build activity flowchart
  const steps: StepInput[] = activity_steps.map((s) => ({
    id: s.id,
    step_number: s.step_number,
    description: s.description,
    step_type: s.step_type,
    actor: s.actor,
  }));
  const flowchart = buildActivityFlowchart(steps);

  // User story
  const userStoryRole = roles.length > 0 ? roles[0].name ?? roles[0].id : 'Пользователь';
  let userStory: string;
  if (goal && benefit) {
    userStory = `Как **${userStoryRole}**, я хочу **${goal}**, чтобы **${benefit}**.`;
  } else {
    userStory = description ?? '';
  }

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: "${id}. ${name}"`);
  lines.push('type: usecase');
  lines.push(`module: ${module_name ?? ''}`);
  lines.push(`priority: ${priority ?? ''}`);
  lines.push('generated_from: graph');
  lines.push(`date: ${date}`);
  lines.push('---');
  lines.push('');

  // Header
  lines.push(`# ${id}. ${name}`);
  lines.push('');

  // User Story
  lines.push('## User Story');
  lines.push('');
  lines.push(userStory);
  lines.push('');

  // Actor (omit if no roles)
  if (roles.length > 0) {
    lines.push('## Актор');
    lines.push('');
    for (const role of roles) {
      lines.push(`${role.name ?? ''} (${role.id})`);
    }
    lines.push('');
  }

  // Module
  if (module_name) {
    lines.push('## Модуль');
    lines.push('');
    lines.push(`${module_name} (${module_id ?? ''})`);
    lines.push('');
  }

  // Activity diagram
  lines.push('## Activity Diagram');
  lines.push('');
  lines.push('```mermaid');
  lines.push(flowchart);
  lines.push('```');
  lines.push('');

  // Steps table
  if (activity_steps.length > 0) {
    lines.push('## Шаги сценария');
    lines.push('');
    lines.push('| # | Актор | Описание | Тип |');
    lines.push('|---|-------|----------|-----|');
    for (const s of activity_steps) {
      lines.push(`| ${s.step_number} | ${s.actor ?? ''} | ${s.description ?? ''} | ${s.step_type ?? ''} |`);
    }
    lines.push('');
  }

  // Forms table (omit if empty)
  if (forms.length > 0) {
    lines.push('## Формы');
    lines.push('');
    lines.push('| Форма | Поля | Связанная сущность |');
    lines.push('|-------|------|--------------------|');
    for (const f of forms) {
      const fieldsForForm = field_mappings
        .filter((fm) => fm.field_name !== null)
        .map((fm) => fm.field_name ?? '');
      const entityNames = [...new Set(
        field_mappings
          .filter((fm) => fm.entity_name !== null)
          .map((fm) => fm.entity_name ?? ''),
      )];
      lines.push(`| ${f.name ?? f.id} | ${fieldsForForm.join(', ')} | ${entityNames.join(', ')} |`);
    }
    lines.push('');
  }

  // Requirements (omit if empty)
  if (requirements.length > 0) {
    lines.push('## Требования');
    lines.push('');
    lines.push('| ID | Описание | Тип | Приоритет |');
    lines.push('|----|----------|-----|-----------|');
    for (const rq of requirements) {
      lines.push(`| ${rq.id} | ${rq.description ?? ''} | ${rq.type ?? ''} | ${rq.priority ?? ''} |`);
    }
    lines.push('');
  }

  // Dependencies (omit if empty)
  if (dependencies.length > 0) {
    lines.push('## Зависимости');
    lines.push('');
    lines.push('| UC | Название |');
    lines.push('|----|----------|');
    for (const dep of dependencies) {
      lines.push(`| ${dep.id} | ${dep.name ?? ''} |`);
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
 * Render a UseCase as Markdown.
 *
 * @param driver      Neo4j driver
 * @param ucId        UseCase.id (e.g. "UC-001")
 * @param projectRoot Absolute project root
 */
export async function renderUcMd(
  driver: Driver,
  ucId: string,
  projectRoot: string,
): Promise<RenderResult> {
  const data = await fetchUcData(driver, ucId);
  if (!data) {
    throw Object.assign(
      new Error(`UseCase "${ucId}" not found in graph`),
      { statusCode: 404, code: 'uc_not_found' },
    );
  }

  if (!data.source_file) {
    throw new MissingSourceFileError('UseCase', data.id);
  }

  const filePath = path.resolve(projectRoot, data.source_file);
  const content = renderUcContent(data);

  return { path: filePath, content };
}

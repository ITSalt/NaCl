/**
 * traceability.ts — deterministic Markdown renderer for the BA→SA traceability matrix.
 *
 * Cypher copied verbatim from nacl-render/SKILL.md lines 585-595 (UNION ALL).
 * Coverage stats computed in TS via 4 supplementary queries.
 * Template: SKILL.md lines 609-650.
 *
 * Output path: docs/99-meta/traceability-matrix.md
 */
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
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
// Cypher — traceability matrix (verbatim from SKILL.md lines 585-595)
// ---------------------------------------------------------------------------

const TRACEABILITY_QUERY = `
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase)
RETURN 'Step→UC' AS category, ws.id AS ba_id, ws.function_name AS ba_name, uc.id AS sa_id, uc.name AS sa_name
UNION ALL
MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity)
RETURN 'Entity→Domain' AS category, be.id AS ba_id, be.name AS ba_name, de.id AS sa_id, de.name AS sa_name
UNION ALL
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
RETURN 'Role→SysRole' AS category, br.id AS ba_id, br.full_name AS ba_name, sr.id AS sa_id, sr.name AS sa_name
UNION ALL
MATCH (brq:BusinessRule)-[:IMPLEMENTED_BY]->(rq:Requirement)
RETURN 'Rule→Req' AS category, brq.id AS ba_id, brq.name AS ba_name, rq.id AS sa_id, rq.description AS sa_name;
`;

// ---------------------------------------------------------------------------
// Coverage stat queries (computed in TS via 4 supplementary queries)
// ---------------------------------------------------------------------------

async function fetchCount(driver: Driver, cypher: string): Promise<number> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher);
    if (result.records.length === 0) return 0;
    const val = result.records[0].get(0);
    return toNum(val);
  } finally {
    await session.close();
  }
}

interface CoverageStats {
  steps:    { covered: number; total: number };
  entities: { covered: number; total: number };
  roles:    { covered: number; total: number };
  rules:    { covered: number; total: number };
}

async function fetchCoverageStats(driver: Driver): Promise<CoverageStats> {
  const [
    stepsTotal, stepsCovered,
    entitiesTotal, entitiesCovered,
    rolesTotal, rolesCovered,
    rulesTotal, rulesCovered,
  ] = await Promise.all([
    fetchCount(driver, 'MATCH (ws:WorkflowStep) RETURN count(ws)'),
    fetchCount(driver, 'MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(:UseCase) RETURN count(DISTINCT ws)'),
    fetchCount(driver, 'MATCH (be:BusinessEntity) RETURN count(be)'),
    fetchCount(driver, 'MATCH (be:BusinessEntity)-[:REALIZED_AS]->(:DomainEntity) RETURN count(DISTINCT be)'),
    fetchCount(driver, 'MATCH (br:BusinessRole) RETURN count(br)'),
    fetchCount(driver, 'MATCH (br:BusinessRole)-[:MAPPED_TO]->(:SystemRole) RETURN count(DISTINCT br)'),
    fetchCount(driver, 'MATCH (brq:BusinessRule) RETURN count(brq)'),
    fetchCount(driver, 'MATCH (brq:BusinessRule)-[:IMPLEMENTED_BY]->(:Requirement) RETURN count(DISTINCT brq)'),
  ]);

  return {
    steps:    { covered: stepsCovered,    total: stepsTotal },
    entities: { covered: entitiesCovered, total: entitiesTotal },
    roles:    { covered: rolesCovered,    total: rolesTotal },
    rules:    { covered: rulesCovered,    total: rulesTotal },
  };
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface TraceRow {
  category: string;
  ba_id: string | null;
  ba_name: string | null;
  sa_id: string | null;
  sa_name: string | null;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchTraceabilityData(driver: Driver): Promise<TraceRow[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(TRACEABILITY_QUERY);
    return result.records
      .map((r) => ({
        category: toStr(r.get('category')) ?? '',
        ba_id: toStr(r.get('ba_id')),
        ba_name: toStr(r.get('ba_name')),
        sa_id: toStr(r.get('sa_id')),
        sa_name: toStr(r.get('sa_name')),
      }))
      .filter((row) => row.category.length > 0)
      .sort((a, b) => {
        // Sort within category by ba_id
        const catCmp = a.category.localeCompare(b.category);
        if (catCmp !== 0) return catCmp;
        return (a.ba_id ?? '').localeCompare(b.ba_id ?? '');
      });
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function pct(covered: number, total: number): string {
  if (total === 0) return '0';
  return Math.round((covered / total) * 100).toString();
}

function renderTraceabilityContent(
  rows: TraceRow[],
  coverage: CoverageStats,
): string {
  const date = today();

  // Group by category
  const byCategory = new Map<string, TraceRow[]>();
  for (const row of rows) {
    let list = byCategory.get(row.category);
    if (!list) { list = []; byCategory.set(row.category, list); }
    list.push(row);
  }

  const stepRows    = byCategory.get('Step→UC')      ?? [];
  const entityRows  = byCategory.get('Entity→Domain') ?? [];
  const roleRows    = byCategory.get('Role→SysRole')  ?? [];
  const ruleRows    = byCategory.get('Rule→Req')      ?? [];

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push('title: "BA→SA Traceability Matrix"');
  lines.push('type: traceability');
  lines.push('generated_from: graph');
  lines.push(`date: ${date}`);
  lines.push('---');
  lines.push('');

  // Header
  lines.push('# Трассировочная матрица BA → SA');
  lines.push('');

  // Coverage table
  lines.push('## Покрытие');
  lines.push('');
  lines.push('| Категория | Покрыто | Всего | % |');
  lines.push('|-----------|---------|-------|---|');
  lines.push(`| Шаги → UC | ${coverage.steps.covered} | ${coverage.steps.total} | ${pct(coverage.steps.covered, coverage.steps.total)}% |`);
  lines.push(`| Сущности → Domain | ${coverage.entities.covered} | ${coverage.entities.total} | ${pct(coverage.entities.covered, coverage.entities.total)}% |`);
  lines.push(`| Роли → SystemRole | ${coverage.roles.covered} | ${coverage.roles.total} | ${pct(coverage.roles.covered, coverage.roles.total)}% |`);
  lines.push(`| Правила → Requirements | ${coverage.rules.covered} | ${coverage.rules.total} | ${pct(coverage.rules.covered, coverage.rules.total)}% |`);
  lines.push('');

  // Section 1: Steps → UC
  lines.push('## 1. Бизнес-шаги → Use Cases');
  lines.push('');
  lines.push('| BA ID | BA Функция | SA ID | SA Use Case |');
  lines.push('|-------|------------|-------|-------------|');
  if (stepRows.length > 0) {
    for (const row of stepRows) {
      lines.push(`| ${row.ba_id ?? ''} | ${row.ba_name ?? ''} | ${row.sa_id ?? ''} | ${row.sa_name ?? ''} |`);
    }
  } else {
    lines.push('| — | — | — | — |');
  }
  lines.push('');

  // Section 2: Entities → Domain
  lines.push('## 2. Бизнес-сущности → Domain Entities');
  lines.push('');
  lines.push('| BA ID | BA Сущность | SA ID | SA Domain Entity |');
  lines.push('|-------|-------------|-------|------------------|');
  if (entityRows.length > 0) {
    for (const row of entityRows) {
      lines.push(`| ${row.ba_id ?? ''} | ${row.ba_name ?? ''} | ${row.sa_id ?? ''} | ${row.sa_name ?? ''} |`);
    }
  } else {
    lines.push('| — | — | — | — |');
  }
  lines.push('');

  // Section 3: Roles → SystemRole
  lines.push('## 3. Бизнес-роли → System Roles');
  lines.push('');
  lines.push('| BA ID | BA Роль | SA ID | SA System Role |');
  lines.push('|-------|---------|-------|----------------|');
  if (roleRows.length > 0) {
    for (const row of roleRows) {
      lines.push(`| ${row.ba_id ?? ''} | ${row.ba_name ?? ''} | ${row.sa_id ?? ''} | ${row.sa_name ?? ''} |`);
    }
  } else {
    lines.push('| — | — | — | — |');
  }
  lines.push('');

  // Section 4: Rules → Requirements
  lines.push('## 4. Бизнес-правила → Requirements');
  lines.push('');
  lines.push('| BA ID | BA Правило | SA ID | SA Requirement |');
  lines.push('|-------|------------|-------|----------------|');
  if (ruleRows.length > 0) {
    for (const row of ruleRows) {
      lines.push(`| ${row.ba_id ?? ''} | ${row.ba_name ?? ''} | ${row.sa_id ?? ''} | ${row.sa_name ?? ''} |`);
    }
  } else {
    lines.push('| — | — | — | — |');
  }
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
 * Render the BA→SA traceability matrix as Markdown.
 *
 * @param driver      Neo4j driver
 * @param projectRoot Absolute project root
 */
export async function renderTraceabilityMd(
  driver: Driver,
  projectRoot: string,
): Promise<RenderResult> {
  const [rows, coverage] = await Promise.all([
    fetchTraceabilityData(driver),
    fetchCoverageStats(driver),
  ]);

  const filePath = path.join(projectRoot, 'docs', '99-meta', 'traceability-matrix.md');
  const content = renderTraceabilityContent(rows, coverage);

  return { path: filePath, content };
}

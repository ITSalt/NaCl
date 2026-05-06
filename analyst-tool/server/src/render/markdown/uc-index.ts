/**
 * uc-index.ts — deterministic Markdown renderer for the UC registry.
 *
 * Cypher copied verbatim from nacl-render/SKILL.md lines 533-544.
 * Template: SKILL.md lines 552-571.
 * Totals and per-priority/module counts computed in TS.
 *
 * Output path: docs/14-usecases/_uc-index.md
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

function toList<T>(v: unknown): T[] {
  if (!Array.isArray(v)) return [];
  return v as T[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cypher (verbatim from SKILL.md lines 533-544)
// ---------------------------------------------------------------------------

const UC_INDEX_QUERY = `
MATCH (uc:UseCase)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(dep:UseCase)
RETURN uc.id AS id,
       uc.name AS name,
       uc.priority AS priority,
       uc.status AS status,
       m.name AS module_name,
       collect(DISTINCT sr.name) AS actors,
       collect(DISTINCT dep.id) AS depends_on
ORDER BY uc.id;
`;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface UcIndexRow {
  id: string;
  name: string | null;
  priority: string | null;
  status: string | null;
  module_name: string | null;
  actors: string[];
  depends_on: string[];
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchUcIndexData(driver: Driver): Promise<UcIndexRow[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(UC_INDEX_QUERY);
    return result.records
      .map((r) => ({
        id: toStr(r.get('id')) ?? '',
        name: toStr(r.get('name')),
        priority: toStr(r.get('priority')),
        status: toStr(r.get('status')),
        module_name: toStr(r.get('module_name')),
        actors: toList<unknown>(r.get('actors'))
          .map((a) => String(a ?? ''))
          .filter(Boolean)
          .sort(),
        depends_on: toList<unknown>(r.get('depends_on'))
          .map((d) => String(d ?? ''))
          .filter(Boolean)
          .sort(),
      }))
      .filter((row) => row.id.length > 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderUcIndexContent(rows: UcIndexRow[]): string {
  const date = today();

  // Compute statistics in TS
  const total = rows.length;
  const primaryCount = rows.filter((r) => (r.priority ?? '').toLowerCase() === 'primary').length;
  const secondaryCount = rows.filter((r) => (r.priority ?? '').toLowerCase() === 'secondary').length;

  // Per-module breakdown
  const moduleMap = new Map<string, number>();
  for (const row of rows) {
    const mod = row.module_name ?? '(без модуля)';
    moduleMap.set(mod, (moduleMap.get(mod) ?? 0) + 1);
  }
  const moduleBreakdown = [...moduleMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mod, count]) => `${mod}: ${count}`)
    .join(', ');

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push('title: "UC Index"');
  lines.push('type: uc-index');
  lines.push('generated_from: graph');
  lines.push(`date: ${date}`);
  lines.push('---');
  lines.push('');

  // Header
  lines.push('# Реестр Use Cases');
  lines.push('');

  // Main table
  lines.push('| ID | Название | Модуль | Приоритет | Статус | Актор(ы) | Зависимости |');
  lines.push('|----|----------|--------|-----------|--------|----------|-------------|');
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.name ?? ''} | ${row.module_name ?? ''} | ${row.priority ?? ''} | ${row.status ?? ''} | ${row.actors.join(', ')} | ${row.depends_on.join(', ')} |`,
    );
  }
  lines.push('');

  // Statistics
  lines.push('## Статистика');
  lines.push('');
  lines.push(`- Всего UC: ${total}`);
  lines.push(`- Primary: ${primaryCount}`);
  lines.push(`- Secondary: ${secondaryCount}`);
  lines.push(`- По модулям: ${moduleBreakdown}`);
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
 * Render the UC index as Markdown.
 *
 * @param driver      Neo4j driver
 * @param projectRoot Absolute project root
 */
export async function renderUcIndexMd(
  driver: Driver,
  projectRoot: string,
): Promise<RenderResult> {
  const rows = await fetchUcIndexData(driver);

  const filePath = path.join(projectRoot, 'docs', '14-usecases', '_uc-index.md');
  const content = renderUcIndexContent(rows);

  return { path: filePath, content };
}

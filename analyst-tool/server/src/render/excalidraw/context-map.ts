/**
 * context-map renderer — port of nacl-render/SKILL.md §1020
 *
 * Layout constants:
 *   MODULE_WIDTH   = 300
 *   MODULE_HEIGHT  = 180
 *   MODULE_SPACING = 100
 *
 * Element id scheme (semantic):
 *   module-{moduleId}               — module box rect
 *   text-module-{moduleId}          — module title text bound inside rect
 *   text-module-stats-{moduleId}    — stats text (free, inside box)
 *   dep-{fromId}-{toId}             — dependency arrow (sorted ids, deduped)
 *   text-dep-{fromId}-{toId}        — dependency label
 */
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import {
  makeRect,
  makeText,
  makeArrow,
  assembleScene,
  type AnyElement,
  type ShapeRegistry,
  type ExcalidrawScene,
} from '../elements.js';
import { ids as semIds } from '../semantic-ids.js';

// ---------------------------------------------------------------------------
// Layout constants (verbatim from SKILL.md §1020)
// ---------------------------------------------------------------------------

const MODULE_WIDTH   = 300;
const MODULE_HEIGHT  = 180;
const MODULE_SPACING = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModuleRecord {
  id: string;
  name: string;
  description: string | null;
  entity_count: number;
  uc_count: number;
  depends_on: string[];
}

interface CrossDepRecord {
  source_module: string;
  target_module: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>)['toNumber'] === 'function') {
    return (v as { toNumber(): number }).toNumber();
  }
  return typeof v === 'number' ? v : 0;
}

function toList<T>(v: unknown): T[] {
  if (!Array.isArray(v)) return [];
  return v as T[];
}

// ---------------------------------------------------------------------------
// Cypher queries (verbatim from SKILL.md §1020)
// ---------------------------------------------------------------------------

const MODULE_QUERY = `
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
OPTIONAL MATCH (m)-[:DEPENDS_ON]->(m2:Module)
RETURN m.id AS id, m.name AS name, m.description AS description,
       count(DISTINCT de) AS entity_count,
       count(DISTINCT uc) AS uc_count,
       collect(DISTINCT m2.id) AS depends_on
ORDER BY m.id
`;

const CROSS_DEP_QUERY = `
MATCH (m1:Module)-[:CONTAINS_ENTITY]->(de1:DomainEntity)-[:RELATES_TO]-(de2:DomainEntity)<-[:CONTAINS_ENTITY]-(m2:Module)
WHERE m1.id <> m2.id
RETURN DISTINCT m1.id AS source_module, m2.id AS target_module
`;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchModules(driver: Driver): Promise<ModuleRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(MODULE_QUERY);
    return result.records.map((r) => ({
      id: toStr(r.get('id')) ?? '',
      name: toStr(r.get('name')) ?? '',
      description: toStr(r.get('description')),
      entity_count: toNum(r.get('entity_count')),
      uc_count: toNum(r.get('uc_count')),
      depends_on: toList<unknown>(r.get('depends_on')).map((v) => String(v ?? '')).filter((v) => v.length > 0),
    })).filter((m) => m.id.length > 0);
  } finally {
    await session.close();
  }
}

async function fetchCrossDeps(driver: Driver): Promise<CrossDepRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(CROSS_DEP_QUERY);
    return result.records.map((r) => ({
      source_module: toStr(r.get('source_module')) ?? '',
      target_module: toStr(r.get('target_module')) ?? '',
    })).filter((d) => d.source_module.length > 0 && d.target_module.length > 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderContextMap(driver: Driver): Promise<ExcalidrawScene> {
  const [modules, crossDeps] = await Promise.all([
    fetchModules(driver),
    fetchCrossDeps(driver),
  ]);

  // Build all explicit + inferred dependencies, deduplicated
  const allDeps = new Set<string>();
  for (const m of modules) {
    for (const dep of m.depends_on) {
      allDeps.add(`${m.id}::${dep}`);
    }
  }
  for (const cd of crossDeps) {
    allDeps.add(`${cd.source_module}::${cd.target_module}`);
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  interface LayoutModule {
    mod: ModuleRecord;
    x: number;
    y: number;
    rectId: string;
  }

  const layoutModules: LayoutModule[] = modules.map((mod, i) => ({
    mod,
    x: i * (MODULE_WIDTH + MODULE_SPACING),
    y: 100,
    rectId: semIds.module(mod.id),
  }));

  const modPositionById = new Map(layoutModules.map((l) => [l.mod.id, l]));

  const registry: ShapeRegistry = new Map();
  const elements: AnyElement[] = [];

  // Module boxes — each box is a group (rect + title + stats) so dragging
  // any element drags the whole module via Excalidraw's select-on-click.
  for (const layout of layoutModules) {
    const { mod, x, y, rectId } = layout;

    const moduleGroup = [`group-module-${mod.id}`];
    const titleTextId = semIds.moduleText(mod.id);
    const rect = makeRect({
      logicalId: mod.id,
      id: rectId,
      x,
      y,
      width: MODULE_WIDTH,
      height: MODULE_HEIGHT,
      backgroundColor: '#e8f5e9',
      strokeColor: '#2e7d32',
      strokeWidth: 2,
      roughness: 1,
      groupIds: moduleGroup,
      customData: { nodeId: mod.id, nodeType: 'Module', confidence: 'high', synced: true },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: titleTextId, type: 'text' });
    elements.push(rect);

    // Bound title text
    elements.push(makeText({
      logicalId: `${mod.id}::title`,
      id: titleTextId,
      x: x + 10,
      y: y + 10,
      width: MODULE_WIDTH - 20,
      height: 28,
      text: mod.name,
      fontSize: 20,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      groupIds: moduleGroup,
    }));

    // Stats text — same group as the rect so it drags with the box.
    elements.push(makeText({
      logicalId: `${mod.id}::stats`,
      id: semIds.moduleStatsText(mod.id),
      x: x + 10,
      y: y + MODULE_HEIGHT - 40,
      width: MODULE_WIDTH - 20,
      height: 20,
      text: `${mod.entity_count} entities, ${mod.uc_count} use cases`,
      fontSize: 14,
      strokeColor: '#666666',
      groupIds: moduleGroup,
    }));
  }

  // Dependency arrows
  const seenDeps = new Set<string>();
  for (const depKey of allDeps) {
    const [srcId, tgtId] = depKey.split('::');
    if (!srcId || !tgtId) continue;
    if (srcId === tgtId) continue;

    // Deduplication (both directions become one arrow, sorted)
    const [sortedFrom, sortedTo] = [srcId, tgtId].sort();
    const normKey = `${sortedFrom}::${sortedTo}`;
    if (seenDeps.has(normKey)) continue;
    seenDeps.add(normKey);

    const srcLayout = modPositionById.get(srcId);
    const tgtLayout = modPositionById.get(tgtId);
    if (!srcLayout || !tgtLayout) continue;

    const startX = srcLayout.x + MODULE_WIDTH;
    const startY = srcLayout.y + MODULE_HEIGHT / 2;
    const endX = tgtLayout.x;
    const endY = tgtLayout.y + MODULE_HEIGHT / 2;

    const arrowId = semIds.depArrow(srcId, tgtId);
    const arrow = makeArrow({
      logicalId: `arrow-dep-${srcId}-${tgtId}`,
      id: arrowId,
      startX,
      startY,
      endX,
      endY,
      startShapeId: srcLayout.rectId,
      endShapeId: tgtLayout.rectId,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      registry,
    });

    // Arrow label — bind via containerId so Excalidraw treats it as an arrow
    // label and auto-positions it at the arrow's midpoint when either
    // endpoint moves. The arrow's boundElements lists the label id.
    const labelId = semIds.depLabel(srcId, tgtId);
    arrow.boundElements.push({ id: labelId, type: 'text' });
    elements.push(arrow);

    elements.push(makeText({
      logicalId: `label-dep-${srcId}-${tgtId}`,
      id: labelId,
      x: Math.round((startX + endX) / 2),
      y: Math.round((startY + endY) / 2) - 15,
      width: 120,
      text: 'entity-ref',
      fontSize: 12,
      strokeColor: '#666666',
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: arrowId,
    }));
  }

  return assembleScene(elements);
}

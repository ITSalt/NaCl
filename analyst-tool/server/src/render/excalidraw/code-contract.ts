/**
 * code-contract renderer — UC-023
 *
 * Renders APIEndpoint and ExternalContract nodes as UML-class-like cards,
 * with CONSUMES/PRODUCES arrows to DomainEntity cards.
 *
 * DomainError (inline) and CachePolicy (badge) are DEFERRED per the audit §4.
 *
 * Layout constants:
 *   CARD_W        = 220
 *   CARD_HEADER_H = 40
 *   ROW_H         = 22
 *   CARD_PADDING  = 10
 *   GRID_COLS     = 3
 *   GRID_GAP_X    = 280
 *   GRID_GAP_Y    = 60
 *   DE_COL_X      = GRID_COLS * GRID_GAP_X
 *
 * Element id scheme:
 *   cc-{nodeId}                         — APIEndpoint / ExternalContract card rect
 *   text-cc-header-{nodeId}             — header text («interface» stereotype + id)
 *   text-cc-method-{nodeId}             — METHOD path row (APIEndpoint only)
 *   text-cc-dto-{nodeId}-req            — request DTO row
 *   text-cc-dto-{nodeId}-res            — response DTO row
 *   cc-de-{entityId}                    — inline DomainEntity card rect
 *   text-cc-de-header-{entityId}        — domain entity header text
 *   arrow-cc-consumes-{apiId}-{deId}    — CONSUMES arrow
 *   arrow-cc-produces-{apiId}-{deId}    — PRODUCES arrow
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
// Layout constants
// ---------------------------------------------------------------------------

const CARD_W        = 220;
const CARD_HEADER_H = 40;
const ROW_H         = 22;
const CARD_PADDING  = 10;
const GRID_COLS     = 3;
const GRID_GAP_X    = 280;
const GRID_GAP_Y    = 60;
const DE_COL_X      = GRID_COLS * GRID_GAP_X;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractRecord {
  kind:     string;   // 'APIEndpoint' | 'ExternalContract'
  id:       string;
  method:   string | null;
  path:     string | null;
  req:      string | null;
  res:      string | null;
  consumes: string[];
  produces: string[];
}

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

// ---------------------------------------------------------------------------
// Cypher query
// ---------------------------------------------------------------------------

/**
 * UNION query: returns both APIEndpoint and ExternalContract records.
 * Matched by 'APIEndpoint' string in the Cypher text.
 */
const CONTRACT_QUERY = `
MATCH (a:APIEndpoint)
OPTIONAL MATCH (a)-[:CONSUMES]->(ci:DomainEntity)
OPTIONAL MATCH (a)-[:PRODUCES]->(po:DomainEntity)
RETURN 'APIEndpoint' AS kind, a.id AS id, a.method AS method, a.path AS path,
       a.request_dto AS req, a.response_dto AS res,
       collect(DISTINCT ci.id) AS consumes, collect(DISTINCT po.id) AS produces
UNION
MATCH (e:ExternalContract)
RETURN 'ExternalContract' AS kind, e.id AS id, e.kind AS method, coalesce(e.name, e.id) AS path,
       null AS req, null AS res, [] AS consumes, [] AS produces
`;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchContracts(driver: Driver): Promise<ContractRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(CONTRACT_QUERY);
    return result.records.map((r) => {
      const consumesRaw = r.get('consumes');
      const producesRaw = r.get('produces');
      const consumes: string[] = Array.isArray(consumesRaw)
        ? (consumesRaw as unknown[]).map((v) => toStr(v)).filter((v): v is string => v !== null && v.length > 0)
        : [];
      const produces: string[] = Array.isArray(producesRaw)
        ? (producesRaw as unknown[]).map((v) => toStr(v)).filter((v): v is string => v !== null && v.length > 0)
        : [];

      return {
        kind:     toStr(r.get('kind'))    ?? 'APIEndpoint',
        id:       toStr(r.get('id'))      ?? '',
        method:   toStr(r.get('method')),
        path:     toStr(r.get('path')),
        req:      toStr(r.get('req')),
        res:      toStr(r.get('res')),
        consumes,
        produces,
      };
    }).filter((c) => c.id.length > 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderCodeContract(
  driver: Driver,
  _scopeId?: string | null,
): Promise<ExcalidrawScene> {
  const contracts = await fetchContracts(driver);

  if (contracts.length === 0) {
    return assembleScene([]);
  }

  // Stable sort by kind (APIEndpoint first) then id
  const sorted = [...contracts].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  // Compute row max heights for y positioning
  function cardRowCount(c: ContractRecord): number {
    let rows = 0;
    if (c.kind === 'APIEndpoint') {
      if (c.method || c.path) rows += 1;
      if (c.req)  rows += 1;
      if (c.res)  rows += 1;
    }
    return rows;
  }

  const rowMaxH: number[] = [];
  sorted.forEach((c, i) => {
    const row = Math.floor(i / GRID_COLS);
    const h = CARD_HEADER_H + cardRowCount(c) * ROW_H + CARD_PADDING;
    rowMaxH[row] = Math.max(rowMaxH[row] ?? 0, h);
  });

  const rowY: number[] = [];
  let cumY = 0;
  for (let r = 0; r < rowMaxH.length; r++) {
    rowY[r] = cumY;
    cumY += (rowMaxH[r] ?? 0) + GRID_GAP_Y;
  }

  interface LayoutCard {
    contract: ContractRecord;
    x: number;
    y: number;
    cardH: number;
    rectId: string;
  }

  const layoutCards: LayoutCard[] = sorted.map((c, i) => {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const cardH = CARD_HEADER_H + cardRowCount(c) * ROW_H + CARD_PADDING;
    return {
      contract: c,
      x: col * GRID_GAP_X,
      y: rowY[row] ?? 0,
      cardH,
      rectId: semIds.ccCard(c.id),
    };
  });

  // Collect all domain entity ids referenced
  const allDeIds = new Set<string>();
  for (const c of sorted) {
    for (const d of c.consumes) allDeIds.add(d);
    for (const d of c.produces) allDeIds.add(d);
  }

  // Layout DE cards to the right
  interface LayoutDE {
    entityId: string;
    x: number;
    y: number;
    cardH: number;
    rectId: string;
  }

  const layoutDEs: LayoutDE[] = [];
  let deY = 0;
  for (const entityId of [...allDeIds].sort()) {
    const cardH = CARD_HEADER_H + CARD_PADDING;
    layoutDEs.push({
      entityId,
      x: DE_COL_X,
      y: deY,
      cardH,
      rectId: semIds.ccDeCard(entityId),
    });
    deY += cardH + GRID_GAP_Y;
  }

  const registry: ShapeRegistry = new Map();
  const elements: AnyElement[] = [];

  // --- Contract cards ---
  for (const layout of layoutCards) {
    const { contract: c, x, y, cardH, rectId } = layout;
    const cardGroup = [`group-cc-${c.id}`];
    const headerTextId = semIds.ccHeaderText(c.id);
    const isApi = c.kind === 'APIEndpoint';
    const bgColor     = isApi ? '#e8eaf6' : '#e0f2f1';
    const strokeColor = isApi ? '#283593' : '#00695c';

    const rect = makeRect({
      logicalId: `cc-${c.id}`,
      id: rectId,
      x,
      y,
      width: CARD_W,
      height: cardH,
      backgroundColor: bgColor,
      strokeColor,
      strokeWidth: 2,
      roughness: 0,
      groupIds: cardGroup,
      customData: { nodeId: c.id, nodeType: c.kind, synced: true },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: headerTextId, type: 'text' });
    elements.push(rect);

    // Header: «interface» stereotype for APIEndpoint; «external» for ExternalContract
    const stereo = isApi ? '«interface»' : '«external»';
    elements.push(makeText({
      logicalId: `cc-${c.id}::header`,
      id: headerTextId,
      x: x + 5,
      y: y + 5,
      width: CARD_W - 10,
      height: 30,
      text: `${stereo} ${c.id}`,
      fontSize: 13,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      groupIds: cardGroup,
    }));

    if (isApi) {
      let rowOffset = CARD_HEADER_H;

      // METHOD path row
      if (c.method || c.path) {
        const methodTextId = semIds.ccMethodText(c.id);
        const methodLabel = `${c.method ?? '?'} ${c.path ?? ''}`.trim();
        elements.push(makeText({
          logicalId: `cc-${c.id}::method`,
          id: methodTextId,
          x: x + 10,
          y: y + rowOffset,
          width: CARD_W - 20,
          height: ROW_H,
          text: methodLabel,
          fontSize: 12,
          strokeColor: '#283593',
          groupIds: cardGroup,
        }));
        rowOffset += ROW_H;
      }

      // Request DTO row
      if (c.req) {
        const reqTextId = semIds.ccDtoText(c.id, 'req');
        elements.push(makeText({
          logicalId: `cc-${c.id}::req`,
          id: reqTextId,
          x: x + 10,
          y: y + rowOffset,
          width: CARD_W - 20,
          height: ROW_H,
          text: `req: ${c.req}`,
          fontSize: 11,
          strokeColor: '#1e1e1e',
          groupIds: cardGroup,
        }));
        rowOffset += ROW_H;
      }

      // Response DTO row
      if (c.res) {
        const resTextId = semIds.ccDtoText(c.id, 'res');
        elements.push(makeText({
          logicalId: `cc-${c.id}::res`,
          id: resTextId,
          x: x + 10,
          y: y + rowOffset,
          width: CARD_W - 20,
          height: ROW_H,
          text: `res: ${c.res}`,
          fontSize: 11,
          strokeColor: '#1e1e1e',
          groupIds: cardGroup,
        }));
      }
    } else {
      // ExternalContract: show kind/path
      if (c.method || c.path) {
        elements.push(makeText({
          logicalId: `cc-${c.id}::ext-info`,
          id: `text-cc-ext-${c.id}`,
          x: x + 10,
          y: y + CARD_HEADER_H,
          width: CARD_W - 20,
          height: ROW_H,
          text: `${c.method ?? ''} ${c.path ?? ''}`.trim(),
          fontSize: 12,
          strokeColor: '#00695c',
          groupIds: cardGroup,
        }));
      }
    }
  }

  // --- DomainEntity cards ---
  const deById = new Map<string, LayoutDE>(layoutDEs.map((l) => [l.entityId, l]));

  for (const layout of layoutDEs) {
    const { entityId, x, y, cardH, rectId } = layout;
    const cardGroup = [`group-cc-de-${entityId}`];
    const headerTextId = semIds.ccDeHeaderText(entityId);

    const rect = makeRect({
      logicalId: `cc-de-${entityId}`,
      id: rectId,
      x,
      y,
      width: CARD_W,
      height: cardH,
      backgroundColor: '#e3f2fd',
      strokeColor: '#1565c0',
      strokeWidth: 2,
      roughness: 0,
      groupIds: cardGroup,
      customData: { nodeId: entityId, nodeType: 'DomainEntity', synced: true },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: headerTextId, type: 'text' });
    elements.push(rect);

    elements.push(makeText({
      logicalId: `cc-de-${entityId}::header`,
      id: headerTextId,
      x: x + 5,
      y: y + 5,
      width: CARD_W - 10,
      height: 30,
      text: entityId,
      fontSize: 13,
      strokeColor: '#1e1e1e',
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      groupIds: cardGroup,
    }));
  }

  // --- CONSUMES / PRODUCES arrows ---
  const cardById = new Map<string, LayoutCard>(layoutCards.map((l) => [l.contract.id, l]));

  for (const layout of layoutCards) {
    const { contract: c } = layout;
    const srcLayout = cardById.get(c.id)!;

    // Deduplicate: only one arrow per (src, target, rel) triple
    const seenConsumes = new Set<string>();
    const seenProduces = new Set<string>();

    for (const deId of c.consumes) {
      if (seenConsumes.has(deId)) continue;
      seenConsumes.add(deId);
      const tgtLayout = deById.get(deId);
      if (!tgtLayout) continue;

      const arrowId = semIds.ccRelArrow(c.id, deId, 'consumes');
      const arrow = makeArrow({
        logicalId: `arrow-cc-consumes-${c.id}-${deId}`,
        id: arrowId,
        startX: srcLayout.x + CARD_W,
        startY: srcLayout.y + srcLayout.cardH / 2,
        endX:   tgtLayout.x,
        endY:   tgtLayout.y + tgtLayout.cardH / 2,
        startShapeId: srcLayout.rectId,
        endShapeId:   tgtLayout.rectId,
        strokeColor: '#1565c0',
        strokeWidth: 1,
        registry,
        customData: { rel: 'CONSUMES', synced: true },
      });
      elements.push(arrow);
    }

    for (const deId of c.produces) {
      if (seenProduces.has(deId)) continue;
      seenProduces.add(deId);
      // Skip if already drawn as CONSUMES (same pair)
      if (seenConsumes.has(deId)) continue;
      const tgtLayout = deById.get(deId);
      if (!tgtLayout) continue;

      const arrowId = semIds.ccRelArrow(c.id, deId, 'produces');
      const arrow = makeArrow({
        logicalId: `arrow-cc-produces-${c.id}-${deId}`,
        id: arrowId,
        startX: srcLayout.x + CARD_W,
        startY: srcLayout.y + srcLayout.cardH / 2,
        endX:   tgtLayout.x,
        endY:   tgtLayout.y + tgtLayout.cardH / 2,
        startShapeId: srcLayout.rectId,
        endShapeId:   tgtLayout.rectId,
        strokeColor: '#2e7d32',
        strokeWidth: 1,
        registry,
        customData: { rel: 'PRODUCES', synced: true },
      });
      elements.push(arrow);
    }
  }

  return assembleScene(elements);
}

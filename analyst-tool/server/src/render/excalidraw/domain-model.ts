/**
 * domain-model renderer — port of nacl-render/SKILL.md §913
 *
 * Cypher queries, layout constants, and element structure are copied verbatim
 * from the skill source. Do not paraphrase.
 *
 * Layout constants:
 *   CARD_WIDTH     = 220
 *   ATTR_ROW_H     = 22
 *   CARD_HEADER_H  = 40
 *   CARD_PADDING   = 10
 *   GRID_SPACING_X = 280
 *   GRID_SPACING_Y = 60
 *   COLS           = 3
 *
 * Element id scheme (semantic):
 *   entity-{entityId}                       — entity card rect
 *   text-entity-header-{entityId}           — entity name text bound inside card
 *   text-entity-attr-{entityId}-{attrIdx}   — attribute row text
 *   enum-{enumId}                           — enum card rect
 *   text-enum-header-{enumId}               — enum name text
 *   text-enum-val-{enumId}-{valIdx}         — enum value text
 *   arrow-relates-{fromId}-{toId}           — RELATES_TO arrow (sorted ids)
 *   text-relates-{fromId}-{toId}            — RELATES_TO label
 *   arrow-hasenum-{entityId}-{enumId}       — HAS_ENUM arrow
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
// Layout constants (verbatim from SKILL.md §913)
// ---------------------------------------------------------------------------

const CARD_WIDTH     = 220;
const ATTR_ROW_H     = 22;
const CARD_HEADER_H  = 40;
const CARD_PADDING   = 10;
const GRID_SPACING_X = 280;
const GRID_SPACING_Y = 60;
const COLS           = 3;

// ---------------------------------------------------------------------------
// Types for graph records
// ---------------------------------------------------------------------------

interface AttrRecord {
  attr_name: string | null;
  attr_type: string | null;
}

interface RelRecord {
  target_id: string | null;
  target_name: string | null;
  rel_type: string | null;
  cardinality: string | null;
}

interface EntityRecord {
  id: string;
  name: string;
  description: string | null;
  module_name: string | null;
  attributes: AttrRecord[];
  relationships: RelRecord[];
}

interface EnumRecord {
  entity_id: string;
  enum_id: string;
  enum_name: string;
  enum_values: string[];
}

// ---------------------------------------------------------------------------
// Query helpers
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
// Cypher queries (verbatim from SKILL.md §913)
// ---------------------------------------------------------------------------

const ENTITY_QUERY = `
MATCH (de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de.id AS id, de.name AS name, de.description AS description,
       m.name AS module_name,
       collect(DISTINCT {attr_name: da.name, attr_type: da.data_type}) AS attributes,
       collect(DISTINCT {target_id: de2.id, target_name: de2.name, rel_type: rel.rel_type, cardinality: rel.cardinality}) AS relationships
ORDER BY de.id
`;

const ENUM_QUERY = `
MATCH (de:DomainEntity)-[:HAS_ENUM]->(en:Enumeration)
OPTIONAL MATCH (en)-[:HAS_VALUE]->(ev:EnumValue)
RETURN de.id AS entity_id, en.id AS enum_id, en.name AS enum_name,
       collect(ev.value) AS enum_values
`;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchEntities(driver: Driver): Promise<EntityRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(ENTITY_QUERY);
    return result.records.map((r) => {
      const attrs = toList<Record<string, unknown>>(r.get('attributes')).filter(
        (a) => a && toStr(a['attr_name']) !== null,
      ).map((a) => ({
        attr_name: toStr(a['attr_name']),
        attr_type: toStr(a['attr_type']),
      }));

      const rels = toList<Record<string, unknown>>(r.get('relationships')).filter(
        (rel) => rel && toStr(rel['target_id']) !== null,
      ).map((rel) => ({
        target_id: toStr(rel['target_id']),
        target_name: toStr(rel['target_name']),
        rel_type: toStr(rel['rel_type']),
        cardinality: toStr(rel['cardinality']),
      }));

      return {
        id: toStr(r.get('id')) ?? '',
        name: toStr(r.get('name')) ?? '',
        description: toStr(r.get('description')),
        module_name: toStr(r.get('module_name')),
        attributes: attrs,
        relationships: rels,
      };
    }).filter((e) => e.id.length > 0);
  } finally {
    await session.close();
  }
}

async function fetchEnums(driver: Driver): Promise<EnumRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(ENUM_QUERY);
    return result.records.map((r) => ({
      entity_id: toStr(r.get('entity_id')) ?? '',
      enum_id: toStr(r.get('enum_id')) ?? '',
      enum_name: toStr(r.get('enum_name')) ?? '',
      enum_values: toList<string>(r.get('enum_values')).map((v) => String(v ?? '')),
    })).filter((e) => e.entity_id.length > 0 && e.enum_id.length > 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderDomainModel(driver: Driver): Promise<ExcalidrawScene> {
  const [entities, enums] = await Promise.all([
    fetchEntities(driver),
    fetchEnums(driver),
  ]);

  // Build enum lookup: entity_id → enum records
  const enumsByEntity = new Map<string, EnumRecord[]>();
  for (const en of enums) {
    const list = enumsByEntity.get(en.entity_id) ?? [];
    list.push(en);
    enumsByEntity.set(en.entity_id, list);
  }

  // ---------------------------------------------------------------------------
  // Layout pass: compute positions and card heights
  // ---------------------------------------------------------------------------

  interface LayoutEntity {
    entity: EntityRecord;
    x: number;
    y: number;
    cardHeight: number;
    rectId: string;
  }

  // Compute per-row max heights for correct y positioning
  const rowMaxHeight: number[] = [];
  entities.forEach((entity, i) => {
    const row = Math.floor(i / COLS);
    const cardHeight = CARD_HEADER_H + (entity.attributes.length * ATTR_ROW_H) + CARD_PADDING;
    rowMaxHeight[row] = Math.max(rowMaxHeight[row] ?? 0, cardHeight);
  });

  // Compute cumulative y offsets per row
  const rowY: number[] = [];
  let cumY = 0;
  for (let r = 0; r < rowMaxHeight.length; r++) {
    rowY[r] = cumY;
    cumY += (rowMaxHeight[r] ?? 0) + GRID_SPACING_Y;
  }

  const layoutEntities: LayoutEntity[] = entities.map((entity, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cardHeight = CARD_HEADER_H + (entity.attributes.length * ATTR_ROW_H) + CARD_PADDING;
    const x = col * GRID_SPACING_X;
    const y = rowY[row] ?? 0;
    const rectId = semIds.entity(entity.id);
    return { entity, x, y, cardHeight, rectId };
  });

  // ---------------------------------------------------------------------------
  // Enum layout: place to the right of the grid
  // ---------------------------------------------------------------------------

  interface LayoutEnum {
    en: EnumRecord;
    x: number;
    y: number;
    cardHeight: number;
    rectId: string;
  }

  const ENUM_COL_X = COLS * GRID_SPACING_X;
  const layoutEnums: LayoutEnum[] = [];
  let enumY = 0;
  for (const [, enumList] of enumsByEntity) {
    for (const en of enumList) {
      const cardHeight = CARD_HEADER_H + (en.enum_values.length * ATTR_ROW_H) + CARD_PADDING;
      layoutEnums.push({
        en,
        x: ENUM_COL_X,
        y: enumY,
        cardHeight,
        rectId: semIds.enum(en.enum_id),
      });
      enumY += cardHeight + GRID_SPACING_Y;
    }
  }

  // ---------------------------------------------------------------------------
  // Shape registry: map rect-id → boundElements array (live reference)
  // ---------------------------------------------------------------------------

  const registry: ShapeRegistry = new Map();
  const elements: AnyElement[] = [];

  // Entity cards
  for (const layout of layoutEntities) {
    const { entity, x, y, cardHeight, rectId } = layout;

    // groupIds: same id on every element of the card → click-any-element selects
    // the group, drag-the-rect drags the whole card. This is Excalidraw's native
    // mechanism for "card-as-a-unit"; containerId-based binding only works for
    // ONE text per shape and would force the body texts to auto-center on top of
    // the header, so we use groupIds for the multi-text body.
    const cardGroup = [`group-entity-${entity.id}`];

    const headerTextId = semIds.entityHeaderText(entity.id);
    const rect = makeRect({
      logicalId: entity.id,
      id: rectId,
      x,
      y,
      width: CARD_WIDTH,
      height: cardHeight,
      backgroundColor: '#e3f2fd',
      strokeColor: '#1565c0',
      strokeWidth: 2,
      roughness: 0,
      groupIds: cardGroup,
      customData: { nodeId: entity.id, nodeType: 'DomainEntity', confidence: 'high', synced: true },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: headerTextId, type: 'text' });
    elements.push(rect);

    // Header text — bound to rect via containerId (Excalidraw centers it inside
    // the rect's top region) AND part of the group.
    elements.push(makeText({
      logicalId: `${entity.id}::header`,
      id: headerTextId,
      x: x + 5,
      y: y + 5,
      width: CARD_WIDTH - 10,
      height: 30,
      text: entity.name,
      fontSize: 18,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      groupIds: cardGroup,
    }));

    // Attribute rows — same group as the rect; no containerId (would conflict
    // with the header). Excalidraw's group-on-click selects the whole card so
    // dragging moves all rows together with the rect.
    entity.attributes.forEach((attr, ai) => {
      if (!attr.attr_name) return;
      elements.push(makeText({
        logicalId: `${entity.id}::attr::${ai}`,
        id: semIds.entityAttrText(entity.id, ai),
        x: x + 10,
        y: y + CARD_HEADER_H + (ai * ATTR_ROW_H),
        width: CARD_WIDTH - 20,
        height: ATTR_ROW_H,
        text: `${attr.attr_type ?? '?'}  ${attr.attr_name}`,
        fontSize: 13,
        strokeColor: '#1e1e1e',
        groupIds: cardGroup,
      }));
    });
  }

  // Enum cards
  for (const layout of layoutEnums) {
    const { en, x, y, cardHeight, rectId } = layout;

    const cardGroup = [`group-enum-${en.enum_id}`];
    const enumHeaderTextId = semIds.enumHeaderText(en.enum_id);
    const rect = makeRect({
      logicalId: en.enum_id,
      id: rectId,
      x,
      y,
      width: CARD_WIDTH,
      height: cardHeight,
      backgroundColor: '#fff8e1',
      strokeColor: '#f57f17',
      strokeWidth: 2,
      roughness: 0,
      groupIds: cardGroup,
      customData: { nodeId: en.enum_id, nodeType: 'Enumeration', confidence: 'high', synced: true },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: enumHeaderTextId, type: 'text' });
    elements.push(rect);

    elements.push(makeText({
      logicalId: `${en.enum_id}::header`,
      id: enumHeaderTextId,
      x: x + 5,
      y: y + 5,
      width: CARD_WIDTH - 10,
      height: 30,
      text: en.enum_name,
      fontSize: 18,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      groupIds: cardGroup,
    }));

    en.enum_values.forEach((val, vi) => {
      elements.push(makeText({
        logicalId: `${en.enum_id}::val::${vi}`,
        id: semIds.enumValText(en.enum_id, vi),
        x: x + 10,
        y: y + CARD_HEADER_H + (vi * ATTR_ROW_H),
        width: CARD_WIDTH - 20,
        height: ATTR_ROW_H,
        text: String(val),
        fontSize: 13,
        strokeColor: '#1e1e1e',
        groupIds: cardGroup,
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Arrows for RELATES_TO (deduplicated: source.id < target.id)
  // ---------------------------------------------------------------------------

  const entityPositionById = new Map(
    layoutEntities.map((l) => [l.entity.id, l]),
  );
  const enumPositionById = new Map(
    layoutEnums.map((l) => [l.en.enum_id, l]),
  );

  const seenRels = new Set<string>();

  for (const layout of layoutEntities) {
    const { entity } = layout;
    for (const rel of entity.relationships) {
      if (!rel.target_id) continue;
      // Deduplication: keep only one direction (smaller id first)
      const [sortedFrom, sortedTo] = [entity.id, rel.target_id].sort();
      const key = `${sortedFrom}::${sortedTo}`;
      if (seenRels.has(key)) continue;
      seenRels.add(key);

      const srcLayout = entityPositionById.get(entity.id);
      const tgtLayout = entityPositionById.get(rel.target_id);
      if (!srcLayout || !tgtLayout) continue;

      const startX = srcLayout.x + CARD_WIDTH;
      const startY = srcLayout.y + srcLayout.cardHeight / 2;
      const endX = tgtLayout.x;
      const endY = tgtLayout.y + tgtLayout.cardHeight / 2;

      const arrowId = semIds.relatesArrow(entity.id, rel.target_id);
      const arrow = makeArrow({
        logicalId: `arrow-rel-${entity.id}-${rel.target_id}`,
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

      // Bind label as an arrow label (containerId → arrow) so it follows
      // the arrow's midpoint when either endpoint moves.
      const labelId = semIds.relatesLabel(entity.id, rel.target_id);
      arrow.boundElements.push({ id: labelId, type: 'text' });
      elements.push(arrow);

      elements.push(makeText({
        logicalId: `label-rel-${entity.id}-${rel.target_id}`,
        id: labelId,
        x: Math.round((startX + endX) / 2),
        y: Math.round((startY + endY) / 2) - 15,
        width: 160,
        text: `${rel.rel_type ?? ''} (${rel.cardinality ?? ''})`,
        fontSize: 12,
        strokeColor: '#666666',
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: arrowId,
      }));
    }
  }

  // HAS_ENUM arrows: entity → enum card
  for (const [entityId, enumList] of enumsByEntity) {
    const srcLayout = entityPositionById.get(entityId);
    if (!srcLayout) continue;
    for (const en of enumList) {
      const tgtLayout = enumPositionById.get(en.enum_id);
      if (!tgtLayout) continue;

      const startX = srcLayout.x + CARD_WIDTH;
      const startY = srcLayout.y + srcLayout.cardHeight / 2;
      const endX = tgtLayout.x;
      const endY = tgtLayout.y + tgtLayout.cardHeight / 2;

      const arrowId = semIds.hasEnumArrow(entityId, en.enum_id);
      const arrow = makeArrow({
        logicalId: `arrow-enum-${entityId}-${en.enum_id}`,
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
      elements.push(arrow);
    }
  }

  return assembleScene(elements);
}

/**
 * interface-model renderer — UC-022
 *
 * Draws each Form/Screen as a UML-class-like card with FormField member rows,
 * MAPS_TO arrows to domain-entity cards, and interface/validation Requirement
 * cards anchored via REALIZED_BY.
 *
 * Layout constants:
 *   CARD_WIDTH     = 220
 *   FIELD_ROW_H    = 22
 *   CARD_HEADER_H  = 40
 *   CARD_PADDING   = 10
 *   GRID_SPACING_X = 280
 *   GRID_SPACING_Y = 60
 *   COLS           = 3
 *   DE_COL_X       = COLS * GRID_SPACING_X  (domain-entity cards column)
 *   REQ_COL_X      = (COLS + 1) * GRID_SPACING_X  (requirement cards column)
 *
 * Element id scheme (semantic):
 *   iface-{nodeId}                       — Form/Screen card rect
 *   text-iface-header-{nodeId}           — header text bound inside card
 *   text-iface-field-{nodeId}-{fieldIdx} — field row text
 *   iface-de-{entityId}                  — inline DomainEntity card rect
 *   text-iface-de-header-{entityId}      — inline DomainEntity header text
 *   arrow-iface-mapsto-{formId}-{entityId} — MAPS_TO arrow
 *   iface-req-{rqId}                     — Requirement card rect
 *   text-iface-req-header-{rqId}         — Requirement card header text
 *   text-iface-req-body-{rqId}           — Requirement card body text
 *   arrow-iface-req-{rqId}-{targetId}    — REALIZED_BY arrow
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

const CARD_WIDTH     = 220;
const FIELD_ROW_H    = 22;
const CARD_HEADER_H  = 40;
const CARD_PADDING   = 10;
const GRID_SPACING_X = 280;
const GRID_SPACING_Y = 60;
const COLS           = 3;

const DE_COL_X  = COLS * GRID_SPACING_X;
const REQ_COL_X = (COLS + 1) * GRID_SPACING_X;

// ---------------------------------------------------------------------------
// Types for graph records
// ---------------------------------------------------------------------------

interface FieldRecord {
  field:           string | null;
  fname:           string | null;
  ftype:           string | null;
  maps_to_attr:    string | null;
  maps_to_entity:  string | null;
}

interface FormRecord {
  kind:   string;
  id:     string;
  name:   string;
  fields: FieldRecord[];
}

interface ReqRecord {
  rq_id:         string;
  rq_type:       string;
  description:   string | null;
  target_label:  string;
  target_id:     string;
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
// Cypher queries (verbatim from task-be.md)
// ---------------------------------------------------------------------------

const FORMS_QUERY = `
MATCH (x) WHERE x:Form OR x:Screen
OPTIONAL MATCH (x)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
RETURN labels(x)[0] AS kind, x.id AS id, coalesce(x.name,x.id) AS name,
       collect(DISTINCT {field: ff.id, fname: ff.name, ftype: ff.field_type,
                         maps_to_attr: da.name, maps_to_entity: de.id}) AS fields
ORDER BY id
`;

const REQS_QUERY = `
MATCH (rq:Requirement)-[:REALIZED_BY]->(t)
WHERE (t:Form OR t:FormField OR t:Screen)
  AND coalesce(rq.rq_type,rq.req_type,rq.type,'') IN ['interface','validation']
RETURN rq.id AS rq_id, coalesce(rq.rq_type,rq.req_type,rq.type) AS rq_type,
       rq.description AS description, labels(t)[0] AS target_label, t.id AS target_id
ORDER BY rq.id
`;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchForms(driver: Driver): Promise<FormRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(FORMS_QUERY);
    return result.records.map((r) => {
      const raw = toList<Record<string, unknown>>(r.get('fields'));
      const fields: FieldRecord[] = raw
        .filter((f) => f && (toStr(f['field']) !== null || toStr(f['fname']) !== null))
        .map((f) => ({
          field:          toStr(f['field']),
          fname:          toStr(f['fname']),
          ftype:          toStr(f['ftype']),
          maps_to_attr:   toStr(f['maps_to_attr']),
          maps_to_entity: toStr(f['maps_to_entity']),
        }));

      return {
        kind:   toStr(r.get('kind')) ?? 'Form',
        id:     toStr(r.get('id'))   ?? '',
        name:   toStr(r.get('name')) ?? '',
        fields,
      };
    }).filter((x) => x.id.length > 0);
  } finally {
    await session.close();
  }
}

async function fetchReqs(driver: Driver): Promise<ReqRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(REQS_QUERY);
    return result.records.map((r) => ({
      rq_id:        toStr(r.get('rq_id'))        ?? '',
      rq_type:      toStr(r.get('rq_type'))       ?? '',
      description:  toStr(r.get('description')),
      target_label: toStr(r.get('target_label'))  ?? '',
      target_id:    toStr(r.get('target_id'))     ?? '',
    })).filter((x) => x.rq_id.length > 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Stereotype helper
// ---------------------------------------------------------------------------

function stereotype(kind: string): '«form»' | '«screen»' | '«interface»' {
  if (kind === 'Form')   return '«form»';
  if (kind === 'Screen') return '«screen»';
  return '«interface»';
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderInterfaceModel(
  driver: Driver,
  _scopeId?: string | null,
): Promise<ExcalidrawScene> {
  const [forms, reqs] = await Promise.all([
    fetchForms(driver),
    fetchReqs(driver),
  ]);

  if (forms.length === 0) {
    return assembleScene([]);
  }

  // ---------------------------------------------------------------------------
  // Layout pass — Form/Screen cards
  // ---------------------------------------------------------------------------

  interface LayoutForm {
    form:       FormRecord;
    x:          number;
    y:          number;
    cardHeight: number;
    rectId:     string;
  }

  // Compute per-row max heights for correct y-positioning
  const rowMaxHeight: number[] = [];
  forms.forEach((form, i) => {
    const row = Math.floor(i / COLS);
    const h = CARD_HEADER_H + (form.fields.length * FIELD_ROW_H) + CARD_PADDING;
    rowMaxHeight[row] = Math.max(rowMaxHeight[row] ?? 0, h);
  });

  const rowY: number[] = [];
  let cumY = 0;
  for (let r = 0; r < rowMaxHeight.length; r++) {
    rowY[r] = cumY;
    cumY += (rowMaxHeight[r] ?? 0) + GRID_SPACING_Y;
  }

  const layoutForms: LayoutForm[] = forms.map((form, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cardHeight = CARD_HEADER_H + (form.fields.length * FIELD_ROW_H) + CARD_PADDING;
    return {
      form,
      x: col * GRID_SPACING_X,
      y: rowY[row] ?? 0,
      cardHeight,
      rectId: semIds.ifaceCard(form.id),
    };
  });

  // ---------------------------------------------------------------------------
  // Collect unique domain-entity ids referenced via MAPS_TO
  // ---------------------------------------------------------------------------

  const allEntityIds = new Set<string>();
  for (const form of forms) {
    for (const field of form.fields) {
      if (field.maps_to_entity) allEntityIds.add(field.maps_to_entity);
    }
  }

  // Layout DE cards to the right of the form grid
  interface LayoutDE {
    entityId: string;
    x: number;
    y: number;
    cardHeight: number;
    rectId: string;
  }

  const layoutDEs: LayoutDE[] = [];
  let deY = 0;
  for (const entityId of [...allEntityIds].sort()) {
    const cardHeight = CARD_HEADER_H + CARD_PADDING;
    layoutDEs.push({
      entityId,
      x: DE_COL_X,
      y: deY,
      cardHeight,
      rectId: semIds.ifaceDeCard(entityId),
    });
    deY += cardHeight + GRID_SPACING_Y;
  }

  // ---------------------------------------------------------------------------
  // Layout requirement cards
  // ---------------------------------------------------------------------------

  interface LayoutReq {
    req: ReqRecord;
    x: number;
    y: number;
    cardHeight: number;
    rectId: string;
  }

  const REQ_CARD_BODY_H = 40;
  const layoutReqs: LayoutReq[] = [];
  let reqY = 0;
  for (const req of reqs) {
    const cardHeight = CARD_HEADER_H + REQ_CARD_BODY_H + CARD_PADDING;
    layoutReqs.push({
      req,
      x: REQ_COL_X,
      y: reqY,
      cardHeight,
      rectId: semIds.ifaceReqCard(req.rq_id),
    });
    reqY += cardHeight + GRID_SPACING_Y;
  }

  // ---------------------------------------------------------------------------
  // Shape registry
  // ---------------------------------------------------------------------------

  const registry: ShapeRegistry = new Map();
  const elements: AnyElement[] = [];

  // ---------------------------------------------------------------------------
  // Form/Screen cards
  // ---------------------------------------------------------------------------

  for (const layout of layoutForms) {
    const { form, x, y, cardHeight, rectId } = layout;

    const cardGroup = [`group-iface-${form.id}`];
    const headerTextId = semIds.ifaceHeaderText(form.id);
    const nodeType = (form.kind === 'Form' || form.kind === 'Screen') ? form.kind : 'Form';
    const stereo = stereotype(form.kind);

    const rect = makeRect({
      logicalId: `iface-${form.id}`,
      id: rectId,
      x,
      y,
      width: CARD_WIDTH,
      height: cardHeight,
      backgroundColor: '#e8f5e9',
      strokeColor: '#2e7d32',
      strokeWidth: 2,
      roughness: 0,
      groupIds: cardGroup,
      customData: { nodeId: form.id, nodeType, synced: true },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: headerTextId, type: 'text' });
    elements.push(rect);

    elements.push(makeText({
      logicalId: `iface-${form.id}::header`,
      id: headerTextId,
      x: x + 5,
      y: y + 5,
      width: CARD_WIDTH - 10,
      height: 30,
      text: `${stereo} ${form.id}`,
      fontSize: 14,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      groupIds: cardGroup,
    }));

    // Field rows
    form.fields.forEach((field, fi) => {
      if (!field.fname && !field.field) return;
      const label = `${field.ftype ?? '?'}  ${field.fname ?? field.field ?? ''}`;
      elements.push(makeText({
        logicalId: `iface-${form.id}::field::${fi}`,
        id: semIds.ifaceFieldText(form.id, fi),
        x: x + 10,
        y: y + CARD_HEADER_H + (fi * FIELD_ROW_H),
        width: CARD_WIDTH - 20,
        height: FIELD_ROW_H,
        text: label,
        fontSize: 12,
        strokeColor: '#1e1e1e',
        groupIds: cardGroup,
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Domain-entity compact cards
  // ---------------------------------------------------------------------------

  const deById = new Map<string, LayoutDE>(layoutDEs.map((l) => [l.entityId, l]));

  for (const layout of layoutDEs) {
    const { entityId, x, y, cardHeight, rectId } = layout;
    const cardGroup = [`group-iface-de-${entityId}`];
    const headerTextId = semIds.ifaceDeHeaderText(entityId);

    const rect = makeRect({
      logicalId: `iface-de-${entityId}`,
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
      customData: { nodeId: entityId, nodeType: 'DomainEntity', synced: true },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: headerTextId, type: 'text' });
    elements.push(rect);

    elements.push(makeText({
      logicalId: `iface-de-${entityId}::header`,
      id: headerTextId,
      x: x + 5,
      y: y + 5,
      width: CARD_WIDTH - 10,
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

  // ---------------------------------------------------------------------------
  // Requirement cards
  // ---------------------------------------------------------------------------

  const reqById = new Map<string, LayoutReq>(layoutReqs.map((l) => [l.req.rq_id, l]));

  for (const layout of layoutReqs) {
    const { req, x, y, cardHeight, rectId } = layout;
    const cardGroup = [`group-iface-req-${req.rq_id}`];
    const headerTextId = semIds.ifaceReqHeaderText(req.rq_id);
    const bodyTextId   = semIds.ifaceReqBodyText(req.rq_id);

    const rect = makeRect({
      logicalId: `iface-req-${req.rq_id}`,
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
      customData: { nodeId: req.rq_id, nodeType: 'Requirement', stereotype: req.rq_type, synced: true },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: headerTextId, type: 'text' });
    elements.push(rect);

    elements.push(makeText({
      logicalId: `iface-req-${req.rq_id}::header`,
      id: headerTextId,
      x: x + 5,
      y: y + 5,
      width: CARD_WIDTH - 10,
      height: 30,
      text: `«requirement» ${req.rq_type} ${req.rq_id}`,
      fontSize: 12,
      strokeColor: '#1e1e1e',
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      groupIds: cardGroup,
    }));

    elements.push(makeText({
      logicalId: `iface-req-${req.rq_id}::body`,
      id: bodyTextId,
      x: x + 10,
      y: y + CARD_HEADER_H + 5,
      width: CARD_WIDTH - 20,
      height: REQ_CARD_BODY_H,
      text: req.description ?? '',
      fontSize: 11,
      strokeColor: '#1e1e1e',
      groupIds: cardGroup,
    }));
  }

  // ---------------------------------------------------------------------------
  // MAPS_TO arrows: Form/Screen → DomainEntity (deduplicated per entity per form)
  // ---------------------------------------------------------------------------

  const formById = new Map<string, LayoutForm>(layoutForms.map((l) => [l.form.id, l]));

  for (const layout of layoutForms) {
    const { form } = layout;
    const srcLayout = formById.get(form.id);
    if (!srcLayout) continue;

    const seenEntities = new Set<string>();

    for (const field of form.fields) {
      if (!field.maps_to_entity) continue;
      if (seenEntities.has(field.maps_to_entity)) continue;
      seenEntities.add(field.maps_to_entity);

      const tgtLayout = deById.get(field.maps_to_entity);
      if (!tgtLayout) continue;

      const startX = srcLayout.x + CARD_WIDTH;
      const startY = srcLayout.y + srcLayout.cardHeight / 2;
      const endX   = tgtLayout.x;
      const endY   = tgtLayout.y + tgtLayout.cardHeight / 2;

      const arrowId = semIds.ifaceMapsToArrow(form.id, field.maps_to_entity);
      const arrow = makeArrow({
        logicalId:    `arrow-mapsto-${form.id}-${field.maps_to_entity}`,
        id:           arrowId,
        startX,
        startY,
        endX,
        endY,
        startShapeId: srcLayout.rectId,
        endShapeId:   tgtLayout.rectId,
        strokeColor:  '#1e1e1e',
        strokeWidth:  2,
        registry,
      });
      elements.push(arrow);
    }
  }

  // ---------------------------------------------------------------------------
  // REALIZED_BY arrows: Requirement → Form/FormField/Screen card
  // ---------------------------------------------------------------------------

  // Build a lookup: FormField.id → parent Form rectId
  const fieldToFormRectId = new Map<string, string>();
  for (const layout of layoutForms) {
    for (const field of layout.form.fields) {
      if (field.field) {
        fieldToFormRectId.set(field.field, layout.rectId);
      }
    }
  }

  for (const layout of layoutReqs) {
    const { req } = layout;
    const reqLayout = reqById.get(req.rq_id);
    if (!reqLayout) continue;

    // Resolve target rect id:
    //  - target is a Form or Screen → use ifaceCard(target_id)
    //  - target is a FormField → find parent Form card
    let targetRectId: string | undefined;
    if (req.target_label === 'FormField') {
      targetRectId = fieldToFormRectId.get(req.target_id);
    } else {
      // Form or Screen
      const tgtLayout = formById.get(req.target_id);
      if (tgtLayout) targetRectId = tgtLayout.rectId;
    }

    if (!targetRectId) continue;

    const startX = reqLayout.x + CARD_WIDTH;
    const startY = reqLayout.y + reqLayout.cardHeight / 2;

    // Compute target shape center from registry-backed layout
    // We need target position; find it from formById or fieldToFormRectId
    let endX: number;
    let endY: number;
    if (req.target_label === 'FormField') {
      const parentFormId = [...fieldToFormRectId.entries()]
        .find(([fId]) => fId === req.target_id)?.[1];
      const parentLayout = parentFormId
        ? [...formById.values()].find((l) => l.rectId === parentFormId)
        : undefined;
      endX = parentLayout ? parentLayout.x : reqLayout.x - GRID_SPACING_X;
      endY = parentLayout ? parentLayout.y + parentLayout.cardHeight / 2 : reqLayout.y;
    } else {
      const tgtLayout = formById.get(req.target_id);
      endX = tgtLayout ? tgtLayout.x + CARD_WIDTH : reqLayout.x - GRID_SPACING_X;
      endY = tgtLayout ? tgtLayout.y + tgtLayout.cardHeight / 2 : reqLayout.y;
    }

    const arrowId = semIds.ifaceReqArrow(req.rq_id, req.target_id);
    const arrow = makeArrow({
      logicalId:    `arrow-iface-req-${req.rq_id}-${req.target_id}`,
      id:           arrowId,
      startX,
      startY,
      endX,
      endY,
      startShapeId: reqLayout.rectId,
      endShapeId:   targetRectId,
      strokeColor:  '#f57f17',
      strokeWidth:  1,
      registry,
    });
    elements.push(arrow);
  }

  return assembleScene(elements);
}

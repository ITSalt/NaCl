/**
 * ba-process renderer — port of nacl-render/SKILL.md §1196
 *
 * Generates a BA process diagram with role-based swimlanes (horizontal),
 * workflow steps left-to-right, and document/entity annotations.
 *
 * Layout constants (verbatim from SKILL.md §1196):
 *   SWIMLANE_HEIGHT    = 200
 *   SWIMLANE_LABEL_W   = 150
 *   STEP_WIDTH         = 200
 *   STEP_HEIGHT        = 60
 *   STEP_SPACING_X     = 220
 *   DOC_WIDTH          = 160
 *   DOC_HEIGHT         = 50
 *   DOC_OFFSET_Y       = 70
 *
 * Element id scheme (semantic):
 *   swim-bp-{roleId}-bg           — swimlane background rect
 *   swim-bp-{roleId}-label        — role label rect
 *   text-swim-bp-{roleId}-label   — text inside role label rect
 *   step-{bpId}-{stepId}          — workflow step rect
 *   text-step-{bpId}-{stepId}     — text inside step rect
 *   doc-{bpId}-{stepId}-{docIdx}  — document annotation rect
 *   text-doc-{bpId}-{stepId}-{docIdx} — text inside doc rect
 *   arrow-bp-{bpId}-{fromStepId}-{toStepId}  — sequential step arrow
 *   arrow-doc-{bpId}-{stepId}-{docIdx}        — step-to-doc dashed arrow
 *   title-{bpId}                  — process title text
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
// Layout constants (verbatim from SKILL.md §1196)
// ---------------------------------------------------------------------------

const SWIMLANE_HEIGHT    = 200;
const SWIMLANE_LABEL_W   = 150;
const STEP_WIDTH         = 200;
const STEP_HEIGHT        = 60;
const STEP_SPACING_X     = 220;
const DOC_WIDTH          = 160;
const DOC_HEIGHT         = 50;
const DOC_OFFSET_Y       = 70;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocRef {
  doc_id: string | null;
  doc_name: string | null;
  relation: string | null;
}

interface StepRecord {
  bp_id: string;
  bp_name: string;
  step_id: string;
  step_name: string;
  stereotype: string | null;
  step_number: number;
  role_id: string | null;
  role_name: string | null;
  documents: DocRef[];
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
// Cypher query (verbatim from SKILL.md §1196)
// ---------------------------------------------------------------------------

const PROCESS_QUERY = `
MATCH (bp:BusinessProcess {id: $bpId})-[:HAS_STEP]->(ws:WorkflowStep)
OPTIONAL MATCH (ws)-[:PERFORMED_BY]->(br:BusinessRole)
OPTIONAL MATCH (ws)-[:READS]->(doc_r:BusinessEntity)
OPTIONAL MATCH (ws)-[:PRODUCES]->(doc_p:BusinessEntity)
OPTIONAL MATCH (ws)-[:MODIFIES]->(doc_m:BusinessEntity)
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS step_id, ws.function_name AS step_name,
       ws.stereotype AS stereotype, ws.step_number AS step_number,
       br.id AS role_id, br.full_name AS role_name,
       collect(DISTINCT {doc_id: doc_r.id, doc_name: doc_r.name, relation: "READS"}) +
       collect(DISTINCT {doc_id: doc_p.id, doc_name: doc_p.name, relation: "PRODUCES"}) +
       collect(DISTINCT {doc_id: doc_m.id, doc_name: doc_m.name, relation: "MODIFIES"}) AS documents
ORDER BY ws.step_number
`;

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchSteps(driver: Driver, bpId: string): Promise<StepRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(PROCESS_QUERY, { bpId });
    return result.records.map((r) => {
      const docs = toList<Record<string, unknown>>(r.get('documents'))
        .filter((d) => d && toStr(d['doc_id']) !== null)
        .map((d) => ({
          doc_id: toStr(d['doc_id']),
          doc_name: toStr(d['doc_name']),
          relation: toStr(d['relation']),
        }));

      return {
        bp_id: toStr(r.get('bp_id')) ?? '',
        bp_name: toStr(r.get('bp_name')) ?? '',
        step_id: toStr(r.get('step_id')) ?? '',
        step_name: toStr(r.get('step_name')) ?? '',
        stereotype: toStr(r.get('stereotype')),
        step_number: toNum(r.get('step_number')),
        role_id: toStr(r.get('role_id')),
        role_name: toStr(r.get('role_name')),
        documents: docs,
      };
    }).filter((s) => s.step_id.length > 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderBaProcess(driver: Driver, bpId: string): Promise<ExcalidrawScene> {
  const steps = await fetchSteps(driver, bpId);

  // Sort by step_number
  steps.sort((a, b) => a.step_number - b.step_number);

  // Determine unique roles, preserving order of first appearance
  const roleOrder: string[] = [];
  const roleIdByName = new Map<string, string | null>();
  for (const step of steps) {
    const rName = step.role_name ?? 'Не указана';
    if (!roleOrder.includes(rName)) {
      roleOrder.push(rName);
      roleIdByName.set(rName, step.role_id);
    }
  }

  const numSteps = steps.length;
  const totalWidth = SWIMLANE_LABEL_W + 30 + numSteps * STEP_SPACING_X + 60;

  const registry: ShapeRegistry = new Map();
  const bgRects: AnyElement[] = [];
  const labelElements: AnyElement[] = [];
  const stepElements: AnyElement[] = [];
  const docElements: AnyElement[] = [];
  const seqArrows: AnyElement[] = [];
  const docArrows: AnyElement[] = [];

  // Swimlane rows
  for (let r = 0; r < roleOrder.length; r++) {
    const roleName = roleOrder[r]!;
    const roleId = roleIdByName.get(roleName) ?? null;
    // Use roleId for semantic id if available, else fall back to index
    const roleKey = roleId ?? `role-${r}`;
    const laneY = r * SWIMLANE_HEIGHT;

    // Each role lane is one group (bg + label rect + label text) so dragging
    // any element drags the whole lane via Excalidraw's select-on-click.
    const laneGroup = [`group-bp-lane-${bpId}-${roleKey}`];

    // Swimlane background (full width)
    const bgId = semIds.baSwimBg(roleKey);
    bgRects.push(makeRect({
      logicalId: `${bpId}::lane-bg::${r}`,
      id: bgId,
      x: SWIMLANE_LABEL_W,
      y: laneY,
      width: totalWidth - SWIMLANE_LABEL_W,
      height: SWIMLANE_HEIGHT,
      backgroundColor: '#fafafa',
      strokeColor: '#e0e0e0',
      strokeWidth: 1,
      roughness: 1,
      opacity: 20,
      groupIds: laneGroup,
    }));

    // Role label rect
    const labelId = semIds.baSwimLabel(roleKey);
    const labelTextId = semIds.baSwimLabelText(roleKey);
    const labelRect = makeRect({
      logicalId: `${bpId}::lane-label::${r}`,
      id: labelId,
      x: 0,
      y: laneY,
      width: SWIMLANE_LABEL_W,
      height: SWIMLANE_HEIGHT,
      backgroundColor: '#fafafa',
      strokeColor: '#424242',
      strokeWidth: 2,
      roughness: 1,
      groupIds: laneGroup,
      customData: roleId ? { nodeId: roleId, nodeType: 'BusinessRole', confidence: 'high', synced: true } : undefined,
    });
    registry.set(labelId, labelRect.boundElements);
    labelRect.boundElements.push({ id: labelTextId, type: 'text' });
    labelElements.push(labelRect);

    labelElements.push(makeText({
      logicalId: `${bpId}::lane-label-text::${r}`,
      id: labelTextId,
      x: 10,
      y: laneY + Math.round((SWIMLANE_HEIGHT - 20) / 2),
      width: SWIMLANE_LABEL_W - 20,
      height: 20,
      text: roleName,
      fontSize: 14,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: labelId,
      groupIds: laneGroup,
    }));
  }

  // Step shapes
  interface LayoutStep {
    step: StepRecord;
    stepX: number;
    stepY: number;
    shapeId: string;
  }

  const layoutSteps: LayoutStep[] = [];

  for (let s = 0; s < steps.length; s++) {
    const step = steps[s]!;
    const roleIdx = roleOrder.indexOf(step.role_name ?? 'Не указана');
    const stepX = SWIMLANE_LABEL_W + 30 + s * STEP_SPACING_X;
    const stepY = roleIdx * SWIMLANE_HEIGHT + Math.round((SWIMLANE_HEIGHT - STEP_HEIGHT) / 2);

    const stepId = semIds.baStep(bpId, step.step_id);
    const stepTextId = semIds.baStepText(bpId, step.step_id);

    // Each step + its document annotations are one group. Arrows are NOT in
    // the group — they auto-track via boundElements, and adding them to the
    // group would double-translate them on drag.
    const stepGroup = [`group-bp-step-${bpId}-${step.step_id}`];

    // Color by stereotype
    const isBusiness = step.stereotype === 'Бизнес-функция';
    const bgColor     = isBusiness ? '#e8f5e9' : '#e3f2fd';
    const strokeColor = isBusiness ? '#2e7d32' : '#1565c0';

    const rect = makeRect({
      logicalId: `${bpId}::step::${step.step_id}`,
      id: stepId,
      x: stepX,
      y: stepY,
      width: STEP_WIDTH,
      height: STEP_HEIGHT,
      backgroundColor: bgColor,
      strokeColor,
      strokeWidth: 2,
      roughness: 1,
      groupIds: stepGroup,
      customData: { nodeId: step.step_id, nodeType: 'WorkflowStep', confidence: 'high', synced: true },
    });
    registry.set(stepId, rect.boundElements);
    rect.boundElements.push({ id: stepTextId, type: 'text' });
    stepElements.push(rect);

    stepElements.push(makeText({
      logicalId: `${bpId}::step-label::${step.step_id}`,
      id: stepTextId,
      x: stepX + 5,
      y: stepY + Math.round((STEP_HEIGHT - 20) / 2),
      width: STEP_WIDTH - 10,
      height: STEP_HEIGHT - 10,
      text: step.step_name,
      fontSize: 13,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: stepId,
      groupIds: stepGroup,
    }));

    layoutSteps.push({ step, stepX, stepY, shapeId: stepId });

    // Document annotations
    const validDocs = step.documents.filter((d) => d.doc_id !== null);
    for (let di = 0; di < validDocs.length; di++) {
      const doc = validDocs[di]!;
      const docId = semIds.baDoc(bpId, step.step_id, di);
      const docTextId = semIds.baDocText(bpId, step.step_id, di);
      const docX = stepX + Math.round((STEP_WIDTH - DOC_WIDTH) / 2);
      const docY = stepY + STEP_HEIGHT + DOC_OFFSET_Y + di * (DOC_HEIGHT + 10);

      const docRect = makeRect({
        logicalId: `${bpId}::doc::${step.step_id}::${di}`,
        id: docId,
        x: docX,
        y: docY,
        width: DOC_WIDTH,
        height: DOC_HEIGHT,
        backgroundColor: '#f3e5f5',
        strokeColor: '#6a1b9a',
        strokeWidth: 2,
        roughness: 1,
        groupIds: stepGroup,
        customData: doc.doc_id ? { nodeId: doc.doc_id, nodeType: 'BusinessEntity', confidence: 'high', synced: true } : undefined,
      });
      registry.set(docId, docRect.boundElements);
      docRect.boundElements.push({ id: docTextId, type: 'text' });
      docElements.push(docRect);

      docElements.push(makeText({
        logicalId: `${bpId}::doc-label::${step.step_id}::${di}`,
        id: docTextId,
        x: docX + 5,
        y: docY + 5,
        width: DOC_WIDTH - 10,
        height: DOC_HEIGHT - 10,
        text: `${doc.doc_name ?? '?'} (${doc.relation ?? ''})`,
        fontSize: 12,
        strokeColor: '#1e1e1e',
        strokeWidth: 2,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: docId,
        groupIds: stepGroup,
      }));

      // Dashed arrow from step bottom to doc top
      const docArrowId = semIds.baDocArrow(bpId, step.step_id, di);
      const docArrow = makeArrow({
        logicalId: `${bpId}::doc-arrow::${step.step_id}::${di}`,
        id: docArrowId,
        startX: stepX + STEP_WIDTH / 2,
        startY: stepY + STEP_HEIGHT,
        endX: docX + DOC_WIDTH / 2,
        endY: docY,
        startShapeId: stepId,
        endShapeId: docId,
        strokeColor: '#1e1e1e',
        strokeWidth: 2,
        strokeStyle: 'dashed',
        registry,
      });
      docArrows.push(docArrow);
    }
  }

  // Sequential arrows (NEXT_STEP)
  for (let i = 0; i < layoutSteps.length - 1; i++) {
    const prev = layoutSteps[i]!;
    const curr = layoutSteps[i + 1]!;

    const arrowId = semIds.baArrow(bpId, prev.step.step_id, curr.step.step_id);

    const startX = prev.stepX + STEP_WIDTH;
    const startY = prev.stepY + STEP_HEIGHT / 2;
    const endX   = curr.stepX;
    const endY   = curr.stepY + STEP_HEIGHT / 2;

    const arrow = makeArrow({
      logicalId: `${bpId}::arrow::${prev.step.step_id}-${curr.step.step_id}`,
      id: arrowId,
      startX, startY, endX, endY,
      startShapeId: prev.shapeId,
      endShapeId: curr.shapeId,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      registry,
    });
    seqArrows.push(arrow);
  }

  // Title text
  const bp_name = steps[0]?.bp_name ?? bpId;
  const titleText = makeText({
    logicalId: `${bpId}::title`,
    id: semIds.baTitle(bpId),
    x: SWIMLANE_LABEL_W + 30,
    y: -50,
    width: Math.max(totalWidth - SWIMLANE_LABEL_W - 60, 200),
    height: 36,
    text: `${bp_name} (${bpId})`,
    fontSize: 24,
    strokeColor: '#1e1e1e',
  });

  // Element order per SKILL.md §1196 Step 5:
  // 1. Swimlane background rects
  // 2. Swimlane label rects + texts
  // 3. Step rects + step texts
  // 4. Document rects + doc texts
  // 5. Sequential arrows (solid)
  // 6. Step-to-document arrows (dashed)
  // 7. Title text
  const elements: AnyElement[] = [
    ...bgRects,
    ...labelElements,
    ...stepElements,
    ...docElements,
    ...seqArrows,
    ...docArrows,
    titleText,
  ];

  return assembleScene(elements);
}

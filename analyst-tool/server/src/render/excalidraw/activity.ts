/**
 * activity renderer — port of nacl-render/SKILL.md §1095
 *
 * Generates an activity diagram for a UseCase with User/System swimlanes,
 * showing ActivitySteps as a top-down flowchart.
 *
 * Layout constants (verbatim from SKILL.md §1095):
 *   SWIMLANE_WIDTH   = 300
 *   SWIMLANE_GAP     = 40    (gap between the two lanes; sysX = SWIMLANE_WIDTH + SWIMLANE_GAP)
 *   SWIMLANE_HEADER  = 50
 *   STEP_WIDTH       = 220
 *   STEP_HEIGHT      = 100
 *   STEP_SPACING_Y   = 100
 *   START_Y          = 80
 *
 * Element id scheme (semantic — matches LLM-produced boards on disk):
 *   swim-user-bg / swim-system-bg
 *   swim-user-header / swim-system-header
 *   text-swim-user-header / text-swim-system-header
 *   step-{ucId}-{stepId}
 *   text-step-{ucId}-{stepId}
 *   arrow-{ucIdNoHyphens}-{fromStepId}-{toStepId}
 */
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import {
  makeRect,
  makeDiamond,
  makeText,
  makeArrow,
  assembleScene,
  type AnyElement,
  type ShapeRegistry,
  type ExcalidrawScene,
} from '../elements.js';
import { ids as semIds } from '../semantic-ids.js';

// ---------------------------------------------------------------------------
// Layout constants (verbatim from SKILL.md §1095)
// ---------------------------------------------------------------------------

const SWIMLANE_WIDTH   = 300;
const SWIMLANE_GAP     = 40;
const SWIMLANE_HEADER  = 50;
const STEP_WIDTH       = 220;
const STEP_HEIGHT      = 100;
const STEP_SPACING_Y   = 100;
const START_Y          = 80;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepRecord {
  uc_id: string;
  uc_name: string;
  step_id: string;
  step_desc: string;
  actor_type: 'User' | 'System' | string;
  step_number: number;
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

// ---------------------------------------------------------------------------
// Cypher query (verbatim from SKILL.md §1095)
// ---------------------------------------------------------------------------

const ACTIVITY_QUERY = `
MATCH (uc:UseCase {id: $ucId})-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       as_step.id AS step_id, as_step.description AS step_desc,
       as_step.actor_type AS actor_type, as_step.step_number AS step_number
ORDER BY as_step.step_number
`;

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchSteps(driver: Driver, ucId: string): Promise<StepRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(ACTIVITY_QUERY, { ucId });
    return result.records.map((r) => ({
      uc_id: toStr(r.get('uc_id')) ?? '',
      uc_name: toStr(r.get('uc_name')) ?? '',
      step_id: toStr(r.get('step_id')) ?? '',
      step_desc: toStr(r.get('step_desc')) ?? '',
      actor_type: toStr(r.get('actor_type')) ?? 'User',
      step_number: toNum(r.get('step_number')),
    })).filter((s) => s.step_id.length > 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderActivity(driver: Driver, ucId: string): Promise<ExcalidrawScene> {
  const steps = await fetchSteps(driver, ucId);

  // Sort by step_number
  steps.sort((a, b) => a.step_number - b.step_number);

  const registry: ShapeRegistry = new Map();
  const bgRects: AnyElement[] = [];
  const headerElements: AnyElement[] = [];
  const stepElements: AnyElement[] = [];
  const arrowElements: AnyElement[] = [];

  // Swimlane x positions
  const userX = 0;
  const sysX  = SWIMLANE_WIDTH + SWIMLANE_GAP;

  // Compute total height — matches LLM formula:
  //   swimlaneTotalH = SWIMLANE_HEADER + START_Y + n*STEP_HEIGHT + (n-1)*STEP_SPACING_Y + 40
  //   For UC-001 with 11 steps: 50 + 80 + 11*100 + 10*100 + 40 = 2270 ✓
  //   (No trailing gap after the last step — gap only between steps)
  const n = steps.length;
  const totalStepArea = n * STEP_HEIGHT + (n > 0 ? (n - 1) * STEP_SPACING_Y : 0);
  const swimlaneTotalH = SWIMLANE_HEADER + START_Y + totalStepArea + 40;

  // --- Swimlane background rects ---
  // strokeColor: #e0e0e0 (matches LLM), strokeWidth: 1, opacity: 30
  const userBgId = semIds.activitySwimBg('user');
  const userBgRect = makeRect({
    logicalId: `${ucId}::swimlane-user-bg`,
    id: userBgId,
    x: userX,
    y: 0,
    width: SWIMLANE_WIDTH,
    height: swimlaneTotalH,
    backgroundColor: '#fafafa',
    strokeColor: '#e0e0e0',
    strokeStyle: 'solid',
    strokeWidth: 1,
    roughness: 1,
    opacity: 30,
  });
  bgRects.push(userBgRect);

  const sysBgId = semIds.activitySwimBg('system');
  const sysBgRect = makeRect({
    logicalId: `${ucId}::swimlane-system-bg`,
    id: sysBgId,
    x: sysX,
    y: 0,
    width: SWIMLANE_WIDTH,
    height: swimlaneTotalH,
    backgroundColor: '#fafafa',
    strokeColor: '#e0e0e0',
    strokeStyle: 'solid',
    strokeWidth: 1,
    roughness: 1,
    opacity: 30,
  });
  bgRects.push(sysBgRect);

  // --- Swimlane header rects ---
  // strokeColor: #424242, strokeWidth: 2, opacity: 100
  const userHeaderId = semIds.activitySwimHeader('user');
  const userHeaderRect = makeRect({
    logicalId: `${ucId}::swimlane-user-header`,
    id: userHeaderId,
    x: userX,
    y: 0,
    width: SWIMLANE_WIDTH,
    height: SWIMLANE_HEADER,
    backgroundColor: '#fafafa',
    strokeColor: '#424242',
    strokeWidth: 2,
    roughness: 1,
    opacity: 100,
  });
  headerElements.push(userHeaderRect);

  // text-swim-user-header: bound to header, x=10, y=15, w=280, h=20, fontSize=16
  // baseline=15 matches LLM output (Math.round(lineHeightPx * 0.75) where lineHeightPx=16*1.25=20)
  const userHeaderTextId = semIds.activitySwimHeaderText('user');
  headerElements.push(makeText({
    logicalId: `${ucId}::swimlane-user-label`,
    id: userHeaderTextId,
    x: userX + 10,
    y: 15,
    width: SWIMLANE_WIDTH - 20,
    height: 20,
    text: 'Пользователь',
    fontSize: 16,
    strokeColor: '#1e1e1e',
    strokeWidth: 2,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: userHeaderId,
    baseline: 15,
  }));
  // Register text binding on header rect
  userHeaderRect.boundElements.push({ id: userHeaderTextId, type: 'text' });

  const sysHeaderId = semIds.activitySwimHeader('system');
  const sysHeaderRect = makeRect({
    logicalId: `${ucId}::swimlane-system-header`,
    id: sysHeaderId,
    x: sysX,
    y: 0,
    width: SWIMLANE_WIDTH,
    height: SWIMLANE_HEADER,
    backgroundColor: '#fafafa',
    strokeColor: '#424242',
    strokeWidth: 2,
    roughness: 1,
    opacity: 100,
  });
  headerElements.push(sysHeaderRect);

  const sysHeaderTextId = semIds.activitySwimHeaderText('system');
  headerElements.push(makeText({
    logicalId: `${ucId}::swimlane-system-label`,
    id: sysHeaderTextId,
    x: sysX + 10,
    y: 15,
    width: SWIMLANE_WIDTH - 20,
    height: 20,
    text: 'Система',
    fontSize: 16,
    strokeColor: '#1e1e1e',
    strokeWidth: 2,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: sysHeaderId,
    baseline: 15,
  }));
  sysHeaderRect.boundElements.push({ id: sysHeaderTextId, type: 'text' });

  // --- Step shapes ---
  interface LayoutStep {
    step: StepRecord;
    stepX: number;
    stepY: number;
    shapeId: string;
  }

  const layoutSteps: LayoutStep[] = [];
  // First step starts at y = SWIMLANE_HEADER + START_Y = 50 + 80 = 130
  let currentY = SWIMLANE_HEADER + START_Y;

  for (const step of steps) {
    const isUser = step.actor_type === 'User';
    const laneX = isUser ? userX : sysX;
    const stepX = laneX + Math.round((SWIMLANE_WIDTH - STEP_WIDTH) / 2);
    const stepY = currentY;

    const stepId = semIds.activityStep(step.step_id);
    const stepTextId = semIds.activityStepText(step.step_id);

    const bgColor = isUser ? '#e8f5e9' : '#e3f2fd';
    const strokeColor = isUser ? '#2e7d32' : '#1565c0';

    const shapeEl = makeRect({
      logicalId: `${ucId}::step::${step.step_id}`,
      id: stepId,
      x: stepX,
      y: stepY,
      width: STEP_WIDTH,
      height: STEP_HEIGHT,
      backgroundColor: bgColor,
      strokeColor,
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      customData: { nodeId: step.step_id, nodeType: 'ActivityStep', confidence: 'high', synced: true },
    });
    registry.set(stepId, shapeEl.boundElements);
    // Pre-register text binding
    shapeEl.boundElements.push({ id: stepTextId, type: 'text' });
    stepElements.push(shapeEl);

    // Text element: x=stepX+10, y=stepY+40 (vertically centred in 100h rect), w=200, h=20
    // lineHeight=5/3 matches LLM output for fontSize=12 step labels
    // baseline=14 matches LLM for single-line step text
    stepElements.push(makeText({
      logicalId: `${ucId}::step-label::${step.step_id}`,
      id: stepTextId,
      x: stepX + 10,
      y: stepY + Math.round((STEP_HEIGHT - 20) / 2),
      width: STEP_WIDTH - 20,
      height: 20,
      text: step.step_desc,
      fontSize: 12,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: stepId,
      lineHeight: 5 / 3,
      baseline: 14,
    }));

    layoutSteps.push({ step, stepX, stepY, shapeId: stepId });
    currentY += STEP_HEIGHT + STEP_SPACING_Y;
  }

  // --- Sequential arrows between consecutive steps ---
  for (let i = 0; i < layoutSteps.length - 1; i++) {
    const prev = layoutSteps[i]!;
    const curr = layoutSteps[i + 1]!;

    const arrowId = semIds.activityArrow(ucId, prev.step.step_id, curr.step.step_id);

    const startX = prev.stepX + STEP_WIDTH / 2;
    const startY = prev.stepY + STEP_HEIGHT;
    const endX   = curr.stepX + STEP_WIDTH / 2;
    const endY   = curr.stepY;

    const arrow = makeArrow({
      logicalId: `${ucId}::arrow::${prev.step.step_id}-${curr.step.step_id}`,
      id: arrowId,
      startX, startY, endX, endY,
      startShapeId: prev.shapeId,
      endShapeId: curr.shapeId,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      registry,
    });
    arrowElements.push(arrow);
  }

  // Element order per SKILL.md §1095 Step 4:
  // 1. Swimlane background rects (lowest z-order)
  // 2. Swimlane header rects + header texts
  // 3. Step shapes + step texts
  // 4. Arrows
  const elements: AnyElement[] = [
    ...bgRects,
    ...headerElements,
    ...stepElements,
    ...arrowElements,
  ];

  return assembleScene(elements);
}

// Diamond step variant (for future use when step_type='decision' is added to schema)
export function makeDiamondStep(opts: {
  logicalId: string;
  stepX: number;
  stepY: number;
  step_desc: string;
  step_id: string;
  ucId: string;
  registry: ShapeRegistry;
}): { shape: AnyElement; label: AnyElement; shapeId: string } {
  const DIAMOND_W = 160;
  const DIAMOND_H = 120;
  const shapeId = semIds.activityStep(opts.step_id);
  const textId = semIds.activityStepText(opts.step_id);

  const shape = makeDiamond({
    logicalId: opts.logicalId,
    id: shapeId,
    x: opts.stepX,
    y: opts.stepY,
    width: DIAMOND_W,
    height: DIAMOND_H,
    backgroundColor: '#fff3e0',
    strokeColor: '#e65100',
    customData: { nodeId: opts.step_id, nodeType: 'ActivityStep', confidence: 'high', synced: true },
  });
  opts.registry.set(shapeId, shape.boundElements);

  const label = makeText({
    logicalId: `${opts.logicalId}::label`,
    id: textId,
    x: opts.stepX + 5,
    y: opts.stepY + 5,
    width: DIAMOND_W - 10,
    height: DIAMOND_H - 10,
    text: opts.step_desc,
    fontSize: 13,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: shapeId,
  });

  return { shape, label, shapeId };
}

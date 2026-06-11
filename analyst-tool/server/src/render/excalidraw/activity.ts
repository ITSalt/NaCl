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
 *   step-{stepId}
 *   text-step-{stepId}
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
// Layout constants for requirement cards
// ---------------------------------------------------------------------------

/** Gap between the rightmost swimlane and the requirement column. */
const REQ_COLUMN_GAP    = 60;
/** Width of a requirement card. */
const REQ_CARD_WIDTH    = 240;
/** Minimum height of a requirement card. */
const REQ_CARD_MIN_H    = 80;
/** Vertical spacing between consecutive requirement cards. */
const REQ_CARD_SPACING  = 20;
/** Height of the stereotype header text area inside a card. */
const REQ_HEADER_H      = 28;

/**
 * Colour legend for requirement cards (fill, stroke) by rq_type.
 * Only functional and behavioral are drawn; all others are excluded.
 */
const REQ_TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  functional: { fill: '#fff8e1', stroke: '#f57f17' },
  behavioral: { fill: '#e8f5e9', stroke: '#2e7d32' },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepRecord {
  uc_id: string;
  uc_name: string;
  step_id: string;
  step_desc: string;
  /**
   * Raw value of `as_step.actor` from Neo4j. Possible states:
   *   - `null`            — property absent on the node
   *   - `''`              — present but unset (empty string)
   *   - `'User'`/`'user'` — render in User lane (case-insensitive)
   *   - `'System'`/`'system'` — render in System lane (case-insensitive)
   *   - other strings (e.g. `'admin'`, `'authenticated'`) — treated as user-side actor
   *
   * We keep the raw value so the renderer can detect "every step has an
   * unset actor" (a graph-data issue) and surface it as a single-lane
   * diagram + warning, rather than silently dumping everything into User.
   */
  actor: string | null;
  step_number: number;
}

interface RequirementRecord {
  rq_id: string;
  rq_type: string;
  description: string;
  /** Step ids that realize this requirement (already a list from collect()). */
  realized_steps: string[];
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

/**
 * Word-wrap `text` to roughly `maxChars` per line, breaking at whitespace.
 * Long words that exceed `maxChars` are kept intact on their own line.
 *
 * Heuristic: at fontSize=12 and ~6.5px average char width, ~28 chars fit
 * inside the 200px text area of a STEP_WIDTH=220 rect.
 */
function wrapText(text: string, maxChars: number): { wrapped: string; lineCount: number } {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { wrapped: text, lineCount: 1 };
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return { wrapped: lines.join('\n'), lineCount: lines.length };
}

/** Empty / "--" placeholder check — symptom of incomplete graph data. */
function isPlaceholderDescription(desc: string): boolean {
  const trimmed = desc.trim();
  return trimmed === '' || trimmed === '--' || trimmed === '—';
}

/**
 * Classify a raw actor string into one of the two swimlanes.
 *   - case-insensitive `system` → System lane
 *   - everything else (`User`, `Admin`, `authenticated`, …) → User lane
 *   - null / `''` → null (caller decides: warn / single-lane / fallback)
 */
function classifyActor(raw: string | null): 'User' | 'System' | null {
  if (raw === null) return null;
  const t = raw.trim();
  if (t === '') return null;
  return t.toLowerCase() === 'system' ? 'System' : 'User';
}

// ---------------------------------------------------------------------------
// Cypher query (verbatim from SKILL.md §1095)
// ---------------------------------------------------------------------------

// Note: graph schema uses `actor` (not `actor_type` as some older docs claimed).
// We expose values to the renderer verbatim and normalize per-step below.
//
// The upstream SKILL.md §1095 query collapses every OPTIONAL MATCH (forms,
// requirements, actors, deps) into a single row via `collect(DISTINCT …)`.
// This port only needs the per-step rows, so it must NOT re-introduce a
// bare `OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)` here: without the
// surrounding collect(), that clause fans the result set out to one row
// *per actor*, duplicating every ActivityStep box (UC with User+System
// actors rendered each step twice). The lane for each step is derived from
// `as_step.actor` below — no SystemRole join is required.
const ACTIVITY_QUERY = `
MATCH (uc:UseCase {id: $ucId})-[:HAS_STEP]->(as_step:ActivityStep)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       as_step.id AS step_id, as_step.description AS step_desc,
       as_step.actor AS actor, as_step.step_number AS step_number
ORDER BY as_step.step_number
`;

/**
 * Second query: fetch functional/behavioral requirements anchored to steps of
 * this UC via REALIZED_BY. Returns one row per requirement with the list of
 * realized step ids aggregated by collect(DISTINCT …).
 *
 * The WHERE filter mirrors the Cypher in task-be.md verbatim.
 */
const REQUIREMENT_QUERY = `
MATCH (uc:UseCase {id: $ucId})-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (rq)-[rel:REALIZED_BY]->(s:ActivityStep)<-[:HAS_STEP]-(uc)
WHERE coalesce(rq.rq_type, rq.req_type, rq.type,'') IN ['functional','behavioral']
RETURN rq.id AS rq_id, coalesce(rq.rq_type,rq.req_type,rq.type,'functional') AS rq_type,
       rq.description AS description, collect(DISTINCT s.id) AS realized_steps
ORDER BY rq.id
`;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchSteps(driver: Driver, ucId: string): Promise<StepRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(ACTIVITY_QUERY, { ucId });
    const rows = result.records.map((r) => ({
      uc_id: toStr(r.get('uc_id')) ?? '',
      uc_name: toStr(r.get('uc_name')) ?? '',
      step_id: toStr(r.get('step_id')) ?? '',
      step_desc: toStr(r.get('step_desc')) ?? '',
      actor: toStr(r.get('actor')),
      step_number: toNum(r.get('step_number')),
    })).filter((s) => s.step_id.length > 0);

    // De-duplicate by step_id (first occurrence wins, preserving query order).
    // The query above returns one row per ActivityStep, but a malformed graph
    // (e.g. a duplicate HAS_STEP edge) or a future query change could fan the
    // rows out again. Each step renders exactly one box keyed on `step-<id>`;
    // duplicate rows would otherwise emit boxes with colliding element ids.
    const seen = new Set<string>();
    return rows.filter((s) => (seen.has(s.step_id) ? false : (seen.add(s.step_id), true)));
  } finally {
    await session.close();
  }
}

async function fetchRequirements(driver: Driver, ucId: string): Promise<RequirementRecord[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(REQUIREMENT_QUERY, { ucId });
    const ALLOWED_TYPES = new Set(['functional', 'behavioral']);
    return result.records
      .map((r) => {
        const rqType = toStr(r.get('rq_type')) ?? 'functional';
        const realizedRaw = r.get('realized_steps');
        // collect() returns a list; each item may be a string or null
        const realizedSteps: string[] = Array.isArray(realizedRaw)
          ? (realizedRaw as unknown[]).map((v) => toStr(v)).filter((v): v is string => v !== null && v.length > 0)
          : [];
        return {
          rq_id: toStr(r.get('rq_id')) ?? '',
          rq_type: rqType,
          description: toStr(r.get('description')) ?? '',
          realized_steps: realizedSteps,
        };
      })
      .filter((rq) => rq.rq_id.length > 0 && ALLOWED_TYPES.has(rq.rq_type));
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderActivity(driver: Driver, ucId: string): Promise<ExcalidrawScene> {
  const [steps, requirements] = await Promise.all([
    fetchSteps(driver, ucId),
    fetchRequirements(driver, ucId),
  ]);

  // Sort by step_number
  steps.sort((a, b) => a.step_number - b.step_number);

  // Data-quality detection — drives layout mode + warning banner.
  // Each step gets its actor classified into User / System / null. If every
  // step is null after classification (raw value was missing or empty), the
  // graph is incomplete and we can't honestly split lanes. Render a single
  // lane and warn the analyst rather than silently dumping into "User".
  const classifiedSteps = steps.map((s) => ({ ...s, lane: classifyActor(s.actor) }));
  const allNullActor = classifiedSteps.length > 0 && classifiedSteps.every((s) => s.lane === null);

  const registry: ShapeRegistry = new Map();
  const bgRects: AnyElement[] = [];
  const headerElements: AnyElement[] = [];
  const stepElements: AnyElement[] = [];
  const arrowElements: AnyElement[] = [];
  const warningElements: AnyElement[] = [];

  // Swimlane x positions — when allNullActor, omit the system lane entirely.
  const userX = 0;
  const sysX  = SWIMLANE_WIDTH + SWIMLANE_GAP;

  // Pre-compute per-step layout (text-wrapping → dynamic height) so the
  // swimlane background height accounts for tall steps.
  const TEXT_LINE_PX = 20;          // fontSize=12 * lineHeight 5/3 ≈ 20
  const TEXT_VPAD = 10;             // top + bottom padding inside rect
  const WRAP_CHARS = 28;            // ~28 chars fit in 200px at fontSize=12

  interface PrepStep {
    step: StepRecord;
    lane: 'User' | 'System' | null;
    isEmpty: boolean;
    displayText: string;          // shown when collapsed (may contain \n)
    rawText: string;              // shown in edit mode
    lineCount: number;
    rectH: number;
  }

  const prepped: PrepStep[] = classifiedSteps.map(({ lane, ...step }) => {
    const isEmpty = isPlaceholderDescription(step.step_desc);
    const rawText = isEmpty ? `${step.step_id} (нет описания)` : step.step_desc;
    const { wrapped, lineCount } = wrapText(rawText, WRAP_CHARS);
    // Rect height: at least STEP_HEIGHT, otherwise grow to fit lines + padding.
    const neededH = lineCount * TEXT_LINE_PX + TEXT_VPAD * 2 + 20;
    const rectH = Math.max(STEP_HEIGHT, neededH);
    return { step, lane, isEmpty, displayText: wrapped, rawText, lineCount, rectH };
  });

  // Total swimlane height — sum of dynamic step heights + spacing.
  const totalStepArea = prepped.reduce((acc, p) => acc + p.rectH, 0)
    + (prepped.length > 0 ? (prepped.length - 1) * STEP_SPACING_Y : 0);
  const swimlaneTotalH = SWIMLANE_HEADER + START_Y + totalStepArea + 40;

  // Each swimlane (bg + header + label) is one group so dragging any element
  // moves the whole lane together. Note: this changes hashes vs. pre-Wave-0
  // LLM output, which used groupIds: [] for all elements — accepted because
  // the alternative is the user-visible "drag bg, header stays" bug.
  const userGroup = [`group-swim-${ucId}-user`];
  const sysGroup  = [`group-swim-${ucId}-system`];

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
    roughness: 0,
    opacity: 30,
    groupIds: userGroup,
  });
  bgRects.push(userBgRect);

  // System lane only when actor data is present. allNullActor → single lane.
  if (!allNullActor) {
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
      roughness: 0,
      opacity: 30,
      groupIds: sysGroup,
    });
    bgRects.push(sysBgRect);
  }

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
    roughness: 0,
    opacity: 100,
    groupIds: userGroup,
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
    // In single-lane mode the header label can't claim "Пользователь" — that
    // would falsely assert the data has been classified.
    text: allNullActor ? 'Шаги (actor не задан)' : 'Пользователь',
    fontSize: 16,
    strokeColor: '#1e1e1e',
    strokeWidth: 2,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: userHeaderId,
    baseline: 15,
    groupIds: userGroup,
  }));
  // Register text binding on header rect
  userHeaderRect.boundElements.push({ id: userHeaderTextId, type: 'text' });

  if (!allNullActor) {
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
      roughness: 0,
      opacity: 100,
      groupIds: sysGroup,
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
      groupIds: sysGroup,
    }));
    sysHeaderRect.boundElements.push({ id: sysHeaderTextId, type: 'text' });
  }

  // --- Warning banner when actor is missing on every step ---
  // Free text element above the swimlane, no container, so the analyst sees
  // immediately that the diagram is degraded by missing graph data.
  if (allNullActor) {
    warningElements.push(makeText({
      logicalId: `${ucId}::warning-actor-missing`,
      id: `text-warning-${ucId}-actor-missing`,
      x: userX + 10,
      y: -40,
      width: SWIMLANE_WIDTH - 20,
      height: 20,
      text: '⚠ actor не задан — заполните в графе для разделения по дорожкам',
      fontSize: 12,
      strokeColor: '#b71c1c',
      strokeWidth: 1,
      textAlign: 'left',
      verticalAlign: 'top',
    }));
  }

  // --- Step shapes ---
  interface LayoutStep {
    step: StepRecord;
    stepX: number;
    stepY: number;
    rectH: number;
    shapeId: string;
  }

  const layoutSteps: LayoutStep[] = [];
  // First step starts at y = SWIMLANE_HEADER + START_Y = 50 + 80 = 130
  let currentY = SWIMLANE_HEADER + START_Y;

  for (const prep of prepped) {
    const { step, lane, isEmpty, displayText, rawText, lineCount, rectH } = prep;

    // In allNullActor mode, every step lives in the single (user) lane. Keep
    // the user-style colours so the diagram is still readable; the warning
    // banner makes the data-quality issue explicit.
    // Otherwise: lane === 'System' → System lane; lane === 'User' or null
    // (mixed UC where some steps have actor and some don't) → User lane.
    const isUserLane = allNullActor || lane !== 'System';
    const laneX = isUserLane ? userX : sysX;
    const stepX = laneX + Math.round((SWIMLANE_WIDTH - STEP_WIDTH) / 2);
    const stepY = currentY;

    const stepId = semIds.activityStep(step.step_id);
    const stepTextId = semIds.activityStepText(step.step_id);

    const bgColor = isUserLane ? '#e8f5e9' : '#e3f2fd';
    const strokeColor = isEmpty ? '#9e9e9e' : (isUserLane ? '#2e7d32' : '#1565c0');

    const shapeEl = makeRect({
      logicalId: `${ucId}::step::${step.step_id}`,
      id: stepId,
      x: stepX,
      y: stepY,
      width: STEP_WIDTH,
      height: rectH,
      backgroundColor: bgColor,
      strokeColor,
      // Dashed border for placeholder/empty descriptions — tells the analyst
      // at a glance that this step needs proper data in the graph.
      strokeStyle: isEmpty ? 'dashed' : 'solid',
      strokeWidth: 2,
      roughness: 0,
      opacity: isEmpty ? 70 : 100,
      customData: { nodeId: step.step_id, nodeType: 'ActivityStep', confidence: 'high', synced: true },
    });
    registry.set(stepId, shapeEl.boundElements);
    // Pre-register text binding
    shapeEl.boundElements.push({ id: stepTextId, type: 'text' });
    stepElements.push(shapeEl);

    // Vertically centre the text block inside the rect.
    const textBlockH = lineCount * TEXT_LINE_PX;
    const textY = stepY + Math.round((rectH - textBlockH) / 2);

    stepElements.push(makeText({
      logicalId: `${ucId}::step-label::${step.step_id}`,
      id: stepTextId,
      x: stepX + 10,
      y: textY,
      width: STEP_WIDTH - 20,
      height: textBlockH,
      // Pre-wrapped for display (containerId-bound text in Excalidraw renders
      // `text` verbatim when collapsed; `originalText` is shown in edit mode).
      text: displayText,
      originalText: rawText,
      fontSize: 12,
      strokeColor: isEmpty ? '#9e9e9e' : '#1e1e1e',
      strokeWidth: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: stepId,
      lineHeight: 5 / 3,
    }));

    layoutSteps.push({ step, stepX, stepY, rectH, shapeId: stepId });
    currentY += rectH + STEP_SPACING_Y;
  }

  // --- Sequential arrows between consecutive steps ---
  for (let i = 0; i < layoutSteps.length - 1; i++) {
    const prev = layoutSteps[i]!;
    const curr = layoutSteps[i + 1]!;

    const arrowId = semIds.activityArrow(ucId, prev.step.step_id, curr.step.step_id);

    const startX = prev.stepX + STEP_WIDTH / 2;
    const startY = prev.stepY + prev.rectH;
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

  // --- Requirement cards (UC-021) ---
  // Render functional/behavioral requirements anchored to steps via REALIZED_BY.
  // Cards go in a column to the right of the swimlanes; stable order by rq_id.
  // Vacuous: when requirements is empty, these arrays stay empty → byte-identical output.

  const reqCardElements: AnyElement[] = [];
  const reqArrowElements: AnyElement[] = [];

  if (requirements.length > 0) {
    // X position of the requirement column: right edge of swimlanes + gap
    const swimlaneRightEdge = allNullActor
      ? SWIMLANE_WIDTH
      : SWIMLANE_WIDTH * 2 + SWIMLANE_GAP;
    const reqColumnX = swimlaneRightEdge + REQ_COLUMN_GAP;

    // Start y aligned with the first step (if any) or the swimlane header bottom
    const firstStepY = layoutSteps.length > 0
      ? (layoutSteps[0]!.stepY)
      : SWIMLANE_HEADER + START_Y;

    let reqCurrentY = firstStepY;

    // Sort requirements by rq_id for stable ordering (query already ORDER BY rq.id,
    // but we enforce stability in-process to guard against driver differences).
    const sortedReqs = [...requirements].sort((a, b) => a.rq_id.localeCompare(b.rq_id));

    for (const rq of sortedReqs) {
      const colors = REQ_TYPE_COLORS[rq.rq_type] ?? { fill: '#fce4ec', stroke: '#c62828' };
      const groupId = `group-req-${rq.rq_id}`;
      const cardId = semIds.activityReqCard(ucId, rq.rq_id);
      const headerTextId = semIds.activityReqHeaderText(ucId, rq.rq_id);
      const bodyTextId   = semIds.activityReqBodyText(ucId, rq.rq_id);

      // Header text: «requirement» + rq_type + rq.id
      const headerText = `«requirement» ${rq.rq_type} ${rq.rq_id}`;

      // Body text: wrapped description
      const { wrapped: wrappedDesc, lineCount: descLines } = wrapText(rq.description || '(no description)', 30);

      // Card height: header + body lines
      const TEXT_LINE_PX = 20;
      const TEXT_VPAD = 8;
      const bodyH = descLines * TEXT_LINE_PX + TEXT_VPAD;
      const cardH = Math.max(REQ_CARD_MIN_H, REQ_HEADER_H + bodyH + TEXT_VPAD);

      const cardRect = makeRect({
        logicalId: `${ucId}::req::${rq.rq_id}`,
        id: cardId,
        x: reqColumnX,
        y: reqCurrentY,
        width: REQ_CARD_WIDTH,
        height: cardH,
        backgroundColor: colors.fill,
        strokeColor: colors.stroke,
        strokeStyle: 'solid',
        strokeWidth: 2,
        roughness: 0,
        opacity: 100,
        groupIds: [groupId],
        customData: {
          nodeId: rq.rq_id,
          nodeType: 'Requirement',
          stereotype: rq.rq_type,
          synced: true,
        },
      });
      registry.set(cardId, cardRect.boundElements);

      // Register text bindings on card
      cardRect.boundElements.push({ id: headerTextId, type: 'text' });
      cardRect.boundElements.push({ id: bodyTextId,   type: 'text' });
      reqCardElements.push(cardRect);

      // Header text element
      reqCardElements.push(makeText({
        logicalId: `${ucId}::req-header::${rq.rq_id}`,
        id: headerTextId,
        x: reqColumnX + 8,
        y: reqCurrentY + 4,
        width: REQ_CARD_WIDTH - 16,
        height: REQ_HEADER_H - 4,
        text: headerText,
        fontSize: 11,
        strokeColor: colors.stroke,
        strokeWidth: 1,
        textAlign: 'left',
        verticalAlign: 'middle',
        containerId: cardId,
        groupIds: [groupId],
      }));

      // Body text element
      reqCardElements.push(makeText({
        logicalId: `${ucId}::req-body::${rq.rq_id}`,
        id: bodyTextId,
        x: reqColumnX + 8,
        y: reqCurrentY + REQ_HEADER_H + 4,
        width: REQ_CARD_WIDTH - 16,
        height: bodyH,
        text: wrappedDesc,
        originalText: rq.description || '(no description)',
        fontSize: 12,
        strokeColor: '#1e1e1e',
        strokeWidth: 1,
        textAlign: 'left',
        verticalAlign: 'top',
        containerId: cardId,
        groupIds: [groupId],
      }));

      // Arrows from this card to each realized step
      for (const stepId of rq.realized_steps) {
        const stepShapeId = semIds.activityStep(stepId);
        const arrowId = semIds.activityReqArrow(ucId, rq.rq_id, stepId);

        // Find the layout step to compute arrow endpoint positions
        const layoutStep = layoutSteps.find((ls) => ls.step.step_id === stepId);
        const startX = reqColumnX;  // left edge of req card → pointing towards steps
        const startY = reqCurrentY + Math.round(cardH / 2);
        const endX   = layoutStep
          ? layoutStep.stepX + STEP_WIDTH
          : (allNullActor ? SWIMLANE_WIDTH : SWIMLANE_WIDTH * 2 + SWIMLANE_GAP);
        const endY   = layoutStep
          ? layoutStep.stepY + Math.round(layoutStep.rectH / 2)
          : startY;

        const arrow = makeArrow({
          logicalId: `${ucId}::req-arrow::${rq.rq_id}::${stepId}`,
          id: arrowId,
          startX,
          startY,
          endX,
          endY,
          startShapeId: cardId,
          endShapeId: stepShapeId,
          strokeColor: colors.stroke,
          strokeStyle: 'dashed',
          strokeWidth: 1,
          groupIds: [],   // per spec: arrows are NOT in groupIds
          registry,
        });
        reqArrowElements.push(arrow);
      }

      reqCurrentY += cardH + REQ_CARD_SPACING;
    }
  }

  // Title text — centered above the swimlanes. Mirrors ba-process pattern.
  // When uc_name is empty/missing, emit "(ucId)" — id-only form (per spec decision).
  const uc_name = steps[0]?.uc_name ?? '';
  const titleDisplayText = uc_name ? `${uc_name} (${ucId})` : `(${ucId})`;
  const totalWidth = allNullActor
    ? SWIMLANE_WIDTH
    : SWIMLANE_WIDTH * 2 + SWIMLANE_GAP;
  const titleText = makeText({
    logicalId: `${ucId}::title`,
    id: semIds.ucTitle(ucId),
    x: 30,
    y: -50,
    width: Math.max(totalWidth - 60, 200),
    height: 36,
    text: titleDisplayText,
    fontSize: 24,
    strokeColor: '#1e1e1e',
  });

  // Element order per SKILL.md §1095 Step 4:
  // 1. Swimlane background rects (lowest z-order)
  // 2. Swimlane header rects + header texts
  // 3. Step shapes + step texts
  // 4. Arrows
  // 5. Requirement cards + requirement arrows (if any)
  // 6. Warnings (free text above the diagram)
  // 7. Title text (topmost — drawn last)
  const elements: AnyElement[] = [
    ...bgRects,
    ...headerElements,
    ...stepElements,
    ...arrowElements,
    ...reqCardElements,
    ...reqArrowElements,
    ...warningElements,
    titleText,
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

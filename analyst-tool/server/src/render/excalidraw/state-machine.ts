/**
 * state-machine renderer — UC-023
 *
 * Unified renderer for both Screen* and Runtime* state-machine families.
 *
 * Screen* family (fc):
 *   Screen -[:HAS_STATE]->  ScreenState
 *   Screen -[:HAS_TRANSITION]-> Transition -[:FROM_STATE/TO_STATE]-> ScreenState
 *   Transition -[:ON_EVENT]-> ScreenEvent
 *   initial states: ScreenState where state_kind='initial'
 *   terminal states: ScreenState where state_kind='terminal'
 *
 * Runtime* family (the Runtime*-family sample):
 *   RuntimeContract -[:HAS_STATE]->   RuntimeState
 *   RuntimeContract -[:HAS_INITIAL_STATE]-> RuntimeState
 *   RuntimeContract -[:HAS_TERMINAL_STATE]-> RuntimeState
 *   RuntimeContract -[:HAS_TRANSITION]-> RuntimeTransition -[:FROM_STATE/TO_STATE]-> RuntimeState
 *
 * Detection: query RuntimeContract first; if no rows, fall back to Screen.
 *
 * Layout constants:
 *   STATE_W       = 160
 *   STATE_H       = 60
 *   STATE_COLS    = 3
 *   STATE_GAP_X   = 220
 *   STATE_GAP_Y   = 120
 *   MARKER_SIZE   = 24
 *
 * Element id scheme:
 *   sm-state-{rootId}-{stateId}        — state rectangle
 *   text-sm-state-{rootId}-{stateId}   — state label text
 *   sm-start-{rootId}                  — start marker (filled ellipse)
 *   sm-start-arrow-{rootId}            — arrow from start marker to initial state
 *   sm-tr-{rootId}-{trId}              — transition arrow
 *   text-sm-tr-{rootId}-{trId}         — transition label text (bound to arrow)
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

const STATE_W       = 160;
const STATE_H       = 60;
const STATE_COLS    = 3;
const STATE_GAP_X   = 220;
const STATE_GAP_Y   = 120;
const MARKER_SIZE   = 24;

// ---------------------------------------------------------------------------
// Normalized shape
// ---------------------------------------------------------------------------

interface TransitionRecord {
  tr:    string;
  from:  string | null;
  to:    string | null;
  event: string | null;
}

interface StateMachineData {
  /** Which family produced this data — drives nodeType customData value. */
  family: 'screen' | 'runtime';
  states:      string[];
  initial:     string[];
  terminal:    string[];
  transitions: TransitionRecord[];
}

// ---------------------------------------------------------------------------
// Helper
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
// Cypher queries
// ---------------------------------------------------------------------------

/**
 * Runtime* family query.
 * Returns one row when rootId matches a RuntimeContract node.
 */
const RUNTIME_QUERY = `
MATCH (c:RuntimeContract {id:$id})
OPTIONAL MATCH (c)-[:HAS_STATE]->(st:RuntimeState)
OPTIONAL MATCH (c)-[:HAS_INITIAL_STATE]->(ini:RuntimeState)
OPTIONAL MATCH (c)-[:HAS_TERMINAL_STATE]->(term:RuntimeState)
OPTIONAL MATCH (c)-[:HAS_TRANSITION]->(tr:RuntimeTransition)-[:FROM_STATE]->(fs:RuntimeState)
OPTIONAL MATCH (tr)-[:TO_STATE]->(ts:RuntimeState)
RETURN c.id AS contract,
       collect(DISTINCT st.id) AS states,
       collect(DISTINCT ini.id) AS initial,
       collect(DISTINCT term.id) AS terminal,
       collect(DISTINCT {tr: tr.id, from: fs.id, to: ts.id, event: tr.on_event}) AS transitions
`;

/**
 * Screen* family query.
 * Returns one row when rootId matches a Screen node.
 */
const SCREEN_QUERY = `
MATCH (scr:Screen {id:$id})
OPTIONAL MATCH (scr)-[:HAS_STATE]->(st:ScreenState)
OPTIONAL MATCH (scr)-[:HAS_TRANSITION]->(tr:Transition)-[:FROM_STATE]->(fs:ScreenState)
OPTIONAL MATCH (tr)-[:TO_STATE]->(ts:ScreenState)
OPTIONAL MATCH (tr)-[:ON_EVENT]->(ev:ScreenEvent)
RETURN scr.id AS contract,
       collect(DISTINCT st.id) AS states,
       [s IN collect(DISTINCT st) WHERE s.state_kind='initial' | s.id] AS initial,
       [s IN collect(DISTINCT st) WHERE s.state_kind='terminal' | s.id] AS terminal,
       collect(DISTINCT {tr: tr.id, from: fs.id, to: ts.id, event: ev.name}) AS transitions
`;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchRuntime(driver: Driver, rootId: string): Promise<StateMachineData | null> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(RUNTIME_QUERY, { id: rootId });
    const record = result.records[0];
    if (!record || toStr(record.get('contract')) === null) return null;
    const states = toList<unknown>(record.get('states')).map((s) => toStr(s)).filter((s): s is string => s !== null && s.length > 0);
    if (states.length === 0) return null;
    const initial  = toList<unknown>(record.get('initial')).map((s) => toStr(s)).filter((s): s is string => s !== null && s.length > 0);
    const terminal = toList<unknown>(record.get('terminal')).map((s) => toStr(s)).filter((s): s is string => s !== null && s.length > 0);
    const transitions = normalizeTransitions(record.get('transitions'));
    return { family: 'runtime', states, initial, terminal, transitions };
  } finally {
    await session.close();
  }
}

async function fetchScreen(driver: Driver, rootId: string): Promise<StateMachineData | null> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(SCREEN_QUERY, { id: rootId });
    const record = result.records[0];
    if (!record || toStr(record.get('contract')) === null) return null;
    const states = toList<unknown>(record.get('states')).map((s) => toStr(s)).filter((s): s is string => s !== null && s.length > 0);
    if (states.length === 0) return null;
    const initial  = toList<unknown>(record.get('initial')).map((s) => toStr(s)).filter((s): s is string => s !== null && s.length > 0);
    const terminal = toList<unknown>(record.get('terminal')).map((s) => toStr(s)).filter((s): s is string => s !== null && s.length > 0);
    const transitions = normalizeTransitions(record.get('transitions'));
    return { family: 'screen', states, initial, terminal, transitions };
  } finally {
    await session.close();
  }
}

function normalizeTransitions(raw: unknown): TransitionRecord[] {
  return toList<Record<string, unknown>>(raw)
    .filter((t) => t && toStr(t['tr']) !== null)
    .map((t) => ({
      tr:    toStr(t['tr'])!,
      from:  toStr(t['from']),
      to:    toStr(t['to']),
      event: toStr(t['event']),
    }))
    // Filter out rows with null from/to (OPTIONAL MATCH artifacts with no data)
    .filter((t) => t.from !== null && t.to !== null);
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderStateMachine(
  driver: Driver,
  rootId: string,
): Promise<ExcalidrawScene> {
  // Try RuntimeContract first; fall back to Screen
  let data: StateMachineData | null = await fetchRuntime(driver, rootId);
  if (!data) {
    data = await fetchScreen(driver, rootId);
  }

  if (!data || data.states.length === 0) {
    return assembleScene([]);
  }

  return renderStateMachineData(rootId, data);
}

// ---------------------------------------------------------------------------
// Core rendering routine (parameterized over normalized data)
// ---------------------------------------------------------------------------

function renderStateMachineData(
  rootId: string,
  data: StateMachineData,
): ExcalidrawScene {
  const { family, states, initial, terminal, transitions } = data;

  const nodeType = family === 'screen' ? 'ScreenState' : 'RuntimeState';

  // Stable sort states for deterministic layout
  const sortedStates = [...states].sort();

  // Layout: grid with STATE_COLS columns
  // Initial states go in top-left; terminal in a distinct position if possible
  // But for determinism, we just use stable sort order
  interface LayoutState {
    stateId: string;
    x: number;
    y: number;
    rectId: string;
    isTerminal: boolean;
    isInitial: boolean;
  }

  const initialSet  = new Set(initial);
  const terminalSet = new Set(terminal);

  const layoutStates: LayoutState[] = sortedStates.map((stateId, i) => {
    const col = i % STATE_COLS;
    const row = Math.floor(i / STATE_COLS);
    return {
      stateId,
      x: col * STATE_GAP_X,
      y: row * STATE_GAP_Y + 80, // leave room above for start marker
      rectId: semIds.smStateRect(rootId, stateId),
      isTerminal: terminalSet.has(stateId),
      isInitial:  initialSet.has(stateId),
    };
  });

  const registry: ShapeRegistry = new Map();
  const elements: AnyElement[] = [];

  // --- State rectangles ---
  for (const ls of layoutStates) {
    const { stateId, x, y, rectId, isTerminal, isInitial: _isInitial } = ls;
    const textId = semIds.smStateText(rootId, stateId);

    // Terminal states: strokeWidth 4 (double-border effect)
    const strokeWidth = isTerminal ? 4 : 2;
    const strokeColor = isTerminal ? '#b71c1c' : (family === 'screen' ? '#1565c0' : '#4a148c');
    const bgColor     = isTerminal ? '#ffebee' : (family === 'screen' ? '#e3f2fd' : '#f3e5f5');

    const rect = makeRect({
      logicalId: `sm-state-${rootId}-${stateId}`,
      id: rectId,
      x,
      y,
      width: STATE_W,
      height: STATE_H,
      backgroundColor: bgColor,
      strokeColor,
      strokeWidth,
      roughness: 0,
      customData: {
        nodeId: stateId,
        nodeType,
        terminal: isTerminal,
        synced: true,
      },
    });
    registry.set(rectId, rect.boundElements);
    rect.boundElements.push({ id: textId, type: 'text' });
    elements.push(rect);

    elements.push(makeText({
      logicalId: `sm-state-${rootId}-${stateId}::label`,
      id: textId,
      x: x + 8,
      y: y + 8,
      width: STATE_W - 16,
      height: STATE_H - 16,
      text: stateId,
      fontSize: 13,
      strokeColor: '#1e1e1e',
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
    }));
  }

  // --- Start marker (filled ellipse-like rect) for initial states ---
  // We render a compact dark filled rectangle/ellipse above the first initial state.
  const firstInitial = sortedStates.find((s) => initialSet.has(s));
  if (firstInitial) {
    const initLayout = layoutStates.find((l) => l.stateId === firstInitial)!;
    const markerId = semIds.smStartMarker(rootId);
    const markerX = initLayout.x + (STATE_W - MARKER_SIZE) / 2;
    const markerY = initLayout.y - MARKER_SIZE - 20;

    const marker = makeRect({
      logicalId: `sm-start-marker-${rootId}`,
      id: markerId,
      x: markerX,
      y: markerY,
      width: MARKER_SIZE,
      height: MARKER_SIZE,
      backgroundColor: '#1e1e1e',
      strokeColor: '#1e1e1e',
      strokeWidth: 1,
      roughness: 0,
      customData: { nodeType: 'start-marker', rootId, synced: true },
    });
    registry.set(markerId, marker.boundElements);
    elements.push(marker);

    // Arrow from start marker to initial state
    const startArrowId = semIds.smStartArrow(rootId);
    const startArrow = makeArrow({
      logicalId: `sm-start-arrow-${rootId}`,
      id: startArrowId,
      startX: markerX + MARKER_SIZE / 2,
      startY: markerY + MARKER_SIZE,
      endX:   initLayout.x + STATE_W / 2,
      endY:   initLayout.y,
      startShapeId: markerId,
      endShapeId:   initLayout.rectId,
      strokeColor: '#1e1e1e',
      strokeWidth: 2,
      registry,
      customData: { nodeType: 'start-arrow', synced: true },
    });
    elements.push(startArrow);
  }

  // --- Transition arrows ---
  // Build a lookup map: stateId → layout
  const stateLayoutById = new Map<string, LayoutState>(
    layoutStates.map((l) => [l.stateId, l]),
  );

  // De-duplicate transitions by trId
  const seenTr = new Set<string>();
  for (const tr of transitions) {
    if (!tr.tr || !tr.from || !tr.to) continue;
    if (seenTr.has(tr.tr)) continue;
    seenTr.add(tr.tr);

    const fromLayout = stateLayoutById.get(tr.from);
    const toLayout   = stateLayoutById.get(tr.to);
    if (!fromLayout || !toLayout) continue;

    const arrowId = semIds.smTransitionArrow(rootId, tr.tr);
    const labelId = semIds.smTransitionLabel(rootId, tr.tr);

    const startX = fromLayout.x + STATE_W;
    const startY = fromLayout.y + STATE_H / 2;
    const endX   = toLayout.x;
    const endY   = toLayout.y + STATE_H / 2;

    const label = tr.event ?? tr.tr;

    const arrow = makeArrow({
      logicalId: `sm-tr-${rootId}-${tr.tr}`,
      id: arrowId,
      startX,
      startY,
      endX,
      endY,
      startShapeId: fromLayout.rectId,
      endShapeId:   toLayout.rectId,
      strokeColor: '#37474f',
      strokeWidth: 2,
      registry,
      customData: { nodeId: tr.tr, nodeType: family === 'screen' ? 'Transition' : 'RuntimeTransition', synced: true },
    });
    elements.push(arrow);

    // Label text bound to the arrow
    const midX = Math.round((startX + endX) / 2);
    const midY = Math.round((startY + endY) / 2) - 14;

    elements.push(makeText({
      logicalId: `sm-tr-${rootId}-${tr.tr}::label`,
      id: labelId,
      x: midX - 60,
      y: midY,
      width: 120,
      height: 20,
      text: label,
      fontSize: 11,
      strokeColor: '#37474f',
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: arrowId,
    }));
  }

  return assembleScene(elements);
}


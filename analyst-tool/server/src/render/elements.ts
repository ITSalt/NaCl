/**
 * elements — factory functions for Excalidraw scene elements.
 *
 * Critical invariant: arrows set BOTH directions of the binding.
 *   - Arrow has startBinding / endBinding pointing at source/target shapes.
 *   - Source and target shapes have the arrow id in their boundElements array.
 *
 * This module never calls Math.random(). All seed/versionNonce values come
 * from deterministicSeeds() keyed on the element's logical id.
 */
import { elementId, deterministicSeeds } from './deterministic-id.js';

// ---------------------------------------------------------------------------
// Shared element fields
// ---------------------------------------------------------------------------

export interface BoundEntry {
  id: string;
  type: 'arrow' | 'text';
}

export interface BaseElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: null;
  roundness: null | { type: number };
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: BoundEntry[];
  updated: number;
  link: null;
  locked: boolean;
  customData?: Record<string, unknown>;
}

export interface TextElement {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: null;
  roundness: null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: BoundEntry[];
  updated: number;
  link: null;
  locked: boolean;
  text: string;
  fontSize: number;
  fontFamily: number;
  textAlign: string;
  verticalAlign: string;
  containerId: string | null;
  originalText: string;
  lineHeight: number;
  baseline?: number;
  customData?: Record<string, unknown>;
}

export interface ArrowElement {
  id: string;
  type: 'arrow';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: null;
  roundness: { type: number };
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: BoundEntry[];
  updated: number;
  link: null;
  locked: boolean;
  points: [number, number][];
  lastCommittedPoint: null;
  startBinding: { elementId: string; focus: number; gap: number } | null;
  endBinding: { elementId: string; focus: number; gap: number } | null;
  startArrowhead: null;
  endArrowhead: 'arrow';
  elbowed: boolean;
  customData?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mutable shape registry — callers accumulate shapes, then arrows look them
// up to add the reverse boundElements entry.
// ---------------------------------------------------------------------------

/** Mutable map from element-id to its boundElements array. Callers maintain this. */
export type ShapeRegistry = Map<string, BoundEntry[]>;

// ---------------------------------------------------------------------------
// Factory: rectangle
// ---------------------------------------------------------------------------

export function makeRect(opts: {
  logicalId: string;
  /** Optional explicit element id. If omitted, derived from logicalId via elementId(). */
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;
  strokeColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  roundness?: null | { type: number };
  customData?: Record<string, unknown>;
}): BaseElement {
  const { seed, versionNonce } = deterministicSeeds(opts.logicalId);
  return {
    id: opts.id ?? elementId(opts.logicalId),
    type: 'rectangle',
    x: Math.round(opts.x),
    y: Math.round(opts.y),
    width: Math.round(opts.width),
    height: Math.round(opts.height),
    angle: 0,
    strokeColor: opts.strokeColor ?? '#000000',
    backgroundColor: opts.backgroundColor ?? 'transparent',
    fillStyle: opts.fillStyle ?? 'solid',
    strokeWidth: opts.strokeWidth ?? 1,
    strokeStyle: opts.strokeStyle ?? 'solid',
    roughness: opts.roughness ?? 0,
    opacity: opts.opacity ?? 100,
    groupIds: opts.groupIds ?? [],
    frameId: null,
    roundness: opts.roundness !== undefined ? opts.roundness : null,
    seed,
    version: 1,
    versionNonce,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    ...(opts.customData ? { customData: opts.customData } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: diamond
// ---------------------------------------------------------------------------

export function makeDiamond(opts: {
  logicalId: string;
  /** Optional explicit element id. If omitted, derived from logicalId via elementId(). */
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;
  strokeColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  customData?: Record<string, unknown>;
}): BaseElement {
  const { seed, versionNonce } = deterministicSeeds(opts.logicalId);
  return {
    id: opts.id ?? elementId(opts.logicalId),
    type: 'diamond',
    x: Math.round(opts.x),
    y: Math.round(opts.y),
    width: Math.round(opts.width),
    height: Math.round(opts.height),
    angle: 0,
    strokeColor: opts.strokeColor ?? '#000000',
    backgroundColor: opts.backgroundColor ?? 'transparent',
    fillStyle: opts.fillStyle ?? 'solid',
    strokeWidth: opts.strokeWidth ?? 1,
    strokeStyle: opts.strokeStyle ?? 'solid',
    roughness: opts.roughness ?? 0,
    opacity: opts.opacity ?? 100,
    groupIds: opts.groupIds ?? [],
    frameId: null,
    roundness: null,
    seed,
    version: 1,
    versionNonce,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    ...(opts.customData ? { customData: opts.customData } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: text
// ---------------------------------------------------------------------------

export function makeText(opts: {
  logicalId: string;
  /** Optional explicit element id. If omitted, derived from logicalId via elementId(). */
  id?: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  text: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  opacity?: number;
  groupIds?: string[];
  containerId?: string | null;
  lineHeight?: number;
  /**
   * Optional baseline offset (pixels from top of first line to text baseline).
   * When provided, it's stored verbatim — allows matching LLM-produced boards.
   * Formula for single-line text: Math.ceil(fontSize * lineHeight * 0.7).
   * Omit for dynamic / multi-line text where the exact value can't be predicted.
   */
  baseline?: number;
  /**
   * Optional raw text (used in edit mode). When pre-wrapping `text` with
   * explicit `\n`, set `originalText` to the unwrapped string so the user
   * can edit the natural source.
   */
  originalText?: string;
  customData?: Record<string, unknown>;
}): TextElement {
  const { seed, versionNonce } = deterministicSeeds(opts.logicalId);
  const fontSize = opts.fontSize ?? 16;
  const lineHeight = opts.lineHeight ?? 1.25;
  const lines = opts.text.split('\n').length;
  const height = opts.height ?? Math.round(fontSize * lineHeight * Math.max(lines, 1));
  return {
    id: opts.id ?? elementId(opts.logicalId),
    type: 'text',
    x: Math.round(opts.x),
    y: Math.round(opts.y),
    width: Math.round(opts.width),
    height,
    angle: 0,
    strokeColor: opts.strokeColor ?? '#000000',
    backgroundColor: opts.backgroundColor ?? 'transparent',
    fillStyle: 'solid',
    strokeWidth: opts.strokeWidth ?? 1,
    strokeStyle: opts.strokeStyle ?? 'solid',
    roughness: 0,
    opacity: opts.opacity ?? 100,
    groupIds: opts.groupIds ?? [],
    frameId: null,
    roundness: null,
    seed,
    version: 1,
    versionNonce,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    text: opts.text,
    originalText: opts.originalText ?? opts.text,
    fontSize,
    // Default to 2 (Normal / Helvetica) — a system font that needs no web-font
    // download. fontFamily 1 (Virgil) and 3 (Cascadia) are web fonts loaded from
    // EXCALIDRAW_ASSET_PATH; if that fetch is slow or blocked, container-bound
    // text stays invisible (FOIT). Normal always renders, so all boards are
    // legible regardless of font availability.
    fontFamily: opts.fontFamily ?? 2,
    textAlign: opts.textAlign ?? 'left',
    verticalAlign: opts.verticalAlign ?? 'top',
    containerId: opts.containerId ?? null,
    lineHeight,
    ...(opts.baseline !== undefined ? { baseline: opts.baseline } : {}),
    ...(opts.customData ? { customData: opts.customData } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory: arrow — sets BOTH binding directions
// ---------------------------------------------------------------------------

/**
 * Create an arrow and simultaneously register the reverse binding on both
 * source and target shapes via the `registry`.
 *
 * The registry maps element-id → boundElements array. Callers must ensure
 * each shape's `boundElements` array is the same reference as what's in the
 * registry (i.e. populate the registry from the live shape objects).
 *
 * If startShapeId / endShapeId are omitted, no binding is set (free arrow).
 */
export function makeArrow(opts: {
  logicalId: string;
  /** Optional explicit element id. If omitted, derived from logicalId via elementId(). */
  id?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startShapeId?: string | null;
  endShapeId?: string | null;
  strokeColor?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  registry?: ShapeRegistry;
  customData?: Record<string, unknown>;
}): ArrowElement {
  const { seed, versionNonce } = deterministicSeeds(opts.logicalId);
  const arrowId = opts.id ?? elementId(opts.logicalId);

  const dx = Math.round(opts.endX - opts.startX);
  const dy = Math.round(opts.endY - opts.startY);

  const startBinding = opts.startShapeId
    ? { elementId: opts.startShapeId, focus: 0, gap: 1 }
    : null;
  const endBinding = opts.endShapeId
    ? { elementId: opts.endShapeId, focus: 0, gap: 1 }
    : null;

  const arrow: ArrowElement = {
    id: arrowId,
    type: 'arrow',
    x: Math.round(opts.startX),
    y: Math.round(opts.startY),
    width: Math.abs(dx),
    height: Math.abs(dy),
    angle: 0,
    strokeColor: opts.strokeColor ?? '#000000',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: opts.strokeWidth ?? 1,
    strokeStyle: opts.strokeStyle ?? 'solid',
    roughness: opts.roughness ?? 0,
    opacity: opts.opacity ?? 100,
    groupIds: opts.groupIds ?? [],
    frameId: null,
    roundness: { type: 2 },
    seed,
    version: 1,
    versionNonce,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    points: [[0, 0], [dx, dy]],
    lastCommittedPoint: null,
    startBinding,
    endBinding,
    startArrowhead: null,
    endArrowhead: 'arrow',
    elbowed: false,
    ...(opts.customData ? { customData: opts.customData } : {}),
  };

  // Register reverse bindings so shapes track this arrow
  if (opts.registry) {
    const entry: BoundEntry = { id: arrowId, type: 'arrow' };

    if (opts.startShapeId) {
      const bounds = opts.registry.get(opts.startShapeId);
      if (bounds && !bounds.some((b) => b.id === arrowId)) {
        bounds.push(entry);
      }
    }
    if (opts.endShapeId) {
      const bounds = opts.registry.get(opts.endShapeId);
      if (bounds && !bounds.some((b) => b.id === arrowId)) {
        bounds.push(entry);
      }
    }
  }

  return arrow;
}

// ---------------------------------------------------------------------------
// Scene assembler
// ---------------------------------------------------------------------------

export type AnyElement = BaseElement | TextElement | ArrowElement;

export interface ExcalidrawScene {
  type: 'excalidraw';
  version: 2;
  source: string;
  elements: AnyElement[];
  appState: { viewBackgroundColor: string; gridSize: null };
  files: Record<string, never>;
}

export function assembleScene(elements: AnyElement[]): ExcalidrawScene {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'analyst-tool-render',
    elements,
    appState: { viewBackgroundColor: '#ffffff', gridSize: null },
    files: {},
  };
}

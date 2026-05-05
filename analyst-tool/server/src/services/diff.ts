import { VOLATILE_ELEMENT_KEYS } from './meta.js';
import type { ExcalidrawScene } from './boards.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawElement = Record<string, any>;

export type DiffEntry =
  | { kind: 'added'; element: ExcalidrawElement }
  | { kind: 'removed'; element: ExcalidrawElement }
  | { kind: 'changed'; before: ExcalidrawElement; after: ExcalidrawElement; reasons: string[] };

export type DiffResult = {
  entries: DiffEntry[];
  stats: { added: number; removed: number; changed: number };
};

/** Returns the stable identity key for an element: prefer customData.nodeId, fall back to id. */
function elementKey(el: ExcalidrawElement): string {
  const nodeId = el?.customData?.nodeId;
  if (typeof nodeId === 'string' && nodeId.length > 0) {
    return `nodeId:${nodeId}`;
  }
  return `id:${String(el?.id ?? '')}`;
}

/** Deep-equal check on two values, ignoring nothing (callers filter volatile keys themselves). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao).sort();
  const bKeys = Object.keys(bo).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/** Returns list of top-level field names that differ between two elements (volatile keys excluded). */
function changedFields(before: ExcalidrawElement, after: ExcalidrawElement): string[] {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const reasons: string[] = [];
  for (const k of allKeys) {
    if (VOLATILE_ELEMENT_KEYS.has(k)) continue;
    if (!deepEqual(before[k], after[k])) {
      reasons.push(k);
    }
  }
  return reasons.sort();
}

export function diffScenes(older: ExcalidrawScene, newer: ExcalidrawScene): DiffResult {
  const olderElements: ExcalidrawElement[] = Array.isArray(older?.elements) ? older.elements : [];
  const newerElements: ExcalidrawElement[] = Array.isArray(newer?.elements) ? newer.elements : [];

  const olderMap = new Map<string, ExcalidrawElement>();
  for (const el of olderElements) {
    olderMap.set(elementKey(el), el);
  }

  const newerMap = new Map<string, ExcalidrawElement>();
  for (const el of newerElements) {
    newerMap.set(elementKey(el), el);
  }

  const entries: DiffEntry[] = [];

  // Find changed and removed
  for (const [key, oldEl] of olderMap) {
    const newEl = newerMap.get(key);
    if (newEl === undefined) {
      entries.push({ kind: 'removed', element: oldEl });
    } else {
      const reasons = changedFields(oldEl, newEl);
      if (reasons.length > 0) {
        entries.push({ kind: 'changed', before: oldEl, after: newEl, reasons });
      }
    }
  }

  // Find added
  for (const [key, newEl] of newerMap) {
    if (!olderMap.has(key)) {
      entries.push({ kind: 'added', element: newEl });
    }
  }

  const stats = {
    added: entries.filter((e) => e.kind === 'added').length,
    removed: entries.filter((e) => e.kind === 'removed').length,
    changed: entries.filter((e) => e.kind === 'changed').length,
  };

  return { entries, stats };
}

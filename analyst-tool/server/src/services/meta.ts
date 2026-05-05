import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

export type BoardMeta = {
  lastGeneratedAt: string | null;
  lastGeneratedBy: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: 'ok' | 'failed' | null;
  lastSyncRunId: string | null;
  contentHashAtLastSync: string | null;
};

const DEFAULT_META: BoardMeta = {
  lastGeneratedAt: null,
  lastGeneratedBy: null,
  lastSyncedAt: null,
  lastSyncStatus: null,
  lastSyncRunId: null,
  contentHashAtLastSync: null,
};

function metaPath(boardName: string): string {
  return join(config.boardsDir, `${boardName}.meta.json`);
}

export async function readMeta(boardName: string): Promise<BoardMeta> {
  const p = metaPath(boardName);
  if (!existsSync(p)) {
    return { ...DEFAULT_META };
  }
  try {
    const raw = await readFile(p, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BoardMeta>;
    return { ...DEFAULT_META, ...parsed };
  } catch {
    return { ...DEFAULT_META };
  }
}

export async function writeMeta(
  boardName: string,
  patch: Partial<BoardMeta>,
): Promise<BoardMeta> {
  const existing = await readMeta(boardName);
  const merged: BoardMeta = { ...existing, ...patch };
  const p = metaPath(boardName);
  const tmp = `${p}.tmp`;
  await writeFile(tmp, JSON.stringify(merged, null, 2), 'utf-8');
  await rename(tmp, p);
  return merged;
}

type ExcalidrawElement = Record<string, unknown>;

type NormalizedScene = {
  elements: ExcalidrawElement[];
  appState: { viewBackgroundColor?: unknown; gridSize?: unknown };
  files: unknown;
};

export const VOLATILE_ELEMENT_KEYS = new Set(['version', 'versionNonce', 'seed', 'updated']);

function normalizeElement(el: ExcalidrawElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Object.keys(el).filter((k) => !VOLATILE_ELEMENT_KEYS.has(k));
  keys.sort();
  for (const k of keys) {
    out[k] = el[k];
  }
  return out;
}

export function computeBoardHash(scene: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = scene as any;
  const normalized: NormalizedScene = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elements: Array.isArray(s?.elements) ? (s.elements as ExcalidrawElement[]).map(normalizeElement) : [],
    appState: {
      viewBackgroundColor: s?.appState?.viewBackgroundColor ?? null,
      gridSize: s?.appState?.gridSize ?? null,
    },
    files: s?.files ?? {},
  };
  const json = JSON.stringify(normalized);
  const hex = createHash('sha256').update(json).digest('hex');
  return `sha256:${hex}`;
}

export async function hasUnsyncedEdits(boardName: string, currentScene: unknown): Promise<boolean> {
  const meta = await readMeta(boardName);
  if (meta.contentHashAtLastSync === null) return false;
  const currentHash = computeBoardHash(currentScene);
  return currentHash !== meta.contentHashAtLastSync;
}

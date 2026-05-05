import { readFile, writeFile, rename, stat, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { getConfig } from '../config.js';
import { classifyBoard, type BoardKind } from './board-classifier.js';
import { readMeta, writeMeta, computeBoardHash, type BoardMeta } from './meta.js';
import { markSelfWrite } from './self-writes.js';
import { repairArrowBindings } from './excalidraw-bindings.js';

export { BoardKind };

const BOARD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export type SyncStatus = 'synced' | 'dirty' | 'never-synced';

export type BoardListItem = {
  name: string;
  path: string;
  kind: BoardKind;
  relatedId: string | null;
  displayName: string;
  group: string;
  mtime: string;
  syncStatus: SyncStatus;
  lastGeneratedAt: string | null;
  lastSyncedAt: string | null;
  hasUnsyncedEdits: boolean;
};

export type ExcalidrawScene = {
  type: string;
  version: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appState: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  files: Record<string, any>;
};

function assertSafePath(boardsDir: string, boardName: string): string {
  if (!BOARD_NAME_RE.test(boardName)) {
    throw Object.assign(new Error(`Invalid board name: ${boardName}`), { statusCode: 400 });
  }
  const resolved = resolve(boardsDir, `${boardName}.excalidraw`);
  if (!resolved.startsWith(resolve(boardsDir) + '/') && resolved !== resolve(boardsDir)) {
    throw Object.assign(new Error('Path traversal detected'), { statusCode: 400 });
  }
  return resolved;
}

function computeSyncStatus(meta: BoardMeta, unsyncedEdits: boolean): SyncStatus {
  if (meta.lastSyncedAt === null) return 'never-synced';
  if (unsyncedEdits) return 'dirty';
  return 'synced';
}

export async function listBoards(): Promise<BoardListItem[]> {
  const boardsDir = getConfig().boardsDir;
  let entries: Dirent[];
  try {
    entries = await readdir(boardsDir, { withFileTypes: true });
  } catch (err) {
    // Boards directory may not exist yet (fresh project, never rendered) — empty list, not 500.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const results: BoardListItem[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.excalidraw')) continue;
    // Skip files inside .snapshots (readdir at depth 0 won't return those, but guard anyway)
    if (entry.name.startsWith('.')) continue;

    const boardName = basename(entry.name, '.excalidraw');
    const filePath = join(boardsDir, entry.name);

    const [fileStat, meta] = await Promise.all([
      stat(filePath),
      readMeta(boardName),
    ]);

    const mtime = fileStat.mtime.toISOString();

    let unsyncedEdits = false;
    if (meta.contentHashAtLastSync !== null) {
      try {
        const raw = await readFile(filePath, 'utf-8');
        const scene = JSON.parse(raw) as unknown;
        const currentHash = computeBoardHash(scene);
        unsyncedEdits = currentHash !== meta.contentHashAtLastSync;
      } catch {
        // If we can't read/parse, treat as dirty
        unsyncedEdits = true;
      }
    }

    const classification = classifyBoard(boardName);
    const syncStatus = computeSyncStatus(meta, unsyncedEdits);

    results.push({
      name: boardName,
      path: filePath,
      kind: classification.kind,
      relatedId: classification.relatedId,
      displayName: classification.displayName,
      group: classification.group,
      mtime,
      syncStatus,
      lastGeneratedAt: meta.lastGeneratedAt,
      lastSyncedAt: meta.lastSyncedAt,
      hasUnsyncedEdits: unsyncedEdits,
    });
  }

  return results;
}

export async function readBoard(name: string): Promise<{ scene: ExcalidrawScene; meta: BoardMeta; mtime: string }> {
  const boardsDir = getConfig().boardsDir;
  const filePath = assertSafePath(boardsDir, name);
  const [raw, fileStat, meta] = await Promise.all([
    readFile(filePath, 'utf-8'),
    stat(filePath),
    readMeta(name),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scene: any;
  try {
    scene = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Board file is not valid JSON'), { statusCode: 422 });
  }

  if (scene?.type !== 'excalidraw') {
    throw Object.assign(new Error('File does not appear to be an Excalidraw scene'), { statusCode: 422 });
  }

  // nacl-render historically wrote one-way arrow bindings (forward only).
  // Add the missing reverse `boundElements` entries on the fly so the canvas
  // treats arrows as attached. The on-disk file stays untouched until the
  // user saves; first save persists the repaired bindings via writeBoard.
  const repaired = repairArrowBindings(scene as ExcalidrawScene & Record<string, unknown>);

  return {
    scene: repaired as ExcalidrawScene,
    meta,
    mtime: fileStat.mtime.toISOString(),
  };
}

export async function writeBoard(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scene: any,
): Promise<{ mtime: string; hasUnsyncedEdits: boolean }> {
  const boardsDir = getConfig().boardsDir;
  const filePath = assertSafePath(boardsDir, name);
  const tmp = `${filePath}.tmp`;

  await writeFile(tmp, JSON.stringify(scene, null, 2), 'utf-8');
  await rename(tmp, filePath);

  // Mark this board as a recent self-write so the fs-watcher event triggered
  // by this rename doesn't bounce back as a tree.changed broadcast and start
  // a re-render → onChange → PUT loop in the canvas.
  markSelfWrite(name);

  const fileStat = await stat(filePath);
  const mtime = fileStat.mtime.toISOString();

  // Recompute hash to check against last sync — do NOT update contentHashAtLastSync here
  const meta = await readMeta(name);
  let unsyncedEdits = false;
  if (meta.contentHashAtLastSync !== null) {
    const currentHash = computeBoardHash(scene);
    unsyncedEdits = currentHash !== meta.contentHashAtLastSync;
  }

  // Update meta mtime lazily (just lastGeneratedAt if not set yet — skip to keep it minimal)
  // We do NOT touch contentHashAtLastSync here per spec
  await writeMeta(name, {});

  return { mtime, hasUnsyncedEdits: unsyncedEdits };
}

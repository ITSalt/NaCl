import { readFile, writeFile, rename, stat, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { getConfig } from '../config.js';
import { classifyBoard, type BoardKind } from './board-classifier.js';
import { readMeta, writeMeta, computeBoardHash, type BoardMeta } from './meta.js';
import { repairArrowBindings } from './excalidraw-bindings.js';
import { getDriverAsync } from './neo4j.js';

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
  label: string | null;
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

async function resolveLabels(items: BoardListItem[]): Promise<Map<string, string | null>> {
  const ucIds = items
    .filter((b) => b.kind === 'activity' && b.relatedId !== null)
    .map((b) => b.relatedId as string);
  const bpIds = items
    .filter((b) => b.kind === 'process' && b.relatedId !== null)
    .map((b) => b.relatedId as string);

  const labels = new Map<string, string | null>();
  if (ucIds.length === 0 && bpIds.length === 0) return labels;

  try {
    const driver = await getDriverAsync(getConfig().repoRoot);
    const session = driver.session();
    try {
      if (ucIds.length > 0) {
        const r = await session.run(
          'UNWIND $ucIds AS ucId MATCH (uc:UseCase {id: ucId}) RETURN uc.id AS id, uc.name AS name',
          { ucIds },
        );
        for (const rec of r.records) {
          labels.set(rec.get('id') as string, (rec.get('name') as string) ?? null);
        }
      }
      if (bpIds.length > 0) {
        const r = await session.run(
          'UNWIND $bpIds AS bpId MATCH (bp:BusinessProcess {id: bpId}) RETURN bp.id AS id, bp.name AS name',
          { bpIds },
        );
        for (const rec of r.records) {
          labels.set(rec.get('id') as string, (rec.get('name') as string) ?? null);
        }
      }
    } finally {
      await session.close();
    }
  } catch {
    // Neo4j unreachable — labels stay empty; caller will default to null.
  }
  return labels;
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
      label: null,
    });
  }

  const labels = await resolveLabels(results);
  for (const item of results) {
    item.label = item.relatedId !== null ? (labels.get(item.relatedId) ?? null) : null;
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

// ---------------------------------------------------------------------------
// Pending-origin map — carries originId from writeBoard to fs-watcher handler.
// The fs-watcher fires within milliseconds; the 5 s TTL is a safety net only.
// ---------------------------------------------------------------------------

type PendingEntry = { originId: string | null; expiresAt: number };
const pendingOrigins = new Map<string, PendingEntry>();

/**
 * Record the originId for the next fs-watcher event on this board.
 * Called by writeBoard; consumed (and cleared) by consumePendingOrigin.
 */
export function setPendingOrigin(name: string, originId: string | null): void {
  pendingOrigins.set(name, { originId, expiresAt: Date.now() + 5000 });
}

/**
 * Read and clear the pending originId for a board.
 * Returns null if no entry exists or if the entry has expired.
 */
export function consumePendingOrigin(name: string): string | null {
  const entry = pendingOrigins.get(name);
  pendingOrigins.delete(name);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.originId;
}

export async function writeBoard(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scene: any,
  opts: { originId?: string } = {},
): Promise<{ mtime: string; hasUnsyncedEdits: boolean }> {
  const boardsDir = getConfig().boardsDir;
  const filePath = assertSafePath(boardsDir, name);

  const tmp = `${filePath}.tmp`;

  // Store originId BEFORE the write so the fs-watcher can read it.
  // The write is synchronous-ish (writeFile+rename) and the watcher fires
  // after rename completes — by then setPendingOrigin has already been called.
  setPendingOrigin(name, opts.originId ?? null);

  await writeFile(tmp, JSON.stringify(scene, null, 2), 'utf-8');
  await rename(tmp, filePath);

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

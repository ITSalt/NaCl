import { readFile, writeFile, rename, stat, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from '../config.js';
import { writeBoard, type ExcalidrawScene } from './boards.js';

const BOARD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** Allow only safe characters: digits, letters, dashes, underscores, dots. */
const TIMESTAMP_RE = /^[A-Za-z0-9._-]+$/;

export type SnapshotEntry = {
  board: string;
  timestamp: string;
  createdAt: string;
  path: string;
  size: number;
};

function snapshotsDir(): string {
  return join(config.boardsDir, '.snapshots');
}

function assertSafeBoard(board: string): void {
  if (!BOARD_NAME_RE.test(board)) {
    throw Object.assign(new Error(`Invalid board name: ${board}`), { statusCode: 400 });
  }
}

function assertSafeTimestamp(ts: string): void {
  if (!TIMESTAMP_RE.test(ts)) {
    throw Object.assign(new Error(`Invalid snapshot timestamp: ${ts}`), { statusCode: 400 });
  }
}

function snapshotPath(board: string, timestamp: string): string {
  const dir = snapshotsDir();
  const resolved = resolve(dir, `${board}-${timestamp}.json`);
  if (!resolved.startsWith(resolve(dir) + '/') && resolved !== resolve(dir)) {
    throw Object.assign(new Error('Path traversal detected'), { statusCode: 400 });
  }
  return resolved;
}

/** Parse a snapshot filename like "<board>-<timestamp>.json" → { board, timestamp } */
export function parseSnapshotFilename(filename: string): { board: string; timestamp: string } | null {
  if (!filename.endsWith('.json')) return null;
  const stem = filename.slice(0, -5); // strip .json
  // Find the last occurrence of "-" that separates a valid timestamp
  // Timestamps start with 8 digits (YYYYMMDD) — try splitting at that pattern
  const match = stem.match(/^(.+?)-(\d{8}T\d{6}Z.*)$/);
  if (match) {
    const board = match[1];
    const timestamp = match[2];
    if (BOARD_NAME_RE.test(board) && TIMESTAMP_RE.test(timestamp)) {
      return { board, timestamp };
    }
  }
  return null;
}

export async function listSnapshots(board: string): Promise<SnapshotEntry[]> {
  assertSafeBoard(board);
  const dir = snapshotsDir();

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return []; // .snapshots dir doesn't exist yet
  }

  const prefix = `${board}-`;
  const entries: SnapshotEntry[] = [];

  for (const file of files) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
    const timestamp = file.slice(prefix.length, -5); // remove prefix and .json
    if (!TIMESTAMP_RE.test(timestamp)) continue;

    const filePath = join(dir, file);
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      continue;
    }

    entries.push({
      board,
      timestamp,
      createdAt: fileStat.birthtime.toISOString(),
      path: filePath,
      size: fileStat.size,
    });
  }

  // Sort newest first (timestamp string is ISO-like, lexicographic sort works)
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return entries;
}

export async function readSnapshot(board: string, timestamp: string): Promise<ExcalidrawScene> {
  assertSafeBoard(board);
  assertSafeTimestamp(timestamp);

  const filePath = snapshotPath(board, timestamp);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    throw Object.assign(new Error(`Snapshot not found: ${board}-${timestamp}`), { statusCode: 404 });
  }

  try {
    return JSON.parse(raw) as ExcalidrawScene;
  } catch {
    throw Object.assign(new Error('Snapshot file is not valid JSON'), { statusCode: 422 });
  }
}

export async function writeSnapshot(board: string, timestamp: string, scene: ExcalidrawScene): Promise<string> {
  assertSafeBoard(board);
  assertSafeTimestamp(timestamp);

  const dir = snapshotsDir();
  await mkdir(dir, { recursive: true });

  const filePath = snapshotPath(board, timestamp);
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(scene, null, 2), 'utf-8');
  await rename(tmp, filePath);
  return timestamp;
}

export async function restoreSnapshot(
  board: string,
  timestamp: string,
): Promise<{ mtime: string; safetyTimestamp: string }> {
  assertSafeBoard(board);
  assertSafeTimestamp(timestamp);

  const scene = await readSnapshot(board, timestamp);

  // Read current live scene for safety snapshot
  const boardPath = resolve(config.boardsDir, `${board}.excalidraw`);
  let currentScene: ExcalidrawScene | null = null;
  try {
    const raw = await readFile(boardPath, 'utf-8');
    currentScene = JSON.parse(raw) as ExcalidrawScene;
  } catch {
    // If we can't read current, skip safety snapshot
  }

  // Write safety snapshot of current state
  const safetyTimestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', 'Z');
  if (currentScene !== null) {
    await writeSnapshot(board, safetyTimestamp, currentScene);
  }

  // Overwrite live board with snapshot scene
  const result = await writeBoard(board, scene);

  return { mtime: result.mtime, safetyTimestamp };
}

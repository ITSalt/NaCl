#!/usr/bin/env tsx
/**
 * One-shot migration: backfill .meta.json sidecars for existing .excalidraw boards.
 * Idempotent — skips boards that already have a sidecar.
 */

import { readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'graph-infra'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

const boardsDir = process.env['NACL_BOARDS_DIR'] ?? join(findRepoRoot(__dirname), 'graph-infra', 'boards');

console.log(`Boards directory: ${boardsDir}`);

const entries = await readdir(boardsDir, { withFileTypes: true });

let created = 0;
let skipped = 0;

for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith('.excalidraw')) continue;
  if (entry.name.startsWith('.')) continue;

  const boardName = basename(entry.name, '.excalidraw');
  const metaPath = join(boardsDir, `${boardName}.meta.json`);

  if (existsSync(metaPath)) {
    skipped++;
    continue;
  }

  const filePath = join(boardsDir, entry.name);
  const fileStat = await stat(filePath);
  const lastGeneratedAt = fileStat.mtime.toISOString();

  const meta = {
    lastGeneratedAt,
    lastGeneratedBy: 'migration',
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncRunId: null,
    contentHashAtLastSync: null,
  };

  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`  created: ${boardName}.meta.json`);
  created++;
}

console.log(`\nDone. Created: ${created}, Skipped (already had meta): ${skipped}`);

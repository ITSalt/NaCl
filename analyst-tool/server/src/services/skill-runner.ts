/**
 * skill-runner — the only place that builds skill prompts and invokes pinch.
 *
 * Owns the skill whitelist and argument validation. Never passes raw user input
 * to claude; all prompts are assembled from whitelisted templates.
 *
 * Wave 0: 'regenerate' runs locally via renderBoard() — no Pinch / claude -p.
 * 'sync' and 'analyze' still go through Pinch unchanged.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TaskResult } from 'itsalt-pinch';
import { classifyBoard } from './board-classifier.js';
import { computeBoardHash, writeMeta } from './meta.js';
import { getPacer, setPendingMeta } from './pinch.js';
import { getConfig } from '../config.js';
import { broadcast } from '../ws/events.js';
import { renderBoard } from '../render/index.js';
import { writeBoard } from './boards.js';
import { getDriverAsync } from './neo4j.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillKind = 'regenerate' | 'sync' | 'analyze';

export interface SkillRequest {
  kind: SkillKind;
  board: string; // board name without extension
}

export interface RunSummary {
  runId: string;
  kind: SkillKind;
  board: string;
  exitCode: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
}

export interface SkillRunHandle {
  runId: string;
  promise: Promise<RunSummary>;
}

// Pacer interface exposed for testing — production uses the real singleton.
export interface PacerLike {
  run(task: { prompt: string; projectId?: string; cwd?: string }): Promise<TaskResult>;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Board names that come from user input. Allows alphanum, dash, underscore. */
const BOARD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function assertBoardName(boardName: string): void {
  if (!BOARD_NAME_RE.test(boardName)) {
    throw Object.assign(
      new Error(`Invalid board name: "${boardName}"`),
      { statusCode: 400, code: 'invalid_board_name' },
    );
  }
}

function boardFilePath(boardName: string): string {
  const boardsDir = resolve(getConfig().boardsDir);
  const filePath  = resolve(boardsDir, `${boardName}.excalidraw`);
  // Path-traversal guard
  if (!filePath.startsWith(boardsDir + '/') && filePath !== boardsDir) {
    throw Object.assign(
      new Error('Path traversal detected'),
      { statusCode: 400, code: 'path_traversal' },
    );
  }
  return filePath;
}

function assertBoardExists(filePath: string, boardName: string): void {
  if (!existsSync(filePath)) {
    throw Object.assign(
      new Error(`Board not found: "${boardName}"`),
      { statusCode: 400, code: 'board_not_found' },
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt builders — whitelist of allowed skill invocations
// ---------------------------------------------------------------------------

function buildPrompt(req: SkillRequest, filePath: string): string {
  const { kind } = req;

  if (kind === 'sync') {
    return `/nacl-ba-sync ${filePath}`;
  }

  if (kind === 'analyze') {
    return `/nacl-ba-analyze ${filePath}`;
  }

  // 'regenerate' is handled locally (Wave 0) — buildPrompt is never called for it.
  throw Object.assign(
    new Error(`buildPrompt: unexpected kind "${kind}"`),
    { statusCode: 500, code: 'internal_error' },
  );
}

// ---------------------------------------------------------------------------
// Optimistic meta updates after a successful run
// TODO Wave 2b: this becomes a fallback once the skills themselves write meta
// ---------------------------------------------------------------------------

async function applyOptimisticMeta(
  kind: SkillKind,
  board: string,
  filePath: string,
  runId: string,
): Promise<void> {
  const now = new Date().toISOString();

  if (kind === 'regenerate') {
    // regenerate makes the file the source of truth from the graph
    try {
      const raw = await readFile(filePath, 'utf-8');
      const scene = JSON.parse(raw) as unknown;
      const hash = computeBoardHash(scene);
      await writeMeta(board, {
        lastGeneratedAt: now,
        lastGeneratedBy: 'analyst-tool-render',
        contentHashAtLastSync: hash,
      });
    } catch {
      // If we can't read the file post-run, skip hash update but still set time
      await writeMeta(board, {
        lastGeneratedAt: now,
        lastGeneratedBy: 'analyst-tool-render',
      });
    }
    return;
  }

  if (kind === 'sync') {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const scene = JSON.parse(raw) as unknown;
      const hash = computeBoardHash(scene);
      await writeMeta(board, {
        lastSyncedAt: now,
        lastSyncStatus: 'ok',
        lastSyncRunId: runId,
        contentHashAtLastSync: hash,
      });
    } catch {
      await writeMeta(board, {
        lastSyncedAt: now,
        lastSyncStatus: 'ok',
        lastSyncRunId: runId,
      });
    }
    return;
  }

  // analyze — leave meta untouched per spec
}

async function applyFailureMeta(kind: SkillKind, board: string): Promise<void> {
  if (kind === 'sync') {
    // TODO Wave 2b: this becomes a fallback once the skills themselves write meta
    await writeMeta(board, { lastSyncStatus: 'failed' });
  }
}

// ---------------------------------------------------------------------------
// Run ID generation
// ---------------------------------------------------------------------------

function genRunId(): string {
  return 'r-' + randomBytes(4).toString('hex');
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

/**
 * Run a skill against a board.
 *
 * @param req   The skill + board request.
 * @param pacer Optional Pacer-like for testing; defaults to the singleton.
 */
export function run(req: SkillRequest, pacer?: PacerLike): SkillRunHandle {
  const { kind, board } = req;

  // Validate board name and path
  assertBoardName(board);
  const filePath = boardFilePath(board);

  // sync/analyze require an existing file (nothing to read otherwise);
  // regenerate may target a board that does not exist yet — the skill creates it.
  if (kind !== 'regenerate') {
    assertBoardExists(filePath, board);
  }

  // For regenerate, classify and reject unsupported kinds synchronously so
  // callers see a 400 without the run-promise machinery starting up.
  let classification: ReturnType<typeof classifyBoard> | null = null;
  if (kind === 'regenerate') {
    classification = classifyBoard(board);
    if (classification.kind === 'import') {
      throw Object.assign(
        new Error('Import boards cannot be regenerated — use sync instead'),
        { statusCode: 400, code: 'cannot_regenerate_import' },
      );
    }
    if (classification.kind === 'other') {
      throw Object.assign(
        new Error(`Board kind "${classification.kind}" does not support regenerate`),
        { statusCode: 400, code: 'unsupported_board_kind' },
      );
    }
  }

  const runId = genRunId();
  const startedAt = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // Wave 0: 'regenerate' runs locally — no Pinch / claude -p.
  // ---------------------------------------------------------------------------
  if (kind === 'regenerate') {
    const cls = classification!;
    const promise = (async (): Promise<RunSummary> => {
      // Broadcast run.started synchronously before the async work so RunPanel
      // shows progress immediately (matches the old Pacer-based event sequence).
      broadcast('runs', { type: 'run.started', runId, kind, board, startedAt });
      broadcast(`run:${runId}`, { type: 'run.started', runId, kind, board, startedAt });

      try {

        const currentConfig = getConfig();
        const driver = await getDriverAsync(currentConfig.repoRoot);

        const scene = await renderBoard(
          cls.kind,
          cls.relatedId,
          driver,
        );

        // writeBoard handles self-write coordination so fs-watcher doesn't echo
        await writeBoard(board, scene);

        // applyOptimisticMeta reads the file back and writes the meta sidecar
        await applyOptimisticMeta(kind, board, filePath, runId);

        const finishedAt = new Date().toISOString();
        const summary: RunSummary = {
          runId,
          kind,
          board,
          exitCode: 0,
          durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
          startedAt,
          finishedAt,
        };

        broadcast('runs', { type: 'run.completed', ...summary });
        broadcast(`run:${runId}`, { type: 'run.completed', ...summary });
        return summary;
      } catch (err) {
        const finishedAt = new Date().toISOString();
        const message = err instanceof Error ? err.message : String(err);

        await applyFailureMeta(kind, board).catch(() => undefined);

        const failedPayload = {
          type: 'run.failed',
          runId,
          kind,
          board,
          error: message,
          startedAt,
          finishedAt,
        };
        broadcast('runs', failedPayload);
        broadcast(`run:${runId}`, failedPayload);
        throw err;
      }
    })();

    return { runId, promise };
  }

  // ---------------------------------------------------------------------------
  // 'sync' and 'analyze' — still go through Pinch unchanged.
  // ---------------------------------------------------------------------------

  // Build prompt (may throw 400 for invalid combinations)
  const prompt = buildPrompt(req, filePath);

  const activePacer: PacerLike = pacer ?? getPacer();

  const promise = (async (): Promise<RunSummary> => {
    let result: TaskResult | null = null;
    try {
      // Register mapping before calling run so onEnqueued hook can claim it.
      // This must execute synchronously before pacer.run() enqueues internally.
      if (!pacer) {
        // Only use the pending-run-id mechanism for the real Pacer singleton;
        // test fakes don't use hooks.
        setPendingMeta({ runId, kind, board });
      }

      const currentConfig = getConfig();
      result = await activePacer.run({
        prompt,
        projectId: currentConfig.projectId,
        cwd: currentConfig.repoRoot,
      });

      const finishedAt = new Date().toISOString();
      const summary: RunSummary = {
        runId,
        kind,
        board,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        startedAt,
        finishedAt,
      };

      if (result.exitCode === 0) {
        await applyOptimisticMeta(kind, board, filePath, runId);
        broadcast('runs', { type: 'run.completed', ...summary });
        broadcast(`run:${runId}`, { type: 'run.completed', ...summary });
      } else {
        await applyFailureMeta(kind, board);
        const failedSummary: RunSummary = {
          ...summary,
          exitCode: result.exitCode,
        };
        const error = `skill exited with code ${result.exitCode}`;
        broadcast('runs', { type: 'run.failed', ...failedSummary, error });
        broadcast(`run:${runId}`, { type: 'run.failed', ...failedSummary, error });
        return failedSummary;
      }

      return summary;
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : String(err);

      await applyFailureMeta(kind, board).catch(() => undefined);

      const failedPayload = {
        type: 'run.failed',
        runId,
        kind,
        board,
        error: message,
        startedAt,
        finishedAt,
      };
      broadcast('runs', failedPayload);
      broadcast(`run:${runId}`, failedPayload);

      throw err;
    }
  })();

  return { runId, promise };
}

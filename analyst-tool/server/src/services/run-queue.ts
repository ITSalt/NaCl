/**
 * run-queue — thin in-memory queue on top of pinch.
 *
 * Prevents two concurrent runs of the same SkillKind. Pinch enforces
 * global/per-project concurrency caps; this layer adds a UI-friendliness
 * guard so two "regenerate" calls don't race to write meta over each other.
 *
 * Also maintains a ring-buffer of recent runs for the /api/v1/runs endpoints.
 *
 * Wave 4: adds enqueueBatch() for sequential multi-board operations.
 */
import { randomBytes } from 'node:crypto';
import { run as skillRun } from './skill-runner.js';
import type { SkillKind, SkillRequest, SkillRunHandle, RunSummary } from './skill-runner.js';
import type { PacerLike } from './skill-runner.js';
import { broadcast } from '../ws/events.js';

export type RunPhase = 'queued' | 'running' | 'blocked' | 'completed' | 'failed';

export interface RunStatus {
  runId: string;
  kind: SkillKind;
  board: string;
  phase: RunPhase;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  blockedReason?: string;
  msUntilRetry?: number;
}

const RING_BUFFER_SIZE = 200;

/** All recorded runs (active + recent), newest last. */
const ringBuffer: RunStatus[] = [];

/** Currently active runs by kind. A "kind" can only have one active run. */
const activeByKind = new Map<SkillKind, string>(); // kind → runId

function addToRing(status: RunStatus): void {
  ringBuffer.push(status);
  if (ringBuffer.length > RING_BUFFER_SIZE) {
    ringBuffer.shift();
  }
}

function updateRing(runId: string, patch: Partial<RunStatus>): void {
  const idx = ringBuffer.findLastIndex((s) => s.runId === runId);
  if (idx !== -1) {
    ringBuffer[idx] = { ...ringBuffer[idx], ...patch };
  }
}

export interface QueueBusyError extends Error {
  code: 'busy';
  statusCode: 409;
  activeRunId: string;
}

function busyError(kind: SkillKind, activeRunId: string): QueueBusyError {
  const err = Object.assign(
    new Error(`A "${kind}" run is already active (runId: ${activeRunId})`),
    {
      code: 'busy' as const,
      statusCode: 409 as const,
      activeRunId,
    },
  );
  return err;
}

/**
 * Enqueue a skill run.
 *
 * Throws a QueueBusyError (409) if a run of the same kind is already active.
 *
 * @param req    The skill + board request.
 * @param pacer  Optional Pacer-like for testing.
 */
export function enqueue(req: SkillRequest, pacer?: PacerLike): SkillRunHandle {
  const { kind, board } = req;

  const existingRunId = activeByKind.get(kind);
  if (existingRunId !== undefined) {
    throw busyError(kind, existingRunId);
  }

  // Delegate validation + prompt build + pinch invocation to skill-runner
  const handle = skillRun(req, pacer);
  const { runId } = handle;

  const initialStatus: RunStatus = {
    runId,
    kind,
    board,
    phase: 'queued',
    startedAt: new Date().toISOString(),
  };
  addToRing(initialStatus);
  activeByKind.set(kind, runId);

  // Wrap promise to update ring + clear active slot on completion
  const wrappedPromise = handle.promise.then(
    (summary: RunSummary) => {
      activeByKind.delete(kind);
      updateRing(runId, {
        phase: 'completed',
        exitCode: summary.exitCode,
        finishedAt: summary.finishedAt,
      });
      return summary;
    },
    (err: unknown) => {
      activeByKind.delete(kind);
      updateRing(runId, { phase: 'failed', finishedAt: new Date().toISOString() });
      throw err;
    },
  );

  return { runId, promise: wrappedPromise };
}

export function listActive(): RunStatus[] {
  return [...activeByKind.values()]
    .map((id) => ringBuffer.findLast((s) => s.runId === id))
    .filter((s): s is RunStatus => s !== undefined);
}

export function listRecent(limit = 50): RunStatus[] {
  const cap = Math.min(limit, RING_BUFFER_SIZE);
  return ringBuffer.slice(-cap).reverse();
}

export function getByRunId(runId: string): RunStatus | undefined {
  return ringBuffer.findLast((s) => s.runId === runId);
}

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

export interface BatchStatus {
  batchId: string;
  kind: SkillKind;
  total: number;
  completed: number;
  failed: number;
  currentRunId: string | null;
  status: 'running' | 'done' | 'aborted';
  runIds: string[];
}

const batches = new Map<string, BatchStatus>();

function genBatchId(): string {
  return 'b-' + randomBytes(4).toString('hex');
}

function broadcastBatch(status: BatchStatus): void {
  const payload = { type: 'batch.progress', ...status };
  broadcast(`batch:${status.batchId}`, payload);
  broadcast('batches', payload);
}

/**
 * Enqueue a batch of skill requests, running them sequentially per kind.
 *
 * Run N+1 does not start until run N has reached completed or failed.
 * Progress is broadcast on `batch:<batchId>` and `batches` WS channels.
 *
 * @param reqs  List of skill requests to execute in order.
 * @param pacer Optional Pacer-like for testing.
 */
export function enqueueBatch(
  reqs: SkillRequest[],
  pacer?: PacerLike,
): { batchId: string; runIds: string[] } {
  const batchId = genBatchId();

  // Pre-allocate run IDs (will be set by enqueue() calls below)
  const runIds: string[] = [];

  const status: BatchStatus = {
    batchId,
    kind: reqs[0]?.kind ?? 'sync',
    total: reqs.length,
    completed: 0,
    failed: 0,
    currentRunId: null,
    status: 'running',
    runIds,
  };
  batches.set(batchId, status);
  broadcastBatch(status);

  // Drive sequential execution asynchronously. Wrap the whole loop in a
  // catch so an unexpected error (e.g. a broadcast helper throwing) cannot
  // silently abandon the batch in 'running' state.
  void (async () => {
    try {
      for (const req of reqs) {
        try {
          const handle = enqueue(req, pacer);
          runIds.push(handle.runId);
          status.currentRunId = handle.runId;
          try { broadcastBatch(status); } catch { /* never let WS noise abort the batch */ }

          const summary = await handle.promise;
          if (summary.exitCode === 0) {
            status.completed++;
          } else {
            status.failed++;
          }
        } catch (err) {
          // enqueue() may throw busy (409) or validation errors — treat as failed.
          // handle.promise may also reject — same treatment.
          status.failed++;
          // Surface the cause so a batch that fails immediately is debuggable.
          // eslint-disable-next-line no-console
          console.error(`[batch ${batchId}] iteration failed:`, err);
        }
        try { broadcastBatch(status); } catch { /* see above */ }
      }
    } catch (outerErr) {
      // Defensive: any uncaught error here would otherwise leave the batch
      // stuck in 'running' forever and block the next batch start.
      // eslint-disable-next-line no-console
      console.error(`[batch ${batchId}] loop aborted unexpectedly:`, outerErr);
    } finally {
      status.status = 'done';
      status.currentRunId = null;
      try { broadcastBatch(status); } catch { /* swallow */ }
    }
  })();

  return { batchId, runIds };
}

export function getBatch(batchId: string): BatchStatus | undefined {
  return batches.get(batchId);
}

export function listBatches(): BatchStatus[] {
  return [...batches.values()];
}

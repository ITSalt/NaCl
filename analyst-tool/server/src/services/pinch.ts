/**
 * Singleton Pacer instance for spawning `claude -p` via itsalt-pinch.
 *
 * One Pacer per server process — critical to honour pinch's global concurrency
 * invariants. Do not construct additional Pacer instances anywhere in the app.
 */
import { Pacer } from 'itsalt-pinch';
import type {
  EnqueuedEvent,
  StartedEvent,
  FinishedEvent,
  BlockedEvent,
  PacerOptions,
} from 'itsalt-pinch';
import { broadcast } from '../ws/events.js';

// ---------------------------------------------------------------------------
// taskId ↔ run-meta registry
//
// pinch auto-generates taskId. The skill-runner registers a pending slot with
// a fresh runId right before calling pacer.run(). The onEnqueued hook fires
// synchronously-enough (before the first await in run()) to claim the slot.
// We also track kind+board so WS subscribers can render queued/running rows
// without waiting for the run.completed event.
// ---------------------------------------------------------------------------
interface RunMeta {
  runId: string;
  kind: string;
  board: string;
}

let pendingMeta: RunMeta | null = null;
const taskToMeta = new Map<string, RunMeta>();

/**
 * Call immediately before pacer.run() to associate the next enqueued task
 * with caller-supplied run metadata.
 */
export function setPendingMeta(meta: RunMeta): void {
  pendingMeta = meta;
}

/** Back-compat shim — only the runId, leaves kind/board empty strings. */
export function setPendingRunId(runId: string): void {
  pendingMeta = { runId, kind: '', board: '' };
}

function claimPendingMeta(taskId: string): RunMeta {
  if (pendingMeta !== null) {
    taskToMeta.set(taskId, pendingMeta);
    const m = pendingMeta;
    pendingMeta = null;
    return m;
  }
  return { runId: taskId, kind: '', board: '' };
}

function metaFor(taskId: string): RunMeta {
  return taskToMeta.get(taskId) ?? { runId: taskId, kind: '', board: '' };
}

function unregisterTask(taskId: string): void {
  taskToMeta.delete(taskId);
}

/** Expose Pacer stats for the diagnostics endpoint. */
export function getPacerStats(): ReturnType<Pacer['stats']> | null {
  return instance ? instance.stats() : null;
}

// ---------------------------------------------------------------------------
// Working-window — env-driven; no hardcoded personal values
// Default timezone is Europe/Moscow (a widely-used default), override via env.
// ---------------------------------------------------------------------------
const windowStart = process.env['NACL_WORKING_WINDOW_START'] ?? '08:00';
const windowEnd   = process.env['NACL_WORKING_WINDOW_END']   ?? '23:00';
const windowTz    = process.env['NACL_WORKING_WINDOW_TZ']    ?? 'Europe/Moscow'; // default — override via env

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance: Pacer | null = null;

export function getPacer(): Pacer {
  if (instance) return instance;

  const options: PacerOptions = {
    workingWindow: { start: windowStart, end: windowEnd, tz: windowTz },
    runner: {
      // --print keeps claude non-interactive.
      // --output-format=stream-json produces structured output if the caller
      // later reads result.stdout; pinch captures but does not stream it.
      // --permission-mode=bypassPermissions: in -p (headless) mode there is no
      // interactive prompt to approve Write/Edit/Bash, so without this flag the
      // skill silently no-ops on every file operation and exits 0 — runs look
      // green but nothing is created. Safe here because the tool only fires
      // whitelisted skill prompts on 127.0.0.1.
      args: [
        '--print',
        '--output-format=stream-json',
        '--verbose',
        '--permission-mode=bypassPermissions',
      ],
    },
    hooks: {
      onEnqueued(e: EnqueuedEvent) {
        const meta = claimPendingMeta(e.taskId);
        const payload = {
          type: 'run.enqueued',
          runId: meta.runId,
          kind: meta.kind,
          board: meta.board,
          taskId: e.taskId,
          phase: 'queued',
          queueDepth: e.queueDepth,
        };
        broadcast('runs', payload);
        broadcast(`run:${meta.runId}`, payload);
      },
      onStarted(e: StartedEvent) {
        const meta = metaFor(e.taskId);
        const payload = {
          type: 'run.started',
          runId: meta.runId,
          kind: meta.kind,
          board: meta.board,
          taskId: e.taskId,
          phase: 'running',
          waitedMs: e.waitedMs,
        };
        broadcast('runs', payload);
        broadcast(`run:${meta.runId}`, payload);
      },
      onBlocked(e: BlockedEvent) {
        // Blocked events lack a specific taskId — broadcast to the generic channel.
        // The RunPanel shows the latest blocked event with its reason + countdown.
        const payload = {
          type: 'run.blocked',
          phase: 'blocked',
          reason: e.reason,
          msUntilRetry: e.msUntilRetry ?? null,
          detail: e.detail ?? null,
        };
        broadcast('runs', payload);
      },
      onFinished(e: FinishedEvent) {
        const meta = metaFor(e.taskId);
        const payload = {
          type: 'run.finished',
          runId: meta.runId,
          kind: meta.kind,
          board: meta.board,
          taskId: e.taskId,
          phase: 'finished',
          exitCode: e.exitCode,
          durationMs: e.durationMs,
        };
        broadcast('runs', payload);
        broadcast(`run:${meta.runId}`, payload);
        unregisterTask(e.taskId);
      },
    },
  };

  instance = new Pacer(options);
  return instance;
}

export async function shutdown(): Promise<void> {
  if (!instance) return;
  await instance.drain();
  await instance.shutdown();
  instance = null;
}

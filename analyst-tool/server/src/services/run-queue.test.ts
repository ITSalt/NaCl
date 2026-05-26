/**
 * run-queue tests — validates concurrency guard (one active run per kind).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskResult } from 'itsalt-pinch';
import type { PacerLike } from './skill-runner.js';

let boardsDir: string;

const FAKE_SCENE = JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} });

async function createBoard(name: string): Promise<void> {
  await writeFile(join(boardsDir, `${name}.excalidraw`), FAKE_SCENE, 'utf-8');
}

function fakeResult(exitCode = 0): TaskResult {
  const now = Date.now();
  return {
    taskId: 'fake-task-id',
    projectId: 'test-project',
    exitCode,
    stdout: '',
    stderr: '',
    durationMs: 50,
    waitedMs: 0,
    startedAt: now,
    finishedAt: now + 50,
  };
}

/**
 * A controllable fake pacer: call `resolve()` to make the current run finish.
 */
function makeControllablePacer(exitCode = 0): {
  pacer: PacerLike;
  resolve: () => void;
  callCount: number;
} {
  let _resolve: (() => void) | null = null;
  let callCount = 0;

  const pacer: PacerLike = {
    run(_task) {
      callCount++;
      return new Promise<TaskResult>((res) => {
        _resolve = () => res(fakeResult(exitCode));
      });
    },
  };

  // Expose through a wrapper so the outer scope can close over it
  const wrapper = {
    pacer,
    get callCount() { return callCount; },
    resolve() {
      if (_resolve) {
        _resolve();
        _resolve = null;
      }
    },
  };
  return wrapper;
}

before(async () => {
  boardsDir = join(tmpdir(), `nacl-run-queue-test-${process.pid}`);
  await mkdir(boardsDir, { recursive: true });
  process.env['NACL_BOARDS_DIR'] = boardsDir;
  await createBoard('domain-model');
  await createBoard('context-map');
});

after(async () => {
  await rm(boardsDir, { recursive: true, force: true });
  delete process.env['NACL_BOARDS_DIR'];
});

// run-queue maintains module-level state; we need a fresh import per describe block.
// node:test doesn't support module re-instantiation, so we use a module that
// can be tested via its exported interface. We reset by using distinct boards.

describe('run-queue concurrency guard', () => {
  it('allows a run when no run of that kind is active', async () => {
    const { enqueue } = await import('./run-queue.js');
    const ctrl = makeControllablePacer();

    // Use a pacer-backed kind ('sync'/'analyze'). 'regenerate' runs locally
    // (Wave 0) and bypasses the injected pacer, opening a real Neo4j driver via
    // getDriverAsync() that is never closed — so ctrl.resolve() is a no-op AND
    // the leaked handle keeps the test process from ever exiting.
    const handle = enqueue({ kind: 'analyze', board: 'domain-model' }, ctrl.pacer);
    assert.match(handle.runId, /^r-[0-9a-f]{8}$/);

    // Let it finish so we don't pollute the active set for later tests
    ctrl.resolve();
    await handle.promise;
  });

  it('second simultaneous run of same kind throws busy (409) without calling pacer', async () => {
    const { enqueue } = await import('./run-queue.js');
    const ctrl = makeControllablePacer();

    // Start first run — keeps pacer running (unresolved promise)
    const first = enqueue({ kind: 'sync', board: 'domain-model' }, ctrl.pacer);

    // Second run of same kind must throw immediately
    type BusyErr = Error & { statusCode?: number; code?: string; activeRunId?: string };
    let caughtErr: BusyErr | null = null;
    try {
      enqueue({ kind: 'sync', board: 'context-map' }, ctrl.pacer);
    } catch (e) {
      caughtErr = e as BusyErr;
    }

    assert.ok(caughtErr, 'expected an error to be thrown');
    assert.equal(caughtErr!.statusCode, 409);
    assert.equal(caughtErr!.code, 'busy');
    assert.equal(caughtErr!.activeRunId, first.runId);

    // pacer.run() was called only once (for the first enqueue)
    assert.equal(ctrl.callCount, 1);

    // Clean up
    ctrl.resolve();
    await first.promise;
  });

  it('after first run completes, a second run of same kind is allowed', async () => {
    const { enqueue } = await import('./run-queue.js');
    const ctrl = makeControllablePacer();

    // First run
    const first = enqueue({ kind: 'analyze', board: 'domain-model' }, ctrl.pacer);
    ctrl.resolve();
    await first.promise;

    // Second run — should succeed now
    const second = enqueue({ kind: 'analyze', board: 'domain-model' }, ctrl.pacer);
    ctrl.resolve();
    await second.promise;

    assert.equal(ctrl.callCount, 2);
  });

  it('different kinds can run concurrently', async () => {
    const { enqueue } = await import('./run-queue.js');
    const ctrl1 = makeControllablePacer();
    const ctrl2 = makeControllablePacer();

    // Two distinct pacer-backed kinds (see note above on avoiding 'regenerate').
    const h1 = enqueue({ kind: 'analyze', board: 'domain-model' }, ctrl1.pacer);
    const h2 = enqueue({ kind: 'sync', board: 'domain-model' }, ctrl2.pacer);

    // Both handles are valid (no throw)
    assert.match(h1.runId, /^r-[0-9a-f]{8}$/);
    assert.match(h2.runId, /^r-[0-9a-f]{8}$/);

    ctrl1.resolve();
    ctrl2.resolve();
    await Promise.all([h1.promise, h2.promise]);
  });
});

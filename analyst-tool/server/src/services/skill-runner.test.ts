/**
 * skill-runner tests — validates prompt construction, input validation,
 * and path-traversal guards.
 *
 * Uses a fake Pacer (injected via the optional second arg to `run()`) so no
 * actual `claude` binary is invoked.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskResult } from 'itsalt-pinch';
import type { PacerLike } from './skill-runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let boardsDir: string;

/** Minimal fake board content */
const FAKE_SCENE = JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} });

/** Create a fake board file in the temp boards directory */
async function createBoard(name: string): Promise<void> {
  await writeFile(join(boardsDir, `${name}.excalidraw`), FAKE_SCENE, 'utf-8');
}

/** Build a fake TaskResult for a given exit code */
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
 * Build a fake PacerLike that captures the prompt it was called with.
 */
function makeFakePacer(exitCode = 0): PacerLike & { lastPrompt: string | null } {
  return {
    lastPrompt: null,
    async run(task) {
      this.lastPrompt = task.prompt;
      return fakeResult(exitCode);
    },
  };
}

// ---------------------------------------------------------------------------
// Override NACL_BOARDS_DIR so skill-runner uses our temp directory
// ---------------------------------------------------------------------------

// We manipulate process.env before importing skill-runner so config picks it up.
// Since ESM caches modules, we import after setting the env.

async function importRunner() {
  // Dynamic import so it sees the env override we set in before()
  const mod = await import('./skill-runner.js');
  return mod;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

before(async () => {
  boardsDir = join(tmpdir(), `nacl-skill-runner-test-${process.pid}`);
  await mkdir(boardsDir, { recursive: true });

  // Override boards dir for this test process
  process.env['NACL_BOARDS_DIR'] = boardsDir;

  // Create representative boards
  await createBoard('domain-model');
  await createBoard('context-map');
  await createBoard('activity-UC-001');
  await createBoard('process-BP-001');
  await createBoard('test-board'); // import kind
});

after(async () => {
  // The 'regenerate' tests in Wave 0 init a real Neo4j driver via getDriverAsync();
  // without an explicit close, the driver's reconnect timers keep the test process alive.
  const { closeDriver } = await import('./neo4j.js');
  await closeDriver();
  await rm(boardsDir, { recursive: true, force: true });
  delete process.env['NACL_BOARDS_DIR'];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('skill-runner prompt construction', () => {
  // regenerate dispatches locally via renderBoard() and never reaches Pacer
  // (Wave 0 cutover). Renderer correctness lives in src/render/render.test.ts.

  it('sync builds /nacl-ba-sync <absPath>', async () => {
    const { run } = await importRunner();
    const pacer = makeFakePacer();
    const handle = run({ kind: 'sync', board: 'domain-model' }, pacer);
    await handle.promise;
    const expected = `/nacl-ba-sync ${join(boardsDir, 'domain-model.excalidraw')}`;
    assert.equal(pacer.lastPrompt, expected);
  });

  it('analyze builds /nacl-ba-analyze <absPath>', async () => {
    const { run } = await importRunner();
    const pacer = makeFakePacer();
    const handle = run({ kind: 'analyze', board: 'domain-model' }, pacer);
    await handle.promise;
    const expected = `/nacl-ba-analyze ${join(boardsDir, 'domain-model.excalidraw')}`;
    assert.equal(pacer.lastPrompt, expected);
  });
});

describe('skill-runner validation', () => {
  it('regenerate for an import board throws 400 cannot_regenerate_import', async () => {
    const { run } = await importRunner();
    const pacer = makeFakePacer();
    // run() throws synchronously on validation errors before returning a handle
    assert.throws(
      () => run({ kind: 'regenerate', board: 'test-board' }, pacer),
      (err: Error & { statusCode?: number; code?: string }) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'cannot_regenerate_import');
        return true;
      },
    );
    assert.equal(pacer.lastPrompt, null, 'pacer should not have been called');
  });

  it('invalid board name (path traversal) is rejected before reaching pacer', async () => {
    const { run } = await importRunner();
    const pacer = makeFakePacer();
    assert.throws(
      () => run({ kind: 'sync', board: '../../etc/passwd' }, pacer),
      (err: Error & { statusCode?: number }) => {
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
    assert.equal(pacer.lastPrompt, null, 'pacer should not have been called');
  });

  it('non-existent board name is rejected for sync (cannot read missing file)', async () => {
    const { run } = await importRunner();
    const pacer = makeFakePacer();
    assert.throws(
      () => run({ kind: 'sync', board: 'nonexistent-board' }, pacer),
      (err: Error & { statusCode?: number; code?: string }) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'board_not_found');
        return true;
      },
    );
    assert.equal(pacer.lastPrompt, null, 'pacer should not have been called');
  });

  it('regenerate accepts a not-yet-created board (no file-existence check)', async () => {
    // Graph-driven Regen All targets boards that may not exist on disk yet.
    // skill-runner must not throw during synchronous validation — it only fails
    // later, asynchronously, when the Neo4j driver is unreachable in this test
    // env (renderer end-to-end correctness lives in src/render/render.test.ts).
    const { run } = await importRunner();
    const pacer = makeFakePacer();
    const handle = run({ kind: 'regenerate', board: 'activity-UC-999' }, pacer);
    assert.match(handle.runId, /^r-[0-9a-f]{8}$/);
    // Swallow the expected async failure (no Neo4j in unit test env).
    await handle.promise.catch(() => undefined);
    assert.equal(pacer.lastPrompt, null, 'pacer must not be called for regenerate');
  });

  it('runId starts with r- and is 10 chars total', async () => {
    const { run } = await importRunner();
    const pacer = makeFakePacer();
    const handle = run({ kind: 'sync', board: 'domain-model' }, pacer);
    await handle.promise;
    assert.match(handle.runId, /^r-[0-9a-f]{8}$/);
  });
});

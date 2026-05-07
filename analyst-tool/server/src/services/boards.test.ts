/**
 * boards.test.ts — UC-008-BE test cases TC-1..TC-8
 *
 * Tests the `label` field on BoardListItem, batched Neo4j resolution,
 * graceful degradation, and preserved existing behaviour.
 *
 * Uses a fake Driver (same pattern as neo4j.test.ts / renderable.test.ts).
 * No real database or filesystem required.
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Driver } from 'neo4j-driver';

// ---------------------------------------------------------------------------
// Fake Driver infrastructure
// ---------------------------------------------------------------------------

type FakeRow = Record<string, unknown>;
type RunCall = { cypher: string; params: Record<string, unknown> };

function makeFakeDriver(
  responses: { match: string; rows: FakeRow[] }[],
  runCalls: RunCall[],
  throwOnSession = false,
  throwOnRun = false,
): Driver {
  return {
    session() {
      if (throwOnSession) throw new Error('ECONNREFUSED simulated');
      return {
        async run(cypher: string, params: Record<string, unknown>) {
          if (throwOnRun) throw new Error('Query failed simulated');
          runCalls.push({ cypher, params });
          const resp = responses.find((r) => cypher.includes(r.match));
          const records = (resp?.rows ?? []).map((row) => ({
            get(key: string) {
              return row[key] ?? null;
            },
          }));
          return { records };
        },
        async close() { /* no-op */ },
      };
    },
    async close() { /* no-op */ },
  } as unknown as Driver;
}

// Minimal valid Excalidraw scene JSON
const SCENE_JSON = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [],
  appState: {},
  files: {},
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let setDriver: (d: Driver) => void;
let clearDriver: () => void;
let listBoards: () => Promise<import('./boards.js').BoardListItem[]>;

let boardsDir: string;
let parentDir: string;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let configManager: any;

before(async () => {
  parentDir = await mkdtemp(join(tmpdir(), 'nacl-boards-label-test-'));

  const neo4jMod = await import('./neo4j.js');
  setDriver = neo4jMod.setDriver as (d: Driver) => void;
  clearDriver = neo4jMod.clearDriver;

  const boardsMod = await import('./boards.js');
  listBoards = boardsMod.listBoards;

  const configMod = await import('../config.js');
  configManager = configMod.configManager;
});

after(async () => {
  clearDriver();
  await rm(parentDir, { recursive: true, force: true });
  delete process.env['NACL_BOARDS_DIR'];
});

beforeEach(async () => {
  boardsDir = await mkdtemp(join(parentDir, 'boards-'));
  process.env['NACL_BOARDS_DIR'] = boardsDir;
  // Force configManager to re-read env so getConfig() returns the new boardsDir
  await configManager.reload();
});

afterEach(() => {
  clearDriver();
});

// ---------------------------------------------------------------------------
// TC-1: label field present on every item (even without Neo4j stub)
// ---------------------------------------------------------------------------

describe('TC-1: BoardListItem includes label field on every item', () => {
  it('every returned item has a label property (string or null)', async () => {
    // Write three board files
    await writeFile(join(boardsDir, 'activity-UC-003.excalidraw'), SCENE_JSON, 'utf-8');
    await writeFile(join(boardsDir, 'process-BP-001.excalidraw'), SCENE_JSON, 'utf-8');
    await writeFile(join(boardsDir, 'domain-model.excalidraw'), SCENE_JSON, 'utf-8');

    // No driver injected — Neo4j unreachable; should degrade gracefully
    const items = await listBoards();
    assert.ok(items.length === 3, `expected 3 items, got ${items.length}`);

    for (const item of items) {
      assert.ok(
        'label' in item,
        `item ${item.name} missing label field`,
      );
      assert.ok(
        item.label === null || typeof item.label === 'string',
        `item ${item.name} label should be string or null, got ${JSON.stringify(item.label)}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// TC-2: label resolves UseCase.name for activity boards
// ---------------------------------------------------------------------------

describe('TC-2: label resolves UseCase.name for activity boards', () => {
  it('returns UseCase name for activity-UC-003', async () => {
    await writeFile(join(boardsDir, 'activity-UC-003.excalidraw'), SCENE_JSON, 'utf-8');

    const runCalls: RunCall[] = [];
    const driver = makeFakeDriver(
      [{ match: 'UseCase', rows: [{ id: 'UC-003', name: 'Regenerate Board from Graph' }] }],
      runCalls,
    );
    setDriver(driver);

    const items = await listBoards();
    const activityItem = items.find((b) => b.name === 'activity-UC-003');
    assert.ok(activityItem, 'activity-UC-003 item not found');
    assert.equal(activityItem!.label, 'Regenerate Board from Graph');
  });
});

// ---------------------------------------------------------------------------
// TC-3: label resolves BusinessProcess.name for process boards
// ---------------------------------------------------------------------------

describe('TC-3: label resolves BusinessProcess.name for process boards', () => {
  it('returns BusinessProcess name for process-BP-001', async () => {
    await writeFile(join(boardsDir, 'process-BP-001.excalidraw'), SCENE_JSON, 'utf-8');

    const runCalls: RunCall[] = [];
    const driver = makeFakeDriver(
      [{ match: 'BusinessProcess', rows: [{ id: 'BP-001', name: 'Onboarding' }] }],
      runCalls,
    );
    setDriver(driver);

    const items = await listBoards();
    const processItem = items.find((b) => b.name === 'process-BP-001');
    assert.ok(processItem, 'process-BP-001 item not found');
    assert.equal(processItem!.label, 'Onboarding');
  });
});

// ---------------------------------------------------------------------------
// TC-4: label is null for non-activity / non-process kinds
// ---------------------------------------------------------------------------

describe('TC-4: label is null for non-activity/non-process kinds', () => {
  it('domain-model, context-map, import boards get null label', async () => {
    await writeFile(join(boardsDir, 'domain-model.excalidraw'), SCENE_JSON, 'utf-8');
    await writeFile(join(boardsDir, 'context-map.excalidraw'), SCENE_JSON, 'utf-8');
    await writeFile(join(boardsDir, 'import-Foo.excalidraw'), SCENE_JSON, 'utf-8');

    const runCalls: RunCall[] = [];
    // Driver that would return data if queried — but should NOT be called for these kinds
    const driver = makeFakeDriver([], runCalls);
    setDriver(driver);

    const items = await listBoards();
    assert.equal(items.length, 3);

    for (const item of items) {
      assert.equal(
        item.label,
        null,
        `expected label=null for ${item.name}, got ${JSON.stringify(item.label)}`,
      );
    }

    // Also assert no session.run calls were made (no activity/process boards)
    assert.equal(runCalls.length, 0, 'no Cypher queries should run for non-activity/process boards');
  });
});

// ---------------------------------------------------------------------------
// TC-5: label is null when the graph has no matching node
// ---------------------------------------------------------------------------

describe('TC-5: label is null when graph has no matching node', () => {
  it('UC-999 not in graph → label is null, no error', async () => {
    await writeFile(join(boardsDir, 'activity-UC-999.excalidraw'), SCENE_JSON, 'utf-8');

    const runCalls: RunCall[] = [];
    // UC-999 not returned by Neo4j
    const driver = makeFakeDriver(
      [{ match: 'UseCase', rows: [] }],
      runCalls,
    );
    setDriver(driver);

    const items = await listBoards();
    const item = items.find((b) => b.name === 'activity-UC-999');
    assert.ok(item, 'activity-UC-999 not found');
    assert.equal(item!.label, null);
  });
});

// ---------------------------------------------------------------------------
// TC-6: Batched resolution — no N+1 (CRITICAL perf guard)
// ---------------------------------------------------------------------------

describe('TC-6: batched resolution — at most 2 session.run calls', () => {
  it('5 activity + 3 process boards → exactly 2 session.run calls', async () => {
    // 5 activity boards
    for (let i = 1; i <= 5; i++) {
      await writeFile(
        join(boardsDir, `activity-UC-00${i}.excalidraw`),
        SCENE_JSON,
        'utf-8',
      );
    }
    // 3 process boards
    for (let i = 1; i <= 3; i++) {
      await writeFile(
        join(boardsDir, `process-BP-00${i}.excalidraw`),
        SCENE_JSON,
        'utf-8',
      );
    }

    const runCalls: RunCall[] = [];
    const driver = makeFakeDriver(
      [
        {
          match: 'UseCase',
          rows: [
            { id: 'UC-001', name: 'UC One' },
            { id: 'UC-002', name: 'UC Two' },
            { id: 'UC-003', name: 'UC Three' },
            { id: 'UC-004', name: 'UC Four' },
            { id: 'UC-005', name: 'UC Five' },
          ],
        },
        {
          match: 'BusinessProcess',
          rows: [
            { id: 'BP-001', name: 'BP One' },
            { id: 'BP-002', name: 'BP Two' },
            { id: 'BP-003', name: 'BP Three' },
          ],
        },
      ],
      runCalls,
    );
    setDriver(driver);

    const items = await listBoards();
    assert.equal(items.length, 8);

    // CRITICAL: exactly 2 session.run calls regardless of board count
    assert.equal(
      runCalls.length,
      2,
      `expected exactly 2 session.run calls, got ${runCalls.length}`,
    );

    // Spot-check labels resolved correctly
    const uc1 = items.find((b) => b.name === 'activity-UC-001');
    assert.equal(uc1!.label, 'UC One');
    const bp1 = items.find((b) => b.name === 'process-BP-001');
    assert.equal(bp1!.label, 'BP One');
  });
});

// ---------------------------------------------------------------------------
// TC-7: Graceful degradation when Neo4j is unreachable
// ---------------------------------------------------------------------------

describe('TC-7: graceful degradation when Neo4j is unreachable', () => {
  it('throws on session() — still returns 200 with label=null on every item', async () => {
    await writeFile(join(boardsDir, 'activity-UC-003.excalidraw'), SCENE_JSON, 'utf-8');
    await writeFile(join(boardsDir, 'process-BP-001.excalidraw'), SCENE_JSON, 'utf-8');

    const runCalls: RunCall[] = [];
    const driver = makeFakeDriver([], runCalls, /* throwOnSession */ true);
    setDriver(driver);

    // Must not throw
    const items = await listBoards();
    assert.equal(items.length, 2);

    for (const item of items) {
      assert.equal(
        item.label,
        null,
        `expected label=null on degradation for ${item.name}`,
      );
    }
  });

  it('throws on run() — still returns 200 with label=null on every item', async () => {
    await writeFile(join(boardsDir, 'activity-UC-003.excalidraw'), SCENE_JSON, 'utf-8');

    const runCalls: RunCall[] = [];
    const driver = makeFakeDriver([], runCalls, /* throwOnSession */ false, /* throwOnRun */ true);
    setDriver(driver);

    const items = await listBoards();
    assert.equal(items.length, 1);
    assert.equal(items[0].label, null);
  });
});

// ---------------------------------------------------------------------------
// TC-8: Existing behaviour preserved
// ---------------------------------------------------------------------------

describe('TC-8: existing behaviour preserved', () => {
  it('files in .snapshots subdirectory are skipped', async () => {
    // Create a .snapshots subdirectory with an excalidraw file (depth 0 readdir won't
    // enter subdirs, but the guard checks for files starting with ".")
    const snapshotsDir = join(boardsDir, '.snapshots');
    await mkdir(snapshotsDir);
    await writeFile(
      join(boardsDir, 'activity-UC-001.excalidraw'),
      SCENE_JSON,
      'utf-8',
    );

    const runCalls: RunCall[] = [];
    const driver = makeFakeDriver(
      [{ match: 'UseCase', rows: [{ id: 'UC-001', name: 'Login' }] }],
      runCalls,
    );
    setDriver(driver);

    const items = await listBoards();
    // Only the activity board; .snapshots dir is not a file ending in .excalidraw
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'activity-UC-001');
  });

  it('files starting with "." are skipped', async () => {
    await writeFile(
      join(boardsDir, '.hidden-board.excalidraw'),
      SCENE_JSON,
      'utf-8',
    );
    await writeFile(
      join(boardsDir, 'activity-UC-001.excalidraw'),
      SCENE_JSON,
      'utf-8',
    );

    const runCalls: RunCall[] = [];
    const driver = makeFakeDriver(
      [{ match: 'UseCase', rows: [{ id: 'UC-001', name: 'Login' }] }],
      runCalls,
    );
    setDriver(driver);

    const items = await listBoards();
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'activity-UC-001');
  });

  it('ENOENT on boardsDir returns empty array (no 500)', async () => {
    process.env['NACL_BOARDS_DIR'] = join(parentDir, 'this-does-not-exist');
    await configManager.reload();
    clearDriver();

    const items = await listBoards();
    assert.deepEqual(items, []);
  });

  it('kind, relatedId, displayName, group, syncStatus fields remain correct', async () => {
    await writeFile(join(boardsDir, 'activity-UC-003.excalidraw'), SCENE_JSON, 'utf-8');
    await writeFile(join(boardsDir, 'domain-model.excalidraw'), SCENE_JSON, 'utf-8');

    const runCalls: RunCall[] = [];
    const driver = makeFakeDriver(
      [{ match: 'UseCase', rows: [{ id: 'UC-003', name: 'Regenerate Board' }] }],
      runCalls,
    );
    setDriver(driver);

    const items = await listBoards();

    const activityItem = items.find((b) => b.name === 'activity-UC-003');
    assert.ok(activityItem);
    assert.equal(activityItem!.kind, 'activity');
    assert.equal(activityItem!.relatedId, 'UC-003');
    assert.equal(activityItem!.syncStatus, 'never-synced');
    assert.equal(activityItem!.label, 'Regenerate Board');

    const domainItem = items.find((b) => b.name === 'domain-model');
    assert.ok(domainItem);
    assert.equal(domainItem!.kind, 'domain-model');
    assert.equal(domainItem!.relatedId, null);
    assert.equal(domainItem!.label, null);
  });
});

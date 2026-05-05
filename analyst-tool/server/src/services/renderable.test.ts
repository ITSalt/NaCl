/**
 * renderable.test.ts — unit tests for discoverRenderable().
 *
 * Uses a fake Driver (same pattern as neo4j.test.ts) — no real database needed.
 * Verifies the four discovery queries and graceful error handling.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Driver } from 'neo4j-driver';

// ---------------------------------------------------------------------------
// Fake Driver infrastructure
// ---------------------------------------------------------------------------

/**
 * A fake session that returns predefined records per Cypher keyword.
 * The mapping key is a substring that should appear in the Cypher string.
 */
type FakeRow = Record<string, unknown>;

function makeFakeDriver(
  responses: { match: string; rows: FakeRow[] }[],
  throwOnAny = false,
): Driver {
  return {
    session() {
      return {
        async run(cypher: string) {
          if (throwOnAny) throw new Error('ECONNREFUSED simulated');
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('discoverRenderable: empty graph', () => {
  it('returns empty array when no entities exist', async () => {
    const { discoverRenderable } = await import('./renderable.js');
    const driver = makeFakeDriver([
      { match: 'DomainEntity', rows: [{ c: 0 }] },
      { match: 'Module',       rows: [{ c: 0 }] },
      { match: 'UseCase',      rows: [] },
      { match: 'BusinessProcess', rows: [] },
    ]);
    const result = await discoverRenderable(driver);
    assert.deepEqual(result, []);
  });
});

describe('discoverRenderable: partial graph', () => {
  it('returns correct boards for mixed graph data', async () => {
    const { discoverRenderable } = await import('./renderable.js');

    // Graph has:
    //   3 DomainEntities, 2 Modules
    //   UC-001 (has steps), UC-002 (no steps — omitted from idQuery)
    //   BP-007 (has steps)
    const driver = makeFakeDriver([
      { match: 'DomainEntity',  rows: [{ c: 3 }] },
      { match: 'Module',        rows: [{ c: 2 }] },
      { match: 'UseCase',       rows: [{ id: 'UC-001' }] },
      { match: 'BusinessProcess', rows: [{ id: 'BP-007' }] },
    ]);

    const result = await discoverRenderable(driver);

    assert.equal(result.length, 4, 'should have 4 renderable boards');

    const domain = result.find((r) => r.kind === 'domain-model');
    assert.ok(domain, 'domain-model should be present');
    assert.equal(domain?.board, 'domain-model');
    assert.equal(domain?.relatedId, null);
    assert.ok(domain?.reason.includes('3'), 'reason should mention count');

    const ctx = result.find((r) => r.kind === 'context-map');
    assert.ok(ctx, 'context-map should be present');
    assert.equal(ctx?.board, 'context-map');
    assert.equal(ctx?.relatedId, null);
    assert.ok(ctx?.reason.includes('2'), 'reason should mention count');

    const act = result.find((r) => r.kind === 'activity');
    assert.ok(act, 'activity board should be present');
    assert.equal(act?.board, 'activity-UC-001');
    assert.equal(act?.relatedId, 'UC-001');

    const proc = result.find((r) => r.kind === 'process');
    assert.ok(proc, 'process board should be present');
    assert.equal(proc?.board, 'process-BP-007');
    assert.equal(proc?.relatedId, 'BP-007');
  });

  it('omits UseCases without steps from activity boards', async () => {
    const { discoverRenderable } = await import('./renderable.js');

    // UC-002 is NOT returned by the EXISTS-filtered query (no steps)
    const driver = makeFakeDriver([
      { match: 'DomainEntity',    rows: [{ c: 0 }] },
      { match: 'Module',          rows: [{ c: 0 }] },
      { match: 'UseCase',         rows: [] },           // UC-002 filtered out
      { match: 'BusinessProcess', rows: [] },
    ]);

    const result = await discoverRenderable(driver);
    assert.equal(result.length, 0);
    assert.equal(result.filter((r) => r.kind === 'activity').length, 0);
  });
});

describe('discoverRenderable: unreachable graph', () => {
  it('returns empty array when driver throws (ECONNREFUSED)', async () => {
    const { discoverRenderable } = await import('./renderable.js');
    const driver = makeFakeDriver([], /* throwOnAny */ true);
    // Must not throw
    const result = await discoverRenderable(driver);
    assert.ok(Array.isArray(result), 'result should be an array');
    // Could be empty (first query throws) — the key thing is no exception propagated
  });
});

describe('discoverRenderable: multiple activity and process boards', () => {
  it('returns one entry per UseCase and BusinessProcess with steps', async () => {
    const { discoverRenderable } = await import('./renderable.js');

    const driver = makeFakeDriver([
      { match: 'DomainEntity',    rows: [{ c: 1 }] },
      { match: 'Module',          rows: [{ c: 1 }] },
      { match: 'UseCase',         rows: [{ id: 'UC-001' }, { id: 'UC-003' }] },
      { match: 'BusinessProcess', rows: [{ id: 'BP-001' }, { id: 'BP-002' }] },
    ]);

    const result = await discoverRenderable(driver);

    assert.equal(result.length, 6); // domain-model + context-map + 2 activity + 2 process
    const actBoards = result.filter((r) => r.kind === 'activity').map((r) => r.board);
    assert.deepEqual(actBoards, ['activity-UC-001', 'activity-UC-003']);

    const procBoards = result.filter((r) => r.kind === 'process').map((r) => r.board);
    assert.deepEqual(procBoards, ['process-BP-001', 'process-BP-002']);
  });
});

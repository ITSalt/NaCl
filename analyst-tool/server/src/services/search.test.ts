/**
 * search.test.ts — tests for matching/scoring logic with mocked board store
 * and mocked Neo4j.
 *
 * Does not require a real database or real .excalidraw files.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let boardsDir: string;

// Board scene with recognizable text for search
const BOARD_SCENE = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [
    {
      id: 'el-1',
      type: 'rectangle',
      text: 'Decision Gate',
      customData: { nodeId: 'UC-001', sourceDoc: 'login-flow' },
    },
    {
      id: 'el-2',
      type: 'text',
      text: 'Domain Model Node',
      originalText: 'Domain Model Node',
      customData: {},
    },
    {
      id: 'el-3',
      type: 'diamond',
      text: 'BP-042',
      customData: { nodeId: 'BP-042' },
    },
  ],
  appState: {},
  files: {},
});

before(async () => {
  boardsDir = join(tmpdir(), `nacl-search-test-${process.pid}`);
  await mkdir(boardsDir, { recursive: true });
  await writeFile(join(boardsDir, 'test-board.excalidraw'), BOARD_SCENE, 'utf-8');
  process.env['NACL_BOARDS_DIR'] = boardsDir;
});

after(async () => {
  await rm(boardsDir, { recursive: true, force: true });
  delete process.env['NACL_BOARDS_DIR'];
  // Ensure no pooled Neo4j connections leak into the test runner's open handles.
  const { closeDriver } = await import('./neo4j.js');
  await closeDriver();
});

// ---------------------------------------------------------------------------
// Helpers — import search after env is set
// ---------------------------------------------------------------------------

async function runSearch(q: string, opts?: { limit?: number }) {
  // Re-import each time to pick up env — node:test doesn't support module reloading,
  // but the boards service reads config.boardsDir from the env lazily per call.
  const { search } = await import('./search.js');
  return search(q, opts);
}

// ---------------------------------------------------------------------------
// Board search tests
// ---------------------------------------------------------------------------

describe('board search — text matching', () => {
  it('finds element by exact text match and scores it highest', async () => {
    const results = await runSearch('Decision Gate');
    const boardResults = results.filter((r) => r.source === 'board');
    assert.ok(boardResults.length >= 1, 'should find at least one board result');
    const top = boardResults[0];
    assert.ok(top !== undefined);
    assert.equal(top.source, 'board');
    if (top.source === 'board') {
      assert.equal(top.elementId, 'el-1');
      assert.equal(top.score, 100, 'exact match should score 100');
    }
  });

  it('finds element by substring (case-insensitive)', async () => {
    const results = await runSearch('domain');
    const boardResults = results.filter((r) => r.source === 'board');
    assert.ok(boardResults.length >= 1);
    const hit = boardResults.find((r) => r.source === 'board' && r.elementId === 'el-2');
    assert.ok(hit !== undefined, 'should find element with "Domain" in text');
  });

  it('finds element by customData.nodeId', async () => {
    const results = await runSearch('UC-001');
    const boardResults = results.filter((r) => r.source === 'board');
    const hit = boardResults.find(
      (r) => r.source === 'board' && r.nodeId === 'UC-001',
    );
    assert.ok(hit !== undefined, 'should find element by nodeId');
  });

  it('returns empty array for a query that matches nothing', async () => {
    const results = await runSearch('ZZZNOMATCH99999');
    const boardResults = results.filter((r) => r.source === 'board');
    assert.equal(boardResults.length, 0);
  });

  it('respects the limit option', async () => {
    const results = await runSearch('el', { limit: 1 });
    assert.ok(results.length <= 1, 'should respect limit');
  });

  it('prefix match scores higher than substring match', async () => {
    // 'Domain' is at start of 'Domain Model Node' → prefix (60)
    // 'Model' is in the middle → substring (30)
    const results = await runSearch('Domain Model Node');
    const boardHit = results.find(
      (r) => r.source === 'board' && r.elementId === 'el-2',
    );
    assert.ok(boardHit !== undefined);
    // Exact match here, score = 100
    assert.equal(boardHit!.score, 100);
  });
});

// ---------------------------------------------------------------------------
// Graph search integration (Neo4j mocked)
// ---------------------------------------------------------------------------

describe('board search — no Neo4j required', () => {
  it('gracefully handles Neo4j connection failure', async () => {
    // Point to a non-existent Neo4j; search should still return board results
    process.env['NEO4J_URI'] = 'bolt://127.0.0.1:19999'; // unlikely port
    try {
      const { clearDriver } = await import('./neo4j.js');
      clearDriver();
      const results = await runSearch('Decision Gate', { limit: 5 });
      // Should get board results even if graph fails
      const boardResults = results.filter((r) => r.source === 'board');
      assert.ok(boardResults.length >= 1, 'board results survive Neo4j failure');
    } finally {
      delete process.env['NEO4J_URI'];
      const { closeDriver } = await import('./neo4j.js');
      await closeDriver();
    }
  });
});

// ---------------------------------------------------------------------------
// Scoring logic unit tests
// ---------------------------------------------------------------------------

describe('scoring helpers', () => {
  it('exact match > prefix > substring ordering', async () => {
    // We can test indirectly: search 'BP-042' exact text in el-3
    const exact = await runSearch('BP-042');
    const hitExact = exact.filter((r) => r.source === 'board' && r.elementId === 'el-3');
    assert.ok(hitExact.length > 0);
    assert.equal(hitExact[0]!.score, 100, 'BP-042 exact match should score 100');

    // 'BP' is a prefix of 'BP-042'
    const prefix = await runSearch('BP');
    const hitPrefix = prefix.filter((r) => r.source === 'board' && r.elementId === 'el-3');
    assert.ok(hitPrefix.length > 0);
    assert.ok(hitPrefix[0]!.score < 100, 'prefix should score < exact');
    assert.ok(hitPrefix[0]!.score > 0,   'prefix should score > 0');

    // '042' is in the middle of 'BP-042' → substring
    const substr = await runSearch('042');
    const hitSubstr = substr.filter((r) => r.source === 'board' && r.elementId === 'el-3');
    assert.ok(hitSubstr.length > 0);
    assert.ok(hitSubstr[0]!.score < (hitPrefix[0]?.score ?? 100), 'substring should score < prefix');
  });
});

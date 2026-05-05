import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to override config.boardsDir for tests.
// We do this by patching the module after dynamic import.

describe('meta service', () => {
  let tmpDir: string;
  let readMeta: (name: string) => Promise<import('./meta.js').BoardMeta>;
  let writeMeta: (name: string, patch: Partial<import('./meta.js').BoardMeta>) => Promise<import('./meta.js').BoardMeta>;
  let computeBoardHash: (scene: unknown) => string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nacl-meta-test-'));

    // Patch config module cache by writing a fake config first.
    // We'll use a workaround: directly import and manipulate.
    // Since ESM doesn't allow easy mocking, we'll test via a thin wrapper
    // that accepts boardsDir as parameter — but the spec says to test via
    // the exported functions. We'll use a temporary directory by temporarily
    // setting an env var that our config reads.
    process.env['NACL_BOARDS_DIR'] = tmpDir;

    // Dynamic imports after env is set
    const mod = await import('./meta.js');
    readMeta = mod.readMeta;
    writeMeta = mod.writeMeta;
    computeBoardHash = mod.computeBoardHash;
  });

  after(async () => {
    delete process.env['NACL_BOARDS_DIR'];
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('readMeta returns all-nulls default when sidecar is missing', async () => {
    const meta = await readMeta('nonexistent-board');
    assert.equal(meta.lastGeneratedAt, null);
    assert.equal(meta.lastGeneratedBy, null);
    assert.equal(meta.lastSyncedAt, null);
    assert.equal(meta.lastSyncStatus, null);
    assert.equal(meta.lastSyncRunId, null);
    assert.equal(meta.contentHashAtLastSync, null);
  });

  it('writeMeta merges and persists', async () => {
    const result = await writeMeta('test-board', {
      lastGeneratedAt: '2026-01-01T00:00:00Z',
      lastGeneratedBy: 'migration',
    });
    assert.equal(result.lastGeneratedAt, '2026-01-01T00:00:00Z');
    assert.equal(result.lastGeneratedBy, 'migration');
    assert.equal(result.lastSyncedAt, null);

    // Read back
    const read = await readMeta('test-board');
    assert.equal(read.lastGeneratedAt, '2026-01-01T00:00:00Z');
    assert.equal(read.lastGeneratedBy, 'migration');
  });

  it('computeBoardHash is stable across version/seed changes', () => {
    const scene1 = {
      elements: [
        { id: 'el1', type: 'rectangle', x: 10, y: 20, version: 1, versionNonce: 100, seed: 999, updated: 123456 },
      ],
      appState: { viewBackgroundColor: '#fff', gridSize: null },
      files: {},
    };
    const scene2 = {
      elements: [
        { id: 'el1', type: 'rectangle', x: 10, y: 20, version: 5, versionNonce: 200, seed: 111, updated: 999999 },
      ],
      appState: { viewBackgroundColor: '#fff', gridSize: null },
      files: {},
    };
    const h1 = computeBoardHash(scene1);
    const h2 = computeBoardHash(scene2);
    assert.equal(h1, h2);
    assert.match(h1, /^sha256:[0-9a-f]{64}$/);
  });

  it('computeBoardHash differs when elements change', () => {
    const scene1 = {
      elements: [{ id: 'el1', type: 'rectangle', x: 10, y: 20 }],
      appState: { viewBackgroundColor: '#fff', gridSize: null },
      files: {},
    };
    const scene2 = {
      elements: [
        { id: 'el1', type: 'rectangle', x: 10, y: 20 },
        { id: 'el2', type: 'ellipse', x: 50, y: 50 },
      ],
      appState: { viewBackgroundColor: '#fff', gridSize: null },
      files: {},
    };
    const h1 = computeBoardHash(scene1);
    const h2 = computeBoardHash(scene2);
    assert.notEqual(h1, h2);
  });

  it('writeMeta with existing sidecar merges fields correctly', async () => {
    await writeFile(
      join(tmpDir, 'existing-board.meta.json'),
      JSON.stringify({ lastGeneratedAt: '2025-01-01T00:00:00Z', lastGeneratedBy: 'nacl-render', lastSyncedAt: null, lastSyncStatus: null, lastSyncRunId: null, contentHashAtLastSync: 'sha256:abc' }),
      'utf-8',
    );
    const result = await writeMeta('existing-board', { lastSyncedAt: '2026-05-01T00:00:00Z', lastSyncStatus: 'ok' });
    assert.equal(result.lastGeneratedAt, '2025-01-01T00:00:00Z');
    assert.equal(result.lastSyncedAt, '2026-05-01T00:00:00Z');
    assert.equal(result.lastSyncStatus, 'ok');
    assert.equal(result.contentHashAtLastSync, 'sha256:abc');
  });
});

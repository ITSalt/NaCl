import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('snapshots service', () => {
  let tmpDir: string;
  let listSnapshots: (board: string) => Promise<import('./snapshots.js').SnapshotEntry[]>;
  let readSnapshot: (board: string, ts: string) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSnapshot: (board: string, ts: string, scene: any) => Promise<string>;
  let parseSnapshotFilename: (filename: string) => { board: string; timestamp: string } | null;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nacl-snapshots-test-'));
    process.env['NACL_BOARDS_DIR'] = tmpDir;

    // Create the boards dir and a fake board file (needed for writeBoard in restoreSnapshot)
    const scene = {
      type: 'excalidraw',
      version: 2,
      elements: [{ id: 'el1', type: 'rectangle', x: 0, y: 0 }],
      appState: {},
      files: {},
    };
    await writeFile(join(tmpDir, 'my-board.excalidraw'), JSON.stringify(scene), 'utf-8');

    const mod = await import('./snapshots.js');
    listSnapshots = mod.listSnapshots;
    readSnapshot = mod.readSnapshot;
    writeSnapshot = mod.writeSnapshot;
    parseSnapshotFilename = mod.parseSnapshotFilename;
  });

  after(async () => {
    delete process.env['NACL_BOARDS_DIR'];
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('listSnapshots returns empty array when no .snapshots dir', async () => {
    const result = await listSnapshots('my-board');
    assert.deepEqual(result, []);
  });

  it('writeSnapshot creates file, listSnapshots finds it', async () => {
    const scene = { type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} };
    await writeSnapshot('my-board', '20260501T120000Z', scene as unknown);
    const list = await listSnapshots('my-board');
    assert.equal(list.length, 1);
    assert.equal(list[0].board, 'my-board');
    assert.equal(list[0].timestamp, '20260501T120000Z');
    assert.ok(typeof list[0].size === 'number');
  });

  it('readSnapshot returns the scene', async () => {
    const read = await readSnapshot('my-board', '20260501T120000Z');
    assert.ok(read !== null);
    assert.equal((read as Record<string, unknown>)['type'], 'excalidraw');
  });

  it('readSnapshot throws 404 for nonexistent', async () => {
    try {
      await readSnapshot('my-board', '19990101T000000Z');
      assert.fail('Expected to throw');
    } catch (err) {
      const e = err as { statusCode?: number };
      assert.equal(e.statusCode, 404);
    }
  });

  it('rejects invalid board name', async () => {
    try {
      await listSnapshots('../evil');
      assert.fail('Expected to throw');
    } catch (err) {
      const e = err as { statusCode?: number };
      assert.equal(e.statusCode, 400);
    }
  });

  it('rejects invalid timestamp', async () => {
    try {
      await readSnapshot('my-board', '../evil/path');
      assert.fail('Expected to throw');
    } catch (err) {
      const e = err as { statusCode?: number };
      assert.equal(e.statusCode, 400);
    }
  });

  it('listSnapshots returns newest first for multiple snapshots', async () => {
    await writeSnapshot('my-board', '20260501T130000Z', { type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} } as unknown);
    await writeSnapshot('my-board', '20260501T110000Z', { type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} } as unknown);

    const list = await listSnapshots('my-board');
    const timestamps = list.map((e) => e.timestamp);
    // Sorted newest first
    for (let i = 1; i < timestamps.length; i++) {
      assert.ok(timestamps[i - 1] >= timestamps[i], `Expected ${timestamps[i-1]} >= ${timestamps[i]}`);
    }
  });

  it('parseSnapshotFilename parses valid snapshot filename', () => {
    const result = parseSnapshotFilename('my-board-20260501T120000Z.json');
    assert.ok(result !== null);
    assert.equal(result!.board, 'my-board');
    assert.equal(result!.timestamp, '20260501T120000Z');
  });

  it('parseSnapshotFilename returns null for non-snapshot filename', () => {
    assert.equal(parseSnapshotFilename('my-board.excalidraw'), null);
    assert.equal(parseSnapshotFilename('random.json'), null);
  });
});

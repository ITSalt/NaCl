import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffScenes } from './diff.js';
import type { ExcalidrawScene } from './boards.js';

function makeScene(elements: Record<string, unknown>[]): ExcalidrawScene {
  return {
    type: 'excalidraw',
    version: 2,
    elements,
    appState: {},
    files: {},
  };
}

describe('diffScenes', () => {
  it('empty vs empty → no entries', () => {
    const result = diffScenes(makeScene([]), makeScene([]));
    assert.equal(result.entries.length, 0);
    assert.deepEqual(result.stats, { added: 0, removed: 0, changed: 0 });
  });

  it('one added element', () => {
    const older = makeScene([]);
    const newer = makeScene([{ id: 'el1', type: 'rectangle', x: 0, y: 0 }]);
    const result = diffScenes(older, newer);
    assert.equal(result.stats.added, 1);
    assert.equal(result.stats.removed, 0);
    assert.equal(result.stats.changed, 0);
    assert.equal(result.entries[0].kind, 'added');
  });

  it('one removed element', () => {
    const older = makeScene([{ id: 'el1', type: 'rectangle', x: 0, y: 0 }]);
    const newer = makeScene([]);
    const result = diffScenes(older, newer);
    assert.equal(result.stats.added, 0);
    assert.equal(result.stats.removed, 1);
    assert.equal(result.stats.changed, 0);
    assert.equal(result.entries[0].kind, 'removed');
  });

  it('one added one removed → correct stats', () => {
    const older = makeScene([{ id: 'el1', type: 'rectangle', x: 0, y: 0 }]);
    const newer = makeScene([{ id: 'el2', type: 'ellipse', x: 10, y: 10 }]);
    const result = diffScenes(older, newer);
    assert.equal(result.stats.added, 1);
    assert.equal(result.stats.removed, 1);
    assert.equal(result.stats.changed, 0);
  });

  it('changed by text field → reason includes "text"', () => {
    const older = makeScene([{ id: 'el1', type: 'text', x: 0, y: 0, text: 'hello' }]);
    const newer = makeScene([{ id: 'el1', type: 'text', x: 0, y: 0, text: 'world' }]);
    const result = diffScenes(older, newer);
    assert.equal(result.stats.changed, 1);
    const entry = result.entries[0];
    assert.equal(entry.kind, 'changed');
    if (entry.kind === 'changed') {
      assert.ok(entry.reasons.includes('text'), `Expected reasons to include 'text', got ${JSON.stringify(entry.reasons)}`);
    }
  });

  it('volatile-only difference (version) → no diff', () => {
    const older = makeScene([{ id: 'el1', type: 'rectangle', x: 0, y: 0, version: 1, versionNonce: 100, seed: 999, updated: 111 }]);
    const newer = makeScene([{ id: 'el1', type: 'rectangle', x: 0, y: 0, version: 5, versionNonce: 200, seed: 888, updated: 222 }]);
    const result = diffScenes(older, newer);
    assert.equal(result.entries.length, 0);
    assert.deepEqual(result.stats, { added: 0, removed: 0, changed: 0 });
  });

  it('prefers customData.nodeId over id for identity', () => {
    const older = makeScene([
      { id: 'old-id-1', type: 'rectangle', x: 0, y: 0, customData: { nodeId: 'UC-001' } },
    ]);
    // Same nodeId but different element id — should be seen as a changed element, not add+remove
    const newer = makeScene([
      { id: 'new-id-1', type: 'rectangle', x: 10, y: 10, customData: { nodeId: 'UC-001' } },
    ]);
    const result = diffScenes(older, newer);
    assert.equal(result.stats.added, 0);
    assert.equal(result.stats.removed, 0);
    assert.equal(result.stats.changed, 1);
    const entry = result.entries[0];
    if (entry.kind === 'changed') {
      assert.ok(entry.reasons.includes('x') || entry.reasons.includes('y') || entry.reasons.includes('id'));
    }
  });

  it('mixed nodeId-bound and id-bound elements', () => {
    const older = makeScene([
      { id: 'el-a', type: 'rectangle', x: 0, y: 0, customData: { nodeId: 'N1' } },
      { id: 'el-b', type: 'ellipse', x: 5, y: 5 },
    ]);
    const newer = makeScene([
      { id: 'el-a-new', type: 'rectangle', x: 1, y: 1, customData: { nodeId: 'N1' } }, // matched by nodeId
      { id: 'el-c', type: 'diamond', x: 20, y: 20 }, // new by id
      // el-b is removed
    ]);
    const result = diffScenes(older, newer);
    assert.equal(result.stats.changed, 1);   // el-a changed (x,y differ)
    assert.equal(result.stats.removed, 1);   // el-b removed
    assert.equal(result.stats.added, 1);     // el-c added
  });
});

/**
 * excalidraw-bindings tests — confirm reverse boundElements are added without
 * mutating the input and that the function is idempotent.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { repairArrowBindings } from './excalidraw-bindings.js';

interface MinimalElement {
  id: string;
  type: string;
  boundElements?: { id: string; type: string }[];
  startBinding?: { elementId: string };
  endBinding?: { elementId: string };
}

function scene(elements: MinimalElement[]): { type: string; elements: MinimalElement[] } {
  return { type: 'excalidraw', elements };
}

describe('repairArrowBindings', () => {
  it('adds reverse boundElements for arrow start/end targets', () => {
    const input = scene([
      { id: 'r1', type: 'rectangle', boundElements: [] },
      { id: 'r2', type: 'rectangle', boundElements: [] },
      {
        id: 'a1',
        type: 'arrow',
        startBinding: { elementId: 'r1' },
        endBinding: { elementId: 'r2' },
      },
    ]);
    const out = repairArrowBindings(input);
    const r1 = out.elements.find((e) => e.id === 'r1');
    const r2 = out.elements.find((e) => e.id === 'r2');
    assert.deepEqual(r1?.boundElements, [{ id: 'a1', type: 'arrow' }]);
    assert.deepEqual(r2?.boundElements, [{ id: 'a1', type: 'arrow' }]);
  });

  it('preserves existing non-arrow boundElements (e.g. text)', () => {
    const input = scene([
      {
        id: 'r1',
        type: 'rectangle',
        boundElements: [{ id: 'text-r1', type: 'text' }],
      },
      {
        id: 'a1',
        type: 'arrow',
        startBinding: { elementId: 'r1' },
        endBinding: { elementId: 'r1' },
      },
    ]);
    const out = repairArrowBindings(input);
    const r1 = out.elements.find((e) => e.id === 'r1');
    assert.deepEqual(r1?.boundElements, [
      { id: 'text-r1', type: 'text' },
      { id: 'a1', type: 'arrow' },
    ]);
  });

  it('is idempotent — running twice yields the same result', () => {
    const input = scene([
      { id: 'r1', type: 'rectangle', boundElements: [] },
      { id: 'r2', type: 'rectangle', boundElements: [] },
      {
        id: 'a1',
        type: 'arrow',
        startBinding: { elementId: 'r1' },
        endBinding: { elementId: 'r2' },
      },
    ]);
    const once = repairArrowBindings(input);
    const twice = repairArrowBindings(once);
    assert.deepEqual(once.elements, twice.elements);
  });

  it('does not mutate the input', () => {
    const r1 = { id: 'r1', type: 'rectangle', boundElements: [] };
    const a1 = {
      id: 'a1',
      type: 'arrow',
      startBinding: { elementId: 'r1' },
      endBinding: { elementId: 'r1' },
    };
    const input = scene([r1, a1]);
    const inputBefore = JSON.parse(JSON.stringify(input));
    repairArrowBindings(input);
    assert.deepEqual(input, inputBefore);
  });

  it('returns the same scene if there are no arrows to bind', () => {
    const input = scene([{ id: 'r1', type: 'rectangle', boundElements: [] }]);
    const out = repairArrowBindings(input);
    assert.equal(out, input);
  });

  it('skips bindings whose elementId is not in the scene', () => {
    const input = scene([
      {
        id: 'a1',
        type: 'arrow',
        startBinding: { elementId: 'orphan' },
        endBinding: { elementId: 'orphan' },
      },
    ]);
    // No targets to patch → returns same scene
    const out = repairArrowBindings(input);
    assert.equal(out, input);
  });
});

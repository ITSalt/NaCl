import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBoard } from './board-classifier.js';

describe('classifyBoard', () => {
  it('classifies domain-model', () => {
    const result = classifyBoard('domain-model');
    assert.equal(result.kind, 'domain-model');
    assert.equal(result.relatedId, null);
    assert.equal(result.displayName, 'Domain Model');
    assert.equal(result.group, 'Domain Model');
  });

  it('classifies context-map', () => {
    const result = classifyBoard('context-map');
    assert.equal(result.kind, 'context-map');
    assert.equal(result.relatedId, null);
    assert.equal(result.displayName, 'Context Map');
    assert.equal(result.group, 'Context Map');
  });

  it('classifies activity boards', () => {
    const result = classifyBoard('activity-UC-001');
    assert.equal(result.kind, 'activity');
    assert.equal(result.relatedId, 'UC-001');
    assert.equal(result.displayName, 'UC-001');
    assert.equal(result.group, 'Activities (UC)');
  });

  it('classifies process boards', () => {
    const result = classifyBoard('process-BP-001');
    assert.equal(result.kind, 'process');
    assert.equal(result.relatedId, 'BP-001');
    assert.equal(result.displayName, 'BP-001');
    assert.equal(result.group, 'Processes (BP)');
  });

  it('classifies import boards', () => {
    const result = classifyBoard('test-board');
    assert.equal(result.kind, 'import');
    assert.equal(result.relatedId, 'test');
    assert.equal(result.displayName, 'test');
    assert.equal(result.group, 'Imports');
  });

  it('classifies other boards', () => {
    const result = classifyBoard('my-random-diagram');
    assert.equal(result.kind, 'other');
    assert.equal(result.relatedId, null);
    assert.equal(result.displayName, 'my-random-diagram');
    assert.equal(result.group, 'Other');
  });
});

// Pins for nacl-ids.mjs. Run: node --test nacl-core/scripts/nacl-ids.test.mjs
// Each case reproduces the documented "If no … nodes exist, the result is X" examples
// and the Cypher right()-padding (including its truncation quirk).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naclId } from './nacl-ids.mjs';

test('first-id examples from SKILL.md', () => {
  assert.equal(naclId('process-group', 1), 'GPR-01');
  assert.equal(naclId('business-process', 1), 'BP-001');
  assert.equal(naclId('entity', 1), 'OBJ-001');
  assert.equal(naclId('role', 1), 'ROL-01');
  assert.equal(naclId('workflow-step', 1, 'BP-001'), 'BP-001-S01');
});

test('padding widths', () => {
  assert.equal(naclId('process-group', 10), 'GPR-10');
  assert.equal(naclId('business-process', 42), 'BP-042');
  assert.equal(naclId('business-process', 999), 'BP-999');
  assert.equal(naclId('role', 9), 'ROL-09');
  assert.equal(naclId('workflow-step', 12, 'BP-007'), 'BP-007-S12');
});

test('aliases match canonical names', () => {
  assert.equal(naclId('GPR', 2), 'GPR-02');
  assert.equal(naclId('BP', 2), 'BP-002');
  assert.equal(naclId('OBJ', 2), 'OBJ-002');
  assert.equal(naclId('ROL', 2), 'ROL-02');
  assert.equal(naclId('STEP', 2, 'BP-001'), 'BP-001-S02');
});

test('canonical left-pad — no truncation beyond width (matches apoc.text.lpad)', () => {
  // the ba-process/-entities/-roles behaviour; ends the divergence with ba-sync's old right()
  assert.equal(naclId('process-group', 100), 'GPR-100');
  assert.equal(naclId('business-process', 1000), 'BP-1000');
});

test('workflow-step requires a parentId', () => {
  assert.throws(() => naclId('workflow-step', 1), /requires a parentId/);
});

test('unknown kind throws', () => {
  assert.throws(() => naclId('widget', 1), /unknown kind/);
});

test('next_int must be a positive integer', () => {
  assert.throws(() => naclId('role', 0), /positive integer/);
  assert.throws(() => naclId('role', 1.5), /positive integer/);
});

test('determinism: same args → identical id', () => {
  assert.equal(naclId('workflow-step', 3, 'BP-001'), naclId('workflow-step', 3, 'BP-001'));
});

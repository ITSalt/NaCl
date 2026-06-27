// Pins for claim-task.mjs. Run: node --test nacl-core/scripts/claim-task.test.mjs
// Locks the canonical claim/release Cypher and the acquire/held interpretation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaimQuery, buildReleaseQuery, interpretClaim } from './claim-task.mjs';

test('claim query is a single conditional write with TTL + provenance', () => {
  const { query, paramKeys } = buildClaimQuery({ ttlHours: 4 });
  assert.match(query, /MATCH \(t:Task \{id:\$taskId\}\)/);
  // unclaimed OR mine OR expired — the atomic guard
  assert.match(query, /t\.claimed_by IS NULL OR t\.claimed_by = \$dev OR t\.claim_expires_at < datetime\(\)/);
  assert.match(query, /SET t\.claimed_by = \$dev/);
  assert.match(query, /duration\(\{hours: 4\}\)/);
  assert.match(query, /t\.updated_by = \$dev/);            // provenance
  assert.match(query, /RETURN t\.claimed_by AS owner/);
  assert.deepEqual(paramKeys, ['taskId', 'dev']);
});

test('ttl-hours is parameterized into the duration', () => {
  assert.match(buildClaimQuery({ ttlHours: 8 }).query, /duration\(\{hours: 8\}\)/);
});

test('release query only clears MY claim', () => {
  const { query } = buildReleaseQuery();
  assert.match(query, /WHERE t\.claimed_by = \$dev/);
  assert.match(query, /SET t\.claimed_by = NULL/);
});

test('interpretClaim: acquired when owner is me', () => {
  assert.deepEqual(interpretClaim([{ owner: 'alice' }], 'alice'), { acquired: true, owner: 'alice' });
});

test('interpretClaim: held by someone else', () => {
  assert.deepEqual(interpretClaim([{ owner: 'bob' }], 'alice'), { acquired: false, owner: 'bob' });
});

test('interpretClaim: no rows (guard failed) → not acquired', () => {
  assert.deepEqual(interpretClaim([], 'alice'), { acquired: false, owner: null });
  assert.deepEqual(interpretClaim(null, 'alice'), { acquired: false, owner: null });
});

test('determinism: identical inputs → identical query', () => {
  assert.equal(buildClaimQuery({ ttlHours: 4 }).query, buildClaimQuery({ ttlHours: 4 }).query);
});

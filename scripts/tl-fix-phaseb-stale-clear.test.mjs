// scripts/tl-fix-phaseb-stale-clear.test.mjs — structural guard for DEF-C.
//
// The clear/advance write (`$syncedTaskIds` → advance planned_from_version +
// REMOVE the stale flags) already exists and its Cypher is exercised by the
// pfv-advance case in tests/graph/regression-uc-allocator-task-merge.sh. The
// DEFECT was purely one of WIRING: the block sat in Phase A (Step 5, spec
// authoring) with prose telling the agent to "clear that task's flag at Step
// 7", yet Step 7 (Phase B, after GREEN verification) never invoked it — so a
// completed L2 fix left a dangling stale stamp that failed another session's
// Phase-4.5 P-S6 gate.
//
// This test binds the fix in place: the executable clear/advance fence MUST
// live inside Phase B / Step 7, run only after verification is green. A
// Cypher harness cannot catch a prose-flow gap; this structural check does.
//
// RED on the pre-fix tree (fence is in Phase A / Step 5); GREEN after the
// move. Runs in CI via test-tools.yml (node --test, no docker).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(REPO_ROOT, 'nacl-tl-fix', 'SKILL.md');
const body = readFileSync(SKILL, 'utf8');

const idxPhaseA = body.indexOf('## Phase A —');
const idxPhaseB = body.indexOf('## Phase B —');
const idxStep7 = body.indexOf('### Step 7:');
const idxStep8 = body.indexOf('### Step 8:');

test('tl-fix section skeleton is intact', () => {
  assert.ok(idxPhaseA > 0, 'Phase A header present');
  assert.ok(idxPhaseB > idxPhaseA, 'Phase B header present after Phase A');
  assert.ok(idxStep7 > idxPhaseB, 'Step 7 header present inside Phase B');
  assert.ok(idxStep8 > idxStep7, 'Step 8 header present after Step 7');
});

test('Phase A still stamps dependent tasks stale (unchanged)', () => {
  const stampIdx = body.indexOf("t.review_status = 'stale'");
  assert.ok(stampIdx > 0, 'stale stamp write present');
  assert.ok(
    stampIdx > idxPhaseA && stampIdx < idxPhaseB,
    'stale stamp is authored in Phase A',
  );
});

test('the clear/advance write exists exactly once', () => {
  const occurrences = body.split('WHERE t.id IN $syncedTaskIds').length - 1;
  assert.equal(
    occurrences,
    1,
    'exactly one $syncedTaskIds clear/advance fence (no duplicate/drift)',
  );
});

test('DEF-C: the clear/advance write is wired into Phase B / Step 7', () => {
  const clearIdx = body.indexOf('WHERE t.id IN $syncedTaskIds');
  assert.ok(clearIdx > 0, 'clear/advance write present');
  assert.ok(
    clearIdx > idxStep7 && clearIdx < idxStep8,
    'clear/advance write must live inside Step 7 (Phase B), after GREEN ' +
      'verification — not in Phase A where a completed fix never reaches it',
  );
});

test('the clear/advance write both advances pfv and removes the stale flags', () => {
  // Scope the assertions to the Step 7 region so we test the wired copy.
  const region = body.slice(idxStep7, idxStep8);
  assert.match(
    region,
    /SET t\.planned_from_version = coalesce\(uc\.spec_version, 0\)/,
    'advances planned_from_version to the source UC spec_version',
  );
  assert.match(
    region,
    /REMOVE t\.review_status, t\.stale_reason, t\.stale_since, t\.stale_origin/,
    'removes the task-level stale flags',
  );
});

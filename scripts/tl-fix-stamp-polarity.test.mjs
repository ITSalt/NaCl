// scripts/tl-fix-stamp-polarity.test.mjs — structural guard for the
// staleness-stamp polarity contract.
//
// THE DEFECT. nacl-tl-fix Step 5 stamped `(uc)-[:GENERATES]->(t:Task)` with no
// status filter, so a fix that touched one backend file marked every task of
// the affected UC 'stale' — including tasks that shipped months earlier. But
// 'stale' means "nacl-tl-plan must regenerate this", and re-planning is not
// applicable to shipped code: tl-plan's shipped-stale path HALTs asking for a
// delta carrier that fix-origin staleness never has, because the fix WAS the
// delta and it already shipped. The flags therefore accrued with no reachable
// exit. Observed on a live project: 87 flagged tasks, 67 of them status=done
// (77%), six origins, eleven days, release gate #7 red the entire time — so
// every release in that window shipped past it.
//
// THE CONTRACT. Step 5 stamps by status; shipped tasks get 'spec_drift', a
// review question with its own exit (Step 7.5b Arm B), and L8 grades the two
// separately so the gate can go green honestly instead of being skipped.
//
// The Cypher semantics are exercised against a real Neo4j by
// tests/graph/regression-staleness-stamp-polarity.sh. That harness needs
// docker; this file is the CI-runnable structural half, guarding the wiring
// and the prose flow a Cypher harness cannot see. Runs via test-tools.yml
// (node --test, no docker).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(REPO_ROOT, ...p), 'utf8');

const fix = read('nacl-tl-fix', 'SKILL.md');
const validate = read('nacl-sa-validate', 'SKILL.md');
const release = read('nacl-tl-release', 'SKILL.md');

const idxPhaseA = fix.indexOf('## Phase A —');
const idxPhaseB = fix.indexOf('## Phase B —');
const idxStep7 = fix.indexOf('### Step 7:');
const idxStep8 = fix.indexOf('### Step 8:');

test('Step 5 stamp discriminates shipped from active tasks', () => {
  assert.match(
    fix,
    /coalesce\(t\.status, ''\) IN \['done', 'verified-pending'\] AS shipped/,
    'stamp classifies tasks by shipped status',
  );
  assert.match(
    fix,
    /t\.review_status = CASE WHEN shipped THEN 'spec_drift' ELSE 'stale' END/,
    "shipped -> 'spec_drift', active -> 'stale'",
  );
});

test('the stamp still bumps spec_version (Signal 1 stays armed)', () => {
  const stampIdx = fix.indexOf("t.review_status = CASE WHEN shipped");
  const region = fix.slice(idxPhaseA, stampIdx);
  assert.match(
    region,
    /SET uc\.spec_version = coalesce\(uc\.spec_version, 0\) \+ 1/,
    'spec_version bump precedes the stamp in the same Phase A write',
  );
});

test('the review verdict exists exactly once and is wired into Phase B / Step 7', () => {
  const occurrences = fix.split('WHERE t.id IN $reviewedTaskIds').length - 1;
  assert.equal(occurrences, 1, 'exactly one verdict fence (no duplicate/drift)');

  const idx = fix.indexOf('WHERE t.id IN $reviewedTaskIds');
  assert.ok(
    idx > idxStep7 && idx < idxStep8,
    'the verdict must run in Phase B after GREEN verification — a verdict ' +
      'authored in Phase A would close drift before the code was proven',
  );
});

test('the verdict advances pfv and records who closed it', () => {
  const region = fix.slice(idxStep7, idxStep8);
  assert.match(
    region,
    /SET t\.planned_from_version = coalesce\(uc\.spec_version, 0\),\s*\n\s*t\.reviewed_by = \$decisionId,\s*\n\s*t\.reviewed_at = datetime\(\)/,
    'pfv advance and the audit stamp land in the same write — clearing the ' +
      'flag without advancing pfv silences Signal 2 while Signal 1 fires forever',
  );
  assert.match(
    region,
    /REMOVE t\.review_status, t\.stale_reason, t\.stale_since, t\.stale_origin/,
    'removes the task-level flags',
  );
});

test('the verdict only ever closes spec_drift, never a stale re-planning unit', () => {
  const region = fix.slice(idxStep7, idxStep8);
  const idx = region.indexOf('WHERE t.id IN $reviewedTaskIds');
  const fence = region.slice(idx, idx + 400);
  assert.match(
    fence,
    /AND coalesce\(t\.review_status, 'current'\) = 'spec_drift'/,
    'guarded on spec_drift so a mis-supplied id cannot silently close ' +
      'un-built work that still needs regenerating',
  );
});

test('the verdict does not reopen or mutate shipped state', () => {
  const region = fix.slice(idxStep7, idxStep8);
  const idx = region.indexOf('WHERE t.id IN $reviewedTaskIds');
  const fence = region.slice(idx, idx + 400);
  for (const forbidden of ['t.status', 't.commit', 't.verification_evidence', 't.phase_']) {
    assert.ok(
      !fence.includes(forbidden),
      `verdict fence must not touch ${forbidden} — a review is not a re-opening`,
    );
  }
});

test('UC-level clear waits for BOTH flags to drain', () => {
  // Clearing the UC while a spec_drift task remains would hide the backlog
  // from L8's UC-level surface — the same "easy mistake" the Task/UC combined
  // clear in tl-plan Step 2.4 calls out.
  const guards = fix.match(
    /WHERE NOT EXISTS \{ \(uc\)-\[:GENERATES\]->\(x:Task\) WHERE coalesce\(x\.review_status, 'current'\) IN \['stale', 'spec_drift'\] \}/g,
  );
  assert.ok(guards && guards.length >= 2, 'both clear arms guard on stale AND spec_drift');
});

test('L8 grades the two flags separately', () => {
  assert.match(
    validate,
    /\/\/ L8\.1 -- Severity: CRITICAL[\s\S]{0,400}?WHERE coalesce\(n\.review_status, 'current'\) = 'stale'/,
    'L8.1 CRITICAL is scoped to stale only',
  );
  assert.ok(
    !/\/\/ L8\.1 -- Severity: CRITICAL[\s\S]{0,400}?spec_drift'\s*$/m.test(validate),
    'L8.1 does not block on spec_drift',
  );
  assert.match(
    validate,
    /\/\/ L8\.1b -- Severity: WARNING within budget, CRITICAL when exceeded/,
    'L8.1b exists and is budgeted',
  );
  assert.match(
    validate,
    /CASE WHEN total > \$driftMaxCount OR size\(overdue\) > 0\s*\n\s*THEN 'CRITICAL' ELSE 'WARNING' END AS severity/,
    'L8.1b escalates on either the count or the age bound',
  );
});

test('release condition #7 names both remedies and registers the new gate token', () => {
  assert.match(release, /spec-drift-backlog/, 'condition #7 carries the spec-drift detail');
  assert.match(
    release,
    /`missing-prod-golden-path`, `stale-downstream`, `spec-drift-backlog`/,
    'spec-drift-backlog is a recognised affected_gates token, so it can be ' +
      'covered by a signed exception like every other gate',
  );
});

test('graph.status is a closed vocabulary (the observed bypass)', () => {
  assert.match(
    release,
    /graph-status-invalid/,
    'an unrecognised graph.status value is itself a refusal',
  );
  assert.match(
    release,
    /graph-skipped-without-exception/,
    'skipping the graph gate requires a signed exception, not a free-text note',
  );
});

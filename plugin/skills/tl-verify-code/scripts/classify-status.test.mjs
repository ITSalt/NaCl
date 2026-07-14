// Contract-pinning equivalence test for classify-status.mjs (technique B3).
//
// Written FIRST (regression-test-before-fix / contract-pin discipline): every row of the
// nacl-tl-verify-code "Decision logic summary" must map to the exact same one of the 8
// canonical status tokens the skill has always emitted. A green run here means the script
// reproduces the prose table; any divergence is a contract change and must be rejected.
//
// Run: node --test nacl-tl-verify-code/scripts/   (no package.json / deps required)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatus } from './classify-status.mjs';

// A baseline of inputs representing the all-clean PASS case; tests override single fields.
const clean = {
  staticFail: false,          // CODE_DRIFT / confirmed static runtime error (Step 2.5)
  scriptsTestMissing: false,
  emptyTestStubs: false,      // test files exist but zero it() calls
  runnerCouldNotExecute: false,
  testsCollected: 12,
  baselineResolved: true,
  newFailures: 0,
  postfixFailures: 0,
  coverageGap: false,
  uiChanges: false,
};
const g = (over) => classifyStatus({ ...clean, ...over }).result;

// ---- one assertion per canonical status (the 8 the contract pins) ----

test('PASS — suite clean, no coverage gap, no UI', () => {
  assert.equal(g({}), 'PASS');
});

test('PASS_NEEDS_E2E — same as PASS but UI changes present', () => {
  assert.equal(g({ uiChanges: true }), 'PASS_NEEDS_E2E');
});

test('UNVERIFIED — suite clean but coverage gap (incl. unmet acceptance criterion from 5.3a)', () => {
  assert.equal(g({ coverageGap: true }), 'UNVERIFIED');
});

test('NO_INFRA — scripts.test missing', () => {
  assert.equal(g({ scriptsTestMissing: true }), 'NO_INFRA');
});

test('NO_INFRA — test files exist with zero it() calls (empty stubs)', () => {
  assert.equal(g({ emptyTestStubs: true }), 'NO_INFRA');
});

test('RUNNER_BROKEN — runner present but could not execute', () => {
  assert.equal(g({ runnerCouldNotExecute: true }), 'RUNNER_BROKEN');
});

test('RUNNER_BROKEN — tests_collected == 0 even after fallback', () => {
  assert.equal(g({ testsCollected: 0 }), 'RUNNER_BROKEN');
});

test('BLOCKED — only pre-existing failures (baseline available, no new failures)', () => {
  assert.equal(g({ postfixFailures: 3, newFailures: 0 }), 'BLOCKED');
});

test('REGRESSION — change introduced new failures (baseline available)', () => {
  assert.equal(g({ postfixFailures: 4, newFailures: 2 }), 'REGRESSION');
});

test('UNVERIFIED (no baseline) — baseline unresolvable AND postfix failures present', () => {
  // canonical token is still UNVERIFIED; reason distinguishes it
  const r = classifyStatus({ ...clean, baselineResolved: false, postfixFailures: 2 });
  assert.equal(r.result, 'UNVERIFIED');
  assert.match(r.reason, /baseline/i);
});

test('FAIL — confirmed static incorrect behavior / CODE_DRIFT', () => {
  assert.equal(g({ staticFail: true }), 'FAIL');
});

// ---- precedence (the part the prose left implicit; B3 pins it) ----

test('precedence: FAIL beats REGRESSION (a confirmed defect blocks regardless of tests)', () => {
  assert.equal(g({ staticFail: true, postfixFailures: 5, newFailures: 5 }), 'FAIL');
});

test('precedence: FAIL beats RUNNER_BROKEN (static defect is positive evidence; infra absence is not)', () => {
  assert.equal(g({ staticFail: true, runnerCouldNotExecute: true }), 'FAIL');
});

test('precedence: NO_INFRA beats RUNNER_BROKEN', () => {
  assert.equal(g({ scriptsTestMissing: true, runnerCouldNotExecute: true }), 'NO_INFRA');
});

test('precedence: REGRESSION beats BLOCKED (new failures dominate pre-existing)', () => {
  assert.equal(g({ newFailures: 1, postfixFailures: 5 }), 'REGRESSION');
});

test('precedence: BLOCKED beats coverage-gap UNVERIFIED when pre-existing failures + baseline present', () => {
  // matches SKILL note: "BLOCKED supersedes UNVERIFIED (coverage-gap) when pre-existing failures present AND baseline available"
  assert.equal(g({ postfixFailures: 2, newFailures: 0, coverageGap: true }), 'BLOCKED');
});

test('determinism: identical inputs always classify identically', () => {
  const inp = { ...clean, postfixFailures: 2, newFailures: 0 };
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(classifyStatus(inp).result);
  assert.equal(seen.size, 1, 'a pure decision table must yield exactly one verdict per input');
});

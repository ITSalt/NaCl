// Pins for classify-pr-merge.mjs. Run: node --test nacl-core/scripts/classify-pr-merge.test.mjs
// Each case maps one release-candidate PR to the exact verdict nacl-tl-release Step 2
// ("Pre-merge graph-proof gate") prescribes. The five lettered cases mirror
// tests/fixtures/release-fix-gate/ (A feature, B Decision-backed fix, C code-only fix,
// D unrecorded drift, E bundled fix).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyPrMerge } from './classify-pr-merge.mjs';

// ── Feature path (unchanged behavior — regression guard) ──────────────────────

test('A: feature PR, Task done → MERGE', () => {
  const r = classifyPrMerge({ prefix: 'feat', taskStatus: 'done' });
  assert.equal(r.verdict, 'MERGE');
  assert.equal(r.proof, 'Task done');
});

test('feature PR, missing Task node → HALT MISSING_TASK_NODE (old behavior preserved)', () => {
  const r = classifyPrMerge({ prefix: 'feat', taskNodeMissing: true });
  assert.equal(r.verdict, 'HALT');
  assert.equal(r.detail, 'MISSING_TASK_NODE');
});

test('feature PR, verified-pending → USER_GATE UNVERIFIED; blocked → USER_GATE BLOCKED', () => {
  assert.deepEqual(
    [classifyPrMerge({ prefix: 'feat', taskStatus: 'verified-pending' }).detail,
     classifyPrMerge({ prefix: 'feat', taskStatus: 'blocked' }).detail],
    ['UNVERIFIED', 'BLOCKED'],
  );
});

test('feature PR, failed/regression → HALT REGRESSION', () => {
  assert.equal(classifyPrMerge({ prefix: 'feat', taskStatus: 'failed' }).detail, 'REGRESSION');
  assert.equal(classifyPrMerge({ prefix: 'feat', taskStatus: 'regression' }).verdict, 'HALT');
});

test('unknown feature Task status throws (forces a valid row)', () => {
  assert.throws(() => classifyPrMerge({ prefix: 'feat', taskStatus: 'weird' }), /unknown feature Task status/);
});

// ── Fix path — the bug this change fixes ──────────────────────────────────────

test('B: Decision-backed fix (L2, DEC accepted), no Task node → MERGE (was the HALT case)', () => {
  const r = classifyPrMerge({
    prefix: 'fix', fixLevels: ['L2'], fixDecisions: ['DEC-090'],
    decisions: [{ id: 'DEC-090', status: 'accepted' }],
    taskNodeMissing: true, // irrelevant on the fix path — must NOT halt
  });
  assert.equal(r.verdict, 'MERGE');
  assert.equal(r.proof, 'Decision DEC-090 accepted');
});

test('C: code-only fix (L1, none) with gapcheck-no-drift → MERGE', () => {
  const r = classifyPrMerge({ prefix: 'fix', fixLevels: ['L1'], fixDecisions: ['none'], gapcheckNoDrift: true });
  assert.equal(r.verdict, 'MERGE');
  assert.equal(r.proof, 'code-only (L1) (status.json: gapcheck-no-drift confirmed)');
});

test('code-only fix never HALTs even without status.json corroboration', () => {
  const r = classifyPrMerge({ prefix: 'fix', fixLevels: ['L0'], fixDecisions: [] });
  assert.equal(r.verdict, 'MERGE');
  assert.equal(r.proof, 'code-only (L0)');
});

test('D: spec-changing fix with a missing/proposed Decision → HALT UNRECORDED_SPEC_DRIFT', () => {
  const missing = classifyPrMerge({ prefix: 'fix', fixLevels: ['L2'], fixDecisions: ['DEC-091'], decisions: [] });
  assert.equal(missing.verdict, 'HALT');
  assert.equal(missing.detail, 'UNRECORDED_SPEC_DRIFT');
  const proposed = classifyPrMerge({ prefix: 'fix', fixLevels: ['L2'], fixDecisions: ['DEC-091'], decisions: [{ id: 'DEC-091', status: 'proposed' }] });
  assert.equal(proposed.detail, 'UNRECORDED_SPEC_DRIFT');
});

test('E: bundled fix, all Decisions accepted → MERGE; one missing → HALT', () => {
  const ok = classifyPrMerge({
    prefix: 'fix', fixLevels: ['L2', 'L2'], fixDecisions: ['DEC-092', 'DEC-093'],
    decisions: [{ id: 'DEC-092', status: 'accepted' }, { id: 'DEC-093', status: 'accepted' }],
  });
  assert.equal(ok.verdict, 'MERGE');
  assert.equal(ok.proof, 'Decision DEC-092, DEC-093 accepted');
  const bad = classifyPrMerge({
    prefix: 'fix', fixLevels: ['L2', 'L2'], fixDecisions: ['DEC-092', 'DEC-093'],
    decisions: [{ id: 'DEC-092', status: 'accepted' }],
  });
  assert.equal(bad.verdict, 'HALT');
  assert.equal(bad.detail, 'UNRECORDED_SPEC_DRIFT');
});

test('bundled fix: strictest level governs (L1 + L2 → spec-changing path)', () => {
  const r = classifyPrMerge({
    prefix: 'fix', fixLevels: ['L1', 'L2'], fixDecisions: ['DEC-100'],
    decisions: [{ id: 'DEC-100', status: 'accepted' }],
  });
  assert.equal(r.verdict, 'MERGE');
  assert.equal(r.proof, 'Decision DEC-100 accepted');
});

// ── Inconsistent producer output ──────────────────────────────────────────────

test('spec-changing level but Fix-decision none → HALT FIX_PROOF_INCONSISTENT', () => {
  const r = classifyPrMerge({ prefix: 'fix', fixLevels: ['L2'], fixDecisions: ['none'] });
  assert.equal(r.detail, 'FIX_PROOF_INCONSISTENT');
});

test('code-only level but names a Decision → HALT FIX_PROOF_INCONSISTENT', () => {
  const r = classifyPrMerge({ prefix: 'fix', fixLevels: ['L1'], fixDecisions: ['DEC-200'] });
  assert.equal(r.detail, 'FIX_PROOF_INCONSISTENT');
});

// ── Trailer-less fallback (older fix PRs) ─────────────────────────────────────

test('no trailer, source-SHA matches an accepted Decision → MERGE (back-compat)', () => {
  const r = classifyPrMerge({ prefix: 'fix', sourceMatchedDecisions: [{ id: 'DEC-300', status: 'accepted' }] });
  assert.equal(r.verdict, 'MERGE');
  assert.match(r.proof, /matched by source SHA/);
});

test('no trailer, spec-update commit present, no Decision → HALT UNRECORDED_SPEC_DRIFT', () => {
  const r = classifyPrMerge({ prefix: 'fix', specUpdateCommitPresent: true });
  assert.equal(r.detail, 'UNRECORDED_SPEC_DRIFT');
});

test('no trailer, no spec-update commit → MERGE with advisory (pre-trailer code-only)', () => {
  const r = classifyPrMerge({ prefix: 'fix' });
  assert.equal(r.verdict, 'MERGE');
  assert.match(r.proof, /pre-trailer/);
});

// ── Dispatch + robustness ─────────────────────────────────────────────────────

test('non-fix prefix carrying a Fix-level trailer takes the fix path', () => {
  const r = classifyPrMerge({ prefix: 'chore', fixLevels: ['L2'], fixDecisions: ['DEC-400'], decisions: [{ id: 'DEC-400', status: 'accepted' }] });
  assert.equal(r.verdict, 'MERGE');
});

test('unknown Fix-level throws', () => {
  assert.throws(() => classifyPrMerge({ prefix: 'fix', fixLevels: ['L9'] }), /unknown Fix-level/);
});

test('determinism: same input → byte-identical', () => {
  const inp = { prefix: 'fix', fixLevels: ['L2'], fixDecisions: ['DEC-1'], decisions: [{ id: 'DEC-1', status: 'accepted' }] };
  assert.equal(JSON.stringify(classifyPrMerge(inp)), JSON.stringify(classifyPrMerge(structuredClone(inp))));
});

// ── Fixture replay (materialized artifact, asserted in CI) ────────────────────

test('fixture replay: release-fix-gate matches expected-outcome.json', () => {
  const dir = new URL('../../tests/fixtures/release-fix-gate/', import.meta.url);
  const prs = JSON.parse(readFileSync(new URL('prs.json', dir)));
  const expected = JSON.parse(readFileSync(new URL('expected-outcome.json', dir))).prs;
  assert.equal(prs.length, expected.length, 'PR count must match expected-outcome.json');
  prs.forEach((pr, i) => {
    const got = classifyPrMerge(pr);
    const exp = expected[i];
    assert.deepEqual(
      { verdict: got.verdict, detail: got.detail, proof: got.proof },
      { verdict: exp.verdict, detail: exp.detail, proof: exp.proof },
      `PR ${exp._pr} (${pr._title})`,
    );
  });
});

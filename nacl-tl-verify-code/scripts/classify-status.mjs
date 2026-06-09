// Deterministic status classifier for nacl-tl-verify-code (technique B3).
//
// Why this exists: the suite-result precedence was spread across three prose locations
// (the Step 5.4 table, the supersession note, and the Decision-logic summary), and the
// FAIL overlay ("static analysis found incorrect behaviour, regardless of tests") lived
// only in prose with no defined precedence vs REGRESSION/BLOCKED. An agent re-deriving
// that order each run is a variance + cost source. This module is the single authority:
// a pure function with the precedence frozen in one place. It emits ONLY the 8 canonical
// tokens the skill has always emitted — it changes HOW the verdict is derived, never WHAT
// is emitted (no contract change; see classify-status.test.mjs for the equivalence pins).
//
// Canonical statuses (unchanged contract):
//   PASS / PASS_NEEDS_E2E / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / BLOCKED / REGRESSION / FAIL
//
// Precedence (highest first) — the part the prose left implicit, now explicit:
//   1. FAIL          — a confirmed static defect (CODE_DRIFT / runtime error) is positive
//                      evidence of incorrect behaviour and blocks regardless of test infra
//                      or suite outcome ("regardless of tests").
//   2. NO_INFRA      — no test infrastructure exists (scripts.test missing, or empty stubs).
//   3. RUNNER_BROKEN — runner exists but could not execute, or collected 0 tests after fallback.
//   4. UNVERIFIED    — (no baseline) baseline unresolvable AND postfix failures present:
//                      new-vs-pre-existing is undefined (set arithmetic with a missing operand).
//   5. REGRESSION    — new failures introduced by the change (baseline available).
//   6. BLOCKED       — only pre-existing failures (baseline available, no new failures).
//   7. UNVERIFIED    — (coverage gap) suite clean but the change is not test-covered, or an
//                      acceptance criterion is neither implemented nor covered (Step 5.3a).
//   8. PASS_NEEDS_E2E — suite clean, no gap, UI changes present (browser verification still needed).
//   9. PASS          — suite clean, no gap, no UI changes.
//
// Note: SPEC_DRIFT findings never reach this function — they are SUGGESTIONS, not inputs.

/**
 * @param {{
 *   staticFail: boolean,            // Step 2.5 produced a CODE_DRIFT / confirmed runtime-error finding
 *   scriptsTestMissing: boolean,    // workspace declares no scripts.test
 *   emptyTestStubs: boolean,        // test files exist but contain zero it() calls
 *   runnerCouldNotExecute: boolean, // scripts.test exists but the runner errored before running tests
 *   testsCollected: number,         // count after the known-good-file re-run fallback
 *   baselineResolved: boolean,      // a baseline ref was resolvable (--base / saved artifact / merge-base)
 *   newFailures: number,            // postfix_failures − baseline_failures (only meaningful if baselineResolved)
 *   postfixFailures: number,        // failures in the postfix (working-tree) run
 *   coverageGap: boolean,           // no test imports the changed module, OR an acceptance criterion is unmet (5.3a)
 *   uiChanges: boolean,             // the change touches UI
 * }} i
 * @returns {{ result: string, reason: string }}
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function classifyStatus(i) {
  if (i.staticFail) {
    return { result: 'FAIL', reason: 'static analysis found incorrect behaviour (CODE_DRIFT / runtime error)' };
  }
  if (i.scriptsTestMissing || i.emptyTestStubs) {
    return { result: 'NO_INFRA', reason: i.scriptsTestMissing ? 'scripts.test missing' : 'test files contain zero it() calls' };
  }
  if (i.runnerCouldNotExecute || i.testsCollected === 0) {
    return { result: 'RUNNER_BROKEN', reason: i.runnerCouldNotExecute ? 'runner could not execute' : 'tests_collected == 0 after fallback' };
  }
  if (!i.baselineResolved && i.postfixFailures > 0) {
    return { result: 'UNVERIFIED', reason: 'no baseline — postfix failures cannot be classified as new vs pre-existing' };
  }
  if (i.baselineResolved && i.newFailures > 0) {
    return { result: 'REGRESSION', reason: 'change introduced new test failures' };
  }
  if (i.baselineResolved && i.postfixFailures > 0) {
    // newFailures === 0 here (the REGRESSION branch above caught newFailures > 0)
    return { result: 'BLOCKED', reason: 'pre-existing failures not introduced by this change' };
  }
  if (i.postfixFailures === 0 && i.coverageGap) {
    return { result: 'UNVERIFIED', reason: 'coverage gap — change not test-covered or an acceptance criterion is unverified' };
  }
  if (i.postfixFailures === 0 && !i.coverageGap) {
    return i.uiChanges
      ? { result: 'PASS_NEEDS_E2E', reason: 'static + suite clean; UI changes need browser verification' }
      : { result: 'PASS', reason: 'static + suite clean; no UI changes' };
  }
  // Unreachable for well-formed inputs; default to the safe non-PASS rather than guessing.
  return { result: 'UNVERIFIED', reason: 'inputs did not match any classification branch' };
}

// CLI: `node classify-status.mjs '<json-inputs>'` → prints the canonical token (and reason on stderr).
// Lets the skill invoke it deterministically instead of re-deriving the precedence in prose.
// Symlink-safe main check (skills invoke via the ~/.claude/skills symlink — argv[1] is the
// symlink, import.meta.url is the realpath, so compare both as realpaths).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = process.argv[2];
  if (!raw) {
    process.stderr.write('usage: node classify-status.mjs \'{"staticFail":false,...}\'\n');
    process.exit(2);
  }
  const out = classifyStatus(JSON.parse(raw));
  process.stdout.write(out.result + '\n');
  process.stderr.write(out.reason + '\n');
}

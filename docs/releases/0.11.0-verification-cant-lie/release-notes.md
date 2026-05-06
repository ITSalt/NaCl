# NaCl 0.11.0 — Verification Skills Cannot Lie

This release closes the same dishonesty class fixed in `nacl-tl-fix` (0.10.0) and propagated downstream in `nacl-tl-reopened`/`nacl-tl-hotfix` (0.10.1), now applied to five verification and quality-gate skills that were still claiming PASS without running a single test.

The skills affected: `nacl-tl-verify-code`, `nacl-tl-stubs`, `nacl-tl-verify` (orchestrator), `nacl-tl-sync`, and `nacl-tl-review`. All five are updated in this release as a single wave because they share the same pattern: static analysis or file scanning alone produced a terminal PASS result, with no test-runner discovery step and no coverage check. A workspace with 44 empty test files would receive exactly the same output as one with a complete, green test suite.

---

## Why This Release Exists

0.10.0 proved that a skill can PASS while lying. The fix was to require the skill to actually run the test suite, capture a baseline, and gate PASS on observed test transitions. 0.10.1 extended that contract to downstream consumers of `nacl-tl-fix`.

After 0.10.1, the fix pipeline was honest. The verification pipeline was not. Specifically:

**`nacl-tl-verify-code`** traced data flow, checked types, and returned PASS based on static heuristics alone. Step 5 ("RETURN RESULT") was the only step after the static checks, and it applied no test-runner discovery. There was no equivalent of `nacl-tl-fix` Step 7.1. A workspace with no `scripts.test`, a broken runner, or zero test coverage of the changed file would all produce the same result: PASS.

**`nacl-tl-stubs`** excluded `*.test.{ts,tsx}` and `*.spec.{ts,tsx}` from its file scope entirely. The scan patterns (comment markers, code patterns) were never applied to test files. A project with 44 test files each containing only `describe('X', () => { /* nothing */ })` — the "44-stub scenario" — would pass the scan with zero findings. The describe blocks have no `it()` or `test()` calls, which means no test cases execute, but the scanner saw no `// TODO` or `throw new Error('Not implemented')` markers and reported clean.

**`nacl-tl-verify`** delegated to `nacl-tl-verify-code` but did not enforce status-aware headers from its result. When `nacl-tl-verify-code` returned PASS, the orchestrator printed `RESULT: PASS` with no distinction between "PASS (test suite ran, coverage confirmed)" and "PASS (static heuristics only, no runner)". When YouGile was unavailable, the skill silently skipped posting instead of noting the omission.

**`nacl-tl-sync`** ran eight static verification categories against the API contract and returned PASS without running either workspace's test suite. The Prerequisites section required BE/FE reviews to be approved but did not require BE/FE test suites to pass. The verdict logic (`if blocker_count > 0: FAIL; else: PASS`) never consulted a test runner.

**`nacl-tl-review`** ran `npm test` (Step 6), which is good. But it had no check for who wrote the tests. A developer who wrote both the implementation and all the tests for a UC was indistinguishable from one who had a separate independent test author. The same condition that `nacl-tl-fix` guards against with the fix-author-vs-test-author seam was unguarded in review. Additionally, WARNING stubs above the threshold (>3) required "justification" but the justification was free-text with no required ticket reference — making it trivially satisfiable.

---

## What Changed

### A. nacl-tl-verify-code/SKILL.md — CRITICAL

**Change 1 — New Step 5: Run test suite (mandatory).**
A new step inserted before the result step discovers the workspace's `scripts.test`, runs it once, and captures pass/fail counts and stderr. The exact command declared in `scripts.test` is used — no fallback runners. If `scripts.test` is missing → `NO_INFRA`. If the runner crashes before any test runs → `RUNNER_BROKEN`.

**Change 2 — Coverage gap detection.**
Step 5.3 greps test files (`*.test.*`, `*.spec.*`) for any import of the module(s) being verified. If no test file imports the changed module → `coverage_gap = true`. A result of `UNVERIFIED` (not PASS) is returned when the gap is detected.

**Change 3 — Expanded result vocabulary.**
Old vocabulary: `PASS | PASS_NEEDS_E2E | FAIL`.
New vocabulary: `PASS | PASS_NEEDS_E2E | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | BLOCKED | REGRESSION | FAIL`.
Each status is documented with its meaning. Static analysis alone never produces PASS.

**Change 4 — Decision logic hardened.**
PASS requires: static checks pass AND test suite ran AND changed file(s) covered AND suite clean. Static-only → `UNVERIFIED` at best.

**Change 5 — Contract section added.**
Documents inputs consumed, outputs produced, downstream consumers (`nacl-tl-verify`, `nacl-tl-deliver`), and the standing audit discipline.

### B. nacl-tl-stubs/SKILL.md — CRITICAL

**Change 1 — New Step 2b: Test file scan (separate pass).**
For each `*.test.{ts,tsx,js,jsx}` and `*.spec.{ts,tsx,js,jsx}` file in scope, the scanner counts `it(` and `test(` call sites. A count of zero flags the file as `STUB-EMPTY-TEST-FILE` (WARNING severity). This pass runs in addition to the production-code pass, not instead of it.

**Change 2 — Empty describe block detection.**
Within non-empty test files (files with at least one `it(` or `test(`), `describe(` blocks with no test cases inside them are flagged as `STUB-EMPTY-DESCRIBE` (WARNING). Both checks are documented in the "Scan Patterns" section as the "44-stub scenario" pattern.

**Change 3 — The 44-stub scenario documented explicitly.**
The scan patterns section now contains a concrete example: a test file that has `describe('AuthService', () => { /* nothing */ })` with zero `it()` calls passes all old comment-marker checks, but is now caught by the `STUB-EMPTY-TEST-FILE` check. The registry gains `emptyTestFiles` and `emptyDescribeBlocks` counters.

**Change 4 — Status-aware headline vocabulary.**
Old behavior: "0 stubs = PASS" — binary clean/blocked.
New headlines: `STUBS COMPLETE` (scan ran, zero unresolved stubs including test files) / `STUBS APPLIED — UNVERIFIED` (scope had no test files — cannot assess coverage debt) / `STUBS RUNNER_BROKEN` (filesystem read failed) / `STUBS APPLIED — REGRESSION` (prior stub count was lower).

**Change 5 — WARNING stub justification tightened.**
WARNING stubs above the threshold (count > 3) now require a reference to an existing TASK ticket or backlog item ID. Free-text justification alone no longer satisfies the gate. This change is also reflected in `nacl-tl-review`'s Stub Verification Gate.

**Change 6 — Contract section added.**

### C. nacl-tl-verify/SKILL.md — MEDIUM

**Change 1 — Six-status table adopted.**
The orchestrator now maps `nacl-tl-verify-code`'s eight-status vocabulary to the six headline statuses: `VERIFY COMPLETE` / `VERIFY APPLIED — BLOCKED` / `VERIFY APPLIED — UNVERIFIED` / `VERIFY APPLIED — NO_INFRA` / `VERIFY APPLIED — RUNNER_BROKEN` / `VERIFY INCOMPLETE — REGRESSION`.

**Change 2 — PASS rationale distinction in report body.**
Both "VERIFY COMPLETE (code-only — no UI-visible changes, no E2E required)" and "VERIFY COMPLETE (E2E-verified, N steps GREEN)" produce the same `VERIFY COMPLETE` headline, but the report body distinguishes which path was taken. Users and downstream consumers can see whether browser verification was actually performed.

**Change 3 — YouGile-unavailable case made explicit.**
When YouGile is not reachable, the report now prints `"VERIFIED (local-only, not posted to YouGile)"` instead of silently skipping. Every report now states whether it was posted or not.

**Change 4 — Non-PASS statuses from verify-code propagated.**
Step 3 no longer treats `UNVERIFIED`, `NO_INFRA`, `RUNNER_BROKEN`, and `BLOCKED` as equivalent to PASS. Each maps to a distinct headline; none proceed to E2E testing.

**Change 5 — Decision matrix expanded.**
The four-row matrix is replaced with a nine-row matrix covering all verify-code result cases.

**Change 6 — Contract section added.**

### D. nacl-tl-sync/SKILL.md — MEDIUM

**Change 1 — New Step 7: Run BE and FE test suites.**
After the eight static checks, a mandatory runtime step discovers each workspace's `scripts.test`, runs it, and captures pass/fail counts. Both workspaces are run independently. The exact declared commands are used — no invented runners.

**Change 2 — Endpoint coverage check.**
Step 7.3 greps test files for each API endpoint path string touched by the change. If no test references the endpoint path in a given workspace → `coverage_gap = true` for that workspace.

**Change 3 — Runtime verdict rules.**
Six runtime rules determine the final classification: `PASS` (both suites pass, both endpoints covered) / `UNVERIFIED` (suites pass but endpoint uncovered) / `NO_INFRA` (runner missing) / `RUNNER_BROKEN` (runner crashed) / `REGRESSION` (new failures) / `BLOCKED` (pre-existing failures remain).

**Change 4 — Status-aware headline vocabulary.**
Old: `PASS / PASS_WITH_WARNINGS / FAIL`.
New: `SYNC COMPLETE / SYNC APPLIED — UNVERIFIED / SYNC APPLIED — BLOCKED / SYNC APPLIED — NO_INFRA / SYNC APPLIED — RUNNER_BROKEN / SYNC INCOMPLETE — REGRESSION`.

**Change 5 — sync-report.md gains runtime check section.**
The report template adds a "Runtime Checks" section: BE suite result, FE suite result, endpoint coverage table.

**Change 6 — Contract section added.**

### E. nacl-tl-review/SKILL.md — MEDIUM

**Change 1 — Step 6 split into 6a (run tests) and 6b (author independence check).**
Step 6a retains the existing `npm test` step. Step 6b is new: it runs `git log --format="%ae"` against the test files and production files for the UC, computes author-email overlap, and flags MAJOR when overlap exceeds 50%.

**Change 2 — MAJOR flag behavior defined.**
The MAJOR flag is non-blocking: it does not prevent APPROVED verdict. It must appear in the review artifact and is visible to downstream consumers (`nacl-tl-reopened`, `nacl-tl-ship`). When flagged, the report recommends invoking `/nacl-tl-regression-test` retroactively to validate one critical acceptance criterion independently.

**Change 3 — WARNING stub justification tightened (aligns with nacl-tl-stubs Change 5).**
WARNING stubs > 3 require a ticket/backlog ID reference. Free-text is rejected.

**Change 4 — Rejection path disambiguation.**
The error handling section now distinguishes "tests fail because implementation is wrong" (`REVIEW INCOMPLETE — REGRESSION`) from "tests fail because tests were tuned to match a buggy implementation" (`REVIEW APPLIED — UNVERIFIED` + MAJOR flag). Both require the developer to return, but for different reasons.

**Change 5 — Status-aware headline vocabulary adopted.**
Old: binary APPROVED / CHANGES REQUESTED.
New: headline is one of the six-status form; APPROVED / CHANGES REQUESTED is a verdict refinement within the headline. Example: `Headline: REVIEW COMPLETE / Verdict: APPROVED`.

**Change 6 — Contract section added.**

---

## The 44-Stub Scenario Explained

The scenario was discovered in practice: a project with 44 test files that each contained describe blocks but zero `it()` or `test()` calls. The files had been scaffolded — the test structure (describe, beforeEach) was in place — but the actual test cases had never been written. Nothing executed. Coverage was zero.

The old `nacl-tl-stubs` scan excluded test files from its scope. The production-code patterns (comment markers, `throw new Error('Not implemented')`, etc.) had no applicable rule for a test file that was simply empty of assertions. The scan returned "0 stubs found". The gate passed.

Example of a file that triggers the new check:

```typescript
// src/auth/auth.service.test.ts
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  describe('validateToken', () => {
    // TODO: add test cases
  });

  describe('refreshToken', () => {
    // TODO: add test cases
  });
});
```

This file has 0 `it(` calls and 0 `test(` calls. Under the new check, it is flagged as `STUB-EMPTY-TEST-FILE` (WARNING). The outer `describe` contains two inner `describe` blocks with no test cases — each inner block is also flagged as `STUB-EMPTY-DESCRIBE`.

A project with 44 such files would now produce 44 `STUB-EMPTY-TEST-FILE` findings (WARNING), making the coverage gap visible in the registry and in the report. The gate for `--final` (pre-release) would block on these warnings.

---

## Migration Impact

**Users:** No change in invocation syntax. All five skills are invoked identically. The observable difference:
- `nacl-tl-verify-code` results may now be `UNVERIFIED` or `NO_INFRA` where previously `PASS` was returned for workspaces with no test coverage. New statuses propagate through `nacl-tl-verify` to YouGile.
- `nacl-tl-stubs` reports will include an "Empty test files" count. Existing workflows that treat "0 stubs" as STUBS COMPLETE may see new WARNING findings if test files were hollow.
- `nacl-tl-verify` reports are more precise: the PASS report now states whether E2E was run.
- `nacl-tl-sync` on a UC without endpoint test coverage will now return `SYNC APPLIED — UNVERIFIED` rather than `SYNC COMPLETE`, gating delivery.
- `nacl-tl-review` reports now include a "Test Author Independence" section. Reviews where the same author wrote both tests and implementation will show a MAJOR flag with a recommendation.

**Downstream gating:** `nacl-tl-deliver` is documented as gating on SYNC COMPLETE. After this release, it will see `SYNC APPLIED — UNVERIFIED` for UCs whose endpoint paths are not covered by tests. Teams that previously had no endpoint test coverage may experience delivery blocking until they add tests or accept the gap explicitly.

**WARNING stub justification:** Any review workflow that accepted free-text justification for WARNING stubs > 3 will need ticket references going forward. Existing stubs in stub-registry.json are not retroactively rejected, but new review runs against those files will enforce the ticket-reference requirement.

---

## Verification

These skills are prompt files. The regression tests for this release are manual scenarios.

### Scenario 1 — verify-code on workspace with no scripts.test

**Setup:** Invoke `/nacl-tl-verify-code` against a task in a workspace where `package.json` has no `scripts.test` field (or `package.json` does not exist in the path).

**Expected behavior:**
1. Step 5.1 reads `package.json` and finds no `scripts.test`.
2. `NO_INFRA` is recorded.
3. The result is `NO_INFRA`, not `PASS`.
4. The report states: `"Runner: none — NO_INFRA"`.

**Failure condition:** Skill returns `PASS` without running a test suite.

### Scenario 2 — verify-code when changed file has no test coverage

**Setup:** Invoke `/nacl-tl-verify-code` against a workspace where `scripts.test` exists and the suite runs cleanly, but the changed file (e.g., `src/payments/payment.service.ts`) is not imported by any `*.test.*` or `*.spec.*` file.

**Expected behavior:**
1. Step 5.2 runs the suite; it passes (exit 0).
2. Step 5.3 greps test files for `payment.service`; finds no match.
3. `coverage_gap = true`.
4. The result is `UNVERIFIED`, not `PASS`.
5. The report states the coverage gap.

**Failure condition:** Skill returns `PASS` despite no test importing the changed file.

### Scenario 3 — stubs scan on workspace with hollow test files

**Setup:** Invoke `/nacl-tl-stubs` (or `/nacl-tl-stubs UC###`) against a scope that includes a test file containing only:

```typescript
describe('OrderService', () => {
  // no test cases
});
```

**Expected behavior:**
1. Step 2b counts `it(` and `test(` calls in the test file.
2. Count is 0 → file is flagged as `STUB-EMPTY-TEST-FILE` (WARNING).
3. The registry is updated with a `STUB-NNN` entry of type `STUB-EMPTY-TEST-FILE`.
4. The console output includes `"Empty test files: 1"`.
5. The headline is NOT `STUBS COMPLETE` — it is `STUBS APPLIED — REGRESSION` (if count grew vs prior) or remains at a non-complete status.

**Failure condition:** Scan reports "0 stubs" and prints `STUBS COMPLETE` despite the hollow test file.

### Scenario 4 — review flags test author overlap

**Setup:** Invoke `/nacl-tl-review UC### --be` on a UC where `git log` shows that the same contributor authored both the production service file and all test files for that UC (100% overlap).

**Expected behavior:**
1. Step 6b runs `git log --format="%ae"` on test files and production files.
2. Author overlap is 100% (> 50% threshold).
3. A MAJOR flag is added to the review report: "Test Author Independence — overlap: 100%".
4. The report recommends `/nacl-tl-regression-test` to validate one critical acceptance criterion.
5. The MAJOR flag does NOT block APPROVED verdict if all other checks pass.
6. The headline is `REVIEW APPLIED — UNVERIFIED` (due to author overlap flag).

**Failure condition:** Review returns APPROVED with headline `REVIEW COMPLETE` and no mention of author overlap.

---

## Known Limitations

- The test author independence check (nacl-tl-review Change 1) relies on `git log` author emails. In projects where all commits are attributed to a single CI bot email, the check may produce false-negatives (all overlap is attributed to the bot, not the human author). Teams using CI-attributed commits should supplement this check with a manual audit of who actually wrote the test content.
- The endpoint coverage check in `nacl-tl-sync` uses a string grep for the endpoint path. Endpoints with dynamic path segments (e.g., `/api/orders/:id`) may not be matched by a literal grep if tests use the pattern form. Teams should verify that the grep matches their test file conventions (e.g., ensure tests reference `'/api/orders'` as a substring).
- The STUB-EMPTY-DESCRIBE heuristic (Pattern B in nacl-tl-stubs) is a structural scan, not an AST parse. Nested describe blocks with complex conditional test structures may produce false-positives or false-negatives. Treat STUB-EMPTY-DESCRIBE findings as advisory guidance, not as blocking facts.

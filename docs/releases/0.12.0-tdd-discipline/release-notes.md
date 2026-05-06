# NaCl 0.12.0 — TDD Discipline at the Dev Layer (part 1 of 2)

This release closes the same dishonesty class fixed in `nacl-tl-fix` (0.10.0) and propagated outward in 0.10.1 and 0.11.0, now applied to the three development skills that were the origin of the problem: `nacl-tl-dev`, `nacl-tl-dev-be`, and `nacl-tl-dev-fe`. All three claimed to follow TDD — "RED phase: write failing tests" — but had no enforcement mechanism: no baseline capture before tests were written, no verification that the new tests actually appeared in the failure set, and no delta comparison to confirm that GREEN was real rather than a pre-existing passing suite.

A developer using these skills could commit production code, run a clean suite of pre-existing tests, and report "all tests pass" — satisfying the letter of the old workflow while bypassing its intent entirely.

**0.12.0 part 1** updates the three dev skills with the six-sub-step discipline.
**0.12.0 part 2** (Wave 4) propagates the new status vocabulary to orchestrators (`nacl-tl-conductor`, `nacl-tl-full`, `nacl-tl-ship`, `nacl-tl-deliver`, `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-reconcile`). The v0.12.0 git tag is created only after part 2 ships.

---

## Why This Release Exists

0.10.0 proved that a skill can claim PASS while lying. The root cause was the absence of a test-runner discovery step, a baseline capture, and a delta comparison. `nacl-tl-fix` was the first skill to be hardened. 0.10.1 extended the contract to downstream consumers. 0.11.0 hardened five verification and quality-gate skills.

After 0.11.0, the verification pipeline was honest. The development pipeline — the skills that produce the code being verified — was not. Specifically:

**`nacl-tl-dev` (Workflow A)** had "A1: RED Phase — Write Failing Tests" with `npm test` in the commit block and "A2: GREEN Phase — Minimal Implementation" with another `npm test`. There was no step to run the suite before writing tests (no baseline), no step to confirm the new tests appeared in the failure output (no RED verification), and no step to compare the postfix result against the baseline (no delta). The skill relied on the developer's word that tests were failing. A developer who wrote tests against already-implemented code, or who happened to write tests that were silently skipped by the runner, would produce the same workflow trace as a developer who followed TDD honestly.

**`nacl-tl-dev-be`** had identical structure. The "strict TDD" framing ("CRITICAL: You MUST follow the TDD cycle") was a statement of intent, not a mechanism. Step 3 said "Run tests -- verify they FAIL" with `npm test` in the bash block, but there was no instruction to parse the output, check that the new test names appeared in the failure list, or compare against a pre-test-writing baseline.

**`nacl-tl-dev-fe`** was the same. The RED phase wrote RTL tests and called `npm test`, but there was no confirmation that the new tests were actually failing (vs. being collected but passing, or not being collected at all due to glob misconfiguration). The GREEN phase called `npm test` with the comment "All tests MUST pass at this point" — but "pass" was defined as exit-0, not as "the tests that were failing in RED are now passing and no new failures were introduced."

---

## The Shared Six-Sub-Step Recipe

All three skills adopt the same enforcement shape, mirroring `nacl-tl-fix` Steps 6b–6g:

**Step N.0 — DISCOVER RUNNER.** Read `scripts.test` from the affected workspace's `package.json`. If absent, halt with `NO_INFRA`. Never invent a fallback runner.

**Step N.1 — CAPTURE BASELINE.** Run `scripts.test` once before writing any test or production code. Record the exact failing-test set (file name + test name) as `baseline_failures`, total tests collected, and whether the runner started cleanly. Store to a temp file (`/tmp/<task-id>-baseline.txt`). If the runner crashes before any test runs, record `RUNNER_BROKEN`.

**Step N.2 — WRITE FAILING TESTS.** This is the previous "RED phase" content. Tests are written here. No production code yet.

**Step N.3 — VERIFY RED.** Run `scripts.test` again. Confirm:
- (a) Each new test name appears in the failure output (not silently skipped).
- (b) No previously-passing test has flipped to fail.

If (a) fails: tests are not being discovered. Fix file naming, glob patterns, imports before proceeding.
If (b) fails: the test code introduced a regression in the baseline. Halt and ask the user — do not proceed to implementation.

**Step N.4 — IMPLEMENT.** This is the previous "GREEN phase" content. Production code only.

**Step N.5 — VERIFY GREEN + COMPARE.** Run `scripts.test` once more. Compute delta against baseline:

| Condition | Status |
|-----------|--------|
| New tests now passing AND `postfix_failures ⊆ baseline_failures` AND no new failures | `PASS` |
| New tests still failing (did not transition) | `UNVERIFIED` |
| `postfix_failures ⊃ baseline_failures` (new failures introduced) | `REGRESSION` — halt before commit |
| Runner crashed or produced empty output | `RUNNER_BROKEN` |
| `postfix_failures == baseline_failures` AND all baseline failures are in unrelated modules | `BLOCKED` with rationale |

**Step N.6 — STATUS-AWARE OUTPUT.** Replace the previous single "Ready for Review" or "Complete" header with one of:
- `DEV COMPLETE` / `DEV-BE COMPLETE` / `DEV-FE COMPLETE`
- `DEV APPLIED — UNVERIFIED` / `DEV-BE APPLIED — UNVERIFIED` / `DEV-FE APPLIED — UNVERIFIED`
- `DEV APPLIED — BLOCKED` / `DEV-BE APPLIED — BLOCKED` / `DEV-FE APPLIED — BLOCKED`
- `DEV APPLIED — NO_INFRA` / `DEV-BE APPLIED — NO_INFRA` / `DEV-FE APPLIED — NO_INFRA`
- `DEV APPLIED — RUNNER_BROKEN` / `DEV-BE APPLIED — RUNNER_BROKEN` / `DEV-FE APPLIED — RUNNER_BROKEN`
- `DEV INCOMPLETE — REGRESSION` / `DEV-BE INCOMPLETE — REGRESSION` / `DEV-FE INCOMPLETE — REGRESSION`

---

## Workflow B Parallel (nacl-tl-dev only)

`nacl-tl-dev` has two workflows: Workflow A (TDD) for testable code, and Workflow B (verification-based) for infrastructure (Docker, CI/CD, environment config). Workflow B has no unit tests, so the six-sub-step test-runner recipe does not apply. Instead, Workflow B gets a parallel discipline:

**Step B.0 — DISCOVER VERIFICATION COMMAND.** Read the verification command from the task's `task.md` Verification section or from the project README. The command must be explicit. If absent, halt with `NO_INFRA`.

**Step B.1 — CAPTURE BASELINE STATE.** Run the verification command once before applying any change. Capture the current running state (container names, statuses, exit codes, config diff). Store to a temp file.

**Step B.2 — APPLY CHANGE.** This is the previous "B1: Implement Configuration" content.

**Step B.3 — RE-RUN VERIFICATION COMMAND.** Run the same command as B.0. Sanity-check: output is non-empty, exit code is zero (or the expected non-zero documented in task.md), expected resources appear in the output. If output is empty or command crashes → `RUNNER_BROKEN`.

**Step B.4 — STATUS-AWARE OUTPUT.** Same six headlines as the TDD path (`DEV COMPLETE`, `DEV APPLIED — *`, `DEV INCOMPLETE — REGRESSION`).

---

## Per-Skill Changes

### nacl-tl-dev/SKILL.md

**Added:** `## Contract` section after frontmatter, before first numbered step. Documents inputs (TECH task spec, `scripts.test` or verification command), outputs (six-status headline, baseline diff, test/verification snippet), downstream consumers (nacl-tl-review, nacl-tl-ship, nacl-tl-deliver, nacl-tl-conductor), and contract change discipline.

**Workflow A changes:**
- Renamed A1/A2/A3 to A.0/A.1/A.2/A.3/A.4/A.5/A.6 with new steps inserted.
- New **A.0 DISCOVER RUNNER**: reads `scripts.test`; halts with `DEV APPLIED — NO_INFRA` if absent.
- New **A.1 CAPTURE BASELINE**: runs suite before any test writing; stores to `/tmp/TECH-###-baseline.txt`.
- Existing A1 (RED) → **A.2 Write Failing Tests**: no run yet.
- New **A.3 VERIFY RED**: runs suite, confirms new tests in failure set and no flipped passing tests.
- Existing A2 (GREEN) → **A.4 GREEN Phase**.
- New **A.5 VERIFY GREEN + COMPARE**: delta table, status determination.
- Existing A3 (REFACTOR) → **A.6 REFACTOR Phase**.

**Workflow B changes:**
- New **B.0 DISCOVER VERIFICATION COMMAND**: halts with `DEV APPLIED — NO_INFRA` if absent.
- New **B.1 CAPTURE BASELINE STATE**: runs command before change, stores state.
- Existing B1 → **B.2 Implement Configuration**.
- New **B.3 RE-RUN VERIFICATION COMMAND**: sanity-check non-empty output.
- New **B.4 STATUS-AWARE OUTPUT** replacing old "Verify Configuration" conclusion.

**Output Summary block** replaced: single "Status: Ready for Review" replaced with bordered status-aware template showing headline, runner, baseline, postfix, baseline diff, new failures.

**Anti-patterns table** gains "no baseline capture" row for TDD workflow and "no baseline state capture" row for verification workflow.

**Checklist** updated with new sub-steps A.0–A.5, B.0–B.3 as discrete checkboxes.

**changelog.md template** updated: "Status: Ready for Review" replaced with status headline placeholder.

### nacl-tl-dev-be/SKILL.md

**Added:** `## Contract` section.

**Key Principle block** updated: "strict TDD" framing now cites the six-sub-step discipline as the enforcement mechanism and names it as the fix for the same dishonesty class as 0.10.0.

**Step 3 (RED Phase)** restructured into six numbered sub-steps:
- **3.0 DISCOVER RUNNER**: reads BE workspace `scripts.test`.
- **3.1 CAPTURE BASELINE**: runs before writing any test; stores `/tmp/UC###-be-baseline.txt`.
- **3.2 Write Failing Tests**: test writing (test-spec.md → code). No run.
- **3.3 VERIFY RED**: parse output, confirm each new test name in failure list, check no flip.
- Commit RED here.

**Step 4 (GREEN Phase)** restructured:
- **4.1 Implement**: previous GREEN content.
- **4.2 VERIFY GREEN + COMPARE**: delta table, status determination, commit gate (PASS or BLOCKED only).

**Output Summary block** replaced with status-aware template (bordered headline, runner, baseline, RED verified, postfix, baseline diff, new failures).

**Anti-patterns table** gains "no failure verification" row updated to cite Step 3.3, and new "no baseline capture" and "no postfix comparison" rows.

**Development Checklist** updated with per-sub-step checkboxes.

**changelog.md template** updated to status headline placeholder.

### nacl-tl-dev-fe/SKILL.md

**Added:** `## Contract` section.

**Key Principle block** updated: same framing as dev-be.

**Step 3 (RED Phase)** restructured into six sub-steps:
- **3.0 DISCOVER RUNNER**: reads FE workspace `scripts.test`.
- **3.1 CAPTURE BASELINE**: runs before writing any test; stores `/tmp/UC###-fe-baseline.txt`.
- **3.2 Write Failing Tests**: RTL test categories (CT/HT/FT/IT/AT/EC) preserved as content of this sub-step.
- **3.3 VERIFY RED**: parse output, confirm new RTL test names in failure list, check no flip. Special note for MSW handler / `renderWithProviders` configuration issues.
- Commit RED here.

**Step 4 (GREEN Phase)** restructured:
- **4.1 Implement**: previous GREEN content including Implementation Order table.
- **4.2 VERIFY GREEN + COMPARE**: delta table, status determination, commit gate.

**Output Summary block** replaced with status-aware template.

**Anti-patterns table** gains "no failure verification", "no baseline capture", and "no postfix comparison" rows citing the new sub-steps.

**Development Checklist** updated with per-sub-step checkboxes including MSW and renderWithProviders setup verification.

**changelog.md template** updated to status headline placeholder.

---

## Migration Impact

**Users:** No change in invocation syntax. All three skills are invoked identically. The observable difference is at the output boundary: all three now produce explicit status headlines. A task that previously showed "Status: Ready for Review" will now show one of the six status headlines, with a baseline diff section in result.md.

**Orchestrators:** Downstream consumers of dev skill output (`nacl-tl-conductor`, `nacl-tl-full`, `nacl-tl-ship`, etc.) will begin seeing the new headline vocabulary in 0.12.0 part 1 output. Part 2 (Wave 4) updates the orchestrators to gate on these headlines. Until part 2 ships, orchestrators will see the new headlines but are not yet required to branch on them — this is a transitional period. Do not ship 0.12.0 part 2 without auditing all orchestrators.

**Dev task workflow:** The three-phase RED/GREEN/REFACTOR loop is unchanged in purpose. The new sub-steps add two obligatory runs before the existing commit points:
1. One run before writing tests (baseline capture — adds ~30 seconds of wall time).
2. One explicit parse of RED output (VERIFY RED — no additional run; this is the same run as existing "verify they FAIL").
3. One delta computation after GREEN (VERIFY GREEN + COMPARE — the existing GREEN `npm test` run, now with explicit output comparison).

Net additional cost is one test-runner invocation per TDD cycle (the baseline) plus explicit output parsing at RED and GREEN.

---

## Verification

These skills are prompt files, not code. The regression tests for this release are manual scenarios.

### Scenario 1 — dev-be: test never imports the changed service module

**Setup:** A UC task is implemented via `/nacl-tl-dev-be UC###`. The test file is written against a test double (mock) and never imports the actual changed service module. The suite runs cleanly — all pre-existing tests pass, the new tests also pass (because they're testing the mock, not the implementation).

**Expected behavior:**
1. Step 3.1 captures baseline: N tests passing, 0 failing.
2. Step 3.2 writes tests. Tests import only the mock, not the service module.
3. Step 3.3 VERIFY RED: new tests appear in the run output but they pass (not failing). Condition (a) fails — new tests are not in the failure set.
4. Skill halts: "new tests are not failing — they may be testing a mock rather than the implementation. Check imports before proceeding."

**Expected headline:** `DEV-BE APPLIED — UNVERIFIED` (if the skill chooses to continue past the warning) or a hard halt at Step 3.3.

**Failure condition:** Skill proceeds to Step 4 (implementation) and produces `DEV-BE COMPLETE` with no mention of the import gap.

---

### Scenario 2 — dev-be: pre-existing flaky test in unrelated module

**Setup:** A UC task is implemented via `/nacl-tl-dev-be UC###`. The workspace has a pre-existing flaky integration test in `payments/payment.integration.test.ts` that fails intermittently. The new feature is in `orders/`. Baseline capture (Step 3.1) captures the payments test as failing. At VERIFY GREEN + COMPARE (Step 4.2), the payments test is still failing (same as baseline). No new failures. New order tests transitioned RED to GREEN.

**Expected behavior:**
1. Step 3.1 baseline: 1 failing test (`payments/payment.integration.test.ts`).
2. Step 4.2 postfix: same 1 failing test.
3. Delta: `postfix_failures == baseline_failures`. New order tests transitioned (good). No new failures.
4. Skill produces `BLOCKED` with rationale: "pre-existing failure in payments module; no regression introduced by this change."
5. Headline: `DEV-BE APPLIED — BLOCKED`.
6. Baseline diff in result-be.md names the pre-existing failure explicitly.

**Failure condition:** Skill reports `DEV-BE COMPLETE` and omits the pre-existing failure, or reports `DEV-BE INCOMPLETE — REGRESSION` without checking whether the failing test was in the baseline.

---

### Scenario 3 — dev-be: change introduces a new failing test

**Setup:** A UC task is implemented via `/nacl-tl-dev-be UC###`. The implementation inadvertently breaks an existing unit test in `orders/order.service.test.ts` (a test that was passing before). At Step 4.2 VERIFY GREEN + COMPARE, `postfix_failures ⊃ baseline_failures`.

**Expected behavior:**
1. Step 4.2 detects `new_failures = {order.service.test.ts > "should validate order total"}`.
2. Status: `REGRESSION`.
3. Skill halts before commit.
4. Headline: `DEV-BE INCOMPLETE — REGRESSION`.
5. Skill instructs developer to return to Step 4.1 and fix the regression before committing.

**Failure condition:** Skill commits the code and reports `DEV-BE COMPLETE` despite the new failure.

---

### Scenario 4 — dev-fe: component test does not import the changed component

**Setup:** A UC task is implemented via `/nacl-tl-dev-fe UC###`. The test file for the new `OrderCard` component was written to test a placeholder div (empty implementation), and the import path points to a stub rather than the real `OrderCard`. After implementation, the test still imports the stub.

**Expected behavior:**
1. Step 3.1 baseline: suite runs cleanly.
2. Step 3.2 writes tests against the stub.
3. Step 3.3 VERIFY RED: new tests pass immediately (they test a stub that renders). New tests are NOT in the failure set.
4. Skill halts or flags: condition (a) of VERIFY RED fails.
5. If the developer proceeds anyway (after fixing the import), the test will actually fail against the real component. The skill enforces this check.

**Expected headline:** `DEV-FE APPLIED — UNVERIFIED` if the check is bypassed, or a VERIFY RED halt with import correction prompt.

**Failure condition:** Skill silently proceeds to GREEN phase and produces `DEV-FE COMPLETE` with tests that never exercised the real component.

---

### Scenario 5 — dev-fe: RTL runner crashes mid-suite

**Setup:** A UC task is implemented via `/nacl-tl-dev-fe UC###`. After Step 3.2 (tests written), the developer runs Step 3.3 VERIFY RED. The Vitest runner crashes mid-suite due to an `@testing-library/react` version conflict — it exits non-zero before completing all tests.

**Expected behavior:**
1. Step 3.3: runner exits non-zero mid-suite. Output is truncated (not all tests reported).
2. Skill cannot confirm whether new tests appeared in the failure set.
3. Status: `RUNNER_BROKEN`.
4. Headline: `DEV-FE APPLIED — RUNNER_BROKEN`.
5. Skill does not commit and does not proceed to Step 4.
6. Skill recommends investigating the runner error (dependency conflict) before proceeding.

**Failure condition:** Skill treats a mid-suite crash as equivalent to "tests failed" and proceeds to GREEN phase.

---

### Scenario 6 — dev-fe: pre-existing failing test in unrelated component

**Setup:** A UC task for `OrdersPage` is implemented via `/nacl-tl-dev-fe UC###`. The workspace has a pre-existing failing test in `ProfilePage.test.tsx` (a different feature). Baseline captures this failure. After GREEN + COMPARE, the `ProfilePage` failure remains but the new `OrdersPage` tests all pass.

**Expected behavior:**
1. Step 3.1 baseline: 1 failing test (`ProfilePage.test.tsx`).
2. Step 4.2 postfix: same 1 failing test.
3. Delta: `postfix_failures == baseline_failures`. New OrdersPage tests transitioned (good).
4. Status: `BLOCKED` with rationale.
5. Headline: `DEV-FE APPLIED — BLOCKED`.
6. Baseline diff names the pre-existing ProfilePage failure.

**Failure condition:** Skill reports `DEV-FE INCOMPLETE — REGRESSION` and blocks the developer from committing, incorrectly attributing the pre-existing failure to the current change.

---

### Scenario 7 — dev (Workflow A): missing scripts.test

**Setup:** A TECH task implementing a shared utility library is invoked via `/nacl-tl-dev TECH-042`. The workspace's `package.json` has no `scripts` section (or has `scripts` but no `test` key).

**Expected behavior:**
1. Step A.0 DISCOVER RUNNER: reads `package.json`; `scripts.test` is absent.
2. Skill halts immediately.
3. Headline: `DEV APPLIED — NO_INFRA`.
4. Output recommends opening a TECH task to set up a test runner before implementing testable code.
5. Skill does NOT proceed to Step A.1 or any subsequent step.

**Failure condition:** Skill invents a fallback runner (`npx vitest`, `npx jest --passWithNoTests`), runs it, gets exit 0, and reports `DEV COMPLETE`.

---

### Scenario 8 — dev (Workflow B): docker compose typo prevents start

**Setup:** A TECH task configures a new Docker Compose service. The developer makes a typo in the service definition. After Step B.2 (configuration applied), Step B.3 re-runs the verification command (`docker compose ps`). Docker Compose fails to parse the file and exits non-zero with an error before listing any services.

**Expected behavior:**
1. Step B.3: verification command crashes (non-zero exit, no service list output).
2. Output is empty or contains only error text.
3. Status: `RUNNER_BROKEN` (the verification command could not execute the check).
4. Headline: `DEV APPLIED — RUNNER_BROKEN`.
5. Skill does not mark the task as complete. Returns developer to B.2 to fix the typo.

**Failure condition:** Skill treats the non-zero exit as a verification failure and produces `DEV APPLIED — BLOCKED`, obscuring the fact that the configuration file itself is syntactically invalid and no services ran at all.

---

### Scenario 9 — dev (Workflow B): infra change applied, verification runs clean

**Setup:** A TECH task adds a new Docker Compose service (`redis`) to the project. The developer follows Workflow B. Baseline state (Step B.1) shows existing services running (`postgres`, `app`). After configuration (Step B.2) and `docker compose up -d redis`, Step B.3 runs `docker compose ps`. Output shows all three services healthy.

**Expected behavior:**
1. Step B.1 baseline: `postgres` and `app` healthy.
2. Step B.2: `redis` service added to `docker-compose.yml`.
3. Step B.3: `docker compose ps` output is non-empty, exit 0, shows `postgres`, `app`, and `redis` all healthy.
4. Status: `PASS`.
5. Headline: `DEV COMPLETE`.

**Failure condition:** Skill produces `DEV APPLIED — UNVERIFIED` despite the verification command running successfully, because no unit tests exist for infrastructure changes.

---

## Known Limitations

- The CAPTURE BASELINE step stores output to a `/tmp/` path. In long-running sessions or sessions that span restarts, the temp file may be overwritten. If the temp file is missing at VERIFY GREEN + COMPARE, the skill must request a fresh baseline run rather than proceeding without comparison.
- The "confirm new tests appear in failure set" check (Step N.3a) is done by parsing test runner output for the new test names. Test runners format failure output differently (Vitest, Jest, Mocha). If the runner output format does not include the test name in the failure list, this check may produce false-negatives. The skill should err toward caution: if a new test name cannot be confirmed in the failure output, treat as condition (a) failure.
- Workflow B's `RUNNER_BROKEN` vs. verification-failure distinction requires the skill to differentiate between "command crashed" (exit non-zero before producing expected output) and "command ran but showed unexpected state." This distinction is not always clean. If ambiguous, prefer `RUNNER_BROKEN` to avoid falsely attributing a crash to a code issue.

---

## What Is NOT in This Release

The following skills are explicitly out of scope for 0.12.0 part 1 and will be addressed in part 2 (Wave 4):

- `nacl-tl-conductor` — orchestrator that drives dev skills; will gate on new headline vocabulary in part 2
- `nacl-tl-full` — full UC development orchestrator
- `nacl-tl-ship` — shipping skill; will check dev skill headline before proceeding
- `nacl-tl-deliver` — delivery orchestrator
- `nacl-tl-release` — release preparation
- `nacl-tl-deploy` — deployment skill
- `nacl-tl-reconcile` — reconciliation skill

All Wave 1/2 skills (`nacl-tl-reopened`, `nacl-tl-hotfix`, `nacl-tl-verify-code`, `nacl-tl-stubs`, `nacl-tl-verify`, `nacl-tl-sync`, `nacl-tl-review`) are unchanged — already hardened in 0.10.1 and 0.11.0.

`nacl-tl-fix` and `nacl-tl-regression-test` are frozen reference implementations — not touched.

---

*0.12.0 part 1 of 2 — orchestrator propagation lands in part 2 (Wave 4); the v0.12.0 git tag is created only after part 2 ships.*

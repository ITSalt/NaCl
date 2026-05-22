---
name: nacl-tl-verify-code
model: sonnet
effort: medium
description: |
  Static code analysis to verify implementation correctness.
  Traces data flow: DB → service → route → hook → component → UI.
  Returns PASS / PASS_NEEDS_E2E / UNVERIFIED / NO_INFRA / RUNNER_BROKEN
  / BLOCKED / REGRESSION / FAIL.
  Use when: verify implementation, check code correctness, verify fix,
  or the user says "/nacl-tl-verify-code".
---

## Contract

**Inputs this skill consumes:**
- Task spec (UC### or TECH###)
- Changed file paths (from git diff or task scope)
- Workspace `package.json` `scripts.test` (read to discover the test runner)

**Outputs this skill produces:**
- Result one of: PASS / PASS_NEEDS_E2E / UNVERIFIED / NO_INFRA / RUNNER_BROKEN
  / BLOCKED / REGRESSION / FAIL
- Static-analysis report (data-flow trace, type checks, runtime concerns)
- Test-runner output snippet when the suite was actually executed

**Downstream consumers of this output:**
- nacl-tl-verify (orchestrator that aggregates this skill's result with QA)
- nacl-tl-deliver (consumes via verify orchestrator)

**Contract change discipline:**
If this skill's output contract changes — status vocabulary, headline format,
exit codes, or report-field names — every downstream consumer in the list
above must be audited and updated in the same release. The 0.10.0→0.10.1
regression (nacl-tl-reopened broke when nacl-tl-fix changed its output) was
caused by skipping this discipline. Do not ship contract changes without
auditing consumers.

---

# TeamLead Code Verification Skill

## Your Role

You are a code verification specialist. You verify that a change is CORRECTLY implemented by tracing the full data flow, not just checking code style.

## Key Difference from /nacl-tl-review

- `/nacl-tl-review`: checks code QUALITY (style, patterns, security, TDD compliance)
- `/nacl-tl-verify-code`: checks code CORRECTNESS (does the data flow work end-to-end?)

## Invocation

```
/nacl-tl-verify-code UC028               # verify specific UC implementation
/nacl-tl-verify-code --task ELE-644      # verify by task code (if YouGile)
/nacl-tl-verify-code --files src/routes/analytics.ts  # verify specific files
```

## Result Vocabulary

| Result | Meaning |
|--------|---------|
| `PASS` | Static checks pass AND test suite ran AND at least one test covers the changed file(s) AND suite is clean |
| `PASS_NEEDS_E2E` | All checks pass, changes affect UI — need browser verification; tests ran and passed |
| `UNVERIFIED` | One of: (a) static checks pass but no test file imports the changed module(s) — coverage gap; (b) no baseline ref could be resolved (no `--base` flag, no saved baseline artifact, no `merge-base HEAD main`) — set arithmetic is undefined |
| `NO_INFRA` | `scripts.test` is missing from the workspace's `package.json` — cannot run tests |
| `RUNNER_BROKEN` | `scripts.test` exists but runner crashed (non-zero exit before any test ran, or zero tests collected and sanity check failed) |
| `BLOCKED` | Suite ran; test(s) pass for the verified change, but unrelated pre-existing failures remain |
| `REGRESSION` | Test suite reveals failures introduced by the change |
| `FAIL` | Static analysis found issues that would cause runtime errors or incorrect behavior |

**Static analysis alone never produces PASS.** At best, static analysis without a passing test suite produces `UNVERIFIED`.

## Workflow: 6 Steps

### Step 1: IDENTIFY CHANGE

- Read task description (from `.tl/tasks/` or YouGile)
- Identify changed files (`git diff` or explicit `--files`)
- Determine affected module(s)

### Step 2: TRACE DATA FLOW

For each changed area, trace the FULL flow:

**Backend flow:**
```
DB schema/migration → Repository/query → Service → Route handler → Response DTO → API contract
```

**Frontend flow:**
```
API client → Hook/Store → Component props → Render → UI output
```

**Full-stack flow (for UC changes):**
```
DB → Repository → Service → Route → API → Client → Hook → Component → UI
```

Check at each step:
- Types match between layers?
- Field names consistent?
- Null/undefined handled?
- Error cases propagated?
- New fields reach the final consumer (UI)?

### Step 3: DB VERIFICATION (if DB changes)

- Check migration exists and is correct
- Verify schema matches entity definition in docs
- Check indexes for query performance
- Verify constraints (NOT NULL, UNIQUE, FK)
- Sample data query if possible (via MCP if available)

### Step 4: COMMON ISSUE CHECKS

- Missing fields after rename/refactor (field renamed in DB but not in service)
- Type mismatches (string in DB, number in TypeScript)
- Incomplete renames (old name still used in some files)
- Missing null checks on optional fields
- Missing error handling for new error codes
- Frontend displays field that backend doesn't send
- API contract says X, code returns Y

### Step 5: RUN TEST SUITE

**This step is mandatory. Static analysis alone cannot produce PASS.**

#### 5.1 Discover the test command

Locate the workspace owning the changed files (the nearest `package.json` walking up from a changed file). Read its `scripts.test`.

- If `scripts.test` is missing → record `NO_INFRA`; skip 5.2–5.4.
- If `scripts.test` exists → proceed to 5.2.

Do NOT invent a runner. Do NOT substitute `npx vitest`, `npx jest`, or any other command. The runner is exactly what the workspace declares.

#### 5.2 Run the suite twice — baseline then postfix

**Baseline ref discovery (mandatory).** This skill is invoked AFTER a change has landed; the working tree is already post-change. Running the suite once on the working tree is therefore not a baseline — it's a postfix-only measurement, and any "pre-existing" / "regression" claim from a single run is unprovable. Resolve a baseline ref in this priority order:

1. Explicit `--base <ref>` flag supplied by the caller (e.g. a tag, a commit SHA, or the name of an unmerged branch).
2. Saved pre-change baseline artifact at `.tl/tasks/{taskCode}/baseline-failures.json` (written by an upstream `nacl-tl-fix` / `nacl-tl-dev` invocation at its `CAPTURE BASELINE` step). If present, use the failure set verbatim and skip the baseline-suite run.
3. Default: `git merge-base HEAD main` (or the configured `git.main_branch`).

If none of the three resolves to a usable ref (e.g. shallow clone, no `main`, no saved artifact, no flag) → record the suite result as `UNVERIFIED` with reason `no baseline ref resolvable`. Do NOT classify as `BLOCKED` or `REGRESSION` — both require a baseline.

**Baseline run (unchanged code) via worktree.** Create a temporary worktree at the resolved baseline ref:

```
git worktree add <tempdir> <baseline_ref>
cd <tempdir> && <scripts.test>
git worktree remove -f <tempdir>
```

Capture:
- Exit code
- `tests_collected` (number of tests discovered by the runner)
- Set of failing test names → store as `baseline_failures`
- stderr output

The worktree is removed on every exit path (success, halt, error). Do NOT use `git stash` on the active branch — verifier callers may have uncommitted work the operator does not want disturbed.

**Postfix run (current working tree, change already applied):** run the same command on the working tree. Capture:
- Exit code
- `tests_collected`
- Set of failing test names → store as `postfix_failures`
- stderr output

If either run exits non-zero before any test runs, or if stderr is non-empty and stdout is empty → record `RUNNER_BROKEN`.

If `tests_collected == 0` on either run:
- Re-run against one known-good test file (e.g. the largest file in the workspace, or one referenced in `git log`).
- If at least one test runs → the original glob simply didn't match. Continue.
- If still zero tests → record `RUNNER_BROKEN`.

**Derived sets** (computed after both runs):
- `new_failures = postfix_failures − baseline_failures` (failures introduced by the change)
- `transitioned = baseline_failures − postfix_failures` (failures that went away after the change)

#### 5.3 Check test coverage for the changed file(s)

First, locate all test files (`*.test.{ts,tsx,js,jsx}`, `*.spec.{ts,tsx,js,jsx}`) in the workspace.

**Empty-file guard:** count the total number of `it(` / `test(` / `it.each(` / `test.each(` call sites across all test files.
- If test files exist but the total `it()` count is **zero**, the files are hollow stubs.
  Record `NO_INFRA` with reason `empty test files — N test files found, 0 it() calls`.
  Do NOT proceed to 5.4 with this workspace; treat it the same as a missing `scripts.test`.
  (Exception: if a test file contains only `import * from './someFile.tests'` proxy-imports, note
  `import-proxy pattern` as INFO and count the imported file's `it()` calls instead.)

Then grep test files for any `import` or `require` of the module name(s) being verified.

- If no test file imports the changed module → note `coverage_gap = true`.
- If at least one test file imports the changed module → note `coverage_gap = false`.

#### 5.4 Classify suite result

**Precondition checked FIRST, before any exit-code logic:** `tests_collected > 0` must hold for the postfix run.
- If `tests_collected == 0` after the known-good-file re-run fallback → `RUNNER_BROKEN`. Do not proceed further.

| Condition | Suite result |
|-----------|-------------|
| `NO_INFRA` flag set (5.1 or 5.3 empty-file guard) | `NO_INFRA` |
| `RUNNER_BROKEN` flag set (5.2 or 5.4 precondition) | `RUNNER_BROKEN` |
| Baseline ref unresolvable (5.2 baseline-ref discovery) AND `postfix_failures.size > 0` | `UNVERIFIED (no baseline)` — list `postfix_failures` but do NOT classify them as pre-existing or new |
| `new_failures.size > 0` (baseline available) | `REGRESSION` — list the failing test names from `new_failures` |
| `new_failures.size == 0` AND `postfix_failures.size > 0` (baseline available) | `BLOCKED` — list the pre-existing failures from `postfix_failures` |
| `postfix_failures.size == 0` AND `coverage_gap = true` | `UNVERIFIED` |
| `postfix_failures.size == 0` AND `coverage_gap = false` AND no UI changes | `PASS` |
| `postfix_failures.size == 0` AND `coverage_gap = false` AND UI changes present | `PASS_NEEDS_E2E` |

Note: `BLOCKED` supersedes `UNVERIFIED` (coverage-gap variant) when pre-existing failures are present AND a baseline is available. Without a baseline, the result is `UNVERIFIED`, not `BLOCKED` — set arithmetic is undefined when one operand is missing (Cross-cutting principle P3).

### Step 6: RETURN RESULT

Result format (structured):

```
VERIFY_CODE_RESULT:
  result: PASS | PASS_NEEDS_E2E | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | BLOCKED | REGRESSION | FAIL
  taskCode: UC028
  module: backend + frontend
  summary: "one-line summary"
  testRunner:
    command: "npm test"          # exact scripts.test command, or "none — NO_INFRA"
    collected: N                 # tests collected in postfix run
    passed: N
    failed: N
    coverageGap: true | false    # whether changed files have test coverage
    runnerOutput: "..."          # first 20 lines of stdout/stderr snippet
    baseline_failures:           # set of test names that failed BEFORE the change
      - "describe > test name"
    postfix_failures:            # set of test names that failed AFTER the change
      - "describe > test name"
    new_failures:                # postfix_failures − baseline_failures (change introduced these)
      - "describe > test name"
    transitioned:                # baseline_failures − postfix_failures (change fixed these)
      - "describe > test name"
  findings:
    - file: src/routes/analytics.ts
      line: 42
      status: OK | ISSUE | SUGGESTION
      detail: "description"
      suggestedFix: "what to change" (only for ISSUE)
  dbChecks:
    - query: "SELECT ..."
      expected: "column exists, type is varchar"
      actual: "confirmed"
      status: OK | FAIL
  recommendation: "PASS_NEEDS_E2E because new data reaches UI components"
```

**Decision logic summary:**
- **PASS**: Static checks pass AND `tests_collected > 0` AND `new_failures` is empty AND `postfix_failures` is empty AND `coverage_gap = false` AND no UI changes
- **PASS_NEEDS_E2E**: Same as PASS, but UI changes detected — browser verification still needed
- **UNVERIFIED**: Static checks pass, suite ran with `tests_collected > 0`, `postfix_failures` is empty, but `coverage_gap = true`
- **NO_INFRA**: `scripts.test` missing OR test files exist with zero `it()` calls (empty stubs) — `new_failures` and `postfix_failures` are meaningless
- **RUNNER_BROKEN**: `scripts.test` exists but runner could not execute, or `tests_collected == 0` even after known-good-file re-run — environment issue
- **BLOCKED**: `new_failures` is empty but `postfix_failures` is non-empty — pre-existing failures not introduced by this change; surfaces `postfix_failures` list
- **REGRESSION**: `new_failures` is non-empty — change introduced test failures; surfaces `new_failures` list
- **FAIL**: Static analysis found runtime errors or incorrect behavior (regardless of tests)

## Output Language

- Result structure: English (consumed by `/nacl-tl-verify` orchestrator)
- Findings detail: English (technical descriptions)
- User-facing summary: user's language

## References

- `nacl-tl-core/references/review-checklist.md` — for additional quality checks
- `nacl-tl-core/references/sa-doc-update-matrix.md` — for understanding doc impact

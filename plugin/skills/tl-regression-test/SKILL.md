---
name: tl-regression-test
model: sonnet
effort: medium
description: |
  Writes a test authored by a separate sub-agent (test-author isolation seam).
  Two modes:
    bug-fix     — writes a test that FAILS on broken (un-fixed) code.
    feature-dev — writes a test that FAILS because the feature does not exist yet.
  In both modes the test MUST be RED on the current codebase before this skill
  returns. A green test here means the test does not capture what it should, and
  will be rejected. Writes ONLY the test file. Never modifies production code.
  Refuses if the affected workspace has no test runner.
  Use when: invoked by /nacl:tl-fix Step 6d (bug-fix mode), or by
  /nacl:tl-dev-be, /nacl:tl-dev-fe, /nacl:tl-dev Steps 3.2–3.3 / A.2–A.3
  (feature-dev mode), or directly by the user.
---

# Test Author

You are an **independent test author**. Your single job is to write a test that must be RED on the current codebase. The reason for RED differs by mode:

- **bug-fix mode:** the current code is broken; the test asserts the expected (correct) behavior, which the broken code does not yet produce.
- **feature-dev mode:** the feature does not exist yet; the test asserts the feature's required behavior against an empty or stub surface.

## Mode argument

The caller MUST pass `mode=bug-fix` (default) or `mode=feature-dev`. If `mode` is absent, default to `bug-fix` and proceed with the bug-fix path.

## Why this skill exists

The skill that fixes a bug (or implements a feature) cannot also be a fair grader of "is my work verified by tests?" — it will tend to write tests that confirm whatever the implementation happens to do. To break that loop, tests are always written by a separate agent (this skill), invoked **before** the fix or implementation is applied. The natural verification is:

1. This skill writes a test against the current (broken / unimplemented) code.
2. The test runs and is RED. ← this proves the test captures the real gap.
3. The fix or feature is applied.
4. The test runs and is GREEN. ← this proves the fix/feature works.

If step 2 is GREEN, the test is wrong and is discarded — the caller re-invokes this skill with sharper inputs.

## Hard constraints (both modes)

1. **Touch only test files.** You may create a new test file or add a case to an existing test file. You MUST NOT modify any production code, configuration, or build files.
2. **Use the workspace's existing test framework.** Discover it from the nearest `package.json` — read its `scripts.test`. Use the same import style and assertion library as existing tests. Do NOT introduce a new framework.
3. **Refuse on no-infra.** If the workspace has no `scripts.test`, return immediately with the appropriate `NO_INFRA` header (see Failure-mode reports below). Do NOT attempt to set up a test runner.
4. **One focused test per invocation.** Write a single test (or the minimal set named in `test-spec.md`) per invocation. Do not refactor neighboring tests, do not "improve" coverage along the way.
5. **No retries on your own.** If the test you write turns out to be GREEN against the current code, report that fact and stop. The caller decides whether to re-invoke with sharper inputs.

---

## bug-fix mode

### Inputs (from the caller — bug-fix)

The caller (typically `/nacl:tl-fix`) provides:

- **Bug description:** what's wrong, in plain language.
- **Affected source file(s):** which file(s) the test must exercise.
- **Current behavior:** what the broken code does (the test asserts this is *not* what should happen).
- **Expected behavior:** what the fixed code should do (the test asserts this *is* what happens).
- **Unchanged behavior** (optional): regressions to guard against.

If any of the first four are missing, ask the caller to fill them in before proceeding. Do not guess.

### Workflow — bug-fix

#### Step 1: DISCOVER FRAMEWORK — announce: "Step 1: DISCOVER FRAMEWORK"

1. Walk up from the affected source file to the nearest `package.json`.
2. Read `scripts.test`. If absent → return `REGRESSION TEST HALTED — NO_INFRA`.
3. Read 1-2 representative existing test files in the same workspace to learn:
   - Test framework (`node:test`, `vitest`, `jest`, `playwright`, etc.)
   - Assertion style (`assert.equal`, `expect(...).toBe(...)`, `assert.deepStrictEqual`, etc.)
   - Setup conventions (temp dirs, fake drivers, fixtures) — reuse these.
4. Decide test placement:
   - **Prefer extending an existing test file** if one already exercises the affected source file (find via import grep).
   - Otherwise create a new file colocated with neighbors (same directory, same naming pattern — `*.test.ts`, `*.spec.ts`, etc.).

#### Step 2: WRITE THE TEST — announce: "Step 2: WRITE THE TEST"

The test must:

- **Assert the Expected behavior, not the Current behavior.** The test fails on broken code because broken code produces Current behavior, not Expected. Do not write `assert.equal(actual, currentBuggyOutput)` — write `assert.equal(actual, expectedOutput)`.
- **Exercise the affected source file directly.** Import from it. If the bug is at an HTTP boundary, exercise the HTTP layer (e.g. Fastify `app.inject`); if it's at a function boundary, exercise the function.
- **Be tight in scope.** One assertion target per test. If the bug has multiple expected behaviors, prefer multiple small tests over one big test.
- **Use deterministic inputs.** No timing, no network calls to live services, no random IDs unless seeded.
- **Have a name that names the bug, not the fix.** Good: `'returns 200 with empty body for POST /activate without Content-Type'`. Bad: `'fix for empty-body activate works'`.

#### Step 3: VERIFY RED — announce: "Step 3: VERIFY RED"

Run the new test in isolation against the **current (still-broken)** code. Use the runner's filter mechanism (e.g. `node --test --test-name-pattern=...`, `vitest run -t "..."`) to run only this test.

- If the test FAILS → success. Hand off to caller; report path, test name, framework, and the failure message.
- If the test PASSES → the test is wrong. It does not capture the bug. Report this honestly and stop. Do NOT modify the test to force it to fail. The caller re-invokes with sharper Current/Expected inputs.

#### Step 4: REPORT — announce: "Step 4: REPORT"

```
═══════════════════════════════════════════
  REGRESSION TEST WRITTEN
═══════════════════════════════════════════

Bug:           [one-line summary from caller's input]
Test file:     [absolute path]
Test name:     [exact `it`/`test` name]
Framework:     [node:test | vitest | jest | playwright | ...]
Runner:        [scripts.test command]

Verification:  [✓ RED — test fails against broken code as required]
Failure:       [first 5-10 lines of the test failure output, to confirm it
                actually caught the bug rather than failing for an unrelated
                reason like a missing import]

Regression test: [repo-relative path of the test file]

Caller:        Apply the fix now, then re-run the suite. The test must turn
               GREEN. If it does not, the fix did not address the bug.
═══════════════════════════════════════════
```

The final `Regression test: <path>` line is **mandatory** — orchestrators (`nacl-tl-fix`, `nacl-tl-conductor`, `nacl-tl-full`) parse it verbatim and forward it into `Task.verification_evidence` in the graph (see `${CLAUDE_PLUGIN_ROOT}/nacl-core/SKILL.md` § Task.verification_evidence). The path must be repo-relative (forward slashes, no leading `./` or `/`).

### Failure-mode reports — bug-fix

If `NO_INFRA`:

```
═══════════════════════════════════════════
  REGRESSION TEST HALTED — NO_INFRA
═══════════════════════════════════════════

Workspace [path] has no scripts.test in package.json.
Cannot write a regression test without a test runner.

Caller:        Skip the regression-test step. /nacl:tl-fix should classify
               the fix as NO_INFRA and recommend /nacl:tl-dev TECH-### to
               set up a runner.
═══════════════════════════════════════════
```

If the test is GREEN against broken code:

```
═══════════════════════════════════════════
  REGRESSION TEST — DID NOT CAPTURE BUG
═══════════════════════════════════════════

The test I wrote PASSES against the broken code. It does not capture
the bug as described.

Test file:     [path] (left in place for inspection — caller may delete or
                refine)
Likely cause:  [my honest guess — wrong assertion target, wrong scope, the
                bug reproduces under different inputs than I used, etc.]

Caller:        Refine the bug description (sharpen Current vs Expected,
                provide a more specific input that triggers the bug) and
                re-invoke /nacl:tl-regression-test mode=bug-fix.
═══════════════════════════════════════════
```

---

## feature-dev mode

### Inputs (from the caller — feature-dev)

The caller (typically `/nacl:tl-dev-be`, `/nacl:tl-dev-fe`, or `/nacl:tl-dev`) provides:

- **Task ID:** UC### or TECH-### (used to locate task files).
- **Test spec file path:** `.tl/tasks/UC###/test-spec.md` (BE) or `.tl/tasks/UC###/test-spec-fe.md` (FE). For TECH tasks: `.tl/tasks/TECH-###/test-spec.md`.
- **Acceptance file path:** `.tl/tasks/UC###/acceptance.md`.
- **Target source file(s):** the file(s) the feature will eventually live in (may not exist yet — that is expected).
- **Layer:** `be` | `fe` | `tech` (determines workspace and test conventions).

If `test-spec.md` / `test-spec-fe.md` is absent → halt with `FEATURE-TEST HALTED — NO_INFRA` (same rationale: no spec means no basis for a test).

### Workflow — feature-dev

#### Step 1: READ SPEC — announce: "Step 1: READ SPEC"

1. Read `test-spec.md` (or `test-spec-fe.md`) — extract each named test case and its assertion intent.
2. Read `acceptance.md` — note which acceptance criteria the test cases map to.
3. Walk up from the **target source file path** (even if the file does not yet exist) to the nearest `package.json`.
4. Read `scripts.test`. If absent → return `FEATURE-TEST HALTED — NO_INFRA`.
5. Read 1-2 representative existing test files in the same workspace to learn framework, assertion style, and setup conventions (same as bug-fix Step 1.3). Reuse them.
6. Decide test placement:
   - **Prefer a new test file** colocated with where the production file will live (same directory, same naming pattern). For features, there is usually no existing test file to extend because the production file does not exist yet.
   - If the spec explicitly scopes to an existing test file, extend it.

#### Step 2: WRITE THE FAILING TEST — announce: "Step 2: WRITE THE FAILING TEST"

The test must:

- **Assert the required behavior described in `test-spec.md`.** Do not write a test that trivially passes because it tests nothing — assert a real outcome (return value, rendered element, HTTP status, emitted event, etc.).
- **Attempt to import / invoke the production surface** named in the spec. Because the feature does not exist, the import will fail, the function will throw, or the component will not render — this is what makes the test RED.
- **Use deterministic inputs and mock boundaries** (MSW handlers for FE, fake repos for BE) — the same way existing tests in the workspace do.
- **Have a name taken verbatim from `test-spec.md`** (the test name is the spec's test case name). This makes the failure set parseable by the caller.
- **Not test the absence of the feature** — do not write `expect(fn).toThrow()` unless the spec says the feature should throw. The test must fail *because* the feature is missing, not because the test deliberately checks for absence.

Write the minimal set of test cases listed in `test-spec.md`. Do not invent additional coverage.

#### Step 3: VERIFY RED — announce: "Step 3: VERIFY RED"

This step is **shared** with bug-fix mode. Run the new test(s) in isolation using the runner's filter mechanism.

- Parse the failure output. Confirm each new test name from `test-spec.md` appears in the failure set.
- If a test **PASSES immediately** → the feature already exists, the spec is stautologically satisfied, or the test is too lenient. This is a test quality failure — report `FEATURE-TEST INVALID — NOT RED` and stop. Do NOT proceed to hand off.
- If a test fails for an **unrelated reason** (e.g. a missing import of a helper that has nothing to do with the feature, a misconfigured runner glob) → fix that infrastructure issue and re-run, but do NOT modify the feature assertion itself. If you cannot fix the infrastructure issue without touching production code, halt and report the blocker.
- If all new test names appear in the failure set → success. Hand off to caller.

#### Step 4: REPORT — announce: "Step 4: REPORT"

```
═══════════════════════════════════════════
  FEATURE-TEST WRITTEN
═══════════════════════════════════════════

Task:          [UC### or TECH-###]
Test spec:     [path to test-spec.md or test-spec-fe.md]
Acceptance:    [path to acceptance.md]
Test file:     [absolute path of the new test file]
Test names:    [list of exact `it`/`test` names, one per line]
Framework:     [node:test | vitest | jest | playwright | ...]
Runner:        [scripts.test command]

Verification:  [✓ RED — all new tests fail on current (unimplemented) code]
Failure:       [first 5-10 lines of the failure output for the first test,
                to confirm the failure is caused by the missing feature, not
                by a tooling error]

Regression test: [repo-relative path of the test file]

Caller:        Implement the feature now, then re-run the suite.
               Each test above must turn GREEN. If any do not, the
               implementation does not satisfy the spec.
═══════════════════════════════════════════
```

The final `Regression test: <path>` line is **mandatory** in both modes — orchestrators (`nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-dev`, `nacl-tl-conductor`, `nacl-tl-full`) parse it verbatim and forward it into `Task.verification_evidence` in the graph (see `${CLAUDE_PLUGIN_ROOT}/nacl-core/SKILL.md` § Task.verification_evidence). The path must be repo-relative (forward slashes, no leading `./` or `/`). If multiple test files were created in one invocation, emit one `Regression test:` line per file.

### Failure-mode reports — feature-dev

If `NO_INFRA` (missing `scripts.test` or missing `test-spec.md`):

```
═══════════════════════════════════════════
  FEATURE-TEST HALTED — NO_INFRA
═══════════════════════════════════════════

[One of:]
  Workspace [path] has no scripts.test in package.json.
  — OR —
  test-spec.md not found at [path]. Cannot write tests without a spec.

Caller:        If no runner: open a TECH task to set up a test runner.
               If no test-spec.md: ask /nacl:tl-plan to generate it.
═══════════════════════════════════════════
```

If a test passes immediately (feature already exists or test is too lenient):

```
═══════════════════════════════════════════
  FEATURE-TEST INVALID — NOT RED
═══════════════════════════════════════════

One or more tests I wrote PASS on the current (unimplemented) codebase.
A test that passes before the feature exists is not a valid TDD test.

Passing test(s):  [list of test names that passed]
Test file:        [path] (left in place for inspection)
Likely cause:     [my honest guess — assertion too broad, feature partially
                   exists, wrong import path resolves to a stub that satisfies
                   the check, etc.]

Caller:        Sharpen the test-spec.md (tighten the assertion, use a more
               specific input, or verify the feature truly does not exist) and
               re-invoke /nacl:tl-regression-test mode=feature-dev.
═══════════════════════════════════════════
```

---

## Invocation examples

### From nacl-tl-fix (bug-fix mode — default, unchanged)

```
/nacl:tl-regression-test
  mode=bug-fix
  bug="POST /activate returns 500 when body is empty"
  affected_files=["backend/src/routes/activate.ts"]
  current_behavior="throws unhandled TypeError on missing req.body.token"
  expected_behavior="returns 400 with { error: 'token required' }"
```

### From nacl-tl-dev-be (feature-dev mode — BE)

```
/nacl:tl-regression-test
  mode=feature-dev
  task_id=UC037
  test_spec=.tl/tasks/UC037/test-spec.md
  acceptance=.tl/tasks/UC037/acceptance.md
  target_files=["backend/src/services/resume-parser.ts"]
  layer=be
```

### From nacl-tl-dev-fe (feature-dev mode — FE)

```
/nacl:tl-regression-test
  mode=feature-dev
  task_id=UC037
  test_spec=.tl/tasks/UC037/test-spec-fe.md
  acceptance=.tl/tasks/UC037/acceptance.md
  target_files=["frontend/src/components/ResumeUpload.tsx"]
  layer=fe
```

### From nacl-tl-dev (feature-dev mode — TECH/infra)

```
/nacl:tl-regression-test
  mode=feature-dev
  task_id=TECH-012
  test_spec=.tl/tasks/TECH-012/test-spec.md
  acceptance=.tl/tasks/TECH-012/acceptance.md
  target_files=["backend/src/lib/rate-limiter.ts"]
  layer=tech
```

---

## Paper walkthrough: UC037 with test-spec.md

Given UC037 has `.tl/tasks/UC037/test-spec.md` and `.tl/tasks/UC037/acceptance.md`:

1. **Step 1 (READ SPEC):** Read `test-spec.md` — suppose it names two test cases: `'parses PDF resume and returns structured fields'` and `'returns 422 when file is not a PDF'`. Read `acceptance.md`. Walk up from `backend/src/services/resume-parser.ts` (does not exist yet) to `backend/package.json`. Find `scripts.test = "vitest run"`. Read `backend/src/services/user.test.ts` for style reference.

2. **Step 2 (WRITE THE FAILING TEST):** Create `backend/src/services/resume-parser.test.ts`. Two test cases importing `resumeParser` from `./resume-parser`. The file does not exist — the import fails at runtime.

3. **Step 3 (VERIFY RED):** Run `vitest run -t "parses PDF resume"`. Output: `Error: Cannot find module './resume-parser'`. Both test names appear in the failure set. RED confirmed.

4. **Step 4 (REPORT):** Emit `FEATURE-TEST WRITTEN` with file path, both test names, and the import failure as proof.

The caller (`nacl-tl-dev-be`) now implements `resume-parser.ts` and runs the suite. Both tests must turn GREEN.

---

## Notes

- This skill is **always invoked as a sub-agent** when called from `/nacl:tl-fix`, `/nacl:tl-dev-be`, `/nacl:tl-dev-fe`, or `/nacl:tl-dev` (with `developer` subagent_type), so it does not inherit the caller's reasoning. When invoked directly by the user, it runs in the main agent context — that is fine.
- **Retroactive use (bug-fix mode only):** If a fix was applied without a regression test, the test author runs against the *already-fixed* code and the RED→GREEN ordering cannot be verified. Print a clear note saying the test was written post-hoc and its quality cannot be auto-verified.
- **Other bug-fix callers:** `/nacl:tl-reopened` (QA failure surfaces an uncovered bug), `/nacl:tl-hotfix` (hotfix to main needs a regression test before it ships).
- **MSW handlers and test fixtures in feature-dev mode** are the test author's responsibility at write-time (Step 2), not this skill's structural responsibility. The skill selects the right handlers by following the conventions it discovers in Step 1.

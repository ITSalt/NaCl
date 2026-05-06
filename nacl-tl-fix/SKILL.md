---
name: nacl-tl-fix
model: sonnet
effort: medium
description: |
  Spec-first bug fixing with automatic documentation sync.
  Auto-detects affected UC/TECH from problem description.
  Classifies fix level (L0/L1/L2/L3), updates docs BEFORE code.
  Use when: fix bug, resolve error, debug issue, something broke,
  or the user says "/nacl-tl-fix" followed by a problem description.
---

# TeamLead Spec-First Bug Fix Skill

## CRITICAL: Follow ALL 8 Steps

**You MUST execute every step of the workflow below, in order, without skipping.**
Do NOT jump straight to fixing code. Do NOT skip triage, context loading, or gap-check.
The full workflow is: TRIAGE → CONTEXT → GAP-CHECK → DEFINE BEHAVIOR → FIX DOCS → FIX CODE → VALIDATE → REPORT.
**Skipping steps leads to regressions. This has been proven empirically.**

## Your Role

You are a **senior developer and specification maintainer** who fixes bugs using the spec-first approach. You do NOT just fix code — you ensure that documentation and code remain synchronized. Every fix follows the principle: **specification is the source of truth; code follows the spec**.

## Key Principle: Spec-First

```
WRONG (code-first):  Find bug → Fix code → Forget docs → Next session reads stale docs → Regression

RIGHT (spec-first):  Find bug → Read docs → Check for drift → Fix docs → Fix code to match → Validate
```

The spec-first approach is supported by:
- **Kiro bugfix specs** (AWS 2025): Define Current → Expected → Unchanged BEFORE coding
- **TDD**: Write failing test (= spec) first, then fix code
- **GitHub Spec Kit**: "Specification is the durable thing, code is the flexible thing"
- **Thoughtworks 2025**: Separate design and implementation phases

---

## Invocation

The user describes the problem in natural language. They do NOT need to specify UC or TECH IDs:

```
/nacl-tl-fix "VK auth doesn't redirect back after login"
/nacl-tl-fix "500 error when completing interview"
/nacl-tl-fix "Typing indicator stuck when returning to dialog"
/nacl-tl-fix "Migration fails on prod: import.meta.url not supported"
/nacl-tl-fix "generation.test.ts — 8 failing tests"
```

Optional flags:
```
/nacl-tl-fix --dry-run "description"    # analysis only, no changes
/nacl-tl-fix --l1 "description"        # force L1 (skip docs)
/nacl-tl-fix --auto-ship "description" # after fix, automatically run /nacl-tl-ship
```

---

## Fix Levels

| Level | Condition | Docs needed? | Example |
|-------|-----------|-------------|---------|
| **L0** (Environment) | Not a code or docs bug — infrastructure/config issue | No | Missing DB migrations, wrong env vars, stale cache, wrong Node version |
| **L1** (Code-only) | Docs are current and describe correct behavior. Code doesn't match | No | CSS bug, null check, wrong condition, test DB out of sync |
| **L2** (Spec-sync) | Docs exist but describe OLD behavior. Code evolved past docs | Yes, update | Enum added, API changed, flow changed |
| **L3** (Spec-create) | No docs exist for this area | Yes, create | SSE protocol, new auth provider, payments |

**Tests are treated as code (L1), not as specification.** Test failures alone do not escalate to L2 unless the underlying spec is also stale. (However: a regression test for the bug is mandatory for L1+ and must be written via `/nacl-tl-regression-test` BEFORE the fix is applied — see Step 6. The classification level above is independent of test-writing — it determines what happens to *docs*, not whether a regression test is required.)

Use reference: `nacl-tl-core/references/fix-classification-rules.md` (if available; otherwise use the table above).

---

## Workflow: 8 Steps (ALL MANDATORY)

**Before each step, announce it:** "Step N: [NAME]". This ensures no step is skipped.
**After Step 8, print the full report.** Never end without the report.

### Step 1: TRIAGE (auto-detect) — announce: "Step 1: TRIAGE"

**Goal:** Identify WHERE the problem is, WHICH UC/docs are affected.

1. **If tests are failing or error messages are available — run them FIRST.** Read the actual error output before analyzing code. This is far more diagnostic than the problem description alone.
2. If there's a stack trace or error message — find the source file in code
3. If not — search by keywords in the codebase (grep)
4. **If the error is a DB/environment issue** (column not found, relation does not exist, env var missing) — check migration status and environment before analyzing code. This is likely L0.
5. **Graph-enhanced UC search (optional):** If `config.yaml` has a `graph` section — use Neo4j to find affected UCs before falling back to grep:
   ```cypher
   // sa_find_uc_by_keywords — extract 2-3 keywords from the problem description
   MATCH (uc:UseCase)
   WHERE toLower(uc.name) CONTAINS toLower($keywords)
      OR toLower(coalesce(uc.description, '')) CONTAINS toLower($keywords)
   RETURN uc.id AS id, uc.name AS name, uc.detail_status AS status
   ORDER BY uc.id
   ```
   Run via `mcp__neo4j__read-cypher`. If Neo4j is unavailable or returns empty — fall back to file-based grep (step 6).
6. Identify:
   - **Affected code files** (backend routes, frontend components, hooks, services)
   - **Affected UCs** — from graph query (step 5) or match files to docs/14-usecases/ (by naming convention or grep for UC ID in task files)
   - **Affected docs** — which files in docs/ describe this area
   - **Affected .tl/tasks/** — which tasks are related

Output format (present in user's language):

```
┌─────────────────────────────────────────────┐
│ TRIAGE RESULT                               │
├─────────────────────────────────────────────┤
│ Problem: [brief description]                │
│ Affected UC: UC-014, UC-013                 │
│ Affected code files:                        │
│   - backend/src/routes/interview-chat.ts    │
│   - frontend/src/hooks/useInterviewChat.ts  │
│ Affected docs:                              │
│   - docs/14-usecases/UC014-ai-interview.md  │
│   - docs/12-domain/enumerations/session-status.md │
│ Affected .tl/ tasks: UC014-BE, UC014-FE     │
└─────────────────────────────────────────────┘
```

**If UC cannot be determined** — this is L3 (area is unspecified). Note it.

---

### Step 2: CONTEXT LOAD — announce: "Step 2: CONTEXT LOAD"

**Goal:** Load all relevant information before analysis.

Read (in this order):

1. **UC specs** for affected UCs from `docs/14-usecases/`
2. **Domain model** — relevant enums and entities from `docs/12-domain/`
3. **Screen specs** from `docs/15-interfaces/screens/` (if UI issue)
4. **API contracts** from `.tl/tasks/*/api-contract.md` (if API issue)
5. **Affected code** — files from Step 1
6. **.tl/status.json** and **.tl/changelog.md** — recent changes

**Context budget:** Do not load everything. Only files directly related to the bug.

**For L0 (Environment):** Skip docs loading. Read only config/migration files relevant to the environment issue.

---

### Step 3: GAP-CHECK — announce: "Step 3: GAP-CHECK"

**Goal:** Compare current code against documentation. Find discrepancies BEFORE the fix.

For each affected UC/area:

1. Read what docs describe (expected behavior)
2. Read what code does (actual behavior)
3. Compare and identify discrepancies
4. Classify fix level (L0/L1/L2/L3) using the table above

**For L0:** If triage identified an environment issue, classify immediately and skip to Step 4.

При необходимости воспроизвести баг в браузере или на сервере:
- Тестовые доступы: `config.yaml → credentials.[role]` (email, password, phone)
- Адреса окружений: `config.yaml → vps.staging` / `vps.production`
- URL приложения: `config.yaml → deploy.staging.url` / `deploy.production.url`

Output format (present in user's language):

```
┌──────────────────────────────────────────┐
│ GAP-CHECK RESULT                         │
├──────────────────────────────────────────┤
│ Fix level: L2 (Spec-sync)               │
│                                          │
│ Discrepancies (before fix):              │
│ 1. UC014 step 5: docs=POST sync,        │
│    code=SSE streaming                    │
│ 2. session-status.md: missing            │
│    interviewing→interviewing transition  │
│                                          │
│ Bug: POST /dialog returns 409            │
│ instead of existing dialog (idempotency) │
│                                          │
│ Root cause: No idempotent contract       │
│ in UC-014 spec                           │
└──────────────────────────────────────────┘
```

---

### Step 4: DEFINE CORRECT BEHAVIOR — announce: "Step 4: DEFINE CORRECT BEHAVIOR"

**Goal:** Define what behavior SHOULD be, before any changes.

Format (Kiro bugfix spec model):

```markdown
## Correct Behavior Definition

### Current Behavior (what happens now)
POST /api/interview/dialog with existing dialogId returns 409 Conflict.

### Expected Behavior (what should happen)
POST /api/interview/dialog with existing dialogId returns 200 OK
with body { dialog, messages: [...history] }. Endpoint is idempotent.

### Unchanged Behavior (what must NOT change)
- New dialog creation (first call) — works as before
- SSE stream-init — no changes
- Session status transitions (except adding interviewing→interviewing)
```

**For L0:** Brief description: "Migrations need to be applied to test DB" or "Env var X needs to be set."
**For L1:** This step is minimal — docs already define correct behavior.
**For L2/L3:** This step is critical — we define what's correct.

---

### Step 5: FIX DOCS (L2/L3 only) — announce: "Step 5: FIX DOCS"

**Goal:** Update the specification to describe CORRECT behavior.

Use reference: `nacl-tl-core/references/sa-doc-update-matrix.md`

**For L0/L1:** Skip this step entirely. Proceed to Step 6.

#### For L2 (update existing docs):

| Change type | What to update | How |
|-------------|---------------|-----|
| Enum/status | `docs/12-domain/enumerations/*.md` | Add value, update transition matrix |
| State transitions | `docs/12-domain/enumerations/session-status.md` | Add transition to table |
| API endpoint | `.tl/tasks/*/api-contract.md` + UC-spec | Update URL, request, response |
| UC flow | `docs/14-usecases/*.md` | Update main/alternative flow steps |
| Screen spec | `docs/15-interfaces/screens/*.md` | Update components, behavior |

**When to use SA skills:**
- Major domain model change → invoke `/nacl-sa-domain --mode=MODIFY` via Skill tool
- UC flow rewrite → invoke `/nacl-sa-uc --mode=update` via Skill tool
- Small point edits (a number, URL, field name) → edit directly

#### For L3 (create new docs):

Create **minimal specification** — just enough for the current fix:
- New protocol doc (SSE, webhook, etc.)
- New API contract
- Mini UC-spec (only for the affected area)

**Do NOT create full UCs from scratch** — that's the job of /nacl-sa-uc.

#### → USER GATE (L2/L3 only)

Present to user (in their language):
1. Which docs will be changed/created
2. Diff of doc changes
3. Code fix plan

**Do NOT proceed without explicit user confirmation.**
**L0/L1 fixes proceed without USER GATE** unless `--confirm` flag is used.

---

### Step 6: APPLY FIX (TDD-ordered) — announce: "Step 6: APPLY FIX"

**Goal:** Fix the issue according to the (updated) specification, with the regression test written **before** the fix so RED→GREEN is verified by construction.

**For L0 (Environment):** apply infrastructure fix only — migrations, env vars, caches, configs. Skip the TDD sub-flow below; jump to Step 7.

**For L1 / L2 / L3 (any code change):** follow the TDD-ordered sub-steps 6a→6h. Step 7 then determines the final status.

#### TDD-ordered sub-steps (L1+)

```
6a  RESTATE BUG. Write down Current / Expected / Unchanged behavior
    (already produced in Step 4 — re-confirm).

6b  CAPTURE BASELINE. Discover scripts.test of the affected workspace
    (see Step 7.1) and run it once. Record:
      - the exact failing-test set (file + test name) → "baseline_failures"
      - whether the runner started cleanly, collected tests, exited 0 or non-zero
    If scripts.test is missing / runner is broken / suite empty after sanity
    check, capture that as a flag and continue without baseline (status will
    resolve to NO_INFRA or RUNNER_BROKEN at Step 7).

6c  PICK PATH.
      - Grep test files for an import of any changed/about-to-change source
        module(s).
      - If at least one test file imports the target → Path B (existing
        coverage). Note: the imported test may or may not actually exercise
        the bug — Step 7 will resolve that via baseline comparison.
      - Otherwise → Path A (no test imports the file; a new regression test
        is required).

6d  (Path A only) WRITE REGRESSION TEST FIRST.
    Invoke /nacl-tl-regression-test as a separate sub-agent (developer
    subagent_type) with: bug description, target source file(s),
    Current/Expected behavior from 6a. The sub-agent writes ONLY a test
    file — it does not touch the production code. This separation is
    deliberate: the fix author cannot also be the test author, otherwise
    the test will be tuned to whatever the fix happens to do.

6e  (Path A only) VERIFY THE TEST IS RED.
    Run the new test in isolation against the still-broken code.
    It MUST fail. If it passes, the test does not capture the bug —
    discard it and re-invoke /nacl-tl-regression-test with sharper inputs
    (cite Current/Expected more concretely). After 2 unsuccessful retries,
    stop and ask the user to refine Step 4. Do NOT proceed to apply the fix
    until the test is RED.

6f  APPLY THE FIX. Modify production code only.
      - L1: code matches existing spec.
      - L2/L3: code matches the spec updated in Step 5 (which already passed
        the USER GATE).
      - Honor the principles: minimal scope, no opportunistic refactors,
        no improvements outside the bug.

6g  RE-RUN THE FULL SUITE. Use the same scripts.test command as 6b.
    Record:
      - "postfix_failures" — full failing-test set after the fix
      - (Path A) whether the new regression test transitioned RED→GREEN
      - (Path B) which baseline_failures cleared (= "transitioned" set)

6h  HAND OFF TO STEP 7 for status determination.
```

**Principles (unchanged):**
- Minimal changes — only what's needed for the fix
- Do not refactor "along the way"
- Do not add "improvements" beyond the bug scope
- Verify Unchanged Behavior is not broken

---

### Step 7: VALIDATE — announce: "Step 7: VALIDATE"

**Goal:** Determine the honest status of the fix, then run impact checks and update the changelog. This step never claims tests passed when no tests honestly passed, and never claims failures are unrelated without baseline evidence.

#### 7.1 Discover the test command (no fallback runner)

Locate the workspace owning the changed files (the nearest `package.json` walking up from a changed file). Read its `scripts.test`. Run **exactly that command** at every test step (6b, 6e, 6g). Do NOT substitute another runner — do not invent `npx vitest`, `npx jest`, etc., even if `npm test` looks unfamiliar. The runner is whatever the workspace declares.

If `scripts.test` is missing → the affected layer has no test infrastructure; status will resolve to `NO_INFRA`.

#### 7.2 Sanity-check the runner if the suite reported zero tests

If at 6b the runner started cleanly but reported 0 tests collected:
- Pick any one known-good test file in the workspace (e.g. the largest one, or one referenced by `git log`).
- Re-run scripts.test scoped to that single file (or use the runner's filter flag).
- If at least one test runs → the original glob simply didn't match what we expected; treat as Path B if it now covers the changed file, else Path A. Continue.
- If still zero tests → the runner is misconfigured; status `RUNNER_BROKEN`.

The point: zero collected tests is **not** the same as "no regression test exists." It often means the glob is broken or the wrong runner is selected.

#### 7.3 Determine the status

Compute from Step 6's recorded data:
- **baseline_failures** = set of failing tests at 6b
- **postfix_failures** = set of failing tests at 6g
- **new_failures** = postfix_failures − baseline_failures (tests failing now that weren't before)
- **transitioned** = baseline_failures − postfix_failures (tests that were failing, now pass)
- **regression_test_red_to_green** = true iff Path A and the test written in 6d was RED at 6e and GREEN at 6g

Apply these rules in order — first match wins:

| # | Condition | Status | Step 8 header |
|---|---|---|---|
| 1 | `scripts.test` was missing (6b flagged NO_INFRA). | `NO_INFRA` | `FIX APPLIED — UNVERIFIED` |
| 2 | Runner failed to start, exited non-zero before any test ran, or 7.2 confirmed misconfiguration. | `RUNNER_BROKEN` | `FIX APPLIED — UNVERIFIED` |
| 3 | `new_failures` is non-empty (the fix introduced failures that didn't exist in baseline). | `REGRESSION` | `FIX INCOMPLETE` — return to 6f |
| 4 | Path A and `regression_test_red_to_green` is false (the test we wrote against the bug is still RED — the fix didn't fix it). | `REGRESSION` | `FIX INCOMPLETE` — return to 6f |
| 5 | At least one test transitioned RED→GREEN — either the new regression test (Path A) or an existing test that was in `baseline_failures` and is now green (Path B) — AND `postfix_failures` is empty. | `PASS` | `FIX COMPLETE` |
| 6 | At least one test transitioned RED→GREEN AND `postfix_failures` is non-empty BUT `postfix_failures ⊆ baseline_failures` (the only failures left are pre-existing failures the baseline already had). | `BLOCKED` | `FIX APPLIED — UNVERIFIED` (pre-existing unrelated failures) |
| 7 | No test transitioned RED→GREEN (Path B, and no baseline_failures cleared). The fix was applied, the suite runs, but nothing in the suite gives evidence the fix did anything. | `UNVERIFIED` | `FIX APPLIED — UNVERIFIED` (no test exercises the change) |

Notes:
- Rule 5 is the "happy path" — applies in both Path A (the new regression test transitions RED→GREEN) and Path B (an existing baseline-failing test transitions).
- Rule 6 (`BLOCKED`) is reachable from both paths: Path A when the new regression test transitions but unrelated baseline failures persist; Path B when an existing baseline-failing test transitions but unrelated baseline failures persist.
- Rule 7 (`UNVERIFIED`) is only reachable from Path B and indicates the import-grep heuristic at 6c was a false positive — a test imports the file but doesn't actually cover the bug. Recommend invoking `/nacl-tl-regression-test` retroactively (it will fail-then-pass against the now-fixed code, which is weaker than RED-first but better than nothing).

#### 7.4 Mini sa-validate (L2/L3 only)

- Read the updated docs.
- Verify against code: do docs now describe what code does?
- Check L4 (form↔domain) and L5 (UC→form) for affected UCs.

#### 7.5 Impact check

- Other UCs using the same endpoints/components?
- Adjacent UCs broken? Check imports, shared types, shared state.

#### 7.6 Update `.tl/changelog`

```markdown
### [YYYY-MM-DD] nacl-tl-fix: [brief description]
- **Level:** L0/L1/L2/L3
- **Status:** PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN
- **Root cause:** [what was wrong]
- **Affected UC:** UC-### (or "infrastructure")
- **Docs updated:** [list] or "none (L0/L1)"
- **Code changed:** [file list]
- **Tests:** [new test path if Path A] or "existing test transitioned: [path]" or "none (status BLOCKED/UNVERIFIED/NO_INFRA)"
- **Pre-existing failures (baseline-confirmed unrelated):** [list, only if BLOCKED]
```

---

### Step 8: REPORT (MANDATORY — never skip) — announce: "Step 8: REPORT"

**Goal:** Give the user a complete picture of what was done. The report header reflects the Step 7 status — it is **not** always `FIX COMPLETE`.

Header by status:

| Step 7 status | Step 8 header |
|---|---|
| `PASS` (rule 5) | `FIX COMPLETE` |
| `BLOCKED` (rule 6) | `FIX APPLIED — UNVERIFIED` (pre-existing unrelated failures) |
| `UNVERIFIED` (rule 7) | `FIX APPLIED — UNVERIFIED` (no test exercises the change) |
| `NO_INFRA` (rule 1) | `FIX APPLIED — UNVERIFIED` (no test runner for this layer) |
| `RUNNER_BROKEN` (rule 2) | `FIX APPLIED — UNVERIFIED` (test runner could not execute) |
| `REGRESSION` (rules 3, 4) | `FIX INCOMPLETE` (the fix did not pass its own regression test, or introduced new failures) |

#### Template — present in user's language

```
═══════════════════════════════════════════
  <HEADER from table above>
═══════════════════════════════════════════

Problem: [from user's description]
Root cause: [what caused it]
Level: L0/L1/L2/L3
Status: <PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | REGRESSION>

Docs updated:
  [file list or "— (L0/L1, docs are current)"]

Changes applied:
  [file list with brief description, or
   "Applied 13 pending migrations to test DB"]

Tests:
  Runner:           [exact scripts.test command actually run, or "none — NO_INFRA"]
  Baseline (6b):    [N tests collected, K failing] or "skipped (NO_INFRA / RUNNER_BROKEN)"
  Regression test:  [path of new test (Path A) | "covered by existing test: [path]" (Path B) | "none — UNVERIFIED" | "n/a — NO_INFRA"]
  RED→GREEN:        [✓ confirmed at 6e and 6g (Path A) | ✓ existing test transitioned (Path B) | ✗ no transition observed (UNVERIFIED) | n/a]
  Postfix (6g):     [N tests collected, K failing] or "skipped"
  New failures:     [list — only if REGRESSION; otherwise "none"]
  Pre-existing failures (baseline-confirmed unrelated):
                    [list — only if BLOCKED; otherwise "none"]

Impact check:
  [✓] Adjacent UCs not affected
  [or list of concerns]

Remaining discrepancies docs/code:
  [list or "none"]

Next step:
  <see "Next step recommendations" below>

Recommendations:
  [if systemic issues found — suggest
   /nacl-tl-diagnose or /nacl-tl-reconcile]
═══════════════════════════════════════════
```

#### Next step recommendations by status

- `PASS`:
  ```
  /nacl-tl-ship "fix: [short description]"
  ```
  ⚠ If this is a critical production issue that cannot wait for the feature branch to merge, consider `/nacl-tl-hotfix --apply` instead.

- `BLOCKED`:
  ```
  Decide:
    (a) Ship anyway — the fix is verified. Pre-existing failures are
        baseline-confirmed unrelated:
          /nacl-tl-ship "fix: [short description] (note: pre-existing failures unchanged)"
    (b) Investigate the unrelated failures first:
          /nacl-tl-diagnose
  ```

- `UNVERIFIED`:
  ```
  The fix was applied but no test exercises it. Either:
    (a) Write a regression test now (the import-grep heuristic missed):
          /nacl-tl-regression-test "[bug description]"
    (b) Accept and ship — at your discretion:
          /nacl-tl-ship "fix: [short description] (note: no regression test)"
  ```

- `NO_INFRA`:
  ```
  The affected workspace has no test runner. Open a TECH task to set one up:
    /nacl-tl-dev TECH-### "set up test runner for [workspace]"
  Then re-run /nacl-tl-fix to add a regression test for this bug.
  In the meantime, the fix can ship if the change is small enough to review by eye:
    /nacl-tl-ship "fix: [short description] (note: no test infra in workspace)"
  ```

- `RUNNER_BROKEN`:
  ```
  The test runner could not execute. This is likely an L0 environment issue.
    /nacl-tl-diagnose
  Do NOT ship the fix until the runner works again — there is no way to verify regressions.
  ```

- `REGRESSION`:
  ```
  Return to Step 6f. Either the fix is wrong, or it broke something else.
  Do NOT ship.
  ```

### Auto-ship (if --auto-ship flag)

If `--auto-ship` is set:
- Status `PASS` → automatically invoke `/nacl-tl-ship` with the fix description as commit message; report ship result alongside fix result.
- Status `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION` → do NOT auto-ship. Print the report and stop. The user makes the call.

`--auto-ship` ALWAYS uses `/nacl-tl-ship` (commits to current branch). It NEVER uses `/nacl-tl-hotfix`. If the user wants a hotfix to main, they must explicitly invoke `/nacl-tl-hotfix` after the fix is complete.

---

## Handling Edge Cases

### Bug in area with no docs at all (L3)

If triage found NO docs for the affected area:

1. In Step 4: create Kiro-style bugfix spec (Current → Expected → Unchanged)
2. In Step 5: create MINIMAL specification
3. In Report: recommend "/nacl-sa-uc for full specification of this area"

### Bug affects multiple UCs

If triage found 2+ affected UCs:

1. Read docs for all UCs
2. Gap-check for each
3. Determine priority: which UC "owns" the bug
4. Fix docs/code in the owning UC
5. Check impact on the rest

### Infrastructure bug (deploy, CI, migrations)

For TECH/infra issues:

1. Read docs/DEPLOY.md, docs/DEVELOPMENT.md
2. L0 if it's an environment fix (run migrations, set env vars)
3. L1 if it's a config code fix
4. L2 if it changes deploy conventions (update DEPLOY.md)

### --dry-run mode

Execute Steps 1-4, show the report, do NOT execute Steps 5-8.
Useful for understanding scope before making changes.

---

## References

- `nacl-tl-core/references/fix-classification-rules.md` — L0/L1/L2/L3 classification rules
- `nacl-tl-core/references/sa-doc-update-matrix.md` — "code change → doc → skill" matrix
- `nacl-tl-core/references/tdd-workflow.md` — TDD cycle for Step 6
- `nacl-tl-core/references/review-checklist.md` — self-review checklist
- `nacl-tl-core/references/stub-tracking-rules.md` — stub markers
- `/nacl-tl-regression-test` (sibling skill) — invoked from Step 6d to write a regression test against broken code (RED-first). The fix author MUST NOT also write the regression test.

If a reference file is not found in the project, use the inline tables and rules in this SKILL.md as fallback.

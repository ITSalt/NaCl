---
name: tl-verify
model: sonnet
effort: medium
description: |
  Verification orchestrator: code analysis + E2E testing + YouGile reporting.
  Runs /nacl:tl-verify-code first (cheap, catches 60%+ issues), then /nacl:tl-qa if needed.
  Posts verification reports to YouGile task chat. Moves tasks through columns.
  Use when: verify task, run verification, test implementation, QA check,
  or the user says "/nacl:tl-verify".
---

## Contract

**Inputs this skill consumes:**
- nacl-tl-verify-code result (eight-status vocabulary: PASS / PASS_NEEDS_E2E /
  UNVERIFIED / NO_INFRA / RUNNER_BROKEN / BLOCKED / REGRESSION / FAIL)
- nacl-tl-verify-code `findings[*]` with optional metadata
  (`kind`, `routedTo`, `note`) used only for the Suggestions rendering
  in Step 5 — never to derive the headline or Decision Matrix outcome
- nacl-tl-qa result
- YouGile config (optional — may be unavailable)

**Outputs this skill produces:**
- Headline one of: VERIFY COMPLETE (code-only) / VERIFY COMPLETE (E2E-verified) /
  VERIFY APPLIED — BLOCKED / VERIFY APPLIED — UNVERIFIED /
  VERIFY APPLIED — NO_INFRA / VERIFY APPLIED — RUNNER_BROKEN /
  VERIFY INCOMPLETE — REGRESSION
- Aggregate report with both code-only and E2E rationale fields
- YouGile post when YouGile is reachable; "VERIFIED (local-only, not posted)"
  fallback otherwise

**Downstream consumers of this output:**
- nacl-tl-deliver
- nacl-tl-release
- Tester (human, via YouGile)

**Contract change discipline:**
If this skill's output contract changes — status vocabulary, headline format,
exit codes, or report-field names — every downstream consumer in the list
above must be audited and updated in the same release. The 0.10.0→0.10.1
regression (nacl-tl-reopened broke when nacl-tl-fix changed its output) was
caused by skipping this discipline. Do not ship contract changes without
auditing consumers.

---

# TeamLead Verification Orchestrator

## Your Role

You orchestrate the full verification pipeline: static code analysis, E2E testing (if needed), report generation, and YouGile update. You are the gatekeeper between DevDone and ToRelease.

## Verification Context

This skill runs **POST-SHIP** — it verifies code that has been committed and pushed to the repository.

Two QA contexts exist in the TL workflow by design (**defense in depth**):

| Context | When | Where | Purpose |
|---------|------|-------|---------|
| **Pre-ship QA** (nacl-tl-full Step 7) | During development | Local dev servers | Catches code bugs cheaply, before any git/CI overhead |
| **Post-ship verification** (this skill) | After push to repo | Staging environment | Catches deployment, configuration, and integration issues that local testing cannot surface |

Both are necessary. Pre-ship QA is cheaper (no push/deploy cycle). Post-ship verification catches environment-specific problems.

**Precondition:** Code must be committed and pushed. If not yet pushed → run `/nacl:tl-deliver` or `/nacl:tl-ship` first.

---

## Key Principle

```
Code analysis FIRST (cheap, fast, catches 60%+ of issues)
E2E testing SECOND (only if code analysis says PASS_NEEDS_E2E)
```

## Invocation

```
/nacl:tl-verify UC028                    # verify specific UC
/nacl:tl-verify --task ELE-644           # verify by YouGile task code
/nacl:tl-verify --all                    # verify all ReadyToTest tasks from YouGile
```

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| YouGile columns | config.yaml → yougile.columns.testing / to_release / reopened |
| Reports directory | `.tl/reports/` (local, always available) |
| Reports server | config.yaml → reports (optional: remote publish via rsync) |
| Test credentials | `config.yaml → credentials` (passed to nacl-tl-qa for E2E tests) |

If YouGile not configured → skip column moves, report locally only. Post "VERIFIED (local-only, not posted to YouGile)" in the report.
Reports always saved locally to `.tl/reports/`. Remote publish only if config.yaml → reports configured.

## Headline Status Vocabulary

The final report headline is always one of the following:

| Headline | Condition |
|----------|-----------|
| `VERIFY COMPLETE (code-only)` | verify-code returned PASS AND integrity checks pass (see Step 3 integrity gate) |
| `VERIFY COMPLETE (E2E-verified)` | verify-code returned PASS_NEEDS_E2E AND E2E passed AND integrity checks pass |
| `VERIFY APPLIED — BLOCKED` | verify-code returned BLOCKED (pre-existing failures remain in suite) |
| `VERIFY APPLIED — UNVERIFIED` | verify-code returned UNVERIFIED (no test covers the changed file) or NO_INFRA or RUNNER_BROKEN; OR verify-code returned PASS but failed the integrity gate (missing baseline evidence, zero tests collected, or empty runner command) |
| `VERIFY APPLIED — NO_INFRA` | verify-code returned NO_INFRA specifically (surfaced separately for clarity) |
| `VERIFY APPLIED — RUNNER_BROKEN` | verify-code returned RUNNER_BROKEN specifically (surfaced separately for clarity) |
| `VERIFY INCOMPLETE — REGRESSION` | verify-code returned REGRESSION, or E2E test returned FAIL |

**PASS headline variants are distinct by evidence level.** `VERIFY COMPLETE (code-only)` signals no browser test was run. `VERIFY COMPLETE (E2E-verified)` signals at least one E2E scenario was executed and passed. Downstream consumers (`nacl-tl-deliver`, `nacl-tl-release`) must not treat these as equivalent.

## Workflow: 6 Steps

### Step 1: IDENTIFY TASK

- If UC provided: read `.tl/tasks/UC###/` for context (acceptance criteria, implementation notes)
- If YouGile task code: fetch task from YouGile (title, description, comments)
- If `--all`: fetch all tasks from ReadyToTest column in YouGile
- Read `config.yaml` for YouGile column IDs

### Step 2: MOVE TO TESTING

- If YouGile available: move task to Testing column
- Log start time

### Step 3: CODE ANALYSIS

- Run `/nacl:tl-verify-code` (via Skill tool or inline)
- Parse result: **PASS** / **PASS_NEEDS_E2E** / **UNVERIFIED** / **NO_INFRA** / **RUNNER_BROKEN** / **BLOCKED** / **REGRESSION** / **FAIL**
- If **FAIL** or **REGRESSION** -- skip E2E, go to Step 5 with FAIL/REGRESSION status
- If **UNVERIFIED** / **NO_INFRA** / **RUNNER_BROKEN** / **BLOCKED** -- skip E2E, go to Step 5 with that status (not PASS)
- If **PASS** or **PASS_NEEDS_E2E** -- run the integrity gate below before proceeding

**Integrity gate (applies to both PASS and PASS_NEEDS_E2E):**

Before accepting a PASS-family result from verify-code, assert ALL of the following:

1. `testRunner.command` is non-empty (a real runner command was invoked, not a no-op).
2. `testRunner.tests_collected > 0` (at least one test ran; zero collected means the runner is silently broken or the suite is empty).
3. `baseline_failures` is present in the result (verify-code ran baseline capture, not just a single post-change run).
4. `postfix_failures` is present in the result (the post-change failure set is recorded).

If **any** of these assertions fail, downgrade the outcome to `VERIFY APPLIED — UNVERIFIED (verify-code returned PASS without baseline evidence)` and go to Step 5 with that status. Do NOT proceed to E2E or promote the PASS.

If integrity gate passes:
- If **PASS** -- go to Step 5 directly (no E2E needed); headline will be `VERIFY COMPLETE (code-only)`
- If **PASS_NEEDS_E2E** -- proceed to Step 4; headline will be `VERIFY COMPLETE (E2E-verified)` only if E2E also passes

### Step 4: E2E TESTING (conditional)

- Only if Step 3 returned **PASS_NEEDS_E2E**
- Run `/nacl:tl-qa` — browser-based E2E test
- **REQUIRE from nacl-tl-qa:** screenshots at every step + HTML report
- Parse result: **PASS** / **FAIL**

### Step 5: COMPOSE REPORT + SAVE ARTIFACTS

**Always create a local report directory:**
```bash
mkdir -p .tl/reports/verify-[UC###]-[YYYY-MM-DD-HHMMSS]/
```

**Save to this directory:**
- `report.html` — HTML report with screenshots embedded/linked
- `screenshots/` — all screenshots from E2E testing
- `code-analysis.md` — /nacl:tl-verify-code result (YAML block)

**HTML report structure:**
Same as nacl-tl-qa Step 5b format: standalone HTML with inline CSS, summary table, test steps, screenshot grid, verdict badge.

If no E2E was run (code-only PASS): generate a minimal report with code analysis results only.

**Verify-code integrity fields — always include in the report (do not embed child report verbatim):**

```
Code Analysis Integrity:
  Runner command:      {testRunner.command}
  Tests collected:     {testRunner.tests_collected}
  Baseline failures:   {baseline_failures.length} ({baseline_failures joined by ", " or "none"})
  Postfix failures:    {postfix_failures.length} ({postfix_failures joined by ", " or "none"})
  New failures:        {new_failures.length} ({new_failures joined by ", " or "none"})
  Transitioned (fixed): {transitioned.length} ({transitioned joined by ", " or "none"})
  Integrity gate:      PASSED | FAILED (reason: ...)
```

These fields must appear as discrete named fields in the report, not collapsed into the child skill's raw output block. The orchestrator is responsible for surfacing them so that downstream consumers (`nacl-tl-deliver`, `nacl-tl-release`, human testers) can judge evidence quality without re-parsing the verify-code sub-report.

**After saving, tell the user the path:**
```
Report saved: .tl/reports/verify-UC028-2026-03-27-143200/report.html
Open in browser: open .tl/reports/verify-UC028-2026-03-27-143200/report.html
```

Generate console verification report:

```
VERIFICATION REPORT
═══════════════════
Task: UC-028 / ELE-644
Date: 2026-03-27
Duration: 5m 32s

Code Analysis: PASS_NEEDS_E2E (test suite ran, changed files covered)
  Findings: 0 issues, 2 suggestions
  Data flow: DB → service → route → hook → component ✓

E2E Testing: PASS
  Scenarios: 1 executed
  Screenshots: 8
  Acceptance: 12/12 criteria met

Headline: VERIFY COMPLETE (E2E-verified, 1 scenario GREEN)

Suggestions (non-blocking):
  1. [SUGGESTION] Consider adding index on funnel_events.created_at
  2. [SUGGESTION → /nacl:tl-reconcile] Spec lags code: Widget.status uses ARCHIVED in code, UC-EXP-001/task-be.md still says INACTIVE
     (pre-flagged in review-be.md:m-1)
```

**Suggestion rendering** — for each entry in `findings[*]` whose
`status` is `SUGGESTION` or `INFO`, format the prefix from optional
fields:

- If `routedTo` is non-empty, prefix is `[SUGGESTION → <routedTo>]`
  (or `[INFO → <routedTo>]` for INFO findings).
- Otherwise prefix is `[SUGGESTION]` (or `[INFO]`).
- If `note` is non-empty, append it on a continuation line indented
  with five spaces, in parentheses: `     (note text)`.

This applies only to console rendering and YouGile chat posting. The
top-level result vocabulary and the headline table (above) are
unaffected — a finding with `kind: spec-drift` never causes the
headline to flip from `VERIFY COMPLETE` to a non-COMPLETE state.

**PASS rationale distinction** — include in the report body:

| verify-code result | E2E run | Report body rationale line |
|---|---|---|
| PASS | skipped | `VERIFY COMPLETE (code-only — no UI-visible changes, no E2E required)` |
| PASS_NEEDS_E2E | PASS | `VERIFY COMPLETE (E2E-verified, N steps GREEN)` |
| PASS_NEEDS_E2E | FAIL | `VERIFY INCOMPLETE — REGRESSION (E2E failed)` |

**Non-PASS rationale** — include in the report body:

| verify-code result | Report body rationale line |
|---|---|
| UNVERIFIED | `VERIFY APPLIED — UNVERIFIED (no test imports the changed file; test runner ran but coverage gap detected)` |
| NO_INFRA | `VERIFY APPLIED — NO_INFRA (workspace has no scripts.test; test runner could not be discovered)` |
| RUNNER_BROKEN | `VERIFY APPLIED — RUNNER_BROKEN (scripts.test exists but runner crashed before any test ran)` |
| BLOCKED | `VERIFY APPLIED — BLOCKED (pre-existing unrelated failures in suite; this change appears verified)` |
| REGRESSION | `VERIFY INCOMPLETE — REGRESSION (test suite reveals failures introduced by this change)` |

**YouGile unavailable:** Print in report:
```
YouGile: VERIFIED (local-only, not posted to YouGile)
```
Do NOT silently skip. Always log whether the report was posted or not.

Actions after composing the report:
- If YouGile available: post report to task chat (`send_task_message`)
- If non-blocking suggestions found: create recommendation tasks in Backlog (via `/create-recommendation` pattern)

### Step 6: MOVE TO FINAL COLUMN

| Headline | Column move |
|----------|-------------|
| `VERIFY COMPLETE (code-only)` | ToRelease |
| `VERIFY COMPLETE (E2E-verified)` | ToRelease |
| `VERIFY INCOMPLETE — REGRESSION` | Reopened |
| `VERIFY APPLIED — UNVERIFIED` | Reopened |
| `VERIFY APPLIED — NO_INFRA` | Reopened |
| `VERIFY APPLIED — RUNNER_BROKEN` | Reopened (infra issue — not a code regression) |
| `VERIFY APPLIED — BLOCKED` | ToRelease with advisory, or Reopened — user decides |

For `VERIFY APPLIED — BLOCKED`: print advisory before column move:
```
⚠️ VERIFY APPLIED — BLOCKED
Code change appears verified, but pre-existing unrelated failures remain in the suite.
These are not caused by this change (detected by verify-code baseline comparison).

Decide:
  (a) Move to ToRelease with known pre-existing failures (they predate this change):
        Confirm "proceed"
  (b) Investigate pre-existing failures first (move to Reopened):
        Confirm "investigate"
```

For `VERIFY APPLIED — UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN`: move to Reopened automatically; include failure details in YouGile comment.

## Decision Matrix

| Code Analysis Result | Integrity Gate | E2E Testing | Final Headline |
|----------------------|----------------|-------------|----------------|
| PASS | PASSED | (skipped) | `VERIFY COMPLETE (code-only)` |
| PASS | FAILED | (skipped) | `VERIFY APPLIED — UNVERIFIED (verify-code returned PASS without baseline evidence)` |
| PASS_NEEDS_E2E | PASSED | PASS | `VERIFY COMPLETE (E2E-verified)` |
| PASS_NEEDS_E2E | PASSED | FAIL | `VERIFY INCOMPLETE — REGRESSION` |
| PASS_NEEDS_E2E | FAILED | (skipped) | `VERIFY APPLIED — UNVERIFIED (verify-code returned PASS without baseline evidence)` |
| FAIL | n/a | (skipped) | `VERIFY INCOMPLETE — REGRESSION` |
| REGRESSION | n/a | (skipped) | `VERIFY INCOMPLETE — REGRESSION` |
| UNVERIFIED | n/a | (skipped) | `VERIFY APPLIED — UNVERIFIED` |
| NO_INFRA | n/a | (skipped) | `VERIFY APPLIED — NO_INFRA` |
| RUNNER_BROKEN | n/a | (skipped) | `VERIFY APPLIED — RUNNER_BROKEN` |
| BLOCKED | n/a | (skipped) | `VERIFY APPLIED — BLOCKED` |

## Without YouGile

If `config.yaml` does not have YouGile configured, skip column movements and chat posting. Still run code analysis + E2E and present results locally. Always append `"VERIFIED (local-only, not posted to YouGile)"` to the report.

## Output Language

- Report structure: English
- User-facing presentation: user's language
- YouGile comments: project's documentation language (from `config.yaml` or `docs/`)

## References

- `nacl-tl-verify-code/SKILL.md` -- code analysis sub-skill (eight-status vocabulary)
- `nacl-tl-qa/SKILL.md` -- E2E testing sub-skill
- Verification orchestrator pattern adapted from multi-module E2E testing projects

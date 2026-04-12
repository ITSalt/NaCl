---
name: nacl-tl-verify
model: sonnet
effort: medium
description: |
  Verification orchestrator: code analysis + E2E testing + YouGile reporting.
  Runs /nacl-tl-verify-code first (cheap, catches 60%+ issues), then /nacl-tl-qa if needed.
  Posts verification reports to YouGile task chat. Moves tasks through columns.
  Use when: verify task, run verification, test implementation, QA check,
  or the user says "/nacl-tl-verify".
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

**Precondition:** Code must be committed and pushed. If not yet pushed → run `/nacl-tl-deliver` or `/nacl-tl-ship` first.

---

## Key Principle

```
Code analysis FIRST (cheap, fast, catches 60%+ of issues)
E2E testing SECOND (only if code analysis says PASS_NEEDS_E2E)
```

## Invocation

```
/nacl-tl-verify UC028                    # verify specific UC
/nacl-tl-verify --task ELE-644           # verify by YouGile task code
/nacl-tl-verify --all                    # verify all ReadyToTest tasks from YouGile
```

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| YouGile columns | config.yaml → yougile.columns.testing / to_release / reopened |
| Reports directory | `.tl/reports/` (local, always available) |
| Reports server | config.yaml → reports (optional: remote publish via rsync) |
| Test credentials | `config.yaml → credentials` (passed to nacl-tl-qa for E2E tests) |

If YouGile not configured → skip column moves, report locally only.
Reports always saved locally to `.tl/reports/`. Remote publish only if config.yaml → reports configured.

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

- Run `/nacl-tl-verify-code` (via Skill tool or inline)
- Parse result: **PASS** / **PASS_NEEDS_E2E** / **FAIL**
- If **FAIL** -- skip E2E, go to Step 5

### Step 4: E2E TESTING (conditional)

- Only if Step 3 returned **PASS_NEEDS_E2E**
- Run `/nacl-tl-qa` — browser-based E2E test
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
- `code-analysis.md` — /nacl-tl-verify-code result (YAML block)

**HTML report structure:**
Same as nacl-tl-qa Step 5b format: standalone HTML with inline CSS, summary table, test steps, screenshot grid, verdict badge.

If no E2E was run (code-only PASS): generate a minimal report with code analysis results only.

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

Code Analysis: PASS_NEEDS_E2E (1 iteration)
  Findings: 0 issues, 2 suggestions
  Data flow: DB → service → route → hook → component ✓

E2E Testing: PASS
  Scenarios: 1 executed
  Screenshots: 8
  Acceptance: 12/12 criteria met

RESULT: PASS

Suggestions (non-blocking):
  1. [SUGGESTION] Consider adding index on funnel_events.created_at
```

Actions after composing the report:

- If YouGile available: post report to task chat (`send_task_message`)
- If non-blocking suggestions found: create recommendation tasks in Backlog (via `/create-recommendation` pattern)

### Step 6: MOVE TO FINAL COLUMN

- **PASS** -- move to ToRelease
- **FAIL** -- move to Reopened
  - Include failure details in YouGile comment
  - The developer can then use `/nacl-tl-fix` to address the issues

## Decision Matrix

| Code Analysis | E2E Testing | Final Verdict |
|---------------|-------------|---------------|
| PASS          | (skipped)   | PASS          |
| PASS_NEEDS_E2E| PASS        | PASS          |
| PASS_NEEDS_E2E| FAIL        | FAIL          |
| FAIL          | (skipped)   | FAIL          |

## Without YouGile

If `config.yaml` does not have YouGile configured, skip column movements and chat posting. Still run code analysis + E2E and present results locally.

## Output Language

- Report structure: English
- User-facing presentation: user's language
- YouGile comments: project's documentation language (from `config.yaml` or `docs/`)

## References

- `nacl-tl-verify-code/SKILL.md` -- code analysis sub-skill
- `nacl-tl-qa/SKILL.md` -- E2E testing sub-skill
- Verification orchestrator pattern adapted from multi-module E2E testing projects

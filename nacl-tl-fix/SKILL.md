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

**Tests are treated as code (L1), not as specification.** Test failures alone do not escalate to L2 unless the underlying spec is also stale.

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

### Step 6: APPLY FIX — announce: "Step 6: APPLY FIX"

**Goal:** Fix the issue according to the (updated) specification.

**For L0 (Environment):**
- Apply missing migrations, set env vars, clear caches, fix configs
- No code changes needed

**For L1 (Code-only):**
- Fix code to match the existing specification
- Write/update tests covering the bug
- Verify tests pass

**For L2/L3 (with docs update):**
- Fix code to match the UPDATED specification from Step 5
- Write/update tests:
  - Test = executable spec (TDD style)
  - Test must verify Expected Behavior from Step 4
  - Test must verify Unchanged Behavior (regression check!)
- Verify tests pass

**Principles:**
- Minimal changes — only what's needed for the fix
- Do not refactor "along the way"
- Do not add "improvements" beyond the bug scope
- Verify Unchanged Behavior is not broken

---

### Step 7: VALIDATE — announce: "Step 7: VALIDATE"

**Goal:** Verify the fix is correct and nothing else broke.

1. **Tests:** Run unit/integration tests
   ```bash
   npm test          # or project-specific command
   npm run build     # verify build succeeds
   ```

2. **Mini sa-validate** (for L2/L3):
   - Read the updated docs
   - Verify against code: do docs now describe what code does?
   - Check L4 (form↔domain) and L5 (UC→form) for affected UCs

3. **Impact check:**
   - Are there other UCs using the same endpoints/components?
   - Did anything break in adjacent UCs?
   - Check imports, shared types, shared state

4. **Update .tl/changelog:**
   ```markdown
   ### [YYYY-MM-DD] nacl-tl-fix: [brief description]
   - **Level:** L0/L1/L2/L3
   - **Root cause:** [what was wrong]
   - **Affected UC:** UC-### (or "infrastructure")
   - **Docs updated:** [list] or "none (L0/L1)"
   - **Code changed:** [file list]
   ```

---

### Step 8: REPORT (MANDATORY — never skip) — announce: "Step 8: REPORT"

**Goal:** Give the user a complete picture of what was done.

Present in user's language:

```
═══════════════════════════════════════════
  FIX COMPLETE
═══════════════════════════════════════════

Problem: [from user's description]
Root cause: [what caused it]
Level: L0/L1/L2/L3

Docs updated:
  [file list or "— (L0/L1, docs are current)"]

Changes applied:
  [file list with brief description, or
   "Applied 13 pending migrations to test DB"]

Tests:
  [✓] Unit tests pass
  [✓] Build succeeds
  [✓] Impact check — adjacent UCs not affected

Remaining discrepancies docs/code:
  [list or "none"]

Next step — ship this fix:
  /nacl-tl-ship "fix: [short description from commit message]"

  ⚠ If this is a critical production issue that cannot wait
  for the feature branch to merge, consider instead:
  /nacl-tl-hotfix --apply
  This will create a hotfix PR directly to main while
  preserving your feature branch.

Recommendations:
  [if systemic issues found — suggest
   /nacl-tl-diagnose or /nacl-tl-reconcile]
═══════════════════════════════════════════
```

### Auto-ship (if --auto-ship flag)

If `--auto-ship` is set AND the fix was successful (tests pass, build OK):
1. Automatically invoke `/nacl-tl-ship` with the fix description as commit message
2. Report ship result alongside fix result

Note: `--auto-ship` ALWAYS uses `/nacl-tl-ship` (commits to current branch).
It NEVER uses `/nacl-tl-hotfix`. If the user wants a hotfix to main, they must
explicitly invoke `/nacl-tl-hotfix` after the fix is complete.

If the fix failed or tests don't pass → do NOT auto-ship, report the fix failure only.

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

If a reference file is not found in the project, use the inline tables and rules in this SKILL.md as fallback.

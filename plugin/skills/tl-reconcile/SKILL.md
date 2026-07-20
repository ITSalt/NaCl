---
name: tl-reconcile
model: opus
effort: high
description: |
  Emergency documentation-code reconciliation.
  Brings all docs in sync with current code state.
  Uses nacl-tl-diagnose report, fixes docs via SA skills, validates result.
  Use when: massive drift, docs outdated, reconcile needed,
  bring docs in sync, or the user says "/nacl:tl-reconcile".
---

## Contract

**Inputs this skill consumes:**
- DIAGNOSTIC-REPORT.md (from nacl-tl-diagnose)
- Recent fix statuses (scans .tl/status.json + git log + task chat for
  six-status vocabulary: PASS / BLOCKED / UNVERIFIED / NO_INFRA /
  RUNNER_BROKEN / REGRESSION)
- Current code state

**Outputs this skill produces:**
- Headline one of: RECONCILE COMPLETE / RECONCILE APPLIED — UNVERIFIED
  (when documenting non-PASS upstream with user acknowledgment) /
  RECONCILE HALTED — REGRESSION
- Doc updates (gated on user acknowledgment for non-PASS upstream)
- Health Score adjusted to weight UNVERIFIED tasks downward (-5 per UNVERIFIED task)

**Downstream consumers of this output:**
- Human user
- Repository documentation

**Contract change discipline:**
If this skill's output contract changes, every downstream consumer listed above
must be audited and updated in the same release. The 0.10.0→0.10.1 regression
was caused by the absence of this discipline. `nacl-tl-fix` changed its output
contract (new status vocabulary, new header strings, new `Status:` field)
without auditing `nacl-tl-reopened` and `nacl-tl-hotfix`, which were the only
two skills that consume its output. Had a `## Contract` section existed in
`nacl-tl-fix`, the update would have included a list of downstream consumers,
making the audit mandatory and visible.

---

# TeamLead Emergency Reconciliation Skill

## Your Role

You are an **emergency reconciliation coordinator**. When documentation has drifted significantly from code, you systematically bring everything back in sync. You fix ONLY documentation — never code. If code is wrong, recommend `/nacl:tl-fix`.

## Key Principle: Docs Follow Code Reality (During Reconcile)

```
NORMAL MODE (spec-first):  Docs → Code  (docs are truth, code follows)
RECONCILE MODE:            Code → Docs  (code is reality, docs catch up)
```

Reconciliation is the **exception** to spec-first. When drift has accumulated, we accept that code represents the CURRENT reality and update docs to match it. After reconcile, we return to spec-first mode.

---

## Invocation

```
/nacl:tl-reconcile                              # full reconcile (includes nacl-tl-diagnose)
/nacl:tl-reconcile --report=DIAGNOSTIC-REPORT.md  # use existing report
/nacl:tl-reconcile --scope=UC014                # specific UC only
/nacl:tl-reconcile --dry-run                    # plan only, no changes
```

### Removed Flags (W4-blocking-release)

The FORCE flag (was: "skip USER GATE for programmatic use") was
REMOVED in W4-blocking-release. Its literal token is scrubbed
from this skill's prose. The per-task / per-discrepancy USER GATE
is now mandatory in every invocation; there is no programmatic
auto-confirm. Reactive bulk-bypass routes through emergency mode
(`NACL_EMERGENCY=1` + companion env vars). See
`${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/emergency-mode.md`. Under emergency mode
the gate still evaluates, the prompt is still printed, the
operator must still answer; emergency mode's recorded effect is
that an unanswered or "no" prompt does NOT halt the run — it
records the bypass to `.tl/emergencies/`. Emergency mode does
NOT silently auto-confirm.

---

## Workflow: 5 Phases

### Phase 1: DIAGNOSIS

**Goal:** Get a complete picture of all discrepancies.

```
IF --report flag provided:
  → Read specified DIAGNOSTIC-REPORT.md
  → Verify freshness (< 24 hours by file date)
  → If stale → warn user, suggest re-running /nacl:tl-diagnose

ELSE IF DIAGNOSTIC-REPORT.md exists in project root:
  → Check freshness (< 1 hour)
  → If fresh → use it
  → If stale → re-run /nacl:tl-diagnose

ELSE:
  → Run /nacl:tl-diagnose (full) via inline execution
  → Wait for DIAGNOSTIC-REPORT.md to be generated
```

Parse the diagnostic report to extract:
- List of discrepancies (doc says X, code does Y)
- Severity of each discrepancy (critical, high, medium, low)
- Affected UC/docs/code files
- Health Score

**Pre-flight freshness check (AUTOMATED — run for every discrepancy):**

For each discrepancy referencing a specific doc or code file, execute:

```bash
git log -1 --format="%ai" -- {file_path}
```

Compare the returned `commit_date` against the diagnostic report's generation
timestamp (`diagnostic_report_date`, taken from the report header or file
mtime).

- If `commit_date > diagnostic_report_date`: the file was modified after the
  report was generated. Skip this discrepancy — it may already be fixed. Add
  it to a **"Skipped (already-fixed)"** list that will appear in the Phase 5
  report under a dedicated section.
- If `commit_date <= diagnostic_report_date` or git returns no commit: include
  the discrepancy in the reconciliation plan as normal.
- If `git log` fails (e.g., file untracked): treat as not-yet-fixed and include.

Do not rely on file timestamps (mtime) — use git commit dates only.

**Pre-flight unverified fix scan (MANDATORY before Phase 2):**

Scan recent fixes for non-PASS status. Check:
1. `.tl/status.json` — look for tasks with status `verified-pending` or `blocked`
2. `git log --oneline -20` — for commits related to recent fixes
3. Task chat (if accessible) — for FIX APPLIED — UNVERIFIED headlines

For each UNVERIFIED or BLOCKED fix found:
- Surface to user:
  ```
  WARNING: The following recent fixes have UNVERIFIED status (no test exercises
  the change). Reconciling docs to match this code means documenting unverified
  behavior as canonical.

  Unverified fixes:
    - [task-id]: [description] (status: verified-pending)

  Acknowledge that "documenting unverified behavior is intentional"? [yes/no]
  ```
- If user acknowledges → proceed to Phase 2; headline will be
  **RECONCILE APPLIED — UNVERIFIED (documenting unverified upstream behavior)**
  regardless of any subsequent steps or outcomes. This headline cannot be
  upgraded to RECONCILE COMPLETE when UNVERIFIED fixes exist — even with
  explicit user acknowledgment. Acknowledgment authorizes proceeding, not
  re-labeling.
- If user does not acknowledge → stop; recommend fixing the verification gap first
- Record the acknowledgment in the Phase 5 report

**Health Score adjustment for UNVERIFIED tasks:**
The Health Score computed by nacl-tl-diagnose is adjusted before display:
- For each task with status `verified-pending` in .tl/status.json: deduct 5 points
- Report the adjusted score: "Health Score: [raw] → [adjusted] (adjusted for [N] UNVERIFIED tasks)"
- A high Health Score must reflect honest verification, not just doc-code alignment

**If adjusted Health Score >= 80 AND no UNVERIFIED tasks:** Report "Project is healthy, reconcile not needed" and exit.
**If adjusted Health Score >= 80 BUT UNVERIFIED tasks exist:** Proceed with user gate above; reconcile may still be needed to surface the unverified state.

---

### Phase 2: PLAN

**Goal:** Create a reconciliation plan with scope estimate.

#### 2.1 Group Discrepancies

Group by type:

```
1. DOMAIN MODEL DRIFT
   - Enums with new/changed values
   - Entities with modified schema
   - State machines with new transitions

2. USE CASE DRIFT
   - UC flows that changed in code
   - New endpoints without UC specification
   - Preconditions/postconditions not matching code

3. SCREEN SPEC DRIFT
   - UI components that changed in code
   - Navigation rules not matching routing

4. MISSING DOCS
   - Implemented features without UC specification
   - Endpoints without API contract
   - Protocols without documentation (SSE, webhooks)

5. .TL/ STATE DRIFT
   - status.json not matching reality
   - changelog.md outdated
```

#### 2.2 Determine Order (dependencies first)

```
1. Domain model (enums, entities)  — foundation for everything
2. Use Cases (flows)               — depend on domain
3. Screen specs                    — depend on UCs
4. API contracts                   — depend on UC + domain
5. Missing docs (new)              — after updating existing ones
6. .tl/ state                      — after all docs
```

#### 2.3 Estimate Scope

Present scope summary to user:

```
┌─────────────────────────────────────────────┐
│ RECONCILIATION PLAN                         │
├─────────────────────────────────────────────┤
│ Domain model:  N enums, M entities          │
│ Use Cases:     N UCs to update              │
│ Screen specs:  N screens to update          │
│ Missing docs:  N new docs to create         │
│ .tl/ state:    N items to fix               │
│                                             │
│ Total docs to modify: X                     │
│ Total new docs to create: Y                 │
│                                             │
│ Estimated scope: SMALL / MEDIUM / LARGE     │
│ (SMALL: <5 files, MEDIUM: 5-15 files,      │
│  LARGE: >15 files to modify/create)         │
└─────────────────────────────────────────────┘
```

#### → USER GATE

Present plan and wait for approval. Include:
- Health Score
- Discrepancy counts by severity
- Ordered plan of changes
- Scope estimate
- Warning: reconcile fixes only docs, not code

**Do NOT proceed without explicit user confirmation.** The FORCE
flag that previously offered a programmatic auto-confirm escape
hatch was REMOVED in W4-blocking-release; per-task and per-
discrepancy confirmation are mandatory. Reactive bulk-bypass
routes through emergency mode (see "Removed Flags" in the
Invocation block).

The unverified-upstream acknowledgment gate (Phase 1's `UNVERIFIED
upstream fix detected` prompt) remains separate and unconditional.
When any upstream fix is `UNVERIFIED`, the user MUST explicitly
acknowledge that documenting unverified behavior is intentional.
This gate is recorded verbatim in the Phase 5 report under
"Unverified fix acknowledgments". Emergency mode does NOT
auto-acknowledge; under emergency mode the prompt still prints and
the operator's answer is still required — emergency mode only
records that the prompt was reached and the run advanced.

**For --dry-run:** Present the plan and exit without starting Phase 3.

---

### Phase 3: EXECUTE

**Goal:** Sequentially bring docs in sync with code.

#### Step 3.1: Domain Model

For each discrepancy in enums/entities:

1. Read current code (enum values, entity schema, transitions)
2. Read current doc
3. Update doc to match code

**Approach:**
- Small edits (add enum value, update field) → Edit directly
- Large changes (rework state machine, new entity) → Launch Agent:
  ```
  Read code [files]. Update docs/12-domain/enumerations/[name].md
  to match current code. Preserve document format.
  ```

#### Step 3.2: Use Cases

**For each UC with drift, perform these steps:**

1. Read the implementation code:
   - Backend: route files, services
   - Frontend: hooks, components, pages
2. Read the current specification: `docs/14-usecases/UC[###]-[name].md`
3. Update the spec to accurately describe current code behavior
4. Preserve document format (sections, step numbering, AF/exceptions)
5. Do NOT add anything not in the code — describe only what's implemented

#### Step 3.3: Screen Specs

For each screen with drift:

1. Read current components (React)
2. Read current screen spec
3. Update: dimensions, components, behavior, mobile patterns

**Approach:** Edit directly (screen specs usually have small discrepancies).

#### Step 3.4: API Contracts

Update `.tl/tasks/*/api-contract.md` for each UC:

1. Read backend routes — extract endpoints, schemas, responses
2. Update api-contract.md

#### Step 3.4b: Advance task provenance (graph, conditional)

Reconcile just rewrote task files. If the project graph is reachable
(`mcp__neo4j__write-cypher` available), close the provenance loop for every UC
whose `.tl/tasks/<UC>/` files are now FULLY current with both code and spec —
otherwise `nacl-tl-plan` Signal 1 (`spec_version > planned_from_version`) keeps
flagging those tasks as drifted forever. See the pfv-advance contract in
`provenance-gap-closure.md` (TL-core references).

```cypher
// mcp__neo4j__write-cypher
// Params: $syncedUcIds — UCs whose task files reconcile brought fully current
MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE uc.id IN $syncedUcIds
SET t.planned_from_version = coalesce(uc.spec_version, 0)
REMOVE t.review_status, t.stale_reason, t.stale_since, t.stale_origin
WITH DISTINCT uc
REMOVE uc.review_status, uc.stale_reason, uc.stale_since, uc.stale_origin
```

Include ONLY UCs where reconcile updated or verified ALL task files
(api-contract.md AND the task/test/brief files) against current code. If only
api-contract.md was touched and the other files still embed an older snapshot,
leave the UC out — its regen belongs to `nacl-tl-plan`, and pfv must stay
behind so Signal 1 keeps pointing at it.

If the graph is unreachable, skip and record in the Phase 5 report:
`pfv advancement deferred — graph unavailable; run nacl-tl-plan to close`.

#### Step 3.5: Missing Docs (New)

**UC index consistency check:** Before creating new UC files, read `docs/14-usecases/_uc-index.md` (or equivalent index). Verify:
- What UC numbers are already assigned
- Whether the area already has a UC entry (even if the file is missing)
- Use the EXISTING numbering, do not invent new UC IDs

For areas WITHOUT documentation:

1. Read code implementation
2. Create MINIMAL specification:
   - For UC: brief description + main flow + endpoints
   - For protocol: event types + format + auth
   - For entity: schema + relations + lifecycle
3. **Immediately after writing the doc, validate it against code** (re-read the
   relevant source files and check all three of the following):
   - **(a) Entity schema match** — every field in the doc exists in the code
     schema (no phantom fields, no missing required fields).
   - **(b) Main flow step count match** — the number of documented steps equals
     the number of distinct handler/service steps in the code (±1 for minor
     grouping differences; beyond that, reject the edit).
   - **(c) Endpoint paths match** — every endpoint path listed in the doc
     appears verbatim in the route definitions (use `grep -r` to confirm).
   If any of the three checks fail, **reject the edit**, correct the doc, and
   re-validate before moving on. Do not advance to the next item with a
   failed validation.

**Do NOT create full SA artifacts.** Reconcile aims for MINIMAL coverage of each implemented area. Full specification is the job of /nacl:sa-uc, /nacl:sa-domain.

#### Step 3.6: .tl/ State

1. Update `.tl/status.json` — bring statuses in line with reality
2. Add entry to `.tl/changelog.md`:
   ```markdown
   ### [YYYY-MM-DD] nacl-tl-reconcile: Emergency reconciliation
   - **Scope:** [SMALL/MEDIUM/LARGE]
   - **Docs updated:** [N files]
   - **Docs created:** [N files]
   - **Health Score before:** [X]
   - **Trigger:** [description of cause]
   ```

---

### Phase 4: VALIDATE

**Goal:** Verify reconcile was successful.

**Precondition:** At least one of 4.1, 4.2 (widened), or 4.3 MUST produce
evidence. If both `nacl-sa-validate` and `nacl-ba-validate` are unavailable,
gap-check (4.2) becomes the mandatory fallback and MUST cover at least 10
reconciled docs. This is not optional — a reconcile with zero validation
evidence must not emit any RECONCILE headline; instead emit:
`RECONCILE HALTED — VALIDATION UNAVAILABLE`.

#### 4.1 sa-validate (optional)

Try to run `/nacl:sa-validate --scope=full` via Skill tool.

- **If available:** Run it. If errors:
  - < 5 errors → fix within reconcile
  - >= 5 errors → add to report as "remaining issues"
  - **Maximum 3 iterations** validate→fix→validate. After 3rd — report with remainder.
- **If not available** (skill not loaded or Skill tool unavailable): Skip and note in report: "sa-validate skipped — skill not available in current context." Rely on gap-check (4.2) instead.

#### 4.2 Re-run Gap Check (mandatory when 4.1 and 4.3 both unavailable; always runs otherwise)

This is the **fallback mandatory** validation step. Cover:
- **At minimum the top-10 changed/created docs** when gap-check is the only
  validation path (neither 4.1 nor 4.3 available).
- At minimum the top-3 changed/created docs when 4.1 or 4.3 also ran.

For each sampled doc:

1. Read the updated doc
2. Read the corresponding code
3. Verify the doc now accurately describes the code
4. Note any remaining discrepancies

If fewer than 10 docs were reconciled in total, cover all of them.

#### 4.3 ba-validate (optional, if BA artifacts exist)

If the project has BA artifacts (docs/01-business-processes/ etc.), try to run `/nacl:ba-validate --scope=cross`.

- **If available:** Check BA→SA cross-validation (XL1-XL5). The SA-side
  cross-checks (XL6-XL9) and the SA-internal levels L1-L13 are already
  covered by the sa-validate run in 4.1.
- **If not available:** Skip and note in report.

#### 4.4 Build + Test

Use the workspace's declared scripts only — never invent commands.

```bash
# Read declared commands; if undeclared, do NOT fall back.
build_cmd=$(jq -r '.scripts.build // empty' package.json 2>/dev/null)
test_cmd=$(jq -r '.scripts.test // empty' package.json 2>/dev/null)

if [ -n "$build_cmd" ]; then
  $build_cmd     # verify docs-only changes didn't break the build
else
  echo "build: NO_INFRA (scripts.build undeclared) — skipping"
fi

if [ -n "$test_cmd" ]; then
  $test_cmd      # tests still pass
else
  echo "test: NO_INFRA (scripts.test undeclared) — skipping"
fi
```

If either command is undeclared, record `NO_INFRA` for that component in the
Phase 5 `validation-result` column. Do NOT fall back to `npm run build`,
`npm test`, or any other invented command. Missing declared commands ⇒
`NO_INFRA`, never a synthetic PASS. If a declared command runs but exits
with a runner crash before any task ran, record `RUNNER_BROKEN (<reason>)`.

---

### Phase 5: REPORT

Present final report to user (in user's language). Open with the per-task
status table below — one row per recent fix scanned in Phase 1. The aggregate
RECONCILE headline is derived from this table: if any row has
`upstream-fix-status = UNVERIFIED`, the headline is
`RECONCILE APPLIED — UNVERIFIED (documenting unverified upstream behavior)`.

```
| source-task | upstream-fix-status          | doc-edit           | validation-result |
|-------------|------------------------------|--------------------|-------------------|
| TECH-001    | PASS                         | updated UC014.md   | gap-check: OK     |
| UC-022      | UNVERIFIED (verified-pending)| updated api.md     | gap-check: OK     |
| TECH-008    | SKIPPED (already-fixed)      | —                  | —                 |
```

Column definitions:
- **source-task**: task ID from Phase 1 scan (`.tl/status.json` / git log)
- **upstream-fix-status**: one of `PASS`, `UNVERIFIED (reason)`, `BLOCKED`,
  `SKIPPED (already-fixed)`, `N/A` (discrepancy unrelated to a fix task)
- **doc-edit**: which doc was changed, or `—` if skipped
- **validation-result**: gap-check result, sa-validate result, or `—` if skipped

Rows with `SKIPPED (already-fixed)` status are populated from the freshness
check in Phase 1. They represent discrepancies where `commit_date >
diagnostic_report_date` — the file was already updated after the report
was generated.

Then include:
- Health Score before → after (raw → adjusted for UNVERIFIED tasks)
- Docs updated: N files (list)
- Docs created: N files (list)
- .tl/ updated: yes/no
- Unverified fix acknowledgments (if any) — record explicitly:
  "User acknowledged that documenting unverified behavior is intentional for: [list]"
- Validation results (sa-validate, gap-check, ba-validate, build, tests)
- Remaining issues (if any)
- Recommendations for preventing future drift

Headline selection (evaluated in order — first match wins):
- REGRESSION detected in recent code →
  `RECONCILE HALTED — REGRESSION`
  (Do NOT reconcile docs to match code that has a known REGRESSION)
- Validation unavailable (neither 4.1 nor 4.2 nor 4.3 produced evidence) →
  `RECONCILE HALTED — VALIDATION UNAVAILABLE`
- ANY row in the per-task table has `upstream-fix-status = UNVERIFIED` →
  `RECONCILE APPLIED — UNVERIFIED (documenting unverified upstream behavior)`
  This applies whether or not the user acknowledged. Acknowledgment authorizes
  proceeding; it does not change the headline.
- All rows are PASS or SKIPPED (already-fixed) or N/A, and validation ran →
  `RECONCILE COMPLETE`

---

## Constraints

1. **Does NOT modify code.** Only documentation. Wrong code → recommend /nacl:tl-fix.
2. **All doc changes are justified.** Each change: "code does X, doc must describe X."
3. **USER GATE** is mandatory before Phase 3.
4. **Max 3 iterations** validate→fix→validate in Phase 4.
5. **Minimal new docs.** Reconcile creates minimal specs, not full SA artifacts.
6. **Code = reality** (only during reconcile). After reconcile, return to spec-first.

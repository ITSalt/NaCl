---
name: nacl-tl-reconcile
description: |
  Emergency documentation-code reconciliation.
  Brings all docs in sync with current code state.
  Uses nacl-tl-diagnose report, fixes docs via SA skills, validates result.
  Use when: massive drift, docs outdated, reconcile needed,
  bring docs in sync, or the user says "/nacl-tl-reconcile".
---

# TeamLead Emergency Reconciliation Skill

## Your Role

You are an **emergency reconciliation coordinator**. When documentation has drifted significantly from code, you systematically bring everything back in sync. You fix ONLY documentation — never code. If code is wrong, recommend `/nacl-tl-fix`.

## Key Principle: Docs Follow Code Reality (During Reconcile)

```
NORMAL MODE (spec-first):  Docs → Code  (docs are truth, code follows)
RECONCILE MODE:            Code → Docs  (code is reality, docs catch up)
```

Reconciliation is the **exception** to spec-first. When drift has accumulated, we accept that code represents the CURRENT reality and update docs to match it. After reconcile, we return to spec-first mode.

---

## Invocation

```
/nacl-tl-reconcile                              # full reconcile (includes nacl-tl-diagnose)
/nacl-tl-reconcile --report=DIAGNOSTIC-REPORT.md  # use existing report
/nacl-tl-reconcile --scope=UC014                # specific UC only
/nacl-tl-reconcile --dry-run                    # plan only, no changes
/nacl-tl-reconcile --force                      # skip USER GATE (for programmatic use)
```

---

## Workflow: 5 Phases

### Phase 1: DIAGNOSIS

**Goal:** Get a complete picture of all discrepancies.

```
IF --report flag provided:
  → Read specified DIAGNOSTIC-REPORT.md
  → Verify freshness (< 24 hours by file date)
  → If stale → warn user, suggest re-running /nacl-tl-diagnose

ELSE IF DIAGNOSTIC-REPORT.md exists in project root:
  → Check freshness (< 1 hour)
  → If fresh → use it
  → If stale → re-run /nacl-tl-diagnose

ELSE:
  → Run /nacl-tl-diagnose (full) via inline execution
  → Wait for DIAGNOSTIC-REPORT.md to be generated
```

Parse the diagnostic report to extract:
- List of discrepancies (doc says X, code does Y)
- Severity of each discrepancy (critical, high, medium, low)
- Affected UC/docs/code files
- Health Score

**Pre-flight freshness check:** For each discrepancy referencing a specific doc file, check if that file was modified AFTER the report date (`git log -1 --format="%ai" -- [doc_file]`). If the doc was updated after the report, re-verify the discrepancy before including it in the plan — it may already be fixed.

**If Health Score >= 80:** Report "Project is healthy, reconcile not needed" and exit.

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

**Do NOT proceed without explicit user confirmation** (unless `--force` flag is set).

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

**Do NOT create full SA artifacts.** Reconcile aims for MINIMAL coverage of each implemented area. Full specification is the job of /nacl-sa-uc, /nacl-sa-domain.

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

#### 4.1 sa-validate (optional)

Try to run `/nacl-sa-validate --scope=full` via Skill tool.

- **If available:** Run it. If errors:
  - < 5 errors → fix within reconcile
  - >= 5 errors → add to report as "remaining issues"
  - **Maximum 3 iterations** validate→fix→validate. After 3rd — report with remainder.
- **If not available** (skill not loaded or Skill tool unavailable): Skip and note in report: "sa-validate skipped — skill not available in current context." Rely on gap-check (4.2) instead.

#### 4.2 Re-run Gap Check (always runs)

This is the **mandatory** validation step. For the top-3 changed/created docs:

1. Read the updated doc
2. Read the corresponding code
3. Verify the doc now accurately describes the code
4. Note any remaining discrepancies

#### 4.3 ba-validate (optional, if BA artifacts exist)

If the project has BA artifacts (docs/01-business-processes/ etc.), try to run `/nacl-ba-validate --scope=cross`.

- **If available:** Check SA→BA cross-validation (XL6-XL9).
- **If not available:** Skip and note in report.

#### 4.4 Build + Test

```bash
npm run build    # verify docs-only changes didn't break the build
npm test         # tests still pass
```

---

### Phase 5: REPORT

Present final report to user (in user's language). Include:
- Health Score before → after
- Docs updated: N files (list)
- Docs created: N files (list)
- .tl/ updated: yes/no
- Validation results (sa-validate, gap-check, ba-validate, build, tests)
- Remaining issues (if any)
- Recommendations for preventing future drift

---

## Constraints

1. **Does NOT modify code.** Only documentation. Wrong code → recommend /nacl-tl-fix.
2. **All doc changes are justified.** Each change: "code does X, doc must describe X."
3. **USER GATE** is mandatory before Phase 3.
4. **Max 3 iterations** validate→fix→validate in Phase 4.
5. **Minimal new docs.** Reconcile creates minimal specs, not full SA artifacts.
6. **Code = reality** (only during reconcile). After reconcile, return to spec-first.

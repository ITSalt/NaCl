---
name: tl-conductor
description: |
  Process manager for the full development workflow: intake to staging.
  Creates feature branches, dispatches sub-agents for each task,
  commits per UC atomically, then delivers via tl-deliver.
  Use when: run full batch workflow, orchestrate intake items,
  manage feature branch lifecycle, or the user says "/tl-conductor".
---

# TeamLead Conductor — Process Manager

## Your Role

You are the **process manager**. You know the entire workflow from user request to staging deployment. You do NOT write code, review code, or run tests yourself — you delegate everything to specialized skills via sub-agents (Task tool).

Your job is **orchestration and decision-making**:
- Create and manage feature branches
- Dispatch development work to the right skills
- Commit each completed UC atomically
- Handle failures, retries, and edge cases
- Coordinate delivery to staging

**Nothing should surprise you.** Every possible outcome from a sub-agent (success, failure, timeout, partial result) has a defined response in your workflow.

## Key Principle

```
Feature branch → per-item development via sub-agents → atomic commit per item → batch delivery to staging.
One branch per batch. One commit per UC/BUG/TECH. One push at the end.
```

---

## Invocation

```
/tl-conductor --items FR-001,FR-002,BUG-003    # batch items from intake
/tl-conductor --feature FR-001                  # single feature request
/tl-conductor --branch feature/sprint-42        # explicit branch name
/tl-conductor --skip-deliver                    # dev only, no delivery
/tl-conductor --skip-qa                         # skip pre-ship QA in dev cycle
/tl-conductor --yes                             # skip user gates
```

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| Git strategy | `git.strategy` > `modules.[name].git_strategy` > fallback `"feature-branch"` |
| Base branch | `git.main_branch` > `modules.[name].git_base_branch` > fallback `"main"` |
| Branch prefix | `git.branch_prefix` > fallback `"feature/"` |
| Build command | `modules.[name].build_cmd` > fallback `npm run build` |
| Test command | `modules.[name].test_cmd` > fallback `npm test` |
| YouGile columns | `yougile.columns.*` |
| Deploy config | `deploy.staging.*` |

If config.yaml missing → use fallback defaults. If YouGile missing → skip task moves.

---

## State File: `.tl/conductor-state.json`

Conductor persists its state for resumption:

```json
{
  "branch": "feature/FR-001-generation-controls",
  "baseBranch": "main",
  "items": [
    { "id": "FR-001", "type": "feature", "ucs": ["UC028", "UC029"] },
    { "id": "BUG-003", "type": "bug", "description": "Share button on mobile" }
  ],
  "started": "2026-04-04T10:00:00Z",
  "phase": "development",
  "techTasks": [
    { "id": "TECH-001", "status": "done", "commit": "abc1234" },
    { "id": "TECH-002", "status": "pending" }
  ],
  "ucTasks": [
    { "id": "UC028", "wave": 1, "status": "done", "commit": "def5678" },
    { "id": "UC029", "wave": 1, "status": "in_progress" }
  ],
  "bugFixes": [
    { "id": "BUG-003", "status": "pending" }
  ],
  "delivery": {
    "status": "pending"
  }
}
```

**Always update this file after each significant state change** (task completion, failure, phase transition). This enables resumption if the session is interrupted.

---

## Workflow: 7 Phases

### Phase 0: INIT

1. Read `config.yaml` (git strategy, modules, yougile)
2. Check for existing `.tl/conductor-state.json`:
   - If exists → **RESUME MODE** (see Resumption section below)
   - If not → fresh start
3. Determine scope of work:
   - If `--items`: parse comma-separated list (FR-NNN, BUG-NNN, TECH-NNN)
   - If `--feature`: read `.tl/feature-requests/FR-NNN.md`, extract affected UCs
   - If neither: read `.tl/status.json`, find all incomplete items
4. Read `.tl/master-plan.md` (if exists) for wave structure and dependencies
5. Build execution plan:
   - TECH tasks (Wave 0): ordered by dependency
   - UC tasks (Waves 1..N): ordered by wave, then by priority within wave
   - Bug fixes: independent, can run in any order

6. **USER GATE** (skip if `--yes`):
   ```
   ═══════════════════════════════════════════════
     CONDUCTOR — EXECUTION PLAN
   ═══════════════════════════════════════════════

   Branch: feature/FR-001-generation-controls
   Base: main

   Items: 3 (2 features, 1 bugfix)

   Wave 0 — Infrastructure:
     TECH-001: Shared types setup

   Wave 1 — Core:
     UC028: Image format selection (BE + FE)
     UC029: Scene prompt display (BE + FE)

   Independent:
     BUG-003: Share button on mobile

   Proceed? [y/n]
   ═══════════════════════════════════════════════
   ```

---

### Phase 1: BRANCH

1. Determine branch name:
   - If `--branch`: use as-is
   - If `--feature FR-001`: `feature/FR-001-[slugified-title]`
   - If `--items`: `feature/intake-YYYY-MM-DD`
2. Resolve base branch from config
3. Create branch:
   ```bash
   git checkout -b [branch_name] [base_branch]
   ```
4. If branch already exists (resume scenario):
   ```bash
   git checkout [branch_name]
   ```
5. Write initial `.tl/conductor-state.json`

---

### Phase 2: PLAN (conditional)

**Skip if** `.tl/master-plan.md` and `.tl/tasks/` already exist with all needed task files.

For each FR item that needs planning:
1. Launch sub-agent (Task tool): `/tl-plan --feature FR-NNN`
2. Wait for completion
3. Verify: `.tl/master-plan.md` updated, task files created in `.tl/tasks/`
4. Parse execution waves from master-plan.md

Update `conductor-state.json` with wave assignments.

---

### Phase 3: DEVELOPMENT

Execute items by wave, respecting dependencies.

#### Wave 0 — TECH tasks (sequential)

For each TECH task:

```
1. Update conductor-state.json: TECH-### status = "in_progress"

2. Launch sub-agent (Task tool):
   Execute /tl-dev TECH-###

3. Wait for result

4. Launch sub-agent (Task tool):
   Execute /tl-review TECH-###

5. If review REJECTED → retry loop (max 3):
   a. Launch sub-agent: /tl-dev TECH-### --continue
   b. Launch sub-agent: /tl-review TECH-###
   c. If approved → break
   d. If rejected again → increment retry counter

6. If APPROVED:
   a. Stage and commit:
      git add -A
      git commit -m "TECH-###: [title from task.md]"
   b. Update conductor-state.json: status = "done", commit = [hash]

7. If FAILED (3 retries exhausted):
   a. Update conductor-state.json: status = "failed", reason = [details]
   b. Log failure, continue to next TECH task
```

#### Waves 1..N — UC tasks

For each UC in wave order (sequential within wave, wave-by-wave):

```
1. Update conductor-state.json: UC### status = "in_progress"

2. Launch sub-agent (Task tool):
   Execute /tl-full --task UC### --skip-plan [--skip-qa if conductor has --skip-qa]
   
   This runs the full 8-step UC lifecycle:
   BE dev → BE review → FE dev → FE review → Sync → Stubs → QA → Docs

3. Wait for completion

4. Check result:
   a. Read .tl/status.json for UC### phases
   b. If ALL phases done/approved/pass:
      - Stage and commit:
        git add -A
        git commit -m "UC###: [title from task-be.md or status.json]"
      - Update conductor-state.json: status = "done", commit = [hash]
   c. If any phase FAILED:
      - Update conductor-state.json: status = "failed", failedPhase = [phase], reason = [details]
      - Log failure, continue to next UC
```

#### Bug fixes (independent, after TECH, can interleave with UCs)

For each BUG item:

```
1. Update conductor-state.json: BUG-### status = "in_progress"

2. Launch sub-agent (Task tool):
   Execute /tl-fix "[description from intake]"

3. Wait for completion

4. If fix successful:
   a. Stage and commit:
      git add -A
      git commit -m "fix: [short description]"
   b. Update conductor-state.json: status = "done", commit = [hash]

5. If fix failed:
   a. Update conductor-state.json: status = "failed", reason = [details]
   b. Log failure, continue
```

---

### Phase 4: QUALITY GATE

After all development items have been processed:

1. Launch sub-agent (Task tool): `/tl-stubs --final`
2. Parse result:
   - If critical stubs = 0 → proceed
   - If critical stubs > 0:
     a. Attempt fix (launch sub-agent to resolve critical stubs)
     b. Re-scan (max 2 retries)
     c. If still critical → record in state, warn in report

3. Review conductor-state.json:
   - Count: done, failed, pending items
   - If ALL items done → proceed to Phase 5
   - If SOME failed → **USER GATE** (skip if `--yes`):
     ```
     ⚠️  Partial completion: 2/3 items done, 1 failed.
     
     ✅ UC028: Image format selection
     ✅ BUG-003: Share button on mobile
     ❌ UC029: Scene prompt display (FAILED at sync, 3 retries)
     
     Options:
       [1] Continue to delivery (ship what's done)
       [2] Abort (keep branch, fix manually later)
     ```
   - If ALL failed → abort delivery, full failure report

4. Update conductor-state.json: phase = "quality_gate_passed"

---

### Phase 5: DELIVERY (skip if `--skip-deliver`)

1. Update conductor-state.json: phase = "delivery"

2. Launch sub-agent (Task tool):
   ```
   Execute /tl-deliver --branch [branch_name]
   ```
   
   tl-deliver handles:
   - Push branch to origin
   - Create PR (if feature-branch strategy)
   - Wait for CI pipeline
   - Run verification on staging (tl-verify)
   - Health check

3. Wait for result

4. Parse delivery result:
   - If ALL PASS → update conductor-state.json: delivery.status = "done"
   - If VERIFY FAIL → update: delivery.status = "verify_failed"
   - If DEPLOY FAIL → update: delivery.status = "deploy_failed"
   - If CI FAIL → update: delivery.status = "ci_failed"

---

### Phase 6: REPORT

Display the final report (in user's language):

```
═══════════════════════════════════════════════════════════════
                  BATCH EXECUTION COMPLETE
═══════════════════════════════════════════════════════════════

Branch: feature/FR-001-generation-controls
Duration: 2h 14m

Development:
  ✅ TECH-001: Shared types setup            (commit abc1234)
  ✅ UC028: Image format selection            (commit def5678)
  ❌ UC029: Scene prompt display              (FAILED at sync)
  ✅ BUG-003: Share button on mobile          (commit 789abcd)

  Result: 3/4 items completed

Quality:
  Stubs: 0 critical, 3 warnings
  Pre-ship QA: 2/2 passed (UC029 skipped — failed)

Delivery:
  Ship: pushed to origin/feature/FR-001, PR #42
  CI: passed (3m 12s)
  Verify: PASS (code analysis + E2E)
  Deploy: staging healthy (https://staging.example.com)

YouGile: completed tasks → ToRelease

Problems:
  1. UC029 failed at sync phase after 3 retries.
     See .tl/tasks/UC029/sync-report.md
     Fix manually: /tl-full --task UC029

Next:
  /tl-release              — production release
  /tl-full --task UC029    — fix failed UC
  /tl-conductor --items ... — next batch
═══════════════════════════════════════════════════════════════
```

---

## Failure Handling Matrix

Every possible sub-agent outcome has a defined response:

| Situation | Conductor Action |
|-----------|-----------------|
| tl-full returns DONE for UC | Commit atomically, continue |
| tl-full returns FAILED for UC | Record failure with phase + reason, continue to next UC |
| tl-dev returns FAILED for TECH | Retry with review loop (max 3), then record failure |
| tl-fix returns FAILED for BUG | Record failure, continue |
| Sub-agent timeout / no response | Record as timeout, continue. Recommend manual retry in report |
| Git conflict on commit | Attempt `git add -A && git commit`. If conflict → pause, ask user |
| Git conflict on branch creation | Checkout existing branch (resume scenario) |
| tl-deliver FAIL at ship (push rejected) | Pull --rebase, retry push. If still fails → report |
| tl-deliver FAIL at CI | Read CI logs, include in report. Suggest fix |
| tl-deliver FAIL at verify | Record. Suggest /tl-reopened for specific UCs |
| tl-deliver FAIL at deploy | Record with details. Suggest checking pipeline |
| All items failed | Skip delivery entirely. Full failure report |
| Partial success (some done, some failed) | User gate: continue with partial delivery or abort |
| Conductor session interrupted | State saved in conductor-state.json. Resume on next run |

---

## Resumption Logic

On start, if `.tl/conductor-state.json` exists:

1. Read state file
2. Determine current phase and last completed item
3. Resume from the right point:

```
phase = "development":
  - Find first item with status != "done" and status != "failed"
  - For TECH: check if dev done but review pending
  - For UC: delegate to tl-full --task (it has its own resumption via status.json)
  - For BUG: re-run tl-fix if status = "in_progress"

phase = "quality_gate_passed":
  - Skip directly to Phase 5 (delivery)

phase = "delivery":
  - Read .tl/delivery-status.json
  - Resume tl-deliver from incomplete step (ship/ci/verify/deploy)

phase = "complete":
  - Show last report, ask if user wants to re-run anything
```

4. **USER GATE** (skip if `--yes`):
   ```
   Resuming from previous session.

   Branch: feature/FR-001-generation-controls
   Completed: TECH-001 ✅, UC028 ✅
   Resuming from: UC029 (Wave 1)

   Continue? [y/n]
   ```

---

## YouGile Integration

| Phase | Column Transition | Actor |
|-------|------------------|-------|
| Phase 0 (init) | UserRequests → Backlog | tl-intake (before conductor) |
| Phase 3 (dev start) | Backlog → InWork | conductor (or tl-full internally) |
| Phase 3 (dev done) | InWork → DevDone | tl-full (per UC, automatic) |
| Phase 5 (verify) | DevDone → Testing | tl-verify (inside tl-deliver) |
| Phase 5 (verify pass) | Testing → ToRelease | tl-verify (inside tl-deliver) |
| Phase 5 (verify fail) | Testing → Reopened | tl-verify (inside tl-deliver) |
| Manual | ToRelease → Done | tl-release (manual, production) |

Conductor does NOT directly move YouGile tasks. It delegates to sub-skills that handle their own YouGile transitions. Conductor only reads YouGile state for awareness.

---

## Relationship to Other Skills

```
tl-intake → classifies requests → recommends /tl-conductor
tl-conductor → orchestrates batch → delegates to:
  ├── /tl-plan (planning, if needed)
  ├── /tl-dev TECH-### (infrastructure)
  ├── /tl-review TECH-### (TECH review)
  ├── /tl-full --task UC### (per-UC lifecycle)
  ├── /tl-fix "description" (bug fixes)
  ├── /tl-stubs --final (quality gate)
  └── /tl-deliver (push → verify → deploy)

tl-full remains the per-UC lifecycle executor (unchanged).
tl-deliver handles the ship→verify→deploy chain.
tl-conductor is the process manager that ties everything together.
```

### What conductor does NOT do:
- Write or review code (delegates to tl-dev-be/fe via tl-full)
- Run tests (delegates to tl-full, tl-verify)
- Create specifications (delegates to sa-feature via tl-intake)
- Move YouGile tasks (delegates to sub-skills)

### What conductor DOES do:
- Create and manage feature branches
- Decide execution order (waves, dependencies)
- Commit completed work atomically
- Handle failures and retries at the batch level
- Coordinate delivery timing
- Maintain persistent state for resumption
- Report progress and final results

---

## Edge Cases

### Single item batch
If only one FR or BUG is provided, conductor still creates a feature branch and follows the full workflow. This ensures consistent git history and delivery process.

### No TECH tasks
If master-plan.md has no Wave 0 (TECH), skip directly to UC waves.

### All items are bugs
Skip planning phase. Each bug gets /tl-fix → commit. Then deliver.

### Feature branch already exists on remote
If `git push` reports the branch exists:
- If conductor-state.json exists → resume mode, checkout and continue
- If no state → ask user: "Branch exists. Checkout and continue, or create new branch?"

### Conflicting changes between UCs
If UC029 modifies files that UC028 already committed:
- Git handles this naturally (both commits on same branch)
- If actual conflict (same lines changed): git commit will succeed (both changes are staged)
- If test failures after commit: the quality gate (Phase 4) catches this

---

## References

- `config.yaml` → git strategy, modules, deploy, yougile
- `.tl/master-plan.md` → wave structure, task dependencies
- `.tl/status.json` → per-UC phase tracking
- `.tl/conductor-state.json` → conductor's own state (created by this skill)
- `.tl/delivery-status.json` → delivery state (created by tl-deliver)
- `.tl/feature-requests/FR-NNN.md` → feature request artifacts

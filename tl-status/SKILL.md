---
name: tl-status
description: |
  Project status reporting with per-phase progress tracking.
  Displays BE/FE separate progress per UC task, TECH tasks section,
  execution waves, stubs summary, QA results, sync status and blockers.
  Use when: show project status, check progress, view task overview,
  see blockers, show development status, or the user says "/tl-status".
---

# TeamLead Status Skill

You are a **project status reporter** responsible for presenting clear, actionable project progress information. You read tracking files and generate comprehensive status reports covering execution waves, per-phase BE/FE progress, TECH tasks, stubs, QA results and sync checks.

## Your Role

- **Read status.json** to get current task states and phase-level progress
- **Read stub-registry.json** to get stubs summary (critical, warning, info)
- **Read QA reports** to summarize E2E test results per task
- **Calculate progress metrics** based on phases, not just tasks
- **Display execution waves** with task statuses per wave
- **Identify blockers** and dependency chains
- **Present visual progress indicators** with progress bars
- **Suggest next actions** based on current state and blockers

## Key Principle: Actionable Visibility

Status reports must be actionable. Every report ends with a concrete recommendation.

```
Visual:       Progress bars and clear metrics
Focused:      Highlight what matters now (current wave, blockers)
Per-phase:    BE and FE tracked independently for each UC
Stubs:        Surface critical/warning stubs immediately
QA:           Show pass/fail/pending counts
Next steps:   Always suggest the next action with a command
```

## Pre-Status Checks

Before generating a report, verify in order:

1. **TL structure exists**: `.tl/` directory present
2. **Status file exists**: `.tl/status.json` readable and valid JSON
3. **Tasks exist**: `.tl/tasks/` has task directories

If `.tl/` does not exist:

```
Error: Project not initialized for TeamLead workflow
No .tl/ directory found.
To initialize the project: /tl-plan
```

If `.tl/status.json` is missing or invalid:

```
Warning: status.json is missing or corrupted
Attempting to rebuild from task files...
Recommendation: Run /tl-plan --refresh to regenerate status
```

If `.tl/tasks/` is empty:

```
Project Status: Empty
No tasks found. Run /tl-plan to generate tasks from SA specifications.
```

## Workflow

### Step 1: Read Data Sources

| File | Purpose |
|------|---------|
| `.tl/status.json` | Task list, phases, waves, project metadata |
| `.tl/stub-registry.json` | Stubs summary (if exists) |
| `.tl/tasks/*/qa-report.md` | QA results per task (if exist) |
| `.tl/tasks/*/sync-report.md` | Sync results per task (if exist) |
| `.tl/master-plan.md` | Execution waves and dependencies |

### Step 2: Calculate Phase-Based Progress

Progress is calculated based on **phases**, not just tasks.

For UC tasks, each task has 6 phases: `be`, `fe`, `sync`, `review_be`, `review_fe`, `qa`.
For TECH tasks, each task has 1 phase: `status`.

**Overall progress formula:**

```
completed_phases = sum of all phases with status in [done, approved, pass]
total_phases = (UC_count * 6) + TECH_count
progress_percent = (completed_phases / total_phases) * 100
```

**Phase completion mapping:**

| Phase | Completed when status is |
|-------|--------------------------|
| `be`, `fe` | `done` |
| `sync`, `qa` | `pass` or `done` |
| `review_be`, `review_fe` | `approved` |
| TECH `status` | `done` |

### Step 3: Generate Progress Bar

20 characters wide. Each character = 5%. Use `=` for filled, `-` for empty:

```
Overall Progress: [================----] 60% (18/30 phases)
```

### Step 4: Build Execution Waves Display

Group tasks by their `wave` field. Status icons: `[x]` done/approved/pass, `[~]` in_progress/in_review, `[ ]` pending, `[!]` blocked/rejected/fail.

```
-- Execution Waves -------------------------------------------

Wave 0 (Infrastructure):
  [x] TECH-001: Docker Compose Setup        [done]
  [~] TECH-002: CI/CD Pipeline              [in_progress]

Wave 1 (Core Backend):
  [x] UC001-BE: Create Order (Backend)      [done]
  [x] UC002-BE: Edit Order (Backend)        [done]

Wave 2 (Core Frontend + Next BE):
  [~] UC001-FE: Create Order (Frontend)     [in_progress]
  [ ] UC003-BE: Delete Order (Backend)      [pending]
```

### Step 5: Build UC Task Details

For each UC task, display all 6 phases in a compact two-column layout:

```
-- UC Task Details -------------------------------------------

UC001: Create Order
  BE:     [x] done     | Review-BE: [x] approved
  FE:     [~] dev      | Review-FE: [ ] pending
  Sync:   [ ] pending  | QA:        [ ] pending
  Stubs:  0 critical, 2 warnings

UC002: Edit Order
  BE:     [x] done     | Review-BE: [x] approved
  FE:     [ ] pending  | Review-FE: [ ] pending
  Sync:   [ ] pending  | QA:        [ ] pending
  Stubs:  --
```

Phase status display: `pending` -> `[ ] pending`, `in_progress`/`ready_for_review`/`in_review` -> `[~] dev/review`, `approved`/`done`/`pass` -> `[x]`, `fail`/`rejected`/`blocked` -> `[!]`.

### Step 6: Build TECH Tasks Section

```
-- TECH Tasks ------------------------------------------------

TECH-001: Docker Compose Setup      [x] done
TECH-002: CI/CD Pipeline            [~] in_progress
```

### Step 7: Build Summary Table

```
-- Summary ---------------------------------------------------

| Category       | Done | Total |
|----------------|------|-------|
| TECH tasks     |  1   |  2    |
| BE development |  3   |  5    |
| FE development |  1   |  5    |
| BE reviews     |  3   |  5    |
| FE reviews     |  0   |  5    |
| Sync checks    |  0   |  5    |
| QA tests       |  0   |  5    |
```

### Step 8: Build Stubs Summary

If `.tl/stub-registry.json` exists, read the `summary` field and per-task `stubs` from status.json.

- Normal: `Stubs: 0 critical, 4 warnings, 12 info`
- Critical found: `!! Stubs: 2 critical, 4 warnings -- Critical in: UC003-BE (2), TECH-002 (1)`
- No registry: `Stubs: No stub registry found (run /tl-stubs to scan)`

### Step 9: Build QA Summary

Scan `.tl/tasks/*/qa-report.md` and read `qa` phase from each UC task.

- Normal: `QA: 2 passed, 1 failed, 5 pending`
- Failures: append `FAIL: UC003 (API timeout on delete endpoint)`
- Not started: `QA: Not started (0/8 tasks tested)`

### Step 9.5: Build Delivery Summary

Check for delivery state files:
- `.tl/conductor-state.json` — conductor batch state (branch, items, commits)
- `.tl/delivery-status.json` — delivery pipeline state (ship, CI, verify, deploy)

If **conductor-state.json** exists:
```
-- Delivery ---------------------------------------------------

Branch:  feature/FR-001-generation-controls
Items:   3 total (2 done, 1 in_progress)
Commits: UC028 (abc1234), BUG-003 (def5678)
Phase:   development
```

If **delivery-status.json** exists:
```
-- Delivery ---------------------------------------------------

Branch:  feature/FR-001-generation-controls
Ship:    ✅ pushed (abc1234), PR #42
CI:      ✅ passed (3m 12s)
Verify:  ⏳ in_progress
Deploy:  ⏳ pending
```

If neither file exists:
```
-- Delivery ---------------------------------------------------

Not started. After development:
  /tl-deliver              — push + verify + deploy
  /tl-conductor --items ...— full managed workflow
```

### Step 10: Identify Blockers

A task phase is blocked when its dependency is not met:

1. **FE blocked by BE**: FE cannot start if BE is not `done`/`approved`
2. **Sync blocked by BE+FE**: requires both BE and FE `approved`
3. **QA blocked by sync**: requires sync `pass`/`done`
4. **Review blocked by dev**: requires dev `ready_for_review` or later
5. **Wave dependency**: Wave N+1 tasks may depend on Wave N

```
-- Blockers --------------------------------------------------

[!] UC003-FE: Waiting for UC003-BE completion
[!] UC001-QA: Waiting for UC001-SYNC completion
```

If no blockers: `No blockers detected. All dependencies satisfied.`

### Step 11: Generate Recommendations

Suggest 1-3 actionable next steps. Prioritize: (1) tasks that unblock the most others, (2) current active wave, (3) highest priority, (4) finishing in-progress work first.

```
-- Recommendations -------------------------------------------

1. Complete UC001-FE development (unblocks sync + QA)
   /tl-dev-fe UC001

2. Complete TECH-002 (unblocks Wave 2 infrastructure)
   /tl-dev TECH-002
```

## Full Status Output Format

```
===========================================================
                    PROJECT STATUS
===========================================================

Project: [Project Name]
Updated: YYYY-MM-DD HH:MM

Overall Progress: [================----] 60% (18/30 phases)

-- Execution Waves -------------------------------------------

Wave 0 (Infrastructure):
  [x] TECH-001: Docker Compose Setup        [done]
  [~] TECH-002: CI/CD Pipeline              [in_progress]

Wave 1 (Core Backend):
  [x] UC001-BE: Create Order (Backend)      [done]
  [x] UC002-BE: Edit Order (Backend)        [done]

Wave 2 (Core Frontend + Next BE):
  [~] UC001-FE: Create Order (Frontend)     [in_progress]
  [ ] UC003-BE: Delete Order (Backend)      [pending]

-- UC Task Details -------------------------------------------

UC001: Create Order
  BE:     [x] done     | Review-BE: [x] approved
  FE:     [~] dev      | Review-FE: [ ] pending
  Sync:   [ ] pending  | QA:        [ ] pending
  Stubs:  0 critical, 2 warnings

UC002: Edit Order
  BE:     [x] done     | Review-BE: [x] approved
  FE:     [ ] pending  | Review-FE: [ ] pending
  Sync:   [ ] pending  | QA:        [ ] pending
  Stubs:  --

-- TECH Tasks ------------------------------------------------

TECH-001: Docker Compose Setup      [x] done
TECH-002: CI/CD Pipeline            [~] in_progress

-- Summary ---------------------------------------------------

| Category       | Done | Total |
|----------------|------|-------|
| TECH tasks     |  1   |  2    |
| BE development |  3   |  5    |
| FE development |  1   |  5    |
| BE reviews     |  3   |  5    |
| FE reviews     |  0   |  5    |
| Sync checks    |  0   |  5    |
| QA tests       |  0   |  5    |

Stubs: 0 critical, 4 warnings, 12 info
QA: 0 passed, 0 failed, 5 pending

-- Delivery ---------------------------------------------------

Not started. After development: /tl-deliver

-- Blockers --------------------------------------------------

[!] UC003-FE: Waiting for UC003-BE completion
[!] UC001-QA: Waiting for UC001-SYNC completion

-- Recommendations -------------------------------------------

1. Complete UC001-FE development (unblocks sync + QA)
   /tl-dev-fe UC001

2. Complete TECH-002 (unblocks Wave 1 tasks)
   /tl-dev TECH-002

===========================================================
```

## Compact Status Format

When `--compact` flag is used, display a two-line summary:

```
Project: [Name] | Progress: 60% | BE: 3/5 | FE: 1/5 | TECH: 1/2 | Stubs: 4w | QA: 0/5
Next: /tl-dev-fe UC001
```

Rules: one line for metrics, one for next action. Stubs: `Nc` critical, `Nw` warnings (e.g. `2c 4w`). If clean: `Stubs: ok`. QA: passed/total.

## Filtering Options

```
/tl-status                # Full report (all sections)
/tl-status --waves        # Show wave-by-wave progress only
/tl-status --be           # Show only BE progress (BE dev + BE review phases)
/tl-status --fe           # Show only FE progress (FE dev + FE review phases)
/tl-status --tech         # Show only TECH tasks section
/tl-status --stubs        # Show detailed stubs report (by severity, marker, task)
/tl-status --qa           # Show QA results per task (pass/fail/pending)
/tl-status --blocked      # Show blockers with dependency chains
/tl-status --compact      # One-line compact summary
```

### --waves

Show waves section only, each wave gets its own progress bar:

```
Wave 0 (Infrastructure):  [==========----------] 50% (1/2)
  [x] TECH-001: Docker Compose Setup   [done]
  [~] TECH-002: CI/CD Pipeline         [in_progress]
```

### --be / --fe

Show only backend or frontend phases per UC task with a summary line:

```
UC001: BE dev [x] done | BE review [x] approved
UC002: BE dev [x] done | BE review [x] approved
Summary: BE dev 2/3 done | BE review 2/3 done
```

### --stubs

Detailed stubs by severity, marker, and task. Include last scan time and unresolved critical count.

### --qa

Per-task QA status: PASS / FAIL (with failure reason) / pending. Include report file path.

### --blocked

Blockers with full dependency chains and recommendations to unblock:

```
[!] UC003-FE: Waiting for UC003-BE completion
    Chain: UC003-BE (pending) -> UC003-FE -> UC003-SYNC -> UC003-QA
Recommendations to unblock:
  1. /tl-dev-be UC003  (unblocks 4 downstream phases)
```

## Status JSON Structure

Expected format of `.tl/status.json`:

```json
{
  "project": "Project Name",
  "created": "2025-01-01T00:00:00Z",
  "updated": "2025-01-15T14:30:00Z",
  "waves": [
    { "id": 0, "name": "Infrastructure", "tasks": ["TECH-001", "TECH-002"] },
    { "id": 1, "name": "Core Backend", "tasks": ["UC001", "UC002"] },
    { "id": 2, "name": "Core Frontend", "tasks": ["UC001", "UC003"] }
  ],
  "tasks": [
    {
      "id": "UC001",
      "title": "Create Order",
      "type": "uc",
      "priority": "high",
      "wave": 1,
      "phases": {
        "be": { "status": "done", "started": "...", "completed": "..." },
        "fe": { "status": "in_progress", "started": "..." },
        "sync": { "status": "pending" },
        "review_be": { "status": "approved" },
        "review_fe": { "status": "pending" },
        "qa": { "status": "pending" }
      },
      "stubs": { "critical": 0, "warning": 2, "info": 5 }
    },
    {
      "id": "TECH-001",
      "title": "Docker Compose Setup",
      "type": "tech",
      "status": "done",
      "wave": 0
    }
  ]
}
```

### Task Types

| Type | Prefix | Phases | Description |
|------|--------|--------|-------------|
| `uc` | UC### | 6 (be, fe, sync, review_be, review_fe, qa) | Use case implementation |
| `tech` | TECH-### | 1 (status) | Infrastructure / config task |

### Phase Status Values

| Status | Meaning | Complete? |
|--------|---------|-----------|
| `pending` | Not started | No |
| `in_progress` | Being worked on | No |
| `ready_for_review` | Dev done, awaiting review | No |
| `in_review` | Review in progress | No |
| `approved` | Review passed | Yes |
| `rejected` | Review failed | No |
| `done` | Fully complete | Yes |
| `pass` | QA/sync passed | Yes |
| `fail` | QA/sync failed | No |
| `blocked` | Waiting on dependency | No |

## Stub Registry Structure

Expected format of `.tl/stub-registry.json` (read-only for this skill). Key fields:
- `stubs[]` -- array of individual stub entries with `id`, `marker`, `file`, `line`, `text`, `task_id`, `severity`, `resolved`
- `summary.by_severity` -- counts by `critical`, `warning`, `info`
- `summary.by_marker` -- counts by `todo`, `fixme`, `stub`, `mock`, `hack`

```json
{
  "version": 1,
  "last_scan": "2025-01-30T15:00:00Z",
  "stubs": [
    { "id": "STUB-001", "marker": "TODO", "file": "src/orders/order.service.ts",
      "line": 45, "task_id": "UC001", "severity": "warning", "resolved": null }
  ],
  "summary": {
    "total": 12,
    "by_marker": { "todo": 5, "fixme": 3, "stub": 2, "mock": 1, "hack": 1 },
    "by_severity": { "critical": 0, "warning": 4, "info": 8 },
    "resolved": 0
  }
}
```

## Health Indicators

| Condition | Display |
|-----------|---------|
| Progress > 80%, no blockers | `[OK]` |
| Progress 50-80% | `[IN PROGRESS]` |
| Progress < 50% | `[EARLY STAGE]` |
| Any critical stubs | `[!! CRITICAL STUBS]` |
| Any QA failures | `[!! QA FAILURES]` |
| Blockers > 0 | `[BLOCKED]` |
| No activity 3+ days | `[STALE]` |

Multiple indicators can combine: `Health: [IN PROGRESS] [BLOCKED]`

## Error Handling

- **Partial data**: If optional files (stub-registry, qa-reports) are missing, generate partial report with a note: `Note: stub-registry.json not found. Run /tl-stubs to scan.`
- **Inconsistent data**: If phase states conflict (e.g., `be: done` but `review_be: pending` skipped), report the inconsistency and suggest `/tl-plan --refresh`.
- **Stale data**: If `updated` timestamp is older than 3 days, show: `Warning: Status data is stale (last updated: YYYY-MM-DD). Run /tl-status --refresh.`

## Reference Documents

| Topic | Reference |
|-------|-----------|
| TL protocol and agent contracts | `tl-core/references/tl-protocol.md` |
| Sync rules and checks | `tl-core/references/sync-rules.md` |
| Stub tracking rules | `tl-core/references/stub-tracking-rules.md` |
| QA rules and process | `tl-core/references/qa-rules.md` |

## Files Read by This Skill

This skill is read-only. It does not modify any files.

| File | Required | Purpose |
|------|----------|---------|
| `.tl/status.json` | Yes | Task list, phases, waves, metadata |
| `.tl/master-plan.md` | No | Wave definitions, dependency info |
| `.tl/stub-registry.json` | No | Stubs summary by severity and task |
| `.tl/tasks/*/qa-report.md` | No | QA test results per task |
| `.tl/tasks/*/sync-report.md` | No | Sync check results per task |
| `.tl/tasks/*/task.md` | No | Task metadata from frontmatter |

## Final Checklist

### Before Reporting

- [ ] `.tl/` directory exists
- [ ] `status.json` is readable and valid JSON
- [ ] Task counts are consistent (phases match task types)
- [ ] Wave definitions contain valid task references

### Report Content

- [ ] Overall progress bar displayed with phase-based calculation
- [ ] Execution waves listed with per-task status
- [ ] UC task details show all 6 phases per task
- [ ] TECH tasks listed with their status
- [ ] Summary table with counts by category
- [ ] Stubs summary included (or note if missing)
- [ ] QA summary included (or note if missing)
- [ ] Blockers section present (even if empty)
- [ ] At least one recommendation provided

### After Report

- [ ] User knows the next action to take
- [ ] Critical blockers are visible and explained
- [ ] Progress is clearly communicated at both overall and per-task levels
- [ ] Any data gaps are noted with instructions to fill them

## Next Steps

After viewing status, the user can:

- `/tl-next` -- Get suggested next task with reasoning
- `/tl-dev-be UC###` -- Start backend development on a specific UC
- `/tl-dev-fe UC###` -- Start frontend development on a specific UC
- `/tl-dev TECH-###` -- Work on a TECH task
- `/tl-sync UC###` -- Run sync check for a completed BE+FE pair
- `/tl-stubs` -- Scan codebase for stubs and update registry
- `/tl-qa UC###` -- Run E2E tests for a specific UC
- `/tl-review --be UC###` -- Review backend code for a UC
- `/tl-review --fe UC###` -- Review frontend code for a UC
- `/tl-plan --refresh` -- Rebuild status from task files

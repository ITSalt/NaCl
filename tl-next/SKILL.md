---
name: tl-next
description: |
  Wave-aware next task recommendation with phase-level priorities.
  Understands execution waves, BE/FE dependencies, sync/stubs/qa phases,
  and critical path analysis. Use when: suggest next task, what should I
  work on, get next task, recommend task, show available tasks, or the
  user says "/tl-next".
---

# TeamLead Next Task Skill

You are a **wave-aware task prioritization assistant** responsible for suggesting the optimal next task to work on. You analyze project status across execution waves, BE/FE dependencies, and multi-phase workflows to recommend the highest priority unblocked action.

## Your Role

- **Read status.json and master-plan.md** to get current task states and wave structure
- **Identify the active wave** (lowest wave with incomplete tasks)
- **Analyze phase dependencies** within each UC (BE -> review -> FE -> review -> sync -> stubs -> QA)
- **Filter blocked tasks** based on wave boundaries and cross-task dependencies
- **Recommend a single action** with phase-aware rationale and launch command
- **Show parallel opportunities** when multiple tasks are actionable

## Key Principle: Actionable Recommendation

**CRITICAL**: Always provide ONE clear recommendation with a launch command.

```
1. Single choice:    One task, not a list (unless --list flag)
2. Phase-aware:      Right phase for the UC lifecycle
3. Wave-aware:       Respect wave boundaries and parallelism
4. Unblocked:        No pending dependencies
5. Ready to start:   Immediate action command
```

## Pre-Check Requirements

Before recommending, verify:

1. **TL structure exists**: `.tl/` directory present
2. **Master plan exists**: `.tl/master-plan.md` readable (contains wave definitions)
3. **Status file exists**: `.tl/status.json` readable
4. **Tasks available**: At least one actionable task exists

If `.tl/` does not exist:

```
Error: Project not initialized for TeamLead workflow

No .tl/ directory found.
To initialize: /tl-plan
```

If `.tl/master-plan.md` does not exist but `.tl/status.json` does:

```
Warning: No master-plan.md found

Wave information unavailable. Recommendations based on
status.json priorities only, without wave ordering.
To generate the master plan: /tl-plan
```

## Workflow

### Step 1: Read Current Status

Read `.tl/master-plan.md` and `.tl/status.json`. Extract:

- Wave definitions and task assignments per wave
- All tasks with their current phase status
- BE/FE pairing information per UC
- Cross-task and cross-wave dependencies
- Stub registry summary (from `.tl/stub-registry.json` if present)

### Step 2: Determine Active Wave

Find the current active wave:

```
For each wave (starting from Wave 0):
  If wave has any task NOT in done status -> this is the active wave
If all waves complete -> show completion message
```

Wave 0 contains TECH infrastructure tasks and must complete before Wave 1 starts.

### Step 3: Build Candidate List

Within the active wave (and considering cross-wave phase unlocks), identify all actionable tasks. A task is actionable when its prerequisites are met.

**Phase action priority table** (highest to lowest):

| Priority | Phase | Condition | Command |
|----------|-------|-----------|---------|
| 0 (highest) | delivery pending | all dev tasks done, no failed | `/tl-deliver` or `/tl-conductor` |
| 1 | QA pending | sync passed + stubs clean | `/tl-qa UC###` |
| 2 | sync pending | BE approved + FE approved | `/tl-sync UC###` |
| 3 | review-fe pending | FE dev complete | `/tl-review UC### --fe` |
| 4 | review-be pending | BE dev complete | `/tl-review UC### --be` |
| 5 | stubs pending | dev complete (any type) | `/tl-stubs UC###` |
| 6 | fe pending | BE approved + api-contract exists | `/tl-dev-fe UC###` |
| 7 | be pending | wave dependencies met | `/tl-dev-be UC###` |
| 8 | tech pending | wave dependencies met | `/tl-dev TECH###` |

### Step 4: Apply Dependency Rules

```
TECH tasks (Wave 0):
  Must complete before Wave 1 tasks can start.

For each UC (within and across waves):
  BE dev -> BE review -> (api-contract must exist) -> FE dev
  FE dev -> FE review -> Sync check -> Stub scan -> QA test -> Done

Cross-UC:
  Tasks in the same wave can run in parallel.
  Tasks in later waves are blocked until previous wave completes.

Exception -- cross-wave phase unlock:
  If a UC's BE is approved and api-contract exists, the FE task
  for that UC CAN start even if it belongs to a later wave.
  Shown in "Also ready" section, not as primary recommendation.
```

### Step 5: Score and Rank Candidates

Calculate a composite score for each candidate:

```
score = priority_weight
      + status_order_weight
      + wave_bonus
      + dependency_bonus
      + phase_completion_bonus
      - age_penalty
```

| Component | Calculation | Description |
|-----------|-------------|-------------|
| priority_weight | critical=100, high=75, medium=50, low=25 | Task-level priority |
| status_order_weight | QA=70, sync=60, review=50, stubs=45, fe=30, be=20, tech=10 | Phases closer to done score higher |
| wave_bonus | +20 if in current active wave | Prefer current wave |
| dependency_bonus | blocks.length * 10 | Tasks that unblock others |
| phase_completion_bonus | +15 if UC has 4+ phases complete | Finish what is started |
| age_penalty | min(days_since_created * 0.5, 10) | Slight preference for newer tasks |

### Step 6: Select and Present

Pick the single highest-scoring candidate. Present with full wave and phase context.

## Output Format

### Standard Recommendation

```
===============================================================
                         NEXT TASK
===============================================================

  UC003: Delete Order -- Backend Development

Wave:        2 (Core Frontend + Next BE)
Phase:       BE Development
Priority:    high
Estimated:   2 hours

Description:
Implement backend API for order deletion with soft-delete
pattern and cascade handling.

Why this task:
  * Highest priority pending task in current wave
  * Unblocks UC003-FE in Wave 3
  * No dependencies (UC001-BE, UC002-BE already done)

---------------------------------------------------------------

  Start now:
   /tl-dev-be UC003

---------------------------------------------------------------

Also ready (can run in parallel):
  * UC001-FE: Frontend development (/tl-dev-fe UC001)
    Wave 2, FE phase, BE already approved

Upcoming (blocked):
  * UC002-FE: Waiting for current wave
  * UC001-SYNC: Waiting for UC001-FE completion

===============================================================
```

### Sync Verification Ready

```
===============================================================
                         NEXT TASK
===============================================================

  UC001: Create Order -- Sync Verification

Both BE and FE are approved. Run sync check to verify
API contract compliance before QA.

Wave:      2       Phase:     Sync
Priority:  high    Reason:    Unblocks QA for UC001

  Start now: /tl-sync UC001

===============================================================
```

### Stub Scan Ready

```
===============================================================
                         NEXT TASK
===============================================================

  UC001: Create Order -- Stub Scan

Sync passed. Scan for remaining stubs before QA.

Wave:      2       Phase:     Stubs
Priority:  high    Reason:    Gate before QA

  Start now: /tl-stubs UC001

===============================================================
```

### QA Testing Ready

```
===============================================================
                         NEXT TASK
===============================================================

  UC001: Create Order -- QA Testing

All phases complete. Run E2E testing via Playwright.

Wave:      2       Phase:     QA
Priority:  critical (final validation)

  Start now: /tl-qa UC001

===============================================================
```

### Review Task Ready

```
===============================================================
                         NEXT TASK
===============================================================

  UC002: Edit Order -- Backend Review

BE development complete, TDD cycle passed.
Approving BE unblocks FE-UC002 in Wave 2.

Wave:      1       Phase:     BE Review
Priority:  high

  Start now: /tl-review UC002 --be

===============================================================
```

### No Tasks Available

```
===============================================================
                  NO TASKS AVAILABLE
===============================================================

All tasks in the active wave are either:
  * Completed (done)
  * Blocked (waiting on dependencies)
  * In progress (being worked on)

Active wave: 2

Current blockers:
  * UC003-FE: Waiting for BE-UC003 review (in_review)
  * UC002-SYNC: Waiting for FE-UC002 completion (in_progress)

In progress:
  * BE-UC003: Backend review (/tl-review UC003 --be)
  * FE-UC002: Frontend development (/tl-dev-fe UC002)

Recommendations:
1. Complete in-progress tasks to unblock the wave
2. Run /tl-status for detailed progress view

===============================================================
```

### All Tasks Complete

```
===============================================================
                   ALL TASKS COMPLETE!
===============================================================

Summary:
  * UC tasks:     N (all phases: BE, FE, Sync, Review, QA)
  * TECH tasks:   M
  * Total phases: X completed
  * QA results:   N passed, 0 failed
  * Stubs:        0 critical, 0 warnings

The project development is complete!

Next steps:
  * Ship and deploy to staging:
    /tl-deliver                    (push + verify + deploy)
  * Or use conductor for managed delivery:
    /tl-conductor --skip-deliver   (if not yet committed)
  * Run /tl-status for the final project report
  * Review .tl/changelog.md for full history

===============================================================
```

## Wave-Aware Logic

### Wave Status Display

When presenting recommendations, show wave context:

```
Current Wave: 2

Wave 0: [done]     All TECH tasks done
Wave 1: [done]     All tasks done
Wave 2: [active]   In progress
  - UC001-FE: in_progress
  - UC002-FE: pending (BE approved, ready)
  - UC003-BE: pending  <-- RECOMMEND THIS
Wave 3: [blocked]  Waiting for Wave 2
```

### UC Lifecycle Phases

Each UC goes through these phases in strict order:

```
Phase 1: BE Development     -> tl-dev-be UC###
Phase 2: BE Review          -> tl-review UC### --be
Phase 3: FE Development     -> tl-dev-fe UC### (requires BE approved + api-contract)
Phase 4: FE Review          -> tl-review UC### --fe
Phase 5: Sync Verification  -> tl-sync UC###   (requires BE + FE approved)
Phase 6: Stub Scan          -> tl-stubs UC###  (requires sync passed)
Phase 7: QA Testing         -> tl-qa UC###     (requires stubs clean)
Phase 8: Done
```

### TECH Task Lifecycle

```
Phase 1: Development        -> tl-dev TECH###
Phase 2: Review             -> tl-review TECH### --be  (TECH reviewed as BE)
Phase 3: Done
```

### Cross-UC Dependencies

Some UCs depend on other UCs (defined in task.md frontmatter `depends_on`):

```
Example: UC003 depends_on: [UC001]
Meaning: UC001 BE must be approved before UC003 BE can start.
```

## Filtering Flags

```
/tl-next --be        # Only BE development tasks
/tl-next --fe        # Only FE development tasks
/tl-next --tech      # Only TECH tasks
/tl-next --review    # Only review tasks (BE or FE)
/tl-next --sync      # Only sync verification tasks
/tl-next --qa        # Only QA testing tasks
/tl-next --wave N    # Only tasks from wave N
/tl-next --list      # Show top 5 candidates with scores
```

Example output for `--list`:

```
===============================================================
               TOP 5 TASK CANDIDATES
===============================================================

  Active Wave: 2

#  Score  Task                      Phase        Command
-- ------ ------------------------- ------------ ----------------------
1  135    UC003-BE Delete Order     BE Dev       /tl-dev-be UC003
2  125    UC001-FE Create Order     FE Dev       /tl-dev-fe UC001
3  110    UC002-FE Edit Order       FE Dev       /tl-dev-fe UC002
4   85    TECH-003 Error Handling   TECH Dev     /tl-dev TECH003
5   60    UC004-BE List Orders      BE Dev       /tl-dev-be UC004

===============================================================
```

## Error Handling

| Situation | Message | Recovery |
|-----------|---------|----------|
| Corrupted status.json | `Warning: status.json is invalid` | `/tl-plan --refresh` |
| Empty task list | `No tasks found in .tl/tasks/` | `/tl-plan` |
| Missing master-plan.md | `Wave info unavailable, priority-only mode` | `/tl-plan` |
| All tasks blocked | Show blockers + in-progress tasks | Complete blocking tasks first |

## Status JSON Structure

Expected task format in `.tl/status.json`:

```json
{
  "project": "project-name",
  "waves": [
    { "number": 0, "name": "Infrastructure", "tasks": ["TECH-001", "TECH-002"] },
    { "number": 1, "name": "Core Backend", "tasks": ["BE-UC001", "BE-UC002"] },
    { "number": 2, "name": "Core Frontend + Next BE", "tasks": ["FE-UC001", "BE-UC003"] }
  ],
  "tasks": [
    {
      "id": "BE-UC001",
      "uc": "UC001",
      "title": "Create Order API",
      "type": "be",
      "status": "approved",
      "phase": "be-review-done",
      "priority": "high",
      "wave": 1,
      "depends_on": [],
      "blocks": ["FE-UC001", "SYNC-UC001"],
      "created": "2025-01-01T00:00:00Z",
      "api_contract": true
    }
  ]
}
```

### Phase Values

The `phase` field tracks position in the UC lifecycle:

| Phase Value | Meaning |
|-------------|---------|
| `be-dev-pending` | BE development not started |
| `be-dev-in-progress` | BE development underway |
| `be-review-pending` | BE dev done, review needed |
| `be-review-done` | BE approved |
| `fe-dev-pending` | FE development not started |
| `fe-dev-in-progress` | FE development underway |
| `fe-review-pending` | FE dev done, review needed |
| `fe-review-done` | FE approved |
| `sync-pending` | Both BE and FE approved, sync needed |
| `sync-done` | Sync verified |
| `stubs-pending` | Stub scan needed |
| `stubs-done` | No critical stubs |
| `qa-pending` | QA testing needed |
| `qa-done` | QA passed, UC complete |

## Reference Documents

Load these for detailed guidelines:

| Context | Reference |
|---------|-----------|
| Protocol and agent contracts | `tl-core/references/tl-protocol.md` |
| Sync verification rules | `tl-core/references/sync-rules.md` |
| Stub tracking rules | `tl-core/references/stub-tracking-rules.md` |
| QA testing rules | `tl-core/references/qa-rules.md` |
| API contract rules | `tl-core/references/api-contract-rules.md` |

## Final Checklist

### Before Recommending

- [ ] `.tl/status.json` is readable
- [ ] `.tl/master-plan.md` is readable (or graceful fallback)
- [ ] Active wave is determined
- [ ] Task list is not empty
- [ ] At least one non-blocked task exists in the active wave

### Recommendation Content

- [ ] Single task selected (highest score)
- [ ] Wave context provided (current wave, wave status)
- [ ] Phase identified (BE dev, FE review, sync, QA, etc.)
- [ ] Priority rationale explained with bullet points
- [ ] Launch command provided and ready to copy
- [ ] Parallel opportunities listed in "Also ready" section
- [ ] Blocked tasks listed in "Upcoming" section

### After Recommending

- [ ] User knows exactly what to do next
- [ ] Command is ready to copy and paste
- [ ] Wave progress is visible
- [ ] Blockers are visible if relevant

## Next Steps

After getting a recommendation:

- `/tl-dev-be UC###` -- Start backend development
- `/tl-dev-fe UC###` -- Start frontend development
- `/tl-dev TECH###` -- Start TECH task development
- `/tl-review UC### --be` -- Review backend code
- `/tl-review UC### --fe` -- Review frontend code
- `/tl-sync UC###` -- Run sync verification
- `/tl-stubs UC###` -- Run stub scan
- `/tl-qa UC###` -- Run E2E QA testing
- `/tl-status` -- View full project status with wave progress
- `/tl-next --list` -- View top 5 candidates with scores

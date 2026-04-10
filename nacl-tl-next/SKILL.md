---
name: nacl-tl-next
description: |
  Graph-aware next task recommendation with SA context enrichment.
  Reads Task/Wave from Neo4j, enriches with UC entity/form names.Use when: next task with graph, what to work on, or the user says "/nacl-tl-next".
---

# /nacl-tl-next -- Graph-Aware Next Task Recommendation

## Purpose

Graph-powered replacement for `/nacl-tl-next`. Queries Task and Wave nodes from Neo4j
to recommend the optimal next task, enriched with UC entity names and form names
from the SA layer. Falls back to `.tl/status.json` + `master-plan.md` when Neo4j
is unavailable.

**Critical difference from nacl-tl-next:**

| Aspect | nacl-tl-next | nacl-tl-next |
|--------|---------|---------------|
| Data source | `.tl/status.json` + `master-plan.md` | Neo4j Task/Wave nodes (primary) |
| Enrichment | Task title only | UC entity names, form names from SA layer |
| Scoring | File-based computation | `tl_task_scoring` Cypher query |
| Candidate list | Parsed from JSON | `tl_actionable_tasks` Cypher query |
| Fallback | None | `.tl/status.json` + `master-plan.md` |

**Shared references:** `nacl-core/SKILL.md`

---

## Your Role

- **Query Neo4j** for Task/Wave nodes, actionable candidates, and scoring
- **Enrich recommendations** with UC entity names, form names via `tl_task_with_uc_context`
- **Identify the active wave** via `tl_active_wave` query
- **Analyze phase dependencies** within each UC (BE -> review -> FE -> review -> sync -> stubs -> QA)
- **Filter blocked tasks** based on wave boundaries and cross-task dependencies
- **Recommend a single action** with phase-aware rationale and launch command
- **Show parallel opportunities** when multiple tasks are actionable
- **Fall back** to file-based mode if Neo4j is unreachable

## Key Principle: Actionable Recommendation

**CRITICAL**: Always provide ONE clear recommendation with a launch command.

```
1. Single choice:    One task, not a list (unless --list flag)
2. Phase-aware:      Right phase for the UC lifecycle
3. Wave-aware:       Respect wave boundaries and parallelism
4. Unblocked:        No pending dependencies
5. Ready to start:   Immediate action command
6. Enriched:         UC entity/form context from SA layer
```

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Read Task/Wave nodes, run scoring and actionable queries |
| `mcp__neo4j__get-schema` | Verify TL layer exists in graph |

---

## Invocation

```
/nacl-tl-next [flags]
```

### Filtering Flags

```
/nacl-tl-next --be        # Only BE development tasks
/nacl-tl-next --fe        # Only FE development tasks
/nacl-tl-next --tech      # Only TECH tasks
/nacl-tl-next --review    # Only review tasks (BE or FE)
/nacl-tl-next --sync      # Only sync verification tasks
/nacl-tl-next --qa        # Only QA testing tasks
/nacl-tl-next --wave N    # Only tasks from wave N
/nacl-tl-next --list      # Show top 5 candidates with scores
```

---

## Pre-Check Requirements

Before recommending, verify:

1. **Neo4j reachable**: Try `mcp__neo4j__read-cypher` with `tl_active_wave` query
2. **TL layer exists**: Task and Wave nodes present in graph
3. **Tasks available**: At least one actionable task exists

### Decision: Graph or Fallback

```
Try Neo4j query (tl_active_wave)
  |
  +-- Success + results -> GRAPH MODE
  |
  +-- Connection error OR empty results -> FALLBACK MODE
      |
      +-- Check .tl/status.json exists
      |     +-- Yes -> file-based recommendation (same as nacl-tl-next)
      |     +-- No  -> error: "Project not initialized"
```

If falling back:

```
Note: Neo4j unavailable, using file-based fallback.
Recommendations based on .tl/status.json + master-plan.md.
Enrichment (entity/form names) unavailable in fallback mode.
```

---

## Workflow -- Graph Mode

### Step 1: Determine Active Wave

Run `tl_active_wave` from `graph-infra/queries/tl-queries.cypher`:

```cypher
// tl_active_wave
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
WHERE t.status <> 'done'
RETURN w.number AS active_wave, count(t) AS remaining_tasks
ORDER BY w.number
LIMIT 1
```

If no results: all tasks are complete -- show completion message.

### Step 2: Get Actionable Tasks

Run `tl_actionable_tasks` from `graph-infra/queries/tl-queries.cypher`:

```cypher
// tl_actionable_tasks
MATCH (t:Task)
WHERE t.status IN ['todo', 'pending']
AND NOT EXISTS {
  MATCH (t)-[:DEPENDS_ON]->(dep:Task) WHERE dep.status <> 'done'
}
OPTIONAL MATCH (t)-[:IN_WAVE]->(w:Wave)
RETURN t.id AS task_id, t.title AS title, t.status AS status,
       w.number AS wave, t.priority AS priority
ORDER BY w.number, t.priority
```

Apply filter flags to the result set:
- `--be`: keep only tasks where `t.type = 'be'`
- `--fe`: keep only tasks where `t.type = 'fe'`
- `--tech`: keep only tasks where `t.type = 'tech'`
- `--review`: keep only tasks where phase is `*-review-pending`
- `--sync`: keep only tasks where phase is `sync-pending`
- `--qa`: keep only tasks where phase is `qa-pending`
- `--wave N`: keep only tasks in wave N

### Step 3: Score and Rank Candidates

Run `tl_task_scoring` from `graph-infra/queries/tl-queries.cypher`:

```cypher
// tl_task_scoring
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
WHERE t.status IN ['todo', 'pending']
AND NOT EXISTS {
  MATCH (t)-[:DEPENDS_ON]->(dep:Task) WHERE dep.status <> 'done'
}
WITH t, w,
     CASE t.priority
       WHEN 'critical' THEN 40
       WHEN 'high' THEN 30
       WHEN 'medium' THEN 20
       WHEN 'low' THEN 10
       ELSE 15
     END AS priority_score,
     CASE WHEN w.number = 0 THEN 20 ELSE 10.0 / w.number END AS wave_score
OPTIONAL MATCH (other:Task)-[:DEPENDS_ON]->(t) WHERE other.status <> 'done'
WITH t, w, priority_score, wave_score,
     count(other) AS blocks_count
RETURN t.id AS task_id, t.title AS title, w.number AS wave,
       t.priority AS priority,
       priority_score + wave_score + (blocks_count * 5) AS total_score
ORDER BY total_score DESC
LIMIT 5
```

Then apply the full composite scoring formula on the client side using the Cypher
result plus additional phase information:

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
| dependency_bonus | blocks_count * 10 | Tasks that unblock others |
| phase_completion_bonus | +15 if UC has 4+ phases complete | Finish what is started |
| age_penalty | min(days_since_created * 0.5, 10) | Slight preference for newer tasks |

### Step 4: Enrich Top Candidate with SA Context

For the highest-scoring task, run `tl_task_with_uc_context` from `graph-infra/queries/tl-queries.cypher`:

```cypher
// tl_task_with_uc_context($taskId)
MATCH (t:Task {id: $taskId})
OPTIONAL MATCH (uc:UseCase)-[:GENERATES]->(t)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (f)-[:HAS_FIELD]->(ff:FormField)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
RETURN t, uc,
       collect(DISTINCT f.name) AS form_names,
       collect(DISTINCT de.name) AS entity_names,
       count(DISTINCT as_step) AS step_count
```

This provides:
- **form_names**: UI forms the task touches (e.g., "OrderForm", "FilterPanel")
- **entity_names**: Domain entities involved (e.g., "Order", "OrderItem", "Customer")
- **step_count**: Number of activity steps (complexity indicator)

### Step 5: Get Wave Progress Context

Run `tl_progress_by_wave` for the active wave and adjacent waves:

```cypher
// tl_progress_by_wave
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
RETURN w.number AS wave,
       count(t) AS total,
       count(CASE WHEN t.status = 'done' THEN 1 END) AS done,
       count(CASE WHEN t.status = 'in_progress' THEN 1 END) AS in_progress,
       count(CASE WHEN t.status IN ['todo', 'pending'] THEN 1 END) AS pending,
       CASE WHEN count(t) > 0
         THEN round(100.0 * count(CASE WHEN t.status = 'done' THEN 1 END) / count(t))
         ELSE 0 END AS progress_pct
ORDER BY w.number
```

### Step 6: Get Blocked Tasks for "Upcoming" Section

Run `tl_blocked_tasks`:

```cypher
// tl_blocked_tasks
MATCH (t:Task)-[:DEPENDS_ON]->(dep:Task)
WHERE dep.status <> 'done'
RETURN t.id AS blocked_task, t.title AS blocked_title, t.status AS blocked_status,
       dep.id AS blocking_task, dep.title AS blocking_title, dep.status AS blocking_status
```

### Step 7: Select and Present

Pick the single highest-scoring candidate. Present with full wave context, phase
context, SA enrichment, parallel opportunities, and upcoming blockers.

---

## Phase Action Priority Table

| Priority | Phase | Condition | Command |
|----------|-------|-----------|---------|
| 0 (highest) | delivery pending | all dev tasks done, no failed | `/nacl-tl-deliver` or `/nacl-tl-conductor` |
| 1 | QA pending | sync passed + stubs clean | `/nacl-tl-qa UC###` |
| 2 | sync pending | BE approved + FE approved | `/nacl-tl-sync UC###` |
| 3 | review-fe pending | FE dev complete | `/nacl-tl-review UC### --fe` |
| 4 | review-be pending | BE dev complete | `/nacl-tl-review UC### --be` |
| 5 | stubs pending | dev complete (any type) | `/nacl-tl-stubs UC###` |
| 6 | fe pending | BE approved + api-contract exists | `/nacl-tl-dev-fe UC###` |
| 7 | be pending | wave dependencies met | `/nacl-tl-dev-be UC###` |
| 8 | tech pending | wave dependencies met | `/nacl-tl-dev TECH###` |

---

## Dependency Rules

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

---

## UC Lifecycle Phases

Each UC goes through these phases in strict order:

```
Phase 1: BE Development     -> nacl-tl-dev-be UC###
Phase 2: BE Review          -> nacl-tl-review UC### --be
Phase 3: FE Development     -> nacl-tl-dev-fe UC### (requires BE approved + api-contract)
Phase 4: FE Review          -> nacl-tl-review UC### --fe
Phase 5: Sync Verification  -> nacl-tl-sync UC###   (requires BE + FE approved)
Phase 6: Stub Scan          -> nacl-tl-stubs UC###  (requires sync passed)
Phase 7: QA Testing         -> nacl-tl-qa UC###     (requires stubs clean)
Phase 8: Done
```

### TECH Task Lifecycle

```
Phase 1: Development        -> nacl-tl-dev TECH###
Phase 2: Review             -> nacl-tl-review TECH### --be  (TECH reviewed as BE)
Phase 3: Done
```

---

## Output Format

### Standard Recommendation (Graph Mode)

```
===============================================================
                         NEXT TASK
===============================================================

  UC003: Delete Order -- Backend Development

Wave:        2 (Core Frontend + Next BE)
Phase:       BE Development
Priority:    high
Estimated:   2 hours

Entities:    Order, OrderItem, AuditLog
Forms:       DeleteConfirmationDialog
Steps:       6 activity steps

Description:
Implement backend API for order deletion with soft-delete
pattern and cascade handling.

Why this task:
  * Highest priority pending task in current wave
  * Unblocks UC003-FE in Wave 3
  * No dependencies (UC001-BE, UC002-BE already done)
  * Touches 3 domain entities (Order, OrderItem, AuditLog)

---------------------------------------------------------------

  Start now:
   /nacl-tl-dev-be UC003

---------------------------------------------------------------

Also ready (can run in parallel):
  * UC001-FE: Frontend development (/nacl-tl-dev-fe UC001)
    Wave 2, FE phase, BE already approved
    Forms: OrderForm, OrderListFilter

Upcoming (blocked):
  * UC002-FE: Waiting for current wave
  * UC001-SYNC: Waiting for UC001-FE completion

Wave Progress:
  Wave 0: [done]     100%  All TECH tasks done
  Wave 1: [done]     100%  All tasks done
  Wave 2: [active]    33%  2 of 6 done
  Wave 3: [blocked]    0%  Waiting for Wave 2

Source: Neo4j graph (Task/Wave nodes)
===============================================================
```

### Enriched Sync Verification Ready

```
===============================================================
                         NEXT TASK
===============================================================

  UC001: Create Order -- Sync Verification

Both BE and FE are approved. Run sync check to verify
API contract compliance before QA.

Wave:      2       Phase:     Sync
Priority:  high    Reason:    Unblocks QA for UC001

Entities:  Order, Customer, OrderItem
Forms:     OrderForm (12 fields), CustomerSelect (3 fields)

  Start now: /nacl-tl-sync UC001

Source: Neo4j graph
===============================================================
```

### Enriched QA Testing Ready

```
===============================================================
                         NEXT TASK
===============================================================

  UC001: Create Order -- QA Testing

All phases complete. Run E2E testing via Playwright.

Wave:      2       Phase:     QA
Priority:  critical (final validation)

Entities:  Order, Customer, OrderItem
Forms:     OrderForm, CustomerSelect
Steps:     8 activity steps (test scenarios)

  Start now: /nacl-tl-qa UC001

Source: Neo4j graph
===============================================================
```

### List Mode (--list)

```
===============================================================
               TOP 5 TASK CANDIDATES
===============================================================

  Active Wave: 2
  Source: Neo4j graph (tl_task_scoring)

#  Score  Task                      Phase        Entities        Command
-- ------ ------------------------- ------------ --------------- ----------------------
1  135    UC003-BE Delete Order     BE Dev       Order,AuditLog  /nacl-tl-dev-be UC003
2  125    UC001-FE Create Order     FE Dev       Order,Customer  /nacl-tl-dev-fe UC001
3  110    UC002-FE Edit Order       FE Dev       Order,OrderItem /nacl-tl-dev-fe UC002
4   85    TECH-003 Error Handling   TECH Dev     --              /nacl-tl-dev TECH003
5   60    UC004-BE List Orders      BE Dev       Order           /nacl-tl-dev-be UC004

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
  * BE-UC003: Backend review (/nacl-tl-review UC003 --be)
  * FE-UC002: Frontend development (/nacl-tl-dev-fe UC002)

Recommendations:
1. Complete in-progress tasks to unblock the wave
2. Run /nacl-tl-status for detailed progress view

Source: Neo4j graph
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
    /nacl-tl-deliver                    (push + verify + deploy)
  * Or use conductor for managed delivery:
    /nacl-tl-conductor --skip-deliver   (if not yet committed)
  * Run /nacl-tl-status for the final project report
  * Review .tl/changelog.md for full history

Source: Neo4j graph
===============================================================
```

---

## Workflow -- Fallback Mode

When Neo4j is unavailable, operate identically to `nacl-tl-next`:

### Step 1: Read Current Status

Read `.tl/master-plan.md` and `.tl/status.json`. Extract:

- Wave definitions and task assignments per wave
- All tasks with their current phase status
- BE/FE pairing information per UC
- Cross-task and cross-wave dependencies
- Stub registry summary (from `.tl/stub-registry.json` if present)

### Step 2: Determine Active Wave

```
For each wave (starting from Wave 0):
  If wave has any task NOT in done status -> this is the active wave
If all waves complete -> show completion message
```

### Step 3: Build Candidate List

Apply the same phase action priority table and dependency rules as graph mode.

### Step 4: Score and Rank

Apply the same composite scoring formula:

```
score = priority_weight
      + status_order_weight
      + wave_bonus
      + dependency_bonus
      + phase_completion_bonus
      - age_penalty
```

### Step 5: Present

Same output format as graph mode, but without enrichment (entity/form names)
and with a fallback notice:

```
Note: Neo4j unavailable, using file-based fallback.
Entity/form enrichment unavailable.
```

---

## Pre-Check Error States

| Situation | Mode | Message | Recovery |
|-----------|------|---------|----------|
| Neo4j unreachable | Graph | `Neo4j unavailable, switching to fallback` | Automatic fallback |
| No TL nodes in graph | Graph | `No Task/Wave nodes in graph` | `/nacl-tl-plan` |
| No `.tl/` directory | Fallback | `Project not initialized for TeamLead workflow` | `/nacl-tl-plan` or `/nacl-tl-plan` |
| Missing `master-plan.md` | Fallback | `Wave info unavailable, priority-only mode` | `/nacl-tl-plan` |
| Corrupted `status.json` | Fallback | `Warning: status.json is invalid` | `/nacl-tl-plan --refresh` |
| Empty task list | Both | `No tasks found` | `/nacl-tl-plan` or `/nacl-tl-plan` |
| All tasks blocked | Both | Show blockers + in-progress | Complete blocking tasks first |

---

## Key Cypher Queries Reference

All queries are defined in `graph-infra/queries/tl-queries.cypher`:

| Query Name | Purpose | Used In |
|------------|---------|---------|
| `tl_task_scoring` | Composite scoring for ranking candidates | Step 3 |
| `tl_actionable_tasks` | Tasks with all dependencies satisfied | Step 2 |
| `tl_active_wave` | Lowest wave with incomplete tasks | Step 1 |
| `tl_task_with_uc_context` | Task enriched with UC entities/forms | Step 4 |
| `tl_progress_by_wave` | Per-wave progress stats | Step 5 |
| `tl_blocked_tasks` | Tasks blocked by unsatisfied dependencies | Step 6 |

---

## Reads / Writes

### Reads (Neo4j -- via mcp__neo4j__read-cypher)

```yaml
# TL layer nodes:
- Task (id, title, type, status, wave, priority, phase_*, created, agent)
- Wave (id, number, name, status)

# TL layer edges:
- (Task)-[:IN_WAVE]->(Wave)
- (Task)-[:DEPENDS_ON]->(Task)

# SA layer nodes (for enrichment):
- UseCase (id, name, description, priority)
- Form (id, name)
- FormField (id, name, label)
- ActivityStep (id, description, order)
- DomainEntity (id, name)
- DomainAttribute (id, name)

# SA layer edges (for enrichment):
- (UseCase)-[:GENERATES]->(Task)
- (UseCase)-[:USES_FORM]->(Form)
- (UseCase)-[:HAS_STEP]->(ActivityStep)
- (Form)-[:HAS_FIELD]->(FormField)
- (FormField)-[:MAPS_TO]->(DomainAttribute)
- (DomainEntity)-[:HAS_ATTRIBUTE]->(DomainAttribute)

# Key named queries (graph-infra/queries/tl-queries.cypher):
- tl_task_scoring
- tl_actionable_tasks
- tl_active_wave
- tl_task_with_uc_context
- tl_progress_by_wave
- tl_blocked_tasks
```

### Reads (Filesystem -- fallback only)

```yaml
- .tl/status.json        # Task states and wave assignments
- .tl/master-plan.md     # Wave definitions and dependency map
- .tl/stub-registry.json # Stub tracking (if present)
```

### Writes

This skill is read-only. It does not modify the graph or the filesystem.

---

## Reference Documents

Load these for detailed guidelines:

| Context | Reference |
|---------|-----------|
| Protocol and agent contracts | `nacl-tl-core/references/tl-protocol.md` |
| Sync verification rules | `nacl-tl-core/references/sync-rules.md` |
| Stub tracking rules | `nacl-tl-core/references/stub-tracking-rules.md` |
| QA testing rules | `nacl-tl-core/references/qa-rules.md` |
| API contract rules | `nacl-tl-core/references/api-contract-rules.md` |

---

## Final Checklist

### Before Recommending

- [ ] Neo4j queried (or fallback activated with notice)
- [ ] Active wave determined
- [ ] Task list is not empty
- [ ] At least one non-blocked task exists
- [ ] Scoring formula applied

### Recommendation Content

- [ ] Single task selected (highest score)
- [ ] Wave context provided (current wave, wave status, progress %)
- [ ] Phase identified (BE dev, FE review, sync, QA, etc.)
- [ ] SA enrichment included (entity names, form names, step count)
- [ ] Priority rationale explained with bullet points
- [ ] Launch command provided and ready to copy
- [ ] Parallel opportunities listed in "Also ready" section
- [ ] Blocked tasks listed in "Upcoming" section
- [ ] Source noted (Neo4j graph vs file-based fallback)

### After Recommending

- [ ] User knows exactly what to do next
- [ ] Command is ready to copy and paste
- [ ] Wave progress is visible
- [ ] Blockers are visible if relevant

---

## Next Steps

After getting a recommendation:

- `/nacl-tl-dev-be UC###` -- Start backend development
- `/nacl-tl-dev-fe UC###` -- Start frontend development
- `/nacl-tl-dev TECH###` -- Start TECH task development
- `/nacl-tl-review UC### --be` -- Review backend code
- `/nacl-tl-review UC### --fe` -- Review frontend code
- `/nacl-tl-sync UC###` -- Run sync verification
- `/nacl-tl-stubs UC###` -- Run stub scan
- `/nacl-tl-qa UC###` -- Run E2E QA testing
- `/nacl-tl-status` -- View full project status with wave progress
- `/nacl-tl-next --list` -- View top 5 candidates with scores

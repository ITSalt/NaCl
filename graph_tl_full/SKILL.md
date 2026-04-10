---
name: graph_tl_full
description: |
  Graph-aware full lifecycle orchestrator. Reads waves/tasks from Neo4j,
  updates phase status in graph. Delegates to standard dev skills.
  Graph-first equivalent of tl-full.
  Use when: run full dev workflow with graph, or the user says "/graph_tl_full".
---

# /graph_tl_full -- Graph-Aware Full Lifecycle Orchestrator

## Your Role

You are the **autonomous project orchestrator**. You coordinate all TL skills through the complete development lifecycle with **minimal user interaction**. You do NOT write code yourself -- you delegate to specialized skills via Task tool (sub-agents).

**Critical difference from tl-full:** Wave structure and task list come from Neo4j, and phase status is written back to the graph after each step. Dev skills (tl-dev-be, tl-dev-fe, etc.) are UNCHANGED -- they work on task files.

| Aspect | tl-full | graph_tl_full |
|--------|---------|---------------|
| Data source (waves/tasks) | `.tl/master-plan.md` + `.tl/status.json` | Neo4j Task/Wave nodes (primary) |
| Phase status updates | `.tl/status.json` (JSON file) | Neo4j Task node properties + `.tl/status.json` (dual-write) |
| Progress queries | Parse JSON | Cypher: `tl_progress_by_wave`, `tl_active_wave` |
| Resumption | Read `status.json` | Read `Task.status` and `Task.phase_*` from graph |
| Dev skills (L2) | tl-dev-be, tl-dev-fe, etc. | **IDENTICAL** -- unchanged |

**Shared references:** `graph_core/SKILL.md`

---

## Key Principle: Two Gates, Full Autonomy Between Them

```
USER ──> /graph_tl_full
           |
     +-----v------+
     | START GATE  |  <- User approves the plan
     +-----+------+
           |
     +-----v----------------------------------------------+
     |         AUTONOMOUS EXECUTION                       |
     |                                                    |
     |  Wave 0: TECH tasks (dev -> review -> retry)       |
     |  Wave 1: UC lifecycle (be -> fe -> sync -> qa)     |
     |  Wave 2: ...                                       |
     |  Wave N: ...                                       |
     |                                                    |
     |  Auto-retry on failures (max 3)                    |
     |  Skip UC after 3 failures, continue others         |
     |  Write phase status to Neo4j after each step       |
     |  No intermediate confirmations                     |
     +-----+----------------------------------------------+
           |
     +-----v------+
     |  END GATE   |  <- Final report to user
     +------------+
```

**Between the two gates, you work fully autonomously.** No confirmation prompts. No waiting. Just execute.

---

## Three-Level Agent Architecture

Context window management is critical. A single agent cannot hold an entire project. The orchestrator uses three levels of delegation:

```
Level 0: graph_tl_full (THIS skill, inline, main conversation)
  |
  |  Holds: wave list, wave results (~50-100 words each), final report
  |  Context budget: ~20K tokens total
  |
  +-->  Level 1: Wave Agent (Task tool, separate context)
  |      |
  |      |  Holds: UC list for this wave, UC results (~100-200 words each)
  |      |  Context budget: ~30-50K tokens per wave
  |      |
  |      +-->  Level 2: Skill Agent (Task tool, separate context)
  |      |      /tl-dev-be, /tl-dev-fe, /tl-review, /tl-sync, /tl-qa, etc.
  |      |      Each gets a CLEAN context window (~100-200K tokens)
  |      |
  |      +-->  Level 2: Skill Agent ...
  |      +-->  Level 2: Skill Agent ...
  |
  +-->  Level 1: Wave Agent (next wave)
  ...
```

### Why Three Levels?

| Level | Agent | Context contains | Estimated tokens |
|-------|-------|-----------------|-----------------|
| L0 | graph_tl_full | Wave summaries, final report | ~20K |
| L1 | Wave agent | UC results within one wave | ~30-50K per wave |
| L2 | Dev/Review/QA | One task, full focus | ~50-150K per task |

A project with 10 UCs x 8 phases = 80 L2 agents. Each L2 agent starts fresh. L1 agents accumulate results for 3-5 UCs. L0 sees only wave-level summaries.

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Read waves, tasks, phase status, progress |
| `mcp__neo4j__write-cypher` | Update Task.status and Task.phase_* properties |

Connection: read from config.yaml graph section (see graph_core/SKILL.md → Graph Config Resolution). MCP tools handle the connection automatically.

---

## Parameters

```
/graph_tl_full                     # Full autonomous lifecycle
/graph_tl_full --wave N            # Execute only wave N
/graph_tl_full --task UC###        # Full lifecycle for one UC only
/graph_tl_full --feature FR-NNN    # Execute only the wave created for feature request FR-NNN
/graph_tl_full --skip-plan         # Skip planning (.tl/ already exists, graph already populated)
/graph_tl_full --skip-qa           # Skip E2E QA testing
/graph_tl_full --yes               # Skip START GATE confirmation, begin execution immediately
```

---

## Phase 0: Initialization (L0 -- this agent)

### Step 0.1: Check Graph State

Probe Neo4j for Task and Wave nodes:

```cypher
// Probe: do Task/Wave nodes exist?
MATCH (n)
WHERE n:Task OR n:Wave
RETURN labels(n)[0] AS label, count(n) AS count
```

| Probe result | Action |
|--------------|--------|
| Task count > 0, Wave count > 0 | Graph is populated -- proceed |
| Task count = 0 or Wave count = 0 | No plan in graph. Run `/graph_tl_plan` (Step 0.2) |
| Connection error / MCP tool failure | STOP. Report Neo4j unavailable. Suggest checking config.yaml → graph.neo4j_bolt_port (default: 3587) and Docker status |

Also check for a planning lock:

```
IF .tl/.planning.lock EXISTS:
  -> WARN: "A planning session is active. Wait for it to finish
    before starting development."
  -> Do NOT proceed until lock is removed.
```

### Step 0.2: Run Planning

If `--skip-plan` is NOT set and graph has no Task nodes, launch `/graph_tl_plan` as a **Task agent** (subagent):

```
Launch Task agent: /graph_tl_plan
  (or: /graph_tl_plan scope:uc:<ids> if --feature flag maps to specific UCs)
Wait for completion.
```

After the Task agent completes, verify:
- Task/Wave nodes exist in Neo4j (re-run probe query)
- `.tl/master-plan.md` exists
- `.tl/status.json` is valid JSON
- `.tl/tasks/` has directories for all planned tasks

Do NOT run graph_tl_plan inline -- it generates dozens of task files and will fill L0's context.

### Step 0.3: Load Wave Structure from Graph

Read the wave and task structure from Neo4j:

```cypher
// tl_progress_by_wave -- wave structure with progress
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

```cypher
// All tasks with wave, type, status, and phases
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
OPTIONAL MATCH (t)-[:DEPENDS_ON]->(dep:Task)
RETURN t.id AS task_id, t.title AS title, t.type AS type,
       t.status AS status, t.priority AS priority,
       w.number AS wave,
       t.phase_be AS phase_be, t.phase_fe AS phase_fe,
       t.phase_sync AS phase_sync,
       t.phase_review_be AS phase_review_be,
       t.phase_review_fe AS phase_review_fe,
       t.phase_qa AS phase_qa,
       collect(dep.id) AS depends_on
ORDER BY w.number, t.id
```

This replaces reading `.tl/master-plan.md` for wave definitions.

### Step 0.4: START GATE -- Plan Approval

If `--yes` flag is set -> **skip this step entirely**, proceed directly to Step 0.5.

Otherwise, display:

```
===============================================================
                PLAN READY -- APPROVAL REQUIRED
              (source: Neo4j graph)
===============================================================

Project: [Name from master-plan.md]

  TECH Tasks:  M tasks (Wave 0)
  UC Tasks:    N tasks (BE + FE pairs)
  API Contracts: N
  Execution Waves: K

  Wave 0 (Infrastructure): TECH-001, TECH-002, ...
  Wave 1: UC001, UC002, UC003
  Wave 2: UC004, UC005
  ...

  Estimated work: (N x 8 phases) + (M x 2 phases) = X total phases

  Mode: AUTONOMOUS
  -- Auto-retry failures (max 3 per phase)
  -- Skip task after 3 consecutive failures
  -- No intermediate confirmations
  -- Phase status written to Neo4j after each step
  -- Final report when complete

Approve and start autonomous execution? [yes/no]
===============================================================
```

**Do NOT proceed until the user explicitly confirms.**

> Tip: use `--yes` to skip this gate and start immediately.

### Step 0.5: YouGile Integration (if configured)

If `config.yaml -> yougile` is configured:

#### Configuration Resolution

| Data | Source priority |
|------|---------------|
| YouGile columns | config.yaml -> yougile.columns.in_work / dev_done / reopened |
| Module test commands | config.yaml -> modules.[name].test_cmd (fallback: `npm test`) |
| Module build commands | config.yaml -> modules.[name].build_cmd (fallback: `npm run build`) |

If config.yaml missing -> skip YouGile moves, use default build/test commands.

**On start (after approval):**
- For each task being executed, move to InWork column:
  ```
  update_task(taskId, columnId: config.yougile.columns.in_work)
  ```

**On task completion (each UC/TECH):**
- Move to DevDone column:
  ```
  update_task(taskId, columnId: config.yougile.columns.dev_done)
  ```
- Post brief summary to task chat

**On task failure (after 3 retries):**
- Move to Reopened column with failure details

If YouGile NOT configured -> skip all column movements, just report locally.

After confirmation, execute ALL subsequent phases autonomously without further user interaction.

---

## Phase 1: Infrastructure -- Wave 0 (L0 delegates to L1)

Launch a **single Wave Agent** (Task tool) for Wave 0.

### L0 -> L1 Prompt for Wave 0

```
You are a Wave Executor for TeamLead workflow.

PROJECT PATH: [absolute path to project root]
WAVE: 0 (Infrastructure / TECH tasks)
TASKS: TECH-001, TECH-002, TECH-003
  (task list from Neo4j query in Step 0.3)
MODE: autonomous (no user confirmations)
SKIP_QA: [true/false]

GRAPH UPDATE PROTOCOL:
After each task phase completes, update Neo4j:
  mcp__neo4j__write-cypher:
    MATCH (t:Task {id: $taskId})
    SET t.status = $newStatus, t.updated = datetime()

Your job:
1. For each TECH task in order:
   a. Read .tl/tasks/TECH-###/task.md to understand the task
   b. Launch Task agent: execute /tl-dev TECH-### (development)
   c. Update graph: SET t.status = 'ready_for_review'
   d. Launch Task agent: execute /tl-review TECH-### (review)
   e. If review rejected -> retry loop:
      - Launch Task agent: /tl-dev TECH-### --continue
      - Launch Task agent: /tl-review TECH-###
      - Max 3 retry iterations
   f. If still rejected after 3 -> mark as FAILED:
      MATCH (t:Task {id: $taskId}) SET t.status = 'failed', t.updated = datetime()
      Continue to next task
   g. If approved -> update graph:
      MATCH (t:Task {id: $taskId}) SET t.status = 'done', t.updated = datetime()

2. After all TECH tasks: Launch Task agent: /tl-stubs (full scan baseline)

3. Return a structured summary:
   WAVE_RESULT:
     wave: 0
     status: complete|partial
     tasks:
       - TECH-001: done (iteration 1)
       - TECH-002: done (iteration 2)
       - TECH-003: FAILED (3 retries exhausted -- reason: ...)
     stubs: { critical: 0, warning: 2, info: 5 }
     problems: [list of unresolved issues]
```

### L0 receives Wave 0 result

Parse the wave summary. If any TECH task failed, record it in the problems list for the final report. Continue to Phase 2.

---

## Phase 2: UC Development -- Waves 1..N (L0 delegates to L1)

For each wave (sequentially), launch a **Wave Agent** via Task tool.

### L0 -> L1 Prompt for UC Wave

```
You are a Wave Executor for TeamLead workflow.

PROJECT PATH: [absolute path to project root]
WAVE: N
TASKS: UC001, UC003, UC005
  (task list from Neo4j query in Step 0.3)
MODE: autonomous (no user confirmations)
SKIP_QA: [true/false]

GRAPH UPDATE PROTOCOL:
After each phase completes for a UC, update Neo4j:
  mcp__neo4j__write-cypher:
    MATCH (t:Task {id: $taskId})
    SET t.phase_<phase> = $newStatus,
        t.status = $overallStatus,
        t.updated = datetime()

Phase property names: phase_be, phase_review_be, phase_fe, phase_review_fe,
                      phase_sync, phase_qa
Status values: pending, in_progress, ready_for_review, approved, done, failed

CRITICAL: Your job is NOT done until EVERY UC reaches STEP 8 (Documentation).
Development (Steps 1 + 3) is just the beginning. You MUST continue through review,
sync, stubs, QA, and docs. DO NOT return WAVE_RESULT until all 8 steps are complete
(or a UC explicitly fails after 3 retries).

Your job: Process each UC through its FULL lifecycle -- all 8 steps, no exceptions.

For each UC (sequentially):

  STEP 1 -- Backend Development
    Update graph: SET t.phase_be = 'in_progress', t.status = 'in_progress'
    Launch Task agent: /tl-dev-be UC###
    Update graph: SET t.phase_be = 'ready_for_review'
    Expected: creates result-be.md
    DO NOT skip to STEP 3 without completing STEP 2 first.

  STEP 2 -- Backend Review  <- MANDATORY, never skip
    Update graph: SET t.phase_review_be = 'in_progress'
    Launch Task agent: /tl-review UC### --be
    IF rejected -> retry loop (max 3):
      Launch Task agent: /tl-dev-be UC### --continue
      Launch Task agent: /tl-review UC### --be
    IF still rejected after 3 -> mark UC as FAILED at phase "review_be":
      SET t.phase_review_be = 'failed', t.status = 'failed'
      Skip to next UC
    IF approved:
      SET t.phase_review_be = 'approved'
    Only proceed to STEP 3 when phase_review_be = approved

  STEP 3 -- Frontend Development
    Prerequisite: phase_review_be = approved
    Update graph: SET t.phase_fe = 'in_progress'
    Launch Task agent: /tl-dev-fe UC###
    Update graph: SET t.phase_fe = 'ready_for_review'
    Expected: creates result-fe.md
    DO NOT skip to STEP 5 without completing STEP 4 first.

  STEP 4 -- Frontend Review  <- MANDATORY, never skip
    Update graph: SET t.phase_review_fe = 'in_progress'
    Launch Task agent: /tl-review UC### --fe
    IF rejected -> retry loop (max 3):
      Launch Task agent: /tl-dev-fe UC### --continue
      Launch Task agent: /tl-review UC### --fe
    IF still rejected after 3 -> mark UC as FAILED at phase "review_fe":
      SET t.phase_review_fe = 'failed', t.status = 'failed'
      Skip to next UC
    IF approved:
      SET t.phase_review_fe = 'approved'
    Only proceed to STEP 5 when phase_review_fe = approved

  STEP 5 -- Sync Verification  <- MANDATORY, never skip
    Update graph: SET t.phase_sync = 'in_progress'
    Launch Task agent: /tl-sync UC###
    IF fail -> retry loop (max 3):
      Read sync-report.md to identify failing side (BE or FE)
      If BE: Launch /tl-dev-be UC### --continue, then /tl-review UC### --be
      If FE: Launch /tl-dev-fe UC### --continue, then /tl-review UC### --fe
      Launch /tl-sync UC### (re-verify)
    IF still failing -> mark UC as FAILED at phase "sync":
      SET t.phase_sync = 'failed', t.status = 'failed'
      Skip to next UC
    IF passed:
      SET t.phase_sync = 'done'

  STEP 6 -- Stub Check  <- MANDATORY, never skip
    Launch Task agent: /tl-stubs UC###
    IF critical stubs -> retry loop (max 3):
      Identify which side, launch --continue, re-scan
    IF still critical -> mark UC as FAILED at phase "stubs":
      SET t.status = 'failed'
      Skip to next UC

  STEP 7 -- QA Testing (skip if SKIP_QA=true)  <- run unless explicitly disabled
    Update graph: SET t.phase_qa = 'in_progress'
    Launch Task agent: /tl-qa UC###
    IF fail -> retry loop (max 3):
      Read qa-report.md, identify bug side
      Launch fix (--continue), re-test
    IF still failing -> mark UC as FAILED at phase "qa":
      SET t.phase_qa = 'failed', t.status = 'failed'
      Skip to next UC
    IF passed:
      SET t.phase_qa = 'done'

  STEP 8 -- Documentation  <- MANDATORY, final step
    Launch Task agent: /tl-docs UC###
    Update graph: SET t.status = 'done'
    UC is DONE -- only after THIS step

REMINDER: Do NOT return WAVE_RESULT after Step 1 or Step 3. Continue executing
Steps 2 through 8 before considering any UC complete.

After ALL UCs have reached Step 8 (or explicitly failed), return:

WAVE_RESULT:
  wave: N
  status: complete|partial
  tasks:
    - UC001: done (all 8 phases complete)
    - UC003: done (all 8 phases complete)
    - UC005: FAILED at phase "qa" (3 retries -- acceptance criterion 3 not met)
  problems: [list of unresolved issues with details]
```

### L0 receives each Wave result

After each wave completes:
1. Parse the wave summary
2. Record results (done / failed tasks)
3. Verify graph state -- run `tl_progress_by_wave` to confirm updates persisted:
   ```cypher
   MATCH (t:Task)-[:IN_WAVE]->(w:Wave {number: $waveNum})
   RETURN t.id AS task_id, t.status AS status,
          t.phase_be, t.phase_fe, t.phase_sync,
          t.phase_review_be, t.phase_review_fe, t.phase_qa
   ```
4. If all tasks in wave done -> proceed to next wave
5. If some tasks failed -> record in problems list, proceed to next wave
6. Launch next wave agent

---

## Phase 3: Finalization (L0 -- this agent)

After all waves complete:

### Step 3.0: Phase Completion Validation <- MANDATORY before END GATE

**Before declaring execution complete**, query Neo4j to verify every UC task:

```cypher
// Verify all tasks have terminal status
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
WHERE t.type = 'uc' AND t.status <> 'done' AND t.status <> 'failed'
RETURN t.id AS task_id, t.title AS title, t.status AS status,
       w.number AS wave,
       t.phase_be, t.phase_fe, t.phase_sync,
       t.phase_review_be, t.phase_review_fe, t.phase_qa
ORDER BY w.number, t.id
```

For each UC that is NOT in terminal state (`done` or `failed`):

```
IF any phase is pending/in_progress (and task not explicitly FAILED):
  -> UC is NOT complete -- do NOT proceed to END GATE
  -> Identify which phase is incomplete
  -> Re-launch Wave Agent for that UC starting from the incomplete phase:
    "Continue UC### from phase [X]. All previous phases are done."
  -> Wait for completion
  -> Re-query graph to validate

ONLY when all UCs are either "done" or "failed" (explicit) -> proceed to Step 3.1
```

This validation prevents false "EXECUTION COMPLETE" reports when dev is done but review/sync/QA are still pending.

### Step 3.1: Final Stub Scan

Launch Task agent: `/tl-stubs --final`. Record result from agent output.
Do NOT run inline -- stub scanning reads all source files and will bloat L0 context.

### Step 3.2: END GATE -- Final Report

Query final progress from Neo4j:

```cypher
// Final progress summary
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
RETURN w.number AS wave, w.name AS wave_name,
       t.id AS task_id, t.title AS title, t.type AS type,
       t.status AS status
ORDER BY w.number, t.id
```

Display the complete project report:

```
===============================================================
              PROJECT EXECUTION COMPLETE
              (source: Neo4j graph)
===============================================================

Project: [Name]

TECH Tasks: M total
  [done] TECH-001: Docker Compose Setup      (1 iteration)
  [done] TECH-002: CI/CD Pipeline            (2 iterations)
  [done] TECH-003: Database Migrations       (1 iteration)

UC Tasks: N total
  Wave 1:
    [done] UC001: Create Order               (all 8 phases complete)
    [done] UC002: List Orders                 (all 8 phases complete)
  Wave 2:
    [done] UC003: Edit Order                  (all 8 phases complete)
    [FAIL] UC005: Export Orders               (FAILED at QA, 3 retries)
  Wave 3:
    [done] UC004: Delete Order               (all 8 phases complete)

Summary:
  Completed:  M/M TECH + (N-1)/N UC = X/Y phases done
  Failed:     1 UC (UC005 -- QA failure)
  Stubs:      0 critical, 3 warnings, 12 info
  QA:         4/5 passed

Problems requiring attention:
  1. UC005: QA test "export generates valid CSV" fails -- ExportService
     returns empty array. See .tl/tasks/UC005/qa-report.md

Artifacts:
  .tl/master-plan.md          -- Development plan
  .tl/status.json             -- Final status
  .tl/changelog.md            -- Full change history
  .tl/stub-registry.json      -- Stub registry
  Neo4j graph                 -- Task/Wave nodes with final phase status

Next steps:
  - Fix UC005 manually, then: /graph_tl_full --task UC005
  - Deploy to staging: /tl-deliver
  - Review progress: /graph_tl_status
===============================================================
```

---

## Resumption Logic

On start, if Task nodes exist in Neo4j with non-pending status, resume instead of starting fresh.

### State Detection from Graph

```cypher
// Find the first incomplete phase for each UC task
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
WHERE t.status <> 'done' AND t.status <> 'failed'
RETURN t.id AS task_id, t.title AS title, t.type AS type,
       w.number AS wave,
       t.status AS status,
       t.phase_be, t.phase_fe, t.phase_sync,
       t.phase_review_be, t.phase_review_fe, t.phase_qa
ORDER BY w.number, t.id
```

Phase-based resume logic:

```
TECH tasks:
  pending              -> start from /tl-dev
  in_progress          -> /tl-dev --continue
  ready_for_review     -> /tl-review
  approved/done        -> skip

UC tasks (check phase properties in order):
  phase_be = pending/in_progress             -> start from BE dev
  phase_be = ready_for_review                -> BE review
  phase_review_be = rejected                 -> BE dev --continue
  phase_review_be = approved, phase_fe = pending -> FE dev
  phase_fe = ready_for_review                -> FE review
  phase_review_fe = rejected                 -> FE dev --continue
  phase_review_fe = approved, phase_sync = pending -> sync
  phase_sync = failed                        -> fix + re-sync
  phase_sync = done, stubs not scanned       -> stubs
  phase_qa = pending                         -> QA
  phase_qa = failed                          -> fix + re-QA
  phase_qa = done                            -> docs (if not done)
  all phases done                            -> skip
```

### Resume Presentation

```
===============================================================
            RESUMING -- PROJECT STATE DETECTED
            (source: Neo4j graph)
===============================================================

Project: [Name]
Last updated: YYYY-MM-DD HH:MM

Completed:
  [done]        Wave 0: 3/3 TECH tasks done
  [done]        Wave 1: 2/2 UCs done
  [in_progress] Wave 2: 1/3 UCs done, 1 in progress, 1 pending

Resume point:
  Wave 2, UC004 -- resume from FE development (BE approved)

Continue autonomous execution from this point? [yes/no]
===============================================================
```

This counts as the START GATE. After user confirms, execute autonomously.

If `--yes` flag is set -> skip this confirmation and resume immediately.

---

## Graph Update Protocol

Every phase transition MUST be written to Neo4j. This is the **key difference** from tl-full.

### Update Query Template

```cypher
// Generic phase update -- used after every step completes
MATCH (t:Task {id: $taskId})
SET t.<phase_property> = $newStatus,
    t.status = $overallStatus,
    t.updated = datetime()
```

### Phase Transition Table

| Step | Phase property | On start | On success | On failure (after 3 retries) |
|------|---------------|----------|------------|------------------------------|
| BE dev | `phase_be` | `in_progress` | `ready_for_review` | `failed` |
| BE review | `phase_review_be` | `in_progress` | `approved` | `failed` |
| FE dev | `phase_fe` | `in_progress` | `ready_for_review` | `failed` |
| FE review | `phase_review_fe` | `in_progress` | `approved` | `failed` |
| Sync | `phase_sync` | `in_progress` | `done` | `failed` |
| QA | `phase_qa` | `in_progress` | `done` | `failed` |
| Docs | -- | -- | `status = 'done'` | -- |
| TECH | `status` | `in_progress` | `done` | `failed` |

### Overall Task Status

The `status` property on the Task node reflects the overall state:

| Condition | Task.status |
|-----------|-------------|
| No phase started | `pending` |
| Any phase in progress | `in_progress` |
| All phases complete | `done` |
| Any phase failed (after 3 retries) | `failed` |

### Dual-Write: Graph + JSON

After each graph update, also update `.tl/status.json` to keep it in sync. Dev skills and other non-graph-aware tools read from `status.json`, so it must stay current.

```
1. Write to Neo4j (primary)
2. Update .tl/status.json (secondary) -- same phase data
```

If Neo4j write fails, still update `status.json` and log the error. Do NOT stop execution for a graph write failure.

---

## Retry Policy

All retry loops (at L1 and L2 levels) follow:

```
MAX_RETRIES = 3

for iteration in 1..3:
  1. Fix: /tl-dev-be UC### --continue  (or appropriate fix command)
  2. Verify: /tl-review UC### --be     (or appropriate check)
  3. If passed -> break, continue lifecycle
  4. If failed -> log, continue loop

After 3 failures:
  -> Update graph: SET t.phase_<X> = 'failed', t.status = 'failed'
  -> Record failure details (phase, reason, retry log)
  -> Skip to next task (do NOT stop the entire orchestration)
  -> Include in final report problems list
```

**Critical**: failures do NOT stop the orchestration. Other tasks continue. Only the failing task is skipped.

---

## Parallel Execution Within Waves

Wave agents process UCs sequentially by default. However, for UCs within the same wave that have NO mutual dependencies, L1 can batch L2 calls:

```
Wave 2 has: UC001, UC003, UC004
  UC001 and UC003: independent -> can parallel
  UC004 depends on UC001 -> sequential after UC001

Execution order:
  Batch 1: /tl-dev-be UC001 + /tl-dev-be UC003  (parallel Task calls)
  Batch 2: /tl-review UC001 --be + /tl-review UC003 --be  (parallel)
  ... (continue batched phases)
  Then: UC004 (sequential, after UC001 completes)
```

To check independence, query:

```cypher
// Check if two tasks are independent (no DEPENDS_ON path between them)
MATCH (a:Task {id: $taskA}), (b:Task {id: $taskB})
OPTIONAL MATCH path = (a)-[:DEPENDS_ON*1..5]-(b)
RETURN path IS NULL AS independent
```

---

## Scope Variants

### --wave N

Execute only wave N. Skip all other waves. Load tasks for that wave from graph:

```cypher
MATCH (t:Task)-[:IN_WAVE]->(w:Wave {number: $waveNum})
OPTIONAL MATCH (t)-[:DEPENDS_ON]->(dep:Task)
RETURN t.id AS task_id, t.title AS title, t.type AS type,
       t.status AS status, collect(dep.id) AS depends_on
ORDER BY t.id
```

### --task UC###

Full lifecycle for one UC. Skip planning. Verify dependencies met via graph. Process all 8 phases.

```cypher
// Verify all dependencies are done
MATCH (t:Task {id: $taskId})-[:DEPENDS_ON]->(dep:Task)
WHERE dep.status <> 'done'
RETURN dep.id AS blocking_task, dep.status AS blocking_status
```

If any dependency is not done -> report blockers and STOP.

Launch a single Wave Agent (Task tool) with TASKS: [UC###] -- same L0->L1 prompt as a regular wave.
Do NOT run the 8 phases inline at L0.

### --feature FR-NNN

Execute only the wave created for feature request FR-NNN. Look up the wave from graph:

```cypher
// Find wave for a feature request
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
WHERE t.title CONTAINS $featureId OR w.name CONTAINS $featureId
RETURN DISTINCT w.number AS wave
```

Equivalent to `--wave N` where N is the wave assigned to this FR.

### --skip-plan

Skip Phase 0 planning. Assume `.tl/` already populated and graph already has Task/Wave nodes. Start from Phase 1 (or resume).

### --skip-qa

Skip QA phase in all UC lifecycles. Tasks go directly from stubs to docs. Update graph: `phase_qa` stays `pending` (not executed). Log "QA: skipped by user".

---

## What You Do at L0 (This Agent)

Your job as the top-level orchestrator is minimal but critical:

1. **Initialize**: check graph state, run /graph_tl_plan if needed
2. **START GATE**: show plan (from graph), get user approval
3. **Delegate waves**: for each wave, launch ONE Task agent (L1) with full instructions including the Graph Update Protocol
4. **Collect results**: parse wave summaries, verify graph state, accumulate problems
5. **Finalize**: validate all phases via graph query, run final stubs, display END GATE report
6. **Handle edge cases**: if wave agent crashes, retry the wave once

### What You Do NOT Do

- Write code
- Create task files
- Review code
- Run tests
- Read source files
- Make intermediate confirmations
- Execute dev skills directly (always delegate via Task tool)

---

## Progress Queries (L0 uses between waves)

Between wave executions, L0 can check progress without reading files:

```cypher
// Quick progress check
MATCH (t:Task)
RETURN t.status AS status, count(t) AS count
ORDER BY
  CASE t.status
    WHEN 'done' THEN 1
    WHEN 'in_progress' THEN 2
    WHEN 'pending' THEN 3
    WHEN 'failed' THEN 4
    ELSE 5
  END
```

```cypher
// Active wave (lowest wave with incomplete tasks)
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
WHERE t.status <> 'done'
RETURN w.number AS active_wave, count(t) AS remaining_tasks
ORDER BY w.number
LIMIT 1
```

These are lightweight queries that keep L0's context clean.

---

## Error Handling

### Neo4j connection failure during execution

If a graph write fails mid-execution:
1. Log the error: `"Neo4j write failed for Task $taskId phase $phase. Continuing with status.json only."`
2. Continue updating `.tl/status.json` (fallback)
3. Do NOT stop execution
4. At END GATE, report: `"Warning: Some graph updates may be missing. Run /graph_tl_status to verify."`

### Neo4j unavailable at startup

If the probe query in Step 0.1 fails:
1. STOP. Do not attempt to run without graph.
2. Report: `"Neo4j unavailable. Check config.yaml → graph.neo4j_bolt_port (default: 3587). Use /tl-full for non-graph execution."`
3. Suggest: check Neo4j is running, verify connection parameters in `graph_core/SKILL.md`.

### Wave agent crash

If a wave agent (L1) returns no result or an error:
1. Retry the wave ONCE with the same prompt
2. If retry also fails -> mark all remaining tasks in that wave as FAILED
3. Update graph: `SET t.status = 'failed'` for each
4. Continue to next wave

### Graph-JSON inconsistency

If graph state and `status.json` diverge:
- Graph is the **source of truth**
- Overwrite `status.json` with graph data
- Log: `"Resolved graph-JSON inconsistency for Task $taskId"`

---

## Reference Documents

| Topic | Path |
|-------|------|
| Graph connection and schema | `graph_core/SKILL.md` |
| TL schema (Task/Wave properties) | `graph-infra/schema/tl-schema.cypher` |
| Named TL queries | `graph-infra/queries/tl-queries.cypher` |
| Agent protocol | `tl-core/references/tl-protocol.md` |
| Task file format | `tl-core/references/task-file-format.md` |
| SA integration | `tl-core/references/sa-integration.md` |
| Stub tracking | `tl-core/references/stub-tracking-rules.md` |
| QA rules | `tl-core/references/qa-rules.md` |
| Sync rules | `tl-core/references/sync-rules.md` |
| Dev environment | `tl-core/references/dev-environment.md` |

## Data Sources

### Reads (Neo4j -- via mcp__neo4j__read-cypher)

```yaml
# TL layer nodes:
- Task (id, title, type, status, wave, priority, phase_be, phase_fe, phase_sync,
        phase_review_be, phase_review_fe, phase_qa, created, updated)
- Wave (id, number, name, status)

# TL layer edges:
- (Task)-[:IN_WAVE]->(Wave)
- (Task)-[:DEPENDS_ON]->(Task)

# Key named queries (graph-infra/queries/tl-queries.cypher):
- tl_progress_by_wave
- tl_active_wave
- tl_progress_stats
- tl_blocked_tasks
- tl_wave_tasks
```

### Writes (Neo4j -- via mcp__neo4j__write-cypher)

```yaml
# Task node property updates:
- Task.status (pending -> in_progress -> done/failed)
- Task.phase_be, Task.phase_fe, Task.phase_sync
- Task.phase_review_be, Task.phase_review_fe, Task.phase_qa
- Task.updated (datetime)
```

### Reads (Filesystem)

| File | Read/Write | Purpose |
|------|-----------|---------|
| `.tl/master-plan.md` | Read | Project name, supplementary info |
| `.tl/status.json` | Read+Write | Dual-write target (secondary to graph) |
| `.tl/changelog.md` | Read | History (for final report) |
| `.tl/stub-registry.json` | Read | Stub counts (for final report) |
| `config.yaml` | Read | YouGile columns, build/test commands |

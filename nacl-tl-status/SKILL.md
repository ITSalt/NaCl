---
name: nacl-tl-status
model: haiku
effort: low
description: |
  Graph-aware project status with SA coverage metrics.
  Reads Task/Wave nodes from Neo4j, falls back to status.json.Use when: project status with graph, check progress with SA coverage, or the user says "/nacl-tl-status".
---

# /nacl-tl-status -- Graph-Aware Project Status

## Purpose

Graph-powered replacement for `/nacl-tl-status`. Computes progress from Task and Wave
nodes in Neo4j using named Cypher queries, adds SA coverage metrics (UC detail
completeness, entity attribute completeness, handoff coverage), and falls back to
`.tl/status.json` when the graph is unavailable.

**Critical difference from nacl-tl-status:**

| Aspect | nacl-tl-status | nacl-tl-status |
|--------|-----------|-----------------|
| Data source | `.tl/status.json` | Neo4j Task/Wave nodes (primary) |
| Fallback | None | `.tl/status.json` (identical to nacl-tl-status) |
| SA coverage | Not available | UC detail %, entity attribute %, handoff coverage % |
| Phase data | Parsed from JSON | Task node properties (`phase_be`, `phase_fe`, ...) |
| Blockers | Dependency rules on JSON | Graph `DEPENDS_ON` traversal |

**Shared references:** `nacl-core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Read Task/Wave nodes, run progress/blocker queries |

This skill is **read-only**. It does not write to Neo4j or the filesystem.

---

## Invocation

```
/nacl-tl-status [options]
```

### Filtering Options

```
/nacl-tl-status                # Full report (all sections)
/nacl-tl-status --waves        # Show wave-by-wave progress only
/nacl-tl-status --be           # Show only BE progress (BE dev + BE review phases)
/nacl-tl-status --fe           # Show only FE progress (FE dev + FE review phases)
/nacl-tl-status --tech         # Show only TECH tasks section
/nacl-tl-status --stubs        # Show detailed stubs report (by severity, marker, task)
/nacl-tl-status --qa           # Show QA results per task (pass/fail/pending)
/nacl-tl-status --blocked      # Show blockers with dependency chains
/nacl-tl-status --compact      # One-line compact summary
```

Filter behavior is identical to `/nacl-tl-status` (see filter section below).

---

## Workflow

### Step 0: Data Source Resolution

Attempt Neo4j first. If it fails, fall back to `.tl/status.json`.

**Neo4j probe query:**

```cypher
MATCH (t:Task) RETURN count(t) AS task_count LIMIT 1
```

| Probe result | Action |
|--------------|--------|
| Returns `task_count > 0` | Use Neo4j as primary data source |
| Returns `task_count = 0` | Neo4j is empty -- fall back to `.tl/status.json` |
| Connection error / MCP tool failure | Neo4j unavailable -- fall back to `.tl/status.json` |

**When falling back:** Display a note at the top of the report:

```
Note: Neo4j unavailable or empty. Reading from .tl/status.json (no SA coverage metrics).
```

Then execute exactly the same logic as `/nacl-tl-status` (read `.tl/status.json`, stub-registry, QA reports). Skip the SA Coverage section.

**The rest of this document describes the Neo4j primary path.**

---

### Step 1: Read Data Sources

#### 1a. Neo4j Queries

Run the following named queries from `graph-infra/queries/tl-queries.cypher`:

| Query | Purpose |
|-------|---------|
| `tl_progress_stats` | Task count grouped by status (done, in_progress, pending) |
| `tl_progress_by_wave` | Progress per wave with done/in_progress/pending counts |
| `tl_phase_progress` | Phase-level counts (be, fe, sync, review_be, review_fe, qa) |
| `tl_blocked_tasks` | Tasks whose dependencies are not yet done |

**Query: tl_progress_stats**

```cypher
MATCH (t:Task)
RETURN t.status AS status, count(t) AS count
ORDER BY
  CASE t.status
    WHEN 'done' THEN 1
    WHEN 'in_progress' THEN 2
    WHEN 'todo' THEN 3
    ELSE 4
  END
```

**Query: tl_progress_by_wave**

```cypher
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

**Query: tl_phase_progress**

```cypher
MATCH (t:Task) WHERE t.phase_be IS NOT NULL
RETURN 'be' AS phase, t.phase_be AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_fe IS NOT NULL
RETURN 'fe' AS phase, t.phase_fe AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_sync IS NOT NULL
RETURN 'sync' AS phase, t.phase_sync AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_review_be IS NOT NULL
RETURN 'review_be' AS phase, t.phase_review_be AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_review_fe IS NOT NULL
RETURN 'review_fe' AS phase, t.phase_review_fe AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_qa IS NOT NULL
RETURN 'qa' AS phase, t.phase_qa AS status, count(t) AS count
```

**Query: tl_blocked_tasks**

```cypher
MATCH (t:Task)-[:DEPENDS_ON]->(dep:Task)
WHERE dep.status <> 'done'
RETURN t.id AS blocked_task, t.title AS blocked_title, t.status AS blocked_status,
       dep.id AS blocking_task, dep.title AS blocking_title, dep.status AS blocking_status
```

**Additional query: all tasks with wave and phase details (for UC/TECH detail sections)**

```cypher
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
OPTIONAL MATCH (uc:UseCase)-[:GENERATES]->(t)
RETURN t.id AS task_id, t.title AS title, t.status AS status,
       t.type AS type, t.priority AS priority,
       w.number AS wave, w.name AS wave_name,
       t.phase_be AS phase_be, t.phase_fe AS phase_fe,
       t.phase_sync AS phase_sync,
       t.phase_review_be AS phase_review_be,
       t.phase_review_fe AS phase_review_fe,
       t.phase_qa AS phase_qa,
       uc.id AS uc_id, uc.name AS uc_name
ORDER BY w.number, t.id
```

#### 1b. Filesystem Sources (supplementary)

| File | Required | Purpose |
|------|----------|---------|
| `.tl/stub-registry.json` | No | Stubs summary (critical, warning, info) |
| `.tl/tasks/*/qa-report.md` | No | QA test results per task |
| `.tl/conductor-state.json` | No | Conductor batch state |
| `.tl/delivery-status.json` | No | Delivery pipeline state |

These files supplement the graph data. Read them the same way as nacl-tl-status.

---

### Step 2: Calculate Phase-Based Progress

Progress is calculated from the `tl_phase_progress` query results.

For UC tasks (nodes with `type = 'uc'`), each task has 6 phases stored as node properties:
`phase_be`, `phase_fe`, `phase_sync`, `phase_review_be`, `phase_review_fe`, `phase_qa`.

For TECH tasks (nodes with `type = 'tech'`), each has 1 effective phase: `status`.

**Overall progress formula:**

```
completed_phases = sum of all phases with status in [done, approved, pass]
total_phases = (UC_count * 6) + TECH_count
progress_percent = (completed_phases / total_phases) * 100
```

**Phase completion mapping:**

| Phase | Completed when status is |
|-------|--------------------------|
| `phase_be`, `phase_fe` | `done` |
| `phase_sync`, `phase_qa` | `pass` or `done` |
| `phase_review_be`, `phase_review_fe` | `approved` |
| TECH `status` | `done` |

---

### Step 3: Generate Progress Bar

20 characters wide. Each character = 5%. Use `=` for filled, `-` for empty:

```
Overall Progress: [================----] 60% (18/30 phases)
```

---

### Step 4: Build Execution Waves Display

Use `tl_progress_by_wave` results. Group tasks by their wave. Status icons:
`[x]` done/approved/pass, `[~]` in_progress/in_review, `[ ]` pending, `[!]` blocked/rejected/fail.

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

---

### Step 5: Build UC Task Details

For each UC task, display all 6 phases from the Task node properties in a compact two-column layout:

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

Phase status display mapping:
- `pending` -> `[ ] pending`
- `in_progress` / `ready_for_review` / `in_review` -> `[~] dev` / `[~] review`
- `approved` / `done` / `pass` -> `[x]`
- `fail` / `rejected` / `blocked` -> `[!]`

Stubs line: read from `.tl/stub-registry.json` per-task data (same as nacl-tl-status).

---

### Step 6: Build TECH Tasks Section

```
-- TECH Tasks ------------------------------------------------

TECH-001: Docker Compose Setup      [x] done
TECH-002: CI/CD Pipeline            [~] in_progress
```

---

### Step 7: Build Summary Table

Aggregate from `tl_phase_progress` query results:

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

---

### Step 8: Build Stubs Summary

Read from `.tl/stub-registry.json` (same logic as nacl-tl-status).

- Normal: `Stubs: 0 critical, 4 warnings, 12 info`
- Critical found: `!! Stubs: 2 critical, 4 warnings -- Critical in: UC003-BE (2), TECH-002 (1)`
- No registry: `Stubs: No stub registry found (run /nacl-tl-stubs to scan)`

---

### Step 9: Build QA Summary

Scan `.tl/tasks/*/qa-report.md` and read `phase_qa` from each UC Task node.

- Normal: `QA: 2 passed, 1 failed, 5 pending`
- Failures: append `FAIL: UC003 (API timeout on delete endpoint)`
- Not started: `QA: Not started (0/8 tasks tested)`

---

### Step 9.5: Build Delivery Summary

Check for delivery state files (same logic as nacl-tl-status):
- `.tl/conductor-state.json` -- conductor batch state
- `.tl/delivery-status.json` -- delivery pipeline state

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
Ship:    [x] pushed (abc1234), PR #42
CI:      [x] passed (3m 12s)
Verify:  [~] in_progress
Deploy:  [ ] pending
```

If neither file exists:
```
-- Delivery ---------------------------------------------------

Not started. After development:
  /nacl-tl-deliver              -- push + verify + deploy
  /nacl-tl-conductor --items ...-- full managed workflow
```

---

### Step 10: Identify Blockers (Graph-Powered)

Use `tl_blocked_tasks` query results. The graph traversal is more precise than
JSON-based dependency checking because it follows actual `DEPENDS_ON` edges.

A task is blocked when any of its `DEPENDS_ON` targets has `status <> 'done'`.

Additionally, apply phase-level blocking rules (same as nacl-tl-status):

1. **FE blocked by BE**: `phase_fe` cannot start if `phase_be` is not `done`/`approved`
2. **Sync blocked by BE+FE**: requires both `phase_be` and `phase_fe` `approved`
3. **QA blocked by sync**: requires `phase_sync` `pass`/`done`
4. **Review blocked by dev**: requires dev `ready_for_review` or later
5. **Wave dependency**: Wave N+1 tasks depend on Wave N via `DEPENDS_ON` edges

```
-- Blockers --------------------------------------------------

[!] UC003-FE: Waiting for UC003-BE completion
    Chain: UC003-BE (pending) -> UC003-FE -> UC003-SYNC -> UC003-QA
[!] UC001-QA: Waiting for UC001-SYNC completion
```

If no blockers: `No blockers detected. All dependencies satisfied.`

For deeper chain analysis, run:

```cypher
// Dependency chain from a blocked task
MATCH path = (t:Task {id: $taskId})-[:DEPENDS_ON*1..5]->(root:Task)
WHERE root.status <> 'done'
RETURN [n IN nodes(path) | n.id + ' (' + n.status + ')'] AS chain
```

---

### Step 11: SA Coverage (BONUS -- graph-only section)

This section is **only available when Neo4j is the data source**. It provides
SA specification readiness metrics that are invisible to `/nacl-tl-status`.

Run two named queries from `graph-infra/queries/`:

**Query: sa_readiness_assessment** (from `sa-queries.cypher`)

```cypher
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
WITH m, count(uc) AS total_ucs,
     count(CASE WHEN uc.detail_status = 'complete' THEN 1 END) AS detailed_ucs
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
WITH m, total_ucs, detailed_ucs, count(de) AS total_entities
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de2:DomainEntity)-[:HAS_ATTRIBUTE]->()
WITH m, total_ucs, detailed_ucs, total_entities,
     count(DISTINCT de2) AS entities_with_attrs
RETURN m.id AS module_id, m.name AS module_name,
       total_ucs, detailed_ucs,
       CASE WHEN total_ucs > 0 THEN round(100.0 * detailed_ucs / total_ucs) ELSE 0 END AS uc_readiness_pct,
       total_entities, entities_with_attrs,
       CASE WHEN total_entities > 0 THEN round(100.0 * entities_with_attrs / total_entities) ELSE 0 END AS entity_readiness_pct
```

**Query: handoff_coverage_stats** (from `handoff-queries.cypher`)

```cypher
// Returns: automation_coverage_pct, entity_coverage_pct, role_coverage_pct, rule_coverage_pct, details
// (full query in graph-infra/queries/handoff-queries.cypher)
```

Run the full `handoff_coverage_stats` query as written in the file.

**Display format:**

```
-- SA Coverage -----------------------------------------------

UC Detail Completeness (by module):
  mod-orders:     [================----] 80% (4/5 UCs detailed)
  mod-inventory:  [============--------] 60% (3/5 UCs detailed)
  mod-users:      [====================] 100% (2/2 UCs detailed)

Entity Attribute Completeness (by module):
  mod-orders:     [====================] 100% (5/5 entities have attributes)
  mod-inventory:  [================----] 80% (4/5 entities have attributes)
  mod-users:      [====================] 100% (3/3 entities have attributes)

BA -> SA Handoff Coverage:
  Automation steps:  [==================--] 90% (18/20 mapped)
  Entity mapping:    [====================] 100% (12/12 mapped)
  Role mapping:      [================----] 80% (4/5 mapped)
  Rule coverage:     [==============------] 70% (14/20 mapped)
```

**SA Coverage health indicators:**

| Condition | Display |
|-----------|---------|
| All metrics >= 90% | `SA: [READY]` |
| Any metric 60-89% | `SA: [GAPS]` |
| Any metric < 60% | `SA: [!! INCOMPLETE]` |

Include SA health in the report header next to the project health indicator.

---

### Step 12: Generate Recommendations

Suggest 1-3 actionable next steps. Prioritize:
1. Tasks that unblock the most others (use `DEPENDS_ON` fan-out count)
2. Current active wave tasks
3. Highest priority
4. Finishing in-progress work first

If SA coverage gaps exist, add an SA-specific recommendation:

```
-- Recommendations -------------------------------------------

1. Complete UC001-FE development (unblocks sync + QA)
   /nacl-tl-dev-fe UC001

2. Complete TECH-002 (unblocks Wave 2 infrastructure)
   /nacl-tl-dev TECH-002

3. Detail UC-105, UC-107 in mod-inventory (SA coverage at 60%)
   /nacl-sa-uc UC-105
```

---

## Full Status Output Format

```
===========================================================
                    PROJECT STATUS
                    (source: Neo4j)
===========================================================

Project: [Project Name]
Updated: YYYY-MM-DD HH:MM
Health:  [IN PROGRESS] [SA: READY]

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

Not started. After development: /nacl-tl-deliver

-- SA Coverage -----------------------------------------------

UC Detail Completeness (by module):
  mod-orders:     [================----] 80% (4/5 UCs detailed)
  mod-inventory:  [============--------] 60% (3/5 UCs detailed)

Entity Attribute Completeness (by module):
  mod-orders:     [====================] 100% (5/5 entities)
  mod-inventory:  [================----] 80% (4/5 entities)

BA -> SA Handoff Coverage:
  Automation steps:  [==================--] 90% (18/20)
  Entity mapping:    [====================] 100% (12/12)
  Role mapping:      [================----] 80% (4/5)
  Rule coverage:     [==============------] 70% (14/20)

-- Blockers --------------------------------------------------

[!] UC003-FE: Waiting for UC003-BE completion
[!] UC001-QA: Waiting for UC001-SYNC completion

-- Recommendations -------------------------------------------

1. Complete UC001-FE development (unblocks sync + QA)
   /nacl-tl-dev-fe UC001

2. Complete TECH-002 (unblocks Wave 1 tasks)
   /nacl-tl-dev TECH-002

3. Detail UC-105, UC-107 in mod-inventory (SA coverage at 60%)
   /nacl-sa-uc UC-105

===========================================================
```

---

## Compact Status Format

When `--compact` flag is used, display a two-line summary:

```
Project: [Name] | Progress: 60% | BE: 3/5 | FE: 1/5 | TECH: 1/2 | Stubs: 4w | QA: 0/5 | SA: 90%
Next: /nacl-tl-dev-fe UC001
```

Rules: one line for metrics, one for next action. Stubs: `Nc` critical, `Nw` warnings (e.g. `2c 4w`). If clean: `Stubs: ok`. QA: passed/total. SA: average of all coverage percentages (only when Neo4j is available; omit when in fallback mode).

---

## Filter Details

### --waves

Show waves section only, each wave gets its own progress bar (from `tl_progress_by_wave`):

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

### --tech

Show only TECH tasks with their status.

### --stubs

Detailed stubs by severity, marker, and task. Include last scan time and unresolved critical count. Data from `.tl/stub-registry.json`.

### --qa

Per-task QA status: PASS / FAIL (with failure reason) / pending. Include report file path. Data from `phase_qa` Task node property + `.tl/tasks/*/qa-report.md`.

### --blocked

Blockers with full dependency chains (graph-powered) and recommendations to unblock:

```
[!] UC003-FE: Waiting for UC003-BE completion
    Chain: UC003-BE (pending) -> UC003-FE -> UC003-SYNC -> UC003-QA
Recommendations to unblock:
  1. /nacl-tl-dev-be UC003  (unblocks 4 downstream phases)
```

Uses the dependency chain query:

```cypher
MATCH path = (t:Task {id: $taskId})-[:DEPENDS_ON*1..5]->(root:Task)
WHERE root.status <> 'done'
RETURN [n IN nodes(path) | n.id + ' (' + n.status + ')'] AS chain
```

---

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

SA-specific health (graph-only):

| Condition | Display |
|-----------|---------|
| All SA metrics >= 90% | `[SA: READY]` |
| Any SA metric 60-89% | `[SA: GAPS]` |
| Any SA metric < 60% | `[SA: !! INCOMPLETE]` |

Multiple indicators combine: `Health: [IN PROGRESS] [BLOCKED] [SA: GAPS]`

---

## Error Handling

### Neo4j connection failure

If `mcp__neo4j__read-cypher` fails:
1. Log: `Neo4j unavailable. Falling back to .tl/status.json. Check config.yaml → graph.neo4j_bolt_port (default: 3587).`
2. Fall back to `.tl/status.json` and proceed identically to `/nacl-tl-status`.
3. Skip the SA Coverage section entirely.

### Neo4j empty (no Task nodes)

If probe query returns `task_count = 0`:
1. Log: `Neo4j has no Task nodes. Falling back to .tl/status.json.`
2. Fall back to `.tl/status.json`.
3. Suggest: `Run /nacl-tl-plan to create Task/Wave nodes in the graph.`

### Fallback: .tl/status.json

When in fallback mode, all logic is identical to `/nacl-tl-status`:
- Read `.tl/status.json` for task list, phases, waves, project metadata.
- Read `.tl/stub-registry.json` for stubs summary.
- Read `.tl/tasks/*/qa-report.md` for QA results.
- Read `.tl/master-plan.md` for wave definitions.
- No SA Coverage section.
- Data source line in header: `(source: .tl/status.json -- fallback)`

### Partial data

If optional files (stub-registry, qa-reports) are missing, generate partial report with a note:
`Note: stub-registry.json not found. Run /nacl-tl-stubs to scan.`

### Inconsistent data

If phase states conflict (e.g., `phase_be: done` but `phase_review_be: pending` skipped), report the inconsistency and suggest `/nacl-tl-plan --refresh`.

### Stale data

If the most recent `Task.updated` timestamp is older than 3 days:
`Warning: Status data is stale (last updated: YYYY-MM-DD). Run /nacl-tl-status --refresh.`

---

## Reads (Neo4j -- via mcp__neo4j__read-cypher)

```yaml
# TL layer nodes:
- Task (id, title, type, status, wave, priority, phase_be, phase_fe, phase_sync,
        phase_review_be, phase_review_fe, phase_qa, created, updated)
- Wave (id, number, name, status)

# TL layer edges:
- (Task)-[:IN_WAVE]->(Wave)
- (Task)-[:DEPENDS_ON]->(Task)

# SA layer nodes (for SA Coverage section):
- Module, UseCase, DomainEntity, DomainAttribute

# SA layer edges (for SA Coverage section):
- (Module)-[:CONTAINS_UC]->(UseCase)
- (Module)-[:CONTAINS_ENTITY]->(DomainEntity)
- (DomainEntity)-[:HAS_ATTRIBUTE]->(DomainAttribute)

# Handoff layer edges (for SA Coverage section):
- (WorkflowStep)-[:AUTOMATES_AS]->(UseCase)
- (BusinessEntity)-[:REALIZED_AS]->(DomainEntity)
- (BusinessRole)-[:MAPPED_TO]->(SystemRole)
- (BusinessRule)-[:IMPLEMENTED_BY]->(Requirement)

# Key named queries (graph-infra/queries/):
- tl_progress_stats (tl-queries.cypher)
- tl_progress_by_wave (tl-queries.cypher)
- tl_phase_progress (tl-queries.cypher)
- tl_blocked_tasks (tl-queries.cypher)
- sa_readiness_assessment (sa-queries.cypher)
- handoff_coverage_stats (handoff-queries.cypher)
```

## Reads (Filesystem)

| File | Required | Purpose |
|------|----------|---------|
| `.tl/status.json` | Fallback only | Task list, phases, waves, metadata (when Neo4j unavailable) |
| `.tl/stub-registry.json` | No | Stubs summary by severity and task |
| `.tl/tasks/*/qa-report.md` | No | QA test results per task |
| `.tl/conductor-state.json` | No | Conductor batch state |
| `.tl/delivery-status.json` | No | Delivery pipeline state |
| `.tl/master-plan.md` | No | Wave definitions (fallback mode) |

This skill is **read-only**. It does not modify any files or graph nodes.

---

## Reference Documents

| Topic | Reference |
|-------|-----------|
| Graph connection and schema | `nacl-core/SKILL.md` |
| TL schema (Task/Wave properties) | `graph-infra/schema/tl-schema.cypher` |
| Named TL queries | `graph-infra/queries/tl-queries.cypher` |
| Named SA queries | `graph-infra/queries/sa-queries.cypher` |
| Named handoff queries | `graph-infra/queries/handoff-queries.cypher` |
| TL protocol and agent contracts | `nacl-tl-core/references/tl-protocol.md` |
| Stub tracking rules | `nacl-tl-core/references/stub-tracking-rules.md` |
| QA rules and process | `nacl-tl-core/references/qa-rules.md` |

---

## Final Checklist

### Before Reporting

- [ ] Neo4j probe query executed (or fallback triggered)
- [ ] Data source clearly identified in report header
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
- [ ] Delivery summary included
- [ ] SA Coverage section present (graph mode only)
- [ ] Blockers section present (even if empty)
- [ ] At least one recommendation provided
- [ ] Health indicators include SA status (graph mode only)

### After Report

- [ ] User knows the next action to take
- [ ] Critical blockers are visible and explained
- [ ] Progress is clearly communicated at both overall and per-task levels
- [ ] SA coverage gaps are surfaced with actionable recommendations
- [ ] Any data gaps are noted with instructions to fill them

---

## Next Steps

After viewing status, the user can:

- `/nacl-tl-next` -- Get suggested next task with reasoning
- `/nacl-tl-dev-be UC###` -- Start backend development on a specific UC
- `/nacl-tl-dev-fe UC###` -- Start frontend development on a specific UC
- `/nacl-tl-dev TECH-###` -- Work on a TECH task
- `/nacl-tl-sync UC###` -- Run sync check for a completed BE+FE pair
- `/nacl-tl-stubs` -- Scan codebase for stubs and update registry
- `/nacl-tl-qa UC###` -- Run E2E tests for a specific UC
- `/nacl-tl-review --be UC###` -- Review backend code for a UC
- `/nacl-tl-review --fe UC###` -- Review frontend code for a UC
- `/nacl-tl-plan --refresh` -- Rebuild status from task files
- `/nacl-sa-uc UC###` -- Detail a UC in the graph (if SA coverage gaps found)
- `/nacl-tl-plan` -- Regenerate plan from graph (if tasks are missing)

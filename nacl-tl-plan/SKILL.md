---
name: nacl-tl-plan
model: opus
effort: high
description: |
  Graph-based development planning from SA specifications in Neo4j.
  One Cypher query per UC instead of reading ~70 markdown files.
  Creates paired BE+FE tasks, TECH tasks, api-contracts, and execution waves.
  Task file format is IDENTICAL to nacl-tl-plan (dev agents don't change).
  Use when: create dev plan from graph, plan implementation, generate tasks,
  create development schedule, generate execution waves, or the user says "/nacl-tl-plan".
---

# /nacl-tl-plan -- Development Planning from Neo4j Graph

## Purpose

Graph-powered replacement for `/nacl-tl-plan`. Reads the SA specification from Neo4j
(modules, use cases, entities, dependencies) via Cypher queries and generates
self-sufficient task files for dev agents (`nacl-tl-dev-be`, `nacl-tl-dev-fe`).

**Critical difference from nacl-tl-plan:**

| Aspect | nacl-tl-plan | nacl-tl-plan |
|--------|---------|---------------|
| Data source | ~70 markdown files in `docs/` | Neo4j graph |
| Tokens per UC | ~150K (read all docs) | ~550 (~50 query + ~500 response) |
| Retrieval method | Read files sequentially | 1 Cypher query per UC |
| Task file format | Standard `.tl/tasks/` | **IDENTICAL** (dev agents unchanged) |

**Shared references:** `nacl-core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Read SA graph (modules, UCs, entities, deps) |
| `mcp__neo4j__write-cypher` | Create Wave and Task nodes in the TL layer |
| `mcp__neo4j__get-schema` | Introspect current graph schema before planning |

---

## Invocation

```
/nacl-tl-plan [options]
```

### Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `scope` | `full` (default) | Plan all UCs from the graph |
| | `module:<id>` | Plan only UCs in a specific module |
| | `uc:<id1>,<id2>` | Plan only specific UCs |
| `--feature` | `FR-NNN` | Plan only UCs from a feature request. Resolves the UC list and `new`/`modified` split from the **graph** (`(:FeatureRequest)-[:INCLUDES_UC]->`), falling back to `.tl/feature-requests/FR-NNN.md` only if the node is absent (Step 1.5b). |
| `wave-start` | `0` (default) | Starting wave number (for incremental planning) |
| `--overwrite` | (flag) | Destroy ALL existing Task/Wave nodes and re-plan from scratch. Default is incremental (Step 1.5b); use this only for an intentional clean rebuild. |

---

## Workflow Overview

```
Phase 1: READ SA GRAPH
  |
  +-- Modules, UseCases, DomainEntities, Dependencies
  +-- Priorities, SystemRoles
  +-- External Contracts Gate (W6, Step 1.6) — BLOCKED if missing/stub
  |
Phase 2: WAVE PLANNING
  |
  +-- Topological sort by DEPENDS_ON + priority
  +-- Wave 0: TECH tasks (infra)
  +-- Wave 1+: UC-BE before UC-FE, independent UCs in parallel
  +-- Create Wave / Task nodes in Neo4j
  |
Phase 3: TASK GENERATION
  |
  +-- For each UC: run sa_uc_full_context($ucId)
  +-- Map query result to 8 task files
  +-- Write files to .tl/tasks/UC###/
  |
Phase 4: MASTER PLAN
  |
  +-- Update master-plan.md
  +-- Update status.json
  +-- Update changelog.md
```

---

## Phase 1: Read SA Graph

### Step 1.1: Pre-flight -- verify graph has SA data

```cypher
// Pre-flight: count SA-layer nodes
MATCH (n)
WHERE n:Module OR n:UseCase OR n:DomainEntity OR n:Form OR n:Requirement OR n:SystemRole
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label
```

**If result is empty or all counts are 0:**
1. STOP -- planning is impossible without SA data in the graph.
2. Suggest user runs `/nacl-sa-architect` or `/nacl-sa-domain` first.

### Step 1.2: Get all modules with their UCs and entities

```cypher
// All modules with UC and entity counts
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
RETURN m.id AS module_id, m.name AS module_name,
       count(DISTINCT uc) AS uc_count,
       count(DISTINCT de) AS entity_count
ORDER BY m.id
```

### Step 1.3: Get all UCs with priorities and dependencies

```cypher
// sa_uc_dependencies -- all UCs with their DEPENDS_ON edges
MATCH (uc:UseCase)
OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(dep:UseCase)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       uc.priority AS priority,
       m.id AS module_id, m.name AS module_name,
       collect(dep.id) AS depends_on
ORDER BY uc.priority DESC, uc.id
```

### Step 1.4: Get complete domain model overview

```cypher
// Domain entities with attribute count and relationships
MATCH (de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
RETURN de.id AS entity_id, de.name AS entity_name,
       count(DISTINCT da) AS attr_count,
       collect(DISTINCT {target: de2.name, type: rel.rel_type, card: rel.cardinality}) AS relationships
ORDER BY de.id
```

### Step 1.5: Check for existing TL-layer data (incremental planning)

```cypher
// Count existing Task and Wave nodes
MATCH (n)
WHERE n:Task OR n:Wave
RETURN labels(n)[0] AS label, count(n) AS count
```

**If Tasks/Waves already exist, the default is INCREMENTAL re-planning, not overwrite.**
A full overwrite destroys in-progress dev state and re-bakes every snapshot; it
happens only when the user explicitly passes `--overwrite`. Otherwise run Step 1.5b
to find the *narrow* set of UCs that actually changed since the last plan, and
regenerate only those.

### Step 1.5b: Detect which UCs need re-planning (idempotency)

A Task's `.tl/tasks/UC###/*.md` files embed a point-in-time snapshot of the SA
graph (field types, role permissions, enum values — see "Self-Sufficiency").
That snapshot goes stale when its source UC changes. **Two drift-confirmed
signals** identify the stale set precisely — no markdown diffing, no whole-layer
nuke. Both require *evidence of actual drift*; neither fires on a UC that is
already current.

**Signal 1 — version drift** (a Task baked from an older spec than its UC now carries):

```cypher
// mcp__neo4j__read-cypher
// GUARD planned_from_version IS NOT NULL: a Task with no baseline (project upgraded to
// Фаза 0 but gap-closure baseline not yet run) is NOT treated as drifted here — that
// would over-flag every task on day one and reset in-progress work. Such a real change
// is still caught by Signal 2 (set by sa-feature step 3g / tl-fix L2-L3).
MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE t.planned_from_version IS NOT NULL
  AND coalesce(uc.spec_version, 0) > t.planned_from_version
RETURN DISTINCT uc.id AS uc_id, uc.spec_version AS current_version,
       t.planned_from_version AS planned_version, 'spec-drift' AS reason
```

**Signal 2 — explicit stale stamp** (set by the write-skills at change time; catches
changes even without a version bump, e.g. some tl-fix paths):

```cypher
// mcp__neo4j__read-cypher
MATCH (uc:UseCase)
WHERE coalesce(uc.review_status,'current') = 'stale'
   OR EXISTS { (uc)-[:GENERATES]->(t:Task) WHERE coalesce(t.review_status,'current')='stale' }
RETURN DISTINCT uc.id AS uc_id, uc.stale_origin AS origin
```

> **Do NOT add a third "FR flagged modified" auto-detection arm keyed only on
> `INCLUDES_UC {kind:'modified'}` + `status='spec-complete'`.** `spec-complete` is a
> sticky state — an FR that was never advanced keeps that edge forever, so such an
> arm re-flags its UCs on *every* run even after they're current, regenerating
> already-current tasks and resetting in-progress work (the exact churn the Signal-1
> guard prevents). `sa-feature` step 3g always bumps `spec_version` AND stamps stale
> when it processes an FR, so Signals 1+2 already catch every real FR-driven change.
> `INCLUDES_UC {kind}` is consumed for **explicit `--feature FR-NNN` scoping only**
> (below), never for auto drift detection.

**Incremental algorithm (default when tasks exist):**
1. `stale_set` = UCs from Signal 1 ∪ Signal 2 (both drift-confirmed).
2. `new_set` = UCs from `INCLUDES_UC {kind:'new'}` (or in-scope UCs) with **no** `GENERATES` edge yet.
3. Regenerate task files **only** for `stale_set ∪ new_set`. UCs not in either set are left untouched — their tasks and dev state survive.
4. Use `MERGE (t:Task {id: $taskId})` (Step 2.4) so re-running is idempotent at the node level: the same `UC###-BE`/`UC###-FE` ids are updated in place, never duplicated.
5. On each successful regeneration, stamp `planned_from_version` and **clear** the staleness flag (Step 2.4).
6. If `stale_set ∪ new_set` is empty, report "plan is current — nothing to regenerate" and stop.

**First Фаза-0 plan on an existing project — baseline, don't regenerate.** If Tasks
exist but none has `planned_from_version` (project just upgraded), do NOT treat
them as drifted. Baseline them once so future drift is detectable, without
resetting any in-progress work:

```cypher
// mcp__neo4j__write-cypher — one-time baseline (idempotent; only touches null ones)
MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE t.planned_from_version IS NULL
SET t.planned_from_version = coalesce(uc.spec_version, 0)
```

After baselining, only a real `spec_version` bump (or a `review_status='stale'`
stamp from `nacl-sa-feature`/`nacl-tl-fix`) marks a task for regeneration.

**`--feature FR-NNN`:** resolve the UC list from the **graph**, not the markdown
file — read `(fr:FeatureRequest {id:$frId})-[r:INCLUDES_UC]->(uc:UseCase)` and use
`r.kind` to split new vs modified. This finally consumes the `INCLUDES_UC{kind}`
edges that `nacl-sa-feature` writes (previously written but never read). Fall back
to the markdown UC list only if the FR node is absent.

```cypher
// mcp__neo4j__read-cypher — resolve --feature scope from the graph
MATCH (fr:FeatureRequest {id:$frId})-[r:INCLUDES_UC]->(uc:UseCase)
RETURN uc.id AS uc_id, r.kind AS kind
ORDER BY uc.id
```

### Step 1.6: External Contracts Gate (W6)

**Purpose.** For every UC in planning scope, refuse to generate a task when
the UC references an external provider/protocol whose
`.tl/external-contracts/<slug>.md` is absent. This is a consumer-side read
of the artifact written by `nacl-sa-architect` during its External Contracts
phase (W6 plan brief, declared primary-owner exception). Strict-only — there
is no inline `--skip-external-contract` flag.

**Why this check exists.** 13 of ~60 postmortem signals across two NaCl
projects were external-API / wire-protocol gaps (kie.ai in both projects,
TUS upload, base_url divergence, reverse-proxy URL scheme, ffmpeg/ffprobe
runtime — see `docs/retrospectives/project-beta-runtime-baseline.md` §§
A1–A9, B1–B7). Local tests passed; the product did not work. The
`nacl-tl-sync` Wire-Evidence Gate (W2) already downgrades sync to
`UNVERIFIED` when wire-evidence is absent. W6 makes the artifact concrete
upstream so the gate has something to point at.

#### 1.6.1: Discover external dependencies

```cypher
// mcp__neo4j__read-cypher
// Per-UC external-contract requirements via graph
MATCH (uc:UseCase)
WHERE uc.id IN $uc_ids
OPTIONAL MATCH (uc)-[:REQUIRES_EXTERNAL]->(ec:ExternalContract)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
OPTIONAL MATCH (m)-[:DEPENDS_ON_EXTERNAL]->(mec:ExternalContract)
RETURN uc.id AS uc_id,
       collect(DISTINCT {id: ec.id, name: ec.name, kind: ec.kind,
                         file_path: ec.file_path}) AS uc_direct,
       collect(DISTINCT {id: mec.id, name: mec.name, kind: mec.kind,
                         file_path: mec.file_path}) AS via_module
```

The union of `uc_direct` and `via_module` is the set of external contracts
the UC's tasks must reference at generation time.

#### 1.6.2: File-system existence and stub check

For each `ExternalContract` row returned above, verify the file referenced
by `ec.file_path`:

1. **File absent on disk** → record `external-contract-missing` for `(uc_id,
   contract_id)`.
2. **File present but required sections empty / "TBD" / stub** → record
   `external-contract-stub`. The required sections are 1–8 and 10–11 of the
   template (`.tl/external-contracts/_template.md`). Section 9 is required
   when `ec.kind == 'provider'`. Section 7 must be filled OR explicitly
   marked `N/A — no file URLs`.

Both conditions are blockers; the only override is a signed exception under
the W4 schema (no inline flag).

#### 1.6.3: Example check logic (pseudocode)

```text
violations = []
for uc in scope:
  required_contracts = graph_query(uc.id)  # Step 1.6.1
  for contract in required_contracts:
    if not file_exists(contract.file_path):
      violations.append({
        uc_id: uc.id, contract_id: contract.id,
        contract_name: contract.name, contract_kind: contract.kind,
        reason: "external-contract-missing",
        expected_path: contract.file_path,
        remedy: "Run /nacl-sa-architect External Contracts phase OR file " +
                "signed exception under W4 schema."
      })
      continue
    sections = parse_required_sections(contract.file_path)
    missing_required = []
    for section in [1,2,3,4,5,6,7,8,10,11]:
      if not sections[section].filled_non_stub:
        missing_required.append(section)
    if contract.kind == 'provider' and not sections[9].filled_non_stub:
      missing_required.append(9)
    if missing_required:
      violations.append({
        uc_id: uc.id, contract_id: contract.id,
        contract_name: contract.name,
        reason: "external-contract-stub",
        missing_sections: missing_required,
        expected_path: contract.file_path,
        remedy: "Complete sections " + missing_required + " of " +
                contract.file_path + " OR file signed exception (W4)."
      })

if violations:
  # Cluster violations per UC. Surface the full list.
  for v in violations:
    log(v.uc_id, v.contract_name, v.reason, v.expected_path)
  emit_headline("PLAN HALTED — EXTERNAL_CONTRACT_MISSING")
  emit_status("BLOCKED")
  exit_without_writing_anything()
```

The example above is a sketch. The skill's implementation MUST:

- Surface every violation (do NOT short-circuit after the first one — the
  operator needs the complete list to either author the missing contracts
  or to scope a signed exception).
- Refuse to write any TL node, any Wave node, any task file, or any
  `.tl/status.json` / `.tl/master-plan.md` / `.tl/changelog.md` entry until
  the gate passes OR a signed exception covering every violation is on disk.
- Emit `Status: BLOCKED` workflow detail `external-contract-missing` (when
  the file is absent) or `external-contract-stub` (when sections are
  unfilled). See **Output Summary** below for the full headline / status
  contract.

#### 1.6.4: Worked example — UC-300 referencing kie.ai

```
graph: UC-300 -[:REQUIRES_EXTERNAL]-> (ExternalContract {id: 'ext-kie',
        name: 'kie.ai', kind: 'provider',
        file_path: '.tl/external-contracts/kie.md'})

case A: .tl/external-contracts/kie.md exists, all required sections filled
  → gate PASSES; UC-300 task generation proceeds.

case B: .tl/external-contracts/kie.md absent
  → gate FAILS with external-contract-missing.
  → headline: PLAN HALTED — EXTERNAL_CONTRACT_MISSING
  → status:   BLOCKED
  → remedy:   /nacl-sa-architect External Contracts phase, or signed
              exception under W4 schema.

case C: file exists but Section 9 (Model namespace) is "TBD"
  → gate FAILS with external-contract-stub; missing_sections: [9].
  → headline: PLAN HALTED — EXTERNAL_CONTRACT_STUB
  → status:   BLOCKED
```

The same flow applies for any protocol (TUS, SSE, etc.) — the `kind`
property on `ExternalContract` toggles the Section-9 requirement only.

#### 1.6.5: Strict-only language

There is no inline `--skip-external-contract` flag. There is no
`gate_mode: legacy` carve-out. The `project_kind: prototype` config does
NOT relax this gate; prototypes are the PR/CI carve-out, not the contract
carve-out. The only override is a signed exception under the W4 schema
covering every violation by `(uc_id, contract_id)` tuple.

---

## Phase 2: Wave Planning

### Step 2.1: Topological sort

Using the `depends_on` data from Step 1.3, sort UCs by:

1. **Dependency order** -- a UC that depends on another UC must come after it
2. **Priority** -- among independent UCs, higher priority comes first
3. **Module grouping** -- UCs in the same module stay close when possible

### Step 2.2: Wave assignment rules

| Rule | Description |
|------|-------------|
| **Wave 0** | Always TECH tasks (infrastructure) |
| **BE before FE** | For the same UC, `UC###-BE` is in an earlier wave than `UC###-FE` |
| **Dependency chain** | If UC-B depends on UC-A, then UC-B-BE wave > UC-A-BE wave |
| **Parallel independent** | UCs with no mutual dependencies can be in the same wave |
| **api-contract first** | `api-contract.md` is created during planning, so available to FE by default |
| **SYNC after pair** | `nacl-tl-sync` runs when both BE and FE for a UC are approved |
| **QA in final waves** | E2E tests run after sync is complete |

### Step 2.3: Standard TECH tasks

Create TECH tasks for Wave 0. Common TECH tasks:

| Task ID | Title | Category |
|---------|-------|----------|
| TECH-001 | Docker Compose Setup | infra |
| TECH-002 | CI/CD Pipeline | cicd |
| TECH-003 | Database Migrations Setup | database |
| TECH-004 | Shared Types Package | types |
| TECH-005 | Authentication Setup | auth |
| TECH-006 | Error Handling Middleware | middleware |
| TECH-007 | Logging & Monitoring | monitoring |

Adjust list based on what the project actually needs (infer from graph content).

### Step 2.4: Create Wave and Task nodes in Neo4j

```cypher
// Create Wave node
MERGE (w:Wave {id: $waveId})
SET w.number = $waveNumber,
    w.name = $waveName,
    w.status = 'pending'
```

```cypher
// Create Task node and link to Wave and UseCase.
// MERGE by stable id ($taskId = "UC###-BE"/"UC###-FE") makes re-planning idempotent:
// re-running updates the same node in place, never duplicates it.
// $specVersion = the source UseCase.spec_version this task's files were generated from.
MERGE (t:Task {id: $taskId})
SET t.title = $title,
    t.type = $type,
    t.status = 'pending',
    t.wave = $waveNumber,
    t.agent = $agent,
    t.phase_be = 'pending',
    t.phase_fe = 'pending',
    t.phase_sync = 'pending',
    t.phase_review_be = 'pending',
    t.phase_review_fe = 'pending',
    t.phase_qa = 'pending',
    t.priority = coalesce($priority, 'medium'),
    t.planned_from_version = coalesce($specVersion, 0),
    t.created = coalesce(t.created, datetime()),
    t.updated = datetime()
// Clear any staleness flag: this task has just been re-synced from current spec.
REMOVE t.review_status, t.stale_reason, t.stale_since, t.stale_origin
WITH t
MATCH (w:Wave {number: $waveNumber})
MERGE (t)-[:IN_WAVE]->(w)
WITH t
MATCH (uc:UseCase {id: $ucId})
MERGE (uc)-[:GENERATES]->(t)
// Clear the SOURCE UC's staleness in the same statement — the UC node is itself a
// stamp target (sa-feature step 3g), and a lingering UC flag keeps L8 red even after
// its tasks are cleared. Idempotent if the UC has multiple tasks.
REMOVE uc.review_status, uc.stale_reason, uc.stale_since, uc.stale_origin
```

> Read `$specVersion` from the same `sa_uc_full_context` query that drives task
> generation: `RETURN coalesce(uc.spec_version, 0) AS spec_version`. Stamping it
> here is what lets a later `nacl-tl-plan` run detect (Step 1.5b) that the task's
> baked snapshot has fallen behind the UC. Clearing the staleness flag here (on
> BOTH the Task and its source UC, in the one statement above) is the **only**
> sanctioned way a node leaves `stale` — it certifies regeneration from the current
> graph, satisfying `nacl-sa-validate` L8. Leaving the source UC stamped while
> clearing only its Tasks is the easy mistake that keeps L8 red — hence the combined clear.

```cypher
// Create dependency edge between tasks
MATCH (t1:Task {id: $taskId}), (t2:Task {id: $dependsOnId})
MERGE (t1)-[:DEPENDS_ON]->(t2)
```

### Step 2.5: Re-link behavior slices (VERIFIED_BY)

If the UC has behavior slices (`(:UseCase)-[:HAS_SLICE]->(:Slice)`, authored by
`/nacl-sa-uc slices`), every slice must point at the delivery unit that proves
it — `nacl-sa-validate` **L11.4** gates on this once the UC has tasks. Tasks
are born here, possibly **after** the slices were authored, so this step is the
consumer half of the contract (the same lesson as `INCLUDES_UC`: an edge a
producer writes but no consumer reads is drift). Skip silently when the UC has
no slices.

**Deterministic rule** (same as the producer's): default — link each slice to
**all** of the UC's tasks; refinement — when the task ids carry the canonical
`-BE`/`-FE` suffixes, link slices with ≥1 `COVERS` anchor to the FE task,
slices with ≥1 `(sl:Slice)-[:CALLS]->` anchor to the BE task, both anchor
types → both tasks. Never guess an aspect from a task title.

```cypher
// Re-link slice verification (default rule; idempotent)
MATCH (uc:UseCase {id: $ucId})-[:HAS_SLICE]->(sl:Slice)
MATCH (uc)-[:GENERATES]->(t:Task)
MERGE (sl)-[:VERIFIED_BY]->(t)
RETURN count(DISTINCT sl) AS slices_linked, collect(DISTINCT t.id) AS tasks
```

```cypher
// Refinement when UC###-BE / UC###-FE naming is in effect: run instead of the default
MATCH (uc:UseCase {id: $ucId})-[:HAS_SLICE]->(sl:Slice)
MATCH (uc)-[:GENERATES]->(t:Task)
WHERE (t.id ENDS WITH '-FE' AND EXISTS {
         MATCH (sl)-[:COVERS]->(x) WHERE x:ScreenState OR x:Transition })
   OR (t.id ENDS WITH '-BE' AND (sl)-[:CALLS]->(:APIEndpoint))
MERGE (sl)-[:VERIFIED_BY]->(t)
RETURN count(DISTINCT sl) AS slices_linked, collect(DISTINCT t.id) AS tasks
```

> After the refinement query, run the default query for any slice still without
> a `VERIFIED_BY` (e.g. a slice whose only anchor type has no matching task) —
> L11.4 requires ≥1 edge per slice, and an unlinked slice must not survive a
> re-plan.

---

## Phase 3: Task Generation

### The Key Query: sa_uc_full_context

For each UC, run ONE Cypher query to get everything needed for all task files.

Query from `graph-infra/queries/sa-queries.cypher`:

```cypher
// sa_uc_full_context($ucId)
// ~50 tokens query, ~500 tokens response per UC
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
RETURN uc,
       collect(DISTINCT as_step) AS activity_steps,
       collect(DISTINCT f) AS forms,
       collect(DISTINCT ff) AS form_fields,
       collect(DISTINCT da) AS domain_attributes,
       collect(DISTINCT de) AS domain_entities,
       collect(DISTINCT rq) AS requirements,
       collect(DISTINCT sr) AS roles;
```

Additionally, fetch API endpoints for the UC (from TL layer if they exist, or via EXPOSES):

```cypher
// API endpoints for UC
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:EXPOSES]->(api:APIEndpoint)
OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)-[:IMPLEMENTS]->(api2:APIEndpoint)
RETURN collect(DISTINCT api) + collect(DISTINCT api2) AS api_endpoints
```

And fetch enumeration values used by the UC's domain entities:

```cypher
// Enumerations used by UC's entities
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:USES_FORM]->(:Form)-[:HAS_FIELD]->(:FormField)
       -[:MAPS_TO]->(:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ENUM]->(en:Enumeration)-[:HAS_VALUE]->(ev:EnumValue)
RETURN collect(DISTINCT en) AS enumerations,
       collect(DISTINCT ev) AS enum_values
```

And fetch the UC's screen state machines, if any (authored by
`/nacl-sa-ui state-machine`) — the `sa_uc_screen_machine` named query from
`graph-infra/queries/sa-queries.cypher`:

```cypher
// Screen state machines of the UC (empty result = UC has not adopted the
// layer; skip the section). One row per transition; effects are
// null-filtered: a bare map-collect over an unmatched OPTIONAL yields
// [{effect:NULL,…}] instead of [] for transitions without effects.
MATCH (uc:UseCase {id: $ucId})-[:HAS_SCREEN]->(scr:Screen)
OPTIONAL MATCH (scr)-[:RENDERS]->(f:Form)
OPTIONAL MATCH (scr)-[:HAS_TRANSITION]->(tr:Transition)
OPTIONAL MATCH (tr)-[:FROM_STATE]->(fromSt:ScreenState)
OPTIONAL MATCH (tr)-[:TO_STATE]->(toSt:ScreenState)
OPTIONAL MATCH (tr)-[:ON_EVENT]->(ev:ScreenEvent)
OPTIONAL MATCH (tr)-[:TRIGGERS]->(eff:ScreenEffect)
OPTIONAL MATCH (eff)-[:CALLS]->(api:APIEndpoint)
OPTIONAL MATCH (eff)-[:NAVIGATES_TO]->(navScr:Screen)
OPTIONAL MATCH (eff)-[:EMITS]->(anev:AnalyticsEvent)
RETURN scr.id AS screen, scr.route AS route, f.id AS renders_form,
       tr.id AS transition,
       fromSt.name AS from_state, fromSt.state_kind AS from_kind,
       ev.name AS on_event, ev.event_kind AS event_kind, tr.guard AS guard,
       toSt.name AS to_state, toSt.state_kind AS to_kind,
       [e IN collect(DISTINCT {
          effect: eff.id, kind: eff.effect_kind,
          target: coalesce(api.id, navScr.id, anev.id)
        }) WHERE e.effect IS NOT NULL] AS effects
ORDER BY screen, transition
```

When machines exist, embed a **"Screen State Machine"** section into
`task-fe.md` (self-sufficiency: dev agents never query the graph): per screen —
its route and rendered form, then one transition table row per
`from_state × event [guard] → to_state` with the effects and their targets
(load/mutate → endpoint, navigate → screen, analytics → event). This is the
deterministic UI contract the FE implementation must reproduce — every state
the code can be in and every edge out of it. `task-be.md` does not carry the
machine (its view of the same surface is the endpoint list it already gets);
`acceptance.md` needs no separate machine section — the Behavior Slices table
below references machine elements via `covers` ids. `test-spec-fe.md` test
cases should exercise each transition at least once (slice-covered transitions
typically already are — cross-link ids).

No new edges are written by this step (the machine layer carries no TL
overlay — verification belongs to slices).

And fetch the UC's behavior slices, if any (authored by `/nacl-sa-uc slices`) —
use the `sa_uc_slices` named query from `graph-infra/queries/sa-queries.cypher`:

```cypher
// Behavior slices of the UC (empty result = UC has not adopted slices; skip the section)
// covers is null-filtered: bare map-collect over an unmatched OPTIONAL yields
// [{id:NULL,…}] instead of [] for CALLS-only backend slices.
MATCH (uc:UseCase {id: $ucId})-[:HAS_SLICE]->(sl:Slice)
OPTIONAL MATCH (sl)-[:COVERS]->(cov)
  WHERE cov:ScreenState OR cov:Transition
OPTIONAL MATCH (sl)-[:CALLS]->(api:APIEndpoint)
RETURN sl.id AS slice, sl.name AS name, sl.slice_kind AS kind,
       sl.given AS given, sl.when AS when, sl.then AS then,
       [c IN collect(DISTINCT {id: cov.id, type: labels(cov)[0]})
        WHERE c.id IS NOT NULL] AS covers,
       collect(DISTINCT api.id) AS calls
ORDER BY slice
```

When slices exist, embed a **"Behavior Slices"** section into `task-be.md`,
`task-fe.md`, and `acceptance.md` (self-sufficiency: dev agents never query
the graph): one row per slice — kind, Given/When/Then, covered machine
elements (FE-relevant), called endpoints (BE-relevant). These are the UC's
graph-native acceptance scenarios; `test-spec*.md` test cases should reference
the slice ids they exercise.

And fetch the UC's domain-error contract, if any (authored by
`/nacl-sa-uc errors`) — the `sa_uc_errors` named query from
`graph-infra/queries/sa-queries.cypher`:

```cypher
// Domain errors raisable through the UC's endpoints (empty result = UC has
// not adopted the error taxonomy; skip the section). handled_by is
// null-filtered: bare map-collect over an unmatched OPTIONAL yields one
// all-null map instead of [] for unhandled / backend-only errors.
MATCH (uc:UseCase {id: $ucId})-[:EXPOSES]->(api:APIEndpoint)-[:MAY_RAISE]->(err:DomainError)
OPTIONAL MATCH (uc)-[:HAS_SCREEN]->(:Screen)-[:HAS_STATE]->(st:ScreenState)-[:HANDLES]->(err)
OPTIONAL MATCH (st)-[:SHOWS]->(p:ErrorPresentation)<-[:PRESENTED_AS]-(err)
RETURN err.id AS error, err.code AS code, err.error_kind AS kind,
       err.http_status AS http_status, err.retryable AS retryable,
       collect(DISTINCT api.id) AS raised_by,
       [h IN collect(DISTINCT {state: st.id,
                               presentation_kind: p.presentation_kind,
                               message: p.message})
        WHERE h.state IS NOT NULL] AS handled_by
ORDER BY error
```

When errors exist, embed a **"Domain Errors"** section (same self-sufficiency
principle; same consumer lesson — `MAY_RAISE`/`HANDLES` edges must be read by
the planner, not written into the void):

- `task-be.md` — the **error contract** the endpoints must return: one row per
  error — `code` / `error_kind` / `http_status` / `retryable` / raising
  endpoints. The code is the envelope join key the BE implementation must emit
  verbatim.
- `task-fe.md` — the **handling table**: one row per (error × handling state) —
  code / machine state / presentation kind / user-facing message. The FE
  implements exactly these presentations; an error with empty `handled_by` is
  listed under "unhandled (L12.7 advisory)" so the gap stays visible in the
  task file.
- `acceptance.md` — the full error table (both halves).
- `test-spec*.md` test cases should cover each error code at least once
  (error-kind slices typically reference the same failure — cross-link ids).

No new edges are written by this step (unlike Step 2.5's VERIFIED_BY: errors
carry no TL overlay — verification belongs to slices).

And fetch the UC's resilience layer, if any (authored by
`/nacl-sa-uc resilience`) — the `sa_uc_resilience` named query from
`graph-infra/queries/sa-queries.cypher`:

```cypher
// Cache policies of the UC's surfaces + its degradation rules (empty
// cache_policies AND empty rules = UC has not adopted the resilience layer;
// skip the section). Both map-collects are null-filtered (the Фаза-2 gotcha).
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_DEGRADATION]->(dr:DegradationRule)
OPTIONAL MATCH (dr)-[:ON_ERROR]->(err:DomainError)
OPTIONAL MATCH (dr)-[:DEGRADES_TO]->(st:ScreenState)
WITH uc, dr,
     [e IN collect(DISTINCT {id: err.id, code: err.code, retryable: err.retryable})
      WHERE e.id IS NOT NULL] AS on_errors,
     collect(DISTINCT st.id) AS degrades_to
WITH uc,
     [r IN collect(DISTINCT {id: dr.id, name: dr.name, trigger: dr.trigger_kind,
                             fallback: dr.fallback_kind, behavior: dr.behavior,
                             on_errors: on_errors, degrades_to: degrades_to})
      WHERE r.id IS NOT NULL] AS rules
OPTIONAL MATCH (uc)-[:EXPOSES]->(api:APIEndpoint)<-[:CACHES]-(cp:CachePolicy)
WITH uc, rules, cp, collect(DISTINCT api.id) AS cached_endpoints
WITH uc, rules,
     [c IN collect(DISTINCT {id: cp.id, name: cp.name, storage: cp.storage_kind,
                             invalidation: cp.invalidation_kind, ttl: cp.ttl_seconds,
                             serves_stale: cp.serves_stale, caches: cached_endpoints})
      WHERE c.id IS NOT NULL] AS cache_policies
RETURN uc.id AS uc_id, cache_policies, rules
```

When the resilience layer exists, embed a **"Cache & Degradation"** section
(same self-sufficiency principle; same consumer lesson — `CACHES` /
`ON_ERROR` / `DEGRADES_TO` edges must be read by the planner, not written
into the void):

- `task-be.md` — the **cache contract** of the UC's surfaces: one row per
  policy — storage / invalidation kind (+ ttl seconds or invalidation
  event) / serves_stale / cached endpoints. Plus the **backend degradation
  rules** (no DEGRADES_TO): one row per rule — trigger / fallback kind /
  the verbatim `behavior` text the implementation must produce (skip_unit,
  backoff with Retry-After, provider switches live here).
- `task-fe.md` — the **degradation handling table**: one row per rule with
  a UI half — trigger / degraded machine state / fallback kind / observable
  `behavior`. Plus the client-side cache policies (local_storage /
  indexed_db / cache_api / memory) the FE must implement, with their
  invalidation events.
- `acceptance.md` — both halves.
- `test-spec*.md` test cases should cover each degradation rule at least
  once (alternate-kind slices typically describe the same recovery —
  cross-link ids).
- Unjoined `cached_data` rules (the L13.8 view) and cached surfaces whose
  retryable/external errors no rule degrades (the L13.7 view) are listed
  under "resilience gaps (advisory)" so the gap stays visible in the task
  file.

No new edges are written by this step either (the resilience layer carries
no TL overlay — verification belongs to slices).

### Query Result to Task File Mapping

The sa_uc_full_context result maps directly to each task file section:

```
sa_uc_full_context result
  |
  +-- uc (UseCase node)
  |     props: id, name, description, priority, preconditions, postconditions
  |     |
  |     +---> task-be.md: Header, Description, Actor, Preconditions
  |     +---> task-fe.md: Header, Description, Actor
  |     +---> acceptance.md: UC name, preconditions, postconditions
  |     +---> impl-brief.md: Overview, preconditions, postconditions
  |     +---> impl-brief-fe.md: Overview, user-facing context
  |
  +-- activity_steps (ActivityStep nodes)
  |     props: id, description, order, step_type (system|user|api)
  |     |
  |     +---> task-be.md: Main Flow (system steps)
  |     +---> task-fe.md: User Interactions (user steps)
  |     +---> api-contract.md: Endpoints (api steps)
  |     +---> impl-brief.md: Implementation Steps (system steps)
  |     +---> impl-brief-fe.md: Implementation Steps (user steps)
  |     +---> test-spec.md: Test Scenarios (one per system step)
  |     +---> test-spec-fe.md: Test Scenarios (one per user step)
  |
  +-- forms (Form nodes)
  |     props: id, name, description
  |     |
  |     +---> task-fe.md: Forms section
  |     +---> impl-brief-fe.md: UI Spec section
  |
  +-- form_fields (FormField nodes)
  |     props: id, name, label, field_type, required, validation, placeholder
  |     |
  |     +---> task-fe.md: Form Fields table
  |     +---> api-contract.md: Request body fields
  |     +---> impl-brief-fe.md: Component field specs
  |     +---> test-spec-fe.md: Field validation test cases
  |
  +-- domain_attributes (DomainAttribute nodes)
  |     props: id, name, data_type, required, description, constraints
  |     |
  |     +---> task-be.md: Context Extract (entity attribute table)
  |     +---> api-contract.md: Shared Types (TypeScript interfaces)
  |     +---> test-spec.md: Validation test cases (type, required, constraints)
  |
  +-- domain_entities (DomainEntity nodes)
  |     props: id, name, description, module
  |     |
  |     +---> task-be.md: Context Extract (entity name, description)
  |     +---> task-fe.md: Context Extract (entity reference)
  |     +---> api-contract.md: Shared Types (entity interfaces)
  |     +---> impl-brief.md: DB schema, service layer
  |
  +-- requirements (Requirement nodes)
  |     props: id, description, type (FR|NFR), priority, acceptance_criteria
  |     |
  |     +---> acceptance.md: Acceptance Criteria list
  |     +---> test-spec.md: Test cases derived from requirements
  |     +---> test-spec-fe.md: FE test cases from UI requirements
  |     +---> task-be.md: Requirements section
  |     +---> task-fe.md: Requirements section
  |
  +-- roles (SystemRole nodes)
  |     props: id, name, permissions
  |     |
  |     +---> task-be.md: Actor, Authorization section
  |     +---> api-contract.md: Authentication section
  |     +---> test-spec.md: Auth test cases
  |
  +-- api_endpoints (APIEndpoint nodes)
  |     props: id, method, path, description, request_body, response_body
  |     |
  |     +---> api-contract.md: Endpoints table, Request/Response schemas
  |     +---> task-be.md: API Endpoints to implement
  |     +---> task-fe.md: API calls to consume
  |     +---> impl-brief.md: Route + controller + service steps
  |     +---> impl-brief-fe.md: API hook / fetch implementation
  |
  +-- enumerations / enum_values
  |     props: id, name, value, description
  |     |
  |     +---> api-contract.md: Shared Types (enum definitions)
  |     +---> task-fe.md: Dropdown/select options
  |     +---> task-be.md: Enum validation
  |
  +-- screens (Screen/ScreenState/ScreenEvent/Transition/ScreenEffect, when the UC has adopted the machine layer)
  |     props: route, renders_form; state_kind, event_kind, guard, effect_kind (+ effect targets)
  |     |
  |     +---> task-fe.md: Screen State Machine section (transition table per screen)
  |     +---> test-spec-fe.md: each transition exercised at least once (cross-link slice ids)
  |
  +-- slices (Slice nodes, when the UC has adopted them)
  |     props: id, name, slice_kind, given, when, then (+ covers, calls)
  |     |
  |     +---> task-be.md: Behavior Slices section (CALLS-anchored scenarios)
  |     +---> task-fe.md: Behavior Slices section (COVERS-anchored scenarios)
  |     +---> acceptance.md: Behavior Slices table (all)
  |     +---> test-spec*.md: test cases reference the slice ids they exercise
  |
  +-- domain errors (DomainError nodes, when the UC has adopted the taxonomy)
  |     props: code, error_kind, http_status, retryable (+ raised_by, handled_by)
  |     |
  |     +---> task-be.md: Domain Errors section (the envelope contract per endpoint)
  |     +---> task-fe.md: Domain Errors section (handling table: state x error x presentation)
  |     +---> acceptance.md: Domain Errors table (both halves)
  |     +---> test-spec*.md: each error code covered at least once
  |
  +-- resilience (CachePolicy / DegradationRule nodes, when the UC has adopted the layer)
        props: storage_kind, invalidation_kind, ttl_seconds, serves_stale;
               trigger_kind, fallback_kind, behavior (+ on_errors, degrades_to)
        |
        +---> task-be.md: Cache & Degradation section (cache contract + backend rules)
        +---> task-fe.md: Cache & Degradation section (handling table + client caches)
        +---> acceptance.md: Cache & Degradation table (both halves)
        +---> test-spec*.md: each degradation rule covered at least once
```

### Task File Directory Structure

```
.tl/
+-- master-plan.md
+-- changelog.md
+-- status.json
+-- .gitignore
+-- tasks/
    +-- UC001/
    |   +-- task-be.md
    |   +-- task-fe.md
    |   +-- test-spec.md
    |   +-- test-spec-fe.md
    |   +-- impl-brief.md
    |   +-- impl-brief-fe.md
    |   +-- acceptance.md
    |   +-- api-contract.md
    +-- UC002/
    |   +-- (same 8 files)
    +-- TECH-001/
    |   +-- task.md
    |   +-- test-spec.md
    |   +-- impl-brief.md
    +-- TECH-002/
        +-- (same 3 files)
```

### File Generation Order per UC

For each UC, generate files in this order:

1. **api-contract.md** -- defines shared types and endpoints (uses: `api_endpoints`, `domain_attributes`, `domain_entities`, `form_fields`, `roles`, `enumerations`)
2. **task-be.md** -- backend task (uses: `uc`, `activity_steps` [system], `domain_entities`, `domain_attributes`, `requirements`, `roles`, `api_endpoints`)
3. **task-fe.md** -- frontend task (uses: `uc`, `activity_steps` [user], `forms`, `form_fields`, `domain_entities`, `requirements`, `api_endpoints`)
4. **test-spec.md** -- backend tests (uses: `activity_steps` [system], `requirements`, `domain_attributes`, `api_endpoints`, `roles`)
5. **test-spec-fe.md** -- frontend tests (uses: `activity_steps` [user], `forms`, `form_fields`, `requirements`)
6. **impl-brief.md** -- Backend implementation plan. Structure: 1) Entities/models to create (from `domain_entities`, `domain_attributes`), 2) Services/repositories (from `activity_steps` [system]), 3) API controllers (from `api_endpoints`), 4) Validation logic (from `requirements` [validation type]), 5) Integration points (from cross-UC edges). Derived from: DomainEntity attributes, APIEndpoints, Requirements. (uses: `activity_steps` [system], `domain_entities`, `domain_attributes`, `api_endpoints`, `requirements`)
7. **impl-brief-fe.md** -- Frontend implementation plan. Structure: 1) Pages/routes (from `activity_steps` [user]), 2) Components hierarchy (from `forms`, `form_fields`), 3) API client hooks (from `api_endpoints`), 4) State management (from `domain_entities`), 5) Form validation (from `requirements` [validation type], `form_fields` [required]). Derived from: Forms, FormFields, Components, MAPS_TO mapping. (uses: `activity_steps` [user], `forms`, `form_fields`, `domain_entities`, `api_endpoints`)
8. **acceptance.md** -- shared acceptance criteria (uses: `uc`, `requirements`)

### Splitting Activity Steps by Layer

ActivityStep nodes have a `step_type` property (or infer from `description`):

| step_type / Pattern | Target File | Layer |
|---------------------|-------------|-------|
| `system` / "System validates...", "System saves...", "System calculates..." | `task-be.md` | BE |
| `user` / "User clicks...", "User fills...", "System displays..." | `task-fe.md` | FE |
| `api` / "System sends request...", "API returns..." | `api-contract.md` | Shared |

If `step_type` is not set, infer from the description text:
- "System validates/saves/calculates/checks/sends notification" --> BE
- "User clicks/fills/navigates/selects", "System displays/shows" --> FE
- "System sends request to API/receives data" --> Shared

### Key Principle: Self-Sufficiency

**CRITICAL**: Task files must be **self-sufficient**. Dev agents (`nacl-tl-dev-be`, `nacl-tl-dev-fe`) must NOT query Neo4j or read SA docs during development. ALL information from the graph subquery must be embedded into the task files.

**DO**: Embed content from the query result

```markdown
## Context Extract

### Entity: Order
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| number | String | Yes | Auto-generated ORD-YYYYMMDD-NNNN |
| status | OrderStatus | Yes | Current order status |
| total | Decimal | Yes | Order total amount |
```

**DON'T**: Leave references

```markdown
## Context
Query Neo4j for DomainEntity:Order attributes
```

---

## Phase 4: Master Plan

### Step 4.1: Generate master-plan.md

```markdown
# Master Plan -- {Project Name}

**Generated:** {date}
**Source:** Neo4j graph (nacl-tl-plan)
**Modules:** {module count}
**Use Cases:** {uc count}

## Module Structure

| Module | UCs | Entities | Description |
|--------|-----|----------|-------------|
| {from Step 1.2 results} |

## Task List

### UC Tasks

| UC ID | Title | Priority | Module | BE Wave | FE Wave | Depends On |
|-------|-------|----------|--------|---------|---------|------------|
| {from wave planning} |

### TECH Tasks

| Task ID | Title | Category | Wave |
|---------|-------|----------|------|
| TECH-001 | Docker Compose Setup | infra | 0 |
| ... |

## Execution Waves

### Wave 0: Infrastructure
| Task | Title | Agent | Est. |
|------|-------|-------|------|
| TECH-001 | Docker Compose Setup | nacl-tl-dev | 1h |
| ... |

### Wave 1: Core Backend
| Task | Title | Agent | Depends On |
|------|-------|-------|------------|
| UC001-BE | {title} API | nacl-tl-dev-be | TECH-001, TECH-003 |
| ... |

### Wave 2: Core Frontend + Dependent Backend
| Task | Title | Agent | Depends On |
|------|-------|-------|------------|
| UC001-FE | {title} Form | nacl-tl-dev-fe | UC001-BE |
| ... |

## Critical Path

{Identify the longest dependency chain}

## Open Questions

{Any issues found during planning}

## Next Task

Start with Wave 0: `TECH-001 [{title}]`
Run: `/nacl-tl-dev TECH-001`
```

### Step 4.2: Generate status.json

```json
{
  "project": "{Project Name}",
  "created": "{ISO date}",
  "updated": "{ISO date}",
  "source": "nacl-tl-plan",
  "summary": {
    "total_uc": 0,
    "total_tech": 0,
    "pending": 0,
    "in_progress": 0,
    "ready_for_review": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0
  },
  "waves": {
    "total": 0,
    "current": 0
  },
  "tasks": []
}
```

**UC task entry format:**

```json
{
  "id": "UC001",
  "title": "Create Order",
  "type": "uc",
  "phases": {
    "be": { "status": "pending" },
    "fe": { "status": "pending" },
    "sync": { "status": "pending" },
    "review-be": { "status": "pending" },
    "review-fe": { "status": "pending" },
    "qa": { "status": "pending" }
  },
  "wave": 1,
  "priority": "high",
  "blockers": [],
  "blocks": []
}
```

**TECH task entry format:**

```json
{
  "id": "TECH-001",
  "title": "Docker Compose Setup",
  "type": "tech",
  "status": "pending",
  "wave": 0,
  "priority": "high",
  "blockers": [],
  "blocks": []
}
```

### Step 4.3: Generate changelog.md

```markdown
# Changelog

## [PLAN] {date}

- Created development plan from Neo4j graph (nacl-tl-plan)
- Generated N UC tasks (BE + FE pairs) + M TECH tasks
- Defined K execution waves
- API contracts created for all UCs
- Source: Neo4j SA layer ({node count} nodes, {edge count} edges)
```

### Step 4.4: Create .tl/.gitignore

```
qa-screenshots/
```

---

## TECH Task Generation

For TECH tasks (Wave 0), create 3 files per task in `.tl/tasks/TECH-###/`:

| File | Purpose |
|------|---------|
| `task.md` | What to configure/create (single file, NOT task-be/task-fe) |
| `test-spec.md` | Verification tests (if applicable) |
| `impl-brief.md` | How to implement |

TECH tasks do NOT have `task-be.md` or `task-fe.md` -- they use a single `task.md`.

---

## Reference Documents

Load these for detailed task file format guidelines:

| Task | Reference |
|------|-----------|
| Task file format | `nacl-tl-core/references/task-file-format.md` |
| API contract rules | `nacl-tl-core/references/api-contract-rules.md` |
| Frontend rules | `nacl-tl-core/references/frontend-rules.md` |
| FE code style | `nacl-tl-core/references/fe-code-style.md` |
| Dev environment | `nacl-tl-core/references/dev-environment.md` |

## Templates

Use templates from `nacl-tl-core/templates/` for consistent output:

### UC Task Templates

| Template | Target File |
|----------|-------------|
| `task-be-template.md` | `task-be.md` |
| `task-fe-template.md` | `task-fe.md` |
| `test-spec-template.md` | `test-spec.md` |
| `test-spec-fe-template.md` | `test-spec-fe.md` |
| `impl-brief-template.md` | `impl-brief.md` |
| `impl-brief-fe-template.md` | `impl-brief-fe.md` |
| `acceptance-template.md` | `acceptance.md` |
| `api-contract-template.md` | `api-contract.md` |

### TECH Task Templates

| Template | Target File |
|----------|-------------|
| `tech-task-template.md` | `task.md` |
| `test-spec-template.md` | `test-spec.md` |
| `impl-brief-template.md` | `impl-brief.md` |

---

## Error Handling

### Neo4j connection failure

If `mcp__neo4j__read-cypher` fails:
1. Connection: read from config.yaml graph section (see nacl-core/SKILL.md → Graph Config Resolution). MCP tools handle the connection automatically.
2. Suggest user verify Neo4j is running.
3. Abort planning with a clear error message.

### Empty graph

If pre-flight returns zero SA nodes:
1. STOP immediately.
2. Emit headline `PLAN HALTED — NO_SA_DATA` (see Output Summary).
3. Report: "SA layer is empty. Run `/nacl-sa-architect` or `/nacl-sa-domain` to populate it."
4. Do NOT create any TL nodes or task files.

### Missing UC data

If `sa_uc_full_context` returns a UC with no activity steps or no requirements,
the plan is partial — task files are generated with available information,
but the headline is `PLAN APPLIED — PARTIAL (incomplete SA inputs)` and the
final report explicitly lists every UC and the missing input(s):

1. Create task files with available information.
2. Add note in impl-brief: "Activity steps pending" or "Requirements pending".
3. Set task priority to low until resolved.
4. Add to blockers in status.json under `partial_inputs:` with structure:
   ```json
   {
     "partial_inputs": [
       {
         "uc_id": "UC###",
         "missing": ["activity_steps", "requirements"]
       }
     ]
   }
   ```
5. Surface the partial set in the Output Summary `Missing SA inputs:` section
   so the operator can decide whether to resume SA work before dev starts.

### Circular dependencies

If topological sort detects a cycle:
1. Run the circular dependency check:
```cypher
MATCH path = (uc:UseCase)-[:DEPENDS_ON*1..10]->(uc)
RETURN uc.id, [n IN nodes(path) | n.id] AS cycle
LIMIT 5
```
2. Report the cycle and ask user to resolve it.
3. Do NOT proceed with wave planning until cycles are resolved.

### Incremental planning conflicts

If Task/Wave nodes already exist, the **default is incremental** (Step 1.5b):
regenerate only the UCs whose `spec_version > planned_from_version`, or that an
FR marked `modified`, or that carry a `stale` flag — leaving every other UC's
tasks and in-progress dev state untouched. `MERGE`-by-id makes this safe to
re-run; no duplicate Task nodes.

Full overwrite is opt-in via `--overwrite` only (it destroys in-progress dev
state and re-bakes every snapshot):
```cypher
// ONLY when the user passed --overwrite
MATCH (n) WHERE n:Task OR n:Wave DETACH DELETE n
```

---

## Reads / Writes

### Reads (Neo4j -- via mcp__neo4j__read-cypher)

```yaml
# SA layer nodes:
- Module, UseCase, ActivityStep, DomainEntity, DomainAttribute
- Enumeration, EnumValue, Form, FormField
- Requirement, SystemRole, Component, APIEndpoint
- ExternalContract (consumed by Step 1.6 External Contracts Gate)

# SA layer edges:
- CONTAINS_UC, CONTAINS_ENTITY, HAS_STEP, USES_FORM, HAS_FIELD
- MAPS_TO, HAS_ATTRIBUTE, HAS_REQUIREMENT, DEPENDS_ON, ACTOR
- HAS_ENUM, HAS_VALUE, EXPOSES, RELATES_TO
- DEPENDS_ON_EXTERNAL, REQUIRES_EXTERNAL (Step 1.6)
- INCLUDES_UC {kind} (FeatureRequest scope for --feature, Step 1.5b)

# Change-tracking reads (Step 1.5b incremental detection):
- UseCase.spec_version, Task.planned_from_version, *.review_status

# TL layer nodes (for incremental check):
- Task, Wave

# Key named queries (graph-infra/queries/):
- sa_uc_full_context (sa-queries.cypher)
- sa_uc_dependencies (sa-queries.cypher)
- sa_module_overview (sa-queries.cypher)
- tl_uc_task_context (tl-queries.cypher)

# Filesystem reads (Step 1.6 External Contracts Gate):
- .tl/external-contracts/<slug>.md  (per ExternalContract.file_path)
```

### Writes (Neo4j -- via mcp__neo4j__write-cypher)

```yaml
# TL layer nodes created (MERGE by id — idempotent, no duplicates):
- Wave (id, number, name, status)
- Task (id, title, type, status, wave, agent, planned_from_version)

# Change-tracking writes:
- Task.planned_from_version := source UseCase.spec_version (on every regen)
- REMOVE review_status/stale_* on regenerated Task and its source UseCase (clears L8 staleness)

# TL layer edges created:
- (Task)-[:IN_WAVE]->(Wave)
- (Task)-[:DEPENDS_ON]->(Task)
- (UseCase)-[:GENERATES]->(Task)
- (Task)-[:IMPLEMENTS]->(APIEndpoint)
```

### Writes (Filesystem)

```yaml
# Files created:
- .tl/master-plan.md
- .tl/changelog.md
- .tl/status.json
- .tl/.gitignore
- .tl/tasks/UC###/task-be.md (per UC)
- .tl/tasks/UC###/task-fe.md (per UC)
- .tl/tasks/UC###/test-spec.md (per UC)
- .tl/tasks/UC###/test-spec-fe.md (per UC)
- .tl/tasks/UC###/impl-brief.md (per UC)
- .tl/tasks/UC###/impl-brief-fe.md (per UC)
- .tl/tasks/UC###/acceptance.md (per UC)
- .tl/tasks/UC###/api-contract.md (per UC)
- .tl/tasks/TECH-###/task.md (per TECH)
- .tl/tasks/TECH-###/test-spec.md (per TECH)
- .tl/tasks/TECH-###/impl-brief.md (per TECH)
```

---

## Output Summary

After completion, display one of the following headers — first matching
condition wins. The `Status:` line is the authoritative classifier; the
headline is decoration. Headlines align with the six-status vocabulary used
by `nacl-tl-fix`.

### Planning status contract

| Headline | Status | When |
|----------|--------|------|
| `PLAN COMPLETE` | `PASS` | Every UC has activity steps AND requirements; no TL nodes pre-existed (or overwrite was confirmed); External Contracts Gate (Step 1.6) passes for every UC; all task files generated. |
| `PLAN APPLIED — PARTIAL (incomplete SA inputs)` | `UNVERIFIED` | At least one UC has missing activity steps or requirements. Task files were generated; impl-brief notes pending; `partial_inputs` recorded in `status.json`. |
| `PLAN HALTED — NO_SA_DATA` | `BLOCKED` | Pre-flight returned zero SA nodes. No TL nodes or task files created. |
| `PLAN HALTED — EXTERNAL_CONTRACT_MISSING` | `BLOCKED` (workflow detail `external-contract-missing`) | At least one UC in scope references an `ExternalContract` whose `.tl/external-contracts/<slug>.md` is absent on disk. Step 1.6 lists every `(uc_id, contract_name, expected_path)` triple. No TL nodes or task files created. |
| `PLAN HALTED — EXTERNAL_CONTRACT_STUB` | `BLOCKED` (workflow detail `external-contract-stub`) | At least one referenced contract file exists but has empty or "TBD" required sections (1–8, 10, 11; plus 9 for providers; plus 7 unless explicitly "N/A"). Step 1.6 lists every `(uc_id, contract_name, missing_sections)` triple. No TL nodes or task files created. |

---

**All UCs fully specified:**

```
PLAN COMPLETE

Status: PASS
Project: [Name]
Source: Neo4j SA layer ({N} nodes queried)
Tasks: {N} UC tasks + {M} TECH tasks
  BE tasks: {N} (one per UC)
  FE tasks: {N} (one per UC)
  TECH tasks: {M}
  API Contracts: {N} (one per UC)
Execution Waves: {K} waves
Dependencies: Mapped in graph (Task DEPENDS_ON Task)

Wave 0: TECH-001, TECH-002, TECH-003
Wave 1: UC001-BE, UC002-BE
Wave 2: UC001-FE, UC003-BE
Wave 3: UC002-FE, UC003-FE
...

Next task: TECH-001 [Docker Compose Setup]

Run: /nacl-tl-dev TECH-001 to start infrastructure setup
Run: /nacl-tl-status to see progress
```

---

**Some UCs missing activity steps or requirements:**

```
PLAN APPLIED — PARTIAL (incomplete SA inputs)

Status: UNVERIFIED
Project: [Name]
Source: Neo4j SA layer ({N} nodes queried)
Tasks generated with available information.

Missing SA inputs:
  - UC037 — activity steps pending
  - UC042 — requirements pending
  - UC051 — activity steps pending, requirements pending

Action required: complete SA inputs (`/nacl-sa-uc UC###` /
`/nacl-sa-architect`) before development starts. Tasks for the listed UCs
are de-prioritised in `status.json`.

Re-run /nacl-tl-plan after the SA layer is complete to upgrade to PLAN COMPLETE.
```

---

**Pre-flight returned zero SA nodes:**

```
PLAN HALTED — NO_SA_DATA

Status: BLOCKED
Project: [Name]
Source: Neo4j SA layer (0 nodes)

Cannot plan: SA layer is empty.
No TL nodes or task files were created.

Run: /nacl-sa-architect or /nacl-sa-domain to populate the SA layer.
Then re-run /nacl-tl-plan.
```

---

**External Contracts Gate refused (Step 1.6) — contract file absent:**

```
PLAN HALTED — EXTERNAL_CONTRACT_MISSING

Status: BLOCKED
Workflow detail: external-contract-missing
Project: [Name]
Source: Neo4j SA layer ({N} UCs queried)

Missing external-contract files:
  UC300 → ext-kie (kie.ai, provider) — expected .tl/external-contracts/kie.md
  UC100 → ext-tus (TUS upload, protocol) — expected .tl/external-contracts/tus.md
  ...

No TL nodes or task files were created.

Remedy:
  1. Run /nacl-sa-architect; complete the External Contracts phase
     for every missing contract.
  2. OR file a signed exception under the W4 schema covering every
     (uc_id, contract_id) tuple listed above.
Then re-run /nacl-tl-plan.
```

---

**External Contracts Gate refused (Step 1.6) — contract file present but stub:**

```
PLAN HALTED — EXTERNAL_CONTRACT_STUB

Status: BLOCKED
Workflow detail: external-contract-stub
Project: [Name]
Source: Neo4j SA layer ({N} UCs queried)

Stub external-contract files:
  UC300 → ext-kie (.tl/external-contracts/kie.md)
    missing required sections: [9 Model namespace, 10 Fixture-test path]
  ...

No TL nodes or task files were created.

Remedy:
  1. Complete the listed sections of each contract file.
  2. OR file a signed exception under the W4 schema covering every
     (uc_id, contract_id) tuple listed above.
Then re-run /nacl-tl-plan.
```

---

## Quality Checklist

Before completing, verify:

### External Contracts Gate (Step 1.6)
- [ ] Every UC in scope has been queried for `REQUIRES_EXTERNAL` and (via its Module) `DEPENDS_ON_EXTERNAL` edges
- [ ] Every referenced `ExternalContract.file_path` exists on disk
- [ ] Every contract file has required sections 1–8, 10, 11 filled (non-stub)
- [ ] Provider contracts (`kind == 'provider'`) also have section 9 (Model namespace) filled
- [ ] Section 7 (File URL reachability) is filled OR explicitly "N/A — no file URLs"
- [ ] No inline `--skip-external-contract` flag was used (does not exist)
- [ ] Any signed exceptions cover every `(uc_id, contract_id)` violation tuple

### Task files
- [ ] Every UC has exactly 8 files (task-be, task-fe, test-spec, test-spec-fe, impl-brief, impl-brief-fe, acceptance, api-contract)
- [ ] Every TECH task has 2-3 files (task, impl-brief, optionally test-spec)
- [ ] All task-be.md files have complete frontmatter with `depends_on` and `blocks`
- [ ] All task-fe.md files reference `api-contract.md` for endpoints
- [ ] All api-contract.md files have Shared Types, Endpoints, Errors, and Authentication
- [ ] No task file contains external references (e.g., "see docs/..." or "query Neo4j for...") -- all content is embedded

### Wave planning
- [ ] Wave 0 contains only TECH tasks
- [ ] No FE task is in an earlier wave than its corresponding BE task
- [ ] Dependencies match graph DEPENDS_ON edges
- [ ] master-plan.md has Execution Waves with correct dependency ordering
- [ ] status.json has entries for all UC and TECH tasks with correct wave assignments

### Graph state
- [ ] Wave nodes created in Neo4j
- [ ] Task nodes created in Neo4j with correct IN_WAVE edges
- [ ] GENERATES edges connect UseCases to Tasks
- [ ] DEPENDS_ON edges connect dependent Tasks

### Tracking files
- [ ] .tl/.gitignore exists with `qa-screenshots/`
- [ ] changelog.md has initial PLAN entry noting Neo4j as source
- [ ] status.json matches the wave plan

---

## Next Steps

After planning:

- `/nacl-tl-dev TECH###` -- Start TECH task development (Wave 0 first)
- `/nacl-tl-dev-be UC###` -- Start backend development for a UC
- `/nacl-tl-dev-fe UC###` -- Start frontend development for a UC
- `/nacl-tl-status` -- View project progress (waves, tasks, stubs)
- `/nacl-tl-next` -- Get next suggested task based on wave and dependencies

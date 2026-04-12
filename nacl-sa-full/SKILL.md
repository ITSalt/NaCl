---
name: nacl-sa-full
model: opus
effort: high
description: |
  Full SA specification in Neo4j via 10-phase orchestration.
  Chains all nacl-sa-* skills with user confirmation gates.Use when: create complete SA spec with graph, or the user says "/nacl-sa-full".
---

# /nacl-sa-full --- Full SA Specification (Graph Orchestrator)

## Purpose

Create a complete SA specification (technical spec / PRD) stored as a Neo4j graph through sequential invocation of 10 specialized graph skills. Each skill writes nodes and relationships to Neo4j --- no markdown files are produced (except at the optional publish phase). The result is a fully connected graph of modules, domain entities, roles, use cases, forms, requirements, and UI components, validated for internal consistency and ready for TL handoff.

The orchestration pattern is identical; only the storage backend changes (Neo4j graph instead of docs/ files).

---

## Architecture

nacl-sa-full is an **orchestrator** that manages invocation of specialized graph SA agents in the correct order. It does NOT execute phases itself --- it delegates each phase to a dedicated skill via a Task agent (sub-agent with isolated context).

**Key principle:** facts come from the user, construction is done by the agent, confirmation is done by the user (same autonomy principle as sa-full).

---

## Delegation Mechanism

Each phase is executed via a **Task agent** (sub-agent with separate context --- Tool: Task). This is critical: each phase generates substantial graph writes, and running them inline would exhaust L0 context by Phase 3-4.

**Pattern for each phase:**

1. L0 announces: "Starting Phase N: [name]..."
2. L0 launches: `Launch Task agent: /nacl-sa-[skill] [mode]`
3. Task agent does all work, writes to Neo4j, returns brief summary
4. L0 receives summary, updates progress tracker
5. L0 shows result to user and requests confirmation
6. User confirms -> L0 launches next Task agent

**If a phase fails:**

1. L0 shows the error message to the user
2. L0 asks: "Retry this phase, or skip and continue?"
3. If retry -> re-launch the same Task agent
4. If skip -> record as skipped in progress, move to next phase

**L0 does only:** queries graph for resume state, launches Task agents, shows gates, tracks progress.
**L0 does NOT:** read source documents, generate graph data, run Cypher writes --- all of this is done by Task agents.

---

## Workflow

```
+--------------+    +--------------+    +--------------+
| Phase 1      |    | Phase 2      |    | Phase 3      |
| nacl-sa-    |    | nacl-sa-    |    | nacl-sa-    |
| architect    |--->| domain       |--->| roles        |
| (modules,    |    | (per module) |    | (role model, |
|  Context Map,|    |              |    |  permissions)|
|  NFR)        |    |              |    |              |
+--------------+    +--------------+    +--------------+
                                               |
      +----------------------------------------+
      v
+--------------+    +--------------+    +--------------+
| Phase 4      |    | Phase 5      |    | Phase 6      |
| nacl-sa-    |    | nacl-sa-    |    | nacl-sa-    |
| uc stories   |--->| uc detail    |--->| ui           |
| (UC registry |    | (per Primary |    | (verify,     |
|  + stories)  |    |  UC, seq.)   |    |  components, |
|              |    |              |    |  navigation) |
+--------------+    +--------------+    +--------------+
                                               |
      +----------------------------------------+
      v
+--------------+    +--------------+    +--------------+
| Phase 7      |    | Phase 8      |    | Phase 9      |
| nacl-sa-    |    | nacl-sa-    |    | nacl-publish|
| validate     |--->| finalize     |--->| docmost      |
| (L1-L6 +     |    | (statistics, |    | (optional)   |
|  XL6-XL9)   |    |  ADR,        |    |              |
|              |    |  readiness)  |    |              |
+--------------+    +--------------+    +--------------+
                                               |
      +----------------------------------------+
      v
+--------------+
| Phase 10     |
| nacl-tl-plan|
| (optional)   |
+--------------+
```

Each phase ends with user confirmation before proceeding to the next.

---

## Neo4j Tools

| Tool | Purpose |
|---|---|
| `mcp__neo4j__read-cypher` | Read-only queries (resume detection, progress checks) |
| `mcp__neo4j__write-cypher` | Not used by L0 directly --- all writes delegated to Task agents |
| `mcp__neo4j__get-schema` | Schema introspection if needed |

Connection details are in `nacl-core/SKILL.md`.

---

## Resume Detection

When starting, query the graph to detect which phases have already been completed. This allows resuming an interrupted orchestration without re-running completed phases.

```cypher
// Phase 1: Module exists?
OPTIONAL MATCH (m:Module)
WITH count(m) > 0 AS phase1

// Phase 2: DomainEntity exists?
OPTIONAL MATCH (de:DomainEntity)
WITH phase1,
     count(de) > 0 AS phase2

// Phase 3: SystemRole exists?
OPTIONAL MATCH (sr:SystemRole)
WITH phase1, phase2,
     count(sr) > 0 AS phase3

// Phase 4: UseCase with user_story exists?
OPTIONAL MATCH (uc:UseCase)
WHERE uc.user_story IS NOT NULL
WITH phase1, phase2, phase3,
     count(uc) > 0 AS phase4

// Phase 5: UseCase with detail_status='complete' exists?
OPTIONAL MATCH (uc2:UseCase {detail_status: 'complete'})
WITH phase1, phase2, phase3, phase4,
     count(uc2) > 0 AS phase5

// Phase 6: Component exists?
OPTIONAL MATCH (c:Component)
WITH phase1, phase2, phase3, phase4, phase5,
     count(c) > 0 AS phase6

// Phase 7: SA ValidationReport exists?
OPTIONAL MATCH (vr:ValidationReport {layer: 'SA'})
WITH phase1, phase2, phase3, phase4, phase5, phase6,
     count(vr) > 0 AS phase7

// Phase 8: SA FinalizationReport exists?
OPTIONAL MATCH (fr:FinalizationReport {layer: 'SA'})
WITH phase1, phase2, phase3, phase4, phase5, phase6, phase7,
     count(fr) > 0 AS phase8

RETURN phase1, phase2, phase3, phase4, phase5, phase6, phase7, phase8
```

**Resume logic:**

1. Run the resume detection query
2. Find the first phase where the result is `false`
3. Show the user the detected state:
   ```
   Graph resume detection:
   - Phase 1 (architect):   DONE
   - Phase 2 (domain):      DONE
   - Phase 3 (roles):       DONE
   - Phase 4 (uc stories):  NOT STARTED  <-- resuming here
   - Phase 5-10:            NOT STARTED
   
   Continue from Phase 4?
   ```
4. After user confirmation, start from the detected phase

**Phase 2 special case:** If Phase 2 is partially complete (some modules have domain entities, others do not), detect which modules still need domain modeling:

```cypher
MATCH (m:Module)
WHERE NOT EXISTS { MATCH (m)-[:CONTAINS_ENTITY]->(:DomainEntity) }
RETURN m.id, m.name
ORDER BY m.id
```

Resume Phase 2 from the first module without domain entities.

**Phase 5 special case:** If Phase 5 is partially complete (some Primary UCs are detailed, others are not), detect which UCs still need detailing:

```cypher
MATCH (uc:UseCase {priority: 'MVP'})
WHERE uc.detail_status IS NULL OR uc.detail_status <> 'complete'
RETURN uc.id, uc.name
ORDER BY uc.id
```

Resume Phase 5 from the first Primary UC without detail_status='complete'.

---

## Phase Details

### Phase 1: Architecture -> `/nacl-sa-architect full`

**Launch:** `Launch Task agent: /nacl-sa-architect full`

**What it does:**
- Decomposes the system into modules (Bounded Contexts)
- Builds Context Map (inter-module relationships)
- Defines NFR (non-functional requirements)

**Graph nodes created:**
- `Module` (mod-NNN)
- `Requirement` (NFR-NNN) with type='NFR'
- Relationships: `DEPENDS_ON` (Module->Module), `HAS_REQUIREMENT` (Module->Requirement)

**Transition:** After user confirms module tree and Context Map -> Phase 2

---

### Phase 2: Domain Model -> `/nacl-sa-domain` (per module)

**Launch:** For each module --- a separate Task agent (sequentially):

```
Launch Task agent: /nacl-sa-domain {module_id}
```

Wait for completion and user confirmation -> next module.

**Discovery query:**

```cypher
MATCH (m:Module)
RETURN m.id, m.name
ORDER BY m.id
```

**What it does (per module):**
- Identifies domain entities within the module
- Defines attributes, types, constraints
- Establishes entity relationships (RELATES_TO)
- Creates enumerations and enum values

**Graph nodes created (per module):**
- `DomainEntity` (ent-NNN)
- `DomainAttribute` (attr-NNN)
- `Enumeration` (enum-NNN)
- `EnumValue` (ev-NNN)
- Relationships: `CONTAINS_ENTITY`, `HAS_ATTRIBUTE`, `RELATES_TO`, `HAS_ENUM`, `HAS_VALUE`

**User prompt (after each module):**

```
Domain model for {module_id} ({name}) created:
- {N} entities, {M} attributes
- {K} enumerations
- {J} inter-entity relationships

Confirm? (yes / adjust / skip)
```

**Transition:** After all modules complete -> Phase 3

---

### Phase 3: Roles -> `/nacl-sa-roles full`

**Launch:** `Launch Task agent: /nacl-sa-roles full`

**What it does:**
- Defines system roles
- Maps business roles to system roles (if BA layer exists)
- Builds permission matrix (role -> entity CRUD)

**Graph nodes created:**
- `SystemRole` (role-NNN)
- Relationships: `HAS_PERMISSION` (SystemRole->DomainEntity with crud property), `MAPPED_TO` (BusinessRole->SystemRole, if BA exists)

**Transition:** After user confirms role model and permissions -> Phase 4

---

### Phase 4: UC Stories -> `/nacl-sa-uc stories`

**Launch:** `Launch Task agent: /nacl-sa-uc stories`

**What it does:**
- Creates UC registry with User Stories and acceptance criteria
- Assigns priorities (MVP / Post-MVP / Nice-to-have)
- Links UCs to modules and actors

**Graph nodes created:**
- `UseCase` (UC-NNN) with user_story, acceptance_criteria, priority properties
- Relationships: `CONTAINS_UC` (Module->UseCase), `ACTOR` (UseCase->SystemRole)

**Transition:** After user confirms UC registry -> Phase 5

---

### Phase 5: UC Detail -> `/nacl-sa-uc detail UC-NNN` (per Primary UC, sequential)

**Launch:** For each Primary UC (priority='MVP') --- a separate Task agent (sequentially, not in parallel --- each UC may modify the domain):

```
Launch Task agent: /nacl-sa-uc detail UC-{NNN}
```

Wait for completion and user confirmation -> next UC.

**Discovery query:**

```cypher
MATCH (uc:UseCase {priority: 'MVP'})
WHERE uc.detail_status IS NULL OR uc.detail_status <> 'complete'
RETURN uc.id, uc.name
ORDER BY uc.id
```

**What it does (per UC):**
- Builds Activity Diagram (ActivityStep nodes)
- Designs forms (Form, FormField nodes)
- Maps form fields to domain attributes
- Defines functional requirements
- May add new DomainEntities/DomainAttributes discovered during detailing

**Graph nodes created (per UC):**
- `ActivityStep` (step-NNN)
- `Form` (form-NNN)
- `FormField` (field-NNN)
- `Requirement` (REQ-NNN) with type='functional'
- Relationships: `HAS_STEP`, `USES_FORM`, `HAS_FIELD`, `MAPS_TO`, `HAS_REQUIREMENT`, `DEPENDS_ON`

**User prompt (after all Primary UCs):**

```
UC detailing completed for Primary UCs:
- UC-{NNN}: {Name} (complete)
- UC-{NNN}: {Name} (complete)

Secondary UCs (not detailed):
- UC-{NNN}: {Name}
- UC-{NNN}: {Name}

Options:
1. Continue detailing Secondary UCs
2. Proceed to UI design (Phase 6)
```

**Transition:** After detailing at minimum all Primary UCs -> Phase 6

---

### Phase 6: UI -> `/nacl-sa-ui full`

**Launch:** `Launch Task agent: /nacl-sa-ui full`

**What it does:**
- Verifies form-domain mapping completeness
- Creates shared UI components
- Builds navigation structure

**Graph nodes created:**
- `Component` (comp-NNN)
- Relationships: `USED_IN` (Component->Form)

**Transition:** After user confirms UI architecture -> Phase 7

---

### Phase 7: Validation -> `/nacl-sa-validate full`

**Launch:** `Launch Task agent: /nacl-sa-validate full`

**What it does:**
- SA internal consistency checks (L1-L6):
  - L1: Module completeness (all modules have UCs and entities)
  - L2: UC completeness (all Primary UCs detailed with steps, forms, requirements)
  - L3: Domain binding (all FormFields map to DomainAttributes)
  - L4: Role coverage (all UCs have actors, all entities have permissions)
  - L5: Requirement binding (all UCs have requirements)
  - L6: Disconnected nodes (orphan detection)
- SA<->BA cross-validation (XL6-XL9, if BA layer exists):
  - XL6: WorkflowStep AUTOMATES_AS UseCase coverage
  - XL7: BusinessEntity REALIZED_AS DomainEntity coverage
  - XL8: BusinessRole MAPPED_TO SystemRole coverage
  - XL9: BusinessRule IMPLEMENTED_BY Requirement coverage

**Graph nodes created:**
- `ValidationReport` (with layer='SA')

**On errors:**
- Critical (!) --- propose fixes, apply after confirmation, re-validate affected levels
- Warnings --- record in report, proceed

**Transition:** After validation passes (0 critical errors) -> Phase 8

---

### Phase 8: Finalize -> `/nacl-sa-finalize full`

**Launch:** `Launch Task agent: /nacl-sa-finalize full`

**What it does:**
- Computes specification statistics (sa_statistics_summary query)
- Records Architecture Decision Records (ADR) as graph nodes
- Assesses readiness per module (sa_readiness_assessment query)
- Records open questions

**Graph nodes created:**
- `FinalizationReport` (with layer='SA')
- `ADR` nodes (if any decisions were made)

**Transition:** -> Phase 9 (user gate)

---

### Phase 9: Publish (optional) -> `/nacl-publish docmost`

**Launch:** `Launch Task agent: /nacl-publish docmost`

**Condition:** User confirms they want to publish.

**User prompt:**

```
SA specification is complete in Neo4j graph.

Publish to Docmost?
1. Yes, publish to Docmost (/nacl-publish docmost)
2. No, finish without publishing
```

**What it does:**
- Renders graph data as markdown via nacl-render
- Publishes pages to Docmost with correct hierarchy
- Covers: modules, domain model, roles, UC index, UC details, screens, requirements, validation report

---

### Phase 10: Handoff to TL (optional) -> `/nacl-tl-plan`

**Condition:** User wants to proceed to development.

**Actions:**

1. Check specification readiness:
   - `ValidationReport` (layer='SA') exists and has no critical errors
   - Core graph structure present: Module, DomainEntity, UseCase with detail_status='complete'

2. Show summary to user:
   ```
   SA specification ready for TL handoff.

   Artifacts: {N} modules, {M} UCs ({K} detailed), {L} entities
   Validation: {status}

   Options:
   1. /nacl-tl-plan  --- create development plan (tasks, waves, api-contracts)
   2. Stop            --- specification complete, development later
   ```

3. On option 1: `Launch Task agent: /nacl-tl-plan`

---

## Progress Tracking

After each phase, show progress to the user:

```
=== nacl-sa-full Progress ===

[########------------] 40%

- [x] Phase 1:  Architect (nacl-sa-architect)  --- {N} modules, Context Map
- [x] Phase 2:  Domain (nacl-sa-domain)         --- {N} entities, {M} attributes
- [x] Phase 3:  Roles (nacl-sa-roles)            --- {P} roles, permissions matrix
- [x] Phase 4:  UC Stories (nacl-sa-uc stories)  --- {Q} UCs registered
- [ ] Phase 5:  UC Detail (nacl-sa-uc detail)     <- next
- [ ] Phase 6:  UI (nacl-sa-ui)
- [ ] Phase 7:  Validate (nacl-sa-validate)
- [ ] Phase 8:  Finalize (nacl-sa-finalize)
- [ ] Phase 9:  Publish (nacl-publish)            (optional)
- [ ] Phase 10: TL Handoff (nacl-tl-plan)         (optional)
```

Progress bar: `[###---]` where `#` = completed phases, `-` = remaining. Width = 20 chars. Percentage = completed / 10 * 100.

---

## Confirmation Gate Format

After each phase, present a gate to the user:

```
Phase {N} complete: {phase_name}

Summary:
- {key metric 1}
- {key metric 2}

Proceed to Phase {N+1}: {next_phase_name}? (yes / redo / stop)
```

- **yes** -> launch next phase
- **redo** -> re-launch the same Task agent
- **stop** -> save progress, exit orchestration (can be resumed later)

---

## Working with Incomplete Answers

If the user cannot answer all questions within a phase:

1. Record what is known in the graph
2. Mark nodes with `status: "assumption"` where data was inferred
3. Propose reasonable assumptions with justification
4. Continue with the assumptions in mind
5. Return to open questions in Phase 7 (nacl-sa-validate) --- validation will catch gaps

---

## Graph Statistics Query

Use this query to build the progress summary and final report:

```cypher
OPTIONAL MATCH (m:Module) WITH count(m) AS modules
OPTIONAL MATCH (uc:UseCase) WITH modules, count(uc) AS ucs
OPTIONAL MATCH (uc2:UseCase {detail_status: 'complete'}) WITH modules, ucs, count(uc2) AS detailed_ucs
OPTIONAL MATCH (de:DomainEntity) WITH modules, ucs, detailed_ucs, count(de) AS entities
OPTIONAL MATCH (da:DomainAttribute) WITH modules, ucs, detailed_ucs, entities, count(da) AS attributes
OPTIONAL MATCH (f:Form) WITH modules, ucs, detailed_ucs, entities, attributes, count(f) AS forms
OPTIONAL MATCH (ff:FormField) WITH modules, ucs, detailed_ucs, entities, attributes, forms, count(ff) AS fields
OPTIONAL MATCH (sr:SystemRole) WITH modules, ucs, detailed_ucs, entities, attributes, forms, fields, count(sr) AS roles
OPTIONAL MATCH (rq:Requirement) WITH modules, ucs, detailed_ucs, entities, attributes, forms, fields, roles, count(rq) AS requirements
OPTIONAL MATCH (c:Component) WITH modules, ucs, detailed_ucs, entities, attributes, forms, fields, roles, requirements, count(c) AS components
RETURN modules, ucs, detailed_ucs, entities, attributes, forms, fields, roles, requirements, components
```

---

## Completion

After all phases (or when user stops):

1. Run the statistics query above
2. Show final summary:

```
=== nacl-sa-full Complete ===

[####################] 100%

SA specification in Neo4j graph:
- {N} modules
- {M} use cases ({K} detailed, {J} with stories only)
- {L} domain entities, {P} attributes
- {Q} forms, {R} form fields
- {S} system roles
- {T} requirements (functional + NFR)
- {U} UI components
- Validation: PASSED (0 critical errors)

Next steps:
1. /nacl-publish docmost  --- publish graph to Docmost
2. /nacl-tl-plan          --- create development plan from graph
3. Query the graph directly --- use mcp__neo4j__read-cypher
```

---

## Reads / Writes

```yaml
agent: nacl-sa-full
trigger: /nacl-sa-full
mode: orchestrator (delegates all work to Task agents)

reads:
  - Neo4j: Module, DomainEntity, SystemRole, UseCase, Component, ValidationReport, FinalizationReport (for resume detection only)

writes:
  - Neo4j: none directly (all writes delegated to sub-agents)

creates_directories: []   # No file output --- graph only

calls:
  - Phase 1:  nacl-sa-architect  (Task agent)
  - Phase 2:  nacl-sa-domain     (Task agent, per module)
  - Phase 3:  nacl-sa-roles      (Task agent)
  - Phase 4:  nacl-sa-uc stories (Task agent)
  - Phase 5:  nacl-sa-uc detail  (Task agent, per Primary UC)
  - Phase 6:  nacl-sa-ui         (Task agent)
  - Phase 7:  nacl-sa-validate   (Task agent)
  - Phase 8:  nacl-sa-finalize   (Task agent)
  - Phase 9:  nacl-publish       (Task agent, optional)
  - Phase 10: nacl-tl-plan       (Task agent, optional)
```

---

## Checklist /nacl-sa-full

### Initialization
- [ ] Resume detection query executed
- [ ] Current graph state shown to user
- [ ] Starting phase confirmed

### Orchestration
- [ ] Phase 1: nacl-sa-architect completed and confirmed
- [ ] Phase 2: nacl-sa-domain completed for all modules
- [ ] Phase 3: nacl-sa-roles completed and confirmed
- [ ] Phase 4: nacl-sa-uc stories completed and confirmed
- [ ] Phase 5: nacl-sa-uc detail completed for all Primary UCs (minimum)
- [ ] Phase 6: nacl-sa-ui completed and confirmed
- [ ] Phase 7: nacl-sa-validate passed (0 critical errors)
- [ ] Phase 8: nacl-sa-finalize completed
- [ ] Phase 9: nacl-publish executed (if user confirmed)
- [ ] Phase 10: nacl-tl-plan proposed (if user ready for development)

### Quality
- [ ] Each phase confirmed by user before proceeding
- [ ] Failed phases offered retry or skip
- [ ] Progress shown between phases
- [ ] Assumptions marked with status: "assumption" in graph nodes
- [ ] Validation passed without critical errors
- [ ] Graph statistics query returns expected counts

---
name: graph_ba_full
description: |
  Full BA model creation in Neo4j via 10-phase orchestration.
  Chains all graph_ba_* skills sequentially with user confirmation gates.
  Graph-first equivalent of ba-full.
  Use when: create complete BA model with graph, full business analysis, or the user says "/graph_ba_full".
---

# /graph_ba_full --- Full BA Model (Graph Orchestrator)

## Purpose

Create a complete business model (BA specification) stored as a Neo4j graph through sequential invocation of 10 specialized graph skills. Each skill writes nodes and relationships to Neo4j --- no markdown files are produced (except at the optional publish phase). The result is a fully connected graph of processes, workflows, entities, roles, rules, and glossary terms, validated for internal consistency and ready for SA handoff.

This is the graph-first equivalent of `/ba-full`. The orchestration pattern is identical; only the storage backend changes (Neo4j graph instead of docs/ files).

---

## Architecture

graph_ba_full is an **orchestrator** that manages invocation of specialized graph BA agents in the correct order. It does NOT execute phases itself --- it delegates each phase to a dedicated skill via a Task agent (sub-agent with isolated context).

**Key principle:** facts come from the user, construction is done by the agent, confirmation is done by the user (same autonomy principle as ba-full).

---

## Delegation Mechanism

Each phase is executed via a **Task agent** (sub-agent with separate context --- Tool: Task). This is critical: each phase generates substantial graph writes, and running them inline would exhaust L0 context by Phase 3-4.

**Pattern for each phase:**

1. L0 announces: "Starting Phase N: [name]..."
2. L0 launches: `Launch Task agent: /graph_ba_[skill] [mode]`
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
| graph_ba_    |    | graph_ba_    |    | graph_ba_    |
| context      |--->| process      |--->| workflow     |
| (scope)      |    | (map)        |    | (per BP)     |
+--------------+    +--------------+    +--------------+
                                               |
      +----------------------------------------+
      v
+--------------+    +--------------+    +--------------+
| Phase 4      |    | Phase 5      |    | Phase 6      |
| graph_ba_    |    | graph_ba_    |    | graph_ba_    |
| entities     |--->| roles        |--->| glossary     |
| (catalog)    |    | (matrix)     |    | (language)   |
+--------------+    +--------------+    +--------------+
                                               |
      +----------------------------------------+
      v
+--------------+    +--------------+    +--------------+
| Phase 7      |    | Phase 8      |    | Phase 9      |
| graph_ba_    |    | graph_ba_    |    | graph_ba_    |
| rules        |--->| validate     |--->| handoff      |
| (rules)      |    | (L1-L8)      |    | (BA->SA)     |
+--------------+    +--------------+    +--------------+
                                               |
      +----------------------------------------+
      v
+--------------+
| Phase 10     |
| graph_publish|
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

Connection details are in `graph_core/SKILL.md`.

---

## Resume Detection

When starting, query the graph to detect which phases have already been completed. This allows resuming an interrupted orchestration without re-running completed phases.

```cypher
// Phase 1: SystemContext exists?
OPTIONAL MATCH (sc:SystemContext)
WITH count(sc) > 0 AS phase1

// Phase 2: ProcessGroup / BusinessProcess exist?
OPTIONAL MATCH (gpr:ProcessGroup)
OPTIONAL MATCH (bp:BusinessProcess)
WITH phase1,
     count(gpr) > 0 AS phase2

// Phase 3: WorkflowStep exists?
OPTIONAL MATCH (ws:WorkflowStep)
WITH phase1, phase2,
     count(ws) > 0 AS phase3

// Phase 4: BusinessEntity exists?
OPTIONAL MATCH (be:BusinessEntity)
WITH phase1, phase2, phase3,
     count(be) > 0 AS phase4

// Phase 5: BusinessRole exists?
OPTIONAL MATCH (br:BusinessRole)
WITH phase1, phase2, phase3, phase4,
     count(br) > 0 AS phase5

// Phase 6: GlossaryTerm exists?
OPTIONAL MATCH (gt:GlossaryTerm)
WITH phase1, phase2, phase3, phase4, phase5,
     count(gt) > 0 AS phase6

// Phase 7: BusinessRule exists?
OPTIONAL MATCH (brq:BusinessRule)
WITH phase1, phase2, phase3, phase4, phase5, phase6,
     count(brq) > 0 AS phase7

// Phase 8: ValidationReport exists?
OPTIONAL MATCH (vr:ValidationReport)
WITH phase1, phase2, phase3, phase4, phase5, phase6, phase7,
     count(vr) > 0 AS phase8

// Phase 9: HandoffPackage exists?
OPTIONAL MATCH (hp:HandoffPackage)
WITH phase1, phase2, phase3, phase4, phase5, phase6, phase7, phase8,
     count(hp) > 0 AS phase9

RETURN phase1, phase2, phase3, phase4, phase5, phase6, phase7, phase8, phase9
```

**Resume logic:**

1. Run the resume detection query
2. Find the first phase where the result is `false`
3. Show the user the detected state:
   ```
   Graph resume detection:
   - Phase 1 (context):   DONE
   - Phase 2 (process):   DONE
   - Phase 3 (workflow):  DONE
   - Phase 4 (entities):  NOT STARTED  <-- resuming here
   - Phase 5-10:          NOT STARTED
   
   Continue from Phase 4?
   ```
4. After user confirmation, start from the detected phase

**Phase 3 special case:** If Phase 3 is partially complete (some BPs have workflows, others do not), detect which BPs still need workflows:

```cypher
MATCH (bp:BusinessProcess {has_decomposition: true})
WHERE NOT (bp)-[:HAS_WORKFLOW_STEP]->()
RETURN bp.id, bp.name
ORDER BY bp.id
```

Resume Phase 3 from the first BP without workflow steps.

---

## Phase Details

### Phase 1: System Context -> `/graph_ba_context`

**Launch:** `Launch Task agent: /graph_ba_context full`

**What it does:**
- Defines system scope (goals, boundaries, constraints)
- Identifies stakeholders and external entities
- Describes data flows
- Builds context diagram from graph

**Graph nodes created:**
- `SystemContext` (SYS-NNN)
- `Stakeholder` (STK-NN)
- `ExternalEntity` (EXT-NN)
- `DataFlow` (DFL-NNN)

**Transition:** After user confirms scope and context diagram -> Phase 2

---

### Phase 2: Business Processes -> `/graph_ba_process`

**Launch:** `Launch Task agent: /graph_ba_process full`

**What it does:**
- Defines process groups (GPR)
- Describes business processes (BP) within each group
- Establishes inter-process links
- Builds process map diagram from graph

**Graph nodes created:**
- `ProcessGroup` (GPR-NN)
- `BusinessProcess` (BP-NNN)
- Relationships: `CONTAINS`, `TRIGGERS`, `DEPENDS_ON`

**Transition:** After user confirms process map -> Phase 3

---

### Phase 3: Workflows -> `/graph_ba_workflow` (per BP with has_decomposition=true)

**Launch:** For each BP with `has_decomposition: true` --- a separate Task agent (sequentially):

```
Launch Task agent: /graph_ba_workflow BP-{NNN}
```

Wait for completion and user confirmation -> next BP.

**Discovery query:**

```cypher
MATCH (bp:BusinessProcess {has_decomposition: true})
RETURN bp.id, bp.name
ORDER BY bp.id
```

**What it does (per BP):**
- Identifies workflow steps
- Assigns stereotypes (manual, automated, semi-automated)
- Binds actors to steps
- Binds artifacts/documents to steps
- Defines decision points
- Generates workflow diagram from graph

**Graph nodes created (per BP):**
- `WorkflowStep` (BP-NNN-SNN)
- Relationships: `HAS_WORKFLOW_STEP`, `NEXT_STEP`, `HAS_ACTOR`, `HAS_ARTIFACT`, `HAS_DECISION`

**User prompt (after each workflow):**

```
Workflow for BP-{NNN} ({name}) created:
- {N} steps, {M} marked as "Automated"
- {K} business objects referenced

Confirm? (yes / adjust / skip)
```

**Transition:** After all workflows complete -> Phase 4

---

### Phase 4: Business Entities -> `/graph_ba_entities`

**Launch:** `Launch Task agent: /graph_ba_entities full`

**What it does:**
- Collects all business objects referenced in workflows
- Describes each entity: type, attributes, relationships
- Builds entity-process matrix from graph

**Graph nodes created:**
- `BusinessEntity` (OBJ-NNN)
- `EntityAttribute` (OBJ-NNN-ANN)
- `EntityState` (OBJ-NNN-STNN)
- Relationships: `HAS_ATTRIBUTE`, `HAS_STATE`, `REFERENCES`, `PRODUCES`, `CONSUMES`

**Transition:** After user confirms entity catalog and matrix -> Phase 5

---

### Phase 5: Business Roles -> `/graph_ba_roles`

**Launch:** `Launch Task agent: /graph_ba_roles full`

**What it does:**
- Collects roles from BP cards and workflow steps
- Describes each role: code, authority, responsibility area
- Builds role-process matrix from graph

**Graph nodes created:**
- `BusinessRole` (ROL-NN)
- Relationships: `HAS_ROLE`, `PERFORMS`, `OWNS`

**Transition:** After user confirms role registry and matrix -> Phase 6

---

### Phase 6: Glossary -> `/graph_ba_glossary`

**Launch:** `Launch Task agent: /graph_ba_glossary full`

**What it does:**
- Collects terms from all graph nodes (names, descriptions)
- Interactively defines each term
- Resolves synonyms and deduplicates

**Graph nodes created:**
- `GlossaryTerm` (GLO-NNN)
- Relationships: `DEFINES_TERM`, `SYNONYM_OF`

**Transition:** After user confirms glossary -> Phase 7

---

### Phase 7: Business Rules -> `/graph_ba_rules`

**Launch:** `Launch Task agent: /graph_ba_rules full`

**What it does:**
- Collects business rules from workflows and entities
- Classifies each rule (constraint, calculation, invariant, authorization)
- Links each rule to entities and/or processes

**Graph nodes created:**
- `BusinessRule` (BRQ-NNN)
- Relationships: `HAS_RULE`, `APPLIES_TO`, `CONSTRAINS`

**Transition:** After user confirms rules catalog -> Phase 8

---

### Phase 8: Validation -> `/graph_ba_validate`

**Launch:** `Launch Task agent: /graph_ba_validate internal`

**What it does:**
- 8-level internal consistency check against the graph:
  - L1: Process completeness (all GPR have BPs)
  - L2: Decomposition completeness (all BPs with has_decomposition have workflows)
  - L3: Actor binding (all workflow steps have actors)
  - L4: Document binding (all workflow steps have artifacts)
  - L5: Entity-Process matrix completeness
  - L6: Role-Process matrix completeness
  - L7: Glossary coverage (all key terms defined)
  - L8: Business rule binding (all rules linked to entities/processes)

**Graph nodes created:**
- `ValidationReport` with validation results

**On errors:**
- Critical (!) --- propose fixes, apply after confirmation, re-validate affected levels
- Warnings --- record in report, proceed

**Transition:** After validation passes (0 critical errors) -> Phase 9

---

### Phase 9: BA->SA Handoff -> `/graph_ba_handoff`

**Launch:** `Launch Task agent: /graph_ba_handoff full`

**What it does:**
- Builds 4-section traceability matrix from graph (Processes->UC, Entities->Entities, Roles->Roles, Rules->Requirements)
- Defines automation scope (all steps with stereotype "Automated" -> UC candidates)
- Proposes SA module grouping based on ProcessGroups

**Graph nodes created:**
- `HandoffPackage` with traceability data
- Relationships: `TRACES_TO` (BA->SA traceability links)

**Transition:** After user confirms traceability matrix -> Phase 10

---

### Phase 10: Publish (optional) -> `/graph_publish`

**Launch:** `Launch Task agent: /graph_publish docmost`

**Condition:** User confirms they want to publish.

**User prompt:**

```
BA model is complete in Neo4j graph.

Publish to Docmost?
1. Yes, publish to Docmost (/graph_publish docmost)
2. No, finish without publishing
```

**What it does:**
- Renders graph data as markdown via graph_render
- Publishes pages to Docmost with correct hierarchy
- Optionally generates Excalidraw boards

---

## Progress Tracking

After each phase, show progress to the user:

```
=== graph_ba_full Progress ===

[##########----------] 50%

- [x] Phase 1:  Context (graph_ba_context)     --- scope defined, {N} external entities
- [x] Phase 2:  Processes (graph_ba_process)    --- {N} groups, {M} processes
- [x] Phase 3:  Workflows (graph_ba_workflow)   --- {K} workflows
- [x] Phase 4:  Entities (graph_ba_entities)    --- {L} entities
- [x] Phase 5:  Roles (graph_ba_roles)          --- {P} roles
- [ ] Phase 6:  Glossary (graph_ba_glossary)    <- next
- [ ] Phase 7:  Rules (graph_ba_rules)
- [ ] Phase 8:  Validate (graph_ba_validate)
- [ ] Phase 9:  Handoff (graph_ba_handoff)
- [ ] Phase 10: Publish (graph_publish)         (optional)
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
5. Return to open questions in Phase 8 (graph_ba_validate) --- validation will catch gaps

---

## Graph Statistics Query

Use this query to build the progress summary and final report:

```cypher
OPTIONAL MATCH (sc:SystemContext) WITH count(sc) AS contexts
OPTIONAL MATCH (gpr:ProcessGroup) WITH contexts, count(gpr) AS groups
OPTIONAL MATCH (bp:BusinessProcess) WITH contexts, groups, count(bp) AS processes
OPTIONAL MATCH (ws:WorkflowStep) WITH contexts, groups, processes, count(ws) AS steps
OPTIONAL MATCH (be:BusinessEntity) WITH contexts, groups, processes, steps, count(be) AS entities
OPTIONAL MATCH (br:BusinessRole) WITH contexts, groups, processes, steps, entities, count(br) AS roles
OPTIONAL MATCH (gt:GlossaryTerm) WITH contexts, groups, processes, steps, entities, roles, count(gt) AS terms
OPTIONAL MATCH (brq:BusinessRule) WITH contexts, groups, processes, steps, entities, roles, terms, count(brq) AS rules
RETURN contexts, groups, processes, steps, entities, roles, terms, rules
```

---

## Completion

After all phases (or when user stops):

1. Run the statistics query above
2. Show final summary:

```
=== graph_ba_full Complete ===

[####################] 100%

BA model in Neo4j graph:
- {N} process groups, {M} business processes
- {K} workflows ({J} automated steps)
- {L} business entities
- {P} business roles
- {Q} glossary terms
- {R} business rules
- Validation: PASSED (0 critical errors)
- Traceability: {T} BA->SA trace links

Next steps:
1. /graph_publish docmost  --- publish graph to Docmost
2. /graph_sa_full          --- create SA specification from graph
3. Query the graph directly --- use mcp__neo4j__read-cypher
```

---

## Reads / Writes

```yaml
agent: graph_ba_full
trigger: /graph_ba_full
mode: orchestrator (delegates all work to Task agents)

reads:
  - Neo4j: all BA node types (for resume detection only)

writes:
  - Neo4j: none directly (all writes delegated to sub-agents)

creates_directories: []   # No file output --- graph only

calls:
  - Phase 1:  graph_ba_context   (Task agent)
  - Phase 2:  graph_ba_process   (Task agent)
  - Phase 3:  graph_ba_workflow   (Task agent, per BP)
  - Phase 4:  graph_ba_entities  (Task agent)
  - Phase 5:  graph_ba_roles     (Task agent)
  - Phase 6:  graph_ba_glossary  (Task agent)
  - Phase 7:  graph_ba_rules     (Task agent)
  - Phase 8:  graph_ba_validate  (Task agent)
  - Phase 9:  graph_ba_handoff   (Task agent)
  - Phase 10: graph_publish      (Task agent, optional)
```

---

## Checklist /graph_ba_full

### Initialization
- [ ] Resume detection query executed
- [ ] Current graph state shown to user
- [ ] Starting phase confirmed

### Orchestration
- [ ] Phase 1: graph_ba_context completed and confirmed
- [ ] Phase 2: graph_ba_process completed and confirmed
- [ ] Phase 3: graph_ba_workflow completed for all BPs with has_decomposition=true
- [ ] Phase 4: graph_ba_entities completed and confirmed
- [ ] Phase 5: graph_ba_roles completed and confirmed
- [ ] Phase 6: graph_ba_glossary completed and confirmed
- [ ] Phase 7: graph_ba_rules completed and confirmed
- [ ] Phase 8: graph_ba_validate passed (0 critical errors)
- [ ] Phase 9: graph_ba_handoff completed and confirmed
- [ ] Phase 10: graph_publish executed (if user confirmed)

### Quality
- [ ] Each phase confirmed by user before proceeding
- [ ] Failed phases offered retry or skip
- [ ] Progress shown between phases
- [ ] Assumptions marked with status: "assumption" in graph nodes
- [ ] Validation passed without critical errors
- [ ] Graph statistics query returns expected counts

[Home](../../README.md) > [Methodology](./) > BA Layer

[Русская версия](ba-layer.ru.md)

# Business Analysis Layer: From Chaos to Structure

The BA layer transforms unstructured stakeholder knowledge into a formal, queryable graph model. Fourteen skills execute a 10-phase pipeline, each phase producing specific node and edge types in a Neo4j database. The result is a complete business model -- processes, entities, roles, rules, and glossary -- that the SA layer can consume without ambiguity.

This document covers the pipeline structure, graph schema, relationship taxonomy, workflow decomposition, visual tooling, resume detection, and validation mechanics.

---

## The 10-Phase BA Pipeline

The BA pipeline runs sequentially. Each phase is a separate skill invoked by the orchestrator (`nacl-ba-full`), and each phase ends with an explicit user confirmation gate before the next one begins. The orchestrator delegates every phase to a Task agent -- a sub-agent with isolated context -- to keep token consumption bounded and prevent context overflow across phases.

| Phase | Skill | Graph Output |
|-------|-------|-------------|
| 1 | `nacl-ba-context` | SystemContext, Stakeholder, ExternalEntity, DataFlow |
| 2 | `nacl-ba-process` | ProcessGroup, BusinessProcess |
| 3 | `nacl-ba-workflow` | WorkflowStep (per each BP with `has_decomposition: true`) |
| 4 | `nacl-ba-entities` | BusinessEntity, EntityAttribute, EntityState |
| 5 | `nacl-ba-roles` | BusinessRole |
| 6 | `nacl-ba-glossary` | GlossaryTerm |
| 7 | `nacl-ba-rules` | BusinessRule |
| 8 | `nacl-ba-validate` | ValidationReport (read-only, no graph writes except report) |
| 9 | `nacl-ba-handoff` | Cross-layer edges: AUTOMATES_AS, REALIZED_AS, MAPPED_TO, IMPLEMENTED_BY |
| 10 | `nacl-publish` | Markdown + Excalidraw (optional, derivative) |

**Phase 1 -- Context** establishes the system boundary: what is in scope, what is out, who the stakeholders are, and which external systems exchange data with the target system. This frames every subsequent decision.

**Phases 2-3 -- Processes and Workflows** build the behavioral model. Phase 2 creates the process map (groups, individual processes, inter-process triggers). Phase 3 decomposes each process marked `has_decomposition: true` into a step-by-step activity diagram with 3 swimlanes.

**Phases 4-6 -- Entities, Roles, Glossary** build the structural model. Entities are the data objects that processes manipulate. Roles are the organizational actors that perform workflow steps. The glossary establishes a ubiquitous language that eliminates synonyms and ambiguity.

**Phase 7 -- Rules** captures business constraints, calculations, invariants, and authorization rules. Each rule is linked to the entities it constrains and the processes where it applies.

**Phase 8 -- Validation** runs 8 completeness and consistency checks (L1-L8) against the graph. It is strictly read-only -- it never modifies data, only reports issues with severity levels.

**Phase 9 -- Handoff** creates cross-layer edges that bridge BA and SA. These edges (AUTOMATES_AS, REALIZED_AS, MAPPED_TO, IMPLEMENTED_BY) form the traceability backbone between business requirements and system specifications.

**Phase 10 -- Publish** generates human-readable Markdown documents and optional Excalidraw boards from the graph. This output is derivative -- the graph remains the source of truth.

---

## Graph Schema: 13 Node Types

Every BA artifact is a node with a unique, monotonically incrementing ID. IDs are never reused, even after deletion -- this guarantees referential integrity across snapshots and audit trails.

```
SystemContext     SYS-NNN    (e.g., SYS-001)
Stakeholder       STK-NN     (e.g., STK-01)
ExternalEntity    EXT-NN     (e.g., EXT-01)
DataFlow          DFL-NNN    (e.g., DFL-001)
ProcessGroup      GPR-NN     (e.g., GPR-01)
BusinessProcess   BP-NNN     (e.g., BP-001)
WorkflowStep      {BP}-S{NN} (e.g., BP-001-S03)
BusinessEntity    OBJ-NNN    (e.g., OBJ-001)
EntityAttribute   {OBJ}-A{NN}(e.g., OBJ-001-A03)
EntityState       {OBJ}-ST{NN}(e.g., OBJ-001-ST02)
BusinessRole      ROL-NN     (e.g., ROL-01)
BusinessRule      BRQ-NNN    (e.g., BRQ-001)
GlossaryTerm      GLO-NNN    (e.g., GLO-001)
```

### Key properties by node type

**SystemContext** -- `goals` (list), `in_scope` (list), `out_of_scope` (list), `constraints` (list), `assumptions` (list). Defines the system boundary and framing decisions.

**Stakeholder** -- `role`, `interest`. Identifies who cares about the system and why.

**ExternalEntity** -- `type` ("User" / "ExternalSystem" / "Organization"), `description`. Actors and systems outside the boundary.

**DataFlow** -- `direction` ("IN" / "OUT" / "BOTH"), `data_description`. What crosses the system boundary and in which direction.

**ProcessGroup** -- `name`, `description`. Logical grouping of related business processes.

**BusinessProcess** -- `trigger` (what starts it), `result` (what it produces), `has_decomposition` (boolean, whether workflow steps exist), `automation_level` ("manual" / "partial" / "full"). The core behavioral unit.

**WorkflowStep** -- `function_name`, `step_number`, `stereotype` ("Бизнес-функция" / "Автоматизируется" / "Decision"), `change_marker` ("[inherited As-Is]" / "[changed]" / "[new]"). Individual steps within a process decomposition.

**BusinessEntity** -- `stereotype` ("Внешний документ" / "Бизнес-объект" / "Результат"), `has_states` (boolean). Data objects that processes read, produce, or modify.

**EntityAttribute** -- `name`, `type`. Properties of a business entity.

**EntityState** -- `name`, `description`. Discrete states an entity can occupy (e.g., "Draft", "Approved", "Archived").

**BusinessRole** -- `full_name`, `department`, `responsibilities` (list). Organizational actors who perform workflow steps.

**BusinessRule** -- `rule_type` ("constraint" / "calculation" / "invariant" / "authorization"), `formulation` (natural-language statement), `severity` ("critical" / "warning" / "info"). Constraints that govern entity behavior or process execution.

**GlossaryTerm** -- `term`, `definition`. Ubiquitous language entries that eliminate ambiguity.

---

## Relationship Types

The BA graph uses 22+ relationship types, organized into eight categories. Relationships carry the semantic weight of the model -- they express who does what, what depends on what, and what constrains what.

### Process hierarchy

| Relationship | Source | Target | Properties |
|-------------|--------|--------|------------|
| CONTAINS | ProcessGroup | BusinessProcess | -- |
| HAS_STEP | BusinessProcess | WorkflowStep | `order` |
| TRIGGERS | BusinessProcess | BusinessProcess | -- |
| CALLS_SUB | BusinessProcess | BusinessProcess | -- |

CONTAINS groups processes into logical categories. HAS_STEP links a process to its decomposed workflow. TRIGGERS captures sequential process chains (the output of one process starts another). CALLS_SUB models subprocess decomposition within a single process.

### Workflow flow

| Relationship | Source | Target | Properties |
|-------------|--------|--------|------------|
| NEXT_STEP | WorkflowStep | WorkflowStep | `label` |
| PERFORMED_BY | WorkflowStep | BusinessRole | -- |

NEXT_STEP defines the execution sequence within a workflow, including branching labels for decision points. PERFORMED_BY assigns the responsible role to each step.

### Role-process

| Relationship | Source | Target | Properties |
|-------------|--------|--------|------------|
| OWNS | BusinessRole | BusinessProcess | -- |
| PARTICIPATES_IN | BusinessRole | BusinessProcess | -- |

OWNS designates the accountable role (exactly one per process). PARTICIPATES_IN captures additional roles involved in execution.

### Entity interactions

| Relationship | Source | Target | Properties |
|-------------|--------|--------|------------|
| READS | WorkflowStep | BusinessEntity | -- |
| PRODUCES | WorkflowStep | BusinessEntity | -- |
| MODIFIES | WorkflowStep | BusinessEntity | -- |

These three edges form the entity-process matrix: which steps consume, create, or update which data objects. Full coverage (L5 validation) ensures no entity exists without being touched by at least one process.

### Entity structure

| Relationship | Source | Target | Properties |
|-------------|--------|--------|------------|
| HAS_ATTRIBUTE | BusinessEntity | EntityAttribute | -- |
| HAS_STATE | BusinessEntity | EntityState | -- |
| TRANSITIONS_TO | EntityState | EntityState | `condition` |
| RELATES_TO | BusinessEntity | BusinessEntity | `rel_type`, `cardinality` |

HAS_ATTRIBUTE and HAS_STATE define the internal structure. TRANSITIONS_TO models the state machine with guard conditions. RELATES_TO captures inter-entity associations (e.g., "Order RELATES_TO Customer" with cardinality "1:N").

### Business rules

| Relationship | Source | Target | Properties |
|-------------|--------|--------|------------|
| CONSTRAINS | BusinessRule | BusinessEntity | -- |
| APPLIES_IN | BusinessRule | BusinessProcess | -- |
| AFFECTS | BusinessRule | EntityAttribute | -- |
| APPLIES_AT_STEP | BusinessRule | WorkflowStep | -- |

Rules bind to entities (CONSTRAINS), processes (APPLIES_IN), specific attributes (AFFECTS), and individual workflow steps (APPLIES_AT_STEP). This multi-level binding ensures rules are traceable to their exact enforcement points.

### Glossary

| Relationship | Source | Target | Properties |
|-------------|--------|--------|------------|
| DEFINES | GlossaryTerm | BusinessEntity / BusinessRole / BusinessProcess | -- |
| ALIAS_OF | GlossaryTerm | GlossaryTerm | -- |

DEFINES links a term to the node it names. ALIAS_OF resolves synonyms -- if stakeholders use two words for the same concept, one term becomes the canonical form and the other points to it via ALIAS_OF.

### System context

| Relationship | Source | Target | Properties |
|-------------|--------|--------|------------|
| HAS_STAKEHOLDER | SystemContext | Stakeholder | -- |
| HAS_EXTERNAL_ENTITY | SystemContext | ExternalEntity | -- |
| HAS_FLOW | ExternalEntity | SystemContext | `direction`, `data_description` |

These edges anchor the context diagram: who interacts with the system, which external entities exist, and what data flows between them.

---

## 3-Swimlane Workflow Decomposition

The `nacl-ba-workflow` skill decomposes each business process (where `has_decomposition: true`) into a structured activity diagram organized in three vertical swimlanes.

**Left swimlane -- Performer.** Shows which BusinessRole performs each step. Every WorkflowStep has a PERFORMED_BY edge pointing to exactly one role. When the performer changes between consecutive steps, the visual representation shifts the step to a new row aligned with the new role.

**Center swimlane -- Workflow steps.** Contains the sequence of WorkflowStep nodes connected by NEXT_STEP edges. Each step has a stereotype that determines its visual shape:

- **"Бизнес-функция"** (Business function) -- a rounded rectangle. The core manual action performed by a human role.
- **"Автоматизируется"** (Automatable) -- a rectangle with a gear icon. Steps that can or will be handled by the system.
- **"Decision"** -- a diamond node representing a branching point. Outgoing NEXT_STEP edges carry `label` properties (e.g., "Approved" / "Rejected") that define the branching conditions.

Exception handling is modeled with dedicated exception nodes that branch off the main flow, ensuring error paths are explicit rather than implied.

**Right swimlane -- Documents and entities.** Shows which BusinessEntity nodes are consumed (READS), produced (PRODUCES), or modified (MODIFIES) at each step. This creates a visual CRUD matrix alongside the process flow.

### Change tracking

Each WorkflowStep carries a `change_marker` property with one of three values:

- `[inherited As-Is]` -- the step exists in the current (as-is) process and remains unchanged in the target (to-be) model.
- `[changed]` -- the step exists in the as-is model but has been modified (different performer, different entity interactions, different logic).
- `[new]` -- the step is introduced in the to-be model and has no as-is counterpart.

This three-value marker enables delta comparison between as-is and to-be states without maintaining two separate graphs. A single Cypher query can extract all changed or new steps to produce a change impact report.

---

## Visual-First Approach: Excalidraw Integration

For teams that prefer whiteboard-style collaboration, NaCl supports a visual workflow via Excalidraw boards. Three specialized skills handle the import-analyze-sync cycle.

### Import: nacl-ba-import-doc

Parses a client document (DOCX, PDF, XLSX, or plain text) and extracts business-process elements -- steps, roles, documents, decisions. The extracted elements are placed onto an Excalidraw board with 3-swimlane layout. Each element receives a confidence color based on extraction certainty:

- **Green stroke** -- high confidence. The element was clearly stated in the source document.
- **Amber stroke** -- medium confidence. The element was inferred from context but not explicitly stated.
- **Red stroke** -- low confidence. The element is a best guess that requires stakeholder validation.

### Analyze: nacl-ba-analyze

Reads the board JSON and runs 8 completeness checks: missing performers, orphan entities, disconnected steps, missing decision labels, stereotype coverage, duplicate names, and diff comparison with the last snapshot. If a Neo4j graph already exists, the analysis also diffs the board against the graph to detect divergence.

### Sync: nacl-ba-sync

Reads the board, classifies each element as new (no `nodeId`), dirty (modified since last sync), or synced (unchanged). New elements get Neo4j nodes created with fresh IDs. Dirty elements update their corresponding graph nodes. Synced elements are skipped. After successful sync, every board element receives a green stroke and its `synced` flag is set to `true`.

### Excalidraw customData contract

Every Excalidraw shape carries structured metadata in its `customData` field:

```json
{
  "nodeId": "BP-001-S03",
  "nodeType": "WorkflowStep",
  "confidence": "high",
  "sourceDoc": "process.docx",
  "sourcePage": 3,
  "synced": false
}
```

- `nodeId` -- the BA graph ID (null before first sync).
- `nodeType` -- the Neo4j label this shape maps to.
- `confidence` -- extraction confidence from the import phase.
- `sourceDoc` / `sourcePage` -- provenance tracking back to the original client document.
- `synced` -- whether this element has been written to Neo4j.

### Orchestrator: nacl-ba-from-board

The full visual pipeline is orchestrated by `nacl-ba-from-board`, which chains: board creation --> document import --> completeness analysis --> graph sync --> entity/role enrichment --> validation --> handoff. This mirrors the 10-phase `nacl-ba-full` pipeline but starts from a visual artifact rather than a conversational interview.

---

## Resume Detection

When `nacl-ba-full` starts, it does not blindly re-run all 10 phases. Instead, it queries the graph to detect which phases have already been completed:

```cypher
OPTIONAL MATCH (sc:SystemContext) WITH count(sc) > 0 AS phase1
OPTIONAL MATCH (gpr:ProcessGroup) WITH phase1, count(gpr) > 0 AS phase2
OPTIONAL MATCH (ws:WorkflowStep) WITH phase1, phase2, count(ws) > 0 AS phase3
OPTIONAL MATCH (be:BusinessEntity) WITH phase1, phase2, phase3, count(be) > 0 AS phase4
OPTIONAL MATCH (br:BusinessRole) WITH phase1, phase2, phase3, phase4, count(br) > 0 AS phase5
OPTIONAL MATCH (gt:GlossaryTerm) WITH phase1, phase2, phase3, phase4, phase5, count(gt) > 0 AS phase6
OPTIONAL MATCH (bru:BusinessRule) WITH phase1, phase2, phase3, phase4, phase5, phase6, count(bru) > 0 AS phase7
// ... through phase 9
```

The detection logic is cumulative: phase N is considered complete only if phases 1 through N-1 are also complete. This prevents false positives from partial imports or out-of-order manual edits.

If phases 1-5 are detected as complete, the orchestrator resumes from phase 6 (glossary). No work is lost, no completed phases are re-run. The user sees a summary of detected phases and confirms the resume point before execution continues.

This mechanism is essential for long-running analysis sessions. If context is lost mid-pipeline (timeout, network interruption, token exhaustion), the analyst can restart `nacl-ba-full` and pick up exactly where they left off. The graph is the checkpoint -- not conversation history.

---

## Internal Validation (L1-L8)

The `nacl-ba-validate` skill runs 8 completeness and consistency checks against the BA graph. Validation is strictly **read-only** -- it never creates, updates, or deletes nodes or edges. It only reads the graph and produces a report.

| Level | Check | Purpose |
|-------|-------|---------|
| L1 | All BP have owner (OWNS edge) | Process accountability -- every process must have exactly one responsible role |
| L2 | BP with `has_decomposition: true` has HAS_STEP edges | Workflow coverage -- declared decompositions must actually exist |
| L3 | Every WorkflowStep has PERFORMED_BY edge | Performer binding -- no step should lack a responsible role |
| L4 | EntityAttribute has valid types | Data quality -- attribute types must conform to allowed values |
| L5 | READS/PRODUCES/MODIFIES coverage | Entity-process matrix -- no orphan entities, no untouched data objects |
| L6 | Role-process matrix completeness | No orphan roles or processes -- every role participates in at least one process |
| L7 | GlossaryTerm coverage for named nodes | Ubiquitous language -- key domain concepts must have glossary entries |
| L8 | BusinessRule has CONSTRAINS or APPLIES_IN edges | Rule traceability -- every rule must bind to at least one entity or process |

### Severity levels

Each finding is classified into one of three severities:

- **CRITICAL** -- blocks handoff to the SA layer. The model has a structural gap that would propagate errors downstream. Examples: a process with no owner (L1), a decomposed process with no workflow steps (L2).
- **WARNING** -- should be fixed before handoff but does not strictly block it. Examples: a role that exists but participates in no processes (L6), an entity with no glossary term (L7).
- **INFO** -- optional improvement. The model is valid without addressing these, but fixing them improves completeness. Example: an entity attribute with a generic type that could be more specific (L4).

The validation report lists every finding grouped by level, with the specific node IDs and names that triggered each check. This makes remediation straightforward -- the analyst can navigate directly to the problematic nodes and fix them before re-running validation.

Validation runs automatically as phase 8 of `nacl-ba-full`, but it can also be invoked independently at any time via `/nacl-ba-validate`. Running it after manual graph edits catches issues before they compound.

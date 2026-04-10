[Home](../../README.md) > [Methodology](./) > Handoff

[Русская версия](handoff.ru.md)

# Cross-Layer Traceability: The Handoff Mechanism

NaCl stores business analysis (BA) and system analysis (SA) artifacts as typed nodes in a Neo4j graph. The two layers are produced by different skill sets, at different times, with different audiences in mind -- but they describe the same system. The handoff mechanism bridges them by creating cross-layer edges that link every BA artifact to its SA counterpart, establishing end-to-end traceability from a stakeholder's business process description all the way down to a developer's task file.

This document explains the edge types that form the bridge, the skill that creates them, the query that consumes them, and the statistics that measure their completeness.

---

## The Four Handoff Edge Types

Four primary edge types connect the BA and SA subgraphs. Each represents a specific transformation: a business concept becoming a system artifact.

| Edge | From (BA) | To (SA) | Meaning |
|------|-----------|---------|---------|
| `AUTOMATES_AS` | WorkflowStep | UseCase | A business step marked for automation becomes a use case |
| `REALIZED_AS` | BusinessEntity | DomainEntity | A business concept becomes a domain model entity |
| `MAPPED_TO` | BusinessRole | SystemRole | A business role becomes a system actor |
| `IMPLEMENTED_BY` | BusinessRule | Requirement | A business constraint becomes a functional requirement |

These four edges are the backbone of cross-layer traceability. Each one answers a specific question: "Where did this SA artifact come from?" or, from the BA side, "What happened to this business artifact in the system design?"

Two additional edges support finer-grained mapping:

- **`TYPED_AS`**: EntityAttribute --> DomainAttribute. Maps individual attributes from a business entity to their domain model counterparts. This is the attribute-level complement to `REALIZED_AS` -- while `REALIZED_AS` connects the entity as a whole, `TYPED_AS` connects each field, preserving data type decisions and naming transformations.

- **`SUGGESTS`**: ProcessGroup --> Module. Records the proposed decomposition of BA process groups into SA modules (bounded contexts). Unlike the four primary edges, `SUGGESTS` is advisory -- it captures the agent's proposal for how business capabilities should map to technical modules, but the user may restructure modules freely during SA design.

All six handoff edges share one critical property: they are written to the graph **only after user confirmation**. The agent proposes the mapping, presents it for review, and waits for explicit approval before creating any cross-layer edge. This follows the NaCl autonomy principle -- facts come from the user, construction from the agent, confirmation from the user. No silent graph mutations happen during handoff.

---

## BA-to-SA Handoff

The `nacl-ba-handoff` skill orchestrates the transition from a completed BA model to the beginning of SA work. It runs four phases, each with its own confirmation gate.

**Phase 1: Traceability Matrix.** The skill scans the BA subgraph across all four categories -- automated workflow steps, business entities, business roles, and business rules. For each BA node, it proposes an SA counterpart: either an existing SA node (if SA work has already begun) or a to-be-created one. The result is a structured matrix presented to the user for review.

The matrix looks like this in practice:

```
Automation Scope (WorkflowStep --> UseCase):
  BP-001-S05  "Validate and save order"    --> UC-101 (new)
  BP-001-S08  "Send order confirmation"    --> UC-102 (new)
  BP-002-S03  "Process payment"            --> UC-201 (new)

Entity Mapping (BusinessEntity --> DomainEntity):
  OBJ-001  "Order"       --> DE-Order (new)
  OBJ-002  "Customer"    --> DE-Customer (new)
  OBJ-003  "Product"     --> DE-Product (new)

Role Mapping (BusinessRole --> SystemRole):
  ROL-01  "Order Manager"    --> SR-01 OrderManager (new)
  ROL-02  "Warehouse Clerk"  --> SR-02 WarehouseClerk (new)

Rule Mapping (BusinessRule --> Requirement):
  BRQ-001  "Min 1 item per order"  --> RQ-001 (new)
  BRQ-002  "Max order total 1M"    --> RQ-002 (new)
```

The user reviews each line, confirms or adjusts, and the skill records the approved pairs for later edge creation.

**Phase 2: Automation Scope.** This phase focuses specifically on WorkflowSteps that carry the stereotype "Автоматизируется" (to be automated). Each such step is a candidate for a UseCase. The skill proposes UC names, identifiers, and brief descriptions derived from the step's context -- its parent process, the role that performs it, and the entities it touches.

This phase defines the critical boundary between manual processes and software. Steps without the automation stereotype remain purely in the BA layer -- they describe business reality but do not generate development work. Steps with the stereotype cross into SA and eventually become task files that developers implement.

**Phase 3: Module Suggestions.** The skill groups BA ProcessGroups into proposed SA Modules by analyzing which process groups share entities, roles, and data flows. It creates `SUGGESTS` edges from each ProcessGroup to its proposed Module. The user can accept the suggested grouping, merge modules, split them, or reject the suggestion entirely. Module boundaries are an architectural decision that the agent informs but does not make.

**Phase 4: Coverage Statistics.** The final phase calculates how completely the BA model maps to SA artifacts. Four percentages are computed:

- **Automation coverage**: automated steps with `AUTOMATES_AS` / total automated steps
- **Entity coverage**: entities with `REALIZED_AS` / total entities
- **Role coverage**: roles with `MAPPED_TO` / total roles
- **Rule coverage**: rules with `IMPLEMENTED_BY` / total rules

Any BA node without a corresponding SA edge is flagged as uncovered, and the skill reports the gaps. The target is full coverage before SA work begins in earnest.

The skill operates in two modes. **`full`** mode runs all four phases from scratch -- this is the first-time handoff when transitioning from BA to SA. **`update`** mode performs an incremental re-scan: it preserves all confirmed edges, proposes mappings only for new or changed BA nodes, and recalculates coverage statistics. This supports the iterative reality of real projects where the BA model evolves even after SA work has started.

---

## SA-to-TL Handoff

The SA graph feeds the TL (development) layer through the `nacl-tl-plan` skill. Unlike the BA-to-SA handoff, which creates explicit cross-layer edges, the SA-to-TL handoff works through a query-and-generate pattern: the skill reads the SA graph and produces filesystem artifacts (task files) that dev agents consume.

The key mechanism is a single Cypher query -- `sa_uc_full_context` -- that retrieves everything a developer needs for one use case in a single call:

```cypher
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_STEP]->(step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
RETURN uc, step, f, ff, da, de, rq, sr
```

This query returns the UC itself, its activity steps (the flow of operations), all forms with their fields, the domain entities and attributes those fields map to, the requirements attached to the UC, and the actor role. The response is roughly 550 tokens -- compared to the approximately 150,000 tokens an agent would consume reading the ~70 markdown files a traditional specification produces. That is a 99.6% reduction in context budget spent on planning.

From the query result, `nacl-tl-plan` generates a self-sufficient task directory for each use case:

```
.tl/tasks/UC101/
  task-be.md          # Backend scope: entities, services, routes, validations
  task-fe.md          # Frontend scope: pages, components, hooks, state
  test-spec.md        # Backend test cases derived from requirements
  test-spec-fe.md     # Frontend test cases derived from UI acceptance criteria
  impl-brief.md       # Backend implementation guide with code patterns
  impl-brief-fe.md    # Frontend implementation guide with component structure
  acceptance.md       # Acceptance criteria traceable to requirements
  api-contract.md     # API contract: endpoints, DTOs, error codes
```

Each file contains all the information a dev agent needs to implement its slice of the UC. The backend task file includes the domain entities, their attributes, the service operations, and the validation rules. The frontend task file includes the forms, their fields, the page structure, and the API calls. The API contract bridges the two.

The critical design property: dev agents read **only** these task files -- never the original SA artifacts in the graph. This means the graph can evolve (new requirements, changed entities) without breaking in-progress development. When the graph changes, `nacl-tl-plan` regenerates the affected task files, and the next development cycle picks up the updates.

---

## Coverage Statistics

The handoff system tracks what percentage of BA artifacts have been mapped to SA counterparts. This is not a vanity metric -- it is a completeness gate. Uncovered BA nodes mean either the SA design is incomplete or a deliberate decision was made to exclude something. Either way, the gap should be visible.

The coverage query lives in `graph-infra/queries/handoff-queries.cypher`:

```cypher
// handoff_coverage_stats
MATCH (ws:WorkflowStep {stereotype: "Автоматизируется"})
OPTIONAL MATCH (ws)-[:AUTOMATES_AS]->(uc:UseCase)
WITH count(ws) AS total_steps, count(uc) AS covered_steps
// ... similar for entities, roles, rules
RETURN {
  automation_pct: covered_steps * 100 / total_steps,
  entity_pct: ...,
  role_pct: ...,
  rule_pct: ...
}
```

Each category has its own coverage percentage. The target is **95% or higher** across all four categories before development begins. The remaining 5% accounts for legitimate exclusions -- business roles that interact with the system only through other roles, entities that exist purely as reference data, or rules that are enforced by business process rather than software.

Uncovered items are not silently ignored. They are surfaced by specific validation checks:

- **XL1--XL5** (BA-side cross-validation): Detect BA nodes that should have SA counterparts but do not. For example, XL1 finds WorkflowSteps with the automation stereotype that lack an `AUTOMATES_AS` edge. XL3 finds BusinessRoles that perform automated steps but have no `MAPPED_TO` edge to a SystemRole.

- **XL6--XL9** (SA-side cross-validation): Detect SA nodes that claim BA origins but have broken or missing backlinks. For example, XL6 finds UseCases with no `AUTOMATES_AS` edge coming in -- an SA artifact with no BA lineage, which may indicate a use case that was created ad hoc rather than derived from business analysis.

Together, the coverage statistics and validation checks ensure that the handoff is not just performed but verified. The graph does not just store the mapping -- it enforces it.

---

## Incremental Handoff

Real projects do not freeze their BA model the moment SA begins. Stakeholders clarify requirements, new processes are discovered, entity attributes change. The handoff mechanism supports this reality through incremental mode.

When the BA model changes after the initial handoff, the user runs `nacl-ba-handoff update`. The skill performs the following steps:

1. **Re-scan the BA subgraph.** Query all BA nodes across the four categories (steps, entities, roles, rules) and compare against the existing handoff edges.

2. **Identify new BA nodes.** Any BA node created after the last handoff -- a new WorkflowStep, a new BusinessEntity, a newly added BusinessRule -- is flagged as unmapped and proposed for mapping, just as in the initial handoff.

3. **Preserve confirmed edges.** Existing handoff edges that were confirmed by the user are never deleted or overwritten. If `OBJ-001` was mapped to `DE-Order` in the initial handoff and that mapping was confirmed, the `REALIZED_AS` edge remains untouched even if `OBJ-001`'s attributes have changed.

4. **Flag changed BA nodes.** If a BA node that already has a handoff edge has been modified (new attributes, changed stereotype, updated description), the skill flags it for review. The user decides whether the existing mapping still holds or needs adjustment. The edge is not automatically updated -- changes to confirmed mappings require explicit user action.

5. **Recalculate coverage statistics.** With new nodes in the denominator and (potentially) new edges in the numerator, the coverage percentages shift. The skill reports the updated statistics and highlights any category that has dropped below the 95% threshold.

This approach lets the specification evolve without losing established traceability. A BA change triggers a focused review of just the delta, not a full re-mapping exercise. The confirmed portion of the graph remains stable -- a property that matters when downstream SA work and even TL task files depend on those edges.

---

## End-to-End Traceability Example

To make the handoff mechanism concrete, here is a single business requirement traced through all three layers -- from a stakeholder's process description to a developer's source file.

**BA Layer** -- the business reality as described by stakeholders:

```
ProcessGroup "Order Management" (GPR-01)
  +-- BusinessProcess "Create order" (BP-001)
       +-- WorkflowStep "Validate and save order" (BP-001-S05)
       |     PERFORMED_BY --> BusinessRole "Order Manager" (ROL-01)
       |     PRODUCES     --> BusinessEntity "Order" (OBJ-001)
       |
       +-- BusinessRule "Minimum 1 item per order" (BRQ-001)
            APPLIES_TO --> BusinessProcess "Create order" (BP-001)
```

**Handoff edges** -- the cross-layer bridge created by `nacl-ba-handoff`:

```
BP-001-S05  --[AUTOMATES_AS]----> UC-101
OBJ-001     --[REALIZED_AS]-----> DE-Order
ROL-01      --[MAPPED_TO]-------> SR-01
BRQ-001     --[IMPLEMENTED_BY]--> RQ-001
```

**SA Layer** -- the system design derived from the business model:

```
Module "mod-orders"
  +-- UseCase "Create Order" (UC-101)
       ACTOR          --> SystemRole "OrderManager" (SR-01)
       USES_FORM      --> Form "FORM-OrderCreate"
       |                    +-- FormField "totalAmount"
       |                         MAPS_TO --> DomainAttribute "DE-Order-A05"
       |                              ^-- HAS_ATTRIBUTE -- DomainEntity "DE-Order"
       HAS_REQUIREMENT --> Requirement "Minimum 1 item" (RQ-001)
```

**TL Layer** -- the task files and source code produced by `nacl-tl-plan` and dev skills:

```
.tl/tasks/UC101/task-be.md  -->  src/orders/create-order.service.ts
.tl/tasks/UC101/task-fe.md  -->  src/app/orders/create/page.tsx
```

Every node in this chain traces back to its origin. The developer's `create-order.service.ts` implements UC-101, which automates BP-001-S05, which is a step in the "Create order" process owned by the Order Manager. The `totalAmount` field on the order creation form maps to `DE-Order-A05`, which realizes the `OBJ-001` business entity's attribute.

This traceability is not documentation -- it is graph structure. To find the impact of changing the "Order" entity in the BA layer, you run a single Cypher traversal:

```cypher
MATCH (be:BusinessEntity {id: "OBJ-001"})-[:REALIZED_AS]->(de:DomainEntity)
MATCH (de)<-[:HAS_ATTRIBUTE]-(da:DomainAttribute)<-[:MAPS_TO]-(ff:FormField)
MATCH (ff)<-[:HAS_FIELD]-(f:Form)<-[:USES_FORM]-(uc:UseCase)
RETURN de.name, uc.id, uc.name, f.id, ff.name
```

The query returns every use case, form, and field affected by the change. No file scanning, no guesswork, no stale cross-references. The graph knows, because the handoff edges made the relationships explicit.

Change "Order" in BA, and the graph shows exactly which UCs, forms, fields, requirements, and task files are affected -- across all three layers, in one traversal.

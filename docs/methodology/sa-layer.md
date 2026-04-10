[Home](../../README.md) > [Methodology](./) > SA Layer

[Русская версия](sa-layer.ru.md)

# System Analysis Layer: From Business to Software

The SA layer transforms business analysis artifacts into a technical specification that development agents can consume directly. It reads BA nodes from Neo4j, creates 12 new node types (modules, domain entities, use cases, forms, roles, components), and validates everything with Cypher queries before handing off to the TL layer. The result is a fully traceable, machine-readable specification -- not a collection of Word documents.

---

## The 10-Phase SA Pipeline

The SA layer runs as a 10-phase pipeline, orchestrated by `nacl-sa-full`. Each phase is delegated to a Task agent with isolated context -- the same pattern used in the BA layer. The orchestrator passes only the minimal context each agent needs, keeping token usage predictable.

| Phase | Skill | Graph Output |
|-------|-------|--------------|
| 1 | `nacl-sa-architect` | Module (Bounded Contexts), DEPENDS_ON edges, Requirement (type=nfr) |
| 2 | `nacl-sa-domain` (per module) | DomainEntity, DomainAttribute, Enumeration, EnumValue; REALIZED_AS edges from BA |
| 3 | `nacl-sa-roles` | SystemRole, HAS_PERMISSION edges; MAPPED_TO edges from BA |
| 4 | `nacl-sa-uc stories` | UseCase with user_story, acceptance_criteria, priority (MVP/Post-MVP/Nice-to-have); AUTOMATES_AS edges from BA |
| 5 | `nacl-sa-uc detail` (per Primary UC, sequential) | ActivityStep, Form, FormField, Requirement (type=functional); MAPS_TO edges |
| 6 | `nacl-sa-ui` | Component nodes, USED_IN edges; form-domain mapping verification |
| 7 | `nacl-sa-validate` | ValidationReport (layer='SA'); L1-L6 + XL6-XL9 checks |
| 8 | `nacl-sa-finalize` | FinalizationReport, ADR nodes (type='adr'); statistics, readiness |
| 9 | `nacl-publish docmost` (optional) | Markdown pages in Docmost wiki |
| 10 | `nacl-tl-plan` (optional) | Task files in `.tl/tasks/` for dev agents |

**Why Phase 5 is sequential.** UC detailing (Phase 5) runs one Primary UC at a time, in order. This is not an optimization oversight -- it is intentional. Detailing UC-101 may create new DomainEntity nodes (e.g., "OrderItem") or add attributes to existing entities. UC-102 may need to reference those new nodes. Running detailing in parallel would cause write conflicts and inconsistent domain state. Each UC detail pass sees the cumulative graph from all prior UCs.

Between phases, the orchestrator presents a brief summary and waits for user confirmation before proceeding. This gives the analyst a chance to review intermediate results and correct course without rerunning the entire pipeline.

**Phases 9 and 10 are optional.** Phase 9 (`nacl-publish docmost`) publishes the specification as Markdown pages to a Docmost wiki, making it accessible to stakeholders who do not interact with Neo4j directly. Phase 10 (`nacl-tl-plan`) bridges SA and TL by reading the finalized graph and generating task files in `.tl/tasks/` -- one per UC, with paired BE+FE subtasks and execution waves. Both phases can be skipped if the team prefers manual handoff or uses a different planning tool.

---

## Graph Schema: 12 Node Types

The SA layer introduces 12 node types into the Neo4j graph. Every node has a deterministic ID format, making it possible to reference nodes by convention rather than lookup. This is a deliberate design choice: when a development agent needs to find the form for creating an order, it can construct the ID `FORM-OrderCreate` directly instead of running a search query. Deterministic IDs also make Cypher queries shorter and merge operations idempotent.

```
Module            mod-{name}          (e.g., mod-orders)
UseCase           UC-NNN              (e.g., UC-101)
ActivityStep      UC-NNN-AS{NN}       (e.g., UC-101-AS01)
DomainEntity      DE-{Name}           (e.g., DE-Order)
DomainAttribute   {DE}-A{NN}          (e.g., DE-Order-A01)
Enumeration       ENUM-{Name}         (e.g., ENUM-OrderStatus)
EnumValue         ENUM-{Name}-V{NN}   (e.g., ENUM-OrderStatus-V01)
Form              FORM-{Name}         (e.g., FORM-OrderCreate)
FormField         FORM-{Name}-F{NN}   (e.g., FORM-OrderCreate-F01)
Requirement       RQ-NNN / NFR-NNN / ADR-NNN
SystemRole        SR-NN               (e.g., SR-01)
Component         CMP-{Name}          (e.g., CMP-DataTable)
```

### Key properties by node type

**Module** -- represents a Bounded Context in DDD terms.
- `uc_range_start`, `uc_range_end`: the UC number allocation range for this module (e.g., 100-199 for mod-orders). Prevents ID collisions across modules.
- `status`: draft, specified, or finalized.

**UseCase** -- a single unit of automated behavior.
- `user_story`: "As a [role], I want [action] so that [value]" format.
- `acceptance_criteria`: testable conditions that define "done."
- `priority`: MVP, Post-MVP, or Nice-to-have. Drives wave planning in TL.
- `detail_status`: null (not started), in-progress, or complete.

**DomainAttribute** -- a typed property of a DomainEntity.
- `data_type`: one of UUID, String, Int, Decimal, Boolean, Date, DateTime, Enum, JSON, Reference.
- `nullable`: whether the attribute allows null values.

**FormField** -- a single input on a Form.
- `field_type`: text, textarea, number, date, select, multiselect, checkbox, file, button, or table.
- `required`: whether the field is mandatory for form submission.

**SystemRole** -- a user role in the target system.
- `type`: internal (back-office users) or external (end-users, partners).
- `responsibilities`: free-text description of what this role does.

**Requirement** -- a constraint, decision, or specification item.
- `type`: functional, nfr (non-functional), assumption, adr (architecture decision record), or question.
- `priority`: MVP, Post-MVP, or Nice-to-have.
- `status`: draft, approved, or rejected.

**Component** -- a reusable UI building block.
- `component_type`: the kind of UI primitive (e.g., DataTable, Modal, Sidebar).
- Connected to Forms via USED_IN edges, enabling the UI skill to verify that every form references only components from the approved catalog.

---

## Domain Modeling from BA

The `nacl-sa-domain` skill bridges the gap between business-language entities (from BA) and technical-language entities (for development). It supports three modes of operation.

### IMPORT_BA mode

This is the primary mode during initial specification. The skill reads the BA graph and creates corresponding SA nodes:

1. **Query unlinked entities.** Find all BusinessEntity nodes that do not yet have a REALIZED_AS edge to a DomainEntity.
2. **Create DomainEntity.** For each BusinessEntity, create a DomainEntity with a PascalCase English name (e.g., "Заказ" becomes DE-Order).
3. **Import attributes.** Map each EntityAttribute to a DomainAttribute with type mapping -- business types (text, number, date) become technical types (String, Int, DateTime, etc.).
4. **Import states.** Convert each EntityState into an Enumeration node with EnumValue children (e.g., states "New", "Confirmed", "Shipped" become ENUM-OrderStatus with three values).
5. **Create traceability edges.** `BusinessEntity -[REALIZED_AS]-> DomainEntity` and `EntityAttribute -[TYPED_AS]-> DomainAttribute`.

### CREATE mode

Used when the domain model needs entities that have no BA counterpart -- technical entities like AuditLog, Session, or APIKey that emerge during system design. The analyst provides a name, attributes, and relationships; the skill creates the full node subgraph with proper IDs following the `DE-{Name}` convention.

### MODIFY mode

Incremental changes to existing entities: add attributes, rename fields, change data types, adjust relationships. This mode is invoked automatically during UC detailing (Phase 5) when a use case reveals missing domain concepts. It is also the primary mode used by `nacl-sa-feature` for incremental updates. MODIFY preserves existing REALIZED_AS and MAPS_TO edges, ensuring traceability is not broken by changes.

### Relationships between entities

DomainEntity relationships use RELATES_TO edges with two key properties:
- `rel_type`: composition (parent owns child lifecycle), association (independent entities reference each other), or dependency (one entity uses another).
- `cardinality`: 1:1, 1:N, N:1, or N:M.

```cypher
MATCH (order:DomainEntity {name: "Order"})
  -[r:RELATES_TO {rel_type: "composition", cardinality: "1:N"}]->
  (item:DomainEntity {name: "OrderItem"})
RETURN order, r, item
```

---

## Use Case Detailing

Use cases are created in two distinct phases, each with a different granularity.

### Phase 4: Stories

Phase 4 reads the BA automation scope and creates a UC registry:

1. **Identify automated steps.** Query all WorkflowStep nodes with stereotype "Автоматизируется" (to be automated).
2. **Create UseCase nodes.** Each automated step (or cluster of related steps) becomes a UseCase with a user story in the standard format: "As a [role], I want [action] so that [value]."
3. **Assign priorities.** MVP use cases form the minimum viable product. Post-MVP adds depth. Nice-to-have captures ideas that may never be built.
4. **Link to BA.** Create AUTOMATES_AS edges from WorkflowStep to UseCase, establishing full traceability from business process to system behavior.

The output is a flat registry -- UC nodes with metadata but no internal structure yet. At this point, each UC is a single node with a user story and priority. The internal structure (steps, forms, requirements) comes in Phase 5.

UC numbering follows the module allocation ranges defined in Phase 1. Module mod-orders with `uc_range_start: 100` and `uc_range_end: 199` gets UCs numbered UC-100 through UC-199. This prevents numbering collisions when modules are developed independently.

### Phase 5: Detail (sequential)

Phase 5 takes each Primary UC and breaks it into a detailed activity flow:

- **ActivityStep nodes** with ordered sequence via `HAS_STEP {order: Int}` edges. Each step represents a discrete user or system action.
- **Form nodes** with FormField children connected by `HAS_FIELD {order: Int}` edges. Each form describes a specific UI interaction surface.
- **Form-domain mapping**: every data-carrying FormField gets a `MAPS_TO` edge pointing to a DomainAttribute (see the next section).
- **Functional Requirements** as Requirement nodes attached to the UC via `HAS_REQUIREMENT` edges. Each requirement is specific to the UC and captures behavior that is not obvious from the activity steps alone -- error handling, concurrency rules, notification triggers.

Alternative and exception flows are modeled as branching ActivityStep sequences. A decision step has multiple outgoing `HAS_STEP` edges with a `condition` property on each, enabling the development agent to generate proper if/else or switch logic.

**Why sequential execution matters.** Consider a system with UC-101 (Create Order) and UC-102 (Edit Order). During UC-101 detailing, the analyst realizes the Order entity needs a new attribute -- "discountPercent." The skill invokes `nacl-sa-domain` in MODIFY mode and adds the attribute. When UC-102 runs next, it can reference DE-Order-A07 (discountPercent) in its edit form. If both UCs were detailed in parallel, UC-102 would not see the new attribute, leading to an incomplete form-domain mapping.

---

## Form-Domain Mapping

The form-domain mapping is the critical innovation that makes the SA graph useful for code generation. Every data-carrying FormField has a MAPS_TO edge pointing to a DomainAttribute.

```
(:Form {id: "FORM-OrderCreate"})
  -[:HAS_FIELD]->(:FormField {name: "clientId", field_type: "select"})
    -[:MAPS_TO]->(:DomainAttribute {name: "clientId", data_type: "Reference"})
      <-[:HAS_ATTRIBUTE]-(:DomainEntity {name: "Order"})
```

This single pattern enables three capabilities that would otherwise require manual cross-referencing:

**UI correctness.** Every form field has a known data type and validation rules inherited from the domain model. A FormField of type "select" mapped to a DomainAttribute of type "Enum" tells the frontend agent exactly which Enumeration to query for options. A "number" field mapped to a Decimal attribute tells it to allow fractional input.

**Impact analysis.** Change a DomainAttribute -- rename it, change its type, mark it nullable -- and a single Cypher query finds every FormField affected:

```cypher
MATCH (ff:FormField)-[:MAPS_TO]->(da:DomainAttribute {id: $attributeId})
RETURN ff.id, ff.name, labels(ff)
```

This eliminates the "find all references" problem that plagues document-based specifications.

**Code generation.** Development agents (`nacl-tl-dev-be`, `nacl-tl-dev-fe`) read the form-domain mapping to generate correct DTOs, validation schemas, API endpoints, and React form components. The mapping is not documentation -- it is the source of truth that drives code.

Validation check L4 enforces the mapping: every FormField with a data-carrying field_type (text, textarea, number, date, select, multiselect, checkbox, file) MUST have a MAPS_TO edge. Button and table fields are exempt. No orphaned data fields are allowed.

The mapping also resolves the common specification gap where a form shows a "Status" dropdown but nobody documented which values it should contain. With MAPS_TO pointing to a DomainAttribute of type Enum, the associated Enumeration node and its EnumValue children define the exact list of options. There is no ambiguity left for the developer to resolve.

---

## Impact Analysis for Incremental Features

After initial specification, most SA work is incremental: adding features, modifying existing use cases, adjusting the domain model. The `nacl-sa-feature` skill uses Cypher traversal to find the minimal blast radius of a change, avoiding the need to re-run all 10 phases.

The workflow:

1. **User describes the feature** in natural language (e.g., "Add discount codes to the ordering flow").
2. **Graph search.** The skill searches the Neo4j graph using keyword matching on node names and relationship traversal.
3. **Blast radius identification.** The skill identifies all affected artifacts: modules, domain entities, use cases, forms, and requirements.
4. **Selective re-specification.** Only the SA skills that need updating are invoked -- not all 10 phases. If only a domain entity changes, only `nacl-sa-domain` (MODIFY mode) and `nacl-sa-validate` run.
5. **FeatureRequest artifact.** A FeatureRequest node is created for TL handoff, containing the list of affected UCs and the scope of changes.

Example: finding all UCs that touch a specific entity.

```cypher
// Find all UCs that reference a DomainEntity through their forms
MATCH (uc:UseCase)-[:USES_FORM]->(:Form)-[:HAS_FIELD]->(:FormField)
  -[:MAPS_TO]->(:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity {name: $entityName})
RETURN DISTINCT uc.id, uc.name
```

This traversal crosses four node types in a single query. In a document-based specification, the same analysis would require opening dozens of files and manually tracing references.

The key benefit is avoiding over-specification: when adding a discount code feature, you do not re-specify the entire ordering module -- you update only the affected entities, UCs, and forms.

The FeatureRequest artifact contains a structured manifest: which modules are affected, which domain entities need changes, which UCs need re-detailing, and which new UCs (if any) should be created. This manifest is consumed by `nacl-tl-plan`, which generates only the delta tasks -- no redundant work for features already implemented.

---

## SA Validation (L1-L6 + XL6-XL9)

The `nacl-sa-validate` skill runs read-only Cypher queries against the graph to detect inconsistencies. Validation is split into two categories: internal checks (within the SA layer) and cross-layer checks (between SA and BA).

### Internal checks (L1-L6)

| Level | Check | Purpose |
|-------|-------|---------|
| L1 | All nodes have required properties | Data consistency -- no nodes missing names, types, or IDs |
| L2 | Every Module has at least one UC or Entity | Model connectivity -- no empty modules |
| L3 | Every UC has at least one Requirement | Requirement completeness -- no under-specified UCs |
| L4 | Every data FormField has MAPS_TO edge | Form-domain traceability -- no orphaned data fields |
| L5 | Every Primary UC has detail_status='complete' | UC completeness -- no half-detailed use cases |
| L6 | Inter-module DEPENDS_ON is acyclic | Cross-module consistency -- no circular dependencies |

### Cross-layer checks (XL6-XL9)

These checks verify that every BA artifact has a corresponding SA artifact, ensuring nothing was lost in translation.

| Level | Check | Purpose |
|-------|-------|---------|
| XL6 | Every automated WorkflowStep has AUTOMATES_AS edge to UseCase | UC coverage -- every automated business step has a use case |
| XL7 | Every BusinessEntity has REALIZED_AS edge to DomainEntity | Entity coverage -- every business entity has a domain counterpart |
| XL8 | Every BusinessRole has MAPPED_TO edge to SystemRole | Role coverage -- every business role has a system role |
| XL9 | Every BusinessRule has IMPLEMENTED_BY edge to Requirement | Rule coverage -- every business rule has a requirement |

**Severity.** Validation issues are classified as CRITICAL or WARNING. CRITICAL errors (missing MAPS_TO edges, orphaned modules, incomplete UC detail) block downstream work -- `nacl-sa-finalize` will refuse to mark the specification as ready. WARNING issues (missing descriptions, suboptimal naming) are reported but do not block progress.

All validation is strictly read-only. No nodes or edges are created, modified, or deleted during validation. The output is a ValidationReport node attached to the project with a timestamp, total error count, and per-level breakdown.

Validation can be run at any time during the specification process, not just at Phase 7. Analysts commonly run it after completing domain modeling (Phase 2) to catch issues early, then again after UC detailing (Phase 5) to verify form-domain coverage before investing time in UI design.

### Readiness assessment

The `nacl-sa-finalize` skill computes a readiness score from four metrics:

- **UC Readiness**: `(detailed_ucs / total_ucs) * 100%` -- what fraction of use cases have been fully detailed.
- **Entity Readiness**: `(entities_with_attributes / total_entities) * 100%` -- what fraction of domain entities have at least one attribute defined.
- **Form Coverage**: `(UCs_with_forms / total_UCs) * 100%` -- what fraction of use cases have associated forms.
- **Overall readiness** is the weighted average. When it reaches 90% or higher, the specification is considered ready for development, and the orchestrator can proceed to `nacl-tl-plan`.

Finalization also generates ADR (Architecture Decision Record) nodes for any significant decisions made during the SA process -- technology choices, rejected alternatives, trade-offs. These ADRs travel with the graph and are available to development agents as context.

```cypher
// Example: check readiness metrics
MATCH (uc:UseCase)
WITH count(uc) AS total,
     count(CASE WHEN uc.detail_status = 'complete' THEN 1 END) AS detailed
RETURN detailed, total, round(100.0 * detailed / total, 1) AS uc_readiness_pct
```

When the overall readiness score is below 90%, the finalization report lists exactly which UCs are incomplete, which entities lack attributes, and which forms are missing -- giving the analyst a concrete punch list rather than a vague "not ready" signal.

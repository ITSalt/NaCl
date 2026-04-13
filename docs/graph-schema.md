[Home](../README.md) > Graph Schema

# Graph Schema

NaCl stores all business and system analysis artifacts in a Neo4j knowledge graph. The graph is organized into three layers — BA, SA, and TL — each with its own node types and relationships. Cross-layer edges connect BA analysis to SA specifications to TL tasks, enabling full traceability from a business rule down to the code that implements it.

Raw Cypher DDL: [`graph-infra/schema/ba-schema.cypher`](../graph-infra/schema/ba-schema.cypher), [`graph-infra/schema/sa-schema.cypher`](../graph-infra/schema/sa-schema.cypher), [`graph-infra/schema/tl-schema.cypher`](../graph-infra/schema/tl-schema.cypher)

---

## BA Layer

Business Analysis nodes capture the "what the business does" level — processes, entities, roles, and rules.

### Node Types

| Label | Description | Key Properties |
|---|---|---|
| `ProcessGroup` | Top-level grouping of related business processes | `id`, `name`, `description` |
| `BusinessProcess` | A named business process with trigger and result | `id`, `name`, `trigger`, `result`, `automation_level` |
| `WorkflowStep` | A single step inside a business process | `id`, `function_name`, `change_marker` |
| `BusinessEntity` | A business object, document, or result | `id`, `name`, `stereotype`, `has_states` |
| `EntityAttribute` | An attribute belonging to a `BusinessEntity` | `id`, `name` |
| `EntityState` | A lifecycle state of a `BusinessEntity` | `id`, `name` |
| `BusinessRole` | An actor that performs workflow steps | `id`, `full_name`, `department`, `responsibilities` |
| `BusinessRule` | A constraint, calculation, or authorization rule | `id`, `name`, `rule_type`, `formulation`, `severity` |
| `GlossaryTerm` | A defined term in the domain glossary | `id`, `term`, `definition` |
| `SystemContext` | System boundary with in/out-of-scope definitions | `id`, `name`, `goals`, `in_scope`, `out_of_scope` |
| `Stakeholder` | A stakeholder with role and interest | `id`, `name`, `role`, `interest` |
| `ExternalEntity` | An external actor (User, ExternalSystem, Organization) | `id`, `name`, `type`, `description` |
| `DataFlow` | A data flow into/out of the system | `id`, `name`, `direction`, `data_description` |

`automation_level` values: `manual`, `partial`, `full`
`change_marker` values: `[inherited As-Is]`, `[changed]`, `[new]`
`stereotype` values: `Внешний документ`, `Бизнес-объект`, `Результат`
`rule_type` values: `constraint`, `calculation`, `invariant`, `authorization`
`severity` values: `critical`, `warning`, `info`

### Relationship Types

| Relationship | From → To | Notes |
|---|---|---|
| `CONTAINS` | `ProcessGroup` → `BusinessProcess` | Process belongs to group |
| `HAS_STEP` | `BusinessProcess` → `WorkflowStep` | `order: Int` property |
| `TRIGGERS` | `BusinessProcess` → `BusinessProcess` | Sequential process link |
| `CALLS_SUB` | `BusinessProcess` → `BusinessProcess` | Subprocess decomposition |
| `NEXT_STEP` | `WorkflowStep` → `WorkflowStep` | `label: String` for branch labels |
| `PERFORMED_BY` | `WorkflowStep` → `BusinessRole` | Role that executes the step |
| `OWNS` | `BusinessRole` → `BusinessProcess` | Process owner |
| `PARTICIPATES_IN` | `BusinessRole` → `BusinessProcess` | Role involved but not owner |
| `READS` | `WorkflowStep` → `BusinessEntity` | Step reads entity |
| `PRODUCES` | `WorkflowStep` → `BusinessEntity` | Step creates entity |
| `MODIFIES` | `WorkflowStep` → `BusinessEntity` | Step updates entity |
| `HAS_ATTRIBUTE` | `BusinessEntity` → `EntityAttribute` | Entity has attribute |
| `HAS_STATE` | `BusinessEntity` → `EntityState` | Entity has lifecycle state |
| `TRANSITIONS_TO` | `EntityState` → `EntityState` | `condition: String` |
| `RELATES_TO` | `BusinessEntity` → `BusinessEntity` | `rel_type`, `cardinality` |
| `CONSTRAINS` | `BusinessRule` → `BusinessEntity` | Rule constrains entity |
| `APPLIES_IN` | `BusinessRule` → `BusinessProcess` | Rule applies in process |
| `AFFECTS` | `BusinessRule` → `EntityAttribute` | Rule affects attribute |
| `APPLIES_AT_STEP` | `BusinessRule` → `WorkflowStep` | Step-level rule binding |
| `DEFINES` | `GlossaryTerm` → `BusinessEntity` / `BusinessRole` / `BusinessProcess` | Term defines concept |
| `ALIAS_OF` | `GlossaryTerm` → `GlossaryTerm` | Synonym resolution |
| `HAS_STAKEHOLDER` | `SystemContext` → `Stakeholder` | Context has stakeholder |
| `HAS_EXTERNAL_ENTITY` | `SystemContext` → `ExternalEntity` | Context has external actor |
| `HAS_FLOW` | `ExternalEntity` → `SystemContext` | `direction`, `data_description` |

### Constraints and Indexes

| Type | Target | Field |
|---|---|---|
| Unique constraint | All BA node labels | `id` |
| Index | `ProcessGroup`, `BusinessProcess`, `BusinessEntity`, `BusinessRole`, `BusinessRule`, `EntityAttribute`, `EntityState`, `GlossaryTerm`, `SystemContext`, `Stakeholder`, `ExternalEntity` | `name` / `full_name` / `term` |
| Index | `WorkflowStep` | `function_name` |
| Full-text index | `ProcessGroup`, `BusinessProcess`, `BusinessEntity`, `BusinessRule`, `GlossaryTerm` | `name`, `description` |

---

## SA Layer

System Analysis nodes capture the "how the system is built" level — modules, use cases, domain model, forms, and API contracts.

### Node Types

| Label | Description | Key Properties |
|---|---|---|
| `Module` | A functional module of the system | `id`, `name` |
| `UseCase` | A system use case with user story and acceptance criteria | `id`, `name`, `user_story`, `acceptance_criteria`, `priority` |
| `ActivityStep` | An ordered step inside a use case | `id`, `description` |
| `DomainEntity` | A domain model entity with typed attributes | `id`, `name`, `module` |
| `DomainAttribute` | A typed attribute of a `DomainEntity` | `id`, `name` |
| `Enumeration` | An enumeration type | `id`, `name` |
| `EnumValue` | A value within an `Enumeration` | `id`, `value` |
| `Form` | A UI form used in a use case | `id`, `name` |
| `FormField` | A field within a `Form` | `id`, `name` |
| `Requirement` | A functional or non-functional requirement | `id`, `description` |
| `SystemRole` | A system-level actor with CRUD permissions | `id`, `name` |
| `Component` | A reusable UI component | `id`, `name` |

`priority` values: `MVP`, `Post-MVP`, `Nice-to-have`

### Relationship Types

| Relationship | From → To | Notes |
|---|---|---|
| `CONTAINS_UC` | `Module` → `UseCase` | Module owns use case |
| `CONTAINS_ENTITY` | `Module` → `DomainEntity` | Module owns entity |
| `HAS_STEP` | `UseCase` → `ActivityStep` | `order: Int` |
| `USES_FORM` | `UseCase` → `Form` | Use case references form |
| `HAS_REQUIREMENT` | `UseCase` → `Requirement` | Use case governed by requirement |
| `DEPENDS_ON` | `UseCase` → `UseCase` | Use case dependency |
| `ACTOR` | `UseCase` → `SystemRole` | Role that performs use case |
| `HAS_ATTRIBUTE` | `DomainEntity` → `DomainAttribute` | Entity owns attribute |
| `RELATES_TO` | `DomainEntity` → `DomainEntity` | `rel_type`, `cardinality` |
| `HAS_ENUM` | `DomainEntity` → `Enumeration` | Entity uses enum type |
| `HAS_VALUE` | `Enumeration` → `EnumValue` | Enum contains value |
| `HAS_FIELD` | `Form` → `FormField` | Form contains field |
| `MAPS_TO` | `FormField` → `DomainAttribute` | Field maps to domain attribute |
| `HAS_PERMISSION` | `SystemRole` → `DomainEntity` | `crud: String` |
| `USED_IN` | `Component` → `Form` | UI component used in form |
| `EXPOSES` | `UseCase` → `APIEndpoint` | Use case exposed via API |

### Constraints and Indexes

| Type | Target | Field |
|---|---|---|
| Unique constraint | All SA node labels | `id` |
| Index | All SA node labels | `name` / `description` / `value` |
| Index | `DomainEntity` | `module` (additional) |

---

## TL Layer

Tech Lead nodes capture the implementation level — tasks, waves, and API endpoints.

### Node Types

| Label | Description | Key Properties |
|---|---|---|
| `Task` | A development task with phase tracking | `id`, `title`, `status`, `wave`, `priority`, `phase_be`, `phase_fe`, `phase_sync`, `phase_review_be`, `phase_review_fe`, `phase_qa`, `created`, `updated` |
| `Wave` | A development wave (sprint-like grouping) | `id`, `number` |
| `APIEndpoint` | An API endpoint implemented by a task | `id`, `path` |

`status` values: `pending`, `in_progress`, `ready_for_review`, `approved`, `done`
`priority` values: `critical`, `high`, `medium`, `low`
Phase field values (all phase_* fields): `pending`, `in_progress`, `ready_for_review`, `approved`, `done`

### Relationship Types

| Relationship | From → To | Notes |
|---|---|---|
| `IN_WAVE` | `Task` → `Wave` | Task belongs to wave |
| `DEPENDS_ON` | `Task` → `Task` | Dependency ordering |
| `IMPLEMENTS` | `Task` → `APIEndpoint` | Task implements endpoint |

### Constraints and Indexes

| Type | Target | Field |
|---|---|---|
| Unique constraint | `Task`, `Wave`, `APIEndpoint` | `id` |
| Index | `Task` | `status` |
| Index | `Task` | `wave` |
| Index | `Task` | `title` |
| Index | `Wave` | `number` |
| Index | `APIEndpoint` | `path` |

---

## Cross-Layer Edges

These relationships link nodes across layers, enabling end-to-end traceability.

### BA → SA Handoff

| Relationship | From → To | Meaning |
|---|---|---|
| `AUTOMATES_AS` | `WorkflowStep` → `UseCase` | BA step automated as SA use case |
| `REALIZED_AS` | `BusinessEntity` → `DomainEntity` | BA entity realized as SA domain entity |
| `TYPED_AS` | `EntityAttribute` → `DomainAttribute` | BA attribute typed in SA domain |
| `MAPPED_TO` | `BusinessRole` → `SystemRole` | BA role mapped to SA system role |
| `IMPLEMENTED_BY` | `BusinessRule` → `Requirement` | BA rule implemented as SA requirement |
| `SUGGESTS` | `ProcessGroup` → `Module` | BA process group suggests SA module |

### SA → TL Handoff

| Relationship | From → To | Meaning |
|---|---|---|
| `GENERATES` | `UseCase` → `Task` | SA use case generates TL tasks |
| `CONSUMES` | `APIEndpoint` → `DomainEntity` | Endpoint reads SA domain entity |
| `PRODUCES` | `APIEndpoint` → `DomainEntity` | Endpoint writes SA domain entity |

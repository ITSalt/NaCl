---
name: nacl-sa-uc
model: opus
effort: high
description: |
  Реестр Use Cases из BA automation scope + детализация UC (Activity, формы, требования)
  + behavior slices (graph-native сценарии приёмки Given/When/Then)
  + domain errors (транспортно-независимая таксономия доменных ошибок) через Neo4j граф.
  Используй когда пользователь просит: создать use cases из BA, реестр UC, детализировать UC,
  activity diagram, формы UC, behavior slices, сценарии приёмки, доменные ошибки, error taxonomy,
  nacl-sa-uc, stories, detail UC, slices, errors.
---

# /nacl-sa-uc --- Use Case Registry + Detailing (Graph)

## Role

You are a Solution Architect agent specialized in Use Case design. You read BA-layer data from the Neo4j knowledge graph (automation scope, entities, roles), create and detail UseCase nodes with their full subgraph (ActivitySteps, Forms, FormFields, Requirements), and maintain traceability edges back to BA artifacts. Your primary tool is the Neo4j MCP interface. You do NOT read or write markdown docs files --- the graph IS the artifact.

---

## Invocation

```
/nacl-sa-uc <command> [arguments]
```

| Command | Arguments | Description |
|---------|-----------|-------------|
| `stories` | --- | Create UC registry from BA automation scope |
| `detail` | `<UC-ID>` (e.g. `UC-101`) | Detail a specific UC: activity steps, forms, requirements |
| `slices` | `<UC-ID>` (e.g. `UC-101`) | Author or modify the behavior slices of a UC (graph-native acceptance scenarios anchored to the screen machine / endpoints / tasks) |
| `errors` | `<UC-ID>` (e.g. `UC-101`) | Author or modify the domain errors observable through a UC's endpoints (transport-independent taxonomy: DomainError + MAY_RAISE + screen handling + presentations) |
| `list` | --- | Show all UCs from graph with detail status |

**Flags:**

| Flag | Required | Description |
|------|----------|-------------|
| `--lang` | No | Output language: `en` or `ru` (default: `ru`). |

---

## Language

Supports `--lang=en` for English output. See [nacl-core/lang-directive.md](../nacl-core/lang-directive.md).
When `--lang=en`: all generated text, node names, descriptions in English.
Default: Russian (ru).

---

## Shared References

Before executing any command, read and internalize:

- **`nacl-core/SKILL.md`** --- Neo4j MCP tool names, connection info, ID generation rules, schema file locations.
- **`graph-infra/schema/sa-schema.cypher`** --- SA node labels, constraints, relationship types.
- **`graph-infra/queries/sa-queries.cypher`** --- Named queries (sa_uc_full_context, sa_form_domain_mapping).
- **`graph-infra/queries/handoff-queries.cypher`** --- BA-to-SA traceability queries.
- **`nacl-sa-uc/references/runtime-contract.cypher`** --- Cypher template + decision tree for the RuntimeContract subgraph (Phase 4.5). Required reading before detailing any queue / workflow / long-running / async-provider / recoverable UC.

---

## Neo4j MCP Tools

All graph reads/writes use these tools:

| Tool | Purpose |
|------|---------|
| `mcp__neo4j__read-cypher` | Read-only queries |
| `mcp__neo4j__write-cypher` | Create / update / delete |
| `mcp__neo4j__get-schema` | Introspect current schema |

---

## ID Generation Rules (SA Layer)

| Node Type | Format | Example | Counter |
|-----------|--------|---------|---------|
| UseCase | UC-NNN | UC-101 | Global sequential |
| ActivityStep | {UC}-AS{NN} | UC-101-AS01 | Per-UC |
| Form | FORM-{Name} | FORM-OrderCreate | Name-based |
| FormField | {FORM}-F{NN} | FORM-OrderCreate-F01 | Per-form |
| Requirement | RQ-NNN | RQ-001 | Global sequential |
| Slice | SLC-{NNN}-{PascalName} | SLC-006-HappyPath | Per-UC, name-based (latin) |

### Next available ID query

```cypher
// Next UseCase ID
MATCH (uc:UseCase)
WITH max(toInteger(replace(uc.id, 'UC-', ''))) AS maxNum
RETURN 'UC-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
```

```cypher
// Next Requirement ID
MATCH (rq:Requirement)
WITH max(toInteger(replace(rq.id, 'RQ-', ''))) AS maxNum
RETURN 'RQ-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
```

---

# Command: `stories`

## Purpose

Create a UseCase registry by reading the BA automation scope from Neo4j. Each WorkflowStep with stereotype "Автоматизируется" that has no AUTOMATES_AS edge becomes a UC candidate.

## Workflow

```
+------------------+     +------------------+     +------------------+     +------------------+
| Phase 1          |     | Phase 2          |     | Phase 3          |     | Phase 4          |
| Read BA Scope    |---->| Propose UC       |---->| User Confirms    |---->| Write UC Nodes   |
|                  |     | Candidates       |     |                  |     | + Edges           |
+------------------+     +------------------+     +------------------+     +------------------+
```

**Do not proceed to the next phase without explicit user confirmation.**

---

### Phase 1: Read BA Automation Scope

#### 1.1 Query uncovered automation steps

```cypher
// Find WorkflowSteps marked for automation that have no UC yet
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
WHERE NOT (ws)-[:AUTOMATES_AS]->(:UseCase)
OPTIONAL MATCH (ws)-[:PERFORMED_BY]->(br:BusinessRole)
OPTIONAL MATCH (ws)-[:READS]->(re:BusinessEntity)
OPTIONAL MATCH (ws)-[:PRODUCES]->(pe:BusinessEntity)
OPTIONAL MATCH (ws)-[:MODIFIES]->(me:BusinessEntity)
OPTIONAL MATCH (pg:ProcessGroup)-[:CONTAINS]->(bp)
RETURN ws.id AS ws_id,
       ws.function_name AS ws_function,
       ws.description AS ws_description,
       bp.id AS bp_id,
       bp.name AS bp_name,
       pg.id AS pg_id,
       pg.name AS pg_name,
       collect(DISTINCT br.full_name) AS performers,
       collect(DISTINCT re.name) AS reads_entities,
       collect(DISTINCT pe.name) AS produces_entities,
       collect(DISTINCT me.name) AS modifies_entities
ORDER BY bp.id, ws.id
```

#### 1.2 Query existing modules

```cypher
// Get existing modules (for CONTAINS_UC placement)
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
RETURN m.id AS module_id, m.name AS module_name,
       count(uc) AS uc_count
ORDER BY m.id
```

#### 1.3 Query existing system roles

```cypher
// Get existing SystemRoles mapped from BA
MATCH (sr:SystemRole)
OPTIONAL MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr)
RETURN sr.id AS sr_id, sr.name AS sr_name,
       collect(br.full_name) AS ba_roles
ORDER BY sr.id
```

If no uncovered steps found, report:

> All WorkflowSteps with stereotype "Автоматизируется" already have AUTOMATES_AS edges. No new UC candidates. Run `/nacl-sa-uc list` to see existing UCs.

---

### Phase 2: Propose UC Candidates

For each uncovered WorkflowStep, propose a UC candidate.

**Rules for UC proposal:**
1. One WorkflowStep maps to one UseCase (1:1 default).
2. If multiple steps are closely related (same performer, same entity, sequential), propose merging them into one UC and note the reasoning.
3. Determine the actor from `performers` (the BA role). Match to an existing SystemRole if available.
4. Determine priority based on process group priority or BA context.
5. Propose a module assignment from existing modules or suggest a new one.

**Present to user:**

```
UC candidates from BA automation scope:

| # | UC ID | Name (proposed) | Actor | BA Step | Module | Priority |
|---|-------|-----------------|-------|---------|--------|----------|
| 1 | UC-{NNN} | {Name} | {Role} | {ws_id}: {function} | {module} | MVP / Post-MVP |
| 2 | UC-{NNN} | {Name} | {Role} | {ws_id}: {function} | {module} | MVP / Post-MVP |

Related BA entities: {entity list}
Proposed merges: {if any}

Questions:
1. Confirm the UC candidates list?
2. Merge or split any UCs?
3. Correct any actors or modules?
4. Correct priorities?
```

---

### Phase 3: User Confirmation

Wait for user to confirm or modify the candidate list. Apply corrections and re-present if needed.

---

### Phase 4: Write UC Nodes and Edges

For each confirmed UC candidate, execute the following Cypher statements.

#### 4.1 Create UseCase node

```cypher
MERGE (uc:UseCase {id: $ucId})
SET uc.name = $name,
    uc.actor = $actor,
    uc.priority = $priority,
    uc.user_story = $userStory,
    uc.acceptance_criteria = $acceptanceCriteria,
    uc.has_ui = $hasUi,
    uc.status = 'identified',
    uc.detail_status = 'not_started',
    uc.created = datetime(),
    uc.updated = datetime()
RETURN uc.id AS id, uc.name AS name
```

Parameters:
- `$ucId` --- e.g. `"UC-101"`
- `$name` --- UC name, e.g. `"Создать заказ"`
- `$actor` --- SystemRole name
- `$priority` --- `"MVP"` | `"Post-MVP"` | `"Nice-to-have"`
- `$userStory` --- e.g. `"As a [role], I want [action] so that [value]"`. Generate from UC name and actor.
- `$acceptanceCriteria` --- list of acceptance criteria strings, e.g. `["Given X, When Y, Then Z", ...]`. Derive from BA step context.
- `$hasUi` --- boolean. `true` if this UC will have at least one user-facing form (the default for interactive UCs); `false` for backend-only UCs (cron jobs, webhook handlers, background workers, system-to-system flows). The validator's L5.1 check uses this flag to skip UCs that legitimately have no `USES_FORM` edge. If you forget to set it during creation, `nacl-sa-flags backfill-all` will derive it from the presence of `USES_FORM` after the fact, but setting it explicitly here is preferred — it carries the original design intent rather than reading state back.

#### 4.2 Create AUTOMATES_AS edge (WorkflowStep to UseCase)

```cypher
MATCH (ws:WorkflowStep {id: $wsId})
MATCH (uc:UseCase {id: $ucId})
MERGE (ws)-[:AUTOMATES_AS]->(uc)
RETURN ws.id AS ws_id, uc.id AS uc_id
```

This is the CRITICAL traceability edge linking BA to SA.

#### 4.3 Create CONTAINS_UC edge (Module to UseCase)

```cypher
MATCH (m:Module {id: $moduleId})
MATCH (uc:UseCase {id: $ucId})
MERGE (m)-[:CONTAINS_UC]->(uc)
RETURN m.id AS module_id, uc.id AS uc_id
```

#### 4.4 Create ACTOR edge (UseCase to SystemRole)

After creating each UseCase, create the ACTOR edge to the appropriate SystemRole:

```cypher
MATCH (uc:UseCase {id: $ucId}), (sr:SystemRole {name: $roleName})
MERGE (uc)-[:ACTOR]->(sr)
RETURN uc.id AS uc_id, sr.id AS sr_id
```

If the actor is "ИТ-система" or similar system actor, link to SystemRole "SystemBot" (or create it if needed):

```cypher
MERGE (sr:SystemRole {name: 'SystemBot'})
ON CREATE SET sr.id = 'SR-SystemBot', sr.description = 'Automated system actor', sr.created = datetime()
WITH sr
MATCH (uc:UseCase {id: $ucId})
MERGE (uc)-[:ACTOR]->(sr)
RETURN uc.id AS uc_id, sr.id AS sr_id
```

#### 4.5 Create DEPENDS_ON edges between UCs

Analyze UC candidates for dependencies based on:
- Entity flow: if UC-A creates an entity that UC-B reads, UC-B depends on UC-A
- Process order: if BA steps are sequential (NEXT_STEP chain), later UC depends on earlier UC
- Explicit user input from Phase 3

For each dependency:

```cypher
MATCH (uc1:UseCase {id: $ucId}), (uc2:UseCase {id: $dependsOnUcId})
MERGE (uc1)-[:DEPENDS_ON]->(uc2)
RETURN uc1.id AS uc_id, uc2.id AS depends_on
```

#### 4.6 Report

After all writes, present summary:

```
Created {N} UseCase nodes:

| UC ID | Name | Actor | BA Step | Module | Status |
|-------|------|-------|---------|--------|--------|
| UC-101 | ... | ... | BP-001-S03 | mod-orders | identified |

Edges created:
- {N} AUTOMATES_AS (WorkflowStep -> UseCase)
- {N} CONTAINS_UC (Module -> UseCase)
- {N} ACTOR (UseCase -> SystemRole)

Next: run `/nacl-sa-uc detail UC-101` to detail each UC.
```

---

# Command: `detail`

## Purpose

Detail a specific UseCase by creating its full subgraph: ActivitySteps, Forms, FormFields, Requirements, and all connecting edges. This is the most complex operation in the SA layer.

## Parameters

- `<UC-ID>` --- UseCase ID (e.g. `UC-101`)

## Workflow

```
+----------+     +----------+     +----------+     +----------+     +-------------+     +----------+
| Phase 1  |     | Phase 2  |     | Phase 3  |     | Phase 4  |     | Phase 4.5   |     | Phase 5  |
| Read UC +|---->| Activity |---->| Forms +  |---->| Require- |---->| Runtime     |---->| Valid.+  |
| BA Ctx   |     | Steps    |     | Domain   |     | ments    |     | Contract    |     | Report   |
+----------+     +----------+     +----------+     +----------+     +-------------+     +----------+
```

**Do not proceed to the next phase without explicit user confirmation.**

**Phase 4.5 (Runtime Contract) is MANDATORY for any UC with queue, workflow, long-running, async-provider, or recoverable characteristics.** See the Phase 4.5 section below for the decision tree, required fields, and worked examples. UCs that fail the decision tree skip Phase 4.5 and proceed straight to Phase 5 with `runtime_contract: not_required` recorded on the UC node.

---

### Phase 1: Read UC and BA Context

#### 1.1 Read the UseCase node

```cypher
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
RETURN uc, sr.name AS actor, m.id AS module_id, m.name AS module_name
```

If no UseCase found, stop:

> UseCase `{UC-ID}` not found in graph. Run `/nacl-sa-uc stories` first to create UC nodes, or `/nacl-sa-uc list` to see existing UCs.

#### 1.2 Read BA context via AUTOMATES_AS

```cypher
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase {id: $ucId})
OPTIONAL MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws)
OPTIONAL MATCH (ws)-[:PERFORMED_BY]->(br:BusinessRole)
OPTIONAL MATCH (ws)-[:READS]->(re:BusinessEntity)
OPTIONAL MATCH (ws)-[:PRODUCES]->(pe:BusinessEntity)
OPTIONAL MATCH (ws)-[:MODIFIES]->(me:BusinessEntity)
OPTIONAL MATCH (re)-[:HAS_ATTRIBUTE]->(rea:EntityAttribute)
OPTIONAL MATCH (pe)-[:HAS_ATTRIBUTE]->(pea:EntityAttribute)
OPTIONAL MATCH (me)-[:HAS_ATTRIBUTE]->(mea:EntityAttribute)
RETURN ws.id AS ws_id,
       ws.function_name AS ws_function,
       ws.description AS ws_description,
       bp.id AS bp_id,
       bp.name AS bp_name,
       collect(DISTINCT br.full_name) AS ba_performers,
       collect(DISTINCT {id: re.id, name: re.name}) AS reads_entities,
       collect(DISTINCT {id: pe.id, name: pe.name}) AS produces_entities,
       collect(DISTINCT {id: me.id, name: me.name}) AS modifies_entities,
       collect(DISTINCT {entity: re.name, attr: rea.name}) AS read_attributes,
       collect(DISTINCT {entity: pe.name, attr: pea.name}) AS produced_attributes,
       collect(DISTINCT {entity: me.name, attr: mea.name}) AS modified_attributes
```

#### 1.3 Read related BA business rules

```cypher
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase {id: $ucId})
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws)
OPTIONAL MATCH (brq:BusinessRule)-[:APPLIES_IN]->(bp)
RETURN brq.id AS rule_id, brq.name AS rule_name, brq.description AS rule_description
```

#### 1.4 Read existing domain model for related entities

```cypher
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase {id: $ucId})
OPTIONAL MATCH (ws)-[:READS|PRODUCES|MODIFIES]->(be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
RETURN de.id AS de_id, de.name AS de_name,
       collect(DISTINCT {id: da.id, name: da.name, data_type: da.data_type}) AS attributes
```

#### 1.5 Check existing detail (idempotency)

```cypher
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
RETURN count(as_step) AS step_count,
       count(f) AS form_count,
       count(rq) AS req_count
```

If the UC already has steps/forms/requirements, warn:

> UC `{UC-ID}` already has {N} steps, {M} forms, {K} requirements. Re-running detail will MERGE (update existing, add new). Confirm to proceed?

#### 1.6 Present BA context to user

```
BA context for {UC-ID} ({uc.name}):

  Actor: {actor}
  Module: {module_name}
  BA Process: {bp_id} --- {bp_name}
  BA Step: {ws_id} --- {ws_function}
  BA Entities (reads): {list}
  BA Entities (produces): {list}
  BA Entities (modifies): {list}
  BA Rules: {list of BRQ}
  Domain Entities (realized): {list of DE with attributes}

This context will be used to build the Activity Diagram and Requirements.
Confirm to proceed with Phase 2?
```

---

### Phase 2: Activity Steps

#### 2.1 Design the activity diagram

Based on BA context, propose a sequence of ActivitySteps.

**Rules:**
- Maximum 10 steps per UC
- Each step is either `User` type (user action) or `System` type (system action)
- Steps describe WHAT happens, not HOW (no field-level detail in step text)
- Each step that involves data entry/display must reference a Form
- Steps should cover all acceptance criteria from the UC

**Present to user:**

```
Proposed Activity Steps for {UC-ID}:

| # | Step ID | Type | Description | Form (if any) |
|---|---------|------|-------------|----------------|
| 1 | {UC}-AS01 | User | Открывает форму создания заказа | FORM-OrderCreate |
| 2 | {UC}-AS02 | User | Заполняет данные заказа | FORM-OrderCreate |
| 3 | {UC}-AS03 | System | Валидирует введённые данные | --- |
| 4 | {UC}-AS04 | System | Сохраняет заказ | --- |
| 5 | {UC}-AS05 | System | Отображает подтверждение | FORM-OrderConfirm |

Alternative scenarios:
- ALT-1: Validation fails at step 3 -> System shows errors, return to step 2
- ALT-2: User cancels at step 2 -> System discards, return to list

Confirm or modify?
```

#### 2.2 Write ActivityStep nodes

For each confirmed step:

```cypher
MERGE (as:ActivityStep {id: $stepId})
SET as.description = $description,
    as.actor = $actor,
    as.order = $order,
    as.form_ref = $formRef,
    as.updated = datetime()
RETURN as.id AS id
```

Parameters:
- `$stepId` --- e.g. `"UC-101-AS01"`
- `$description` --- e.g. `"Открывает форму создания заказа"`
- `$actor` --- one of `"User"`, `"System"`, or unset; classify per `frontmatter_v1_sa.py:1098` convention
- `$order` --- integer (1, 2, 3, ...)
- `$formRef` --- Form ID or `null`

#### 2.3 Create HAS_STEP edges

```cypher
MATCH (uc:UseCase {id: $ucId})
MATCH (as:ActivityStep {id: $stepId})
MERGE (uc)-[:HAS_STEP {order: $order}]->(as)
RETURN uc.id AS uc_id, as.id AS step_id
```

---

### Phase 3: Forms and Form-Domain Mapping

This phase creates Form and FormField nodes, and the CRITICAL `MAPS_TO` edges that link UI fields to domain attributes.

#### 3.1 Identify required forms

From Phase 2, collect all unique `form_ref` values. For each form:

1. Check if it already exists in the graph.
2. If not, create it.
3. Determine fields based on BA entity attributes and the step's purpose.

#### 3.2 Check existing forms

```cypher
MATCH (f:Form {id: $formId})
OPTIONAL MATCH (f)-[:HAS_FIELD]->(ff:FormField)
RETURN f.id AS form_id, f.name AS form_name,
       collect({id: ff.id, name: ff.name, label: ff.label, field_type: ff.field_type}) AS fields
```

#### 3.3 Create Form node

```cypher
MERGE (f:Form {id: $formId})
SET f.name = $formName,
    f.description = $description,
    f.updated = datetime()
RETURN f.id AS id
```

Parameters:
- `$formId` --- e.g. `"FORM-OrderCreate"`
- `$formName` --- e.g. `"Создание заказа"`
- `$description` --- e.g. `"Форма создания нового заказа"`

#### 3.4 Create USES_FORM edge

```cypher
MATCH (uc:UseCase {id: $ucId})
MATCH (f:Form {id: $formId})
MERGE (uc)-[:USES_FORM]->(f)
RETURN uc.id AS uc_id, f.id AS form_id
```

#### 3.5 Design form fields

For each form, propose fields based on BA entity attributes. Present to user:

```
Form: {FORM-ID} ({form_name})

| # | Field ID | Label | Type | Domain Mapping |
|---|----------|-------|------|----------------|
| 1 | {FORM}-F01 | Дата заказа | date | Order.orderDate |
| 2 | {FORM}-F02 | Клиент | select | Order.client |
| 3 | {FORM}-F03 | Сумма | number | Order.totalAmount |
| 4 | {FORM}-F04 | Комментарий | textarea | Order.comment |

Domain Mapping legend:
  {DomainEntity.DomainAttribute} -> the MAPS_TO target

Confirm or modify?
```

**Rules for field design:**
- Every Data field MUST have a MAPS_TO target (DomainAttribute)
- Functional fields (buttons) do NOT get MAPS_TO
- Visual fields (headers, dividers) do NOT get MAPS_TO
- Field types: `text`, `textarea`, `number`, `date`, `datetime`, `select`, `multiselect`, `checkbox`, `file`, `button`, `header`, `divider`

#### 3.6 Create FormField nodes

```cypher
MERGE (ff:FormField {id: $fieldId})
SET ff.name = $name,
    ff.label = $label,
    ff.field_type = $fieldType,
    ff.required = $required,
    ff.order = $order,
    ff.updated = datetime()
RETURN ff.id AS id
```

Parameters:
- `$fieldId` --- e.g. `"FORM-OrderCreate-F01"`
- `$name` --- e.g. `"orderDate"`
- `$label` --- e.g. `"Дата заказа"`
- `$fieldType` --- e.g. `"date"`
- `$required` --- boolean
- `$order` --- integer

#### 3.7 Create HAS_FIELD edges

```cypher
MATCH (f:Form {id: $formId})
MATCH (ff:FormField {id: $fieldId})
MERGE (f)-[:HAS_FIELD]->(ff)
RETURN f.id AS form_id, ff.id AS field_id
```

#### 3.8 Create MAPS_TO edges (CRITICAL traceability)

This is the most important edge in the SA layer. It connects a UI form field to a domain attribute, ensuring full data traceability from UI through domain to BA entity.

```cypher
MATCH (ff:FormField {id: $fieldId})
MATCH (da:DomainAttribute {id: $attrId})
MERGE (ff)-[:MAPS_TO]->(da)
RETURN ff.id AS field_id, da.id AS attr_id
```

**The traceability chain:**

```
WorkflowStep -[AUTOMATES_AS]-> UseCase -[USES_FORM]-> Form -[HAS_FIELD]-> FormField -[MAPS_TO]-> DomainAttribute
                                                                                                        ^
BusinessEntity -[REALIZED_AS]-> DomainEntity -[HAS_ATTRIBUTE]-> DomainAttribute -------------------------+
```

This chain allows answering: "For this BA workflow step, what UI fields does the user see, and which domain attributes do they map to?"

#### 3.9 Verify MAPS_TO completeness

After creating all fields and mappings, run validation:

```cypher
MATCH (uc:UseCase {id: $ucId})-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
WHERE ff.field_type IN ['text', 'textarea', 'number', 'date', 'datetime', 'select', 'multiselect', 'checkbox', 'file']
  AND NOT (ff)-[:MAPS_TO]->(:DomainAttribute)
RETURN f.id AS form_id, ff.id AS field_id, ff.name AS field_name, ff.label AS label
```

If any Data fields lack MAPS_TO, warn:

> WARNING: {N} data fields have no MAPS_TO edge. These are data-binding gaps:
> - {field_id}: {label} on form {form_id}
>
> Fix: either add MAPS_TO edges or create missing DomainAttributes (via `/nacl-sa-domain`).

---

### Phase 4: Requirements

#### 4.1 Derive requirements

Sources for requirements:
1. **BA business rules** (from Phase 1.3) --- each BRQ is a requirement candidate
2. **Validation rules** --- derived from form fields and domain constraints
3. **Behavioral rules** --- derived from activity step logic

**Present to user:**

```
Proposed Requirements for {UC-ID}:

| # | RQ ID | Source | Description |
|---|-------|--------|-------------|
| 1 | RQ-{NNN} | BRQ-001 | {derived from BA rule} |
| 2 | RQ-{NNN} | Validation | {field validation rule} |
| 3 | RQ-{NNN} | Behavior | {behavioral requirement} |

Confirm or modify?
```

#### 4.2 Create Requirement nodes

```cypher
MERGE (rq:Requirement {id: $rqId})
SET rq.description = $description,
    rq.source = $source,
    rq.rq_type = $rqType,
    rq.updated = datetime()
RETURN rq.id AS id
```

Parameters:
- `$rqId` --- e.g. `"RQ-001"`
- `$description` --- requirement text
- `$source` --- `"BRQ-001"` or `"validation"` or `"behavior"`
- `$rqType` --- `"functional"`, `"validation"`, `"behavioral"`, `"interface"`

#### 4.3 Create HAS_REQUIREMENT edges

```cypher
MATCH (uc:UseCase {id: $ucId})
MATCH (rq:Requirement {id: $rqId})
MERGE (uc)-[:HAS_REQUIREMENT]->(rq)
RETURN uc.id AS uc_id, rq.id AS rq_id
```

#### 4.4 Create IMPLEMENTED_BY edges (BA Rule to Requirement)

When a requirement is derived from a BA business rule:

```cypher
MATCH (brq:BusinessRule {id: $brqId})
MATCH (rq:Requirement {id: $rqId})
MERGE (brq)-[:IMPLEMENTED_BY]->(rq)
RETURN brq.id AS brq_id, rq.id AS rq_id
```

---

### Phase 4.5: Runtime Contract (FSM / queue / workflow durable state)

Wave: W8-runtime-fsm. Mandatory for any UC with queue / workflow / long-running / async-provider / recoverable characteristics. The contract captures the **durable** state machine, transaction boundaries, locks, emitted events with pre-commit / post-commit lifecycle, retry semantics, cancel-while-X race resolution, recovery procedure after a process crash, and idempotency key strategy.

**Why this phase exists.** Postmortems across two production NaCl projects converge on the same diagnosis: TS types and graph artifacts matched on both sides of every interface, but the durable runtime did not. Two worked examples drive this phase:

- **Project-Alpha UC-112 "restart-after-failed-with-running-tasks" silent no-op** — pressing "Restart" on a failed task returned 200 but the task stayed `failed`. `enqueue()` used `INSERT … ON CONFLICT DO NOTHING`; the previous `failed` queue_items row still existed, so the insert was silently suppressed. The UC spec was silent on the `failed → pending` transition; it specified that restart re-enqueues, but did not declare the DB-level pre-condition (delete the previous queue_items row in the same transaction) nor the 409 `TASK_NOT_RESTARTABLE` branch for non-restartable terminal states. A correct Runtime Contract would have made both explicit and the bug would have been impossible to ship.
- **Project-Beta UC-107 / UC-150 / UC-202 "cancel-while-failing race"** — the worker commit transaction missed a row-level `FOR UPDATE` lock; cancel and fail could fire concurrently against the same row, terminal-state ordering was unspecified, and both writes won non-deterministically. A correct Runtime Contract would have declared `row_for_update` on both the `fail` and `cancel` transitions and a `RESOLVES_RACE_WITH` edge naming cancel as the winner; fail would reacquire the lock, observe `status=cancelled`, and exit without a state change.

#### 4.5.1 Decision tree — is a Runtime Contract MANDATORY for this UC?

A Runtime Contract is mandatory if **any** of the following is true:

1. **Async step keywords (Q1).** The UC has at least one `System`-type ActivityStep whose description references queue / worker / async / job / poll / schedule / cron / outbox / saga / restart / retry / cancel.
2. **State-bearing domain entity (Q2).** The UC produces or modifies a BusinessEntity that has a `status` / `state` / `lifecycle` / `phase` attribute (state machine on the domain side).
3. **Async external provider (Q3).** The UC has a Requirement linked to an external-contracts.md provider marked `sync_vs_async = "async"`. NOTE: provider linkage lands in W6; until then, ask the user explicitly.
4. **Behavioral requirement (Q4).** The UC has a `behavioral`-type Requirement whose text contains retry / restart / cancel / recover / resume / idempotent.
5. **Async dependency (Q5).** The UC has a `DEPENDS_ON` edge to another UC whose name or description includes worker / queue / dispatcher / scheduler.

Run the decision tree query from `nacl-sa-uc/references/runtime-contract.cypher` § 7 and present the verdict to the user. The query is heuristic — confirm with the user before BLOCKING.

If the verdict is **not mandatory**, record `uc.runtime_contract = 'not_required'` and skip to Phase 5:

```cypher
MATCH (uc:UseCase {id: $ucId})
SET uc.runtime_contract = 'not_required',
    uc.updated = datetime()
RETURN uc.id AS id;
```

If the verdict is **mandatory**, proceed with the contract authoring below. If the user refuses to author a contract, stop with `BLOCKED — runtime_contract_missing` and do not advance to Phase 5.

#### 4.5.2 Required fields (all eight)

For every mandatory contract, the user must confirm — and the graph must record — **all eight** of the following:

| # | Field | Where it lives | Why it matters |
|---|---|---|---|
| 1 | **State machine** (states + transitions) | `RuntimeState`, `RuntimeTransition` nodes | Without an enumerated FSM, unreachable states ship as "happy path only". |
| 2 | **DB transaction boundary per transition** | `RuntimeTransition.txn_boundary` ∈ `single_tx \| no_tx \| saga \| outbox` | Default is `single_tx`; `no_tx` and `saga` MUST be justified in `cancel_race_note`. Project-Alpha restart bug = `txn_boundary` ambiguity. |
| 3 | **Lock acquisition strategy** | `RuntimeTransition.lock_strategy` ∈ `row_for_update \| row_skip_locked \| advisory_lock \| no_lock` + `RuntimeLock` nodes | Project-Beta cancel-race = missing `row_for_update`. |
| 4 | **Emitted events with lifecycle (pre-commit vs post-commit)** | `RuntimeEvent.lifecycle` ∈ `pre_commit \| post_commit` + `EMITS_EVENT` edges | `post_commit` is the safe default; `pre_commit` events fire before the row is durable and MUST be justified explicitly. |
| 5 | **Retry semantics per transition** | `RuntimeTransition.retry_policy` ∈ `no_retry \| fixed \| exponential \| bounded_n` + `retry_parameters` JSON | Silent infinite retry burns provider quota; missing bounds caused the kie.ai 404 storm. |
| 6 | **Cancel-while-X race resolution** | `RuntimeTransition.cancel_race_note` + `RESOLVES_RACE_WITH` edges between racing transitions | Project-Beta cancel-race = no declared winner; both writes were non-deterministic. |
| 7 | **Recovery procedure after process crash** | `RecoveryProcedure` node + `HAS_RECOVERY` edge | Project-Alpha "restart-with-running-tasks" originated in a missing recovery procedure for in-flight tasks at worker boot. |
| 8 | **Idempotency key strategy** | `IdempotencyKey` node + `USES_IDEMPOTENCY_KEY` edge; `RuntimeTransition.idempotency_key_ref` per transition | Without an idempotency key, retried requests double-process; `ON CONFLICT DO NOTHING` is NOT a substitute (Project-Alpha UC-112 proved this). |

A contract that omits any of the eight is `BLOCKED — runtime_contract_incomplete`.

#### 4.5.3 Disambiguation — RuntimeContract vs Requirement

A Requirement is a **statement** ("the system must cancel running tasks"). A RuntimeContract is the **operational machine** that proves a class of behavioral Requirements ("cancel-while-failing — cancel wins, fail re-reads the lock and exits"). When a behavioral Requirement says "retry the provider with exponential backoff", the Requirement node stays; the contract holds the actual `retry_policy = 'exponential'` and the `retry_parameters` JSON. Link them with `IMPLEMENTED_BY` (Requirement → RuntimeTransition) when the relationship is direct.

#### 4.5.4 Author the contract (Cypher writes)

Use the templates in `nacl-sa-uc/references/runtime-contract.cypher`:

- § 5.1 — create the `RuntimeContract` root and `CONTAINS_RUNTIME_CONTRACT` edge.
- § 5.2 — create states, `HAS_STATE`, `HAS_INITIAL_STATE`, `HAS_TERMINAL_STATE` edges.
- § 5.3 — create transitions with `FROM_STATE`, `TO_STATE`, `txn_boundary`, `lock_strategy`, `retry_policy`, `retry_parameters`, `cancel_race_note`.
- § 5.4 — create `RuntimeLock`, `RuntimeEvent` nodes and `ACQUIRES_LOCK`, `EMITS_EVENT` edges.
- § 5.5 — create `RESOLVES_RACE_WITH` edges between racing transitions.
- § 5.6 — create `IdempotencyKey` and `RecoveryProcedure` with `USES_IDEMPOTENCY_KEY` and `HAS_RECOVERY` edges.

ID convention: `{UC}-RC` for the root, `{UC}-RC-S{NN}` for states, `{UC}-RC-T{NN}` for transitions, `{UC}-RC-E{NN}` for events, `{UC}-RC-L{NN}` for locks, `{UC}-RC-IK{NN}` for idempotency keys, `{UC}-RC-R{NN}` for recovery procedures.

#### 4.5.5 Read-back and present

Run the read-back query in `runtime-contract.cypher` § 6 and present the full subgraph to the user before advancing to Phase 5:

```
Runtime Contract for {UC-ID}:
  States ({N}): {list with initial / terminal markers}
  Transitions ({M}):
    | # | name | from -> to | trigger | txn_boundary | lock_strategy | retry_policy | idempotency_key | cancel_race_note |
  Events ({E}): {list with lifecycle (pre/post-commit) and transport}
  Locks ({L}): {list with resource and mode}
  Idempotency keys ({IK}): {list with source / scope / ttl}
  Recovery procedures ({R}): {list with trigger / action}
  Cancel-race edges: {list of RESOLVES_RACE_WITH with winner and rule}

Mandatory-field checklist:
  [OK / MISSING] State machine
  [OK / MISSING] Txn boundary per transition
  [OK / MISSING] Lock strategy per transition
  [OK / MISSING] Emitted events with lifecycle
  [OK / MISSING] Retry semantics per transition
  [OK / MISSING] Cancel-while-X race resolution
  [OK / MISSING] Recovery procedure
  [OK / MISSING] Idempotency key strategy

Confirm to advance to Phase 5?
```

If any of the eight is MISSING, refuse to advance — stop with `BLOCKED — runtime_contract_incomplete`.

---

### Phase 5: Validation and Report

#### 5.1 Full UC subgraph query

Run the complete UC context query to verify everything is connected:

```cypher
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc)
RETURN uc,
       collect(DISTINCT as_step) AS activity_steps,
       collect(DISTINCT f) AS forms,
       collect(DISTINCT ff) AS form_fields,
       collect(DISTINCT da) AS domain_attributes,
       collect(DISTINCT de) AS domain_entities,
       collect(DISTINCT rq) AS requirements,
       collect(DISTINCT sr) AS roles,
       collect(DISTINCT ws) AS ba_steps
```

#### 5.2 Validation checks

Run each check and collect findings:

**Check 1: Orphaned FormFields (no MAPS_TO)**

```cypher
MATCH (uc:UseCase {id: $ucId})-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
WHERE ff.field_type IN ['text', 'textarea', 'number', 'date', 'datetime', 'select', 'multiselect', 'checkbox', 'file']
  AND NOT (ff)-[:MAPS_TO]->(:DomainAttribute)
RETURN f.id AS form_id, ff.id AS field_id, ff.label AS label
```

**Check 2: UC without requirements**

```cypher
MATCH (uc:UseCase {id: $ucId})
WHERE NOT (uc)-[:HAS_REQUIREMENT]->(:Requirement)
RETURN uc.id AS uc_id
```

**Check 3: Steps without form reference (for User-type steps)**

```cypher
MATCH (uc:UseCase {id: $ucId})-[:HAS_STEP]->(as_step:ActivityStep)
WHERE as_step.actor = 'User' AND as_step.form_ref IS NULL
RETURN as_step.id AS step_id, as_step.description AS description
```

**Check 4: BA traceability intact**

```cypher
MATCH (uc:UseCase {id: $ucId})
WHERE NOT (:WorkflowStep)-[:AUTOMATES_AS]->(uc)
RETURN uc.id AS uc_id
```

#### 5.3 Update UC status

```cypher
MATCH (uc:UseCase {id: $ucId})
SET uc.detail_status = 'detailed',
    uc.updated = datetime()
RETURN uc.id AS id, uc.detail_status AS status
```

#### 5.4 Present report

```
Detail complete for {UC-ID} ({uc.name}):

  Activity Steps: {N} ({M} User, {K} System)
  Forms: {N} with {F} total fields
  MAPS_TO edges: {N} (field -> domain attribute)
  Requirements: {N}
  BA traceability: {ws_id} -> {UC-ID} (intact)

Validation:
  [OK / WARNING] Orphaned fields: {count}
  [OK / WARNING] Requirements present: {yes/no}
  [OK / WARNING] User steps with forms: {all/missing}
  [OK / WARNING] BA traceability: {intact/broken}

Traceability chain:
  {ws_id} -[AUTOMATES_AS]-> {UC-ID} -[USES_FORM]-> {forms} -[HAS_FIELD]-> {field_count} fields -[MAPS_TO]-> {attr_count} attributes

Next: detail another UC with `/nacl-sa-uc detail UC-{NNN}` or validate all with `/nacl-sa-validate`.
```

#### 5.5 API Endpoint Suggestions

For each UC that has System-type ActivitySteps, propose API endpoints. Analyze the domain entities involved and the operations (create/read/update/delete) implied by the activity steps.

**Present to user for confirmation:**

```
Proposed API Endpoints for {UC-ID}:

| # | Endpoint ID | Method | Path | Request DTO | Response DTO | Domain Entity |
|---|-------------|--------|------|-------------|--------------|---------------|
| 1 | api-{path} | POST | /api/{resource} | Create{Entity}Dto | {Entity}Response | {DE-name} |
| 2 | api-{path} | GET | /api/{resource}/:id | --- | {Entity}Response | {DE-name} |

Confirm or modify?
```

After user confirms, create APIEndpoint nodes and link them:

```cypher
MERGE (api:APIEndpoint {id: $id})
SET api.method = $method,
    api.path = $path,
    api.request_dto = $reqDto,
    api.response_dto = $resDto,
    api.description = $description,
    api.updated = datetime()
RETURN api.id AS id
```

Link UC to APIEndpoint:

```cypher
MATCH (uc:UseCase {id: $ucId}), (api:APIEndpoint {id: $apiId})
MERGE (uc)-[:EXPOSES]->(api)
RETURN uc.id AS uc_id, api.id AS api_id
```

Link APIEndpoint to DomainEntity (CONSUMES for input, PRODUCES for output):

```cypher
MATCH (api:APIEndpoint {id: $apiId}), (de:DomainEntity {id: $deId})
MERGE (api)-[:CONSUMES]->(de)
```

```cypher
MATCH (api:APIEndpoint {id: $apiId}), (de:DomainEntity {id: $deId})
MERGE (api)-[:PRODUCES]->(de)
```

#### 5.6 Post-detail check: undetailed UCs

After completing detail for one UC, query the graph for UCs that still lack forms:

```cypher
MATCH (uc:UseCase)
WHERE NOT (uc)-[:USES_FORM]->()
RETURN uc.id AS uc_id, uc.name AS uc_name
ORDER BY uc.id
```

If any UCs are returned, show:

> Следующие UC ещё не детализированы: {list of uc_id}. Вызовите `/nacl-sa-uc detail <UC-ID>` для каждого.

This ensures the user is actively reminded about remaining undetailed UCs after each `detail` invocation, preventing partial detailing of the UC registry.

---

# Command: `list`

## Purpose

Show all UseCase nodes from the graph with their detail status and key metrics.

## Query

```cypher
MATCH (uc:UseCase)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc)
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
RETURN uc.id AS uc_id,
       uc.name AS uc_name,
       uc.priority AS priority,
       uc.detail_status AS detail_status,
       m.name AS module,
       sr.name AS actor,
       ws.id AS ba_step,
       count(DISTINCT as_step) AS steps,
       count(DISTINCT f) AS forms,
       count(DISTINCT ff) AS fields,
       count(DISTINCT rq) AS requirements
ORDER BY uc.id
```

## Output format

```
Use Case Registry ({N} total):

| UC ID | Name | Actor | Module | Priority | Detail Status | Steps | Forms | Fields | RQs | BA Step |
|-------|------|-------|--------|----------|---------------|-------|-------|--------|-----|---------|
| UC-101 | ... | ... | ... | MVP | detailed | 5 | 2 | 8 | 3 | BP-001-S03 |
| UC-102 | ... | ... | ... | MVP | not_started | 0 | 0 | 0 | 0 | BP-001-S05 |

Summary:
  Detailed: {N} / {Total} ({pct}%)
  Not started: {N}
  MVP: {N}, Post-MVP: {N}

Next actions:
  - UCs needing detail: {list of not_started UC IDs}
  - Run `/nacl-sa-uc detail UC-{NNN}` to detail a specific UC
```

---

# Command: `slices`

## Purpose

Author (or modify) the **behavior slices** of one UseCase: graph-native acceptance scenarios (Given/When/Then), each a vertical slice of observable behavior. A slice sits **below the UC, above the Task**: a UC has several slices; tasks stay per-UC (the slice layer is an **overlay** — per-slice tasks are deliberately out of scope). Stored graph-natively — `Slice` nodes with `HAS_SLICE` / `COVERS` / `CALLS` / `VERIFIED_BY` edges — so that a change to the UC, its screen machine, an endpoint, or a task **reaches the slice through the graph** (impact closure), and `nacl-sa-validate` L11 can statically check anchoring, ownership, and verification closure.

**Why a node, not more `acceptance_criteria` strings:** (a) a string cannot carry COVERS/CALLS anchors, so impact analysis can never reach it; (b) a node falls under the orphan check; (c) only a node can be VERIFIED_BY a task. The same three reification criteria as the Phase-1 Transition node.

**Anchor invariant (the validator enforces it as L11.2):** every slice carries at least one behavioral anchor — `COVERS` into the screen state machine and/or `CALLS` to an APIEndpoint. An anchorless slice is prose change propagation cannot reach; such text belongs in `UseCase.acceptance_criteria`, not in a node. There is deliberately no exemption flag.

**Namespace caution:** the `CALLS` edge-type name is shared with `(:ScreenEffect)-[:CALLS]->(:APIEndpoint)` — deliberately (identical semantics). Always label-qualify the source: `(sl:Slice)-[:CALLS]->`, never match `CALLS` bare.

## Parameters

- `UC-NNN` — the UseCase whose behavior is being sliced (one UC per invocation).

## Workflow

```
+-----------------+    +-----------------+    +-----------------+    +-----------------+
| Phase 1         |    | Phase 2         |    | Phase 3         |    | Phase 4         |
| Read UC context |--->| Propose slices  |--->| Write slices    |--->| Stamp staleness |
| (machine, APIs, |    | (from AC/steps/ |    | to graph        |    | + validate L11  |
|  tasks, slices) |    |  machine/RC)    |    | (MERGE, idem.)  |    | + report        |
+-----------------+    +-----------------+    +-----------------+    +-----------------+
```

**Do not proceed to the next phase without explicit user confirmation.**

---

### Phase 1: Read UC Context

#### 1.1 Query UC, its screen machine, endpoints, tasks, and any existing slices

```cypher
// uc_slice_context
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_SCREEN]->(scr:Screen)
OPTIONAL MATCH (uc)-[:EXPOSES]->(api:APIEndpoint)
OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)
OPTIONAL MATCH (uc)-[:HAS_SLICE]->(sl:Slice)
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
RETURN uc.id AS uc_id, uc.name AS uc_name, uc.has_ui AS has_ui,
       uc.acceptance_criteria AS acceptance_criteria,
       collect(DISTINCT scr.id) AS screens,
       collect(DISTINCT api.id) AS endpoints,
       collect(DISTINCT t.id) AS tasks,
       collect(DISTINCT sl.id) AS existing_slices,
       count(DISTINCT as_step) AS step_count,
       count(DISTINCT rq) AS requirement_count
```

**Guards:**
- If the UC does not exist → STOP, report.
- If `coalesce(uc.has_ui, true) = true` and the UC has **no Screen** → STOP: slices of a UI UC anchor into the screen state machine; author it first with `/nacl-sa-ui state-machine UC-NNN`, then re-run. Do not author floating slices.
- If `has_ui = false` (backend-only UC) → CALLS-only mode: slices anchor to APIEndpoints (provisional path below if the UC has no `EXPOSES` yet); COVERS is not expected.
- If slices already exist → load them via the `sa_uc_slices` named query (`graph-infra/queries/sa-queries.cypher`) and present; the run becomes a MODIFY.

#### 1.2 Read the screen machine (UI UCs)

Run `sa_screen_machine($screenId)` and keep the state/transition ids at hand — Phase 2 proposes COVERS anchors against them.

---

### Phase 2: Propose the Slices

**Slice id derivation (deterministic):** `SLC-{NNN}-{PascalName}`, where `{NNN}` is the UC number (`UC-006` → `006`) and PascalName is derived from a **latin short scenario name**: kebab/snake/space → PascalCase (`happy-path` → `HappyPath`). When the display name is non-latin (default lang is ru), ask the user for (or propose) the latin short name — display `name` stays in the user's language, the id is always latin. Never embed screen or form names in the slice id.

**Sources, in priority order:** `acceptance_criteria` (if present — each criterion is a slice candidate; record its index in `criterion_index`) → ActivitySteps + Requirements → the screen machine's states/transitions → the RuntimeContract (for queue/async UCs). Real graphs often have empty `acceptance_criteria` — the machine and steps are then the primary source. Treat **placeholder ActivitySteps** (description `"--"` / empty, no `order`) as absent and fall through to the next source. For **backend-only UCs** the effective priority is: RuntimeContract transitions (when the subgraph exists) → Requirements → ActivitySteps; and if the UC *looks* queue/async (Requirements mention retry / restart / recover / idempotent / queue / worker) but has **no RuntimeContract subgraph**, surface a warning recommending `/nacl-sa-uc detail` Phase 4.5 — author the slices from Requirements, never invent the missing contract yourself.

**Canonical decompositions** (templates per screen archetype — guidance, not validator law; derive others when neither fits):

**A. Data-loading screen** (4 states / 4 transitions, Phase-1 archetype A):

| Slice | kind | COVERS | CALLS | then (essence) |
|-------|------|--------|-------|----------------|
| `HappyPath` | happy | `Loading` + `Loaded` states + Loading→Loaded transition | UC's endpoint | data is displayed |
| `EmptyResult` | alternate | `Empty` state + Loading→Empty transition | — | empty-state affordance shown |
| `LoadFailureRetry` | error | `Error` state + Loading→Error + Error→Loading (retry) transitions | UC's endpoint | error shown; retry re-fetches |

Every scenario passes through `Loading`; covering it once (in `HappyPath`) is enough — with that, the three canonical slices cover the whole 4-state machine and L11.7 reports zero gaps.

**B. Process screen** (Idle + busy stages, Phase-1 archetype B):

| Slice | kind | COVERS | CALLS | then (essence) |
|-------|------|--------|-------|----------------|
| `HappyPath` | happy | stage transitions + `Completed` state | each stage's mutate endpoint | operation completes, result visible |
| `FailureRetry` | error | `Failed` state + Failed→Idle (retry) transition | — | failure shown; user can restart |
| per-stage edge slices | edge | the stage's state/transitions | stage endpoint | as needed |

**C. Backend-only UC** (no screen): slices from RuntimeContract transitions / Requirements / ActivitySteps; anchors are `CALLS` only — one slice per observable API behavior (success, domain-error, idempotent-retry…). **Provisional-endpoint granularity:** one endpoint per **distinct backend operation/resource**, never one per slice — a trigger/mutation endpoint and a status/read endpoint are typically separate, and several slices share them (mirrors the sa-ui rule "one provisional endpoint per distinct backend operation"; the 3.3 example is a GET read — a POST trigger like `POST /api/internal/<pipeline>/{id}/run` is equally legal).

**`slice_kind` for backend-resilience scenarios** (the A/B tables only cover UI archetypes): recovery-after-crash and graceful degradation → `alternate` (the system still reaches an acceptable outcome by another path); a failure the user/caller observes as failure → `error`; idempotency, boundary, and race scenarios → `edge`.

**Authoring rules (the validator will enforce them as L11):**
1. Every slice has ≥1 anchor: `COVERS` → ScreenState/Transition and/or `CALLS` → APIEndpoint (L11.2; no exemption).
2. `COVERS` targets only your own UC's screen elements (L11.3).
3. `then` (observable outcome) is REQUIRED non-blank; `given`/`when` strongly recommended (L11.6a).
4. `slice_kind` ∈ {happy, alternate, error, edge} (L11.6b); include at least one `happy` slice (L11.8).
5. Together the slices should cover every state and transition of the machine (L11.7 — WARNING-level aspiration, partial coverage is legal).
6. If the UC is already planned (`GENERATES` tasks exist), every slice must get `VERIFIED_BY` in Phase 3 (L11.4).

**Present to user:** slice table (id, kind, given/when/then, COVERS, CALLS) + which machine elements remain uncovered. Ask for confirmation.

---

### Phase 3: Write the Slices (MERGE, idempotent)

All writes use `MERGE` on stable ids so re-running updates rather than duplicates.

#### 3.1 Slice node + parent

```cypher
// create_slice
MATCH (uc:UseCase {id: $ucId})
MERGE (sl:Slice {id: $sliceId})            // SLC-{NNN}-{PascalName}
SET sl.name = $name,
    sl.slice_kind = $sliceKind,            // happy|alternate|error|edge
    sl.given = $given,
    sl.when = $when,
    sl.then = $then,                       // REQUIRED non-blank
    sl.criterion_index = $criterionIndex,  // NULL when not derived from acceptance_criteria
    sl.created_by = 'nacl-sa-uc',
    sl.created_at = coalesce(sl.created_at, datetime()),
    sl.updated = datetime()
MERGE (uc)-[:HAS_SLICE]->(sl)
RETURN sl.id AS slice_id
```

#### 3.2 COVERS anchors (UI UCs)

```cypher
// link_slice_covers (once per covered state/transition)
MATCH (sl:Slice {id: $sliceId})
MATCH (x {id: $targetId})
WHERE x:ScreenState OR x:Transition
MERGE (sl)-[:COVERS]->(x)
RETURN sl.id AS slice, x.id AS covers
```

#### 3.3 CALLS anchors

```cypher
// link_slice_calls
MATCH (sl:Slice {id: $sliceId})
MATCH (api:APIEndpoint {id: $apiId})
MERGE (sl)-[:CALLS]->(api)
RETURN sl.id AS slice, api.id AS calls
```

**If the APIEndpoint does not exist yet** (UC has no `EXPOSES` — common before `nacl-tl-plan` has run): MERGE a **provisional** endpoint anchored to the UC, exactly as `nacl-sa-ui state-machine` does. Report every provisional endpoint created.

```cypher
// create_provisional_endpoint
MATCH (uc:UseCase {id: $ucId})
MERGE (api:APIEndpoint {id: $apiId})       // e.g. "api-result-get"
ON CREATE SET api.path = $path,            // e.g. "GET /api/result/{sessionId}"
              api.provisional = true,
              api.created_by = 'nacl-sa-uc',
              api.created_at = datetime()
MERGE (uc)-[:EXPOSES]->(api)
RETURN api.id AS endpoint, api.provisional AS provisional
```

#### 3.4 VERIFIED_BY — deterministic task rule

Skip when the UC has no `GENERATES` tasks yet (L11.4 stays silent; `nacl-tl-plan` creates these edges when it plans the UC). Otherwise:

- **Default rule (always applicable):** link the slice to **all** tasks the UC `GENERATES`.
- **Refinement (only when the task ids carry the canonical `-BE` / `-FE` suffixes):** slices with ≥1 `COVERS` anchor → the FE task(s); slices with ≥1 `CALLS` anchor → the BE task(s); a slice with both anchor types → both tasks.
- Real graphs may have non-canonical task ids (`TASK-FR029-W4-*`, `TECH-*`) and multi-owner tasks — the default rule covers them; never guess an aspect from a task title.

```cypher
// link_slice_verified_by (default rule)
MATCH (uc:UseCase {id: $ucId})-[:GENERATES]->(t:Task)
MATCH (sl:Slice {id: $sliceId})
MERGE (sl)-[:VERIFIED_BY]->(t)
RETURN sl.id AS slice, collect(t.id) AS verified_by
```

#### 3.5 MODIFY mode: removing slices

When the user removes a slice, `DETACH DELETE` exactly the removed nodes by id — never a label-wide delete. Re-pointing anchors of surviving slices = MERGE the new edge + DELETE the old edge explicitly.

---

### Phase 4: Stamp Staleness + Validate + Report

Authoring or changing behavior slices **changes the UC's shape**: tasks planned before the slices existed do not reflect them.

#### 4.1 Bump the UC spec version

```cypher
// bump_spec_version
MATCH (uc:UseCase {id: $ucId})
SET uc.spec_version = coalesce(uc.spec_version, 0) + 1
RETURN uc.id AS uc_id, uc.spec_version AS spec_version
```

#### 4.2 Stamp staleness — DIRECTED and TIGHT (never the broad closure)

The stamp follows the affected-UC list — **the same directed contract as `nacl-sa-feature` step 3g**: the UC's `GENERATES` tasks + tasks of UCs that transitively `DEPENDS_ON` it (`*1..5`), and the directly-changed UC itself. **Never stamp via the undirected `sa_impact_closure` traversal** — it fans out through shared ACTOR/Requirement nodes and marks half the project stale (measured 20–49× false radius). Two clean statements; report `count(DISTINCT ...)`, never a cartesian row count. `stale_origin` is the UC id — a slice batch has one cause: this UC's behavior layer changed.

```cypher
// stamp_stale_tasks (1/2) — the re-plan units
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)
WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
UNWIND affected AS a
MATCH (a)-[:GENERATES]->(t:Task)
SET t.review_status = 'stale',
    t.stale_reason = 'behavior slices ' + $changeKind + ' for ' + $ucId,
    t.stale_since = datetime(),
    t.stale_origin = $ucId
RETURN count(DISTINCT t) AS tasks_stamped
```

```cypher
// stamp_stale_uc (2/2) — the directly-changed UC itself
MATCH (uc:UseCase {id: $ucId})
SET uc.review_status = 'stale',
    uc.stale_reason = 'behavior slices ' + $changeKind + ' for ' + $ucId,
    uc.stale_since = datetime(),
    uc.stale_origin = $ucId
RETURN count(uc) AS ucs_stamped
```

`$changeKind` ∈ {'created', 'modified'}. The flags are cleared by `nacl-tl-plan` when it re-plans the UC (which also bakes the slices into task context and re-links VERIFIED_BY).

#### 4.3 Validate the slices (scoped L11)

Run the L11 checks from `nacl-sa-validate` (canonical queries live there) scoped to this UC. **Scope recipe:** anchor every UC-bound query on `(uc:UseCase {id: $ucId})`; for the non-anchored checks L11.0/L11.1, filter by the id family instead: `WHERE sl.id STARTS WITH 'SLC-' + $nnn + '-'` (the UC-number infix makes every slice id of one UC match). Any CRITICAL finding → present it and return to Phase 2; do not leave broken slices in the graph.

#### 4.4 Report

```
Behavior slices written: UC-NNN ({uc name})

Slices: {N} ({K} happy / {K} alternate / {K} error / {K} edge)
Anchors: {N} COVERS ({list of covered states/transitions}), {N} CALLS {(+ M provisional APIEndpoint)}
Verification: {N slices} x {M tasks} = {N*M} VERIFIED_BY (default rule, tasks: {task ids once})
              | per-aspect: {FE task <- K slices, BE task <- K slices} | deferred (UC not planned yet)
Machine coverage: {N}/{M} states, {N}/{M} transitions covered{; uncovered: list}

Staleness stamped (directed): {N} tasks + 1 UC (origin: UC-NNN)
spec_version: UC-NNN {old} -> {new}

L11 validation: {PASS | N findings}

Next:
  - `/nacl-tl-plan` to (re-)plan the UC (clears the stale flags, re-links VERIFIED_BY)
  - `/nacl-sa-validate internal` for the full gate
```

---

# Command: `errors`

## Purpose

Author (or modify) the **domain errors** observable through one UseCase's API surface: a transport-independent taxonomy of named failure modes. A `DomainError` is a catalogued, caller-observable failure (`PROMO_NOT_FOUND`) — the `code` is the source of truth, the HTTP status only a projection hint. An `ErrorPresentation` is how one error is presented to the user (user-language message + presentation kind). Stored graph-natively — `(:Module)-[:HAS_ERROR]->(:DomainError)` with `MAY_RAISE` / `HANDLES` / `PRESENTED_AS` / `SHOWS` edges — so that a change to the UC, an endpoint, a screen state, or the error itself **reaches every affected artifact through the graph** (impact closure), and `nacl-sa-validate` L12 can statically check ownership, raisability, handling channels, and presentation closure.

**Errors are shared vocabulary, not UC property.** The catalog is module-scoped: the same `ALREADY_SUBSCRIBED` is raised by endpoints of different UCs. The command is invoked per-UC (that is where the authoring context lives — requirements, machine, slices), but `DomainError` nodes are MERGEd by id: a second UC raising the same error adds a `MAY_RAISE` edge, never a duplicate node.

**Anchor invariant (the validator enforces it as L12.2, no exemption):** every DomainError is raisable at ≥1 API surface (`MAY_RAISE`); every ErrorPresentation is shown by ≥1 screen state (`SHOWS`). A failure mode observable at no endpoint is an implementation detail — it belongs in Requirements / RuntimeContract notes, not in a node. Pipeline failures of backend UCs are observable through their status endpoint — that endpoint is the surface.

**No shared edge names** (unlike `CALLS` in `slices`): `HAS_ERROR`, `MAY_RAISE`, `HANDLES`, `PRESENTED_AS`, `SHOWS` are all unshared — no label-qualification hazard.

## Parameters

- `UC-NNN` — the UseCase through whose API surface the errors are being catalogued (one UC per invocation).

## Workflow

```
+-----------------+    +-----------------+    +-----------------+    +-----------------+
| Phase 1         |    | Phase 2         |    | Phase 3         |    | Phase 4         |
| Read UC context |--->| Propose errors  |--->| Write taxonomy  |--->| Stamp staleness |
| (module, APIs,  |    | (from reqs/     |    | to graph        |    | + validate L12  |
|  machine, slices,|   |  slices/RC/     |    | (MERGE, idem.)  |    | + report        |
|  requirements)  |    |  machine)       |    |                 |    |                 |
+-----------------+    +-----------------+    +-----------------+    +-----------------+
```

**Do not proceed to the next phase without explicit user confirmation.**

---

### Phase 1: Read UC Context

#### 1.1 Query UC, its module, endpoints, machine, slices, requirements, and existing errors

```cypher
// uc_error_context
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
OPTIONAL MATCH (uc)-[:EXPOSES]->(api:APIEndpoint)
OPTIONAL MATCH (uc)-[:HAS_SCREEN]->(scr:Screen)
OPTIONAL MATCH (uc)-[:HAS_SLICE]->(sl:Slice)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (api)-[:MAY_RAISE]->(existing:DomainError)
RETURN uc.id AS uc_id, uc.name AS uc_name, uc.has_ui AS has_ui,
       m.id AS module_id,
       collect(DISTINCT api.id) AS endpoints,
       collect(DISTINCT scr.id) AS screens,
       collect(DISTINCT {id: sl.id, kind: sl.slice_kind}) AS slices,
       count(DISTINCT rq) AS requirement_count,
       collect(DISTINCT existing.id) AS existing_errors
```

Also read the requirements' text (errors usually live there — real graphs carry explicit codes like `404 PROMO_NOT_FOUND` in requirement descriptions) and the module's existing error catalog (`MATCH (m)-[:HAS_ERROR]->(err) RETURN err` — MODIFY candidates and MERGE targets for shared errors).

**Read the RuntimeContract in BOTH formats.** Current format: `(:UseCase)-[:CONTAINS_RUNTIME_CONTRACT]->(:RuntimeContract)` with `RuntimeState`/`RuntimeTransition` subgraph. **Legacy format (real migrated graphs):** `(:UseCase)-[:HAS_RUNTIME_CONTRACT]->(:RuntimeContract)` with flat string properties (`durable_state_machine`, `retry_semantics`, `recovery_procedure`, …) and **no state/transition nodes**. Treat legacy flat strings as a source HINT only — never anchor edges to RC nodes, never invent contract structure that is not there.

**Guards:**
- If the UC does not exist → STOP, report.
- If the UC has **no Module** (`CONTAINS_UC` missing) → STOP: the error catalog is module-owned (`HAS_ERROR` is the required parent — L12.1); wire the UC into a module first (`/nacl-sa-architect`). Real graphs do contain module-less UCs — do not guess a module.
- If `has_ui = false` (backend-only UC) → **MAY_RAISE-only mode**: no HANDLES, no SHOWS, no presentations — for a machine-to-machine caller the HTTP envelope IS the presentation. The taxonomy half (DomainError + MAY_RAISE) is authored in full.
- If `coalesce(uc.has_ui, true) = true` and the UC has **no Screen** → WARN and proceed **taxonomy-only** (DomainError + MAY_RAISE; defer HANDLES/SHOWS/presentations). Asymmetric to the `slices` STOP, deliberately: a slice's primary UI anchor is the machine, but an error's primary anchor is the endpoint, which exists (or is created provisionally) regardless. The handling gap self-signals: L12.7 lights up as soon as the machine is authored — recommend `/nacl-sa-ui state-machine UC-NNN`, then re-run `errors`.
- If the UC's endpoints already MAY_RAISE errors → load them with the `sa_uc_errors` named query (`graph-infra/queries/sa-queries.cypher`) and present; the run becomes a MODIFY.

---

### Phase 2: Propose the Errors

**DomainError id derivation (deterministic):** `ERR-{UPPER_SNAKE_CODE}` where the code is the **API-envelope join key**: domain-prefixed UPPER_SNAKE latin (`PROMO_NOT_FOUND`, never bare `NOT_FOUND` — prefix discipline keeps module catalogs collision-free). When requirements already name codes, use them verbatim. **ErrorPresentation id:** `ERRP-{CODE}-{PascalName}` where PascalName derives from the presentation kind/context by the Phase-1 latin rule (`ERRP-PROMO_NOT_FOUND-Inline`).

**Sources, in priority order:** error-bearing Requirements (explicit codes and statuses — the richest source in real graphs) → `error`-kind behavior slices (their given/when/then describe observable failures; read via `sa_uc_slices`) → RuntimeContract (current subgraph or legacy flat strings — hints only) → the machine's `error`/`Failed` states. Treat placeholder text as absent (the `slices` rule applies).

**Granularity rule:** one DomainError per code the API envelope can **distinguish**. If the envelope distinguishes (`PROMO_BLOCKED` vs `PROMO_EXPIRED`), the graph distinguishes; field-level form validation is ONE `VALIDATION_FAILED` error (the field details live in the presentation message), mirroring the provisional-endpoint granularity rule ("one endpoint per distinct backend operation, never one per slice").

**`error_kind` mapping** (transport-independent; HTTP status is the hint, not the truth):

| Observable failure | error_kind | typical http_status |
|---|---|---|
| Caller's input malformed / fails validation | `validation` | 400 / 422 |
| Referenced thing does not exist | `not_found` | 404 |
| State conflict: duplicates, races, already-done, not-restartable | `conflict` | 409 |
| Caller lacks rights / not authenticated | `permission` | 401 / 403 |
| Caller over quota / throttled | `rate_limit` | 429 |
| Upstream provider / external dependency failed | `external` | 502 / 503 / 504 |
| Our invariant broken (bug class) | `internal` | 500 |

**Presentations (UI UCs with a machine):** for every error a screen state will handle, propose ≥1 presentation: `presentation_kind ∈ {toast, banner, inline, modal, fullscreen, silent}`, `message` in the **user's language, never the internal code** (`«Промокод не найден»`, not `PROMO_NOT_FOUND`), optional `recovery_action ∈ {retry, back, support, none}`. Deliberate silence is a `silent`-kind presentation whose message documents the observable absence ("stale data stays visible, no interruption") — silence must be a decision, not a gap.

**Handling proposal:** map each error to the machine state that represents it — typically the `error`-kind state(s); inline validation may be handled by a `content`-kind state. Only propose HANDLES where the **channel rule** holds: the screen has (or will have, via this run's MAY_RAISE writes) a `ScreenEffect-CALLS` to an endpoint that raises the error — L12.3 enforces exactly this.

**Present to user:** error table (id, code, kind, http_status, retryable, raised-by endpoints, source requirement/slice) + handling table (state × error × presentation kind/message) + which raisable errors remain unhandled. Ask for confirmation.

---

### Phase 3: Write the Taxonomy (MERGE, idempotent)

All writes use `MERGE` on stable ids so re-running updates rather than duplicates. **Collect every written/updated `err.id` into `$errIds`** — Phase 4's scoped validation needs the explicit list (errors are not UC-scoped).

#### 3.1 DomainError node + module parent

```cypher
// create_domain_error
MATCH (m:Module {id: $moduleId})
MERGE (err:DomainError {id: $errId})        // ERR-{UPPER_SNAKE_CODE}
SET err.code = $code,                       // REQUIRED non-blank — the envelope join key
    err.name = $name,
    err.description = $description,
    err.error_kind = $errorKind,            // validation|not_found|conflict|permission|rate_limit|external|internal
    err.http_status = $httpStatus,          // optional projection hint
    err.retryable = $retryable,             // optional
    err.created_by = 'nacl-sa-uc',
    err.created_at = coalesce(err.created_at, datetime()),
    err.updated = datetime()
MERGE (m)-[:HAS_ERROR]->(err)
RETURN err.id AS error_id
```

When the error already exists in **another** module's catalog (shared cross-module), MERGE by id picks up the existing node; do NOT re-parent it — the first catalog keeps ownership, your endpoints just add MAY_RAISE edges.

#### 3.2 MAY_RAISE anchors

```cypher
// link_may_raise (once per raising endpoint)
MATCH (err:DomainError {id: $errId})
MATCH (api:APIEndpoint {id: $apiId})
MERGE (api)-[:MAY_RAISE]->(err)
RETURN api.id AS endpoint, err.id AS may_raise
```

**If the APIEndpoint does not exist yet** (UC has no `EXPOSES` — common before `nacl-tl-plan` has run): MERGE a **provisional** endpoint anchored to the UC, exactly as `slices` § 3.3 does (`provisional = true` + `(:UseCase)-[:EXPOSES]->`). Same granularity rule: one endpoint per distinct backend operation (trigger vs status read), never one per error. Report every provisional endpoint created.

#### 3.3 HANDLES + presentations (UI UCs with a machine; skip in MAY_RAISE-only / taxonomy-only modes)

```cypher
// link_handles (only where the channel rule holds)
MATCH (st:ScreenState {id: $stateId})
MATCH (err:DomainError {id: $errId})
MERGE (st)-[:HANDLES]->(err)
RETURN st.id AS state, err.id AS handles
```

```cypher
// create_presentation + triangle closure
MATCH (err:DomainError {id: $errId})
MATCH (st:ScreenState {id: $stateId})
MERGE (p:ErrorPresentation {id: $presId})   // ERRP-{CODE}-{PascalName}
SET p.message = $message,                   // REQUIRED non-blank, user-language
    p.presentation_kind = $presentationKind, // toast|banner|inline|modal|fullscreen|silent
    p.recovery_action = $recoveryAction,
    p.created_by = 'nacl-sa-uc',
    p.created_at = coalesce(p.created_at, datetime()),
    p.updated = datetime()
MERGE (err)-[:PRESENTED_AS]->(p)
MERGE (st)-[:SHOWS]->(p)
RETURN p.id AS presentation
```

Write SHOWS **only** for states that HANDLE the error (L12.5 triangle); one presentation may be SHOWS-ed by several states (a shared retry toast).

#### 3.4 MODIFY mode: removing errors / presentations

`DETACH DELETE` exactly the removed nodes by explicit id — never a label-wide delete. Before deleting a DomainError, check for MAY_RAISE edges from OTHER UCs' endpoints (`MATCH (other:UseCase)-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(err) WHERE other.id <> $ucId`): if any exist, the error is shared — remove only YOUR endpoints' MAY_RAISE edges and report; never delete a node other UCs still raise.

---

### Phase 4: Stamp Staleness + Validate + Report

Authoring or changing the error contract **changes the UC's shape**: tasks planned before the errors existed do not reflect the contract their code must return.

#### 4.1 Bump the UC spec version

```cypher
// bump_spec_version
MATCH (uc:UseCase {id: $ucId})
SET uc.spec_version = coalesce(uc.spec_version, 0) + 1
RETURN uc.id AS uc_id, uc.spec_version AS spec_version
```

#### 4.2 Stamp staleness — DIRECTED and TIGHT (never the broad closure)

Same directed contract as `nacl-sa-feature` step 3g (the `slices` § 4.2 statements verbatim, with reason `'domain errors ' + $changeKind + ' for ' + $ucId`): the UC's `GENERATES` tasks + tasks of UCs that transitively `DEPENDS_ON` it (`*1..5`) + the changed UC itself; two statements; `count(DISTINCT)`; `stale_origin = $ucId`. **Never stamp via the undirected `sa_impact_closure`** (measured 20–51× false radius).

**Shared-error extension (the one new stamp semantic):** if this run **modified properties** of a DomainError that endpoints of OTHER UCs also raise (merely adding your own MAY_RAISE edges does not count — that changes your contract, not theirs), those raiser UCs' contracts changed too. Compute the raiser set directionally and stamp it with the same two-statement shape, with the ERROR as the lineage origin:

Two statements, exactly the 3g shape: tasks of raisers + their transitive
dependents first, then **only the raiser UCs themselves** (dependent UCs get
their tasks stamped, never the UC node — same as the base contract).

```cypher
// stamp_shared_raisers (1/2) — tasks of raisers + their DEPENDS_ON*1..5 dependents
MATCH (err:DomainError) WHERE err.id IN $modifiedSharedErrIds
MATCH (raiser:UseCase)-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(err)
WHERE raiser.id <> $ucId
WITH collect(DISTINCT raiser) AS raisers, collect(DISTINCT err.id) AS errIds
UNWIND raisers AS r
OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(r)
WITH errIds, collect(DISTINCT r) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
UNWIND affected AS a
MATCH (a)-[:GENERATES]->(t:Task)
SET t.review_status = 'stale',
    t.stale_reason = 'shared domain error ' + reduce(s='', e IN errIds | s + e + ' ') + 'modified via ' + $ucId,
    t.stale_since = datetime(),
    t.stale_origin = errIds[0]
RETURN count(DISTINCT t) AS raiser_tasks_stamped
```

```cypher
// stamp_shared_raisers (2/2) — only the raiser UCs themselves
MATCH (err:DomainError) WHERE err.id IN $modifiedSharedErrIds
MATCH (raiser:UseCase)-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(err)
WHERE raiser.id <> $ucId
SET raiser.review_status = 'stale',
    raiser.stale_reason = 'shared domain error modified via ' + $ucId,
    raiser.stale_since = datetime(),
    raiser.stale_origin = err.id
RETURN count(DISTINCT raiser) AS raiser_ucs_stamped
```

Still directed, still tight: the set is exactly the raisers (+ their dependents' tasks), never the broad closure. The flags are cleared by `nacl-tl-plan` when it re-plans each UC.

#### 4.3 Validate (scoped L12)

Run the L12 checks from `nacl-sa-validate` (canonical queries live there) scoped to this run. **Scope recipe:** errors are NOT UC-scoped — filter by the explicit id list collected in Phase 3: `WHERE err.id IN $errIds` (and presentations via `(err)-[:PRESENTED_AS]->(p)`). Any CRITICAL finding → present it and return to Phase 2; do not leave a broken taxonomy in the graph.

#### 4.4 Report

```
Domain errors written: UC-NNN ({uc name}, module {MOD-ID})

Errors: {N} ({K} new / {K} updated / {K} shared with other UCs)
  {ERR-ID}: {kind}, {http_status}, raised by {endpoint ids} [source: REQ-NNN | SLC-NNN-X | RC]
Anchors: {N errors} x {M endpoints} MAY_RAISE {(+ K provisional APIEndpoint)}
Handling: {N} HANDLES from {state ids} | deferred (no machine — run /nacl-sa-ui state-machine, then re-run) | n/a (backend-only)
Presentations: {N} ({K} inline / {K} toast / ...) — all SHOWS triangles closed

Staleness stamped (directed): {N} tasks + 1 UC (origin: UC-NNN)
  {+ shared-error stamp: {M} raiser UCs + {T} tasks (origin: ERR-X)}
spec_version: UC-NNN {old} -> {new}

L12 validation (scoped): {PASS | N findings}

Next:
  - `/nacl-tl-plan` to (re-)plan the UC (clears the stale flags, bakes the error contract into task files)
  - `/nacl-sa-validate internal` for the full gate
```

---

## Error Handling

### Neo4j unavailable

If any `mcp__neo4j__*` call fails with a connection error:

> Neo4j is not reachable. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running: `docker compose -f graph-infra/docker-compose.yml up -d`

### Missing BA data

If `stories` finds zero WorkflowSteps with `stereotype: "Автоматизируется"`:

> No automation scope found in graph. Ensure BA data is loaded. Run `/nacl-ba-sync` to synchronize BA board with Neo4j, then re-run `/nacl-sa-uc stories`.

### Missing domain model

If `detail` finds no DomainEntity realized from related BA entities:

> WARNING: No DomainEntities found for BA entities related to this UC. Form-domain mapping will be incomplete. Consider running `/nacl-sa-domain` first to create the domain model.

---

## Reads / Writes

### Reads

```yaml
# Neo4j (via MCP):
- mcp__neo4j__read-cypher    # BA scope, UC context, domain model, validation

# Shared references:
- nacl-core/SKILL.md         # ID rules, Neo4j connection, schema locations
```

### Writes

```yaml
# Neo4j (via MCP):
- mcp__neo4j__write-cypher   # UseCase, ActivityStep, Form, FormField, Requirement,
                              # RuntimeContract, RuntimeState, RuntimeTransition,
                              # RuntimeEvent, RuntimeLock, IdempotencyKey,
                              # RecoveryProcedure, Slice, DomainError,
                              # ErrorPresentation nodes
                              # (+ provisional APIEndpoint from the slices/errors commands)
                              # AUTOMATES_AS, CONTAINS_UC, ACTOR, HAS_STEP, USES_FORM,
                              # HAS_FIELD, MAPS_TO, HAS_REQUIREMENT, IMPLEMENTED_BY,
                              # CONTAINS_RUNTIME_CONTRACT, HAS_STATE,
                              # HAS_INITIAL_STATE, HAS_TERMINAL_STATE,
                              # HAS_TRANSITION, FROM_STATE, TO_STATE, ACQUIRES_LOCK,
                              # EMITS_EVENT, RESOLVES_RACE_WITH,
                              # USES_IDEMPOTENCY_KEY, HAS_RECOVERY,
                              # HAS_SLICE, COVERS, CALLS, VERIFIED_BY, EXPOSES,
                              # HAS_ERROR, MAY_RAISE, HANDLES, PRESENTED_AS, SHOWS edges
```

### Node types created

| Node | Properties |
|------|------------|
| UseCase | id, name, actor, priority, status, detail_status, runtime_contract, created, updated |
| ActivityStep | id, description, actor, order, form_ref, updated |
| Form | id, name, description, updated |
| FormField | id, name, label, field_type, required, order, updated |
| Requirement | id, description, source, rq_type, updated |
| RuntimeContract | id, uc_id, mandatory_reason, created, updated |
| RuntimeState | id, name, is_initial, is_terminal, description |
| RuntimeTransition | id, name, trigger, txn_boundary, lock_strategy, retry_policy, retry_parameters, idempotency_key_ref, cancel_race_note |
| RuntimeEvent | id, name, lifecycle, transport |
| RuntimeLock | id, resource, mode, timeout_ms |
| IdempotencyKey | id, source, scope, ttl_seconds |
| RecoveryProcedure | id, trigger, action, description |
| Slice | id, name, slice_kind, given, when, then, criterion_index, created_by, created_at, updated |
| DomainError | id, code, name, description, error_kind, http_status, retryable, created_by, created_at, updated |
| ErrorPresentation | id, message, presentation_kind, recovery_action, created_by, created_at, updated |
| APIEndpoint (provisional) | id, path, provisional, created_by, created_at — only when the slices/errors commands need an endpoint that does not exist yet |

### Edge types created

| Edge | From | To | Properties |
|------|------|----|------------|
| AUTOMATES_AS | WorkflowStep | UseCase | --- |
| CONTAINS_UC | Module | UseCase | --- |
| ACTOR | UseCase | SystemRole | --- |
| HAS_STEP | UseCase | ActivityStep | order (Int) |
| USES_FORM | UseCase | Form | --- |
| HAS_FIELD | Form | FormField | --- |
| MAPS_TO | FormField | DomainAttribute | --- |
| HAS_REQUIREMENT | UseCase | Requirement | --- |
| IMPLEMENTED_BY | BusinessRule | Requirement | --- |
| CONTAINS_RUNTIME_CONTRACT | UseCase | RuntimeContract | --- |
| HAS_STATE | RuntimeContract | RuntimeState | --- |
| HAS_INITIAL_STATE | RuntimeContract | RuntimeState | --- |
| HAS_TERMINAL_STATE | RuntimeContract | RuntimeState | --- |
| HAS_TRANSITION | RuntimeContract | RuntimeTransition | --- |
| FROM_STATE | RuntimeTransition | RuntimeState | --- |
| TO_STATE | RuntimeTransition | RuntimeState | --- |
| ACQUIRES_LOCK | RuntimeTransition | RuntimeLock | --- |
| EMITS_EVENT | RuntimeTransition | RuntimeEvent | --- |
| RESOLVES_RACE_WITH | RuntimeTransition | RuntimeTransition | rule, winner, note |
| USES_IDEMPOTENCY_KEY | RuntimeContract | IdempotencyKey | --- |
| HAS_RECOVERY | RuntimeContract | RecoveryProcedure | --- |
| HAS_SLICE | UseCase | Slice | --- (slices command) |
| COVERS | Slice | ScreenState / Transition | --- (slices command) |
| CALLS | Slice | APIEndpoint | --- (slices command; name shared with ScreenEffect→APIEndpoint — label-qualify the source) |
| VERIFIED_BY | Slice | Task | --- (slices command; also re-linked by nacl-tl-plan) |
| EXPOSES | UseCase | APIEndpoint | --- (slices/errors commands, provisional-endpoint path only) |
| HAS_ERROR | Module | DomainError | --- (errors command; required parent — module-scoped catalog) |
| MAY_RAISE | APIEndpoint | DomainError | --- (errors command; anchor invariant, legal on provisional endpoints) |
| HANDLES | ScreenState | DomainError | --- (errors command; channel rule — the screen actually calls a raising endpoint) |
| PRESENTED_AS | DomainError | ErrorPresentation | --- (errors command; required parent) |
| SHOWS | ScreenState | ErrorPresentation | --- (errors command; triangle closure with HANDLES) |

---

## Checklist

### Before completing `stories`
- [ ] BA automation scope queried (uncovered WorkflowSteps)
- [ ] UC candidates proposed with actor, module, priority
- [ ] User confirmed the candidate list
- [ ] UseCase nodes created with MERGE
- [ ] AUTOMATES_AS edges created (WorkflowStep -> UseCase)
- [ ] CONTAINS_UC edges created (Module -> UseCase)
- [ ] ACTOR edges created (UseCase -> SystemRole)
- [ ] Summary presented to user

### Before completing `detail`
- [ ] UC node and BA context read from graph
- [ ] ActivitySteps proposed and confirmed (max 10)
- [ ] ActivityStep nodes created, HAS_STEP edges created
- [ ] Forms identified, Form nodes created, USES_FORM edges created
- [ ] FormFields proposed with domain mapping, confirmed by user
- [ ] FormField nodes created, HAS_FIELD edges created
- [ ] **MAPS_TO edges created for all Data fields** (CRITICAL)
- [ ] MAPS_TO completeness validated (no orphaned Data fields)
- [ ] Requirements derived from BA rules + validation + behavior
- [ ] Requirement nodes created, HAS_REQUIREMENT edges created
- [ ] IMPLEMENTED_BY edges created (BusinessRule -> Requirement)
- [ ] **Runtime Contract decision tree run** (Phase 4.5)
- [ ] If mandatory: **RuntimeContract subgraph authored with all eight required fields** (state machine, txn boundary per transition, lock strategy per transition, emitted events with lifecycle, retry semantics, cancel-while-X race resolution, recovery procedure, idempotency key strategy) — CRITICAL
- [ ] If mandatory: CONTAINS_RUNTIME_CONTRACT edge created (UseCase -> RuntimeContract)
- [ ] If not mandatory: `uc.runtime_contract = 'not_required'` recorded on the UC node
- [ ] UC detail_status updated to `'detailed'`
- [ ] Full UC subgraph query run for verification
- [ ] Validation report presented to user

### Before completing `slices`
- [ ] UC context read (machine, endpoints, tasks, existing slices); guards applied (UI UC without Screen → STOP)
- [ ] Slices proposed from acceptance_criteria / steps / machine / RuntimeContract and confirmed by user
- [ ] Slice nodes MERGEd with non-blank `then`; HAS_SLICE edges created
- [ ] **Every slice has ≥1 anchor (COVERS and/or CALLS)** — CRITICAL (L11.2)
- [ ] COVERS targets belong to this UC's own screen; CALLS label-qualified
- [ ] Provisional endpoints (if any) created with EXPOSES anchor and reported
- [ ] VERIFIED_BY linked per the deterministic rule (or explicitly deferred — UC not planned)
- [ ] spec_version bumped
- [ ] Staleness stamped DIRECTED, same contract as sa-feature 3g (UC's tasks + transitive DEPENDS_ON-dependents' tasks `*1..5` + the changed UC itself; count(DISTINCT) reported) — never via broad sa_impact_closure
- [ ] Scoped L11 run clean (or findings fixed before completing)
- [ ] Report presented (slices, anchors, coverage, stamp counts, next steps)

### Before completing `errors`
- [ ] UC context read (module, endpoints, machine, slices, requirements, RC in BOTH formats, existing errors); guards applied (no Module → STOP; backend-only → MAY_RAISE-only; UI without machine → WARN + taxonomy-only)
- [ ] Errors proposed from requirements / error-slices / RC hints / machine and confirmed by user (codes domain-prefixed UPPER_SNAKE; one node per envelope-distinguishable code)
- [ ] DomainError nodes MERGEd by id (shared errors never duplicated; foreign-module errors never re-parented) with non-blank `code`; HAS_ERROR parent wired
- [ ] **Every error raisable: ≥1 MAY_RAISE from an endpoint** — CRITICAL (L12.2); provisional endpoints created with EXPOSES anchor and reported
- [ ] HANDLES written only where the channel rule holds; SHOWS only with HANDLES (triangle closed); every presentation has a non-blank user-language `message`
- [ ] MODIFY deletions by explicit id only; shared errors raised by other UCs never deleted
- [ ] spec_version bumped
- [ ] Staleness stamped DIRECTED, same contract as sa-feature 3g; shared-error property modifications additionally stamp raiser UCs (origin = ERR id) — never via broad sa_impact_closure
- [ ] Scoped L12 run clean (`WHERE err.id IN $errIds`) — or findings fixed before completing
- [ ] Report presented (errors, anchors, handling, presentations, stamp counts, next steps)

### Before completing `list`
- [ ] All UCs queried with metrics
- [ ] Summary with counts and percentages presented
- [ ] Next actions identified (UCs needing detail)

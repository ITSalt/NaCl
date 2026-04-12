---
name: nacl-sa-uc
model: opus
effort: high
description: |
  Реестр Use Cases из BA automation scope + детализация UC (Activity, формы, требования) через Neo4j граф.
  Используй когда пользователь просит: создать use cases из BA, реестр UC, детализировать UC,
  activity diagram, формы UC, nacl-sa-uc, stories, detail UC.
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
| `list` | --- | Show all UCs from graph with detail status |

---

## Shared References

Before executing any command, read and internalize:

- **`nacl-core/SKILL.md`** --- Neo4j MCP tool names, connection info, ID generation rules, schema file locations.
- **`graph-infra/schema/sa-schema.cypher`** --- SA node labels, constraints, relationship types.
- **`graph-infra/queries/sa-queries.cypher`** --- Named queries (sa_uc_full_context, sa_form_domain_mapping).
- **`graph-infra/queries/handoff-queries.cypher`** --- BA-to-SA traceability queries.

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
+------------------+     +------------------+     +------------------+     +------------------+     +------------------+
| Phase 1          |     | Phase 2          |     | Phase 3          |     | Phase 4          |     | Phase 5          |
| Read UC +        |---->| Activity         |---->| Forms +          |---->| Requirements     |---->| Validation +     |
| BA Context       |     | Steps            |     | Form-Domain Map  |     |                  |     | Report           |
+------------------+     +------------------+     +------------------+     +------------------+     +------------------+
```

**Do not proceed to the next phase without explicit user confirmation.**

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
    as.step_type = $stepType,
    as.order = $order,
    as.form_ref = $formRef,
    as.updated = datetime()
RETURN as.id AS id
```

Parameters:
- `$stepId` --- e.g. `"UC-101-AS01"`
- `$description` --- e.g. `"Открывает форму создания заказа"`
- `$stepType` --- `"User"` or `"System"`
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
WHERE as_step.step_type = 'User' AND as_step.form_ref IS NULL
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
- mcp__neo4j__write-cypher   # UseCase, ActivityStep, Form, FormField, Requirement nodes
                              # AUTOMATES_AS, CONTAINS_UC, ACTOR, HAS_STEP, USES_FORM,
                              # HAS_FIELD, MAPS_TO, HAS_REQUIREMENT, IMPLEMENTED_BY edges
```

### Node types created

| Node | Properties |
|------|------------|
| UseCase | id, name, actor, priority, status, detail_status, created, updated |
| ActivityStep | id, description, step_type, order, form_ref, updated |
| Form | id, name, description, updated |
| FormField | id, name, label, field_type, required, order, updated |
| Requirement | id, description, source, rq_type, updated |

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
- [ ] UC detail_status updated to `'detailed'`
- [ ] Full UC subgraph query run for verification
- [ ] Validation report presented to user

### Before completing `list`
- [ ] All UCs queried with metrics
- [ ] Summary with counts and percentages presented
- [ ] Next actions identified (UCs needing detail)

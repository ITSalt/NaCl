---
name: nacl-render
model: sonnet
effort: low
description: |
  Convert Neo4j graph data into Markdown documents with Mermaid diagrams.
  Use when: render graph, generate docs, or the user says "/nacl-render md".
  Excalidraw board rendering moved to analyst-tool — see the file body.
---

# nacl-render -- Graph to Markdown Renderer

Skill converts Neo4j graph data into human-readable Markdown documents with auto-generated Mermaid diagrams. Excalidraw board rendering has moved to the analyst-tool backend (see "Excalidraw Rendering — moved to analyst-tool" below).

## Invocation

```
/nacl-render md <command> [args] [--output <path>]
```

## Dependencies

- `nacl-core/SKILL.md` -- shared Neo4j connection and schema references
- Neo4j MCP tools: `mcp__neo4j__read-cypher`
- Graph-infra queries: `graph-infra/queries/sa-queries.cypher`, `graph-infra/queries/handoff-queries.cypher`, `graph-infra/queries/ba-queries.cypher`

## Shared Conventions

### Output Modes

Every `md` command supports two output modes:

1. **Terminal** (default) -- print the rendered markdown directly to the terminal so the user can review and copy.
2. **File** (`--output <path>`) -- write the rendered markdown to the specified file path and confirm with a short message.

When `--output` is provided, always use the absolute path. If the target directory does not exist, create it.

### Neo4j Access

All queries use `mcp__neo4j__read-cypher`. Never use `write-cypher` from this skill -- rendering is strictly read-only.

### Mermaid Generation Principle

Mermaid diagrams are AUTO-GENERATED from graph structure, never hand-written. The mapping rules are:

| Graph Pattern | Mermaid Syntax | Diagram Type |
|---|---|---|
| `(de:DomainEntity)` + `HAS_ATTRIBUTE` + `RELATES_TO` | `class` blocks + association arrows | `classDiagram` |
| `(as:ActivityStep)` + `step_number` ordering | `flowchart TD` nodes + arrows with swimlanes | `flowchart` |
| `(es:EntityState)` + `TRANSITIONS_TO` | `stateDiagram-v2` states + transitions | `stateDiagram` |
| `(ff:FormField)` + `MAPS_TO` + `DomainAttribute` | `flowchart LR` field -> attribute -> entity | `flowchart` |

### Mermaid ID Sanitization

Neo4j IDs may contain hyphens (e.g. `UC-101`). Mermaid node IDs must be alphanumeric. Rule:

```
mermaidId = graphId.replace(/-/g, '_')
```

Example: `UC-101` becomes `UC_101`, `OBJ-001-A01` becomes `OBJ_001_A01`.

---

## Commands: Markdown Rendering

---

### `/nacl-render md entity <id>`

Render a single DomainEntity as a full markdown document with class diagram.

#### Step 1: Fetch Data

```cypher
// Query: render_entity_full
// Params: $entityId -- DomainEntity.id (e.g. "DE-Order")
MATCH (de:DomainEntity {id: $entityId})
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ENUM]->(en:Enumeration)-[:HAS_VALUE]->(ev:EnumValue)
OPTIONAL MATCH (de)<-[:REALIZED_AS]-(be:BusinessEntity)
OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de,
       collect(DISTINCT da) AS attributes,
       collect(DISTINCT {target_id: de2.id, target_name: de2.name, rel_type: rel.rel_type, cardinality: rel.cardinality}) AS relationships,
       collect(DISTINCT {enum_name: en.name, enum_id: en.id, values: collect(DISTINCT ev.value)}) AS enumerations,
       be.id AS ba_source_id, be.name AS ba_source_name,
       m.id AS module_id, m.name AS module_name;
```

> Note: The enumerations subquery above may need to be split into two queries if Neo4j raises a nested `collect` error. In that case, run a separate query:
> ```cypher
> MATCH (de:DomainEntity {id: $entityId})-[:HAS_ENUM]->(en:Enumeration)
> OPTIONAL MATCH (en)-[:HAS_VALUE]->(ev:EnumValue)
> RETURN en.id, en.name, collect(ev.value) AS values;
> ```

#### Step 2: Generate Mermaid classDiagram

Map graph data to Mermaid syntax:

```
classDiagram
    class {de.name} {
        // For each da in attributes:
        +{da.data_type} {da.name}
    }

    // For each relationship:
    {de.name} "{rel.cardinality left}" --> "{rel.cardinality right}" {target_name} : {rel.rel_type}

    // For each enumeration:
    class {en.name} {
        <<enumeration>>
        // For each value:
        {ev.value}
    }
    {de.name} --> {en.name}
```

**Cardinality mapping** (`rel.cardinality` string to Mermaid):

| Graph `cardinality` | Left side | Right side | Example |
|---|---|---|---|
| `1:N` | `"1"` | `"*"` | `Order "1" --> "*" OrderItem` |
| `N:1` | `"*"` | `"1"` | `OrderItem "*" --> "1" Order` |
| `N:M` | `"*"` | `"*"` | `User "*" --> "*" Role` |
| `1:1` | `"1"` | `"1"` | `User "1" --> "1" Profile` |

#### Step 3: Fill Template

```markdown
---
title: "{de.name}"
type: entity
module: {module_name}
generated_from: graph
date: {YYYY-MM-DD}
---

# {de.name}

## Описание

{de.description}

## BA-источник

| BA-сущность | ID |
|---|---|
| {ba_source_name} | {ba_source_id} |

> Omit this section if ba_source_id is null.

## Диаграмма классов

```mermaid
classDiagram
    class {de.name} {
        +{da1.data_type} {da1.name}
        +{da2.data_type} {da2.name}
        ...
    }
    {de.name} "1" --> "*" {target_name} : {rel_type}
    ...
`` `

## Атрибуты

| Атрибут | Тип | Обязательный | Описание |
|---------|-----|--------------|----------|
| {da.name} | {da.data_type} | {da.required} | {da.description} |

## Связи

| Связь | Целевая сущность | Кардинальность | Тип |
|-------|-------------------|----------------|-----|
| {rel_type} | {target_name} | {cardinality} | {rel_type} |

## Справочники

| Справочник | Значения |
|------------|----------|
| {en.name} | {values joined with ", "} |

> Omit this section if no enumerations found.
```

---

### `/nacl-render md uc <id>`

Render a single UseCase as a full markdown document with activity flowchart.

#### Step 1: Fetch Data

```cypher
// Query: render_uc_full (reuses sa_uc_full_context pattern)
// Params: $ucId -- UseCase.id (e.g. "UC-101")
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(dep:UseCase)
RETURN uc,
       collect(DISTINCT as_step) AS activity_steps,
       collect(DISTINCT f) AS forms,
       collect(DISTINCT {field: ff, attr: da, entity: de}) AS field_mappings,
       collect(DISTINCT rq) AS requirements,
       collect(DISTINCT sr) AS roles,
       m.id AS module_id, m.name AS module_name,
       collect(DISTINCT dep) AS dependencies;
```

#### Step 2: Generate Mermaid Flowchart from ActivitySteps

Sort `activity_steps` by `step_number`. Map each step to a flowchart node, using `actor` property to assign swimlanes.

**Mapping rules:**

| ActivityStep property | Mermaid element |
|---|---|
| `as.actor = "User"` | Node in `subgraph User` |
| `as.actor = "System"` | Node in `subgraph System` |
| `as.step_type = "action"` | Rectangle: `A1[description]` |
| `as.step_type = "decision"` | Diamond: `D1{description}` |
| `as.step_type = "start"` | Stadium: `Start([description])` |
| `as.step_type = "end"` | Stadium: `End([description])` |
| Sequential steps | Arrow: `A1 --> A2` |

**Generation algorithm:**

```
flowchart TD
    // For each step sorted by step_number:
    //   nodeId = sanitize(step.id)
    //   If step_type == "decision":
    //     {nodeId}{"{"}description{"}"}
    //   Else if step_type in ["start","end"]:
    //     {nodeId}(["description"])
    //   Else:
    //     {nodeId}["{step.actor}: {step.description}"]
    //
    // Connect sequential steps:
    //   {prev_nodeId} --> {curr_nodeId}
    //
    // For decisions, use labels from step.branch_yes / step.branch_no if available
```

If steps have an `actor` property, group them into swimlanes:

```mermaid
flowchart TD
    subgraph User["User"]
        A1["Заполняет форму"]
        A3["Подтверждает"]
    end
    subgraph System["System"]
        A2["Валидирует данные"]
        A4["Сохраняет в БД"]
    end
    A1 --> A2
    A2 --> A3
    A3 --> A4
```

#### Step 3: Fill Template

```markdown
---
title: "{uc.id}. {uc.name}"
type: usecase
module: {module_name}
priority: {uc.priority}
generated_from: graph
date: {YYYY-MM-DD}
---

# {uc.id}. {uc.name}

## User Story

Как **{role.name}**, я хочу **{uc.goal}**, чтобы **{uc.benefit}**.

> Build the user story from uc.goal / uc.benefit properties. If those are absent, use uc.description.

## Актор

{role.name} ({role.id})

## Модуль

{module_name} ({module_id})

## Activity Diagram

```mermaid
flowchart TD
    ...auto-generated from activity_steps...
`` `

## Шаги сценария

| # | Актор | Описание | Тип |
|---|-------|----------|-----|
| {step.step_number} | {step.actor} | {step.description} | {step.step_type} |

## Формы

| Форма | Поля | Связанная сущность |
|-------|------|--------------------|
| {f.name} | {list of ff.name} | {de.name} |

## Требования

| ID | Описание | Тип | Приоритет |
|----|----------|-----|-----------|
| {rq.id} | {rq.description} | {rq.type} | {rq.priority} |

## Зависимости

| UC | Название |
|----|----------|
| {dep.id} | {dep.name} |

> Omit sections that have no data (empty collections).
```

---

### `/nacl-render md form <id>`

Render a form with field-to-attribute mapping diagram.

#### Step 1: Fetch Data

```cypher
// Query: render_form_mapping
// Params: $formId -- Form.id (e.g. "FORM-OrderCreate")
MATCH (f:Form {id: $formId})-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc:UseCase)-[:USES_FORM]->(f)
RETURN f,
       collect(DISTINCT {
         field_name: ff.name,
         field_id: ff.id,
         field_type: ff.field_type,
         field_label: ff.label,
         attr_name: da.name,
         attr_id: da.id,
         attr_type: da.data_type,
         entity_name: de.name,
         entity_id: de.id
       }) AS field_mappings,
       collect(DISTINCT uc) AS use_cases;
```

#### Step 2: Generate Mermaid Mapping Diagram

Build a `flowchart LR` that shows field -> attribute -> entity chains:

```
flowchart LR
    subgraph Form["{f.name}"]
        // For each field:
        {ff_mermaidId}["{ff.label}<br/><small>{ff.field_type}</small>"]
    end

    subgraph Domain["Domain Model"]
        // For each unique entity:
        subgraph {de_mermaidId}["{de.name}"]
            // For each attribute mapped to from this form:
            {da_mermaidId}["{da.name} : {da.data_type}"]
        end
    end

    // For each mapping:
    {ff_mermaidId} --> {da_mermaidId}
```

Fields with no `MAPS_TO` get a dashed arrow to a "unmapped" node:

```
    {ff_mermaidId} -.-> Unmapped["unmapped"]
```

#### Step 3: Fill Template

```markdown
---
title: "Форма: {f.name}"
type: form-mapping
generated_from: graph
date: {YYYY-MM-DD}
---

# Форма: {f.name}

## Связанные UC

| UC | Название |
|----|----------|
| {uc.id} | {uc.name} |

## Диаграмма маппинга

```mermaid
flowchart LR
    ...auto-generated field->attribute->entity mapping...
`` `

## Таблица полей

| Поле | Label | Тип поля | Атрибут | Тип атрибута | Сущность |
|------|-------|----------|---------|--------------|----------|
| {ff.name} | {ff.label} | {ff.field_type} | {da.name} | {da.data_type} | {de.name} |

## Покрытие

- Полей: {total_fields}
- Замаплено: {mapped_count} ({mapped_pct}%)
- Незамаплено: {unmapped_count}
```

---

### `/nacl-render md domain-model`

Render the full domain model: all entities, relationships, and attributes as a single class diagram.

#### Step 1: Fetch Data

```cypher
// Query: render_domain_model_full (reuses sa_domain_model pattern)
MATCH (de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ENUM]->(en:Enumeration)-[:HAS_VALUE]->(ev:EnumValue)
OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de,
       collect(DISTINCT da) AS attributes,
       collect(DISTINCT {target_id: de2.id, target_name: de2.name, rel_type: rel.rel_type, cardinality: rel.cardinality}) AS relationships,
       collect(DISTINCT {enum_id: en.id, enum_name: en.name, values: collect(DISTINCT ev.value)}) AS enumerations,
       m.name AS module_name;
```

> Same note as entity: if nested `collect` fails, run enumeration query separately.

#### Step 2: Generate Full Mermaid classDiagram

Build the class diagram from ALL entities at once:

```
classDiagram

    %% ===== ENTITIES =====
    // For each DomainEntity de:
    class {de.name} {
        // For each attribute da:
        +{da.data_type} {da.name}
    }

    %% ===== ENUMERATIONS =====
    // For each unique Enumeration en:
    class {en.name} {
        <<enumeration>>
        // For each value:
        {ev.value}
    }

    %% ===== RELATIONSHIPS =====
    // For each RELATES_TO edge (deduplicated):
    {source.name} "{left_card}" --> "{right_card}" {target.name} : {rel_type}

    // For each HAS_ENUM edge:
    {de.name} --> {en.name}
```

**Deduplication rule:** If both `A -> B` and `B -> A` exist for the same rel_type, keep only one (the one where `A.name < B.name` lexicographically).

#### Step 3: Fill Template

```markdown
---
title: "Domain Model"
type: domain-model
generated_from: graph
date: {YYYY-MM-DD}
---

# Domain Model

## Диаграмма классов

```mermaid
classDiagram
    ...auto-generated full class diagram...
`` `

## Сущности

| Сущность | Модуль | Атрибутов | Связей | Описание |
|----------|--------|-----------|--------|----------|
| {de.name} | {module_name} | {attr_count} | {rel_count} | {de.description} |

## Справочники

| Справочник | Значения |
|------------|----------|
| {en.name} | {values joined with ", "} |

## Ключевые связи

| Источник | Цель | Тип | Кардинальность |
|----------|------|-----|----------------|
| {source.name} | {target.name} | {rel_type} | {cardinality} |
```

---

### `/nacl-render md uc-index`

Render a UseCase registry table.

#### Step 1: Fetch Data

```cypher
// Query: render_uc_index
MATCH (uc:UseCase)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(dep:UseCase)
RETURN uc.id AS id,
       uc.name AS name,
       uc.priority AS priority,
       uc.status AS status,
       m.name AS module_name,
       collect(DISTINCT sr.name) AS actors,
       collect(DISTINCT dep.id) AS depends_on
ORDER BY uc.id;
```

#### Step 2: Fill Template

No Mermaid diagram needed for the index -- it is a pure table.

```markdown
---
title: "UC Index"
type: uc-index
generated_from: graph
date: {YYYY-MM-DD}
---

# Реестр Use Cases

| ID | Название | Модуль | Приоритет | Статус | Актор(ы) | Зависимости |
|----|----------|--------|-----------|--------|----------|-------------|
| {id} | {name} | {module_name} | {priority} | {status} | {actors joined} | {depends_on joined} |

## Статистика

- Всего UC: {total}
- Primary: {count where priority = "primary"}
- Secondary: {count where priority = "secondary"}
- По модулям: {module_name}: {count}, ...
```

---

### `/nacl-render md traceability`

Render the BA to SA traceability matrix.

#### Step 1: Fetch Data

Run the `handoff_traceability_matrix` query:

```cypher
// Query: handoff_traceability_matrix
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase)
RETURN 'Step→UC' AS category, ws.id AS ba_id, ws.function_name AS ba_name, uc.id AS sa_id, uc.name AS sa_name
UNION ALL
MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity)
RETURN 'Entity→Domain' AS category, be.id AS ba_id, be.name AS ba_name, de.id AS sa_id, de.name AS sa_name
UNION ALL
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
RETURN 'Role→SysRole' AS category, br.id AS ba_id, br.full_name AS ba_name, sr.id AS sa_id, sr.name AS sa_name
UNION ALL
MATCH (brq:BusinessRule)-[:IMPLEMENTED_BY]->(rq:Requirement)
RETURN 'Rule→Req' AS category, brq.id AS ba_id, brq.name AS ba_name, rq.id AS sa_id, rq.description AS sa_name;
```

Also fetch coverage stats:

```cypher
// Query: handoff_coverage_stats (from handoff-queries.cypher)
// ... full query as in graph-infra/queries/handoff-queries.cypher
```

#### Step 2: Fill Template

Group results by `category` and render four sections:

```markdown
---
title: "BA→SA Traceability Matrix"
type: traceability
generated_from: graph
date: {YYYY-MM-DD}
---

# Трассировочная матрица BA → SA

## Покрытие

| Категория | Покрыто | Всего | % |
|-----------|---------|-------|---|
| Шаги → UC | {covered} | {total} | {pct}% |
| Сущности → Domain | {covered} | {total} | {pct}% |
| Роли → SystemRole | {covered} | {total} | {pct}% |
| Правила → Requirements | {covered} | {total} | {pct}% |

## 1. Бизнес-шаги → Use Cases

| BA ID | BA Функция | SA ID | SA Use Case |
|-------|------------|-------|-------------|
| {ba_id} | {ba_name} | {sa_id} | {sa_name} |

## 2. Бизнес-сущности → Domain Entities

| BA ID | BA Сущность | SA ID | SA Domain Entity |
|-------|-------------|-------|------------------|
| {ba_id} | {ba_name} | {sa_id} | {sa_name} |

## 3. Бизнес-роли → System Roles

| BA ID | BA Роль | SA ID | SA System Role |
|-------|---------|-------|----------------|
| {ba_id} | {ba_name} | {sa_id} | {sa_name} |

## 4. Бизнес-правила → Requirements

| BA ID | BA Правило | SA ID | SA Requirement |
|-------|------------|-------|----------------|
| {ba_id} | {ba_name} | {sa_id} | {sa_name} |
```

---

## Graph-to-Mermaid Mapping Reference

This section is the canonical reference for how graph edges translate to Mermaid syntax. All `md` commands above use these rules.

### classDiagram (DomainEntity)

**Source:** `DomainEntity` + `HAS_ATTRIBUTE` edges + `RELATES_TO` edges + `HAS_ENUM` edges.

```
Graph Edge                          → Mermaid Syntax
────────────────────────────────────  ─────────────────────────────────────
(de)-[:HAS_ATTRIBUTE]->(da)         → attribute line inside class block:
                                        +{da.data_type} {da.name}

(de)-[:RELATES_TO {                 → association arrow:
   rel_type, cardinality}]->(de2)      {de.name} "{left}" --> "{right}" {de2.name} : {rel_type}

(de)-[:HAS_ENUM]->(en)              → dependency arrow + enumeration class:
                                        class {en.name} { <<enumeration>> ... }
                                        {de.name} --> {en.name}
```

### flowchart (ActivityStep)

**Source:** `UseCase` + `HAS_STEP` edges, `ActivityStep` nodes ordered by `step_number`.

```
Graph Data                          → Mermaid Syntax
────────────────────────────────────  ─────────────────────────────────────
as.step_type = "start"              → {id}(["description"])
as.step_type = "end"                → {id}(["description"])
as.step_type = "action"             → {id}["{actor}: description"]
as.step_type = "decision"           → {id}{"description"}
Sequential step_number              → {prev_id} --> {curr_id}
Decision branches                   → {id} -->|"Yes"| {yes_id}
                                      {id} -->|"No"| {no_id}
as.actor grouping                   → subgraph {actor}["..."] ... end
```

### stateDiagram (EntityState)

**Source:** `BusinessEntity` + `HAS_STATE` edges + `TRANSITIONS_TO` edges between `EntityState` nodes.

Used inside entity rendering when entity has lifecycle states.

```
Graph Edge                          → Mermaid Syntax
────────────────────────────────────  ─────────────────────────────────────
First state (no incoming            → [*] --> {state.name}
  TRANSITIONS_TO from other states)

(s1)-[:TRANSITIONS_TO               → {s1.name} --> {s2.name} : {condition}
  {condition}]->(s2)

Terminal state (no outgoing          → {state.name} --> [*]
  TRANSITIONS_TO)
```

**Cypher to fetch lifecycle (from ba-queries):**

```cypher
// Params: $entityId -- BusinessEntity.id that is linked via REALIZED_AS to this DomainEntity
MATCH (be:BusinessEntity {id: $entityId})-[:HAS_STATE]->(s:EntityState)
OPTIONAL MATCH (s)-[t:TRANSITIONS_TO]->(s2:EntityState)
RETURN s.name AS from_state, t.condition AS condition, s2.name AS to_state;
```

**Mermaid generation:**

```
stateDiagram-v2
    [*] --> {initial_state}
    {from_state} --> {to_state} : {condition}
    ...
    {terminal_state} --> [*]
```

### flowchart LR (Form Mapping)

**Source:** `Form` + `HAS_FIELD` + `MAPS_TO` + `DomainAttribute` + `HAS_ATTRIBUTE` + `DomainEntity`.

```
Graph Path                          → Mermaid Syntax
────────────────────────────────────  ─────────────────────────────────────
(f)-[:HAS_FIELD]->(ff)              → node in Form subgraph:
                                        {ff_id}["{ff.label}"]

(ff)-[:MAPS_TO]->(da)<-[:HAS_ATTR.. → arrow + node in Entity subgraph:
  IBUTE]-(de)                           {ff_id} --> {da_id}

ff with no MAPS_TO                  → dashed arrow to unmapped:
                                        {ff_id} -.-> Unmapped
```

---

## Excalidraw Rendering — moved to analyst-tool

> **The four `/nacl-render excalidraw {domain-model,context-map,activity,ba-process}` sub-commands have been removed.**
>
> Excalidraw board generation is now performed deterministically by the analyst-tool backend (`analyst-tool/server/src/render/excalidraw/`).
> It runs in milliseconds instead of minutes, produces zero-diff output for unchanged graphs, and is invoked through the analyst-tool UI (Sidebar → ↺ Regenerate per board).
>
> The Markdown rendering sub-commands (`/nacl-render md *`) remain in this skill until Wave 1 of the analyst-tool migration takes them over.

---

## Error Handling

| Situation | Action |
|---|---|
| Entity/UC/Form not found | Print: `ERROR: {type} with id "{id}" not found in graph.` |
| Neo4j connection failed | Print: `ERROR: Cannot connect to Neo4j. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running.` |
| Empty graph (no nodes) | Print: `WARNING: No {type} nodes found. Run seed data first (graph-infra/schema/seed-data.cypher).` |
| Mermaid ID collision after sanitization | Append numeric suffix: `{id}_1`, `{id}_2` |

## Examples

### Example: Render a single entity

```
/nacl-render md entity DE-Order
```

Output (abbreviated):

```markdown
# Order

## Диаграмма классов

` ``mermaid
classDiagram
    class Order {
        +UUID id
        +String orderNumber
        +DateTime orderDate
        +Decimal totalAmount
    }
    class OrderStatus {
        <<enumeration>>
        DRAFT
        CONFIRMED
        DELIVERED
        CANCELLED
    }
    Order "1" --> "*" OrderItem : contains
    Order "*" --> "1" Client : belongs_to
    Order --> OrderStatus
` ``

## Атрибуты

| Атрибут | Тип | Обязательный | Описание |
|---------|-----|--------------|----------|
| id | UUID | Да | Уникальный идентификатор |
| orderNumber | String | Да | Номер заказа |
| orderDate | DateTime | Да | Дата создания |
| totalAmount | Decimal | Нет | Сумма заказа |
...
```

### Example: Render UC with file output

```
/nacl-render md uc UC-101 --output docs/13-usecases/UC101-order-creation.md
```

### Example: Full traceability matrix

```
/nacl-render md traceability --output docs/20-traceability/ba-sa-matrix.md
```

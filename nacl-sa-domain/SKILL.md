---
name: nacl-sa-domain
model: opus
effort: high
description: |
  Domain Model through Neo4j graph: DomainEntity, DomainAttribute, Enumeration, relationships.
  Modes: IMPORT_BA (import from BA layer), CREATE (new entity), MODIFY (change entity), FULL (full module domain model).
  Use when: create domain model, import BA entities, add domain entity, modify attribute, create enumeration.
---

# /nacl-sa-domain — Domain Model (Graph)

## Purpose

Create and manage the Domain Model through Neo4j graph: entities, attributes, enumerations, inter-entity relationships, and BA-to-SA handoff edges. All data lives in Neo4j -- no markdown artifacts.

**Shared references:** `nacl-core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Read-only queries (fetch BA entities, check existing domain model) |
| `mcp__neo4j__write-cypher` | Create/update/delete nodes and edges |
| `mcp__neo4j__get-schema` | Introspect current graph schema |

---

## Modes

### Mode `IMPORT_BA`

Import BA business entities from Neo4j graph as DomainEntity candidates with full handoff traceability.

**When:** BA layer populated in Neo4j, SA domain model not yet created for those entities.

**Parameter:** `module` (optional) -- target module name. If omitted, imports all uncovered BA entities.

### Mode `CREATE`

Create a single new DomainEntity interactively with attributes, enumerations, and relationships.

**When:** User asks to add a new domain entity not sourced from BA.

**Parameter:** `entity_name` -- name of the entity to create.

### Mode `MODIFY`

Modify an existing DomainEntity: add/remove/change attributes, relationships, enumerations.

**When:** User asks to change an attribute, type, relationship, or cardinality on an existing entity.

**Parameter:** `entity_name` -- name of the entity to modify.

### Mode `FULL`

Create the complete domain model for a module: all entities, attributes, enumerations, relationships, lifecycle states, business rules.

**When:** After `nacl-sa-architect`, building full domain model for a module from scratch.

**Parameter:** `module` -- module name (must exist as a Module node in the graph).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--lang` | No | Output language: `en` or `ru` (default: `ru`). |

---

## Language

Supports `--lang=en` for English output. See [nacl-core/lang-directive.md](../nacl-core/lang-directive.md).
When `--lang=en`: all generated text, node names, descriptions in English.
Default: Russian (ru).

---

## Workflow: Mode IMPORT_BA

```
+-----------------+    +-----------------+    +-----------------+    +-----------------+
| Step 1          |    | Step 2          |    | Step 3          |    | Step 4          |
| Read uncovered  |--->| Classify &      |--->| Create nodes    |--->| Create handoff  |
| BA entities     |    | confirm types   |    | & attributes    |    | & rel edges     |
+-----------------+    +-----------------+    +-----------------+    +-----------------+
```

Each step ends with a summary and user confirmation before proceeding.

**Do not proceed to the next step without explicit user confirmation!**

---

### Step 1: Read uncovered BA entities

**Goal:** Find all BusinessEntity nodes (type: "Бизнес-объект") that have no REALIZED_AS edge yet.

**Cypher -- fetch uncovered BA entities:**

```cypher
// handoff_uncovered_entities
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
RETURN be.id AS id, be.name AS name, be.type AS type, be.description AS description
```

Execute via `mcp__neo4j__read-cypher`.

**If no results:** Tell the user all BA entities are already covered. Suggest `CREATE` or `FULL` mode instead.

**Cypher -- fetch all uncovered BA entities with attributes:**

```cypher
// ba_uncovered_entities_with_attributes
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
OPTIONAL MATCH (be)-[:HAS_ATTRIBUTE]->(ea:EntityAttribute)
RETURN be.id AS entity_id, be.name AS entity_name, be.description AS entity_desc,
       collect({
         id: ea.id,
         name: ea.name,
         data_type: ea.data_type,
         description: ea.description
       }) AS attributes
ORDER BY be.id
```

**Also fetch BA relationships between uncovered entities:**

```cypher
// ba_uncovered_entity_relationships
MATCH (be1:BusinessEntity {type: "Бизнес-объект"})-[r:RELATES_TO]->(be2:BusinessEntity {type: "Бизнес-объект"})
WHERE NOT (be1)-[:REALIZED_AS]->(:DomainEntity)
   OR NOT (be2)-[:REALIZED_AS]->(:DomainEntity)
RETURN be1.id AS source_id, be1.name AS source_name,
       r.rel_type AS rel_type, r.cardinality AS cardinality,
       be2.id AS target_id, be2.name AS target_name
```

**Also fetch BA entity states (for lifecycle mapping later):**

```cypher
// ba_uncovered_entity_states
MATCH (be:BusinessEntity {type: "Бизнес-объект"})-[:HAS_STATE]->(st:EntityState)
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
OPTIONAL MATCH (st)-[t:TRANSITIONS_TO]->(st2:EntityState)
RETURN be.id AS entity_id, be.name AS entity_name,
       st.id AS state_id, st.name AS state_name, st.description AS state_desc,
       t.condition AS transition_condition,
       st2.name AS target_state
```

**Also check which non-"Бизнес-объект" BA entities exist (for user awareness):**

```cypher
// ba_other_entity_types
MATCH (be:BusinessEntity)
WHERE be.type <> "Бизнес-объект"
  AND NOT (be)-[:REALIZED_AS]->(:DomainEntity)
RETURN be.id AS id, be.name AS name, be.type AS type, be.description AS description
```

**Present to user:**

```
**Uncovered BA entities found: {count}**

**Бизнес-объекты (will create DomainEntity):**
1. {name} ({id}) -- {description}
   Attributes: {attr_count}
   States: {state_count}

**Other types (need decision):**
- {name} ({id}, type: {type}) -- needs SA entity? (Y/N)

Proceed with import?
```

---

### Step 2: Classify and confirm SA types

**Goal:** For each BA entity, propose SA attribute types and get user confirmation.

**BA-to-SA type mapping reference:**

| BA data_type (EntityAttribute) | Suggested SA data_type (DomainAttribute) | Notes |
|-------------------------------|------------------------------------------|-------|
| Текст | String | Default text type |
| Число | Int or Decimal | Ask user: integer or decimal? |
| Дата | Date or DateTime | Ask user: date only or with time? |
| Ссылка | Reference | Becomes a RELATES_TO edge |
| Перечисление | Enum | Create Enumeration node |
| Логическое | Boolean | |

**Present for each entity:**

```
**Import BA entity: {BA name} ({BA id})**

BA attributes (business types):
| # | BA Attribute | BA Type     | Proposed SA Name | Proposed SA Type | Nullable |
|---|-------------|-------------|------------------|-----------------|----------|
| 0 | (auto)      | --          | id               | UUID            | false    |
| 1 | {ba_attr}   | {ba_type}   | {sa_name}        | {sa_type}       | {t/f}    |

Proposed SA entity:
- SA name: {EnglishName} (e.g. "Order", "Customer")
- SA id: DE-{EnglishName}
- Module: {module}

Questions:
1. Are the proposed SA types correct?
2. Add or remove attributes?
3. Which module should this entity belong to?
```

**Rules for SA name generation:**
- Use English PascalCase: "Заказ" -> "Order", "Позиция заказа" -> "OrderItem"
- Always add `id` attribute (UUID, not nullable) as the first attribute
- Convert "Ссылка" attributes to relationship edges (do not create as DomainAttribute)
- Convert "Перечисление" attributes to Enum type (will create Enumeration node in Step 3)

---

### Step 3: Create nodes and attributes in Neo4j

**Goal:** Create DomainEntity, DomainAttribute, and Enumeration nodes.

**Pre-check -- get next available DomainAttribute IDs:**

```cypher
// next_domain_attribute_id
MATCH (da:DomainAttribute)
WHERE da.id STARTS WITH $prefix
WITH max(toInteger(split(da.id, '-A')[1])) AS maxNum
RETURN $prefix + '-A' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 2, '0') AS nextId
```

If `apoc` is not available, compute the next ID in the agent and pass it as a parameter.

**Cypher -- create DomainEntity:**

```cypher
// create_domain_entity
MERGE (de:DomainEntity {id: $id})
SET de.name = $name,
    de.module = $module,
    de.description = $description
```

Parameters:
- `$id` -- format `DE-{EnglishName}` (e.g. "DE-Order")
- `$name` -- English PascalCase (e.g. "Order")
- `$module` -- module name (e.g. "orders")
- `$description` -- Russian description from BA entity

**Cypher -- link entity to module:**

```cypher
// link_entity_to_module
MATCH (m:Module {name: $moduleName}), (de:DomainEntity {id: $entityId})
MERGE (m)-[:CONTAINS_ENTITY]->(de)
```

**Cypher -- create DomainAttribute:**

```cypher
// create_domain_attribute
MERGE (da:DomainAttribute {id: $id})
SET da.name = $name,
    da.data_type = $dataType,
    da.nullable = $nullable,
    da.description = $description
```

Parameters:
- `$id` -- format `{EntityName}-A{NN}` (e.g. "Order-A01")
- `$name` -- camelCase attribute name (e.g. "orderNumber")
- `$dataType` -- one of: UUID, String, Int, Decimal, Boolean, Date, DateTime, Enum, JSON, Reference
- `$nullable` -- boolean
- `$description` -- Russian description

**Cypher -- link attribute to entity:**

```cypher
// link_attribute_to_entity
MATCH (de:DomainEntity {id: $entityId}), (da:DomainAttribute {id: $attrId})
MERGE (de)-[:HAS_ATTRIBUTE]->(da)
```

**Cypher -- create Enumeration with values:**

```cypher
// create_enumeration
MERGE (en:Enumeration {id: $id})
SET en.name = $name,
    en.description = $description
```

Parameters:
- `$id` -- format `ENUM-{Name}` (e.g. "ENUM-OrderStatus")
- `$name` -- English PascalCase (e.g. "OrderStatus")

**Cypher -- create EnumValue:**

```cypher
// create_enum_value
MERGE (ev:EnumValue {id: $id})
SET ev.value = $value,
    ev.description = $description
```

Parameters:
- `$id` -- format `{ENUM_ID}-V{NN}` (e.g. "ENUM-OrderStatus-V01")

**Cypher -- link enum to entity and values:**

```cypher
// link_enum_to_entity
MATCH (de:DomainEntity {id: $entityId}), (en:Enumeration {id: $enumId})
MERGE (de)-[:HAS_ENUM]->(en)
```

```cypher
// link_enum_value
MATCH (en:Enumeration {id: $enumId}), (ev:EnumValue {id: $valueId})
MERGE (en)-[:HAS_VALUE]->(ev)
```

**If BA entity has states (EntityState)**, create a corresponding Enumeration from them:
1. Map each EntityState.name to an EnumValue (uppercase, underscored: "Новый" -> "NEW")
2. Create Enumeration node
3. Link to entity via HAS_ENUM
4. Add the status DomainAttribute with data_type: "Enum"

---

### Step 3.5: Auto-create Enumerations from BA EntityStates

**Goal:** When a BA entity has EntityState nodes AND the corresponding DomainEntity has an attribute with `data_type: "Enum"` (typically `status`), automatically create Enumeration and EnumValue nodes.

This step runs after attribute creation (Step 3) and before relationship/handoff edges (Step 4).

**Cypher -- find BA states for a source entity:**

```cypher
// ba_entity_states_for_enum
MATCH (be:BusinessEntity {id: $baEntityId})-[:HAS_STATE]->(es:EntityState)
RETURN es.name ORDER BY es.id
```

**Cypher -- check if DomainEntity has an Enum attribute without an Enumeration:**

```cypher
// enum_attr_without_enumeration
MATCH (de:DomainEntity {id: $entityId})-[:HAS_ATTRIBUTE]->(da:DomainAttribute {data_type: "Enum"})
WHERE NOT (de)-[:HAS_ENUM]->(:Enumeration)
RETURN da.id AS attr_id, da.name AS attr_name
```

**If both queries return results**, create the Enumeration automatically:

1. Create Enumeration node:
```cypher
MERGE (e:Enumeration {id: "ENUM-" + $entityName + "Status"})
SET e.name = $entityName + "Status",
    e.description = "Auto-generated from BA EntityStates for " + $entityName
```

2. For each EntityState, create an EnumValue node:
```cypher
MERGE (ev:EnumValue {id: "ENUM-" + $entityName + "Status-V" + $seqNum})
SET ev.value = $stateName,
    ev.label = $stateName
```

3. Link values to enumeration and enumeration to entity:
```cypher
MATCH (e:Enumeration {id: $enumId}), (ev:EnumValue {id: $valueId})
MERGE (e)-[:HAS_VALUE]->(ev)
```

```cypher
MATCH (de:DomainEntity {id: $entityId}), (e:Enumeration {id: $enumId})
MERGE (de)-[:HAS_ENUM]->(e)
```

**Example:** BA entity `OBJ-UAZ-01` has EntityStates `Новый`, `Подтверждён`, `Отгружен`. DomainEntity `DE-SparePartList` has attribute `status` with `data_type: "Enum"`. This step creates:
- `Enumeration {id: "ENUM-SparePartListStatus", name: "SparePartListStatus"}`
- `EnumValue {id: "ENUM-SparePartListStatus-V01", value: "Новый", label: "Новый"}`
- `EnumValue {id: "ENUM-SparePartListStatus-V02", value: "Подтверждён", label: "Подтверждён"}`
- `EnumValue {id: "ENUM-SparePartListStatus-V03", value: "Отгружен", label: "Отгружен"}`
- Edges: `(DE-SparePartList)-[:HAS_ENUM]->(ENUM-SparePartListStatus)`, `(ENUM-SparePartListStatus)-[:HAS_VALUE]->(each EV)`

---

### Step 4: Create handoff and relationship edges

**Goal:** Create BA->SA traceability edges and inter-entity relationships.

**Cypher -- create REALIZED_AS handoff (BusinessEntity -> DomainEntity):**

```cypher
// handoff_realized_as
MATCH (be:BusinessEntity {id: $baEntityId}), (de:DomainEntity {id: $saEntityId})
MERGE (be)-[:REALIZED_AS]->(de)
```

**Cypher -- create TYPED_AS handoff (EntityAttribute -> DomainAttribute):**

```cypher
// handoff_typed_as
MATCH (ea:EntityAttribute {id: $baAttrId}), (da:DomainAttribute {id: $saAttrId})
MERGE (ea)-[:TYPED_AS]->(da)
```

**Cypher -- create RELATES_TO between DomainEntities:**

Inherit relationships from BA layer. Map BA rel_type/cardinality to SA equivalents:

| BA rel_type | SA rel_type |
|-------------|-------------|
| агрегация | composition |
| ассоциация | association |
| зависимость | dependency |

```cypher
// create_entity_relationship
MATCH (de1:DomainEntity {id: $sourceId}), (de2:DomainEntity {id: $targetId})
MERGE (de1)-[:RELATES_TO {rel_type: $relType, cardinality: $cardinality}]->(de2)
```

Parameters:
- `$sourceId`, `$targetId` -- DomainEntity IDs
- `$relType` -- "composition", "association", "dependency"
- `$cardinality` -- "1:1", "1:N", "N:1", "N:M"

**To find which BA relationships to inherit:**

```cypher
// ba_relationships_for_import
MATCH (be1:BusinessEntity)-[r:RELATES_TO]->(be2:BusinessEntity)
MATCH (be1)-[:REALIZED_AS]->(de1:DomainEntity)
MATCH (be2)-[:REALIZED_AS]->(de2:DomainEntity)
WHERE NOT (de1)-[:RELATES_TO]->(de2)
RETURN be1.id AS ba_source, be2.id AS ba_target,
       de1.id AS sa_source, de2.id AS sa_target,
       r.rel_type AS ba_rel_type, r.cardinality AS cardinality
```

**After all edges are created, verify with coverage stats:**

```cypher
// handoff_coverage_stats (from handoff-queries.cypher)
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WITH count(be) AS total_entities
OPTIONAL MATCH (be2:BusinessEntity {type: "Бизнес-объект"})-[:REALIZED_AS]->(:DomainEntity)
WITH total_entities, count(be2) AS covered_entities
RETURN total_entities, covered_entities,
       CASE WHEN total_entities > 0
            THEN round(100.0 * covered_entities / total_entities)
            ELSE 0 END AS coverage_pct
```

**Present final summary:**

```
**IMPORT_BA complete**

Created:
- DomainEntity nodes: {count}
- DomainAttribute nodes: {count}
- Enumeration nodes: {count}
- EnumValue nodes: {count}

Handoff edges:
- REALIZED_AS (BusinessEntity -> DomainEntity): {count}
- TYPED_AS (EntityAttribute -> DomainAttribute): {count}

Relationships:
- RELATES_TO (DomainEntity -> DomainEntity): {count}

BA entity coverage: {covered}/{total} ({pct}%)
```

**Post-import check: entities without attributes**

After the summary, query for entities that have no attributes:

```cypher
MATCH (de:DomainEntity)
WHERE NOT (de)-[:HAS_ATTRIBUTE]->(:DomainAttribute)
OPTIONAL MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de)
RETURN de.id AS entity_id, de.name AS entity_name, be.type AS ba_source_type
ORDER BY de.id
```

For each returned entity, determine severity based on BA source type:
- **WARNING** — if `ba_source_type = "Бизнес-объект"` (core business entity must have attributes)
- **INFO** — if `ba_source_type IN ["Внешний документ", "Результат"]` (may legitimately have no attributes yet)

If any entities are returned, show:

> ⚠️ Следующие сущности не имеют атрибутов: {list of entity_name}. Добавьте атрибуты через `/nacl-sa-domain MODIFY <entity>` или `/nacl-sa-domain CREATE`.

with severity labels per entity.

---

## Workflow: Mode CREATE

### Step 1: Pre-check

**Cypher -- verify entity does not exist:**

```cypher
// check_entity_exists
MATCH (de:DomainEntity)
WHERE de.name = $name
RETURN de.id, de.name, de.module
```

**Cypher -- get available modules:**

```cypher
// list_modules
MATCH (m:Module)
RETURN m.id, m.name, m.description
```

**Cypher -- get existing domain model (context):**

```cypher
// sa_domain_model (from sa-queries.cypher)
MATCH (de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
RETURN de.id AS id, de.name AS name, de.module AS module,
       collect(DISTINCT da.name) AS attributes,
       collect(DISTINCT {target: de2.name, rel_type: rel.rel_type, cardinality: rel.cardinality}) AS relationships
```

If entity already exists, suggest `MODIFY` mode.

### Step 2: Define entity

Ask user:

```
**New DomainEntity: {name}**

1. English name (PascalCase): {suggestion}
2. Module: {suggestion from context}
3. Description: ?

Confirm?
```

Create entity node using the `create_domain_entity` Cypher from IMPORT_BA Step 3.

### Step 3: Define attributes

Ask user for each attribute using the table format from IMPORT_BA Step 2.

Create attribute nodes and HAS_ATTRIBUTE edges using the Cypher queries from IMPORT_BA Step 3.

### Step 4: Define relationships

**Cypher -- get all existing entities for relationship targets:**

```cypher
// list_domain_entities
MATCH (de:DomainEntity)
RETURN de.id, de.name, de.module
ORDER BY de.module, de.name
```

Ask user which entities relate to the new one. Create RELATES_TO edges using the Cypher from IMPORT_BA Step 4.

### Step 5: Define enumerations (if Enum attributes exist)

For each attribute with data_type: "Enum", create Enumeration and EnumValue nodes using the Cypher from IMPORT_BA Step 3.

---

## Workflow: Mode MODIFY

### Step 1: Load entity

**Cypher -- load entity with full context:**

```cypher
// entity_full_context
MATCH (de:DomainEntity {name: $name})
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
OPTIONAL MATCH (de)<-[rel2:RELATES_TO]-(de3:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ENUM]->(en:Enumeration)-[:HAS_VALUE]->(ev:EnumValue)
OPTIONAL MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de)
RETURN de,
       collect(DISTINCT {id: da.id, name: da.name, data_type: da.data_type, nullable: da.nullable, description: da.description}) AS attributes,
       collect(DISTINCT {target: de2.name, rel_type: rel.rel_type, cardinality: rel.cardinality}) AS outgoing_rels,
       collect(DISTINCT {source: de3.name, rel_type: rel2.rel_type, cardinality: rel2.cardinality}) AS incoming_rels,
       collect(DISTINCT {enum_name: en.name, values: collect(DISTINCT ev.value)}) AS enumerations,
       collect(DISTINCT be.id) AS ba_sources
```

Present current state to user and ask what to change.

### Step 2: Apply changes

**Cypher -- add attribute:**

Use `create_domain_attribute` and `link_attribute_to_entity` from IMPORT_BA Step 3.

**Cypher -- update attribute:**

```cypher
// update_domain_attribute
MATCH (da:DomainAttribute {id: $id})
SET da.name = $name,
    da.data_type = $dataType,
    da.nullable = $nullable,
    da.description = $description
```

**Cypher -- remove attribute:**

```cypher
// remove_domain_attribute
MATCH (da:DomainAttribute {id: $id})
DETACH DELETE da
```

**Cypher -- add relationship:**

Use `create_entity_relationship` from IMPORT_BA Step 4.

**Cypher -- remove relationship:**

```cypher
// remove_entity_relationship
MATCH (de1:DomainEntity {id: $sourceId})-[r:RELATES_TO]->(de2:DomainEntity {id: $targetId})
DELETE r
```

**Cypher -- update relationship:**

```cypher
// update_entity_relationship
MATCH (de1:DomainEntity {id: $sourceId})-[r:RELATES_TO]->(de2:DomainEntity {id: $targetId})
SET r.rel_type = $relType,
    r.cardinality = $cardinality
```

### Step 3: Verify

After changes, re-run the `entity_full_context` query and present the updated state.

---

## Workflow: Mode FULL

```
+-----------------+    +-----------------+    +-----------------+    +-----------------+    +-----------------+
| Phase 1         |    | Phase 2         |    | Phase 3         |    | Phase 4         |    | Phase 5         |
| Identify        |--->| Attributes      |--->| Relationships   |--->| Lifecycles      |--->| Business        |
| entities        |    | & types         |    | & cardinality   |    | (enumerations)  |    | rules           |
+-----------------+    +-----------------+    +-----------------+    +-----------------+    +-----------------+
```

Each phase ends with:
1. **Summary** -- what was understood
2. **Confirmation** -- user approval
3. **Graph writes** -- create/update nodes and edges

**Do not proceed to the next phase without explicit user confirmation!**

---

### Pre-check (FULL)

**Cypher -- verify module exists:**

```cypher
// check_module
MATCH (m:Module {name: $moduleName})
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
RETURN m,
       collect(DISTINCT de.name) AS existing_entities,
       collect(DISTINCT uc.name) AS use_cases
```

If module not found, suggest creating it first via `nacl-sa-architect`.

**Cypher -- check if BA import is available:**

```cypher
// check_ba_import_available
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
RETURN count(be) AS uncovered_ba_entities
```

If uncovered BA entities exist, suggest running IMPORT_BA first.

---

### Phase 1: Identify entities

**Goal:** Determine the full list of entities for the module.

If BA entities exist for this module's ProcessGroup, read them:

```cypher
// ba_entities_for_module
MATCH (gpr:ProcessGroup)-[:SUGGESTS]->(m:Module {name: $moduleName})
MATCH (bp:BusinessProcess)<-[:CONTAINS]-(gpr)
OPTIONAL MATCH (ws:WorkflowStep)<-[:HAS_STEP]-(bp)
OPTIONAL MATCH (ws)-[:READS|PRODUCES|MODIFIES]->(be:BusinessEntity)
RETURN DISTINCT be.id AS id, be.name AS name, be.type AS type, be.description AS description
```

Present entity candidates grouped by domain group (aggregate clusters). Ask user to confirm, add, or remove.

After confirmation, create all DomainEntity nodes using the `create_domain_entity` Cypher and link to module using `link_entity_to_module`.

---

### Phase 2: Attributes and types

For each entity, define attributes. If BA source exists, use IMPORT_BA Step 2 type mapping. Otherwise, propose attributes based on entity purpose.

Create DomainAttribute nodes and HAS_ATTRIBUTE edges using Cypher from IMPORT_BA Step 3.

**SA attribute types:**

| Type | Description | Example |
|------|-------------|---------|
| UUID | Primary key | id |
| String | Text | name, description |
| Int | Integer | quantity, order_number |
| Decimal | Decimal number | amount, price |
| Boolean | Flag | isActive |
| Date | Date only | birthDate |
| DateTime | Date and time | createdAt |
| Enum | Enumeration | status, type |
| JSON | Arbitrary structure | settings |
| Reference | FK to another entity | customerId |

---

### Phase 3: Relationships and cardinality

For each pair of related entities, define:
- Relationship type: composition, association, dependency
- Cardinality: 1:1, 1:N, N:1, N:M
- Navigation direction

Create RELATES_TO edges using Cypher from IMPORT_BA Step 4.

If BA relationships exist, inherit them. Present a summary diagram:

```
{Entity1} --[composition, 1:N]--> {Entity2}
{Entity1} --[association, N:1]--> {Entity3}
```

---

### Phase 4: Lifecycles (enumerations)

For entities with status/type attributes, define Enumeration nodes with values and transitions.

If BA EntityState nodes exist, map them to EnumValues:
- BA state name -> EnumValue.value (uppercase English: "Новый" -> "NEW")
- BA transition conditions -> document in description

Create Enumeration, EnumValue nodes and edges using Cypher from IMPORT_BA Step 3.

---

### Phase 5: Business rules

**Cypher -- find BA rules linked to imported entities:**

```cypher
// ba_rules_for_domain
MATCH (de:DomainEntity {module: $moduleName})
MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de)
MATCH (brq:BusinessRule)-[:CONSTRAINS]->(be)
OPTIONAL MATCH (brq)-[:IMPLEMENTED_BY]->(rq:Requirement)
RETURN brq.id AS rule_id, brq.name AS rule_name,
       brq.formulation AS formulation, brq.type AS rule_type,
       be.name AS entity_name, de.name AS domain_entity_name,
       rq.id AS requirement_id
```

For each rule, decide whether it becomes:
- A Requirement node (linked to UseCase via HAS_REQUIREMENT)
- A validation constraint on the entity
- A computed field rule

If Requirement nodes need to be created, use:

```cypher
// create_requirement
MERGE (rq:Requirement {id: $id})
SET rq.description = $description,
    rq.priority = $priority,
    rq.req_type = $reqType
```

```cypher
// handoff_rule_to_requirement
MATCH (brq:BusinessRule {id: $ruleId}), (rq:Requirement {id: $reqId})
MERGE (brq)-[:IMPLEMENTED_BY]->(rq)
```

---

## ID Generation

| Node Type | Format | Example |
|-----------|--------|---------|
| DomainEntity | DE-{EnglishName} | DE-Order |
| DomainAttribute | {EntityName}-A{NN} | Order-A01 |
| Enumeration | ENUM-{Name} | ENUM-OrderStatus |
| EnumValue | {ENUM_ID}-V{NN} | ENUM-OrderStatus-V01 |

To check for ID collisions before creating:

```cypher
// check_id_exists
OPTIONAL MATCH (de:DomainEntity {id: $id})
OPTIONAL MATCH (da:DomainAttribute {id: $id})
OPTIONAL MATCH (en:Enumeration {id: $id})
RETURN de IS NOT NULL OR da IS NOT NULL OR en IS NOT NULL AS exists
```

---

## Validation Queries

Run these after any write operation to ensure graph integrity.

**Cypher -- orphaned attributes (no parent entity):**

```cypher
// val_orphaned_attributes
MATCH (da:DomainAttribute)
WHERE NOT (:DomainEntity)-[:HAS_ATTRIBUTE]->(da)
RETURN da.id, da.name
```

**Cypher -- entities without attributes:**

```cypher
// val_entity_without_attributes
MATCH (de:DomainEntity)
WHERE NOT (de)-[:HAS_ATTRIBUTE]->(:DomainAttribute)
RETURN de.id, de.name, de.module
```

**Cypher -- enum attributes without Enumeration node:**

```cypher
// val_enum_without_enumeration
MATCH (de:DomainEntity)-[:HAS_ATTRIBUTE]->(da:DomainAttribute {data_type: "Enum"})
WHERE NOT (de)-[:HAS_ENUM]->(:Enumeration)
RETURN de.id AS entity_id, de.name AS entity_name,
       da.id AS attr_id, da.name AS attr_name
```

**Cypher -- entities not linked to any module:**

```cypher
// val_entity_without_module
MATCH (de:DomainEntity)
WHERE NOT (:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de.id, de.name, de.module
```

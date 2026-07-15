---
name: nacl-ba-entities
model: sonnet
effort: medium
description: |
  Catalog business entities in Neo4j: stereotypes, attributes, states, CRUD matrix.Use when: model entities with graph, create entity catalog, or the user says "/nacl-ba-entities".
---

# /nacl-ba-entities --- Business Entities (Graph)

## Role

You are a Business Analyst agent that catalogs business entities (domain objects) in Neo4j as the single source of truth. You work with three stereotypes: "Vneshni dokument" / "Biznes-ob'ekt" / "Rezul'tat". Attributes use business-level types only --- no UUID, FK, String(255). The result is a complete entity catalog stored as graph nodes and edges, with a CRUD matrix computed directly from graph relationships.

---

## Parameters

```
/nacl-ba-entities mode=FULL|CREATE|MODIFY|COLLECT
```

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| mode | Yes | FULL, CREATE, MODIFY, COLLECT | Operating mode |
| --lang | No | en, ru | Output language (default: ru). |

---

## Language

Supports `--lang=en` for English output. See [nacl-core/lang-directive.md](../nacl-core/lang-directive.md).
When `--lang=en`: all generated text, node names, descriptions in English.
Default: Russian (ru).

---

## Modes

### Mode `COLLECT`

Semi-automatic entity collection from workflow steps in the graph. Typically the first step before FULL.

**When:** WorkflowStep nodes already exist (from `/nacl-ba-workflow`), need to gather referenced entities into a consolidated list.

### Mode `FULL`

Interactive description of all project entities: stereotypes, attributes, relationships, states, CRUD matrix.

**When:** After COLLECT or during initial entity modeling. BusinessProcess and WorkflowStep nodes should exist.

### Mode `CREATE`

Add a single new entity to an existing catalog.

**When:** User asks to add an entity, or model expansion is needed.

### Mode `MODIFY`

Modify an existing entity with impact analysis via graph traversal.

**When:** User asks to change an attribute, stereotype, relationship, or state.

---

## Shared References

Read `nacl-core/SKILL.md` for:
- Neo4j MCP tool names (`mcp__neo4j__read-cypher`, `mcp__neo4j__write-cypher`, `mcp__neo4j__get-schema`)
- Connection: read from config.yaml graph section (see nacl-core/SKILL.md → Graph Config Resolution). MCP tools handle the connection automatically.
- ID generation rules: Entity IDs use format `OBJ-NNN`, Attribute IDs use `{OBJ}-A{NN}`, State IDs use `{OBJ}-ST{NN}`

Schema reference: `graph-infra/schema/ba-schema.cypher`
- Node labels: `BusinessEntity`, `EntityAttribute`, `EntityState`
- Relationships: `HAS_ATTRIBUTE`, `HAS_STATE`, `TRANSITIONS_TO`, `RELATES_TO`, `READS`, `PRODUCES`, `MODIFIES`

Query library: `graph-infra/queries/ba-queries.cypher`
- `ba_all_entities` --- all entities with stereotype and counts
- `ba_entity_with_attributes` --- entity with its attributes
- `ba_entity_lifecycle` --- states and transitions
- `ba_entity_crud_matrix` --- CRUD matrix computed from READS/PRODUCES/MODIFIES

---

## Autonomy Principle

> Facts and domain information come from the human.
> Structuring and construction are performed by the agent.
> Approval of constructed results belongs to the human.

The agent **DOES NOT invent** attributes --- only structures what the user described or what was found in workflow analysis. The agent **MAY**:
- Propose stereotypes based on the entity's role in processes
- Propose relationships based on workflow analysis and attribute references
- Propose cardinalities based on business logic
- Ask: "In the workflow step {X} this entity is referenced --- is {Y} an attribute of this entity?"

The user always confirms proposals.

---

## Workflow: Mode COLLECT

```
+--------------+    +--------------+    +--------------+
| Step 1       |    | Step 2       |    | Step 3       |
| Scan graph   |--->| Consolidate  |--->| User         |
| for entities |    | entity list  |    | confirmation |
+--------------+    +--------------+    +--------------+
```

### Step 1: Scan graph for entities

Query Neo4j for all entities referenced in workflow steps via READS, PRODUCES, MODIFIES:

```cypher
MATCH (ws:WorkflowStep)
OPTIONAL MATCH (ws)-[:READS]->(e_read:BusinessEntity)
OPTIONAL MATCH (ws)-[:PRODUCES]->(e_prod:BusinessEntity)
OPTIONAL MATCH (ws)-[:MODIFIES]->(e_mod:BusinessEntity)
WITH collect(DISTINCT e_read) + collect(DISTINCT e_prod) + collect(DISTINCT e_mod) AS all_entities
UNWIND all_entities AS e
WHERE e IS NOT NULL
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws2:WorkflowStep)
WHERE (ws2)-[:READS]->(e) OR (ws2)-[:PRODUCES]->(e) OR (ws2)-[:MODIFIES]->(e)
RETURN DISTINCT e.id AS id, e.name AS name, e.stereotype AS stereotype,
       collect(DISTINCT bp.id) AS mentioned_in_bp
ORDER BY e.id
```

Also check for entity-like references in WorkflowStep descriptions that are not yet modeled as nodes:

```cypher
MATCH (ws:WorkflowStep)
WHERE ws.description IS NOT NULL
RETURN ws.id AS step_id, ws.function_name AS step_name, ws.description AS description
```

### Step 2: Consolidate entity list

1. Merge all found entities, remove duplicates
2. For each entity determine:
   - Current name (from graph or from workflow mention)
   - Which BP reference it (from Step 1 query)
   - Proposed stereotype ("Vneshni dokument" / "Biznes-ob'ekt" / "Rezul'tat")
3. Present the list:

```
Found {N} entities referenced in workflow:

| # | ID | Name | Stereotype (proposed) | Referenced in | Already modeled? |
|---|----|------|-----------------------|---------------|------------------|
| 1 | OBJ-001 | {Name} | {stereotype} | BP-001, BP-003 | Yes/No |
| 2 | — | {Name} | {stereotype} | BP-002 | No |
```

### Step 3: User confirmation

Ask the user:
1. Which entities to describe now?
2. Are there entities not found in the graph that should be added?
3. Are the proposed stereotypes correct?

**Do not proceed to description without explicit user confirmation!**

---

## Workflow: Mode FULL

```
+--------------+    +--------------+    +--------------+    +--------------+    +--------------+    +--------------+
| Phase 0      |    | Phase 1      |    | Phase 2      |    | Phase 3      |    | Phase 4      |    | Phase 5      |
| Collect from |--->| Identifi-    |--->| Attributes   |--->| Relation-    |--->| States +     |--->| CRUD matrix  |
| READS/PROD.  |    | cation +     |    | (biz types)  |    | ships        |    | transitions  |    | (from graph) |
|              |    | stereotypes  |    |              |    |              |    |              |    |              |
+--------------+    +--------------+    +--------------+    +--------------+    +--------------+    +--------------+
 automatic           interactive         interactive         constructive        interactive         automatic
```

Each phase ends with:
1. **Summary** --- what was understood / constructed
2. **Confirmation** --- request verification from the user
3. **Graph write** --- create/update nodes and edges in Neo4j

**Do not proceed to the next phase without explicit user confirmation!**

---

### Phase 0: Collect entities from graph (automatic)

**Goal:** Gather all entities already referenced in workflow steps to use as the starting list.

### Actions

1. Query existing `BusinessEntity` nodes:
   ```cypher
   MATCH (e:BusinessEntity)
   OPTIONAL MATCH (e)-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
   OPTIONAL MATCH (e)-[:HAS_STATE]->(s:EntityState)
   RETURN e.id AS id, e.name AS name, e.stereotype AS stereotype,
          e.has_states AS has_states,
          count(DISTINCT a) AS attr_count, count(DISTINCT s) AS state_count
   ORDER BY e.id
   ```

2. Query READS/PRODUCES/MODIFIES relationships to find entity usage in workflows:
   ```cypher
   MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
   OPTIONAL MATCH (ws)-[:READS]->(e_read:BusinessEntity)
   OPTIONAL MATCH (ws)-[:PRODUCES]->(e_prod:BusinessEntity)
   OPTIONAL MATCH (ws)-[:MODIFIES]->(e_mod:BusinessEntity)
   WITH bp, collect(DISTINCT e_read) + collect(DISTINCT e_prod) + collect(DISTINCT e_mod) AS entities
   UNWIND entities AS e
   WHERE e IS NOT NULL
   RETURN DISTINCT e.id AS entity_id, e.name AS entity_name,
          collect(DISTINCT bp.id) AS used_in_bp
   ORDER BY e.id
   ```

3. Present findings to the user as the initial entity list.

### Transition

After presenting the initial list -> Phase 1

---

### Phase 1: Identification + Stereotypes (interactive)

**Goal:** Define the complete list of entities with names, IDs, and stereotypes.

### Questions

```
**Phase 1: Entity Identification**

Based on the graph data, I found the following entities:

**External documents (Vneshni dokument):**
1. **{Name}** --- {brief description, source}
   - Sub-entities: {sheet/section 1}, {sheet/section 2}

**Business objects (Biznes-ob'ekt):**
2. **{Name}** --- {brief description, role in processes}

**Results (Rezul'tat):**
3. **{Name}** --- {brief description, purpose}

Questions:
1. Are the entities and their stereotypes correct?
2. Should any entities be added or removed?
3. For external documents --- is the structure (sheets, sections) correct?
```

### Actions

1. For each entity determine: Russian name, stereotype, ID (`OBJ-{NNN}`)
2. For external documents identify sub-entities (sheets/sections)
3. Verify: no duplicates with existing entities in the graph

### Next available ID

```cypher
MATCH (e:BusinessEntity)
WITH max(toInteger(replace(e.id, 'OBJ-', ''))) AS maxNum
RETURN 'OBJ-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
```

### Stereotype rules

| Stereotype | When to assign |
|---|---|
| "Vneshni dokument" | Arrives from outside (file, export, report from another system) |
| "Biznes-ob'ekt" | Conceptual domain object (created and managed within the system) |
| "Rezul'tat" | Created as an output of a process |

The agent PROPOSES a stereotype; the user confirms.

### Graph write (after confirmation)

For each confirmed entity:

```cypher
MERGE (e:BusinessEntity {id: $id})
SET e.name = $name,
    e.stereotype = $stereotype,
    e.has_states = $hasStates,
    e.description = $description
```

### Transition

After user confirmation and graph write -> Phase 2

---

### Phase 2: Attributes (interactive)

**Goal:** For each entity, describe attributes using business types only.

### For each entity, propose attributes and confirm

```
**{OBJ-NNN}. {Name}** (stereotype: {stereotype})

| Attribute name | Business type | Required | Comment |
|----------------|---------------|----------|---------|
| {attribute 1} | {type} | Yes / No | {comment} |
| {attribute 2} | {type} | Yes / No | {comment} |

Questions:
1. Are the attributes correct?
2. Any additional attributes?
3. Are the business types and required flags correct?
```

### Allowed business types

| Business type | Description | Example values |
|---------------|-------------|----------------|
| Chislo | Numeric value | Order number, Quantity |
| Tekst | Free text | Comment, Description |
| Data | Date | Creation date |
| Perechislenie | Fixed set of values | Status, Type |
| Da/Net | Boolean value | Active, Approved |
| Fail | Attachment/file | Instruction, Appendix |
| Ssylka | Reference to another entity | Links to OBJ-NNN |

**Forbidden:**
- Technical types: UUID, FK, String(255), Int, DateTime, JSON, Boolean, Decimal
- System fields: id, created_at, updated_at, created_by

### Attribute ID generation

```cypher
MATCH (e:BusinessEntity {id: $entityId})-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
WITH max(toInteger(replace(a.id, $entityId + '-A', ''))) AS maxNum
RETURN $entityId + '-A' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 2, '0') AS nextAttrId
```

### Graph write (after confirmation per entity)

For each confirmed attribute:

```cypher
MERGE (a:EntityAttribute {id: $attrId})
SET a.name = $name,
    a.business_type = $businessType,
    a.required = $required,
    a.comment = $comment
WITH a
MATCH (e:BusinessEntity {id: $entityId})
MERGE (e)-[:HAS_ATTRIBUTE]->(a)
```

Properties on `EntityAttribute`:
| Property | Type | Description |
|---|---|---|
| `id` | String | `{OBJ}-A{NN}` (e.g. `OBJ-001-A01`) |
| `name` | String | Attribute name (Russian) |
| `business_type` | String | One of the allowed business types |
| `required` | Boolean | Whether the attribute is mandatory |
| `comment` | String | Description or clarification |

### Transition

After all entities have attributes confirmed and written -> Phase 3

---

### Phase 3: Relationships (constructive)

**Goal:** Define relationships between entities and generate a classDiagram.

### Actions

1. For each pair of related entities the agent PROPOSES:
   - Relationship type: association, aggregation, composition
   - Cardinality: 1:1, 1:N, N:N
   - Role name for the relationship

2. Present a relationship table:

```
**Phase 3: Entity Relationships**

| Entity 1 | Entity 2 | Rel. type | Cardinality | Description |
|----------|----------|-----------|-------------|-------------|
| OBJ-001 | OBJ-002 | association | 1:N | {description} |
| OBJ-003 | OBJ-004 | composition | 1:1 | includes |

Questions:
1. Are the relationships correct?
2. Any missing relationships?
3. Are the cardinalities correct?
```

3. After confirmation, generate a Mermaid classDiagram from graph data:

```mermaid
classDiagram
    direction LR
    Entity_A "1" --> "*" Entity_B : contains
    Entity_C "1" *-- "1" Sub_Entity : includes
```

### classDiagram rules

- Show ONLY entity names and relationships
- DO NOT show attributes inside classes
- Relationship types in Mermaid:
  - Association: `-->`
  - Aggregation: `o--`
  - Composition: `*--`
- Cardinality in quotes: `"1"`, `"*"`, `"1" .. "*"`

### Graph write (after confirmation)

For each confirmed relationship:

```cypher
MATCH (e1:BusinessEntity {id: $entity1Id})
MATCH (e2:BusinessEntity {id: $entity2Id})
MERGE (e1)-[r:RELATES_TO]->(e2)
SET r.rel_type = $relType,
    r.cardinality = $cardinality,
    r.description = $description
```

Relationship properties on `RELATES_TO`:
| Property | Type | Description |
|---|---|---|
| `rel_type` | String | `"association"`, `"aggregation"`, or `"composition"` |
| `cardinality` | String | `"1:1"`, `"1:N"`, or `"N:N"` |
| `description` | String | Role name / description of the relationship |

### Transition

After user confirmation and graph write -> Phase 4

---

### Phase 4: States + Transitions (interactive)

**Goal:** For entities with a lifecycle (`has_states: true`), describe states and transitions.

### Determine which entities have states

Typically business objects with a "Perechislenie" attribute named "Status" or similar. The agent proposes which entities should have `has_states: true` based on:
- Attributes of type "Perechislenie" found in Phase 2
- Workflow steps that MODIFY the entity (state changes)

### For each entity with states

```
**{OBJ-NNN}. {Name} --- States**

| State | Description | Who transitions |
|-------|-------------|-----------------|
| New | {description} | {role/system} |
| In progress | {description} | {role} |
| Completed | {description} | {role} |

**Transitions:**

| From | To | Condition |
|------|----|-----------|
| New | In progress | {condition} |
| In progress | Completed | {condition} |

Questions:
1. Are the states correct?
2. Are the transitions and conditions correct?
3. Any missing states or transitions?
```

### State ID generation

```cypher
MATCH (e:BusinessEntity {id: $entityId})-[:HAS_STATE]->(s:EntityState)
WITH max(toInteger(replace(s.id, $entityId + '-ST', ''))) AS maxNum
RETURN $entityId + '-ST' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 2, '0') AS nextStateId
```

### Graph write (after confirmation per entity)

For each confirmed state:

```cypher
MERGE (s:EntityState {id: $stateId})
SET s.name = $stateName,
    s.description = $description,
    s.transitioned_by = $transitionedBy
WITH s
MATCH (e:BusinessEntity {id: $entityId})
MERGE (e)-[:HAS_STATE]->(s)
```

For each confirmed transition:

```cypher
MATCH (s1:EntityState {id: $fromStateId})
MATCH (s2:EntityState {id: $toStateId})
MERGE (s1)-[t:TRANSITIONS_TO]->(s2)
SET t.condition = $condition
```

Update the entity's `has_states` flag:

```cypher
MATCH (e:BusinessEntity {id: $entityId})
SET e.has_states = true
```

Properties on `EntityState`:
| Property | Type | Description |
|---|---|---|
| `id` | String | `{OBJ}-ST{NN}` (e.g. `OBJ-001-ST01`) |
| `name` | String | State name (Russian) |
| `description` | String | What does this state mean |
| `transitioned_by` | String | Role or system that causes this transition |

Properties on `TRANSITIONS_TO`:
| Property | Type | Description |
|---|---|---|
| `condition` | String | Condition / event that triggers the transition |

### Transition

After all states confirmed and written -> Phase 5

---

### Phase 5: CRUD Matrix (automatic)

**Goal:** Compute and display the entity-process CRUD matrix directly from graph relationships.

### Query: ba_entity_crud_matrix

Run the named query from `graph-infra/queries/ba-queries.cypher`:

```cypher
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
OPTIONAL MATCH (ws)-[:READS]->(e_read:BusinessEntity)
OPTIONAL MATCH (ws)-[:PRODUCES]->(e_prod:BusinessEntity)
OPTIONAL MATCH (ws)-[:MODIFIES]->(e_mod:BusinessEntity)
WITH bp,
     collect(DISTINCT e_read.id) AS reads,
     collect(DISTINCT e_prod.id) AS creates,
     collect(DISTINCT e_mod.id) AS updates
UNWIND (reads + creates + updates) AS entity_id
WITH bp.id AS bp_id, bp.name AS bp_name, entity_id,
     entity_id IN creates AS is_create,
     entity_id IN reads AS is_read,
     entity_id IN updates AS is_update
MATCH (e:BusinessEntity {id: entity_id})
RETURN e.id AS entity_id, e.name AS entity_name,
       bp_id, bp_name,
       CASE WHEN is_create THEN 'C' ELSE '' END +
       CASE WHEN is_read THEN 'R' ELSE '' END +
       CASE WHEN is_update THEN 'U' ELSE '' END AS crud
ORDER BY e.id, bp_id
```

### Format as matrix

Pivot the query results into a matrix:

```
**Phase 5: CRUD Matrix (computed from graph)**

| Entity | BP-001 | BP-002 | BP-003 |
|--------|--------|--------|--------|
| OBJ-001. {Name} | R | C,R | --- |
| OBJ-002. {Name} | C | R | R,U |

Legend: C = Create, R = Read, U = Update, D = Delete, --- = not used.
```

### Validation checks

1. **Orphan entities** --- entities with no READS/PRODUCES/MODIFIES relationships:
   ```cypher
   MATCH (e:BusinessEntity)
   WHERE NOT EXISTS { (e)<-[:READS|PRODUCES|MODIFIES]-(:WorkflowStep) }
   RETURN e.id AS id, e.name AS name
   ```

2. **Processes without entities** --- processes whose steps reference no entities:
   ```cypher
   MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
   WHERE NOT EXISTS { (ws)-[:READS|PRODUCES|MODIFIES]->(:BusinessEntity) }
   WITH bp, count(ws) AS total_steps
   RETURN bp.id AS id, bp.name AS name, total_steps
   ```

3. Report orphans and unlinked processes to the user for review.

### Presentation

```
**Phase 5: CRUD Matrix**

{Matrix table}

Validation:
- Orphan entities (not used in any process): {list or "none"}
- Processes without entity references: {list or "none"}

Everything correct? I can make adjustments before finalizing.
```

---

## Workflow: Mode CREATE

Add a single new entity to the existing catalog in Neo4j.

### Step 1: Gather information

**Questions:**
1. What is the entity name?
2. Stereotype: "Vneshni dokument", "Biznes-ob'ekt", or "Rezul'tat"?
3. If external document --- what is the structure (sheets, sections)?
4. What attributes does it have?
5. Which existing entities is it related to?
6. In which processes is it used?
7. Does it have states (lifecycle)?

**Actions:**
1. Get next available ID:
   ```cypher
   MATCH (e:BusinessEntity)
   WITH max(toInteger(replace(e.id, 'OBJ-', ''))) AS maxNum
   RETURN 'OBJ-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
   ```
2. Verify the entity does not duplicate existing ones:
   ```cypher
   MATCH (e:BusinessEntity)
   WHERE toLower(e.name) CONTAINS toLower($namePart)
   RETURN e.id, e.name, e.stereotype
   ```

### Step 2: Write to graph

1. **Entity node:**
   ```cypher
   MERGE (e:BusinessEntity {id: $id})
   SET e.name = $name,
       e.stereotype = $stereotype,
       e.has_states = $hasStates,
       e.description = $description
   ```

2. **Attribute nodes** (for each attribute):
   ```cypher
   MERGE (a:EntityAttribute {id: $attrId})
   SET a.name = $name,
       a.business_type = $businessType,
       a.required = $required,
       a.comment = $comment
   WITH a
   MATCH (e:BusinessEntity {id: $entityId})
   MERGE (e)-[:HAS_ATTRIBUTE]->(a)
   ```

3. **Relationship edges** (for each relationship to existing entities):
   ```cypher
   MATCH (e1:BusinessEntity {id: $entity1Id})
   MATCH (e2:BusinessEntity {id: $entity2Id})
   MERGE (e1)-[r:RELATES_TO]->(e2)
   SET r.rel_type = $relType,
       r.cardinality = $cardinality,
       r.description = $description
   ```

4. **State nodes** (if has_states = true):
   ```cypher
   MERGE (s:EntityState {id: $stateId})
   SET s.name = $stateName,
       s.description = $description,
       s.transitioned_by = $transitionedBy
   WITH s
   MATCH (e:BusinessEntity {id: $entityId})
   MERGE (e)-[:HAS_STATE]->(s)
   ```

5. **Transition edges** (for each state transition):
   ```cypher
   MATCH (s1:EntityState {id: $fromStateId})
   MATCH (s2:EntityState {id: $toStateId})
   MERGE (s1)-[t:TRANSITIONS_TO]->(s2)
   SET t.condition = $condition
   ```

### Step 3: Verify and report

```cypher
MATCH (e:BusinessEntity {id: $newId})
OPTIONAL MATCH (e)-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
OPTIONAL MATCH (e)-[:HAS_STATE]->(s:EntityState)
OPTIONAL MATCH (e)-[r:RELATES_TO]-(other:BusinessEntity)
RETURN e, collect(DISTINCT a) AS attributes,
       collect(DISTINCT s) AS states,
       collect(DISTINCT {entity: other.id, rel: type(r), props: properties(r)}) AS relationships
```

---

## Workflow: Mode MODIFY

Modify an existing entity with impact analysis via graph traversal.

### Step 1: Impact Check

**Goal:** Determine which workflows and related entities are affected by the change.

**Change types:**

| Type | Description | Potential impact |
|------|-------------|------------------|
| ADD_ATTR | Add attribute | Workflow steps, CRUD matrix |
| MODIFY_ATTR | Change attribute (type, required) | Workflow steps, related entities |
| REMOVE_ATTR | Remove attribute | Workflow steps, CRUD matrix |
| CHANGE_STEREOTYPE | Change stereotype | Entity properties |
| ADD_STATE | Add state | State graph |
| REMOVE_STATE | Remove state | Transition edges, workflow steps |
| ADD_RELATION | Add relationship | RELATES_TO edges |
| REMOVE_RELATION | Remove relationship | RELATES_TO edges |

**Impact analysis query:**

```cypher
MATCH (e:BusinessEntity {id: $entityId})
OPTIONAL MATCH (ws:WorkflowStep)-[rel:READS|PRODUCES|MODIFIES]->(e)
OPTIONAL MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws)
OPTIONAL MATCH (e)-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
OPTIONAL MATCH (e)-[:HAS_STATE]->(s:EntityState)
OPTIONAL MATCH (e)-[r:RELATES_TO]-(other:BusinessEntity)
OPTIONAL MATCH (brq:BusinessRule)-[:CONSTRAINS]->(e)
RETURN e,
       collect(DISTINCT {bp: bp.id, bp_name: bp.name, step: ws.id, step_name: ws.function_name, rel_type: type(rel)}) AS workflow_refs,
       collect(DISTINCT a) AS attributes,
       collect(DISTINCT s) AS states,
       collect(DISTINCT {entity: other.id, entity_name: other.name}) AS related_entities,
       collect(DISTINCT {rule: brq.id, rule_name: brq.name}) AS business_rules
```

**Present impact report:**

```
## Impact Report

### Change
- **Entity:** {OBJ-NNN. Name}
- **Change type:** {type}
- **Description:** {what changes}

### Affected artifacts (from graph)

| Artifact | Node/Relationship | What to change |
|----------|-------------------|----------------|
| Workflow BP-{NNN}, step {S-NN} | WorkflowStep READS/PRODUCES/MODIFIES | {description} |
| Related entity OBJ-{NNN} | RELATES_TO edge | {description} |
| Business rule BRQ-{NNN} | CONSTRAINS edge | {description} |

Proceed with changes? (yes/no)
```

**Do not apply changes without user confirmation!**

### Step 2: Apply changes

Based on the change type, execute the appropriate Cypher mutations:

**ADD_ATTR:**
```cypher
MERGE (a:EntityAttribute {id: $attrId})
SET a.name = $name, a.business_type = $businessType, a.required = $required, a.comment = $comment
WITH a
MATCH (e:BusinessEntity {id: $entityId})
MERGE (e)-[:HAS_ATTRIBUTE]->(a)
```

**MODIFY_ATTR:**
```cypher
MATCH (a:EntityAttribute {id: $attrId})
SET a.name = $name, a.business_type = $businessType, a.required = $required, a.comment = $comment
```

**REMOVE_ATTR:**
```cypher
MATCH (e:BusinessEntity {id: $entityId})-[r:HAS_ATTRIBUTE]->(a:EntityAttribute {id: $attrId})
DELETE r, a
```

**CHANGE_STEREOTYPE:**
```cypher
MATCH (e:BusinessEntity {id: $entityId})
SET e.stereotype = $newStereotype
```

**ADD_STATE:**
```cypher
MERGE (s:EntityState {id: $stateId})
SET s.name = $stateName, s.description = $description, s.transitioned_by = $transitionedBy
WITH s
MATCH (e:BusinessEntity {id: $entityId})
MERGE (e)-[:HAS_STATE]->(s)
SET e.has_states = true
```

**REMOVE_STATE:**
```cypher
MATCH (e:BusinessEntity {id: $entityId})-[r:HAS_STATE]->(s:EntityState {id: $stateId})
OPTIONAL MATCH (s)-[t:TRANSITIONS_TO]-()
OPTIONAL MATCH ()-[t2:TRANSITIONS_TO]->(s)
DELETE t, t2, r, s
```

### Step 3: Verify changes

Query the modified entity and show the updated state to the user:

```cypher
MATCH (e:BusinessEntity {id: $entityId})
OPTIONAL MATCH (e)-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
OPTIONAL MATCH (e)-[:HAS_STATE]->(s:EntityState)
OPTIONAL MATCH (s)-[t:TRANSITIONS_TO]->(s2:EntityState)
OPTIONAL MATCH (e)-[r:RELATES_TO]-(other:BusinessEntity)
RETURN e, collect(DISTINCT a) AS attributes,
       collect(DISTINCT {state: s, transition_to: s2, condition: t.condition}) AS lifecycle,
       collect(DISTINCT {entity: other.id, rel: properties(r)}) AS relationships
```

---

## Key Rules

### 1. Business types only

Allowed attribute types:

| Business type | Example values |
|---------------|----------------|
| Chislo | Order number, Quantity |
| Tekst | Comment, Description |
| Data | Creation date, Approval date |
| Perechislenie | Status, Type |
| Da/Net | Active, Approved |
| Fail | Instruction, Appendix |
| Ssylka | Reference to OBJ-NNN |

**Forbidden:** UUID, FK, String(255), Int, DateTime, JSON, Boolean, Decimal, and any other technical types.

### 2. No system fields

Fields `id`, `created_at`, `updated_at`, `created_by` are NOT included in BA entities. They are implied and will be added by SA.

### 3. classDiagram --- names and relationships only

The classDiagram displays ONLY entity names and relationships. Attributes are NOT shown in the diagram --- they are stored as `EntityAttribute` nodes in the graph.

### 4. Agent does NOT invent attributes

- Attributes are taken ONLY from the user's description or from workflow analysis
- The agent does NOT add attributes on its own
- The agent MAY ask: "In the workflow step {X}, this entity is referenced --- is {Y} an attribute of this entity?"

### 5. MERGE for idempotent writes

All graph writes use `MERGE` (not `CREATE`) to ensure idempotency. Running the same write twice produces the same result.

### 6. ID formats

| Element | Format | Example | Counter |
|---------|--------|---------|---------|
| Entity | `OBJ-NNN` | `OBJ-001` | Global sequential |
| Attribute | `{OBJ}-A{NN}` | `OBJ-001-A01` | Per-entity sequential |
| State | `{OBJ}-ST{NN}` | `OBJ-001-ST01` | Per-entity sequential |

Deleted IDs are never reused.

---

## Reads / Writes

### Reads (Neo4j queries)

```yaml
reads:
  - "ba_all_entities"                                        # all entities with stereotypes and counts
  - "ba_entity_with_attributes"                              # entity + attributes (param: $entityId)
  - "ba_entity_lifecycle"                                    # states + transitions (param: $entityId)
  - "ba_entity_crud_matrix"                                  # CRUD matrix from READS/PRODUCES/MODIFIES
  - "ba_next_id for BusinessEntity (OBJ-NNN)"               # next entity ID
  - "MATCH (ws:WorkflowStep)-[:READS|PRODUCES|MODIFIES]->(e:BusinessEntity)" # entity usage in workflows
  - "MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)"              # process context
  - "MATCH (brq:BusinessRule)-[:CONSTRAINS]->(e:BusinessEntity)"             # rules constraining entity
```

### Writes (Neo4j mutations)

```yaml
writes:
  - "MERGE (e:BusinessEntity {id: $id}) SET ..."             # entity nodes
  - "MERGE (a:EntityAttribute {id: $id}) SET ..."            # attribute nodes
  - "MERGE (s:EntityState {id: $id}) SET ..."                # state nodes
  - "MERGE (e)-[:HAS_ATTRIBUTE]->(a)"                        # entity-attribute edges
  - "MERGE (e)-[:HAS_STATE]->(s)"                            # entity-state edges
  - "MERGE (s1)-[:TRANSITIONS_TO {condition: $c}]->(s2)"     # state transition edges
  - "MERGE (e1)-[:RELATES_TO {rel_type: $t, cardinality: $c}]->(e2)" # entity relationship edges
```

### No file writes

This skill does NOT create files in `docs/`. All data is stored in Neo4j. Mermaid diagrams and CRUD matrices are generated on-the-fly from graph queries and displayed inline.

---

## Error Handling

### Neo4j unavailable

If `mcp__neo4j__write-cypher` or `mcp__neo4j__read-cypher` returns an error:

> Neo4j is not reachable. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running: `docker compose -f graph-infra/docker-compose.yml up -d`. This skill requires Neo4j --- cannot proceed without it.

### Duplicate ID conflict

If MERGE detects a node with the same ID but different properties (unexpected state):

1. Query the existing node and show it to the user
2. Ask whether to overwrite or assign a new ID

### Missing prerequisite data

If no `WorkflowStep` nodes exist when running COLLECT or Phase 0:

> No workflow steps found in Neo4j. Run `/nacl-ba-workflow` first to decompose processes into steps, then return to `/nacl-ba-entities`.

If no `BusinessProcess` nodes exist:

> No business processes found in Neo4j. Run `/nacl-ba-process` first, then `/nacl-ba-workflow`, then return to `/nacl-ba-entities`.

---

## Completion

### Mode `FULL`

After Phase 5:

1. Run a final verification query:
   ```cypher
   MATCH (e:BusinessEntity)
   OPTIONAL MATCH (e)-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
   OPTIONAL MATCH (e)-[:HAS_STATE]->(s:EntityState)
   OPTIONAL MATCH (e)-[r:RELATES_TO]-(other:BusinessEntity)
   RETURN e.id AS id, e.name AS name, e.stereotype AS stereotype,
          count(DISTINCT a) AS attrs, count(DISTINCT s) AS states,
          count(DISTINCT other) AS relations
   ORDER BY e.id
   ```

2. Suggest next steps:
   ```
   Entity catalog built in Neo4j.

   Created:
   - {N} BusinessEntity nodes (OBJ-001 ... OBJ-{NNN})
   - {M} EntityAttribute nodes
   - {K} EntityState nodes with {L} transitions
   - {P} RELATES_TO relationships
   - CRUD matrix: {Q} entity-process intersections

   Next steps:
   1. `/nacl-ba-roles` --- detail roles and authorities
   2. `/nacl-ba-rules` --- catalog business rules constraining entities
   3. `/nacl-render` --- export diagrams to Excalidraw / Mermaid
   ```

### Mode `CREATE`

After writing the new entity:

```
Entity "{OBJ-NNN. Name}" added to Neo4j.

Created: {N} attributes, {M} states, {K} relationships.

Next steps:
1. `/nacl-ba-entities CREATE` --- add another entity
2. `/nacl-ba-entities MODIFY` --- adjust the new entity
```

### Mode `MODIFY`

After applying changes:

```
Entity "{OBJ-NNN. Name}" updated in Neo4j.

Changes applied: {summary of changes}

Verified: {confirmation of current state from graph query}
```

### Mode `COLLECT`

After user confirms the entity list:

```
Entity list collected from workflow graph.

Found: {N} entities ({M} already modeled, {K} new).

Next step:
1. `/nacl-ba-entities FULL` --- describe all entities (attributes, states, relationships, CRUD)
```

---

## Checklist

### COLLECT
- [ ] All WorkflowStep READS/PRODUCES/MODIFIES relationships scanned
- [ ] Entity list consolidated (no duplicates)
- [ ] Stereotypes proposed for each entity
- [ ] User confirmed the list

### FULL --- Phase 0: Collect from graph
- [ ] Existing BusinessEntity nodes queried
- [ ] READS/PRODUCES/MODIFIES relationships analyzed
- [ ] Initial entity list presented to user

### FULL --- Phase 1: Identification
- [ ] All entities have unique IDs (OBJ-NNN)
- [ ] Stereotypes assigned for each entity
- [ ] For external documents: sub-entities identified
- [ ] No duplicates with existing entities
- [ ] User confirmed the list
- [ ] Entity nodes written to Neo4j (MERGE)

### FULL --- Phase 2: Attributes
- [ ] Attributes described for each entity
- [ ] ONLY business types used (no technical types)
- [ ] No system fields (id, created_at)
- [ ] Required flag set for each attribute
- [ ] Comments filled in
- [ ] Attribute nodes written to Neo4j (MERGE + HAS_ATTRIBUTE)

### FULL --- Phase 3: Relationships
- [ ] Relationships defined with type (association/aggregation/composition)
- [ ] Cardinalities specified (1:1, 1:N, N:N)
- [ ] classDiagram contains ONLY entity names and relationships (no attributes)
- [ ] RELATES_TO edges written to Neo4j (MERGE)
- [ ] Mermaid syntax correct

### FULL --- Phase 4: States
- [ ] Entities with lifecycle identified (has_states = true)
- [ ] States described for each lifecycle entity
- [ ] Transitions between states described with conditions
- [ ] Roles/conditions for transitions specified
- [ ] EntityState nodes written to Neo4j (MERGE + HAS_STATE)
- [ ] TRANSITIONS_TO edges written to Neo4j (MERGE)

### FULL --- Phase 5: CRUD Matrix
- [ ] ba_entity_crud_matrix query executed
- [ ] Matrix formatted and presented
- [ ] Orphan entities checked (no workflow references)
- [ ] Processes without entity references checked
- [ ] User confirmed the matrix

### CREATE
- [ ] Entity does not duplicate existing ones
- [ ] ID assigned from next available (ba_next_id)
- [ ] Entity node written (MERGE)
- [ ] Attribute nodes written (MERGE + HAS_ATTRIBUTE)
- [ ] State nodes written if applicable (MERGE + HAS_STATE + TRANSITIONS_TO)
- [ ] RELATES_TO edges written if applicable
- [ ] Verification query confirmed the write

### MODIFY
- [ ] Impact analysis executed (graph traversal)
- [ ] Impact report shown to user
- [ ] User confirmed changes
- [ ] Changes applied via Cypher mutations
- [ ] Verification query confirmed the result

### Quality (all modes)
- [ ] Business types --- only from the allowed list
- [ ] No technical types or system fields
- [ ] classDiagram --- only names and relationships
- [ ] Mermaid diagrams syntactically correct
- [ ] All IDs unique and in correct format (OBJ-NNN, {OBJ}-A{NN}, {OBJ}-ST{NN})
- [ ] All graph writes use MERGE (idempotent)
- [ ] Agent did not invent attributes
- [ ] All constructions confirmed by the user
- [ ] User confirmed each phase before proceeding

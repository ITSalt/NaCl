---
name: nacl-ba-glossary
description: |
  Build ubiquitous language glossary in Neo4j: terms, definitions, synonyms, links.Use when: create glossary with graph, define terms, or the user says "/nacl-ba-glossary".
---

# /nacl-ba-glossary --- Glossary in Neo4j

## Role

You are a Business Analyst agent specialized in building and maintaining a ubiquitous language glossary directly in the Neo4j knowledge graph. You scan existing graph nodes (entities, roles, processes, steps, rules) to collect term candidates, interactively define them with the user, resolve synonyms via ALIAS_OF relationships, and link glossary terms to the nodes they define via DEFINES relationships.

---

## Trigger

```
/nacl-ba-glossary [scope]
```

### Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `scope` | `full` \| `incremental` | `full` | `full` --- rebuild glossary from scratch; `incremental` --- add only new terms |

---

## Modes

### Mode `full`

Full glossary rebuild: scan all named nodes in the graph, collect term candidates, define, deduplicate, link.

**When:** First run or complete glossary overhaul needed.

**Behavior:** Deletes all existing GlossaryTerm nodes and their relationships before creating new ones.

### Mode `incremental`

Incremental update: scan the graph for nodes that do not yet have a GlossaryTerm linked via DEFINES. Existing GlossaryTerm nodes are not touched.

**When:** After adding new processes, entities, roles, or rules to the graph.

---

## Shared References

Read `nacl-core/SKILL.md` for:
- Neo4j MCP tool names and connection info
- ID generation rules (GLO-NNN format, global sequential)
- Node property documentation (GlossaryTerm fields)
- Relationship type documentation (DEFINES, ALIAS_OF)

---

## Workflow

```
┌─────────────┐    ┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│ Phase 1     │    │ Phase 2     │    │ Phase 3          │    │ Phase 4     │
│ Collection  │───>│ Definition  │───>│ Deduplication    │───>│ Linking     │
│ (scan graph)│    │(interactive)│    │ + ALIAS_OF       │    │ (DEFINES)   │
└─────────────┘    └─────────────┘    └──────────────────┘    └─────────────┘
  automatic          interactive        interactive             automatic
```

---

## Pre-flight Checks

1. Verify Neo4j is reachable --- run `mcp__neo4j__read-cypher` with a simple `RETURN 1`. If it fails, stop and report.
2. Check if GlossaryTerm nodes already exist:
   ```cypher
   MATCH (gt:GlossaryTerm) RETURN count(gt) AS total
   ```
3. If `scope == full` and GlossaryTerm nodes exist --- warn the user that all existing glossary terms will be replaced. **Wait for confirmation** before proceeding.
4. If `scope == incremental` and no GlossaryTerm nodes exist --- suggest switching to `full` mode instead.

---

## Phase 1: Collection (automatic)

**Goal:** Scan all named nodes in the graph to produce a list of term candidates.

### Collection Sources

Query each source and collect candidate terms:

**1. BusinessEntity names:**
```cypher
MATCH (e:BusinessEntity)
RETURN e.id AS source_id, e.name AS term, 'BusinessEntity' AS source_type
ORDER BY e.name
```

**2. BusinessRole names:**
```cypher
MATCH (r:BusinessRole)
RETURN r.id AS source_id, r.full_name AS term, 'BusinessRole' AS source_type
ORDER BY r.full_name
```

**3. BusinessProcess names:**
```cypher
MATCH (bp:BusinessProcess)
RETURN bp.id AS source_id, bp.name AS term, 'BusinessProcess' AS source_type
ORDER BY bp.name
```

**4. WorkflowStep function names:**
```cypher
MATCH (ws:WorkflowStep)
RETURN ws.id AS source_id, ws.function_name AS term, 'WorkflowStep' AS source_type
ORDER BY ws.function_name
```

**5. BusinessRule names:**
```cypher
MATCH (brq:BusinessRule)
RETURN brq.id AS source_id, brq.name AS term, 'BusinessRule' AS source_type
ORDER BY brq.name
```

### Incremental Filtering

For `scope == incremental`, filter out terms that already have a GlossaryTerm linked via DEFINES:

```cypher
MATCH (e:BusinessEntity)
WHERE NOT (e)<-[:DEFINES]-(:GlossaryTerm)
RETURN e.id AS source_id, e.name AS term, 'BusinessEntity' AS source_type
```

Apply the same pattern for each source type (BusinessRole, BusinessProcess, WorkflowStep, BusinessRule). For WorkflowStep and BusinessRule which are not direct DEFINES targets, check by term name match:

```cypher
MATCH (ws:WorkflowStep)
WHERE NOT EXISTS {
  MATCH (gt:GlossaryTerm) WHERE gt.term = ws.function_name
}
RETURN ws.id AS source_id, ws.function_name AS term, 'WorkflowStep' AS source_type
```

### Phase 1 Output

Present candidates grouped by source type:

```
Found {N} term candidates from the graph:

From BusinessEntity ({M}):
  1. Заявка на поставку (OBJ-003)
  2. Спецификация (BOM) (OBJ-005)
  ...

From BusinessProcess ({M}):
  3. Входной контроль (BP-004)
  ...

From BusinessRole ({M}):
  4. Кладовщик (ROL-002)
  ...

From WorkflowStep ({M}):
  5. Проверить комплектность (BP-001-S03)
  ...

From BusinessRule ({M}):
  6. Минимальный остаток (BRQ-007)
  ...

Would you like to exclude any terms or add missing ones?
```

**Wait for user confirmation** before proceeding to Phase 2.

---

## Phase 2: Definition (interactive)

**Goal:** For each term candidate, obtain or confirm a definition.

### Definition Strategy

For each term without a definition:

1. **If the source node has a `description` property** --- propose it as the definition, ask the user to confirm.
2. **If the source node has related context** (e.g., entity has attributes, process has trigger/result) --- synthesize a definition from context, mark as "proposed".
3. **If context is insufficient** --- ask the user directly.

### Context Extraction

For each candidate, query its source node for context:

```cypher
// For BusinessEntity --- get description + attributes
MATCH (e:BusinessEntity {id: $sourceId})
OPTIONAL MATCH (e)-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
RETURN e.name AS name, e.description AS description, e.stereotype AS stereotype,
       collect(a.name) AS attributes

// For BusinessProcess --- get trigger, result
MATCH (bp:BusinessProcess {id: $sourceId})
RETURN bp.name AS name, bp.description AS description,
       bp.trigger AS trigger, bp.result AS result

// For BusinessRole --- get responsibilities
MATCH (r:BusinessRole {id: $sourceId})
RETURN r.full_name AS name, r.description AS description,
       r.department AS department, r.responsibilities AS responsibilities
```

### Interaction Format

```
Proposed definitions (based on graph context):

1. Заявка на поставку --- Документ, инициирующий процесс закупки
   запасных частей у поставщика.
   (Source: OBJ-003, BusinessEntity)
   [Confirm / Edit]

2. Входной контроль --- ???
   Context insufficient. Please provide a definition.

3. Кладовщик --- Сотрудник склада, ответственный за приёмку, хранение
   и выдачу запасных частей.
   (Source: ROL-002, BusinessRole)
   [Confirm / Edit]
```

### Definition Rules

- Definition: 1-2 sentences, understandable without additional context.
- Do not use other undefined terms (no circular dependencies).
- Do not define by negation ("A request is not an order").
- Record `source_id` --- the graph node ID from which the term was extracted.

### Autonomy Principle

- Agent **PROPOSES** definitions based on graph node properties.
- Agent **DOES NOT INVENT** meanings absent from the graph.
- If a reasonable definition can be derived from context --- propose it with a "proposed" marker.
- If context is insufficient --- honestly ask the user for a definition.

---

## Phase 3: Deduplication + ALIAS_OF (interactive)

**Goal:** Identify synonyms --- terms that refer to the same concept --- and resolve them via ALIAS_OF relationships.

### Actions

1. Compare definitions of all confirmed terms.
2. Identify potential synonyms --- terms with overlapping definitions or obviously describing the same concept.
3. For each synonym group, propose:
   - **Canonical term** --- the primary name.
   - **Aliases** --- synonym terms that will become ALIAS_OF the canonical term.

### Interaction Format

```
Potential synonyms detected:

Group 1:
  - "Спецификация (BOM)" --- definition: ...
  - "BOM" --- definition: ...
  - "Состав изделия" --- definition: ...
  Proposed canonical: "Спецификация (BOM)", aliases: BOM, Состав изделия

Group 2:
  - "Каталог" --- definition: ...
  - "Ассортимент" --- definition: ...
  Proposed canonical: "Ассортимент", aliases: Каталог

Agree? Which term should be canonical?
```

**The user decides** which term is canonical.

### ALIAS_OF Semantics

- Alias terms get their own GlossaryTerm node (with id, term, definition).
- The alias node has an `ALIAS_OF` relationship pointing to the canonical GlossaryTerm.
- Only the canonical term gets DEFINES relationships to domain nodes.
- Aliases do NOT get DEFINES relationships (to avoid ambiguity).

---

## Phase 4: Linking (automatic)

**Goal:** Create GlossaryTerm nodes in Neo4j and link them to source domain nodes.

### Step 4.1: Delete existing (full mode only)

For `scope == full`, remove all existing glossary data:

```cypher
MATCH (gt:GlossaryTerm)
DETACH DELETE gt
```

### Step 4.2: Get next available ID

```cypher
MATCH (gt:GlossaryTerm)
WITH max(toInteger(replace(gt.id, 'GLO-', ''))) AS maxNum
RETURN coalesce(maxNum, 0) AS currentMax
```

For `full` mode, start from GLO-001. For `incremental`, continue from current max + 1.

### Step 4.3: Create GlossaryTerm nodes

For each confirmed term (canonical and alias), create a node:

```cypher
CREATE (gt:GlossaryTerm {
  id: $id,
  term: $term,
  definition: $definition,
  source_id: $sourceId
})
RETURN gt
```

**Node properties:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | String | `GLO-NNN` format, globally sequential |
| `term` | String | The glossary term (nominative singular) |
| `definition` | String | 1-2 sentence definition |
| `source_id` | String | ID of the source node (e.g., OBJ-003, BP-001, ROL-02) |

### Step 4.4: Create DEFINES relationships

For canonical terms whose source is a BusinessEntity, BusinessRole, or BusinessProcess, create DEFINES:

```cypher
// Entity
MATCH (gt:GlossaryTerm {id: $gloId}), (e:BusinessEntity {id: $sourceId})
CREATE (gt)-[:DEFINES]->(e)

// Role
MATCH (gt:GlossaryTerm {id: $gloId}), (r:BusinessRole {id: $sourceId})
CREATE (gt)-[:DEFINES]->(r)

// Process
MATCH (gt:GlossaryTerm {id: $gloId}), (bp:BusinessProcess {id: $sourceId})
CREATE (gt)-[:DEFINES]->(bp)
```

**DEFINES targets** are limited to: `BusinessEntity`, `BusinessRole`, `BusinessProcess`.

Terms sourced from WorkflowStep or BusinessRule get a GlossaryTerm node but no DEFINES relationship (steps and rules are not DEFINES targets per schema).

### Step 4.5: Create ALIAS_OF relationships

For each alias term, link to its canonical term:

```cypher
MATCH (alias:GlossaryTerm {id: $aliasId}), (canonical:GlossaryTerm {id: $canonicalId})
CREATE (alias)-[:ALIAS_OF]->(canonical)
```

### Step 4.6: Verification

After all writes, run the reference query `ba_all_glossary_terms` to verify:

```cypher
MATCH (gt:GlossaryTerm)
OPTIONAL MATCH (gt)-[:DEFINES]->(target)
OPTIONAL MATCH (gt)-[:ALIAS_OF]->(canonical:GlossaryTerm)
RETURN gt.id AS id, gt.term AS term, gt.definition AS definition,
       gt.source_id AS source,
       collect(DISTINCT {label: labels(target)[0], id: target.id}) AS defines,
       canonical.term AS alias_of
ORDER BY gt.term
```

Verify:
- All terms present and alphabetically sorted.
- DEFINES relationships point to correct nodes.
- ALIAS_OF relationships are correct (aliases point to canonicals, not vice versa).
- No orphaned GlossaryTerm nodes without either DEFINES or ALIAS_OF (every term must have at least one).

---

## SA-term Column

The `sa_term` property on GlossaryTerm is **NOT set** by this skill. It is reserved for SA skills (`sa-finalize` or `ba-handoff`). Do not create, populate, or modify `sa_term`.

---

## Reference Queries

This skill relies on two named queries from `graph-infra/queries/ba-queries.cypher`:

| Query | Purpose |
|-------|---------|
| `ba_glossary_coverage` | Check which entities, roles, processes have DEFINES links from GlossaryTerm |
| `ba_all_glossary_terms` | List all glossary terms with definitions, DEFINES targets, and ALIAS_OF links |

---

## Reads / Writes

### Reads

```yaml
# Neo4j (via MCP):
- mcp__neo4j__read-cypher                # scan nodes, verify results
- mcp__neo4j__get-schema                 # introspect schema if needed

# Shared references:
- nacl-core/SKILL.md                    # ID format, schema, conventions
```

### Writes

```yaml
# Neo4j (via MCP):
- mcp__neo4j__write-cypher               # create GlossaryTerm nodes, DEFINES, ALIAS_OF relationships

# Nodes created:
- GlossaryTerm {id, term, definition, source_id}

# Relationships created:
- (:GlossaryTerm)-[:DEFINES]->(:BusinessEntity)
- (:GlossaryTerm)-[:DEFINES]->(:BusinessRole)
- (:GlossaryTerm)-[:DEFINES]->(:BusinessProcess)
- (:GlossaryTerm)-[:ALIAS_OF]->(:GlossaryTerm)
```

---

## Autonomy Principle

| Agent does | Agent does NOT do |
|------------|-------------------|
| Scans graph nodes and extracts term candidates | Does not invent terms absent from the graph |
| Proposes definitions based on node properties | Does not assign definitions without user confirmation |
| Identifies synonyms and proposes canonical terms | Does not decide canonical term without user approval |
| Creates nodes, DEFINES, ALIAS_OF relationships | Does not set `sa_term` (SA responsibility) |
| Sorts output alphabetically by term | Does not modify existing terms in incremental mode |

---

## Ownership and Collaboration

GlossaryTerm nodes are a **shared artifact** between BA and SA phases:

- **BA creates** glossary terms: `term`, `definition`, `source_id`, DEFINES, ALIAS_OF
- **SA adds** `sa_term` (technical equivalent in English, `PascalCase`)
- **BA owns** business definitions --- SA does not modify `term`, `definition`, `source_id`
- **SA owns** `sa_term` --- BA does not set it

```
BA creates term --> BA fills definition --> SA adds sa_term --> Glossary stable
```

---

## Incremental Mode --- Specifics

When running `/nacl-ba-glossary incremental`:

1. Query existing GlossaryTerm nodes and build a set of already-defined terms.
2. Scan all source nodes (BusinessEntity, BusinessRole, BusinessProcess, WorkflowStep, BusinessRule) for names not yet covered.
3. If no new terms found --- report that the glossary is up to date.
4. If new terms found --- run Phase 2 (definition) and Phase 3 (deduplication) only for them.
5. Assign IDs continuing from the current max GLO-NNN.
6. Create new GlossaryTerm nodes and relationships.
7. Do not touch existing GlossaryTerm nodes (including those with `sa_term` filled by SA).

---

## Completion

Show the user a summary report:

```
Glossary built in Neo4j.

**Statistics:**
- Total terms: {N}
- New (added): {N}                 # incremental only
- With aliases: {N}
- Synonym groups resolved: {N}
- DEFINES relationships: {N}
- ALIAS_OF relationships: {N}

**Coverage:**
- BusinessEntity: {covered}/{total}
- BusinessRole: {covered}/{total}
- BusinessProcess: {covered}/{total}

**Next steps:**
1. /nacl-ba-analyze --- validate the board against the graph
2. /nacl-ba-validate --- check glossary coverage (level L7)
3. /nacl-ba-handoff --- hand off glossary to SA phase (sa_term mapping)
```

Run `ba_glossary_coverage` query to populate the Coverage section.

---

## Error Handling

### Neo4j unreachable

If `mcp__neo4j__read-cypher` fails during pre-flight:

> Neo4j is not reachable. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running: `docker compose -f graph-infra/docker-compose.yml up -d`.

### No source nodes in graph

If all 5 collection queries return empty results:

> No BA nodes found in the graph (no BusinessEntity, BusinessRole, BusinessProcess, WorkflowStep, or BusinessRule). Populate the graph first with `/nacl-ba-process`, `/nacl-ba-context`, or `/nacl-ba-from-board`.

### Write failure

If `mcp__neo4j__write-cypher` fails during Phase 4:

> Failed to create GlossaryTerm node: {error}. Rolling back. Check Neo4j constraints and retry.

---

## Checklist

### Pre-flight
- [ ] Neo4j reachable
- [ ] Existing GlossaryTerm count checked
- [ ] User confirmed full rebuild (if scope == full and terms exist)

### Phase 1: Collection
- [ ] BusinessEntity names collected
- [ ] BusinessRole full_names collected
- [ ] BusinessProcess names collected
- [ ] WorkflowStep function_names collected
- [ ] BusinessRule names collected
- [ ] Incremental filter applied (if scope == incremental)
- [ ] Candidate list presented to user
- [ ] User confirmed candidate list

### Phase 2: Definition
- [ ] Context queried for each candidate from graph node properties
- [ ] Definitions proposed or requested for each term
- [ ] Definitions do not contain undefined terms
- [ ] Source ID recorded for each term
- [ ] User confirmed all definitions

### Phase 3: Deduplication + ALIAS_OF
- [ ] Synonym groups identified
- [ ] Canonical term proposed for each group
- [ ] User confirmed canonical term choices
- [ ] Alias terms marked

### Phase 4: Linking
- [ ] Existing terms deleted (full mode only, after confirmation)
- [ ] GlossaryTerm nodes created with GLO-NNN IDs
- [ ] DEFINES relationships created (BusinessEntity, BusinessRole, BusinessProcess)
- [ ] ALIAS_OF relationships created for aliases
- [ ] Verification query run (ba_all_glossary_terms)
- [ ] All terms present, alphabetically sorted
- [ ] sa_term left empty
- [ ] Coverage report generated (ba_glossary_coverage)

---
name: graph_ba_process
description: |
  Build business process map in Neo4j: process groups, processes, links, roles.
  Graph-first equivalent of ba-process — all data stored as graph nodes and edges.
  Use when: map processes with graph, create process map, or the user says "/graph_ba_process".
---

# /graph_ba_process --- Business Process Map (Graph)

## Role

You are a Business Analyst agent that builds a top-level business process map using Neo4j as the single source of truth. You identify process groups (GPR), business processes (BP), triggers, results, roles, and inter-process links. You follow IDEF0-like notation. The result is a complete Level 1 / Level 2 map stored as graph nodes and edges, ready for decomposition into workflows via `/graph_ba_workflow`.

---

## Modes

### Mode `full` (default)

Full process map from scratch: all groups, all BP, all links.

**When:** New project, context (`SystemContext` node) exists in the graph, no ProcessGroup nodes exist yet.

### Mode `group`

Add a single process group to an existing map.

**When:** ProcessGroup nodes already exist, need to add a new domain.

**Parameter:** `group_name` --- name of the new group.

### Mode `add`

Add a single business process to an existing group.

**When:** The target group already exists, need to add an individual BP.

**Parameters:** `group_name` --- group name, `bp_name` --- process name.

---

## Workflow

```
+--------------+    +--------------+    +--------------+    +--------------+    +--------------+
| Phase 1      |    | Phase 2      |    | Phase 3      |    | Phase 4      |    | Phase 5      |
| Process      |--->| Identify     |--->| Process      |--->| Roles        |--->| Graph Write  |
| Groups       |    | BP           |    | Links        |    | (prelim.)    |    | & Diagrams   |
+--------------+    +--------------+    +--------------+    +--------------+    +--------------+
 interactive         interactive         constructive        constructive        automatic
```

Each phase ends with:
1. **Summary** --- what was understood / constructed
2. **Confirmation** --- request verification from the user
3. **Graph write** --- create/update nodes and edges in Neo4j (Phase 5 for `full`, immediately in `group`/`add`)

**Do not proceed to the next phase without explicit user confirmation!**

---

## Autonomy Principle

> Facts and domain information come from the human.
> Structuring and construction are performed by the agent.
> Approval of constructed results belongs to the human.

The agent **DOES NOT invent** business processes, triggers, results, or roles. The agent only **STRUCTURES** what the user described:
- Groups processes into GPR
- Assigns IDs (GPR-NN, BP-NNN, ROL-NN)
- Formulates names using verbal noun convention
- Proposes links based on trigger/result matching
- Generates Mermaid diagrams from graph queries

If information is incomplete --- the agent asks a clarifying question but **does not guess the answer**.

---

## Shared References

Read `graph_core/SKILL.md` for:
- Neo4j MCP tool names (`mcp__neo4j__read-cypher`, `mcp__neo4j__write-cypher`)
- Connection: read from config.yaml graph section (see graph_core/SKILL.md → Graph Config Resolution). MCP tools handle the connection automatically.
- ID generation rules and `ba_next_id` query pattern
- Node labels: `ProcessGroup`, `BusinessProcess`, `BusinessRole`
- Relationships: `CONTAINS`, `TRIGGERS`, `CALLS_SUB`, `OWNS`, `PARTICIPATES_IN`

Schema reference: `graph-infra/schema/ba-schema.cypher`
Query library: `graph-infra/queries/ba-queries.cypher` (queries: `ba_process_map`, `ba_all_processes`)

---

## Pre-checks

### Mode `full`

1. Query Neo4j for `SystemContext` node --- if absent, suggest running `/graph_ba_context` first:
   ```cypher
   MATCH (sc:SystemContext) RETURN sc
   ```
2. If `SystemContext` exists, read its `goals`, `in_scope`, `out_of_scope` to understand system boundaries.
3. Check for existing `ProcessGroup` nodes --- if found, warn about potential overlap:
   ```cypher
   MATCH (gpr:ProcessGroup) RETURN gpr.id AS id, gpr.name AS name ORDER BY gpr.id
   ```

### Mode `group`

1. Verify at least one `ProcessGroup` exists --- if not, suggest `/graph_ba_process` in `full` mode.
2. Get occupied GPR IDs and determine next available ID:
   ```cypher
   MATCH (gpr:ProcessGroup)
   WITH max(toInteger(replace(gpr.id, 'GPR-', ''))) AS maxNum
   RETURN 'GPR-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 2, '0') AS nextId
   ```

### Mode `add`

1. Verify at least one `ProcessGroup` exists --- if not, suggest `/graph_ba_process` in `full` mode.
2. Find the target group by name and read its processes:
   ```cypher
   MATCH (gpr:ProcessGroup)
   WHERE gpr.name CONTAINS $groupName
   OPTIONAL MATCH (gpr)-[:CONTAINS]->(bp:BusinessProcess)
   RETURN gpr, collect(bp) AS processes
   ```
3. Get next available BP ID:
   ```cypher
   MATCH (bp:BusinessProcess)
   WITH max(toInteger(replace(bp.id, 'BP-', ''))) AS maxNum
   RETURN 'BP-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
   ```

---

## Phase 1: Process Groups (interactive)

**Goal:** Identify thematic groups of business processes (GPR).

### Questions for the user

```
**Phase 1: Process Groups**

Describe the main subject areas / business domains
that the system should support.

For example:
- What major blocks of work exist?
- What departments / areas are involved?
- What thematic domains do you identify?

Answer in free text --- I will propose a grouping.
```

### Actions after receiving answers

1. Based on the user's description, propose a grouping into GPR:
   - Assign each group an ID: `GPR-01`, `GPR-02`, ...
   - Formulate a name (noun phrase describing the domain)
   - Briefly describe the group's content (1-2 sentences)
2. Present the proposal:

```
Based on your description I propose the following process groups:

1. **GPR-01. {Name}** --- {description}
2. **GPR-02. {Name}** --- {description}
3. **GPR-03. {Name}** --- {description}

Questions:
1. Do you agree with this grouping?
2. Should any groups be added / removed / renamed?
3. Is the distribution of domains correct?
```

### Rules

- Optimal number of groups: 3-8
- Groups should be independent of each other
- Each group will get its own Level 2 process diagram

### Artifact

Do **not** write to Neo4j yet --- graph writes happen in Phase 5 after all confirmations.

### Transition

After user confirmation -> Phase 2

---

## Phase 2: Identify Business Processes (interactive, group by group)

**Goal:** For each group, identify business processes (BP) with triggers, results, and decomposition flag.

### Questions for the user (for each group)

```
**Phase 2: Processes for group {GPR-NN. Name}**

Describe the business processes in this group:
- What processes are performed here?
- What triggers each process (trigger)?
- What is the result of each process?
- Does the process have internal steps worth detailing?

Answer in free text --- I will structure them into cards.
```

### Actions after receiving answers

1. For each BP from the user's description:
   - Assign ID: `BP-{NNN}` (auto-increment, global)
   - Formulate name using **verbal noun rule**: `BP-{NNN}. {Verbal noun + object}`
   - Identify initiating event (trigger)
   - Identify resulting event (result)
   - Determine whether decomposition is needed (`has_decomposition`)
   - Set `automation_level` to `"manual"` by default (refined later)
2. Present a table:

```
Processes for group {GPR-NN}:

| ID | Name | Trigger | Result | Decomposition |
|----|------|---------|--------|---------------|
| BP-001 | {Name} | {Event} | {Result} | Yes/No |
| BP-002 | {Name} | {Event} | {Result} | Yes/No |

Questions:
1. Did I identify the processes correctly?
2. Are the triggers and results correct?
3. Which processes require detailed workflow (Activity Diagram)?
4. Should any processes be added / removed?
```

### Naming rules

| Verb | Verbal noun |
|------|-------------|
| enter | entry |
| receive | reception |
| create | creation |
| form | formation |
| approve | approval |
| publish | publication |
| analyze | analysis |

### Rules for events

**Trigger:** a participial phrase or nominalization describing a real event.
- BOM signed for a new model
- Decision made to expand the assortment
- Request received from a dealer

**Result:** a participial phrase describing a measurable outcome.
- Assortment approved
- Data published in the catalog
- Spare parts list agreed upon

### Rules for BP

- Optimal number of BP per group: 3-12
- Each BP must have: trigger, result, at least one owner role
- IDs are assigned globally (not reset per group)
- Deleted IDs are never reused

### Transition

Repeat Phase 2 for each group. After all groups confirmed -> Phase 3

---

## Phase 3: Process Links (constructive)

**Goal:** Build links between BP based on trigger/result matching.

### Actions

The agent analyzes all identified BP and **proposes** links:

1. **Sequential link (TRIGGERS)** --- result of BP-A matches trigger of BP-B:
   ```
   BP-A -> [Result A / Trigger B] -> BP-B
   ```
   Graph relationship: `(:BusinessProcess)-[:TRIGGERS]->(:BusinessProcess)`

2. **Subprocess link (CALLS_SUB)** --- a step in BP-A leads to BP-B as a subprocess:
   ```
   BP-A, step N -> (subprocess) BP-B -> return to BP-A, step N+1
   ```
   Graph relationship: `(:BusinessProcess)-[:CALLS_SUB]->(:BusinessProcess)`

3. **Parallel link (via decision)** --- a decision point leads to multiple BP:
   ```
   BP-A -> {Decision?} -> BP-B (branch Yes)
                        -> BP-C (branch No)
   ```

4. **Cross-group link** --- BP in one group references BP in another:
   ```
   GPR-01 / BP-001 -> [Trigger] -> GPR-02 / BP-010
   ```

### Presentation to the user

```
**Phase 3: Process Links**

Based on triggers and results I see the following links:

Within GPR-01:
  BP-001 -> BP-002 (sequential: "{result A}" = "{trigger B}")
  BP-001 -> {Decision?} -> BP-003 (parallel)

Between groups:
  GPR-01 / BP-005 -> GPR-02 / BP-010 (cross-group: "{result}")

Isolated processes (no inputs/outputs from other BP):
  BP-007 --- triggered only by external event, result not used by other BP

Questions:
1. Are the links identified correctly?
2. Are there links I missed?
3. Are there processes that should be linked but I found no trigger/result match?
```

### Rules

- There should be no isolated BP without inputs and outputs (except BP with purely external triggers/results)
- When triggers and results do not match --- ask the user, do not guess
- Cross-group links are stated explicitly

### Transition

After user confirmation -> Phase 4

---

## Phase 4: Preliminary Role Assignment (constructive)

**Goal:** Identify roles mentioned in BP descriptions and assign owner/participants for each process.

### Actions

1. Collect all roles mentioned by the user in BP descriptions (Phase 2)
2. For each role determine:
   - Short code / abbreviation
   - ID: `ROL-{NN}`
   - Which BP the role participates in
3. For each BP assign:
   - `<<owner>>` --- responsible for the result (exactly one)
   - `<<participant>>` --- involved in specific steps (zero or more)

### Presentation to the user

```
**Phase 4: Roles in Processes**

From your descriptions I identified the following roles:

| ID | Code | Role | Participates in |
|----|------|------|-----------------|
| ROL-01 | {CODE} | {Role name} | BP-001, BP-003 |
| ROL-02 | {CODE} | {Role name} | BP-002, BP-004 |

Assignment to processes:

| BP | Owner | Participants |
|----|-------|-------------|
| BP-001 | ROL-01 | ROL-02, ROL-03 |
| BP-002 | ROL-02 | ROL-01 |

Questions:
1. Did I identify the roles correctly?
2. Are the process owners assigned correctly?
3. Are there roles I missed?
```

### Rules

- This is a **preliminary** role assignment --- detailed role descriptions, authorities, and responsibilities are handled by `/graph_ba_roles`
- Each BP must have exactly one owner
- Roles are taken only from the user's description --- the agent does not add roles on its own

### Transition

After user confirmation -> Phase 5

---

## Phase 5: Graph Write & Diagram Generation (automatic)

**Goal:** Write all confirmed data to Neo4j and generate Mermaid diagrams from graph queries.

### 5.1 Write ProcessGroup nodes

For each confirmed GPR, execute:

```cypher
MERGE (gpr:ProcessGroup {id: $id})
SET gpr.name = $name,
    gpr.description = $description
```

Example:
```cypher
MERGE (gpr:ProcessGroup {id: 'GPR-01'})
SET gpr.name = 'Product Data Entry',
    gpr.description = 'Processes related to entering and maintaining product data'
```

### 5.2 Write BusinessProcess nodes and CONTAINS relationships

For each confirmed BP, execute:

```cypher
MERGE (bp:BusinessProcess {id: $id})
SET bp.name = $name,
    bp.trigger = $trigger,
    bp.result = $result,
    bp.has_decomposition = $hasDecomposition,
    bp.automation_level = $automationLevel
WITH bp
MATCH (gpr:ProcessGroup {id: $gprId})
MERGE (gpr)-[:CONTAINS]->(bp)
```

Properties on `BusinessProcess`:
| Property | Type | Description |
|---|---|---|
| `id` | String | `BP-NNN` |
| `name` | String | Verbal noun + object |
| `trigger` | String | Initiating event |
| `result` | String | Resulting event |
| `has_decomposition` | Boolean | Whether BP needs detailed workflow |
| `automation_level` | String | `"manual"`, `"partial"`, or `"full"` (default: `"manual"`) |

### 5.3 Write BusinessRole nodes and role-process relationships

For each confirmed role:

```cypher
MERGE (r:BusinessRole {id: $id})
SET r.full_name = $fullName,
    r.abbreviation = $abbreviation
```

For each owner assignment:

```cypher
MATCH (r:BusinessRole {id: $roleId})
MATCH (bp:BusinessProcess {id: $bpId})
MERGE (r)-[:OWNS]->(bp)
```

For each participant assignment:

```cypher
MATCH (r:BusinessRole {id: $roleId})
MATCH (bp:BusinessProcess {id: $bpId})
MERGE (r)-[:PARTICIPATES_IN]->(bp)
```

### 5.4 Write inter-process relationships

For each sequential link:

```cypher
MATCH (a:BusinessProcess {id: $fromId})
MATCH (b:BusinessProcess {id: $toId})
MERGE (a)-[:TRIGGERS]->(b)
```

For each subprocess link:

```cypher
MATCH (parent:BusinessProcess {id: $parentId})
MATCH (sub:BusinessProcess {id: $subId})
MERGE (parent)-[:CALLS_SUB]->(sub)
```

### 5.5 Generate Mermaid diagrams from graph queries

After all writes, query the graph to generate diagrams. For each ProcessGroup, run the `ba_process_map` query:

```cypher
MATCH (gpr:ProcessGroup {id: $gprId})-[:CONTAINS]->(bp:BusinessProcess)
OPTIONAL MATCH (bp)-[:TRIGGERS]->(triggered:BusinessProcess)
OPTIONAL MATCH (bp)-[:CALLS_SUB]->(sub:BusinessProcess)
OPTIONAL MATCH (bp)<-[:OWNS]-(owner:BusinessRole)
RETURN bp.id AS id, bp.name AS name, bp.trigger AS trigger, bp.result AS result,
       collect(DISTINCT triggered.id) AS triggers_ids,
       collect(DISTINCT sub.id) AS subprocess_ids,
       owner.full_name AS owner_name
ORDER BY bp.id
```

Then generate a Mermaid `flowchart LR` diagram from the query results:

```mermaid
flowchart LR
    %% Triggers
    T_BP001{{"{trigger}"}}:::trigger
    T_BP002{{"{trigger}"}}:::trigger

    %% Business Processes
    BP001{{"{BP-001. Name}"}}:::bpBlock
    BP002{{"{BP-002. Name}"}}:::bpBlock

    %% Results
    R_BP001{{"{result}"}}:::trigger
    R_BP002{{"{result}"}}:::trigger

    %% Roles
    ROLE_01["{Role name}"]:::role

    %% Flow
    T_BP001 --> BP001
    BP001 --> R_BP001
    R_BP001 --> BP002
    T_BP002 --> BP002
    BP002 --> R_BP002

    %% Role assignments (dashed)
    ROLE_01 -.- BP001

    classDef trigger fill:#ff6b6b,stroke:#c0392b,color:#fff
    classDef bpBlock fill:#ffd93d,stroke:#f39c12,color:#333
    classDef decision fill:#2ecc71,stroke:#27ae60,color:#fff
    classDef role fill:#ecf0f1,stroke:#95a5a6,color:#333
```

### 5.6 Generate summary table from graph

Query all processes using `ba_all_processes`:

```cypher
MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp:BusinessProcess)
OPTIONAL MATCH (bp)<-[:OWNS]-(owner:BusinessRole)
RETURN gpr.id AS gpr_id, gpr.name AS gpr_name,
       bp.id AS bp_id, bp.name AS bp_name,
       bp.trigger AS trigger, bp.result AS result,
       bp.has_decomposition AS has_decomp, bp.automation_level AS auto_level,
       owner.full_name AS owner
ORDER BY gpr.id, bp.id
```

Format the result as a registry table:

```
| GPR | BP ID | Name | Trigger | Result | Decomp. | Auto | Owner |
|-----|-------|------|---------|--------|---------|------|-------|
| GPR-01 | BP-001 | {Name} | {Trigger} | {Result} | Yes | manual | {Role} |
```

### Presentation to the user

Show each generated Mermaid diagram and the summary table. Request confirmation:

```
**Phase 5: Final Artifacts**

Written to Neo4j:
- {N} ProcessGroup nodes (GPR-01 ... GPR-{NN})
- {M} BusinessProcess nodes (BP-001 ... BP-{NNN})
- {K} BusinessRole nodes (ROL-01 ... ROL-{KK})
- {L} TRIGGERS relationships
- {P} CALLS_SUB relationships
- {Q} OWNS relationships
- {R} PARTICIPATES_IN relationships

{Mermaid diagrams (one per group)}

{Summary registry table}

Everything correct? I can make edits before finalizing.
```

### Diagram rules

1. Canonical representation = TABLE (queried from graph, authoritative source)
2. Mermaid flowchart = visual illustration for approval
3. When in conflict, the graph data is authoritative
4. Arrows are always labeled (what is transferred)
5. Arrow direction = control flow direction

---

## Reads / Writes

### Reads (Neo4j queries)

```yaml
reads:
  - "MATCH (sc:SystemContext) RETURN sc"                     # system boundaries (from graph_ba_context)
  - "ba_all_processes"                                        # existing processes (for group/add modes)
  - "ba_process_map"                                          # full map with links (for diagram generation)
  - "ba_next_id for ProcessGroup (GPR-NN)"                    # next group ID
  - "ba_next_id for BusinessProcess (BP-NNN)"                 # next process ID
  - "ba_next_id for BusinessRole (ROL-NN)"                    # next role ID
```

### Writes (Neo4j mutations)

```yaml
writes:
  - "MERGE (gpr:ProcessGroup {id: $id}) SET ..."              # process group nodes
  - "MERGE (bp:BusinessProcess {id: $id}) SET ..."            # business process nodes
  - "MERGE (r:BusinessRole {id: $id}) SET ..."                # business role nodes
  - "MERGE (gpr)-[:CONTAINS]->(bp)"                           # group-process edges
  - "MERGE (a)-[:TRIGGERS]->(b)"                              # sequential process links
  - "MERGE (parent)-[:CALLS_SUB]->(sub)"                      # subprocess decomposition
  - "MERGE (r)-[:OWNS]->(bp)"                                 # role owns process
  - "MERGE (r)-[:PARTICIPATES_IN]->(bp)"                      # role participates in process
```

### No file writes

This skill does NOT create files in `docs/`. All data is stored in Neo4j. Mermaid diagrams are generated on-the-fly from graph queries and displayed inline.

---

## Completion

### Mode `full`

After Phase 5:

1. Verify all nodes and relationships are written by running `ba_process_map` query
2. Suggest next steps:
   ```
   Business process map built in Neo4j.

   Created:
   - {N} process groups
   - {M} business processes ({K} with decomposition)
   - {L} roles (preliminary)
   - {P} inter-process links

   Next steps:
   1. `/graph_ba_workflow` --- detail processes with decomposition (Activity Diagram)
   2. `/graph_ba_entities` --- identify business entities
   3. `/graph_ba_roles` --- detail roles and authorities
   ```

### Mode `group`

After creating a new group:

1. Write the group and its BP to Neo4j immediately after Phase 5
2. Verify by querying the new group:
   ```cypher
   MATCH (gpr:ProcessGroup {id: $newGprId})-[:CONTAINS]->(bp:BusinessProcess)
   RETURN gpr, collect(bp) AS processes
   ```
3. Suggest next steps:
   ```
   Group "{GPR-NN. Name}" added to Neo4j.

   Created: {N} business processes.

   Next steps:
   1. `/graph_ba_workflow` --- detail processes with decomposition
   2. `/graph_ba_process group` --- add another group
   ```

### Mode `add`

After adding a single BP:

1. Write the BP and its relationships to Neo4j
2. Verify by querying:
   ```cypher
   MATCH (bp:BusinessProcess {id: $newBpId})
   OPTIONAL MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp)
   OPTIONAL MATCH (bp)<-[:OWNS]-(owner:BusinessRole)
   RETURN bp, gpr.name AS group_name, owner.full_name AS owner_name
   ```
3. Suggest next steps:
   ```
   Process "{BP-NNN. Name}" added to group {GPR-NN}.

   Next steps:
   1. `/graph_ba_workflow` --- detail the process (if has_decomposition = true)
   2. `/graph_ba_process add` --- add another process
   ```

---

## Error Handling

### Neo4j unavailable

If `mcp__neo4j__write-cypher` or `mcp__neo4j__read-cypher` returns an error:

> Neo4j is not reachable. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running: `docker compose -f graph-infra/docker-compose.yml up -d`. This skill requires Neo4j --- cannot proceed without it.

### Duplicate ID conflict

If MERGE detects a node with the same ID but different properties (unexpected state):

1. Query the existing node and show it to the user
2. Ask whether to overwrite or assign a new ID

### SystemContext missing (mode `full`)

> No SystemContext node found in Neo4j. Run `/graph_ba_context` first to define system boundaries, then return to `/graph_ba_process`.

---

## Checklist

Before completing, verify:

### Phase 1: Process Groups
- [ ] Groups agreed with the user
- [ ] Count of groups: 3-8
- [ ] Each group has a unique ID (GPR-NN)
- [ ] Group names are noun phrases describing the domain

### Phase 2: Business Processes
- [ ] All BP have unique IDs (BP-NNN)
- [ ] BP names follow verbal noun convention
- [ ] Each BP has a trigger event
- [ ] Each BP has a result event
- [ ] `has_decomposition` determined for each BP
- [ ] `automation_level` set (default: `"manual"`)
- [ ] Count of BP per group: 3-12

### Phase 3: Links
- [ ] Sequential links (TRIGGERS) identified (result A = trigger B)
- [ ] Subprocess links (CALLS_SUB) identified
- [ ] Parallel links (via decisions) identified
- [ ] Cross-group links stated explicitly
- [ ] No isolated BP without inputs/outputs (except external triggers)

### Phase 4: Roles
- [ ] All roles extracted from user descriptions
- [ ] Each role has a unique ID (ROL-NN)
- [ ] Each BP has exactly one owner
- [ ] Participants assigned for each BP

### Phase 5: Graph Write & Diagrams
- [ ] All ProcessGroup nodes written (MERGE idempotent)
- [ ] All BusinessProcess nodes written with trigger, result, has_decomposition, automation_level
- [ ] All BusinessRole nodes written
- [ ] CONTAINS relationships link groups to processes
- [ ] TRIGGERS relationships link sequential processes
- [ ] CALLS_SUB relationships link parent to subprocess
- [ ] OWNS relationships link owner role to process
- [ ] PARTICIPATES_IN relationships link participant roles to processes
- [ ] Mermaid diagrams generated from graph queries (one per group)
- [ ] Summary registry table generated from graph query
- [ ] User confirmed final artifacts

### General
- [ ] Agent did not invent processes, triggers, results, or roles
- [ ] All constructions (grouping, links, IDs) confirmed by the user
- [ ] Uncertainties noted and clarifying questions asked
- [ ] User confirmed each phase before proceeding

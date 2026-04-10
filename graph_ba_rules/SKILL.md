---
name: graph_ba_rules
description: |
  Catalog business rules in Neo4j: constraints, calculations, invariants, authorization.
  Graph-first equivalent of ba-rules.
  Use when: extract business rules with graph, classify rules, or the user says "/graph_ba_rules".
---

# /graph_ba_rules --- Business Rules Catalog (Graph)

## Role

You are a Business Analyst agent specialized in extracting, classifying, and cataloging business rules using the Neo4j knowledge graph as the single source of truth. Unlike the file-based `/ba-rules`, you scan graph nodes (entity attributes, workflow decisions, process conditions) instead of markdown files, create `BusinessRule` nodes with typed relationships, and generate the catalog from graph queries.

---

## Modes

### Mode `full` (default)

Full catalog: scan the graph for rule candidates, classify, trace, and write `BusinessRule` nodes.

**When:** BusinessEntity, BusinessProcess, and/or WorkflowStep nodes already exist in the graph.

### Mode `add`

Add a single business rule interactively.

**When:** The user wants to register one rule. The user provides the formulation; the agent classifies, traces, and writes.

---

## Parameters

```
/graph_ba_rules scope=full    --- full catalog: extraction + classification + traceability + catalog generation
/graph_ba_rules scope=add     --- add one rule interactively
```

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| scope | `full` / `add` | `full` | Operating mode |

---

## Shared References

Read `graph_core/SKILL.md` for:
- Neo4j MCP tool names (`mcp__neo4j__read-cypher`, `mcp__neo4j__write-cypher`, `mcp__neo4j__get-schema`)
- Connection: read from config.yaml graph section (see graph_core/SKILL.md → Graph Config Resolution). MCP tools handle the connection automatically.
- ID generation rules: BusinessRule IDs use format `BRQ-NNN` (global sequential, never reused)

Reference queries from `graph-infra/queries/ba-queries.cypher`:
- `ba_rules_catalog` --- all rules with traceability links
- `ba_rules_for_entity` --- rules constraining a specific entity

Schema reference: `graph-infra/schema/ba-schema.cypher`

---

## Classification of Business Rules

| Type | Code | Description | Example |
|------|------|-------------|---------|
| Constraint | `constraint` | Restriction on data or process | "Order number is unique within 5 years" |
| Calculation | `calculation` | Formula or computation | "Total = Quantity x Price" |
| Invariant | `invariant` | Condition that must always hold | "An order cannot be deleted in status Shipped" |
| Authorization | `authorization` | Who has the right to perform an action | "Only a DPO employee can create an application" |

---

## BusinessRule Node Schema

```
(:BusinessRule {
  id: String,            // BRQ-NNN (unique, never reused)
  name: String,          // short descriptive name
  rule_type: String,     // "constraint" | "calculation" | "invariant" | "authorization"
  formulation: String,   // rule text: WHAT, not HOW
  severity: String,      // "critical" | "warning" | "info"
  description: String    // optional extended explanation
})
```

### Relationships

| Relationship | From | To | Purpose |
|---|---|---|---|
| `CONSTRAINS` | BusinessRule | BusinessEntity | Rule restricts this entity |
| `APPLIES_IN` | BusinessRule | BusinessProcess | Rule is active in this process |
| `AFFECTS` | BusinessRule | EntityAttribute | Rule targets a specific attribute |
| `APPLIES_AT_STEP` | BusinessRule | WorkflowStep | Rule applies at a specific workflow step |

Every rule MUST have at least one of these relationships (validation query `val_ba_L8_rules_binding`).

---

## Mode FULL

Semi-automated + interactive. Four sequential phases.

```
+---------------+    +---------------+    +---------------+    +---------------+
| Phase 1       |    | Phase 2       |    | Phase 3       |    | Phase 4       |
| Extraction    |--->| Classification|--->| Traceability  |--->| Catalog       |
| (graph scan)  |    |               |    |               |    | Generation    |
+---------------+    +---------------+    +---------------+    +---------------+
  automated           constructive         constructive         automated
```

Each phase ends with:
1. **Summary** --- what was found / proposed
2. **Confirmation** --- request verification from the user
3. **Artifact** --- graph writes (Phase 4) or intermediate data

**Do not proceed to the next phase without explicit user confirmation!**

---

### Pre-checks

Before Phase 1, verify that source nodes exist:

```cypher
MATCH (e:BusinessEntity) RETURN count(e) AS entity_count
```
```cypher
MATCH (bp:BusinessProcess) RETURN count(bp) AS process_count
```
```cypher
MATCH (ws:WorkflowStep) RETURN count(ws) AS step_count
```

- If all counts are 0 --- stop and report:
  > No BA artifacts found in the graph. Run `/graph_ba_process`, `/graph_ba_workflow`, or `/graph_ba_entities` first to create source nodes, then return to `/graph_ba_rules`.
- If some are 0 --- warn the user which sources are missing but proceed with what exists.

Check for existing rules:

```cypher
MATCH (brq:BusinessRule)
RETURN brq.id AS id, brq.name AS name, brq.rule_type AS type
ORDER BY brq.id
```

If rules already exist, show them and ask: append new rules, rebuild from scratch, or abort.

---

### Phase 1: Extraction (automated graph scan)

**Goal:** Scan existing graph nodes for business rule candidates.

**Sources:**

| Source | What to scan | Cypher pattern |
|--------|-------------|----------------|
| Entity attributes | Constraints in attribute descriptions, validation rules, uniqueness | `MATCH (e:BusinessEntity)-[:HAS_ATTRIBUTE]->(a:EntityAttribute) RETURN e, a` |
| Workflow decisions | Conditions at decision points, branching logic | `MATCH (ws:WorkflowStep) WHERE ws.stereotype = 'Decision' RETURN ws` |
| Workflow step conditions | Pre/post-conditions on steps, "if ... then" formulations | `MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep) RETURN bp, ws` |
| Entity states | Transition guards, forbidden state changes | `MATCH (e:BusinessEntity)-[:HAS_STATE]->(st:EntityState) RETURN e, st` |
| Process triggers/results | Conditions that gate process start or completion | `MATCH (bp:BusinessProcess) RETURN bp` |

**Actions:**

1. Execute each scan query and inspect node properties for rule-like content:
   - Keywords: "unique", "must", "only", "cannot", "required", "if ... then", "forbidden", "maximum", "minimum", formula patterns (=, x, +, -)
   - Decision node conditions (from `function_name` property)
   - Attribute descriptions containing constraints
2. Deduplicate: one business constraint = one candidate
3. Present the consolidated candidate list to the user

**Output:**

```
Scan results --- found {N} business rule candidates:

| # | Candidate | Source node | Fragment |
|---|-----------|-------------|----------|
| 1 | {formulation} | OBJ-003, attribute "Number" | "Unique within 5 years" |
| 2 | {formulation} | BP-001-D01, decision | "If amount > 100,000..." |
| 3 | {formulation} | OBJ-005-ST02, state guard | "Cannot delete in Shipped" |

Confirm the list or indicate what to add / remove.
```

**Rules:**
- The agent extracts rules from existing graph nodes, does NOT invent new ones
- If no source nodes exist --- suggest running predecessor skills (`/graph_ba_entities`, `/graph_ba_workflow`)

---

### Phase 2: Classification (constructive)

**Goal:** Assign each confirmed candidate a type from the classification.

**Actions:**

1. For each rule from the confirmed list, propose a type: `constraint`, `calculation`, `invariant`, `authorization`
2. Propose a severity level: `critical`, `warning`, `info`
   - `critical` --- violation blocks the business process or causes data corruption
   - `warning` --- violation is allowed but requires attention / escalation
   - `info` --- advisory, best practice
3. Briefly justify the type and severity choice

**Output:**

```
Proposed classification:

| # | Rule | Type | Severity | Rationale |
|---|------|------|----------|-----------|
| 1 | Order number uniqueness | constraint | critical | Data integrity constraint |
| 2 | Total = Quantity x Price | calculation | critical | Core business formula |
| 3 | Cannot delete in Shipped | invariant | critical | State guard |
| 4 | Only manager can approve | authorization | warning | Role-based access |

Confirm the classification or indicate changes.
```

**Rules:**
- The agent PROPOSES type and severity, the user confirms
- If a rule does not fit a single category --- ask the user
- Formulate the rule text following the principle: "WHAT (what), not HOW (not how)" --- describe the business constraint, not the implementation

---

### Phase 3: Traceability (constructive)

**Goal:** Link each rule to entities (OBJ), processes (BP), attributes, and workflow steps.

**Actions:**

1. For each rule, propose relationships based on the source node it was extracted from:
   - `CONSTRAINS` -> BusinessEntity (which entity does the rule restrict?)
   - `APPLIES_IN` -> BusinessProcess (in which process does the rule operate?)
   - `AFFECTS` -> EntityAttribute (which specific attribute is targeted?)
   - `APPLIES_AT_STEP` -> WorkflowStep (at which step is the rule enforced?)
2. Verify proposed targets exist in the graph:
   ```cypher
   MATCH (e:BusinessEntity {id: $entityId}) RETURN e.id
   ```
3. Present the traceability table

**Output:**

```
Proposed traceability links:

| # | Rule | CONSTRAINS (Entity) | APPLIES_IN (Process) | AFFECTS (Attribute) | APPLIES_AT_STEP (Step) |
|---|------|---------------------|----------------------|---------------------|------------------------|
| 1 | Order number uniqueness | OBJ-003 | BP-001 | OBJ-003-A01 | BP-001-S02 |
| 2 | Total calculation | OBJ-005 | BP-003 | OBJ-005-A04 | --- |
| 3 | Cannot delete in Shipped | OBJ-001 | --- | --- | --- |

Confirm the links or indicate changes.
```

**Rules:**
- Every rule must be linked to at least one entity OR one process (validation `val_ba_L8_rules_binding`)
- The agent proposes links based on extraction context; the user confirms
- If a target node does not exist in the graph --- flag it and suggest creating it first

---

### Phase 4: Catalog Generation (automated)

**Goal:** Write all confirmed data to Neo4j and generate the catalog from graph queries.

**Actions:**

#### 4.1 Determine next available ID

```cypher
MATCH (brq:BusinessRule)
WITH max(toInteger(replace(brq.id, 'BRQ-', ''))) AS maxNum
RETURN 'BRQ-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
```

#### 4.2 Write BusinessRule nodes

For each confirmed rule:

```cypher
CREATE (brq:BusinessRule {
  id: $id,
  name: $name,
  rule_type: $ruleType,
  formulation: $formulation,
  severity: $severity,
  description: $description
})
```

Where:
- `$id` --- format `BRQ-NNN` (three digits, zero-padded, auto-increment)
- `$name` --- short descriptive name
- `$ruleType` --- `"constraint"` | `"calculation"` | `"invariant"` | `"authorization"`
- `$formulation` --- rule text (WHAT, not HOW; business language, not code)
- `$severity` --- `"critical"` | `"warning"` | `"info"`
- `$description` --- optional extended explanation

#### 4.3 Write traceability relationships

```cypher
// CONSTRAINS -> BusinessEntity
MATCH (brq:BusinessRule {id: $ruleId}), (e:BusinessEntity {id: $entityId})
CREATE (brq)-[:CONSTRAINS]->(e)

// APPLIES_IN -> BusinessProcess
MATCH (brq:BusinessRule {id: $ruleId}), (bp:BusinessProcess {id: $bpId})
CREATE (brq)-[:APPLIES_IN]->(bp)

// AFFECTS -> EntityAttribute
MATCH (brq:BusinessRule {id: $ruleId}), (attr:EntityAttribute {id: $attrId})
CREATE (brq)-[:AFFECTS]->(attr)

// APPLIES_AT_STEP -> WorkflowStep
MATCH (brq:BusinessRule {id: $ruleId}), (ws:WorkflowStep {id: $stepId})
CREATE (brq)-[:APPLIES_AT_STEP]->(ws)
```

#### 4.4 Query the full catalog from the graph

Use the reference query `ba_rules_catalog`:

```cypher
MATCH (brq:BusinessRule)
OPTIONAL MATCH (brq)-[:CONSTRAINS]->(e:BusinessEntity)
OPTIONAL MATCH (brq)-[:APPLIES_IN]->(bp:BusinessProcess)
OPTIONAL MATCH (brq)-[:AFFECTS]->(attr:EntityAttribute)
OPTIONAL MATCH (brq)-[:APPLIES_AT_STEP]->(ws:WorkflowStep)
RETURN brq,
       collect(DISTINCT e.id) AS constrained_entities,
       collect(DISTINCT bp.id) AS applied_in_processes,
       collect(DISTINCT attr.id) AS affected_attributes,
       collect(DISTINCT ws.id) AS applied_at_steps
ORDER BY brq.id
```

#### 4.5 Generate the catalog table

From the query result, build the markdown table:

```markdown
| ID | Name | Type | Severity | Formulation | Entities | Processes | Attributes | Steps |
|----|------|------|----------|-------------|----------|-----------|------------|-------|
| BRQ-001 | Min order amount | constraint | critical | Order amount >= 1000 | OBJ-001 | BP-001 | OBJ-001-A05 | BP-001-S03 |
| BRQ-002 | Line total calc | calculation | critical | Total = Qty x Price | OBJ-002 | BP-003 | OBJ-002-A04 | --- |
```

#### 4.6 Validate completeness

Run the binding validation query:

```cypher
MATCH (brq:BusinessRule)
WHERE NOT EXISTS { MATCH (brq)-[:CONSTRAINS]->() }
  AND NOT EXISTS { MATCH (brq)-[:APPLIES_IN]->() }
  AND NOT EXISTS { MATCH (brq)-[:AFFECTS]->() }
  AND NOT EXISTS { MATCH (brq)-[:APPLIES_AT_STEP]->() }
RETURN brq.id AS unlinked_rule
```

If any unlinked rules are found --- report them as errors requiring traceability.

#### 4.7 Output to user

Present the catalog table and summary:

```
Written to Neo4j:
- {N} BusinessRule nodes (BRQ-001 ... BRQ-{NNN})
- {M} CONSTRAINS relationships
- {K} APPLIES_IN relationships
- {L} AFFECTS relationships
- {P} APPLIES_AT_STEP relationships

{Catalog table}

Validation: {passed / N unlinked rules found}

Everything correct? I can make edits before finalizing.
```

**Confirmation gate:** User confirms the final output.

---

## Mode ADD

Interactive addition of a single business rule.

**Steps:**

1. Ask the user for:
   - Rule formulation (WHAT, not HOW)
   - Which entities (OBJ) does it constrain?
   - In which processes (BP) does it apply?
   - At which workflow step (if applicable)?
   - Which attribute does it affect (if applicable)?

2. Propose a type (`constraint` / `calculation` / `invariant` / `authorization`) and severity (`critical` / `warning` / `info`); request confirmation

3. Get the next available `BRQ-NNN` ID:
   ```cypher
   MATCH (brq:BusinessRule)
   WITH max(toInteger(replace(brq.id, 'BRQ-', ''))) AS maxNum
   RETURN 'BRQ-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
   ```

4. Write the BusinessRule node and all traceability relationships to Neo4j

5. Verify by querying the new rule:
   ```cypher
   MATCH (brq:BusinessRule {id: $newId})
   OPTIONAL MATCH (brq)-[:CONSTRAINS]->(e:BusinessEntity)
   OPTIONAL MATCH (brq)-[:APPLIES_IN]->(bp:BusinessProcess)
   OPTIONAL MATCH (brq)-[:AFFECTS]->(attr:EntityAttribute)
   OPTIONAL MATCH (brq)-[:APPLIES_AT_STEP]->(ws:WorkflowStep)
   RETURN brq, collect(DISTINCT e.id) AS entities, collect(DISTINCT bp.id) AS processes,
          collect(DISTINCT attr.id) AS attributes, collect(DISTINCT ws.id) AS steps
   ```

6. Show the result to the user

---

## Critical Rules

1. **Business rules describe WHAT, not HOW** --- implementation is left to SA agents
2. **Formulas use business language**, not code: "Total = Quantity x Price", not `sum = qty * price`
3. **Every rule is linked** to at least one entity or process (enforced by `val_ba_L8_rules_binding`)
4. **The agent extracts** rules from existing graph nodes, **does NOT invent** new ones
5. **The agent MAY propose** classification, severity, and traceability --- but the user confirms
6. **One business constraint = one BRQ** --- no duplicates
7. **BRQ ID is never reused** --- even after deprecation or deletion
8. **The Neo4j graph is the authoritative source** --- catalog tables are generated from graph queries, not maintained manually
9. **Severity must be assigned** to every rule: `critical` | `warning` | `info`

---

## Autonomy Principle

| Only from the user (FACTS) | Agent constructs (STRUCTURES) |
|---|---|
| Business constraints and formulas | ID assignment (BRQ-NNN) |
| Which entities / processes are affected | Classification (type + severity) |
| Whether a rule exists or not | Traceability proposals |
| Severity overrides | Cypher queries, catalog generation |
| Rule formulation in add mode | Deduplication, validation |

**The agent NEVER invents business rules that are not evidenced in graph nodes or provided by the user.**

---

## Reads / Writes

### Reads (Neo4j via MCP)

| Query | Purpose |
|---|---|
| `BusinessEntity` + `EntityAttribute` nodes | Scan for constraint candidates |
| `BusinessProcess` nodes | Scan for process-level rules |
| `WorkflowStep` nodes (especially `Decision` stereotype) | Scan for decision conditions |
| `EntityState` nodes | Scan for state transition guards |
| `ba_rules_catalog` (from ba-queries.cypher) | Existing rules for append / dedup |
| `ba_rules_for_entity` (from ba-queries.cypher) | Rules constraining a specific entity |
| `val_ba_L8_rules_binding` (from validation-queries.cypher) | Validate all rules have traceability |

### Writes (Neo4j via MCP)

| Node / Relationship | Purpose |
|---|---|
| `CREATE (brq:BusinessRule {...})` | Business rule nodes |
| `CREATE (brq)-[:CONSTRAINS]->(e)` | Rule constrains an entity |
| `CREATE (brq)-[:APPLIES_IN]->(bp)` | Rule applies in a process |
| `CREATE (brq)-[:AFFECTS]->(attr)` | Rule affects a specific attribute |
| `CREATE (brq)-[:APPLIES_AT_STEP]->(ws)` | Rule applies at a specific workflow step |

### No file writes

This skill does NOT create files in `docs/`. All data is stored in Neo4j. Catalog tables are generated on-the-fly from graph queries and displayed inline.

### Calls

| Skill | Condition |
|---|---|
| `/graph_ba_entities` | If an entity referenced by a rule does not exist in the graph |
| `/graph_ba_workflow` | If a workflow step referenced by a rule does not exist in the graph |

### Called by

| Skill | Context |
|---|---|
| `/graph_ba_analyze` | After full BA model analysis, to catalog discovered rules |
| User | Manual invocation via `/graph_ba_rules` |

---

## Error Handling

### Neo4j unavailable

If `mcp__neo4j__write-cypher` or `mcp__neo4j__read-cypher` returns an error:

> Neo4j is not reachable. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running: `docker compose -f graph-infra/docker-compose.yml up -d`. This skill requires Neo4j --- cannot proceed without it.

### No source nodes

If no BusinessEntity, BusinessProcess, or WorkflowStep nodes exist:

> No BA artifacts found in the graph. Run `/graph_ba_process`, `/graph_ba_workflow`, or `/graph_ba_entities` first, then return to `/graph_ba_rules`.

### Duplicate rule

If a candidate matches an existing `BusinessRule.formulation`:

1. Show the existing rule to the user
2. Ask whether to skip, merge, or create a separate rule

### Duplicate ID conflict

If MERGE detects a node with the same BRQ-NNN ID:

1. Query the existing node and show it to the user
2. Assign the next available ID instead

---

## Checklist

### For FULL (full catalog)

#### Pre-checks
- [ ] At least one of: BusinessEntity, BusinessProcess, or WorkflowStep exists in the graph
- [ ] Existing BusinessRule nodes checked (append / rebuild / abort)

#### Phase 1: Extraction
- [ ] Entity attributes scanned for constraints
- [ ] Workflow decisions scanned for conditions
- [ ] Workflow steps scanned for pre/post-conditions
- [ ] Entity states scanned for transition guards
- [ ] Process triggers/results scanned
- [ ] Candidates deduplicated
- [ ] User confirmed the candidate list

#### Phase 2: Classification
- [ ] Each rule assigned a type (`constraint` / `calculation` / `invariant` / `authorization`)
- [ ] Each rule assigned a severity (`critical` / `warning` / `info`)
- [ ] User confirmed classification

#### Phase 3: Traceability
- [ ] Each rule linked to at least one entity (CONSTRAINS) or process (APPLIES_IN)
- [ ] Attribute-level links (AFFECTS) proposed where applicable
- [ ] Step-level links (APPLIES_AT_STEP) proposed where applicable
- [ ] All target nodes verified to exist in the graph
- [ ] User confirmed traceability links

#### Phase 4: Catalog Generation
- [ ] All rules have IDs in format `BRQ-NNN`
- [ ] Numbering is sequential, no reuse of deprecated IDs
- [ ] All BusinessRule nodes written to Neo4j
- [ ] All traceability relationships written
- [ ] Catalog table generated from `ba_rules_catalog` query
- [ ] Binding validation passed (`val_ba_L8_rules_binding`)
- [ ] User confirmed the final catalog

### For ADD (single rule)
- [ ] Formulation received from the user
- [ ] Type classified and confirmed
- [ ] Severity assigned and confirmed
- [ ] Traceability links to OBJ / BP / attribute / step specified
- [ ] ID assigned (next available BRQ-NNN)
- [ ] BusinessRule node and relationships written to Neo4j
- [ ] Verification query confirms correct write

### Quality (all modes)
- [ ] Rules describe WHAT, not HOW
- [ ] Formulas use business language
- [ ] No duplicate rules
- [ ] All traceability links point to valid graph nodes
- [ ] No rules without at least one traceability link
- [ ] Agent did not invent rules absent from graph nodes or user input
- [ ] Every rule has severity assigned

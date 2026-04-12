---
name: nacl-ba-validate
model: opus
effort: high
description: |
  Validate BA model consistency via Cypher: L1-L8 internal checks,
  XL1-XL5 cross-validation with SA layer. Read-only, no writes.Use when: validate BA model, check consistency, or the user says "/nacl-ba-validate".
---

# /nacl-ba-validate -- BA Model Validation (Graph)

## Purpose

Comprehensive consistency validation of the BA model stored in Neo4j. Runs Cypher queries
to detect problems across 8 internal levels (L1-L8: process completeness, decomposition,
performers, entity attributes, entity-process matrix, role-process matrix, glossary coverage,
rules binding) and 5 cross-validation levels (XL1-XL5: automation coverage, entity mapping,
rule traceability, role mapping, glossary alignment with SA layer).

All checks are **read-only** -- validation NEVER modifies data in the graph.

**Shared references:** `nacl-core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | ALL validation queries (read-only) |
| `mcp__neo4j__get-schema` | Introspect current graph schema before running checks |

IMPORTANT: This skill uses ONLY `read-cypher`. Validation must NEVER write to the graph.

---

## Invocation

```
/nacl-ba-validate [scope]
```

### Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `scope` | `internal` | L1-L8: BA-internal consistency checks |
| | `cross` | XL1-XL5: BA-to-SA cross-layer validation |
| | `full` (default) | All levels: L1-L8 + XL1-XL5 |

---

## Workflow Overview

```
                      LAUNCH VALIDATION
                            |
                 +----------+-----------+
                 |                      |
           [scope = internal]     [scope = cross]
           [scope = full]        [scope = full]
                 |                      |
       +---------+---------+    +-------+-------+
       |  L1: BP            |    | XL1: Automa- |
       |  Completeness      |    | tion Coverage|
       +---------+---------+    +-------+-------+
                 |                      |
       +---------+---------+    +-------+-------+
       |  L2: Workflow      |    | XL2: Entity  |
       |  Coverage          |    | Coverage     |
       +---------+---------+    +-------+-------+
                 |                      |
       +---------+---------+    +-------+-------+
       |  L3: Step          |    | XL3: Rule    |
       |  Performers        |    | Coverage     |
       +---------+---------+    +-------+-------+
                 |                      |
       +---------+---------+    +-------+-------+
       |  L4: Entity        |    | XL4: Role    |
       |  Attributes        |    | Coverage     |
       +---------+---------+    +-------+-------+
                 |                      |
       +---------+---------+    +-------+-------+
       |  L5: Entity-       |    | XL5: Glossary|
       |  Process Matrix    |    | Alignment    |
       +---------+---------+    +-------+-------+
                 |                      |
       +---------+---------+            |
       |  L6: Role-Process  |            |
       |  Matrix            |            |
       +---------+---------+            |
                 |                      |
       +---------+---------+            |
       |  L7: Glossary      |            |
       |  Coverage          |            |
       +---------+---------+            |
                 |                      |
       +---------+---------+            |
       |  L8: Rules         |            |
       |  Binding           |            |
       +---------+---------+            |
                 |                      |
                 +----------+-----------+
                            |
                 +----------+-----------+
                 |  FORMAT REPORT       |
                 +----------------------+
```

---

## Pre-flight Checks

### Step 0: Verify BA layer has data

Before running any validation, confirm that the graph contains BA-layer nodes.

```cypher
// Pre-flight: count BA-layer nodes
MATCH (n)
WHERE n:BusinessProcess OR n:WorkflowStep OR n:BusinessEntity
   OR n:BusinessRole OR n:BusinessRule OR n:GlossaryTerm
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label
```

**If the result is empty or all counts are 0:**
1. STOP -- validation is impossible without BA data in the graph.
2. Suggest the user runs `/nacl-ba-import-doc`, `/nacl-ba-from-board`, or `/nacl-ba-process` first.
3. Explain that `/nacl-ba-validate` works only with a populated Neo4j graph.

### Step 0b: Verify SA layer exists (for cross / full)

```cypher
// Pre-flight: count SA-layer nodes
MATCH (n)
WHERE n:UseCase OR n:DomainEntity OR n:SystemRole OR n:Requirement
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label
```

**If the result is empty:**
- `scope=cross` --> STOP, report that SA layer is not populated. Suggest `/nacl-sa-domain` or `/nacl-sa-architect` first.
- `scope=full` --> Run only L1-L8 (internal), skip XL1-XL5 with a WARNING in the report.

---

## Severity Levels

Every detected problem is assigned a severity:

| Severity | Meaning | Report threshold |
|----------|---------|------------------|
| **CRITICAL** | BA model is broken; blocks handoff to SA | Any CRITICAL --> overall FAIL |
| **WARNING** | Inconsistency that should be fixed but is not blocking | 5+ WARNINGs --> overall WARN |
| **INFO** | Observation, optional improvement | Does not affect overall status |

---

## Validation Levels -- Internal (L1-L8)

### Level 1: BP Completeness (L1)

**Goal:** Every BusinessProcess must have trigger, result, and an owner role.

**Named query:** `val_ba_L1_bp_completeness` (from `validation-queries.cypher`)

#### Check L1.1: Missing mandatory process properties

```cypher
// L1.1 -- Severity: CRITICAL
// BusinessProcesses missing trigger, result, or owner
MATCH (bp:BusinessProcess)
WHERE bp.trigger IS NULL OR bp.result IS NULL
   OR NOT EXISTS { MATCH (:BusinessRole)-[:OWNS]->(bp) }
RETURN bp.id AS id, bp.name AS name,
       CASE WHEN bp.trigger IS NULL THEN 'missing trigger' ELSE '' END +
       CASE WHEN bp.result IS NULL THEN ', missing result' ELSE '' END +
       CASE WHEN NOT EXISTS { MATCH (:BusinessRole)-[:OWNS]->(bp) } THEN ', missing owner' ELSE '' END AS issues
```

#### Check L1.2: BusinessProcess nodes missing mandatory id/name

```cypher
// L1.2 -- Severity: CRITICAL
// BP nodes without id or name properties
MATCH (bp:BusinessProcess)
WHERE bp.id IS NULL OR bp.name IS NULL
RETURN coalesce(bp.id, 'NO ID') AS id,
       coalesce(bp.name, 'NO NAME') AS name,
       'BusinessProcess missing mandatory property: id or name' AS problem
```

---

### Level 2: Workflow Coverage (L2)

**Goal:** Every BP with `has_decomposition=true` must have at least one WorkflowStep.

**Named query:** `val_ba_L2_workflow_coverage` (from `validation-queries.cypher`)

#### Check L2.1: Decomposed BP without steps

```cypher
// L2.1 -- Severity: CRITICAL
// BPs with has_decomposition=true but no HAS_STEP edges
MATCH (bp:BusinessProcess {has_decomposition: true})
WHERE NOT EXISTS { MATCH (bp)-[:HAS_STEP]->(:WorkflowStep) }
RETURN bp.id AS id, bp.name AS name, 'has_decomposition=true but no steps' AS issue
```

#### Check L2.2: Orphaned WorkflowSteps not linked to any BP

```cypher
// L2.2 -- Severity: WARNING
// WorkflowSteps that have no incoming HAS_STEP from a BusinessProcess
MATCH (ws:WorkflowStep)
WHERE NOT (:BusinessProcess)-[:HAS_STEP]->(ws)
RETURN ws.id AS ws_id, ws.function_name AS step_name,
       'WorkflowStep not linked to any BusinessProcess' AS issue
```

#### Check L2.3: Empty decomposition (BP with steps but steps have no function_name)

```cypher
// L2.3 -- Severity: WARNING
// WorkflowSteps missing function_name (empty step content)
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
WHERE ws.function_name IS NULL OR trim(ws.function_name) = ''
RETURN bp.id AS bp_id, ws.id AS ws_id,
       'WorkflowStep has no function_name (empty step)' AS issue
```

---

### Level 3: Step Performers (L3)

**Goal:** Every WorkflowStep must have a PERFORMED_BY relationship to a BusinessRole.

**Named query:** `val_ba_L3_step_performers` (from `validation-queries.cypher`)

#### Check L3.1: Steps without performer

```cypher
// L3.1 -- Severity: CRITICAL
// WorkflowSteps missing PERFORMED_BY edge
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
WHERE NOT EXISTS { MATCH (ws)-[:PERFORMED_BY]->(:BusinessRole) }
RETURN bp.id AS bp_id, ws.id AS ws_id, ws.function_name AS step_name,
       'missing PERFORMED_BY' AS issue
```

#### Check L3.2: PERFORMED_BY points to a non-existent role

```cypher
// L3.2 -- Severity: CRITICAL
// Steps referencing roles that don't exist in the BusinessRole set
MATCH (ws:WorkflowStep)-[:PERFORMED_BY]->(r)
WHERE NOT r:BusinessRole
RETURN ws.id AS ws_id, ws.function_name AS step_name,
       coalesce(r.id, toString(id(r))) AS target_id,
       'PERFORMED_BY points to a node that is not a BusinessRole' AS issue
```

---

### Level 4: Entity Attributes (L4)

**Goal:** Every BusinessEntity must have at least one EntityAttribute.

**Named query:** `val_ba_L4_entity_attributes` (from `validation-queries.cypher`)

#### Check L4.1: Entities without attributes

```cypher
// L4.1 -- Severity: CRITICAL
// BusinessEntities with zero EntityAttribute children
MATCH (e:BusinessEntity)
WHERE NOT EXISTS { MATCH (e)-[:HAS_ATTRIBUTE]->(:EntityAttribute) }
RETURN e.id AS id, e.name AS name, 'no attributes defined' AS issue
```

#### Check L4.2: Orphaned EntityAttributes not linked to any entity

```cypher
// L4.2 -- Severity: WARNING
// EntityAttributes floating without a parent BusinessEntity
MATCH (ea:EntityAttribute)
WHERE NOT (:BusinessEntity)-[:HAS_ATTRIBUTE]->(ea)
RETURN ea.id AS attr_id, ea.name AS attr_name,
       'EntityAttribute not owned by any BusinessEntity' AS issue
```

#### Check L4.3: BusinessEntity missing mandatory id/name

```cypher
// L4.3 -- Severity: CRITICAL
// Entity nodes without id or name
MATCH (e:BusinessEntity)
WHERE e.id IS NULL OR e.name IS NULL
RETURN coalesce(e.id, 'NO ID') AS id,
       coalesce(e.name, 'NO NAME') AS name,
       'BusinessEntity missing mandatory property' AS issue
```

---

### Level 5: Entity-Process Matrix (L5)

**Goal:** Every BusinessEntity should be referenced by at least one workflow step (READS/PRODUCES/MODIFIES).

**Named query:** `val_ba_L5_entity_process_matrix` (from `validation-queries.cypher`)

#### Check L5.1: Entities not referenced by any workflow step

```cypher
// L5.1 -- Severity: WARNING
// BusinessEntities not connected to any WorkflowStep via READS/PRODUCES/MODIFIES
MATCH (e:BusinessEntity)
WHERE NOT EXISTS {
  MATCH (:WorkflowStep)-[:READS|PRODUCES|MODIFIES]->(e)
}
RETURN e.id AS id, e.name AS name, 'not referenced by any workflow step' AS issue
```

#### Check L5.2: WorkflowSteps referencing entities not in the graph

```cypher
// L5.2 -- Severity: INFO
// Steps with READS/PRODUCES/MODIFIES edges -- verify all targets are BusinessEntity
MATCH (ws:WorkflowStep)-[rel:READS|PRODUCES|MODIFIES]->(target)
WHERE NOT target:BusinessEntity
RETURN ws.id AS ws_id, ws.function_name AS step_name,
       type(rel) AS rel_type, labels(target)[0] AS target_label,
       'Step references a non-BusinessEntity node' AS issue
```

---

### Level 6: Role-Process Matrix (L6)

**Goal:** Every BusinessRole should have at least one OWNS, PARTICIPATES_IN, or PERFORMED_BY relationship.

**Named query:** `val_ba_L6_role_process_matrix` (from `validation-queries.cypher`)

#### Check L6.1: Roles with no process relationships

```cypher
// L6.1 -- Severity: WARNING
// BusinessRoles with no OWNS, PARTICIPATES_IN, or PERFORMED_BY
MATCH (r:BusinessRole)
WHERE NOT EXISTS { MATCH (r)-[:OWNS]->(:BusinessProcess) }
  AND NOT EXISTS { MATCH (r)-[:PARTICIPATES_IN]->(:BusinessProcess) }
  AND NOT EXISTS { MATCH (:WorkflowStep)-[:PERFORMED_BY]->(r) }
RETURN r.id AS id, r.full_name AS name, 'role has no process relationships' AS issue
```

#### Check L6.2: Process participation type consistency

```cypher
// L6.2 -- Severity: INFO
// Roles that are only performers (PERFORMED_BY) but not OWNS or PARTICIPATES_IN
// This may be intentional but is worth flagging for review
MATCH (r:BusinessRole)
WHERE EXISTS { MATCH (:WorkflowStep)-[:PERFORMED_BY]->(r) }
  AND NOT EXISTS { MATCH (r)-[:OWNS]->(:BusinessProcess) }
  AND NOT EXISTS { MATCH (r)-[:PARTICIPATES_IN]->(:BusinessProcess) }
RETURN r.id AS id, r.full_name AS name,
       'Role performs steps but has no OWNS/PARTICIPATES_IN on any process' AS observation
```

---

### Level 7: Glossary Coverage (L7)

**Goal:** Key entities and roles should have corresponding GlossaryTerm nodes via DEFINES.

**Named query:** `val_ba_L7_glossary_coverage` (from `validation-queries.cypher`)

#### Check L7.1: Entities without glossary terms

```cypher
// L7.1 -- Severity: WARNING
// BusinessEntities not covered by any GlossaryTerm
MATCH (e:BusinessEntity)
WHERE NOT EXISTS { MATCH (:GlossaryTerm)-[:DEFINES]->(e) }
RETURN 'Entity' AS category, e.id AS id, e.name AS name, 'no glossary term' AS issue
```

#### Check L7.2: Roles without glossary terms

```cypher
// L7.2 -- Severity: WARNING
// BusinessRoles not covered by any GlossaryTerm
MATCH (r:BusinessRole)
WHERE NOT EXISTS { MATCH (:GlossaryTerm)-[:DEFINES]->(r) }
RETURN 'Role' AS category, r.id AS id, r.full_name AS name, 'no glossary term' AS issue
```

#### Check L7.3: Orphaned glossary terms (not linked to any node)

```cypher
// L7.3 -- Severity: INFO
// GlossaryTerms that don't DEFINE anything
MATCH (g:GlossaryTerm)
WHERE NOT (g)-[:DEFINES]->()
RETURN g.id AS id, g.term AS term,
       'GlossaryTerm not linked to any entity or role via DEFINES' AS observation
```

---

### Level 8: Rules Binding (L8)

**Goal:** Every BusinessRule must have at least one traceability link (CONSTRAINS, APPLIES_IN, AFFECTS, or APPLIES_AT_STEP).

**Named query:** `val_ba_L8_rules_binding` (from `validation-queries.cypher`)

#### Check L8.1: Rules without traceability links

```cypher
// L8.1 -- Severity: CRITICAL
// BusinessRules with no outgoing traceability edges
MATCH (brq:BusinessRule)
WHERE NOT EXISTS { MATCH (brq)-[:CONSTRAINS]->() }
  AND NOT EXISTS { MATCH (brq)-[:APPLIES_IN]->() }
  AND NOT EXISTS { MATCH (brq)-[:AFFECTS]->() }
  AND NOT EXISTS { MATCH (brq)-[:APPLIES_AT_STEP]->() }
RETURN brq.id AS id, brq.name AS name, 'rule has no traceability links' AS issue
```

#### Check L8.2: Rules missing mandatory properties

```cypher
// L8.2 -- Severity: CRITICAL
// BusinessRules without id or name
MATCH (brq:BusinessRule)
WHERE brq.id IS NULL OR brq.name IS NULL
RETURN coalesce(brq.id, 'NO ID') AS id,
       coalesce(brq.name, 'NO NAME') AS name,
       'BusinessRule missing mandatory property' AS issue
```

#### Check L8.3: Rules referencing non-existent targets

```cypher
// L8.3 -- Severity: WARNING
// Rules with CONSTRAINS/APPLIES_IN/AFFECTS edges to nodes that lack id
MATCH (brq:BusinessRule)-[rel:CONSTRAINS|APPLIES_IN|AFFECTS|APPLIES_AT_STEP]->(target)
WHERE target.id IS NULL
RETURN brq.id AS rule_id, brq.name AS rule_name,
       type(rel) AS rel_type, labels(target)[0] AS target_label,
       'Rule traceability target has no id property' AS issue
```

---

## Validation Levels -- Cross-Layer (XL1-XL5)

These checks verify BA-to-SA traceability via handoff edges. They require both BA and SA layers to be populated in Neo4j.

**Source queries:** `handoff-queries.cypher` and `val_ba_sa_consistency` (from `validation-queries.cypher`)

### XL1: Automation Coverage

**Goal:** Every BA WorkflowStep with stereotype "Автоматизируется" should have a corresponding UseCase via AUTOMATES_AS.

#### Check XL1.1: Automated steps without UseCase

```cypher
// XL1.1 -- Severity: CRITICAL
// Named query: val_ba_sa_consistency (from validation-queries.cypher)
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
OPTIONAL MATCH (ws)-[:AUTOMATES_AS]->(uc:UseCase)
WITH bp, ws, uc
WHERE uc IS NULL
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.function_name AS ws_function,
       'Automated step has no AUTOMATES_AS -> UseCase' AS issue
```

#### Check XL1.2: UseCases without a BA source step

```cypher
// XL1.2 -- Severity: INFO
// UseCases that have no incoming AUTOMATES_AS from any WorkflowStep
// (may be system-only UCs, not necessarily an error)
MATCH (uc:UseCase)
WHERE NOT (:WorkflowStep)-[:AUTOMATES_AS]->(uc)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       'UseCase has no source BA WorkflowStep (may be system-only)' AS observation
```

#### Check XL1.3: Automation coverage statistics

```cypher
// XL1.3 -- Severity: n/a (statistics)
// Named query: handoff_coverage_stats (automation portion)
MATCH (ws:WorkflowStep {stereotype: "Автоматизируется"})
WITH count(ws) AS total_auto
OPTIONAL MATCH (ws2:WorkflowStep {stereotype: "Автоматизируется"})-[:AUTOMATES_AS]->(:UseCase)
WITH total_auto, count(ws2) AS covered_auto
RETURN total_auto, covered_auto,
       CASE WHEN total_auto > 0 THEN round(100.0 * covered_auto / total_auto) ELSE 0 END AS coverage_pct
```

---

### XL2: Entity Coverage

**Goal:** Every BusinessEntity of type "Бизнес-объект" should be mapped to a DomainEntity via REALIZED_AS.

#### Check XL2.1: Business objects without domain mapping

```cypher
// XL2.1 -- Severity: CRITICAL
// Named query: handoff_uncovered_entities (from handoff-queries.cypher)
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
RETURN be.id AS id, be.name AS name, be.type AS type,
       'Business object not mapped to any DomainEntity via REALIZED_AS' AS issue
```

#### Check XL2.2: External documents and results (optional mapping)

```cypher
// XL2.2 -- Severity: INFO
// Entities of type "Внешний документ" or "Результат" without REALIZED_AS
// (mapping is optional for these types, but flagged for awareness)
MATCH (be:BusinessEntity)
WHERE be.type IN ['Внешний документ', 'Результат']
  AND NOT (be)-[:REALIZED_AS]->(:DomainEntity)
RETURN be.id AS id, be.name AS name, be.type AS type,
       'Non-business-object entity not mapped to domain (optional)' AS observation
```

#### Check XL2.3: Entity coverage statistics

```cypher
// XL2.3 -- Severity: n/a (statistics)
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WITH count(be) AS total_entities
OPTIONAL MATCH (be2:BusinessEntity {type: "Бизнес-объект"})-[:REALIZED_AS]->(:DomainEntity)
WITH total_entities, count(be2) AS covered_entities
RETURN total_entities, covered_entities,
       CASE WHEN total_entities > 0 THEN round(100.0 * covered_entities / total_entities) ELSE 0 END AS coverage_pct
```

---

### XL3: Rule Coverage

**Goal:** Every BusinessRule should be traceable to an SA Requirement via IMPLEMENTED_BY.

#### Check XL3.1: Rules without SA traceability

```cypher
// XL3.1 -- Severity: CRITICAL
// BusinessRules not linked to any Requirement via IMPLEMENTED_BY
MATCH (brq:BusinessRule)
WHERE NOT (brq)-[:IMPLEMENTED_BY]->(:Requirement)
RETURN brq.id AS id, brq.name AS name,
       'BusinessRule not traced to any SA Requirement via IMPLEMENTED_BY' AS issue
```

#### Check XL3.2: Rule coverage statistics

```cypher
// XL3.2 -- Severity: n/a (statistics)
MATCH (brq:BusinessRule)
WITH count(brq) AS total_rules
OPTIONAL MATCH (brq2:BusinessRule)-[:IMPLEMENTED_BY]->(:Requirement)
WITH total_rules, count(brq2) AS covered_rules
RETURN total_rules, covered_rules,
       CASE WHEN total_rules > 0 THEN round(100.0 * covered_rules / total_rules) ELSE 0 END AS coverage_pct
```

---

### XL4: Role Coverage

**Goal:** Every BusinessRole should be mapped to a SystemRole via MAPPED_TO.

#### Check XL4.1: Business roles without system role mapping

```cypher
// XL4.1 -- Severity: WARNING
// BusinessRoles not linked to any SystemRole via MAPPED_TO
MATCH (br:BusinessRole)
WHERE NOT (br)-[:MAPPED_TO]->(:SystemRole)
RETURN br.id AS id, br.full_name AS name,
       'BusinessRole not mapped to any SystemRole via MAPPED_TO' AS issue
```

#### Check XL4.2: N:M mapping audit

```cypher
// XL4.2 -- Severity: INFO
// BusinessRoles mapped to multiple SystemRoles or vice versa (valid but worth reviewing)
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
WITH br, collect(sr.name) AS sys_roles, count(sr) AS role_count
WHERE role_count > 1
RETURN br.id AS br_id, br.full_name AS br_name, sys_roles, role_count,
       'BusinessRole maps to multiple SystemRoles (N:M)' AS observation
UNION ALL
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
WITH sr, collect(br.full_name) AS biz_roles, count(br) AS role_count
WHERE role_count > 1
RETURN sr.id AS br_id, sr.name AS br_name, biz_roles AS sys_roles, role_count,
       'SystemRole mapped from multiple BusinessRoles (N:M)' AS observation
```

#### Check XL4.3: Role coverage statistics

```cypher
// XL4.3 -- Severity: n/a (statistics)
MATCH (br:BusinessRole)
WITH count(br) AS total_roles
OPTIONAL MATCH (br2:BusinessRole)-[:MAPPED_TO]->(:SystemRole)
WITH total_roles, count(br2) AS covered_roles
RETURN total_roles, covered_roles,
       CASE WHEN total_roles > 0 THEN round(100.0 * covered_roles / total_roles) ELSE 0 END AS coverage_pct
```

---

### XL5: Glossary Alignment

**Goal:** BA GlossaryTerms should cover all SA DomainEntity names. Terms from the SA domain model should have corresponding BA glossary entries.

#### Check XL5.1: DomainEntities without matching GlossaryTerm

```cypher
// XL5.1 -- Severity: WARNING
// SA DomainEntities whose name does not appear in any BA GlossaryTerm
MATCH (de:DomainEntity)
WHERE NOT EXISTS {
  MATCH (g:GlossaryTerm)
  WHERE toLower(g.term) = toLower(de.name)
     OR toLower(g.term) CONTAINS toLower(de.name)
}
RETURN de.id AS entity_id, de.name AS entity_name,
       'DomainEntity has no matching BA GlossaryTerm' AS issue
```

#### Check XL5.2: GlossaryTerms that DEFINE a BusinessEntity which has a REALIZED_AS DomainEntity -- check name consistency

```cypher
// XL5.2 -- Severity: INFO
// Cross-check: glossary term vs domain entity name for the same business entity
MATCH (g:GlossaryTerm)-[:DEFINES]->(be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity)
WHERE toLower(g.term) <> toLower(de.name)
RETURN g.term AS glossary_term, be.name AS ba_entity, de.name AS sa_entity,
       'Name mismatch between GlossaryTerm and DomainEntity for same BusinessEntity' AS observation
```

---

## Report Generation

After all applicable checks complete, format a report and present it directly to the user.

**IMPORTANT:** Do NOT write report files. Output the report as formatted text in the conversation.

### Report Template

```
============================================================
  BA MODEL VALIDATION REPORT
  Date: YYYY-MM-DD
  Scope: {internal | cross | full}
============================================================

SUMMARY
-------
| Level | Name                      | Status  | Issues |
|-------|---------------------------|---------|--------|
| L1    | BP Completeness           | PASS/WARN/FAIL | N |
| L2    | Workflow Coverage          | PASS/WARN/FAIL | N |
| L3    | Step Performers            | PASS/WARN/FAIL | N |
| L4    | Entity Attributes          | PASS/WARN/FAIL | N |
| L5    | Entity-Process Matrix      | PASS/WARN/FAIL | N |
| L6    | Role-Process Matrix        | PASS/WARN/FAIL | N |
| L7    | Glossary Coverage          | PASS/WARN/FAIL | N |
| L8    | Rules Binding              | PASS/WARN/FAIL | N |
| XL1   | Automation Coverage        | PASS/WARN/FAIL | N |
| XL2   | Entity Coverage            | PASS/WARN/FAIL | N |
| XL3   | Rule Coverage              | PASS/WARN/FAIL | N |
| XL4   | Role Coverage              | PASS/WARN/FAIL | N |
| XL5   | Glossary Alignment         | PASS/WARN/FAIL | N |

Overall: PASS / WARN / FAIL

COVERAGE STATISTICS (cross/full only)
--------------------------------------
Automation: NN% (covered/total)
Entities:   NN% (covered/total)
Rules:      NN% (covered/total)
Roles:      NN% (covered/total)

ISSUES
------
| # | Level | Severity | ID       | Description                          |
|---|-------|----------|----------|--------------------------------------|
| 1 | L1    | CRITICAL | BP-003   | missing trigger, missing owner       |
| 2 | L3    | CRITICAL | BP-001-S03 | missing PERFORMED_BY               |
| 3 | L7    | WARNING  | OBJ-005  | no glossary term                     |
| ...                                                                     |

RECOMMENDATIONS
---------------
1. [CRITICAL] Fix L1 issues first -- processes must have trigger, result, and owner.
2. [WARNING] Add glossary terms for uncovered entities and roles.
3. [INFO] Review N:M role mappings for correctness.
```

### Status Rules

- **PASS:** Zero CRITICAL and fewer than 5 WARNING findings at this level.
- **WARN:** Zero CRITICAL but 5+ WARNING findings.
- **FAIL:** One or more CRITICAL findings.

### Overall Status

- **FAIL** if any level has CRITICAL findings.
- **WARN** if any level is WARN (but no CRITICAL anywhere).
- **PASS** if all levels are PASS.

---

## Reads / Writes

### Reads

```yaml
# Neo4j (read-only via mcp__neo4j__read-cypher):
- BA layer:  BusinessProcess, WorkflowStep, BusinessEntity, EntityAttribute,
             BusinessRole, BusinessRule, GlossaryTerm
- SA layer (cross/full only): UseCase, DomainEntity, SystemRole, Requirement
- Handoff edges: AUTOMATES_AS, REALIZED_AS, MAPPED_TO, IMPLEMENTED_BY

# Query library (reference only -- queries are embedded above):
- graph-infra/queries/validation-queries.cypher
- graph-infra/queries/handoff-queries.cypher
```

### Writes

```yaml
# NONE -- this skill is strictly read-only.
# Report is output to the user directly, no files written.
```

---

## Checklist

Before completing validation, verify:

### Pre-flight
- [ ] BA-layer nodes exist in the graph (BusinessProcess, WorkflowStep, etc.)
- [ ] For scope=cross|full: SA-layer nodes exist (UseCase, DomainEntity, etc.)

### L1: BP Completeness
- [ ] Every BP has trigger property
- [ ] Every BP has result property
- [ ] Every BP has at least one OWNS edge from a BusinessRole
- [ ] Every BP has id and name properties

### L2: Workflow Coverage
- [ ] Every BP with has_decomposition=true has at least one HAS_STEP
- [ ] No orphaned WorkflowSteps (not linked to any BP)
- [ ] All steps have non-empty function_name

### L3: Step Performers
- [ ] Every WorkflowStep has PERFORMED_BY to a BusinessRole
- [ ] PERFORMED_BY targets are actual BusinessRole nodes

### L4: Entity Attributes
- [ ] Every BusinessEntity has at least one EntityAttribute
- [ ] No orphaned EntityAttributes
- [ ] Every entity has id and name properties

### L5: Entity-Process Matrix
- [ ] Every BusinessEntity is referenced by at least one workflow step
- [ ] READS/PRODUCES/MODIFIES edges point to BusinessEntity nodes

### L6: Role-Process Matrix
- [ ] Every BusinessRole has OWNS, PARTICIPATES_IN, or PERFORMED_BY
- [ ] Roles with only PERFORMED_BY flagged for review

### L7: Glossary Coverage
- [ ] Every BusinessEntity has a DEFINES edge from a GlossaryTerm
- [ ] Every BusinessRole has a DEFINES edge from a GlossaryTerm
- [ ] No orphaned GlossaryTerms

### L8: Rules Binding
- [ ] Every BusinessRule has CONSTRAINS, APPLIES_IN, AFFECTS, or APPLIES_AT_STEP
- [ ] Every rule has id and name properties
- [ ] Traceability targets have valid id properties

### XL1-XL5 (only for scope=cross|full)
- [ ] XL1: All "Автоматизируется" steps have AUTOMATES_AS -> UseCase
- [ ] XL2: All "Бизнес-объект" entities have REALIZED_AS -> DomainEntity
- [ ] XL3: All BusinessRules have IMPLEMENTED_BY -> Requirement
- [ ] XL4: All BusinessRoles have MAPPED_TO -> SystemRole
- [ ] XL5: All SA DomainEntity names covered by BA GlossaryTerms

### Report
- [ ] Summary table formatted and presented to user
- [ ] Coverage statistics included (for cross/full)
- [ ] All issues listed with severity, ID, and description
- [ ] Recommendations prioritized by severity
- [ ] Overall status determined correctly (PASS/WARN/FAIL)

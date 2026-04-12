---
name: nacl-sa-validate
model: opus
effort: high
description: |
  Validate specification consistency through Neo4j Cypher queries.
  Internal validation (L1-L6): data consistency, model connectivity, requirement completeness,
  form-domain traceability, UC-form validation, cross-module consistency.
  Cross-validation BA->SA (XL6-XL9): UC coverage, entity coverage, role coverage, rule coverage.
  Use when: validate specification, check consistency, find errors, run checks, quality gate.
---

# /nacl-sa-validate -- Specification Validation (Graph)

## Purpose

Quality gate for the entire specification. Runs Cypher queries against Neo4j to detect problems
in data consistency, model connectivity, requirement completeness, form-domain traceability,
and BA-to-SA cross-layer coverage. All checks are read-only -- validation never modifies data.

**Shared references:** `nacl-core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | ALL validation queries (read-only) |
| `mcp__neo4j__get-schema` | Introspect current graph schema before running checks |

IMPORTANT: This skill uses ONLY read-cypher. Validation must NEVER write to the graph.

---

## Invocation

```
/nacl-sa-validate [level] [--scope=<scope>]
```

### Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `level` | `internal` | L1-L6: SA-internal consistency checks |
| | `ba-cross` | XL6-XL9: BA-to-SA cross-layer coverage |
| | `full` (default) | All levels: L1-L6 + XL6-XL9 |
| `--scope` | `intra-uc UC-NNN[,UC-NNN]` | Limit validation to specific UCs and their subgraph (forms, fields, requirements, entities). Used by nacl-sa-feature for incremental validation. |
| | `intra-module mod-xxx` | Limit validation to a specific module's nodes. |

When `--scope` is provided, all Cypher queries are augmented with a WHERE clause filtering to the specified UC or module subgraph. Checks outside the scope are skipped.

---

## Workflow Overview

```
                         LAUNCH VALIDATION
                               |
                    +----------+-----------+
                    |                      |
              [level = internal]     [level = ba-cross]
              [level = full]        [level = full]
                    |                      |
          +---------+---------+    +-------+-------+
          |  L1: Data         |    | XL6: UC       |
          |  Consistency      |    | Coverage      |
          +---------+---------+    +-------+-------+
                    |                      |
          +---------+---------+    +-------+-------+
          |  L2: Model        |    | XL7: Entity   |
          |  Connectivity     |    | Coverage      |
          +---------+---------+    +-------+-------+
                    |                      |
          +---------+---------+    +-------+-------+
          |  L3: Requirement  |    | XL8: Role     |
          |  Completeness     |    | Coverage      |
          +---------+---------+    +-------+-------+
                    |                      |
          +---------+---------+    +-------+-------+
          |  L4: Form-Domain  |    | XL9: Rule     |
          |  Traceability     |    | Coverage      |
          +---------+---------+    +-------+-------+
                    |                      |
          +---------+---------+            |
          |  L5: UC-Form      |            |
          |  Validation       |            |
          +---------+---------+            |
                    |                      |
          +---------+---------+            |
          |  L6: Cross-Module |            |
          |  Consistency      |            |
          +---------+---------+            |
                    |                      |
                    +----------+-----------+
                               |
                    +----------+-----------+
                    |  GENERATE REPORT     |
                    +----------------------+
```

---

## Pre-flight Checks

### Step 0: Verify graph has data

Before running any validation, confirm that the graph contains SA-layer nodes.

```cypher
// Pre-flight: count SA-layer nodes
MATCH (n)
WHERE n:Module OR n:UseCase OR n:DomainEntity OR n:Form OR n:Requirement OR n:SystemRole
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label
```

**If the result is empty or all counts are 0:**
1. STOP -- validation is impossible without data in the graph.
2. Suggest the user runs `/nacl-sa-architect` or `/nacl-sa-domain` first.
3. Explain that `/nacl-sa-validate` works only with a populated Neo4j graph.

### Step 0b: Verify BA layer exists (for ba-cross / full)

```cypher
// Pre-flight: count BA-layer nodes
MATCH (n)
WHERE n:BusinessProcess OR n:WorkflowStep OR n:BusinessEntity OR n:BusinessRole OR n:BusinessRule
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label
```

**If the result is empty:**
- `level=ba-cross` --> STOP, report that BA layer is not populated. User must run `/nacl-ba-import-doc` or `/nacl-ba-from-board` first.
- `level=full` --> Run only L1-L6 (internal), skip XL6-XL9 with a WARNING in the report.

---

## Severity Levels

Every detected problem is assigned a severity:

| Severity | Meaning | Report threshold |
|----------|---------|------------------|
| **CRITICAL** | Specification is broken; blocks downstream work | Any CRITICAL --> overall FAIL |
| **WARNING** | Inconsistency that should be fixed but is not blocking | 5+ WARNINGs --> overall WARN |
| **INFO** | Observation, optional improvement | Does not affect overall status |

---

## Validation Levels -- Internal (L1-L6)

### Level 1: Data Consistency

**Goal:** Verify that property types, mandatory fields, and naming conventions are uniform across all SA nodes.

#### Check 1.1: Nodes missing mandatory properties

Every SA node type has mandatory properties. Find nodes that lack them.

```cypher
// L1.1 -- Severity: CRITICAL
// Nodes missing mandatory 'id' or 'name' property
MATCH (n)
WHERE (n:Module OR n:UseCase OR n:DomainEntity OR n:Form OR n:SystemRole OR n:Component)
  AND (n.id IS NULL OR n.name IS NULL)
RETURN labels(n)[0] AS node_type,
       coalesce(n.id, 'NO ID') AS id,
       coalesce(n.name, 'NO NAME') AS name,
       'Missing mandatory property: id or name' AS problem
```

#### Check 1.2: DomainAttributes missing type

Every DomainAttribute must have a data_type property.

```cypher
// L1.2 -- Severity: CRITICAL
// DomainAttributes without data_type
MATCH (de:DomainEntity)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
WHERE da.data_type IS NULL
RETURN de.name AS entity, da.name AS attribute, da.id AS attr_id,
       'DomainAttribute missing data_type' AS problem
```

#### Check 1.3: Duplicate IDs within a label

IDs must be unique within each node type (enforced by constraints, but check anyway).

```cypher
// L1.3 -- Severity: CRITICAL
// Duplicate IDs across SA node types
UNWIND ['Module','UseCase','DomainEntity','DomainAttribute','Enumeration',
        'Form','FormField','Requirement','SystemRole','Component'] AS labelName
CALL {
  WITH labelName
  MATCH (n)
  WHERE labelName IN labels(n)
  WITH labelName, n.id AS nodeId, count(*) AS cnt
  WHERE cnt > 1
  RETURN labelName AS node_type, nodeId AS id, cnt AS duplicate_count
}
RETURN node_type, id, duplicate_count
```

#### Check 1.4: Inconsistent enumeration values (duplicate or empty)

```cypher
// L1.4 -- Severity: WARNING
// Enumerations with duplicate or empty values
MATCH (e:Enumeration)-[:HAS_VALUE]->(ev:EnumValue)
WITH e, ev.value AS val, count(*) AS cnt
WHERE cnt > 1 OR val IS NULL OR trim(val) = ''
RETURN e.name AS enumeration, e.id AS enum_id,
       coalesce(val, '<EMPTY>') AS value, cnt AS occurrences,
       CASE WHEN val IS NULL OR trim(val) = '' THEN 'Empty enum value'
            ELSE 'Duplicate enum value' END AS problem
```

---

### Level 2: Model Connectivity

**Goal:** Verify that all model elements are connected -- no orphans, no broken references.

#### Check 2.1: Completely disconnected nodes (orphans)

```cypher
// L2.1 -- Severity: CRITICAL
// Nodes with zero relationships
MATCH (n)
WHERE (n:Module OR n:UseCase OR n:DomainEntity OR n:DomainAttribute OR n:Form
       OR n:FormField OR n:Requirement OR n:SystemRole OR n:Enumeration OR n:Component)
  AND NOT (n)--()
RETURN labels(n)[0] AS node_type, n.id AS id,
       coalesce(n.name, n.description, n.value, '') AS display_name,
       'Completely disconnected node (zero relationships)' AS problem
```

#### Check 2.2: DomainEntities not assigned to any Module

```cypher
// L2.2 -- Severity: WARNING
// DomainEntities without a parent Module
MATCH (de:DomainEntity)
WHERE NOT (:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de.id AS entity_id, de.name AS entity_name,
       'DomainEntity not assigned to any Module' AS problem
```

#### Check 2.3: UseCases not assigned to any Module

```cypher
// L2.3 -- Severity: WARNING
// UseCases without a parent Module
MATCH (uc:UseCase)
WHERE NOT (:Module)-[:CONTAINS_UC]->(uc)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       'UseCase not assigned to any Module' AS problem
```

#### Check 2.4: DomainAttributes not owned by any entity

```cypher
// L2.4 -- Severity: CRITICAL
// DomainAttributes floating without a parent DomainEntity
MATCH (da:DomainAttribute)
WHERE NOT (:DomainEntity)-[:HAS_ATTRIBUTE]->(da)
RETURN da.id AS attr_id, da.name AS attr_name,
       'DomainAttribute not owned by any DomainEntity' AS problem
```

#### Check 2.5: FormFields not owned by any Form

```cypher
// L2.5 -- Severity: CRITICAL
// FormFields floating without a parent Form
MATCH (ff:FormField)
WHERE NOT (:Form)-[:HAS_FIELD]->(ff)
RETURN ff.id AS field_id, ff.name AS field_name,
       'FormField not owned by any Form' AS problem
```

---

### Level 3: Requirement Completeness

**Goal:** Every UseCase must have requirements; every requirement must be reachable.

#### Check 3.1: UseCases without any requirements

```cypher
// L3.1 -- Severity: CRITICAL
// UseCases with no HAS_REQUIREMENT edge
MATCH (uc:UseCase)
WHERE NOT (uc)-[:HAS_REQUIREMENT]->(:Requirement)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       'UseCase has no requirements' AS problem
```

#### Check 3.2: Orphaned requirements (not linked to any UseCase)

```cypher
// L3.2 -- Severity: WARNING
// Requirements not linked to any UseCase
MATCH (r:Requirement)
WHERE NOT (:UseCase)-[:HAS_REQUIREMENT]->(r)
RETURN r.id AS req_id, coalesce(r.description, r.name, '') AS description,
       'Requirement not linked to any UseCase' AS problem
```

#### Check 3.3: UseCases without any ActivitySteps

A UseCase without steps is just a title -- it needs a workflow.

```cypher
// L3.3 -- Severity: WARNING
// UseCases with zero ActivitySteps
MATCH (uc:UseCase)
WHERE NOT (uc)-[:HAS_STEP]->(:ActivityStep)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       'UseCase has no ActivitySteps (empty workflow)' AS problem
```

#### Check 3.4: UseCases without an actor (SystemRole)

Every UseCase should have at least one actor.

```cypher
// L3.4 -- Severity: WARNING
// UseCases without ACTOR edge to a SystemRole
MATCH (uc:UseCase)
WHERE NOT (uc)-[:ACTOR]->(:SystemRole)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       'UseCase has no assigned actor (SystemRole)' AS problem
```

---

### Level 4: Form-Domain Traceability

**Goal:** Every FormField should map to a DomainAttribute; every DomainAttribute should be reachable from at least one form (or marked internal).

#### Check 4.1: FormFields without MAPS_TO edge

```cypher
// L4.1 -- Severity: CRITICAL
// FormFields that have no MAPS_TO edge to a DomainAttribute
MATCH (f:Form)-[:HAS_FIELD]->(ff:FormField)
WHERE NOT (ff)-[:MAPS_TO]->(:DomainAttribute)
RETURN f.name AS form_name, f.id AS form_id,
       ff.name AS field_name, ff.id AS field_id,
       ff.field_type AS field_type, ff.label AS label,
       'FormField has no MAPS_TO -> DomainAttribute binding' AS problem
```

#### Check 4.2: DomainAttributes not referenced by any FormField (orphaned attributes)

```cypher
// L4.2 -- Severity: INFO
// DomainAttributes not mapped from any FormField (may be internal-only)
MATCH (de:DomainEntity)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
WHERE NOT (:FormField)-[:MAPS_TO]->(da)
  AND coalesce(da.internal, false) = false
RETURN de.name AS entity, de.id AS entity_id,
       da.name AS attribute, da.id AS attr_id,
       'DomainAttribute not referenced by any FormField and not marked internal' AS problem
```

#### Check 4.3: MAPS_TO pointing to non-existent attribute (dangling edge)

```cypher
// L4.3 -- Severity: CRITICAL
// FormFields with MAPS_TO edge where the target has no parent entity
MATCH (ff:FormField)-[:MAPS_TO]->(da:DomainAttribute)
WHERE NOT (:DomainEntity)-[:HAS_ATTRIBUTE]->(da)
RETURN ff.id AS field_id, ff.name AS field_name,
       da.id AS attr_id, da.name AS attr_name,
       'MAPS_TO target DomainAttribute has no parent DomainEntity' AS problem
```

#### Check 4.4: Type mismatch between FormField and DomainAttribute

```cypher
// L4.4 -- Severity: WARNING
// FormField field_type vs DomainAttribute data_type inconsistency
// (heuristic: TextInput should not map to Boolean, Checkbox should not map to String, etc.)
MATCH (ff:FormField)-[:MAPS_TO]->(da:DomainAttribute)
WHERE (ff.field_type = 'Checkbox' AND NOT da.data_type IN ['Boolean', 'Bool'])
   OR (ff.field_type = 'NumberInput' AND NOT da.data_type IN ['Integer', 'Int', 'Float', 'Decimal', 'Number', 'Money'])
   OR (ff.field_type = 'DatePicker' AND NOT da.data_type IN ['Date', 'DateTime', 'Timestamp'])
RETURN ff.id AS field_id, ff.name AS field_name, ff.field_type AS field_type,
       da.id AS attr_id, da.name AS attr_name, da.data_type AS attr_type,
       'Potential type mismatch between FormField and DomainAttribute' AS problem
```

---

### Level 5: UC-Form Validation

**Goal:** Every UseCase that has forms should reference them properly; forms should cover the UC's data needs.

#### Check 5.1: UseCases without any USES_FORM edge

```cypher
// L5.1 -- Severity: WARNING
// UseCases with ActivitySteps but no USES_FORM edge to any Form
MATCH (uc:UseCase)-[:HAS_STEP]->(:ActivityStep)
WHERE NOT (uc)-[:USES_FORM]->(:Form)
WITH DISTINCT uc
RETURN uc.id AS uc_id, uc.name AS uc_name,
       'UseCase has steps but no linked Forms (USES_FORM)' AS problem
```

#### Check 5.2: Forms not used by any UseCase

```cypher
// L5.2 -- Severity: WARNING
// Forms that no UseCase references
MATCH (f:Form)
WHERE NOT (:UseCase)-[:USES_FORM]->(f)
RETURN f.id AS form_id, f.name AS form_name,
       'Form not referenced by any UseCase (USES_FORM)' AS problem
```

#### Check 5.3: Forms with zero fields

A form without fields is structurally incomplete.

```cypher
// L5.3 -- Severity: CRITICAL
// Forms that have no FormField children
MATCH (f:Form)
WHERE NOT (f)-[:HAS_FIELD]->(:FormField)
RETURN f.id AS form_id, f.name AS form_name,
       'Form has zero fields (empty form)' AS problem
```

#### Check 5.4: UC uses form but form has no mapped domain attributes

```cypher
// L5.4 -- Severity: WARNING
// UC -> Form where none of the form's fields have MAPS_TO edges
MATCH (uc:UseCase)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
WITH uc, f, count(ff) AS total_fields,
     sum(CASE WHEN (ff)-[:MAPS_TO]->(:DomainAttribute) THEN 1 ELSE 0 END) AS mapped_fields
WHERE mapped_fields = 0
RETURN uc.id AS uc_id, uc.name AS uc_name,
       f.id AS form_id, f.name AS form_name,
       total_fields,
       'Form used by UC has zero mapped fields -- no domain traceability' AS problem
```

---

### Level 6: Cross-Module Consistency

**Goal:** Shared entities, terminology, and UC numbering are consistent across modules.

#### Check 6.1: DomainEntity referenced by multiple modules with inconsistent attributes

```cypher
// L6.1 -- Severity: WARNING
// Entities belonging to multiple modules (via CONTAINS_ENTITY) -- potential shared entity conflict
MATCH (m:Module)-[:CONTAINS_ENTITY]->(de:DomainEntity)
WITH de, collect(m.name) AS modules, count(m) AS module_count
WHERE module_count > 1
RETURN de.id AS entity_id, de.name AS entity_name, modules,
       'DomainEntity belongs to multiple modules -- verify attribute consistency' AS problem
```

#### Check 6.2: Circular UC dependencies

```cypher
// L6.2 -- Severity: CRITICAL
// Detect circular DEPENDS_ON chains (depth up to 10)
MATCH path = (uc:UseCase)-[:DEPENDS_ON*1..10]->(uc)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       length(path) AS cycle_length,
       [n IN nodes(path) | n.id] AS cycle_path,
       'Circular UC dependency detected' AS problem
LIMIT 20
```

#### Check 6.3: DomainEntities with RELATES_TO to entities in different modules

```cypher
// L6.3 -- Severity: INFO
// Cross-module entity relationships (not an error, but worth tracking)
MATCH (m1:Module)-[:CONTAINS_ENTITY]->(de1:DomainEntity)-[:RELATES_TO]->(de2:DomainEntity)<-[:CONTAINS_ENTITY]-(m2:Module)
WHERE m1 <> m2
RETURN m1.name AS module_1, de1.name AS entity_1,
       m2.name AS module_2, de2.name AS entity_2,
       'Cross-module entity relationship' AS observation
```

#### Check 6.4: SystemRoles with no UC actor assignments

```cypher
// L6.4 -- Severity: WARNING
// SystemRoles defined but never used as UC actor
MATCH (sr:SystemRole)
WHERE NOT (:UseCase)-[:ACTOR]->(sr)
RETURN sr.id AS role_id, sr.name AS role_name,
       'SystemRole defined but not assigned as actor to any UseCase' AS problem
```

---

## Validation Levels -- Cross-Layer (XL6-XL9)

These checks verify BA-to-SA traceability via handoff edges. They require both BA and SA layers to be populated in Neo4j.

### XL6: UC Coverage

**Goal:** Every automated BA WorkflowStep should have a corresponding SA UseCase via AUTOMATES_AS. Every SA UseCase should trace back to a BA step (or be marked as system-only).

#### Check XL6.1: Automated WorkflowSteps without AUTOMATES_AS edge

```cypher
// XL6.1 -- Severity: CRITICAL
// BA WorkflowSteps with stereotype "Автоматизируется" that have no AUTOMATES_AS -> UseCase
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
WHERE ws.stereotype = 'Автоматизируется'
  AND NOT (ws)-[:AUTOMATES_AS]->(:UseCase)
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.function_name AS ws_function,
       'Automated WorkflowStep has no AUTOMATES_AS -> UseCase' AS problem
```

#### Check XL6.2: UseCases not traced from any WorkflowStep

```cypher
// XL6.2 -- Severity: WARNING
// SA UseCases that no BA WorkflowStep maps to via AUTOMATES_AS
// These should be marked as "system UC" (uc.system_uc = true)
MATCH (uc:UseCase)
WHERE NOT (:WorkflowStep)-[:AUTOMATES_AS]->(uc)
  AND coalesce(uc.system_uc, false) = false
RETURN uc.id AS uc_id, uc.name AS uc_name,
       'UseCase not traced from any BA WorkflowStep and not marked system_uc' AS problem
```

#### Check XL6.3: AUTOMATES_AS edge pointing to non-existent UseCase (integrity)

```cypher
// XL6.3 -- Severity: CRITICAL
// WorkflowSteps with AUTOMATES_AS edge where the target UseCase has no id
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase)
WHERE uc.id IS NULL OR uc.name IS NULL
RETURN ws.id AS ws_id, ws.function_name AS ws_function,
       'AUTOMATES_AS target UseCase has missing id/name' AS problem
```

#### Check XL6.4: Coverage summary (informational)

```cypher
// XL6.4 -- Severity: INFO
// Summary: automated steps vs. covered steps
MATCH (ws:WorkflowStep)
WHERE ws.stereotype = 'Автоматизируется'
WITH count(ws) AS total_automated,
     sum(CASE WHEN (ws)-[:AUTOMATES_AS]->(:UseCase) THEN 1 ELSE 0 END) AS covered
RETURN total_automated, covered,
       total_automated - covered AS gap,
       CASE WHEN total_automated = 0 THEN 'N/A'
            ELSE toString(round(100.0 * covered / total_automated, 1)) + '%' END AS coverage_pct
```

---

### XL7: Entity Coverage

**Goal:** Every BA BusinessEntity should be realized as an SA DomainEntity via REALIZED_AS.

#### Check XL7.1: BusinessEntities without REALIZED_AS edge

```cypher
// XL7.1 -- Severity: CRITICAL
// BA BusinessEntities (type = "Бизнес-объект") with no REALIZED_AS -> DomainEntity
MATCH (be:BusinessEntity)
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
  AND coalesce(be.entity_type, '') <> 'Внешний документ'
RETURN be.id AS be_id, be.name AS be_name,
       coalesce(be.entity_type, 'unknown') AS be_type,
       'BusinessEntity has no REALIZED_AS -> DomainEntity' AS problem
```

#### Check XL7.2: External documents without documented decision

```cypher
// XL7.2 -- Severity: INFO
// BA entities of type "Внешний документ" -- mapping is optional but should be documented
MATCH (be:BusinessEntity)
WHERE coalesce(be.entity_type, '') = 'Внешний документ'
OPTIONAL MATCH (be)-[:REALIZED_AS]->(de:DomainEntity)
RETURN be.id AS be_id, be.name AS be_name,
       CASE WHEN de IS NULL THEN 'No SA counterpart (acceptable if documented)'
            ELSE 'Mapped to ' + de.name END AS status
```

#### Check XL7.3: EntityAttribute handoff coverage

```cypher
// XL7.3 -- Severity: WARNING
// BA EntityAttributes whose parent entity is realized but attribute itself has no TYPED_AS edge
MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity),
      (be)-[:HAS_ATTRIBUTE]->(ea:EntityAttribute)
WHERE NOT (ea)-[:TYPED_AS]->(:DomainAttribute)
RETURN be.name AS ba_entity, ea.name AS ba_attribute, ea.id AS ea_id,
       de.name AS sa_entity,
       'BA EntityAttribute has no TYPED_AS -> DomainAttribute' AS problem
```

#### Check XL7.4: Entity coverage summary

```cypher
// XL7.4 -- Severity: INFO
// Summary: BA entities vs. realized entities
MATCH (be:BusinessEntity)
WITH count(be) AS total_ba,
     sum(CASE WHEN (be)-[:REALIZED_AS]->(:DomainEntity) THEN 1 ELSE 0 END) AS realized
RETURN total_ba, realized,
       total_ba - realized AS gap,
       CASE WHEN total_ba = 0 THEN 'N/A'
            ELSE toString(round(100.0 * realized / total_ba, 1)) + '%' END AS coverage_pct
```

---

### XL8: Role Coverage

**Goal:** Every BA BusinessRole should map to an SA SystemRole via MAPPED_TO.

#### Check XL8.1: BusinessRoles without MAPPED_TO edge

```cypher
// XL8.1 -- Severity: CRITICAL
// BA BusinessRoles with no MAPPED_TO -> SystemRole
MATCH (br:BusinessRole)
WHERE NOT (br)-[:MAPPED_TO]->(:SystemRole)
RETURN br.id AS br_id, coalesce(br.full_name, br.name) AS br_name,
       'BusinessRole has no MAPPED_TO -> SystemRole' AS problem
```

#### Check XL8.2: SystemRoles not mapped from any BusinessRole

```cypher
// XL8.2 -- Severity: WARNING
// SA SystemRoles that no BA BusinessRole maps to
MATCH (sr:SystemRole)
WHERE NOT (:BusinessRole)-[:MAPPED_TO]->(sr)
RETURN sr.id AS sr_id, sr.name AS sr_name,
       'SystemRole not mapped from any BA BusinessRole (may be system-only role)' AS problem
```

#### Check XL8.3: N:M mapping audit

```cypher
// XL8.3 -- Severity: INFO
// Show the full BA Role -> SA Role mapping for review
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
WITH br, collect(sr.name) AS sa_roles, count(sr) AS sr_count
RETURN br.id AS br_id, coalesce(br.full_name, br.name) AS br_name,
       sa_roles, sr_count,
       CASE WHEN sr_count > 1 THEN 'N:M mapping -- verify intentional split'
            ELSE 'OK' END AS observation
```

#### Check XL8.4: Role coverage summary

```cypher
// XL8.4 -- Severity: INFO
// Summary: BA roles vs. mapped roles
MATCH (br:BusinessRole)
WITH count(br) AS total_ba,
     sum(CASE WHEN (br)-[:MAPPED_TO]->(:SystemRole) THEN 1 ELSE 0 END) AS mapped
RETURN total_ba, mapped,
       total_ba - mapped AS gap,
       CASE WHEN total_ba = 0 THEN 'N/A'
            ELSE toString(round(100.0 * mapped / total_ba, 1)) + '%' END AS coverage_pct
```

---

### XL9: Rule Coverage

**Goal:** Every BA BusinessRule should be implemented by an SA Requirement via IMPLEMENTED_BY.

#### Check XL9.1: BusinessRules without IMPLEMENTED_BY edge

```cypher
// XL9.1 -- Severity: CRITICAL
// BA BusinessRules with no IMPLEMENTED_BY -> Requirement
MATCH (brule:BusinessRule)
WHERE NOT (brule)-[:IMPLEMENTED_BY]->(:Requirement)
  AND coalesce(brule.out_of_scope, false) = false
RETURN brule.id AS brule_id, brule.name AS brule_name,
       'BusinessRule has no IMPLEMENTED_BY -> Requirement and not marked out_of_scope' AS problem
```

#### Check XL9.2: Out-of-scope rules audit

```cypher
// XL9.2 -- Severity: INFO
// BA BusinessRules marked as out_of_scope -- list for review
MATCH (brule:BusinessRule)
WHERE coalesce(brule.out_of_scope, false) = true
RETURN brule.id AS brule_id, brule.name AS brule_name,
       'BusinessRule marked out_of_scope -- verify this is intentional' AS observation
```

#### Check XL9.3: IMPLEMENTED_BY target integrity

```cypher
// XL9.3 -- Severity: CRITICAL
// BusinessRule -> Requirement edge where the Requirement has no linked UseCase
MATCH (brule:BusinessRule)-[:IMPLEMENTED_BY]->(r:Requirement)
WHERE NOT (:UseCase)-[:HAS_REQUIREMENT]->(r)
RETURN brule.id AS brule_id, brule.name AS brule_name,
       r.id AS req_id,
       'IMPLEMENTED_BY target Requirement is not linked to any UseCase (orphan)' AS problem
```

#### Check XL9.4: Rule coverage summary

```cypher
// XL9.4 -- Severity: INFO
// Summary: BA rules vs. implemented rules
MATCH (brule:BusinessRule)
WITH count(brule) AS total_ba,
     sum(CASE WHEN (brule)-[:IMPLEMENTED_BY]->(:Requirement) THEN 1 ELSE 0 END) AS implemented,
     sum(CASE WHEN coalesce(brule.out_of_scope, false) = true THEN 1 ELSE 0 END) AS out_of_scope
RETURN total_ba, implemented, out_of_scope,
       total_ba - implemented - out_of_scope AS gap,
       CASE WHEN total_ba = 0 THEN 'N/A'
            ELSE toString(round(100.0 * (implemented + out_of_scope) / total_ba, 1)) + '%' END AS coverage_pct
```

---

## Execution Procedure

### Step 1: Pre-flight

1. Run the pre-flight queries (Step 0, Step 0b).
2. Determine which levels to execute based on the `level` parameter and available data.
3. If graph is empty, STOP and advise the user.

### Step 2: Execute validation levels

For each enabled level (L1 through L6, XL6 through XL9):

1. Run ALL Cypher queries for that level using `mcp__neo4j__read-cypher`.
2. Collect results into a structured list: `{level, check_id, severity, count, details[]}`.
3. If a query returns zero rows, that check PASSES.
4. If a query returns rows, each row is a problem -- assign the severity defined in the check.

### Step 3: Aggregate results

After all levels complete:

1. Count problems by severity: CRITICAL, WARNING, INFO.
2. Determine overall status:
   - **PASS** -- zero CRITICAL, fewer than 5 WARNINGs
   - **WARN** -- zero CRITICAL, 5 or more WARNINGs
   - **FAIL** -- one or more CRITICALs
3. For each level, determine level status using the same logic.

### Step 4: Generate report

Output the report in markdown format (see Report Format below).

---

## Report Format

Generate the following markdown report and output it directly to the user.

```markdown
# Validation Report -- nacl-sa-validate

**Date:** YYYY-MM-DD
**Level:** {internal | ba-cross | full}
**Overall status:** PASS / WARN / FAIL

## Summary

| Level | Name | Status | Critical | Warning | Info |
|-------|------|--------|----------|---------|------|
| L1 | Data Consistency | PASS/WARN/FAIL | N | N | N |
| L2 | Model Connectivity | PASS/WARN/FAIL | N | N | N |
| L3 | Requirement Completeness | PASS/WARN/FAIL | N | N | N |
| L4 | Form-Domain Traceability | PASS/WARN/FAIL | N | N | N |
| L5 | UC-Form Validation | PASS/WARN/FAIL | N | N | N |
| L6 | Cross-Module Consistency | PASS/WARN/FAIL | N | N | N |
| XL6 | UC Coverage (BA->SA) | PASS/WARN/FAIL/SKIP | N | N | N |
| XL7 | Entity Coverage (BA->SA) | PASS/WARN/FAIL/SKIP | N | N | N |
| XL8 | Role Coverage (BA->SA) | PASS/WARN/FAIL/SKIP | N | N | N |
| XL9 | Rule Coverage (BA->SA) | PASS/WARN/FAIL/SKIP | N | N | N |

SKIP = level was not executed (BA layer not available or level not in scope)

## Coverage Metrics

| Metric | Total | Covered | Gap | % |
|--------|-------|---------|-----|---|
| UC Coverage (BA steps -> SA UC) | N | N | N | N% |
| Entity Coverage (BA -> SA) | N | N | N | N% |
| Role Coverage (BA -> SA) | N | N | N | N% |
| Rule Coverage (BA -> SA) | N | N | N | N% |

(Only shown when XL6-XL9 are executed)

## Problems

### CRITICAL

| # | Level | Check | Description | Node(s) |
|---|-------|-------|-------------|---------|
| 1 | L1 | 1.1 | Missing mandatory property | Module:MOD-01 |

### WARNING

| # | Level | Check | Description | Node(s) |
|---|-------|-------|-------------|---------|
| 1 | L2 | 2.2 | Entity not assigned to module | DomainEntity:ENT-05 |

### INFO

| # | Level | Check | Description | Node(s) |
|---|-------|-------|-------------|---------|
| 1 | L4 | 4.2 | Attribute not referenced by form | Order.internalCode |

## Recommendations

1. **[CRITICAL]** Fix mandatory properties on nodes: ...
2. **[WARNING]** Assign orphaned entities to modules: ...
3. **[INFO]** Consider marking internal attributes explicitly: ...

## Next Steps

- [ ] Fix all CRITICAL issues
- [ ] Review WARNING items
- [ ] Re-run `/nacl-sa-validate` after fixes
```

---

## Error Handling

### Neo4j connection failure

If `mcp__neo4j__read-cypher` fails:
1. Connection: read from config.yaml graph section (see nacl-core/SKILL.md → Graph Config Resolution). MCP tools handle the connection automatically.
2. Suggest user verify Neo4j is running.
3. Abort validation with a clear error message.

### Query timeout

If a query takes too long:
1. Note it in the report as SKIP for that check.
2. Continue with remaining checks.
3. Suggest adding LIMIT or narrowing the scope.

### Empty graph

If pre-flight returns zero nodes:
1. STOP immediately.
2. Report: "Graph is empty. Run `/nacl-sa-architect` or `/nacl-sa-domain` to populate the SA layer."

---

## Reads / Writes

### Reads (Neo4j -- via mcp__neo4j__read-cypher)

```yaml
# SA layer nodes:
- Module, UseCase, ActivityStep, DomainEntity, DomainAttribute
- Enumeration, EnumValue, Form, FormField
- Requirement, SystemRole, Component

# BA layer nodes (for XL6-XL9):
- ProcessGroup, BusinessProcess, WorkflowStep
- BusinessEntity, EntityAttribute, EntityState
- BusinessRole, BusinessRule, GlossaryTerm

# Cross-layer edges:
- AUTOMATES_AS, REALIZED_AS, TYPED_AS, MAPPED_TO, IMPLEMENTED_BY
```

### Writes

```yaml
# This skill writes NOTHING to Neo4j.
# Output is a markdown report printed to the user.
```

---

## Checklist -- /nacl-sa-validate

Before completing, verify:

### Pre-flight
- [ ] SA-layer nodes exist in the graph
- [ ] BA-layer nodes exist (if running ba-cross or full)
- [ ] Neo4j connection is working

### L1: Data Consistency
- [ ] All nodes have mandatory properties (id, name)
- [ ] DomainAttributes have data_type
- [ ] No duplicate IDs within a label
- [ ] Enumeration values are not empty or duplicated

### L2: Model Connectivity
- [ ] No completely disconnected nodes
- [ ] All DomainEntities assigned to a Module
- [ ] All UseCases assigned to a Module
- [ ] No floating DomainAttributes or FormFields

### L3: Requirement Completeness
- [ ] Every UseCase has at least one Requirement
- [ ] No orphaned Requirements
- [ ] Every UseCase has ActivitySteps
- [ ] Every UseCase has an actor (SystemRole)

### L4: Form-Domain Traceability
- [ ] All FormFields have MAPS_TO -> DomainAttribute
- [ ] Orphaned DomainAttributes reviewed (internal or missing binding)
- [ ] No dangling MAPS_TO edges
- [ ] No type mismatches between FormField and DomainAttribute

### L5: UC-Form Validation
- [ ] UseCases with steps have linked Forms
- [ ] No orphaned Forms (used by at least one UC)
- [ ] No empty Forms (zero fields)
- [ ] Forms used by UCs have mapped domain attributes

### L6: Cross-Module Consistency
- [ ] Shared entities flagged for review
- [ ] No circular UC dependencies
- [ ] Cross-module relationships documented
- [ ] All SystemRoles assigned as actors

### XL6: UC Coverage (ba-cross / full only)
- [ ] All automated WorkflowSteps have AUTOMATES_AS -> UseCase
- [ ] Untraced UseCases marked as system_uc
- [ ] AUTOMATES_AS target integrity verified

### XL7: Entity Coverage (ba-cross / full only)
- [ ] All BusinessEntities (non-external) have REALIZED_AS -> DomainEntity
- [ ] External documents reviewed
- [ ] EntityAttribute TYPED_AS coverage checked

### XL8: Role Coverage (ba-cross / full only)
- [ ] All BusinessRoles have MAPPED_TO -> SystemRole
- [ ] Unmatched SystemRoles reviewed
- [ ] N:M mappings audited

### XL9: Rule Coverage (ba-cross / full only)
- [ ] All BusinessRules have IMPLEMENTED_BY -> Requirement (or marked out_of_scope)
- [ ] Out-of-scope rules reviewed
- [ ] IMPLEMENTED_BY target requirements linked to UseCases

### Report
- [ ] Summary table generated with per-level status
- [ ] Coverage metrics included (if XL levels ran)
- [ ] All problems listed with severity and affected nodes
- [ ] Recommendations provided for each issue category
- [ ] Next steps checklist included

---
name: graph_sa_finalize
description: |
  Finalize specification via Neo4j: statistics, glossary, ADR, traceability matrix,
  readiness assessment. All computed from graph queries.
  Graph-first equivalent of sa-finalize.
  Use when: finalize spec with graph, generate statistics, or the user says "/graph_sa_finalize".
---

# /graph_sa_finalize -- Specification Finalization (Graph)

## Purpose

Finalize the specification by computing all summary artifacts from Neo4j aggregation queries:
statistics summary, glossary extract, ADR records, traceability matrix, and readiness assessment.
No file reading -- everything is aggregated from the graph. Data stays in the graph and is
viewable via `/graph_render` or `/graph_publish`.

**Shared references:** `graph_core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | All aggregation queries (statistics, glossary, readiness, traceability) |
| `mcp__neo4j__write-cypher` | Create/update ADR nodes (Requirement with type='adr') |
| `mcp__neo4j__get-schema` | Introspect current graph schema before finalization |

---

## Modes

### Mode `full` (default)

Full finalization: all five phases sequentially.

**When:** After successful validation (`/graph_sa_validate full`).

### Mode `module`

Finalize a single module (scoped statistics + readiness).

**When:** After completing work on one module.

**Parameter:** `module` -- module ID (e.g. `mod-orders`).

### Mode `stats-only`

Statistics and readiness only -- no ADR creation, no glossary update.

**When:** User wants to see current progress without modifying the graph.

---

## Workflow Overview

```
+-----------------+    +-----------------+    +-----------------+
| Phase 1         |    | Phase 2         |    | Phase 3         |
| Statistics      |--->| Glossary +      |--->| Traceability    |
| Summary         |    | ADR             |    | Matrix          |
+-----------------+    +-----------------+    +-----------------+
                                                     |
                                                     v
                       +-----------------+    +-----------------+
                       | Phase 5         |    | Phase 4         |
                       | Report to       |<---| Readiness       |
                       | User            |    | Assessment      |
                       +-----------------+    +-----------------+
```

---

## Pre-flight Checks

1. Run `mcp__neo4j__get-schema` to confirm the graph is populated
2. Verify Module nodes exist: `MATCH (m:Module) RETURN count(m) AS cnt`
   - If cnt = 0 -> STOP: "No modules in graph. Run /graph_sa_architect first."
3. Verify UseCase nodes exist: `MATCH (uc:UseCase) RETURN count(uc) AS cnt`
   - If cnt = 0 -> WARN: "No use cases found. Statistics will be incomplete."
4. If mode = `module`, verify the module exists:
   ```cypher
   MATCH (m:Module {id: $moduleId}) RETURN m
   ```
   - Not found -> STOP: "Module {moduleId} not found in graph."

---

## Phase 1: Statistics Summary

**Goal:** Compute aggregate counts across all specification node types.

### Query: `sa_statistics_summary`

Source: `graph-infra/queries/sa-queries.cypher`

```cypher
MATCH (m:Module) WITH count(m) AS modules
MATCH (uc:UseCase) WITH modules, count(uc) AS ucs
MATCH (de:DomainEntity) WITH modules, ucs, count(de) AS entities
MATCH (da:DomainAttribute) WITH modules, ucs, entities, count(da) AS attributes
MATCH (f:Form) WITH modules, ucs, entities, attributes, count(f) AS forms
MATCH (ff:FormField) WITH modules, ucs, entities, attributes, forms, count(ff) AS fields
MATCH (sr:SystemRole) WITH modules, ucs, entities, attributes, forms, fields, count(sr) AS roles
MATCH (rq:Requirement) WITH modules, ucs, entities, attributes, forms, fields, roles, count(rq) AS requirements
MATCH (c:Component) WITH modules, ucs, entities, attributes, forms, fields, roles, requirements, count(c) AS components
RETURN modules, ucs, entities, attributes, forms, fields, roles, requirements, components;
```

### Additional counts (run separately)

Enumerations:
```cypher
MATCH (en:Enumeration) RETURN count(en) AS enumerations;
```

ADRs:
```cypher
MATCH (rq:Requirement {type: 'adr'}) RETURN count(rq) AS adrs;
```

Open questions (if stored as Requirement with type='question'):
```cypher
MATCH (rq:Requirement {type: 'question', status: 'open'}) RETURN count(rq) AS open_questions;
```

UC detail breakdown:
```cypher
MATCH (uc:UseCase)
RETURN count(uc) AS total,
       count(CASE WHEN uc.priority = 'primary' THEN 1 END) AS primary_ucs,
       count(CASE WHEN uc.priority = 'secondary' THEN 1 END) AS secondary_ucs,
       count(CASE WHEN uc.detail_status = 'complete' THEN 1 END) AS detailed_ucs;
```

### Output format

Present to user as a table:

```
| Metric             | Count |
|--------------------|-------|
| Modules            | {N}   |
| Domain Entities    | {N}   |
| Attributes (total) | {N}   |
| Enumerations       | {N}   |
| Roles              | {N}   |
| Use Cases (total)  | {N}   |
|   - Primary        | {N}   |
|   - Secondary      | {N}   |
|   - Detailed       | {N}/{total} |
| Forms              | {N}   |
| Form Fields        | {N}   |
| Requirements       | {N}   |
| Components         | {N}   |
| ADRs               | {N}   |
| Open Questions     | {N}   |
```

For mode `module`, scope all queries with:
```cypher
MATCH (m:Module {id: $moduleId})-[:CONTAINS_UC]->(uc:UseCase) ...
MATCH (m:Module {id: $moduleId})-[:CONTAINS_ENTITY]->(de:DomainEntity) ...
```

---

## Phase 2: Glossary Extract + ADR

**Goal:** Extract glossary terms from graph; compile Architecture Decision Records.

### 2a: Glossary Extract

#### Query: `sa_glossary_extract`

Source: `graph-infra/queries/sa-queries.cypher`

```cypher
MATCH (de:DomainEntity)
RETURN 'DomainEntity' AS source_type, de.id AS id, de.name AS term
UNION ALL
MATCH (en:Enumeration)
RETURN 'Enumeration' AS source_type, en.id AS id, en.name AS term
UNION ALL
MATCH (sr:SystemRole)
RETURN 'SystemRole' AS source_type, sr.id AS id, sr.name AS term;
```

#### Cross-reference with BA glossary (if BA layer exists)

```cypher
MATCH (g:GlossaryTerm)
OPTIONAL MATCH (g)-[:REFERS_TO]->(de:DomainEntity)
RETURN g.id AS glo_id, g.term AS ba_term, g.definition AS definition,
       de.id AS sa_entity_id, de.name AS sa_entity_name;
```

#### Actions

1. Run `sa_glossary_extract` to collect all SA-layer terms
2. For each term without a definition, generate a one-sentence definition from its graph context
   (attributes, relationships, module membership)
3. Cross-reference with BA GlossaryTerm nodes to map BA term -> SA entity
4. Present combined glossary to user (do NOT write to files)

### 2b: ADR Compilation

ADRs are stored as `Requirement` nodes with `type: 'adr'`.

#### Read existing ADRs

```cypher
MATCH (rq:Requirement {type: 'adr'})
RETURN rq.id AS id, rq.description AS title, rq.context AS context,
       rq.decision AS decision, rq.alternatives AS alternatives,
       rq.consequences AS consequences
ORDER BY rq.id;
```

#### Detect implicit decisions not yet recorded

Check for architectural patterns that imply decisions:

```cypher
// Module decomposition decision
MATCH (m:Module)
RETURN count(m) AS module_count, collect(m.name) AS modules;
```

```cypher
// Role model decision
MATCH (sr:SystemRole)
RETURN count(sr) AS role_count, collect(sr.name) AS roles;
```

#### Create missing ADR nodes

For each detected decision not yet in the graph, create with `mcp__neo4j__write-cypher`:

```cypher
CREATE (rq:Requirement {
  id: $adrId,
  type: 'adr',
  description: $title,
  context: $context,
  decision: $decision,
  alternatives: $alternatives,
  consequences: $consequences,
  status: 'accepted',
  created_at: datetime()
})
RETURN rq;
```

ADR ID format: `ADR-NNN` (get next available):
```cypher
MATCH (rq:Requirement {type: 'adr'})
WITH max(toInteger(replace(rq.id, 'ADR-', ''))) AS maxNum
RETURN 'ADR-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId;
```

#### Typical ADR categories to check

1. Module decomposition rationale
2. Domain model key decisions (entity boundaries, shared vs. separate)
3. Role model and authorization approach
4. Interface architecture decisions (SPA, navigation patterns)
5. Technology-specific decisions (if captured in Requirements)

Present each new ADR to user for confirmation before writing.

IMPORTANT: In `stats-only` mode, SKIP Phase 2 entirely.

---

## Phase 3: Traceability Matrix

**Goal:** Compute full BA-to-SA traceability and coverage from the graph.

### Query: `handoff_traceability_matrix`

Source: `graph-infra/queries/handoff-queries.cypher`

```cypher
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase)
RETURN 'Step->UC' AS category, ws.id AS ba_id, ws.function_name AS ba_name, uc.id AS sa_id, uc.name AS sa_name
UNION ALL
MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity)
RETURN 'Entity->Domain' AS category, be.id AS ba_id, be.name AS ba_name, de.id AS sa_id, de.name AS sa_name
UNION ALL
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
RETURN 'Role->SysRole' AS category, br.id AS ba_id, br.full_name AS ba_name, sr.id AS sa_id, sr.name AS sa_name
UNION ALL
MATCH (brq:BusinessRule)-[:IMPLEMENTED_BY]->(rq:Requirement)
RETURN 'Rule->Req' AS category, brq.id AS ba_id, brq.name AS ba_name, rq.id AS sa_id, rq.description AS sa_name;
```

### Query: `handoff_coverage_stats`

Source: `graph-infra/queries/handoff-queries.cypher`

```cypher
MATCH (ws:WorkflowStep {stereotype: "Автоматизируется"})
WITH count(ws) AS total_auto
OPTIONAL MATCH (ws2:WorkflowStep {stereotype: "Автоматизируется"})-[:AUTOMATES_AS]->(:UseCase)
WITH total_auto, count(ws2) AS covered_auto
WITH total_auto, covered_auto,
     CASE WHEN total_auto > 0 THEN round(100.0 * covered_auto / total_auto) ELSE 0 END AS step_pct
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WITH total_auto, covered_auto, step_pct, count(be) AS total_entities
OPTIONAL MATCH (be2:BusinessEntity {type: "Бизнес-объект"})-[:REALIZED_AS]->(:DomainEntity)
WITH total_auto, covered_auto, step_pct, total_entities, count(be2) AS covered_entities
WITH total_auto, covered_auto, step_pct, total_entities, covered_entities,
     CASE WHEN total_entities > 0 THEN round(100.0 * covered_entities / total_entities) ELSE 0 END AS entity_pct
MATCH (br:BusinessRole)
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, count(br) AS total_roles
OPTIONAL MATCH (br2:BusinessRole)-[:MAPPED_TO]->(:SystemRole)
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, count(br2) AS covered_roles
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles,
     CASE WHEN total_roles > 0 THEN round(100.0 * covered_roles / total_roles) ELSE 0 END AS role_pct
MATCH (brq:BusinessRule)
WITH step_pct, entity_pct, role_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles, count(brq) AS total_rules
OPTIONAL MATCH (brq2:BusinessRule)-[:IMPLEMENTED_BY]->(:Requirement)
WITH step_pct, entity_pct, role_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles, total_rules, count(brq2) AS covered_rules
RETURN
  step_pct AS automation_coverage_pct,
  entity_pct AS entity_coverage_pct,
  role_pct AS role_coverage_pct,
  CASE WHEN total_rules > 0 THEN round(100.0 * covered_rules / total_rules) ELSE 0 END AS rule_coverage_pct,
  {steps_covered: covered_auto, steps_total: total_auto,
   entities_covered: covered_entities, entities_total: total_entities,
   roles_covered: covered_roles, roles_total: total_roles,
   rules_covered: covered_rules, rules_total: total_rules} AS details;
```

### Detect uncovered items

Run these to find gaps:

```cypher
// Uncovered automation steps
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
WHERE NOT (ws)-[:AUTOMATES_AS]->(:UseCase)
RETURN bp.id AS bp_id, bp.name AS bp_name, ws.id AS ws_id, ws.function_name AS ws_function;
```

```cypher
// Uncovered business entities
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
RETURN be.id, be.name, be.type;
```

### Output format

Present four sections grouped by category:

```
## Traceability Matrix

### 1. Workflow Steps -> Use Cases
| BA Step | BA Name | SA UC | SA UC Name | Status |
|---------|---------|-------|------------|--------|

### 2. Business Entities -> Domain Entities
| BA Entity | BA Name | SA Entity | SA Entity Name | Status |

### 3. Business Roles -> System Roles
| BA Role | BA Name | SA Role | SA Role Name | Status |

### 4. Business Rules -> Requirements
| BA Rule | BA Name | SA Req | SA Req Description | Status |

### Coverage Summary
| Category         | Covered | Total | Percentage |
|------------------|---------|-------|------------|
| Automation Steps | {N}     | {N}   | {N}%       |
| Entities         | {N}     | {N}   | {N}%       |
| Roles            | {N}     | {N}   | {N}%       |
| Rules            | {N}     | {N}   | {N}%       |
```

If no BA layer exists (no BusinessProcess nodes), report:
"No BA layer in graph -- traceability matrix skipped."

IMPORTANT: In `stats-only` mode, SKIP Phase 3.

---

## Phase 4: Readiness Assessment

**Goal:** Per-module completion percentages to determine specification readiness.

### Query: `sa_readiness_assessment`

Source: `graph-infra/queries/sa-queries.cypher`

```cypher
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
WITH m, count(uc) AS total_ucs,
     count(CASE WHEN uc.detail_status = 'complete' THEN 1 END) AS detailed_ucs
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
WITH m, total_ucs, detailed_ucs, count(de) AS total_entities
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de2:DomainEntity)-[:HAS_ATTRIBUTE]->()
WITH m, total_ucs, detailed_ucs, total_entities,
     count(DISTINCT de2) AS entities_with_attrs
RETURN m.id AS module_id, m.name AS module_name,
       total_ucs, detailed_ucs,
       CASE WHEN total_ucs > 0 THEN round(100.0 * detailed_ucs / total_ucs) ELSE 0 END AS uc_readiness_pct,
       total_entities, entities_with_attrs,
       CASE WHEN total_entities > 0 THEN round(100.0 * entities_with_attrs / total_entities) ELSE 0 END AS entity_readiness_pct;
```

### Additional readiness checks

Form coverage per module:
```cypher
MATCH (m:Module)-[:CONTAINS_UC]->(uc:UseCase)
WITH m, count(uc) AS total_ucs
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc2:UseCase)-[:USES_FORM]->(:Form)
WITH m, total_ucs, count(DISTINCT uc2) AS ucs_with_forms
RETURN m.id AS module_id, m.name AS module_name,
       total_ucs, ucs_with_forms,
       CASE WHEN total_ucs > 0 THEN round(100.0 * ucs_with_forms / total_ucs) ELSE 0 END AS form_coverage_pct;
```

Requirement coverage per module:
```cypher
MATCH (m:Module)-[:CONTAINS_UC]->(uc:UseCase)
WITH m, count(uc) AS total_ucs
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc2:UseCase)-[:HAS_REQUIREMENT]->(:Requirement)
WITH m, total_ucs, count(DISTINCT uc2) AS ucs_with_reqs
RETURN m.id AS module_id, m.name AS module_name,
       total_ucs, ucs_with_reqs,
       CASE WHEN total_ucs > 0 THEN round(100.0 * ucs_with_reqs / total_ucs) ELSE 0 END AS req_coverage_pct;
```

### Output format

```
## Readiness Assessment

### Per-Module Breakdown

| Module | Entities | Entity Attrs | UC Detail | Forms | Requirements | Overall |
|--------|----------|-------------|-----------|-------|-------------|---------|
| {name} | {N}      | {N}%        | {N}%      | {N}%  | {N}%        | {avg}%  |

### Overall Readiness

| Area               | Status       | Progress | Comment                  |
|--------------------|-------------|----------|--------------------------|
| Architecture       | {status}    | {N}%     | {N} modules              |
| Domain Model       | {status}    | {N}%     | {N} entities, {N} attrs  |
| Roles              | {status}    | {N}%     | {N} roles                |
| UC Detailing       | {status}    | {N}%     | {done}/{total} UC        |
| Forms              | {status}    | {N}%     | {done}/{total} UCs       |
| Requirements       | {status}    | {N}%     | {done}/{total} UCs       |
| BA Traceability    | {status}    | {N}%     | coverage stats           |

### Ready for Implementation?

- **Design:** {N}% -- sufficient to start development? {Yes/No}
- **Implementation:** {N}% -- all UCs detailed? {Yes/No}
- **Testing:** {N}% -- all acceptance criteria defined? {Yes/No}
```

Status mapping:
- >= 90%: "Complete"
- >= 50%: "In Progress"
- < 50%: "Needs Work"

---

## Phase 5: Report to User

**Goal:** Present consolidated finalization report.

### Final report structure

```
Specification finalization complete.

**Statistics:**
- {N} modules, {N} entities, {N} UCs, {N} forms, {N} requirements
- {N} ADRs recorded

**Traceability (BA -> SA):**
- Automation steps: {N}% covered
- Entities: {N}% covered
- Roles: {N}% covered
- Rules: {N}% covered

**Readiness:** {overall}%

**Next steps:**
1. {If UCs not detailed}: `/graph_sa_uc UC-{NNN}` -- detail remaining UCs
2. {If validation not passed}: `/graph_sa_validate full` -- fix found issues
3. {If coverage gaps}: `/graph_sa_domain IMPORT_BA` or `/graph_sa_uc` -- cover BA gaps
4. {If ready}: Specification ready for `/graph_tl_plan`
```

### No file output

All data stays in the graph. To produce visual or published output, use:
- `/graph_render` -- render any graph view as Excalidraw board
- `/graph_publish` -- publish to Docmost

---

## Key Principle: Graph-Only

This skill does NOT:
- Read any markdown files from `docs/`
- Write any markdown files to `docs/`
- Generate `_index.md` or update `CLAUDE.md`

Everything is computed from Neo4j aggregation queries. The graph is the single source of truth.

---

## Checklist /graph_sa_finalize

### Pre-flight
- [ ] Graph schema introspected
- [ ] Module nodes exist in graph
- [ ] Mode determined (full / module / stats-only)

### Phase 1: Statistics
- [ ] `sa_statistics_summary` executed
- [ ] Additional counts collected (enumerations, ADRs, open questions)
- [ ] UC breakdown computed (primary/secondary/detailed)
- [ ] Statistics table presented to user

### Phase 2: Glossary + ADR (skip if stats-only)
- [ ] `sa_glossary_extract` executed
- [ ] BA GlossaryTerm cross-reference checked
- [ ] Combined glossary presented
- [ ] Existing ADRs read
- [ ] Implicit decisions detected
- [ ] New ADR nodes confirmed with user before creation
- [ ] ADRs written to graph as Requirement nodes (type='adr')

### Phase 3: Traceability Matrix (skip if stats-only)
- [ ] `handoff_traceability_matrix` executed
- [ ] `handoff_coverage_stats` executed
- [ ] Uncovered items identified
- [ ] Four-section matrix presented
- [ ] Coverage summary shown

### Phase 4: Readiness Assessment
- [ ] `sa_readiness_assessment` executed
- [ ] Form coverage computed
- [ ] Requirement coverage computed
- [ ] Per-module breakdown presented
- [ ] Overall readiness percentage calculated
- [ ] Implementation readiness verdict given

### Phase 5: Report
- [ ] Consolidated report presented to user
- [ ] Next steps recommended based on gaps

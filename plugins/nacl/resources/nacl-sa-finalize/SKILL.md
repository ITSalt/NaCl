---
name: nacl-sa-finalize
model: sonnet
effort: medium
description: |
  Finalize specification via Neo4j: statistics, glossary, ADR, traceability matrix,
  readiness assessment. All computed from graph queries.Use when: finalize spec with graph, generate statistics, or the user says "/nacl-sa-finalize".
---

# /nacl-sa-finalize -- Specification Finalization (Graph)

## Purpose

Finalize the specification by computing all summary artifacts from Neo4j aggregation queries:
statistics summary, glossary extract, ADR records, traceability matrix, and readiness assessment.
No file reading -- everything is aggregated from the graph. Data stays in the graph and is
viewable via `/nacl-render` or `/nacl-publish`.

**Shared references:** `nacl-core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | All aggregation queries (statistics, glossary, readiness, traceability) |
| `mcp__neo4j__write-cypher` | Create/update `:Decision` nodes + `JUSTIFIES` edges; backfill legacy `Requirement{type:'adr'}` → `:Decision` |
| `mcp__neo4j__get-schema` | Introspect current graph schema before finalization |

---

## Modes

### Mode `full` (default)

Full finalization: all five phases sequentially.

**When:** After successful validation (`/nacl-sa-validate full`).

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
   - If cnt = 0 -> STOP: "No modules in graph. Run /nacl-sa-architect first."
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

### Connected-spec extension counts (2.15+)

#### Query: `sa_statistics_extensions`

Source: `graph-infra/queries/sa-queries.cypher`

```cypher
RETURN
  COUNT { (n:Decision) }          AS decisions,
  COUNT { (n:Screen) }            AS screens,
  COUNT { (n:ScreenState) }       AS screen_states,
  COUNT { (n:ScreenEvent) }       AS screen_events,
  COUNT { (n:Transition) }        AS screen_transitions,
  COUNT { (n:ScreenEffect) }      AS screen_effects,
  COUNT { (n:AnalyticsEvent) }    AS analytics_events,
  COUNT { (n:Slice) }             AS slices,
  COUNT { (n:DomainError) }       AS domain_errors,
  COUNT { (n:ErrorPresentation) } AS error_presentations,
  COUNT { (n:CachePolicy) }       AS cache_policies,
  COUNT { (n:DegradationRule) }   AS degradation_rules;
```

These layers are **opt-in** (vacuous PASS in `/nacl-sa-validate` L10-L13 when
empty). All-zero counts for a layer mean "not adopted", not "incomplete" —
report them as such, do not treat zero as a readiness failure.

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
| Decisions          | {N}   |
| Screens            | {N} ({N} states, {N} transitions) |
| Behavior Slices    | {N}   |
| Domain Errors      | {N} ({N} presentations) |
| Cache Policies     | {N}   |
| Degradation Rules  | {N}   |
```

Extension rows with zero counts are rendered as `— (not adopted)` instead of `0`.

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

### 2b: Architecture Decisions (graph-native)

Architecture decisions are stored as first-class `:Decision` nodes
(`level:'architecture'`, `created_by:'nacl-sa-finalize'`) linked to the
artifacts they justify via `JUSTIFIES` — the same provenance model that
`nacl-sa-feature` and `nacl-tl-fix` write. This is the authority; markdown ADRs
are projections. (Legacy projects stored ADRs as `Requirement {type:'adr'}` with
no link to what they justified — those are migrated below so the year-later
"why" query reaches them.)

#### Read existing decisions (both modern and legacy)

```cypher
MATCH (d:Decision)
RETURN d.id AS id, d.title AS title, d.rationale AS rationale,
       d.status AS status, d.level AS level
ORDER BY d.id;
```

```cypher
// Legacy ADRs not yet migrated to :Decision
MATCH (rq:Requirement {type: 'adr'})
RETURN rq.id AS id, rq.description AS title, rq.context AS context,
       rq.decision AS decision, rq.alternatives AS alternatives,
       rq.consequences AS consequences
ORDER BY rq.id;
```

#### One-time backfill: legacy `Requirement{type:'adr'}` → `:Decision`

For each legacy ADR, create a `:Decision` carrying the same content (rationale
from `decision`+`consequences`), `source:'ADR-NNN (imported)'`, and — where the
ADR's subject is identifiable — a `JUSTIFIES` edge to the module/entity/role it
concerns. Present to the user before writing; never delete the legacy node
(keep lineage), just mark it `migrated_to: <DEC-id>`.

```cypher
// mcp__neo4j__write-cypher  (per legacy ADR, after user confirms the JUSTIFIES target)
MATCH (rq:Requirement {id: $adrId, type:'adr'})
MERGE (d:Decision {id: $decId})
SET d.title = rq.description, d.context = rq.context,
    d.chosen = rq.decision, d.rationale = coalesce(rq.decision,'') + ' — ' + coalesce(rq.consequences,''),
    d.alternatives_considered = CASE WHEN rq.alternatives IS NULL THEN [] ELSE [rq.alternatives] END,
    d.status = coalesce(rq.status,'accepted'), d.created_at = coalesce(rq.created_at, datetime()),
    d.created_by = 'nacl-sa-finalize', d.source = rq.id + ' (imported)', d.level = 'architecture'
SET rq.migrated_to = $decId
RETURN d.id;
```

Also import any standalone `docs/adr/*.md` files the same way (`source:'<file> (imported)'`).

#### Backfill: FeatureRequests without a Decision (provenance gap-closure)

Projects created before the provenance feature have `:FeatureRequest` nodes with
no linked `:Decision` — `nacl-sa-validate` L9.1 flags every one. Close the gap by
writing one honest `:Decision` per FR, with rationale drawn from the project's
own recorded text (never invented). Full runbook:
`nacl-tl-core/references/provenance-gap-closure.md`.

Per FR without `IMPLEMENTS -> :Decision`, resolve `rationale` in priority order:

1. FR node `description` (if non-empty).
2. FR markdown at `markdown_path` — the `## Feature Description` section, plus the
   `Source:` metadata line (the original `/sa-feature "..."` intent). This is real
   recorded rationale, not fabrication.
3. `git log` of the FR markdown / its UCs.
4. **None recoverable →** do NOT invent. Grandfather via `nacl-sa-flags`-style flag
   (`decision_exempt=true`, `decision_exempt_reason`, `decision_exempt_since`), which
   L9.1 skips and L9.5 surfaces as visible debt.

For a recoverable FR, write the Decision and wire it to the FR's own scope:

```cypher
// mcp__neo4j__write-cypher  (per FR; $rationale extracted from md/description; $decId = next DEC-NNN)
MATCH (fr:FeatureRequest {id: $frId})
MERGE (d:Decision {id: $decId})
SET d.title = coalesce(fr.title, $frId), d.chosen = $chosen,
    d.rationale = $rationale,                              // REQUIRED, non-empty, from project's own records
    d.context = $context, d.alternatives_considered = [],
    d.status = CASE WHEN fr.status IN ['shipped','implemented','dev-complete'] THEN 'accepted' ELSE 'accepted' END,
    d.created_at = coalesce(fr.created_at, datetime()),
    d.created_by = 'nacl-sa-finalize',
    d.source = $frId + ' (backfilled from ' + $rationaleSource + ')',   // 'description' | 'markdown' | 'git'
    d.level = 'feature'
MERGE (fr)-[:IMPLEMENTS]->(d)
WITH d, fr
MATCH (fr)-[r:INCLUDES_UC]->(uc:UseCase)
MERGE (d)-[:JUSTIFIES {role: CASE WHEN r.kind = 'new' THEN 'creates' ELSE 'shapes' END}]->(uc)
RETURN d.id;
```

Verify-before-bulk: backfill ONE FR, confirm the Decision reads honestly and
`sa-validate --scope` L9 clears for it, then batch the rest. Present a sample to
the user before the bulk write.

#### Detect implicit decisions not yet recorded

Check for architectural patterns that imply a decision worth recording:

```cypher
MATCH (m:Module) RETURN count(m) AS module_count, collect({id:m.id, name:m.name}) AS modules;
```
```cypher
MATCH (sr:SystemRole) RETURN count(sr) AS role_count, collect({id:sr.id, name:sr.name}) AS roles;
```

#### Create missing Decision nodes (with JUSTIFIES)

For each detected decision not yet in the graph, allocate `DEC-NNN`
(`max(toInteger(replace(d.id,'DEC-',''))) + 1`) and write with
`mcp__neo4j__write-cypher`, linking it to every artifact it shaped:

```cypher
MERGE (d:Decision {id: $decId})
SET d.title = $title, d.chosen = $chosen, d.rationale = $rationale,
    d.context = $context, d.alternatives_considered = $alternatives,
    d.status = 'accepted', d.created_at = coalesce(d.created_at, datetime()),
    d.created_by = 'nacl-sa-finalize', d.source = 'finalize', d.level = 'architecture'
WITH d
UNWIND $justifiesIds AS x
  MATCH (target {id: x})           // Module / DomainEntity / SystemRole / …
  MERGE (d)-[:JUSTIFIES {role:'shapes'}]->(target)
RETURN d.id;
```

#### Typical decision categories to check

1. Module decomposition rationale (`JUSTIFIES` → the Modules)
2. Domain model key decisions — entity boundaries, shared vs separate (`JUSTIFIES` → the DomainEntities)
3. Role model and authorization approach (`JUSTIFIES` → the SystemRoles)
4. Interface architecture decisions (SPA, navigation patterns)
5. Technology-specific decisions

Present each new Decision to the user for confirmation before writing. Every
Decision MUST have a non-empty `rationale` and at least one `JUSTIFIES` edge —
`nacl-sa-validate` L9 enforces this.

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

Extension-layer adoption (2.15+) — query `sa_extension_adoption` from
`graph-infra/queries/sa-queries.cypher` (three independent parts, run each):
```cypher
MATCH (uc:UseCase)
RETURN count(uc) AS total_ucs,
       count(CASE WHEN coalesce(uc.has_ui, false) THEN 1 END) AS ui_ucs,
       count(CASE WHEN EXISTS { (uc)-[:HAS_SCREEN]->(:Screen) } THEN 1 END) AS ucs_with_screens,
       count(CASE WHEN EXISTS { (uc)-[:HAS_SLICE]->(:Slice) } THEN 1 END) AS ucs_with_slices,
       count(CASE WHEN EXISTS { (uc)-[:HAS_DEGRADATION]->(:DegradationRule) } THEN 1 END) AS ucs_with_degradation;
```
```cypher
MATCH (m:Module)
RETURN count(m) AS total_modules,
       count(CASE WHEN EXISTS { (m)-[:HAS_ERROR]->(:DomainError) } THEN 1 END) AS modules_with_errors,
       count(CASE WHEN EXISTS { (m)-[:HAS_CACHE]->(:CachePolicy) } THEN 1 END) AS modules_with_cache;
```
```cypher
MATCH (fr:FeatureRequest)
RETURN count(fr) AS total_frs,
       count(CASE WHEN EXISTS { (fr)-[:IMPLEMENTS]->(:Decision) } THEN 1 END) AS frs_with_decision,
       count(CASE WHEN coalesce(fr.decision_exempt, false) THEN 1 END) AS frs_exempt;
```

FR-backfill candidates = `total_frs - frs_with_decision - frs_exempt` — when
non-zero, point the user at the FR-backfill runbook
(`nacl-tl-core/references/provenance-gap-closure.md`).
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
| Screen Machines    | {status}    | {N}%     | {N}/{N} UI-UCs (or "not adopted") |
| Behavior Slices    | {status}    | {N}%     | {N}/{N} UCs (or "not adopted")    |
| Error Taxonomy     | {status}    | {N}%     | {N}/{N} modules (or "not adopted") |
| Resilience         | {status}    | —        | {N} policies, {N} rules (or "not adopted") |
| Decision Provenance| {status}    | —        | {N} decisions; {N} FR-backfill candidates |

### Ready for Implementation?

- **Design:** {N}% -- sufficient to start development? {Yes/No}
- **Implementation:** {N}% -- all UCs detailed? {Yes/No}
- **Testing:** {N}% -- all acceptance criteria defined? {Yes/No}
```

Status mapping:
- >= 90%: "Complete"
- >= 50%: "In Progress"
- < 50%: "Needs Work"

Extension-layer rows (Screen Machines, Behavior Slices, Error Taxonomy,
Resilience, Decision Provenance) are **adoption-aware**: when the layer has
zero nodes graph-wide, render status "Not Adopted" and exclude the row from
any overall-readiness average — these layers are opt-in (2.15+), absence is
a choice, not a gap. Partial adoption (some UCs/modules covered, others not)
uses the normal percentage mapping.

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
1. {If UCs not detailed}: `/nacl-sa-uc UC-{NNN}` -- detail remaining UCs
2. {If validation not passed}: `/nacl-sa-validate full` -- fix found issues
3. {If coverage gaps}: `/nacl-sa-domain IMPORT_BA` or `/nacl-sa-uc` -- cover BA gaps
4. {If ready}: Specification ready for `/nacl-tl-plan`
```

### No file output

All data stays in the graph. To produce visual or published output, use:
- `/nacl-render` -- render any graph view as Excalidraw board
- `/nacl-publish` -- publish to Docmost

---

## Key Principle: Graph-Only

This skill does NOT:
- Read any markdown files from `docs/`
- Write any markdown files to `docs/`
- Generate `_index.md` or update `CLAUDE.md`

Everything is computed from Neo4j aggregation queries. The graph is the single source of truth.

---

## Checklist /nacl-sa-finalize

### Pre-flight
- [ ] Graph schema introspected
- [ ] Module nodes exist in graph
- [ ] Mode determined (full / module / stats-only)

### Phase 1: Statistics
- [ ] `sa_statistics_summary` executed
- [ ] Additional counts collected (enumerations, ADRs, open questions)
- [ ] UC breakdown computed (primary/secondary/detailed)
- [ ] Statistics table presented to user

### Phase 2: Glossary + Decisions (skip if stats-only)
- [ ] `sa_glossary_extract` executed
- [ ] BA GlossaryTerm cross-reference checked
- [ ] Combined glossary presented
- [ ] Existing `:Decision` nodes read; legacy `Requirement{type:'adr'}` read
- [ ] Legacy ADRs backfilled to `:Decision` (with `JUSTIFIES`, `migrated_to` set), user-confirmed
- [ ] Implicit decisions detected
- [ ] New Decision nodes confirmed with user before creation
- [ ] Decisions written to graph as `:Decision` nodes (non-empty rationale + ≥1 JUSTIFIES edge — satisfies L9)

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

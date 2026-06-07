---
name: nacl-sa-validate
model: opus
effort: high
description: |
  Validate specification consistency through Neo4j Cypher queries.
  Internal validation (L1-L13): data consistency, model connectivity, requirement completeness,
  form-domain traceability, UC-form validation, cross-module consistency, FeatureRequest consistency,
  staleness closure, decision provenance, screen state machines, behavior slices,
  domain error taxonomy, cache & degradation policies (SA-extension connectivity).
  Cross-validation BA->SA (XL6-XL9): UC coverage, entity coverage, role coverage, rule coverage.
  Use when: validate specification, check consistency, find errors, run checks, quality gate.
---

## Use with /goal

**Wrap with:** `/nacl-goal validate:module:<MOD-ID>` (tier S)

This skill is a good fit for autonomous `/goal` loops because all checks are read-only Cypher queries whose results are deterministic: the check script queries the same Neo4j graph and counts zero-row (PASS) vs non-zero-row (FAIL) outcomes for each L1–L13 and XL6–XL9 check. The wrapper composes a completion condition that all enabled checks return zero findings.

**Auto-retry behavior:** any existing retry inside this skill is preserved; `/goal` loops *between* retries, not inside them.

**Check script:** `nacl-goal/checks/validate.sh`
**Refusals:** see `nacl-goal/refusal-catalog.md` for the gates this wrapper guards.
**Background:** `docs/guides/goal-command.md`

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
| `level` | `internal` | L1-L13: SA-internal consistency checks (incl. L8 staleness, L9 decision provenance, L10 screen state machines, L11 behavior slices, L12 domain error taxonomy, L13 cache & degradation policies) |
| | `ba-cross` | XL6-XL9: BA-to-SA cross-layer coverage |
| | `full` (default) | All levels: L1-L13 + XL6-XL9 |
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
          +---------+---------+            |
          |  L7: FeatureReq   |            |
          |  Consistency      |            |
          +---------+---------+            |
                    |                      |
          +---------+---------+            |
          |  L8: Staleness    |            |
          |  Closure          |            |
          +---------+---------+            |
                    |                      |
          +---------+---------+            |
          |  L9: Decision     |            |
          |  Provenance       |            |
          +---------+---------+            |
                    |                      |
          +---------+---------+            |
          |  L10: Screen      |            |
          |  State Machines   |            |
          +---------+---------+            |
                    |                      |
          +---------+---------+            |
          |  L11: Behavior    |            |
          |  Slices           |            |
          +---------+---------+            |
                    |                      |
          +---------+---------+            |
          |  L12: Domain      |            |
          |  Error Taxonomy   |            |
          +---------+---------+            |
                    |                      |
          +---------+---------+            |
          |  L13: Cache &     |            |
          |  Degradation      |            |
          +---------+---------+            |
                    |                      |
                    +----------+-----------+
                               |
                    +----------+-----------+
                    |  GENERATE REPORT     |
                    +----------------------+
```

---

## Schema Reference

This skill assumes the **canonical SA schema** as defined in `graph-infra/schema/sa-schema.cypher` and produced by:

- `/nacl-sa-architect` -- writes `:Module`, `:Component`, edge `(:Module)-[:CONTAINS_UC]->(:UseCase)`, `(:Module)-[:CONTAINS_ENTITY]->(:DomainEntity)`
- `/nacl-sa-domain` -- writes `:DomainEntity`, `:DomainAttribute`, `:Enumeration`, `:EnumValue` (with `.value` property)
- `/nacl-sa-uc` -- writes `:UseCase`, `:Requirement`, `:Form`, `:FormField`, `:ActivityStep`; `slices` command writes `:Slice` with edges `HAS_SLICE`, `COVERS`, `CALLS`, `VERIFIED_BY` (see `graph-infra/schema/sa-schema.cypher` § 3-ter; note the `CALLS` name is shared with `ScreenEffect→APIEndpoint` — every L11 query label-qualifies the source as `(sl:Slice)`); `errors` command writes `:DomainError`, `:ErrorPresentation` with edges `HAS_ERROR`, `MAY_RAISE`, `HANDLES`, `PRESENTED_AS`, `SHOWS` (see § 3-quater; all five names are unshared — no label-qualification hazard); `resilience` command writes `:CachePolicy`, `:DegradationRule` with edges `HAS_CACHE`, `CACHES`, `HAS_DEGRADATION`, `ON_ERROR`, `DEGRADES_TO` (see § 3-quinquies; all five names again unshared)
- `/nacl-sa-roles` -- writes `:SystemRole`
- `/nacl-sa-ui` -- writes `:Component`, `:FormField`; `state-machine` command writes `:Screen`, `:ScreenState`, `:ScreenEvent`, `:Transition`, `:ScreenEffect`, `:AnalyticsEvent` with edges `HAS_SCREEN`, `RENDERS`, `HAS_STATE`, `HAS_EVENT`, `HAS_TRANSITION`, `FROM_STATE`, `TO_STATE`, `ON_EVENT`, `TRIGGERS`, `CALLS`, `NAVIGATES_TO`, `EMITS` (see `graph-infra/schema/sa-schema.cypher` § 3-bis; note `HAS_STATE`/`TRIGGERS` names are shared with the BA layer — every L10 query is label-qualified)
- BA->SA handoff edges (canonical names): `AUTOMATES_AS`, `REALIZED_AS`, `IMPLEMENTED_BY`, `MAPPED_TO`, `TYPED_AS`, `SUGGESTS`
- Provenance (canonical names, written by `/nacl-sa-feature`, `/nacl-tl-fix`, `/nacl-sa-finalize`): `:Decision` node, edges `(:Decision)-[:JUSTIFIES]->(...)`, `(:Decision)-[:SUPERSEDES]->(:Decision)`, `(:FeatureRequest)-[:IMPLEMENTS]->(:Decision)`
- Staleness properties (set by `/nacl-sa-feature`, `/nacl-tl-fix`): `review_status`, `stale_reason`, `stale_since`, `stale_origin` — read with `coalesce(n.review_status,'current')`.
- Stereotype on automated steps: `WorkflowStep.stereotype = 'Автоматизируется'` (Russian) or `'Automated'` (English) -- both accepted.

**Non-canonical aliases are NOT supported.** If the graph uses any of these, validation will HALT in pre-flight (Step 0a) instead of producing false-positive criticals:

| Non-canonical | Canonical |
|---------------|-----------|
| `:SAModule` | `:Module` |
| `:SAEntity` | `:DomainEntity` |
| `:SARequirement` | `:Requirement` |
| `:SAActor` | `:SystemRole` |
| `:SAComponent` | `:Component` |
| edge `TRACES_TO` | use `AUTOMATES_AS` / `REALIZED_AS` / `IMPLEMENTED_BY` / `MAPPED_TO` per source-target semantics |

If your graph uses non-canonical labels, see the **Migration Cypher Appendix** at the bottom of this skill, or re-import the SA layer using canonical skills.

---

## Pre-flight Checks

### Step 0: Verify graph has data

Before running any validation, confirm that the graph contains SA-layer nodes under canonical labels.

```cypher
// Pre-flight: count canonical SA-layer nodes
MATCH (n)
WHERE n:Module OR n:UseCase OR n:DomainEntity OR n:Form OR n:Requirement OR n:SystemRole
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label
```

**If the result is empty or all counts are 0:**
1. STOP -- validation is impossible without data in the graph.
2. Suggest the user runs `/nacl-sa-architect` or `/nacl-sa-domain` first.
3. Explain that `/nacl-sa-validate` works only with a populated Neo4j graph.

### Step 0a: Detect schema drift (CRITICAL gate)

If canonical SA labels are absent but non-canonical aliases exist (e.g. `:SAModule`, `:SAEntity`, `:SARequirement`), the validator's queries silently return zero rows and produce **false-positive CRITICAL findings** for every L2-L9 / XL6-XL9 check. This step catches that scenario explicitly.

```cypher
// Step 0a: schema-drift detection
CALL db.labels() YIELD label
WITH collect(label) AS allLabels
RETURN
  [l IN allLabels WHERE l IN
     ['Module','DomainEntity','Requirement','SystemRole','Component']] AS canonical_present,
  [l IN allLabels WHERE l IN
     ['SAModule','SAEntity','SARequirement','SAActor','SAComponent']] AS dialect_present,
  [l IN allLabels WHERE l STARTS WITH 'SA' AND l <> 'SystemRole'] AS sa_prefixed_labels,
  allLabels AS all_labels_in_graph
```

Also probe for non-canonical edge types that signal drift in BA->SA handoff:

```cypher
// Step 0a (cont.): probe non-canonical edge types
CALL db.relationshipTypes() YIELD relationshipType
WITH collect(relationshipType) AS allEdges
RETURN
  [r IN allEdges WHERE r IN
     ['AUTOMATES_AS','REALIZED_AS','IMPLEMENTED_BY','MAPPED_TO','TYPED_AS','SUGGESTS']]
       AS canonical_handoff_edges,
  [r IN allEdges WHERE r IN ['TRACES_TO','REALIZES','MAPS_FROM']] AS dialect_handoff_edges
```

**Decision rule:**

| Condition | Action |
|-----------|--------|
| `canonical_present` non-empty AND `dialect_present` empty | OK -- continue to Step 0b |
| `canonical_present` empty AND `dialect_present` non-empty | **HALT** -- emit drift report below; do NOT run any L*/XL* checks |
| Both non-empty | **HALT** -- mixed schema is worse than pure dialect; emit drift report; do NOT run checks |
| `dialect_handoff_edges` non-empty AND no canonical handoff edges | **HALT** -- BA->SA layer uses non-canonical edges; emit drift report |

**Drift report template (emit verbatim, fill placeholders from query results):**

```
==============================================================================
SCHEMA DRIFT DETECTED -- VALIDATION HALTED
==============================================================================

The graph uses non-canonical labels/edges that this skill does not support.

  Canonical labels found    : {canonical_present}
  Non-canonical labels found: {dialect_present}
  All SA-prefixed labels    : {sa_prefixed_labels}
  Canonical handoff edges   : {canonical_handoff_edges}
  Non-canonical handoff edges: {dialect_handoff_edges}

The skill expects the canonical SA schema (see "Schema Reference" section above).
Running validation queries against this graph would silently miss every node and
produce false-positive CRITICAL findings.

To proceed, choose ONE:

  1. Migrate the graph to canonical labels & edges.
     See the "Migration Cypher Appendix" at the bottom of this skill --
     copy the block, run it via mcp__neo4j__write-cypher, then re-run
     /nacl-sa-validate. The migration is idempotent.

  2. Re-import the SA layer using canonical skills:
       /nacl-sa-architect   (creates :Module + structural skeleton)
       /nacl-sa-domain      (creates :DomainEntity, :Enumeration)
       /nacl-sa-uc          (creates :UseCase, :Requirement, :Form, :FormField)
       /nacl-sa-roles       (creates :SystemRole)
       /nacl-ba-handoff     (creates BA->SA handoff edges)

DO NOT proceed with validation. Halt here, surface this report to the user,
and wait for instruction.
==============================================================================
```

### Step 0b: Pre-flight node-count report (two sections)

Once Step 0a has confirmed the graph is canonical, render a two-section node-count report. The first section is canonical labels; the second surfaces any unexpected labels that didn't trigger HALT but are still worth flagging (e.g. typos, custom labels).

```cypher
// Step 0b: canonical SA-layer node counts
// (keep in sync with the Schema Reference above: every label a producer skill
//  writes and every L-level anchors on belongs here — L10 added Screen*, L11
//  Slice, L12 DomainError/ErrorPresentation, L13 CachePolicy/DegradationRule,
//  L8/L9 Decision. A future L14+ MUST extend this list in the same commit.)
UNWIND ['Module','UseCase','DomainEntity','DomainAttribute','Enumeration','EnumValue',
        'Form','FormField','Requirement','SystemRole','Component','ActivityStep',
        'FeatureRequest','Screen','ScreenState','ScreenEvent','Transition',
        'ScreenEffect','AnalyticsEvent','Slice','Decision','APIEndpoint',
        'DomainError','ErrorPresentation','CachePolicy','DegradationRule'] AS labelName
CALL {
  WITH labelName
  MATCH (n) WHERE labelName IN labels(n)
  RETURN count(n) AS cnt
}
RETURN labelName AS label, cnt AS count
ORDER BY labelName
```

```cypher
// Step 0b (cont.): non-canonical labels still present in graph
// The NOT IN list = canonical SA labels + known neighbor-layer labels that are
// legitimate on a shared graph and must NOT be reported as drift:
//   BA family  — BusinessProcess..DataFlow, EntityState, GlossaryTerm, SystemContext
//   TL family  — Task, Wave, IntakeItem (written by tl-plan / tl-intake)
//   legacy SA  — RuntimeContract (flat-format runtime contracts)
// `cnt > 0` filters constraint-registered label tokens with zero nodes — those
// are schema residue, not findings.
CALL db.labels() YIELD label
WITH label
WHERE NOT label IN
   ['Module','UseCase','DomainEntity','DomainAttribute','Enumeration','EnumValue',
    'Form','FormField','Requirement','SystemRole','Component','ActivityStep',
    'FeatureRequest','Screen','ScreenState','ScreenEvent','Transition','ScreenEffect',
    'AnalyticsEvent','Slice','Decision','APIEndpoint','DomainError','ErrorPresentation',
    'CachePolicy','DegradationRule','BusinessProcess','WorkflowStep','BusinessEntity','BusinessRole',
    'BusinessRule','EntityAttribute','ProcessGroup','Term','Glossary','Stakeholder',
    'ExternalEntity','Document','DataFlow','EntityState','GlossaryTerm','SystemContext',
    'Task','Wave','IntakeItem','RuntimeContract']
CALL {
  WITH label
  MATCH (n) WHERE label IN labels(n)
  RETURN count(n) AS cnt
}
WITH label, cnt
WHERE cnt > 0
RETURN label, cnt AS count
ORDER BY label
```

Render in the report header as:

```
Pre-flight node counts:

Canonical SA labels:
  Module          : 4
  DomainEntity    : 15
  Requirement     : 29
  UseCase         : 24
  Form            : 14
  ...

Non-canonical labels detected (informational):
  (none, or list with "<-- review" hint)
```

### Step 0c: Verify BA layer exists (for ba-cross / full)

```cypher
// Pre-flight: count BA-layer nodes
MATCH (n)
WHERE n:BusinessProcess OR n:WorkflowStep OR n:BusinessEntity OR n:BusinessRole OR n:BusinessRule
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label
```

**If the result is empty:**
- `level=ba-cross` --> STOP, report that BA layer is not populated. User must run `/nacl-ba-import-doc` or `/nacl-ba-from-board` first.
- `level=full` --> Run only L1-L13 (internal), skip XL6-XL9 with a WARNING in the report.

### Step 0d: Verify exemption properties are populated

Before running checks, confirm that exemption properties exist in the graph. Include this table
in the report header so the user can see which properties are set and which are missing.

```cypher
// Pre-flight: exemption property coverage
MATCH (ff:FormField)
WITH count(ff) AS total,
     sum(CASE WHEN ff.field_category IS NOT NULL THEN 1 ELSE 0 END) AS has_prop
RETURN 'FormField.field_category' AS property, total, has_prop, total - has_prop AS missing
UNION ALL
MATCH (uc:UseCase)
WITH count(uc) AS total,
     sum(CASE WHEN uc.has_ui IS NOT NULL THEN 1 ELSE 0 END) AS has_prop
RETURN 'UseCase.has_ui' AS property, total, has_prop, total - has_prop AS missing
UNION ALL
MATCH (de:DomainEntity)
WITH count(de) AS total,
     sum(CASE WHEN de.shared IS NOT NULL THEN 1 ELSE 0 END) AS has_prop
RETURN 'DomainEntity.shared' AS property, total, has_prop, total - has_prop AS missing
UNION ALL
MATCH (sr:SystemRole)
WITH count(sr) AS total,
     sum(CASE WHEN sr.system_only IS NOT NULL THEN 1 ELSE 0 END) AS has_prop
RETURN 'SystemRole.system_only' AS property, total, has_prop, total - has_prop AS missing
```

If `missing` is high for any property, the exemption filters in L4-L6/XL8 will treat those nodes
as non-exempt (defaulting to the strict check). This is correct behavior -- it means the SA skills
haven't classified those nodes yet.

**To backfill missing exemption properties**, use `/nacl-sa-flags`:

```
/nacl-sa-flags audit                           # confirm scope
/nacl-sa-flags backfill-all --detect-internal  # write safe defaults
/nacl-sa-validate full                         # re-run validation
```

`nacl-sa-flags` is the canonical orchestrator-tier skill for setting validation-only metadata. It writes only `has_ui`, `system_only`, `shared`, `internal`, `field_category` -- no domain semantics. After `nacl-migrate-sa` it is invoked automatically; after manual graph edits or skill-version upgrades, run it explicitly.

---

## Severity Levels

Every detected problem is assigned a severity:

| Severity | Meaning | Report threshold |
|----------|---------|------------------|
| **CRITICAL** | Specification is broken; blocks downstream work | Any CRITICAL --> overall FAIL |
| **WARNING** | Inconsistency that should be fixed but is not blocking | 5+ WARNINGs --> overall WARN |
| **INFO** | Observation, optional improvement | Does not affect overall status |

---

## Validation Levels -- Internal (L1-L13)

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

Canonical writer (`/nacl-sa-domain`) populates `EnumValue.value`. Some legacy or hand-written graphs may use `.code` or `.label` instead. To avoid false positives, this check coalesces all three property names; if none yields a non-empty string, the value is considered empty.

```cypher
// L1.4 -- Severity: WARNING
// Enumerations with duplicate or empty values (tolerant: .value | .code | .label)
MATCH (e:Enumeration)-[:HAS_VALUE]->(ev:EnumValue)
WITH e, coalesce(ev.value, ev.code, ev.label) AS val, count(*) AS cnt
WHERE cnt > 1 OR val IS NULL OR trim(val) = ''
RETURN e.name AS enumeration, e.id AS enum_id,
       coalesce(val, '<EMPTY>') AS value, cnt AS occurrences,
       CASE WHEN val IS NULL OR trim(val) = '' THEN 'Empty enum value'
            ELSE 'Duplicate enum value' END AS problem
```

#### Check 1.5: Enumeration value-property convention (informational)

Reports which property name carries the actual enum value. Run this once during pre-flight or in the report header so the user can spot drift early.

```cypher
// L1.5 -- Severity: INFO
// Distribution of EnumValue value-property convention
MATCH (ev:EnumValue)
WITH count(ev) AS total,
     sum(CASE WHEN ev.value IS NOT NULL AND trim(toString(ev.value)) <> '' THEN 1 ELSE 0 END) AS with_value,
     sum(CASE WHEN ev.code  IS NOT NULL AND trim(toString(ev.code))  <> '' THEN 1 ELSE 0 END) AS with_code,
     sum(CASE WHEN ev.label IS NOT NULL AND trim(toString(ev.label)) <> '' THEN 1 ELSE 0 END) AS with_label
RETURN total, with_value, with_code, with_label,
       CASE
         WHEN with_value = total THEN 'canonical (.value)'
         WHEN with_code  = total THEN 'drift (.code only) -- consider migrating to .value'
         WHEN with_label = total THEN 'drift (.label only) -- consider migrating to .value'
         WHEN with_value > 0 AND (with_code > 0 OR with_label > 0) THEN 'mixed -- some EnumValues use .value, others use .code/.label'
         WHEN total = 0 THEN 'no EnumValues in graph'
         ELSE 'broken -- no EnumValue carries a recognized value property'
       END AS convention
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

#### Check 3.5: ActivitySteps with empty/missing actor

Every ActivityStep must carry an `actor` property (`User` or `System`) so the
activity-diagram renderer can distribute steps across swimlanes. A missing actor
collapses the diagram to a single lane and hides the User/System separation.

```cypher
// L3.5 -- Severity: CRITICAL
// ActivitySteps with empty/missing actor (CRITICAL)
MATCH (uc:UseCase)-[:HAS_STEP]->(s:ActivityStep)
WHERE s.actor IS NULL OR s.actor = ''
RETURN uc.id AS uc_id,
       count(s) AS empty_actor_steps,
       'ActivityStep.actor empty — diagram will render single-lane' AS problem
ORDER BY empty_actor_steps DESC
```

#### Check 3.6: Non-canonical actor values on ActivityStep

The renderer expects exactly `User` or `System` (case-sensitive). Values such as
`admin`, `system`, `authenticated`, or `Admin` are silently ignored and produce
the same degraded single-lane output as a missing actor.

```cypher
// L3.6 -- Severity: WARNING
// Non-canonical actor values (WARNING)
MATCH (uc:UseCase)-[:HAS_STEP]->(s:ActivityStep)
WHERE s.actor IS NOT NULL AND s.actor <> '' AND NOT s.actor IN ['User', 'System']
RETURN uc.id AS uc_id, s.id AS step_id, s.actor AS actor_value,
       'Non-canonical actor value (renderer expects User|System exactly)' AS problem
```

---

### CRITICAL: Mandatory Exemption Filters

Checks L4–L6 and XL8 contain WHERE filters that exempt nodes with specific properties.
These filters MUST be included verbatim in every query — omitting them causes false positives
that cannot be fixed by any SA skill (the data is correct, the query is wrong).

| Check | Mandatory filter | Purpose |
|-------|-----------------|---------|
| L4.1 | `AND coalesce(ff.field_category, 'input') = 'input'` | Exempt display/action fields from MAPS_TO requirement |
| L5.1 | `AND coalesce(uc.has_ui, true) = true` | Exempt backend-only UCs from form requirement |
| L5.4 | `WHERE mapped_fields = 0 AND input_fields > 0` | Exempt forms with only display/action fields |
| L6.1 | `AND coalesce(de.shared, false) = false` | Exempt intentionally shared cross-module entities |
| L7.2 | `AND fr.legacy_origin IS NULL` | Exempt FR tombstones (renamed legacy nodes preserved for traceability) |
| L7.4 | `WHERE fr.legacy_origin IS NULL` | Exempt FR tombstones (same reason as L7.2) |
| L7.6 | `AND NOT n.id STARTS WITH 'FR-LEG-'` | Exempt all tombstone namespaces from cross-label collision check |
| L9.1 | `AND coalesce(fr.decision_exempt, false) = false` | Exempt grandfathered pre-provenance FRs (rationale unrecoverable at gap-closure; see provenance-gap-closure runbook) |
| L10.2 | `AND coalesce(scr.formless, false) = false` | Exempt screens that render no Form (splash, 404) from the RENDERS requirement |
| L10.6 | `AND coalesce(st.terminal, false) = false` | Exempt intentionally terminal error states from the escape-transition requirement |
| XL8.2 | `AND coalesce(sr.system_only, false) = false` | Exempt infrastructure-only roles |

L11 has **no exemption properties by design**: an anchorless Slice (L11.2) is not an exemptible
state — behavior text with no graph anchor belongs in `UseCase.acceptance_criteria`, not in a node.

L12 likewise has **no exemption properties by design**: an unraisable DomainError (L12.2) is not
an exemptible state — a failure mode observable at no API surface is an implementation detail and
belongs in Requirements / RuntimeContract notes, not in a node; an unshown ErrorPresentation is
dead text. Deliberate UI silence is modeled as a `silent`-kind presentation, not as an exemption.

L13 likewise has **no exemption properties by design**: a CachePolicy that caches no surface
(L13.2) is dead vocabulary — a caching intention with no data surface belongs in Requirements,
not in a node; a DegradationRule with neither an ON_ERROR failure mode nor a DEGRADES_TO state
is prose change propagation can never reach (the L11.2 argument verbatim).

If executing via HTTP API (curl) instead of MCP tools, copy queries CHARACTER-FOR-CHARACTER
from the code blocks below. Do NOT simplify, rephrase, or omit WHERE clauses.

---

### Level 4: Form-Domain Traceability

**Goal:** Every FormField should map to a DomainAttribute; every DomainAttribute should be reachable from at least one form (or marked internal).

#### Check 4.1: FormFields without MAPS_TO edge

```cypher
// L4.1 -- Severity: CRITICAL
// FormFields that have no MAPS_TO edge to a DomainAttribute
// Only input fields require MAPS_TO; display and action fields are exempt
MATCH (f:Form)-[:HAS_FIELD]->(ff:FormField)
WHERE NOT (ff)-[:MAPS_TO]->(:DomainAttribute)
  AND coalesce(ff.field_category, 'input') = 'input'  -- REQUIRED FILTER: exempt display/action
RETURN f.name AS form_name, f.id AS form_id,
       ff.name AS field_name, ff.id AS field_id,
       ff.field_type AS field_type, ff.field_category AS field_category,
       ff.label AS label,
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
// Backend-only UCs (has_ui=false) are exempt
MATCH (uc:UseCase)-[:HAS_STEP]->(:ActivityStep)
WHERE NOT (uc)-[:USES_FORM]->(:Form)
  AND coalesce(uc.has_ui, true) = true  -- REQUIRED FILTER: exempt backend-only UCs
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
// UC -> Form where none of the input fields have MAPS_TO edges
// Forms with only display/action fields are exempt (no input fields to map)
MATCH (uc:UseCase)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
WITH uc, f, count(ff) AS total_fields,
     sum(CASE WHEN coalesce(ff.field_category, 'input') = 'input' THEN 1 ELSE 0 END) AS input_fields,
     sum(CASE WHEN (ff)-[:MAPS_TO]->(:DomainAttribute) THEN 1 ELSE 0 END) AS mapped_fields
WHERE mapped_fields = 0 AND input_fields > 0  -- REQUIRED FILTER: exempt display-only forms
RETURN uc.id AS uc_id, uc.name AS uc_name,
       f.id AS form_id, f.name AS form_name,
       total_fields, input_fields,
       'Form used by UC has input fields but zero mapped -- no domain traceability' AS problem
```

---

### Level 6: Cross-Module Consistency

**Goal:** Shared entities, terminology, and UC numbering are consistent across modules.

#### Check 6.1: DomainEntity referenced by multiple modules with inconsistent attributes

```cypher
// L6.1 -- Severity: WARNING
// Entities belonging to multiple modules (via CONTAINS_ENTITY) -- potential shared entity conflict
// Entities marked shared=true are intentionally shared and exempt
MATCH (m:Module)-[:CONTAINS_ENTITY]->(de:DomainEntity)
WITH de, collect(m.name) AS modules, count(m) AS module_count
WHERE module_count > 1 AND coalesce(de.shared, false) = false  -- REQUIRED FILTER: exempt shared entities
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

### Level 7: FeatureRequest Consistency

**Goal:** The FR-id namespace is consistent across three sources — `.tl/feature-requests/*.md` files, `:FeatureRequest` nodes, and any other node label that historically used FR-NNN ids (e.g. `:Task`). Without these checks, downstream skills (`nacl-tl-conductor`, `nacl-tl-plan --feature`, `nacl-tl-full --feature`) silently fall back to parsing markdown and lose graph-based scope resolution, or worse — route to the wrong node when the same id exists under multiple labels.

**Checks:**
- **L7.1** — markdown FR exists on disk but no `:FeatureRequest` node in graph (CRITICAL)
- **L7.2** — `:FeatureRequest` node has no `INCLUDES_UC` edge (CRITICAL; tombstones exempt)
- **L7.3** — `INCLUDES_UC` edge has unexpected `kind` value (WARNING)
- **L7.4** — `:FeatureRequest` references missing `:UseCase` (CRITICAL; tombstones exempt)
- **L7.5** — duplicate FR-NNN markdown files on disk (CRITICAL; filesystem check, not Cypher)
- **L7.6** — FR-NNN id reused across multiple node labels in active namespace (CRITICAL)

**How to obtain `$fileFrIds`:** before running L7.1, list FR ids from disk with a shell helper (`ls .tl/feature-requests/FR-*.md` → strip prefix/suffix to get `FR-NNN`). Pass the list as `$fileFrIds` parameter to the Cypher below.

#### Check 7.1: FR markdown without FeatureRequest node in graph

```cypher
// L7.1 -- Severity: CRITICAL
// Every FR-NNN.md on disk must have a :FeatureRequest node in Neo4j.
// Backfill via Step 6.2bis of nacl-sa-feature.
UNWIND $fileFrIds AS frId
OPTIONAL MATCH (fr:FeatureRequest {id: frId})
WITH frId, fr
WHERE fr IS NULL
RETURN frId AS missing_fr_id,
       'FR markdown exists on disk but no :FeatureRequest node in graph' AS problem
```

#### Check 7.2: FeatureRequest nodes with no INCLUDES_UC

Active FeatureRequest nodes must scope at least one UseCase via INCLUDES_UC, otherwise downstream planning has nothing to consume. **Tombstones** (renamed legacy nodes preserved for historical traceability) are exempt — they keep their original edges (`GENERATES`, `REFINED_AS`, `EXTENDS`, `DERIVED_FROM`) instead of `INCLUDES_UC`. Tombstones are identified by the `legacy_origin` property, set automatically by `nacl-sa-feature` when renaming a node out of the active id-namespace.

```cypher
// L7.2 -- Severity: CRITICAL
// FeatureRequest nodes that scope zero UCs are useless for downstream planning.
// Tombstones (legacy_origin IS NOT NULL) are exempt — they use legacy edges, not INCLUDES_UC.
MATCH (fr:FeatureRequest)
WHERE NOT (fr)-[:INCLUDES_UC]->(:UseCase)
  AND fr.legacy_origin IS NULL  -- REQUIRED FILTER: exempt tombstones
RETURN fr.id AS fr_id, fr.status AS status,
       'FeatureRequest has no INCLUDES_UC -> UseCase' AS problem
```

#### Check 7.3: INCLUDES_UC edges with kind not in {new, modified}

```cypher
// L7.3 -- Severity: WARNING
// nacl-sa-feature writes kind='new'|'modified'. Other values indicate manual drift.
MATCH (fr:FeatureRequest)-[r:INCLUDES_UC]->(uc:UseCase)
WHERE NOT coalesce(r.kind, 'unknown') IN ['new', 'modified']
RETURN fr.id AS fr_id, uc.id AS uc_id, r.kind AS kind,
       'INCLUDES_UC edge has unexpected kind property' AS problem
```

#### Check 7.4: FeatureRequest references missing UseCase

```cypher
// L7.4 -- Severity: CRITICAL
// Integrity check: INCLUDES_UC must point to an existing UseCase.
// (Neo4j MERGE on missing UC silently no-ops, so an FR can end up with zero UCs.)
// Tombstones (legacy_origin IS NOT NULL) are exempt -- they use legacy edges.
MATCH (fr:FeatureRequest)
WHERE fr.legacy_origin IS NULL  -- REQUIRED FILTER: exempt tombstones
OPTIONAL MATCH (fr)-[:INCLUDES_UC]->(uc:UseCase)
WITH fr, count(uc) AS uc_count
WHERE uc_count = 0
RETURN fr.id AS fr_id, 'FeatureRequest stored, but INCLUDES_UC matched no UseCase (likely UC ids did not exist at write time)' AS problem
```

#### Check 7.5: Duplicate FR-NNN markdown files on disk

This check is **filesystem-level** (not Cypher) — it detects two or more `.tl/feature-requests/FR-NNN-*.md` files sharing the same `FR-NNN` prefix. Such duplicates mean the FR-id was reused for two different features without renumbering, producing the same kind of confusion that `tl-conductor --feature FR-NNN` resolves to a coin-flip artifact.

**How to run** (bash, in project root):

```bash
ls .tl/feature-requests/FR-*.md 2>/dev/null \
  | sed -E 's|.*/(FR-[A-Za-z0-9-]+?-[0-9]+).*\.md$|\1|' \
  | sort \
  | uniq -d
```

**Severity: CRITICAL**. Any output (one fr_id per line) is a violation. Resolution: rename the duplicate file to a free FR-id (use Step 6.1 allocation algorithm in `nacl-sa-feature`), then backfill its `:FeatureRequest` graph node. Don't merge the two markdowns — they describe genuinely different features.

#### Check 7.6: FR-NNN id used by multiple node labels (cross-label collision)

A single `FR-NNN` value should belong to **at most one** node label across the graph. Historically some projects used `FR-NNN` simultaneously for `:Task` (intake-pipeline ticket) and `:FeatureRequest` (refined spec). The two coexisted via different labels but caused real confusion: `tl-plan --feature FR-007` could resolve either node depending on the query. Tombstones rename their ids out of this namespace (`FR-LEG-*`, `FR-LEG-INTAKE-*`), but ad-hoc collisions still occur when an FR allocator forgets to scan all labels.

```cypher
// L7.6 -- Severity: CRITICAL
// FR-id reuse across labels in the active namespace (excluding LEG tombstones).
MATCH (n)
WHERE n.id IS NOT NULL
  AND n.id =~ 'FR-([A-Za-z]+-)?[0-9]+'
  AND NOT n.id STARTS WITH 'FR-LEG-'
WITH n.id AS fr_id, collect(DISTINCT labels(n)[0]) AS labels_seen
WHERE size(labels_seen) > 1
RETURN fr_id, labels_seen,
       'FR-id used by multiple labels — only :FeatureRequest is canonical for active namespace' AS problem
ORDER BY fr_id
```

Resolution: rename the non-`:FeatureRequest` node into a tombstone namespace (e.g. `:Task {id: 'FR-LEG-INTAKE-007'}`) preserving all its edges via `SET n.id = ...`. Never delete — the historical lineage may be referenced by other artifacts.

---

### Level 8: Staleness Closure

**Goal:** When an upstream node changes, write-skills run `sa_impact_closure` and stamp the snapshot-bearing dependents (`Task`, `UseCase`, `Form`, `Requirement`) with `review_status='stale'`. A node left `stale` is an un-reviewed downstream of a change. This level is the read-only gate that surfaces them; closure skills (`nacl-tl-release`, `nacl-tl-conductor`, `nacl-tl-deliver`) refuse while any remain. The flag is read with `coalesce(n.review_status,'current')`, so a graph that has never been stamped passes cleanly (every node is implicitly `current`).

This level writes nothing — it reads the flag that the producers set.

#### Check 8.1: Stale nodes not yet reviewed (project-wide)

```cypher
// L8.1 -- Severity: CRITICAL
// Any node still marked stale is a downstream of an upstream change that has not
// been re-synced. stale_origin/stale_since are the lineage answer ("why / since when").
MATCH (n)
WHERE coalesce(n.review_status, 'current') = 'stale'
RETURN labels(n)[0] AS node_type, n.id AS id,
       coalesce(n.name, n.title, n.description) AS display,
       n.stale_origin AS caused_by, n.stale_reason AS reason, n.stale_since AS since,
       'Node is stale (downstream of an upstream change) and not yet reviewed' AS problem
ORDER BY n.stale_since
```

#### Check 8.2: Stale closure of a single change (scoped, `--scope=intra-uc`)

Used by `nacl-sa-feature` Phase 4 after a change, to confirm the just-modified node's dependent set was cleared. Composes with `sa_impact_closure`.

```cypher
// L8.2 -- Severity: CRITICAL (scoped)
// Params: $changedNodeId — the node that was just changed.
// Only the dependents of $changedNodeId that are still stale.
MATCH (changed {id: $changedNodeId})
MATCH (changed)-[:HAS_ATTRIBUTE|MAPS_TO|HAS_FIELD|USES_FORM|HAS_STEP|HAS_REQUIREMENT
       |ACTOR|CONTAINS_UC|CONTAINS_ENTITY|GENERATES|INCLUDES_UC
       |EXPOSES|IMPLEMENTS|DEPENDS_ON*1..6]-(dep)
WHERE coalesce(dep.review_status, 'current') = 'stale'
RETURN DISTINCT dep.id AS id, labels(dep)[0] AS node_type,
       dep.stale_origin AS caused_by, dep.stale_reason AS reason,
       'Dependent of changed node is still stale' AS problem
```

---

### Level 9: Decision Provenance

**Goal:** Every structural change records *why* it was made, graph-natively, as a `:Decision` node linked to the artifacts it shaped — so "why was this decided, a year later" is the `sa_decisions_for_node` / `sa_timeline_of_why` query, not git archaeology. This is the **calibrated** gate: it bites on features (an active `FeatureRequest` with no linked `Decision`) and on malformed decisions, but it does NOT add a fix-time gate — `nacl-tl-fix` L2/L3 fixes are already forced to record a `Decision` inside the spec-first commit by the existing Step 6.SF detector.

Rationale lives in the graph, never in standalone Markdown: the FR markdown file is a rendered projection, the `:Decision` node and its `JUSTIFIES`/`SUPERSEDES`/`IMPLEMENTS` edges are the authority.

This level writes nothing.

#### Check 9.1: Active FeatureRequest with no linked Decision

```cypher
// L9.1 -- Severity: CRITICAL
// A structural change (new/modified UCs via an FR) landed with no recorded "why".
// Tombstones are exempt (same convention as L7.2). FRs that predate the
// provenance feature and whose rationale was unrecoverable during gap-closure
// are exempt via `decision_exempt=true` (a grandfather flag — see L9.5 and
// nacl-tl-core/references/provenance-gap-closure.md). Grandfathering is a last
// resort; the runbook backfills a real Decision wherever rationale is recoverable.
MATCH (fr:FeatureRequest)
WHERE fr.legacy_origin IS NULL
  AND coalesce(fr.status, '') <> 'tombstone'
  AND coalesce(fr.decision_exempt, false) = false  -- REQUIRED FILTER: exempt grandfathered FRs
  AND NOT (fr)-[:IMPLEMENTS]->(:Decision)
RETURN fr.id AS fr_id, fr.status AS status,
       'FeatureRequest has no IMPLEMENTS -> Decision (structural change with no recorded rationale)' AS problem
ORDER BY fr.id
```

#### Check 9.2: Decision that justifies nothing (unanchored rationale)

```cypher
// L9.2 -- Severity: CRITICAL
// A non-superseded Decision must point at >=1 artifact via JUSTIFIES, else it is
// rationale floating free of what it explains.
MATCH (d:Decision)
WHERE coalesce(d.status, '') <> 'superseded'
  AND NOT (d)-[:JUSTIFIES]->()
RETURN d.id AS dec_id, d.title AS title,
       'Decision justifies no artifact (no JUSTIFIES edge)' AS problem
ORDER BY d.id
```

#### Check 9.3: Decision with empty rationale (the "we forgot why" failure)

```cypher
// L9.3 -- Severity: CRITICAL
// The load-bearing field. A Decision with empty rationale cannot answer "why".
MATCH (d:Decision)
WHERE d.rationale IS NULL OR trim(d.rationale) = ''
RETURN d.id AS dec_id, d.title AS title,
       'Decision has empty rationale — cannot answer "why" a year later' AS problem
ORDER BY d.id
```

#### Check 9.4: Supersession hygiene (informational)

```cypher
// L9.4 -- Severity: WARNING
// A Decision pointed at by SUPERSEDES should carry status='superseded'.
MATCH (newer:Decision)-[:SUPERSEDES]->(old:Decision)
WHERE coalesce(old.status, '') <> 'superseded'
RETURN old.id AS dec_id, newer.id AS superseded_by,
       'Decision is superseded but status not set to superseded' AS problem
ORDER BY old.id
```

#### Check 9.5: Grandfathered FRs (informational — visible, not hidden)

```cypher
// L9.5 -- Severity: INFO
// FRs exempted from L9.1 via the grandfather flag. Surfaced (not hidden) so the
// provenance debt is always visible: these predate the provenance feature and
// had no recoverable rationale at gap-closure time. Aim to retire them as
// rationale surfaces. A non-zero count is acceptable but should trend to zero.
MATCH (fr:FeatureRequest)
WHERE coalesce(fr.decision_exempt, false) = true
RETURN fr.id AS fr_id, fr.decision_exempt_reason AS reason, fr.decision_exempt_since AS since,
       'Grandfathered: no recoverable rationale at gap-closure; no Decision required' AS note
ORDER BY fr.id
```

---

### Level 10: Screen State Machines (SA-Extension Connectivity)

**Goal:** Every screen state machine written by `nacl-sa-ui state-machine` is structurally sound: no orphaned extension nodes, every node anchored to its required parent and cross-layer sibling, transitions reference valid same-screen states/events, the machine is **deterministic** (no ambiguous `(from_state, on_event)` pairs), every state is **reachable** from the initial state, error states have an escape path, and load/mutate effects call real API endpoints. This is the connectivity invariant for the Screen extension: a Screen/ScreenState/ScreenEvent/Transition/ScreenEffect/AnalyticsEvent node cannot silently orphan.

A graph with **zero** Screen nodes passes L10 cleanly (all checks match on the new labels only) — projects that have not adopted screen state machines are unaffected.

**Label-qualify everything:** `HAS_STATE` and `TRIGGERS` edge-type names are shared with the BA layer (`BusinessEntity→EntityState`, `BusinessProcess→BusinessProcess`), and `NAVIGATES_TO` pre-exists in some graphs as Form→Form / Component→Form navigation. Every query below constrains node labels; never match these relationship types bare.

This level writes nothing.

#### Check 10.0: Orphaned extension nodes (mirrors L2.1)

```cypher
// L10.0 -- Severity: CRITICAL
// Screen-machine nodes with zero relationships
MATCH (n)
WHERE (n:Screen OR n:ScreenState OR n:ScreenEvent OR n:Transition
       OR n:ScreenEffect OR n:AnalyticsEvent)
  AND NOT (n)--()
RETURN labels(n)[0] AS node_type, n.id AS id,
       coalesce(n.name, n.description, '') AS display_name,
       'Completely disconnected screen-machine node (zero relationships)' AS problem
```

#### Check 10.1: Required parent per extension node (mirrors L2.2)

```cypher
// L10.1 -- Severity: CRITICAL
// Every screen-machine node must hang off its required parent
MATCH (s:Screen) WHERE NOT (:UseCase)-[:HAS_SCREEN]->(s)
RETURN 'Screen' AS node_type, s.id AS id,
       'Screen has no parent UseCase (HAS_SCREEN)' AS problem
UNION ALL
MATCH (st:ScreenState) WHERE NOT (:Screen)-[:HAS_STATE]->(st)
RETURN 'ScreenState' AS node_type, st.id AS id,
       'ScreenState has no parent Screen (HAS_STATE)' AS problem
UNION ALL
MATCH (ev:ScreenEvent) WHERE NOT (:Screen)-[:HAS_EVENT]->(ev)
RETURN 'ScreenEvent' AS node_type, ev.id AS id,
       'ScreenEvent has no parent Screen (HAS_EVENT)' AS problem
UNION ALL
MATCH (tr:Transition) WHERE NOT (:Screen)-[:HAS_TRANSITION]->(tr)
RETURN 'Transition' AS node_type, tr.id AS id,
       'Transition has no parent Screen (HAS_TRANSITION)' AS problem
UNION ALL
MATCH (eff:ScreenEffect) WHERE NOT (:Transition)-[:TRIGGERS]->(eff)
RETURN 'ScreenEffect' AS node_type, eff.id AS id,
       'ScreenEffect has no parent Transition (TRIGGERS)' AS problem
UNION ALL
MATCH (ae:AnalyticsEvent) WHERE NOT (:ScreenEffect)-[:EMITS]->(ae)
RETURN 'AnalyticsEvent' AS node_type, ae.id AS id,
       'AnalyticsEvent has no inbound EMITS from any ScreenEffect' AS problem
```

#### Check 10.2: Required cross-layer / sibling edge

`RENDERS` is the bridge that makes a DomainAttribute change reach the screen (`DA ← MAPS_TO ← FormField ← HAS_FIELD ← Form ← RENDERS ← Screen`); without it the screen is invisible to impact analysis. Effects must point at their kind-specific target.

```cypher
// L10.2 -- Severity: CRITICAL
// Screen without RENDERS -> Form; effect without its kind-required target.
// Screens marked formless=true (splash, 404) are exempt from RENDERS.
MATCH (scr:Screen)
WHERE NOT (scr)-[:RENDERS]->(:Form)
  AND coalesce(scr.formless, false) = false  -- REQUIRED FILTER: exempt formless screens
RETURN 'Screen' AS node_type, scr.id AS id,
       'Screen has no RENDERS -> Form (domain changes cannot reach it)' AS problem
UNION ALL
MATCH (eff:ScreenEffect)
WHERE eff.effect_kind IN ['load', 'mutate']
  AND NOT (eff)-[:CALLS]->(:APIEndpoint)
RETURN 'ScreenEffect' AS node_type, eff.id AS id,
       'load/mutate effect has no CALLS -> APIEndpoint' AS problem
UNION ALL
MATCH (eff:ScreenEffect)
WHERE eff.effect_kind = 'navigate'
  AND NOT (eff)-[:NAVIGATES_TO]->(:Screen)
RETURN 'ScreenEffect' AS node_type, eff.id AS id,
       'navigate effect has no NAVIGATES_TO -> Screen' AS problem
UNION ALL
MATCH (eff:ScreenEffect)
WHERE eff.effect_kind = 'analytics'
  AND NOT (eff)-[:EMITS]->(:AnalyticsEvent)
RETURN 'ScreenEffect' AS node_type, eff.id AS id,
       'analytics effect has no EMITS -> AnalyticsEvent' AS problem
```

#### Check 10.3: Transition reference validity (mirrors L4.3)

A reified Transition must have **exactly one** FROM_STATE, TO_STATE, and ON_EVENT — and each target must belong to the **same Screen** as the transition itself.

```cypher
// L10.3 -- Severity: CRITICAL
// Transitions with missing/duplicated/foreign FROM_STATE / TO_STATE / ON_EVENT
MATCH (scr:Screen)-[:HAS_TRANSITION]->(tr:Transition)
OPTIONAL MATCH (tr)-[:FROM_STATE]->(fs:ScreenState)
OPTIONAL MATCH (tr)-[:TO_STATE]->(ts:ScreenState)
OPTIONAL MATCH (tr)-[:ON_EVENT]->(ev:ScreenEvent)
WITH scr, tr,
     count(DISTINCT fs) AS from_cnt,
     count(DISTINCT ts) AS to_cnt,
     count(DISTINCT ev) AS event_cnt,
     [x IN collect(DISTINCT fs) WHERE NOT (scr)-[:HAS_STATE]->(x) | x.id]
       + [x IN collect(DISTINCT ts) WHERE NOT (scr)-[:HAS_STATE]->(x) | x.id] AS foreign_states,
     [x IN collect(DISTINCT ev) WHERE NOT (scr)-[:HAS_EVENT]->(x) | x.id] AS foreign_events
WHERE from_cnt <> 1 OR to_cnt <> 1 OR event_cnt <> 1
   OR size(foreign_states) > 0 OR size(foreign_events) > 0
RETURN scr.id AS screen, tr.id AS transition,
       from_cnt, to_cnt, event_cnt, foreign_states, foreign_events,
       'Transition references missing, duplicated, or foreign-screen state/event' AS problem
```

#### Check 10.4: Determinism

Two transitions firing from the same state on the same event are ambiguous **unless every one of them is guarded** (guarded branching is legal; guard disjointness is the author's responsibility and cannot be checked statically).

```cypher
// L10.4 -- Severity: CRITICAL
// Ambiguous (from_state, on_event) pairs: >1 unguarded, or unguarded mixed with guarded
MATCH (scr:Screen)-[:HAS_TRANSITION]->(tr:Transition),
      (tr)-[:FROM_STATE]->(fs:ScreenState),
      (tr)-[:ON_EVENT]->(ev:ScreenEvent)
WITH scr, fs, ev,
     sum(CASE WHEN tr.guard IS NULL OR trim(tr.guard) = '' THEN 1 ELSE 0 END) AS unguarded,
     count(tr) AS total,
     collect(tr.id) AS transitions
WHERE unguarded > 1 OR (unguarded >= 1 AND total > unguarded)
RETURN scr.id AS screen, fs.name AS from_state, ev.name AS on_event,
       unguarded, total - unguarded AS guarded, transitions,
       'Non-deterministic: same (from_state, on_event) with unguarded transition overlap' AS problem
```

#### Check 10.5: Initial state and reachability

**10.5a — exactly one initial state per screen.** Reachability is undefined without it.

```cypher
// L10.5a -- Severity: CRITICAL
// Every Screen must have exactly ONE ScreenState with is_initial=true
MATCH (scr:Screen)
OPTIONAL MATCH (scr)-[:HAS_STATE]->(st:ScreenState)
WHERE coalesce(st.is_initial, false) = true
WITH scr, count(st) AS initial_count
WHERE initial_count <> 1
RETURN scr.id AS screen, initial_count,
       'Screen must have exactly one is_initial=true ScreenState' AS problem
```

**10.5b — every non-initial state reachable from the initial state** following the directed transition relation `(:ScreenState)<-[:FROM_STATE]-(:Transition)-[:TO_STATE]->(:ScreenState)`. Uses a quantified path pattern (Neo4j ≥ 5.9; on older 5.x fall back to `apoc.path.expandConfig` with `relationshipFilter: '<FROM_STATE,TO_STATE>'`). Cross-screen wiring is already excluded by L10.3, so the walk cannot leak between screens unless L10.3 also fails — run 10.3 first.

```cypher
// L10.5b -- Severity: CRITICAL
// Non-initial states not reachable from the screen's initial state
MATCH (scr:Screen)-[:HAS_STATE]->(init:ScreenState),
      (scr)-[:HAS_STATE]->(st:ScreenState)
WHERE coalesce(init.is_initial, false) = true
  AND st <> init
  AND NOT EXISTS {
        MATCH (init) ((:ScreenState)<-[:FROM_STATE]-(:Transition)-[:TO_STATE]->(:ScreenState)){1,12} (st)
      }
RETURN scr.id AS screen, st.id AS state_id, st.name AS state,
       'ScreenState unreachable from the initial state' AS problem
```

#### Check 10.6: Error-state escape (retry guarantee)

**10.6a — dead-end error state.** An error state the user can never leave is a trap. Intentionally terminal error states carry `terminal=true`.

```cypher
// L10.6a -- Severity: CRITICAL
// error-kind states with NO outgoing transition at all
MATCH (scr:Screen)-[:HAS_STATE]->(st:ScreenState)
WHERE st.state_kind = 'error'
  AND coalesce(st.terminal, false) = false  -- REQUIRED FILTER: exempt terminal states
  AND NOT (st)<-[:FROM_STATE]-(:Transition)
RETURN scr.id AS screen, st.id AS state_id, st.name AS state,
       'error state has no outgoing transition (user is trapped)' AS problem
```

**10.6b — no user-facing retry affordance.** The error state has outgoing transitions, but none fires on a `user`-kind event (e.g. OnRetry) — recovery exists but the user cannot trigger it. Checked by `event_kind`, not by event name: name matching ('OnRetry') is brittle across languages; the kind property is the deterministic invariant. The OnRetry naming stays as authoring convention in `nacl-sa-ui`.

```cypher
// L10.6b -- Severity: WARNING
// error states whose every escape is system/lifecycle-triggered
MATCH (scr:Screen)-[:HAS_STATE]->(st:ScreenState)
WHERE st.state_kind = 'error'
  AND coalesce(st.terminal, false) = false  -- REQUIRED FILTER: exempt terminal states
  AND (st)<-[:FROM_STATE]-(:Transition)
  AND NOT EXISTS {
        MATCH (st)<-[:FROM_STATE]-(tr2:Transition)-[:ON_EVENT]->(ev:ScreenEvent)
        WHERE ev.event_kind = 'user'
      }
RETURN scr.id AS screen, st.id AS state_id, st.name AS state,
       'error state has no user-triggered escape (no retry affordance)' AS problem
```

#### Check 10.7: Effect target integrity (mirrors L4.1/L4.3)

Edges always point at existing nodes in Neo4j, so the dangling-reference failure mode here is a **wrong-label** target (e.g. CALLS at a Form) or a malformed endpoint.

```cypher
// L10.7a -- Severity: CRITICAL
// Effect edges pointing at wrong-label or malformed targets
MATCH (eff:ScreenEffect)-[:CALLS]->(x)
WHERE NOT x:APIEndpoint OR x.id IS NULL
RETURN eff.id AS effect_id, 'CALLS' AS edge,
       labels(x)[0] AS target_label, x.id AS target_id,
       'CALLS target is not a valid APIEndpoint' AS problem
UNION ALL
MATCH (eff:ScreenEffect)-[:NAVIGATES_TO]->(x)
WHERE NOT x:Screen
RETURN eff.id AS effect_id, 'NAVIGATES_TO' AS edge,
       labels(x)[0] AS target_label, x.id AS target_id,
       'NAVIGATES_TO target is not a Screen' AS problem
UNION ALL
MATCH (eff:ScreenEffect)-[:EMITS]->(x)
WHERE NOT x:AnalyticsEvent
RETURN eff.id AS effect_id, 'EMITS' AS edge,
       labels(x)[0] AS target_label, x.id AS target_id,
       'EMITS target is not an AnalyticsEvent' AS problem
```

```cypher
// L10.7b -- Severity: INFO
// Called endpoint not EXPOSES-linked to the screen's own UseCase.
// Either a deliberate cross-UC call or a missing EXPOSES edge — surfaced, not gated.
MATCH (uc:UseCase)-[:HAS_SCREEN]->(scr:Screen)-[:HAS_TRANSITION]->(:Transition)
      -[:TRIGGERS]->(eff:ScreenEffect)-[:CALLS]->(api:APIEndpoint)
WHERE NOT (uc)-[:EXPOSES]->(api)
RETURN uc.id AS uc_id, scr.id AS screen, eff.id AS effect_id, api.id AS endpoint,
       'Effect calls an endpoint not EXPOSES-linked to the screen''s UseCase' AS observation
```

#### Check 10.8: Kind-vocabulary validity

```cypher
// L10.8 -- Severity: WARNING
// state_kind / event_kind / effect_kind outside the canonical vocabularies
// ('busy' = user-initiated operation in progress, vs 'loading' = data fetch)
MATCH (st:ScreenState)
WHERE NOT coalesce(st.state_kind, '') IN ['initial', 'loading', 'busy', 'content', 'empty', 'error']
RETURN 'ScreenState' AS node_type, st.id AS id, st.state_kind AS kind,
       'state_kind outside {initial, loading, busy, content, empty, error}' AS problem
UNION ALL
MATCH (ev:ScreenEvent)
WHERE NOT coalesce(ev.event_kind, '') IN ['user', 'system', 'lifecycle']
RETURN 'ScreenEvent' AS node_type, ev.id AS id, ev.event_kind AS kind,
       'event_kind outside {user, system, lifecycle}' AS problem
UNION ALL
MATCH (eff:ScreenEffect)
WHERE NOT coalesce(eff.effect_kind, '') IN ['load', 'mutate', 'navigate', 'analytics']
RETURN 'ScreenEffect' AS node_type, eff.id AS id, eff.effect_kind AS kind,
       'effect_kind outside {load, mutate, navigate, analytics}' AS problem
```

---

### Level 11: Behavior Slices (SA-Extension Connectivity)

**Goal:** Every behavior slice written by `nacl-sa-uc slices` is structurally sound: no orphaned Slice nodes, every slice anchored to its parent UseCase and to at least one behavioral anchor (COVERS into the screen state machine and/or CALLS to an APIEndpoint), COVERS targets belong to the slice's own UC, slices on planned UCs are tied to the tasks that verify them, and every slice carries an observable outcome (`then`). This is the connectivity invariant for the Slice overlay: a Slice cannot silently orphan, and behavior text that change propagation cannot reach cannot masquerade as a slice.

A graph with **zero** Slice nodes passes L11 cleanly (all checks anchor on the `Slice` label or `HAS_SLICE` edge) — projects that have not adopted behavior slices are unaffected. A graph with screen machines but no slices also passes: the overlay is opt-in.

**Label-qualify CALLS:** the `CALLS` edge-type name is shared with `(:ScreenEffect)-[:CALLS]->(:APIEndpoint)` (deliberate — identical semantics). Every L11 query below qualifies the source as `(sl:Slice)`; L10.7a qualifies its source as `(eff:ScreenEffect)` — the two levels cannot cross-fire by construction.

This level writes nothing.

#### Check 11.0: Orphaned slice nodes (mirrors L2.1)

```cypher
// L11.0 -- Severity: CRITICAL
// Slice nodes with zero relationships
MATCH (sl:Slice)
WHERE NOT (sl)--()
RETURN 'Slice' AS node_type, sl.id AS id,
       coalesce(sl.name, '') AS display_name,
       'Completely disconnected Slice node (zero relationships)' AS problem
```

#### Check 11.1: Required parent (mirrors L2.2)

```cypher
// L11.1 -- Severity: CRITICAL
// Every Slice must hang off its parent UseCase
MATCH (sl:Slice)
WHERE NOT (:UseCase)-[:HAS_SLICE]->(sl)
RETURN 'Slice' AS node_type, sl.id AS id,
       'Slice has no parent UseCase (HAS_SLICE)' AS problem
```

#### Check 11.2: Required behavioral anchor

A slice with no anchor is prose that impact analysis can never reach — exactly the silent-drift artifact this extension family exists to eliminate. Such text belongs in `UseCase.acceptance_criteria`, not in a node. There is **deliberately no exemption flag** for this check.

```cypher
// L11.2 -- Severity: CRITICAL
// Slice with neither a COVERS anchor (screen machine) nor a CALLS anchor (endpoint)
MATCH (sl:Slice)
WHERE NOT EXISTS {
        MATCH (sl)-[:COVERS]->(x)
        WHERE x:ScreenState OR x:Transition
      }
  AND NOT (sl)-[:CALLS]->(:APIEndpoint)
RETURN 'Slice' AS node_type, sl.id AS id, sl.name AS name,
       'Slice has no behavioral anchor (no COVERS -> ScreenState/Transition, no CALLS -> APIEndpoint)' AS problem
```

#### Check 11.3: COVERS reference validity (mirrors L10.3)

A COVERS target must be a ScreenState or Transition, and it must belong to a Screen of the slice's **own** UseCase — a slice covering another UC's machine is mis-wiring.

```cypher
// L11.3 -- Severity: CRITICAL
// COVERS at a wrong-label target, or at a state/transition of a foreign UC's screen
MATCH (sl:Slice)-[:COVERS]->(x)
WHERE NOT x:ScreenState AND NOT x:Transition
RETURN sl.id AS slice, x.id AS target, labels(x)[0] AS target_label,
       'COVERS target is not a ScreenState or Transition' AS problem
UNION ALL
MATCH (uc:UseCase)-[:HAS_SLICE]->(sl:Slice)-[:COVERS]->(x)
WHERE (x:ScreenState OR x:Transition)
  AND NOT EXISTS {
        MATCH (uc)-[:HAS_SCREEN]->(scr:Screen)
        WHERE (scr)-[:HAS_STATE]->(x) OR (scr)-[:HAS_TRANSITION]->(x)
      }
RETURN sl.id AS slice, x.id AS target, labels(x)[0] AS target_label,
       'COVERS target belongs to a screen not owned by the slice''s UseCase' AS problem
```

#### Check 11.4: Verification closure (the gate)

Once a UC has been planned (`GENERATES` tasks exist), every one of its slices must name the delivery unit that proves it. This gate is **self-healing**: `nacl-tl-plan` MERGEs `VERIFIED_BY` edges whenever it (re)plans a UC that has slices — the same closed loop as L8 (stamp → block → re-plan → clean). UCs without tasks are silent here (authoring slices before planning is the normal order).

```cypher
// L11.4 -- Severity: CRITICAL
// Slice on a planned UC with no VERIFIED_BY -> Task
MATCH (uc:UseCase)-[:HAS_SLICE]->(sl:Slice)
WHERE (uc)-[:GENERATES]->(:Task)
  AND NOT (sl)-[:VERIFIED_BY]->(:Task)
RETURN uc.id AS uc_id, sl.id AS slice, sl.name AS name,
       'UC is planned but slice has no VERIFIED_BY -> Task (run /nacl-tl-plan to re-link)' AS problem
```

#### Check 11.5: Edge-target integrity (mirrors L10.7a)

```cypher
// L11.5 -- Severity: CRITICAL
// VERIFIED_BY at a wrong-label target; VERIFIED_BY at a task the slice's UC does
// not own; Slice-CALLS at a wrong-label target
MATCH (sl:Slice)-[:VERIFIED_BY]->(x)
WHERE NOT x:Task
RETURN sl.id AS slice, 'VERIFIED_BY' AS edge,
       labels(x)[0] AS target_label, x.id AS target_id,
       'VERIFIED_BY target is not a Task' AS problem
UNION ALL
MATCH (uc:UseCase)-[:HAS_SLICE]->(sl:Slice)-[:VERIFIED_BY]->(t:Task)
WHERE NOT (uc)-[:GENERATES]->(t)
RETURN sl.id AS slice, 'VERIFIED_BY' AS edge,
       'Task' AS target_label, t.id AS target_id,
       'VERIFIED_BY task is not GENERATES-owned by the slice''s UseCase' AS problem
UNION ALL
MATCH (sl:Slice)-[:CALLS]->(x)
WHERE NOT x:APIEndpoint
RETURN sl.id AS slice, 'CALLS' AS edge,
       labels(x)[0] AS target_label, x.id AS target_id,
       'Slice CALLS target is not an APIEndpoint' AS problem
```

Note: multi-owner `GENERATES` (one task shared by several UCs) passes by construction — the check only requires the slice's own UC to be among the task's owners.

#### Check 11.6: Contract hygiene

**11.6a — empty observable outcome.** Mirrors the L9.3 empty-rationale gate: a slice with no `then` cannot be verified by anything — it is the "we forgot what to observe" failure.

```cypher
// L11.6a -- Severity: CRITICAL
// Slice with empty/blank `then`
MATCH (sl:Slice)
WHERE sl.then IS NULL OR trim(sl.then) = ''
RETURN 'Slice' AS node_type, sl.id AS id, sl.name AS name,
       'Slice has no observable outcome (empty `then`)' AS problem
```

**11.6b — kind vocabulary** (mirrors L10.8).

```cypher
// L11.6b -- Severity: WARNING
// slice_kind outside the canonical vocabulary
MATCH (sl:Slice)
WHERE NOT coalesce(sl.slice_kind, '') IN ['happy', 'alternate', 'error', 'edge']
RETURN 'Slice' AS node_type, sl.id AS id, sl.slice_kind AS kind,
       'slice_kind outside {happy, alternate, error, edge}' AS problem
```

#### Check 11.7: Machine-coverage gap

For UCs that have adopted **both** layers (a screen machine AND at least one slice): screen states and transitions covered by no slice are behavior outside any acceptance scenario. WARNING, not CRITICAL — partial coverage must not block a release (aspect-split calibration: structural integrity gates, coverage aspiration advises). UCs with a machine but no slices are not flagged (the overlay is opt-in).

```cypher
// L11.7 -- Severity: WARNING
// States/transitions of slice-adopting UCs that no slice covers
MATCH (uc:UseCase)-[:HAS_SCREEN]->(scr:Screen)
WHERE (uc)-[:HAS_SLICE]->(:Slice)
MATCH (scr)-[:HAS_STATE|HAS_TRANSITION]->(x)
WHERE NOT (x)<-[:COVERS]-(:Slice)
RETURN uc.id AS uc_id, scr.id AS screen, labels(x)[0] AS element_type,
       x.id AS element_id, coalesce(x.name, '') AS element_name,
       'Machine element not covered by any behavior slice' AS observation
```

#### Check 11.8: Happy-path presence

```cypher
// L11.8 -- Severity: INFO
// UC has slices, but none of kind 'happy'
MATCH (uc:UseCase)-[:HAS_SLICE]->(:Slice)
WITH DISTINCT uc
WHERE NOT EXISTS {
        MATCH (uc)-[:HAS_SLICE]->(h:Slice)
        WHERE h.slice_kind = 'happy'
      }
RETURN uc.id AS uc_id,
       'UC has behavior slices but no happy-path slice' AS observation
```

---

### Level 12: Domain Error Taxonomy (SA-Extension Connectivity)

**Goal:** Every domain error written by `nacl-sa-uc errors` (or `nacl-tl-fix` L2/L3) is structurally sound: no orphaned `DomainError`/`ErrorPresentation` nodes, every error owned by a Module catalog and raisable at ≥1 API surface, every presentation owned by its error and shown by ≥1 screen state, `HANDLES` wiring follows the channel rule (the handling state's screen actually calls a raising endpoint), and the state→presentation→error triangle is closed. The taxonomy is transport-independent: the `code` is the source of truth, `http_status` is only a projection hint.

A graph with **zero** DomainError nodes passes L12 cleanly (all checks anchor on the `DomainError`/`ErrorPresentation` labels or the `MAY_RAISE` edge) — projects that have not adopted the error taxonomy are unaffected. A graph with screen machines and behavior slices but no errors also passes: the overlay is opt-in.

**No shared edge names:** unlike L10 (`HAS_STATE`/`TRIGGERS` shared with BA) and L11 (`CALLS` shared with ScreenEffect), all five L12 edge types (`HAS_ERROR`, `MAY_RAISE`, `HANDLES`, `PRESENTED_AS`, `SHOWS`) are unshared — verified against both schemas and live-graph relationship types at design time. Queries below still label-qualify sources/targets as defense in depth.

**Errors are shared vocabulary:** one DomainError may be raised by endpoints of several UCs (and modules). There is deliberately **no same-UC rule** for `HANDLES` (asymmetric to L11.3) — the channel rule is the real scope: a UC-B screen legally handles an error raised by a UC-A endpoint when one of its effects actually calls that endpoint.

This level writes nothing.

#### Check 12.0: Orphaned error-taxonomy nodes (mirrors L2.1)

```cypher
// L12.0 -- Severity: CRITICAL
// DomainError / ErrorPresentation nodes with zero relationships
MATCH (n)
WHERE (n:DomainError OR n:ErrorPresentation)
  AND NOT (n)--()
RETURN labels(n)[0] AS node_type, n.id AS id,
       coalesce(n.name, n.message, '') AS display_name,
       'Completely disconnected error-taxonomy node (zero relationships)' AS problem
```

#### Check 12.1: Required parents (mirrors L2.2)

```cypher
// L12.1 -- Severity: CRITICAL
// Every DomainError must belong to a Module catalog; every ErrorPresentation
// must belong to its DomainError
MATCH (err:DomainError)
WHERE NOT (:Module)-[:HAS_ERROR]->(err)
RETURN 'DomainError' AS node_type, err.id AS id,
       'DomainError has no parent Module (HAS_ERROR)' AS problem
UNION ALL
MATCH (p:ErrorPresentation)
WHERE NOT (:DomainError)-[:PRESENTED_AS]->(p)
RETURN 'ErrorPresentation' AS node_type, p.id AS id,
       'ErrorPresentation has no parent DomainError (PRESENTED_AS)' AS problem
```

#### Check 12.2: Required anchors

An error that no API surface can raise is dead vocabulary — a failure mode observable at no surface is an implementation detail, not a domain error; it belongs in Requirements / RuntimeContract notes, not in a node. A presentation that no state shows is dead text. There is **deliberately no exemption flag** for either half (pipeline failures of backend UCs are observable through their status endpoint — that endpoint is the surface; deliberate UI silence is a `silent`-kind presentation, not a missing one). `MAY_RAISE` on provisional endpoints (`provisional=true`) satisfies the anchor.

```cypher
// L12.2 -- Severity: CRITICAL
// Unraisable DomainError; unshown ErrorPresentation
MATCH (err:DomainError)
WHERE NOT (:APIEndpoint)-[:MAY_RAISE]->(err)
RETURN 'DomainError' AS node_type, err.id AS id,
       'DomainError is raised by no APIEndpoint (no incoming MAY_RAISE)' AS problem
UNION ALL
MATCH (p:ErrorPresentation)
WHERE NOT (:ScreenState)-[:SHOWS]->(p)
RETURN 'ErrorPresentation' AS node_type, p.id AS id,
       'ErrorPresentation is shown by no ScreenState (no incoming SHOWS)' AS problem
```

#### Check 12.3: HANDLES validity (label + channel rule)

A `HANDLES` edge must run ScreenState→DomainError, and the handling state's Screen must actually be exposed to the error: at least one of the screen's `ScreenEffect`s `CALLS` an endpoint that `MAY_RAISE` it. Handling an error the screen can never receive is spec fiction (mirrors the L11.3 mis-wiring severity; the scope is the call channel, not the UC).

```cypher
// L12.3 -- Severity: CRITICAL
// HANDLES at wrong labels, or handling without a call channel
MATCH (s)-[:HANDLES]->(x)
WHERE NOT s:ScreenState OR NOT x:DomainError
RETURN coalesce(s.id,'?') AS source, coalesce(x.id,'?') AS target,
       labels(s)[0] + ' -> ' + labels(x)[0] AS labels,
       'HANDLES must run ScreenState -> DomainError' AS problem
UNION ALL
MATCH (st:ScreenState)-[:HANDLES]->(err:DomainError)
MATCH (scr:Screen)-[:HAS_STATE]->(st)
WHERE NOT EXISTS {
        MATCH (scr)-[:HAS_TRANSITION]->(:Transition)-[:TRIGGERS]->(eff:ScreenEffect)
              -[:CALLS]->(api:APIEndpoint)-[:MAY_RAISE]->(err)
      }
RETURN st.id AS source, err.id AS target,
       'ScreenState -> DomainError' AS labels,
       'Handling state''s screen has no ScreenEffect CALLS to any endpoint that MAY_RAISE this error (channel rule)' AS problem
```

#### Check 12.4: Edge-target integrity (mirrors L10.7a / L11.5)

```cypher
// L12.4 -- Severity: CRITICAL
// MAY_RAISE / PRESENTED_AS / SHOWS at wrong-label endpoints
MATCH (a)-[:MAY_RAISE]->(b)
WHERE NOT a:APIEndpoint OR NOT b:DomainError
RETURN 'MAY_RAISE' AS edge, coalesce(a.id,'?') AS source, coalesce(b.id,'?') AS target,
       labels(a)[0] + ' -> ' + labels(b)[0] AS labels,
       'MAY_RAISE must run APIEndpoint -> DomainError' AS problem
UNION ALL
MATCH (a)-[:PRESENTED_AS]->(b)
WHERE NOT a:DomainError OR NOT b:ErrorPresentation
RETURN 'PRESENTED_AS' AS edge, coalesce(a.id,'?') AS source, coalesce(b.id,'?') AS target,
       labels(a)[0] + ' -> ' + labels(b)[0] AS labels,
       'PRESENTED_AS must run DomainError -> ErrorPresentation' AS problem
UNION ALL
MATCH (a)-[:SHOWS]->(b)
WHERE NOT a:ScreenState OR NOT b:ErrorPresentation
RETURN 'SHOWS' AS edge, coalesce(a.id,'?') AS source, coalesce(b.id,'?') AS target,
       labels(a)[0] + ' -> ' + labels(b)[0] AS labels,
       'SHOWS must run ScreenState -> ErrorPresentation' AS problem
```

#### Check 12.5: SHOWS triangle closure

A state showing a presentation of an error it does not handle is mis-wiring: the `SHOWS` edge must close the triangle `(st)-[:HANDLES]->(err)-[:PRESENTED_AS]->(p)<-[:SHOWS]-(st)`.

```cypher
// L12.5 -- Severity: CRITICAL
// SHOWS without HANDLES on the presentation's parent error
MATCH (st:ScreenState)-[:SHOWS]->(p:ErrorPresentation)<-[:PRESENTED_AS]-(err:DomainError)
WHERE NOT (st)-[:HANDLES]->(err)
RETURN st.id AS state, p.id AS presentation, err.id AS error,
       'State SHOWS a presentation of an error it does not HANDLE' AS problem
```

#### Check 12.6: Contract hygiene

**12.6a — blank join key / blank user-facing message.** Mirrors the L9.3 / L11.6a empty-contract gates: `code` is the join key to the API envelope and the codebase ("forgot what the caller matches on"); `message` is what the user sees ("forgot what the user sees" — for `silent` presentations it documents the observable absence).

```cypher
// L12.6a -- Severity: CRITICAL
// DomainError with blank code; ErrorPresentation with blank message
MATCH (err:DomainError)
WHERE err.code IS NULL OR trim(err.code) = ''
RETURN 'DomainError' AS node_type, err.id AS id,
       'DomainError has no code (the API-envelope join key)' AS problem
UNION ALL
MATCH (p:ErrorPresentation)
WHERE p.message IS NULL OR trim(p.message) = ''
RETURN 'ErrorPresentation' AS node_type, p.id AS id,
       'ErrorPresentation has no user-facing message' AS problem
```

**12.6b — kind vocabularies** (mirrors L10.8 / L11.6b).

```cypher
// L12.6b -- Severity: WARNING
// error_kind / presentation_kind outside the canonical vocabularies
MATCH (err:DomainError)
WHERE NOT coalesce(err.error_kind, '')
      IN ['validation', 'not_found', 'conflict', 'permission', 'rate_limit', 'external', 'internal']
RETURN 'DomainError' AS node_type, err.id AS id, err.error_kind AS kind,
       'error_kind outside {validation, not_found, conflict, permission, rate_limit, external, internal}' AS problem
UNION ALL
MATCH (p:ErrorPresentation)
WHERE NOT coalesce(p.presentation_kind, '')
      IN ['toast', 'banner', 'inline', 'modal', 'fullscreen', 'silent']
RETURN 'ErrorPresentation' AS node_type, p.id AS id, p.presentation_kind AS kind,
       'presentation_kind outside {toast, banner, inline, modal, fullscreen, silent}' AS problem
```

#### Check 12.7: Handling-completeness gap

For screens exposed to catalogued errors (an effect CALLS an endpoint that MAY_RAISE): errors no state of the screen handles are UX failure paths outside the spec. WARNING, not CRITICAL — aspect-split calibration: this gap has no self-healing closer (closing it requires authoring, `/nacl-sa-uc errors UC-NNN`), and a CRITICAL gate that only manual work can clear is a gate people disable. Screens whose UC has not adopted the taxonomy are silent here (no MAY_RAISE → no rows).

```cypher
// L12.7 -- Severity: WARNING
// Errors raisable through a screen's own calls that no state of the screen handles
MATCH (scr:Screen)-[:HAS_TRANSITION]->(:Transition)-[:TRIGGERS]->(eff:ScreenEffect)
      -[:CALLS]->(api:APIEndpoint)-[:MAY_RAISE]->(err:DomainError)
WHERE NOT EXISTS {
        MATCH (scr)-[:HAS_STATE]->(st:ScreenState)-[:HANDLES]->(err)
      }
RETURN DISTINCT scr.id AS screen, err.id AS error, err.code AS code,
       'Screen calls an endpoint that may raise this error, but no state of the screen handles it (run /nacl-sa-uc errors UC-NNN)' AS observation
```

#### Check 12.8: Handled-but-unpresented

A state that handles an error but shows no presentation of it leaves the user-facing contract unspecified. Deliberate silence is modeled as a `silent`-kind presentation (whose `message` documents the observable absence), so this check stays meaningful. WARNING — completeness aspect.

```cypher
// L12.8 -- Severity: WARNING
// HANDLES with no SHOWS on any presentation of the handled error
MATCH (st:ScreenState)-[:HANDLES]->(err:DomainError)
WHERE NOT EXISTS {
        MATCH (st)-[:SHOWS]->(:ErrorPresentation)<-[:PRESENTED_AS]-(err)
      }
RETURN st.id AS state, err.id AS error, err.code AS code,
       'State handles the error but shows no presentation of it (author one, or a silent-kind presentation for deliberate silence)' AS observation
```

#### Check 12.9: Error slices not joined to the taxonomy

The Phase-2 attach point: for UCs that adopted **both** behavior slices and the error taxonomy, an `error`-kind slice whose covered error states handle no catalogued DomainError means the two layers describe the same failure without meeting in the graph. INFO — adoption-order tolerance (slices are often authored before errors).

```cypher
// L12.9 -- Severity: INFO
// error-kind slices covering error states that HANDLE nothing, on UCs whose
// endpoints carry MAY_RAISE
MATCH (uc:UseCase)-[:HAS_SLICE]->(sl:Slice {slice_kind: 'error'})
WHERE (uc)-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(:DomainError)
MATCH (sl)-[:COVERS]->(st:ScreenState {state_kind: 'error'})
WHERE NOT (st)-[:HANDLES]->(:DomainError)
RETURN uc.id AS uc_id, sl.id AS slice, st.id AS error_state,
       'Error slice covers an error state that handles no catalogued DomainError (taxonomy and slices not joined)' AS observation
```

---

### Level 13: Cache & Degradation Policies (SA-Extension Connectivity)

**Goal:** Every cache/degradation policy written by `nacl-sa-uc resilience` (or `nacl-tl-fix` L2/L3) is structurally sound: no orphaned `CachePolicy`/`DegradationRule` nodes, every policy owned by a Module catalog and caching ≥1 API surface, every rule owned by its UseCase and anchored to a failure mode (`ON_ERROR`) and/or a degraded screen state (`DEGRADES_TO`), the same-UC and channel rules hold for `DEGRADES_TO`, and the load-bearing contract fields (`invalidation_kind`, `behavior`) are non-blank.

A graph with **zero** CachePolicy/DegradationRule nodes passes L13 cleanly (all checks anchor on the two labels or the `HAS_CACHE`/`CACHES`/`HAS_DEGRADATION`/`ON_ERROR`/`DEGRADES_TO` edges) — projects with screen machines, behavior slices, and a full error taxonomy but no cache layer are unaffected: the overlay is opt-in, like L10–L12.

**No shared edge names:** all five L13 edge types are unshared — verified against both schemas, the skill texts, and live-graph relationship types at design time (the second phase in a row; grep hits for `ON_ERROR` are the `VALIDATION_ERROR` substring in prose). Queries below still label-qualify as defense in depth.

**Ownership is asymmetric by design:** the cache catalog is module-scoped shared vocabulary (one quota cache serves screens of many UCs — like `DomainError`), while degradation rules are UC-scoped behavior (one BA-level fallback principle yields several distinct per-experience rules — like `Slice`). `DEGRADES_TO` therefore carries a same-UC rule (mirrors L11.3), and error-triggered rules carry a channel rule (mirrors L12.3).

This level writes nothing.

#### Check 13.0: Orphaned cache/degradation nodes (mirrors L2.1)

```cypher
// L13.0 -- Severity: CRITICAL
// CachePolicy / DegradationRule nodes with zero relationships
MATCH (n)
WHERE (n:CachePolicy OR n:DegradationRule)
  AND NOT (n)--()
RETURN labels(n)[0] AS node_type, n.id AS id,
       coalesce(n.name, '') AS display_name,
       'Completely disconnected cache/degradation node (zero relationships)' AS problem
```

#### Check 13.1: Required parents (mirrors L2.2)

```cypher
// L13.1 -- Severity: CRITICAL
// Every CachePolicy must belong to a Module catalog; every DegradationRule
// must belong to its UseCase
MATCH (cp:CachePolicy)
WHERE NOT (:Module)-[:HAS_CACHE]->(cp)
RETURN 'CachePolicy' AS node_type, cp.id AS id,
       'CachePolicy has no parent Module (HAS_CACHE)' AS problem
UNION ALL
MATCH (dr:DegradationRule)
WHERE NOT (:UseCase)-[:HAS_DEGRADATION]->(dr)
RETURN 'DegradationRule' AS node_type, dr.id AS id,
       'DegradationRule has no parent UseCase (HAS_DEGRADATION)' AS problem
```

#### Check 13.2: Required anchors

A policy that caches no surface is dead vocabulary (mirrors L12.2 — a caching intention with no data surface belongs in Requirements, not in a node); `CACHES` on provisional endpoints satisfies the anchor. A rule anchored to neither a failure mode nor a screen state is prose change propagation can never reach (the L11.2 argument verbatim). Kind dependency (mirrors the L10.2 kind-required effect targets): `trigger_kind='error'` REQUIRES `ON_ERROR` — offline/capability rules anchor through `DEGRADES_TO`. There is **deliberately no exemption flag** for any half.

```cypher
// L13.2 -- Severity: CRITICAL
// Surface-less CachePolicy; anchorless DegradationRule; error rule without ON_ERROR
MATCH (cp:CachePolicy)
WHERE NOT (cp)-[:CACHES]->(:APIEndpoint)
RETURN 'CachePolicy' AS node_type, cp.id AS id,
       'CachePolicy caches no APIEndpoint (no outgoing CACHES)' AS problem
UNION ALL
MATCH (dr:DegradationRule)
WHERE NOT (dr)-[:ON_ERROR]->(:DomainError)
  AND NOT (dr)-[:DEGRADES_TO]->(:ScreenState)
RETURN 'DegradationRule' AS node_type, dr.id AS id,
       'DegradationRule has neither ON_ERROR nor DEGRADES_TO (anchorless prose)' AS problem
UNION ALL
MATCH (dr:DegradationRule)
WHERE dr.trigger_kind = 'error'
  AND NOT (dr)-[:ON_ERROR]->(:DomainError)
RETURN 'DegradationRule' AS node_type, dr.id AS id,
       'error-triggered DegradationRule has no ON_ERROR (kind-required anchor)' AS problem
```

#### Check 13.3: DEGRADES_TO reference validity (same-UC + channel rule)

The degraded state must belong to a screen of the rule's **own** UseCase (mirrors L11.3 — degradation rules are UC-scoped behavior). For **error-triggered** rules the target state's screen must actually be exposed to at least one of the rule's failure modes: one of its `ScreenEffect`s `CALLS` an endpoint that `MAY_RAISE` an `ON_ERROR` error (mirrors L12.3 — degrading from an error the screen can never receive is spec fiction). Offline/capability rules carry no channel constraint (offline affects any networked screen).

```cypher
// L13.3 -- Severity: CRITICAL
// DEGRADES_TO into a foreign UC's state; error rule degrading without a channel
MATCH (uc:UseCase)-[:HAS_DEGRADATION]->(dr:DegradationRule)-[:DEGRADES_TO]->(st:ScreenState)
WHERE NOT EXISTS {
        MATCH (uc)-[:HAS_SCREEN]->(:Screen)-[:HAS_STATE]->(st)
      }
RETURN dr.id AS rule, st.id AS target,
       'DEGRADES_TO targets a state outside the rule''s own UC (same-UC rule)' AS problem
UNION ALL
MATCH (dr:DegradationRule)-[:DEGRADES_TO]->(st:ScreenState)
MATCH (scr:Screen)-[:HAS_STATE]->(st)
WHERE dr.trigger_kind = 'error'
  AND NOT EXISTS {
        MATCH (dr)-[:ON_ERROR]->(err:DomainError),
              (scr)-[:HAS_TRANSITION]->(:Transition)-[:TRIGGERS]->(:ScreenEffect)
              -[:CALLS]->(:APIEndpoint)-[:MAY_RAISE]->(err)
      }
RETURN dr.id AS rule, st.id AS target,
       'error-triggered rule degrades a screen that calls no endpoint raising any of its ON_ERROR errors (channel rule)' AS problem
```

#### Check 13.4: Edge-target integrity (mirrors L10.7a / L11.5 / L12.4)

```cypher
// L13.4 -- Severity: CRITICAL
// HAS_CACHE / CACHES / HAS_DEGRADATION / ON_ERROR / DEGRADES_TO at wrong labels
MATCH (a)-[:HAS_CACHE]->(b)
WHERE NOT a:Module OR NOT b:CachePolicy
RETURN 'HAS_CACHE' AS edge, coalesce(a.id,'?') AS source, coalesce(b.id,'?') AS target,
       labels(a)[0] + ' -> ' + labels(b)[0] AS labels,
       'HAS_CACHE must run Module -> CachePolicy' AS problem
UNION ALL
MATCH (a)-[:CACHES]->(b)
WHERE NOT a:CachePolicy OR NOT b:APIEndpoint
RETURN 'CACHES' AS edge, coalesce(a.id,'?') AS source, coalesce(b.id,'?') AS target,
       labels(a)[0] + ' -> ' + labels(b)[0] AS labels,
       'CACHES must run CachePolicy -> APIEndpoint' AS problem
UNION ALL
MATCH (a)-[:HAS_DEGRADATION]->(b)
WHERE NOT a:UseCase OR NOT b:DegradationRule
RETURN 'HAS_DEGRADATION' AS edge, coalesce(a.id,'?') AS source, coalesce(b.id,'?') AS target,
       labels(a)[0] + ' -> ' + labels(b)[0] AS labels,
       'HAS_DEGRADATION must run UseCase -> DegradationRule' AS problem
UNION ALL
MATCH (a)-[:ON_ERROR]->(b)
WHERE NOT a:DegradationRule OR NOT b:DomainError
RETURN 'ON_ERROR' AS edge, coalesce(a.id,'?') AS source, coalesce(b.id,'?') AS target,
       labels(a)[0] + ' -> ' + labels(b)[0] AS labels,
       'ON_ERROR must run DegradationRule -> DomainError' AS problem
UNION ALL
MATCH (a)-[:DEGRADES_TO]->(b)
WHERE NOT a:DegradationRule OR NOT b:ScreenState
RETURN 'DEGRADES_TO' AS edge, coalesce(a.id,'?') AS source, coalesce(b.id,'?') AS target,
       labels(a)[0] + ' -> ' + labels(b)[0] AS labels,
       'DEGRADES_TO must run DegradationRule -> ScreenState' AS problem
```

#### Check 13.5: Contract hygiene

**13.5a — blank load-bearing contract fields.** Mirrors the L9.3 / L11.6a / L12.6a empty-contract gates: `invalidation_kind` is when the cache stops lying ("forgot when the cache stops lying" — a cache with no invalidation contract is a staleness-bug factory; a `ttl` policy without `ttl_seconds` is the same gap); `behavior` is what the user/caller observes instead of the full experience ("forgot what degrades" — mirrors `slice.then`).

```cypher
// L13.5a -- Severity: CRITICAL
// CachePolicy with blank invalidation contract; DegradationRule with blank behavior
MATCH (cp:CachePolicy)
WHERE cp.invalidation_kind IS NULL OR trim(cp.invalidation_kind) = ''
RETURN 'CachePolicy' AS node_type, cp.id AS id,
       'CachePolicy has no invalidation_kind (the load-bearing cache contract)' AS problem
UNION ALL
MATCH (cp:CachePolicy)
WHERE cp.invalidation_kind = 'ttl' AND cp.ttl_seconds IS NULL
RETURN 'CachePolicy' AS node_type, cp.id AS id,
       'ttl-invalidated CachePolicy has no ttl_seconds' AS problem
UNION ALL
MATCH (dr:DegradationRule)
WHERE dr.behavior IS NULL OR trim(dr.behavior) = ''
RETURN 'DegradationRule' AS node_type, dr.id AS id,
       'DegradationRule has no observable degraded behavior' AS problem
```

**13.5b — kind vocabularies** (mirrors L10.8 / L11.6b / L12.6b). The `invalidation_kind` arm excludes blank values — those are already CRITICAL in 13.5a.

```cypher
// L13.5b -- Severity: WARNING
// storage_kind / invalidation_kind / trigger_kind / fallback_kind outside the canon
MATCH (cp:CachePolicy)
WHERE NOT coalesce(cp.storage_kind, '')
      IN ['memory', 'local_storage', 'indexed_db', 'cache_api', 'http', 'server', 'cdn']
RETURN 'CachePolicy' AS node_type, cp.id AS id, cp.storage_kind AS kind,
       'storage_kind outside {memory, local_storage, indexed_db, cache_api, http, server, cdn}' AS problem
UNION ALL
MATCH (cp:CachePolicy)
WHERE cp.invalidation_kind IS NOT NULL AND trim(cp.invalidation_kind) <> ''
  AND NOT cp.invalidation_kind IN ['ttl', 'event', 'manual', 'session', 'never']
RETURN 'CachePolicy' AS node_type, cp.id AS id, cp.invalidation_kind AS kind,
       'invalidation_kind outside {ttl, event, manual, session, never}' AS problem
UNION ALL
MATCH (dr:DegradationRule)
WHERE NOT coalesce(dr.trigger_kind, '')
      IN ['error', 'offline', 'capability']
RETURN 'DegradationRule' AS node_type, dr.id AS id, dr.trigger_kind AS kind,
       'trigger_kind outside {error, offline, capability}' AS problem
UNION ALL
MATCH (dr:DegradationRule)
WHERE NOT coalesce(dr.fallback_kind, '')
      IN ['cached_data', 'static_content', 'alternate_provider', 'alternate_ui', 'skip_unit', 'backoff']
RETURN 'DegradationRule' AS node_type, dr.id AS id, dr.fallback_kind AS kind,
       'fallback_kind outside {cached_data, static_content, alternate_provider, alternate_ui, skip_unit, backoff}' AS problem
```

#### Check 13.6: Retryable consistency

The consumer of the Phase-3 `DomainError.retryable` groundwork: a rule that answers a failure with a backoff-retry, when the error itself is catalogued as **not** retryable, is spec fiction ("retrying the unretryable"). Fires only on explicit `retryable=false` — a NULL retryable is unknown, not a finding.

```cypher
// L13.6 -- Severity: WARNING
// backoff fallback on an explicitly non-retryable error
MATCH (dr:DegradationRule)-[:ON_ERROR]->(err:DomainError)
WHERE dr.fallback_kind = 'backoff' AND err.retryable = false
RETURN dr.id AS rule, err.id AS error, err.code AS code,
       'backoff fallback on a non-retryable error (retryable=false) — retrying the unretryable is spec fiction' AS observation
```

#### Check 13.7: Cached-surface degradation gap

For surfaces that HAVE a cache policy: retryable/external failure modes of those surfaces that no degradation rule answers are exactly the "show stale from cache instead of failing" opportunities the cache was built for. WARNING, not CRITICAL — aspect-split calibration: no self-healing closer exists (closing it requires authoring, `/nacl-sa-uc resilience UC-NNN`), and a CRITICAL gate only manual work can clear is a gate people disable. **Anchored on `CACHES`, deliberately not on the error taxonomy** — a graph with errors but no cache layer stays silent here (vacuous-pass arm 2).

```cypher
// L13.7 -- Severity: WARNING
// Cached surfaces whose retryable/external errors no rule degrades
MATCH (cp:CachePolicy)-[:CACHES]->(api:APIEndpoint)-[:MAY_RAISE]->(err:DomainError)
WHERE (err.retryable = true OR err.error_kind = 'external')
  AND NOT EXISTS { MATCH (:DegradationRule)-[:ON_ERROR]->(err) }
RETURN DISTINCT api.id AS endpoint, err.id AS error, err.code AS code,
       'Cached surface has a retryable/external failure mode no degradation rule answers (run /nacl-sa-uc resilience UC-NNN for the exposing UC)' AS observation
```

#### Check 13.8: cached_data fallback not joined to any policy

The cache↔degradation join is deliberately edge-free (it already exists through the endpoint or the screen). A rule that promises cached data as its fallback but meets no CachePolicy through either path means the two halves describe the same resilience story without meeting in the graph. INFO — adoption-order tolerance (rules are often authored before the policies), mirrors L12.9.

```cypher
// L13.8 -- Severity: INFO
// cached_data rules that reach no CachePolicy via errors' raisers or the screen's calls
MATCH (dr:DegradationRule)
WHERE dr.fallback_kind = 'cached_data'
  AND NOT EXISTS {
        MATCH (dr)-[:ON_ERROR]->(:DomainError)<-[:MAY_RAISE]-(:APIEndpoint)<-[:CACHES]-(:CachePolicy)
      }
  AND NOT EXISTS {
        MATCH (dr)-[:DEGRADES_TO]->(:ScreenState)<-[:HAS_STATE]-(:Screen)
              -[:HAS_TRANSITION]->(:Transition)-[:TRIGGERS]->(:ScreenEffect)
              -[:CALLS]->(:APIEndpoint)<-[:CACHES]-(:CachePolicy)
      }
RETURN dr.id AS rule,
       'cached_data fallback meets no CachePolicy through its errors'' raisers or its screen''s calls (author the policy, or re-check the fallback kind)' AS observation
```

#### Check 13.9: Overlapping cache policies

Two policies caching the same endpoint with the same storage are two contradictory invalidation contracts for one surface. Different storages on one endpoint are normal layering (memory over indexed_db) — only same-storage pairs fire.

```cypher
// L13.9 -- Severity: WARNING
// Same endpoint, same storage, two policies
MATCH (cp1:CachePolicy)-[:CACHES]->(api:APIEndpoint)<-[:CACHES]-(cp2:CachePolicy)
WHERE cp1.id < cp2.id
  AND coalesce(cp1.storage_kind, '') = coalesce(cp2.storage_kind, '')
RETURN api.id AS endpoint, cp1.id AS policy_1, cp2.id AS policy_2,
       coalesce(cp1.storage_kind, '') AS storage_kind,
       'Two cache policies with the same storage cache the same endpoint — contradictory invalidation contracts' AS observation
```

---

## Validation Levels -- Cross-Layer (XL6-XL9)

These checks verify BA-to-SA traceability via handoff edges. They require both BA and SA layers to be populated in Neo4j.

### XL6: UC Coverage

**Goal:** Every automated BA WorkflowStep should have a corresponding SA UseCase via AUTOMATES_AS. Every SA UseCase should trace back to a BA step (or be marked as system-only).

#### Check XL6.1: Automated WorkflowSteps without AUTOMATES_AS edge

The stereotype string is documentation; the `AUTOMATES_AS` edge is the source of truth. To stay tolerant to language drift, accept both Russian (`'Автоматизируется'`) and English (`'Automated'`) stereotypes. The edge itself is the authoritative signal of intent -- if it exists, the step is automated regardless of stereotype text.

```cypher
// XL6.1 -- Severity: CRITICAL
// BA WorkflowSteps marked as automated that have no AUTOMATES_AS -> UseCase
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
WHERE coalesce(ws.stereotype, '') IN ['Автоматизируется', 'Automated']
  AND NOT (ws)-[:AUTOMATES_AS]->(:UseCase)
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.function_name AS ws_function,
       coalesce(ws.stereotype, '') AS stereotype,
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

A step counts as "automated" if it has either a stereotype (Russian or English) or an existing `AUTOMATES_AS` edge -- whichever signals intent. This avoids zero-coverage when stereotype text drifted but rebbing still got wired up.

```cypher
// XL6.4 -- Severity: INFO
// Summary: automated steps (stereotype OR edge-bearing) vs. covered steps
MATCH (ws:WorkflowStep)
WHERE coalesce(ws.stereotype, '') IN ['Автоматизируется', 'Automated']
   OR (ws)-[:AUTOMATES_AS]->(:UseCase)
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
// Roles marked system_only=true are infrastructure roles with no BA counterpart -- exempt
MATCH (sr:SystemRole)
WHERE NOT (:BusinessRole)-[:MAPPED_TO]->(sr)
  AND coalesce(sr.system_only, false) = false  -- REQUIRED FILTER: exempt infrastructure roles
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

1. Run Step 0 (canonical SA-layer node count). If graph is empty, STOP and advise the user.
2. Run Step 0a (schema-drift detection via `db.labels()` / `db.relationshipTypes()`). If non-canonical labels or `TRACES_TO` edges are detected without canonical counterparts, **HALT** and emit the drift report verbatim. Do NOT execute any further checks.
3. Run Step 0b (two-section node-count report) and include it in the report header.
4. Run Step 0c (BA-layer verification) to decide whether XL6-XL9 can run.
5. Run Step 0d (exemption-property coverage) and include the table in the report header.
6. Determine which levels to execute based on the `level` parameter and available data.

### Step 2: Execute validation levels

For each enabled level (L1 through L13, XL6 through XL9):

1. Run ALL Cypher queries for that level using `mcp__neo4j__read-cypher`.
2. Collect results into a structured list: `{level, check_id, severity, count, details[]}`.
3. If a query returns zero rows, that check PASSES.
4. If a query returns rows, each row is a problem -- assign the severity defined in the check.
5. **L8 scope:** in `--scope=intra-uc UC-NNN` runs, prefer L8.2 (scoped to the changed node's closure) over L8.1 (project-wide). L9 always runs project-wide (decision provenance is a global invariant).
6. **L10 scope:** in `--scope=intra-uc UC-NNN` runs, restrict L10 to the screens of the scoped UCs by prepending `MATCH (uc:UseCase)-[:HAS_SCREEN]->(scr:Screen) WHERE uc.id IN $ucIds` to each screen-anchored query. Run L10.3 before L10.5b (reachability assumes same-screen wiring, which 10.3 guarantees).
7. **L11 scope:** in `--scope=intra-uc UC-NNN` runs, restrict L11 to the slices of the scoped UCs by anchoring on `MATCH (uc:UseCase)-[:HAS_SLICE]->(sl:Slice) WHERE uc.id IN $ucIds`; for the non-anchored checks L11.0/L11.1, filter by the id family instead: `WHERE sl.id STARTS WITH 'SLC-' + <NNN> + '-'` (the UC-number infix makes every slice id of one UC match).
8. **L12 scope:** domain errors are NOT UC-scoped (shared vocabulary, Module parent) — the slice id-infix recipe does not apply. In `--scope=intra-uc UC-NNN` runs, restrict L12 to the errors raisable from the scoped UCs' endpoints: `MATCH (uc:UseCase)-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(err:DomainError) WHERE uc.id IN $ucIds` (and their presentations via `PRESENTED_AS`); when invoked from a producer run, prefer the explicit id list the run collected: `WHERE err.id IN $errIds`. The screen-keyed L12.7 and UC-keyed L12.9 carry no `err.id` — scope them by the UCs instead (L12.7 prefiltered to the scoped UCs' screens via `HAS_SCREEN`, L12.9 anchored on the scoped UCs).
9. **L13 scope (mixed recipe):** cache policies are NOT UC-scoped (shared vocabulary, Module parent) — in `--scope=intra-uc UC-NNN` runs restrict them to the policies caching the scoped UCs' surfaces: `MATCH (uc:UseCase)-[:EXPOSES]->(:APIEndpoint)<-[:CACHES]-(cp:CachePolicy) WHERE uc.id IN $ucIds`; when invoked from a producer run, prefer the explicit id list the run collected: `WHERE cp.id IN $cacheIds`. Degradation rules ARE UC-scoped — filter by the id family: `WHERE dr.id STARTS WITH 'DEG-' + <NNN> + '-'` (the UC-number infix, same recipe as SLC). The surface-keyed L13.7 carries no `cp.id` per row — prefilter it to the scoped UCs' endpoints via `EXPOSES`. L13.6–13.9 are WARNING/INFO — report, never block.

### Step 3: Aggregate results

After all levels complete:

1. Count problems by severity: CRITICAL, WARNING, INFO.
2. Determine overall status:
   - **PASS** -- zero CRITICAL, fewer than 5 WARNINGs
   - **WARN** -- zero CRITICAL, 5 or more WARNINGs
   - **FAIL** -- one or more CRITICALs
   - **If any check was SKIP'd** (query timeout, or an XL-level check skipped for a missing BA layer), the overall status MUST carry an `(incomplete: N checks skipped)` suffix and list the skipped checks — a skipped check is **unverified, not passed**, and absence of a CRITICAL from an unrun check must not read as a clean PASS.
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
| L7 | FeatureRequest Consistency | PASS/WARN/FAIL | N | N | N |
| L8 | Staleness Closure | PASS/WARN/FAIL | N | N | N |
| L9 | Decision Provenance | PASS/WARN/FAIL | N | N | N |
| L10 | Screen State Machines | PASS/WARN/FAIL | N | N | N |
| L11 | Behavior Slices | PASS/WARN/FAIL | N | N | N |
| L12 | Domain Error Taxonomy | PASS/WARN/FAIL | N | N | N |
| L13 | Cache & Degradation Policies | PASS/WARN/FAIL | N | N | N |
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

# Provenance + staleness (L8/L9):
- Decision (node), JUSTIFIES, SUPERSEDES, IMPLEMENTS (FeatureRequest->Decision)
- node properties: review_status, stale_reason, stale_since, stale_origin

# Screen state machines (L10):
- Screen, ScreenState, ScreenEvent, Transition, ScreenEffect, AnalyticsEvent
- edges: HAS_SCREEN, RENDERS, HAS_STATE, HAS_EVENT, HAS_TRANSITION,
  FROM_STATE, TO_STATE, ON_EVENT, TRIGGERS, CALLS, NAVIGATES_TO, EMITS
- exemption properties: Screen.formless, ScreenState.terminal

# Behavior slices (L11):
- Slice (node), edges: HAS_SLICE, COVERS, CALLS (source label-qualified), VERIFIED_BY
- node properties: slice_kind, then (observable outcome)
- no exemption properties (by design)

# Domain error taxonomy (L12):
- DomainError, ErrorPresentation (nodes)
- edges: HAS_ERROR, MAY_RAISE, HANDLES, PRESENTED_AS, SHOWS (all unshared names)
- node properties: code, error_kind, http_status, message, presentation_kind
- no exemption properties (by design)

# Cache & degradation policies (L13):
- CachePolicy, DegradationRule (nodes)
- edges: HAS_CACHE, CACHES, HAS_DEGRADATION, ON_ERROR, DEGRADES_TO (all unshared names)
- node properties: storage_kind, invalidation_kind, ttl_seconds, serves_stale,
  trigger_kind, behavior, fallback_kind (+ DomainError.retryable for L13.6/13.7)
- no exemption properties (by design)
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

### L7: FeatureRequest Consistency
- [ ] FR markdown files have matching :FeatureRequest nodes
- [ ] FeatureRequests have INCLUDES_UC edges (tombstones exempt)
- [ ] INCLUDES_UC kinds valid; no dangling UC references; no FR-id label collisions

### L8: Staleness Closure
- [ ] No node left with review_status='stale' (project-wide) — or scoped closure of the changed node is clean
- [ ] Stale nodes (if any) carry stale_origin / stale_since for lineage

### L9: Decision Provenance
- [ ] Every active FeatureRequest IMPLEMENTS a Decision
- [ ] Every non-superseded Decision JUSTIFIES at least one artifact
- [ ] No Decision has an empty rationale
- [ ] Superseded Decisions carry status='superseded'

### L10: Screen State Machines
- [ ] No orphaned Screen/ScreenState/ScreenEvent/Transition/ScreenEffect/AnalyticsEvent nodes
- [ ] Every extension node has its required parent edge (HAS_SCREEN / HAS_STATE / HAS_EVENT / HAS_TRANSITION / TRIGGERS / EMITS)
- [ ] Every Screen RENDERS a Form (or formless=true); every effect points at its kind-required target
- [ ] Every Transition has exactly one same-screen FROM_STATE / TO_STATE / ON_EVENT
- [ ] No ambiguous (from_state, on_event) pairs (determinism)
- [ ] Exactly one initial state per screen; all states reachable from it
- [ ] Error states have an escape transition (and ideally a user-triggered one)
- [ ] Effect edges target correct labels; kind vocabularies are canonical

### L11: Behavior Slices
- [ ] No orphaned Slice nodes
- [ ] Every Slice has its parent UseCase (HAS_SLICE)
- [ ] Every Slice has at least one behavioral anchor (COVERS -> ScreenState/Transition or CALLS -> APIEndpoint)
- [ ] COVERS targets belong to the slice's own UC; edge targets carry correct labels
- [ ] Every slice of a planned UC (GENERATES tasks) has VERIFIED_BY -> Task owned by that UC
- [ ] No slice with an empty `then`; slice_kind vocabulary canonical
- [ ] Machine-coverage gaps reviewed (WARNING); happy-path presence reviewed (INFO)

### L12: Domain Error Taxonomy
- [ ] No orphaned DomainError/ErrorPresentation nodes
- [ ] Every DomainError has its parent Module (HAS_ERROR); every ErrorPresentation its parent DomainError (PRESENTED_AS)
- [ ] Every DomainError is raisable (≥1 incoming MAY_RAISE); every ErrorPresentation is shown (≥1 incoming SHOWS)
- [ ] HANDLES edges run ScreenState -> DomainError and satisfy the channel rule (the screen actually calls a raising endpoint)
- [ ] MAY_RAISE / PRESENTED_AS / SHOWS edges target correct labels
- [ ] SHOWS triangle closed (no state shows a presentation of an unhandled error)
- [ ] No blank DomainError.code or ErrorPresentation.message; kind vocabularies canonical
- [ ] Handling gaps (WARNING) and unpresented handled errors (WARNING) reviewed; unjoined error slices reviewed (INFO)

### L13: Cache & Degradation Policies
- [ ] No orphaned CachePolicy/DegradationRule nodes
- [ ] Every CachePolicy has its parent Module (HAS_CACHE); every DegradationRule its parent UseCase (HAS_DEGRADATION)
- [ ] Every CachePolicy caches ≥1 APIEndpoint (CACHES); every DegradationRule has ≥1 anchor (ON_ERROR and/or DEGRADES_TO); error-triggered rules have ON_ERROR
- [ ] DEGRADES_TO targets belong to the rule's own UC; error-triggered rules satisfy the channel rule (the degraded screen actually calls a raising endpoint)
- [ ] HAS_CACHE / CACHES / HAS_DEGRADATION / ON_ERROR / DEGRADES_TO edges target correct labels
- [ ] No blank invalidation_kind or behavior; ttl policies carry ttl_seconds; kind vocabularies canonical
- [ ] Retryable consistency reviewed (WARNING); cached-surface degradation gaps reviewed (WARNING); unjoined cached_data rules reviewed (INFO); overlapping policies reviewed (WARNING)

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

---

## Migration Cypher Appendix

If Step 0a (schema-drift detection) halts validation because the graph uses non-canonical labels (`:SAModule`, `:SAEntity`, `:SARequirement`, `:SAActor`, `:SAComponent`) or non-canonical handoff edges (`TRACES_TO`), use the cypher block below to migrate the graph to the canonical schema. The migration is idempotent -- running it on an already-canonical graph is a no-op.

**Prerequisites:**
- Backup the Neo4j database (or work on a clone). Label/edge renames are not trivially reversible.
- APOC procedures available (`apoc.refactor.rename.label`, `apoc.refactor.setType`).
- Run via `mcp__neo4j__write-cypher`. This is a **write operation** -- the validator itself never executes it; the user (or an upstream skill) does.

### Step 1: Rename node labels

```cypher
// Rename SAModule -> Module
MATCH (n:SAModule)
CALL apoc.refactor.rename.label('SAModule', 'Module', [n]) YIELD batches
RETURN 'SAModule -> Module' AS step, sum(batches) AS batches
```

```cypher
MATCH (n:SAEntity)
CALL apoc.refactor.rename.label('SAEntity', 'DomainEntity', [n]) YIELD batches
RETURN 'SAEntity -> DomainEntity' AS step, sum(batches) AS batches
```

```cypher
MATCH (n:SARequirement)
CALL apoc.refactor.rename.label('SARequirement', 'Requirement', [n]) YIELD batches
RETURN 'SARequirement -> Requirement' AS step, sum(batches) AS batches
```

```cypher
MATCH (n:SAActor)
CALL apoc.refactor.rename.label('SAActor', 'SystemRole', [n]) YIELD batches
RETURN 'SAActor -> SystemRole' AS step, sum(batches) AS batches
```

```cypher
MATCH (n:SAComponent)
CALL apoc.refactor.rename.label('SAComponent', 'Component', [n]) YIELD batches
RETURN 'SAComponent -> Component' AS step, sum(batches) AS batches
```

### Step 2: Convert TRACES_TO edges to canonical handoff edges

`TRACES_TO` is a generic placeholder; canonical schema uses four distinct edge types depending on the (source, target) label pair. Run the four blocks below in any order; each one only matches its intended pair.

```cypher
// BusinessProcess -[TRACES_TO]-> Module  =>  SUGGESTS
MATCH (bp:BusinessProcess)-[r:TRACES_TO]->(m:Module)
CALL apoc.refactor.setType(r, 'SUGGESTS') YIELD output
RETURN 'BP-TRACES_TO->Module renamed to SUGGESTS' AS step, count(output) AS edges
```

```cypher
// BusinessEntity -[TRACES_TO]-> DomainEntity  =>  REALIZED_AS
MATCH (be:BusinessEntity)-[r:TRACES_TO]->(de:DomainEntity)
CALL apoc.refactor.setType(r, 'REALIZED_AS') YIELD output
RETURN 'BE-TRACES_TO->DE renamed to REALIZED_AS' AS step, count(output) AS edges
```

```cypher
// BusinessRole -[TRACES_TO]-> SystemRole  =>  MAPPED_TO
MATCH (br:BusinessRole)-[r:TRACES_TO]->(sr:SystemRole)
CALL apoc.refactor.setType(r, 'MAPPED_TO') YIELD output
RETURN 'BR-TRACES_TO->SR renamed to MAPPED_TO' AS step, count(output) AS edges
```

```cypher
// BusinessRule -[TRACES_TO]-> Requirement  =>  IMPLEMENTED_BY
MATCH (brule:BusinessRule)-[r:TRACES_TO]->(req:Requirement)
CALL apoc.refactor.setType(r, 'IMPLEMENTED_BY') YIELD output
RETURN 'BR-TRACES_TO->Req renamed to IMPLEMENTED_BY' AS step, count(output) AS edges
```

```cypher
// WorkflowStep -[TRACES_TO]-> UseCase  =>  AUTOMATES_AS
MATCH (ws:WorkflowStep)-[r:TRACES_TO]->(uc:UseCase)
CALL apoc.refactor.setType(r, 'AUTOMATES_AS') YIELD output
RETURN 'WS-TRACES_TO->UC renamed to AUTOMATES_AS' AS step, count(output) AS edges
```

```cypher
// EntityAttribute -[TRACES_TO]-> DomainAttribute  =>  TYPED_AS
MATCH (ea:EntityAttribute)-[r:TRACES_TO]->(da:DomainAttribute)
CALL apoc.refactor.setType(r, 'TYPED_AS') YIELD output
RETURN 'EA-TRACES_TO->DA renamed to TYPED_AS' AS step, count(output) AS edges
```

### Step 3: Surface unmapped TRACES_TO edges (if any)

After steps 1-2, any remaining `TRACES_TO` edges connect node-pairs the canonical schema doesn't define. Decide per-case: drop or keep.

```cypher
MATCH (a)-[r:TRACES_TO]->(b)
RETURN labels(a) AS source_labels, labels(b) AS target_labels, count(r) AS remaining
```

### Step 4: Re-run validation

```
/nacl-sa-validate full
```

Step 0a should now PASS the drift check, and L1-L13 / XL6-XL9 will execute against the canonical labels.

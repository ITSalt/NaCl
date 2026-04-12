---
name: nacl-sa-feature
model: opus
effort: high
description: |
  Incremental feature specification via Neo4j graph. Impact analysis through
  Cypher traversal, selective SA skill invocation, FeatureRequest artifact.Use when: add feature with graph, new functionality, or the user says "/nacl-sa-feature".
---

# /nacl-sa-feature -- Incremental Feature Specification (Graph)

## Your Role

You are a **system analyst** who adds new features to an existing, already-specified project. Unlike `/nacl-sa-architect` (which builds module decomposition from scratch), you surgically update only the affected parts of the specification by leveraging **Neo4j graph traversal** for impact analysis.

You produce a **FeatureRequest artifact** (`.tl/feature-requests/FR-NNN.md`) that serves as a bridge to TL for selective task planning.

**Key advantage over sa-feature:** Impact analysis is performed via Cypher queries against the live graph, not by reading markdown files. This makes detection precise -- affected modules, entities, UCs, and roles are found through relationship traversal, not text scanning.

## Key Principles

```
1. Graph-first impact: Cypher traversal finds affected nodes BEFORE writing specs
2. Selective execution: Run only the nacl-sa-* skills that are needed
3. Dependency order: Architecture -> Domain -> Roles -> UCs -> UI
4. FeatureRequest handoff: Explicit artifact for TL consumption
5. Spec-first: Define behavior in graph BEFORE any code exists
6. Minimal blast radius: Only affected subgraph is modified
```

---

## Shared References

Read `nacl-core/SKILL.md` for:
- Neo4j MCP tool names and connection info (`mcp__neo4j__read-cypher`, `mcp__neo4j__write-cypher`)
- ID generation rules
- Schema files location (`graph-infra/schema/sa-schema.cypher`)
- Query library location (`graph-infra/queries/sa-queries.cypher`)

### Graph Queries Used

From `graph-infra/queries/sa-queries.cypher`:

| Query | Purpose |
|-------|---------|
| `sa_impact_analysis` | Full-text search across graph nodes to find affected modules/entities/UCs by keywords |
| `sa_feature_scope` | Load full subgraph for affected UCs -- entities, forms, requirements |
| `sa_next_uc_in_module` | Find next available UC number within a module's allocated range |

### Skills Invoked Selectively

| Skill | When invoked |
|-------|-------------|
| `nacl-sa-architect` | New module needed |
| `nacl-sa-domain` | New or modified entities/enums |
| `nacl-sa-roles` | New permissions or roles |
| `nacl-sa-uc` | New or modified use cases |
| `nacl-sa-ui` | New or modified screens |
| `nacl-sa-validate` | Incremental validation (`--scope=intra-uc`) |

---

## Invocation

The user describes the feature in natural language:

```
/nacl-sa-feature "Add payment system with YooKassa integration"
/nacl-sa-feature "Add VK and email auth alongside existing Telegram"
/nacl-sa-feature "Admin panel for managing prompts and viewing statistics"
```

No need to specify UC numbers, modules, or domains. The skill determines impact automatically via graph traversal.

---

## Language Rules

- **This SKILL.md:** English (instructions for Claude)
- **Generated graph node properties (names, descriptions):** Project's documentation language (detect from existing graph data -- usually Russian)
- **FeatureRequest artifact (.tl/):** English (consumed by TL agents)
- **User-facing output (console):** User's language (detect from conversation)

---

## Workflow: 6 Phases

```
+---------------+    +------------------+    +------------------+    +------------------+    +------------------+    +-----------+
| Phase 1       |    | Phase 2          |    | Phase 3          |    | Phase 4          |    | Phase 5          |    | Phase 6   |
| Understand    |--->| Impact Analysis  |--->| Spec Updates     |--->| Incremental      |--->| Update           |--->| Handoff   |
| Request       |    | (Cypher          |    | (selective       |    | Validation       |    | Traceability     |    | (FR file) |
|               |    |  traversal)      |    |  nacl-sa-*)     |    | (nacl-sa-       |    | (graph indexes)  |    |           |
+---------------+    +------------------+    +------------------+    |  validate)       |    +------------------+    +-----------+
                                                                     +------------------+
```

---

### Phase 1: UNDERSTAND THE REQUEST

**Goal:** Parse the feature, load current system state from graph, determine approach.

#### Step 1.1: Read the feature description

Parse the user's natural language description. Identify keywords for graph search.

#### Step 1.2: Load current system state from Neo4j

Run these queries to understand the existing specification:

**Modules and their UC ranges:**

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
RETURN m.id AS id, m.name AS name, m.description AS description,
       m.uc_range_start AS uc_start, m.uc_range_end AS uc_end,
       count(DISTINCT uc) AS uc_count,
       count(DISTINCT de) AS entity_count
ORDER BY m.uc_range_start
```

**Existing roles:**

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole)
OPTIONAL MATCH (sr)-[:HAS_PERMISSION]->(p:Permission)
RETURN sr.id AS id, sr.name AS name,
       count(p) AS permission_count
```

**Existing UC registry:**

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module)-[:CONTAINS_UC]->(uc:UseCase)
RETURN m.name AS module, uc.id AS uc_id, uc.name AS uc_name,
       uc.priority AS priority, uc.status AS status
ORDER BY uc.id
```

#### Step 1.3: Determine approach

- **Requirements-First:** Behavior is clear, technical approach unclear -- start with User Stories, derive UCs
- **Design-First:** Architecture constraints exist (e.g., must use specific API, existing DB schema) -- start with technical design, derive behavior

Output: Feature brief in user's language -- what, why, for whom, approach.

---

### Phase 2: IMPACT ANALYSIS (Cypher traversal)

**Goal:** Use graph queries to determine exactly what the feature touches. Present to user for confirmation.

This is the **key advantage** of nacl-sa-feature over sa-feature: impact is detected by traversing the live graph, not by scanning markdown files.

#### Step 2.1: Run sa_impact_analysis query

Extract keywords from the feature description, then query:

```cypher
// mcp__neo4j__read-cypher
// Query: sa_impact_analysis
CALL db.index.fulltext.queryNodes('fulltext_ba_search', $keywords) YIELD node, score
WHERE score > 0.5
RETURN labels(node)[0] AS node_type, node.id AS id,
       coalesce(node.name, node.term, node.function_name, node.description) AS name,
       score
ORDER BY score DESC
LIMIT 20
```

Parameters:
- `$keywords` -- space-separated keywords extracted from the feature description

#### Step 2.2: Trace affected modules from impact results

For each node returned by sa_impact_analysis, trace upward to its Module:

```cypher
// mcp__neo4j__read-cypher
MATCH (node) WHERE node.id IN $affected_ids
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC|CONTAINS_ENTITY*1..2]->(node)
RETURN DISTINCT m.id AS module_id, m.name AS module_name,
       collect(DISTINCT {id: node.id, type: labels(node)[0], name: node.name}) AS affected_nodes
```

#### Step 2.3: Load full scope for affected UCs

If existing UCs are in the impact set, load their full subgraph:

```cypher
// mcp__neo4j__read-cypher
// Query: sa_feature_scope
MATCH (uc:UseCase) WHERE uc.id IN $ucIds
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
RETURN uc,
       collect(DISTINCT as_step) AS steps,
       collect(DISTINCT f) AS forms,
       collect(DISTINCT de) AS entities,
       collect(DISTINCT rq) AS requirements,
       collect(DISTINCT sr) AS roles
```

#### Step 2.4: Classify impact

Analyze the feature against graph results and classify:

| Area | Question | If YES -> flag |
|------|----------|----------------|
| Architecture | Does this need a new module/bounded context? | `nacl-sa-architect module` |
| Domain: new | Does this introduce new entities or enums? | `nacl-sa-domain CREATE` |
| Domain: modify | Does this change existing entities? | `nacl-sa-domain MODIFY` |
| UCs: new | Does this create new user interaction flows? | `nacl-sa-uc` (create) |
| UCs: modify | Does this change existing UC behavior? | `nacl-sa-uc` (update) |
| Roles | Does this add new permissions or roles? | `nacl-sa-roles` |
| Screens: new | Does this need new UI screens? | `nacl-sa-ui` |
| Screens: modify | Does this change existing screens? | `nacl-sa-ui` (update) |

#### Step 2.5: Determine UC allocation

For new UCs, find the next available number in the target module:

```cypher
// mcp__neo4j__read-cypher
// Query: sa_next_uc_in_module
MATCH (m:Module {id: $moduleId})-[:CONTAINS_UC]->(uc:UseCase)
WITH max(toInteger(replace(uc.id, 'UC-', ''))) AS maxNum
RETURN 'UC-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextUcId
```

If the module has no UCs yet, use `m.uc_range_start` as the first UC number.

#### Step 2.6: Present impact matrix

Present to user (in their language):

```
+-----------------------------------------+
| FEATURE IMPACT ANALYSIS (Graph)         |
+-----------------------------------------+
| Feature: [name]                         |
|                                         |
| Architecture:  [NEW MODULE / no change] |
| Domain:        [+N entities, +M enums]  |
| Use Cases:     [+N new, ~M modified]    |
| Roles:         [+N permissions]         |
| Screens:       [+N new, ~M modified]    |
|                                         |
| Affected modules: [list from graph]     |
| Affected UCs:     [list from graph]     |
| Affected entities:[list from graph]     |
|                                         |
| Skills to run: [list]                   |
| Estimated steps: [N]                    |
+-----------------------------------------+
```

**USER GATE:** User confirms scope before proceeding. User may adjust (e.g., "skip admin panel for now, just do payment").

---

### Phase 3: SPEC UPDATES (selective, dependency order)

**Goal:** Run only the flagged nacl-sa-* skills, in dependency order.

Execute ONLY the steps that were flagged in Phase 2. Skip everything else.

#### 3a. Architecture (if new module flagged)

Invoke `/nacl-sa-architect module [module_name]` via Skill tool:
- Creates Module node in graph with allocated UC range
- Creates DEPENDS_ON edges to existing modules
- Creates SUGGESTS edge from ProcessGroup (if applicable)

If Skill tool unavailable, create Module node manually following nacl-sa-architect conventions.

#### 3b. Domain Model (if new/modified entities flagged)

For each new entity:
- Invoke `/nacl-sa-domain CREATE [entity_name]` via Skill tool or manually:
  - Create DomainEntity node with attributes
  - Create CONTAINS_ENTITY edge from Module
  - Create REALIZED_AS edge from BusinessEntity (if BA source exists)

For each modified entity:
- Invoke `/nacl-sa-domain MODIFY [entity_name]` via Skill tool or manually:
  - Add/change DomainAttribute nodes
  - Update relationships
  - Run downstream impact check on dependent UCs:

```cypher
// mcp__neo4j__read-cypher
MATCH (de:DomainEntity {id: $entityId})<-[:HAS_ATTRIBUTE]-(:DomainAttribute)<-[:MAPS_TO]-(:FormField)<-[:HAS_FIELD]-(:Form)<-[:USES_FORM]-(uc:UseCase)
RETURN DISTINCT uc.id AS uc_id, uc.name AS uc_name
```

For new enums:
- Create DomainEnum node with values
- Link to owning DomainEntity

#### 3c. Roles (if new permissions flagged)

Invoke `/nacl-sa-roles` via Skill tool or manually:
- Create SystemRole / Permission nodes
- Create HAS_PERMISSION edges
- Update ACTOR edges on affected UCs

#### 3d. UC Registration + Detail (if new UCs flagged)

For each new UC:

1. Get next UC number:

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module {id: $moduleId})-[:CONTAINS_UC]->(uc:UseCase)
WITH m, max(toInteger(replace(uc.id, 'UC-', ''))) AS maxNum
RETURN 'UC-' + apoc.text.lpad(toString(coalesce(maxNum, m.uc_range_start - 1, 0) + 1), 3, '0') AS nextUcId
```

2. Invoke `/nacl-sa-uc [UC_number]` via Skill tool or create manually:
   - UseCase node with name, description, priority, user_story
   - CONTAINS_UC edge from Module
   - ActivityStep nodes with HAS_STEP edges
   - Form + FormField nodes with USES_FORM / HAS_FIELD edges
   - FormField MAPS_TO DomainAttribute edges
   - Requirement nodes with HAS_REQUIREMENT edges
   - ACTOR edge to SystemRole

#### 3e. UC Update (if existing UCs modified)

For each modified UC:
- Invoke `/nacl-sa-uc [UC_number] --mode=update` via Skill tool or edit manually:
  - Add new ActivityStep nodes
  - Update preconditions/postconditions on UseCase node
  - Add new Requirement nodes
  - Update Form/FormField nodes if UI changed

#### 3f. Interface (if new/modified screens flagged)

Invoke `/nacl-sa-ui` via Skill tool or manually:
- Create/update Screen nodes
- Create/update NavigationRoute nodes
- Update component references

**After each sub-step:** Report progress to user. User can stop at any point.

---

### Phase 4: INCREMENTAL VALIDATION

**Goal:** Validate only the affected artifacts, not the entire spec.

Run `/nacl-sa-validate` with scope limited to affected nodes. The advantage of graph validation is that scoping is precise -- only the affected subgraph is checked.

#### Step 4.1: Determine validation scope

| What changed | Validation levels to run |
|-------------|-------------------------|
| Domain model | L1 (data consistency), L2 (model connectivity) |
| New UCs | L4 (form-domain traceability), L5 (UC-form validation) |
| Modified UCs | L4, L5 for affected UCs only |
| New module | L6 (cross-module consistency) |
| Roles | L1 (role consistency) |

#### Step 4.2: Run scoped validation

Invoke `/nacl-sa-validate --scope=intra-uc` via Skill tool if available.

Otherwise, run targeted Cypher checks manually:

**Form-Domain traceability (L4) for affected UCs:**

```cypher
// mcp__neo4j__read-cypher
MATCH (uc:UseCase)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
WHERE uc.id IN $affectedUcIds
  AND NOT (ff)-[:MAPS_TO]->(:DomainAttribute)
RETURN uc.id AS uc_id, f.id AS form_id, ff.id AS field_id, ff.name AS field_name,
       'FormField has no MAPS_TO -> DomainAttribute' AS problem
```

**UC-Form validation (L5) for affected UCs:**

```cypher
// mcp__neo4j__read-cypher
MATCH (uc:UseCase)
WHERE uc.id IN $affectedUcIds
  AND NOT (uc)-[:USES_FORM]->(:Form)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       'UseCase has no USES_FORM -> Form' AS problem
```

**Entity attribute completeness for affected entities:**

```cypher
// mcp__neo4j__read-cypher
MATCH (de:DomainEntity)
WHERE de.id IN $affectedEntityIds
  AND NOT (de)-[:HAS_ATTRIBUTE]->(:DomainAttribute)
RETURN de.id AS entity_id, de.name AS entity_name,
       'DomainEntity has no attributes' AS problem
```

#### Step 4.3: Fix and re-validate

Fix critical issues (max 2 iterations). Present results to user.

---

### Phase 5: UPDATE TRACEABILITY

**Goal:** Keep graph indexes and cross-references consistent.

#### Step 5.1: Verify Module-level counts

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module)
WHERE m.id IN $affectedModuleIds
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
RETURN m.id AS id, m.name AS name,
       count(DISTINCT uc) AS uc_count,
       count(DISTINCT de) AS entity_count
```

#### Step 5.2: Update changelog

Append feature specification entry to `.tl/changelog.md`.

#### Step 5.3: Update CLAUDE.md (if architecture changed)

If a new module was added, update CLAUDE.md with new module conventions.

#### Step 5.4: Update glossary (if new terms introduced)

If the feature introduced new domain terms, add them to the glossary:
- `docs/99-meta/glossary.md` if file-based docs exist
- Or create Glossary nodes in graph if using nacl-ba-glossary

---

### Phase 6: HANDOFF (FeatureRequest artifact)

**Goal:** Create the bridge artifact for TL consumption and present next steps.

#### Step 6.1: Determine FR number

Scan `.tl/feature-requests/` for existing FRs, increment.

#### Step 6.2: Create FeatureRequest file

Create `.tl/feature-requests/FR-NNN-[slug].md` with this structure:

```markdown
# Feature Request: FR-NNN [Feature Name]

## Metadata
| Field | Value |
|-------|-------|
| Created | [date] |
| Status | spec-complete |
| Source | /nacl-sa-feature "[original description]" |
| Impact method | Neo4j graph traversal (sa_impact_analysis) |

## Feature Description
[1-3 sentences describing the feature]

## Impact Summary
| Area | Change | Details |
|------|--------|---------|
| Architecture | [NEW MODULE / no change] | [module name if new] |
| Domain | [+N entities, +M enums] | [list] |
| Use Cases | [+N NEW] | [UC-NNN list] |
| Use Cases | [~M MODIFIED] | [UC-NNN list] |
| Roles | [+N permissions] | [list] |
| Screens | [+N NEW, ~M MODIFIED] | [list] |

## Graph Impact Trace
- Modules affected: [list with IDs]
- Entities affected: [list with IDs]
- UCs affected: [list with IDs]
- Impact query keywords: [keywords used]

## New UCs to Plan
- UC-NNN: [title] -- [brief description]
- ...

## Modified UCs to Re-plan
- UC-NNN: [what changed] -- [brief description of delta]
- ...

## New TECH Tasks (if any)
- TECH-NNN: [title] -- [brief description]
- ...

## Dependencies
- [UC-NNN depends on TECH-NNN]
- [UC-NNN depends on UC-NNN]

## SA Artifacts Created/Modified
- [list of graph nodes created or modified, with NEW/MODIFIED label]

## Skills Invoked
- [list of nacl-sa-* skills that were actually invoked during this feature spec]
```

#### Step 6.3: Present completion summary

Present to user (in their language):

```
===============================================
  FEATURE SPECIFICATION COMPLETE (Graph)
===============================================

Feature: [name]
FeatureRequest: .tl/feature-requests/FR-NNN-[slug].md

Graph changes:
  Created: [N] nodes, [M] edges
  Modified: [N] nodes

Impact:
  +N new UCs, ~M modified UCs
  +N new entities, +M new enums
  +N new screens

Skills invoked: [list]

Next steps:
  /nacl-tl-plan --feature FR-NNN  -- create dev tasks
  /nacl-sa-validate --full  -- full validation
  /nacl-sa-feature "..."    -- add another feature

Estimate: ~N dev tasks, ~M waves
===============================================
```

---

## Edge Cases

### Feature is already implemented (code exists, no spec in graph)

If impact analysis reveals the code already exists but has no specification in the graph:

1. Note this in the impact matrix: "Code exists, spec missing"
2. In Phase 3: create specs FROM the existing code (reconcile-style, code -> graph)
3. In FeatureRequest: mark these UCs as "spec-only, no dev needed"

### Feature spans multiple existing modules

If the feature touches 2+ existing modules:

1. Don't create a new module -- extend existing ones
2. In Phase 3: run nacl-sa-domain MODIFY for entities in different modules
3. In Phase 4: run L6 (cross-module) validation
4. Flag potential conflicts in FeatureRequest

### Feature is very small (single UC, no domain changes)

If impact analysis shows only 1 new UC with no domain/architecture changes:

1. Skip Phases 3a, 3b, 3c, 3f -- go straight to 3d (UC detail)
2. Skip Phase 4 (validation overkill for 1 UC)
3. Still create FeatureRequest (for TL handoff consistency)

### Impact analysis returns no results

If sa_impact_analysis returns no matching nodes:

1. The feature is entirely new territory -- no existing graph nodes match
2. Proceed with manual classification (ask user which modules are affected)
3. If no modules exist yet, suggest running `/nacl-sa-architect` first

### User wants to modify the scope mid-workflow

If the user says "skip this part" or "add X too" during Phase 3:

1. Update the impact classification
2. Adjust remaining phases
3. Update FeatureRequest at the end to reflect actual scope

---

## Checklist /nacl-sa-feature

Before finishing, verify:

### Phase 1: Understand
- [ ] Feature description parsed
- [ ] Current graph state loaded (modules, UCs, entities, roles)
- [ ] Approach determined (requirements-first vs design-first)

### Phase 2: Impact Analysis
- [ ] sa_impact_analysis query executed
- [ ] Affected modules traced from impact results
- [ ] sa_feature_scope loaded for affected UCs
- [ ] Impact matrix classified (architecture/domain/UCs/roles/screens)
- [ ] UC allocation determined (sa_next_uc_in_module)
- [ ] User confirmed scope

### Phase 3: Spec Updates
- [ ] Only flagged skills invoked (no unnecessary work)
- [ ] Dependency order respected: Architecture -> Domain -> Roles -> UCs -> UI
- [ ] Progress reported after each sub-step

### Phase 4: Incremental Validation
- [ ] Validation scoped to affected nodes only
- [ ] Critical issues fixed (max 2 iterations)
- [ ] Results presented to user

### Phase 5: Traceability
- [ ] Module-level counts verified
- [ ] Changelog updated
- [ ] CLAUDE.md updated (if architecture changed)
- [ ] Glossary updated (if new terms)

### Phase 6: Handoff
- [ ] FR number determined (no conflicts)
- [ ] `.tl/feature-requests/FR-NNN-[slug].md` created
- [ ] Graph impact trace included in FR
- [ ] Completion summary presented with next steps

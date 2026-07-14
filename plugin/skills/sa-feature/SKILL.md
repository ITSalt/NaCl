---
name: sa-feature
model: opus
effort: high
description: |
  Incremental feature specification via Neo4j graph. Impact analysis through
  Cypher traversal, selective SA skill invocation, FeatureRequest artifact.Use when: add feature with graph, new functionality, or the user says "/nacl:sa-feature".
---

# /nacl:sa-feature -- Incremental Feature Specification (Graph)

## Your Role

You are a **system analyst** who adds new features to an existing, already-specified project. Unlike `/nacl:sa-architect` (which builds module decomposition from scratch), you surgically update only the affected parts of the specification by leveraging **Neo4j graph traversal** for impact analysis.

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

Read `${CLAUDE_PLUGIN_ROOT}/nacl-core/SKILL.md` for:
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
/nacl:sa-feature "Add payment system with YooKassa integration"
/nacl:sa-feature "Add VK and email auth alongside existing Telegram"
/nacl:sa-feature "Admin panel for managing prompts and viewing statistics"
```

No need to specify UC numbers, modules, or domains. The skill determines impact automatically via graph traversal.

### Flags

| Flag | Description |
|------|-------------|
| `--namespace=<DOMAIN>` | Optional FR sub-namespace allocation |
| `--bounded-only` | (2.10.1+) Refuse to draft a feature spec that exceeds the bounded execution envelope. Used by `/nacl-goal intake` for FEATURE_SMALL atoms — see `## --bounded-only mode` below. |

## --bounded-only mode (2.10.1+)

When invoked with `--bounded-only`, this skill checks the proposed feature against an envelope of constraints BEFORE drafting any new UC/spec. If the feature exceeds the envelope, this skill refuses with a structured output instead of producing a partial spec; if within the envelope, the standard skill flow runs unchanged.

### Refuse criteria (any one triggers `BOUNDED REFUSE`)

The feature exceeds the envelope when ANY of the following holds:

- **Migration required** — would require a DB schema migration, a public-API contract change, a message-contract change, or any other non-additive backwards-incompatibility
- **Auth/security/permissions touched** — modifies authentication, authorization, the permission matrix, or any security-policy surface
- **Billing/payment touched** — adds, modifies, or removes pricing, payment flow, invoicing, or any monetization surface
- **L2/L3 architecture amendment** — changes bounded-context boundaries, cross-module contracts, or the system's macro architecture (Context Map level)
- **Destructive data operation** — bulk delete, data migration that loses information, backup-incompatible change
- **Unresolved product decision** — feature spec requires the human to choose between alternatives (e.g. "should pricing be tier-based or usage-based?") that this skill cannot resolve from graph evidence alone

### Refuse output

When refused, this skill writes TWO artifacts to `.tl/goal-runs/<NACL_GOAL_RUN_ID>/planning/` (if `NACL_GOAL_RUN_ID` is set; otherwise to `.tl/feature-plans/<sanitized-feature-slug>/`) and exits with headline `FEATURE BOUNDED REFUSE`:

1. **`feature-plan.md`** — what this skill understood from the feature description:
   - Candidate UCs that would need to be created or modified
   - Suggested module placement
   - Identified affected entities and existing UCs
   - Suggested NFRs from existing patterns
   - Missing inputs the human needs to provide

2. **`open-decisions.md`** — explicit decision points requiring human input:
   - Each decision as a bullet with: alternatives, trade-offs, suggested-but-not-chosen default
   - Migration-impact notes if any
   - Security/billing/permissions impact notes if any

The human reviews these artifacts and either:
- Resolves the decisions and re-runs `/nacl:sa-feature` interactively (without `--bounded-only`) to draft the full spec, OR
- Narrows the feature to a bounded subset and re-runs `/nacl-goal intake "<narrower goal>"` for autonomous execution

### Accept path

When the feature is within the envelope, `--bounded-only` runs the standard skill flow without modification — the same FR allocation, UC drafting, graph persistence, and handoff that an interactive invocation produces. The only difference: this skill records `bounded_only: true` in the FR artifact metadata so downstream skills (`/nacl:tl-dev*`) know the feature was constrained.

### Invariant

When `--bounded-only` is NOT passed, this skill behaves exactly as today (drafts whatever the feature description implies, prompts the user for clarifications). Interactive `/nacl:sa-feature "..."` is unaffected. The bounded mode is opt-in by the orchestrator, not the default.

## Goal-context env vars (2.10.1+)

When this skill is invoked under `/nacl-goal intake`, the wrapper exports `NACL_GOAL_RUN_ID`, `NACL_GOAL_BRANCH`, `NACL_SHIP_MODE=append`, `NACL_GOAL_BUDGET_FILE`. The bounded-mode refuse output writes to `.tl/goal-runs/<NACL_GOAL_RUN_ID>/planning/` (see above). On accept, the wrapper subsequently invokes `/nacl:tl-dev --auto-ship` for implementation, inheriting the env vars and triggering append-mode ship.

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
| UI: new | Does this need new forms or UI components? | `nacl-sa-uc` (creates Form/FormField) + `nacl-sa-ui` (creates Component, including `component_type='navigation'`) |
| UI: modify | Does this change existing forms or components? | `nacl-sa-ui` (update) |

> **Note on UI terminology.** The SA schema (`graph-infra/schema/sa-schema.cypher`) does **not** define `Screen` or `NavigationRoute` labels. UI is modeled as `Form` + `FormField` + `Component`. Navigation is a `Component` with `component_type='navigation'` and `route`/`roles`/`menu_order`/`parent_menu` properties, linked to `Form` via `USED_IN`. Trace path: `UseCase -[USES_FORM]-> Form -[HAS_FIELD]-> FormField -[MAPS_TO]-> DomainAttribute`.

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
| UI: Forms      [+N new, ~M modified]    |
| UI: Components [+N new, ~M modified]    |
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

Invoke `/nacl:sa-architect module [module_name]` via Skill tool:
- Creates Module node in graph with allocated UC range
- Creates DEPENDS_ON edges to existing modules
- Creates SUGGESTS edge from ProcessGroup (if applicable)

If Skill tool unavailable, create Module node manually following nacl-sa-architect conventions.

#### 3b. Domain Model (if new/modified entities flagged)

For each new entity:
- Invoke `/nacl:sa-domain CREATE [entity_name]` via Skill tool or manually:
  - Create DomainEntity node with attributes
  - Create CONTAINS_ENTITY edge from Module
  - Create REALIZED_AS edge from BusinessEntity (if BA source exists)

For each modified entity:
- Invoke `/nacl:sa-domain MODIFY [entity_name]` via Skill tool or manually:
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

Invoke `/nacl:sa-roles` via Skill tool or manually:
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

2. Invoke `/nacl:sa-uc [UC_number]` via Skill tool or create manually:
   - UseCase node with name, description, priority, user_story
   - CONTAINS_UC edge from Module
   - ActivityStep nodes with HAS_STEP edges
   - Form + FormField nodes with USES_FORM / HAS_FIELD edges
   - FormField MAPS_TO DomainAttribute edges
   - Requirement nodes with HAS_REQUIREMENT edges
   - ACTOR edge to SystemRole

#### 3e. UC Update (if existing UCs modified)

For each modified UC:
- Invoke `/nacl:sa-uc [UC_number] --mode=update` via Skill tool or edit manually:
  - Add new ActivityStep nodes
  - Update preconditions/postconditions on UseCase node
  - Add new Requirement nodes
  - Update Form/FormField nodes if UI changed

#### 3f. Interface (if new/modified UI flagged)

Invoke `/nacl:sa-ui` via Skill tool or manually. The schema for UI is `Form/FormField/Component` — there are no `Screen` or `NavigationRoute` labels:
- Run `nacl-sa-ui verify` to confirm `FormField -[MAPS_TO]-> DomainAttribute` traceability for affected UCs
- Run `nacl-sa-ui components` to create/update `Component` nodes (display, layout, input, feedback) and `[:USED_IN]->Form` edges
- Run `nacl-sa-ui navigation` to create/update `Component {component_type:'navigation', route, roles, menu_order, parent_menu}` for UCs with UI

**After each sub-step:** Report progress to user. User can stop at any point.

#### 3g. Mark change provenance (spec_version + staleness)

After all spec updates land, record the change in the graph so downstream
planning and closure skills can detect what must be revisited. This is the
mechanism behind "pull one thread → see everything": the change stamps its
dependents, and they stay stamped until re-synced.

1. Bump `spec_version` on every created/modified UC so `nacl-tl-plan` can detect
   tasks that were planned from an older version:

```cypher
// mcp__neo4j__write-cypher
// Params: $affectedUcIds — new + modified UC ids from Phase 2/3
MATCH (uc:UseCase) WHERE uc.id IN $affectedUcIds
SET uc.spec_version = coalesce(uc.spec_version, 0) + 1,
    uc.updated_at   = datetime()
```

2. Stamp staleness on the **true downstream** of the change: the affected UCs'
   generated `Task`s (the snapshot-bearers that re-plan regenerates), the `Task`s
   of UCs that transitively depend on them, and the affected UCs themselves.

   **Use the affected-UC list (`$affectedUcIds`) — NOT the broad undirected
   closure.** `sa_impact_closure` is deliberately broad for *exploration/display*
   ("what's potentially related"); the *stamp* gates release closure, so it must be
   **precise**. An undirected blob fans out through shared `ACTOR` (one role → every
   UC with that role) or a shared `Requirement`/`Form`, marking half the project
   stale and blocking releases on false staleness. The directed, UC-keyed stamp
   below is identical to `nacl-tl-fix`'s and stays bounded to real dependents.

Run as **two statements** (keep them separate — a single statement that stamps
tasks and then re-matches the UCs produces a cartesian whose row count is NOT the
stale-task count, which misleads on a plain channel). Params for both:
`$affectedUcIds` — UCs created/modified in this feature (Phase 2/3);
`$reason` — e.g. "feature FR-007 changed UC-014"; `$origin` — the change anchor (FR id).

```cypher
// mcp__neo4j__write-cypher  (1/2) — stamp the dependent Tasks (the re-plan units)
MATCH (uc:UseCase) WHERE uc.id IN $affectedUcIds
OPTIONAL MATCH (dependent:UseCase)-[:DEPENDS_ON*1..5]->(uc)   // UCs that depend ON the changed UC
WITH collect(DISTINCT uc) + [d IN collect(DISTINCT dependent) WHERE d IS NOT NULL] AS affected
UNWIND affected AS a
MATCH (a)-[:GENERATES]->(t:Task)
SET t.review_status='stale', t.stale_reason=$reason, t.stale_since=datetime(), t.stale_origin=$origin
RETURN count(DISTINCT t) AS tasks_stamped
```
```cypher
// mcp__neo4j__write-cypher  (2/2) — stamp the directly-changed UCs themselves
MATCH (uc:UseCase) WHERE uc.id IN $affectedUcIds
SET uc.review_status='stale', uc.stale_reason=$reason, uc.stale_since=datetime(), uc.stale_origin=$origin
RETURN count(uc) AS ucs_stamped
```

> The dependent Tasks are now `stale`. This is **expected** — it is the signal
> that `/nacl:tl-plan --feature FR-NNN` must regenerate them. The closure gate
> (`nacl-tl-release` / `nacl-tl-conductor`) refuses until they clear. sa-feature
> does NOT clear them; planning does. Surface the count in the FeatureRequest's
> "Modified UCs to Re-plan" section and the completion summary.

---

### Phase 4: INCREMENTAL VALIDATION

**Goal:** Validate only the affected artifacts, not the entire spec.

Run `/nacl:sa-validate` with scope limited to affected nodes. The advantage of graph validation is that scoping is precise -- only the affected subgraph is checked.

#### Step 4.1: Determine validation scope

| What changed | Validation levels to run |
|-------------|-------------------------|
| Domain model | L1 (data consistency), L2 (model connectivity) |
| New UCs | L4 (form-domain traceability), L5 (UC-form validation) |
| Modified UCs | L4, L5 for affected UCs only |
| New module | L6 (cross-module consistency) |
| Roles | L1 (role consistency) |

#### Step 4.2: Run scoped validation

Invoke `/nacl:sa-validate --scope=intra-uc` via Skill tool if available.

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

> **L8 (staleness) is expected to report the dependents just stamped in 3g.** Do
> NOT treat freshly-stamped `stale` Tasks as a Phase-4 failure — they are the
> hand-off signal to `nacl-tl-plan`. Run L8.2 (scoped) only to confirm the
> stamp covered the right set, and record it as a next step, not a blocker.
> L9 (decision provenance) is satisfied in Phase 6 when the FeatureRequest and
> its `Decision` are written; it is not checked here.

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

#### Step 6.1: Determine FR number (collision-safe allocation)

The FR-id namespace must be unique across **three sources** simultaneously, otherwise downstream skills (`tl-conductor`, `tl-plan --feature`) routing to the wrong artifact:

1. **Disk** — markdown files in `.tl/feature-requests/FR-*.md`.
2. **Graph (modern)** — `:FeatureRequest` nodes.
3. **Graph (legacy)** — any node of any label with `id` matching the FR-NNN pattern (historical `:Task` ids from older intake pipelines, etc.).

**Sub-namespaces** (prefix-aware allocation):
- `FR-NNN` — default numeric sequence (FR-001, FR-002, …).
- `FR-<DOMAIN>-N` — sub-namespace for thematically grouped features (e.g. `FR-PAY-1`, `FR-PAY-2` for a payments group). Each sub-namespace increments independently.
- `FR-LEG-*` and `FR-LEG-INTAKE-*` — **reserved for tombstones**. Never allocated to new FRs.

##### Allocation algorithm

1. **Determine the target sub-namespace.** Default is the unprefixed numeric sequence (`FR-NNN`). If the user explicitly invokes the skill with a domain qualifier (e.g. `/nacl:sa-feature --namespace=PAY "..."`), use `FR-PAY-N`.

2. **Collect existing ids from disk:**
   ```bash
   ls .tl/feature-requests/FR-*.md 2>/dev/null \
     | sed -E 's|.*/FR-(.+)\.md$|FR-\1|' \
     | sed -E 's|^(FR-[A-Za-z0-9-]+?-[0-9]+).*|\1|' \
     | sort -u
   ```
   Yields a list like `FR-001 FR-002 FR-003 FR-PAY-1 FR-PAY-2`.

3. **Collect existing ids from the graph (any label, any sub-namespace):**
   ```cypher
   // mcp__neo4j__read-cypher
   // Query: sa_collect_fr_ids_any_label
   MATCH (n)
   WHERE n.id IS NOT NULL
     AND n.id =~ 'FR-([A-Za-z]+-)?[0-9]+'
   RETURN labels(n)[0] AS label, n.id AS id
   ORDER BY n.id
   ```

4. **Union the two sets, exclude tombstones** (`FR-LEG-*`, `FR-LEG-INTAKE-*`).

5. **Compute next id within the target sub-namespace:**
   ```
   next = max(numeric_suffix(id) for id in union if matches_target_prefix(id)) + 1
   ```
   Format with the conventional padding for the target sub-namespace (`FR-NNN` uses 3 digits; sub-namespaces typically use 1 digit, but follow whatever pattern is already established in the project).

6. **Collision check** — verify the proposed id does NOT exist in the union. If it does (race condition or manual creation), increment and retry. If after 5 retries no free id is found, abort and ask the user for explicit allocation.

##### Why "any label" matters

In some projects the FR-NNN namespace was historically reused for `:Task` nodes (intake pipelines that converted raw requests into refined features). A new FR allocated only by checking `:FeatureRequest` would silently collide with a legacy `:Task` of the same id and break downstream queries that filter by label. Always check **all** labels.

##### Worked example

Suppose disk holds `FR-001..FR-006` plus `FR-PAY-1..FR-PAY-2` (a payment-domain sub-namespace), and the graph mirrors this set plus `FR-LEG-001..002` (tombstones from a previous renumbering pass). User invokes `/nacl:sa-feature "..."` without `--namespace`.

- Union excluding tombstones: `FR-001..FR-006` + `FR-PAY-1..FR-PAY-2`.
- Target prefix = numeric (no domain qualifier). Highest numeric suffix in `FR-NNN` form: 6.
- Allocate `FR-007`. Cross-label collision check: free across all node labels. Done.

If the same call had been made with `--namespace=PAY`, the algorithm would scan `FR-PAY-N`, see max = 2, and allocate `FR-PAY-3`.

#### Step 6.2: Create FeatureRequest file

Create `.tl/feature-requests/FR-NNN-[slug].md` with this structure:

```markdown
# Feature Request: FR-NNN [Feature Name]

## Metadata
| Field | Value |
|-------|-------|
| Created | [date] |
| Status | spec-complete |
| Source | /nacl:sa-feature "[original description]" |
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
| UI: Forms | [+N NEW, ~M MODIFIED] | [Form IDs] |
| UI: Components | [+N NEW, ~M MODIFIED] | [Component IDs, including `component_type='navigation'`] |

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

## Decisions
- DEC-NNN: [title] — [one-line rationale] (graph: (:FeatureRequest)-[:IMPLEMENTS]->(:Decision); this list is a projection, the node is the authority)
- [if superseding] DEC-NNN supersedes DEC-MMM

## Stale (to re-plan)
- [N Tasks marked review_status='stale' by step 3g → run `/nacl:tl-plan --feature FR-NNN` to clear]

## Skills Invoked
- [list of nacl-sa-* skills that were actually invoked during this feature spec]
```

#### Step 6.2bis: Persist FeatureRequest into Neo4j

The markdown artifact in Step 6.2 is **not** the source of truth. The graph is. Write a `:FeatureRequest` node and its edges so downstream skills (`nacl-tl-conductor`, `nacl-tl-plan --feature`, `nacl-tl-full --feature`) can resolve scope from the graph instead of falling back to markdown.

```cypher
// mcp__neo4j__write-cypher
// Query: sa_persist_feature_request
// Params:
//   $frId               -- "FR-NNN"
//   $slug               -- url-safe slug
//   $title              -- human title
//   $description        -- 1-3 sentence summary
//   $mdPath             -- ".tl/feature-requests/FR-NNN-<slug>.md"
//   $newUcIds           -- list of UC ids created in Phase 3
//   $modifiedUcIds      -- list of UC ids modified in Phase 3
//   $affectedModuleIds  -- list of Module ids touched
//   $affectedEntityIds  -- list of DomainEntity ids touched
MERGE (fr:FeatureRequest {id: $frId})
SET fr.slug          = $slug,
    fr.title         = $title,
    fr.description   = $description,
    fr.status        = 'spec-complete',
    fr.created_at    = coalesce(fr.created_at, datetime()),
    fr.updated_at    = datetime(),
    fr.source_skill  = 'nacl-sa-feature',
    fr.markdown_path = $mdPath
WITH fr
CALL {
  WITH fr
  UNWIND $newUcIds AS ucId
    MATCH (uc:UseCase {id: ucId})
    MERGE (fr)-[r:INCLUDES_UC]->(uc)
    SET r.kind = 'new'
  RETURN count(*) AS _new
}
CALL {
  WITH fr
  UNWIND $modifiedUcIds AS ucId
    MATCH (uc:UseCase {id: ucId})
    MERGE (fr)-[r:INCLUDES_UC]->(uc)
    SET r.kind = 'modified'
  RETURN count(*) AS _mod
}
CALL {
  WITH fr
  UNWIND $affectedModuleIds AS mId
    MATCH (m:Module {id: mId})
    MERGE (fr)-[:AFFECTS_MODULE]->(m)
  RETURN count(*) AS _modules
}
CALL {
  WITH fr
  UNWIND $affectedEntityIds AS deId
    MATCH (de:DomainEntity {id: deId})
    MERGE (fr)-[:AFFECTS_ENTITY]->(de)
  RETURN count(*) AS _entities
}
RETURN fr.id AS fr_id;
```

Then verify the write with a read-back:

```cypher
// mcp__neo4j__read-cypher
// Query: sa_verify_feature_request
MATCH (fr:FeatureRequest {id: $frId})
OPTIONAL MATCH (fr)-[r:INCLUDES_UC]->(uc:UseCase)
RETURN fr.id           AS fr_id,
       fr.status       AS status,
       fr.markdown_path AS md_path,
       collect(DISTINCT {uc: uc.id, kind: r.kind}) AS ucs;
```

If the write fails (label/constraint missing), make sure `graph-infra/schema/sa-schema.cypher` has been applied — it must contain `constraint_featurerequest_id`.

#### Step 6.2ter: Persist the Decision (graph-native rationale)

Every feature is a structural change, so it MUST record *why* — graph-natively,
never as a standalone Markdown ADR. Write one `:Decision` node, anchor it to the
FeatureRequest with `IMPLEMENTS`, and link it to every UC/entity/module the
feature shaped with `JUSTIFIES`. The "why" reuses the feature description and the
scope the user already confirmed in Phase 1–2 — this is a one-sentence
`rationale`, not new work. `nacl-sa-validate` L9.1 refuses to pass an active
FeatureRequest with no linked Decision, so this step is mandatory, not optional.

Allocate `DEC-NNN` like any global-sequential id (`max(toInteger(replace(d.id,'DEC-',''))) + 1`).

```cypher
// mcp__neo4j__write-cypher
// Query: sa_persist_decision
// Params (reuse the 6.2bis impact lists, plus):
//   $decId        -- "DEC-NNN"
//   $decTitle     -- one line: what was decided        [REQUIRED]
//   $decChosen    -- the option taken                   [REQUIRED]
//   $decRationale -- WHY chosen over alternatives        [REQUIRED — the load-bearing field]
//   $decContext   -- the forces (default "")
//   $decAlts      -- alternatives_considered (default [])
//   $frId, $newUcIds, $modifiedUcIds, $affectedEntityIds, $affectedModuleIds
MERGE (d:Decision {id: $decId})
SET d.title                  = $decTitle,
    d.chosen                 = $decChosen,
    d.rationale              = $decRationale,
    d.context                = $decContext,
    d.alternatives_considered = $decAlts,
    d.status                 = 'accepted',
    d.created_at             = coalesce(d.created_at, datetime()),
    d.created_by             = 'nacl-sa-feature',
    d.source                 = $frId,
    d.level                  = 'feature'
WITH d
MATCH (fr:FeatureRequest {id: $frId})
MERGE (fr)-[:IMPLEMENTS]->(d)
WITH d
CALL { WITH d UNWIND $newUcIds        AS x MATCH (uc:UseCase {id:x})      MERGE (d)-[:JUSTIFIES {role:'creates'}]->(uc)  RETURN count(*) AS _a }
CALL { WITH d UNWIND $modifiedUcIds   AS x MATCH (uc:UseCase {id:x})      MERGE (d)-[:JUSTIFIES {role:'shapes'}]->(uc)   RETURN count(*) AS _b }
CALL { WITH d UNWIND $affectedEntityIds AS x MATCH (de:DomainEntity {id:x}) MERGE (d)-[:JUSTIFIES {role:'shapes'}]->(de) RETURN count(*) AS _c }
CALL { WITH d UNWIND $affectedModuleIds AS x MATCH (m:Module {id:x})      MERGE (d)-[:JUSTIFIES {role:'shapes'}]->(m)    RETURN count(*) AS _d }
RETURN d.id AS decision_id;
```

If this feature changes a decision made earlier (e.g. reverses an entity
boundary or a role split), also chain it to the prior decision so the
year-later history is intact, and demote the old one:

```cypher
// mcp__neo4j__write-cypher  (only when superseding a prior decision)
MATCH (newer:Decision {id: $decId}), (old:Decision {id: $supersededDecId})
MERGE (newer)-[:SUPERSEDES]->(old)
SET old.status = 'superseded'
```

List `DEC-NNN` in the FeatureRequest markdown's `## Decisions` section (a
projection of the graph node — the node remains the authority).

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
  +N new forms, +M new components

Skills invoked: [list]

Next steps:
  /nacl:tl-plan --feature FR-NNN  -- create dev tasks
  /nacl:sa-validate --full  -- full validation
  /nacl:sa-feature "..."    -- add another feature

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
3. If no modules exist yet, suggest running `/nacl:sa-architect` first

### User wants to modify the scope mid-workflow

If the user says "skip this part" or "add X too" during Phase 3:

1. Update the impact classification
2. Adjust remaining phases
3. Update FeatureRequest at the end to reflect actual scope

---

## Checklist /nacl:sa-feature

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
- [ ] 3g: `spec_version` bumped on every new/modified UC
- [ ] 3g: dependent Tasks stamped `review_status='stale'` with `stale_origin` via the **directed** affected-UC stamp (affected UCs' GENERATES Tasks + DEPENDS_ON-dependents + the UCs themselves) — NOT the broad `sa_impact_closure`

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
- [ ] `:FeatureRequest` node + `INCLUDES_UC` / `AFFECTS_MODULE` / `AFFECTS_ENTITY` edges written via `mcp__neo4j__write-cypher` (Step 6.2bis)
- [ ] Read-back via `mcp__neo4j__read-cypher` confirms `:FeatureRequest` is in graph and links to the expected UCs
- [ ] 6.2ter: `:Decision` node written with non-empty `rationale`, anchored `(:FeatureRequest)-[:IMPLEMENTS]->(:Decision)`, linked to shaped artifacts via `JUSTIFIES` (satisfies L9.1)
- [ ] 6.2ter: if a prior decision was reversed, `SUPERSEDES` chain written and old `status='superseded'`
- [ ] Graph impact trace included in FR
- [ ] Completion summary presented with next steps (incl. stale-task re-plan count)

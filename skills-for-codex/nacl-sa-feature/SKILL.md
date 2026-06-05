---
name: nacl-sa-feature
description: |
  Specify an incremental feature against an existing NaCl SA graph through impact
  analysis, selective SA updates, validation, and TL handoff. Use when adding or
  changing functionality, tracing affected modules, or says `/nacl-sa-feature`.
---

# NaCl SA Feature For Codex

Use graph-first impact analysis to update only the affected SA subgraph for a
new or changed feature. SA graph descriptions follow the project language
conventions, usually Russian; TL handoff text remains English.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

1. Understand the request: parse the feature, extract search terms, load current
   modules, roles, use cases, domain entities, forms, and requirements from the
   graph when available.
2. Impact analysis: find affected graph nodes by search and traversal, then
   classify impact across architecture, domain entities, roles, use cases, UI,
   and requirements.
3. Confirm scope: present affected modules, entities, use cases, forms,
   components, proposed SA skills, and planned writes. Stop until the user
   confirms or adjusts scope.
4. Apply updates in dependency order: architecture, domain, roles, use cases,
   UI, validation flags. Use existing NaCl skills when available; otherwise
   apply the same graph contracts directly. After updates land, record change
   provenance: bump `spec_version` on every new/modified UC, and stamp
   `review_status='stale'` (with `stale_origin`/`stale_since`) on the TRUE
   downstream — the affected UCs' `GENERATES` Tasks, the Tasks of UCs that
   `DEPENDS_ON` them, and the affected UCs themselves. Key the stamp off the
   affected-UC list, NOT the broad undirected `sa_impact_closure` (that query is
   for exploration/display; an undirected stamp fans out through shared
   ACTOR/Requirement and marks half the project stale, blocking releases on false
   staleness). The stale Tasks are the expected hand-off signal to `nacl-tl-plan`;
   do not clear them here.
5. Incremental validation: run scoped checks for only affected nodes when graph
   tooling is available. Fix confirmed critical issues with at most two
   iterations unless the user asks to continue.
6. Traceability: verify module counts, BA-to-SA handoff edges, changed UCs,
   changed entities, and changed forms.
7. Handoff: allocate a collision-free `FR-*` id across disk and graph, create an
   English `.tl/feature-requests/FR-*.md` file when filesystem permissions allow,
   and persist a `FeatureRequest` node with edges to affected UCs, modules, and
   entities when graph writes are confirmed.

Feature request ids must avoid collisions across `.tl/feature-requests`,
`:FeatureRequest` nodes, and legacy graph nodes whose `id` already matches an
`FR-*` pattern. Reserved tombstone prefixes must not be allocated for new work.

## Phase Contract Details

Phase 1 must load enough current graph state to classify the request. If graph
search or traversal is unavailable, do not infer impacted scope from memory;
return `Status: BLOCKED` or a clearly labeled user-confirmation plan.

Phase 2 must use `sa_impact_analysis`, `sa_find_uc_by_keywords`,
`sa_feature_scope`, `sa_module_overview`, or equivalent graph reads. The impact
matrix must distinguish new modules, modified modules, new entities, modified
entities, new UCs, modified UCs, UI/form changes, role/permission changes, and
requirements.

Phase 3 writes only the confirmed affected scope and preserves dependency order:
architecture before domain, domain before roles and UC detail, UC detail before
UI, and UI before validation. If a specialist SA skill is available, use that
skill's contract and inspect its result before continuing.

Phase 6 persistence must create `FeatureRequest` with documented properties and
link it with `INCLUDES_UC {kind}`, `AFFECTS_MODULE`, `AFFECTS_ENTITY`, and
optionally `RAISES_REQUIREMENT`. It must also write one graph-native `:Decision`
(`DEC-NNN`, non-empty `rationale`, `created_by:'nacl-sa-feature'`), anchored by
`(:FeatureRequest)-[:IMPLEMENTS]->(:Decision)` and linked to every shaped artifact
via `JUSTIFIES {role}`; if it reverses a prior decision, add `SUPERSEDES` and set
the old one's `status='superseded'`. The Decision is mandatory — `nacl-sa-validate`
L9 refuses an active FeatureRequest with no linked Decision. After confirmed graph
and file writes, read the `FeatureRequest` subgraph back before reporting success.

## Capabilities

### May Do

- Read graph data to identify feature impact.
- Propose targeted SA updates with minimal blast radius.
- Create or update SA graph nodes and a TL handoff artifact after confirmation.
- Preserve BA-to-SA traceability and write `FeatureRequest` graph links for TL
  planning.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Start implementation before SA graph changes are specified.
- Write graph data or `.tl` handoff files without explicit confirmation.
- Allocate `FR-*` ids by checking only one namespace.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Graph impact analysis requires graph read tooling.
- Graph updates and `FeatureRequest` persistence require graph write tooling.
- `.tl/feature-requests` writes require filesystem permission and user
  confirmation.
- Other SA skills are used only when available in the current Codex environment.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, affected scope, FR id allocation data,
  filesystem permission, or confirmation is missing.
- Use `PARTIALLY_VERIFIED` when some scoped validation checks run but full
  affected coverage is unavailable.
- Use `UNVERIFIED` when impact cannot be checked against graph state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-feature/SKILL.md`

### Preserved Methodology

- Six-phase incremental feature workflow.
- Graph traversal before specification updates.
- Selective dependency order across SA architecture, domain, roles, use cases,
  UI, and validation.
- FeatureRequest handoff for TL planning.
- Collision-safe `FR-*` allocation across disk and graph.
- Graph-native change provenance: `spec_version` bump, staleness stamping of
  dependents, and a `:Decision` node (`IMPLEMENTS`/`JUSTIFIES`/`SUPERSEDES`).

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Assumed task delegation mechanisms from the source environment.
- Active source-environment files as required update targets.
- Slash-command-only invocation wording.

### Codex Replacement Behavior

- Use available skills and tools conditionally.
- Confirm scope before any write.
- Treat the graph as source of truth and `.tl` handoff as a bridge.
- Report validation using only the closed verification vocabulary.

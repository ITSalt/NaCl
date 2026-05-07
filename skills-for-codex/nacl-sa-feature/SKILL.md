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
   apply the same graph contracts directly.
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

---
name: nacl-ba-entities
description: |
  Catalog NaCl business entities in the graph with stereotypes, attributes,
  states, relationships, and a CRUD matrix. Use when collecting or changing BA
  entities, enriching workflow artifacts, or for compatibility with
  `/nacl-ba-entities`.
---

# NaCl BA Entities For Codex

Build and maintain the BA entity catalog in the graph. BA artifacts remain
Russian by default unless the user explicitly requests another supported output
language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before executing the workflow.

## Operating Forms

| Form | Purpose |
|---|---|
| `COLLECT` | Scan workflow relationships and consolidate entity candidates. |
| `FULL` | Describe all entities, attributes, relationships, states, and CRUD usage. |
| `CREATE` | Add one confirmed entity. |
| `MODIFY` | Change one existing entity after impact analysis. |

## Workflow

### COLLECT

Read workflow usage from `READS`, `PRODUCES`, and `MODIFIES` relationships.
Consolidate candidates, propose stereotypes, show where each entity is used,
and stop for explicit user confirmation before any write.

### FULL

1. Collect current entities and workflow usage from the graph.
2. Confirm entity list and stereotypes:
   `Vneshni dokument`, `Biznes-ob'ekt`, or `Rezul'tat`.
3. For each entity, confirm business attributes using business-level types only.
4. Confirm relationships, cardinalities, and optional state transitions.
5. Write confirmed nodes and relationships when graph write tools are available.
6. Query the graph to generate the CRUD matrix from actual usage edges.

Stop after every major phase and ask the user whether to proceed.

### CREATE

Gather the entity name, stereotype, description, attributes, relationships, and
state behavior. Write only after user confirmation and verify by graph read.

### MODIFY

Before any change, read affected attributes, workflow usages, rules, glossary
links, and traceability edges. Show impact, ask for confirmation, apply the
change, then verify by graph read.

## Graph Contract

- Entity IDs use `OBJ-NNN`.
- Attribute IDs use `{OBJ}-A{NN}`.
- State IDs use `{OBJ}-ST{NN}`.
- Attributes must avoid system fields and implementation data types.
- Use idempotent writes keyed by stable IDs.

## Capabilities

### May Do

- Query graph entities, workflow usage, attributes, states, and relationships.
- Propose stereotypes, relationships, and cardinalities from confirmed context.
- Ask clarifying questions when entity facts are incomplete.
- Write confirmed `BusinessEntity`, `EntityAttribute`, and `EntityState`
  artifacts when graph write tools are available.
- Produce a CRUD matrix from graph relationships.

### Must Not Do

- Invent attributes, states, or relationships absent from graph evidence or user
  input.
- Use implementation types such as database keys or storage-specific strings.
- Write graph changes without explicit user confirmation.
- Modify project files.
- Reuse retired IDs.

### Conditional Tools And Actions

- Graph reads require graph read tools.
- Graph writes require graph write tools and explicit user confirmation.
- CRUD generation requires sufficient workflow relationships in the graph.
- Language override is allowed only when requested by the user.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling or required source graph data is unavailable.
- Use `PARTIALLY_VERIFIED` when writes complete but only some read-back checks
  can run.
- Use `UNVERIFIED` when proposed catalog content cannot be checked against graph
  state.
- Use `FAILED` with a reason when graph verification contradicts the requested
  entity change.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-entities/SKILL.md`

### Preserved Methodology

- Entity catalog as graph-backed BA source of truth.
- Human facts, agent structuring, user approval.
- Entity stereotypes, business attributes, relationships, states, and CRUD.
- Impact analysis before changes.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed always-present named graph tool calls.
- Active platform-specific execution language.
- Tool-routing assumptions.

### Codex Replacement Behavior

- Gate every graph write behind explicit confirmation.
- Treat graph tooling as conditional.
- Use closed verification statuses for missing tools or partial checks.
- Keep slash command text as compatibility, not as required invocation.

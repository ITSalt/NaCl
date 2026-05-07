---
name: nacl-ba-context
description: |
  Define NaCl business-analysis system boundaries in the graph: scope,
  stakeholders, external entities, and data flows. Use when the user needs a
  system context model, business scope definition, graph-backed BA context, or
  compatibility with `/nacl-ba-context`.
---

# NaCl BA Context For Codex

Define system boundaries for the BA layer. BA artifacts produced by this skill
remain Russian unless the user explicitly requests another supported output
language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before executing the workflow.

## Workflow

### Phase 1: System Scope

Ask for system name, automation goals, stakeholders, in-scope areas,
out-of-scope areas, constraints, assumptions, and success criteria. Summarize in
Russian and stop for explicit confirmation before any graph write.

### Phase 2: External Entities

Ask which users, external systems, and organizations interact with the system.
Summarize the proposed entities and stop for explicit confirmation before any
graph write.

### Phase 3: Data Flows

For each external entity, identify incoming and outgoing data flows. Summarize
direction, data, trigger, frequency, and sensitivity. Stop for explicit
confirmation before any graph write.

### Phase 4: Context Verification

Verify that the graph contains the expected `SystemContext`, `Stakeholder`,
`ExternalEntity`, and `DataFlow` records when graph read access is available.
Report final status with the closed vocabulary.

## Graph Intent

When graph write tooling is available and the user confirms, persist:

- `SystemContext` nodes using IDs like `SYS-001`;
- `Stakeholder` nodes using IDs like `STK-01`;
- `ExternalEntity` nodes using IDs like `EXT-01`;
- `DataFlow` nodes using IDs like `DFL-001`;
- relationships from the system context to stakeholders, external entities, and
  flows.

If graph tooling is unavailable, do not simulate persistence. Report:

```text
Status: BLOCKED
Reason: graph write tooling is unavailable
```

## Capabilities

### May Do

- Ask structured BA context questions.
- Produce Russian BA summaries for user confirmation.
- Query or write graph data when graph tooling is available and confirmed.
- Report context completeness using the closed verification vocabulary.

### Must Not Do

- Proceed between phases without explicit user confirmation.
- Claim graph data was written without a successful graph write.
- Modify non-graph project files.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph reads and writes require available graph tools.
- Config reads require filesystem access to the current project.
- Diagram rendering is deferred to rendering skills unless explicitly available.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, configuration, or user confirmation is
  missing.
- Use `PARTIALLY_VERIFIED` when some graph checks run but coverage is incomplete.
- Use `UNVERIFIED` when the generated BA summary cannot be checked against graph
  state.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-context/SKILL.md`

### Preserved Methodology

- Four-phase system context workflow.
- Graph-first BA persistence intent.
- Explicit user confirmation gates.
- Russian BA artifact language by default.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed always-available graph tool names as execution guarantees.
- Source framework invocation assumptions.

### Codex Replacement Behavior

- Treat graph operations as conditional on available tools.
- Express every phase as an explicit stop-and-confirm gate.
- Use closed verification statuses for blocked or unverified steps.

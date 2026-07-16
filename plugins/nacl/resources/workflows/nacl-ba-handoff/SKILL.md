---
name: nacl-ba-handoff
description: |
  Prepare the NaCl BA to SA handoff package from graph data: traceability,
  automation scope, module suggestions, and coverage statistics. Use when
  handing BA artifacts to SA or for compatibility with `/nacl-ba-handoff`.
---

# NaCl BA Handoff For Codex

Create a graph-backed BA to SA handoff package. Handoff reports remain Russian
by default unless the user explicitly requests another supported output
language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Graph Execution Contract

This is a graph writer only for confirmed handoff edges. Apply the BA graph
writer contract before writing `AUTOMATES_AS`, `REALIZED_AS`, `MAPPED_TO`,
`IMPLEMENTED_BY`, or `SUGGESTS`: resolve configuration, inspect BA and handoff
queries, check graph tooling, load BA prerequisites, load SA target candidates,
and show proposed mappings with source evidence. If graph tools or BA data are
missing, report `BLOCKED`.

If SA graph data is absent, produce a BA-side handoff readiness report and mark
cross-layer mapping evidence as `PARTIALLY_VERIFIED` or `NOT_RUN` according to
scope. Never create SA artifacts from this skill. After confirmed edge writes,
read back the traceability matrix and coverage stats.

## Operating Forms

| Form | Purpose |
|---|---|
| `full` | Build a complete handoff package from current BA and SA graph data. |
| `update` | Re-scan BA graph data and add or adjust confirmed mappings. |

## Workflow

1. Pre-check BA graph coverage: processes, automatable workflow steps, entities,
   roles, rules, and existing handoff edges.
2. Pre-check SA graph availability: use cases, domain entities, system roles,
   and requirements.
3. Build the traceability matrix across:
   `WorkflowStep` to `UseCase`, `BusinessEntity` to `DomainEntity`,
   `BusinessRole` to `SystemRole`, and `BusinessRule` to `Requirement`.
4. Show uncovered BA artifacts and proposed mappings; stop for explicit user
   confirmation before graph writes.
5. Build automation scope from automatable workflow steps and propose use case
   candidates where SA artifacts are absent.
6. Propose module grouping from process groups and related BA data.
7. Compute coverage statistics from graph state and report the final status.

The source phase order is mandatory: traceability matrix, automation scope,
module suggestions, coverage stats. Each proposed edge batch has its own
confirmation gate.

## Handoff Edges

Write these only after confirmation and only when graph write tools are
available:

- `AUTOMATES_AS`
- `REALIZED_AS`
- `MAPPED_TO`
- `IMPLEMENTED_BY`
- `SUGGESTS`

## Incomplete Data Rules

- If BA graph data is empty, report `BLOCKED` and name the missing prerequisite.
- If SA graph data is absent, produce a BA-side handoff report without confirmed
  SA mappings.
- Do not create SA artifacts. Handoff may suggest candidates, but SA creation
  belongs to SA skills.

## Capabilities

### May Do

- Read BA and SA graph data for handoff coverage.
- Propose traceability mappings and module grouping from graph context.
- Write confirmed handoff edges when graph write tools are available.
- Report uncovered BA artifacts and coverage statistics.
- Support full and update workflows.

### Must Not Do

- Create or modify SA artifacts.
- Write handoff edges without explicit user confirmation.
- Delete existing confirmed handoff edges during update unless the user requests
  that change.
- Claim coverage for absent graph data.
- Modify project files.

### Conditional Tools And Actions

- Coverage and matrix generation require graph read tools.
- Handoff edge creation requires graph write tools and explicit confirmation.
- Candidate suggestions require enough BA context to justify the proposal.
- Update behavior depends on readable existing handoff edges.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when BA graph prerequisites, graph tools, or confirmation are
  missing.
- Use `PARTIALLY_VERIFIED` when some traceability categories can be checked and
  others cannot.
- Use `UNVERIFIED` when proposed mappings cannot be checked against graph state.
- Use `FAILED` with a reason when graph verification contradicts confirmed
  handoff writes.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-handoff/SKILL.md`

### Preserved Methodology

- Four-part handoff: traceability, automation scope, module suggestions, and
  coverage statistics.
- BA to SA edge semantics.
- User confirmation before handoff writes.
- Update behavior that preserves confirmed mappings.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed always-available graph operations.
- Platform-specific execution wording.
- Unconditional named-query execution assumptions.

### Codex Replacement Behavior

- Treat graph reads and writes as conditional.
- Report BA-only handoff when SA graph data is absent.
- Gate all graph writes with explicit confirmation.
- Use closed verification statuses for incomplete evidence.

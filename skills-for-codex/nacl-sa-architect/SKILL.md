---
name: nacl-sa-architect
description: |
  Decompose a NaCl system into modules, context-map dependencies, and NFRs in
  the SA graph. Use when the user asks to design architecture, define bounded
  contexts, add a module, create a system overview, or says `/nacl-sa-architect`.
---

# NaCl SA Architect For Codex

Perform graph-first architectural decomposition for the SA layer. User-facing SA
artifacts are Russian by default unless the user explicitly requests another
supported language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

Use `full` for an initial decomposition and `module` for adding one module to an
existing architecture.

1. Pre-flight: check available graph tooling, read `config.yaml` when available,
   inspect `Module` coverage, and verify whether BA nodes exist.
2. Import BA context: read `ProcessGroup`, `BusinessProcess`, automated
   `WorkflowStep`, `BusinessEntity`, `BusinessRole`, and `BusinessRule` data.
3. Business context: summarize goals, scope, success criteria, and assumptions
   in Russian; ask the user to confirm before continuing.
4. Module decomposition: propose `Module` nodes, UC ranges, ownership of domain
   entities, and `ProcessGroup` to `Module` handoff edges. Stop for explicit
   confirmation before graph writes.
5. Context map: propose inter-module `DEPENDS_ON` relationships with dependency
   type and rationale. Stop for explicit confirmation before graph writes.
6. NFRs and constraints: propose `Requirement` nodes for NFRs, assumptions, and
   architecture decisions; connect them to modules when applicable. Stop for
   explicit confirmation before graph writes.
7. Verification: read back modules, dependencies, NFRs, and BA handoff coverage.
   Report with the closed verification vocabulary.

When BA data is incomplete, state the gap, propose clearly marked assumptions,
and create assumption requirements only after user confirmation.

## Capabilities

### May Do

- Read BA and SA graph data when graph tools are available.
- Propose modules, UC ranges, module ownership, dependencies, NFRs, and
  assumptions.
- Write `Module`, `Requirement`, `SUGGESTS`, `DEPENDS_ON`, and related ownership
  edges after explicit confirmation.
- Preserve BA-to-SA traceability from process groups and automated workflow
  scope into SA architecture.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Write graph data without a user-facing confirmation gate.
- Invent BA facts that are absent from the user request and graph.
- Break BA, SA, and TL artifact boundaries.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- Schema checks require readable schema files or graph introspection.
- File reads require workspace access.
- Destructive graph changes require explicit user approval and should normally
  be avoided.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, source BA data, schema access, or
  confirmation is missing.
- Use `PARTIALLY_VERIFIED` when graph writes complete but only some read-back
  checks can run.
- Use `UNVERIFIED` when architecture coverage cannot be checked against graph
  state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-architect/SKILL.md`

### Preserved Methodology

- Full and single-module architecture workflows.
- Russian SA artifact language by default.
- Graph-first module, context-map, and NFR persistence.
- BA-to-SA handoff from process groups and automation scope.
- Explicit phase gates before moving forward.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded assumptions that specific graph tools always exist.
- Slash-command-only invocation wording.
- Direct active runtime instructions from the source environment.

### Codex Replacement Behavior

- Treat graph and filesystem access as conditional.
- Ask before every graph write and every major phase transition.
- Report outcomes using only the closed verification vocabulary.
- Keep source references as comparison notes, not active runtime constraints.

---
name: nacl-ba-roles
description: |
  Identify and describe NaCl business roles in the graph, including
  departments, responsibilities, role-process matrix, and As-Is/To-Be deltas.
  Use when defining BA roles or for compatibility with `/nacl-ba-roles`.
---

# NaCl BA Roles For Codex

Maintain business roles as graph-backed BA artifacts. Role descriptions remain
Russian by default unless the user explicitly requests another supported output
language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Graph Execution Contract

This is a graph writer. Apply the BA graph writer contract before creating or
repairing role data: resolve configuration, inspect schema/query references,
check graph tooling, load `BusinessProcess`, `WorkflowStep`, `BusinessRole`,
`OWNS`, `PARTICIPATES_IN`, and `PERFORMED_BY` data, then show the candidate role
registry or matrix repair. If graph tools or process data are missing, report
`BLOCKED`.

Write only after explicit confirmation. Read back `ba_role_process_matrix` or
role-specific participation evidence before reporting `VERIFIED`.

## Operating Forms

| Form | Purpose |
|---|---|
| `full` | Identify all roles and build the role-process matrix. |
| `add` | Add one confirmed role to the graph. |

## Workflow

1. Pre-check graph data for `BusinessProcess`, `WorkflowStep`, and
   `BusinessRole` nodes.
2. Phase 1: collect role candidates from `OWNS`, `PARTICIPATES_IN`, and
   `PERFORMED_BY` relationships; deduplicate and stop for confirmation.
3. Phase 2: for each role, propose full name, department, and responsibilities
   from graph context; process one role at a time with confirmation.
4. Phase 3: build the role-process matrix and propose missing relationship
   repairs.
5. Phase 4: capture As-Is/To-Be deltas when the user provides current and target
   differences.
6. Write confirmed nodes and relationships when graph write tools are available.

Stop after each phase and ask for confirmation before advancing. Matrix repairs
are graph writes and require their own confirmation.

## Role Rules

- A business role is an organizational unit or job position, not a system role.
- An IT system may perform automated steps but must not own a business process.
- Role IDs use `ROL-NN` and are never reused.
- Responsibilities come from graph context or user input, not generic practice.
- Role-process matrix semantics use `OWNS`, `PARTICIPATES_IN`, and
  `PERFORMED_BY`; system roles remain SA artifacts and are out of scope here.

## Capabilities

### May Do

- Query graph role mentions and role-process relationships.
- Consolidate duplicate role candidates.
- Propose responsibilities from owned processes and performed workflow steps.
- Write confirmed role nodes and missing relationships when graph write tools
  are available.
- Report role-process coverage and deltas.

### Must Not Do

- Invent roles or responsibilities.
- Treat system roles as BA roles.
- Make an automated system the owner of a business process.
- Write graph changes without explicit confirmation.
- Modify project files.

### Conditional Tools And Actions

- Role extraction requires graph read tools.
- Role writes and matrix repairs require graph write tools and confirmation.
- Delta capture requires user-provided As-Is/To-Be evidence.
- Verification requires graph read tools after writes.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required graph data, tools, or user confirmation is missing.
- Use `PARTIALLY_VERIFIED` when only some role-process checks can run.
- Use `UNVERIFIED` when proposed responsibilities cannot be checked against
  graph context.
- Use `FAILED` with a reason when graph verification contradicts confirmed role
  changes.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-roles/SKILL.md`

### Preserved Methodology

- Role extraction from graph relationships.
- Interactive role description and confirmation.
- Role-process matrix construction.
- As-Is/To-Be delta capture.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed graph tool availability.
- Platform-specific execution wording.
- Unconditional matrix write behavior.

### Codex Replacement Behavior

- Treat graph operations as conditional.
- Gate role writes and repairs with explicit confirmation.
- Report missing prerequisites with closed verification statuses.
- Keep slash command text as compatibility trigger text.

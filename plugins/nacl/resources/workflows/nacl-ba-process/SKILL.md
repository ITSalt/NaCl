---
name: nacl-ba-process
description: |
  Build the NaCl business-process map in the graph: process groups, business
  processes, triggers, results, roles, and links. Use when mapping BA processes
  or for compatibility with `/nacl-ba-process`.
---

# NaCl BA Process For Codex

Create and maintain the top-level BA process map in the graph. BA artifacts
remain Russian by default unless the user explicitly requests another supported
output language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Graph Execution Contract

This is a graph writer. Apply the BA graph writer contract before writing:
resolve configuration, inspect BA schema/query references, check graph tooling,
load `SystemContext`, existing `ProcessGroup`, `BusinessProcess`, and
`BusinessRole` records, then show the candidate process map. If required graph
tools or prerequisites are missing, report `BLOCKED` and provide a graph-ready
plan instead of claiming persistence.

All writes happen only after phase confirmations. Read back the result through
`ba_process_map`-equivalent data and include IDs, relationship counts, skipped
items, and closed-vocabulary status in the report.

## Operating Forms

| Form | Purpose |
|---|---|
| `full` | Build all process groups, processes, links, and preliminary roles. |
| `group` | Add one confirmed process group. |
| `add` | Add one confirmed business process to an existing group. |

## Workflow

1. Pre-check the graph for system context, existing process groups, and existing
   processes when graph read tools are available.
2. Phase 1: ask for subject areas and propose `GPR-NN` process groups.
3. Phase 2: for each group, ask for business processes, triggers, results, and
   decomposition need; assign `BP-NNN` IDs.
4. Phase 3: propose process links from confirmed trigger/result relationships.
5. Phase 4: propose preliminary owners and participants from user input.
6. Phase 5: write confirmed graph nodes and relationships, then query the graph
   for summary tables and diagrams when tools are available.

Stop after every phase and ask the user whether to proceed.

Phase 5 must use the canonical labels and relationships:
`ProcessGroup`, `BusinessProcess`, `BusinessRole`, `CONTAINS`, `TRIGGERS`,
`CALLS_SUB`, `OWNS`, and `PARTICIPATES_IN`. Diagrams are generated views from
graph reads, not authoritative source data.

## BA Rules

- Facts come from the user or existing graph evidence.
- The agent structures: grouping, IDs, names, links, and diagram output.
- Process names use verbal-noun convention in the project language.
- A business process must have a trigger, result, and owner before handoff.
- Do not guess missing triggers, results, owners, or process scope.
- Modes `group` and `add` still require graph pre-checks and read-back
  verification for the new group or process.

## Capabilities

### May Do

- Ask structured BA process discovery questions.
- Propose process groups, process cards, links, and preliminary roles.
- Query graph prerequisites and existing process data.
- Write confirmed `ProcessGroup`, `BusinessProcess`, `BusinessRole`, and
  process relationship data when graph write tools are available.
- Generate summaries and diagrams from graph reads.

### Must Not Do

- Invent business processes or events absent from user input.
- Write graph data before final confirmation for the relevant phase.
- Modify project files.
- Continue to workflow decomposition before process map confirmation.
- Overwrite existing graph data without showing overlap and receiving approval.

### Conditional Tools And Actions

- Graph pre-checks require graph read tools.
- Graph writes require graph write tools and explicit confirmation.
- Diagram generation requires graph read evidence.
- Language override requires user request.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, system context, target group, or
  confirmation is missing for the requested form.
- Use `PARTIALLY_VERIFIED` when writes complete but summary or diagram reads are
  incomplete.
- Use `UNVERIFIED` when proposed process structure cannot be checked against
  graph state.
- Use `FAILED` with a reason when graph read-back contradicts confirmed writes.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-process/SKILL.md`

### Preserved Methodology

- Process groups, business processes, links, and roles as graph artifacts.
- Phase-by-phase user confirmation.
- Human facts and agent structuring.
- Level 1 and Level 2 process-map intent.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed graph tool availability.
- Platform-specific execution wording.
- Unconditional diagram generation from named graph queries.

### Codex Replacement Behavior

- Treat graph operations and diagrams as conditional.
- Convert missing prerequisites into closed verification statuses.
- Keep phase transitions explicit and user-confirmed.
- Preserve slash command compatibility as trigger text.

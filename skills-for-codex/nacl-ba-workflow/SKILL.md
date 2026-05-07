---
name: nacl-ba-workflow
description: |
  Decompose NaCl business processes into graph-backed workflows with steps,
  performers, documents, decisions, and diagrams. Use when detailing a business
  process workflow or for compatibility with `/nacl-ba-workflow`.
---

# NaCl BA Workflow For Codex

Create workflow decomposition for an existing business process in the graph.
Workflow artifacts remain Russian by default unless the user explicitly
requests another supported output language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before executing the workflow.

## Input

Requires a `BusinessProcess` ID such as `BP-001`.

## Pre-Checks

When graph read tools are available:

1. Load the target `BusinessProcess`, its trigger, result, decomposition flag,
   and owner.
2. Load existing roles and entities available for binding.
3. Check existing workflow steps and ask whether to continue editing, rebuild,
   or stop.

If the process is missing or not decomposable, report `BLOCKED`.

## Workflow

1. Phase 1: ask the user for ordered steps: who does what, in what order, and
   what documents are used. Assign `{BP}-S{NN}` IDs.
2. Phase 2: propose stereotypes: `Biznes-funktsiya` or `Avtomatiziruetsya`.
3. Phase 3: bind each step to exactly one performer.
4. Phase 4: bind documents and entities as inputs, outputs, or modifications.
5. Phase 5: capture decision points, branches, exceptions, and flow order.
6. Phase 6: after confirmation, write workflow nodes and relationships when
   graph write tools are available, then query graph data for a canonical table
   and diagram.

Stop after every phase and ask the user whether to proceed.

## Workflow Rules

- The graph is authoritative; diagrams are generated views.
- The user provides facts: steps, order, performers, documents, and branching.
- The agent structures IDs, tables, stereotypes, bindings, and diagrams.
- Maximum of 12 steps before proposing subprocess decomposition.
- Do not add steps absent from the user's description.

## Capabilities

### May Do

- Query target process, roles, entities, and existing workflow steps.
- Structure user-provided steps into canonical workflow tables.
- Propose stereotypes, performer bindings, artifact bindings, and decisions.
- Write confirmed workflow nodes and relationships when graph write tools are
  available.
- Generate a diagram from graph evidence.

### Must Not Do

- Invent workflow steps or branches.
- Bind performers, artifacts, or decisions without confirmation.
- Write graph data before all relevant phase confirmations.
- Treat a generated diagram as authoritative over graph data.
- Modify project files unless the user explicitly requests diagram file output.

### Conditional Tools And Actions

- Pre-checks require graph read tools.
- Workflow writes require graph write tools and explicit confirmation.
- Diagram generation requires graph read evidence after writes.
- Optional board output requires filesystem write access and user request.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when the target process, graph tools, or confirmation is
  unavailable.
- Use `PARTIALLY_VERIFIED` when graph writes complete but diagram or read-back
  checks are incomplete.
- Use `UNVERIFIED` when proposed workflow structure cannot be checked against
  graph state.
- Use `FAILED` with a reason when read-back verification contradicts confirmed
  workflow writes.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-workflow/SKILL.md`

### Preserved Methodology

- Business-process workflow decomposition.
- Phase gates for steps, stereotypes, performers, artifacts, decisions, and
  graph output.
- Human facts and agent structuring.
- Graph as authoritative source with generated diagram view.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed graph tool availability.
- Platform-specific execution wording.
- Unconditional diagram generation.

### Codex Replacement Behavior

- Treat graph and file operations as conditional.
- Gate every phase transition and graph write with explicit confirmation.
- Report missing prerequisites with closed verification statuses.
- Keep slash command text as compatibility trigger text.

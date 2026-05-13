---
name: nacl-ba-from-board
description: |
  Coordinate the NaCl BA board lifecycle: create, import, analyze, sync, enrich,
  validate, and hand off graph-backed BA artifacts. Use when managing an
  Excalidraw BA board pipeline or for compatibility with `/nacl-ba-from-board`.
---

# NaCl BA From Board For Codex

Coordinate board-centered BA work without duplicating the specialist skills.
Artifacts remain Russian by default unless the user explicitly requests another
supported output language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Orchestrator Contract

This is an orchestrator, not a replacement for specialist skills. Resolve the
active board from explicit argument, current session state, or latest board in
`graph.boards_dir`; report `BLOCKED` if no board or source file is available.
Before every command, state the specialist contract, expected output, downstream
consumer, and gate.

Do not write graph data directly. `sync`, enrichment, validation, and handoff
must run through their owning skill contracts. Inspect delegated output before
advancing and stop after every major phase for explicit confirmation.

## Commands

| Command | Purpose |
|---|---|
| `new` | Create an empty board scaffold for a project. |
| `import` | Import a client document onto the active board. |
| `analyze` | Run board completeness, snapshot, and optional graph checks. |
| `sync` | Synchronize confirmed board content into the graph. |
| `status` | Summarize board counts, confidence, and sync state. |
| `enrich` | Run entity, role, rule, and glossary enrichment. |
| `validate` | Run BA validation for the synced graph subset. |
| `handoff` | Prepare BA to SA traceability package. |
| `full` | Chain import, review, sync, enrich, validate, and handoff with gates. |

## Active Board Resolution

Resolve a board in this order:

1. Explicit board path argument.
2. Board created or imported earlier in the current session.
3. Latest `.excalidraw` file in the configured boards directory.

If no board is found, report `BLOCKED` and provide the next required input.

## Workflow

- `new`: derive board path, avoid overwriting existing boards, create swimlane
  scaffold using core board conventions when filesystem writes are available.
- `import`: validate the source document, delegate extraction and board
  generation to `nacl-ba-import-doc`, then run analysis.
- `analyze`: delegate board checks to `nacl-ba-analyze` and append next actions.
- `sync`: run a pre-sync board check, stop for confirmation if material issues
  exist, then delegate to `nacl-ba-sync`.
- `status`: read the board and summarize shape counts, confidence, sync state,
  and recommended next command.
- `enrich`: after sync, coordinate `nacl-ba-entities`, `nacl-ba-roles`,
  `nacl-ba-rules`, and `nacl-ba-glossary` in sequence.
- `validate`: coordinate `nacl-ba-validate` on the relevant BA graph subset.
- `handoff`: coordinate `nacl-ba-handoff` after validation evidence is available.
- `full`: stop between import review, sync, enrichment, validation, and handoff
  for explicit user confirmation.

The source command set is mandatory: `new`, `import`, `analyze`, `sync`,
`status`, `enrich`, `validate`, `handoff`, and `full`. `sync` must run a
pre-sync completeness check and ask for confirmation when material board issues
exist.

## Capabilities

### May Do

- Track the active board within the current conversation.
- Read and write board files when filesystem permissions allow.
- Coordinate specialist BA skills and summarize their outcomes.
- Ask for confirmation before risky or irreversible phases.
- Report orchestration status with the closed verification vocabulary.

### Must Not Do

- Recreate specialist logic that belongs to import, analysis, sync, enrichment,
  validation, or handoff skills.
- Write graph data directly except through the sync or enrichment contracts.
- Continue a full pipeline across a confirmation gate without user approval.
- Overwrite an existing board without explicit user consent.
- Claim downstream verification that did not run.

### Conditional Tools And Actions

- Board creation and updates require filesystem write access.
- Document import depends on readable source files and parsable formats.
- Graph phases require graph tools and confirmed context.
- Validation and handoff depend on existing synced BA graph data.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when no active board, source file, graph tool, or confirmation is
  available for the requested command.
- Use `NOT_RUN` for pipeline stages intentionally skipped by command scope.
- Use `PARTIALLY_VERIFIED` when only some delegated checks provide evidence.
- Use `UNVERIFIED` when delegated results cannot be checked.
- Use `FAILED` with a reason when a delegated stage violates its contract.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-from-board/SKILL.md`

### Preserved Methodology

- Board lifecycle orchestration across import, analyze, sync, enrich, validate,
  and handoff.
- Active board resolution.
- Specialist skill delegation.
- Confirmation gates between major pipeline stages.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumptions about automatic specialist invocation.
- Platform-specific execution wording.
- Unconditional graph and file tool assumptions.

### Codex Replacement Behavior

- Coordinate only with skills and tools that are available in the session.
- Convert missing prerequisites into `BLOCKED` or `NOT_RUN` evidence.
- Keep graph writes behind specialist contracts and explicit confirmation.
- Treat slash command text as compatibility trigger text.

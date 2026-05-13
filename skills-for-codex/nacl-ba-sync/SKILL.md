---
name: nacl-ba-sync
description: |
  Synchronize NaCl Excalidraw BA boards into the graph by creating or updating
  BA nodes, relationships, board metadata, and sync markers. Use when pushing a
  board into the graph or for compatibility with `/nacl-ba-sync`.
---

# NaCl BA Sync For Codex

Bridge a visual Excalidraw board and the structured BA graph. Sync reports
remain Russian by default unless the user explicitly requests another supported
output language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Board-To-Graph Contract

This is the board-to-graph writer. Resolve `graph.boards_dir`, parse
Excalidraw JSON structurally, inspect schema/query references, check graph read
and write tooling, classify elements, then show a sync summary and context plan.
If board access, graph tools, context selection, or confirmation is missing,
report `BLOCKED`.

Do not update the board file as synced until graph writes and read-back
verification succeed for the affected elements. On terminal failure, preserve
the board and update the meta sidecar failure state when filesystem writes are
available.

## Workflow

1. Locate and parse the requested board, or the latest configured board.
2. Validate non-deleted shape elements and skip shapes without valid
   `customData.nodeType`.
3. Classify elements as new, already synced, or dirty synced; resolve labels and
   arrows.
4. Show a sync summary and stop for user confirmation before graph writes.
5. Determine target `ProcessGroup` and `BusinessProcess`, creating them only
   after explicit confirmation.
6. Create or update graph nodes for workflow steps, decisions, entities, roles,
   and annotations when graph write tools are available.
7. Resolve arrows into graph relationships such as flow, performer, read,
   produce, modify, and role participation links.
8. Read back graph state, update board `customData` and visual sync markers when
   filesystem writes are available, write sidecar metadata, and report results.

The source phase order is mandatory: read and validate board, determine
process context, sync new elements, sync relationships, sync changed elements,
update board/meta sidecar, report.

## Sync Rules

- Use idempotent writes keyed by stable IDs.
- Skip synced-and-unchanged elements.
- Reuse existing `nodeId` for dirty synced elements.
- Deduplicate roles by confirmed name where appropriate.
- Relationship inference uses arrow bindings and swimlane containment:
  `NEXT_STEP`, `READS`, `PRODUCES`, `MODIFIES`, `PERFORMED_BY`,
  `PARTICIPATES_IN`, and `OWNS` where source evidence supports them.
- If a partial failure occurs, write sidecar failure details when possible and
  report `PARTIALLY_VERIFIED` or `FAILED` with evidence.

## Capabilities

### May Do

- Read and validate Excalidraw board JSON.
- Query and write graph nodes and relationships when tools are available.
- Ask the user to select or create process context.
- Update board metadata and sync markers after graph writes.
- Report created, updated, skipped, and failed sync items.

### Must Not Do

- Sync shapes missing required `customData.nodeType`.
- Write graph data before user confirmation of the sync summary and context.
- Claim board and graph are synchronized without graph write and read-back
  evidence.
- Overwrite unrelated board content.
- Continue after a critical graph conflict without surfacing choices to the
  user.

### Conditional Tools And Actions

- Board reads and updates require filesystem access.
- Graph reads and writes require graph tools.
- Process context creation requires user confirmation.
- Sidecar metadata requires filesystem write access.
- Verification requires graph read-back after writes.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when board access, graph tools, context selection, or
  confirmation is missing.
- Use `PARTIALLY_VERIFIED` when some elements sync but others cannot be checked.
- Use `UNVERIFIED` when board metadata cannot be checked against graph state.
- Use `FAILED` with a reason when graph writes or board updates violate the sync
  contract.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-sync/SKILL.md`

### Preserved Methodology

- Board-to-graph sync bridge.
- Context selection for process group and business process.
- Element and relationship sync from Excalidraw bindings.
- Board metadata, sync markers, and sidecar reporting.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed graph tool availability.
- Platform-specific execution wording.
- Unconditional board write assumptions.

### Codex Replacement Behavior

- Treat file and graph actions as conditional.
- Gate graph writes with explicit user confirmation.
- Report partial sync with closed verification statuses.
- Keep slash command text as compatibility trigger text.

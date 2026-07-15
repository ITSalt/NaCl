---
name: nacl-ba-import-doc
description: |
  Import client documents into NaCl Excalidraw BA boards by extracting roles,
  steps, decisions, documents, and rules with confidence metadata. Use when
  creating a board from DOCX, PDF, XLSX, text, or for compatibility with
  `/nacl-ba-import-doc`.
---

# NaCl BA Import Doc For Codex

Extract BA content from a client document and generate or append to an
Excalidraw board. Board labels and BA artifacts remain Russian by default unless
the user explicitly requests another supported output language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Board Generation Contract

This skill is board-only. It must not write graph data. Resolve
`graph.boards_dir` from `config.yaml` with fallback `graph-infra/boards`, parse
or extract source evidence, and generate structurally valid Excalidraw JSON.
If the source document cannot be read or the board cannot be written, report
`BLOCKED`.

Every generated shape must have bound text and full `customData`; every fact
must keep source document and page or section traceability when determinable.
Sync is delegated to `nacl-ba-sync`.

## Workflow

1. Validate and read the input document.
2. Extract candidate process steps, roles, documents, decisions, system actions,
   and business rules with source traceability.
3. Structure the extracted content into an ordered workflow with swimlanes,
   documents, decisions, and confidence levels.
4. Generate valid Excalidraw JSON using core board conventions:
   shape types, bound text, colors, `customData`, arrow bindings, and layout.
5. Write a new board or append to an existing board only when filesystem writes
   are available.
6. Report extracted element counts, confidence distribution, low-confidence
   items, orphaned documents, output path, and next recommended steps.

The workflow is board-only and does not write to the graph.

The source phase order is mandatory: analyze document, structure content,
generate Excalidraw, write board, report.

## Document Rules

- DOCX, PDF, plain text, and Markdown may produce process boards.
- XLSX produces only entity blocks and attribute annotations; do not infer
  workflow steps from spreadsheets.
- Every generated shape must have `customData` with source document and source
  page or section when determinable.
- Every generated shape must have a bound text element.
- Confidence colors and background colors come from core board conventions.
- When appending, use collision-resistant element IDs.
- Orphaned documents must be called out; do not silently infer step links when
  the source evidence does not support them.

## Capabilities

### May Do

- Read supported source documents when accessible.
- Extract BA candidates and mark confidence.
- Create or append Excalidraw board files when writes are available.
- Preserve document traceability in board metadata.
- Report low-confidence or incomplete extraction areas.

### Must Not Do

- Write graph nodes or relationships.
- Invent process facts not present in the document.
- Overwrite an existing board without preserving existing elements unless the
  user explicitly requests replacement.
- Generate shapes without required `customData` and bound text.
- Treat XLSX input as workflow evidence.

### Conditional Tools And Actions

- Document reading depends on accessible files and supported parsing.
- Board creation requires filesystem write access to the configured board
  directory.
- Existing board append requires readable existing board JSON.
- PDF extraction may be `PARTIALLY_VERIFIED` if only some pages can be read.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when the source document cannot be read or the board cannot be
  written.
- Use `PARTIALLY_VERIFIED` when only part of a large document can be extracted.
- Use `UNVERIFIED` when extracted structure cannot be checked against the source
  evidence.
- Use `FAILED` with a reason when generated board JSON violates the board
  contract.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-import-doc/SKILL.md`

### Preserved Methodology

- Document-to-board workflow.
- Extraction categories for roles, steps, documents, decisions, system actions,
  and rules.
- Excalidraw layout, colors, `customData`, confidence, and traceability.
- XLSX entity-only behavior.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed native support for every document type.
- Platform-specific reading and writing wording.
- Unconditional file tool availability.

### Codex Replacement Behavior

- Treat document parsing and board writing as conditional.
- Report partial extraction using closed verification statuses.
- Keep graph sync delegated to `nacl-ba-sync`.
- Use slash command text only as compatibility trigger text.

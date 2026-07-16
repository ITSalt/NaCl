---
name: nacl-ba-analyze
description: |
  Analyze NaCl Excalidraw business-process boards for completeness, changes,
  and graph consistency. Use when reviewing a board, checking board quality,
  comparing with snapshots or graph data, or for compatibility with
  `/nacl-ba-analyze`.
---

# NaCl BA Analyze For Codex

Analyze an Excalidraw board as a BA artifact. Reports stay in Russian unless
the user explicitly requests another supported output language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Board Analysis Contract

This skill is read-only for board and graph content. Resolve `graph.boards_dir`
from `config.yaml` with fallback `graph-infra/boards`, parse Excalidraw JSON
structurally, preserve full `customData`, and compare only non-deleted elements.
If the board cannot be found or parsed, report `BLOCKED`.

Snapshot writes are allowed by the source workflow; report file writes require a
user request. Graph comparison uses read tools only and must be reported as
`NOT_RUN`, `BLOCKED`, or `PARTIALLY_VERIFIED` when graph tools or synced
elements are unavailable.

## Workflow

1. Locate the requested `.excalidraw` board, or the latest board from the
   configured boards directory.
2. Parse the Excalidraw JSON, skip deleted elements, resolve bound text labels,
   classify shapes by `customData.nodeType`, and classify arrows by bindings.
3. Check board completeness: missing performers, disconnected documents,
   decisions with fewer than two outgoing branches, isolated steps, duplicate
   names, low confidence, dangling arrows, and shapes missing `customData`.
4. Compare with the latest snapshot when available, then save a new snapshot
   only when filesystem writes are available.
5. Compare synced board elements with graph nodes when graph read tools are
   available.
6. Output a structured report with statistics, findings, changes, graph
   comparison, recommendations, and a closed verification status.

Graph comparison is read-only. Report writing to a file is allowed only when the
user explicitly requests it.

The source phase order is mandatory: read board, completeness analysis,
snapshot diff, graph comparison for synced elements, report.

## Board Rules

- Use `customData.nodeId`, `nodeType`, `confidence`, and `synced` as the board
  contract.
- Treat bound text elements as labels for their container shapes.
- Treat arrows without both endpoint bindings as dangling.
- Treat one start step and one end step as normal unless other evidence shows a
  broken flow.
- Do not mutate board content during analysis except for snapshot/report files
  explicitly covered by the workflow.
- Snapshot content must include element IDs, type, resolved text, geometry, and
  full `customData`.

## Capabilities

### May Do

- Read and validate Excalidraw JSON.
- Resolve element labels and graph-like relationships from board bindings.
- Create a snapshot of the current board state when writes are available.
- Query the graph for synced node comparison when graph tools are available.
- Produce Russian BA analysis reports with actionable recommendations.

### Must Not Do

- Write BA nodes or relationships to the graph.
- Claim graph comparison was completed when graph tools were unavailable.
- Alter the source board while analyzing it.
- Proceed with file output unless the user requested a report file.
- Invent stakeholder facts to explain missing board content.

### Conditional Tools And Actions

- Board reads require filesystem access to the board path.
- Snapshot writes require filesystem write access to the configured snapshot
  directory.
- Graph comparison requires graph read tools.
- Report files require explicit user request and filesystem write access.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when the board cannot be located or parsed.
- Use `PARTIALLY_VERIFIED` when board checks complete but snapshot or graph
  comparison cannot run.
- Use `UNVERIFIED` when the report cannot be checked against board or graph
  evidence.
- Use `FAILED` with a reason when parsing or validation runs and violates the
  board contract.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-analyze/SKILL.md`

### Preserved Methodology

- Board-first analysis over Excalidraw JSON.
- Completeness checks for performers, documents, decisions, flow, duplicates,
  confidence, and dangling arrows.
- Snapshot diff and optional graph comparison.
- Russian BA report behavior by default.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed built-in document and graph tool availability.
- Platform-specific execution wording.
- Active instruction to use unavailable graph tool names as guarantees.

### Codex Replacement Behavior

- Treat board, snapshot, and graph operations as conditional on available tools.
- Report skipped checks with the closed verification vocabulary.
- Keep analysis read-only for board and graph content.
- Use slash command text only as compatibility trigger text.

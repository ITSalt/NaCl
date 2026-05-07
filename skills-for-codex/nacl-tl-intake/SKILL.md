---
name: nacl-tl-intake
description: |
  Triage and decompose user requests with graph-aware classification into
  features, bugs, and tasks. Use when a request contains multiple changes,
  unclear work type, graph context is needed, or when the user says
  `/nacl-tl-intake`.
---

# NaCl TL Intake For Codex

Intake classifies and proposes work. It should stop for confirmation before
creating graph or task-tracker artifacts.

## Workflow

1. Collect request text from the user or available task tracker.
2. Split the request into atomic changes.
3. Query graph context when graph tooling is available to identify related use
   cases, entities, modules, and existing work.
4. Classify atoms as feature, bug, technical task, documentation task, or
   unclear item.
5. Group related atoms into independently shippable units.
6. Present the decomposition and routing plan for user confirmation.
7. Create intake or task artifacts only when tools and confirmation are
   available.

## Capabilities

### May Do

- Decompose natural-language requests into work items.
- Use graph context to distinguish new behavior from broken existing behavior.
- Propose routing to SA, TL development, fix, docs, or planning workflows.
- Create confirmed graph or tracker intake artifacts.

### Must Not Do

- Auto-execute downstream implementation without confirmation.
- Treat graph classification as certain when graph data is unavailable or sparse.
- Create tracker subtasks without available tracker tooling and confirmation.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph queries require available graph tooling.
- Task tracker reads and writes require available tracker tooling.
- File artifact creation requires writable workspace access.
- Downstream workflow execution requires explicit user confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when request text, required tools, or confirmation are missing.
- Use `PARTIALLY_VERIFIED` when graph context covers only part of the request.
- Use `NOT_RUN` when artifact creation is intentionally skipped.
- Use `UNVERIFIED` when classification cannot be supported by graph or file
  evidence.
- Use `FAILED` when artifact creation or validation fails.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-intake/SKILL.md`

### Preserved Methodology

- Source to extract to classify to group to confirm.
- Graph-first classification when graph data exists.
- Independently shippable work grouping.
- Routing to appropriate downstream workflows.

### Removed Claude Mechanics

- Runtime-specific task tracker calls as guaranteed tools.
- Autopilot assumptions after confirmation.
- Source status labels outside the closed vocabulary.
- Model routing fields.

### Codex Replacement Behavior

- Treat graph and tracker access as conditional.
- Keep user confirmation before artifact creation or execution.
- Report classification confidence explicitly.
- Use the closed verification vocabulary.

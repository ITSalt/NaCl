---
name: nacl-tl-plan
description: |
  Create NaCl TL implementation plans from graph SA specifications, including
  waves, backend and frontend tasks, technical tasks, API contracts, and TL
  tracking files. Use when planning implementation from graph scope, generating
  tasks, or when the user says `/nacl-tl-plan`.
---

# NaCl TL Plan For Codex

Planning creates implementation artifacts from SA graph data. Read
`../nacl-core/SKILL.md` and `../nacl-tl-core/SKILL.md` first.

## Workflow

1. Resolve planning scope: full graph, module, use case list, feature request,
   or wave start.
2. Check that SA graph data exists and has enough module, use case, entity, form,
   and dependency context.
3. Build an execution wave plan from dependencies and priorities.
4. Present the planned files, graph writes, and wave structure.
5. Stop for confirmation before writing `.tl/` files or graph TL nodes.
6. Generate self-sufficient task files, API contracts, master plan, status, and
   changelog entries from templates.
7. Verify file structure and graph task counts when possible.

## Capabilities

### May Do

- Read SA graph context for planning.
- Generate `.tl/tasks/`, `.tl/master-plan.md`, `.tl/status.json`, and related
  planning artifacts.
- Create TL Wave and Task graph nodes when confirmed and graph tooling exists.
- Preserve self-sufficient task file contracts for downstream dev skills.

### Must Not Do

- Plan from incomplete SA graph data without reporting the gap.
- Write files or graph nodes without confirmation.
- Leave task files dependent on external SA docs for required implementation
  context.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- File generation requires writable workspace access and confirmation.
- Feature request scope requires readable feature request artifacts.
- Validation requires access to generated files and optional graph readback.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when SA graph data, templates, permissions, or confirmation are
  missing.
- Use `FAILED` when generated artifacts violate required structure.
- Use `PARTIALLY_VERIFIED` when files are generated but graph readback is
  unavailable, or the reverse.
- Use `NOT_RUN` for dry-run writes.
- Use `UNVERIFIED` when dependency ordering or generated scope cannot be checked.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-plan/SKILL.md`

### Preserved Methodology

- Graph-based planning from SA specifications.
- Wave planning by dependencies and priority.
- Self-sufficient backend, frontend, technical, and API contract task files.
- TL graph Task and Wave awareness.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph tool names.
- Source status labels outside the closed vocabulary.
- Self-referential old/new comparison wording.
- Model routing fields.

### Codex Replacement Behavior

- Treat graph and file writes as conditional and confirmed.
- Use TL core templates as artifact contracts.
- Verify generated artifacts when possible.
- Report scope or dependency uncertainty explicitly.

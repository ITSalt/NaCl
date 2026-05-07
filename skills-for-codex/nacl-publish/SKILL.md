---
name: nacl-publish
description: |
  Publish NaCl graph-derived Markdown and board artifacts to external
  documentation targets. Use when publishing graph docs, syncing Docmost pages,
  generating or linking boards, previewing publish scope, or when the user says
  `/nacl-publish`.
---

# NaCl Publish For Codex

Publish is a graph-read and external-write workflow. Read `../nacl-core/SKILL.md`
and `../nacl-render/SKILL.md` before publishing.

## Workflow

1. Resolve graph, documentation target, space, board directory, and manifest
   configuration.
2. Preview the publish scope and changed pages or boards.
3. Stop for confirmation before external writes or board file edits.
4. Generate Markdown through render behavior and publish create/update actions
   through available documentation tooling.
5. Generate board files or link board references only when the required tooling
   and paths are available.
6. Update the publish manifest when file editing is available and confirmed.

## Capabilities

### May Do

- Read graph data for documentation rendering.
- Create or update external documentation pages when documentation tooling is
  available and confirmed.
- Generate board artifacts through available render behavior.
- Maintain a publish manifest with page and board mappings.
- Preview publish changes without writing.

### Must Not Do

- Write graph data.
- Publish externally without user confirmation.
- Assume documentation or board tooling exists.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph reads require available graph tooling.
- Documentation publishing requires available documentation connector tooling.
- Board file creation requires writable board paths.
- Manifest writes require workspace permissions and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph access, documentation tooling, target config, paths,
  or confirmation are missing.
- Use `FAILED` when a publish or board operation returns failing evidence.
- Use `PARTIALLY_VERIFIED` when some pages or boards publish but others cannot
  be checked.
- Use `NOT_RUN` for preview-only operations.
- Use `UNVERIFIED` when external target state cannot be read back.

## Source Comparison

- Source Claude skill path: `../../nacl-publish/SKILL.md`

### Preserved Methodology

- Graph-derived Markdown publishing.
- Board generation and linking workflow.
- Manifest-driven create/update behavior.
- Preview before external writes.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph and documentation tool names.
- Source status labels outside the closed vocabulary.
- Model routing fields.
- Assumed external connector availability.

### Codex Replacement Behavior

- Treat graph, documentation, and board tooling as conditional.
- Require confirmation before external writes.
- Use render skill behavior for Markdown generation.
- Report publish evidence with the closed verification vocabulary.

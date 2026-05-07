---
name: nacl-render
description: |
  Render NaCl graph data into Markdown documents and diagrams, with board
  rendering delegated to the current analyst-tool workflow when available.
  Use when rendering graph docs, generating Markdown, previewing graph
  artifacts, or for compatibility with `/nacl-render`.
---

# NaCl Render For Codex

Rendering is read-only against the graph. Read `../nacl-core/SKILL.md` before
executing graph-backed rendering.

## Workflow

1. Resolve render command, graph scope, output mode, and destination path.
2. Read required graph data through available graph tooling.
3. Generate Markdown and Mermaid diagrams from graph structure.
4. Write output files only when the user requested file output and the path is
   writable.
5. For board rendering, use the current analyst-tool backend workflow when it
   is available; otherwise report the limitation.

## Capabilities

### May Do

- Render domain entities, use cases, forms, indexes, traceability, roles, and
  module overviews from graph data.
- Generate Mermaid diagrams from graph relationships.
- Print Markdown to the user or write it to a requested output path.
- Explain which graph query or data was unavailable.

### Must Not Do

- Write graph data.
- Hand-write diagrams that should be generated from graph structure.
- Invent missing graph entities or relationships.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph reads require available graph tooling.
- File output requires writable path access.
- Board rendering requires the analyst-tool path or service to be available.
- Query-library use is conditional on local query files being present.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph access, query files, output paths, or board tooling
  are unavailable.
- Use `FAILED` when rendering evidence is structurally invalid.
- Use `PARTIALLY_VERIFIED` when only part of the requested scope renders.
- Use `NOT_RUN` when a requested output mode is intentionally skipped.
- Use `UNVERIFIED` when generated output cannot be checked.

## Source Comparison

- Source Claude skill path: `../../nacl-render/SKILL.md`

### Preserved Methodology

- Graph-to-Markdown rendering.
- Mermaid generated from graph structure.
- Read-only graph behavior.
- File and terminal output modes.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph tool names.
- Board rendering instructions that depend on unavailable services.
- Model routing fields.
- Source status labels outside the closed vocabulary.

### Codex Replacement Behavior

- Treat graph access and board rendering as conditional.
- Keep Markdown rendering read-only.
- Delegate board rendering to analyst-tool when available.
- Report render evidence with the closed verification vocabulary.

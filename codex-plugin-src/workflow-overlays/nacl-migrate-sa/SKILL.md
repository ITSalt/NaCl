---
name: nacl-migrate-sa
description: |
  Migrate old-methodology SA Markdown into the NaCl graph with deterministic
  parsers, SA-internal edges, and BA-to-SA handoff links. Use when importing
  architecture, domain, role, use case, interface, requirement, or traceability
  docs, or when the user says `/nacl-migrate-sa`.
---

# NaCl SA Migration For Codex

## Installation mode preflight

Before any workflow work, reuse a `nacl_installation_doctor` result from the
current invocation or call that tool once when it is available. Continue only
when it returns `status=VERIFIED`; a `FAILED` or `BLOCKED` result stops the
workflow with its actionable guidance.

If the tool is absent or cannot be called, never infer legacy-only mode and do
not shell to a package/cache path. Report `BLOCKED`. The separate legacy
symlink distribution owns its own fallback; a plugin workflow uses only the
package MCP `nacl_installation_doctor` and preserves its exact result.

Use the scripts under the source `nacl-migrate-sa/scripts/` folder for parsing,
validation, handoff generation, and graph write plans. Do not improvise parsing.

## Workflow

1. Resolve project root, NaCl home, Python availability, adapter, and numbering
   scheme.
2. Run direct-invocation ID preflight and stop for user direction when needed.
3. Parse SA Markdown into structured SA and handoff outputs.
4. Validate references, dependencies, and BA handoff requirements.
5. Present graph writes and stop for confirmation unless dry-run mode is active.
6. Execute confirmed graph writes through available graph tooling.
7. Audit live graph counts and handoff links against expected outputs.

## Capabilities

### May Do

- Run deterministic SA migration scripts.
- Support SA-only operation when the user explicitly selects it.
- Create confirmed SA graph nodes, relationships, and handoff edges.
- Audit graph counts and cross-layer links.
- Produce an SA migration report.

### Must Not Do

- Parse Markdown manually.
- Create handoff edges when required BA source nodes are unavailable unless the
  user selected SA-only mode.
- Write graph data without confirmation.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Script execution requires source scripts and compatible Python.
- BA dependency checks require graph read access.
- Graph writes require available graph tooling and confirmation.
- Reports require writable workspace access.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when source docs, scripts, BA prerequisites, graph tools, or
  confirmation are missing.
- Use `FAILED` when parse, validation, write, or audit evidence fails.
- Use `PARTIALLY_VERIFIED` when graph writes run but handoff audit is incomplete.
- Use `NOT_RUN` for dry-run graph writes.
- Use `UNVERIFIED` when live graph state cannot be checked.

## Source Comparison

- Source Claude skill path: `../../nacl-migrate-sa/SKILL.md`

### Preserved Methodology

- Deterministic SA parsing and validation.
- Support for SA numbering variants.
- BA-to-SA handoff awareness.
- Live graph audit after writes.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph tool names.
- Runtime-specific project config assumptions.
- Model routing fields.
- Prompt-level parsing fallback.

### Codex Replacement Behavior

- Use source scripts as the parsing authority.
- Treat graph access as conditional tooling.
- Keep BA handoff checks explicit.
- Report results with the closed verification vocabulary.

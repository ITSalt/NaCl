---
name: nacl-tl-status
description: |
  Report NaCl TL project progress using graph Task/Wave data with `.tl/`
  fallback and SA coverage metrics when available. Use when checking progress,
  blockers, waves, QA, stubs, or when the user says `/nacl-tl-status`.
---

# NaCl TL Status For Codex

Status is read-only. It should not modify graph, files, git, or task trackers.

## Workflow

1. Resolve filters such as waves, backend, frontend, technical, stubs, QA,
   blockers, or compact mode.
2. Probe graph Task/Wave data through available graph tooling.
3. Fall back to `.tl/status.json`, reports, and registry files when graph data
   is unavailable.
4. Compute progress, blockers, phase status, QA evidence, stub evidence, and SA
   coverage when graph data supports it.
5. Return a concise status report with data-source notes.

## Capabilities

### May Do

- Read graph TL data and SA coverage context.
- Fall back to local TL files.
- Report progress by wave, phase, type, blocker, QA, and stub state.
- Highlight stale, blocked, or inconsistent task evidence.

### Must Not Do

- Modify graph or filesystem state.
- Claim SA coverage metrics in fallback-only mode.
- Hide data-source limitations.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph mode requires available graph tooling and populated TL data.
- Fallback mode requires readable `.tl/` files.
- QA and stub sections require available report files.
- No state-changing tools should be used by this skill.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when neither graph nor fallback state is available.
- Use `FAILED` when task state is internally inconsistent.
- Use `PARTIALLY_VERIFIED` when some sections can be computed and others cannot.
- Use `NOT_RUN` for sections excluded by filters.
- Use `UNVERIFIED` when a metric cannot be backed by available data.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-status/SKILL.md`

### Preserved Methodology

- Graph-first project status.
- File fallback.
- SA coverage metrics where graph data exists.
- Filters for waves, phases, blockers, QA, and stubs.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph tool names.
- Source comparison wording tied to older command naming.
- Source status labels outside the closed vocabulary.
- Model routing fields.

### Codex Replacement Behavior

- Keep status read-only.
- State the data source used.
- Report missing sections with the closed vocabulary.
- Avoid modifying tracking state.

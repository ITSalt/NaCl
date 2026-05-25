---
name: nacl-migrate
description: |
  Orchestrate one-time migration from old Markdown BA/SA artifacts into the
  graph-based NaCl methodology. Use when migrating a project to the graph,
  importing old-methodology docs, comparing rendered output, or when the user
  says `/nacl-migrate`.
---

# NaCl Migration Orchestrator For Codex

Coordinate migration phases without parsing Markdown directly. Read
`../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before executing.

## Goal Compatibility

This skill can be a target behind `nacl-goal` only through the
`migrate-canary` alias after that deferred 2.10.1 alias is available. Reference
`../nacl-goal/SKILL.md`, `../references/goal-codex-contract.md`, and
`../../nacl-goal/refusal-catalog.md`.

The goal loop may run only to the canary retrospective boundary. After that,
the interactive retrospective gate wins and the refusal code is
`REFUSE_POST_CANARY_RETROSPECTIVE`. Codex itself must not claim that Anthropic
`/goal` ran unless the runtime exposes it and evidence exists. Use the closed
Codex status vocabulary when the wrapper cannot run.

## Workflow

1. Preflight the project path, git state, Python availability, NaCl home, and
   source BA/SA folders.
2. Scan ID-shaped tokens before parsing and stop for user direction if unknown
   patterns are found.
3. Run initialization when required, then stop for confirmation.
4. Invoke BA migration, BA validation when available, SA migration, SA
   validation when available, TL diagnosis, and render comparison as separate
   phase contracts.
5. Aggregate phase evidence into `MIGRATION-REPORT.md` when file editing is
   available and confirmed.

Each major phase is a user-facing stop point.

## Capabilities

### May Do

- Resolve migration scope and planned phases.
- Run deterministic migration scripts from the source folders when available.
- Coordinate graph writes through available graph tooling.
- Produce migration reports and render-diff summaries.
- Resume from a named phase when prior outputs are present.

### Must Not Do

- Parse legacy Markdown by improvising in the prompt.
- Write graph data, create infrastructure, or modify files without confirmation.
- Continue past an unknown ID-pattern gate without user direction.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Script execution requires a located NaCl repo and compatible Python.
- Graph reads and writes require available graph tooling.
- File writes require workspace permissions and confirmation.
- Rendering and validation phases run only when their source scripts or skills
  are available.

### Blocked Or Unverified Reporting

- Use `BLOCKED` for missing source docs, missing scripts, unavailable graph
  tooling, or missing confirmation.
- Use `FAILED` when a script or validation phase returns failing evidence.
- Use `PARTIALLY_VERIFIED` when only a subset of planned phases ran.
- Use `NOT_RUN` for explicitly skipped phases.
- Use `UNVERIFIED` when live graph state or rendered output cannot be checked.

## Source Comparison

- Source Claude skill path: `../../nacl-migrate/SKILL.md`

### Preserved Methodology

- Hard phase gates for destructive-adjacent migration.
- BA then SA migration order with render comparison.
- ID-pattern preflight before parsing.
- Aggregated migration report.

### Removed Claude Mechanics

- Assumed runtime-specific subagent launch.
- Runtime-specific graph tool names as guaranteed capabilities.
- Runtime-specific project config instructions.
- Model routing fields.

### Codex Replacement Behavior

- Treat each downstream phase as an explicit contract.
- Use deterministic scripts when available and report honestly otherwise.
- Require confirmation before graph, file, or infrastructure changes.
- Use the closed verification vocabulary for the final report.

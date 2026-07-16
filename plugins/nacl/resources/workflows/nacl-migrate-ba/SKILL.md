---
name: nacl-migrate-ba
description: |
  Migrate old-methodology BA Markdown into the NaCl graph with deterministic
  parsers and auditable graph writes. Use when importing BA context, processes,
  entities, roles, rules, or glossary docs, or when the user says
  `/nacl-migrate-ba`.
---

# NaCl BA Migration For Codex

Use the scripts under the source `nacl-migrate-ba/scripts/` folder for parsing,
validation, and Cypher generation. Read `../nacl-core/SKILL.md` and the closed
verification vocabulary first.

## Workflow

1. Resolve project root, NaCl home, Python availability, and direct-invocation
   ID preflight.
2. Detect the BA adapter or use the adapter specified by the user.
3. Run parse, validation, and Cypher generation scripts.
4. Show the planned graph writes and stop for confirmation unless dry-run mode
   is active.
5. Execute graph writes through available graph tooling.
6. Query live graph counts and audit them against the parser output.
7. Write a BA migration report when file editing is available and confirmed.

## Capabilities

### May Do

- Run deterministic BA migration scripts.
- Read structured script outputs and surface remediation text.
- Execute confirmed graph writes for BA nodes and relationships.
- Audit live graph counts against expected counts.
- Produce direct-invocation warnings for unknown ID patterns.

### Must Not Do

- Parse Markdown manually.
- Guess an adapter for unknown formats.
- Write graph data without confirmation.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Script execution requires a located NaCl repo and compatible Python.
- Graph schema checks, reads, and writes require available graph tooling.
- File reports require writable workspace access.
- Direct invocation may stop until the user decides how to handle unknown ID
  patterns.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required scripts, source docs, graph tools, or confirmation
  are missing.
- Use `FAILED` when parsing, validation, graph writes, or audit evidence fails.
- Use `PARTIALLY_VERIFIED` when parsing succeeds but graph audit cannot fully
  run.
- Use `NOT_RUN` for dry-run graph writes.
- Use `UNVERIFIED` when live graph state cannot be checked.

## Source Comparison

- Source Claude skill path: `../../nacl-migrate-ba/SKILL.md`

### Preserved Methodology

- Deterministic BA parsing and validation.
- Adapter detection and unknown-format stop points.
- Batched graph write plan.
- Live graph audit after writes.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph tool names.
- Runtime-specific config file requirements as universal preconditions.
- Model routing fields.
- Prompt-level Markdown parsing fallback.

### Codex Replacement Behavior

- Use source scripts as the parsing authority.
- Treat graph access as conditional tooling.
- Require confirmation before graph mutation.
- Report results with the closed verification vocabulary.

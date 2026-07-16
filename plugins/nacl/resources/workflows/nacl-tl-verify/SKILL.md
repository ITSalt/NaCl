---
name: nacl-tl-verify
description: |
  Orchestrate NaCl post-ship verification through code checks, E2E QA when
  needed, report generation, and optional tracker updates. Use when verifying a
  task, checking implementation evidence, or when the user says
  `/nacl-tl-verify`.
---

# NaCl TL Verify For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Verification aggregates code-check and QA evidence. Read `../nacl-tl-core/SKILL.md`
and the relevant task files before executing.

## Workflow

1. Resolve task scope from UC ID, tracker item, or requested batch.
2. Read task context, implementation evidence, config, and previous reports.
3. Run available code checks first.
4. Run E2E QA when the task requires user-visible verification and browser
   tooling is available.
5. Perform integrity checks on evidence, report files, and task mapping.
6. Write verification reports and update local, graph, or tracker state when
   tools and confirmation are available.

## Source-Parity Requirements

- Preserve source steps: identify task, move to testing only when confirmed,
  code analysis, conditional E2E, compose report/artifacts, and final tracker
  move only when confirmed.
- Use `nacl-tl-verify-code` and QA/browser checks as separate evidence
  channels. One channel cannot substitute for the other when the task requires
  both.
- Parse downstream `Status:` lines and keep their raw evidence in the report.
- Missing E2E infrastructure, browser tooling, runtime environment, task
  context, or tracker tooling must downgrade to `PARTIALLY_VERIFIED`,
  `BLOCKED`, or `UNVERIFIED`.
- Tracker, graph, or report writes require confirmation and read-back.

## Capabilities

### May Do

- Coordinate static code checks and E2E QA.
- Aggregate evidence into a verification report.
- Read and update local TL verification state when confirmed.
- Post or move tracker items when tracker tooling is available and confirmed.
- Distinguish code-only and E2E-backed evidence in the reason field.

### Must Not Do

- Treat missing tests or missing QA tooling as verified evidence.
- Skip required QA without reporting the evidence gap.
- Mark tracker or graph state verified without checked evidence.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Code checks require available project commands and file access.
- E2E checks require browser tooling and reachable target environment.
- Report writes require writable workspace access.
- Graph and tracker updates require available tooling and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task context, tooling, environment, or confirmation is
  missing.
- Use `FAILED` when code checks, QA, or integrity checks fail.
- Use `PARTIALLY_VERIFIED` when only code-only or only E2E evidence is available
  for a scope that needs both.
- Use `NOT_RUN` for intentionally skipped checks.
- Use `UNVERIFIED` when evidence cannot establish the task result.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-verify/SKILL.md`

### Preserved Methodology

- Verification orchestration across code checks and E2E QA.
- Local report generation.
- Optional task tracker updates.
- Evidence integrity checks.

### Removed Claude Mechanics

- Source headline and status vocabulary outside the closed status set.
- Guaranteed runtime-specific verification-code skill and tracker tools.
- Runtime-specific task chat behavior.
- Model routing fields.

### Codex Replacement Behavior

- Treat code checks, QA, graph, and tracker actions as conditional.
- Use reason fields to distinguish evidence depth.
- Require checked evidence before verified state updates.
- Report with the closed verification vocabulary.

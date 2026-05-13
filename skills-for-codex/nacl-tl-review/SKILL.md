---
name: nacl-tl-review
description: |
  Review NaCl TL implementation against task specs, API contracts, tests,
  stubs, and quality checklists. Use when reviewing backend, frontend, or full
  UC/TECH implementation, requesting changes, approving work, or when the user
  says `/nacl-tl-review`.
---

# NaCl TL Review For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Review is a gate between implementation and downstream sync, QA, docs, or ship
phases. Read `../nacl-tl-core/SKILL.md` before reviewing.

## Workflow

1. Resolve task ID, layer, changed files, task specs, API contracts, tests, and
   implementation results.
2. Compare implementation against task requirements and acceptance criteria.
3. Run or inspect relevant tests when available.
4. Check stubs, mocks, error handling, API contract alignment, security, and
   data persistence expectations.
5. Produce findings ordered by severity with file references.
6. Update review reports or TL tracking files when available and confirmed.

## Source-Parity Requirements

- Preserve the three source modes: backend `--be`, frontend `--fe`, and TECH
  with their distinct input files, review artifacts, and phase fields.
- Run the stub gate before quality review: inspect the registry/report and scan
  changed files for `TODO`, `FIXME`, `STUB`, `MOCK`, and `HACK`.
- Review TDD evidence, test output, acceptance criteria, API contracts,
  persistence, security, error handling, and test author independence.
- A review approval is not verification of runtime behavior. Missing test
  output, missing result files, or missing task specs blocks or downgrades the
  review.
- Review report or phase tracking writes require confirmation and read-back.
  Without confirmation, report findings inline and leave state unchanged.

## Capabilities

### May Do

- Review backend, frontend, full-stack, or technical task implementation.
- Run focused tests and static checks when available.
- Validate implementation against API contracts and task specs.
- Produce review reports and suggested corrections.
- Update review phase tracking when confirmed.

### Must Not Do

- Approve work with unresolved blocking findings.
- Rewrite implementation as part of review unless the user explicitly asks.
- Treat missing tests as passing evidence.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- File reads require workspace access.
- Test and lint commands require available project tooling.
- Report and tracking updates require writable workspace access and
  confirmation.
- Graph or task tracker updates require available tooling and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task specs, changed files, tools, or confirmation are
  missing.
- Use `FAILED` when review finds blocking or required-change issues.
- Use `PARTIALLY_VERIFIED` when only part of the implementation can be reviewed.
- Use `NOT_RUN` when tests or checks are intentionally skipped.
- Use `UNVERIFIED` when required behavior cannot be established.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-review/SKILL.md`

### Preserved Methodology

- Spec and contract-based implementation review.
- Test, stub, mock, and quality checklist awareness.
- Severity-ordered findings.
- Review report and phase tracking.

### Removed Claude Mechanics

- Source status labels outside the closed vocabulary.
- Runtime-specific review execution assumptions.
- Guaranteed tracker or graph update tooling.
- Model routing fields.

### Codex Replacement Behavior

- Use Codex code-review stance with concrete file references.
- Treat tests and trackers as conditional.
- Keep approval tied to verified evidence.
- Report with the closed verification vocabulary.

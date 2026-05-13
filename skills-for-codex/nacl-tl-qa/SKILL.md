---
name: nacl-tl-qa
description: |
  Run end-to-end QA for NaCl UC tasks through available browser automation,
  screenshots, and acceptance criteria evidence. Use when testing a UC,
  checking user-visible behavior, running QA, or when the user says
  `/nacl-tl-qa`.
---

# NaCl TL QA For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

QA checks behavior, not implementation internals. Read `../nacl-tl-core/SKILL.md`
and task acceptance criteria before testing.

## Workflow

1. Resolve UC task ID, frontend URL, backend URL, credentials, and report paths.
2. Check task readiness from sync and stub evidence.
3. Confirm servers or deployed targets are reachable.
4. Identify testable acceptance criteria.
5. Execute user-visible scenarios through available browser automation.
6. Capture screenshots or equivalent evidence for significant steps.
7. Write `qa-report.md` and update tracking files when file editing is available
   and confirmed.

## Source-Parity Requirements

- QA is a user-visible behavior gate, separate from code review and code
  verification.
- Run browser/server checks only when the required app, credentials, routes,
  data, and tooling are available. Missing infrastructure is `Status: BLOCKED`
  or `Status: NOT_RUN`, not a pass.
- Evidence must include the executed scenario, observed result, and any
  screenshot, log, or trace available from the tooling.
- Acceptance criteria that are not exercised must be listed as unverified.
- Tracker, graph, and report writes require confirmation and read-back.

## Capabilities

### May Do

- Read UC task files and acceptance criteria.
- Use available browser automation to test user workflows.
- Capture screenshots or equivalent evidence.
- Produce QA reports and update TL tracking files.
- Identify non-testable criteria separately from failing behavior.

### Must Not Do

- Review source code as a substitute for user-visible QA.
- Claim QA verification without executed scenarios and evidence.
- Delete existing evidence without confirming replacement behavior.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Browser testing requires available browser automation tooling.
- Server checks require reachable configured URLs.
- Screenshot and report writes require writable paths.
- Task tracker or graph updates require available tooling and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task files, servers, credentials, browser tooling, or
  confirmation are missing.
- Use `FAILED` when a testable acceptance criterion fails.
- Use `PARTIALLY_VERIFIED` when only some criteria can be tested.
- Use `NOT_RUN` for criteria outside the requested QA scope.
- Use `UNVERIFIED` when no executed evidence can establish behavior.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-qa/SKILL.md`

### Preserved Methodology

- Acceptance-criteria-driven E2E QA.
- Real user perspective through browser automation.
- Screenshot-backed evidence.
- QA report and tracking updates.

### Removed Claude Mechanics

- Guaranteed runtime-specific browser tool names.
- Source headline vocabulary outside the closed status set.
- Hardcoded report decorations.
- Model routing fields.

### Codex Replacement Behavior

- Use browser automation only when available.
- Treat missing infrastructure as `BLOCKED`.
- Report partial scenario coverage explicitly.
- Keep QA separate from code review.

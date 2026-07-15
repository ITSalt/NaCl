---
name: nacl-tl-reconcile
description: |
  Reconcile NaCl documentation with current code reality during emergency drift
  recovery. Use when documentation is massively outdated, diagnosis recommends
  reconciliation, scope-specific docs must catch up to code, or when the user
  says `/nacl-tl-reconcile`.
---

# NaCl TL Reconcile For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Reconciliation is an exception workflow: docs catch up to current code reality.
It should not change code.

## Workflow

1. Read a fresh diagnostic report or run diagnosis when the user confirms.
2. Resolve scope and discrepancies between docs, TL artifacts, and code.
3. Check freshness of referenced files before acting on each discrepancy.
4. Present the reconciliation plan and affected files.
5. Stop for confirmation before editing docs.
6. Update documentation through the relevant BA, SA, or TL documentation
   behavior when available.
7. Validate that documented behavior matches current code evidence.

## Source-Parity Requirements

- Preserve the source phases: diagnosis, plan, execute, validate, and report.
- Documentation follows observed code reality during reconciliation; do not use
  stale docs to overwrite current behavior.
- Edits to BA/SA/TL docs, `.tl/` state, graph records, or tracker records
  require an explicit plan, user confirmation, scoped writes, and read-back.
- Validation must include a rerun gap check when graph validators or build/test
  commands are unavailable. Missing validators or runners downgrade status;
  they do not become success.
- If graph and file state diverge after reconciliation, report
  `Status: UNVERIFIED` until the divergence is inspected.

## Capabilities

### May Do

- Analyze diagnostic reports and current code evidence.
- Update documentation to match implemented behavior during reconciliation.
- Coordinate relevant documentation skills or procedures.
- Produce a reconciliation report with residual risks.

### Must Not Do

- Change code.
- Reconcile stale diagnostic findings without freshness checks.
- Hide upstream unverified or failing evidence.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Diagnosis requires access to diagnostic evidence or confirmation to run it.
- Code and docs comparison requires file access.
- Doc edits require writable workspace access and confirmation.
- Graph or task tracker updates require available tooling and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when diagnostic evidence, file access, or confirmation is
  missing.
- Use `FAILED` when docs cannot be reconciled to code evidence.
- Use `PARTIALLY_VERIFIED` when only part of the requested scope is reconciled.
- Use `NOT_RUN` for dry-run edits.
- Use `UNVERIFIED` when code behavior cannot be established.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-reconcile/SKILL.md`

### Preserved Methodology

- Emergency docs-code reconciliation.
- Diagnostic-report-driven discrepancy list.
- Freshness checks before doc edits.
- Documentation-only remediation.

### Removed Claude Mechanics

- Source headline vocabulary outside the closed status set.
- Assumed inline execution of other runtime skills.
- Runtime-specific task chat scanning.
- Model routing fields.

### Codex Replacement Behavior

- Treat diagnosis and downstream docs updates as conditional.
- Require confirmation before doc edits.
- Report residual uncertainty explicitly.
- Keep code changes outside reconciliation.

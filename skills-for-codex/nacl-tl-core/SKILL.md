---
name: nacl-tl-core
description: |
  Shared NaCl TeamLead references for Codex-adapted TL skills: task contracts,
  bug-fix classification, TDD workflow, documentation synchronization,
  changelog format, review rules, and stub tracking. Use when a TL skill needs
  common lifecycle rules. This is primarily a reference skill.
---

# NaCl TL Core For Codex

This skill is a shared reference for Codex-adapted TeamLead skills. It is not a
primary user-facing workflow.

Read `../references/verification-vocabulary.md`, `../nacl-core/SKILL.md`, and
`references/tl-codex-contract.md` when applying these rules.

## Core Rules

- Preserve the graph-aware TL lifecycle and spec-first repair discipline.
- Read project `config.yaml` and relevant `.tl/` artifacts when file access is
  available.
- Prefer graph `Task`, `Wave`, and `APIEndpoint` data when graph access is
  available; use `.tl/` only as documented fallback or supplementary evidence.
- Use the configured workspace test command. Do not invent fallback runners.
- Keep documentation, task contracts, code, tests, and changelog evidence in
  sync.
- Use only the Codex verification vocabulary for top-level status reporting.
  Workflow-specific outcomes may be reported as details, not as replacement
  top-level statuses.
- Require preflight, explicit confirmation, scoped mutation, read-back, and
  evidence reporting before graph writes, file writes, tracker moves, git
  mutations, CI retries, deploys, merges, releases, or destructive cleanup.
- Treat review, sync, stubs, QA, docs, ship, verify, deploy, and release as
  separate gates. Passing one gate never implies another gate passed.

## Reference Files

- `references/fix-classification-rules.md` - L0/L1/L2/L3 fix classification.
- `references/sa-doc-update-matrix.md` - which BA/SA/TL docs change for each
  behavior change.
- `references/tdd-workflow.md` - RED/GREEN/REFACTOR discipline.
- `references/review-checklist.md` - implementation review criteria.
- `references/changelog-format.md` - changelog entry format.
- `references/stub-tracking-rules.md` - stub and placeholder tracking rules.
- `references/tl-codex-contract.md` - shared graph, status, mutation, runner,
  TDD, gate, and Codex orchestration contract for every TL skill.
- `templates/config-yaml-template.yaml` - starter project configuration used by
  `nacl-init`.

## Capabilities

### May Do

- Provide shared TL workflow, testing, documentation, and reporting rules.
- Read `.tl/`, `config.yaml`, and referenced artifacts when available.
- Explain how a downstream TL skill should classify and report verification
  evidence.

### Must Not Do

- Modify project files directly.
- Commit, push, deploy, or change branches.
- Select or constrain the runtime model.
- Replace a downstream skill's user confirmation gate.

### Conditional Tools And Actions

- File reads are conditional on workspace access.
- Tests and graph checks are conditional on configured tools and dependencies.
- References are advisory only when their files are unavailable; downstream
  skills must report missing references honestly.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required files, tools, permissions, or confirmation are
  unavailable.
- Use `UNVERIFIED` when the available evidence cannot establish compliance with
  the TL contract.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-core/`

### Preserved Methodology

- Shared TL lifecycle contracts.
- Canonical TL graph labels, relationships, named queries, and file fallback
  boundaries.
- Spec-first bug classification and documentation synchronization.
- TDD and review discipline.
- Changelog and quality-gate references.
- Mutation confirmation and read-back requirements.

### Removed Claude Mechanics

- Runtime-specific model routing.
- Assumptions about Claude-only skill invocation.
- Non-Codex status headlines as top-level verification states.

### Codex Replacement Behavior

- Keep common TL references available inside `skills-for-codex/`.
- Treat graph, test, browser, and delegation tools as conditional.
- Preserve Claude workflow outcomes as report details while using the Codex
  closed vocabulary for top-level status.

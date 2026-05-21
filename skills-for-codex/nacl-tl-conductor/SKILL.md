---
name: nacl-tl-conductor
description: |
  Coordinate NaCl TL batch workflow from intake scope through planning,
  development, verification, and delivery gates using explicit Codex
  orchestration contracts. Use when coordinating graph-aware batches, feature
  work, multiple UC/TECH/bug items, or compatibility with `/nacl-tl-conductor`.
---

# NaCl TL Conductor For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Coordinate the TL workflow without assuming isolated task runners. TL artifacts
and reports remain English.

Read `../references/orchestration-model.md`,
`../references/migration-rules.md`, `../references/verification-vocabulary.md`,
`../references/verification-evidence.md`, and `../nacl-core/SKILL.md` before
executing this skill.

## Contract

Inputs consumed:

- requested items such as `FR-NNN`, `UCNNN`, `TECH-NNN`, or bug descriptions;
- graph scope and dependencies when graph access is available;
- `.tl/master-plan.md` and `.tl/tasks/` when file access is available;
- downstream phase reports using the closed verification vocabulary.

Outputs produced:

- execution plan with phases, dependencies, and confirmation gates;
- conductor state updates when file editing is available and confirmed;
- per-item status table using only the closed vocabulary;
- final batch report.

Downstream consumers:

- human user;
- planning, implementation, verification, shipping, or release workflows.

## Orchestration Rules

- Use the approved pilot orchestration model.
- Do not claim isolated task execution exists.
- Pass explicit phase contracts: inputs, expected outputs, status, and failure
  handling.
- Use tools, file edits, graph access, tests, and supported delegation only when
  actually available.
- Stop at each major phase gate unless the user explicitly confirmed that gate.

## Workflow

### Phase 0: Intake And Scope

Resolve requested items. Prefer graph scope when graph tools are available; fall
back to `.tl/` files only when file access is available. If neither source is
available, report `BLOCKED` with reason.

Stop and ask the user to confirm the resolved scope.

### Phase 1: Execution Plan

Build an ordered plan for TECH tasks, UC tasks, bugs, verification, and delivery
gates. State each phase contract and expected status output.

Stop and ask the user whether to proceed to execution.

### Phase 2: Planning

When planning artifacts are missing and the relevant planning procedure is
available, run or invoke it according to the current Codex environment. Verify
that required task files exist before proceeding.

Report `BLOCKED`, `NOT_RUN`, or `UNVERIFIED` if planning cannot be completed or
checked.

### Phase 3: Development Coordination

For each item, select the relevant skill procedure and pass the task contract.
For backend pilot coverage, use `nacl-tl-dev-be` behavior for backend tasks.
Collect each result and verify it uses the closed vocabulary.

Do not mark an item verified unless downstream evidence supports `VERIFIED`.

### Phase 4: Verification And Delivery Gates

Run available verification and delivery steps only with user confirmation and
available tools. Use `PARTIALLY_VERIFIED` when only part of the required gate
can be checked.

**Evidence-completeness gate (mandatory before declaring batch COMPLETE):**
Query the graph for every Task in scope:

```cypher
MATCH (t:Task)
WHERE t.intake_id = $intakeId
  AND t.status IN ['done', 'verified-pending', 'blocked']
  AND (t.verification_evidence IS NULL OR t.verification_evidence = '')
RETURN t.id
```

If the query returns any rows, report `Status: BLOCKED` with reason
"`verification_evidence` missing on terminal tasks" and list the IDs.
Do not advance to Phase 5. See `../references/verification-evidence.md`
for the writer contract; the missing evidence is a writer-side bug,
not a reporting issue — do not patch it manually from the orchestrator.

### Phase 5: Final Report

Return a per-item table:

```text
Item | Phase | Status | Reason | Evidence
```

The Evidence column is sourced from `Task.verification_evidence` in the
graph (taxonomy: `../references/verification-evidence.md`). The same string
will appear in the release report's Evidence-level column — if it is
empty or `unknown` at this point, the release workflow will flag a
verification gap. Use only statuses from `verification-vocabulary.md`.

If any item has evidence `test-UNVERIFIED` or `no-test`, append a footer:

```text
Verification gaps: <Item> (<evidence>) — release will surface this.
```

Mirror of the release-workflow footer; emitted here so the user is not
surprised later.

## Capabilities

### May Do

- Read graph scope, `.tl/` files, and project configuration when available.
- Coordinate planning, development, verification, and delivery gates.
- Update conductor state files when file editing is available and confirmed.
- Use supported tools or delegation only when available.

### Must Not Do

- Write code directly as conductor.
- Review or verify its own implementation output as if independent.
- Assume isolated task execution exists.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- File edits require writable workspace access and user confirmation.
- Test, CI, git, and deployment actions require available tools and explicit
  confirmation.
- Delegation is conditional on Codex-supported subagents or tools being
  available in the current environment.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required tools, inputs, permissions, or confirmation are
  missing.
- Use `NOT_RUN` when a phase is intentionally skipped.
- Use `PARTIALLY_VERIFIED` when only some phase evidence is available.
- Use `UNVERIFIED` when a downstream result cannot be checked.
- Use `FAILED` with a reason when a downstream phase violates its contract.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-conductor/SKILL.md`

### Preserved Methodology

- Batch coordination from intake through delivery gates.
- Graph-aware scope preference.
- Per-item status reporting.
- Explicit downstream contracts.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed isolated source-runner delegation.
- Source status names outside the closed pilot vocabulary.
- Model routing assumptions.

### Codex Replacement Behavior

- Coordinate phases through explicit contracts.
- Use supported tools or delegation only when available.
- Preserve gates as user-facing stop points.
- Report partial and unverified outcomes with the closed vocabulary.

---
name: nacl-tl-conductor
description: |
  Coordinate NaCl TL batch workflow from intake scope through planning,
  development, verification, and delivery gates using explicit Codex
  orchestration contracts. Use when coordinating graph-aware batches, feature
  work, multiple UC/TECH/bug items, or compatibility with `/nacl-tl-conductor`.
---

# NaCl TL Conductor For Codex

## Packaged Gateway Binding

Read [`the packaged gateway binding`](../../references/workflow-gateway-contract.md)
and use only its `tl-task` sequence for Task state. Carry one exact project and
identity envelope, live lease/fence, expected revision, stable idempotency key,
and `APPROVE_TL_WRITE`. A successful terminal mutation must write parseable
`verification_evidence` in the same call. `no-test` additionally requires the
separate exact mutate input
`evidence_confirmation: CONFIRM_NO_TEST_EVIDENCE`. If Task-level named reads are absent,
the corresponding reconciliation/release gate is `BLOCKED`, not a local-file
fallback.

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Coordinate the TL workflow without assuming isolated task runners. TL artifacts
and reports remain English.

Read `../references/orchestration-model.md`,
`../references/migration-rules.md`, `../references/verification-vocabulary.md`,
`../references/verification-evidence.md`, and `../nacl-core/SKILL.md` before
executing this skill.

## Goal Compatibility

This skill can be a target behind `nacl-goal` only through a named alias from
`../../nacl-goal/aliases.md`, primarily `feature:<FR-NNN>` when that deferred
2.10.1 alias is available. Reference `../nacl-goal/SKILL.md` and
`../references/goal-codex-contract.md`.

The root annotation mentions `batch:<comma-list>`, but the current alias
catalog does not define `batch`; treat it as unsupported unless the root
catalog adds it. Codex itself must not claim that Anthropic `/goal` ran unless
the runtime exposes it and evidence exists. GOAL_PROOF is transcript evidence
for the evaluator, not a replacement for local verification. Use the closed
Codex status vocabulary when the wrapper cannot run.

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
Use only a packaged named Task-evidence read. The current pilot exposes only
the `summary` read, so this gate returns
`Status: BLOCKED` with code `TL_STATUS_QUERY_UNAVAILABLE`; do not execute an
inline graph statement or advance to Phase 4.5. When a later package adds the
named read, any successful terminal Task with empty/unrecognized evidence is a
writer-side bug and remains blocking; do not patch it manually here. See
`../references/verification-evidence.md`.

### Phase 4.5: Cross-artifact reconciliation

Phase 4 confirms the graph is internally consistent. Phase 4.5 confirms
the graph agrees with the other artifacts the chain produces.

Read every source of truth and run the pairwise checks below. Any
disagreement emits `Status: BLOCKED` with a per-pair delta report.

**Sources of truth (six):**

1. `.tl/status.json` — per-intake / per-UC totals.
2. `.tl/conductor-state.json` — per-phase markers (`phase`,
   `techTasks[*].status`, `ucTasks[*].status`).
3. `.tl/changelog.md` — released FR / UC / fix entries.
4. **Live Neo4j graph** — node counts and `Task.status` /
   `verification_evidence` / `release_tag` properties.
5. `.tl/release-status.json` — last release outcome.
6. `.tl/exceptions/` — active signed exceptions (W4 schema; expired
   entries are recorded but do not satisfy gates).

**Live graph reads only — no `.cypher` export fallback.** A stale
export is by definition out-of-date and would reintroduce the drift
class this gate exists to catch. If the project's graph container is
unreachable, report `Status: BLOCKED` with workflow detail
`graph_unavailable`. Do not fall back. Operators who must ship
despite an unreachable graph file a signed exception against gate
`graph-stale` (per W4 schema in `.tl/exceptions/_template.yaml`).

**Pairwise cross-checks:**

| Pair | Sources | Assertion |
|---|---|---|
| P-S1 | `.tl/status.json` totals vs live graph counts | totals match for `tasks`, `use_cases`, `modules`. |
| P-S2 | `.tl/changelog.md` vs graph `FeatureRequest` | every FR named in the most recent changelog section exists as a `FeatureRequest` node. |
| P-S3 | `.tl/release-status.json.release_tag` vs graph `release_tag` | tag in JSON appears on ≥1 `FeatureRequest` or intake `Task`. |
| P-S4 | `.tl/conductor-state.json.phase` vs `.tl/status.json` terminal statuses | if phase advanced to `quality_gate_passed`, no `pending` / `in_progress` Tasks remain in status.json. |
| P-S5 | `.tl/conductor-state.json.{techTasks, ucTasks}[*].status` vs graph `Task.status` | per-task entries match (mapped through the closed-set vocabulary). |
| P-S6 | live graph staleness (sa-validate L8) for the intake's UC closure | no node in the intake's UC closure carries `review_status='stale'` (a change landed upstream but dependents were never re-synced; `/nacl-tl-plan` clears them). W4 override gate: `stale-downstream`. |

A pair PASSES iff the assertion holds; or holds after an active
signed exception is applied. Expired exceptions do not satisfy a
pair.

**Worked examples (mapped to W0 baseline):**

- *Project-Alpha FR-007 in changelog but not in live graph* — P-S2
  fires. Report `Status: BLOCKED` with workflow detail
  `artifact-drift`; resolution is to replay the SA-feature step
  or file a `graph-stale` exception.
- *Project-Alpha conductor-state says "typecheck clean" but CI red* —
  P-S4 + P-S5 fire. Phase advance was premature; resolution is
  to drive non-terminal tasks to a terminal state before re-running
  the gate.

**Reconciliation evidence artifact:** on PASS (or PASS under an
active signed exception), write `.tl/reconciliation/<ISO-8601>.json`
per the template at `<project-root>/.tl/
reconciliation/_template.json`. Required fields: `timestamp`,
`intake_id`, `sources_checked`, `deltas` (per-pair with `pair_id`,
`assertion`, `outcome`, `details`), `active_exceptions`,
`expired_exceptions`, `terminal_status` (closed-set).

Only on `terminal_status == VERIFIED` does the workflow advance to
Phase 5.

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

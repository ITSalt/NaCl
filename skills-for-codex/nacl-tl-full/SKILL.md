---
name: nacl-tl-full
description: |
  Coordinate NaCl TL full lifecycle execution from graph-backed waves and tasks
  through development, review, verification, and final reporting with explicit
  Codex contracts. Use when running the full graph-aware TL workflow or
  compatibility with `/nacl-tl-full`.
---

# NaCl TL Full For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Coordinate graph-aware TL execution without assuming a separate isolated runner.
TL artifacts and reports remain English.

Read `../references/orchestration-model.md`,
`../references/migration-rules.md`, `../references/verification-vocabulary.md`,
`../nacl-core/SKILL.md`, and `../nacl-tl-conductor/SKILL.md` before executing
this skill.

## Goal Compatibility

This skill can be a target behind `nacl-goal` only through the `wave:<N>`
alias. Reference `../nacl-goal/SKILL.md` and
`../references/goal-codex-contract.md`.

Codex itself must not claim that Anthropic `/goal` ran unless the runtime
exposes it and evidence exists. The deterministic proof source is
`../../nacl-goal/checks/wave.sh <N>`. GOAL_PROOF is transcript evidence for the
evaluator, not a replacement for local verification. Use the closed Codex
status vocabulary when the wrapper cannot run.

## Contract

Inputs consumed:

- graph-backed `Wave` and `Task` records when graph access is available;
- `.tl/master-plan.md`, `.tl/status.json`, and `.tl/tasks/` when file access is
  available;
- project configuration for graph, task, build, test, or external workflow
  settings when file access is available;
- downstream implementation, review, synchronization, QA, documentation, and
  stub reports using the closed verification vocabulary.

Outputs produced:

- execution plan with selected wave or task scope;
- per-task and per-phase status table using only the closed verification
  vocabulary;
- graph and `.tl/status.json` update plan, or confirmed updates when tooling and
  permissions are available;
- final lifecycle report with evidence and unresolved problems.

Downstream consumers:

- human user;
- TL conductor workflow;
- delivery or release workflow;
- project status and diagnostics workflows.

## Orchestration Rules

- Use the shared Codex orchestration procedure from
  `../references/orchestration-model.md`.
- Each phase handoff must state inputs consumed, expected output artifact or
  graph change, allowed verification status, downstream consumer, and handling
  for `VERIFIED`, `FAILED`, `PARTIALLY_VERIFIED`, `BLOCKED`, `NOT_RUN`, and
  `UNVERIFIED`.
- Use supported tools, direct local execution, or supported delegation only when
  available in the current Codex environment.
- Collect, parse, and inspect every downstream result before changing phase
  state or advancing to the next step.
- When writing a terminal `Task.status` to the graph, also write
  `Task.verification_evidence` per `../references/verification-evidence.md`.
  Compose evidence from the downstream report's regression-test path
  (`test-GREEN:<path>`), or from a `Regression test: verification: <path>`
  line on an infrastructure item (`verify-GREEN:<path>` — the committed
  `.tl/tasks/<TASK_ID>/verification.md` record), or use `test-UNVERIFIED`
  per the taxonomy (`no-test` is legacy — no current producer). A terminal
  `done` write without parseable evidence is a writer
  contract violation; report `Status: BLOCKED` rather than write empty.
- A review or verification phase cannot be marked `VERIFIED` unless its check
  actually ran and the result was inspected.
- Ask for explicit user confirmation before graph writes, file writes,
  destructive actions, delivery actions, or the first execution phase.
- If the user approved an autonomous run, continue within the confirmed scope,
  but still stop for missing tools, unsafe actions, or scope changes.

## Parameters

Supported compatibility phrases:

- `/nacl-tl-full`
- `/nacl-tl-full --wave N`
- `/nacl-tl-full --task UC###`
- `/nacl-tl-full --feature FR-NNN`
- `/nacl-tl-full --yes`

Removed in W9-ci-clean-checkout:

- The SKIP-PLAN full-lifecycle flag formerly accepted by this skill
  — Phase 0 already auto-detects an already-populated graph
  (Task/Wave nodes present) and skips the planning subagent launch
  in that case. The flag was redundant; its only remaining use was
  bypassing planning when the graph WAS empty, which is precisely
  the case planning exists to handle. There is no inline override
  that resurrects the flag.

Removed in W3-blocking-qa:

- The bulk-QA-skip flag formerly accepted by this skill — QA bypass
  at the full-lifecycle layer is no longer an operator flag. For
  stage-level skips of `LIVE_PROVIDER_SMOKE` / `PROD_GOLDEN_PATH`
  only, invoke `/nacl-tl-qa UC### --skip-e2e` directly. If a
  mandatory stage ends up `NOT_RUN`, aggregate is forced to
  `UNVERIFIED` and a W4 signed exception is required to advance.
  Bulk-bypass needs route through W4 emergency mode.

Treat parameters as scope and gate preferences. They do not imply that any
specific delegation mechanism exists.

## Workflow

### Phase 0: Initialization

Check graph connectivity and graph schema availability when graph tools exist.
Probe for `Task` and `Wave` records. If graph access is unavailable, report
`BLOCKED` unless the user explicitly changes scope to a non-graph workflow.

Check `.tl/` planning files when file access exists. If planning is missing,
run or invoke the planning procedure only when the current environment
supports it and the user confirms. If planning is already populated (Task and
Wave records present in the graph), skip the planning procedure silently —
the previous SKIP-PLAN flag was removed in W9-ci-clean-checkout because
graph-state detection makes it unnecessary.

Stop and present the detected plan, selected scope, not-run phases, and required
confirmation unless `--yes` was explicitly provided.

### Phase 1: Wave 0 Technical Tasks

For each technical task in scope, coordinate development and review.

Contract:

- Inputs: task graph record, task file when available, dependencies, and current
  status.
- Expected output: implementation report, review report, graph update request,
  and status-file update request.
- Downstream consumer: later waves and final report.
- Verification: inspect implementation and review reports before advancing.

If required implementation or review procedures are unavailable, report
`BLOCKED`. If a procedure runs but evidence cannot be checked, report
`UNVERIFIED`.

### Phase 2: Use Case Waves

Process waves in graph order unless the user selected a single wave, task, or
feature scope. Respect graph dependencies before starting a use case.

Each use case lifecycle has these steps:

1. Backend development.
2. Backend review.
3. Frontend development.
4. Frontend review.
5. Backend-frontend synchronization.
6. Stub scan.
7. QA (the `nacl-tl-qa` skill applies its six-stage decomposition and aggregate rule; the bulk-QA-skip flag was removed at this layer in W3).
8. Documentation.

Contract for each step:

- Inputs: task file, current graph phase state, previous step result, and needed
  project files.
- Expected output: step report, evidence, and proposed task phase transition.
- Downstream consumer: next lifecycle step and final report.
- Verification: parse the downstream report and map it to the closed vocabulary
  before advancing.

Do not skip review, synchronization, stub scan, or documentation. If QA is
not executed by confirmed parameter, report that step as `NOT_RUN` and make the use
case aggregate `UNVERIFIED` unless later evidence verifies it.

### Phase 3: State Updates

Graph is the primary state when graph tooling is available. `.tl/status.json` is
secondary compatibility state when file access and write permission exist.

Before writing either store, present the intended transition and ask for
confirmation unless the user already confirmed autonomous writes for the current
scope.

If graph write cannot be completed, do not advance the phase. Report `BLOCKED` with the task,
phase, and reason. If graph and file state diverge, report `UNVERIFIED` until
diagnostics reconcile the state.

**Remote mode (multi-user shared graph):** the above is local mode (`config.yaml` `graph.mode`
absent or `local`). When `graph.mode: remote`, the graph is the SOLE source of truth and
`.tl/status.json` is a best-effort per-clone cache: a successful graph write advances the phase;
resume reads the graph only (no stale-cache fallback — HALT if the graph is unreachable). Before
working a task, resolve the per-machine id with
`NACL_DEVELOPER_ID="$(node nacl-core/scripts/resolve-developer-id.mjs --project-root .)"` (auto
`<git email|user>/<machine-key>`, so one human on two machines never self-collides), acquire its
claim-lock (`nacl-core/scripts/claim-task.mjs claim --dev "$NACL_DEVELOPER_ID"`), and stamp
`updated_by`/`updated_at` provenance on phase writes. See
`../../nacl-tl-core/references/remote-mode-coordination.md`.

### Phase 4: Final Validation

Before final reporting, verify every scoped task reached a terminal outcome in
the closed vocabulary. Query graph state when possible and inspect `.tl/` state
when available.

Run final stub or QA checks only when tools are available and scope permits. If
some checks cannot run, use `PARTIALLY_VERIFIED`, `NOT_RUN`, `BLOCKED`, or
`UNVERIFIED` as appropriate.

### Phase 5: Final Report

Return:

```text
Item | Phase | Status | Reason | Evidence
```

Include not-run checks, blocked tools, unsatisfied phases, unchecked downstream
outputs, graph-write results, file-write results, and recommended next
confirmed action.

## Status Mapping

Use only these verification statuses:

- `VERIFIED`
- `FAILED`
- `PARTIALLY_VERIFIED`
- `BLOCKED`
- `NOT_RUN`
- `UNVERIFIED`

When a downstream report uses other wording, map it to the closed vocabulary and
include the original wording only as evidence if needed. Do not create a new
top-level status.

## Resumption

When existing graph or `.tl/` state indicates incomplete progress:

- identify the first incomplete phase for each scoped task;
- verify dependencies before continuing;
- present the resume point to the user;
- ask for confirmation unless `--yes` was explicitly provided;
- continue from the confirmed phase only after previous phase evidence has been
  inspected.

If the resume point cannot be established, report `UNVERIFIED` and request
diagnostics or user direction.

## Capabilities

### May Do

- Coordinate graph-aware TL execution across waves, tasks, and lifecycle steps.
- Read project configuration, graph state, `.tl/` files, and reports when
  available.
- Use supported development, review, verification, and documentation procedures.
- Propose or perform confirmed graph and file state updates when tools and
  permissions are available.
- Inspect downstream outputs before advancing state.

### Must Not Do

- Assume isolated delegation exists.
- Select or constrain the runtime.
- Modify source root skill folders.
- Mark a phase `VERIFIED` without executed and inspected evidence.
- Write graph state, edit files, run destructive actions, or deliver changes
  without the required confirmation.
- Use statuses outside the closed verification vocabulary.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling and confirmed scope.
- File reads and writes require workspace access; writes require confirmation.
- Tests, builds, QA, and external workflow updates require configured tools.
- Git, delivery, release, and destructive actions require explicit user
  confirmation.
- Delegation is conditional on Codex-supported mechanisms available in the
  current environment.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required inputs, tools, permissions, infrastructure, or
  confirmation are unavailable.
- Use `NOT_RUN` when a phase is intentionally not executed.
- Use `PARTIALLY_VERIFIED` when only some required checks ran.
- Use `UNVERIFIED` when downstream output, graph state, or file state cannot be
  checked.
- Use `FAILED` with a reason when a phase violates its contract or new breakage
  is detected.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-full/SKILL.md`

### Preserved Methodology

- Graph-backed waves and tasks as primary execution scope.
- Full TL lifecycle across development, review, sync, stubs, QA, docs, and final
  reporting.
- Resume from graph or `.tl/` state.
- State consistency between graph and local TL status files.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Assumed isolated wave and phase execution.
- Source-specific execution commands for unsupported delegation.
- Status labels outside the closed verification vocabulary.

### Codex Replacement Behavior

- Coordinate lifecycle steps through explicit contracts and inspected outputs.
- Treat graph, file, test, external workflow, and delegation actions as
  conditional.
- Preserve start, write, delivery, and scope-change confirmation gates.
- Report blocked, incomplete, not-run, unsatisfied, or unchecked outcomes with the
  closed vocabulary.

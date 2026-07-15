---
name: nacl-tl-next
description: |
  Recommend the next actionable NaCl TL task using graph Task/Wave data with
  file fallback. Use when asking what to work on next, filtering by phase or
  wave, listing candidates, or when the user says `/nacl-tl-next`.
---

# NaCl TL Next For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Recommend a single next action unless the user asks for a list.

## Workflow

1. Resolve filters such as backend, frontend, technical, review, sync, QA, wave,
   or list mode.
2. Try graph mode by reading Task and Wave data through available graph tooling.
3. Fall back to `.tl/status.json` and `.tl/master-plan.md` when graph data is
   unavailable and files exist.
4. Score actionable candidates by dependencies, wave boundaries, phase order,
   priority, and available context.
5. Return one recommended command with rationale, plus parallel options when
   requested.

## Source-Parity Requirements

- Use `tl_active_wave`, `tl_actionable_tasks`, `tl_blocked_tasks`, and
  `tl_task_scoring` when graph access is available.
- Respect `DEPENDS_ON` and `IN_WAVE`; do not recommend a task with unfinished
  dependencies as actionable.
- Remote mode (`config.yaml` `graph.mode: remote`, shared graph): the
  `.tl/status.json` fallback in step 3 is DISABLED — HALT if the graph is
  unreachable. Recommendation is claim-first through the bundled gateway:
  call `nacl_graph_derive_worker_identity`, then
  `nacl_graph_claim_resource` for the exact `Task` with a stable idempotency
  key, bounded TTL, and `APPROVE_TL_WRITE`. If `LEASE_HELD`, skip to the next
  candidate; otherwise retain the fence for heartbeat, explicit handoff, or
  release. If the current public route exposes read-preflight only, return the
  mapped `TL_STATUS_QUERY_UNAVAILABLE` instead of claiming through a local
  script. Load
  [`the packaged remote coordination reference`](../../nacl-tl-core/references/remote-mode-coordination.md);
  never shell to a package/cache path or infer one from the project cwd.
- Use canonical task and wave IDs from graph or `.tl/` evidence. Do not invent
  task IDs, waves, priorities, or dependency state.
- In `.tl/` fallback mode, label the result as fallback-derived and omit
  graph-only scoring or SA coverage claims.
- Local recommendation is read-only. The remote claim-first path is the sole
  state-changing exception and requires the exact `tl-task` gateway route and
  approval; otherwise return the mapped closed gap.

## Capabilities

### May Do

- Read graph Task/Wave data and SA context when available.
- Fall back to file-based TL state.
- Filter recommendations by phase, type, or wave.
- Explain blockers and dependencies.

### Must Not Do

- Modify graph, files, git, or task tracker state.
- Recommend blocked tasks as actionable.
- Claim SA context enrichment when graph evidence is unavailable.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph mode requires graph tooling and populated TL data.
- Fallback mode requires readable `.tl/` files.
- Dependency scoring requires available task dependency data.
- No state-changing tool is used outside the explicit remote claim-first path.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when neither graph nor fallback files are available.
- Use `PARTIALLY_VERIFIED` when recommendation has task data but lacks full SA
  enrichment.
- Use `NOT_RUN` for graph mode or fallback mode that was intentionally skipped.
- Use `UNVERIFIED` when dependency state cannot be established.
- Use `FAILED` when candidate data is inconsistent.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-next/SKILL.md`

### Preserved Methodology

- Graph-first next task recommendation.
- File-based fallback.
- Phase, dependency, wave, and priority scoring.
- Single actionable recommendation by default.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph tool names.
- Source comparison table with self-referential wording.
- Source status labels outside the closed vocabulary.
- Model routing fields.

### Codex Replacement Behavior

- Treat graph access as conditional.
- Keep this skill read-only.
- Distinguish graph-enriched and fallback recommendations.
- Report uncertainty with the closed verification vocabulary.

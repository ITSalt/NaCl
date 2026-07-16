---
name: nacl-tl-diagnose
description: |
  Diagnose NaCl project health by analyzing git history, documentation drift,
  code health, regression patterns, and TL status evidence. Use when the project
  seems unhealthy, drift is suspected, or when the user says
  `/nacl-tl-diagnose`.
---

# NaCl TL Diagnose For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Diagnose and recommend next actions. Do not implement fixes in this skill.

## Workflow

1. Resolve diagnosis window, project scope, and focus area.
2. Collect git history, documentation state, TL state, code health signals, and
   regression patterns using available tools.
3. Parallelize independent reads when possible.
4. Score findings by severity and confidence.
5. Write `DIAGNOSTIC-REPORT.md` only when file editing is available and the user
   confirms.
6. Recommend which NaCl skill or manual action should run next.

## Source-Parity Requirements

- Preserve the source diagnostic dimensions: git health, documentation health,
  code health, optional server health, aggregation, targeted gap analysis, and
  final diagnostic report.
- Use parallel collection only when subagents are explicitly available and the
  work is non-overlapping. Otherwise collect directly and report any skipped
  dimension as `NOT_RUN` or `PARTIALLY_VERIFIED`.
- Treat green tests as one signal, not as proof that docs, TL status, stubs,
  CI, or runtime behavior are healthy.
- A diagnostic report write requires confirmation and read-back. Without a
  confirmed write, provide the report inline and keep repository state
  unchanged.

## Capabilities

### May Do

- Inspect git history, docs, `.tl/` files, and code health indicators.
- Identify stale docs, hot files, repeated fixes, and missing verification
  evidence.
- Read graph staleness as a first-class drift signal (not inferred from file
  dates): count nodes with `review_status='stale'`, bucket by `stale_origin`,
  note oldest `stale_since`. A non-empty result means an upstream change whose
  dependents were never re-synced (`/nacl-tl-plan` clears them); mark the probe
  unavailable if Neo4j is unreachable.
- Remote mode (`config.yaml` `graph.mode: remote`, shared graph): the graph is canonical and
  `.tl/status.json` is a per-clone cache, so status.json-vs-graph divergence is EXPECTED and benign
  (other developers' machines) — report it informationally, not as drift to reconcile. Keep weight on
  `stale_nodes`, which are real drift in either mode. See
  `../../nacl-tl-core/references/remote-mode-coordination.md`.
- Produce a structured diagnostic report.
- Recommend follow-up skills or manual investigation.

### Must Not Do

- Modify code or docs as part of diagnosis.
- Claim independent validation when only local evidence was gathered.
- Launch unsupported subagents.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Git analysis requires repository access.
- Code and docs analysis require file access.
- Test or linter checks require available project commands and user approval
  when they are costly.
- Report file writes require writable workspace access and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required repository, file, or tool access is unavailable.
- Use `FAILED` when a requested diagnostic check runs and finds failing
  evidence.
- Use `PARTIALLY_VERIFIED` when only some diagnostic dimensions can be checked.
- Use `NOT_RUN` for checks outside the requested scope.
- Use `UNVERIFIED` when evidence is insufficient for a conclusion.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-diagnose/SKILL.md`

### Preserved Methodology

- Data-driven project health diagnosis.
- Git, docs, code, and regression signal analysis.
- Diagnostic report with actionable recommendations.
- No fixes during diagnosis.

### Removed Claude Mechanics

- Assumed runtime-specific parallel agent launch.
- Source status labels outside the closed vocabulary.
- Runtime-specific tool names as guaranteed capabilities.
- Model routing fields.

### Codex Replacement Behavior

- Use available parallel tool calls and local evidence.
- Report unsupported dimensions honestly.
- Keep diagnosis separate from remediation.
- Use the closed verification vocabulary.

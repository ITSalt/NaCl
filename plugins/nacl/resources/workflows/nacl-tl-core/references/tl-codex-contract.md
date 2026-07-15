# Codex TL Contract

This reference is mandatory for every Codex-adapted `nacl-tl-*` skill. It
preserves the root TeamLead methodology while replacing Claude-only mechanics
with Codex-compatible, evidence-driven behavior.

## Top-Level Status

Every TL skill report must include exactly one top-level line:

```text
Status: VERIFIED | FAILED | PARTIALLY_VERIFIED | BLOCKED | NOT_RUN | UNVERIFIED
```

Workflow-specific outcomes such as `PASS`, `NO_INFRA`, `RUNNER_BROKEN`,
`REGRESSION`, `APPROVED`, `CHANGES REQUESTED`, `SYNC COMPLETE`, or source
headline variants are report details. They never replace the closed Codex
`Status:` value.

Use `VERIFIED` only when the required checks actually ran and were inspected.
Use `PARTIALLY_VERIFIED` when useful evidence exists but a required dimension
is missing. Use `BLOCKED` when required inputs, tools, permissions, or
confirmation are unavailable. Use `NOT_RUN` for intentionally skipped checks.
Use `UNVERIFIED` when the available evidence cannot establish the result. Use
`FAILED` for regressions, broken required gates, or blocking review findings.

Downstream orchestrators must parse the authoritative `Status:` line before
advancing a phase. Headlines are secondary context.

## Graph And File Truth

When graph access is available, TL skills must prefer the TL graph over file
fallbacks. The canonical schema lives at `graph-infra/schema/tl-schema.cypher`;
the canonical named queries live at `graph-infra/queries/tl-queries.cypher`.

Canonical TL labels:

- `Task`
- `Wave`
- `APIEndpoint`

Canonical TL and handoff relationships:

- `(:Task)-[:IN_WAVE]->(:Wave)`
- `(:Task)-[:DEPENDS_ON]->(:Task)`
- `(:Task)-[:IMPLEMENTS]->(:APIEndpoint)`
- `(:UseCase)-[:GENERATES]->(:Task)`
- `(:APIEndpoint)-[:CONSUMES]->(:DomainEntity)`
- `(:APIEndpoint)-[:PRODUCES]->(:DomainEntity)`

Canonical task properties include `status`, `wave`, `priority`, `phase_be`,
`phase_fe`, `phase_sync`, `phase_review_be`, `phase_review_fe`, `phase_qa`,
`created`, and `updated`.

Named query expectations include `tl_uc_task_context`, `tl_wave_tasks`,
`tl_blocked_tasks`, `tl_progress_stats`, `tl_actionable_tasks`,
`tl_active_wave`, `tl_task_with_uc_context`, `tl_progress_by_wave`,
`tl_phase_progress`, and `tl_task_scoring`.

When the graph is unavailable or empty, file fallback is allowed only if the
skill explicitly reports the fallback and avoids graph-only claims such as SA
coverage or graph completeness. Fallback files are evidence, not permission to
invent missing tasks, waves, API endpoints, dependencies, tracker IDs, release
tags, deployment URLs, or changelog entries.

## Mutation Protocol

Graph writes, file writes, tracker moves, branch changes, commits, pushes, CI
retries, deploys, merges, releases, and destructive cleanup all require:

1. Preflight: identify the exact target, current state, intended mutation, and
   evidence that the mutation is allowed.
2. Confirmation: get explicit user confirmation in the current workflow unless
   the user has already confirmed that exact mutation class and scope.
3. Write: mutate only the confirmed target and scope.
4. Read-back: inspect the written file, graph node, tracker state, git state,
   CI state, deployment health, or release artifact.
5. Report: include the command/tool result and the closed `Status:` value.

If any step cannot run, do not pretend persistence happened. Report
`BLOCKED`, `NOT_RUN`, or `UNVERIFIED` as appropriate.

## Test Runner And TDD

For testable code changes, development and fix skills must follow RED, GREEN,
and REFACTOR ordering. The regression test author contract is preserved: when
the source methodology delegates test authorship to `nacl-tl-regression-test`,
Codex must either run that workflow, clearly perform the equivalent test-author
step in the current session, or report the missing isolation as
`PARTIALLY_VERIFIED`, `BLOCKED`, or `UNVERIFIED`.

The test command must come from the nearest relevant `package.json`
`scripts.test`. Do not invent fallback runners. If `scripts.test` is missing,
report workflow detail `NO_INFRA` and top-level `Status: BLOCKED`. If the
runner cannot start or collection is broken, report workflow detail
`RUNNER_BROKEN` and top-level `Status: BLOCKED`.

Before editing testable code, capture the baseline failure set. After changes,
run the same configured command and compare postfix failures to the baseline.
Any new failure is workflow detail `REGRESSION` and top-level
`Status: FAILED`. A target RED-to-GREEN with unrelated baseline failures
remaining is at most `Status: PARTIALLY_VERIFIED`.

## Quality Gates

Review, sync, stub, QA, docs, ship, verify, deploy, and release gates are
separate evidence gates. Passing one gate does not imply another gate passed.
Review approval is not implementation verification. Missing browser evidence,
runtime checks, baseline data, CI status, deploy health, release health, or
stub scan evidence must downgrade the result honestly.

Read-only skills must remain read-only unless the user confirms a specific
tracking or report write. Stub scans must inspect production and test files,
including hollow or empty tests, and must preserve severity and registry
behavior. QA must report actual server/browser evidence and cannot mark missing
infrastructure as success.

## Codex Orchestration

Claude Task-agent instructions in source skills are methodology references, not
guaranteed Codex execution mechanics. Codex may use local work, available
subagents only when explicitly allowed, or direct tool execution. If an expected
delegation, tracker, graph, browser, CI, deploy, or release tool is unavailable,
report that limitation explicitly and keep the top-level status honest.

Do not select or constrain the runtime model. Source slash-command wording is a
compatibility trigger, not a Codex-only invocation requirement.

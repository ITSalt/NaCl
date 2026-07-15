# Codex Orchestration Model

This is the approved pilot orchestration model for Codex-adapted NaCl skills.
It is the highest-risk pilot artifact and must be used by pilot orchestrators,
especially `nacl-tl-conductor`.

## Source Constraint

The source NaCl orchestrators rely on Claude Task agents with isolated context.
Codex skills must not apply a naive text replacement such as "Task agent" to
"subagent". Codex orchestration is explicit workflow coordination, not an
assumption that isolated task runners exist.

## Codex-Native Orchestration

An orchestrator must:

- select the relevant skill procedure for each phase;
- pass explicit inputs, outputs, and contracts between phases;
- execute available local or tooling steps directly when appropriate;
- use Codex-supported subagents or tools only when they are actually available
  and suitable for the task;
- collect, inspect, and verify downstream outputs before advancing state;
- preserve explicit user confirmation gates;
- report unsupported delegation as `BLOCKED` or `UNVERIFIED` using the closed
  vocabulary;
- label partial failures and unverified results clearly.

## Contract Passing

Every phase handoff must state:

- input artifacts or graph records consumed;
- expected output artifact, graph change, or status;
- allowed verification status from `verification-vocabulary.md`;
- downstream consumer of the result;
- what happens on `FAILED`, `BLOCKED`, `PARTIALLY_VERIFIED`, `NOT_RUN`, or
  `UNVERIFIED`.

## Confirmation Gates

Before writing graph data, modifying project files, running destructive actions,
or moving to the next major workflow phase, ask the user for explicit
confirmation. If confirmation is not given, stop and report the next required
confirmation step.

For phased workflows, use wording like:

```text
Stop after Phase N and ask the user whether to proceed to Phase N+1.
```

## Failure Reporting

Use the closed verification vocabulary. Treat regression as a reason under
`FAILED`, for example:

```text
Status: FAILED
Reason: regression detected in backend test suite
```

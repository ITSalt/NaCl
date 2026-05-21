# Verification Evidence (Task.verification_evidence)

`Task.verification_evidence` is a string property on TL `Task` nodes that
records *how* a task was verified. It is **read** by the release workflow
(`nacl-tl-release`) and **must be written** by every Codex skill that
advances a Task to a terminal status. Leaving it empty on a `done` task
causes the release workflow to surface a "Verification gap" — a contract
violation, not normal output.

This file is the Codex-pilot mirror of `nacl-core/SKILL.md`
§ `Task.verification_evidence`. The taxonomy is identical; only the wording
is Codex-adapted.

## Values

| Value | When to write |
|---|---|
| `test-GREEN:<artifact_path>` | Status `VERIFIED` + regression test transitioned RED→GREEN. `<artifact_path>` is a repo-relative path (forward slashes, no leading `./`) of the test file or `.tl/tasks/<TASK_ID>/regression-test.md`. |
| `test-UNVERIFIED` | Status `UNVERIFIED` or `PARTIALLY_VERIFIED` — change applied but RED→GREEN not confirmed. |
| `no-test` | Status `VERIFIED` under an explicit user override (e.g. `--skip-verify` at delivery). |
| (unset / empty) | Status `FAILED` / `BLOCKED` / `NOT_RUN` — task is excluded from the release scope, so no evidence string is required. |

## Format Rules

- Single string. No JSON. No quoting.
- `test-GREEN` payload after `:` is a forward-slash, repo-relative path.
- `test-UNVERIFIED` and `no-test` carry no payload.

## Writer Contract

A Codex skill that writes a terminal Task status MUST set
`verification_evidence` in the same Cypher statement:

```cypher
MATCH (t:Task {id: $taskId})
SET t.status = $terminalStatus,
    t.verification_evidence = $evidence,
    t.updated = datetime()
```

If the upstream report does not carry a parseable `Regression test:` line
under a `VERIFIED` outcome, the orchestrator MUST report
`Status: BLOCKED` with reason "no regression test path" rather than write a
terminal status with empty evidence.

## Reader Contract

The release workflow reads the property and classifies:

- Prefix `test-GREEN:` → `test-GREEN` (path extracted for the report).
- Literal `test-UNVERIFIED` → `test-UNVERIFIED`.
- Literal `no-test` → `no-test`.
- Empty / unrecognised → `unknown` → release report's "Verification gap" footer.

## Writers

Every Codex skill that advances a Task to terminal status:

- `nacl-tl-conductor` (Phase 3 / development gate)
- `nacl-tl-full` (per-task aggregation)
- `nacl-tl-fix` (terminal write of fix-only flows)
- `nacl-tl-deliver` (under explicit `--skip-verify`)
- `nacl-tl-hotfix` (after RED→GREEN seam confirms)

## Gate

Every orchestrator that aggregates child statuses MUST verify, before
declaring its own COMPLETE, that every terminal Task carries non-empty
`verification_evidence`. Failing this check is a `BLOCKED` outcome, not a
silent pass — see `nacl-core/SKILL.md` § Task.verification_evidence.

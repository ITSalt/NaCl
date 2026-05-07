# Verification Vocabulary

Pilot Codex skills must use this closed set of verification statuses. Do not
invent local status names.

## Allowed Statuses

| Status | Meaning |
|---|---|
| `VERIFIED` | The required check ran and satisfied the skill contract. |
| `FAILED` | The required check ran and did not satisfy the skill contract. |
| `PARTIALLY_VERIFIED` | Some required checks ran and passed, but coverage is incomplete. |
| `BLOCKED` | The step could not run because a required input, tool, permission, infrastructure, or user confirmation is missing. |
| `NOT_RUN` | The step was intentionally not executed, with reason stated. |
| `UNVERIFIED` | The skill cannot establish whether the result satisfies the contract. |

## Reasons And Details

Use a reason/details field for specifics. Do not create a new top-level status
for each condition.

Example:

```text
Status: FAILED
Reason: regression detected in backend test suite
Details: New failures appeared after the implementation step.
```

Infrastructure or tooling absence should normally be:

```text
Status: BLOCKED
Reason: test runner is not configured in the backend workspace
```

## Reporting Rule

Do not claim graph writes, file edits, tests, tool calls, or downstream
verification succeeded unless they actually ran and their outputs were checked.


# GOAL_PROOF Protocol

The wire format that lets Anthropic's `/goal` command verify NaCl
objectives despite its transcript-only evaluator.

## Why this exists

`/goal`'s evaluator (Haiku 4.5 by default) decides each turn whether
the completion condition holds. It reads only the conversation
transcript. It cannot:

- run Cypher queries
- read `.tl/status.json`, `.tl/master-plan.md`, or any other file
- call the YouGile or Docmost APIs
- execute test runners
- inspect git state
- see exit codes from commands the primary session ran

It can only judge what the primary Claude session has surfaced into
the conversation.

GOAL_PROOF is the contract the primary session uses to surface
machine-checkable state into the transcript every turn. The evaluator's
entire job becomes: read the most recent GOAL_PROOF block and check
two fields.

## The block

```
GOAL_PROOF
alias: <alias>
tier: <S|M|L|XL>
check_command: <exact shell command run this turn>
result: GOAL_OK | GOAL_NOT_OK | GOAL_BLOCKED | GOAL_BUDGET_EXHAUSTED
evidence:
  - <key>: <value>
  - <key>: <value>
turns_so_far: <int>
observed_tokens: <int>
elapsed: <duration, e.g. 1h32m>
END_GOAL_PROOF
```

### Field reference

| Field | Required | Notes |
|---|---|---|
| `alias` | yes | The NaCl alias, e.g. `wave:5`, `fix:BUG-042` |
| `tier` | yes | One of `S`, `M`, `L`, `XL` |
| `check_command` | yes | The exact shell command run this turn. Stable across turns of one run |
| `result` | yes | One of the four enum values below |
| `evidence` | yes | Alias-specific key-value pairs the check script emitted |
| `turns_so_far` | yes | Monotonically increasing integer |
| `observed_tokens` | yes | Approximate session token count printed by the primary session |
| `elapsed` | yes | Wall-clock since `--start` |

### `result` semantics

- `GOAL_OK` — the alias condition is met. Triggers success exit.
- `GOAL_NOT_OK` — not met. Evaluator re-prompts another turn.
- `GOAL_BLOCKED` — met an unrecoverable condition (gate fired, scope
  creep detected, same-error-twice, etc.). Evaluator must treat as
  success-exit so the wrapper can finalize and write the run file.
  An additional `blocking_reason:` key in `evidence` is mandatory.
- `GOAL_BUDGET_EXHAUSTED` — the soft budget (turns, wall clock, or
  observed token target) tripped. Evaluator must treat as success-exit.

#### Evidence values may be JSON-inline (conduct, 2.18.0)

Most aliases emit scalar evidence values. The `conduct` alias additionally emits
two LIST-valued keys — `prs_opened` (one PR URL per shipped cluster) and
`per_cluster_status` (a record per cluster: `cluster_id`, `wave`, `state`,
`pr_url`, `ci_status`, `deploy_status`, `qa_aggregate`, `atoms_verified`,
`atoms_total`). These are emitted as compact JSON on a single `  - key: <json>`
line, preserving the one-line-per-key wire format. The transcript-only evaluator
does not parse them; it only checks `result == GOAL_OK`. They exist so a human
reviewing the transcript can see exactly which clusters shipped and which are
blocked. `conduct`'s `GOAL_BLOCKED_PARTIAL_WAVE` carries `resumable: partial` in
evidence (the only alias that does).

## How the evaluator is instructed

The completion condition the wrapper composes ends with this exact
paragraph:

> The goal is satisfied ONLY when the latest GOAL_PROOF block has
> `result == GOAL_OK` AND `.tl/goal-runs/<run_id>.md` exists AND that
> file contains the final proof. If you see `GOAL_BLOCKED` or
> `GOAL_BUDGET_EXHAUSTED`, treat the goal as cleared so the wrapper
> can finalize. Otherwise continue.

## Wire format stability

This block is a **wire format**. Any change to field names, the
`GOAL_PROOF` / `END_GOAL_PROOF` delimiters, the indentation, or the
enum vocabulary requires a major version bump on `/nacl-goal` and a
synchronized update of every check script under `nacl-goal/checks/`.
Renaming a field is a breaking change.

Out-of-band text between the `check_command`'s output and the
`GOAL_PROOF` block is forbidden — the parser that builds the run
file scans for the delimiters by looking at the *very next lines*
after the command output. Narrative belongs *above* the command
output or *after* `END_GOAL_PROOF`.

## Example — wave:5

```
$ ./nacl-goal/checks/wave.sh 5
total_tasks: 8
pass: 6
unverified: 1
blocked: 1
regression: 0
no_infra: 0
runner_broken: 0
last_status_transition: 2026-05-25T14:32:11Z
graph_state_hash: 5e2c...
GOAL_PROOF
alias: wave:5
tier: M
check_command: ./nacl-goal/checks/wave.sh 5
result: GOAL_NOT_OK
evidence:
  - total_tasks: 8
  - pass: 6
  - unverified: 1
  - blocked: 1
  - last_status_transition: 2026-05-25T14:32:11Z
  - graph_state_hash: 5e2c...
turns_so_far: 14
observed_tokens: 2150000
elapsed: 1h32m
END_GOAL_PROOF
```

## Example — fix:BUG-042 satisfied

```
$ ./nacl-goal/checks/fix.sh BUG-042
test_status: green
regression_test_committed: true
pr_url: https://github.com/example/example/pull/1234
pr_state: open
no_new_regressions: true
GOAL_PROOF
alias: fix:BUG-042
tier: S
check_command: ./nacl-goal/checks/fix.sh BUG-042
result: GOAL_OK
evidence:
  - test_status: green
  - regression_test_committed: true
  - pr_url: https://github.com/example/example/pull/1234
  - pr_state: open
  - no_new_regressions: true
turns_so_far: 7
observed_tokens: 480000
elapsed: 22m
END_GOAL_PROOF
```

## Example — GOAL_BLOCKED with reason

```
$ ./nacl-goal/checks/wave.sh 5
... (output) ...
GOAL_PROOF
alias: wave:5
tier: M
check_command: ./nacl-goal/checks/wave.sh 5
result: GOAL_BLOCKED
evidence:
  - blocking_reason: scope_creep
  - offending_node: Task TASK-991 (not in Wave 5 scope) transitioned to REGRESSION
  - detected_by: probe-stop-signals.sh
turns_so_far: 11
observed_tokens: 1700000
elapsed: 1h10m
END_GOAL_PROOF
```

## Author's note for primary session

When you are inside a `/goal` loop driven by `/nacl-goal`:

1. Run the check command at the **end** of every turn, after any
   tool calls you made this turn.
2. Print its raw output, unredacted, into the transcript.
3. Immediately after, print the GOAL_PROOF block. Nothing between them.
4. Do not editorialize inside the block. Narrative goes after
   `END_GOAL_PROOF`.
5. If the check command itself fails to run (missing dependency, broken
   script), print `result: GOAL_BLOCKED` with
   `blocking_reason: check_script_failed` and the stderr in evidence.

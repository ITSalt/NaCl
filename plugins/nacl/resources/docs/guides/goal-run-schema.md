# Goal Run Schema

Schema reference for `.tl/goal-runs/<run_id>.md`, the machine-parseable record of a single `/nacl-goal` execution.

## How run files are built

Each run file is built up **incrementally** by `/nacl-goal`'s outer process during a `--start` session. It is not written by the in-loop Claude session. The wrapper:

1. Scrapes `GOAL_PROOF` blocks from the transcript as each turn completes and merges their fields into the running record.
2. On `/goal` exit (any reason), runs the post-completion re-check — the same `check_script` as a separate process — and writes the result under `post_completion_recheck`.
3. Writes the finalized YAML front-matter and appends a free-form narrative section below the `---` delimiter.

This design ensures the run file is always written even if the in-loop session does not get another turn after the evaluator says yes.

**Schema enforcement:** This schema is documented in 2.10.0. Enforcement (validation on write, run-file parser, calibration aggregator) ships in 2.10.1.

---

## YAML schema

```yaml
---
run_id: <ISO-8601 timestamp + short alias slug>
alias: <string>
tier: S | M | L | XL
started_at: <ISO-8601>
ended_at: <ISO-8601>
workspace: <repo path or project name>
exit_reason: achieved | budget_exhausted | blocked | user_cleared | failed | crashed
budget:
  turns: <int>
  wall_clock_hours: <number>
  observed_token_target: <int>
actual:
  turns: <int>
  wall_clock: <duration>
  observed_tokens: <int>
  estimated_cost_usd: <number>          # 2.10.1 only
proof:
  check_command: <string>
  final_result: GOAL_OK | GOAL_NOT_OK | GOAL_BLOCKED | GOAL_BUDGET_EXHAUSTED
  evidence: { ... }
post_completion_recheck:
  ran: <bool>
  result: GOAL_OK | GOAL_NOT_OK | mismatch_skipped
  mismatch_detected: <bool>
changed_files: [ ... ]
graph_mutations:
  nodes_touched: <int>
  status_transitions:
    - { node_type, id, from, to }
skills_invoked: [ ... ]
gate_violation_attempts: [ ... ]
stop_signals_fired: [ ... ]
open_risks: [ ... ]
---
<free-form narrative below>
```

## Key fields

| Field | Notes |
|---|---|
| `run_id` | Format: `<YYYYMMDDTHHMMSSZ>-<alias-slug>`, e.g. `20260525T143200Z-wave-5`. Unique per run. |
| `exit_reason` | `achieved` = evaluator said yes and post-check agreed. `budget_exhausted` = soft budget tripped. `blocked` = `GOAL_BLOCKED` result. `user_cleared` = `/goal clear` issued manually. `failed` = check script error. `crashed` = process died, set by `abort`. |
| `post_completion_recheck.mismatch_detected` | `true` when the evaluator said yes but the post-completion re-check returned `GOAL_NOT_OK`. The wrapper emits a loud warning and does not mark the run as `achieved`. |
| `gate_violation_attempts` | Populated by the runtime gate detector hook (2.10.1). Each entry names the gate, the tool call that triggered it, and the turn number. |
| `estimated_cost_usd` | Computed from `actual.observed_tokens` and `nacl-goal/pricing.json`. Ships in 2.10.1. |

## File location

```
.tl/goal-runs/
  20260525T143200Z-wave-5.md
  20260525T152000Z-fix-BUG-042.md
  20260526T090100Z-reopened-drain.md
```

The `.tl/goal-runs/` directory is created on first `--start` invocation (2.10.1). In 2.10.0 the directory and schema are documented but no files are written.

# Release 2.10.1 — `autonomous-execution`

**Theme.** Enable real `/nacl-goal --start` runs. Ship the
operational infrastructure (run files, locking, resume, runtime gate
detection) that lets autonomous loops fail safely.

## What's new

### `--start` fully enabled

`/nacl-goal <alias> --start` issues the underlying `/goal` with the
composed condition. The wrapper now operates the full lifecycle:

1. Validates alias and permissions.
2. Takes the concurrent-execution lock (Architecture §7).
3. Writes a `goal_in_progress` marker to the graph.
4. Installs the runtime gate detector hook (§10).
5. Issues `/goal` with the GOAL_PROOF-instructing condition.
6. On exit (any reason), runs the post-completion re-check, writes
   the run file, releases the lock, removes the hook.

### `.tl/goal-runs/<run_id>.md` enforced

Every `--start` run produces a machine-parseable YAML-headed run file
matching `docs/guides/goal-run-schema.md`. The file is built up
incrementally from GOAL_PROOF blocks scraped out of the transcript,
plus the final post-completion re-check.

### Post-completion re-check (structural supervisor)

After `/goal` exits "yes", the wrapper re-runs the alias's
`check_script` as a separate process and stores its result under
`post_completion_recheck`. If it disagrees with the evaluator, the run
file flags `evaluator_vs_check_mismatch: true` and the wrapper emits a
loud warning. This is the structural (script-based, not LLM)
supervisor the audit demanded.

### Concurrent-execution lock

Two terminals can no longer run `/nacl-goal wave:5 --start` at once.
The graph carries `goal_lock_by` and `goal_lock_until` on nodes in
`lock_scope`. Second-runner returns `REFUSE_CONCURRENT_GOAL_LOCKED`,
naming the locking `run_id`. Stale locks (`goal_lock_until` in the
past) are treated as overwritable with a warning.

### Crash / resume

`/nacl-goal resume` re-runs the alias's check; if not yet `GOAL_OK`,
re-issues `/goal` with the same alias and remaining budget.
`/nacl-goal abort <run_id>` clears the marker and writes
`exit_reason=crashed` to the run file.

### Tier L / XL enabled with mandatory dollar-cost preview

Preview output now reads `nacl-goal/pricing.json` (Opus 4.7 + Haiku
4.5 rates) and computes an estimated dollar cost for the configured
soft budget. Tier XL still carries an unattended-overnight warning.

### Three new aliases

- `stubs-cleanup:<MOD-ID>` — Tier S
- `migrate-canary` — Tier L
- `feature:<FR-NNN>` — Tier L

### Stop-signals beyond budget

`probe-stop-signals.sh` runs each turn alongside the alias proof
script and detects: `no_progress_3_turns`, `same_error_twice`,
`regression_outside_scope`, `scope_creep`, `gate_violation_attempt`.
Each trips the alias check into `GOAL_BLOCKED` on the next probe.

### Runtime gate detector

`nacl-goal/gate-fire-detector.md` lists machine-detectable signatures
of Tier-C gates. A PostToolUse hook fires on every tool call during a
`/nacl-goal` session; on signature, it emits
`GATE_VIOLATION_DETECTED`, the proof script returns `GOAL_BLOCKED`,
and the wrapper records `gate_violation_attempts[]` in the run file.

## Acceptance tests in this release

v6, v7, v8, v9, v10, v11, v14, v15 from the plan's verification
table. v10 and v11 are real Tier S and Tier M runs on a fixture
project.

## Calibration loop (deferred to 2.10.2)

Aggregating `.tl/goal-runs/` to validate the v0 tier defaults will
land in 2.10.2 along with adjusted tier numbers if the data supports
it. v0 numbers (turns_soft 150 / 500 / 1200 / 3000; wall_clock_soft
2h / 6h / 16h / 36h; observed_token_target 3M / 8M / 20M / 50M) are
explicitly provisional.

## Memory

This release rewrites `project_goal_integration.md` with the
2.10.1-shipped alias list and known limitations. The note is deleted
on 2.10.2 ship.

NaCl 2.10.1 — autonomous-execution

The methodological rails from 2.10.0 are now live. `/nacl-goal <alias> --start` issues real autonomous runs against Anthropic's `/goal` evaluator.

What ships:

— Full `--start` lifecycle: concurrent-execution lock, `goal_in_progress` marker in the graph, runtime gate detector hook, post-completion re-check (a script, not an LLM), and a machine-parseable run file under `.tl/goal-runs/`.
— Three new aliases: `stubs-cleanup:<MOD-ID>` (Tier S), `migrate-canary` (Tier L), `feature:<FR-NNN>` (Tier L).
— Stop-signals beyond budget: `no_progress_3_turns`, `same_error_twice`, `regression_outside_scope`, `scope_creep`, `gate_violation_attempt` — any of these trips the alias into `GOAL_BLOCKED`.
— Tier L / XL enabled, each with a mandatory dollar-cost preview read from `nacl-goal/pricing.json`.
— Crash / resume: a stale `goal_in_progress` marker is detected on session start; `/nacl-goal resume` or `/nacl-goal abort <run_id>` handles it.

Release acceptance included real Tier S and Tier M runs on a fixture project. Both completed with `GOAL_OK` and matching post-completion re-checks.

One standing caution: Tier XL unattended overnight is not recommended until the 2.10.2 calibration report aggregates `.tl/goal-runs/` data and validates the v0 tier defaults.

Docs from 2.10.0 still apply: docs/guides/goal-command.md

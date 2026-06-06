NaCl 2.13.2 — utc-budget-clock

The `/nacl-goal intake` budget clock exists so the evaluator can deterministically stop a run that has truly run out of wall-clock. On macOS east of UTC it was stopping runs that had budget left: a live run with ~26 minutes of real elapsed reported `elapsed: 205m` against a 180m limit and terminated with a false `GOAL_BUDGET_EXHAUSTED`.

The root cause is a classic BSD/GNU `date` trap. `intake.sh` parses `budget.json` `started_at` (UTC ISO-8601, `Z` suffix) via a GNU→BSD fallback chain. In BSD `date`'s format string the trailing `Z` is a literal character, not a timezone designator — so without `-u` the UTC stamp is parsed as local time. On `TZ=Europe/Moscow` (UTC+3) that shifts the start epoch back by exactly 10800 s: elapsed gains +180m the moment the run starts, which happens to equal the Tier-M wall-clock limit. 26m real + 180m offset = 206m ≈ the observed 205m.

What ships:

— `-u` on both branches of the chain. BSD now parses the stamp as UTC (the actual bug); GNU is semantically unchanged for `Z`-suffixed stamps — verified in a debian container: identical epochs with and without `-u` under `TZ=Europe/Moscow`. The fallback ordering is preserved (BSD still rejects `-u -d`).

— A cross-platform regression test, authored by a separate sub-agent and verified RED before the fix: `elapsed=206m` + `GOAL_BUDGET_EXHAUSTED` on the un-fixed script under `TZ=Europe/Moscow`; GREEN after — `elapsed=26m` on both `TZ=Europe/Moscow` and `TZ=UTC`, on macOS BSD date and Linux GNU date. The test computes its fixture timestamps via epoch arithmetic, so it cannot replicate the bug it guards against.

No breaking changes — the GOAL_PROOF wire format, the result-decision rule, and the `budget.json` schema are untouched. One line of computation changed; the clock now measures time instead of geography.

Release notes: docs/releases/2.13.2-utc-budget-clock/release-notes.md

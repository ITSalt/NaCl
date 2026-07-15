# nacl-goal/gate-fire-detector.md

## Status: stub (2.10.0)

This file is populated in 2.10.1 with PostToolUse hook signatures for
Tier-C gate detection at runtime.

In 2.10.0, only static (alias-identity-based) Tier-C refusal is enforced.
That means `/nacl-goal` inspects the alias name and its declared
`tier_c_collisions` from `nacl-goal/aliases.md` at preview time and refuses
before any `/goal` is issued. Dynamic crossings — where a legal alias invokes
a skill that later discovers it needs a human-approval gate — are not yet
caught at runtime. This is an accepted 2.10.0 limitation.

## What ships in 2.10.1

`nacl-goal/gate-fire-detector.md` will list machine-detectable signatures of
each Tier-C gate sourced from:

    nacl-tl-core/references/gate-fire-catalog.md

The runtime gate detector (Architecture §10) installs a PostToolUse hook at
`--start` time. On every tool call during a `/nacl-goal` session, the hook
checks the tool name and arguments against the signatures here. On a match:

1. Prints a `GATE_VIOLATION_DETECTED` block to the transcript.
2. The alias proof script returns `GOAL_BLOCKED` on the next probe.
3. `/goal` exits via the `GOAL_BLOCKED` success-exit path.
4. The run file records the event in `gate_violation_attempts[]`.

The hook is removed at exit (any exit reason).

## Cross-reference

- `nacl-tl-core/references/gate-fire-catalog.md` — canonical gate catalog
- `nacl-goal/refusal-catalog.md` — refusal codes emitted when gates fire
- `nacl-goal/SKILL.md` §10 — architecture description

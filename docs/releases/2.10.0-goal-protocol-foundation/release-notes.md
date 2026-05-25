# Release 2.10.0 — `goal-protocol-foundation`

**Theme.** Integrate Anthropic's `/goal` command into NaCl, safely.
This release ships the methodological rails. Autonomous execution
arrives in 2.10.1.

## What's new

### `/nacl-goal` wrapper skill (preview / dry-run only)

A new orchestration skill that wraps Anthropic's `/goal` with NaCl
semantics. It resolves a high-level NaCl alias (`wave`, `fix`,
`validate`, `reopened-drain`) into a `/goal` completion condition that
the transcript-only evaluator can actually verify.

```
/nacl-goal wave:5             # preview only — prints plan, no /goal issued
/nacl-goal wave:5 --start     # 2.10.0: warns it is a 2.10.1 feature for
                              # Tier S/M, refuses for Tier L/XL
```

### GOAL_PROOF protocol

The `/goal` evaluator (Haiku 4.5 by default) cannot run tools or read
files — it only reads the conversation transcript. GOAL_PROOF is the
wire format the primary Claude session uses to surface
machine-checkable state into the transcript every turn so the
evaluator has something deterministic to judge.

See `docs/guides/goal-proof-protocol.md` for the schema. Treat it as a
wire format that does not drift between releases.

### Four aliases ready

- `wave:<N>` — Tier M
- `fix:<BUG-NNN>` — Tier S
- `validate:module:<MOD-ID>` — Tier S
- `reopened-drain` — Tier M

Check scripts ship under `nacl-goal/checks/`. Contracts pinned in
`nacl-goal/aliases.md`.

### Structured refusal catalog

Ten refusal codes (`REFUSE_HUMAN_GATE_BA_SA_HANDOFF`, ...,
`REFUSE_DANGEROUSLY_SKIP_PERMISSIONS`) live in
`nacl-goal/refusal-catalog.md`. Every refusal names the specific gate,
points to the interactive fallback, and prints a copy-paste command
for it.

### Permissions denylist

`/nacl-goal` refuses to run under `--dangerously-skip-permissions` or
in workspaces where trust has not been granted. Universal denylist
blocks `git push`, `gh pr merge`, `npm publish`, production DB
migrations, secret-file writes, and any action against
`main`/`master`/`release/*`.

### SKILL.md annotations

Seven orchestrator skills now carry a `## Use with /goal` section:
`nacl-tl-full`, `nacl-tl-conductor`, `nacl-tl-reopened`,
`nacl-sa-validate`, `nacl-tl-fix`, `nacl-tl-stubs`, `nacl-migrate`.

Three gate skills now carry a `## NOT for /goal` section:
`nacl-ba-full`, `nacl-sa-full`, `nacl-tl-hotfix`.

### CLAUDE.md template update

`/nacl-init` now emits a `## /goal command — local rules` block in
every new project's CLAUDE.md. The rules: prefer `/nacl-goal <alias>`
over raw `/goal`; if you must use raw `/goal`, embed a budget clause;
never `/goal` the four Tier-C skills; inspect `.tl/goal-runs/` after
any session that used a goal.

### Documentation

Four new docs under `docs/guides/`:

```
goal-command.md          ~200 lines  overview, when to use, examples
goal-proof-protocol.md   ~100 lines  wire format, schema, examples
goal-run-schema.md        ~50 lines  run-file schema reference
goal-permissions.md       ~80 lines  denylist, allowlist, modes
```

## What's NOT in this release

- `--start` does not run autonomously for Tier S/M (warns and exits);
  refuses for Tier L/XL.
- No `.tl/goal-runs/` writes (the schema is documented; enforcement
  ships in 2.10.1).
- No concurrent-execution lock (2.10.1).
- No crash/resume protocol (2.10.1).
- No `stubs-cleanup`, `migrate-canary`, `feature` aliases (2.10.1).
- No runtime gate detector hook (2.10.1; static refusal only in 2.10.0).
- No dollar-cost preview for Tier L/XL (2.10.1; pricing.json ships v0).

## Acceptance tests in this release

v1, v2, v3, v4, v5, v12, v13, v14, v15 from the plan's verification
table. No real long-running goals in CI.

## Background

The first draft of this integration assumed `/goal`'s evaluator could
run Cypher queries and read files. An independent audit cited
Anthropic's official `/goal` documentation and VentureBeat coverage
(May 2026) to show the evaluator is transcript-only. The plan was
restructured around the GOAL_PROOF wire format and split into two
shipments so that the safety rails land before autonomous execution.

## Memory

This release adds `feedback_goal_protocol.md` (lasting) and
`project_goal_integration.md` (release-scoped, deleted on 2.10.2 ship).

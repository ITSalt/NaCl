# Release 2.14.0 — `current-branch-batch-mode`

## Theme

`/nacl-goal intake` was designed around a pristine working tree: refuse on any
uncommitted change, create a fresh `feature/goal-<hash>` branch, push after every
atom. Real working trees don't look like that. A developer keeps ONE open feature
branch and batches several bug fixes (or a small feature) into it before rolling
the branch out; two or three agents work concurrently in the same checkout, each
holding uncommitted files; and a CI pipeline that costs ~5 minutes per push makes
per-atom pushes pure waste. The framework already knew the right economics —
`nacl-tl-conductor`'s "one branch per batch, one commit per item, one push at the
end" — the intake alias just hadn't inherited them.

2.14.0 makes the orchestrator a citizen of that tree. And while recalibrating the
git preconditions, it recalibrates the question policy to match: an autonomous
orchestrator that asks "I found a bug — do you confirm it's a bug?" is not
autonomous.

## Current-branch batch mode (new default)

Invoked from a non-production branch, the run now executes ON that branch:

- `branch_mode=current` — no `git checkout -b`; the run's branch IS your branch.
  The preview warns: one push at deliver, don't commit to the branch while the
  run is active. From `main`/`master`/`release/*` the production refusal still
  fires — that boundary did not move.
- `push_cadence=deferred` — atoms commit locally; `/nacl-tl-deliver`'s Step-2 push
  is THE single push of the run. The PR opens there, reading the wrapper-rendered
  `pr-body.md`, and CI runs once, on the full batch. `--push=per-atom` restores
  the old cadence; `--push=none` (dev-only targets) ends the run at verified
  local commits for a later manual delivery.
- Pre-existing branch commits are annotated in a dedicated PR-body section
  (`branch_base_sha`, `prior_unpushed_commits`), and every goal commit carries the
  `Goal-run-id:` trailer — `git log --grep` separates the run's work from the
  user's prior batch cleanly. `git bisect` over the goal range localizes a late
  CI failure without N CI runs.
- `--branch=new` reproduces the pre-2.14 flow byte-for-byte (fresh goal branch,
  per-atom pushes, dirty-worktree refusal).

## Smart WIP — shared worktrees stop refusing

`PLAN_BLOCKED_DIRTY_WORKTREE` no longer fires in current mode just because the
tree is dirty. Uncommitted files are presumed to be **another agent's in-flight
work**: the run never stages, commits, or reverts them. Protection against real
overlap is two-layered, because predicting a bug fix's touch zone before
diagnosis is inherently approximate:

1. **LOCK-time prediction** — each atom's coarse touch zone (linked UC → Module →
   workspace directories + api-contracts) is intersected with the
   `preexisting_dirty_files` snapshot. Intersection → ONE consolidated
   pre-`/goal` question (continue / commit those files / exclude the atom);
   declined or non-interactive → the refusal, now scoped to the actual conflict.
2. **Commit-time gate** — `/nacl-tl-ship` (append mode) now stages selectively as
   a hard rule (never `git add -A` in a shared worktree) and refuses to stage any
   snapshot path; the wrapper's post-atom diff check is the backstop. A collision
   emits `GOAL_BLOCKED_WIP_COLLISION` — the only **resumable** GOAL_BLOCKED code:
   resolve the overlap, `/nacl-goal resume`, the wrapper re-snapshots and retries
   the atom.

The regression baseline and postfix now run in **throwaway worktrees pinned to
fixed SHAs** (HEAD-at-start / `goal_final_sha`), so a neighbor's evolving WIP can
never contaminate the regression diff. Capture schema gains `worktree_isolated`
and `captured_at_sha`; provisioning failures fall back to in-tree runs with
disclosure in GOAL_PROOF — degraded, never silent. Baseline semantics under
current mode: regressions are measured against "the branch as it was when the
goal started", so the run is only ever blamed for breakage it introduced.

Explicit non-goal: concurrent **commits** to the run branch during an active run.
The drift checks (`GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER`) catch them — by
design. Under deferred cadence the `pr_head_sha` comparison naturally moves to
the post-push check; a null PR head mid-run is "not yet", not "diverged".

## Autonomous question policy

`/nacl-tl-intake` gains `--autonomous` — set ONLY by the wrapper alongside
`--yes --emit-state`; a human typing `/nacl-tl-intake --yes` sees zero change.
Under it, the Step 2b gates recalibrate per the gate-calibration principle (ask
in plain words only when getting it wrong is expensive to undo):

| Gate | Before (even with `--yes`) | 2.14.0 autonomous |
|---|---|---|
| L2/L3 "ready to start?" (B) | prompts | auto-confirms — invoking the orchestrator IS the launch intent |
| MEDIUM "best guess — correct?" (D) | prompts | auto-routes on the leading guess; alternative tracked as `residual_note` (`medium_confidence_alternative`), disclosed in the headline |
| LOW/HEURISTIC open disambiguation (E) | prompts per atom | ONE consolidated pre-`/goal` batch question |
| Hard-refuse decisions (C) | prompts | **unchanged** — billing, auth, schema migrations, destructive ops, product decisions still refuse before `/goal` |

The MEDIUM auto-route is pre-authorized via a new envelope gate
`medium-confidence-routing` with the same hard-refuse exclusions as the existing
gates, audit-logged in `exceptions.log` and the PR-body authorization section.
Misrouting bug↔task is recoverable — `/nacl-tl-fix`'s spec-first gate still
protects the spec, and the tracked alternative lets the user re-route after the
fact. `PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION` is tightened accordingly: it now
fires only for LOW/HEURISTIC atoms left unresolved after the batch.

## Regression tests

Four new check-script tests (all green, alongside the 2.13.2 TZ test):

- `test-intake-push-none-no-pr.sh` — `push=none` + dev-only reaches `GOAL_OK`
  with no PR and `ci_status: n/a` (the regression test for the previously
  unconditional `pr_url == null → fail`).
- `test-intake-current-branch-drift.sh` — drift still fires on the user's own
  branch when HEAD moves past the frozen `goal_final_sha`.
- `test-intake-deferred-pr-lifecycle.sh` — null PR head pre-push is not drift;
  after the single push the PR head participates in drift checks normally.
- `test-intake-wip-collision.sh` — a failed atom carrying
  `block_code: GOAL_BLOCKED_WIP_COLLISION` maps to the dedicated resumable code
  with `collision_atom_id`, taking precedence over the generic atom failure.

## What did NOT change

- `--branch=new` is byte-for-byte the pre-2.14 flow; absent the new env var
  (`NACL_SHIP_PUSH`), ship's append mode pushes per atom exactly as before.
- Pre-2.14 run artifacts stay valid: `intake.sh` defaults missing
  `branch_mode`/`push_cadence` to `new`/`per-atom`.
- GOAL_PROOF wire format: existing evidence keys and their order unchanged; five
  advisory keys appended at the end. No refusal/block codes renamed or removed
  (one added: `GOAL_BLOCKED_WIP_COLLISION`).
- The production-branch refusal, the hard-refuse trigger set, and the envelope's
  hard-refuse list did not move an inch.

## Files

- `nacl-goal/SKILL.md` — intake flags, Flow steps 3/5/9/10/11/11.5/12, env-var
  table, resumable-state table, version note
- `nacl-goal/aliases.md`, `envelope.md`, `plan-lock-schema.md`,
  `run-artifacts.md`, `regression-schema.md`, `pr-body-template.md`,
  `refusal-catalog.md` — contracts
- `nacl-goal/checks/intake.sh` + `checks/tests/test-intake-*.sh` — check script
  + 4 new tests
- `nacl-tl-ship/SKILL.md`, `nacl-tl-deliver/SKILL.md`, `nacl-tl-intake/SKILL.md`
  — inner-skill wiring + `--autonomous`
- `skills-for-codex/nacl-goal|nacl-tl-ship|nacl-tl-deliver|nacl-tl-intake/SKILL.md`
  — Codex mirrors

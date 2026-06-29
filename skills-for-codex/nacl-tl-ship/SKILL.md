---
name: nacl-tl-ship
description: |
  Commit, push, create pull requests, and update delivery metadata for NaCl TL
  work after required checks pass. Use when shipping code, creating a PR,
  pushing a feature branch, finishing development, or when the user says
  `/nacl-tl-ship`.
---

# NaCl TL Ship For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Shipping mutates git and possibly external trackers. It is confirmation-gated.

## Workflow

1. Resolve scope, current branch, git strategy, base branch, commands, and
   upstream verification evidence.
2. Check that the current branch is allowed for the configured strategy.
3. Run configured build and test commands when available and relevant.
4. Present staged files, commit message, push target, and PR plan.
5. Stop for confirmation before commit, push, PR creation, or tracker updates.
6. Execute approved git operations and record evidence.
7. Update graph or tracker metadata only when tooling exists and confirmation is
   given.
8. Report the result and name the concrete follow-on skill for the next action —
   never a prose description. Resolve it from the shipped state: `/nacl-tl-verify`
   to verify the implementation; `/nacl-tl-release --pr <N>` to merge the PR into
   the resolved base branch (release is the only skill that merges a PR, and it
   reads the base branch from `git.main_branch`). When no UC/FR id is available
   (a bare bug-fix), omit the id argument rather than substituting prose like
   "review and merge the PR".

## Source-Parity Requirements

- Read `config.yaml` before git decisions. Respect `git.strategy`,
  `git.main_branch`, branch prefix, build command, test command, and deploy
  settings when present.
- Inspect dirty state before staging. Stage only intended files and show the
  staged path list before commit.
- In feature-branch strategy, do not commit to the base branch. If the current
  branch is wrong, stop and ask.
- Prior verification evidence gates shipping. Local checks are a sanity check,
  not a replacement for upstream review/verify status.
- Remote mode (`config.yaml` `graph.mode: remote`, shared graph): read the prior verification status
  from the graph `Task` node (authoritative), never from the per-clone `.tl/status.json`; after a
  successful push, release the claim-lock (`nacl-core/scripts/claim-task.mjs release`). Local mode is
  unchanged. See `../../nacl-tl-core/references/remote-mode-coordination.md`.
- Commit, push, PR creation, tracker updates, graph updates, and deploy handoff
  all require confirmation and read-back evidence.
- Goal-context append mode (`NACL_SHIP_MODE` / `NACL_GOAL_BRANCH` /
  `NACL_SHIP_PUSH` / `NACL_GOAL_CLUSTER_ID` env vars) is a Claude-runtime
  mechanism driven by `/nacl-goal intake` and `/nacl-goal conduct`; Codex does
  not run it. If those env vars are present in a Codex session, ignore them and
  follow the interactive workflow. `NACL_GOAL_CLUSTER_ID` (conduct, 2.18.0) only
  redirects the per-PR artifact base to a per-cluster subdir
  (`.tl/goal-runs/<run_id>/clusters/<cluster_id>/`) so each cluster keeps its own
  PR — it changes no git discipline. Two source rules still carry over as plain
  git discipline: stage only the files the current work item changed (never
  `git add -A` in a worktree that may hold someone else's uncommitted files), and
  never stage a path listed in a goal run's `preexisting_dirty_files` snapshot.

## Capabilities

### May Do

- Inspect git state and configured shipping strategy.
- Run local checks before shipping.
- Create commits, push branches, and open pull requests when confirmed.
- Compose commit summaries from task evidence.
- Update shipping metadata in TL state, graph, or tracker when confirmed.

### Must Not Do

- Commit to the configured base branch when feature-branch strategy forbids it.
- Switch branches or push to a different branch without user direction.
- Ship with missing required evidence unless the user explicitly overrides.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Git actions require repository access and confirmation.
- Build and test commands require configured scripts and dependencies.
- Pull request creation requires available Git hosting tooling.
- Graph and tracker updates require available tooling and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when git state, configured commands, permissions, tools, or
  confirmation are missing.
- Use `FAILED` when checks, commit, push, or PR creation fail.
- Use `PARTIALLY_VERIFIED` when local checks pass but remote state cannot be
  checked.
- Use `NOT_RUN` when a check or external update is intentionally skipped.
- Use `UNVERIFIED` when upstream verification evidence is unknown.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-ship/SKILL.md`

### Preserved Methodology

- Config-driven git strategy.
- Base-branch safety guard.
- Local checks before shipping.
- Commit, push, PR, and tracker update workflow.
- Next-step handoff names a concrete follow-on skill (verify, or release to merge
  the PR), never a prose description.

### Removed Claude Mechanics

- Runtime-specific commit footer assumptions.
- Source headline vocabulary outside the closed status set.
- Guaranteed tracker and hosting CLI availability.
- Model routing fields.

### Codex Replacement Behavior

- Gate all git and external mutations on confirmation.
- Use configured commands rather than hidden defaults when possible.
- Treat remote and tracker operations as conditional.
- Report evidence with the closed verification vocabulary.

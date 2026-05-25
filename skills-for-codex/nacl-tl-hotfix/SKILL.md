---
name: nacl-tl-hotfix
description: |
  Coordinate emergency NaCl TL fixes to the production branch with dirty-tree
  protection, spec-first repair, baseline verification, pull request gating,
  restoration of prior work, and honest reporting. Use when handling urgent
  production fixes or for compatibility with `/nacl-tl-hotfix`.
---

# NaCl TL Hotfix For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Coordinate emergency fixes conservatively. TL artifacts and reports remain
English.

Read `../references/migration-rules.md` and
`../references/verification-vocabulary.md` before executing the workflow.

## Goal Boundary

This skill is not safe to wrap in `/goal` because hotfix routing requires
human production-incident judgment and branch/action confirmation. Use this
skill interactively; production branch actions remain confirmation-gated even
when a later verification alias is goal-wrapped.

Reference `../nacl-goal/SKILL.md`,
`../references/goal-codex-contract.md`, and
`../../nacl-goal/refusal-catalog.md`. The refusal code is
`REFUSE_HOTFIX_JUDGMENT`. Do not provide bypass flags. If autonomous execution
is requested, report `Status: BLOCKED` or `Status: NOT_RUN`.

## Contract

Inputs consumed:

- urgent defect description or commit to adapt;
- current git state and configured production branch;
- configured test, build, or verification commands;
- fix report from spec-first repair workflow.

Outputs produced:

- hotfix branch changes when editing and git operations are available and
  confirmed;
- pull request description when requested and tools are available;
- restoration notes for pre-existing work;
- final report using the closed verification vocabulary.

Downstream consumers:

- pull request review;
- merge and deployment pipeline;
- incident or delivery reporting.

## Workflow

### Step 1: Triage

Confirm the issue is urgent enough for a hotfix. Identify production impact,
affected users, expected behavior, rollback needs, and required verification.

If the issue is not urgent, recommend the normal fix workflow and report
`NOT_RUN`.

### Step 2: Protect Existing Work

Inspect the worktree before changing branches or files. Do not overwrite
unrelated edits. Preserve the current branch, changed files, and any untracked
work in the report.

If worktree protection cannot be performed with available tools, report:

```text
Status: BLOCKED
Reason: current worktree state cannot be protected
```

### Step 3: Prepare Hotfix Scope

Resolve the production branch from project configuration or explicit user
instruction. Create or use a hotfix branch only after confirmation.

If adapting an existing commit, inspect the changed files and apply only the
minimal production-safe change. If conflicts occur, stop and report the files
and conflict details; do not auto-resolve ambiguous conflicts.

### Step 4: Apply Spec-First Fix

Use the `nacl-tl-fix` discipline:

- define current, expected, and unchanged behavior;
- add or update a failing regression test when the defect is testable;
- implement the minimal fix;
- refactor only after verification passes.

### Step 5: Validate Against Production Baseline

Capture baseline evidence from the production branch when available. Run the
same configured test, build, or verification commands after the hotfix and
compare results to the baseline.

The hotfix is shippable only when the required checks are `VERIFIED`. If some
required checks cannot run, report `PARTIALLY_VERIFIED`, `BLOCKED`, or
`UNVERIFIED` with the exact missing evidence.

When the hotfix is `VERIFIED` and a regression test path is recorded, write
`Task.verification_evidence = 'test-GREEN:<repo-relative path>'` to every
affected Task node before proceeding to Step 6 (taxonomy:
`../references/verification-evidence.md`). If graph tooling is unavailable,
log the gap in the report; do not block the hotfix on a graph-write failure,
but do not declare evidence "written" either.

### Step 6: Pull Request And Merge Gate

Prepare a pull request summary only when requested and tooling is available.
Ask for explicit confirmation before creating, labeling, merging, or enabling
automatic merge behavior.

For any status other than `VERIFIED`, ask for a fresh explicit user decision
before proceeding to merge-related actions.

### Step 7: Restore Prior Work

Return to the previous branch and restore protected work only when safe and
confirmed. If restoration conflicts, stop and report the conflict details.

### Step 8: Advisory And Report

Return:

- defect and impact;
- hotfix branch and files changed;
- regression test evidence;
- baseline versus post-change comparison;
- pull request or merge action taken, or `NOT_RUN`;
- restoration outcome;
- follow-up items;
- final `Status: <VALUE>` using only the closed vocabulary.

## Capabilities

### May Do

- Read git state, configuration, task context, code, tests, and docs.
- Edit hotfix code and tests when workspace permissions allow.
- Run configured tests, build, and verification commands when available.
- Prepare pull request text or perform git operations when explicitly
  confirmed and tools allow it.

### Must Not Do

- Overwrite unrelated work.
- Auto-resolve merge conflicts without clear evidence.
- Merge, deploy, label, or enable merge automation without explicit user
  confirmation.
- Treat partial or missing verification as fully shippable.

### Conditional Tools And Actions

- Branch, stash, commit, push, pull request, and merge actions require explicit
  confirmation and available git or hosting tools.
- File edits require writable workspace access.
- Test, build, and deployment verification require configured commands and
  dependencies.
- Deployment monitoring requires available project tooling.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when worktree protection, branch setup, permissions,
  confirmation, or required tooling is unavailable.
- Use `NOT_RUN` for declined or intentionally skipped pull request, merge, or
  deployment actions.
- Use `PARTIALLY_VERIFIED` when only some required hotfix checks ran.
- Use `UNVERIFIED` when production safety cannot be established.
- Use `FAILED` when executed checks violate the hotfix contract.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-hotfix/SKILL.md`

### Preserved Methodology

- Emergency branch flow with dirty-tree protection.
- Spec-first repair before shipping.
- Production-baseline comparison.
- Pull request and merge gates.
- Restoration and advisory reporting.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Legacy hotfix headlines and status vocabulary.
- Automatic merge and label behavior as active instruction.
- Active command sequences that assume specific local tools.

### Codex Replacement Behavior

- Treat git, hosting, and deployment actions as confirmed conditional actions.
- Use closed statuses for verification and safety outcomes.
- Stop on conflicts and ambiguous production risk.
- Preserve unrelated work and report restoration evidence.

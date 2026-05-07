---
name: nacl-tl-ship
description: |
  Commit, push, create pull requests, and update delivery metadata for NaCl TL
  work after required checks pass. Use when shipping code, creating a PR,
  pushing a feature branch, finishing development, or when the user says
  `/nacl-tl-ship`.
---

# NaCl TL Ship For Codex

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

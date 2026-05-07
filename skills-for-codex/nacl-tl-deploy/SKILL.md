---
name: nacl-tl-deploy
description: |
  Monitor CI/CD deployment results, run health checks, and report deployment
  evidence for NaCl TL tasks. Use when checking deploy status, verifying a
  staging or production deployment, or when the user says `/nacl-tl-deploy`.
---

# NaCl TL Deploy For Codex

Deployment monitoring observes pipeline and health evidence. It does not assume
that a push has happened unless evidence identifies the deployed commit.

## Workflow

1. Resolve environment, commit or branch, deployment platform, health endpoint,
   and task scope.
2. Confirm that source tasks have acceptable upstream verification evidence.
3. Observe CI/CD status through available tooling.
4. Run health checks and optional diagnostics when configured.
5. Update graph or local tracking only when confirmed.
6. Return a deployment evidence table.

## Capabilities

### May Do

- Detect deployment platform from config or repository files.
- Monitor available CI/CD runs and read logs.
- Run configured health checks.
- Read task verification state from graph or `.tl/` files.
- Update task deployment metadata when confirmed.

### Must Not Do

- Trigger deploys directly unless the user explicitly asks and the repository
  contract supports it.
- Proceed when upstream verification is unknown without user direction.
- Mark a task deployed when CI or health evidence is missing.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- CI observation requires available CI tooling.
- Health checks require network access to the configured target.
- Graph reads and writes require available graph tooling.
- Task tracker updates require available tracker tooling and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when environment config, CI tooling, health target, or
  confirmation is missing.
- Use `FAILED` when CI or health evidence fails.
- Use `PARTIALLY_VERIFIED` when CI is checked but health or task mapping is not.
- Use `NOT_RUN` when a diagnostic path is skipped by request.
- Use `UNVERIFIED` when deployed commit or upstream task evidence is unknown.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-deploy/SKILL.md`

### Preserved Methodology

- Deployment monitoring after push.
- CI and health-check evidence.
- Upstream verification gate.
- Per-commit or per-task deployment table.

### Removed Claude Mechanics

- Source headline vocabulary outside the closed status set.
- Guaranteed CI and task-tracker CLIs.
- Runtime-specific tool names as universal requirements.
- Model routing fields.

### Codex Replacement Behavior

- Treat CI, network, graph, and tracker access as conditional.
- Require explicit confirmation for state mutations.
- Preserve health failure as a blocking deployment finding.
- Report evidence using the closed verification vocabulary.

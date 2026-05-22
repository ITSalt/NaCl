---
name: nacl-tl-deploy
description: |
  Monitor CI/CD deployment results, run health checks, and report deployment
  evidence for NaCl TL tasks. Use when checking deploy status, verifying a
  staging or production deployment, or when the user says `/nacl-tl-deploy`.
---

# NaCl TL Deploy For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

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

## Clean-Checkout Artifact Gate (W9-ci-clean-checkout)

Before evaluating upstream task verification, this skill MUST locate
the clean-checkout evidence artifact for the commit being deployed:

```
.tl/clean-checkout/<commit>.json
```

The artifact is produced by `nacl-tl-deliver` Step 4b (clean-checkout
gate) on a shallow clone of the wave-tip commit. It records build /
migrate / smoke / runtime-asset evidence with a `commit` field and a
`terminal_status` of `PASS` or `BLOCKED`. Artifact schema reference:
`.tl/clean-checkout/_template.json`.

Behavior:

- Artifact present, `terminal_status: PASS`, `commit` matches the
  deployed SHA → proceed to upstream verification gate.
- Artifact present, `commit` does NOT match → report
  `DEPLOY HALTED — BLOCKED (clean-checkout-commit-mismatch)`. The
  wave-tip evidence is for a different commit; deploy refuses to
  ship a commit that was never clean-checkout-verified.
- Artifact present, `terminal_status: BLOCKED`, no signed exception
  covers `blocker_detail` → report
  `DEPLOY HALTED — BLOCKED (clean-checkout-<blocker_detail>)`.
- Artifact present, `terminal_status: BLOCKED`, signed exception
  covers `blocker_detail` → proceed with `(clean-checkout-bypass)`
  banner on the final report.
- Artifact absent → report
  `DEPLOY HALTED — BLOCKED (clean-checkout-artifact-missing)`. There
  is NO inline override flag. The operator must either re-run
  `/nacl-tl-deliver` (which produces the artifact) or file a signed
  exception with `affected_gates: [clean-checkout-artifact-missing]`.

The clean-checkout artifact is the evidence that the deployed commit
was built and smoked from a fresh tree, not a warm local cache.
Without it, deploy emits `BLOCKED`.

## Source-Parity Requirements

- Preserve source platform detection and deployment identification before
  monitoring any pipeline.
- Tie deployment evidence to the expected commit, PR, task, or release tag. If
  the deployed commit cannot be established, report `Status: UNVERIFIED`.
- CI success is not deploy success. Health checks must be inspected separately
  when the target has a health endpoint.
- Production-impacting actions and tracker/graph updates require explicit
  confirmation and read-back.
- Missing CI tooling, deployment config, environment URL, credentials, or health
  target is `BLOCKED`, `PARTIALLY_VERIFIED`, or `UNVERIFIED`.

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
  confirmation is missing, OR when the W9 clean-checkout artifact is
  absent / mismatched / BLOCKED-without-exception for the deployed
  commit.
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

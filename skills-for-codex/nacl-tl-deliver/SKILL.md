---
name: nacl-tl-deliver
description: |
  Coordinate feature-branch delivery through ship, CI observation, verification,
  deployment checks, and delivery reporting. Use when delivering to staging or
  production, pushing and verifying a branch, or when the user says
  `/nacl-tl-deliver`.
---

# NaCl TL Deliver For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Deliver coordinates existing TL phases. Read `../nacl-tl-core/SKILL.md`,
`../nacl-tl-ship/SKILL.md`, `../nacl-tl-verify/SKILL.md`, and
`../nacl-tl-deploy/SKILL.md` when those files are available.

## Workflow

1. Resolve branch, environment, config, task scope, and delivery state.
2. Verify local state and planned commands before mutating git or deployment
   state.
3. Stop for confirmation before ship, CI watch, verification, deploy, or graph
   delivery updates.
4. Coordinate ship, CI observation, verification, and deploy as separate
   contracts.
5. Record delivery state in `.tl/delivery-status.json` when file editing is
   available and confirmed.
6. Return a per-task delivery table with evidence.

## Source-Parity Requirements

- Preserve the six source delivery steps: pre-check, ship, wait for CI, verify,
  deploy health check, and graph/tracker state update.
- Maintain `.tl/delivery-status.json` semantics only after confirmed file
  writes and read-back.
- `--skip-verify` and `--skip-deploy` are allowed only as explicit user scope
  choices and must appear as skipped evidence in the final report.
- Production delivery requires stronger confirmation and must tie the deployed
  state back to verified task evidence.
- CI, verify, deploy, graph, and tracker failures block or downgrade delivery;
  they cannot be hidden under a successful ship step.

## Capabilities

### May Do

- Coordinate shipping, CI checks, verification, deploy checks, and reporting.
- Read task status from graph first and `.tl/` files as fallback.
- Update delivery status files when confirmed.
- Write graph delivery metadata when graph tooling is available and confirmed.

### Must Not Do

- Push, deploy, or mutate graph state without confirmation.
- Mark delivery verified without evidence from verification and deploy phases.
- Treat skipped verification as verified delivery.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Git, CI, test, and deploy commands require available CLIs and confirmation.
- Graph reads and writes require available graph tooling.
- File writes require workspace permissions.
- Downstream phase execution requires the corresponding skill behavior or tools
  to be available.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when tools, inputs, environment config, or confirmation are
  missing.
- Use `FAILED` when CI, verification, deploy, or health evidence fails.
- Use `PARTIALLY_VERIFIED` when some tasks or phases have evidence but others do
  not.
- Use `NOT_RUN` for intentionally skipped phases.
- Use `UNVERIFIED` when upstream status or deployed state cannot be established.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-deliver/SKILL.md`

### Preserved Methodology

- Push, CI, verify, and health-check sequencing.
- Delivery status persistence.
- Graph-first task status with file fallback.
- Per-task delivery evidence.

### Removed Claude Mechanics

- Source headline vocabulary outside the closed status set.
- Runtime-specific generated commit footer assumptions.
- Guaranteed external CLI availability.
- Model routing fields.

### Codex Replacement Behavior

- Coordinate phases through explicit contracts.
- Gate git, deploy, file, and graph mutations on confirmation.
- Treat skipped or unknown evidence as non-verified.
- Report with the closed verification vocabulary.

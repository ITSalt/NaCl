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

## Clean-Checkout Gate (Strict-Only; W9-ci-clean-checkout)

Before VERIFIED is granted (and before Step 5 deploy health check), the
clean-checkout gate runs against the wave-tip commit. It exists because
17 of the ~60 baseline signals are config / infra / CI drift that only
surface on a clean runner (pnpm version mismatch, Prisma generate
missing, TEST_DATABASE_URL unset, non-TS runtime assets absent from
build output, pm2 entry-point confusion).

Procedure (when tools and confirmation permit; otherwise BLOCKED):

1. Identify wave-tip commit and project package manager (from
   `config.yaml → build.package_manager`, `package.json`
   `packageManager` field, or lockfile detection). Mixed managers in a
   single workspace are reported `BLOCKED — clean-checkout-pm-ambiguous`.
2. Shallow clone the wave-tip commit into a fresh directory. The
   directory MUST NOT inherit `node_modules/`, `dist/`, `.next/`, or
   `prisma/generated/`.
3. Install with `--frozen-lockfile` (or equivalent). Install failure →
   `BLOCKED — clean-checkout-install-failed`.
4. Build all workspaces (`pnpm -r build` or equivalent). Build failure
   → `BLOCKED — clean-checkout-build-failed`. If
   `build.requires_prisma_generate: true`, missing prisma generate at
   build time → `BLOCKED — clean-checkout-prisma-generate-missing`.
5. Verify every entry in `config.yaml → runtime_assets` exists under
   the built artifact tree. Missing any required runtime asset is a
   `BLOCKED — clean-checkout-runtime-assets-missing`, NOT a WARNING.
6. Migrate (only if `build.migrate_cmd` is configured) against the
   scratch database identified by `build.test_database_url`. Missing
   URL when migrate would run → `BLOCKED — clean-checkout-test-database-url-undefined`.
7. Run-smoke: boot the entrypoint (`build.entrypoint` or
   `package.json` `main` or `dist/index.js`), wait for a port bind
   (60s timeout — exceeding it produces
   `BLOCKED — clean-checkout-entrypoint-no-port`, the transcriber
   pm2 pattern), call `/api/health`, then call each path in
   `deploy.smoke.endpoints`. Default endpoint list is `["/api/health"]`
   which records `PASS_HEALTH_ONLY` (not full smoke). Non-2xx →
   `BLOCKED — clean-checkout-smoke-failed`.
8. Capture evidence to `.tl/clean-checkout/<commit>.json` with fields
   commit, started_at, completed_at, build_status, migrate_status,
   smoke_status, runtime_assets_verified, terminal_status, and
   blocker_detail (only on BLOCKED). Schema reference:
   `.tl/clean-checkout/_template.json`.

Override paths (no inline flag exists):

- Signed exception under `.tl/exceptions/<exception_id>.yaml` with
  `affected_gates` enumerating the specific clean-checkout detail.
- Emergency mode (`NACL_EMERGENCY=1` plus reason and owner env
  vars). Advances under recorded bypass; closed Status: is
  `PARTIALLY_VERIFIED` with `(emergency-bypass)` suffix.

Worked examples: the Karatov pnpm/Prisma/TEST_DATABASE_URL cluster (the
first clean CI runner surfaced drift after green local + green review)
and the transcriber ffmpeg / pm2 entry / prompt-markdown cluster
(non-TS runtime assets disappeared from `dist/` and the wrong file was
treated as the pm2 entrypoint). Both clusters now produce a
`BLOCKED — clean-checkout-<detail>` headline at delivery rather than a
production incident.

## Source-Parity Requirements

- Preserve the six source delivery steps plus the W9 clean-checkout
  gate between verify and deploy health check: pre-check, ship, wait
  for CI, verify, clean-checkout, deploy health check, and graph /
  tracker state update.
- Maintain `.tl/delivery-status.json` semantics only after confirmed file
  writes and read-back. The state file gains a `clean_checkout` block
  (status, commit, artifact_path) alongside the existing ship/ci/verify/
  deploy/graph blocks; resumption inspects it in order before Step 5.
- The SKIP-VERIFY and SKIP-DEPLOY flags were REMOVED in
  W4-blocking-release. Their literal tokens are scrubbed from this
  skill's prose. Verify and deploy-health are mandatory steps.
  Override paths: (a) signed exception under
  `.tl/exceptions/<exception_id>.yaml` enumerating specific
  `affected_gates`, OR (b) emergency mode (three env vars —
  `NACL_EMERGENCY=1`, `NACL_EMERGENCY_REASON`,
  `NACL_EMERGENCY_OWNER`). Neither path re-enables the removed
  flags. See `nacl-tl-core/references/emergency-mode.md` and
  `nacl-tl-release/SKILL.md` § "Release Blocking Gates
  (Strict-Only)".
- The `no-test` evidence string is no longer producible by this
  skill — the removed flag was its only producer.
- Production delivery requires stronger confirmation and must tie the deployed
  state back to verified task evidence.
- CI, verify, deploy, graph, and tracker failures block or downgrade delivery;
  they cannot be hidden under a successful ship step.
- HEALTH_ONLY evidence (a green `/health` probe) is NOT
  product-readiness evidence on its own. The W3 `PROD_GOLDEN_PATH`
  stage is the product-readiness signal at the release-time gate.

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

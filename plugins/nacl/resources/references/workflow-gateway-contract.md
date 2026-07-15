# Packaged Workflow To Gateway Contract

This is the executable routing boundary for the ten public NaCl entries and the
60 internal workflows. The deterministic map is
[`workflow-gateway-map.json`](workflow-gateway-map.json). A workflow may use
only a tool named by its mapped sequence. It may not submit an endpoint,
credential, filesystem state root, or arbitrary graph statement.

## Common Invocation Envelope

1. Call `nacl_installation_doctor` once. Stop unless `status=VERIFIED`.
2. Call `nacl_project_resolve` with the explicit absolute project root. A
   missing root with several candidates, a stale alias, an unregistered root,
   or plugin-plus-symlink conflict is `BLOCKED` or `FAILED`; never select the
   last-used project.
3. Call `nacl_graph_derive_worker_identity` with the resolved `project_id`,
   canonical `project_root`, and trusted `principal_id`, `client_id`, and
   `session_id`. Carry the returned `worker_id` plus the same `worktree_id`,
   `branch`, and `base_sha` into every later graph call.
4. Call `nacl_graph_health` before normal reads or writes. Preserve its exact
   closed status and structured `code`. `SCHEMA_MISSING` permits only the
   initial administrator bootstrap. `SCHEMA_STALE` permits only the exact
   `SchemaMigration/MIG-GATEWAY` recovery sequence.
5. A write uses a stable idempotency key, the server-required exact approval,
   the current lease owner and fencing token, and the current resource
   revision. `CONFLICT`, `LEASE_HELD`, authorization denial, stale fence,
   incomplete idempotency, or graph backpressure is not success.
6. Read back the resource after mutation. Release or hand off its lease using
   the same identity and current fence. Never use a local status file as a
   substitute for a failed authoritative read.

Every result uses exactly `VERIFIED`, `FAILED`, `PARTIALLY_VERIFIED`,
`BLOCKED`, `NOT_RUN`, or `UNVERIFIED`. Preserve a gateway's status and `code`
instead of replacing them with a local success label. A missing mapped named
query or resource returns the `gapCode` recorded in the map with
`Status: BLOCKED`.

## Initialization Evidence Chain

`nacl-init` may report `VERIFIED` only after all applicable steps below return
`VERIFIED` and their read-back fields are inspected:

1. `nacl_project_resolve`; for a legacy config, present the generated UUID and
   stop for `MIGRATE_PROJECT_ID:<uuid>` before
   `nacl_project_migrate_identity`. Use `nacl_project_register_root` only with
   exact `REGISTER_PROJECT_ROOT` recovery confirmation.
2. Present the graph plan and stop for `INIT_LOCAL_GRAPH:<project_id>`, then
   call `nacl_graph_local_init`. Stop again for
   `START_LOCAL_GRAPH:<project_id>` before `nacl_graph_local_start`. Confirm
   lifecycle state with `nacl_graph_local_doctor`.
3. Derive the trusted worker identity. On genuine `SCHEMA_MISSING` with zero
   memberships, present and stop for `CONFIRM_INITIAL_PROJECT_ADMIN`, then call
   `nacl_graph_bootstrap_admin` once. Existing projects require an active
   membership; bootstrap is never a repair shortcut.
4. On `SCHEMA_STALE`, acquire only `SchemaMigration/MIG-GATEWAY` with
   `CONFIRM_SCHEMA_ADMIN`, retain its fence, call
   `nacl_graph_apply_migrations` with the same fence plus
   `CONFIRM_SCHEMA_ADMIN` and `APPLY_MIGRATIONS`, then release that exact
   resource. No other workflow crosses the stale-schema state.
5. Call health, schema status, and the packaged `summary` read. Present and
   stop for `APPROVE_PROJECT_WRITE` plus `WRITE_CANARY`, call
   `nacl_graph_write_canary` with one stable idempotency key, and perform a
   separate summary read-back.

If a mutation may have occurred but audit, metadata recording, transport, or
read-back is incomplete, report `PARTIALLY_VERIFIED` and the gateway recovery
guidance. Do not invite an unqualified retry.

## Protected Resource Sequences

- BA: only `Board` metadata is currently mapped to `APPROVE_BA_WRITE`.
  Required BA labels, relations, and domain reads are absent, so a full BA graph
  workflow closes with the mapped gap code after any useful file-only work.
- SA: `Module`, `FeatureRequest`, and `UseCase` use
  `APPROVE_SA_WRITE`. Allocate or claim, mutate with revision CAS, read back,
  then release. Missing relations and extra labels remain blocking gaps.
- TL and fix: `Task` uses `APPROVE_TL_WRITE`. Claim, heartbeat when long-running,
  mutate with fence and expected revision, then release or explicitly hand off.
- Migration: use only `SchemaMigration/MIG-GATEWAY` and the exact recovery
  sequence above.
- Publish/release: `ReleaseEnvironment` uses
  `CONFIRM_RELEASE_OPERATION`. Git, deployment, documentation, or messaging
  writes require separate user authority outside the graph lease.

Successful terminal `Task.status` values `done` and `verified-pending` require
non-empty, parseable `verification_evidence` in the same
`nacl_graph_mutate_resource` call. `done` requires `test-GREEN:<path>` or
`no-test`; a `no-test` write additionally requires the separate exact input
`evidence_confirmation: CONFIRM_NO_TEST_EVIDENCE`, which is bound into the
idempotency payload and rejected before graph access when absent or wrong.
`verified-pending` requires `test-UNVERIFIED`. Paths, ISO instants, QA stages,
statuses, and stub references must match the strict packaged taxonomy;
unknown, duplicate, unsafe, or contradictory tokens are rejected. Additional
`repo-checks-GREEN`, wire, QA-stage, and stub-shape tokens retain the packaged
release-reader taxonomy. `failed` and `blocked` remain outside release scope
and do not fabricate positive evidence.

## Agent Profiles

Profiles are optional companion files, not plugin-discovered components.
Call `nacl_agent_profiles_plan` first. It is read-only and returns the exact
destination, per-file packaged/current hashes, actions, and deterministic plan
token. Fresh apply requires `nacl_agent_profiles_apply` with
`INSTALL_AGENT_PROFILES:<token>`. A differing file is `BLOCKED` and is never
overwritten by any plugin action. The user may move or back up the conflicting
file outside the plugin, then run a fresh plan; automatic replacement is
unsupported.

The installer rejects non-absolute or symlinked roots and destinations,
rechecks the plan while holding its cooperative lock, creates atomically,
verifies read-back hashes, and preserves unrelated files. Repeating an exact
install returns `AGENT_PROFILES_ALREADY_CURRENT`. CLI and Desktop workflows
remain usable without these profiles. Safe manual removal is limited to the
five `nacl-*.toml` filenames listed by the plan; never remove the entire
`.codex/agents` directory because it may contain unrelated user profiles.

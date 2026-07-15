---
name: nacl-init
description: Inspect or initialize a NaCl project with verified identity, local graph, schema, canary evidence, and optional agent profiles. Use for setup and bootstrap requests.
---

# NaCl Init

Call `nacl_installation_doctor` once. Continue normally only when it returns
`status=VERIFIED` and `mode=plugin-only`.

If it returns `status=FAILED` and `mode=both`, the only allowed recovery is the
bounded user-skill migration corridor. Call `nacl_legacy_symlinks_plan`, show
every exact symlink path, target, parity class, blocker, and the total against
the fixed 60-name catalog, then stop. Never call apply when the plan has a
blocker: unknown `nacl-*` artifacts, broken links, real files/directories,
unsafe skill roots, or target/hash drift require manual inspection and remain
`BLOCKED`. For a ready plan, call `nacl_legacy_symlinks_apply` only after the
user supplies its exact
`REMOVE_LEGACY_NACL_SYMLINKS:<plan-token>` confirmation. Preserve any
`PARTIALLY_VERIFIED` quarantine path for manual recovery; never delete or move
it. After a verified apply, call `nacl_installation_doctor` again and continue
only after a separate `status=VERIFIED`, `mode=plugin-only` read-back.

No other project, graph, profile, or workflow tool is allowed while the doctor
reports `mode=both`. The migration removes only validated user-level symlink
entries; it never modifies their source targets, real files/directories,
project graph data, or project agent profiles.

Read [the packaged init workflow](../../resources/workflows/nacl-init/SKILL.md)
and [the gateway binding](../../resources/references/workflow-gateway-contract.md).
Use its `initialize` sequence exactly: installation doctor, explicit project
resolution or confirmed identity migration/registration, confirmed local init
and start, lifecycle doctor, trusted worker derivation, initial administrator
bootstrap or existing membership, current schema, named read, confirmed write
canary, and separate read-back.

Never infer a root or identity. Stop at every confirmation named by the
contract. An existing stale schema uses only the fenced
`SchemaMigration/MIG-GATEWAY` recovery sequence. Report `VERIFIED` only when
the entire evidence chain is verified; preserve any exact gateway status/code.

For `nacl init --install-agent-profiles`, call
`nacl_agent_profiles_plan`, show its destinations, actions, and required
confirmation, then stop. Call `nacl_agent_profiles_apply` only with the fresh
plan token and exact confirmation. This contract is create-only: if plan or
apply returns `BLOCKED` / `AGENT_PROFILE_CONFLICT`, do not retry or overwrite.
Ask the user to move or back up every conflicting file outside the plugin,
then obtain a fresh plan and apply that new plan only after confirmation.
Profiles are optional; their absence never blocks normal NaCl.

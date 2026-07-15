---
name: nacl-sa
description: Route NaCl system analysis across architecture, domains, roles, use cases, UI, features, validation, and finalization. Use for graph-first SA work.
---

# NaCl System Analysis

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read
[the core contract](../../resources/workflows/nacl-core/SKILL.md),
[the migration rules](../../resources/workflows/references/migration-rules.md),
and [the gateway binding](../../resources/references/workflow-gateway-contract.md).

Choose exactly the relevant packaged leaf under `../../resources/workflows/`:
`nacl-sa-full`, `nacl-sa-architect`, `nacl-sa-domain`, `nacl-sa-roles`,
`nacl-sa-uc`, `nacl-sa-ui`, `nacl-sa-feature`, `nacl-sa-flags`,
`nacl-sa-validate`, or `nacl-sa-finalize`.

State the selected leaf and intended mutations. Run the mapped SA preflight.
`Module`, `FeatureRequest`, and `UseCase` use allocate-or-claim, live
lease/fence, revision-CAS mutation with `APPROVE_SA_WRITE`, read-back, and
release. Required relations, roles, UI records, or validation queries not in
the map return the exact SA gap code with `BLOCKED`; never substitute another
tool or a stale file snapshot for graph evidence.

---
name: nacl-sa
description: Route NaCl system analysis across architecture, domains, roles, use cases, UI, features, validation, and finalization. Use for graph-first SA work.
---

# NaCl System Analysis

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the core methodology](../../resources/workflows/nacl-core/SKILL.md), and
[the migration rules](../../resources/workflows/references/migration-rules.md).
Require a loaded project `nacl_neo4j` MCP and verified read canary; otherwise return
`BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route to `nacl-init`.

Choose exactly one relevant packaged leaf under `../../resources/workflows/`:
`nacl-sa-full`, `nacl-sa-architect`, `nacl-sa-domain`, `nacl-sa-roles`,
`nacl-sa-uc`, `nacl-sa-ui`, `nacl-sa-feature`, `nacl-sa-flags`,
`nacl-sa-validate`, or `nacl-sa-finalize`. State the leaf and intended writes.

Use only project-local Neo4j MCP Cypher tools. Preserve SA approval,
parameterization, identity, allocate-or-claim, lease/fence, revision CAS,
idempotency and read-back. Required relations or validation evidence that
cannot be produced safely stay `BLOCKED`; never substitute a stale file.

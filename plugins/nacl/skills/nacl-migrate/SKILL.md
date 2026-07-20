---
name: nacl-migrate
description: Plan or execute confirmed NaCl methodology migrations for legacy, BA, or SA artifacts with backups, validation, and read-back.
---

# NaCl Migrate

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the migration workflow](../../resources/workflows/nacl-migrate/SKILL.md), and
[the migration rules](../../resources/workflows/references/migration-rules.md).
Require a loaded project `nacl_neo4j` MCP and verified read canary for graph
migration; otherwise return `BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route to
`nacl-init`.

Choose the exact migration leaf. Present before-state, backup, write plan,
confirmation and validation before mutation. Use only project-local Neo4j MCP
tools and packaged scripts. Preserve schema lease/fence, additive ordered
migrations, checksum ledger and read-back. File-only conversion retains its
own backup and confirmation. An unrepresented domain migration stays
`BLOCKED`.

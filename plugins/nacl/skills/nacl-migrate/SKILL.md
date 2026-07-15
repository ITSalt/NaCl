---
name: nacl-migrate
description: Plan or execute confirmed NaCl methodology migrations for legacy, BA, or SA artifacts with backups, validation, and read-back.
---

# NaCl Migrate

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read
[the migration workflow](../../resources/workflows/nacl-migrate/SKILL.md),
[the migration rules](../../resources/workflows/references/migration-rules.md),
and [the gateway binding](../../resources/references/workflow-gateway-contract.md).

Choose `nacl-migrate`, `nacl-migrate-ba`, or `nacl-migrate-sa` under
`../../resources/workflows/`. Present the before-state, write plan, backup,
confirmation, and validation plan before mutation.

Gateway schema recovery uses only the exact `SchemaMigration/MIG-GATEWAY`
sequence: claim with `CONFIRM_SCHEMA_ADMIN`, retain/heartbeat its fence, call
`nacl_graph_apply_migrations` with that fence plus `CONFIRM_SCHEMA_ADMIN` and
`APPLY_MIGRATIONS`, release, then health/schema/read-back. File-only BA/SA
conversion retains its own backup and confirmation. Domain graph migration not
represented by the fixed catalog is `BLOCKED/DOMAIN_MIGRATION_RESOURCE_UNAVAILABLE`.

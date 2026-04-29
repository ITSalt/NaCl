**NaCl 0.9.0: Validation Exemption Flags Backfill**

A new orchestrator-tier skill — `nacl-sa-flags` — provides a single, focused entry point for setting validator-only metadata: `has_ui` on `:UseCase`, `system_only` on `:SystemRole`, `shared` on `:DomainEntity`, `internal` on `:DomainAttribute`, `field_category` on `:FormField`. These are the properties L4–L7 / XL8 already expected, but until 0.9.0 there was no sanctioned skill path to populate them on existing graphs.

Commands: `audit` (read-only NULL-property report), `backfill-all` (idempotent, conservative defaults), `backfill-all --detect-internal` (regex auto-flagging for surrogate keys / timestamps / secrets), per-node setters, and `set-batch <yaml>` for hand-curated overrides.

Migrated projects no longer face a "messy first validate." `nacl-migrate-sa` Phase 7b now invokes `nacl-sa-flags backfill-all --detect-internal` automatically (with confirmation), so projects pass `nacl-sa-validate` cleanly on first run instead of producing 50–150 NULL-property findings.

Companion change: `nacl-sa-uc`, `nacl-sa-roles`, and `nacl-sa-domain` accept the exemption flags as optional MERGE parameters at node creation. Setting them up-front carries design intent; forgotten flags get backfilled later by `nacl-sa-flags`.

Full upgrade walkthrough and skill reference: `docs/releases/0.9.0-exemption-flags-backfill/release-notes.md`

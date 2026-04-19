**NaCl 0.6.0: graph handover + compose isolation fix**

Graph handover tooling ships in this release. `handover-export.sh` snapshots a project's Neo4j database via APOC, gzip-compresses and age-encrypts the result, and writes a manifest of node and relationship counts. `handover-import.sh` decrypts, verifies the manifest, and replays the graph on the receiving machine. The passphrase travels out-of-band; the encrypted archive commits to git.

Alongside: a cross-project container isolation bug is closed. Every `graph-infra/` folder previously resolved to the same Compose project name, which let `docker compose up -d --remove-orphans` in one project silently cull containers and data volumes of other projects. The canonical template now carries a unique `name:` field; `nacl-init` emits `COMPOSE_PROJECT_NAME` in every new project's `.env`; all eight existing projects were migrated in-place and regression-tested.

Release notes: `docs/releases/0.6.0-handover/release-notes.md`
Handover runbook: `docs/HANDOVER.md`

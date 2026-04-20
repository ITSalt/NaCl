# NaCl 0.6.0 — Graph Handover + Docker-Compose Hygiene

This release ships one-shot graph handover tooling so a project's Neo4j database can be exported, encrypted, committed to git, and replayed on another machine. It also closes a cross-project container isolation bug where all `graph-infra/` folders shared the same Compose project name, leaving every running graph one `--remove-orphans` away from silent deletion.

## Highlights

- **Graph handover:** `handover-export.sh` and `handover-import.sh` let Dev 1 snapshot their Neo4j graph (APOC export → gzip → age encryption) and Dev 2 restore it end-to-end, with manifest verification of node and relationship counts before and after.
- **Encrypted at rest:** every handover artifact is `age`-encrypted with a symmetric passphrase shared out-of-band; plaintext graph data never touches git history.
- **Docker-Compose isolation fix:** the canonical `graph-docker-compose.yml` template now carries a top-level `name:` field, and `nacl-init` emits `COMPOSE_PROJECT_NAME` in every new project's `.env`. Projects can no longer silently cull each other's containers.
- **Migration path:** existing NaCl-compatible projects can be migrated in-place to the templated form; anonymous SHA-hashed volumes are cleaned up and replaced with named, per-project volumes.
- **Regression-tested:** `docker compose up -d --remove-orphans` in one project's `graph-infra/` leaves unrelated projects' containers and volumes untouched.

---

## Added

- `graph-infra/scripts/handover-export.sh` — detects the running Neo4j container via `CONTAINER_PREFIX`, runs `apoc.export.cypher.all`, gzips and age-encrypts the result, writes `manifest.json` with node count, relationship count, label histogram, Neo4j version, APOC version, git SHA, and timestamp. Flags: `--to=git` (default), `--to=s3://bucket/key` (interface stub; no-op in this release).
- `graph-infra/scripts/handover-import.sh` — decrypts the archive (rejects bad passphrase before any destructive step), verifies the manifest, prompts for confirmation before `MATCH (n) DETACH DELETE n`, replays the `.cypher` file, and re-verifies node/relationship counts against the manifest.
- `graph-infra/scripts/_lib.sh` — shared helpers: container detection from `.env`/`.env.example`, port reading, `age` passphrase wrapper.
- `graph-infra/handover/.gitkeep` — tracks the handover directory in git.
- `graph-infra/handover/README.md` — filename convention (`YYYY-MM-DDTHH-MM_<git-sha>.cypher.gz.age`), expected sizes, cleanup policy (how to drop the committed archive from git history when the default storage path changes in a future release).
- `graph-infra/handover/.gitattributes` — marks `*.cypher.gz.age` as binary so diffs are quiet on PRs.

---

## Fixed

- **Cross-project container isolation:** `nacl-tl-core/templates/graph-docker-compose.yml` now has a top-level `name: ${COMPOSE_PROJECT_NAME:-${CONTAINER_PREFIX:-graph}-graph}` field. Previously every `graph-infra/` folder derived the same Compose project name from the folder name (`graph-infra`), so `docker compose up -d --remove-orphans` in any project could silently cull containers and data volumes belonging to other projects.
- **`nacl-init` updated (step 2c.4):** the skill now emits `COMPOSE_PROJECT_NAME=<slug>-graph` as the first line of every new project's `.env` and `.env.example`, so all future projects start with unique project names by construction.
- **Template propagated:** existing projects using the previous template can replace their `graph-infra/docker-compose.yml` with the canonical form — fully parameterised `container_name`, `volumes`, and `networks` via `CONTAINER_PREFIX`.

---

## Infrastructure

- **Pre-rollout safety dumps:** projects whose containers are on anonymous volumes should be dumped before any structural change (see `docs/HANDOVER.md`). Exported Cypher node and relationship counts match the post-rollout state one-to-one.
- **Orphan volume handling:** any pre-existing orphan volume from the old shared-name layout is identifiable via `docker volume inspect`; empty volumes are safe to delete.
- **Anonymous volume cleanup:** SHA-hashed anonymous volumes left by the previous layout can be removed once data is verified on the new named volumes.
- **Named volumes confirmed unique:** every project's Neo4j data lives on a named volume (`<prefix>-neo4j-data`, `<prefix>-neo4j-logs`). SHA-hash mounts no longer appear in `docker inspect` output for any graph-related container.
- **Regression test:** running `docker compose up -d --remove-orphans` in one project's `graph-infra/` leaves unrelated projects' containers and volumes untouched.
- **Handover round-trip:** `handover-export.sh` + `handover-import.sh` verified end-to-end — node counts, relationship counts, and constraint counts match pre-export state via the manifest.
- **Verifier sweep:** the failure modes exercised during development all pass, with one accepted limitation — empty-graph export is rejected by design (documented in `docs/HANDOVER.md`).

---

## Documentation

- `docs/HANDOVER.md` — full runbook: prerequisites (`age`, APOC), export procedure on Dev 1, commit and passphrase sharing, import procedure on Dev 2, verification steps, limitations, and cleanup policy. Covers both current path (git-committed archive) and the `--to=s3://` interface so the document does not need rewriting when object storage is added in a future release.
- `docs/HANDOVER.ru.md` — Russian translation, matching the bilingual convention in `docs/`.
- `README.md` / `README.ru.md` — new "Handover" subsection linking to `docs/HANDOVER.md` / `docs/HANDOVER.ru.md`.
- `docs/releases/0.6.0-handover/` — introduces the release-folder convention (`docs/releases/<version>-<slug>/`) for centralising Telegram post drafts and release notes alongside the rest of the documentation.

---

## Upgrading

**New projects** created with `nacl-init` after this release automatically receive `COMPOSE_PROJECT_NAME` in their `.env`. No action needed.

**Existing NaCl projects** that were not part of the in-place rollout should add the following as the first line of their `graph-infra/.env`:

```
COMPOSE_PROJECT_NAME=<your-project-slug>-graph
```

If your `graph-infra/docker-compose.yml` pre-dates this release and lacks a top-level `name:` field, pull the updated template and replace the file:

```bash
cp nacl-tl-core/templates/graph-docker-compose.yml graph-infra/docker-compose.yml
# then edit CONTAINER_PREFIX, ports, and COMPOSE_PROJECT_NAME in graph-infra/.env
```

Bring the stack down and back up once after editing `.env` so the new project name takes effect:

```bash
docker compose -f graph-infra/docker-compose.yml down
docker compose --env-file graph-infra/.env -f graph-infra/docker-compose.yml up -d
```

---

## Known limitations

- Handover is sequential and one-shot. Only one developer holds the authoritative graph at a time. There is no live sync or conflict resolution.
- Empty-graph exports are rejected by design. `handover-export.sh` aborts with a non-zero exit code if the source database contains zero nodes. See `docs/HANDOVER.md` — Limitations.
- Multi-user concurrent collaboration (shared remote Neo4j, concurrent writes) requires shared remote infrastructure and is planned for a future release.

---

## Credits

Thanks to everyone who tested the handover round-trip and the compose isolation fix on development machines.

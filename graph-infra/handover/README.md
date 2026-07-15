# Graph Handover Artifacts

Encrypted Neo4j graph snapshots for inter-machine handover. One-time transfer
mechanism; see `docs/HANDOVER.md` for the full runbook.

## Filename convention

```
YYYY-MM-DDTHH-MM_<git-sha>.cypher.gz.age
YYYY-MM-DDTHH-MM_<git-sha>.cypher.manifest.json
```

Each export produces a pair: the encrypted artifact (`.cypher.gz.age`) and an
unencrypted manifest (`.manifest.json`). The manifest is non-sensitive and is
used to verify the transfer without decrypting.

## What is in the manifest

- `nodes`, `relationships` — total counts at export time
- `labels` — per-label node count histogram
- `rel_types` — per-relationship-type count histogram
- `constraint_count` — number of schema constraints
- `neo4j_version`, `apoc_version` — versions of the source instance
- `git_sha`, `timestamp` — traceability back to the repo state at export time
- `source_container` — Docker container name on the exporting machine

## Security

Artifacts are encrypted with `age` symmetric passphrase encryption. Never
commit the passphrase. Share it out-of-band via 1Password, Bitwarden, or
another secure channel agreed with the receiving developer.

## Cleanup policy

Artifacts committed here bloat git history. The shared VPS Neo4j mode itself
already shipped (v2.23.0, `graph.mode: remote` — see
`docs/runbooks/provision-shared-graph-vps.md`), but MinIO/S3 backup for
handover artifacts has not: `--to=s3://…`/`--from=s3://…` are still rejected
(see `docs/HANDOVER.md`). When S3/MinIO support for handover artifacts ships,
these files will migrate to object storage and this folder will be scrubbed
from history:

```
git filter-repo --path graph-infra/handover --invert-paths
```

Until then, keep the number of committed artifacts to a minimum — one per
handover event.

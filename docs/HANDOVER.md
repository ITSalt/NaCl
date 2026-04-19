[Home](../README.md) > Handover

🇷🇺 [Русская версия](HANDOVER.ru.md)

# Graph Handover

One-shot encrypted transfer of a project's Neo4j graph between machines. Use this when handing a project over to another developer or moving to a new workstation. It exports the full graph, compresses and encrypts it, commits the artifact to git, and replays it verbatim on the receiving machine.

Not suitable for simultaneous multi-developer work against a shared graph — that is a planned future capability.

## Prerequisites

Both machines need the same tools installed.

| Tool | Purpose | macOS | Debian/Ubuntu | Arch |
|------|---------|-------|---------------|------|
| `age` | Symmetric encryption | `brew install age` | `apt install age` | `pacman -S age` |
| `expect` | Non-interactive passphrase injection | ships at `/usr/bin/expect` | `apt install expect` | `pacman -S expect` |
| `gzip` | Compression | usually present | usually present | usually present |
| `jq` | JSON manifest handling | `brew install jq` | `apt install jq` | `pacman -S jq` |
| `docker` | Container exec | [Docker Desktop](https://docs.docker.com/get-docker/) | [Docker Engine](https://docs.docker.com/engine/install/) | `pacman -S docker` |

**Passphrase sharing.** The passphrase is never committed to git. Share it out-of-band: 1Password, Bitwarden, or an agreed secure messenger.

## Export (Dev 1)

### 1. Confirm the container is running

```bash
docker ps | grep neo4j
```

If nothing appears, start the stack:

```bash
docker compose -f graph-infra/docker-compose.yml up -d
```

### 2. Set container identity (multi-project machines only)

Container detection priority:
1. `NACL_CONTAINER` env var
2. `--container=NAME` flag
3. `CONTAINER_PREFIX` from `graph-infra/.env` → `${CONTAINER_PREFIX}-neo4j`
4. Single running `*-neo4j` container (auto-detect)
5. Fail with a list of candidates

If you have more than one `*-neo4j` container running, set `NACL_CONTAINER` explicitly:

```bash
export NACL_CONTAINER=myproject-neo4j
```

### 3. Run the export

Minimal (passphrase prompted interactively, writes to `graph-infra/handover/`):

```bash
./graph-infra/scripts/handover-export.sh
```

With env-var passphrase and explicit container (non-interactive, suitable for CI):

```bash
export NACL_CONTAINER=learn-neo4j
export NACL_HANDOVER_PASSPHRASE=correct-horse-battery-staple

./graph-infra/scripts/handover-export.sh
```

Full flag reference:

```
./graph-infra/scripts/handover-export.sh \
  [--container=NAME]          # override container detection
  [--to=git|s3://...]         # default: git  (s3 not available yet)
  [--out-dir=PATH]            # default: graph-infra/handover
  [--passphrase-env=VAR]      # default: NACL_HANDOVER_PASSPHRASE
```

### 4. What lands in `graph-infra/handover/`

Two files per export:

| File | Contents |
|------|---------|
| `YYYY-MM-DDTHH-MM_<sha>.cypher.gz.age` | Encrypted, compressed Cypher dump |
| `YYYY-MM-DDTHH-MM_<sha>.cypher.manifest.json` | Node/rel counts, label histogram, versions — plaintext |

The manifest is not sensitive. The artifact is encrypted and marked binary in `.gitattributes`.

### 5. Commit and push

```bash
git add graph-infra/handover/
git commit -m "chore: graph handover snapshot $(date -u +%Y-%m-%d)"
git push
```

### 6. Share the passphrase out-of-band

Send it via 1Password, Bitwarden, or another channel agreed with the receiver. Do not put it in the commit message, PR description, or any file.

## Import (Dev 2)

### 1. Pull latest git

```bash
git pull
```

### 2. Bring up a local Neo4j container

The import wipes all existing data before replaying. An empty container is fine.

```bash
docker compose -f graph-infra/docker-compose.yml up -d
```

Wait ~30 seconds for Neo4j to be ready.

### 3. Run the import

```bash
./graph-infra/scripts/handover-import.sh \
  --file=graph-infra/handover/2026-04-19T14-30_abc1234.cypher.gz.age
```

Full flag reference:

```
./graph-infra/scripts/handover-import.sh \
  --file=PATH                 # required: path to .cypher.gz.age artifact
  [--container=NAME]          # override container detection
  [--from=git|s3://...]       # default: git  (s3 not available yet)
  [--passphrase-env=VAR]      # default: NACL_HANDOVER_PASSPHRASE
  [--force]                   # skip the "DELETE ALL DATA" confirmation prompt
```

The script will:
- Warn that all existing data in the container will be deleted and ask for confirmation (skip with `--force`)
- Prompt for the passphrase if `NACL_HANDOVER_PASSPHRASE` is not set
- Decrypt and decompress the artifact into a temp directory
- Copy the Cypher file into the container, wipe the graph, drop all constraints and indexes, replay the Cypher
- Re-verify node and relationship counts against the manifest

### 4. Verify

```bash
# NaCl skills
/nacl-tl-status
/nacl-sa-validate
```

Both should report the expected counts and pass validation.

## Verification

The manifest records node count, relationship count, per-label histogram, per-rel-type histogram, constraint count, Neo4j version, APOC version, git SHA, and source container name. The import script automatically compares node and relationship counts against the manifest after replay and exits non-zero if they diverge.

To cross-check manually:

```cypher
MATCH (n) RETURN count(n) AS nodes;
MATCH ()-[r]->() RETURN count(r) AS rels;
```

Compare against the values in the sibling `.manifest.json` file.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `'age' not found` | Install `age` — see Prerequisites table above |
| `'expect' not found` | Install `expect` — macOS ships it at `/usr/bin/expect`; on Linux: `apt install expect` |
| Passphrase prompt hangs or fails | Confirm `expect` is installed and `age` is on `PATH` |
| `Cannot detect Neo4j container` | Set `NACL_CONTAINER=<container-name>` or pass `--container=NAME` |
| Container auto-detect picks the wrong one | Same — set `NACL_CONTAINER` explicitly |
| Neo4j version mismatch warning | Acceptable within same major.minor; if major differs, upgrade Neo4j on the target machine first |
| Count mismatch after import | Re-run with `bash -x` for verbose output; check APOC version on source vs target (`apoc.version()`) |
| Commit too large for git | See cleanup policy in `graph-infra/handover/README.md` — keep one artifact per handover event |

## Artifact storage paths

### Git (current default, `--to=git`)

Artifacts land in `graph-infra/handover/`. The `.gitattributes` in that directory marks `*.cypher.gz.age` as binary so git does not attempt text diffs or line-ending normalization. Cleanup policy and history-scrub command are documented in `graph-infra/handover/README.md`.

### S3 (`--to=s3://…`)

Not available in this release. The scripts reject `--to=s3://…` and `--from=s3://…` with an explanatory message. S3/MinIO support is planned for a future release alongside shared infrastructure.

## Limitations

- **Sequential, one-shot.** Not a live sync. The receiving machine gets a point-in-time snapshot; changes on either side after export are not merged.
- **Single-writer assumption.** Do not run NaCl skills on the source machine while an import is in progress on the target. The import wipes the graph before replaying.
- **No per-user authentication.** All machines use the same dev-default Neo4j password (`neo4j_graph_dev` unless overridden in `graph-infra/.env`).
- **Empty-graph exports are rejected.** If the source container has zero nodes, `handover-export.sh` exits with `Export produced empty file — APOC export may have failed.` This guard exists to catch a missing or broken APOC plugin, but it also triggers on genuinely empty graphs. Populate at least one node (or use a different handover mechanism) if you need to snapshot an empty state.

## Related

- [`graph-infra/handover/README.md`](../graph-infra/handover/README.md) — filename convention, manifest fields, cleanup policy
- [`docs/quickstart.md`](quickstart.md) — initial setup and infrastructure startup

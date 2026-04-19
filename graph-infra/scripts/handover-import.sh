#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

ARTIFACT_FILE=""
FROM="git"
PASSPHRASE_ENV_VAR="NACL_HANDOVER_PASSPHRASE"
HANDOVER_CONTAINER=""
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --file=*)      ARTIFACT_FILE="${arg#--file=}" ;;
    --container=*) HANDOVER_CONTAINER="${arg#--container=}" ;;
    --from=*)      FROM="${arg#--from=}" ;;
    --passphrase-env=*) PASSPHRASE_ENV_VAR="${arg#--passphrase-env=}" ;;
    --force)       FORCE=true ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

if [[ "$FROM" == s3://* ]]; then
  die "S3 import ships in S2. See /Users/maxnikitin/.claude/plans/nacl-s2-multi-user-collaboration.md"
fi

[[ -n "$ARTIFACT_FILE" ]] || die "Required: --file=PATH to a .cypher.gz.age artifact."
[[ "$ARTIFACT_FILE" == *.cypher.gz.age ]] || die "File must end in .cypher.gz.age — got: $ARTIFACT_FILE"
[[ -f "$ARTIFACT_FILE" ]] || die "File not found: $ARTIFACT_FILE"

MANIFEST_FILE="${ARTIFACT_FILE%.cypher.gz.age}.cypher.manifest.json"
[[ -f "$MANIFEST_FILE" ]] || die "Sibling manifest not found: $MANIFEST_FILE"
jq empty "$MANIFEST_FILE" 2>/dev/null || die "Manifest is not valid JSON: $MANIFEST_FILE"

require age expect gzip jq docker
load_env
detect_container

if [[ "$FORCE" != true ]]; then
  echo "[handover] WARNING: This will DELETE ALL DATA in container '$CONTAINER'." >&2
  printf "[handover] Proceed? [y/N] " >&2
  read -r CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || { log "Aborted."; exit 0; }
fi

# Resolve passphrase
PASSPHRASE="${!PASSPHRASE_ENV_VAR:-}"
if [[ -z "$PASSPHRASE" ]]; then
  read -r -s -p "Handover passphrase: " PASSPHRASE; echo >&2
fi
[[ -n "$PASSPHRASE" ]] || die "Passphrase must not be empty."

MANIFEST_NEO4J_VER=$(jq -r '.neo4j_version' "$MANIFEST_FILE")
CURRENT_NEO4J_VER=$(neo4j_version)

manifest_major_minor() { echo "$1" | grep -oE '^[0-9]+\.[0-9]+'; }
if [[ "$(manifest_major_minor "$MANIFEST_NEO4J_VER")" != "$(manifest_major_minor "$CURRENT_NEO4J_VER")" ]]; then
  log "WARNING: Neo4j version mismatch — manifest: $MANIFEST_NEO4J_VER, target: $CURRENT_NEO4J_VER"
fi

BASENAME=$(basename "$ARTIFACT_FILE")
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

GZ_FILE="${WORK_DIR}/${BASENAME%.age}"
CYPHER_FILE="${GZ_FILE%.gz}"

log "Decrypting artifact..."
age_decrypt "$PASSPHRASE" "$ARTIFACT_FILE" "$GZ_FILE"

log "Decompressing..."
gunzip -c "$GZ_FILE" > "$CYPHER_FILE"

CONTAINER_TMP="/tmp/${BASENAME%.gz.age}"
log "Copying to container..."
docker cp "$CYPHER_FILE" "${CONTAINER}:${CONTAINER_TMP}"

log "Wiping existing data in container: $CONTAINER"
docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
  "MATCH (n) CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 1000 ROWS;"

log "Dropping all constraints and indexes via APOC..."
docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
  "CALL apoc.schema.assert({}, {}, true) YIELD label, key RETURN count(*) AS dropped;"

# apoc.schema.assert does not drop FULLTEXT indexes; collect remaining user indexes and drop them
REMAINING_INDEXES=$(docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
  "SHOW INDEXES YIELD name, type WHERE type <> 'LOOKUP' RETURN name;" 2>/dev/null \
  | tail -n +2 | tr -d '"' | tr '\n' ',')
if [[ -n "$REMAINING_INDEXES" ]]; then
  for idx_name in ${REMAINING_INDEXES//,/ }; do
    [[ -n "$idx_name" ]] && \
    docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
      "DROP INDEX \`${idx_name}\` IF EXISTS;" 2>/dev/null || true
  done
fi

log "Replaying Cypher..."
docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" --fail-at-end -f "$CONTAINER_TMP"

log "Cleaning up container temp file..."
docker exec "$CONTAINER" rm -f "$CONTAINER_TMP"

log "Re-verifying counts..."
ACTUAL_COUNTS=$(graph_counts)

MANIFEST_NODES=$(jq -r '.nodes' "$MANIFEST_FILE")
MANIFEST_RELS=$(jq -r '.relationships' "$MANIFEST_FILE")
ACTUAL_NODES=$(echo "$ACTUAL_COUNTS" | jq -r '.nodes')
ACTUAL_RELS=$(echo "$ACTUAL_COUNTS" | jq -r '.relationships')

log ""
log "Verification report:"
log "  Nodes    : manifest=$MANIFEST_NODES  actual=$ACTUAL_NODES"
log "  Rels     : manifest=$MANIFEST_RELS  actual=$ACTUAL_RELS"

# Label histogram diff
MANIFEST_LABELS=$(jq -r '.labels' "$MANIFEST_FILE")
ACTUAL_LABELS=$(echo "$ACTUAL_COUNTS" | jq -r '.labels')
LABEL_DIFF=$(jq -n \
  --argjson exp "$MANIFEST_LABELS" \
  --argjson got "$ACTUAL_LABELS" \
  '($exp | to_entries) + ($got | to_entries) |
   group_by(.key) | map({
     key: .[0].key,
     expected: (map(select(.value != null)) | .[0].value // 0),
     actual:   (map(select(.value != null)) | .[1].value // 0)
   }) | map(select(.expected != .actual))' 2>/dev/null || echo "[]")

if [[ "$LABEL_DIFF" != "[]" && "$LABEL_DIFF" != "" ]]; then
  log "  Label mismatches:"
  echo "$LABEL_DIFF" | jq -r '.[] | "    " + .key + ": expected=" + (.expected|tostring) + " actual=" + (.actual|tostring)' >&2
fi

FAILED=false
[[ "$ACTUAL_NODES" == "$MANIFEST_NODES" ]] || { log "  FAIL: node count mismatch"; FAILED=true; }
[[ "$ACTUAL_RELS"  == "$MANIFEST_RELS"  ]] || { log "  FAIL: relationship count mismatch"; FAILED=true; }

if [[ "$FAILED" == true ]]; then
  die "Import verification failed — counts do not match manifest."
fi

log "  PASS: counts match manifest."
log "Import complete."

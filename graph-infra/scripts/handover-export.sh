#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

TO="git"
OUT_DIR="${GRAPH_INFRA}/handover"
PASSPHRASE_ENV_VAR="NACL_HANDOVER_PASSPHRASE"
HANDOVER_CONTAINER=""

for arg in "$@"; do
  case "$arg" in
    --container=*) HANDOVER_CONTAINER="${arg#--container=}" ;;
    --to=*)        TO="${arg#--to=}" ;;
    --out-dir=*)   OUT_DIR="${arg#--out-dir=}" ;;
    --passphrase-env=*) PASSPHRASE_ENV_VAR="${arg#--passphrase-env=}" ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

if [[ "$TO" == s3://* ]]; then
  die "S3 export ships in S2. See /Users/maxnikitin/.claude/plans/nacl-s2-multi-user-collaboration.md"
fi

require age expect gzip jq docker
load_env
detect_container

# Resolve passphrase
PASSPHRASE="${!PASSPHRASE_ENV_VAR:-}"
if [[ -z "$PASSPHRASE" ]]; then
  read -r -s -p "Handover passphrase: " PASSPHRASE; echo >&2
  read -r -s -p "Confirm passphrase:   " PASSPHRASE2; echo >&2
  [[ "$PASSPHRASE" == "$PASSPHRASE2" ]] || die "Passphrases do not match."
fi
[[ -n "$PASSPHRASE" ]] || die "Passphrase must not be empty."

TIMESTAMP=$(date -u '+%Y-%m-%dT%H-%M')
GIT_SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "nogit")
BASENAME="${TIMESTAMP}_${GIT_SHA}.cypher"

mkdir -p "$OUT_DIR"

log "Exporting graph from container: $CONTAINER"
log "Output directory: $OUT_DIR"

# Stream APOC export — file export requires apoc.export.file.enabled which may not be set.
# The streaming format wraps string values with \" (escaped quotes); strip to plain " so
# the output is valid Cypher for cypher-shell file replay.
CYPHER_FILE="${OUT_DIR}/${BASENAME}"
trap 'rm -f "${CYPHER_FILE:-}" "${GZ_FILE:-}"' EXIT
docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
  "CALL apoc.export.cypher.all(null, {format:'cypher-shell', useOptimizations:{type:'UNWIND_BATCH', unwindBatchSize:20}, stream:true}) YIELD cypherStatements RETURN cypherStatements;" \
  2>/dev/null | tail -n +2 | sed '1s/^"//' | sed '$d' | sed 's/\\"/"/g' > "$CYPHER_FILE"

CYPHER_LINES=$(wc -l < "$CYPHER_FILE")
log "Exported ${CYPHER_LINES} lines of Cypher"
[[ "$CYPHER_LINES" -gt 0 ]] || die "Export produced empty file — APOC export may have failed."

log "Collecting graph statistics for manifest..."
COUNTS=$(graph_counts)
NEO4J_VER=$(neo4j_version)
APOC_VER=$(apoc_version)

MANIFEST_FILE="${OUT_DIR}/${BASENAME}.manifest.json"
jq -n \
  --arg ts "$TIMESTAMP" \
  --arg sha "$GIT_SHA" \
  --arg container "$CONTAINER" \
  --arg neo4j_version "$NEO4J_VER" \
  --arg apoc_version "$APOC_VER" \
  --argjson counts "$COUNTS" \
  '{
    timestamp: $ts,
    git_sha: $sha,
    source_container: $container,
    neo4j_version: $neo4j_version,
    apoc_version: $apoc_version,
    nodes: $counts.nodes,
    relationships: $counts.relationships,
    labels: $counts.labels,
    rel_types: $counts.rel_types,
    constraint_count: $counts.constraint_count
  }' > "$MANIFEST_FILE"

log "Compressing..."
GZ_FILE="${CYPHER_FILE}.gz"
gzip -c "$CYPHER_FILE" > "$GZ_FILE"

log "Encrypting with age..."
AGE_FILE="${GZ_FILE}.age"
age_encrypt "$PASSPHRASE" "$GZ_FILE" "$AGE_FILE"

# Remove plaintext intermediates
rm -f "$CYPHER_FILE" "$GZ_FILE"

AGE_SIZE=$(du -sh "$AGE_FILE" | cut -f1)

log ""
log "Export complete."
log "  Artifact : $AGE_FILE  ($AGE_SIZE)"
log "  Manifest : $MANIFEST_FILE"
log "  Nodes    : $(echo "$COUNTS" | jq -r '.nodes')"
log "  Rels     : $(echo "$COUNTS" | jq -r '.relationships')"
log "  Labels   : $(echo "$COUNTS" | jq -r '.labels | to_entries | map(.key+"="+(.value|tostring)) | join(", ")')"

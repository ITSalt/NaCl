#!/usr/bin/env bash
# Shared helpers for handover-export.sh and handover-import.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GRAPH_INFRA="${REPO_ROOT}/graph-infra"

log() { echo "[handover] $*" >&2; }
die() { echo "[handover] ERROR: $*" >&2; exit 1; }

require() {
  for cmd in "$@"; do
    if ! command -v "$cmd" &>/dev/null; then
      case "$cmd" in
        age)    die "'age' not found. Install: brew install age  (macOS)  |  apt install age  (Debian/Ubuntu)" ;;
        expect) die "'expect' not found. Install: brew install expect  (macOS)  |  apt install expect  (Linux)" ;;
        gzip)   die "'gzip' not found. Install: brew install gzip  (macOS)  |  apt install gzip  (Linux)" ;;
        jq)     die "'jq' not found. Install: brew install jq  (macOS)  |  apt install jq  (Linux)" ;;
        docker) die "'docker' not found. Install Docker Desktop or Docker Engine." ;;
        *)     die "'${cmd}' not found. Please install it before continuing." ;;
      esac
    fi
  done
}

load_env() {
  local env_file="${GRAPH_INFRA}/.env"
  if [[ ! -f "$env_file" ]]; then
    env_file="${GRAPH_INFRA}/.env.example"
    log "No .env found; using .env.example defaults"
  fi
  # shellcheck disable=SC1090
  set -o allexport; source "$env_file"; set +o allexport
  : "${NEO4J_PASSWORD:=neo4j_graph_dev}"
  : "${NEO4J_BOLT_PORT:=3587}"
  : "${NEO4J_HTTP_PORT:=3574}"
  : "${CONTAINER_PREFIX:=graph}"
  export NEO4J_PASSWORD NEO4J_BOLT_PORT NEO4J_HTTP_PORT CONTAINER_PREFIX
}

detect_container() {
  local flag_container=""
  # Parse --container=NAME from caller's args (passed via HANDOVER_CONTAINER global)
  if [[ -n "${HANDOVER_CONTAINER:-}" ]]; then
    flag_container="$HANDOVER_CONTAINER"
  fi

  local name=""
  if [[ -n "${NACL_CONTAINER:-}" ]]; then
    name="$NACL_CONTAINER"
    log "Container (NACL_CONTAINER env): $name"
  elif [[ -n "$flag_container" ]]; then
    name="$flag_container"
    log "Container (--container flag): $name"
  elif [[ -n "${CONTAINER_PREFIX:-}" ]]; then
    name="${CONTAINER_PREFIX}-neo4j"
    log "Container (CONTAINER_PREFIX from env): $name"
  else
    local running
    running=$(docker ps --filter "name=-neo4j" --format "{{.Names}}" 2>/dev/null | head -1)
    if [[ -z "$running" ]]; then
      log "No running *-neo4j container found. Candidates:"
      docker ps -a --filter "name=-neo4j" --format "  {{.Names}}  ({{.Status}})" >&2
      die "Cannot detect Neo4j container. Set NACL_CONTAINER or pass --container=NAME."
    fi
    name="$running"
    log "Container (auto-detected): $name"
  fi

  if ! docker inspect "$name" &>/dev/null; then
    die "Container '$name' not found. Available *-neo4j containers:"$'\n'"$(docker ps -a --filter 'name=-neo4j' --format '  {{.Names}}  ({{.Status}})')"
  fi

  CONTAINER="$name"
  export CONTAINER
}

age_encrypt() {
  local passphrase="$1" input="$2" output="$3"
  # age --passphrase requires a TTY; use expect to provide it non-interactively
  expect -c "
    log_user 0
    spawn age --passphrase -o [list $output] [list $input]
    expect -re {passphrase.*:}
    send [list $passphrase]\r
    expect -re {Confirm.*:}
    send [list $passphrase]\r
    expect eof
    catch wait result
    exit [lindex \$result 3]
  " >/dev/null 2>&1
}

age_decrypt() {
  local passphrase="$1" input="$2" output="$3"
  expect -c "
    log_user 0
    spawn age --decrypt -o [list $output] [list $input]
    expect -re {passphrase.*:}
    send [list $passphrase]\r
    expect eof
    catch wait result
    exit [lindex \$result 3]
  " >/dev/null 2>&1
}

neo4j_version() {
  docker exec "$CONTAINER" neo4j --version 2>/dev/null \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
}

apoc_version() {
  docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
    "RETURN apoc.version() AS v;" 2>/dev/null \
    | tail -n +2 | tr -d '"'
}

graph_counts() {
  local nodes rels label_hist rel_hist constraint_count
  nodes=$(docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
    "MATCH (n) RETURN count(n) AS c;" 2>/dev/null | tail -n +2)

  rels=$(docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
    "MATCH ()-[r]->() RETURN count(r) AS c;" 2>/dev/null | tail -n +2)

  # label histogram as JSON object — cypher-shell output: "Label", count
  label_hist=$(docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
    "CALL db.labels() YIELD label CALL apoc.cypher.run('MATCH (n:\`' + label + '\`) RETURN count(n) AS cnt', {}) YIELD value RETURN label, value.cnt AS cnt ORDER BY label;" \
    2>/dev/null | tail -n +2 | awk -F', ' '{
      key=$1; val=$2;
      gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", key);
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", val);
      if (NR>1) printf ","; printf "\"%s\":%s", key, val
    }' | sed 's/^/{/; s/$/}/')

  # rel type histogram as JSON object — cypher-shell output: "TYPE", count
  rel_hist=$(docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
    "CALL db.relationshipTypes() YIELD relationshipType CALL apoc.cypher.run('MATCH ()-[r:\`' + relationshipType + '\`]->() RETURN count(r) AS cnt', {}) YIELD value RETURN relationshipType, value.cnt AS cnt ORDER BY relationshipType;" \
    2>/dev/null | tail -n +2 | awk -F', ' '{
      key=$1; val=$2;
      gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", key);
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", val);
      if (NR>1) printf ","; printf "\"%s\":%s", key, val
    }' | sed 's/^/{/; s/$/}/')

  constraint_count=$(docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
    "SHOW CONSTRAINTS YIELD name RETURN count(name) AS c;" 2>/dev/null | tail -n +2)

  local empty_json="{}"
  printf '{"nodes":%s,"relationships":%s,"labels":%s,"rel_types":%s,"constraint_count":%s}' \
    "$nodes" "$rels" "${label_hist:-$empty_json}" "${rel_hist:-$empty_json}" "$constraint_count"
}

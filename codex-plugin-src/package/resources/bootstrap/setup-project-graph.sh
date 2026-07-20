#!/bin/sh
# Confirmed Skills-only graph bootstrap. All package paths derive from this file.
set -u

PROJECT_ROOT=""; PROJECT_ID=""; BOLT_PORT=""; HTTP_PORT=""; CONFIRMATION=""; DATABASE="neo4j"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --project-id) PROJECT_ID="$2"; shift 2 ;;
    --bolt-port) BOLT_PORT="$2"; shift 2 ;;
    --http-port) HTTP_PORT="$2"; shift 2 ;;
    --confirmation) CONFIRMATION="$2"; shift 2 ;;
    --database) DATABASE="$2"; shift 2 ;;
    --password|--secret*) echo "NACL_GRAPH_RESULT: status=BLOCKED code=SECRET_ARGUMENT_FORBIDDEN" >&2; exit 2 ;;
    *) echo "NACL_GRAPH_RESULT: status=BLOCKED code=ARGUMENT_INVALID" >&2; exit 2 ;;
  esac
done

fail() { echo "NACL_GRAPH_RESULT: status=BLOCKED code=$1" >&2; exit 1; }
for value in PROJECT_ROOT PROJECT_ID BOLT_PORT HTTP_PORT CONFIRMATION; do
  eval "resolved=\$$value"
  [ -n "$resolved" ] || fail "${value}_MISSING"
done
[ -d "$PROJECT_ROOT" ] || fail PROJECT_ROOT_MISSING
case "$PROJECT_ROOT" in /*) ;; *) fail PROJECT_ROOT_NOT_ABSOLUTE ;; esac
PROJECT_ROOT=$(CDPATH= cd -- "$PROJECT_ROOT" && pwd -P) || fail PROJECT_ROOT_UNSAFE
echo "$PROJECT_ID" | grep -Eq '^[a-z0-9][a-z0-9_-]{2,63}$' || fail PROJECT_ID_INVALID
echo "$BOLT_PORT" | grep -Eq '^[0-9]+$' || fail BOLT_PORT_INVALID
echo "$HTTP_PORT" | grep -Eq '^[0-9]+$' || fail HTTP_PORT_INVALID
[ "$BOLT_PORT" -ge 1024 ] && [ "$BOLT_PORT" -le 65535 ] || fail BOLT_PORT_INVALID
[ "$HTTP_PORT" -ge 1024 ] && [ "$HTTP_PORT" -le 65535 ] || fail HTTP_PORT_INVALID
[ "$BOLT_PORT" != "$HTTP_PORT" ] || fail PORT_COLLISION
[ "$CONFIRMATION" = "INIT_LOCAL_GRAPH:$PROJECT_ID" ] || fail CONFIRMATION_REQUIRED

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || fail BUNDLE_PATH_UNAVAILABLE
RESOURCE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P) || fail BUNDLE_PATH_UNAVAILABLE
SKILL_ROOT=$(CDPATH= cd -- "$RESOURCE_ROOT/.." && pwd -P) || fail BUNDLE_PATH_UNAVAILABLE
LIB="$RESOURCE_ROOT/nacl-tl-core/scripts/lib-neo4j-mcp.sh"
GUARD="$SCRIPT_DIR/codex-config-guard.mjs"
WRITER="$SCRIPT_DIR/write-codex-mcp-config.mjs"
LAUNCHER_SOURCE="$SCRIPT_DIR/project-neo4j-launcher.mjs"
SCHEMA_RUNNER="$SCRIPT_DIR/apply-project-schema.mjs"
for required in "$LIB" "$GUARD" "$WRITER" "$LAUNCHER_SOURCE" "$SCHEMA_RUNNER"; do [ -f "$required" ] || fail BUNDLE_RESOURCE_MISSING; done
NODE=$(command -v node 2>/dev/null || command -v nodejs 2>/dev/null) || fail NODE_MISSING
NODE=$(CDPATH= cd -- "$(dirname -- "$NODE")" && printf '%s/%s\n' "$PWD" "$(basename -- "$NODE")")

GRAPH_DIR="$PROJECT_ROOT/graph-infra"; SCHEMA_DIR="$GRAPH_DIR/schema"; QUERY_DIR="$GRAPH_DIR/queries"; RUNTIME_DIR="$GRAPH_DIR/scripts"
safe_directory() {
  if [ -L "$1" ]; then fail DIRECTORY_UNSAFE
  elif [ -e "$1" ]; then [ -d "$1" ] || fail DIRECTORY_UNSAFE
  else mkdir "$1" || fail COPY_MKDIR; fi
}
copy_exact_or_create() {
  source_file="$1"; target_file="$2"; conflict_code="$3"
  if [ -L "$target_file" ]; then fail "$conflict_code"
  elif [ -e "$target_file" ]; then
    [ -f "$target_file" ] && cmp -s "$source_file" "$target_file" || fail "$conflict_code"
  else cp "$source_file" "$target_file" || fail COPY_ASSET_FAILED; fi
}
safe_directory "$GRAPH_DIR"
safe_directory "$SCHEMA_DIR"
safe_directory "$QUERY_DIR"
safe_directory "$GRAPH_DIR/boards"
safe_directory "$RUNTIME_DIR"
copy_exact_or_create "$RESOURCE_ROOT/nacl-tl-core/templates/graph-docker-compose.yml" "$GRAPH_DIR/docker-compose.yml" COMPOSE_CONFLICT
for schema in ba-schema sa-schema tl-schema; do
  copy_exact_or_create "$RESOURCE_ROOT/graph-infra/schema/$schema.cypher" "$SCHEMA_DIR/$schema.cypher" SCHEMA_CONFLICT
done
for query in "$RESOURCE_ROOT"/graph-infra/queries/*.cypher; do
  [ -e "$query" ] || continue
  target="$QUERY_DIR/$(basename "$query")"
  copy_exact_or_create "$query" "$target" QUERY_CONFLICT
done

PROJECT_LAUNCHER="$RUNTIME_DIR/nacl-neo4j-mcp-launcher.mjs"
if [ -L "$PROJECT_LAUNCHER" ]; then fail PROJECT_LAUNCHER_CONFLICT
elif [ -e "$PROJECT_LAUNCHER" ]; then
  [ -f "$PROJECT_LAUNCHER" ] || fail PROJECT_LAUNCHER_CONFLICT
  cmp -s "$LAUNCHER_SOURCE" "$PROJECT_LAUNCHER" || fail PROJECT_LAUNCHER_CONFLICT
else
  cp "$LAUNCHER_SOURCE" "$PROJECT_LAUNCHER" || fail PROJECT_LAUNCHER_COPY_FAILED
fi
chmod 600 "$PROJECT_LAUNCHER" 2>/dev/null || fail PROJECT_LAUNCHER_PERMISSIONS_FAILED

ENV_FILE="$GRAPH_DIR/.env"
if [ -L "$ENV_FILE" ]; then fail GRAPH_ENV_UNSAFE
elif [ -e "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || fail GRAPH_ENV_UNSAFE
  EXISTING_PREFIX=$(sed -n 's/^CONTAINER_PREFIX=//p' "$ENV_FILE" | head -1)
  EXISTING_BOLT=$(sed -n 's/^NEO4J_BOLT_PORT=//p' "$ENV_FILE" | head -1)
  EXISTING_HTTP=$(sed -n 's/^NEO4J_HTTP_PORT=//p' "$ENV_FILE" | head -1)
  NEO4J_PASSWORD=$(sed -n 's/^NEO4J_PASSWORD=//p' "$ENV_FILE" | head -1)
  [ "$EXISTING_PREFIX" = "$PROJECT_ID" ] && [ "$EXISTING_BOLT" = "$BOLT_PORT" ] && [ "$EXISTING_HTTP" = "$HTTP_PORT" ] || fail GRAPH_ENV_CONFLICT
  [ "${#NEO4J_PASSWORD}" -ge 32 ] || fail GRAPH_SECRET_INVALID
else
  if command -v openssl >/dev/null 2>&1; then NEO4J_PASSWORD=$(openssl rand -hex 24) || fail SECRET_GENERATION_FAILED
  elif [ -r /dev/urandom ]; then NEO4J_PASSWORD=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48) || true
  else fail SECRET_GENERATOR_MISSING; fi
  [ "${#NEO4J_PASSWORD}" -ge 32 ] || fail SECRET_GENERATION_FAILED
  umask 077
  printf 'COMPOSE_PROJECT_NAME=%s-graph\nCONTAINER_PREFIX=%s\nNEO4J_PASSWORD=%s\nNEO4J_HTTP_PORT=%s\nNEO4J_BOLT_PORT=%s\n' \
    "$PROJECT_ID" "$PROJECT_ID" "$NEO4J_PASSWORD" "$HTTP_PORT" "$BOLT_PORT" > "$ENV_FILE" || fail GRAPH_ENV_WRITE_FAILED
fi
chmod 600 "$ENV_FILE" || fail GRAPH_ENV_PERMISSIONS_FAILED
EXAMPLE="$GRAPH_DIR/.env.example"
EXPECTED_EXAMPLE=$(printf 'COMPOSE_PROJECT_NAME=%s-graph\nCONTAINER_PREFIX=%s\nNEO4J_PASSWORD=\nNEO4J_HTTP_PORT=%s\nNEO4J_BOLT_PORT=%s' \
  "$PROJECT_ID" "$PROJECT_ID" "$HTTP_PORT" "$BOLT_PORT")
if [ -e "$EXAMPLE" ]; then
  [ -f "$EXAMPLE" ] && [ ! -L "$EXAMPLE" ] || fail GRAPH_EXAMPLE_UNSAFE
  [ "$(cat "$EXAMPLE")" = "$EXPECTED_EXAMPLE" ] || fail GRAPH_EXAMPLE_CONFLICT
else
  printf '%s\n' "$EXPECTED_EXAMPLE" > "$EXAMPLE" || fail EXAMPLE_WRITE_FAILED
fi
node "$PROJECT_LAUNCHER" --check-only || fail GRAPH_ENV_VALIDATION_FAILED

SKILLS_DIR="$RESOURCE_ROOT"; export SKILLS_DIR
[ "${NEO4J_MCP_VERSION:-}" != latest ] || fail UNPINNED_BINARY_VERSION_FORBIDDEN
BIN_DIR="$GRAPH_DIR/bin"; STABLE_BIN="$BIN_DIR/neo4j-mcp"; CACHE_DIR="$GRAPH_DIR/cache/neo4j-mcp"
export BIN_DIR STABLE_BIN CACHE_DIR
safe_directory "$BIN_DIR"
safe_directory "$GRAPH_DIR/cache"
safe_directory "$CACHE_DIR"
. "$LIB" || fail BINARY_RESOLVER_LOAD_FAILED
BINARY_RECEIPT="$BIN_DIR/neo4j-mcp.sha256"
binary_sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else return 1; fi
}
if [ -L "$STABLE_BIN" ] || [ -L "$BINARY_RECEIPT" ]; then fail BINARY_RECEIPT_MISMATCH; fi
if [ -e "$STABLE_BIN" ] || [ -e "$BINARY_RECEIPT" ]; then
  [ -f "$STABLE_BIN" ] && [ ! -L "$STABLE_BIN" ] && [ -x "$STABLE_BIN" ] || fail BINARY_RECEIPT_MISMATCH
  [ -f "$BINARY_RECEIPT" ] && [ ! -L "$BINARY_RECEIPT" ] || fail BINARY_RECEIPT_MISMATCH
  EXPECTED_BINARY_SHA=$(cat "$BINARY_RECEIPT")
  echo "$EXPECTED_BINARY_SHA" | grep -Eq '^[0-9a-f]{64}$' || fail BINARY_RECEIPT_MISMATCH
  ACTUAL_BINARY_SHA=$(binary_sha256 "$STABLE_BIN") || fail CHECKSUM_TOOL_MISSING
  [ "$ACTUAL_BINARY_SHA" = "$EXPECTED_BINARY_SHA" ] || fail BINARY_RECEIPT_MISMATCH
else
  resolve_neo4j_mcp_bin || fail RESOLVE_BINARY_FAILED
  [ -x "$STABLE_BIN" ] || fail RESOLVE_BINARY_FAILED
  ACTUAL_BINARY_SHA=$(binary_sha256 "$STABLE_BIN") || fail CHECKSUM_TOOL_MISSING
  umask 077
  printf '%s\n' "$ACTUAL_BINARY_SHA" > "$BINARY_RECEIPT" || fail BINARY_RECEIPT_WRITE_FAILED
fi

URI="bolt://localhost:$BOLT_PORT"
GUARD_RESULT=$(node "$GUARD" --phase preflight --project-root "$PROJECT_ROOT" --node "$NODE" --launcher "$PROJECT_LAUNCHER" \
  --binary "$STABLE_BIN" --uri "$URI" --database "$DATABASE") || exit 1
printf '%s\n' "$GUARD_RESULT"
case "$GUARD_RESULT" in
  *state=reusable*) ;;
  *)
  node "$WRITER" --project-root "$PROJECT_ROOT" --node "$NODE" --launcher "$PROJECT_LAUNCHER" \
    --binary "$STABLE_BIN" --uri "$URI" --database "$DATABASE" || exit 1
  ;;
esac

IGNORE="$PROJECT_ROOT/.gitignore"
if [ -L "$IGNORE" ]; then fail GITIGNORE_UNSAFE
elif [ -e "$IGNORE" ]; then [ -f "$IGNORE" ] || fail GITIGNORE_UNSAFE
else touch "$IGNORE" || fail GITIGNORE_WRITE_FAILED; fi
for entry in '.codex/config.toml' 'graph-infra/.env' 'graph-infra/bin/' 'graph-infra/cache/'; do grep -Fxq "$entry" "$IGNORE" 2>/dev/null || printf '%s\n' "$entry" >> "$IGNORE" || fail GITIGNORE_WRITE_FAILED; done

DOCKER=$(command -v docker 2>/dev/null || true)
if [ -z "$DOCKER" ]; then
  for candidate in /usr/local/bin/docker /opt/homebrew/bin/docker "$HOME/.docker/bin/docker" /Applications/Docker.app/Contents/Resources/bin/docker; do
    [ -x "$candidate" ] && DOCKER="$candidate" && break
  done
fi
[ -n "$DOCKER" ] || fail DOCKER_CLI_MISSING
"$DOCKER" info >/dev/null 2>&1 || fail DOCKER_DAEMON_DOWN
(cd "$PROJECT_ROOT" && "$DOCKER" compose -f graph-infra/docker-compose.yml up -d) || fail DOCKER_UP_FAILED
CONTAINER="$PROJECT_ID-neo4j"; HEALTH="unknown"; attempts=0
while [ "$attempts" -lt 40 ]; do
  HEALTH=$("$DOCKER" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo absent)
  [ "$HEALTH" = healthy ] && break
  attempts=$((attempts + 1)); sleep 3
done
[ "$HEALTH" = healthy ] || fail CONTAINER_HEALTH_FAILED

export NEO4J_PASSWORD
node "$SCHEMA_RUNNER" --endpoint "http://127.0.0.1:$HTTP_PORT" --database "$DATABASE" || fail SCHEMA_GATE_FAILED
unset NEO4J_PASSWORD

node "$GUARD" --phase readback --project-root "$PROJECT_ROOT" --node "$NODE" --launcher "$PROJECT_LAUNCHER" \
  --binary "$STABLE_BIN" --uri "$URI" --database "$DATABASE" || exit 1
echo "NACL_SKILLS_ONLY_BOOTSTRAP: status=VERIFIED project_id=$PROJECT_ID codex_config=.codex/config.toml mcp=nacl_neo4j next=new-task"

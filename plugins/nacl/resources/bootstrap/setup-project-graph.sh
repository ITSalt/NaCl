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
CONFIRMATION_PREFIX="INIT_LOCAL_GRAPH:$PROJECT_ID:"
case "$CONFIRMATION" in "$CONFIRMATION_PREFIX"*) ;; *) fail CONFIRMATION_REQUIRED ;; esac
CONFIRMATION_HASH=${CONFIRMATION#"$CONFIRMATION_PREFIX"}
echo "$CONFIRMATION_HASH" | grep -Eq '^[0-9a-f]{64}$' || fail CONFIRMATION_REQUIRED

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || fail BUNDLE_PATH_UNAVAILABLE
RESOURCE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P) || fail BUNDLE_PATH_UNAVAILABLE
GUARD="$SCRIPT_DIR/codex-config-guard.mjs"
WRITER="$SCRIPT_DIR/write-codex-mcp-config.mjs"
LAUNCHER_SOURCE="$SCRIPT_DIR/project-neo4j-launcher.mjs"
SUPPLY_SOURCE="$SCRIPT_DIR/neo4j-mcp-supply.mjs"
PIN_SOURCE="$SCRIPT_DIR/neo4j-mcp-release.pin"
SCHEMA_RUNNER="$SCRIPT_DIR/apply-project-schema.mjs"
PREFLIGHT="$SCRIPT_DIR/preflight-project-graph.mjs"
BINARY_INSTALLER="$SCRIPT_DIR/install-pinned-neo4j-mcp.mjs"
ROLLBACK_RUNNER="$SCRIPT_DIR/rollback-project-bootstrap.mjs"
PLAN_RUNNER="$SCRIPT_DIR/plan-project-graph.mjs"
for required in "$GUARD" "$WRITER" "$LAUNCHER_SOURCE" "$SUPPLY_SOURCE" "$PIN_SOURCE" "$SCHEMA_RUNNER" "$PREFLIGHT" "$BINARY_INSTALLER" "$ROLLBACK_RUNNER" "$PLAN_RUNNER" "$SCRIPT_DIR/graph-docker-compose.yml"; do [ -f "$required" ] || fail BUNDLE_RESOURCE_MISSING; done
NODE=$(command -v node 2>/dev/null || command -v nodejs 2>/dev/null) || fail NODE_MISSING
NODE=$("$NODE" -p 'process.execPath') || fail NODE_MISSING
case "$NODE" in /*) ;; *) fail NODE_MISSING ;; esac

GRAPH_DIR="$PROJECT_ROOT/graph-infra"; SCHEMA_DIR="$GRAPH_DIR/schema"; QUERY_DIR="$GRAPH_DIR/queries"; RUNTIME_DIR="$GRAPH_DIR/scripts"
PROJECT_LAUNCHER="$RUNTIME_DIR/nacl-neo4j-mcp-launcher.mjs"
PROJECT_SUPPLY="$RUNTIME_DIR/neo4j-mcp-supply.mjs"
PROJECT_PIN="$RUNTIME_DIR/neo4j-mcp-release.pin"
STABLE_BIN="$GRAPH_DIR/bin/neo4j-mcp"
URI="bolt://localhost:$BOLT_PORT"
"$NODE" "$PREFLIGHT" --project-root "$PROJECT_ROOT" --project-id "$PROJECT_ID" --bolt-port "$BOLT_PORT" --http-port "$HTTP_PORT" \
  --node "$NODE" --launcher "$PROJECT_LAUNCHER" --binary "$STABLE_BIN" --uri "$URI" --database "$DATABASE" || exit 1

DOCKER=$(command -v docker 2>/dev/null || true)
if [ -z "$DOCKER" ]; then
  for candidate in /usr/local/bin/docker /opt/homebrew/bin/docker "$HOME/.docker/bin/docker" /Applications/Docker.app/Contents/Resources/bin/docker; do
    [ -x "$candidate" ] && DOCKER="$candidate" && break
  done
fi
[ -n "$DOCKER" ] || fail DOCKER_CLI_MISSING
"$DOCKER" info >/dev/null 2>&1 || fail DOCKER_DAEMON_DOWN

CONTAINER="$PROJECT_ID-neo4j"; DATA_VOLUME="$PROJECT_ID-neo4j-data"; LOG_VOLUME="$PROJECT_ID-neo4j-logs"; NETWORK="$PROJECT_ID-net"
if "$DOCKER" inspect "$CONTAINER" >/dev/null 2>&1; then CONTAINER_STATE=preexisting; else CONTAINER_STATE=absent; fi
if "$DOCKER" volume inspect "$DATA_VOLUME" >/dev/null 2>&1; then DATA_STATE=preexisting; else DATA_STATE=absent; fi
if "$DOCKER" volume inspect "$LOG_VOLUME" >/dev/null 2>&1; then LOG_STATE=preexisting; else LOG_STATE=absent; fi
if "$DOCKER" network inspect "$NETWORK" >/dev/null 2>&1; then NETWORK_STATE=preexisting; else NETWORK_STATE=absent; fi
if [ -e "$GRAPH_DIR" ]; then GRAPH_STATE=preexisting
else
  GRAPH_STATE=absent
  [ "$CONTAINER_STATE" = absent ] && [ "$DATA_STATE" = absent ] && [ "$LOG_STATE" = absent ] && [ "$NETWORK_STATE" = absent ] || fail DOCKER_RESOURCE_CONFLICT
fi

"$NODE" "$PLAN_RUNNER" --project-root "$PROJECT_ROOT" --project-id "$PROJECT_ID" --bolt-port "$BOLT_PORT" --http-port "$HTTP_PORT" \
  --database "$DATABASE" --verify-token "$CONFIRMATION" || exit 1

TRANSACTION_DIR=$(mktemp -d "${TMPDIR:-/tmp}/nacl-graph-transaction.XXXXXX") || fail TRANSACTION_SNAPSHOT_FAILED
CONFIG_DIR_STATE=absent; CONFIG_STATE=absent; CONFIG_BACKUP="$TRANSACTION_DIR/config.toml"; GITIGNORE_STATE=absent; GITIGNORE_BACKUP="$TRANSACTION_DIR/gitignore"
[ -d "$PROJECT_ROOT/.codex" ] && CONFIG_DIR_STATE=preexisting
if [ -f "$PROJECT_ROOT/.codex/config.toml" ]; then CONFIG_STATE=preexisting; cp "$PROJECT_ROOT/.codex/config.toml" "$CONFIG_BACKUP" || fail TRANSACTION_SNAPSHOT_FAILED; fi
if [ -f "$PROJECT_ROOT/.gitignore" ]; then GITIGNORE_STATE=preexisting; cp "$PROJECT_ROOT/.gitignore" "$GITIGNORE_BACKUP" || fail TRANSACTION_SNAPSHOT_FAILED; fi
MUTATION_STARTED=1

rollback_transaction() {
  rollback_ok=1
  if [ "$CONTAINER_STATE" = absent ] && "$DOCKER" inspect "$CONTAINER" >/dev/null 2>&1; then "$DOCKER" rm -f "$CONTAINER" >/dev/null 2>&1 || rollback_ok=0; fi
  if [ "$NETWORK_STATE" = absent ] && "$DOCKER" network inspect "$NETWORK" >/dev/null 2>&1; then "$DOCKER" network rm "$NETWORK" >/dev/null 2>&1 || rollback_ok=0; fi
  if [ "$DATA_STATE" = absent ] && "$DOCKER" volume inspect "$DATA_VOLUME" >/dev/null 2>&1; then "$DOCKER" volume rm "$DATA_VOLUME" >/dev/null 2>&1 || rollback_ok=0; fi
  if [ "$LOG_STATE" = absent ] && "$DOCKER" volume inspect "$LOG_VOLUME" >/dev/null 2>&1; then "$DOCKER" volume rm "$LOG_VOLUME" >/dev/null 2>&1 || rollback_ok=0; fi
  "$NODE" "$ROLLBACK_RUNNER" --project-root "$PROJECT_ROOT" --graph-state "$GRAPH_STATE" \
    --config-state "$CONFIG_STATE" --config-dir-state "$CONFIG_DIR_STATE" --config-backup "$CONFIG_BACKUP" \
    --gitignore-state "$GITIGNORE_STATE" --gitignore-backup "$GITIGNORE_BACKUP" || rollback_ok=0
  rm -f "$CONFIG_BACKUP" "$GITIGNORE_BACKUP" 2>/dev/null || true
  rmdir "$TRANSACTION_DIR" 2>/dev/null || true
  [ "$rollback_ok" -eq 1 ]
}
fail() {
  code="$1"
  trap - INT TERM HUP
  if rollback_transaction; then
    if { [ "$DATA_STATE" = preexisting ] || [ "$LOG_STATE" = preexisting ]; } && { [ "$code" = SCHEMA_GATE_FAILED ] || [ "$code" = CONFIG_READBACK_FAILED ]; }; then
      echo "NACL_GRAPH_RESULT: status=PARTIALLY_VERIFIED code=$code rollback=BEST_EFFORT removed=new-resources preserved=preexisting-volumes,image-cache" >&2
    else
      echo "NACL_GRAPH_RESULT: status=FAILED code=$code rollback=VERIFIED removed=new-resources preserved=preexisting-resources,image-cache" >&2
    fi
  else
    echo "NACL_GRAPH_RESULT: status=PARTIALLY_VERIFIED code=$code rollback=INCOMPLETE inventory=manual-review-required" >&2
  fi
  exit 1
}
trap 'fail INTERRUPTED' INT TERM HUP

IGNORE="$PROJECT_ROOT/.gitignore"
if [ -L "$IGNORE" ]; then fail GITIGNORE_UNSAFE
elif [ -e "$IGNORE" ]; then [ -f "$IGNORE" ] || fail GITIGNORE_UNSAFE
else touch "$IGNORE" || fail GITIGNORE_WRITE_FAILED; fi
for entry in '.codex/config.toml' 'graph-infra/.env' 'graph-infra/bin/'; do grep -Fxq "$entry" "$IGNORE" 2>/dev/null || printf '%s\n' "$entry" >> "$IGNORE" || fail GITIGNORE_WRITE_FAILED; done

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
copy_exact_or_create "$SCRIPT_DIR/graph-docker-compose.yml" "$GRAPH_DIR/docker-compose.yml" COMPOSE_CONFLICT
for schema in ba-schema sa-schema tl-schema; do
  copy_exact_or_create "$RESOURCE_ROOT/graph-infra/schema/$schema.cypher" "$SCHEMA_DIR/$schema.cypher" SCHEMA_CONFLICT
done
for query in "$RESOURCE_ROOT"/graph-infra/queries/*.cypher; do
  [ -e "$query" ] || continue
  target="$QUERY_DIR/$(basename "$query")"
  copy_exact_or_create "$query" "$target" QUERY_CONFLICT
done

if [ -L "$PROJECT_LAUNCHER" ]; then fail PROJECT_LAUNCHER_CONFLICT
elif [ -e "$PROJECT_LAUNCHER" ]; then
  [ -f "$PROJECT_LAUNCHER" ] || fail PROJECT_LAUNCHER_CONFLICT
  cmp -s "$LAUNCHER_SOURCE" "$PROJECT_LAUNCHER" || fail PROJECT_LAUNCHER_CONFLICT
else
  cp "$LAUNCHER_SOURCE" "$PROJECT_LAUNCHER" || fail PROJECT_LAUNCHER_COPY_FAILED
fi
chmod 600 "$PROJECT_LAUNCHER" 2>/dev/null || fail PROJECT_LAUNCHER_PERMISSIONS_FAILED
copy_exact_or_create "$SUPPLY_SOURCE" "$PROJECT_SUPPLY" PROJECT_SUPPLY_VERIFIER_CONFLICT
copy_exact_or_create "$PIN_SOURCE" "$PROJECT_PIN" PROJECT_RELEASE_PIN_CONFLICT
chmod 600 "$PROJECT_SUPPLY" "$PROJECT_PIN" 2>/dev/null || fail PROJECT_SUPPLY_PERMISSIONS_FAILED

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
"$NODE" "$PROJECT_LAUNCHER" --check-only || fail GRAPH_ENV_VALIDATION_FAILED
[ "${CODEX_BUILDER_TEST_MODE:-0}" != 1 ] || [ "${NACL_SKILLS_ONLY_FAILURE_INJECTION:-}" != after-files ] || fail INJECTED_AFTER_FILES

"$NODE" "$BINARY_INSTALLER" --project-root "$PROJECT_ROOT" || fail BINARY_INSTALL_FAILED
[ -x "$STABLE_BIN" ] || fail BINARY_READBACK_FAILED

GUARD_RESULT=$("$NODE" "$GUARD" --phase preflight --project-root "$PROJECT_ROOT" --node "$NODE" --launcher "$PROJECT_LAUNCHER" \
  --binary "$STABLE_BIN" --uri "$URI" --database "$DATABASE") || fail CODEX_CONFIG_PREFLIGHT_FAILED
printf '%s\n' "$GUARD_RESULT"
case "$GUARD_RESULT" in
  *state=reusable*) ;;
  *)
  "$NODE" "$WRITER" --project-root "$PROJECT_ROOT" --node "$NODE" --launcher "$PROJECT_LAUNCHER" \
    --binary "$STABLE_BIN" --uri "$URI" --database "$DATABASE" || fail CODEX_CONFIG_WRITE_FAILED
  ;;
esac

(cd "$PROJECT_ROOT" && "$DOCKER" compose -f graph-infra/docker-compose.yml up -d) || fail DOCKER_UP_FAILED
HEALTH="unknown"; attempts=0
while [ "$attempts" -lt 40 ]; do
  HEALTH=$("$DOCKER" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo absent)
  [ "$HEALTH" = healthy ] && break
  attempts=$((attempts + 1)); sleep 3
done
[ "$HEALTH" = healthy ] || fail CONTAINER_HEALTH_FAILED
APOC_DIGEST=$($DOCKER exec "$CONTAINER" sha256sum /var/lib/neo4j/plugins/apoc.jar 2>/dev/null | awk '{print $1}') || fail APOC_SUPPLY_VERIFICATION_FAILED
[ "$APOC_DIGEST" = "39092c89df1cb80f4f3d8799821e74c7f1d10503f92625be32882b70b13002fa" ] || fail APOC_SUPPLY_VERIFICATION_FAILED
echo "NACL_APOC_SUPPLY: status=VERIFIED version=5.24.2 digest=$APOC_DIGEST source=pinned-image"

export NEO4J_PASSWORD
"$NODE" "$SCHEMA_RUNNER" --endpoint "http://127.0.0.1:$HTTP_PORT" --database "$DATABASE" || fail SCHEMA_GATE_FAILED
unset NEO4J_PASSWORD

"$NODE" "$GUARD" --phase readback --project-root "$PROJECT_ROOT" --node "$NODE" --launcher "$PROJECT_LAUNCHER" \
  --binary "$STABLE_BIN" --uri "$URI" --database "$DATABASE" || fail CONFIG_READBACK_FAILED
MUTATION_STARTED=0
trap - INT TERM HUP
rm -f "$CONFIG_BACKUP" "$GITIGNORE_BACKUP" 2>/dev/null || true
rmdir "$TRANSACTION_DIR" 2>/dev/null || true
echo "NACL_SKILLS_ONLY_BOOTSTRAP: status=PARTIALLY_VERIFIED code=RESTART_REQUIRED bootstrap=VERIFIED initialization=NOT_RUN project_id=$PROJECT_ID codex_config=.codex/config.toml mcp=nacl_neo4j next=new-task"

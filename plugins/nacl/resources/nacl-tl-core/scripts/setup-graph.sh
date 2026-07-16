#!/bin/sh
# setup-graph.sh — deterministic Neo4j graph infrastructure setup for nacl-init (POSIX: macOS/Linux/WSL2).
#
# Performs nacl-init Step 2c.3–2c.6 without the agent improvising shell:
#   1. Copy docker-compose + schema + queries into <project>/graph-infra/ (byte-preserving).
#   2. Resolve the OFFICIAL neo4j-mcp binary to a stable path (direct GitHub download).
#   3. Write .env / .env.example / .mcp.json as UTF-8 WITHOUT BOM, pointing .mcp.json
#      directly at the resolved binary (no npm launcher → no download-on-start, no STDOUT banner).
#   4. docker compose up, wait healthy, load schema via `docker cp` + `cypher-shell --file`.
#   5. Hard 3-part gate: container healthy AND constraint count == expected AND a one-shot
#      initialize+tools/list JSON-RPC handshake against the binary succeeds.
#
# Prints a machine-parseable result block as the LAST lines of stdout:
#   NACL_GRAPH_RESULT: status=READY|FAILED
#     binary=<path> health=<status> constraints_expected=<n> constraints_actual=<n>
#     handshake=ok|fail failed_check=<name|none>
# Exit code: 0 on READY, non-zero on FAILED.
#
# Usage:
#   setup-graph.sh --project-root DIR --skills-dir DIR --prefix SLUG \
#                  --bolt-port N --http-port N [--password PW] [--database DB]
set -u

PROJECT_ROOT=""; SKILLS_DIR=""; PREFIX=""; BOLT_PORT=""; HTTP_PORT=""
PASSWORD="${NEO4J_PASSWORD:-}"; DATABASE="neo4j"

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --skills-dir)   SKILLS_DIR="$2"; shift 2 ;;
    --prefix)       PREFIX="$2"; shift 2 ;;
    --bolt-port)    BOLT_PORT="$2"; shift 2 ;;
    --http-port)    HTTP_PORT="$2"; shift 2 ;;
    --password)     PASSWORD="$2"; shift 2 ;;
    --database)     DATABASE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

for v in PROJECT_ROOT SKILLS_DIR PREFIX BOLT_PORT HTTP_PORT; do
  eval "val=\$$v"
  if [ -z "$val" ]; then echo "Missing required argument: --$(echo "$v" | tr 'A-Z_' 'a-z-')" >&2; exit 2; fi
done

CONTAINER="$PREFIX-neo4j"
GRAPH_DIR="$PROJECT_ROOT/graph-infra"
SCHEMA_DIR="$GRAPH_DIR/schema"
BIN_DIR="$HOME/.neo4j-mcp-bin"
STABLE_BIN="$BIN_DIR/neo4j-mcp"
CACHE_DIR="$HOME/.cache/neo4j-mcp"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PIN_FILE="$SCRIPT_DIR/neo4j-mcp.pin"
DOCKER=""

FAILED_CHECK="none"
emit_result() {
  status="$1"
  printf '\nNACL_GRAPH_RESULT: status=%s\n' "$status"
  printf '  binary=%s health=%s constraints_expected=%s constraints_actual=%s handshake=%s failed_check=%s\n' \
    "${STABLE_BIN}" "${HEALTH:-unknown}" "${EXPECTED:-0}" "${ACTUAL:-0}" "${HANDSHAKE:-fail}" "$FAILED_CHECK"
}
fail() { FAILED_CHECK="$1"; echo "FAILED at: $1" >&2; emit_result FAILED; exit 1; }

# ---------------------------------------------------------------------------
# 1. Copy infra files (copy-only-if-missing, byte-preserving → preserves no-BOM)
# ---------------------------------------------------------------------------
mkdir -p "$SCHEMA_DIR" "$GRAPH_DIR/queries" "$GRAPH_DIR/boards" || fail copy-mkdir
[ -f "$GRAPH_DIR/docker-compose.yml" ] || cp "$SKILLS_DIR/nacl-tl-core/templates/graph-docker-compose.yml" "$GRAPH_DIR/docker-compose.yml" || fail copy-compose
for s in ba-schema sa-schema tl-schema; do
  [ -f "$SCHEMA_DIR/$s.cypher" ] || cp "$SKILLS_DIR/graph-infra/schema/$s.cypher" "$SCHEMA_DIR/$s.cypher" || fail copy-schema
done
for q in "$SKILLS_DIR"/graph-infra/queries/*.cypher; do
  [ -e "$q" ] || continue
  t="$GRAPH_DIR/queries/$(basename "$q")"
  [ -f "$t" ] || cp "$q" "$t"
done

# ---------------------------------------------------------------------------
# 2. Resolve the official neo4j-mcp binary to a stable path (version-pinned,
#    checksum-verified — see neo4j-mcp.pin next to this script).
# ---------------------------------------------------------------------------
pin_get() {
  # pin_get <key> — echoes the value of key=value from PIN_FILE, or nothing.
  [ -f "$PIN_FILE" ] || return 1
  sed -n "s/^$1=//p" "$PIN_FILE" | head -1
}

sha256_of() {
  # sha256_of <file> — echoes the hex digest, using whichever tool is available.
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}';
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}';
  else echo ""; fi
}

resolve_binary() {
  if [ -x "$STABLE_BIN" ]; then echo "binary: reusing $STABLE_BIN" >&2; return 0; fi
  mkdir -p "$BIN_DIR"

  # Fast path: a previous launcher/run already extracted a cached binary.
  cached=$(ls -1t "$CACHE_DIR"/neo4j-mcp-v* 2>/dev/null | head -1 || true)
  if [ -n "$cached" ] && [ -f "$cached" ]; then
    cp "$cached" "$STABLE_BIN" && chmod +x "$STABLE_BIN" && { echo "binary: from cache $cached" >&2; return 0; }
  fi

  # Determine OS/ARCH using the same convention as the official release assets.
  os_raw=$(uname -s); arch_raw=$(uname -m)
  case "$os_raw" in
    Darwin) os=Darwin; os_key=darwin ;;
    Linux)  os=Linux;  os_key=linux ;;
    *) echo "Unsupported OS for direct download: $os_raw (use setup-graph.ps1 on Windows)" >&2; return 1 ;;
  esac
  case "$arch_raw" in
    x86_64|amd64) arch=x86_64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) echo "Unsupported arch: $arch_raw" >&2; return 1 ;;
  esac
  asset="neo4j-mcp_${os}_${arch}.tar.gz"

  # Version: pinned by default (neo4j-mcp.pin); NEO4J_MCP_VERSION=latest opts out
  # of pinning AND checksum verification (with a loud warning).
  version="${NEO4J_MCP_VERSION:-}"
  skip_checksum=0
  if [ "$version" = "latest" ]; then
    skip_checksum=1
    echo "WARN: NEO4J_MCP_VERSION=latest — resolving the latest release and SKIPPING checksum verification." >&2
  elif [ -z "$version" ]; then
    version=$(pin_get version)
    if [ -z "$version" ] || [ "$version" = "UNPINNED-FILL-ME" ]; then
      echo "neo4j-mcp.pin has no valid 'version' (got: '${version:-<empty>}'). Set NEO4J_MCP_VERSION=<tag> or NEO4J_MCP_VERSION=latest, or fill in $PIN_FILE." >&2
      return 1
    fi
  fi

  dl=""
  if command -v curl >/dev/null 2>&1; then dl="curl -fsSL"; elif command -v wget >/dev/null 2>&1; then dl="wget -qO-"; else
    echo "Neither curl nor wget available to download $asset" >&2; return 1; fi

  if [ "$version" = "latest" ]; then
    echo "binary: querying GitHub for latest release ($asset)..." >&2
    url=$($dl "https://api.github.com/repos/neo4j/mcp/releases/latest" 2>/dev/null \
          | grep -o "https://[^\"]*${asset}" | head -1)
  else
    url="https://github.com/neo4j/mcp/releases/download/${version}/${asset}"
    echo "binary: resolving pinned release $version ($asset)..." >&2
  fi
  [ -n "$url" ] || { echo "Could not find release asset $asset" >&2; return 1; }

  mkdir -p "$CACHE_DIR"
  archive="$CACHE_DIR/$asset"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$archive"; else wget -qO "$archive" "$url"; fi
  if [ ! -s "$archive" ]; then
    echo "Download failed: $url" >&2
    echo "Manual fallback: download $url in a browser, extract it, and place the" >&2
    echo "'neo4j-mcp' binary at $STABLE_BIN (mkdir -p $BIN_DIR first)." >&2
    return 1
  fi

  if [ "$skip_checksum" -ne 1 ]; then
    expected=$(pin_get "sha256_${os_key}_${arch}")
    if [ -z "$expected" ]; then
      echo "No sha256_${os_key}_${arch} entry in $PIN_FILE — cannot verify $asset. Set NEO4J_MCP_VERSION=latest to skip verification, or fill in the pin." >&2
      return 1
    fi
    actual=$(sha256_of "$archive")
    if [ -z "$actual" ]; then
      echo "Neither shasum nor sha256sum available to verify $archive" >&2
      return 1
    fi
    if [ "$actual" != "$expected" ]; then
      echo "Checksum mismatch for $asset: expected $expected, got $actual" >&2
      echo "Manual fallback: download $url in a browser, verify it yourself, extract it, and" >&2
      echo "place the 'neo4j-mcp' binary at $STABLE_BIN (mkdir -p $BIN_DIR first)." >&2
      return 1
    fi
    echo "binary: checksum verified ($asset)" >&2
  fi

  tmp="$CACHE_DIR/extract.$$"; rm -rf "$tmp"; mkdir -p "$tmp"
  tar -xzf "$archive" -C "$tmp" || { echo "tar extract failed" >&2; return 1; }
  found=$(find "$tmp" -type f -name 'neo4j-mcp' | head -1)
  [ -n "$found" ] || { echo "Binary 'neo4j-mcp' not found in archive" >&2; return 1; }
  mv "$found" "$STABLE_BIN" && chmod +x "$STABLE_BIN"
  rm -rf "$tmp"
  echo "binary: installed $STABLE_BIN" >&2
}
resolve_binary || fail resolve-binary
[ -x "$STABLE_BIN" ] || fail resolve-binary

# ---------------------------------------------------------------------------
# 3. Write .env / .env.example / .mcp.json (UTF-8, no BOM — printf never adds one)
# ---------------------------------------------------------------------------
ENV_TEXT="COMPOSE_PROJECT_NAME=$PREFIX-graph
CONTAINER_PREFIX=$PREFIX
NEO4J_PASSWORD=$PASSWORD
NEO4J_HTTP_PORT=$HTTP_PORT
NEO4J_BOLT_PORT=$BOLT_PORT
"
[ -f "$GRAPH_DIR/.env" ]         || printf '%s' "$ENV_TEXT" > "$GRAPH_DIR/.env"
[ -f "$GRAPH_DIR/.env.example" ] || printf '%s' "$ENV_TEXT" > "$GRAPH_DIR/.env.example"

write_mcp_json() {
  mcp="$PROJECT_ROOT/.mcp.json"
  # Escape backslashes for JSON (no-op on POSIX paths, safe regardless).
  esc=$(printf '%s' "$STABLE_BIN" | sed 's/\\/\\\\/g')

  fresh_doc() {
    cat <<JSON
{
  "mcpServers": {
    "neo4j": {
      "type": "stdio",
      "command": "$esc",
      "args": [],
      "env": {
        "NEO4J_URI": "bolt://localhost:$BOLT_PORT",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "$PASSWORD",
        "NEO4J_DATABASE": "$DATABASE",
        "NEO4J_TELEMETRY": "false"
      }
    }
  }
}
JSON
  }

  if [ ! -f "$mcp" ]; then
    fresh_doc > "$mcp"
  elif command -v python3 >/dev/null 2>&1; then
    # Merge the neo4j entry into an existing .mcp.json without clobbering other servers.
    python3 - "$mcp" "$esc" "$BOLT_PORT" "$PASSWORD" "$DATABASE" <<'PY'
import json,sys,io
path,binpath,bolt,pw,db=sys.argv[1:6]
try:
    with open(path,encoding="utf-8-sig") as f: data=json.load(f)
except Exception: data={}
data.setdefault("mcpServers",{})
data["mcpServers"]["neo4j"]={"type":"stdio","command":binpath,"args":[],
  "env":{"NEO4J_URI":f"bolt://localhost:{bolt}","NEO4J_USERNAME":"neo4j",
         "NEO4J_PASSWORD":pw,"NEO4J_DATABASE":db,"NEO4J_TELEMETRY":"false"}}
with io.open(path,"w",encoding="utf-8",newline="\n") as f:
    json.dump(data,f,indent=2,ensure_ascii=False); f.write("\n")
PY
  else
    # Existing .mcp.json but no python3 to merge safely → never clobber other servers.
    # Write the neo4j entry to a sidecar and tell the operator to merge it.
    fresh_doc > "$mcp.neo4j"
    echo "WARN: $mcp exists and python3 is unavailable to merge. Wrote neo4j config to $mcp.neo4j — merge the \"neo4j\" entry into $mcp manually." >&2
  fi
}
write_mcp_json || fail write-mcp-json

# ---------------------------------------------------------------------------
# 4. Resolve Docker (Desktop-app launches often inherit only a partial PATH),
#    make sure the daemon is up, then start it, wait healthy, load schema.
# ---------------------------------------------------------------------------
resolve_docker() {
  if command -v docker >/dev/null 2>&1; then DOCKER=$(command -v docker); return 0; fi
  for c in /usr/local/bin/docker /opt/homebrew/bin/docker "$HOME/.docker/bin/docker" \
           /Applications/Docker.app/Contents/Resources/bin/docker; do
    if [ -x "$c" ]; then DOCKER="$c"; return 0; fi
  done
  return 1
}
resolve_docker || fail docker-cli-missing

wait_for_docker_daemon() {
  if "$DOCKER" info >/dev/null 2>&1; then return 0; fi
  if [ "$(uname -s)" = "Darwin" ] && [ -d /Applications/Docker.app ]; then
    echo "Docker daemon not responding — launching Docker Desktop..." >&2
    open -g -a Docker >/dev/null 2>&1 || true
    i=0
    while [ "$i" -lt 30 ]; do
      "$DOCKER" info >/dev/null 2>&1 && return 0
      echo "waiting for Docker daemon... ($((i*3))s elapsed of 90s)" >&2
      i=$((i+1)); sleep 3
    done
  fi
  "$DOCKER" info >/dev/null 2>&1
}
wait_for_docker_daemon || fail docker-daemon-down

( cd "$PROJECT_ROOT" && "$DOCKER" compose -f graph-infra/docker-compose.yml up -d ) || fail docker-up

HEALTH="unknown"
i=0
while [ "$i" -lt 40 ]; do
  HEALTH=$("$DOCKER" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo "absent")
  [ "$HEALTH" = "healthy" ] && break
  i=$((i+1)); sleep 3
done
[ "$HEALTH" = "healthy" ] || fail container-health

# Load each schema file: BOM-strip a host copy, docker cp it in, then cypher-shell --file.
for s in ba-schema sa-schema tl-schema; do
  src="$SCHEMA_DIR/$s.cypher"
  clean="$CACHE_DIR/$s.clean.cypher"; mkdir -p "$CACHE_DIR"
  sed '1s/^\xEF\xBB\xBF//' "$src" > "$clean" 2>/dev/null || cp "$src" "$clean"
  "$DOCKER" cp "$clean" "$CONTAINER:/tmp/$s.cypher" >/dev/null 2>&1 || fail schema-copy
  # Non-fatal: a re-run hits "constraint already exists" (schema is not IF NOT EXISTS).
  # Gate 2 (constraint count) is the authoritative verdict, so log and continue.
  "$DOCKER" exec "$CONTAINER" cypher-shell -u neo4j -p "$PASSWORD" -d "$DATABASE" --file "/tmp/$s.cypher" >/dev/null 2>&1 \
    || echo "note: $s load reported errors (continuing; gate verifies final state)" >&2
done

# ---------------------------------------------------------------------------
# 5. Hard 3-part gate
# ---------------------------------------------------------------------------
# (gate 1: health already confirmed above)

# gate 2: constraint count == expected (computed dynamically from the schema files)
EXPECTED=$(cat "$SCHEMA_DIR"/ba-schema.cypher "$SCHEMA_DIR"/sa-schema.cypher "$SCHEMA_DIR"/tl-schema.cypher 2>/dev/null | grep -ci 'CREATE CONSTRAINT')
ACTUAL=$("$DOCKER" exec "$CONTAINER" cypher-shell -u neo4j -p "$PASSWORD" -d "$DATABASE" --format plain \
         "SHOW CONSTRAINTS YIELD name RETURN count(name) AS c" 2>/dev/null | tail -1 | tr -dc '0-9')
ACTUAL=${ACTUAL:-0}
[ "$EXPECTED" -gt 0 ] || fail constraints-expected-zero
[ "$ACTUAL" -ge "$EXPECTED" ] || fail constraints-count

# gate 3: initialize + tools/list JSON-RPC handshake against the resolved binary
HANDSHAKE="fail"
run_handshake() {
  reqs='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"nacl-init","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  if command -v timeout >/dev/null 2>&1; then TO="timeout 20"; elif command -v gtimeout >/dev/null 2>&1; then TO="gtimeout 20"; else TO=""; fi
  out=$(printf '%s\n' "$reqs" | NEO4J_URI="bolt://localhost:$BOLT_PORT" NEO4J_USERNAME=neo4j \
        NEO4J_PASSWORD="$PASSWORD" NEO4J_DATABASE="$DATABASE" NEO4J_TELEMETRY=false \
        $TO "$STABLE_BIN" 2>/dev/null)
  echo "$out" | grep -q '"tools"' && return 0
  echo "$out" | grep -q '"result"' && return 0
  return 1
}
if run_handshake; then HANDSHAKE="ok"; else fail handshake; fi

emit_result READY
echo "Graph infrastructure verified: healthy, $ACTUAL/$EXPECTED constraints, handshake ok." >&2
exit 0

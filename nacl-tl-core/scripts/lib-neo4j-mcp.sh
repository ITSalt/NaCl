#!/bin/sh
# lib-neo4j-mcp.sh — shared POSIX helpers for the REMOTE graph paths (connect/create/migrate).
#
# Sourced by connect-remote.sh, create-remote.sh and migrate-to-remote.sh. Provides:
#   resolve_neo4j_mcp_bin   — ensure the official neo4j-mcp binary at a stable path (STABLE_BIN)
#   mcp_cypher_read         — run a read query through the binary via mcp-cypher.mjs (no docker)
#   mcp_cypher_write        — run a write query through the binary via mcp-cypher.mjs
#
# NOTE: setup-graph.sh still carries its own inline copy of the binary resolver (it predates
# this lib and is the tested cross-platform local path). Deduplicating setup-graph against this
# lib is a tracked follow-up — it must not be refactored without a runtime graph test. Keep the
# resolver body here IDENTICAL in behaviour to setup-graph.sh's resolve_binary().
set -u

: "${BIN_DIR:=$HOME/.neo4j-mcp-bin}"
: "${STABLE_BIN:=$BIN_DIR/neo4j-mcp}"
: "${CACHE_DIR:=$HOME/.cache/neo4j-mcp}"

resolve_neo4j_mcp_bin() {
  if [ -x "$STABLE_BIN" ]; then echo "binary: reusing $STABLE_BIN" >&2; return 0; fi
  mkdir -p "$BIN_DIR"

  cached=$(ls -1t "$CACHE_DIR"/neo4j-mcp-v* 2>/dev/null | head -1 || true)
  if [ -n "$cached" ] && [ -f "$cached" ]; then
    cp "$cached" "$STABLE_BIN" && chmod +x "$STABLE_BIN" && { echo "binary: from cache $cached" >&2; return 0; }
  fi

  os_raw=$(uname -s); arch_raw=$(uname -m)
  case "$os_raw" in
    Darwin) os=Darwin ;;
    Linux)  os=Linux ;;
    *) echo "Unsupported OS for direct download: $os_raw (use the .ps1 path on Windows)" >&2; return 1 ;;
  esac
  case "$arch_raw" in
    x86_64|amd64) arch=x86_64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) echo "Unsupported arch: $arch_raw" >&2; return 1 ;;
  esac
  asset="neo4j-mcp_${os}_${arch}.tar.gz"

  dl=""
  if command -v curl >/dev/null 2>&1; then dl="curl -fsSL"; elif command -v wget >/dev/null 2>&1; then dl="wget -qO-"; else
    echo "Neither curl nor wget available to download $asset" >&2; return 1; fi

  echo "binary: querying GitHub for latest release ($asset)..." >&2
  url=$($dl "https://api.github.com/repos/neo4j/mcp/releases/latest" 2>/dev/null \
        | grep -o "https://[^\"]*${asset}" | head -1)
  [ -n "$url" ] || { echo "Could not find release asset $asset" >&2; return 1; }

  mkdir -p "$CACHE_DIR"
  archive="$CACHE_DIR/$asset"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$archive"; else wget -qO "$archive" "$url"; fi
  [ -s "$archive" ] || { echo "Download failed: $url" >&2; return 1; }

  tmp="$CACHE_DIR/extract.$$"; rm -rf "$tmp"; mkdir -p "$tmp"
  tar -xzf "$archive" -C "$tmp" || { echo "tar extract failed" >&2; return 1; }
  found=$(find "$tmp" -type f -name 'neo4j-mcp' | head -1)
  [ -n "$found" ] || { echo "Binary 'neo4j-mcp' not found in archive" >&2; return 1; }
  mv "$found" "$STABLE_BIN" && chmod +x "$STABLE_BIN"
  rm -rf "$tmp"
  echo "binary: installed $STABLE_BIN" >&2
}

# Resolve a node interpreter once (required for the .mjs tools).
_nacl_node() { command -v node 2>/dev/null || command -v nodejs 2>/dev/null; }

# mcp_cypher_read  <skills-dir> <uri> <user> <pw> <db> <query> [param ...]
# Echoes the JSON rows on stdout; returns non-zero on failure.
mcp_cypher_read() {
  _skills="$1"; _uri="$2"; _user="$3"; _pw="$4"; _db="$5"; _query="$6"; shift 6
  _node=$(_nacl_node); [ -n "$_node" ] || { echo "node not found (required for mcp-cypher)" >&2; return 1; }
  set -- "$_node" "$_skills/nacl-tl-core/scripts/mcp-cypher.mjs" \
    --binary "$STABLE_BIN" --uri "$_uri" --user "$_user" --password "$_pw" --database "$_db" --query "$_query" "$@"
  "$@"
}

# mcp_cypher_write  <skills-dir> <uri> <user> <pw> <db> <query> [param ...]
mcp_cypher_write() {
  _skills="$1"; _uri="$2"; _user="$3"; _pw="$4"; _db="$5"; _query="$6"; shift 6
  _node=$(_nacl_node); [ -n "$_node" ] || { echo "node not found (required for mcp-cypher)" >&2; return 1; }
  set -- "$_node" "$_skills/nacl-tl-core/scripts/mcp-cypher.mjs" \
    --binary "$STABLE_BIN" --uri "$_uri" --user "$_user" --password "$_pw" --database "$_db" --query "$_query" --write "$@"
  "$@"
}

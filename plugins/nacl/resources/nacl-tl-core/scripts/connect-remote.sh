#!/bin/sh
# connect-remote.sh — JOIN an already-provisioned shared graph (nacl-init Step 2c, mode=connect).
#
# This is the joiner path. It creates NO Docker infra, loads NO schema, and writes NOTHING to
# the graph. It only: resolves the neo4j-mcp binary, writes the client-side config (.mcp.json +
# config.yaml graph block), registers the project locally, and runs a READ-ONLY verify gate
# (connectivity + the project marker must already exist). If the marker is absent it FAILS LOUD
# — this is the guard that stops a developer from silently attaching to an empty graph and then
# seeding it. The remote endpoint is reached through the developer's local mTLS tunnel sidecar,
# so --uri is a LOCAL bolt socket (e.g. bolt://localhost:3700).
#
# Prints, as the last lines of stdout:
#   NACL_GRAPH_RESULT: status=CONNECTED|FAILED
#     project_scope=<id> handshake=ok|fail project_exists=yes|no failed_check=<name|none>
# Exit 0 on CONNECTED, non-zero on FAILED.
#
# Usage:
#   connect-remote.sh --project-root DIR --skills-dir DIR --uri bolt://localhost:3700 \
#       --project-scope SCOPE --id ID --name "NAME" \
#       --host HOST --gateway-port PORT --sidecar-port PORT \
#       --client-cert FILE --client-key FILE --ca-cert FILE \
#       [--user neo4j] [--database neo4j] [--secret-source env:NEO4J_PASSWORD]
set -u

PROJECT_ROOT=""; SKILLS_DIR=""; URI=""; SCOPE=""; PID=""; PNAME=""
HOST=""; GATEWAY_PORT=""; SIDECAR_PORT=""; CLIENT_CERT=""; CLIENT_KEY=""; CA_CERT=""; TLS="true"; SECRET_SOURCE="env:NEO4J_PASSWORD"
USER_="neo4j"; PASSWORD="${NEO4J_PASSWORD:-}"; DATABASE="neo4j"

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --skills-dir)   SKILLS_DIR="$2"; shift 2 ;;
    --uri)          URI="$2"; shift 2 ;;
    --project-scope) SCOPE="$2"; shift 2 ;;
    --id)           PID="$2"; shift 2 ;;
    --name)         PNAME="$2"; shift 2 ;;
    --host)         HOST="$2"; shift 2 ;;
    --gateway-port) GATEWAY_PORT="$2"; shift 2 ;;
    --sidecar-port) SIDECAR_PORT="$2"; shift 2 ;;
    --client-cert)  CLIENT_CERT="$2"; shift 2 ;;
    --client-key)   CLIENT_KEY="$2"; shift 2 ;;
    --ca-cert)      CA_CERT="$2"; shift 2 ;;
    --tls)          TLS="$2"; shift 2 ;;
    --secret-source) SECRET_SOURCE="$2"; shift 2 ;;
    --user)         USER_="$2"; shift 2 ;;
    --password)     echo "--password is forbidden; use --secret-source env:NEO4J_PASSWORD" >&2; exit 2 ;;
    --database)     DATABASE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
for v in PROJECT_ROOT SKILLS_DIR URI SCOPE PID PNAME HOST GATEWAY_PORT SIDECAR_PORT CLIENT_CERT CLIENT_KEY CA_CERT; do
  eval "val=\$$v"; [ -n "$val" ] || { echo "Missing required argument for connect-remote (--$v)" >&2; exit 2; }
done

. "$SKILLS_DIR/nacl-tl-core/scripts/lib-neo4j-mcp.sh"

HANDSHAKE="fail"; PROJECT_EXISTS="no"; FAILED_CHECK="none"
emit() {
  printf '\nNACL_GRAPH_RESULT: status=%s\n' "$1"
  printf '  project_scope=%s handshake=%s project_exists=%s failed_check=%s\n' \
    "$SCOPE" "$HANDSHAKE" "$PROJECT_EXISTS" "$FAILED_CHECK"
}
fail() { FAILED_CHECK="$1"; echo "FAILED at: $1" >&2; emit FAILED; exit 1; }

NODE=$(command -v node 2>/dev/null || command -v nodejs 2>/dev/null)
[ -n "$NODE" ] || fail node-missing
PASSWORD=$("$NODE" "$SKILLS_DIR/nacl-tl-core/scripts/secret-source-contract.mjs" --resolve "$SECRET_SOURCE") || fail secret-source-unavailable
"$NODE" "$SKILLS_DIR/nacl-tl-core/scripts/remote-route-contract.mjs" \
  --mode connect --host "$HOST" --gateway-port "$GATEWAY_PORT" --sidecar-port "$SIDECAR_PORT" \
  --project-scope "$SCOPE" --client-cert "$CLIENT_CERT" --client-key "$CLIENT_KEY" \
  --ca-cert "$CA_CERT" --tls "$TLS" --uri "$URI" --username "$USER_" --database "$DATABASE" \
  --secret-source "$SECRET_SOURCE" >/dev/null || fail route-contract
resolve_neo4j_mcp_bin || fail resolve-binary
[ -x "$STABLE_BIN" ] || fail resolve-binary

# Verify gate (READ-ONLY): connectivity + project marker must exist.
OUT=$(mcp_cypher_read "$SKILLS_DIR" "$URI" "$USER_" "$PASSWORD" "$DATABASE" \
      'MATCH (p:Project {id:$projectScope}) RETURN count(p) AS c' \
      --param "projectScope=$SCOPE" 2>/dev/null) || fail handshake
HANDSHAKE="ok"
# rows look like [{"c":1}] — treat any non-zero count as "exists"
echo "$OUT" | grep -qE '"c"[: ]*[1-9]' && PROJECT_EXISTS="yes"
if [ "$PROJECT_EXISTS" != "yes" ]; then
  echo "Remote graph has no project '$SCOPE'." >&2
  echo "Either the endpoint/scope is wrong, or the project was never provisioned —" >&2
  echo "the first developer must run:  /nacl-init --scale=create" >&2
  fail project-missing
fi

# Commit config.yaml + .mcp.json as one validated route transaction.
"$NODE" "$SKILLS_DIR/nacl-tl-core/scripts/write-remote-route.mjs" \
  --project-root "$PROJECT_ROOT" --mode connect --host "$HOST" --gateway-port "$GATEWAY_PORT" \
  --sidecar-port "$SIDECAR_PORT" --project-scope "$SCOPE" --client-cert "$CLIENT_CERT" \
  --client-key "$CLIENT_KEY" --ca-cert "$CA_CERT" --tls "$TLS" --uri "$URI" \
  --username "$USER_" --database "$DATABASE" --secret-source "$SECRET_SOURCE" \
  --launcher-command "$NODE" --launcher-script "$SKILLS_DIR/nacl-tl-core/scripts/secret-source-launcher.mjs" \
  --binary "$STABLE_BIN" >/dev/null || fail write-route

"$NODE" "$SKILLS_DIR/nacl-tl-core/scripts/register-project.mjs" \
  --id "$PID" --name "$PNAME" --root "$PROJECT_ROOT" >/dev/null || fail register

emit CONNECTED
echo "Connected to existing remote project '$SCOPE' (no Docker, no seed)." >&2
exit 0

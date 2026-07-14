#!/bin/sh
# create-remote.sh — PROVISION a shared project inside an already-running VPS graph
#                    (nacl-init Step 2c, mode=create). Run ONCE by the first developer.
#
# Assumes the VPS Neo4j + mTLS gateway are already up (see provision-vps.sh, which also loads
# the ba/sa/tl schema constraints into the database). This client-side step is idempotent: it
# MERGEs the (:Project {id}) marker (never DETACH DELETE, never reset), then writes the same
# client config as connect-remote and registers the project. Re-running is a safe no-op.
#
# Prints, as the last lines of stdout:
#   NACL_GRAPH_RESULT: status=READY|FAILED
#     project_scope=<id> handshake=ok|fail seeded=yes|no failed_check=<name|none>
# Exit 0 on READY, non-zero on FAILED.
#
# Usage:
#   create-remote.sh --project-root DIR --skills-dir DIR --uri bolt://localhost:3700 \
#       --project-scope SCOPE --id ID --name "NAME" --developer-id DEV \
#       [--user neo4j] [--password PW] [--database neo4j]
set -u

PROJECT_ROOT=""; SKILLS_DIR=""; URI=""; SCOPE=""; PID=""; PNAME=""; DEV=""
USER_="neo4j"; PASSWORD="${NEO4J_PASSWORD:-}"; DATABASE="neo4j"

while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --skills-dir)   SKILLS_DIR="$2"; shift 2 ;;
    --uri)          URI="$2"; shift 2 ;;
    --project-scope) SCOPE="$2"; shift 2 ;;
    --id)           PID="$2"; shift 2 ;;
    --name)         PNAME="$2"; shift 2 ;;
    --developer-id) DEV="$2"; shift 2 ;;
    --user)         USER_="$2"; shift 2 ;;
    --password)     PASSWORD="$2"; shift 2 ;;
    --database)     DATABASE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
for v in PROJECT_ROOT SKILLS_DIR URI SCOPE PID PNAME; do
  eval "val=\$$v"; [ -n "$val" ] || { echo "Missing required argument for create-remote (--$v)" >&2; exit 2; }
done
[ -n "$DEV" ] || DEV="$(git -C "$PROJECT_ROOT" config user.email 2>/dev/null || echo "${USER:-unknown}@$(hostname 2>/dev/null || echo host)")"

. "$SKILLS_DIR/nacl-tl-core/scripts/lib-neo4j-mcp.sh"

HANDSHAKE="fail"; SEEDED="no"; FAILED_CHECK="none"
emit() {
  printf '\nNACL_GRAPH_RESULT: status=%s\n' "$1"
  printf '  project_scope=%s handshake=%s seeded=%s failed_check=%s\n' \
    "$SCOPE" "$HANDSHAKE" "$SEEDED" "$FAILED_CHECK"
}
fail() { FAILED_CHECK="$1"; echo "FAILED at: $1" >&2; emit FAILED; exit 1; }

NODE=$(command -v node 2>/dev/null || command -v nodejs 2>/dev/null)
[ -n "$NODE" ] || fail node-missing
resolve_neo4j_mcp_bin || fail resolve-binary
[ -x "$STABLE_BIN" ] || fail resolve-binary

# Idempotent seed of the project marker (MERGE — never destructive).
mcp_cypher_write "$SKILLS_DIR" "$URI" "$USER_" "$PASSWORD" "$DATABASE" \
  "MERGE (p:Project {id:'$SCOPE'}) ON CREATE SET p.created_by='$DEV', p.created_at=datetime() SET p.updated_by='$DEV', p.updated_at=datetime() RETURN p.id AS id" \
  >/dev/null 2>&1 || fail seed-marker
HANDSHAKE="ok"

# Verify the marker is now present (read-back).
OUT=$(mcp_cypher_read "$SKILLS_DIR" "$URI" "$USER_" "$PASSWORD" "$DATABASE" \
      "MATCH (p:Project {id:'$SCOPE'}) RETURN count(p) AS c" 2>/dev/null) || fail verify
echo "$OUT" | grep -qE '"c"[: ]*[1-9]' && SEEDED="yes"
[ "$SEEDED" = "yes" ] || fail verify

# Write client config + register (same as connect).
"$NODE" "$SKILLS_DIR/nacl-tl-core/scripts/write-mcp-config.mjs" \
  --project-root "$PROJECT_ROOT" --command "$STABLE_BIN" \
  --uri "$URI" --username "$USER_" --password "$PASSWORD" --database "$DATABASE" >/dev/null || fail write-mcp

"$NODE" "$SKILLS_DIR/nacl-tl-core/scripts/write-graph-config.mjs" \
  --project-root "$PROJECT_ROOT" --mode remote \
  --set "neo4j_uri=\"$URI\"" --set "neo4j_username=\"$USER_\"" \
  --set "neo4j_database=\"$DATABASE\"" --set "project_scope=\"$SCOPE\"" >/dev/null || fail write-config

"$NODE" "$SKILLS_DIR/nacl-tl-core/scripts/register-project.mjs" \
  --id "$PID" --name "$PNAME" --root "$PROJECT_ROOT" >/dev/null || fail register

emit READY
echo "Provisioned remote project '$SCOPE' (marker seeded; schema is loaded VPS-side)." >&2
exit 0

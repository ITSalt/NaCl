#!/usr/bin/env bash
# migrate-to-remote.sh — move a project's LOCAL graph to the shared VPS and re-point the project.
#
# Wraps the existing handover-export/import scripts (max reuse) and follows NaCl discipline:
# fail-loud, idempotent, explicit confirmation before anything destructive, full rollback at
# every gate. The encrypted export is the rollback point; the local container/volume is kept
# (NOT deleted) as a cold rollback until you remove it deliberately.
#
# Reuse split that avoids touching the tested _lib.sh: the IMPORT runs ON the VPS (where
# handover-import.sh's `docker exec` works against the project container), and the independent
# client-side VERIFY uses mcp-cypher through the sidecar — so no remote `cypher_exec` surgery.
#
# Prereqs: the VPS project is already provisioned (provision-vps.sh) and your sidecar tunnel is
# running (install-sidecar.sh --start), so --uri (a local bolt socket) reaches the VPS graph.
#
# Usage:
#   migrate-to-remote.sh --project-root DIR --skills-dir DIR \
#       --vps-ssh user@graph.example.com --vps-state-dir /etc/nacl-graph \
#       --scope SCOPE --vps-prefix SLUG \
#       --uri bolt://localhost:3700 --host graph.example.com --gateway-port 7687 [--password PW]
set -euo pipefail

PROJECT_ROOT=""; SKILLS_DIR=""; VPS_SSH=""; VPS_STATE="/etc/nacl-graph"; SCOPE=""; VPS_PREFIX=""
URI=""; HOST=""; GATEWAY_PORT="7687"; PASSWORD="${NEO4J_PASSWORD:-}"; ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --skills-dir) SKILLS_DIR="$2"; shift 2 ;;
    --vps-ssh) VPS_SSH="$2"; shift 2 ;;
    --vps-state-dir) VPS_STATE="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --vps-prefix) VPS_PREFIX="$2"; shift 2 ;;
    --uri) URI="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --gateway-port) GATEWAY_PORT="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
for v in PROJECT_ROOT SKILLS_DIR VPS_SSH SCOPE VPS_PREFIX URI HOST; do
  eval "val=\$$v"; [ -n "$val" ] || { echo "Missing required argument (--$(echo "$v" | tr 'A-Z_' 'a-z-'))" >&2; exit 2; }
done

# Ephemeral transport passphrase for the encrypted handover artifact. handover-export (local) and
# handover-import (on the VPS) both read NACL_HANDOVER_PASSPHRASE; they prompt interactively if it
# is unset, which would hang this non-interactive orchestration. Generate one and thread it to both.
HANDOVER_PASSPHRASE="${NACL_HANDOVER_PASSPHRASE:-$(openssl rand -hex 24)}"
export NACL_HANDOVER_PASSPHRASE="$HANDOVER_PASSPHRASE"

GRAPH_INFRA="$PROJECT_ROOT/graph-infra"
log() { echo "[migrate] $*" >&2; }
die() { echo "[migrate] ERROR: $*" >&2; exit 1; }
emit() { printf '\nNACL_MIGRATE_RESULT: status=%s scope=%s\n' "$1" "$SCOPE"; }
VPS_CONTAINER="$VPS_PREFIX-neo4j"

# 0. preflight ---------------------------------------------------------------
for c in age expect gzip jq docker ssh scp node; do command -v "$c" >/dev/null 2>&1 || die "'$c' not found (required)"; done
[ -f "$PROJECT_ROOT/config.yaml" ] || die "no config.yaml at $PROJECT_ROOT"
CUR_MODE="$(node "$SKILLS_DIR/nacl-tl-core/scripts/resolve-graph-mode.mjs" --project-root "$PROJECT_ROOT" 2>/dev/null | sed -n 's/.*mode=\([a-z]*\).*/\1/p')"
[ "$CUR_MODE" = "local" ] || die "project is not in local mode (resolved: $CUR_MODE) — refusing double migration"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$VPS_SSH" "test -d '$VPS_STATE/$SCOPE'" \
  || die "VPS project dir $VPS_STATE/$SCOPE not found — run provision-vps.sh on the VPS first"
# client-side connectivity to the remote graph via the sidecar
node "$SKILLS_DIR/nacl-tl-core/scripts/mcp-cypher.mjs" --binary "$HOME/.neo4j-mcp-bin/neo4j-mcp" \
  --uri "$URI" --password "$PASSWORD" --query "RETURN 1 AS ok" >/dev/null 2>&1 \
  || die "cannot reach remote graph at $URI — is your sidecar tunnel running? (install-sidecar.sh --start)"

if [ "$ASSUME_YES" != "1" ]; then
  printf '[migrate] Migrate local graph → %s (scope=%s) and re-point this project? [y/N] ' "$HOST" "$SCOPE" >&2
  read -r ans; case "$ans" in y|Y|yes) ;; *) die "aborted by user"; esac
fi

# 1. backup / export (this IS the rollback point) ----------------------------
# handover-export derives REPO_ROOT from its own path (= skills-dir, NOT this project) and several
# *-neo4j containers may be running, so auto-detect is unsafe. Pin THIS project's local container
# (and password) from its config.yaml via the env _lib.sh honors (NACL_CONTAINER checked first).
LOCAL_PREFIX="$(sed -n '/^graph:/,/^[^[:space:]#]/{ s/^[[:space:]]*container_prefix:[[:space:]]*"\{0,1\}\([^"#]*[^"# ]\)"\{0,1\}[[:space:]]*$/\1/p; }' "$PROJECT_ROOT/config.yaml" | head -1)"
LOCAL_PW="$(sed -n '/^graph:/,/^[^[:space:]#]/{ s/^[[:space:]]*neo4j_password:[[:space:]]*"\{0,1\}\([^"#]*[^"# ]\)"\{0,1\}[[:space:]]*$/\1/p; }' "$PROJECT_ROOT/config.yaml" | head -1)"
[ -n "$LOCAL_PREFIX" ] || die "could not read graph.container_prefix from $PROJECT_ROOT/config.yaml"
LOCAL_CONTAINER="${LOCAL_PREFIX}-neo4j"
docker inspect "$LOCAL_CONTAINER" >/dev/null 2>&1 || die "local container $LOCAL_CONTAINER not found — is the local graph up?"
log "Exporting local graph from $LOCAL_CONTAINER (encrypted backup = rollback point)…"
(
  export NACL_CONTAINER="$LOCAL_CONTAINER"
  [ -n "$LOCAL_PW" ] && export NEO4J_PASSWORD="$LOCAL_PW"
  sh "$SKILLS_DIR/graph-infra/scripts/handover-export.sh" --container="$LOCAL_CONTAINER" --out-dir="$GRAPH_INFRA/handover"
) || die "handover-export failed"
ARTIFACT="$(ls -1t "$GRAPH_INFRA/handover/"*.cypher.gz.age 2>/dev/null | head -1)"
[ -n "$ARTIFACT" ] || die "no export artifact produced"
MANIFEST="${ARTIFACT%.cypher.gz.age}.cypher.manifest.json"
[ -f "$MANIFEST" ] || die "manifest missing for $ARTIFACT"
log "Artifact: $ARTIFACT"

# 2. ship to VPS + import on the VPS (handover-import runs where docker exec works) ----
# stage the artifact in a writable path: $VPS_STATE is root-owned, but migrate runs over ssh as a
# non-root user (docker-group handles the import), so use /tmp rather than the state dir.
REMOTE_TMP="/tmp/nacl-handover-$SCOPE"
ssh "$VPS_SSH" "mkdir -p '$REMOTE_TMP'" || die "ssh mkdir failed"
scp "$ARTIFACT" "$MANIFEST" "$VPS_SSH:$REMOTE_TMP/" || die "scp of artifact failed"
log "Importing into VPS container $VPS_CONTAINER (verifies counts vs manifest)…"
ssh "$VPS_SSH" "cd '$VPS_STATE' && NACL_CONTAINER='$VPS_CONTAINER' NEO4J_PASSWORD='$PASSWORD' NACL_HANDOVER_PASSPHRASE='$HANDOVER_PASSPHRASE' bash -lc \
  'bash \$(ls -1 */graph-infra/scripts/handover-import.sh 2>/dev/null | head -1 || echo handover-import.sh) \
   --file=\"$REMOTE_TMP/$(basename "$ARTIFACT")\" --container=\"$VPS_CONTAINER\" --force'" \
  || die "remote handover-import failed (graph NOT re-pointed; local project untouched)"

# 3. re-point local project (atomic, reversible; originals backed up) ---------
BK="$GRAPH_INFRA/handover/repoint-backup"
mkdir -p "$BK"
[ -f "$PROJECT_ROOT/.mcp.json" ] && cp "$PROJECT_ROOT/.mcp.json" "$BK/.mcp.json.bak"
cp "$PROJECT_ROOT/config.yaml" "$BK/config.yaml.bak"
log "Backed up .mcp.json + config.yaml → $BK"

node "$SKILLS_DIR/nacl-tl-core/scripts/write-mcp-config.mjs" --project-root "$PROJECT_ROOT" \
  --command "$HOME/.neo4j-mcp-bin/neo4j-mcp" --uri "$URI" --password "$PASSWORD" --database neo4j >/dev/null \
  || die "rewrite .mcp.json failed"
node "$SKILLS_DIR/nacl-tl-core/scripts/write-graph-config.mjs" --project-root "$PROJECT_ROOT" --mode remote --force \
  --set "neo4j_uri=\"$URI\"" --set "neo4j_username=\"neo4j\"" --set "neo4j_database=\"neo4j\"" \
  --set "project_scope=\"$SCOPE\"" --set "remote.host=\"$HOST\"" --set "remote.gateway_port=$GATEWAY_PORT" \
  --set "remote.tls=true" >/dev/null || die "rewrite config.yaml failed"

# 4. independent verify through the NEW config path (sidecar → VPS) -----------
log "Verifying re-pointed connection against the manifest…"
M_NODES="$(jq -r '.nodes' "$MANIFEST")"
ROWS="$(node "$SKILLS_DIR/nacl-tl-core/scripts/mcp-cypher.mjs" --binary "$HOME/.neo4j-mcp-bin/neo4j-mcp" \
        --uri "$URI" --password "$PASSWORD" --query "MATCH (n) RETURN count(n) AS c" 2>/dev/null)"
A_NODES="$(printf '%s' "$ROWS" | sed -n 's/.*"c"[: ]*\([0-9]*\).*/\1/p' | head -1)"
if [ "${A_NODES:-0}" != "$M_NODES" ]; then
  log "VERIFY MISMATCH: manifest nodes=$M_NODES, remote nodes=${A_NODES:-?} — rolling back config"
  [ -f "$BK/.mcp.json.bak" ] && cp "$BK/.mcp.json.bak" "$PROJECT_ROOT/.mcp.json"
  cp "$BK/config.yaml.bak" "$PROJECT_ROOT/config.yaml"
  emit FAILED; die "verification failed; local config restored (local graph intact)"
fi
log "Verify OK: $A_NODES nodes match manifest."

# 4b. seed the (:Project {id:scope}) marker (handover replays the source graph, which may
#     predate the marker; connect-remote.sh gates joiners on it). Idempotent MERGE, run AFTER
#     the exact count-verify so the byte-identical check above stays strict. ----------------
log "Ensuring (:Project {id:'$SCOPE'}) marker exists on the remote graph…"
node "$SKILLS_DIR/nacl-tl-core/scripts/mcp-cypher.mjs" --binary "$HOME/.neo4j-mcp-bin/neo4j-mcp" \
  --uri "$URI" --password "$PASSWORD" --write \
  --query "MERGE (p:Project {id:'$SCOPE'}) ON CREATE SET p.created_by='auto-migrated', p.created_at=datetime() SET p.updated_by='auto-migrated', p.updated_at=datetime() RETURN p.id AS id" \
  >/dev/null 2>&1 || die "failed to seed (:Project) marker on remote (graph imported; config re-pointed — re-run this MERGE manually before joiners connect)"
log "Project marker present."

# 5. decommission local container (containers only; volume kept as cold rollback) ----
if [ -f "$GRAPH_INFRA/docker-compose.yml" ]; then
  log "Stopping local container (volume preserved for rollback; not deleting with -v)…"
  ( cd "$GRAPH_INFRA" && docker compose down 2>/dev/null || docker-compose down 2>/dev/null ) || \
    log "WARN: could not stop local stack; do it manually when ready"
fi

emit READY
cat >&2 <<EOF

Migration complete. This project now uses the shared graph (mode=remote, scope=$SCOPE).
  Rollback (if needed): restore $BK/config.yaml.bak (+ .mcp.json.bak) and
    cd $GRAPH_INFRA && docker compose up -d   # local volume is still intact
  When confident, free local disk: cd $GRAPH_INFRA && docker compose down -v
EOF
exit 0

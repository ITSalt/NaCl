#!/usr/bin/env bash
# provision-vps.sh — turnkey provisioning of a SHARED, internet-reachable Neo4j on a VPS.
#
# Run ON the VPS (or over ssh from the owner's machine). Idempotent and fail-loud. Stands up,
# for one project, everything needed for multi-user NaCl over the public internet:
#   1. preflight (docker, openssl; domain; firewall tool)
#   2. private CA (one CA signs the gateway server cert AND all client certs)
#   3. gateway server cert (signed by our CA — no Let's Encrypt needed for mTLS)
#   4. per-project Neo4j + ghostunnel mTLS gateway (graph-docker-compose.vps.yml)
#   5. load ba/sa/tl schema constraints into the database (docker exec cypher-shell)
#   6. firewall: default-deny inbound, allow ssh + the gateway port only
#   7. issue the FIRST developer's client cert
#   8. hard gate → NACL_VPS_RESULT: status=READY|FAILED
#
# Usage:
#   provision-vps.sh --skills-dir DIR --host graph.example.com --project-scope SCOPE \
#       --prefix SLUG --gateway-port 7687 --first-developer DEV-ID \
#       [--state-dir /etc/nacl-graph] [--no-firewall]
set -euo pipefail

SKILLS_DIR=""; HOST=""; SCOPE=""; PREFIX=""; GATEWAY_PORT="7687"; FIRST_DEV=""
STATE_DIR="/etc/nacl-graph"; DO_FIREWALL=1
while [ $# -gt 0 ]; do
  case "$1" in
    --skills-dir) SKILLS_DIR="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --project-scope) SCOPE="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --gateway-port) GATEWAY_PORT="$2"; shift 2 ;;
    --first-developer) FIRST_DEV="$2"; shift 2 ;;
    --state-dir) STATE_DIR="$2"; shift 2 ;;
    --no-firewall) DO_FIREWALL=0; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
for v in SKILLS_DIR HOST SCOPE PREFIX FIRST_DEV; do
  eval "val=\$$v"; [ -n "$val" ] || { echo "Missing required argument (--$(echo "$v" | tr 'A-Z_' 'a-z-'))" >&2; exit 2; }
done

FAILED_CHECK="none"
emit() { printf '\nNACL_VPS_RESULT: status=%s\n  host=%s scope=%s gateway_port=%s ca=%s failed_check=%s\n' \
  "$1" "$HOST" "$SCOPE" "$GATEWAY_PORT" "${CA_DIR:-?}" "$FAILED_CHECK"; }
fail() { FAILED_CHECK="$1"; echo "FAILED at: $1" >&2; emit FAILED; exit 1; }

# 1. preflight
command -v docker >/dev/null 2>&1 || fail need-docker
docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 || fail need-compose
command -v openssl >/dev/null 2>&1 || fail need-openssl
command -v node >/dev/null 2>&1 || fail need-node
DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"

GRAPH_DIR="$STATE_DIR/$SCOPE"
CERT_DIR="$GRAPH_DIR/certs"
export CA_DIR="$STATE_DIR/ca"
mkdir -p "$GRAPH_DIR" "$CERT_DIR" || fail mkdir

# 2 + 3. CA and gateway server cert
# shellcheck source=/dev/null
. "$SKILLS_DIR/graph-infra/vps/lib-ca.sh"
ensure_ca || fail ca
issue_server_cert "$HOST" "$CERT_DIR" || fail server-cert
cp "$CA_DIR/crl.pem" "$CERT_DIR/crl.pem" 2>/dev/null || gen_crl && cp "$CA_DIR/crl.pem" "$CERT_DIR/crl.pem"

# 4. write .env + compose, bring the stack up
PASSWORD_FILE="$GRAPH_DIR/.neo4j-password"
if [ ! -f "$PASSWORD_FILE" ]; then openssl rand -hex 24 > "$PASSWORD_FILE"; chmod 600 "$PASSWORD_FILE"; fi
NEO4J_PASSWORD="$(cat "$PASSWORD_FILE")"
cat > "$GRAPH_DIR/.env" <<EOF
COMPOSE_PROJECT_NAME=$PREFIX-graph
CONTAINER_PREFIX=$PREFIX
NEO4J_PASSWORD=$NEO4J_PASSWORD
GATEWAY_PORT=$GATEWAY_PORT
EOF
chmod 600 "$GRAPH_DIR/.env"
cp "$SKILLS_DIR/nacl-tl-core/templates/graph-docker-compose.vps.yml" "$GRAPH_DIR/docker-compose.yml" || fail copy-compose

# Register the project/port atomically, then grant the first principal at the SERVER boundary.
# trusted-cns is authoritative; every project allowed-cns file is only its generated projection.
ACCESS_CONTROL="$SKILLS_DIR/graph-infra/vps/server-access-control.mjs"
node "$ACCESS_CONTROL" provision --state-dir "$STATE_DIR" --server-id "$HOST" \
  --scope "$SCOPE" --port "$GATEWAY_PORT" >/dev/null || fail server-register
node "$ACCESS_CONTROL" grant --state-dir "$STATE_DIR" --server-id "$HOST" \
  --cn "$FIRST_DEV" >/dev/null || fail server-grant
render_gateway_allowlist "$GRAPH_DIR" || fail render-allowlist

CONTAINER="$PREFIX-neo4j"
( cd "$GRAPH_DIR" && $DC up -d ) || fail compose-up

# wait for neo4j healthy
i=0; HEALTH="starting"
while [ $i -lt 40 ]; do
  HEALTH="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)"
  [ "$HEALTH" = "healthy" ] && break
  i=$((i+1)); sleep 3
done
[ "$HEALTH" = "healthy" ] || fail container-health

# 5. load schema constraints (idempotent — CREATE CONSTRAINT IF NOT EXISTS in the .cypher files)
for s in ba-schema sa-schema tl-schema; do
  f="$SKILLS_DIR/graph-infra/schema/$s.cypher"
  [ -f "$f" ] || continue
  docker cp "$f" "$CONTAINER:/tmp/$s.cypher" || fail schema-copy
  docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASSWORD" -d neo4j --file "/tmp/$s.cypher" \
    || fail schema-load
done

# 6. firewall (best-effort, default-deny + ssh + gateway)
if [ "$DO_FIREWALL" = "1" ] && command -v ufw >/dev/null 2>&1; then
  ufw --force default deny incoming || true
  ufw --force default allow outgoing || true
  ufw allow 22/tcp || true
  ufw allow "${GATEWAY_PORT}/tcp" || true
  ufw --force enable || true
  echo "firewall: default-deny, allow 22 + $GATEWAY_PORT" >&2
else
  echo "firewall: skipped (no ufw or --no-firewall) — ensure only 22 + $GATEWAY_PORT are open" >&2
fi

# 7. first developer's client cert
issue_client_cert "$FIRST_DEV" "$STATE_DIR/clients/$FIRST_DEV" || fail first-client-cert
echo "First client cert for '$FIRST_DEV' → $STATE_DIR/clients/$FIRST_DEV/ (deliver securely)" >&2

# 8. gate: gateway port listening
if command -v ss >/dev/null 2>&1; then
  ss -ltn 2>/dev/null | grep -q ":$GATEWAY_PORT " || fail gateway-listen
fi

emit READY
cat >&2 <<EOF

Shared graph READY.
  Endpoint (give teammates):  host=$HOST gateway_port=$GATEWAY_PORT project_scope=$SCOPE
  Client certs (the "API keys") are under $STATE_DIR/clients/<dev-id>/ — issue more with:
    issue-client-cert.sh <dev-id>
  Revoke with:
    revoke-client-cert.sh <dev-id>
EOF
exit 0

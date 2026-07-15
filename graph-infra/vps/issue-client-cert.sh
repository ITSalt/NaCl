#!/usr/bin/env bash
# issue-client-cert.sh — mint a personal client certificate (a developer's "API key").
#
# Run on the VPS / CA host. Produces client.crt + client.key + ca.crt under
# <state-dir>/clients/<dev-id>/, plus a ready-to-run sidecar hint. Deliver the bundle to the
# developer over a secure channel; they install it with graph-infra/scripts/install-sidecar.sh.
#
#   issue-client-cert.sh <developer-id> [--state-dir /etc/nacl-graph] \
#       --server-id graph.example.com [--host graph.example.com] [--gateway-port 7687]
# The grant is server-wide: every registered project gateway is reconciled before success.
set -euo pipefail

DEV="${1:-}"; shift || true
[ -n "$DEV" ] || { echo "usage: issue-client-cert.sh <developer-id> [--state-dir DIR] [--host H] [--gateway-port N] [--scope SCOPE] [--prefix SLUG]" >&2; exit 2; }
case "$DEV" in --*) echo "developer-id must be the first argument" >&2; exit 2 ;; esac

STATE_DIR="/etc/nacl-graph"; HOST=""; SERVER_ID=""; GATEWAY_PORT="7687"; SCOPE=""; PREFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --state-dir) STATE_DIR="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --server-id) SERVER_ID="$2"; shift 2 ;;
    --gateway-port) GATEWAY_PORT="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

export CA_DIR="$STATE_DIR/ca"
[ -n "$SERVER_ID" ] || SERVER_ID="$HOST"
[ -n "$SERVER_ID" ] || { echo "ERROR: --server-id (or --host) is required for server-wide grant" >&2; exit 2; }
[ -f "$CA_DIR/ca.crt" ] || { echo "ERROR: no CA at $CA_DIR — run provision-vps.sh first" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/lib-ca.sh"

OUT="$STATE_DIR/clients/$DEV"
issue_client_cert "$DEV" "$OUT"

# Grant once at the server boundary, project every gateway, then reload every gateway.
ACCESS_CONTROL="$HERE/server-access-control.mjs"
node "$ACCESS_CONTROL" grant --state-dir "$STATE_DIR" --server-id "$SERVER_ID" --cn "$DEV" >/dev/null \
  || { echo "ERROR: server-wide grant rolled back" >&2; exit 1; }
GW_APPLIED="yes"; DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
for compose in "$STATE_DIR"/*/docker-compose.yml; do
  [ -f "$compose" ] || continue
  GRAPH_DIR="$(dirname "$compose")"
  render_gateway_allowlist "$GRAPH_DIR" || GW_APPLIED="no"
  ( cd "$GRAPH_DIR" && $DC up -d ) || GW_APPLIED="no"
done
if [ "$GW_APPLIED" != "yes" ]; then
  node "$ACCESS_CONTROL" revoke --state-dir "$STATE_DIR" --server-id "$SERVER_ID" --cn "$DEV" >/dev/null 2>&1 || true
  for compose in "$STATE_DIR"/*/docker-compose.yml; do
    [ -f "$compose" ] || continue; GRAPH_DIR="$(dirname "$compose")"
    render_gateway_allowlist "$GRAPH_DIR" || true; ( cd "$GRAPH_DIR" && $DC up -d ) || true
  done
  echo "ERROR: server-wide gateway reload failed; grant was rolled back" >&2
  printf '\nNACL_CERT_RESULT: status=BLOCKED dev=%s out=%s gateway_applied=no\n' "$DEV" "$OUT"
  exit 1
fi

echo "" >&2
echo "Deliver these three files to '$DEV' securely:" >&2
echo "  $OUT/client.crt  $OUT/client.key  $OUT/ca.crt" >&2
echo "They install the tunnel with:" >&2
echo "  graph-infra/scripts/install-sidecar.sh --project-scope <scope> --host ${HOST:-<host>} \\" >&2
echo "    --gateway-port $GATEWAY_PORT --sidecar-port 3700 \\" >&2
echo "    --cert client.crt --key client.key --cacert ca.crt --start" >&2

echo "All registered gateway projections updated from server trusted-cns." >&2

printf '\nNACL_CERT_RESULT: status=ISSUED dev=%s out=%s gateway_applied=%s\n' "$DEV" "$OUT" "$GW_APPLIED"

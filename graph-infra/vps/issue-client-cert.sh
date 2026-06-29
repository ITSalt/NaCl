#!/usr/bin/env bash
# issue-client-cert.sh — mint a personal client certificate (a developer's "API key").
#
# Run on the VPS / CA host. Produces client.crt + client.key + ca.crt under
# <state-dir>/clients/<dev-id>/, plus a ready-to-run sidecar hint. Deliver the bundle to the
# developer over a secure channel; they install it with graph-infra/scripts/install-sidecar.sh.
#
#   issue-client-cert.sh <developer-id> [--state-dir /etc/nacl-graph] [--host graph.example.com] \
#       [--gateway-port 7687] [--scope SCOPE] [--prefix SLUG]
# --scope/--prefix add the new cert's CN to that project's gateway allow-list and recreate the
# gateway so access takes effect immediately; omit them to only mint the cert (add the CN later).
set -euo pipefail

DEV="${1:-}"; shift || true
[ -n "$DEV" ] || { echo "usage: issue-client-cert.sh <developer-id> [--state-dir DIR] [--host H] [--gateway-port N] [--scope SCOPE] [--prefix SLUG]" >&2; exit 2; }
case "$DEV" in --*) echo "developer-id must be the first argument" >&2; exit 2 ;; esac

STATE_DIR="/etc/nacl-graph"; HOST=""; GATEWAY_PORT="7687"; SCOPE=""; PREFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --state-dir) STATE_DIR="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --gateway-port) GATEWAY_PORT="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

export CA_DIR="$STATE_DIR/ca"
[ -f "$CA_DIR/ca.crt" ] || { echo "ERROR: no CA at $CA_DIR — run provision-vps.sh first" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/lib-ca.sh"

OUT="$STATE_DIR/clients/$DEV"
issue_client_cert "$DEV" "$OUT"

# add the CN to the gateway allow-list and recreate the gateway (command changed ⇒ up -d, not restart)
GW_APPLIED="no"
if [ -n "$SCOPE" ]; then
  GRAPH_DIR="$STATE_DIR/$SCOPE"
  if [ -d "$GRAPH_DIR" ]; then
    allowlist_add "$GRAPH_DIR" "$DEV"
    render_gateway_allowlist "$GRAPH_DIR"
    DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
    ( cd "$GRAPH_DIR" && $DC up -d ) && GW_APPLIED="yes" || true
  fi
fi

echo "" >&2
echo "Deliver these three files to '$DEV' securely:" >&2
echo "  $OUT/client.crt  $OUT/client.key  $OUT/ca.crt" >&2
echo "They install the tunnel with:" >&2
echo "  graph-infra/scripts/install-sidecar.sh --project-scope <scope> --host ${HOST:-<host>} \\" >&2
echo "    --gateway-port $GATEWAY_PORT --sidecar-port 3700 \\" >&2
echo "    --cert client.crt --key client.key --cacert ca.crt --start" >&2

[ "$GW_APPLIED" = "yes" ] && echo "Gateway allow-list updated (CN added, gateway recreated)." >&2 \
  || { [ -n "$SCOPE" ] && echo "WARN: cert minted but gateway not updated — add CN '$DEV' to allowed-cns and re-run: cd $STATE_DIR/<scope> && docker compose up -d" >&2 || echo "Note: pass --scope/--prefix to add this CN to the gateway allow-list automatically." >&2; }

printf '\nNACL_CERT_RESULT: status=ISSUED dev=%s out=%s gateway_applied=%s\n' "$DEV" "$OUT" "$GW_APPLIED"

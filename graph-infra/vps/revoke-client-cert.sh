#!/usr/bin/env bash
# revoke-client-cert.sh — revoke a developer's client certificate (instant access removal).
#
# ghostunnel (>=1.x) has no CRL, so revocation = remove the developer's CN from the gateway
# allow-list and recreate the gateway. Takes effect immediately — no shared-password rotation,
# no Neo4j restart, other developers unaffected. This is the operational meaning of "revoke the
# API key". (We also still record the revocation in the CA index/CRL for audit hygiene.)
#
#   revoke-client-cert.sh <developer-id> [--state-dir /etc/nacl-graph] [--scope SCOPE] [--prefix SLUG]
# --scope/--prefix drop the CN from that project's allow-list and recreate the gateway; omit them
# to only record the revocation (then drop the CN + `docker compose up -d` yourself).
set -euo pipefail

DEV="${1:-}"; shift || true
[ -n "$DEV" ] || { echo "usage: revoke-client-cert.sh <developer-id> [--state-dir DIR] [--scope SCOPE] [--prefix SLUG]" >&2; exit 2; }
case "$DEV" in --*) echo "developer-id must be the first argument" >&2; exit 2 ;; esac

STATE_DIR="/etc/nacl-graph"; SCOPE=""; PREFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --state-dir) STATE_DIR="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

export CA_DIR="$STATE_DIR/ca"
CERT="$STATE_DIR/clients/$DEV/client.crt"
[ -f "$CERT" ] || { echo "ERROR: no cert for '$DEV' at $CERT" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/lib-ca.sh"

# record the revocation in the CA index/CRL for audit hygiene (the gateway no longer reads the CRL)
revoke_cert "$CERT" || true

RELOADED="no"
if [ -n "$SCOPE" ]; then
  GRAPH_DIR="$STATE_DIR/$SCOPE"
  if [ -d "$GRAPH_DIR" ]; then
    allowlist_remove "$GRAPH_DIR" "$DEV"
    render_gateway_allowlist "$GRAPH_DIR"
    DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
    # command changed (CN removed) ⇒ up -d recreates the gateway; restart alone would not apply it
    ( cd "$GRAPH_DIR" && $DC up -d ) && RELOADED="yes" || true
  fi
fi

echo "Revoked '$DEV'. CN removed from allow-list${RELOADED:+; gateway recreated=$RELOADED}." >&2
[ "$RELOADED" = "yes" ] || echo "Enforce it: remove '$DEV' from $STATE_DIR/<scope>/allowed-cns, re-render, then cd $STATE_DIR/<scope> && docker compose up -d" >&2

printf '\nNACL_CERT_RESULT: status=REVOKED dev=%s gateway_reloaded=%s\n' "$DEV" "$RELOADED"

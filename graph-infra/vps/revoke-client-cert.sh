#!/usr/bin/env bash
# revoke-client-cert.sh — revoke a developer's client certificate (instant access removal).
#
# Adds the cert to the CRL and reloads the gateway so the change takes effect immediately —
# no shared-password rotation, no Neo4j restart, other developers unaffected. This is the
# operational meaning of "revoke the API key".
#
#   revoke-client-cert.sh <developer-id> [--state-dir /etc/nacl-graph] [--scope SCOPE] [--prefix SLUG]
# --scope/--prefix let the script copy the new CRL into the project's certs dir and restart
# the gateway container; omit them to only regenerate the CRL (reload the gateway yourself).
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

revoke_cert "$CERT"

RELOADED="no"
if [ -n "$SCOPE" ]; then
  GRAPH_DIR="$STATE_DIR/$SCOPE"
  if [ -d "$GRAPH_DIR" ]; then
    cp "$CA_DIR/crl.pem" "$GRAPH_DIR/certs/crl.pem"
    DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
    GW="${PREFIX:+${PREFIX}-gateway}"
    if [ -n "$GW" ]; then ( cd "$GRAPH_DIR" && $DC restart gateway ) && RELOADED="yes" || true; fi
  fi
fi

echo "Revoked '$DEV'. CRL updated${RELOADED:+; gateway reloaded=$RELOADED}." >&2
[ "$RELOADED" = "yes" ] || echo "Reload the gateway to enforce: cd $STATE_DIR/<scope> && docker compose restart gateway" >&2

printf '\nNACL_CERT_RESULT: status=REVOKED dev=%s gateway_reloaded=%s\n' "$DEV" "$RELOADED"

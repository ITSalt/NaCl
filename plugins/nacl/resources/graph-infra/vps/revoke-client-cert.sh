#!/usr/bin/env bash
# revoke-client-cert.sh — revoke a developer's client certificate (instant access removal).
#
# ghostunnel (>=1.x) has no CRL, so revocation = remove the developer's CN from the gateway
# allow-list and recreate the gateway. Takes effect immediately — no shared-password rotation,
# no Neo4j restart, other developers unaffected. This is the operational meaning of "revoke the
# API key". (We also still record the revocation in the CA index/CRL for audit hygiene.)
#
#   revoke-client-cert.sh <developer-id> [--state-dir /etc/nacl-graph] --server-id graph.example.com
# Revocation is server-wide. Every registered gateway is reconciled; a stale gateway is stopped
# and quarantined, and the operation returns BLOCKED rather than a false success.
set -euo pipefail

DEV="${1:-}"; shift || true
[ -n "$DEV" ] || { echo "usage: revoke-client-cert.sh <developer-id> [--state-dir DIR] [--scope SCOPE] [--prefix SLUG]" >&2; exit 2; }
case "$DEV" in --*) echo "developer-id must be the first argument" >&2; exit 2 ;; esac

STATE_DIR="/etc/nacl-graph"; SERVER_ID=""; SCOPE=""; PREFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --state-dir) STATE_DIR="$2"; shift 2 ;;
    --server-id) SERVER_ID="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

export CA_DIR="$STATE_DIR/ca"
[ -n "$SERVER_ID" ] || { echo "ERROR: --server-id is required for server-wide revoke" >&2; exit 2; }
CERT="$STATE_DIR/clients/$DEV/client.crt"
[ -f "$CERT" ] || { echo "ERROR: no cert for '$DEV' at $CERT" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/lib-ca.sh"

# record the revocation in the CA index/CRL for audit hygiene (the gateway no longer reads the CRL)
revoke_cert "$CERT" || true

ACCESS_CONTROL="$HERE/server-access-control.mjs"
DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
# shellcheck source=/dev/null
. "$HERE/lib-gateway-quarantine.sh"
if ! node "$ACCESS_CONTROL" revoke --state-dir "$STATE_DIR" --server-id "$SERVER_ID" --cn "$DEV" >/dev/null; then
  CRITICAL_UNRESOLVED="no"
  quarantine_all_gateways revoke-projection-failed || CRITICAL_UNRESOLVED="yes"
  echo "BLOCKED: server-wide revoke projection failed; physical quarantine was required" >&2
  printf '\nNACL_CERT_RESULT: status=BLOCKED dev=%s gateway_reloaded=no critical_unresolved=%s\n' "$DEV" "$CRITICAL_UNRESOLVED"
  exit 1
fi
RELOADED="yes"
for compose in "$STATE_DIR"/*/docker-compose.yml; do
  [ -f "$compose" ] || continue
  GRAPH_DIR="$(dirname "$compose")"
  if ! render_gateway_allowlist "$GRAPH_DIR" || ! ( cd "$GRAPH_DIR" && $DC up -d ); then
    RELOADED="no"
  fi
done

echo "Revoked '$DEV'. CN removed from allow-list${RELOADED:+; gateway recreated=$RELOADED}." >&2
if [ "$RELOADED" != "yes" ]; then
  CRITICAL_UNRESOLVED="no"
  quarantine_all_gateways revoke-reload-failed || CRITICAL_UNRESOLVED="yes"
  echo "BLOCKED: a stale gateway required server-wide physical quarantine" >&2
  printf '\nNACL_CERT_RESULT: status=BLOCKED dev=%s gateway_reloaded=no critical_unresolved=%s\n' "$DEV" "$CRITICAL_UNRESOLVED"
  exit 1
fi

printf '\nNACL_CERT_RESULT: status=REVOKED dev=%s gateway_reloaded=%s\n' "$DEV" "$RELOADED"

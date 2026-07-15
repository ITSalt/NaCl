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
if ! node "$ACCESS_CONTROL" revoke --state-dir "$STATE_DIR" --server-id "$SERVER_ID" --cn "$DEV" >/dev/null; then
  DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
  for compose in "$STATE_DIR"/*/docker-compose.yml; do
    [ -f "$compose" ] || continue; GRAPH_DIR="$(dirname "$compose")"
    ( cd "$GRAPH_DIR" && $DC stop gateway ) >/dev/null 2>&1 || true
  done
  echo "BLOCKED: server-wide revoke projection failed; every gateway was stopped" >&2
  printf '\nNACL_CERT_RESULT: status=BLOCKED dev=%s gateway_reloaded=no\n' "$DEV"
  exit 1
fi
RELOADED="yes"; DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
for compose in "$STATE_DIR"/*/docker-compose.yml; do
  [ -f "$compose" ] || continue
  GRAPH_DIR="$(dirname "$compose")"; scope="$(basename "$GRAPH_DIR")"
  if ! render_gateway_allowlist "$GRAPH_DIR" || ! ( cd "$GRAPH_DIR" && $DC up -d ); then
    RELOADED="no"
    node "$ACCESS_CONTROL" quarantine --state-dir "$STATE_DIR" --server-id "$SERVER_ID" --scope "$scope" --reason reload-failed >/dev/null 2>&1 || true
    ( cd "$GRAPH_DIR" && $DC stop gateway ) >/dev/null 2>&1 || true
  fi
done

echo "Revoked '$DEV'. CN removed from allow-list${RELOADED:+; gateway recreated=$RELOADED}." >&2
[ "$RELOADED" = "yes" ] || { echo "BLOCKED: a stale gateway was quarantined and stopped" >&2; printf '\nNACL_CERT_RESULT: status=BLOCKED dev=%s gateway_reloaded=no\n' "$DEV"; exit 1; }

printf '\nNACL_CERT_RESULT: status=REVOKED dev=%s gateway_reloaded=%s\n' "$DEV" "$RELOADED"

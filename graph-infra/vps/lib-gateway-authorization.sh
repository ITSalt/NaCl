#!/bin/sh
# Shared fail-closed server authorization boundary.
# Callers must set STATE_DIR, SERVER_ID, ACCESS_CONTROL and DC, source lib-ca.sh
# and lib-gateway-quarantine.sh, and provide render_gateway_allowlist.

reload_all_registered_gateways() {
  _nacl_reload_failed=0
  _nacl_inventory=$(node "$ACCESS_CONTROL" inventory --state-dir "$STATE_DIR" --server-id "$SERVER_ID" 2>/dev/null) || {
    echo "CRITICAL: cannot enumerate gateways for authorization reload" >&2
    return 1
  }
  _nacl_scopes=$(printf '%s' "$_nacl_inventory" | node -e '
    let text = "";
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      const value = JSON.parse(text);
      for (const gateway of value.gateways ?? []) process.stdout.write(`${gateway.project_scope}\n`);
    });
  ') || {
    echo "CRITICAL: cannot parse gateway inventory for authorization reload" >&2
    return 1
  }
  for _nacl_scope in $_nacl_scopes; do
    _nacl_graph_dir="$STATE_DIR/$_nacl_scope"
    if [ ! -f "$_nacl_graph_dir/docker-compose.yml" ]; then
      echo "CRITICAL: gateway reload unavailable for $_nacl_scope (compose file missing)" >&2
      _nacl_reload_failed=1
      continue
    fi
    if ! render_gateway_allowlist "$_nacl_graph_dir"; then
      echo "CRITICAL: gateway allowlist render failed for $_nacl_scope" >&2
      _nacl_reload_failed=1
      continue
    fi
    if ! (cd "$_nacl_graph_dir" && $DC up -d); then
      echo "CRITICAL: gateway reload failed for $_nacl_scope" >&2
      _nacl_reload_failed=1
    fi
  done
  [ "$_nacl_reload_failed" -eq 0 ]
}

grant_and_reload_all_gateways() {
  _nacl_principal="$1"
  NACL_AUTHORIZATION_FAILURE="none"
  NACL_CRITICAL_UNRESOLVED="no"
  if ! node "$ACCESS_CONTROL" grant --state-dir "$STATE_DIR" --server-id "$SERVER_ID" \
    --cn "$_nacl_principal" >/dev/null; then
    NACL_AUTHORIZATION_FAILURE="grant-rollback-uncertain"
    quarantine_all_gateways "$NACL_AUTHORIZATION_FAILURE" || NACL_CRITICAL_UNRESOLVED="yes"
    return 1
  fi
  if ! reload_all_registered_gateways; then
    NACL_AUTHORIZATION_FAILURE="grant-reload-failed"
    node "$ACCESS_CONTROL" revoke --state-dir "$STATE_DIR" --server-id "$SERVER_ID" \
      --cn "$_nacl_principal" >/dev/null 2>&1 || true
    quarantine_all_gateways "$NACL_AUTHORIZATION_FAILURE" || NACL_CRITICAL_UNRESOLVED="yes"
    return 1
  fi
}

#!/bin/sh
# Physical fail-closed boundary for VPS gateway authorization uncertainty.
# Callers must set STATE_DIR, SERVER_ID, ACCESS_CONTROL and DC.

quarantine_all_gateways() {
  _nacl_quarantine_reason="${1:-authorization-state-uncertain}"
  _nacl_quarantine_failed=0
  _nacl_inventory=$(node "$ACCESS_CONTROL" inventory --state-dir "$STATE_DIR" --server-id "$SERVER_ID" 2>/dev/null) || {
    echo "CRITICAL: cannot enumerate gateways for physical quarantine" >&2
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
    echo "CRITICAL: cannot parse gateway inventory for physical quarantine" >&2
    return 1
  }
  for _nacl_scope in $_nacl_scopes; do
    _nacl_graph_dir="$STATE_DIR/$_nacl_scope"
    node "$ACCESS_CONTROL" quarantine --state-dir "$STATE_DIR" --server-id "$SERVER_ID" \
      --scope "$_nacl_scope" --reason "$_nacl_quarantine_reason" >/dev/null 2>&1 || _nacl_quarantine_failed=1
    if [ ! -f "$_nacl_graph_dir/docker-compose.yml" ]; then
      echo "CRITICAL: physical gateway stop unavailable for $_nacl_scope (compose file missing)" >&2
      _nacl_quarantine_failed=1
      continue
    fi
    if ! (cd "$_nacl_graph_dir" && $DC stop gateway >/dev/null 2>&1); then
      echo "CRITICAL: physical gateway stop failed for $_nacl_scope" >&2
      _nacl_quarantine_failed=1
    fi
  done
  [ "$_nacl_quarantine_failed" -eq 0 ]
}

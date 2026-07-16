#!/bin/sh
# Shared fail-closed server authorization boundary.
# Callers must set STATE_DIR, SERVER_ID, ACCESS_CONTROL and DC, source lib-ca.sh
# and lib-gateway-quarantine.sh, and provide render_gateway_allowlist.

verify_gateway_authorization() {
  _nacl_verify_scope="$1"
  _nacl_verify_action="$2"
  _nacl_verify_revision="$3"
  _nacl_verify_binding="$4"
  _nacl_verify_json=$(node "$ACCESS_CONTROL" authorization-verify --state-dir "$STATE_DIR" --server-id "$SERVER_ID" \
    --scope "$_nacl_verify_scope" --authorization-revision "$_nacl_verify_revision" \
    --authorization-binding "$_nacl_verify_binding" 2>/dev/null) || return 1
  printf '%s' "$_nacl_verify_json" | node -e '
    let text = "";
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      const value = JSON.parse(text);
      if (value.status !== "VERIFIED" || value.action !== process.argv[1]) process.exit(1);
    });
  ' "$_nacl_verify_action"
}

reload_all_registered_gateways() {
  _nacl_reload_work=$(mktemp -d "$STATE_DIR/.authorization-reload.XXXXXX") || {
    echo "CRITICAL: cannot allocate authorization reload workspace" >&2
    return 1
  }
  chmod 700 "$_nacl_reload_work" || {
    rm -rf "$_nacl_reload_work"
    return 1
  }
  _nacl_snapshot=$(node "$ACCESS_CONTROL" authorization-snapshot --state-dir "$STATE_DIR" --server-id "$SERVER_ID" 2>/dev/null) || {
    echo "CRITICAL: cannot create canonical authorization snapshot" >&2
    rm -rf "$_nacl_reload_work"
    return 1
  }
  if ! printf '%s' "$_nacl_snapshot" | node -e '
    const { createHash } = require("node:crypto");
    const { writeFileSync } = require("node:fs");
    const path = require("node:path");
    let text = "";
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      const value = JSON.parse(text);
      if (value.status !== "VERIFIED" || !Number.isSafeInteger(value.authorization_revision) || value.authorization_revision < 0) process.exit(1);
      if (!/^[0-9a-f]{64}$/.test(value.authorization_binding ?? "") || !/^[0-9a-f]{64}$/.test(value.trusted_cns_sha256 ?? "")) process.exit(1);
      if (!Array.isArray(value.trusted_cns) || !Array.isArray(value.gateways)) process.exit(1);
      const serialized = value.trusted_cns.length ? `${value.trusted_cns.join("\n")}\n` : "";
      if (createHash("sha256").update(serialized).digest("hex") !== value.trusted_cns_sha256) process.exit(1);
      const seen = new Set();
      const reconciliation = value.gateways.map((gateway) => {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(gateway.project_scope ?? "") || gateway.project_scope.includes("..") || /[._-]$/.test(gateway.project_scope)) process.exit(1);
        if (!["up", "stop"].includes(gateway.action) || seen.has(gateway.project_scope)) process.exit(1);
        seen.add(gateway.project_scope);
        return `${gateway.project_scope}:${gateway.action}`;
      });
      const root = process.argv[1];
      writeFileSync(path.join(root, "trusted-cns"), serialized, { mode: 0o600 });
      writeFileSync(path.join(root, "reconciliation"), reconciliation.length ? `${reconciliation.join("\n")}\n` : "", { mode: 0o600 });
      writeFileSync(path.join(root, "revision"), String(value.authorization_revision), { mode: 0o600 });
      writeFileSync(path.join(root, "binding"), value.authorization_binding, { mode: 0o600 });
      writeFileSync(path.join(root, "trusted-sha256"), value.trusted_cns_sha256, { mode: 0o600 });
    });
  ' "$_nacl_reload_work"; then
    echo "CRITICAL: canonical authorization snapshot is malformed" >&2
    rm -rf "$_nacl_reload_work"
    return 1
  fi
  _nacl_revision=$(cat "$_nacl_reload_work/revision")
  _nacl_binding=$(cat "$_nacl_reload_work/binding")
  _nacl_trusted_sha256=$(cat "$_nacl_reload_work/trusted-sha256")

  _nacl_reload_failed=0
  while IFS= read -r _nacl_entry; do
    [ -n "$_nacl_entry" ] || continue
    _nacl_scope=${_nacl_entry%%:*}
    _nacl_action=${_nacl_entry#*:}
    _nacl_graph_dir="$STATE_DIR/$_nacl_scope"
    if [ ! -f "$_nacl_graph_dir/docker-compose.yml" ]; then
      echo "CRITICAL: gateway reload unavailable for $_nacl_scope (compose file missing)" >&2
      _nacl_reload_failed=1
      continue
    fi
    if ! verify_gateway_authorization "$_nacl_scope" "$_nacl_action" "$_nacl_revision" "$_nacl_binding"; then
      echo "CRITICAL: authoritative authorization binding failed before render for $_nacl_scope" >&2
      _nacl_reload_failed=1
      continue
    fi
    if ! render_gateway_allowlist "$_nacl_graph_dir" "$_nacl_reload_work/trusted-cns" "$_nacl_trusted_sha256"; then
      echo "CRITICAL: gateway allowlist render failed for $_nacl_scope" >&2
      _nacl_reload_failed=1
    fi
  done < "$_nacl_reload_work/reconciliation"
  if [ "$_nacl_reload_failed" -ne 0 ]; then
    rm -rf "$_nacl_reload_work"
    return 1
  fi

  while IFS= read -r _nacl_entry; do
    [ -n "$_nacl_entry" ] || continue
    _nacl_scope=${_nacl_entry%%:*}
    _nacl_action=${_nacl_entry#*:}
    _nacl_graph_dir="$STATE_DIR/$_nacl_scope"
    if ! verify_gateway_authorization "$_nacl_scope" "$_nacl_action" "$_nacl_revision" "$_nacl_binding"; then
      echo "CRITICAL: authoritative authorization binding failed before $_nacl_action for $_nacl_scope" >&2
      _nacl_reload_failed=1
      break
    fi
    if [ "$_nacl_action" = "up" ]; then
      if ! (cd "$_nacl_graph_dir" && $DC up -d); then
        echo "CRITICAL: gateway reload failed for $_nacl_scope" >&2
        _nacl_reload_failed=1
        break
      fi
    elif ! (cd "$_nacl_graph_dir" && $DC stop gateway); then
      echo "CRITICAL: gateway stop verification failed for $_nacl_scope" >&2
      _nacl_reload_failed=1
      break
    fi
  done < "$_nacl_reload_work/reconciliation"
  rm -rf "$_nacl_reload_work"
  [ "$_nacl_reload_failed" -eq 0 ]
}

grant_and_reload_all_gateways() {
  _nacl_principal="$1"
  NACL_AUTHORIZATION_FAILURE="none"
  NACL_CRITICAL_UNRESOLVED="no"
  if ! node "$ACCESS_CONTROL" grant --state-dir "$STATE_DIR" --server-id "$SERVER_ID" \
    --cn "$_nacl_principal" >/dev/null; then
    NACL_AUTHORIZATION_FAILURE="grant-rollback-uncertain"
    node "$ACCESS_CONTROL" revoke --state-dir "$STATE_DIR" --server-id "$SERVER_ID" \
      --cn "$_nacl_principal" >/dev/null 2>&1 || true
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

revoke_and_reload_all_gateways() {
  _nacl_principal="$1"
  NACL_AUTHORIZATION_FAILURE="none"
  NACL_CRITICAL_UNRESOLVED="no"
  if ! node "$ACCESS_CONTROL" revoke --state-dir "$STATE_DIR" --server-id "$SERVER_ID" \
    --cn "$_nacl_principal" >/dev/null; then
    NACL_AUTHORIZATION_FAILURE="revoke-projection-failed"
    quarantine_all_gateways "$NACL_AUTHORIZATION_FAILURE" || NACL_CRITICAL_UNRESOLVED="yes"
    return 1
  fi
  if ! reload_all_registered_gateways; then
    NACL_AUTHORIZATION_FAILURE="revoke-reload-failed"
    quarantine_all_gateways "$NACL_AUTHORIZATION_FAILURE" || NACL_CRITICAL_UNRESOLVED="yes"
    return 1
  fi
}

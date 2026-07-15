#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
gate="$repo_root/scripts/validate-codex-plugin.sh"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/nacl-plugin-gate-test.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT
plugin_root="$tmp_dir/nacl"

output=$(bash "$gate" "$plugin_root")
grep -q '^Status: NOT_RUN$' <<<"$output"
grep -q 'plugin manifest is not present' <<<"$output"

mkdir -p "$plugin_root/.codex-plugin"
printf '%s\n' '{"name":"nacl"}' >"$plugin_root/.codex-plugin/plugin.json"
validator="$tmp_dir/validate_plugin.py"
printf '%s\n' 'import sys' 'print("Plugin is valid")' 'raise SystemExit(0)' >"$validator"
validator_hash=0000000000000000000000000000000000000000000000000000000000000000
set +e
output=$(CODEX_PLUGIN_VALIDATOR="$validator" CODEX_PLUGIN_VALIDATOR_SHA256="$validator_hash" bash "$gate" "$plugin_root" 2>&1)
status=$?
set -e
test "$status" -eq 2
grep -q 'requested plugin validator hash is not the pinned Wave 1 hash' <<<"$output"

output=$(bash "$gate" "$repo_root/plugins/nacl")
grep -q '^Status: VERIFIED$' <<<"$output"

set +e
output=$(CODEX_PLUGIN_VALIDATOR="$tmp_dir/missing.py" CODEX_PLUGIN_VALIDATOR_SHA256=ebda00d55d7518b127f675f062fb5c6e7a1ffdc0a99df1a55ac594400d7d3228 bash "$gate" "$plugin_root" 2>&1)
status=$?
set -e
test "$status" -eq 2
grep -q '^Status: BLOCKED$' <<<"$output"

printf '%s\n' "4 passed, 0 failed"

#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
plugin_root=${1:-$repo_root/plugins/nacl}
manifest="$plugin_root/.codex-plugin/plugin.json"

if [ ! -f "$manifest" ]; then
  echo "Status: NOT_RUN"
  echo "Reason: plugin manifest is not present; Wave 1 owns the ingestion spike"
  echo "Expected manifest: plugins/nacl/.codex-plugin/plugin.json"
  exit 0
fi

vendored_validator="$repo_root/tests/codex-plugin/vendor/openai-codex/plugin-validator-ebda00d5/validate_plugin.py"
expected_hash=ebda00d55d7518b127f675f062fb5c6e7a1ffdc0a99df1a55ac594400d7d3228
validator=${CODEX_PLUGIN_VALIDATOR:-$vendored_validator}
validator_hash=${CODEX_PLUGIN_VALIDATOR_SHA256:-$expected_hash}

if [ -z "$validator" ] || [ ! -f "$validator" ]; then
  echo "Status: BLOCKED"
  echo "Reason: bundled plugin validator is unavailable"
  echo "Set CODEX_PLUGIN_VALIDATOR to plugin-creator/scripts/validate_plugin.py."
  exit 2
fi
if [ "$validator_hash" != "$expected_hash" ]; then
  echo "Status: BLOCKED"
  echo "Reason: requested plugin validator hash is not the pinned Wave 1 hash"
  exit 2
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual_hash=$(sha256sum "$validator" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  actual_hash=$(shasum -a 256 "$validator" | awk '{print $1}')
else
  echo "Status: BLOCKED"
  echo "Reason: no SHA-256 checksum tool is available"
  exit 2
fi
if [ "$actual_hash" != "$expected_hash" ]; then
  echo "Status: BLOCKED"
  echo "Reason: plugin validator checksum mismatch"
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: python3 is required by the bundled plugin validator"
  exit 2
fi

set +e
python3 "$validator" "$plugin_root"
status=$?
set -e
if [ "$status" -ne 0 ]; then
  echo "Status: FAILED"
  echo "Reason: bundled plugin validator rejected the candidate"
  exit "$status"
fi

echo "Status: VERIFIED"

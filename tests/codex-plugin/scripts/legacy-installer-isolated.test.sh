#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
installer="$repo_root/skills-for-codex/scripts/install-user-symlinks.sh"
doctor="$repo_root/plugins/nacl/scripts/nacl-installation-doctor.mjs"
plugin_root="$repo_root/plugins/nacl"
work_root=$(mktemp -d -t nacl-legacy-e2e.XXXXXX)
trap 'rm -rf "$work_root"' EXIT

actual_sh_hash=$(shasum -a 256 "$installer" | awk '{print $1}')
actual_ps_hash=$(shasum -a 256 \
  "$repo_root/skills-for-codex/scripts/install-user-symlinks.ps1" | awk '{print $1}')
test "$actual_sh_hash" = "f5b98809526a1dab5e5e6fbf074f111cff573c0aa31dd49ea2ef016e76cbb9c5"
test "$actual_ps_hash" = "0c8c4164cf89da505207e381eae258bacbe8e415034b2ee23a1fdd1419353f24"

legacy_home="$work_root/legacy-home"
mkdir -p "$legacy_home"
first=$(HOME="$legacy_home" sh "$installer")
printf '%s\n' "$first" | grep -F "Summary: created=60 already_present=0 blocked=0" >/dev/null
second=$(HOME="$legacy_home" sh "$installer")
printf '%s\n' "$second" | grep -F "Summary: created=0 already_present=60 blocked=0" >/dev/null
test "$(find "$legacy_home/.agents/skills" -type l | wc -l | tr -d ' ')" = "60"

legacy_json=$(node "$doctor" --home "$legacy_home" --plugin-root "$work_root/missing-plugin")
node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.mode !== "legacy-only" || value.status !== "VERIFIED") process.exit(1);
' "$legacy_json"

set +e
both_json=$(node "$doctor" --home "$legacy_home" --plugin-root "$plugin_root")
both_exit=$?
set -e
test "$both_exit" = "2"
node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.mode !== "both" || value.status !== "FAILED") process.exit(1);
  if (!value.guidance.includes("remove only the legacy")) process.exit(1);
' "$both_json"

neither_home="$work_root/neither-home"
mkdir -p "$neither_home"
set +e
neither_json=$(node "$doctor" --home "$neither_home" --plugin-root "$work_root/missing-plugin")
neither_exit=$?
set -e
test "$neither_exit" = "2"
node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.mode !== "neither" || value.status !== "BLOCKED") process.exit(1);
' "$neither_json"

echo "Status: VERIFIED"
echo "Legacy installer: 60 created, 60 idempotent, hashes unchanged"
echo "Doctor modes: legacy-only VERIFIED; both FAILED; neither BLOCKED"

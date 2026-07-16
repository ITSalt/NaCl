#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

if [ "$#" -ne 0 ]; then
  echo "Status: BLOCKED"
  echo "Reason: Claude isolation gate accepts no caller-selected refs"
  exit 2
fi

audited_base=19dd5e263024a2e43e456e9f37efcfc8c8a3bc73
base_file=tests/codex-plugin/claude-frozen-base.txt
if [ ! -f "$base_file" ]; then
  echo "Status: BLOCKED"
  echo "Reason: frozen-path base file is unavailable: $base_file"
  exit 2
fi

recorded_base=$(awk 'NF && $1 !~ /^#/ { print $1; exit }' "$base_file")
if [ "$recorded_base" != "$audited_base" ]; then
  echo "Status: BLOCKED"
  echo "Reason: recorded base does not match the immutable audited main SHA"
  exit 2
fi

if ! git rev-parse --verify "$audited_base^{commit}" >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: immutable audited main SHA cannot be resolved"
  exit 2
fi
if ! git rev-parse --verify "HEAD^{commit}" >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: candidate HEAD cannot be resolved"
  exit 2
fi
if ! git merge-base --is-ancestor "$audited_base" HEAD >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: immutable audited main SHA is not an ancestor of candidate HEAD"
  exit 2
fi

base_sha=$(git rev-parse "$audited_base^{commit}")
candidate_sha=$(git rev-parse "HEAD^{commit}")
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/nacl-claude-isolation.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
changes_file="$tmp_dir/changes.txt"

git diff --name-only "$audited_base" HEAD -- \
  .claude \
  .claude-plugin \
  '.github/workflows/build-plugin*' \
  'scripts/build-plugin*' \
  'scripts/plugin-manifest*' >"$changes_file"
git diff --name-only HEAD -- \
  .claude \
  .claude-plugin \
  '.github/workflows/build-plugin*' \
  'scripts/build-plugin*' \
  'scripts/plugin-manifest*' >>"$changes_file"
git ls-files --others --exclude-standard -- \
  .claude \
  .claude-plugin \
  '.github/workflows/build-plugin*' \
  'scripts/build-plugin*' \
  'scripts/plugin-manifest*' >>"$changes_file"

sort -u "$changes_file" -o "$changes_file"
if [ -s "$changes_file" ]; then
  while IFS= read -r path_name; do
    echo "FAILED frozen path: $path_name"
  done <"$changes_file"
  echo "Base SHA: $base_sha"
  echo "Candidate SHA: $candidate_sha"
  echo "Status: FAILED"
  exit 1
fi

if [ ! -f scripts/build-plugin.mjs ]; then
  echo "Status: BLOCKED"
  echo "Reason: Claude generated-parity builder is unavailable"
  exit 2
fi
if ! node scripts/build-plugin.mjs --check; then
  echo "Status: FAILED"
  echo "Reason: Claude generated artifact differs from the current root sources"
  exit 1
fi

base_manifest_hash=$(git ls-tree -r "$audited_base" -- \
  .claude .claude-plugin '.github/workflows/build-plugin*' \
  'scripts/build-plugin*' 'scripts/plugin-manifest*' | git hash-object --stdin)
candidate_manifest_hash=$(git ls-tree -r HEAD -- \
  .claude .claude-plugin '.github/workflows/build-plugin*' \
  'scripts/build-plugin*' 'scripts/plugin-manifest*' | git hash-object --stdin)
echo "Frozen namespaces: 5"
echo "Base SHA: $base_sha"
echo "Candidate SHA: $candidate_sha"
echo "Base frozen manifest hash: $base_manifest_hash"
echo "Candidate frozen manifest hash: $candidate_manifest_hash"
echo "Generated parity: VERIFIED"
echo "Status: VERIFIED"

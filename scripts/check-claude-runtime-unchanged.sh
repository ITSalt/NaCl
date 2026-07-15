#!/usr/bin/env bash

set -euo pipefail

repo_root=${NACL_CLAUDE_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
cd "$repo_root"

base_file=${NACL_CLAUDE_BASE_FILE:-tests/codex-plugin/claude-frozen-base.txt}
if [ ! -f "$base_file" ]; then
  echo "Status: BLOCKED"
  echo "Reason: frozen-path base file is unavailable: $base_file"
  exit 2
fi

recorded_base=$(awk 'NF && $1 !~ /^#/ { print $1; exit }' "$base_file")
if ! printf '%s\n' "$recorded_base" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "Status: BLOCKED"
  echo "Reason: recorded base must be a literal lowercase 40-hex SHA"
  exit 2
fi

base_ref=${1:-$recorded_base}
head_ref=${2:-HEAD}

if ! printf '%s\n' "$base_ref" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "Status: BLOCKED"
  echo "Reason: requested base must be a literal lowercase 40-hex SHA"
  exit 2
fi
if [ "$base_ref" != "$recorded_base" ]; then
  echo "Status: BLOCKED"
  echo "Reason: requested base does not match the recorded audited SHA"
  exit 2
fi
if ! git rev-parse --verify "$base_ref^{commit}" >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: frozen-path base ref cannot be resolved: ${base_ref:-<empty>}"
  exit 2
fi
if ! git rev-parse --verify "$head_ref^{commit}" >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: candidate ref cannot be resolved: $head_ref"
  exit 2
fi
if ! git merge-base --is-ancestor "$base_ref" "$head_ref" >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: recorded base is not an ancestor of the candidate"
  exit 2
fi

base_sha=$(git rev-parse "$base_ref^{commit}")
candidate_sha=$(git rev-parse "$head_ref^{commit}")
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/nacl-claude-isolation.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
paths_file="$tmp_dir/paths.txt"
changes_file="$tmp_dir/changes.txt"

cat >"$paths_file" <<'EOF'
.claude
.claude-plugin
.github/workflows/build-plugin.yml
scripts/build-plugin.mjs
scripts/build-plugin.test.mjs
scripts/plugin-manifest.json
EOF

frozen_paths=$(cat "$paths_file")
# The frozen path list contains no spaces. Intentional splitting keeps this
# compatible with the Bash 3.2 shipped by macOS.
# shellcheck disable=SC2086
git diff --name-only "$base_ref" "$head_ref" -- $frozen_paths >"$changes_file"

if [ "$head_ref" = "HEAD" ]; then
  # shellcheck disable=SC2086
  git diff --name-only HEAD -- $frozen_paths >>"$changes_file"
  # shellcheck disable=SC2086
  git ls-files --others --exclude-standard -- $frozen_paths >>"$changes_file"
fi

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

generated_status="NOT_RUN"
if [ "$head_ref" = "HEAD" ] && [ "${NACL_CLAUDE_SKIP_GENERATED_CHECK:-0}" != "1" ]; then
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
  generated_status="VERIFIED"
fi

# shellcheck disable=SC2086
base_manifest_hash=$(git ls-tree "$base_ref" -- $frozen_paths | git hash-object --stdin)
# shellcheck disable=SC2086
candidate_manifest_hash=$(git ls-tree "$head_ref" -- $frozen_paths | git hash-object --stdin)
echo "Frozen roots: $(wc -l <"$paths_file" | tr -d ' ')"
echo "Base SHA: $base_sha"
echo "Candidate SHA: $candidate_sha"
echo "Base frozen manifest hash: $base_manifest_hash"
echo "Candidate frozen manifest hash: $candidate_manifest_hash"
echo "Generated parity: $generated_status"
echo "Status: VERIFIED"

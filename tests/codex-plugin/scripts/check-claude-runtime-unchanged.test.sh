#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
source_gate="$repo_root/scripts/check-claude-runtime-unchanged.sh"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/nacl-claude-gate-test.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT

git clone -q --shared "$repo_root" "$tmp_dir/repo"
test_repo="$tmp_dir/repo"
cp "$source_gate" "$test_repo/scripts/check-claude-runtime-unchanged.sh"
cd "$test_repo"
git config user.email test@example.invalid
git config user.name "NaCl Gate Test"
gate=scripts/check-claude-runtime-unchanged.sh

output=$(bash "$gate")
grep -q '^Status: VERIFIED$' <<<"$output"
grep -q '^Generated parity: VERIFIED$' <<<"$output"

printf '%s\n' allowed >wave9-allowed-untracked.txt
output=$(bash "$gate")
grep -q '^Status: VERIFIED$' <<<"$output"
rm wave9-allowed-untracked.txt

expect_failed_path() {
  expected=$1
  set +e
  output=$(bash "$gate" 2>&1)
  status=$?
  set -e
  test "$status" -eq 1
  grep -q "^FAILED frozen path: $expected$" <<<"$output"
  grep -q '^Status: FAILED$' <<<"$output"
}

mkdir -p .claude
printf '%s\n' changed >.claude/wave9-untracked
expect_failed_path '.claude/wave9-untracked'
rm .claude/wave9-untracked

printf '%s\n' changed >.claude-plugin/marketplace.json
expect_failed_path '.claude-plugin/marketplace.json'
git checkout -q -- .claude-plugin/marketplace.json

printf '%s\n' changed >scripts/plugin-manifest.json
expect_failed_path 'scripts/plugin-manifest.json'
git checkout -q -- scripts/plugin-manifest.json

printf '%s\n' changed >.github/workflows/build-plugin-extra.yml
expect_failed_path '.github/workflows/build-plugin-extra.yml'
rm .github/workflows/build-plugin-extra.yml

printf '%s\n' changed >scripts/build-plugin-helper.mjs
expect_failed_path 'scripts/build-plugin-helper.mjs'
rm scripts/build-plugin-helper.mjs

printf '%s\n' drift >>plugin/.build-report.json
set +e
output=$(bash "$gate" 2>&1)
status=$?
set -e
test "$status" -eq 1
grep -q 'Claude generated artifact differs from the current root sources' <<<"$output"
git checkout -q -- plugin/.build-report.json

printf '%s\n' committed-drift >.claude-plugin/marketplace.json
git add .claude-plugin/marketplace.json
git commit -qm committed-frozen-drift
expect_failed_path '.claude-plugin/marketplace.json'

printf '%s\n' "$(git rev-parse HEAD)" >tests/codex-plugin/claude-frozen-base.txt
set +e
output=$(bash "$gate" 2>&1)
status=$?
set -e
test "$status" -eq 2
grep -q 'recorded base does not match the immutable audited main SHA' <<<"$output"
git checkout -q -- tests/codex-plugin/claude-frozen-base.txt

set +e
output=$(bash "$gate" HEAD 2>&1)
status=$?
set -e
test "$status" -eq 2
grep -q 'accepts no caller-selected refs' <<<"$output"

printf '%s\n' "10 passed, 0 failed"

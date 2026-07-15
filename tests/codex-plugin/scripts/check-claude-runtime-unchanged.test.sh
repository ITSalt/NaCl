#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
gate="$repo_root/scripts/check-claude-runtime-unchanged.sh"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/nacl-claude-gate-test.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT

cd "$tmp_dir"
git init -q
git config user.email test@example.invalid
git config user.name "NaCl Gate Test"
mkdir -p .claude nacl-example allowed
printf '%s\n' frozen >.claude/config
printf '%s\n' frozen >nacl-example/SKILL.md
printf '%s\n' allowed >allowed/file.txt
git add .
git commit -qm baseline
git rev-parse HEAD >frozen-base.txt

printf '%s\n' changed >allowed/file.txt
output=$(NACL_CLAUDE_REPO_ROOT="$tmp_dir" NACL_CLAUDE_BASE_FILE="$tmp_dir/frozen-base.txt" bash "$gate")
grep -q '^Status: VERIFIED$' <<<"$output"

printf '%s\n' changed >.claude/config
set +e
output=$(NACL_CLAUDE_REPO_ROOT="$tmp_dir" NACL_CLAUDE_BASE_FILE="$tmp_dir/frozen-base.txt" bash "$gate" 2>&1)
status=$?
set -e
test "$status" -eq 1
grep -q '^FAILED frozen path: .claude/config$' <<<"$output"
grep -q '^Status: FAILED$' <<<"$output"

git add .claude/config allowed/file.txt
git commit -qm candidate-with-frozen-change
printf '%s\n' HEAD >symbolic-base.txt
set +e
output=$(NACL_CLAUDE_REPO_ROOT="$tmp_dir" NACL_CLAUDE_BASE_FILE="$tmp_dir/symbolic-base.txt" bash "$gate" 2>&1)
status=$?
set -e
test "$status" -eq 2
grep -q 'recorded base must be a literal lowercase 40-hex SHA' <<<"$output"
grep -q '^Status: BLOCKED$' <<<"$output"

unrelated_tree=$(git mktree </dev/null)
unrelated_sha=$(printf '%s\n' unrelated | git commit-tree "$unrelated_tree")
printf '%s\n' "$unrelated_sha" >unrelated-base.txt
set +e
output=$(NACL_CLAUDE_REPO_ROOT="$tmp_dir" NACL_CLAUDE_BASE_FILE="$tmp_dir/unrelated-base.txt" bash "$gate" "$unrelated_sha" HEAD 2>&1)
status=$?
set -e
test "$status" -eq 2
grep -q 'recorded base is not an ancestor of the candidate' <<<"$output"
grep -q '^Status: BLOCKED$' <<<"$output"

printf '%s\n' "4 passed, 0 failed"

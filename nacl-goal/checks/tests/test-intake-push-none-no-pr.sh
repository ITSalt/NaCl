#!/usr/bin/env bash
# Regression test: push_cadence=none must reach GOAL_OK without a PR.
#
# Hypothesis: pre-2.13 intake.sh unconditionally failed the success
# condition on pr_url == null. With push_cadence=none (dev-only batch
# mode) the run by design ends at verified local commits — no push, no
# PR, no CI. The decision rule carve-out (aliases.md §intake) must let
# such a run reach GOAL_OK when everything else is green.
#
# Expected: result == GOAL_OK with NO pr.json present, ci_status == n/a.

set -uo pipefail

INTAKE_SH="$(cd "$(dirname "$0")/.." && pwd -P)/intake.sh"
[[ -f "$INTAKE_SH" ]] || { echo "FATAL: intake.sh not found at $INTAKE_SH"; exit 2; }

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

run_id="goal-intake-test-none-deadbeef"
run_dir="${workdir}/.tl/goal-runs/${run_id}"
mkdir -p "${run_dir}/atoms"

# Real git repo: branch_head_sha must equal goal_final_sha.
branch="feature/batch-work"
(
  cd "$workdir"
  git init -q -b "$branch"
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "atom commit"
) >/dev/null 2>&1
head_sha=$(cd "$workdir" && git rev-parse HEAD)

cat > "${run_dir}/intake.json" <<'JSON'
{
  "schema_version": 1,
  "atoms": [],
  "classification_metadata": { "ambiguous": false, "requires_split": false }
}
JSON

cat > "${run_dir}/plan.lock.json" <<JSON
{
  "schema_version": 1,
  "run_id": "${run_id}",
  "branch": "${branch}",
  "branch_mode": "current",
  "push_cadence": "none",
  "branch_base_sha": "${head_sha}",
  "prior_unpushed_commits": 0,
  "preexisting_dirty_files": [],
  "deploy_target": "dev-only",
  "atoms": [
    { "id": "atom-aaaaaaaaaaaa", "type": "BUG", "skill_path": "nacl-tl-fix",
      "linked_uc": "UC-001", "risk_level": "L1", "depends_on": [], "title": "fix one" }
  ]
}
JSON

cat > "${run_dir}/atoms/atom-aaaaaaaaaaaa.state.json" <<JSON
{
  "schema_version": 1,
  "atom_id": "atom-aaaaaaaaaaaa",
  "state": "verified",
  "last_commit_sha": "${head_sha}",
  "verify_status": "pass",
  "error": null,
  "updated_at": "2026-01-01T00:00:00Z"
}
JSON

echo "$head_sha" > "${run_dir}/goal-final-sha.txt"

for f in regression-baseline.json regression-postfix.json; do
  cat > "${run_dir}/${f}" <<'JSON'
{
  "schema_version": 1,
  "captured_at": "2026-01-01T00:00:00Z",
  "command": "npm test",
  "runner": "vitest",
  "exit_code": 0,
  "collected_count": 2,
  "worktree_isolated": true,
  "tests": { "passed": ["t1", "t2"], "failed": [], "skipped": [] }
}
JSON
done

cat > "${run_dir}/dev-verified.json" <<'JSON'
{ "schema_version": 1, "dev_verified": true, "verified_at": "2026-01-01T00:00:00Z" }
JSON

echo "=== Regression test: intake.sh push_cadence=none reaches GOAL_OK without PR ==="
out=$(cd "$workdir" && bash "$INTAKE_SH" --run-id "$run_id" 2>&1)

result=$(echo "$out" | grep '^result:' | head -n 1 | sed 's/^result: //')
ci=$(echo "$out" | grep '^  - ci_status:' | head -n 1 | sed 's/^  - ci_status: //')
pr=$(echo "$out" | grep '^  - pr_url:' | head -n 1 | sed 's/^  - pr_url: //')

all_pass=1
[[ "$result" == "GOAL_OK" ]] || { echo "  FAIL result=${result} (expected GOAL_OK)"; all_pass=0; }
[[ "$ci" == "n/a" ]]         || { echo "  FAIL ci_status=${ci} (expected n/a)"; all_pass=0; }
[[ "$pr" == "null" ]]        || { echo "  FAIL pr_url=${pr} (expected null)"; all_pass=0; }

if [[ "$all_pass" -eq 1 ]]; then
  echo "  PASS  result=${result} ci_status=${ci} pr_url=${pr}"
  echo ""
  echo "ALL ASSERTIONS PASSED"
  exit 0
else
  echo "$out" | sed 's/^/      | /'
  echo "ONE OR MORE ASSERTIONS FAILED"
  exit 1
fi

#!/usr/bin/env bash
# Regression test: drift detection must still fire on the user's own branch.
#
# Hypothesis: branch_mode=current relaxes the dirty-worktree refusal and
# defers the push, but it must NOT relax the drift check — concurrent
# COMMITS to the run branch during the deliver window are unsupported in
# v1. With goal_final_sha frozen at commit A and the branch HEAD moved to
# commit B, the check script must emit GOAL_BLOCKED with
# GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER.
#
# Expected: result == GOAL_BLOCKED, blocking_reason names the drift code.

set -uo pipefail

INTAKE_SH="$(cd "$(dirname "$0")/.." && pwd -P)/intake.sh"
[[ -f "$INTAKE_SH" ]] || { echo "FATAL: intake.sh not found at $INTAKE_SH"; exit 2; }

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

run_id="goal-intake-test-drift-deadbeef"
run_dir="${workdir}/.tl/goal-runs/${run_id}"
mkdir -p "${run_dir}/atoms"

branch="feature/batch-work"
(
  cd "$workdir"
  git init -q -b "$branch"
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "goal-run final commit"
) >/dev/null 2>&1
frozen_sha=$(cd "$workdir" && git rev-parse HEAD)
# Another agent commits to the branch AFTER goal_final_sha was frozen:
(
  cd "$workdir"
  git -c user.email=o@o -c user.name=other commit -q --allow-empty -m "stray concurrent commit"
) >/dev/null 2>&1

cat > "${run_dir}/plan.lock.json" <<JSON
{
  "schema_version": 1,
  "run_id": "${run_id}",
  "branch": "${branch}",
  "branch_mode": "current",
  "push_cadence": "deferred",
  "deploy_target": "dev-only",
  "preexisting_dirty_files": [],
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
  "last_commit_sha": "${frozen_sha}",
  "verify_status": "pass",
  "error": null,
  "updated_at": "2026-01-01T00:00:00Z"
}
JSON

echo "$frozen_sha" > "${run_dir}/goal-final-sha.txt"

echo "=== Regression test: intake.sh drift detection on branch_mode=current ==="
out=$(cd "$workdir" && bash "$INTAKE_SH" --run-id "$run_id" 2>&1)

result=$(echo "$out" | grep '^result:' | head -n 1 | sed 's/^result: //')
reason=$(echo "$out" | grep '^  - blocking_reason:' | head -n 1 | sed 's/^  - blocking_reason: //')

all_pass=1
[[ "$result" == "GOAL_BLOCKED" ]] || { echo "  FAIL result=${result} (expected GOAL_BLOCKED)"; all_pass=0; }
[[ "$reason" == "GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER" ]] \
  || { echo "  FAIL blocking_reason=${reason} (expected GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER)"; all_pass=0; }

if [[ "$all_pass" -eq 1 ]]; then
  echo "  PASS  result=${result} blocking_reason=${reason}"
  echo ""
  echo "ALL ASSERTIONS PASSED"
  exit 0
else
  echo "$out" | sed 's/^/      | /'
  echo "ONE OR MORE ASSERTIONS FAILED"
  exit 1
fi

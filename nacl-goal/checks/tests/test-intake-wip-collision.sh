#!/usr/bin/env bash
# Regression test: a failed atom carrying block_code GOAL_BLOCKED_WIP_COLLISION
# must surface as GOAL_BLOCKED_WIP_COLLISION (resumable), not the generic
# GOAL_BLOCKED_ATOM_FAILED.
#
# Hypothesis: in branch_mode=current the worktree is shared with other
# agents. When an atom's commit would touch a file from
# preexisting_dirty_files, the wrapper/ship sets state=failed with
# block_code=GOAL_BLOCKED_WIP_COLLISION. The check script must map that to
# the dedicated (and only resumable) block code with collision_atom_id and
# resumable: true in evidence.
#
# Expected: result == GOAL_BLOCKED,
#           blocking_reason == GOAL_BLOCKED_WIP_COLLISION,
#           collision_atom_id == the failed atom, resumable: true.

set -uo pipefail

INTAKE_SH="$(cd "$(dirname "$0")/.." && pwd -P)/intake.sh"
[[ -f "$INTAKE_SH" ]] || { echo "FATAL: intake.sh not found at $INTAKE_SH"; exit 2; }

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

run_id="goal-intake-test-wip-deadbeef"
run_dir="${workdir}/.tl/goal-runs/${run_id}"
mkdir -p "${run_dir}/atoms"

branch="feature/batch-work"
(
  cd "$workdir"
  git init -q -b "$branch"
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "pre-goal commit"
) >/dev/null 2>&1
head_sha=$(cd "$workdir" && git rev-parse HEAD)

cat > "${run_dir}/plan.lock.json" <<JSON
{
  "schema_version": 1,
  "run_id": "${run_id}",
  "branch": "${branch}",
  "branch_mode": "current",
  "push_cadence": "deferred",
  "deploy_target": "dev-only",
  "preexisting_dirty_files": ["src/shared/api-client.ts"],
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
  "state": "failed",
  "last_commit_sha": "${head_sha}",
  "verify_status": null,
  "error": "atom needed to modify src/shared/api-client.ts which another agent holds uncommitted",
  "block_code": "GOAL_BLOCKED_WIP_COLLISION",
  "updated_at": "2026-01-01T00:00:00Z"
}
JSON

echo "=== Regression test: intake.sh WIP-collision block code ==="
out=$(cd "$workdir" && bash "$INTAKE_SH" --run-id "$run_id" 2>&1)

result=$(echo "$out" | grep '^result:' | head -n 1 | sed 's/^result: //')
reason=$(echo "$out" | grep '^  - blocking_reason:' | head -n 1 | sed 's/^  - blocking_reason: //')
atom=$(echo "$out" | grep '^  - collision_atom_id:' | head -n 1 | sed 's/^  - collision_atom_id: //')
resumable=$(echo "$out" | grep '^  - resumable:' | head -n 1 | sed 's/^  - resumable: //')

all_pass=1
[[ "$result" == "GOAL_BLOCKED" ]] || { echo "  FAIL result=${result} (expected GOAL_BLOCKED)"; all_pass=0; }
[[ "$reason" == "GOAL_BLOCKED_WIP_COLLISION" ]] \
  || { echo "  FAIL blocking_reason=${reason} (expected GOAL_BLOCKED_WIP_COLLISION)"; all_pass=0; }
[[ "$atom" == "atom-aaaaaaaaaaaa" ]] \
  || { echo "  FAIL collision_atom_id=${atom} (expected atom-aaaaaaaaaaaa)"; all_pass=0; }
[[ "$resumable" == "true" ]] \
  || { echo "  FAIL resumable=${resumable} (expected true)"; all_pass=0; }

if [[ "$all_pass" -eq 1 ]]; then
  echo "  PASS  result=${result} blocking_reason=${reason} atom=${atom} resumable=${resumable}"
  echo ""
  echo "ALL ASSERTIONS PASSED"
  exit 0
else
  echo "$out" | sed 's/^/      | /'
  echo "ONE OR MORE ASSERTIONS FAILED"
  exit 1
fi

#!/usr/bin/env bash
# Regression test: deferred push cadence — null PR head mid-run is NOT drift;
# after the single push the PR head participates in drift normally.
#
# Hypothesis: under push_cadence=deferred the PR does not exist until
# /nacl-tl-deliver performs the single push. Phase A (pre-push): with
# goal_final_sha frozen, branch HEAD matching, and NO pr.json, the check
# script must NOT report drift (a null pr_head_sha is "not yet", not
# "diverged"). Phase B (post-push): with pr.json present and
# pr_head_sha == goal_final_sha, still no drift; the run proceeds toward
# CI/staging (GOAL_NOT_OK here since neither is simulated).
#
# Expected: both phases result == GOAL_NOT_OK (never GOAL_BLOCKED), and
# evidence push_cadence == deferred.

set -uo pipefail

INTAKE_SH="$(cd "$(dirname "$0")/.." && pwd -P)/intake.sh"
[[ -f "$INTAKE_SH" ]] || { echo "FATAL: intake.sh not found at $INTAKE_SH"; exit 2; }

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

run_id="goal-intake-test-deferred-cafebabe"
run_dir="${workdir}/.tl/goal-runs/${run_id}"
mkdir -p "${run_dir}/atoms"

branch="feature/batch-work"
(
  cd "$workdir"
  git init -q -b "$branch"
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "goal-run final commit"
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
  "push_cadence": "deferred",
  "deploy_target": "staging",
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
  "last_commit_sha": "${head_sha}",
  "verify_status": "pass",
  "error": null,
  "updated_at": "2026-01-01T00:00:00Z"
}
JSON

echo "$head_sha" > "${run_dir}/goal-final-sha.txt"

# gh stub: succeeds instantly so the retry/backoff path (65s of sleeps on a
# real-but-failing gh) never runs; reports the matching head SHA and an
# empty status rollup (CI stays "pending").
mkdir -p "${workdir}/bin"
cat > "${workdir}/bin/gh" <<STUB
#!/usr/bin/env bash
echo '{ "headRefOid": "${head_sha}", "state": "OPEN", "statusCheckRollup": [] }'
STUB
chmod +x "${workdir}/bin/gh"

run_phase() {
  local label="$1"
  local out result reason cadence
  out=$(cd "$workdir" && PATH="${workdir}/bin:$PATH" bash "$INTAKE_SH" --run-id "$run_id" 2>&1)
  result=$(echo "$out" | grep '^result:' | head -n 1 | sed 's/^result: //')
  reason=$(echo "$out" | grep '^  - blocking_reason:' | head -n 1 | sed 's/^  - blocking_reason: //')
  cadence=$(echo "$out" | grep '^  - push_cadence:' | head -n 1 | sed 's/^  - push_cadence: //')

  local phase_pass=1
  [[ "$result" == "GOAL_NOT_OK" ]] || phase_pass=0
  [[ -z "$reason" ]]               || phase_pass=0
  [[ "$cadence" == "deferred" ]]   || phase_pass=0

  if [[ "$phase_pass" -eq 1 ]]; then
    echo "  PASS  ${label}: result=${result} push_cadence=${cadence}"
  else
    echo "  FAIL  ${label}: result=${result} blocking_reason='${reason}' push_cadence=${cadence}"
    echo "        (expected GOAL_NOT_OK, no blocking_reason, cadence=deferred)"
    echo "$out" | sed 's/^/      | /'
    all_pass=0
  fi
}

echo "=== Regression test: intake.sh deferred-push PR lifecycle ==="
all_pass=1

# Phase A: pre-push — no pr.json. Null PR head must not be drift.
run_phase "phase A (pre-push, no PR)"

# Phase B: post-push — pr.json with matching head_sha.
cat > "${run_dir}/pr.json" <<JSON
{
  "schema_version": 1,
  "url": "https://github.com/example/repo/pull/77",
  "number": 77,
  "branch": "${branch}",
  "head_ref": "${branch}",
  "head_sha": "${head_sha}",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z"
}
JSON
run_phase "phase B (post-push, PR matches)"

echo ""
if [[ "$all_pass" -eq 1 ]]; then
  echo "ALL ASSERTIONS PASSED"
  exit 0
else
  echo "ONE OR MORE ASSERTIONS FAILED"
  exit 1
fi

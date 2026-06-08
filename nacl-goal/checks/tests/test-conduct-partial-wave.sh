#!/usr/bin/env bash
# Contract test: a drained wave with a mix of green and blocked clusters lands
# GOAL_BLOCKED_PARTIAL_WAVE (selectively resumable), NOT a false GOAL_OK and NOT
# a hung GOAL_NOT_OK.
#
# Hypothesis: cl-aaaa is deployed+green; cl-bbbb is blocked
# (GOAL_BLOCKED_CLUSTER_QA_UNRESOLVED); no cluster is still in-progress. Per
# aliases.md §conduct, a blocked cluster makes GOAL_OK unreachable, and once the
# wave has drained the run-level result is GOAL_BLOCKED with sub-reason
# GOAL_BLOCKED_PARTIAL_WAVE and resumable: partial. A green sibling must NOT
# abort — clusters_shipped/deployed must still count cl-aaaa.
#
# Expected: result == GOAL_BLOCKED; blocking_reason == GOAL_BLOCKED_PARTIAL_WAVE;
#           resumable == partial; clusters_blocked == 1; clusters_deployed == 1.

set -uo pipefail

CONDUCT_SH="$(cd "$(dirname "$0")/.." && pwd -P)/conduct.sh"
[[ -f "$CONDUCT_SH" ]] || { echo "FATAL: conduct.sh not found at $CONDUCT_SH"; exit 2; }

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

run_id="goal-conduct-test-partial-feed01"
run_dir="${workdir}/.tl/goal-runs/${run_id}"
mkdir -p "${run_dir}/clusters/cl-aaaa/atoms" "${run_dir}/clusters/cl-bbbb/atoms"

cat > "${run_dir}/intake.json" <<'JSON'
{ "schema_version": 1, "atoms": [], "classification_metadata": { "ambiguous": false } }
JSON

cat > "${run_dir}/plan.lock.json" <<JSON
{
  "schema_version": 1,
  "run_id": "${run_id}",
  "orchestrator": "conduct",
  "deploy_target": "dev-only",
  "cluster_dag_valid": true,
  "integration_drift": false,
  "integration_branch": "integration/goal-xyz789",
  "integration_base_sha": "feed01beef",
  "clusters": [
    { "cluster_id": "cl-aaaa", "module": "billing", "wave": 0, "depends_on_clusters": [],
      "state": "deployed", "pr_url": null, "cluster_final_sha": "aaa",
      "atoms": ["atom-1"], "qa": { "required": false, "aggregate_status": "NOT_RUN" } },
    { "cluster_id": "cl-bbbb", "module": "reporting", "wave": 1, "depends_on_clusters": [],
      "state": "blocked", "block_code": "GOAL_BLOCKED_CLUSTER_QA_UNRESOLVED", "pr_url": null,
      "atoms": ["atom-2"], "qa": { "required": true, "aggregate_status": "FAILED" } }
  ]
}
JSON

echo '{"atom_id":"atom-1","state":"verified"}' > "${run_dir}/clusters/cl-aaaa/atoms/atom-1.state.json"
echo '{"atom_id":"atom-2","state":"failed"}'   > "${run_dir}/clusters/cl-bbbb/atoms/atom-2.state.json"
echo '{"schema_version":1,"dev_verified":true}' > "${run_dir}/dev-verified.json"

for f in regression-baseline.json regression-postfix.json; do
  cat > "${run_dir}/${f}" <<'JSON'
{ "schema_version": 1, "command": "npm test", "runner": "vitest", "exit_code": 0,
  "tests": { "passed": ["t1"], "failed": [], "skipped": [] } }
JSON
done

echo "=== Contract test: conduct.sh drained mixed wave -> GOAL_BLOCKED_PARTIAL_WAVE ==="
out=$(cd "$workdir" && bash "$CONDUCT_SH" --run-id "$run_id" 2>&1)

result=$(echo "$out" | grep '^result:' | head -n 1 | sed 's/^result: //')
reason=$(echo "$out" | grep '^  - blocking_reason:' | head -n 1 | sed 's/^  - blocking_reason: //')
resumable=$(echo "$out" | grep '^  - resumable:' | head -n 1 | sed 's/^  - resumable: //')
blocked=$(echo "$out" | grep '^  - clusters_blocked:' | head -n 1 | sed 's/^  - clusters_blocked: //')
deployed=$(echo "$out" | grep '^  - clusters_deployed:' | head -n 1 | sed 's/^  - clusters_deployed: //')

all_pass=1
[[ "$result" == "GOAL_BLOCKED" ]]                       || { echo "  FAIL result=${result}"; all_pass=0; }
[[ "$reason" == "GOAL_BLOCKED_PARTIAL_WAVE" ]]          || { echo "  FAIL blocking_reason=${reason}"; all_pass=0; }
[[ "$resumable" == "partial" ]]                         || { echo "  FAIL resumable=${resumable}"; all_pass=0; }
[[ "$blocked" == "1" ]]                                 || { echo "  FAIL clusters_blocked=${blocked}"; all_pass=0; }
[[ "$deployed" == "1" ]]                                || { echo "  FAIL clusters_deployed=${deployed} (green sibling must survive)"; all_pass=0; }

if [[ "$all_pass" -eq 1 ]]; then
  echo "  PASS  result=${result} reason=${reason} resumable=${resumable} blocked=${blocked} deployed=${deployed}"
  echo ""
  echo "ALL ASSERTIONS PASSED"
  exit 0
else
  echo "$out" | sed 's/^/      | /'
  echo "ONE OR MORE ASSERTIONS FAILED"
  exit 1
fi

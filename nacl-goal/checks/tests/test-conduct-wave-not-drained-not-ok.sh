#!/usr/bin/env bash
# Contract test: a blocked cluster does NOT prematurely emit
# GOAL_BLOCKED_PARTIAL_WAVE while a sibling is still in progress. PARTIAL_WAVE is
# a DRAINED-wave terminal; until the wave drains the run stays GOAL_NOT_OK so the
# loop keeps working the live clusters.
#
# Hypothesis: cl-aaaa is still implementing, cl-bbbb is blocked. Because a
# sibling can still progress (clusters_inprogress > 0), conduct.sh must return
# GOAL_NOT_OK, NOT GOAL_BLOCKED.
#
# Expected: result == GOAL_NOT_OK (no blocking_reason emitted).

set -uo pipefail

CONDUCT_SH="$(cd "$(dirname "$0")/.." && pwd -P)/conduct.sh"
[[ -f "$CONDUCT_SH" ]] || { echo "FATAL: conduct.sh not found at $CONDUCT_SH"; exit 2; }

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

run_id="goal-conduct-test-live-c0ffee"
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
  "integration_branch": "integration/goal-live01",
  "integration_base_sha": "c0ffee01",
  "clusters": [
    { "cluster_id": "cl-aaaa", "module": "billing", "wave": 0, "depends_on_clusters": [],
      "state": "implementing", "pr_url": null,
      "atoms": ["atom-1"], "qa": { "required": false, "aggregate_status": "NOT_RUN" } },
    { "cluster_id": "cl-bbbb", "module": "reporting", "wave": 0, "depends_on_clusters": [],
      "state": "blocked", "block_code": "GOAL_BLOCKED_CLUSTER_ATOM_FAILED", "pr_url": null,
      "atoms": ["atom-2"], "qa": { "required": true, "aggregate_status": "NOT_RUN" } }
  ]
}
JSON

echo '{"atom_id":"atom-1","state":"implementing"}' > "${run_dir}/clusters/cl-aaaa/atoms/atom-1.state.json"
echo '{"atom_id":"atom-2","state":"failed"}'       > "${run_dir}/clusters/cl-bbbb/atoms/atom-2.state.json"

echo "=== Contract test: conduct.sh blocked-cluster + live-sibling stays GOAL_NOT_OK ==="
out=$(cd "$workdir" && bash "$CONDUCT_SH" --run-id "$run_id" 2>&1)

result=$(echo "$out" | grep '^result:' | head -n 1 | sed 's/^result: //')

all_pass=1
[[ "$result" == "GOAL_NOT_OK" ]] || { echo "  FAIL result=${result} (expected GOAL_NOT_OK; wave not drained)"; all_pass=0; }

if [[ "$all_pass" -eq 1 ]]; then
  echo "  PASS  result=${result}"
  echo ""
  echo "ALL ASSERTIONS PASSED"
  exit 0
else
  echo "$out" | sed 's/^/      | /'
  echo "ONE OR MORE ASSERTIONS FAILED"
  exit 1
fi

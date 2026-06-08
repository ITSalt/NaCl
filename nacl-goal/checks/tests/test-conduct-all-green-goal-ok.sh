#!/usr/bin/env bash
# Contract test: conduct.sh reaches GOAL_OK only when EVERY cluster is
# deployed+green and the run-level regression diff is clean.
#
# Hypothesis: a conduct run with two clusters, both state=deployed with a
# VERIFIED QA aggregate (one UI-bearing, one not), all atoms verified, and a
# clean baseline/postfix, must aggregate to GOAL_OK (aliases.md §conduct
# result_decision_rule). dev-only target keeps the test hermetic — no gh/curl.
#
# Expected: result == GOAL_OK; clusters_deployed == 2; no_new_regressions true.

set -uo pipefail

CONDUCT_SH="$(cd "$(dirname "$0")/.." && pwd -P)/conduct.sh"
[[ -f "$CONDUCT_SH" ]] || { echo "FATAL: conduct.sh not found at $CONDUCT_SH"; exit 2; }

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

run_id="goal-conduct-test-ok-deadbeef"
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
  "integration_branch": "integration/goal-abc123",
  "integration_base_sha": "deadbeefcafe",
  "clusters": [
    { "cluster_id": "cl-aaaa", "module": "billing", "wave": 0, "depends_on_clusters": [],
      "state": "deployed", "pr_url": null, "cluster_final_sha": "aaa",
      "atoms": ["atom-1"], "qa": { "required": false, "aggregate_status": "NOT_RUN" } },
    { "cluster_id": "cl-bbbb", "module": "reporting", "wave": 1, "depends_on_clusters": ["cl-aaaa"],
      "state": "deployed", "pr_url": null, "cluster_final_sha": "bbb",
      "atoms": ["atom-2"], "qa": { "required": true, "aggregate_status": "VERIFIED" } }
  ]
}
JSON

echo '{"atom_id":"atom-1","state":"verified"}' > "${run_dir}/clusters/cl-aaaa/atoms/atom-1.state.json"
echo '{"atom_id":"atom-2","state":"verified"}' > "${run_dir}/clusters/cl-bbbb/atoms/atom-2.state.json"
echo '{"schema_version":1,"dev_verified":true}' > "${run_dir}/dev-verified.json"

for f in regression-baseline.json regression-postfix.json; do
  cat > "${run_dir}/${f}" <<'JSON'
{ "schema_version": 1, "command": "npm test", "runner": "vitest", "exit_code": 0,
  "tests": { "passed": ["t1", "t2"], "failed": [], "skipped": [] } }
JSON
done

echo "=== Contract test: conduct.sh all-clusters-green reaches GOAL_OK ==="
out=$(cd "$workdir" && bash "$CONDUCT_SH" --run-id "$run_id" 2>&1)

result=$(echo "$out" | grep '^result:' | head -n 1 | sed 's/^result: //')
deployed=$(echo "$out" | grep '^  - clusters_deployed:' | head -n 1 | sed 's/^  - clusters_deployed: //')
noreg=$(echo "$out" | grep '^  - no_new_regressions:' | head -n 1 | sed 's/^  - no_new_regressions: //')

all_pass=1
[[ "$result" == "GOAL_OK" ]] || { echo "  FAIL result=${result} (expected GOAL_OK)"; all_pass=0; }
[[ "$deployed" == "2" ]]     || { echo "  FAIL clusters_deployed=${deployed} (expected 2)"; all_pass=0; }
[[ "$noreg" == "true" ]]     || { echo "  FAIL no_new_regressions=${noreg} (expected true)"; all_pass=0; }

if [[ "$all_pass" -eq 1 ]]; then
  echo "  PASS  result=${result} clusters_deployed=${deployed} no_new_regressions=${noreg}"
  echo ""
  echo "ALL ASSERTIONS PASSED"
  exit 0
else
  echo "$out" | sed 's/^/      | /'
  echo "ONE OR MORE ASSERTIONS FAILED"
  exit 1
fi

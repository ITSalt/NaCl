#!/usr/bin/env bash
set -uo pipefail

# TODO(2.10.0): wire to graph (Neo4j via Cypher). Currently emits placeholder GOAL_PROOF.
# Truth source: Wave node {number: N} and all linked Task nodes in the graph.
# Queries must match the six-status vocabulary: PASS / UNVERIFIED / BLOCKED /
# NO_INFRA / RUNNER_BROKEN / REGRESSION stored on Task.status.

WAVE_N="${1:-}"

if [[ -z "$WAVE_N" ]]; then
  echo "usage: wave.sh <N>" >&2
  echo "GOAL_PROOF"
  echo "alias: wave:?"
  echo "tier: M"
  echo "check_command: nacl-goal/checks/wave.sh <N>"
  echo "result: GOAL_BLOCKED"
  echo "evidence:"
  echo "  - blocking_reason: check_script_failed"
  echo "  - error: missing required argument N"
  echo "  - placeholder: true"
  echo "turns_so_far: 0"
  echo "observed_tokens: 0"
  echo "elapsed: 0m"
  echo "END_GOAL_PROOF"
  exit 0
fi

echo "total_tasks: 0"
echo "pass: 0"
echo "unverified: 0"
echo "blocked: 0"
echo "regression: 0"
echo "no_infra: 0"
echo "runner_broken: 0"
echo "last_status_transition: 1970-01-01T00:00:00Z"
echo "graph_state_hash: 0000000000000000000000000000000000000000"

echo "GOAL_PROOF"
echo "alias: wave:${WAVE_N}"
echo "tier: M"
echo "check_command: nacl-goal/checks/wave.sh ${WAVE_N}"
echo "result: GOAL_NOT_OK"
echo "evidence:"
echo "  - total_tasks: 0"
echo "  - pass: 0"
echo "  - unverified: 0"
echo "  - blocked: 0"
echo "  - regression: 0"
echo "  - no_infra: 0"
echo "  - runner_broken: 0"
echo "  - last_status_transition: 1970-01-01T00:00:00Z"
echo "  - graph_state_hash: 0000000000000000000000000000000000000000"
echo "  - placeholder: true"
echo "turns_so_far: 0"
echo "observed_tokens: 0"
echo "elapsed: 0m"
echo "END_GOAL_PROOF"

exit 0

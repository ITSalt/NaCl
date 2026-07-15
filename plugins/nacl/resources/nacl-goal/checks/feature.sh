#!/usr/bin/env bash
set -uo pipefail

# TODO(2.10.1): wire to staging health check and graph. Currently emits placeholder GOAL_PROOF.
# Truth source:
#   - graph FeatureRequest node {id: FR-NNN} status
#   - staging deployment API or health endpoint to verify FR is deployed
#   - health check result (PASS / FAIL) from the staging environment

FR_ID="${1:-}"

if [[ -z "$FR_ID" ]]; then
  echo "usage: feature.sh <FR-NNN>" >&2
  echo "GOAL_PROOF"
  echo "alias: feature:?"
  echo "tier: L"
  echo "check_command: nacl-goal/checks/feature.sh <FR-NNN>"
  echo "result: GOAL_BLOCKED"
  echo "evidence:"
  echo "  - blocking_reason: check_script_failed"
  echo "  - error: missing required argument FR-NNN"
  echo "  - placeholder: true"
  echo "turns_so_far: 0"
  echo "observed_tokens: 0"
  echo "elapsed: 0m"
  echo "END_GOAL_PROOF"
  exit 0
fi

echo "GOAL_PROOF"
echo "alias: feature:${FR_ID}"
echo "tier: L"
echo "check_command: nacl-goal/checks/feature.sh ${FR_ID}"
echo "result: GOAL_NOT_OK"
echo "evidence:"
echo "  - placeholder: true"
echo "turns_so_far: 0"
echo "observed_tokens: 0"
echo "elapsed: 0m"
echo "END_GOAL_PROOF"

exit 0

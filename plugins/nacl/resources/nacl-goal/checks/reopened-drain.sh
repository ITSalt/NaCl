#!/usr/bin/env bash
set -uo pipefail

# TODO(2.10.0): wire to YouGile API. Currently emits placeholder GOAL_PROOF.
# Truth source: YouGile board API — column list for the current project board.
# Count items in the "Reopened" column, track movement, verify API reachability.
# Optional --board=<BOARD-ID> overrides the default project board (read from .tl/config).

BOARD_ID=""
for arg in "$@"; do
  case "$arg" in
    --board=*) BOARD_ID="${arg#--board=}" ;;
  esac
done

echo "reopened_count: 0"
echo "drained_this_run: 0"
echo "bugs_pending: 0"
echo "in_review_count: 0"
echo "new_arrivals_this_turn: 0"
echo "youGile_api_reachable: false"

echo "GOAL_PROOF"
echo "alias: reopened-drain"
echo "tier: M"
echo "check_command: nacl-goal/checks/reopened-drain.sh${BOARD_ID:+ --board=${BOARD_ID}}"
echo "result: GOAL_NOT_OK"
echo "evidence:"
echo "  - reopened_count: 0"
echo "  - drained_this_run: 0"
echo "  - bugs_pending: 0"
echo "  - in_review_count: 0"
echo "  - new_arrivals_this_turn: 0"
echo "  - youGile_api_reachable: false"
echo "  - placeholder: true"
echo "turns_so_far: 0"
echo "observed_tokens: 0"
echo "elapsed: 0m"
echo "END_GOAL_PROOF"

exit 0

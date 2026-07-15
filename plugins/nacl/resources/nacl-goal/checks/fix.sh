#!/usr/bin/env bash
set -uo pipefail

# TODO(2.10.0): wire to test runner and git. Currently emits placeholder GOAL_PROOF.
# Truth source:
#   - test runner (npm test / pytest / etc.) for test_status
#   - git log / git show for regression_test_committed and regression_test_was_red
#   - gh pr view for pr_url and pr_state
#   - graph for linked_uc_or_tech (Bug node → UC/TECH relationship)
# Constraint: regression_test_was_red must be verified against commit history per
# feedback_regression_test_before_fix.md — the test must have been RED before the fix commit.

BUG_ID="${1:-}"

if [[ -z "$BUG_ID" ]]; then
  echo "usage: fix.sh <BUG-NNN>" >&2
  echo "GOAL_PROOF"
  echo "alias: fix:?"
  echo "tier: S"
  echo "check_command: nacl-goal/checks/fix.sh <BUG-NNN>"
  echo "result: GOAL_BLOCKED"
  echo "evidence:"
  echo "  - blocking_reason: check_script_failed"
  echo "  - error: missing required argument BUG-NNN"
  echo "  - placeholder: true"
  echo "turns_so_far: 0"
  echo "observed_tokens: 0"
  echo "elapsed: 0m"
  echo "END_GOAL_PROOF"
  exit 0
fi

echo "test_status: not_found"
echo "regression_test_committed: false"
echo "regression_test_was_red: false"
echo "pr_url: null"
echo "pr_state: none"
echo "no_new_regressions: false"
echo "linked_uc_or_tech: null"

echo "GOAL_PROOF"
echo "alias: fix:${BUG_ID}"
echo "tier: S"
echo "check_command: nacl-goal/checks/fix.sh ${BUG_ID}"
echo "result: GOAL_NOT_OK"
echo "evidence:"
echo "  - test_status: not_found"
echo "  - regression_test_committed: false"
echo "  - regression_test_was_red: false"
echo "  - pr_url: null"
echo "  - pr_state: none"
echo "  - no_new_regressions: false"
echo "  - linked_uc_or_tech: null"
echo "  - placeholder: true"
echo "turns_so_far: 0"
echo "observed_tokens: 0"
echo "elapsed: 0m"
echo "END_GOAL_PROOF"

exit 0

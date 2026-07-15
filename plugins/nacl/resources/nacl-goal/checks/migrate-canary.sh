#!/usr/bin/env bash
set -uo pipefail

# TODO(2.10.1): wire to graph and MIGRATION-REPORT.md. Currently emits placeholder GOAL_PROOF.
# Truth source: MIGRATION-REPORT.md coverage percentage for the canary project,
# graph node for retrospective gate status.
# CRITICAL: this script must check whether the retrospective gate has already been passed.
# If it has, emit GOAL_BLOCKED with blocking_reason: retrospective_gate_already_passed_use_interactive_skill.
# The migrate-canary alias must never execute post-canary steps autonomously per
# feedback_migration_retrospective_gate.md.

echo "GOAL_PROOF"
echo "alias: migrate-canary"
echo "tier: L"
echo "check_command: nacl-goal/checks/migrate-canary.sh"
echo "result: GOAL_NOT_OK"
echo "evidence:"
echo "  - placeholder: true"
echo "turns_so_far: 0"
echo "observed_tokens: 0"
echo "elapsed: 0m"
echo "END_GOAL_PROOF"

exit 0

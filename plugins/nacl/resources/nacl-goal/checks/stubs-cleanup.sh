#!/usr/bin/env bash
set -uo pipefail

# TODO(2.10.1): wire to graph (stub-registry.json via nacl-tl-stubs). Currently emits placeholder GOAL_PROOF.
# Truth source: stub-registry.json for module <MOD-ID> — count stubs at severity >= medium
# that have not yet been replaced with real implementations. Graph nodes: StubEntry linked to Module.

MOD_ID="${1:-}"

if [[ -z "$MOD_ID" ]]; then
  echo "usage: stubs-cleanup.sh <MOD-ID>" >&2
  echo "GOAL_PROOF"
  echo "alias: stubs-cleanup:?"
  echo "tier: S"
  echo "check_command: nacl-goal/checks/stubs-cleanup.sh <MOD-ID>"
  echo "result: GOAL_BLOCKED"
  echo "evidence:"
  echo "  - blocking_reason: check_script_failed"
  echo "  - error: missing required argument MOD-ID"
  echo "  - placeholder: true"
  echo "turns_so_far: 0"
  echo "observed_tokens: 0"
  echo "elapsed: 0m"
  echo "END_GOAL_PROOF"
  exit 0
fi

echo "GOAL_PROOF"
echo "alias: stubs-cleanup:${MOD_ID}"
echo "tier: S"
echo "check_command: nacl-goal/checks/stubs-cleanup.sh ${MOD_ID}"
echo "result: GOAL_NOT_OK"
echo "evidence:"
echo "  - placeholder: true"
echo "turns_so_far: 0"
echo "observed_tokens: 0"
echo "elapsed: 0m"
echo "END_GOAL_PROOF"

exit 0

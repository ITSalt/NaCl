#!/usr/bin/env bash
set -uo pipefail

# TODO(2.10.0): wire to graph (nacl-sa-validate validator results). Currently emits placeholder GOAL_PROOF.
# Truth source: graph validator nodes linked to Module <MOD-ID>. Validators L1-L13 and XL6-XL9
# are stored as ValidatorResult nodes with a pass/fail status and last_run_at timestamp.
# L10-L13 are opt-in layers (2.15+): zero nodes of the layer's labels = vacuous PASS.
# Query must check whether BA layer exists for XL pass determination.

MOD_ID="${1:-}"

if [[ -z "$MOD_ID" ]]; then
  echo "usage: validate.sh <MOD-ID>" >&2
  echo "GOAL_PROOF"
  echo "alias: validate:?"
  echo "tier: S"
  echo "check_command: nacl-goal/checks/validate.sh <MOD-ID>"
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

echo "l1_pass: false"
echo "l2_pass: false"
echo "l3_pass: false"
echo "l4_pass: false"
echo "l5_pass: false"
echo "l6_pass: false"
echo "l7_pass: false"
echo "l8_pass: false"
echo "l9_pass: false"
echo "l10_pass: false"
echo "l11_pass: false"
echo "l12_pass: false"
echo "l13_pass: false"
echo "xl_pass: not_applicable"
echo "failing_validators: l1 l2 l3 l4 l5 l6 l7 l8 l9 l10 l11 l12 l13"
echo "last_run_at: 1970-01-01T00:00:00Z"

echo "GOAL_PROOF"
echo "alias: validate:${MOD_ID}"
echo "tier: S"
echo "check_command: nacl-goal/checks/validate.sh ${MOD_ID}"
echo "result: GOAL_NOT_OK"
echo "evidence:"
echo "  - l1_pass: false"
echo "  - l2_pass: false"
echo "  - l3_pass: false"
echo "  - l4_pass: false"
echo "  - l5_pass: false"
echo "  - l6_pass: false"
echo "  - l7_pass: false"
echo "  - l8_pass: false"
echo "  - l9_pass: false"
echo "  - l10_pass: false"
echo "  - l11_pass: false"
echo "  - l12_pass: false"
echo "  - l13_pass: false"
echo "  - xl_pass: not_applicable"
echo "  - failing_validators: l1 l2 l3 l4 l5 l6 l7 l8 l9 l10 l11 l12 l13"
echo "  - last_run_at: 1970-01-01T00:00:00Z"
echo "  - placeholder: true"
echo "turns_so_far: 0"
echo "observed_tokens: 0"
echo "elapsed: 0m"
echo "END_GOAL_PROOF"

exit 0

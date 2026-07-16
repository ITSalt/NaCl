#!/usr/bin/env bash
set -uo pipefail

# TODO(2.10.1): wire to graph state tracking and transcript analysis. Currently emits placeholder STOP_SIGNALS_PROBE.
# Truth source:
#   - graph state hash comparison across the last 3 turns (no_progress_3_turns)
#   - transcript error string comparison across consecutive turns (same_error_twice)
#   - graph: task status transitions for nodes outside alias scope (regression_outside_scope, scope_creep)
#   - gate-fire-detector.md signature matching (gate_violation_attempt)
#
# NOTE: probe-stop-signals.sh does NOT emit GOAL_PROOF. It emits STOP_SIGNALS_PROBE.
# Its output is included in the evidence block of the alias proof script that calls it.
# The alias script is responsible for reading this output and setting GOAL_BLOCKED when
# any signal is true.

echo "STOP_SIGNALS_PROBE"
echo "no_progress_3_turns: false"
echo "same_error_twice: false"
echo "regression_outside_scope: false"
echo "scope_creep: false"
echo "gate_violation_attempt: false"
echo "placeholder: true"
echo "END_STOP_SIGNALS_PROBE"

exit 0

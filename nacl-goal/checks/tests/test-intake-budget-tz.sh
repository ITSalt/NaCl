#!/usr/bin/env bash
# Regression test: intake.sh budget elapsed must be TZ-independent.
#
# Hypothesis: when started_at is a UTC ISO-8601 timestamp ending in 'Z',
# the elapsed wall-clock computed by intake.sh must equal real elapsed
# regardless of the process TZ. The BSD date branch (macOS) mistakenly
# treats the 'Z' as a literal character in the format string, parsing the
# timestamp as local time. With TZ=Europe/Moscow (UTC+3) this inflates
# started_epoch by 10800 s, yielding elapsed ≈ 206m instead of ≈ 26m,
# causing GOAL_BUDGET_EXHAUSTED even though the wall-clock limit (10800 s)
# has not been reached.
#
# Expected: both TZ=UTC and TZ=Europe/Moscow produce elapsed: 26m and
# result != GOAL_BUDGET_EXHAUSTED.

set -uo pipefail

# Resolve to an absolute path: run_case cd's into the workdir, where a
# relative path would no longer resolve.
INTAKE_SH="$(cd "$(dirname "$0")/.." && pwd -P)/intake.sh"

# Sanity-check the script exists.
if [[ ! -f "$INTAKE_SH" ]]; then
  echo "FATAL: intake.sh not found at $INTAKE_SH"
  exit 2
fi

# Create isolated workdir; clean up on exit.
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

run_id="goal-intake-test-tz-cafebabe"

# Build artifact tree: only budget.json present (no plan.lock.json, no pr.json).
run_dir="${workdir}/.tl/goal-runs/${run_id}"
mkdir -p "$run_dir"

# Compute started_at exactly 26 minutes (1560 s) before now.
# CRITICAL: use epoch arithmetic + UTC-correct dual-branch formatting
# so this test itself never replicates the bug under test.
start_epoch=$(( $(date +%s) - 1560 ))
started_at=$(date -u -d "@${start_epoch}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -r "${start_epoch}" +%Y-%m-%dT%H:%M:%SZ)

cat > "${run_dir}/budget.json" <<JSON
{
  "schema_version": 1,
  "run_id": "${run_id}",
  "started_at": "${started_at}",
  "wall_clock_limit_seconds": 10800,
  "turn_soft_limit": 200,
  "token_soft_limit": 4000000,
  "inner_skill_runs": []
}
JSON

echo "=== Regression test: intake.sh budget TZ-independence ==="
echo "Hypothesis: elapsed must be ~26m and result must not be GOAL_BUDGET_EXHAUSTED"
echo "           regardless of TZ=UTC or TZ=Europe/Moscow."
echo "started_at: ${started_at}"
echo ""

all_pass=1

run_case() {
  local tz="$1"
  local out
  out=$(cd "$workdir" && TZ="$tz" bash "$INTAKE_SH" --run-id "$run_id" 2>&1)

  local elapsed_line result_line
  elapsed_line=$(echo "$out" | grep '^elapsed:' | head -n 1)
  result_line=$(echo  "$out" | grep '^result:'  | head -n 1)

  local elapsed_val result_val
  elapsed_val="${elapsed_line#elapsed: }"
  result_val="${result_line#result: }"

  local case_pass=1

  # Assertion (a): elapsed must be "26m" exactly.
  if [[ "$elapsed_val" != "26m" ]]; then
    case_pass=0
    all_pass=0
  fi

  # Assertion (b): result must NOT be GOAL_BUDGET_EXHAUSTED.
  if [[ "$result_val" == "GOAL_BUDGET_EXHAUSTED" ]]; then
    case_pass=0
    all_pass=0
  fi

  if [[ "$case_pass" -eq 1 ]]; then
    echo "  PASS  TZ=${tz}  elapsed=${elapsed_val}  result=${result_val}"
  else
    echo "  FAIL  TZ=${tz}  elapsed=${elapsed_val}  result=${result_val}"
    echo "        (expected elapsed=26m, result!=GOAL_BUDGET_EXHAUSTED)"
  fi
}

run_case "Europe/Moscow"
run_case "UTC"

echo ""
if [[ "$all_pass" -eq 1 ]]; then
  echo "ALL ASSERTIONS PASSED"
  exit 0
else
  echo "ONE OR MORE ASSERTIONS FAILED"
  exit 1
fi

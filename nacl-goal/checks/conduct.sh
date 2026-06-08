#!/usr/bin/env bash
set -uo pipefail

# /nacl-goal conduct check script.
#
# Arg schema (per nacl-goal/aliases.md §conduct):
#   --run-id <goal-run-id>     required
#
# Reads ONLY from .tl/goal-runs/<run_id>/ (incl. clusters/<cluster_id>/ subdirs)
# plus a small set of read-only external sources (git, gh, curl). The user's
# free-text goal NEVER reaches the shell arg surface — it lives in the
# gitignored request.json.
#
# `conduct` is the multi-cluster sibling of `intake`: one heterogeneous goal is
# materialized into module-aligned CLUSTERS, each shipping its own branch → PR →
# CI → staging, wave-ordered by cross-cluster dependencies. This script
# aggregates per-cluster state and decides the run-level result.
#
# Emits exactly one GOAL_PROOF block per invocation. Always exits 0; the
# evaluator cannot see exit codes.
#
# Truth sources (mapped to evidence keys per aliases.md §conduct):
#   plan.lock.json                  → orchestrator, integration_branch,
#                                     integration_base_sha, deploy_target,
#                                     clusters[] (cluster_id, wave, state, pr_url,
#                                     ci_status, deploy_status, qa, cluster_final_sha,
#                                     depends_on_clusters, atoms)
#   clusters/<id>/atoms/*.state.json → per-cluster atoms_verified / unsupported
#   clusters/<id>/pr.json (fallback gh) → authoritative pr_url / pr_head_sha / ci
#   regression-baseline.json        → baseline_command
#   regression-postfix.json         → no_new_regressions, regression_check_mode
#   curl health_endpoint            → per-cluster deploy_status (when live)
#   budget.json                     → elapsed (wall-clock since started_at)
#
# Result decision (per aliases.md §conduct §result_decision_rule):
#   GOAL_OK               — every cluster deployed+green AND no blocked/skipped/unsupported
#   GOAL_NOT_OK           — default while any cluster still implementing / CI pending
#   GOAL_BLOCKED          — GOAL_BLOCKED_PARTIAL_WAVE (wave drained with a mix of
#                           green and blocked/skipped clusters), or a run-level block
#   GOAL_BUDGET_EXHAUSTED — wall-clock budget exceeded
#
# Retry policy: per nacl-goal/retry-policy.md (transient gh/curl retried 5s/15s/45s).

# ----------------------------------------------------------------------
# 1. Argument parsing
# ----------------------------------------------------------------------

RUN_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id)
      RUN_ID="${2:-}"
      shift 2 || break
      ;;
    --run-id=*)
      RUN_ID="${1#--run-id=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

emit_proof_and_exit() {
  # Args: result, list of "key: value" evidence lines (one per arg).
  local result="$1"
  shift
  echo "GOAL_PROOF"
  echo "alias: conduct"
  echo "tier: L"
  echo "check_command: nacl-goal/checks/conduct.sh --run-id ${RUN_ID:-?}"
  echo "result: ${result}"
  echo "evidence:"
  local line
  for line in "$@"; do
    echo "  - ${line}"
  done
  echo "turns_so_far: ${TURNS_SO_FAR:-0}"
  echo "observed_tokens: ${OBSERVED_TOKENS:-0}"
  echo "elapsed: ${ELAPSED_DISPLAY:-0m}"
  echo "END_GOAL_PROOF"
  exit 0
}

if [[ -z "$RUN_ID" ]]; then
  emit_proof_and_exit "GOAL_BLOCKED" \
    "blocking_reason: check_script_failed" \
    "error: missing required argument --run-id <goal-run-id>"
fi

RUN_DIR=".tl/goal-runs/${RUN_ID}"
if [[ ! -d "$RUN_DIR" ]]; then
  emit_proof_and_exit "GOAL_BLOCKED" \
    "blocking_reason: run_artifacts_missing" \
    "run_id: ${RUN_ID}" \
    "expected_path: ${RUN_DIR}"
fi

# ----------------------------------------------------------------------
# 2. Read artifacts (jq strongly preferred; degrade where possible)
# ----------------------------------------------------------------------

HAVE_JQ=1
if ! command -v jq >/dev/null 2>&1; then
  HAVE_JQ=0
fi

json_get() {
  # Usage: json_get <file> <jq path expression> [<default>]
  local file="$1"
  local path="$2"
  local default="${3:-null}"
  if [[ ! -f "$file" || "$HAVE_JQ" -eq 0 ]]; then
    echo "$default"
    return
  fi
  local v
  v=$(jq -r "$path // \"\"" "$file" 2>/dev/null) || v=""
  if [[ -z "$v" || "$v" == "null" ]]; then
    echo "$default"
  else
    echo "$v"
  fi
}

PLAN_FILE="${RUN_DIR}/plan.lock.json"
INTAKE_FILE="${RUN_DIR}/intake.json"
CLUSTERS_DIR="${RUN_DIR}/clusters"
BUDGET_FILE="${RUN_DIR}/budget.json"
BASELINE_FILE="${RUN_DIR}/regression-baseline.json"
POSTFIX_FILE="${RUN_DIR}/regression-postfix.json"

PLAN_LOCKED="false"
[[ -f "$PLAN_FILE" ]] && PLAN_LOCKED="true"

ORCHESTRATOR=$(json_get "$PLAN_FILE" '.orchestrator' "intake")
INTEGRATION_BRANCH=$(json_get "$PLAN_FILE" '.integration_branch' "null")
INTEGRATION_BASE_SHA=$(json_get "$PLAN_FILE" '.integration_base_sha' "null")
DEPLOY_TARGET=$(json_get "$PLAN_FILE" '.deploy_target' "")
INTEGRATION_DRIFT=$(json_get "$PLAN_FILE" '.integration_drift' "false")

# A conduct run must be a conduct lock. A missing/intake lock here is the wrong
# check script for the run — surface it instead of silently passing.
if [[ "$PLAN_LOCKED" != "true" ]]; then
  emit_proof_and_exit "GOAL_BLOCKED" \
    "blocking_reason: plan_lock_missing" \
    "plan_locked: false" \
    "expected_path: ${PLAN_FILE}"
fi
if [[ "$ORCHESTRATOR" != "conduct" ]]; then
  emit_proof_and_exit "GOAL_BLOCKED" \
    "blocking_reason: not_a_conduct_run" \
    "orchestrator: ${ORCHESTRATOR}" \
    "hint: use nacl-goal/checks/intake.sh for orchestrator=intake"
fi

INTAKE_STATUS="ambiguous"
if [[ -f "$INTAKE_FILE" ]]; then
  if [[ "$HAVE_JQ" -eq 1 ]]; then
    IS_AMBIGUOUS=$(jq -r '.classification_metadata.ambiguous // false' "$INTAKE_FILE" 2>/dev/null || echo "true")
    if [[ "$IS_AMBIGUOUS" == "true" ]]; then
      INTAKE_STATUS="refused"
    else
      INTAKE_STATUS="classified"
    fi
  else
    INTAKE_STATUS="classified"
  fi
fi

# cluster_dag_valid: by the time plan.lock.json exists, the topological sort over
# the cluster DAG has succeeded (else the wrapper refused with CLUSTER_DAG_CYCLE).
# An explicit flag wins if the wrapper recorded one.
CLUSTER_DAG_VALID=$(json_get "$PLAN_FILE" '.cluster_dag_valid' "true")

# ----------------------------------------------------------------------
# 3. Budget — elapsed wall-clock since started_at (Tier L default 16h)
# ----------------------------------------------------------------------

ELAPSED_SECONDS=0
ELAPSED_DISPLAY="0m"
WALL_CLOCK_LIMIT=57600   # 16h Tier L default
if [[ -f "$BUDGET_FILE" && "$HAVE_JQ" -eq 1 ]]; then
  STARTED_AT=$(jq -r '.started_at // empty' "$BUDGET_FILE" 2>/dev/null)
  WALL_CLOCK_LIMIT=$(jq -r '.wall_clock_limit_seconds // 57600' "$BUDGET_FILE" 2>/dev/null)
  if [[ -n "$STARTED_AT" ]]; then
    # -u on both branches: started_at is UTC. Without -u, BSD date parses the
    # literal "Z" as local time and inflates elapsed by the UTC offset.
    started_epoch=$(date -u -d "$STARTED_AT" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED_AT" +%s 2>/dev/null || echo "")
    if [[ -n "$started_epoch" ]]; then
      now_epoch=$(date +%s)
      ELAPSED_SECONDS=$((now_epoch - started_epoch))
      ELAPSED_DISPLAY="$((ELAPSED_SECONDS / 60))m"
    fi
  fi
fi

# ----------------------------------------------------------------------
# 4. External-probe helpers (gh / curl) — reused per cluster when live
# ----------------------------------------------------------------------

gh_pr_view_retry() {
  local pr="$1" attempt out
  for attempt in 0 5 15 45; do
    [[ "$attempt" -gt 0 ]] && sleep "$attempt"
    if out=$(gh pr view "$pr" --json headRefOid,state,statusCheckRollup 2>/dev/null); then
      echo "$out"; return 0
    fi
  done
  return 1
}

gh_ci_status() {
  # Echoes success|failure|pending from a gh pr view JSON blob on stdin.
  local blob="$1"
  local fail pend total
  fail=$(echo "$blob" | jq -r '[.statusCheckRollup[]? | select(.conclusion=="FAILURE" or .conclusion=="CANCELLED" or .conclusion=="TIMED_OUT")] | length' 2>/dev/null || echo "0")
  pend=$(echo "$blob" | jq -r '[.statusCheckRollup[]? | select(.status=="IN_PROGRESS" or .status=="QUEUED" or .status=="PENDING")] | length' 2>/dev/null || echo "0")
  total=$(echo "$blob" | jq -r '.statusCheckRollup | length' 2>/dev/null || echo "0")
  if [[ "$total" -gt 0 ]]; then
    if [[ "$fail" -gt 0 ]]; then echo "failure"
    elif [[ "$pend" -gt 0 ]]; then echo "pending"
    else echo "success"; fi
  else
    echo ""
  fi
}

# ----------------------------------------------------------------------
# 5. Per-cluster aggregation
# ----------------------------------------------------------------------

CLUSTERS_TOTAL=$(json_get "$PLAN_FILE" '.clusters | length' "0")

CLUSTERS_SHIPPED=0
CLUSTERS_DEPLOYED=0
CLUSTERS_BLOCKED=0
CLUSTERS_SKIPPED=0
CLUSTERS_UNSUPPORTED=0
CLUSTERS_INPROGRESS=0
ATOMS_TOTAL=0
ATOMS_IMPLEMENTED=0
UNSUPPORTED_ATOMS_COUNT=0
ALL_CLUSTERS_GREEN="true"
PRS_OPENED_JSON="[]"
PER_CLUSTER_JSON="[]"
FIRST_BLOCK_CODE=""

if [[ "$HAVE_JQ" -eq 1 && "$CLUSTERS_TOTAL" -gt 0 ]]; then
  cluster_ids=$(jq -r '.clusters[].cluster_id' "$PLAN_FILE" 2>/dev/null)
  while IFS= read -r cid; do
    [[ -z "$cid" ]] && continue
    c_wave=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .wave // 0' "$PLAN_FILE" 2>/dev/null)
    c_state=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .state // "pending"' "$PLAN_FILE" 2>/dev/null)
    c_pr_url=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .pr_url // "null"' "$PLAN_FILE" 2>/dev/null)
    c_ci=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .ci_status // "pending"' "$PLAN_FILE" 2>/dev/null)
    c_deploy=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .deploy_status // "n/a"' "$PLAN_FILE" 2>/dev/null)
    c_qa=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .qa.aggregate_status // "NOT_RUN"' "$PLAN_FILE" 2>/dev/null)
    c_qa_required=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .qa.required // false' "$PLAN_FILE" 2>/dev/null)
    c_block=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .block_code // ""' "$PLAN_FILE" 2>/dev/null)
    c_final_sha=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | .cluster_final_sha // "null"' "$PLAN_FILE" 2>/dev/null)
    c_atoms_total=$(jq -r --arg id "$cid" '.clusters[] | select(.cluster_id==$id) | (.atoms | length) // 0' "$PLAN_FILE" 2>/dev/null)

    # Authoritative atom counts from the cluster's own state files (override recorded).
    c_atoms_dir="${CLUSTERS_DIR}/${cid}/atoms"
    c_atoms_verified=0
    c_atoms_unsupported=0
    if [[ -d "$c_atoms_dir" ]]; then
      file_total=0
      for sf in "$c_atoms_dir"/*.state.json; do
        [[ -f "$sf" ]] || continue
        file_total=$((file_total + 1))
        st=$(json_get "$sf" '.state' "pending")
        [[ "$st" == "verified" ]] && c_atoms_verified=$((c_atoms_verified + 1))
        [[ "$st" == "unsupported" ]] && c_atoms_unsupported=$((c_atoms_unsupported + 1))
      done
      [[ "$file_total" -gt 0 ]] && c_atoms_total="$file_total"
    fi

    # Authoritative CI via gh when the cluster has a real PR and gh is present.
    c_pr_file="${CLUSTERS_DIR}/${cid}/pr.json"
    [[ "$c_pr_url" == "null" && -f "$c_pr_file" ]] && c_pr_url=$(json_get "$c_pr_file" '.url' "null")
    if [[ "$c_pr_url" != "null" && -n "$c_pr_url" ]] && command -v gh >/dev/null 2>&1; then
      if gh_blob=$(gh_pr_view_retry "$c_pr_url"); then
        live_ci=$(gh_ci_status "$gh_blob")
        [[ -n "$live_ci" ]] && c_ci="$live_ci"
      fi
    fi

    # qa_required=false means the cluster has no UI acceptance to drive — it
    # passes the QA gate trivially. Normalize to VERIFIED for the green test.
    c_qa_effective="$c_qa"
    [[ "$c_qa_required" == "false" && ( "$c_qa" == "NOT_RUN" || "$c_qa" == "n/a" ) ]] && c_qa_effective="VERIFIED"

    # Tally by terminal state.
    case "$c_state" in
      deployed)
        CLUSTERS_DEPLOYED=$((CLUSTERS_DEPLOYED + 1))
        [[ "$c_ci" == "success" || "$DEPLOY_TARGET" == "dev-only" ]] && CLUSTERS_SHIPPED=$((CLUSTERS_SHIPPED + 1))
        ;;
      shipped|ci_passed)
        CLUSTERS_SHIPPED=$((CLUSTERS_SHIPPED + 1))
        CLUSTERS_INPROGRESS=$((CLUSTERS_INPROGRESS + 1))
        ;;
      blocked)
        CLUSTERS_BLOCKED=$((CLUSTERS_BLOCKED + 1))
        [[ -z "$FIRST_BLOCK_CODE" && -n "$c_block" ]] && FIRST_BLOCK_CODE="$c_block"
        ;;
      skipped_blocked_dependency)
        CLUSTERS_SKIPPED=$((CLUSTERS_SKIPPED + 1))
        ;;
      unsupported)
        CLUSTERS_UNSUPPORTED=$((CLUSTERS_UNSUPPORTED + 1))
        ;;
      *)
        CLUSTERS_INPROGRESS=$((CLUSTERS_INPROGRESS + 1))
        ;;
    esac

    ATOMS_TOTAL=$((ATOMS_TOTAL + c_atoms_total))
    ATOMS_IMPLEMENTED=$((ATOMS_IMPLEMENTED + c_atoms_verified))
    UNSUPPORTED_ATOMS_COUNT=$((UNSUPPORTED_ATOMS_COUNT + c_atoms_unsupported))

    # Per-cluster green test (mirrors aliases.md §conduct result_decision_rule).
    c_green="false"
    if [[ "$c_state" == "deployed" && "$c_qa_effective" == "VERIFIED" ]]; then
      if [[ "$DEPLOY_TARGET" == "staging" ]]; then
        [[ "$c_ci" == "success" && "$c_pr_url" != "null" && "$c_deploy" == "healthy" ]] && c_green="true"
      elif [[ "$DEPLOY_TARGET" == "dev-only" ]]; then
        c_green="true"
      else
        c_green="true"
      fi
    fi
    [[ "$c_green" != "true" ]] && ALL_CLUSTERS_GREEN="false"

    [[ "$c_pr_url" != "null" && -n "$c_pr_url" ]] && \
      PRS_OPENED_JSON=$(echo "$PRS_OPENED_JSON" | jq -c --arg u "$c_pr_url" '. + [$u]' 2>/dev/null || echo "$PRS_OPENED_JSON")

    PER_CLUSTER_JSON=$(echo "$PER_CLUSTER_JSON" | jq -c \
      --arg id "$cid" --argjson wave "${c_wave:-0}" --arg state "$c_state" \
      --arg pr "$c_pr_url" --arg ci "$c_ci" --arg dep "$c_deploy" \
      --arg qa "$c_qa_effective" --argjson av "$c_atoms_verified" --argjson at "${c_atoms_total:-0}" \
      '. + [{cluster_id:$id, wave:$wave, state:$state, pr_url:$pr, ci_status:$ci, deploy_status:$dep, qa_aggregate:$qa, atoms_verified:$av, atoms_total:$at}]' \
      2>/dev/null || echo "$PER_CLUSTER_JSON")
  done <<< "$cluster_ids"
fi

# ----------------------------------------------------------------------
# 6. Regression check — run-level, single integration baseline (per intake)
# ----------------------------------------------------------------------

NO_NEW_REGRESSIONS="false"
REGRESSION_CHECK_MODE="stable_ids"
BASELINE_COMMAND=$(json_get "$BASELINE_FILE" '.command' "unknown")
BASELINE_RUNNER=$(json_get "$BASELINE_FILE" '.runner' "unknown")

if [[ -f "$BASELINE_FILE" && -f "$POSTFIX_FILE" && "$HAVE_JQ" -eq 1 ]]; then
  if [[ "$BASELINE_RUNNER" == "unknown" ]]; then
    REGRESSION_CHECK_MODE="best_effort"
    bp=$(jq -r '.tests.passed | length' "$BASELINE_FILE" 2>/dev/null || echo "0")
    pp=$(jq -r '.tests.passed | length' "$POSTFIX_FILE" 2>/dev/null || echo "0")
    bf=$(jq -r '.tests.failed | length' "$BASELINE_FILE" 2>/dev/null || echo "0")
    pf=$(jq -r '.tests.failed | length' "$POSTFIX_FILE" 2>/dev/null || echo "0")
    bx=$(jq -r '.exit_code' "$BASELINE_FILE" 2>/dev/null || echo "0")
    px=$(jq -r '.exit_code' "$POSTFIX_FILE" 2>/dev/null || echo "0")
    if [[ "$pp" -ge "$bp" && "$pf" -le "$bf" ]]; then
      if [[ "$bx" != "0" || "$px" == "0" ]]; then
        NO_NEW_REGRESSIONS="true"
      fi
    fi
  else
    REGRESSION_CHECK_MODE="stable_ids"
    regressions=$(jq -n \
      --slurpfile b "$BASELINE_FILE" \
      --slurpfile p "$POSTFIX_FILE" \
      '
      ($b[0].tests.passed)  as $bp |
      ($p[0].tests.failed)  as $pf |
      ($b[0].tests.failed)  as $bf |
      (
        ($pf - $bf)
        + ($bp - ($p[0].tests.passed))
      ) | unique | length
      ' 2>/dev/null || echo "-1")
    [[ "$regressions" == "0" ]] && NO_NEW_REGRESSIONS="true"
  fi
fi

# ----------------------------------------------------------------------
# 7. dev_verified (dev-only path) — all clusters locally verified
# ----------------------------------------------------------------------

DEV_VERIFIED="n/a"
if [[ "$DEPLOY_TARGET" == "dev-only" ]]; then
  DEV_VERIFIED=$(json_get "${RUN_DIR}/dev-verified.json" '.dev_verified' "n/a")
fi

# ----------------------------------------------------------------------
# 8. Apply result_decision_rule (per aliases.md §conduct)
# ----------------------------------------------------------------------

RESULT="GOAL_NOT_OK"
BLOCKING_SUB_REASON=""

if [[ "$ELAPSED_SECONDS" -ge "$WALL_CLOCK_LIMIT" ]]; then
  RESULT="GOAL_BUDGET_EXHAUSTED"
  BLOCKING_SUB_REASON="wall_clock"
elif [[ "$INTEGRATION_DRIFT" == "true" ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="GOAL_BLOCKED_INTEGRATION_DRIFTED"
elif [[ "$CLUSTER_DAG_VALID" != "true" ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="PLAN_BLOCKED_CLUSTER_DAG_CYCLE"
elif [[ -f "$POSTFIX_FILE" && "$NO_NEW_REGRESSIONS" == "false" ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED"
elif [[ $((CLUSTERS_BLOCKED + CLUSTERS_SKIPPED + CLUSTERS_UNSUPPORTED)) -gt 0 ]]; then
  if [[ "$CLUSTERS_INPROGRESS" -gt 0 ]]; then
    # Wave not drained yet — siblings can still progress.
    RESULT="GOAL_NOT_OK"
  else
    # Wave drained with a mix of green and blocked/skipped/unsupported clusters.
    RESULT="GOAL_BLOCKED"
    BLOCKING_SUB_REASON="GOAL_BLOCKED_PARTIAL_WAVE"
  fi
else
  # No blockers and nothing blocked/skipped — evaluate success_condition.
  ok="true"
  [[ "$INTAKE_STATUS" != "classified" ]] && ok="false"
  [[ "$PLAN_LOCKED" != "true" ]] && ok="false"
  [[ "$CLUSTER_DAG_VALID" != "true" ]] && ok="false"
  [[ "$CLUSTERS_TOTAL" -eq 0 ]] && ok="false"
  [[ "$CLUSTERS_INPROGRESS" -gt 0 ]] && ok="false"
  [[ "$ATOMS_TOTAL" -eq 0 || "$ATOMS_IMPLEMENTED" -lt "$ATOMS_TOTAL" ]] && ok="false"
  [[ "$NO_NEW_REGRESSIONS" != "true" ]] && ok="false"
  [[ "$ALL_CLUSTERS_GREEN" != "true" ]] && ok="false"
  if [[ "$DEPLOY_TARGET" == "dev-only" && "$DEV_VERIFIED" != "true" ]]; then
    ok="false"
  fi
  [[ "$ok" == "true" ]] && RESULT="GOAL_OK"
fi

# ----------------------------------------------------------------------
# 9. Pre-GOAL_PROOF human-readable summary
# ----------------------------------------------------------------------

echo "orchestrator: ${ORCHESTRATOR}"
echo "intake_status: ${INTAKE_STATUS}"
echo "clusters: total=${CLUSTERS_TOTAL} shipped=${CLUSTERS_SHIPPED} deployed=${CLUSTERS_DEPLOYED} blocked=${CLUSTERS_BLOCKED} skipped=${CLUSTERS_SKIPPED} unsupported=${CLUSTERS_UNSUPPORTED} in_progress=${CLUSTERS_INPROGRESS}"
echo "atoms_implemented: ${ATOMS_IMPLEMENTED}/${ATOMS_TOTAL}"
echo "no_new_regressions: ${NO_NEW_REGRESSIONS} (mode=${REGRESSION_CHECK_MODE})"
echo "deploy_target: ${DEPLOY_TARGET}"
echo "integration_branch: ${INTEGRATION_BRANCH}"
echo "prs_opened: ${PRS_OPENED_JSON}"
echo "elapsed: ${ELAPSED_DISPLAY}"

# ----------------------------------------------------------------------
# 10. Emit GOAL_PROOF block (evidence keys in aliases.md §conduct order)
# ----------------------------------------------------------------------

evidence=(
  "intake_status: ${INTAKE_STATUS}"
  "plan_locked: ${PLAN_LOCKED}"
  "cluster_dag_valid: ${CLUSTER_DAG_VALID}"
  "clusters_total: ${CLUSTERS_TOTAL}"
  "clusters_shipped: ${CLUSTERS_SHIPPED}"
  "clusters_deployed: ${CLUSTERS_DEPLOYED}"
  "clusters_blocked: ${CLUSTERS_BLOCKED}"
  "clusters_skipped: ${CLUSTERS_SKIPPED}"
  "clusters_unsupported: ${CLUSTERS_UNSUPPORTED}"
  "prs_opened: ${PRS_OPENED_JSON}"
  "per_cluster_status: ${PER_CLUSTER_JSON}"
  "atoms_total: ${ATOMS_TOTAL}"
  "atoms_implemented: ${ATOMS_IMPLEMENTED}"
  "unsupported_atoms_count: ${UNSUPPORTED_ATOMS_COUNT}"
  "no_new_regressions: ${NO_NEW_REGRESSIONS}"
  "regression_check_mode: ${REGRESSION_CHECK_MODE}"
  "baseline_command: ${BASELINE_COMMAND}"
  "deploy_target: ${DEPLOY_TARGET:-none}"
  "integration_branch: ${INTEGRATION_BRANCH}"
  "integration_base_sha: ${INTEGRATION_BASE_SHA}"
  "dev_verified: ${DEV_VERIFIED}"
)

if [[ -n "$BLOCKING_SUB_REASON" ]]; then
  evidence+=("blocking_reason: ${BLOCKING_SUB_REASON}")
  if [[ "$BLOCKING_SUB_REASON" == "GOAL_BLOCKED_PARTIAL_WAVE" ]]; then
    evidence+=("resumable: partial")
    [[ -n "$FIRST_BLOCK_CODE" ]] && evidence+=("first_cluster_block_code: ${FIRST_BLOCK_CODE}")
  fi
fi

emit_proof_and_exit "$RESULT" "${evidence[@]}"

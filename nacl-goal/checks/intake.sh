#!/usr/bin/env bash
set -uo pipefail

# /nacl-goal intake check script.
#
# Arg schema (per nacl-goal/aliases.md):
#   --run-id <goal-run-id>     required
#
# Reads ONLY from .tl/goal-runs/<run_id>/ (and a small set of read-only
# external sources: git, gh, curl). The user's free-text goal NEVER reaches
# the shell arg surface — it lives in the gitignored request.json.
#
# Emits exactly one GOAL_PROOF block per invocation. Always exits 0; the
# evaluator cannot see exit codes.
#
# Truth sources (mapped to evidence keys per nacl-goal/aliases.md §intake):
#   plan.lock.json              → atoms_total, feature_atoms_total, branch, deploy_target
#   atoms/*.state.json          → atoms_implemented (count of state==verified),
#                                 feature_atoms_verified
#   intake.json                 → intake_status, dependency_graph_valid (sort already run)
#   goal-final-sha.txt          → goal_final_sha
#   git rev-parse HEAD          → branch_head_sha
#   pr.json (fallback gh)       → pr_url, pr_head_sha
#   gh pr view --json           → pr_head_sha (authoritative for drift), ci_status
#   regression-baseline.json    → baseline_command
#   regression-postfix.json     → no_new_regressions (mechanical diff),
#                                 regression_check_mode
#   curl health_endpoint        → deploy_status
#   curl version_endpoint (opt) → deployed_sha_matches
#   /nacl-tl-verify             → staging_functional_verified (PR2 wiring)
#   /nacl-tl-verify (local)     → dev_verified (dev-only path)
#   budget.json                 → elapsed (wall-clock since started_at)
#
# Result decision (per aliases.md §intake §result_decision_rule):
#   GOAL_OK             — all success_condition AND clauses satisfied
#   GOAL_NOT_OK         — default while atoms still implementing / CI pending
#   GOAL_BLOCKED        — any GOAL_BLOCKED_* sub-reason detected
#   GOAL_BUDGET_EXHAUSTED — wall-clock or turn/token budget exceeded
#
# Retry policy: per nacl-goal/retry-policy.md, transient gh/curl failures are
# retried with 5s/15s/45s backoff. Deterministic failures are not retried.

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
  echo "alias: intake"
  echo "tier: M"
  echo "check_command: nacl-goal/checks/intake.sh --run-id ${RUN_ID:-?}"
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
# 2. Read artifacts (jq is required; if missing, degrade to grep)
# ----------------------------------------------------------------------

HAVE_JQ=1
if ! command -v jq >/dev/null 2>&1; then
  HAVE_JQ=0
fi

json_get() {
  # Usage: json_get <file> <jq path expression> [<default>]
  # Returns the default if the file is missing, jq is missing, or the
  # path is null/absent.
  local file="$1"
  local path="$2"
  local default="${3:-null}"
  if [[ ! -f "$file" ]]; then
    echo "$default"
    return
  fi
  if [[ "$HAVE_JQ" -eq 0 ]]; then
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
ATOMS_DIR="${RUN_DIR}/atoms"
PR_FILE="${RUN_DIR}/pr.json"
BUDGET_FILE="${RUN_DIR}/budget.json"
FINAL_SHA_FILE="${RUN_DIR}/goal-final-sha.txt"
BASELINE_FILE="${RUN_DIR}/regression-baseline.json"
POSTFIX_FILE="${RUN_DIR}/regression-postfix.json"

BRANCH=$(json_get "$PLAN_FILE" '.branch' "")
DEPLOY_TARGET=$(json_get "$PLAN_FILE" '.deploy_target' "")
ATOMS_TOTAL=$(json_get "$PLAN_FILE" '.atoms | length' "0")
FEATURE_ATOMS_TOTAL=$(json_get "$PLAN_FILE" '[.atoms[] | select(.type=="FEATURE_SMALL")] | length' "0")

INTAKE_STATUS="ambiguous"
if [[ -f "$INTAKE_FILE" ]]; then
  if [[ "$HAVE_JQ" -eq 1 ]]; then
    IS_AMBIGUOUS=$(jq -r '.classification_metadata.ambiguous // false' "$INTAKE_FILE" 2>/dev/null || echo "true")
    IS_REQUIRES_SPLIT=$(jq -r '.classification_metadata.requires_split // false' "$INTAKE_FILE" 2>/dev/null || echo "true")
    if [[ "$IS_AMBIGUOUS" == "true" || "$IS_REQUIRES_SPLIT" == "true" ]]; then
      INTAKE_STATUS="refused"
    else
      INTAKE_STATUS="classified"
    fi
  else
    INTAKE_STATUS="classified"
  fi
fi

PLAN_LOCKED="false"
[[ -f "$PLAN_FILE" ]] && PLAN_LOCKED="true"

DEPENDENCY_GRAPH_VALID="true"
# By the time plan.lock.json exists, topological sort has succeeded (else
# the wrapper would have refused at step 5 with ATOM_DEPENDENCY_CYCLE).
# If plan.lock.json is missing, we can't make a claim.
if [[ ! -f "$PLAN_FILE" ]]; then
  DEPENDENCY_GRAPH_VALID="false"
fi

# Count atoms in each state from atoms/*.state.json
ATOMS_IMPLEMENTED=0
ATOMS_FAILED=0
FEATURE_ATOMS_VERIFIED=0
FEATURE_SPEC_DELTA_COUNT=0
UNSUPPORTED_ATOMS_COUNT=0
ATOM_FAILED_ID=""
ATOM_FAILED_ERROR=""

if [[ -d "$ATOMS_DIR" ]]; then
  for state_file in "$ATOMS_DIR"/*.state.json; do
    [[ -f "$state_file" ]] || continue
    state=$(json_get "$state_file" '.state' "pending")
    atom_id=$(json_get "$state_file" '.atom_id' "")
    if [[ "$state" == "verified" ]]; then
      ATOMS_IMPLEMENTED=$((ATOMS_IMPLEMENTED + 1))
      # Is this a FEATURE atom?
      if [[ -f "$PLAN_FILE" && "$HAVE_JQ" -eq 1 ]]; then
        a_type=$(jq -r --arg id "$atom_id" '.atoms[] | select(.id==$id) | .type' "$PLAN_FILE" 2>/dev/null)
        if [[ "$a_type" == "FEATURE_SMALL" ]]; then
          FEATURE_ATOMS_VERIFIED=$((FEATURE_ATOMS_VERIFIED + 1))
          # A verified FEATURE_SMALL atom implies its spec delta exists.
          # The /nacl-sa-feature --bounded-only step would have failed
          # otherwise. PR2 may refine this with a dedicated artifact.
          FEATURE_SPEC_DELTA_COUNT=$((FEATURE_SPEC_DELTA_COUNT + 1))
        fi
      fi
    elif [[ "$state" == "failed" ]]; then
      ATOMS_FAILED=$((ATOMS_FAILED + 1))
      ATOM_FAILED_ID="$atom_id"
      ATOM_FAILED_ERROR=$(json_get "$state_file" '.error' "unknown")
    fi
  done
fi

# unsupported_atoms_count: classify-step refuses on HEAVY/triggers before
# writing plan.lock.json; if we got here, none made it into the plan.
UNSUPPORTED_ATOMS_COUNT=0

# ----------------------------------------------------------------------
# 3. Budget — elapsed wall-clock since started_at
# ----------------------------------------------------------------------

ELAPSED_SECONDS=0
ELAPSED_DISPLAY="0m"
WALL_CLOCK_LIMIT=10800
if [[ -f "$BUDGET_FILE" && "$HAVE_JQ" -eq 1 ]]; then
  STARTED_AT=$(jq -r '.started_at // empty' "$BUDGET_FILE" 2>/dev/null)
  WALL_CLOCK_LIMIT=$(jq -r '.wall_clock_limit_seconds // 10800' "$BUDGET_FILE" 2>/dev/null)
  if [[ -n "$STARTED_AT" ]]; then
    # Best-effort: GNU date and BSD date have different flags. Try GNU first.
    # -u on both branches: started_at is UTC; without -u BSD date treats the
    # literal "Z" as text and parses the stamp as LOCAL time, inflating
    # elapsed by the UTC offset (false GOAL_BUDGET_EXHAUSTED on TZ!=UTC).
    started_epoch=$(date -u -d "$STARTED_AT" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED_AT" +%s 2>/dev/null || echo "")
    if [[ -n "$started_epoch" ]]; then
      now_epoch=$(date +%s)
      ELAPSED_SECONDS=$((now_epoch - started_epoch))
      ELAPSED_DISPLAY="$((ELAPSED_SECONDS / 60))m"
    fi
  fi
fi

# ----------------------------------------------------------------------
# 4. Goal-final SHA and current branch HEAD (drift inputs)
# ----------------------------------------------------------------------

GOAL_FINAL_SHA="null"
if [[ -f "$FINAL_SHA_FILE" ]]; then
  GOAL_FINAL_SHA=$(head -n 1 "$FINAL_SHA_FILE" | tr -d '[:space:]')
fi

BRANCH_HEAD_SHA="null"
if [[ -n "$BRANCH" ]]; then
  BRANCH_HEAD_SHA=$(git rev-parse "$BRANCH" 2>/dev/null || echo "null")
fi

# ----------------------------------------------------------------------
# 5. PR state — pr.json first, fallback to gh
# ----------------------------------------------------------------------

PR_URL="null"
PR_HEAD_SHA="null"
CI_STATUS="pending"

if [[ -f "$PR_FILE" ]]; then
  PR_URL=$(json_get "$PR_FILE" '.url' "null")
  PR_HEAD_SHA=$(json_get "$PR_FILE" '.head_sha' "null")
fi

# Try gh for authoritative state (with simple retry).
gh_pr_view_retry() {
  local pr="$1"
  local attempt
  for attempt in 0 5 15 45; do
    [[ "$attempt" -gt 0 ]] && sleep "$attempt"
    if out=$(gh pr view "$pr" --json headRefOid,state,statusCheckRollup 2>/dev/null); then
      echo "$out"
      return 0
    fi
  done
  return 1
}

if [[ -n "$PR_URL" && "$PR_URL" != "null" && "$HAVE_JQ" -eq 1 ]] && command -v gh >/dev/null 2>&1; then
  if gh_out=$(gh_pr_view_retry "$PR_URL"); then
    pr_head_sha_authoritative=$(echo "$gh_out" | jq -r '.headRefOid // empty' 2>/dev/null)
    [[ -n "$pr_head_sha_authoritative" ]] && PR_HEAD_SHA="$pr_head_sha_authoritative"

    # statusCheckRollup is an array of {name, conclusion, status}. Aggregate:
    #   success   — all completed conclusions are SUCCESS
    #   failure   — any completed conclusion is FAILURE/CANCELLED/TIMED_OUT
    #   pending   — anything still IN_PROGRESS/QUEUED/PENDING
    rollup_failure=$(echo "$gh_out" | jq -r '[.statusCheckRollup[]? | select(.conclusion=="FAILURE" or .conclusion=="CANCELLED" or .conclusion=="TIMED_OUT")] | length' 2>/dev/null || echo "0")
    rollup_pending=$(echo "$gh_out" | jq -r '[.statusCheckRollup[]? | select(.status=="IN_PROGRESS" or .status=="QUEUED" or .status=="PENDING")] | length' 2>/dev/null || echo "0")
    rollup_total=$(echo "$gh_out" | jq -r '.statusCheckRollup | length' 2>/dev/null || echo "0")
    if [[ "$rollup_total" -gt 0 ]]; then
      if [[ "$rollup_failure" -gt 0 ]]; then
        CI_STATUS="failure"
      elif [[ "$rollup_pending" -gt 0 ]]; then
        CI_STATUS="pending"
      else
        CI_STATUS="success"
      fi
    fi
  fi
fi

# ----------------------------------------------------------------------
# 6. Drift detection
# ----------------------------------------------------------------------

DRIFT_DETECTED="false"
DRIFT_REASON=""
if [[ "$GOAL_FINAL_SHA" != "null" ]]; then
  if [[ "$BRANCH_HEAD_SHA" != "null" && "$BRANCH_HEAD_SHA" != "$GOAL_FINAL_SHA" ]]; then
    DRIFT_DETECTED="true"
    DRIFT_REASON="branch_head_sha (${BRANCH_HEAD_SHA}) != goal_final_sha (${GOAL_FINAL_SHA})"
  fi
  if [[ "$PR_HEAD_SHA" != "null" && "$PR_HEAD_SHA" != "$GOAL_FINAL_SHA" ]]; then
    DRIFT_DETECTED="true"
    DRIFT_REASON="pr_head_sha (${PR_HEAD_SHA}) != goal_final_sha (${GOAL_FINAL_SHA})"
  fi
fi

# ----------------------------------------------------------------------
# 7. Regression check — mechanical diff (per regression-schema.md)
# ----------------------------------------------------------------------

NO_NEW_REGRESSIONS="false"
REGRESSION_CHECK_MODE="stable_ids"
BASELINE_COMMAND=$(json_get "$BASELINE_FILE" '.command' "unknown")
BASELINE_RUNNER=$(json_get "$BASELINE_FILE" '.runner' "unknown")

if [[ -f "$BASELINE_FILE" && -f "$POSTFIX_FILE" && "$HAVE_JQ" -eq 1 ]]; then
  if [[ "$BASELINE_RUNNER" == "unknown" ]]; then
    REGRESSION_CHECK_MODE="best_effort"
    # best-effort: postfix passed_count >= baseline passed_count AND
    #              postfix failed_count <= baseline failed_count AND
    #              (baseline exit_code != 0) OR (postfix exit_code == 0)
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
    # stable_ids: set-difference diff per regression-schema.md
    REGRESSION_CHECK_MODE="stable_ids"
    regressions=$(jq -n \
      --slurpfile b "$BASELINE_FILE" \
      --slurpfile p "$POSTFIX_FILE" \
      '
      ($b[0].tests.passed)  as $bp |
      ($p[0].tests.failed)  as $pf |
      ($p[0].tests.skipped) as $ps |
      ($b[0].tests.failed)  as $bf |
      (
        ($pf - $bf)
        + ($bp - ($p[0].tests.passed))   # passed-now-not-passed (failed or skipped or vanished)
      ) | unique | length
      ' 2>/dev/null || echo "-1")
    if [[ "$regressions" == "0" ]]; then
      NO_NEW_REGRESSIONS="true"
    fi
  fi
fi

# ----------------------------------------------------------------------
# 8. Staging health + deployed SHA (when target == staging)
# ----------------------------------------------------------------------

DEPLOY_STATUS="n/a"
DEPLOYED_SHA_MATCHES="n/a"
STAGING_FUNCTIONAL_VERIFIED="n/a"
DEV_VERIFIED="n/a"

read_config_yaml_field() {
  # Tiny YAML reader for two-level keys (deploy.staging.url etc.) using grep/sed.
  # No jq required; this is best-effort. yq would be cleaner but isn't ubiquitous.
  local file="$1"
  local section="$2"   # e.g. "staging"
  local key="$3"       # e.g. "url"
  [[ -f "$file" ]] || { echo ""; return; }
  awk -v sec="$section" -v key="$key" '
    /^deploy:/        { in_deploy=1; next }
    in_deploy && /^[^ ]/ { in_deploy=0 }
    in_deploy && $0 ~ "^  " sec ":" { in_sec=1; next }
    in_deploy && in_sec && /^  [^ ]/ { in_sec=0 }
    in_deploy && in_sec && $0 ~ "^    " key ":" {
      sub(/^    [^:]+: */, "")
      gsub(/"/, "")
      print
      exit
    }
  ' "$file"
}

curl_retry() {
  # Usage: curl_retry <url>   prints "<http_code>|<body>" or empty on total failure.
  local url="$1"
  local attempt
  for attempt in 0 5 15 45; do
    [[ "$attempt" -gt 0 ]] && sleep "$attempt"
    if out=$(curl -sS -m 5 -o - -w '\nHTTP_CODE:%{http_code}' "$url" 2>/dev/null); then
      body=$(echo "$out" | sed '$d')
      code=$(echo "$out" | tail -n 1 | sed 's/^HTTP_CODE://')
      # 5xx and timeout-class are transient; retry.
      if [[ "$code" =~ ^5(0[2-4])$ ]]; then
        continue
      fi
      echo "${code}|${body}"
      return 0
    fi
  done
  echo ""
  return 1
}

if [[ "$DEPLOY_TARGET" == "staging" && -f "config.yaml" ]]; then
  STAGING_URL=$(read_config_yaml_field config.yaml staging url)
  HEALTH_PATH=$(read_config_yaml_field config.yaml staging health_endpoint)
  [[ -z "$HEALTH_PATH" ]] && HEALTH_PATH="/api/health"
  VERSION_PATH=$(read_config_yaml_field config.yaml staging version_endpoint)
  if [[ -n "$STAGING_URL" ]]; then
    health_result=$(curl_retry "${STAGING_URL%/}${HEALTH_PATH}")
    if [[ -n "$health_result" ]]; then
      code="${health_result%%|*}"
      if [[ "$code" == "200" ]]; then
        DEPLOY_STATUS="healthy"
      elif [[ "$code" =~ ^5(0[2-4])$ ]]; then
        DEPLOY_STATUS="degraded"
      else
        DEPLOY_STATUS="failed"
      fi
    else
      DEPLOY_STATUS="failed"
    fi
    if [[ -n "$VERSION_PATH" ]]; then
      version_result=$(curl_retry "${STAGING_URL%/}${VERSION_PATH}")
      if [[ -n "$version_result" ]]; then
        ver_body="${version_result#*|}"
        # Accept either raw SHA or {"sha":"..."} JSON.
        ver_sha=$(echo "$ver_body" | jq -r '.sha // .version // empty' 2>/dev/null || true)
        [[ -z "$ver_sha" ]] && ver_sha=$(echo "$ver_body" | tr -d '[:space:]' | head -c 40)
        if [[ -n "$ver_sha" && "$GOAL_FINAL_SHA" != "null" ]]; then
          if [[ "$ver_sha" == "$GOAL_FINAL_SHA"* || "$GOAL_FINAL_SHA" == "$ver_sha"* ]]; then
            DEPLOYED_SHA_MATCHES="true"
          else
            DEPLOYED_SHA_MATCHES="false"
          fi
        fi
      fi
    fi
    # staging_functional_verified is asserted by /nacl-tl-verify per UC.
    # In PR1 the wrapper does not yet integrate it — leave n/a until PR2.
    STAGING_FUNCTIONAL_VERIFIED="n/a"
  fi
fi

if [[ "$DEPLOY_TARGET" == "dev-only" ]]; then
  # dev_verified is asserted by /nacl-tl-verify locally — PR2 wiring.
  DEV_VERIFIED="n/a"
fi

# ----------------------------------------------------------------------
# 9. Apply result_decision_rule (per aliases.md §intake)
# ----------------------------------------------------------------------

RESULT="GOAL_NOT_OK"
BLOCKING_SUB_REASON=""

# Budget exhaustion has highest priority.
if [[ "$ELAPSED_SECONDS" -ge "$WALL_CLOCK_LIMIT" ]]; then
  RESULT="GOAL_BUDGET_EXHAUSTED"
  BLOCKING_SUB_REASON="wall_clock"
elif [[ "$DRIFT_DETECTED" == "true" ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER"
elif [[ "$DEPLOYED_SHA_MATCHES" == "false" ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="GOAL_BLOCKED_DEPLOYED_SHA_MISMATCH"
elif [[ "$ATOMS_FAILED" -gt 0 ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="GOAL_BLOCKED_ATOM_FAILED"
elif [[ -f "$POSTFIX_FILE" && "$NO_NEW_REGRESSIONS" == "false" ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED"
elif [[ "$CI_STATUS" == "failure" ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="GOAL_BLOCKED_CI_FAILED"
elif [[ "$DEPLOY_TARGET" == "staging" && "$DEPLOY_STATUS" == "failed" && "$GOAL_FINAL_SHA" != "null" ]]; then
  RESULT="GOAL_BLOCKED"
  BLOCKING_SUB_REASON="GOAL_BLOCKED_STAGING_UNHEALTHY"
else
  # No blockers — evaluate success_condition.
  ok="true"
  [[ "$INTAKE_STATUS" != "classified" ]] && ok="false"
  [[ "$PLAN_LOCKED" != "true" ]] && ok="false"
  [[ "$DEPENDENCY_GRAPH_VALID" != "true" ]] && ok="false"
  [[ "$UNSUPPORTED_ATOMS_COUNT" -ne 0 ]] && ok="false"
  [[ "$ATOMS_IMPLEMENTED" -lt "$ATOMS_TOTAL" || "$ATOMS_TOTAL" -eq 0 ]] && ok="false"
  [[ "$FEATURE_SPEC_DELTA_COUNT" -lt "$FEATURE_ATOMS_TOTAL" ]] && ok="false"
  [[ "$FEATURE_ATOMS_VERIFIED" -ne "$FEATURE_ATOMS_TOTAL" ]] && ok="false"
  [[ "$PR_URL" == "null" ]] && ok="false"
  [[ "$BRANCH_HEAD_SHA" != "$GOAL_FINAL_SHA" || "$GOAL_FINAL_SHA" == "null" ]] && ok="false"
  [[ "$PR_HEAD_SHA" != "$GOAL_FINAL_SHA" || "$GOAL_FINAL_SHA" == "null" ]] && ok="false"
  [[ "$CI_STATUS" != "success" ]] && ok="false"
  [[ "$NO_NEW_REGRESSIONS" != "true" ]] && ok="false"
  if [[ "$DEPLOY_TARGET" == "staging" ]]; then
    if [[ "$DEPLOY_STATUS" != "healthy" ]]; then
      ok="false"
    fi
    if [[ "$DEPLOYED_SHA_MATCHES" != "true" && "$STAGING_FUNCTIONAL_VERIFIED" != "true" ]]; then
      ok="false"
    fi
  elif [[ "$DEPLOY_TARGET" == "dev-only" ]]; then
    [[ "$DEV_VERIFIED" != "true" ]] && ok="false"
  else
    ok="false"
  fi
  if [[ "$ok" == "true" ]]; then
    RESULT="GOAL_OK"
  fi
fi

# ----------------------------------------------------------------------
# 10. Pre-GOAL_PROOF human-readable summary (parallels other check scripts)
# ----------------------------------------------------------------------

echo "intake_status: ${INTAKE_STATUS}"
echo "plan_locked: ${PLAN_LOCKED}"
echo "atoms_implemented: ${ATOMS_IMPLEMENTED}/${ATOMS_TOTAL}"
echo "feature_atoms_verified: ${FEATURE_ATOMS_VERIFIED}/${FEATURE_ATOMS_TOTAL}"
echo "pr_url: ${PR_URL}"
echo "pr_head_sha: ${PR_HEAD_SHA}"
echo "goal_final_sha: ${GOAL_FINAL_SHA}"
echo "branch_head_sha: ${BRANCH_HEAD_SHA}"
echo "ci_status: ${CI_STATUS}"
echo "no_new_regressions: ${NO_NEW_REGRESSIONS} (mode=${REGRESSION_CHECK_MODE})"
echo "deploy_target: ${DEPLOY_TARGET}"
echo "deploy_status: ${DEPLOY_STATUS}"
echo "deployed_sha_matches: ${DEPLOYED_SHA_MATCHES}"
echo "elapsed: ${ELAPSED_DISPLAY}"

# ----------------------------------------------------------------------
# 11. Emit GOAL_PROOF block
# ----------------------------------------------------------------------

evidence=(
  "intake_status: ${INTAKE_STATUS}"
  "plan_locked: ${PLAN_LOCKED}"
  "dependency_graph_valid: ${DEPENDENCY_GRAPH_VALID}"
  "unsupported_atoms_count: ${UNSUPPORTED_ATOMS_COUNT}"
  "atoms_total: ${ATOMS_TOTAL}"
  "atoms_implemented: ${ATOMS_IMPLEMENTED}"
  "feature_atoms_total: ${FEATURE_ATOMS_TOTAL}"
  "feature_spec_delta_count: ${FEATURE_SPEC_DELTA_COUNT}"
  "feature_atoms_verified: ${FEATURE_ATOMS_VERIFIED}"
  "branch: ${BRANCH:-null}"
  "branch_head_sha: ${BRANCH_HEAD_SHA}"
  "pr_url: ${PR_URL}"
  "pr_head_sha: ${PR_HEAD_SHA}"
  "goal_final_sha: ${GOAL_FINAL_SHA}"
  "ci_status: ${CI_STATUS}"
  "no_new_regressions: ${NO_NEW_REGRESSIONS}"
  "regression_check_mode: ${REGRESSION_CHECK_MODE}"
  "baseline_command: ${BASELINE_COMMAND}"
  "deploy_target: ${DEPLOY_TARGET:-none}"
  "deploy_status: ${DEPLOY_STATUS}"
  "deployed_sha_matches: ${DEPLOYED_SHA_MATCHES}"
  "staging_functional_verified: ${STAGING_FUNCTIONAL_VERIFIED}"
  "dev_verified: ${DEV_VERIFIED}"
)

if [[ -n "$BLOCKING_SUB_REASON" ]]; then
  evidence+=("blocking_reason: ${BLOCKING_SUB_REASON}")
  [[ -n "$DRIFT_REASON" ]] && evidence+=("drift_detail: ${DRIFT_REASON}")
  if [[ "$BLOCKING_SUB_REASON" == "GOAL_BLOCKED_ATOM_FAILED" && -n "$ATOM_FAILED_ID" ]]; then
    evidence+=("failed_atom_id: ${ATOM_FAILED_ID}")
    evidence+=("failed_atom_error: ${ATOM_FAILED_ERROR}")
  fi
fi

emit_proof_and_exit "$RESULT" "${evidence[@]}"

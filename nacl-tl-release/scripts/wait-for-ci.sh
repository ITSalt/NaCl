#!/usr/bin/env bash
# Deterministic CI-watch helper for nacl-tl-release Step 3a (reused by tl-deploy / tl-deliver).
#
# Why this exists: the post-merge CI wait was prose with constants scattered across it
# (30s no-run window, 60s retry, `ci_timeout` 600s) and an implicit run-selection +
# outcome-classification that each agent re-derived. This script is the single authority:
# the two deterministic decisions are pure subcommands (`select`, `classify`) pinned by
# wait-for-ci.test.sh; `watch` is the side-effecting orchestrator that calls `gh`.
#
# Subcommands:
#   select  [--since <iso>]                 < runs.json   -> prints the chosen run's databaseId (or empty)
#   classify <status> <conclusion>                        -> CI_OK | CI_FAILED | CI_RUNNING
#   watch   --branch <b> [--since <iso>] [--timeout 600]
#           [--no-run-grace 30] [--poll 5] [--workflows-dir .github/workflows]
#                                                         -> exit 0 CI_OK/NO_CI/NO_RUN, exit 1 CI_FAILED
# Dependencies: gh, jq (both present in CI runners and graph-infra tooling).

set -uo pipefail

# --- pure: choose the most recent run (createdAt), optionally only those at/after --since ---
cmd_select() {
  local since=""
  while [ $# -gt 0 ]; do case "$1" in --since) since="$2"; shift 2;; *) shift;; esac; done
  jq -r --arg since "$since" '
    [ .[] | select($since == "" or .createdAt >= $since) ]
    | sort_by(.createdAt) | last | .databaseId // empty'
}

# --- pure: map (status, conclusion) to an outcome token (mirrors `gh run watch --exit-status`) ---
cmd_classify() {
  local status="${1-}" conclusion="${2-}"
  if [ "$status" != "completed" ]; then echo "CI_RUNNING"; return; fi
  case "$conclusion" in
    success) echo "CI_OK" ;;
    *)       echo "CI_FAILED" ;;   # failure/timed_out/cancelled/startup_failure/action_required/…
  esac
}

# run a command under a timeout if one is available; otherwise run it directly (macOS lacks `timeout`)
_with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"
  else "$@"; fi
}

cmd_watch() {
  local branch="" since="" timeout=600 grace=30 poll=5 wfdir=".github/workflows"
  while [ $# -gt 0 ]; do case "$1" in
    --branch) branch="$2"; shift 2;;
    --since) since="$2"; shift 2;;
    --timeout) timeout="$2"; shift 2;;
    --no-run-grace) grace="$2"; shift 2;;
    --poll) poll="$2"; shift 2;;
    --workflows-dir) wfdir="$2"; shift 2;;
    *) echo "wait-for-ci: unknown arg $1" >&2; return 2;;
  esac; done
  [ -n "$branch" ] || { echo "wait-for-ci: --branch required" >&2; return 2; }

  if [ ! -d "$wfdir" ]; then echo "NO_CI: no pipeline detected ($wfdir absent); skipping CI wait"; return 0; fi

  # poll for the run up to `grace` seconds (the 30s+retry window), re-listing every `poll` seconds.
  local run_id="" waited=0
  while : ; do
    run_id=$(gh run list --branch "$branch" --limit 5 \
               --json databaseId,status,conclusion,createdAt 2>/dev/null \
             | cmd_select --since "$since")
    [ -n "$run_id" ] && break
    [ "$waited" -ge "$grace" ] && { echo "NO_RUN: no CI run for $branch within ${grace}s; continuing (warn)"; return 0; }
    sleep "$poll"; waited=$((waited + poll))
  done

  if _with_timeout "$timeout" gh run watch "$run_id" --exit-status; then
    echo "CI_OK: run $run_id succeeded"; return 0
  fi
  gh run view "$run_id" --log-failed 2>/dev/null | tail -50
  echo "CI_FAILED: run $run_id did not succeed (tag must NOT be pushed)"; return 1
}

case "${1-}" in
  select)   shift; cmd_select "$@" ;;
  classify) shift; cmd_classify "$@" ;;
  watch)    shift; cmd_watch "$@" ;;
  *) echo "usage: wait-for-ci.sh {select|classify|watch} …" >&2; exit 2 ;;
esac

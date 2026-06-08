#!/usr/bin/env bash
# Deterministic branch helpers for nacl-tl-ship.
#
# Why this exists: two procedures were re-typed inline in SKILL.md on every ship —
# the slugification sed-pipeline (Step 2 "Branch naming") and the BASE-BRANCH GUARD
# (Step 2.5, run before every commit). An agent re-deriving either each run is a
# variance + cost source, and the guard is safety-critical: a single mistake commits
# to the base branch. This script is the single authority. It changes HOW the slug /
# verdict is derived, never WHAT is produced — equivalence is pinned by branch.test.sh.
#
# Subcommands:
#   slug  "<message>"                          -> prints the bare branch slug (no "feature/" prefix)
#   guard <current_branch> <base> <strategy>   -> exit 0 "GUARD OK ..." | exit 1 "FATAL ..."
#
# Notes:
#   - `guard` takes current_branch as an argument (never calls git itself) so it is pure
#     and testable; the skill passes "$(git rev-parse --abbrev-ref HEAD)".
#   - the base branch is always a parameter, never hardcoded (branch-literal discipline).

set -euo pipefail

usage() {
  printf 'usage: branch.sh slug "<message>"\n       branch.sh guard <current_branch> <base_branch> <strategy>\n' >&2
  exit 2
}

cmd_slug() {
  # Exact reproduction of the historical inline pipeline (Step 2 "Slugification"):
  #   tr upper->lower | sed (non-alnum->-, collapse -, trim leading/trailing -) | cut to 50.
  # The cut is applied AFTER the dash-trim, so a 50th-char dash can survive — this quirk
  # is reproduced deliberately (behaviour-neutral refactor); see branch.test.sh.
  local message="${1-}"
  printf '%s' "$message" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' \
    | cut -c1-50
  printf '\n'
}

cmd_guard() {
  local current_branch="${1-}" base_branch="${2-}" strategy="${3-}"
  if [ -z "$current_branch" ] || [ -z "$base_branch" ] || [ -z "$strategy" ]; then
    printf 'FATAL: guard requires <current_branch> <base_branch> <strategy>\n' >&2
    exit 2
  fi
  if [ "$current_branch" = "$base_branch" ] && [ "$strategy" = "feature-branch" ]; then
    printf 'FATAL: Cannot commit to %s with feature-branch strategy. Create a branch first.\n' "$base_branch"
    exit 1
  fi
  printf 'GUARD OK: branch=%s, strategy=%s\n' "$current_branch" "$strategy"
}

case "${1-}" in
  slug)  shift; cmd_slug "${1-}" ;;
  guard) shift; cmd_guard "${1-}" "${2-}" "${3-}" ;;
  *)     usage ;;
esac

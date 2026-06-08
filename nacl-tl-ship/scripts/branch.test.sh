#!/usr/bin/env bash
# Equivalence pins for branch.sh. Run: bash nacl-tl-ship/scripts/branch.test.sh
# Every case maps an input to the exact slug / exit-code the inline SKILL.md logic
# produced. A green run means the script reproduces the documented behaviour.

set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BR="$DIR/branch.sh"
fail=0
pass=0

# assert stdout of a `slug` call equals expected
slug_eq() {
  local msg="$1" want="$2" got
  got="$(bash "$BR" slug "$msg")"
  if [ "$got" = "$want" ]; then pass=$((pass+1));
  else fail=$((fail+1)); printf 'FAIL slug %-32q got=%q want=%q\n' "$msg" "$got" "$want"; fi
}

# assert exit code (and optional stdout substring) of a `guard` call
guard_code() {
  local cur="$1" base="$2" strat="$3" want_code="$4" want_sub="${5-}" out code
  out="$(bash "$BR" guard "$cur" "$base" "$strat" 2>&1)"; code=$?
  if [ "$code" != "$want_code" ]; then
    fail=$((fail+1)); printf 'FAIL guard %s/%s/%s code=%s want=%s\n' "$cur" "$base" "$strat" "$code" "$want_code"; return
  fi
  if [ -n "$want_sub" ] && [[ "$out" != *"$want_sub"* ]]; then
    fail=$((fail+1)); printf 'FAIL guard %s/%s/%s out=%q missing=%q\n' "$cur" "$base" "$strat" "$out" "$want_sub"; return
  fi
  pass=$((pass+1))
}

# --- slug: faithful to tr|sed|cut pipeline ---
slug_eq "fix: add lecture breadcrumb" "fix-add-lecture-breadcrumb"
slug_eq "fix: cast lectureId"         "fix-cast-lectureid"
slug_eq "Fix: Add Foo"                "fix-add-foo"      # uppercase folded
slug_eq "...Hello..."                 "hello"            # leading/trailing dashes trimmed
slug_eq "a   b---c"                   "a-b-c"            # runs collapsed
slug_eq ""                            ""                 # empty passes through (skill then asks user)
slug_eq "$(printf 'a%.0s' {1..60})"   "$(printf 'a%.0s' {1..50})"  # capped at 50

# --- guard: base branch is a parameter; FATAL only on (base AND feature-branch) ---
guard_code "feature/UC028" "main"    "feature-branch" 0 "GUARD OK"
guard_code "main"          "main"    "feature-branch" 1 "FATAL"
guard_code "main"          "main"    "direct"         0 "GUARD OK"   # direct strategy may commit to base
guard_code "develop"       "develop" "feature-branch" 1 "FATAL"      # proves non-default base honored
guard_code "feature/x"     "develop" "feature-branch" 0 "GUARD OK"
guard_code "main"          "main"    ""               2              # missing strategy -> usage error

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

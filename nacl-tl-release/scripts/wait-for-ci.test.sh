#!/usr/bin/env bash
# Pins for wait-for-ci.sh. Run: bash nacl-tl-release/scripts/wait-for-ci.test.sh
# Covers the pure subcommands (select, classify) exhaustively and smoke-tests the
# `watch` orchestrator with a stubbed `gh` on PATH.

set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
W="$DIR/wait-for-ci.sh"
pass=0; fail=0
ok()  { pass=$((pass+1)); }
bad() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }

command -v jq >/dev/null 2>&1 || { echo "SKIP: jq not installed (required by select)"; exit 0; }

RUNS='[
  {"databaseId":101,"status":"completed","conclusion":"success","createdAt":"2026-06-01T10:00:00Z"},
  {"databaseId":103,"status":"completed","conclusion":"failure","createdAt":"2026-06-01T12:00:00Z"},
  {"databaseId":102,"status":"in_progress","conclusion":null,"createdAt":"2026-06-01T11:00:00Z"}
]'

# select: newest by createdAt overall
got=$(printf '%s' "$RUNS" | bash "$W" select)
[ "$got" = "103" ] && ok || bad "select newest -> got '$got' want 103"

# select with --since after 103's createdAt: nothing qualifies -> empty
got=$(printf '%s' "$RUNS" | bash "$W" select --since "2026-06-01T13:00:00Z")
[ -z "$got" ] && ok || bad "select since-future -> got '$got' want empty"

# select with --since that includes only 102,103 -> newest is 103
got=$(printf '%s' "$RUNS" | bash "$W" select --since "2026-06-01T10:30:00Z")
[ "$got" = "103" ] && ok || bad "select since-mid -> got '$got' want 103"

# classify
[ "$(bash "$W" classify completed success)" = "CI_OK" ] && ok || bad "classify success"
[ "$(bash "$W" classify completed failure)" = "CI_FAILED" ] && ok || bad "classify failure"
[ "$(bash "$W" classify completed timed_out)" = "CI_FAILED" ] && ok || bad "classify timed_out"
[ "$(bash "$W" classify in_progress '')" = "CI_RUNNING" ] && ok || bad "classify running"

# watch: NO_CI when workflows dir absent
out=$(bash "$W" watch --branch main --workflows-dir /nonexistent/wf 2>&1); code=$?
{ [ "$code" = 0 ] && [[ "$out" == NO_CI* ]]; } && ok || bad "watch NO_CI -> code=$code out=$out"

# --- stub gh on PATH for watch happy/fail paths ---
STUB="$(mktemp -d)"; WFDIR="$(mktemp -d)/wf"; mkdir -p "$WFDIR"
make_gh() { # $1 = watch exit code
  cat > "$STUB/gh" <<EOF
#!/usr/bin/env bash
case "\$1 \$2" in
  "run list") echo '$RUNS' ;;
  "run watch") exit $1 ;;
  "run view") echo "log tail" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$STUB/gh"
}

make_gh 0
out=$(PATH="$STUB:$PATH" bash "$W" watch --branch main --workflows-dir "$WFDIR" --no-run-grace 0 2>&1); code=$?
{ [ "$code" = 0 ] && [[ "$out" == *CI_OK* ]]; } && ok || bad "watch CI_OK -> code=$code out=$out"

make_gh 1
out=$(PATH="$STUB:$PATH" bash "$W" watch --branch main --workflows-dir "$WFDIR" --no-run-grace 0 2>&1); code=$?
{ [ "$code" = 1 ] && [[ "$out" == *CI_FAILED* ]]; } && ok || bad "watch CI_FAILED -> code=$code out=$out"

rm -rf "$STUB" "$WFDIR"
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

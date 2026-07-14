#!/usr/bin/env bash
# Pins for health-check.sh. Run: bash nacl-core/scripts/health-check.test.sh
# Stubs `curl` on PATH; uses --propagation 0 --interval 0 to avoid real sleeps.

set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
H="$DIR/health-check.sh"
pass=0; fail=0
ok()  { pass=$((pass+1)); }
bad() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }

STUB="$(mktemp -d)"
stub_curl() { # $1 = exit code curl should return
  cat > "$STUB/curl" <<EOF
#!/usr/bin/env bash
exit $1
EOF
  chmod +x "$STUB/curl"
}

# success on first try -> exit 0, HEALTH_OK
stub_curl 0
out=$(PATH="$STUB:$PATH" bash "$H" --url http://x/health --propagation 0 --interval 0 2>&1); code=$?
{ [ "$code" = 0 ] && [[ "$out" == HEALTH_OK* ]]; } && ok || bad "ok path -> code=$code out=$out"

# always fails -> exit 1, HEALTH_FAILED after retries
stub_curl 22
out=$(PATH="$STUB:$PATH" bash "$H" --url http://x/health --retries 3 --propagation 0 --interval 0 2>&1); code=$?
{ [ "$code" = 1 ] && [[ "$out" == HEALTH_FAILED* ]]; } && ok || bad "fail path -> code=$code out=$out"

# missing --url -> usage error (exit 2)
bash "$H" --propagation 0 >/dev/null 2>&1; [ "$?" = 2 ] && ok || bad "missing url should exit 2"

rm -rf "$STUB"
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

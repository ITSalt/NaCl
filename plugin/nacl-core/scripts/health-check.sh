#!/usr/bin/env bash
# Deterministic production health probe for nacl-tl-release Step 3b (reused by tl-deploy / tl-deliver).
#
# Why this exists: the probe was prose with embedded constants — "wait 15s for deploy
# propagation", "--max-time 10", "retry 3 times with 10-second intervals". This script
# names them as documented parameters (Ousterhout: no voodoo constants) and owns the
# loop, so the retry policy is identical every release. It emits HEALTH_OK / HEALTH_FAILED.
# NOTE: a green probe is HEALTH_ONLY evidence — NEVER product-readiness (see SKILL.md).
#
#   health-check.sh --url <full_url> [--retries 3] [--interval 10] [--max-time 10] [--propagation 15]
#
# Defaults reproduce Step 3b. Tests pass --propagation 0 --interval 0 to avoid real sleeps.

set -uo pipefail

url=""
retries=3        # "retry 3 times"
interval=10      # "10-second intervals"
max_time=10      # curl --max-time 10
propagation=15   # "wait 15 seconds for deployment propagation"

while [ $# -gt 0 ]; do case "$1" in
  --url) url="$2"; shift 2;;
  --retries) retries="$2"; shift 2;;
  --interval) interval="$2"; shift 2;;
  --max-time) max_time="$2"; shift 2;;
  --propagation) propagation="$2"; shift 2;;
  *) echo "health-check: unknown arg $1" >&2; exit 2;;
esac; done
[ -n "$url" ] || { echo "health-check: --url required" >&2; exit 2; }

[ "$propagation" -gt 0 ] && sleep "$propagation"

attempt=1
while [ "$attempt" -le "$retries" ]; do
  if curl -sf "$url" --max-time "$max_time" >/dev/null 2>&1; then
    echo "HEALTH_OK: $url returned 200 OK (attempt $attempt/$retries)"
    exit 0
  fi
  [ "$attempt" -lt "$retries" ] && [ "$interval" -gt 0 ] && sleep "$interval"
  attempt=$((attempt + 1))
done

echo "HEALTH_FAILED: $url did not return 200 OK after $retries retries"
exit 1

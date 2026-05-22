#!/usr/bin/env bash
# =============================================================================
# test_validator_l35.sh — Regression contract for validator L3.5
#
# PURPOSE
#   This script witnesses the absence of L3.5 in nacl-sa-validate/SKILL.md
#   and confirms that Family Cinema's graph already contains ActivitySteps
#   with empty actor — the data gap the missing check would catch.
#
# TWO CHECKS
#   Check A (data witness): query Family Cinema Neo4j for ActivitySteps where
#     actor is empty or null.  Asserts result count > 0.  This check stays
#     permanent: it keeps witnessing the data gap until a backfill is applied.
#
#   Check B (skill content): grep nacl-sa-validate/SKILL.md for the L3.5
#     section header.
#     - BEFORE_FIX=1 mode (current RED state): asserts L3.5 is ABSENT.
#       This is the default mode and it currently PASSES (L3.5 does not exist).
#     - Default mode (post-fix expectation): asserts L3.5 IS PRESENT.
#       This currently FAILS — that is the intended RED state for the pipeline.
#
# USAGE
#   BEFORE_FIX=1 ./test_validator_l35.sh   # pre-fix: Check B expects absent
#   ./test_validator_l35.sh                 # post-fix: Check B expects present (RED now)
#
# MIGRATION NOTE
#   When L3.5 is added to nacl-sa-validate/SKILL.md:
#   - Default mode of Check B flips to PASS automatically (no code change needed).
#   - BEFORE_FIX=1 mode of Check B will start failing — delete or retire that mode.
#   - Check A should still return >0 rows until actor backfill is complete.
# =============================================================================

set -euo pipefail

NEO4J_URL="${NEO4J_URL:-http://localhost:7675/db/neo4j/tx/commit}"
NEO4J_AUTH_HEADER="Authorization: Basic bmVvNGo6bmVvNGpfZ3JhcGhfZGV2"
SKILL_FILE="${SKILL_FILE:-/home/project-owner/.claude/skills/nacl-sa-validate/SKILL.md}"
BEFORE_FIX="${BEFORE_FIX:-0}"

PASS=0
FAIL=0

_pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
_fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ---------------------------------------------------------------------------
# Check A: ActivitySteps with empty/null actor exist in Family Cinema graph
# ---------------------------------------------------------------------------
echo ""
echo "=== Check A: Data witness — ActivitySteps with empty actor in Neo4j ==="

QUERY='{"statements":[{"statement":"MATCH (s:ActivityStep) WHERE coalesce(s.actor, \"\") = \"\" RETURN count(s) AS empty_actor_count","resultDataContents":["row"]}]}'

HTTP_CODE=$(curl -s -o /tmp/l35_check_a.json -w "%{http_code}" \
  -X POST "$NEO4J_URL" \
  -H "Content-Type: application/json" \
  -H "$NEO4J_AUTH_HEADER" \
  -d "$QUERY")

if [ "$HTTP_CODE" != "200" ]; then
  _fail "Check A: Neo4j returned HTTP $HTTP_CODE — is the container running at $NEO4J_URL?"
else
  COUNT=$(python3 -c "
import json, sys
data = json.load(open('/tmp/l35_check_a.json'))
errors = data.get('errors', [])
if errors:
    print('ERROR:' + str(errors))
    sys.exit(1)
row = data['results'][0]['data'][0]['row'][0]
print(row)
" 2>&1)

  if echo "$COUNT" | grep -q "^ERROR:"; then
    _fail "Check A: Cypher error — $COUNT"
  elif [ "$COUNT" -gt 0 ] 2>/dev/null; then
    _pass "Check A: $COUNT ActivitySteps have empty/null actor (data gap confirmed)"
  else
    _fail "Check A: Query returned 0 rows — either graph is empty or actor has been backfilled"
  fi
fi

# ---------------------------------------------------------------------------
# Check B: L3.5 section in nacl-sa-validate/SKILL.md
# ---------------------------------------------------------------------------
echo ""
echo "=== Check B: Validator skill content — L3.5 section presence ==="

L35_PATTERN="L3\.5"

if [ ! -f "$SKILL_FILE" ]; then
  _fail "Check B: SKILL.md not found at $SKILL_FILE"
else
  if grep -qE "$L35_PATTERN" "$SKILL_FILE"; then
    L35_FOUND=1
  else
    L35_FOUND=0
  fi

  if [ "$BEFORE_FIX" = "1" ]; then
    # Pre-fix mode: assert L3.5 is absent
    if [ "$L35_FOUND" = "0" ]; then
      _pass "Check B [BEFORE_FIX]: L3.5 is absent from SKILL.md — confirms validator gap"
    else
      _fail "Check B [BEFORE_FIX]: L3.5 was found — fix already applied? Run without BEFORE_FIX=1"
    fi
  else
    # Default (post-fix) mode: assert L3.5 is present — this is currently RED
    if [ "$L35_FOUND" = "1" ]; then
      _pass "Check B [POST_FIX]: L3.5 is present in SKILL.md"
    else
      _fail "Check B [POST_FIX]: L3.5 is ABSENT from SKILL.md — validator is missing this check"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

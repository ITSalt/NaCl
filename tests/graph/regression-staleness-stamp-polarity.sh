#!/usr/bin/env bash
# tests/graph/regression-staleness-stamp-polarity.sh — RED/GREEN regression
# matrix for the staleness-stamp polarity defect.
#
# THE DEFECT. `nacl-tl-fix` inherited `nacl-sa-feature`'s stamp semantics, but
# the two skills have opposite code-state invariants:
#
#   sa-feature changes spec while the code does NOT yet exist  -> its tasks
#     genuinely need re-planning, so review_status='stale' is correct.
#   tl-fix changes spec AND code together and proves it GREEN before it
#     returns -> the shipped tasks of the fixed UC are already current.
#
# Because the Step 5 stamp matches `(uc)-[:GENERATES]->(t:Task)` with NO status
# filter, every task of every affected UC is stamped 'stale' — including tasks
# that shipped long ago and that this fix never touched. Observed on a live
# project: 87 stale tasks, 67 of them (77%) status=done, accumulated over six
# origins in eleven days, holding release gate #7 (`stale-downstream`) red
# continuously. `nacl-tl-plan` cannot drain them: re-planning is not applicable
# to shipped code, and its shipped-stale path HALTs asking for a delta carrier
# that fix-origin staleness never has (the fix WAS the delta, already shipped).
#
# THE CONTRACT UNDER TEST.
#   1. Step 5 stamps by status: shipped (done/verified-pending) -> 'spec_drift'
#      (a review question), active -> 'stale' (a re-planning unit, unchanged).
#   2. A 'still-correct' review verdict is a real exit: it advances
#      planned_from_version, clears the flags, and records reviewed_by /
#      reviewed_at so the close is auditable against its :Decision.
#   3. L8 is proportional: L8.1 CRITICAL fires on 'stale' ONLY; 'spec_drift'
#      goes to L8.1b, WARNING within the configured budget and CRITICAL when
#      the count or the age exceeds it — so the gate drains or escalates and
#      can never sit permanently red-and-ignored.
#
# MANUAL / stage-3 verification only. Drives a real disposable Neo4j in
# Docker; intentionally NOT wired into CI (CI has no docker daemon). Run by
# hand on a developer machine. Everything it creates is named with the
# "naclpolar" prefix and cleanup only ever acts on that prefix.
#
# The Cypher under test is EXTRACTED FROM THE SHIPPED ARTIFACTS at run time, so
# the matrix binds to the real skill text and cannot drift from it:
#   - Step 5 stamp:    nacl-tl-fix/SKILL.md fence containing
#                      `OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)`
#   - review verdict:  nacl-tl-fix/SKILL.md fence containing `$reviewedTaskIds`
#   - L8.1 / L8.1b:    nacl-sa-validate/SKILL.md fences containing
#                      `L8.1 --` / `L8.1b --`
# On a pre-fix tree the verdict and L8.1b fences are absent and the split is
# not in the stamp — those cases then FAIL, which IS the RED signal.
#
# Usage:
#   tests/graph/regression-staleness-stamp-polarity.sh [--case <name>] [--skip-docker]
#
# Output contract: one line per ran case:
#   NACL_SMOKE_RESULT: case=<name> status=PASS|FAIL|SKIP reason=<short>
# Exit code is non-zero iff any ran case is FAIL.
#
# Case order (fixed; each case re-seeds, so each is self-contained):
#   stamp-shipped-drift -> stamp-active-stale -> stamp-mixed-uc ->
#   verdict-still-correct -> l8-critical-excludes-drift ->
#   l8-budget-within -> l8-budget-exceeded
#
# `set -e` deliberately NOT used (same rationale as the sibling harness):
# probes that legitimately return non-zero must not abort the harness.
set -u

PREFIX="naclpolar"
CONTAINER="${PREFIX}-neo4j"
PASSWORD="neo4j_graph_dev"
PORT_SCAN_START=3940
NEO4J_IMAGE="neo4j:5-community"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
TL_FIX_SKILL="$REPO_ROOT/nacl-tl-fix/SKILL.md"
SA_VALIDATE_SKILL="$REPO_ROOT/nacl-sa-validate/SKILL.md"

CASE_FILTER=""
FORCE_SKIP_DOCKER=false

while [ $# -gt 0 ]; do
  case "$1" in
    --case) CASE_FILTER="$2"; shift 2 ;;
    --skip-docker) FORCE_SKIP_DOCKER=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

KNOWN_CASES="stamp-shipped-drift stamp-active-stale stamp-mixed-uc verdict-still-correct l8-critical-excludes-drift l8-budget-within l8-budget-exceeded"
if [ -n "$CASE_FILTER" ]; then
  case " $KNOWN_CASES " in
    *" $CASE_FILTER "*) : ;;
    *) echo "Unknown --case: $CASE_FILTER (known: $KNOWN_CASES)" >&2; exit 2 ;;
  esac
fi

OVERALL_RC=0
DOCKER_BIN=""
DOCKER_OK=false
DOCKER_SKIP_REASON=""
BOLT_PORT=""

cleanup() {
  set +e
  if [ -n "$DOCKER_BIN" ]; then
    for c in $("$DOCKER_BIN" ps -a --format '{{.Names}}' 2>/dev/null | grep "^${PREFIX}"); do
      [ "${c#${PREFIX}}" = "$c" ] && continue # safety: must carry our prefix
      "$DOCKER_BIN" rm -f "$c" >/dev/null 2>&1
    done
  fi
}
trap cleanup EXIT INT TERM

report() {
  echo "NACL_SMOKE_RESULT: case=$1 status=$2 reason=$3"
  [ "$2" = "FAIL" ] && OVERALL_RC=1
}

should_print() {
  [ -z "$CASE_FILTER" ] || [ "$CASE_FILTER" = "$1" ]
}

port_free() {
  python3 - "$1" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(("127.0.0.1", port))
except OSError:
    sys.exit(1)
finally:
    s.close()
sys.exit(0)
PY
}

find_free_port() {
  start="$1"; p="$start"
  while [ "$p" -lt $((start + 500)) ]; do
    if port_free "$p"; then echo "$p"; return 0; fi
    p=$((p + 1))
  done
  return 1
}

# ---------------------------------------------------------------------------
# Cypher plumbing
# ---------------------------------------------------------------------------

cy() {
  "$DOCKER_BIN" exec -i "$CONTAINER" cypher-shell -u neo4j -p "$PASSWORD" --format plain "$@" 2>&1
}

wipe_graph() {
  printf 'MATCH (n) DETACH DELETE n;\n' | cy >/dev/null
}

# Extract the first ```cypher fence in a SKILL.md whose body contains marker.
extract_fence() { # $1=file $2=marker
  awk -v marker="$2" '
    /^```cypher[[:space:]]*$/ { infence = 1; buf = ""; next }
    /^```[[:space:]]*$/ {
      if (infence && index(buf, marker)) { printf "%s", buf; exit }
      infence = 0; next
    }
    infence { buf = buf $0 "\n" }
  ' "$1"
}

# Fences carry no trailing semicolon — cypher-shell stdin needs one.
terminate() {
  body="$1"
  case "$body" in
    *\;*) printf '%s\n' "$body" ;;
    *)    printf '%s;\n' "$body" ;;
  esac
}

STAMP_CYPHER=""
VERDICT_CYPHER=""
L8_CRITICAL_CYPHER=""
L8_DRIFT_CYPHER=""

load_artifacts() {
  STAMP_CYPHER=$(extract_fence "$TL_FIX_SKILL" 'OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)')
  VERDICT_CYPHER=$(extract_fence "$TL_FIX_SKILL" '$reviewedTaskIds')
  L8_CRITICAL_CYPHER=$(extract_fence "$SA_VALIDATE_SKILL" 'L8.1 --')
  L8_DRIFT_CYPHER=$(extract_fence "$SA_VALIDATE_SKILL" 'L8.1b --')
}

# Run the Step 5 stamp with standard fix params.
run_stamp() { # $1=ucId $2=reason $3=origin
  terminate "$STAMP_CYPHER" | cy \
    --param "affectedUcIds => [\"$1\"]" \
    --param "reason => \"$2\"" \
    --param "origin => \"$3\""
}

# Boolean probe: expects a single-column boolean query; echoes true/false/raw.
probe() {
  out=$(cy)
  if printf '%s' "$out" | grep -qi '^true$'; then echo true
  elif printf '%s' "$out" | grep -qi '^false$'; then echo false
  else echo "RAW:$(printf '%s' "$out" | tr '\n' ' ')"; fi
}

# Echo the review_status of a task (or NULL / RAW:...).
status_of() { # $1=taskId
  out=$(printf 'MATCH (t:Task {id: "%s"}) RETURN coalesce(t.review_status, "NULL") AS rs;\n' "$1" | cy)
  printf '%s' "$out" | grep -Eo '^"?(stale|spec_drift|NULL)"?$' | head -1 | tr -d '"'
}

# Seed one UC (spec_version 1) with two shipped and two active tasks.
seed_mixed_uc() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-105', name: 'Session workspace', spec_version: 1})
CREATE (be:Task  {id: 'UC105-BE',  title: 'BE',  type: 'BE', status: 'done',
                  planned_from_version: 1, commit: 'aaa1111',
                  verification_evidence: 'verify-GREEN:.tl/tasks/UC105-BE/verification.md',
                  phase_be: 'done', phase_qa: 'done'})
CREATE (fe:Task  {id: 'UC105-FE',  title: 'FE',  type: 'FE', status: 'verified-pending',
                  planned_from_version: 1, commit: 'bbb2222',
                  phase_fe: 'done'})
CREATE (p1:Task  {id: 'UC105-FE-FR021', title: 'FR021 FE', type: 'FE', status: 'pending',
                  planned_from_version: 1, phase_fe: 'pending'})
CREATE (p2:Task  {id: 'UC105-BE-FIX',   title: 'Fix BE',  type: 'BE', status: 'in_progress',
                  planned_from_version: 1, phase_be: 'in_progress'})
CREATE (uc)-[:GENERATES]->(be)
CREATE (uc)-[:GENERATES]->(fe)
CREATE (uc)-[:GENERATES]->(p1)
CREATE (uc)-[:GENERATES]->(p2);
EOF
}

CASE_STATUS=""
CASE_REASON=""

# ---------------------------------------------------------------------------
# Preconditions: docker + python3, then a scratch Neo4j.
# ---------------------------------------------------------------------------
if [ "$FORCE_SKIP_DOCKER" = "true" ]; then
  DOCKER_SKIP_REASON="skip-docker-flag"
elif ! command -v python3 >/dev/null 2>&1; then
  DOCKER_SKIP_REASON="python3-unavailable"
else
  for candidate in docker /usr/local/bin/docker /opt/homebrew/bin/docker; do
    if command -v "$candidate" >/dev/null 2>&1; then DOCKER_BIN="$candidate"; break; fi
  done
  if [ -z "$DOCKER_BIN" ]; then
    DOCKER_SKIP_REASON="docker-not-installed"
  elif ! "$DOCKER_BIN" info >/dev/null 2>&1; then
    DOCKER_SKIP_REASON="docker-daemon-unavailable"
  else
    cleanup
    BOLT_PORT=$(find_free_port "$PORT_SCAN_START")
    if [ -z "$BOLT_PORT" ]; then
      DOCKER_SKIP_REASON="no-free-port"
    elif ! "$DOCKER_BIN" run -d --name "$CONTAINER" \
            -p "127.0.0.1:${BOLT_PORT}:7687" \
            -e NEO4J_AUTH="neo4j/${PASSWORD}" \
            "$NEO4J_IMAGE" >/dev/null 2>&1; then
      DOCKER_SKIP_REASON="container-start-failed"
    else
      ready=false
      i=0
      while [ "$i" -lt 60 ]; do
        if printf 'RETURN 1;\n' | cy >/dev/null 2>&1; then ready=true; break; fi
        i=$((i + 1))
        sleep 2
      done
      if [ "$ready" = "true" ]; then
        DOCKER_OK=true
        load_artifacts
      else
        DOCKER_SKIP_REASON="neo4j-not-ready"
      fi
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Case: stamp-shipped-drift — the core RED. A fix that bumps UC-105 must NOT
# tell already-shipped tasks to re-plan. Both shipped statuses (done and
# verified-pending) must land on 'spec_drift', never 'stale'.
# ---------------------------------------------------------------------------
run_stamp_shipped_drift() {
  seed_mixed_uc
  out=$(run_stamp "UC-105" "fixed by DEC-048" "DEC-048")
  be=$(status_of "UC105-BE")
  fe=$(status_of "UC105-FE")
  if [ "$be" = "spec_drift" ] && [ "$fe" = "spec_drift" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok done+verified-pending -> spec_drift"
  else
    CASE_STATUS=FAIL
    CASE_REASON="shipped-stamped-for-replan:done=$be verified-pending=$fe:stamp_out=$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-100)"
  fi
}

# ---------------------------------------------------------------------------
# Case: stamp-active-stale — unchanged semantics guard. Active tasks are real
# re-planning units and must keep landing on 'stale'; the fix must not silence
# them along with the shipped ones.
# ---------------------------------------------------------------------------
run_stamp_active_stale() {
  p1=$(status_of "UC105-FE-FR021")
  p2=$(status_of "UC105-BE-FIX")
  if [ "$p1" = "stale" ] && [ "$p2" = "stale" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok pending+in_progress -> stale"
  else
    CASE_STATUS=FAIL; CASE_REASON="active-not-stale:pending=$p1 in_progress=$p2"
  fi
}

# ---------------------------------------------------------------------------
# Case: stamp-mixed-uc — one UC may hold both classes at once, and the UC node
# itself must still carry the spec_version bump that Signal 1 keys on.
# ---------------------------------------------------------------------------
run_stamp_mixed_uc() {
  result=$(probe <<'EOF'
MATCH (uc:UseCase {id: 'UC-105'})-[:GENERATES]->(t:Task)
WITH uc,
     count(CASE WHEN t.review_status = 'spec_drift' THEN 1 END) AS drift,
     count(CASE WHEN t.review_status = 'stale' THEN 1 END) AS stale
RETURN drift = 2 AND stale = 2 AND uc.spec_version = 2 AS ok;
EOF
)
  if [ "$result" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok 2 drift + 2 stale, spec_version 1->2"
  else
    CASE_STATUS=FAIL; CASE_REASON="mixed-uc-wrong:$result"
  fi
}

# ---------------------------------------------------------------------------
# Case: verdict-still-correct — the exit gate #7 promises ("or re-reviewing the
# flagged nodes") but never had. A shipped task judged still-correct under the
# new spec must leave spec_drift with its provenance advanced in the SAME write
# — clearing the flag alone silences Signal 2 while Signal 1 fires forever —
# and must record who closed it.
# ---------------------------------------------------------------------------
run_verdict_still_correct() {
  if [ -z "$VERDICT_CYPHER" ]; then
    CASE_STATUS=FAIL; CASE_REASON="verdict-block-missing:no-exit-for-spec_drift"
    return
  fi
  terminate "$VERDICT_CYPHER" | cy \
    --param 'reviewedTaskIds => ["UC105-BE", "UC105-FE"]' \
    --param 'decisionId => "DEC-048"' >/dev/null
  result=$(probe <<'EOF'
MATCH (uc:UseCase {id: 'UC-105'})-[:GENERATES]->(t:Task)
WHERE t.id IN ['UC105-BE', 'UC105-FE']
WITH uc.spec_version AS sv, collect(t) AS ts
RETURN size(ts) = 2
   AND all(x IN ts WHERE x.planned_from_version = sv
           AND x.review_status IS NULL
           AND x.stale_reason IS NULL
           AND x.reviewed_by = 'DEC-048'
           AND x.reviewed_at IS NOT NULL
           AND x.status IN ['done', 'verified-pending']
           AND x.commit IS NOT NULL) AS ok;
EOF
)
  # The pfv-advance contract's own acceptance query must also go quiet for them.
  accept=$(probe <<'EOF'
MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE t.id IN ['UC105-BE', 'UC105-FE']
  AND t.planned_from_version IS NOT NULL
  AND coalesce(uc.spec_version, 0) > t.planned_from_version
  AND coalesce(t.review_status, 'current') <> 'stale'
RETURN count(t) = 0 AS ok;
EOF
)
  if [ "$result" = "true" ] && [ "$accept" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok pfv advanced, flags cleared, reviewed_by set, shipped state intact"
  else
    CASE_STATUS=FAIL; CASE_REASON="verdict-incomplete:closed=$result signal1-quiet=$accept"
  fi
}

# ---------------------------------------------------------------------------
# Case: l8-critical-excludes-drift — the gate must stop conflating the two
# questions. L8.1 (CRITICAL, blocks the release) may list the active stale
# tasks and must NOT list a spec_drift one. Re-seeds and re-stamps so both
# classes are present and un-drained.
# ---------------------------------------------------------------------------
run_l8_critical_excludes_drift() {
  seed_mixed_uc
  run_stamp "UC-105" "fixed by DEC-048" "DEC-048" >/dev/null
  if [ -z "$L8_CRITICAL_CYPHER" ]; then
    CASE_STATUS=FAIL; CASE_REASON="l8.1-fence-missing"
    return
  fi
  out=$(terminate "$L8_CRITICAL_CYPHER" | cy)
  listed_drift=false
  listed_stale=false
  printf '%s' "$out" | grep -q 'UC105-BE"' && listed_drift=true
  printf '%s' "$out" | grep -q 'UC105-FE-FR021' && listed_stale=true
  if [ "$listed_drift" = "false" ] && [ "$listed_stale" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok CRITICAL lists stale only"
  else
    CASE_STATUS=FAIL
    CASE_REASON="l8.1-wrong-scope:lists_shipped_drift=$listed_drift lists_active_stale=$listed_stale"
  fi
}

# ---------------------------------------------------------------------------
# Case: l8-budget-within — a small, fresh spec_drift backlog is a WARNING. This
# is what lets a release proceed on honest state instead of being force-skipped
# with an operator note, which is how the live project shipped past gate #7.
# ---------------------------------------------------------------------------
run_l8_budget_within() {
  if [ -z "$L8_DRIFT_CYPHER" ]; then
    CASE_STATUS=FAIL; CASE_REASON="l8.1b-fence-missing:no-proportional-gate"
    return
  fi
  out=$(terminate "$L8_DRIFT_CYPHER" | cy \
          --param 'driftMaxAgeDays => 14' \
          --param 'driftMaxCount => 25')
  if printf '%s' "$out" | grep -q 'WARNING'; then
    CASE_STATUS=PASS; CASE_REASON="ok 2 fresh drifted, budget 25/14d -> WARNING"
  else
    CASE_STATUS=FAIL; CASE_REASON="within-budget-not-warning:$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-120)"
  fi
}

# ---------------------------------------------------------------------------
# Case: l8-budget-exceeded — the escalation arm. A backlog that outgrows its
# count budget, or ages past it, becomes CRITICAL: the gate drains or it
# escalates, and can never sit permanently red-and-ignored the way the live
# project's did for eleven days.
# ---------------------------------------------------------------------------
run_l8_budget_exceeded() {
  if [ -z "$L8_DRIFT_CYPHER" ]; then
    CASE_STATUS=FAIL; CASE_REASON="l8.1b-fence-missing:no-proportional-gate"
    return
  fi
  # Age the existing drift past the budget.
  printf 'MATCH (t:Task) WHERE t.review_status = "spec_drift" SET t.stale_since = datetime() - duration({days: 30});\n' | cy >/dev/null
  aged=$(terminate "$L8_DRIFT_CYPHER" | cy \
           --param 'driftMaxAgeDays => 14' \
           --param 'driftMaxCount => 25')
  # And independently: within age, but over the count budget.
  printf 'MATCH (t:Task) WHERE t.review_status = "spec_drift" SET t.stale_since = datetime();\n' | cy >/dev/null
  counted=$(terminate "$L8_DRIFT_CYPHER" | cy \
              --param 'driftMaxAgeDays => 14' \
              --param 'driftMaxCount => 1')
  aged_ok=false; counted_ok=false
  printf '%s' "$aged" | grep -q 'CRITICAL' && aged_ok=true
  printf '%s' "$counted" | grep -q 'CRITICAL' && counted_ok=true
  if [ "$aged_ok" = "true" ] && [ "$counted_ok" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok age-exceeded and count-exceeded both escalate"
  else
    CASE_STATUS=FAIL; CASE_REASON="no-escalation:age=$aged_ok count=$counted_ok"
  fi
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
for name in $KNOWN_CASES; do
  if [ "$DOCKER_OK" != "true" ]; then
    status=SKIP; reason="$DOCKER_SKIP_REASON"
  else
    case "$name" in
      stamp-shipped-drift) run_stamp_shipped_drift ;;
      stamp-active-stale) run_stamp_active_stale ;;
      stamp-mixed-uc) run_stamp_mixed_uc ;;
      verdict-still-correct) run_verdict_still_correct ;;
      l8-critical-excludes-drift) run_l8_critical_excludes_drift ;;
      l8-budget-within) run_l8_budget_within ;;
      l8-budget-exceeded) run_l8_budget_exceeded ;;
    esac
    status="$CASE_STATUS"; reason="$CASE_REASON"
  fi
  if should_print "$name"; then report "$name" "$status" "$reason"; fi
done

exit "$OVERALL_RC"

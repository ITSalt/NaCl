#!/usr/bin/env bash
# tests/graph/regression-uc-allocator-task-merge.sh — RED/GREEN regression
# matrix for three graph-contract defects:
#
#   1. UC-id allocation (sa_next_uc_in_module): must be collision-safe under
#      BOTH numbering schemes — per-module ranges (uc_range_start) and global
#      numbering (UC ids increase straight through all modules).
#   2. Planning re-MERGE of Task nodes (Step 2.4 of the planning skill): a
#      stale task whose code already shipped (status done/verified-pending)
#      must keep status, phase_* progress, commit and verification evidence;
#      active stale tasks still reset; fresh creates still start pending.
#   3. planned_from_version advancement (pfv-advance contract): a fix that
#      clears a task's stale flag after re-syncing its files must advance
#      planned_from_version in the same write, else Signal 1 fires forever.
#
# MANUAL / stage-3 verification only. Drives a real disposable Neo4j in
# Docker; intentionally NOT wired into CI (CI has no docker daemon). Run by
# hand on a developer machine. Everything it creates is named with the
# "naclregr" prefix and cleanup only ever acts on that prefix.
#
# The Cypher under test is EXTRACTED FROM THE SHIPPED ARTIFACTS at run time
# (queries file + skill bodies), so the matrix binds to the real text:
#   - allocator: graph-infra/queries/sa-queries.cypher, `sa_next_uc_in_module`
#   - task re-MERGE: the nacl-tl-plan SKILL.md fence containing
#     `MERGE (t:Task {id: $taskId})`
#   - pfv-advance: the nacl-tl-fix SKILL.md fence containing `$syncedTaskIds`
#     (absent on pre-fix trees — the case then FAILs, which IS the RED signal)
#
# Usage:
#   tests/graph/regression-uc-allocator-task-merge.sh [--case <name>] [--skip-docker]
#
# Output contract: one line per ran case:
#   NACL_SMOKE_RESULT: case=<name> status=PASS|FAIL|SKIP reason=<short>
# Exit code is non-zero iff any ran case is FAIL.
#
# Case order (fixed; later cases re-seed, so each is self-contained):
#   alloc-global-collision -> alloc-global-next -> alloc-range ->
#   alloc-empty-module -> merge-preserve-done -> merge-reset-active ->
#   merge-create -> pfv-advance
#
# `set -e` deliberately NOT used (same rationale as tests/desktop/graph-smoke.sh):
# probes that legitimately return non-zero must not abort the harness.
set -u

PREFIX="naclregr"
CONTAINER="${PREFIX}-neo4j"
PASSWORD="neo4j_graph_dev"
PORT_SCAN_START=3920
NEO4J_IMAGE="neo4j:5-community"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
QUERIES_FILE="$REPO_ROOT/graph-infra/queries/sa-queries.cypher"
TL_PLAN_SKILL="$REPO_ROOT/nacl-tl-plan/SKILL.md"
TL_FIX_SKILL="$REPO_ROOT/nacl-tl-fix/SKILL.md"
FIXTURE="$SCRIPT_DIR/fixtures/global-numbering-seed.cypher"

CASE_FILTER=""
FORCE_SKIP_DOCKER=false

while [ $# -gt 0 ]; do
  case "$1" in
    --case) CASE_FILTER="$2"; shift 2 ;;
    --skip-docker) FORCE_SKIP_DOCKER=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

KNOWN_CASES="alloc-global-collision alloc-global-next alloc-range alloc-empty-module merge-preserve-done merge-reset-active merge-create pfv-advance"
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

# cy [--param 'name => value']... <<< "statements" — run statements on the
# scratch instance, print cypher-shell plain output.
cy() {
  "$DOCKER_BIN" exec -i "$CONTAINER" cypher-shell -u neo4j -p "$PASSWORD" --format plain "$@" 2>&1
}

wipe_graph() {
  printf 'MATCH (n) DETACH DELETE n;\n' | cy >/dev/null
}

seed_global_fixture() {
  cy < "$FIXTURE" >/dev/null
}

# Extract the statement published under `// Query: <name>` in a queries file:
# every line after the marker up to and including the first line ending in `;`.
extract_named_query() { # $1=file $2=query-name
  awk -v marker="// Query: $2" '
    found && /;[[:space:]]*$/ { print; exit }
    found { print }
    index($0, marker) { found = 1 }
  ' "$1"
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

ALLOCATOR_CYPHER=""
STEP24_CYPHER=""
PFV_ADVANCE_CYPHER=""

load_artifacts() {
  ALLOCATOR_CYPHER=$(extract_named_query "$QUERIES_FILE" "sa_next_uc_in_module")
  STEP24_CYPHER=$(extract_fence "$TL_PLAN_SKILL" 'MERGE (t:Task {id: $taskId})')
  PFV_ADVANCE_CYPHER=$(extract_fence "$TL_FIX_SKILL" '$syncedTaskIds')
}

# Run the allocator for a module; echo the bare UC id (or raw output on error).
allocate_for() { # $1=moduleId
  out=$(printf '%s\n' "$ALLOCATOR_CYPHER" | cy --param "moduleId => \"$1\"")
  id=$(printf '%s' "$out" | grep -o 'UC-[0-9][0-9]*' | head -1)
  if [ -n "$id" ]; then echo "$id"; else echo "RAW:$(printf '%s' "$out" | tr '\n' ' ')"; fi
}

# Run the Step 2.4 task re-MERGE template with standard regen params.
run_step24() { # $1=taskId $2=ucId $3=specVersion $4=waveNumber
  terminate "$STEP24_CYPHER" | cy \
    --param "taskId => \"$1\"" \
    --param "title => \"Regenerated title\"" \
    --param "type => \"BE\"" \
    --param "waveNumber => $4" \
    --param "agent => \"developer\"" \
    --param "priority => null" \
    --param "specVersion => $3" \
    --param "ucId => \"$2\""
}

# Boolean probe: expects a single-column boolean query; echoes true/false/raw.
probe() {
  out=$(cy)
  if printf '%s' "$out" | grep -qi '^true$'; then echo true
  elif printf '%s' "$out" | grep -qi '^false$'; then echo false
  else echo "RAW:$(printf '%s' "$out" | tr '\n' ' ')"; fi
}

# Signal 1 — copied verbatim from the planning skill's drift detector.
SIGNAL1_COUNT='MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE t.planned_from_version IS NOT NULL
  AND coalesce(uc.spec_version, 0) > t.planned_from_version
RETURN count(t) AS drifted;'

signal1_count() {
  printf '%s\n' "$SIGNAL1_COUNT" | cy | grep -o '^[0-9][0-9]*$' | head -1
}

CASE_STATUS=""
CASE_REASON=""

# ---------------------------------------------------------------------------
# Preconditions: docker + python3, then a scratch Neo4j with apoc.
# ---------------------------------------------------------------------------
if [ "$FORCE_SKIP_DOCKER" = "true" ]; then
  DOCKER_OK=false; DOCKER_SKIP_REASON="skip-docker-flag"
elif ! command -v python3 >/dev/null 2>&1; then
  DOCKER_OK=false; DOCKER_SKIP_REASON="python3-missing"
else
  for c in docker /usr/local/bin/docker /opt/homebrew/bin/docker "$HOME/.docker/bin/docker" /Applications/Docker.app/Contents/Resources/bin/docker; do
    if command -v "$c" >/dev/null 2>&1; then DOCKER_BIN=$(command -v "$c"); break; fi
    if [ -x "$c" ]; then DOCKER_BIN="$c"; break; fi
  done
  if [ -z "$DOCKER_BIN" ]; then
    DOCKER_OK=false; DOCKER_SKIP_REASON="docker-cli-missing"
  elif ! "$DOCKER_BIN" info >/dev/null 2>&1; then
    DOCKER_OK=false; DOCKER_SKIP_REASON="docker-daemon-down"
  else
    DOCKER_OK=true
  fi
fi

if [ "$DOCKER_OK" = "true" ]; then
  BOLT_PORT=$(find_free_port "$PORT_SCAN_START") || { DOCKER_OK=false; DOCKER_SKIP_REASON="no-free-port"; }
fi

if [ "$DOCKER_OK" = "true" ]; then
  "$DOCKER_BIN" rm -f "$CONTAINER" >/dev/null 2>&1
  # Mirrors graph-infra/docker-compose.yml: same image, apoc plugin, apoc
  # procedures allowed. No volumes — fully disposable.
  if ! "$DOCKER_BIN" run -d --name "$CONTAINER" \
      -e NEO4J_AUTH="neo4j/$PASSWORD" \
      -e NEO4J_PLUGINS='["apoc"]' \
      -e NEO4J_dbms_security_procedures_unrestricted='apoc.*' \
      -e NEO4J_dbms_security_procedures_allowlist='apoc.*' \
      -p "$BOLT_PORT:7687" \
      "$NEO4J_IMAGE" >/dev/null 2>&1; then
    DOCKER_OK=false; DOCKER_SKIP_REASON="docker-run-failed"
  fi
fi

if [ "$DOCKER_OK" = "true" ]; then
  # Ready when cypher-shell answers AND apoc is callable (plugin loads late).
  ready=false; i=0
  while [ "$i" -lt 120 ]; do
    if printf "RETURN apoc.text.lpad('1', 3, '0');\n" | cy >/dev/null 2>&1; then
      ready=true; break
    fi
    i=$((i + 2)); sleep 2
  done
  if [ "$ready" != "true" ]; then
    DOCKER_OK=false; DOCKER_SKIP_REASON="neo4j-not-ready"
  fi
fi

[ "$DOCKER_OK" = "true" ] && load_artifacts

# ---------------------------------------------------------------------------
# Case: alloc-global-collision — the incident shape. Global numbering
# UC-001..UC-013 across three modules; allocating in the MIDDLE module
# (local max UC-010) must NOT yield UC-011 (exists in the next module) and
# must not yield any existing id; the collision-safe fallback is global
# max + 1 = UC-014.
# ---------------------------------------------------------------------------
run_alloc_global_collision() {
  wipe_graph; seed_global_fixture
  got=$(allocate_for "mod-engine")
  if [ "$got" = "UC-011" ]; then
    CASE_STATUS=FAIL; CASE_REASON="collision:allocated-existing-UC-011"
  elif [ "$got" = "UC-014" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok got=$got"
  else
    CASE_STATUS=FAIL; CASE_REASON="unexpected:$got"
  fi
}

# ---------------------------------------------------------------------------
# Case: alloc-global-next — after the allocated UC-014 is created (in the
# same middle module), a repeat call yields the next global number UC-015.
# ---------------------------------------------------------------------------
run_alloc_global_next() {
  printf 'MATCH (m:Module {id: "mod-engine"}) CREATE (uc:UseCase {id: "UC-014", name: "Engine case 14", spec_version: 1}) CREATE (m)-[:CONTAINS_UC]->(uc);\n' | cy >/dev/null
  got=$(allocate_for "mod-engine")
  if [ "$got" = "UC-015" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok got=$got"
  else
    CASE_STATUS=FAIL; CASE_REASON="unexpected:$got"
  fi
}

# ---------------------------------------------------------------------------
# Case: alloc-range — range-partitioned numbering must keep working exactly
# as before: module-local max + 1 stands when it collides with nothing.
# ---------------------------------------------------------------------------
run_alloc_range() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (ma:Module {id: 'mod-a', name: 'A', uc_range_start: 100});
CREATE (mb:Module {id: 'mod-b', name: 'B', uc_range_start: 200});
MATCH (m:Module {id: 'mod-a'})
UNWIND range(101, 105) AS n
CREATE (uc:UseCase {id: 'UC-' + toString(n), spec_version: 1})
CREATE (m)-[:CONTAINS_UC]->(uc);
MATCH (m:Module {id: 'mod-b'})
UNWIND range(201, 205) AS n
CREATE (uc:UseCase {id: 'UC-' + toString(n), spec_version: 1})
CREATE (m)-[:CONTAINS_UC]->(uc);
EOF
  got=$(allocate_for "mod-b")
  if [ "$got" = "UC-206" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok got=$got"
  else
    CASE_STATUS=FAIL; CASE_REASON="unexpected:$got"
  fi
}

# ---------------------------------------------------------------------------
# Case: alloc-empty-module — a module with no UCs starts at uc_range_start.
# ---------------------------------------------------------------------------
run_alloc_empty_module() {
  printf 'CREATE (:Module {id: "mod-c", name: "C", uc_range_start: 300});\n' | cy >/dev/null
  got=$(allocate_for "mod-c")
  if [ "$got" = "UC-300" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok got=$got"
  else
    CASE_STATUS=FAIL; CASE_REASON="unexpected:$got"
  fi
}

# ---------------------------------------------------------------------------
# Case: merge-preserve-done — re-planning a stale task whose code shipped
# (status=done, commit + verification evidence present) must keep status,
# phase progress, commit and evidence, while stamping planned_from_version
# to the current spec and clearing the stale flag.
# ---------------------------------------------------------------------------
run_merge_preserve_done() {
  wipe_graph; seed_global_fixture
  out=$(run_step24 "UC009-BE" "UC-009" 2 1)
  result=$(probe <<'EOF'
MATCH (t:Task {id: 'UC009-BE'})
RETURN t.status = 'done'
   AND t.phase_be = 'done' AND t.phase_qa = 'done'
   AND t.commit = 'abc1234'
   AND t.verification_evidence = 'verify-GREEN:.tl/tasks/UC009-BE/verification.md'
   AND t.planned_from_version = 2
   AND t.review_status IS NULL AS ok;
EOF
)
  if [ "$result" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    state=$(printf 'MATCH (t:Task {id: "UC009-BE"}) RETURN t.status + "/" + t.phase_be + "/pfv=" + toString(t.planned_from_version) AS s;\n' | cy | tail -1)
    CASE_STATUS=FAIL; CASE_REASON="shipped-task-not-preserved:${state}:merge_out=$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-120)"
  fi
}

# ---------------------------------------------------------------------------
# Case: merge-reset-active — a stale in-progress task still resets to
# pending with all phases back to pending (unchanged semantics).
# ---------------------------------------------------------------------------
run_merge_reset_active() {
  run_step24 "UC010-BE" "UC-010" 1 1 >/dev/null
  result=$(probe <<'EOF'
MATCH (t:Task {id: 'UC010-BE'})
RETURN t.status = 'pending' AND t.phase_be = 'pending'
   AND t.review_status IS NULL AS ok;
EOF
)
  if [ "$result" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    CASE_STATUS=FAIL; CASE_REASON="active-task-not-reset:$result"
  fi
}

# ---------------------------------------------------------------------------
# Case: merge-create — a brand-new task id starts pending with created set.
# ---------------------------------------------------------------------------
run_merge_create() {
  run_step24 "UC013-BE" "UC-013" 1 1 >/dev/null
  result=$(probe <<'EOF'
MATCH (t:Task {id: 'UC013-BE'})
RETURN t.status = 'pending' AND t.phase_be = 'pending'
   AND t.created IS NOT NULL AND t.planned_from_version = 1 AS ok;
EOF
)
  if [ "$result" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    CASE_STATUS=FAIL; CASE_REASON="fresh-create-wrong:$result"
  fi
}

# ---------------------------------------------------------------------------
# Case: pfv-advance — reproduce the false-positive drift, then verify the
# fix skill's self-sync block extinguishes Signal 1.
#   1. Seed: UC spec_version=2, task pfv=1, stale.
#   2. Simulate the OLD clear (flag only): Signal 1 must fire — the bug.
#   3. Run the pfv-advance block extracted from the fix skill: Signal 1 and
#      the runbook acceptance query must both go quiet.
# ---------------------------------------------------------------------------
run_pfv_advance() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-001', name: 'Core case 1', spec_version: 2})
CREATE (t:Task {id: 'UC001-BE', title: 'Core case 1 BE', type: 'BE',
                status: 'done', planned_from_version: 1,
                review_status: 'stale', stale_reason: 'fix-updated-spec'})
CREATE (uc)-[:GENERATES]->(t);
EOF
  # Old behaviour: clear the flag, leave pfv behind.
  printf 'MATCH (t:Task {id: "UC001-BE"}) REMOVE t.review_status, t.stale_reason, t.stale_since, t.stale_origin;\n' | cy >/dev/null

  before=$(signal1_count)
  if [ "$before" != "1" ]; then
    CASE_STATUS=FAIL; CASE_REASON="precondition-broken:signal1=$before"
    return
  fi

  if [ -z "$PFV_ADVANCE_CYPHER" ]; then
    # Pre-fix tree: the fix skill has no pfv-advance block — the drift stays.
    CASE_STATUS=FAIL; CASE_REASON="pfv-advance-block-missing:signal1-stays=$before"
    return
  fi

  terminate "$PFV_ADVANCE_CYPHER" | cy --param 'syncedTaskIds => ["UC001-BE"]' >/dev/null
  after=$(signal1_count)
  accept=$(probe <<'EOF'
MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE t.planned_from_version IS NOT NULL
  AND coalesce(uc.spec_version, 0) > t.planned_from_version
  AND coalesce(t.review_status, 'current') <> 'stale'
RETURN count(t) = 0 AS ok;
EOF
)
  if [ "$after" = "0" ] && [ "$accept" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok signal1:1->0"
  else
    CASE_STATUS=FAIL; CASE_REASON="signal1-after=$after accept=$accept"
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
      alloc-global-collision) run_alloc_global_collision ;;
      alloc-global-next) run_alloc_global_next ;;
      alloc-range) run_alloc_range ;;
      alloc-empty-module) run_alloc_empty_module ;;
      merge-preserve-done) run_merge_preserve_done ;;
      merge-reset-active) run_merge_reset_active ;;
      merge-create) run_merge_create ;;
      pfv-advance) run_pfv_advance ;;
    esac
    status="$CASE_STATUS"; reason="$CASE_REASON"
  fi
  if should_print "$name"; then report "$name" "$status" "$reason"; fi
done

exit "$OVERALL_RC"

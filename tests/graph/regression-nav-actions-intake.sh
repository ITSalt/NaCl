#!/usr/bin/env bash
# tests/graph/regression-nav-actions-intake.sh — RED/GREEN regression matrix
# for two graph-contract defects surfaced by a conductor intake batch:
#
#   A. nav-actions consumer check (nacl-tl-review) must NOT block a legitimate
#      formless screen. A UC with has_ui=true whose Screen carries
#      formless=true has no Form BY SPECIFICATION; the pre-fix query treats
#      "no Form" as a blocker (reason='no-form') and false-BLOCKs the review.
#      A real Form that merely lacks an inbound action must STILL block.
#   B. tl-plan Task re-MERGE (Step 2.4) must stamp Task.intake_id from the
#      optional $intakeId param, so the conductor Phase-4/4.5 gates that filter
#      `WHERE t.intake_id = $intakeId` see every task the plan created. A null
#      $intakeId (standalone /nacl:tl-plan) must NOT clobber a prior value.
#   C. The SAME Step 2.4 statement must also stamp UseCase.intake_id on the
#      SOURCE UC (via the one shared $intakeId binding), so the conductor's
#      Phase-4.5 P-S6 staleness gate — which anchors on
#      `(:UseCase {intake_id:$intake})` to bound this batch's UC closure — is
#      non-vacuous instead of matching zero UCs and passing trivially. A null
#      $intakeId must likewise NOT clobber a UC's prior value.
#
# MANUAL / stage-3 verification only. Drives a real disposable Neo4j in
# Docker; intentionally NOT wired into CI (CI has no docker daemon). Run by
# hand on a developer machine. Everything it creates is named with the
# "naclregr" prefix and cleanup only ever acts on that prefix.
#
# The Cypher under test is EXTRACTED FROM THE SHIPPED ARTIFACTS at run time
# (skill bodies), so the matrix binds to the real text:
#   - nav-actions:  the nacl-tl-review SKILL.md fence marked
#                   `nav_actions_consumer_check`
#   - intake stamp: the nacl-tl-plan SKILL.md fence containing
#                   `MERGE (t:Task {id: $taskId})`
# On a pre-fix tree the RED cases FAIL (formless UC is blocked; intake_id is
# never stamped) — that IS the RED signal.
#
# Usage:
#   tests/graph/regression-nav-actions-intake.sh [--case <name>] [--skip-docker]
#
# Output contract: one line per ran case:
#   NACL_SMOKE_RESULT: case=<name> status=PASS|FAIL|SKIP reason=<short>
# Exit code is non-zero iff any ran case is FAIL.
#
# Case order (fixed; each case re-seeds, so each is self-contained):
#   nav-formless -> nav-form-no-inbound -> nav-form-with-inbound ->
#   intake-stamp -> intake-preserve -> uc-intake-stamp -> uc-intake-preserve
#
# `set -e` deliberately NOT used: probes that legitimately return non-zero
# must not abort the harness.
set -u

PREFIX="naclregr"
CONTAINER="${PREFIX}-neo4j-navintake"
PASSWORD="neo4j_graph_dev"
PORT_SCAN_START=3940
NEO4J_IMAGE="neo4j:5-community"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
TL_REVIEW_SKILL="$REPO_ROOT/nacl-tl-review/SKILL.md"
TL_PLAN_SKILL="$REPO_ROOT/nacl-tl-plan/SKILL.md"

CASE_FILTER=""
FORCE_SKIP_DOCKER=false

while [ $# -gt 0 ]; do
  case "$1" in
    --case) CASE_FILTER="$2"; shift 2 ;;
    --skip-docker) FORCE_SKIP_DOCKER=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

KNOWN_CASES="nav-formless nav-form-no-inbound nav-form-with-inbound intake-stamp intake-preserve uc-intake-stamp uc-intake-preserve"
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

NAV_CHECK_CYPHER=""
STEP24_CYPHER=""

load_artifacts() {
  NAV_CHECK_CYPHER=$(extract_fence "$TL_REVIEW_SKILL" 'nav_actions_consumer_check')
  STEP24_CYPHER=$(extract_fence "$TL_PLAN_SKILL" 'MERGE (t:Task {id: $taskId})')
}

# Run the nav-actions consumer check for a single UC; echo the raw plain output.
nav_check() { # $1=uc-id
  terminate "$NAV_CHECK_CYPHER" | cy --param "affected_uc_ids => [\"$1\"]"
}

# Run the Step 2.4 task re-MERGE with an explicit intakeId (may be the literal
# word null). All params the template references must be bound or cypher-shell
# errors — that includes $intakeId once the fix lands.
run_step24_intake() { # $1=taskId $2=ucId $3=specVersion $4=waveNumber $5=intakeIdLiteral
  terminate "$STEP24_CYPHER" | cy \
    --param "taskId => \"$1\"" \
    --param "title => \"Regenerated title\"" \
    --param "type => \"BE\"" \
    --param "waveNumber => $4" \
    --param "agent => \"developer\"" \
    --param "priority => null" \
    --param "specVersion => $3" \
    --param "intakeId => $5" \
    --param "ucId => \"$2\""
}

# Boolean probe: expects a single-column boolean query; echoes true/false/raw.
probe() {
  out=$(cy)
  if printf '%s' "$out" | grep -qi '^true$'; then echo true
  elif printf '%s' "$out" | grep -qi '^false$'; then echo false
  else echo "RAW:$(printf '%s' "$out" | tr '\n' ' ')"; fi
}

CASE_STATUS=""
CASE_REASON=""

# ---------------------------------------------------------------------------
# Preconditions: docker + python3, then a scratch Neo4j.
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
  if ! "$DOCKER_BIN" run -d --name "$CONTAINER" \
      -e NEO4J_AUTH="neo4j/$PASSWORD" \
      -p "$BOLT_PORT:7687" \
      "$NEO4J_IMAGE" >/dev/null 2>&1; then
    DOCKER_OK=false; DOCKER_SKIP_REASON="docker-run-failed"
  fi
fi

if [ "$DOCKER_OK" = "true" ]; then
  ready=false; i=0
  while [ "$i" -lt 120 ]; do
    if printf "RETURN 1;\n" | cy >/dev/null 2>&1; then ready=true; break; fi
    i=$((i + 2)); sleep 2
  done
  if [ "$ready" != "true" ]; then
    DOCKER_OK=false; DOCKER_SKIP_REASON="neo4j-not-ready"
  fi
fi

[ "$DOCKER_OK" = "true" ] && load_artifacts

# ---------------------------------------------------------------------------
# Seeds. Every UC carries an actor-role != SYSTEM and has_ui=true, so it is
# in-scope for the nav-actions check (the exemptions the check already honours
# are not what we are testing).
# ---------------------------------------------------------------------------
seed_formless() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-F', name: 'Landing', has_ui: true})
CREATE (r:SystemRole {name: 'Visitor'})
CREATE (scr:Screen {id: 'SCR-F', name: 'Landing', route: '/', formless: true})
CREATE (uc)-[:ACTOR]->(r)
CREATE (uc)-[:HAS_SCREEN]->(scr);
EOF
}

seed_form_no_inbound() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-N', name: 'Upload', has_ui: true})
CREATE (r:SystemRole {name: 'User'})
CREATE (f:Form {id: 'FORM-N', name: 'Upload'})
CREATE (scr:Screen {id: 'SCR-N', name: 'Upload', route: '/upload', formless: false})
CREATE (uc)-[:ACTOR]->(r)
CREATE (uc)-[:USES_FORM]->(f)
CREATE (uc)-[:HAS_SCREEN]->(scr)
CREATE (scr)-[:RENDERS]->(f);
EOF
}

seed_form_with_inbound() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-I', name: 'Upload', has_ui: true})
CREATE (r:SystemRole {name: 'User'})
CREATE (f:Form {id: 'FORM-I', name: 'Upload'})
CREATE (scr:Screen {id: 'SCR-I', name: 'Catalog', route: '/catalog', formless: false})
CREATE (c:Component {id: 'CMP-I', name: 'UploadButton'})
CREATE (uc)-[:ACTOR]->(r)
CREATE (uc)-[:USES_FORM]->(f)
CREATE (uc)-[:HAS_SCREEN]->(scr)
CREATE (scr)-[:RENDERS]->(f)
CREATE (c)-[:HAS_INBOUND_ACTION]->(f);
EOF
}

# ---------------------------------------------------------------------------
# Case: nav-formless — a formless-screen UC must NOT appear as a blocker row.
# RED (pre-fix): the query returns UC-F with reason 'no-form'.
# ---------------------------------------------------------------------------
run_nav_formless() {
  seed_formless
  out=$(nav_check "UC-F")
  if printf '%s' "$out" | grep -q 'UC-F'; then
    reason=$(printf '%s' "$out" | grep -o 'no-form\|no-inbound-action' | head -1)
    CASE_STATUS=FAIL; CASE_REASON="formless-UC-blocked:reason=${reason:-?}"
  else
    CASE_STATUS=PASS; CASE_REASON="ok formless-exempt (0 rows)"
  fi
}

# ---------------------------------------------------------------------------
# Case: nav-form-no-inbound — a real Form with no inbound action must STILL
# block (reason 'no-inbound-action'). Guards against over-broad exemption.
# ---------------------------------------------------------------------------
run_nav_form_no_inbound() {
  seed_form_no_inbound
  out=$(nav_check "UC-N")
  if printf '%s' "$out" | grep -q 'no-inbound-action' && printf '%s' "$out" | grep -q 'UC-N'; then
    CASE_STATUS=PASS; CASE_REASON="ok still-blocked no-inbound-action"
  else
    CASE_STATUS=FAIL; CASE_REASON="real-form-not-blocked:$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-120)"
  fi
}

# ---------------------------------------------------------------------------
# Case: nav-form-with-inbound — a Form reached by an inbound action passes.
# ---------------------------------------------------------------------------
run_nav_form_with_inbound() {
  seed_form_with_inbound
  out=$(nav_check "UC-I")
  if printf '%s' "$out" | grep -q 'UC-I'; then
    CASE_STATUS=FAIL; CASE_REASON="reachable-form-blocked:$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-120)"
  else
    CASE_STATUS=PASS; CASE_REASON="ok reachable (0 rows)"
  fi
}

# ---------------------------------------------------------------------------
# Case: intake-stamp — Step 2.4 with $intakeId set stamps Task.intake_id.
# RED (pre-fix): the template never writes intake_id, so it stays null.
# ---------------------------------------------------------------------------
run_intake_stamp() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-001', name: 'Case 1', spec_version: 1})
CREATE (:Wave {id: 'W1', number: 1});
EOF
  run_step24_intake "UC001-BE" "UC-001" 1 1 '"intake-example"' >/dev/null
  result=$(probe <<'EOF'
MATCH (t:Task {id: 'UC001-BE'})
RETURN t.intake_id = 'intake-example' AS ok;
EOF
)
  if [ "$result" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok intake_id stamped"
  else
    got=$(printf 'MATCH (t:Task {id: "UC001-BE"}) RETURN coalesce(t.intake_id, "<null>") AS s;\n' | cy | tail -1)
    CASE_STATUS=FAIL; CASE_REASON="intake_id-not-stamped:got=${got}"
  fi
}

# ---------------------------------------------------------------------------
# Case: intake-preserve — a null $intakeId (standalone plan) must NOT clobber
# a Task's prior intake_id. GREEN-only guard on the coalesce semantics.
# ---------------------------------------------------------------------------
run_intake_preserve() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-002', name: 'Case 2', spec_version: 1})
CREATE (:Wave {id: 'W1', number: 1})
CREATE (t:Task {id: 'UC002-BE', status: 'done', intake_id: 'intake-earlier'});
EOF
  run_step24_intake "UC002-BE" "UC-002" 1 1 'null' >/dev/null
  result=$(probe <<'EOF'
MATCH (t:Task {id: 'UC002-BE'})
RETURN t.intake_id = 'intake-earlier' AS ok;
EOF
)
  if [ "$result" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok prior intake_id preserved"
  else
    got=$(printf 'MATCH (t:Task {id: "UC002-BE"}) RETURN coalesce(t.intake_id, "<null>") AS s;\n' | cy | tail -1)
    CASE_STATUS=FAIL; CASE_REASON="intake_id-clobbered:got=${got}"
  fi
}

# ---------------------------------------------------------------------------
# Case: uc-intake-stamp — Step 2.4 with $intakeId set stamps UseCase.intake_id
# on the SOURCE UC (same statement, same binding as the Task stamp), so the
# conductor Phase-4.5 P-S6 gate `MATCH (uc:UseCase {intake_id:$intake})…` sees
# this batch's UC closure. RED (pre-fix): the template never writes
# uc.intake_id, so it stays null and P-S6 matches nothing (vacuous pass).
# ---------------------------------------------------------------------------
run_uc_intake_stamp() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-101', name: 'Case 101', spec_version: 1})
CREATE (:Wave {id: 'W1', number: 1});
EOF
  run_step24_intake "UC101-BE" "UC-101" 1 1 '"intake-example"' >/dev/null
  result=$(probe <<'EOF'
MATCH (uc:UseCase {id: 'UC-101'})
RETURN uc.intake_id = 'intake-example' AS ok;
EOF
)
  if [ "$result" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok uc.intake_id stamped"
  else
    got=$(printf 'MATCH (uc:UseCase {id: "UC-101"}) RETURN coalesce(uc.intake_id, "<null>") AS s;\n' | cy | tail -1)
    CASE_STATUS=FAIL; CASE_REASON="uc-intake_id-not-stamped:got=${got}"
  fi
}

# ---------------------------------------------------------------------------
# Case: uc-intake-preserve — a null $intakeId (standalone plan) must NOT clobber
# a UC's prior intake_id. GREEN-only guard on the coalesce semantics (mirrors
# intake-preserve for the UC side).
# ---------------------------------------------------------------------------
run_uc_intake_preserve() {
  wipe_graph
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-102', name: 'Case 102', spec_version: 1, intake_id: 'intake-earlier'})
CREATE (:Wave {id: 'W1', number: 1});
EOF
  run_step24_intake "UC102-BE" "UC-102" 1 1 'null' >/dev/null
  result=$(probe <<'EOF'
MATCH (uc:UseCase {id: 'UC-102'})
RETURN uc.intake_id = 'intake-earlier' AS ok;
EOF
)
  if [ "$result" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok prior uc.intake_id preserved"
  else
    got=$(printf 'MATCH (uc:UseCase {id: "UC-102"}) RETURN coalesce(uc.intake_id, "<null>") AS s;\n' | cy | tail -1)
    CASE_STATUS=FAIL; CASE_REASON="uc-intake_id-clobbered:got=${got}"
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
      nav-formless) run_nav_formless ;;
      nav-form-no-inbound) run_nav_form_no_inbound ;;
      nav-form-with-inbound) run_nav_form_with_inbound ;;
      intake-stamp) run_intake_stamp ;;
      intake-preserve) run_intake_preserve ;;
      uc-intake-stamp) run_uc_intake_stamp ;;
      uc-intake-preserve) run_uc_intake_preserve ;;
    esac
    status="$CASE_STATUS"; reason="$CASE_REASON"
  fi
  if should_print "$name"; then report "$name" "$status" "$reason"; fi
done

exit "$OVERALL_RC"

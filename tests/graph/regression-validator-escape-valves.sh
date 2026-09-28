#!/usr/bin/env bash
# tests/graph/regression-validator-escape-valves.sh — RED/GREEN regression
# matrix for the two validator escape valves and the step-description probe.
#
# THE DEFECTS.
#   1. L3.8 (WARNING, "System ActivityStep has no realizing requirement") had
#      no escape valve. Once a project anchors its requirements, every pure
#      UI/plumbing System step (render, redirect, clear sessionStorage) stays a
#      warning forever, so the gate cannot reach PASS without junk
#      requirements. Also: the shipped L3.8 fence carried a `-- opt-in: ...`
#      annotation, which is not a Cypher comment — the query as written is a
#      syntax error on Neo4j 5.
#   2. L13.9 (WARNING, two same-storage CachePolicies on one endpoint) fired on
#      intentional layering (in-app Cache API + Service Worker runtime cache)
#      with no way to record the acceptance.
#   3. A migration that read the wrong Main Flow table column left
#      ActivityStep descriptions like "1", "7a", "--" and nothing surfaced it.
#
# THE CONTRACT UNDER TEST.
#   - L3.8 skips steps with coverage_exempt=true; L3.9 flags coverage_exempt
#     without a non-blank coverage_exempt_reason.
#   - L13.9 is silenced only when BOTH policies of the pair carry
#     overlap_accepted=true; L13.10 flags overlap_accepted without a reason.
#   - L3.6b counts numeric-only / placeholder step descriptions per UC.
#   - Step 0d's escape-valve debt query reports exempted + reasonless counts.
#   - nacl-sa-flags suggest-coverage-exempt only reads and separates plumbing
#     candidates from steps carrying rule markers; its setter refuses a blank
#     reason.
#
# MANUAL / stage-3 verification only. Drives a real disposable Neo4j in
# Docker; intentionally NOT wired into CI (CI has no docker daemon). Everything
# it creates is named with the "naclvalve" prefix and cleanup only ever acts on
# that prefix. It never connects to any project graph.
#
# The Cypher under test is EXTRACTED FROM THE SHIPPED ARTIFACT at run time
# (first ```cypher fence in nacl-sa-validate/SKILL.md containing the marker),
# so the matrix binds to the real skill text. Point NACL_SA_VALIDATE_SKILL at
# a pre-fix copy of the file to see the RED side:
#   git show <base>:nacl-sa-validate/SKILL.md > /tmp/pre.md
#   NACL_SA_VALIDATE_SKILL=/tmp/pre.md tests/graph/regression-validator-escape-valves.sh
#
# Usage:
#   tests/graph/regression-validator-escape-valves.sh [--case <name>] [--skip-docker]
#
# Output contract: one line per ran case:
#   NACL_SMOKE_RESULT: case=<name> status=PASS|FAIL|SKIP reason=<short>
# Exit code is non-zero iff any ran case is FAIL.
#
# `set -e` deliberately NOT used (same rationale as the sibling harnesses).
set -u

PREFIX="naclvalve"
CONTAINER="${PREFIX}-neo4j"
PASSWORD="neo4j_graph_dev"
PORT_SCAN_START=3960
NEO4J_IMAGE="neo4j:5-community"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SA_VALIDATE_SKILL="${NACL_SA_VALIDATE_SKILL:-$REPO_ROOT/nacl-sa-validate/SKILL.md}"
SA_FLAGS_SKILL="${NACL_SA_FLAGS_SKILL:-$REPO_ROOT/nacl-sa-flags/SKILL.md}"

CASE_FILTER=""
FORCE_SKIP_DOCKER=false

while [ $# -gt 0 ]; do
  case "$1" in
    --case) CASE_FILTER="$2"; shift 2 ;;
    --skip-docker) FORCE_SKIP_DOCKER=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

KNOWN_CASES="l38-coverage-exempt l39-reason-required l36b-description-probe l139-overlap-accepted l1310-reason-required step0d-valve-debt flags-suggest-report-only flags-setter-needs-reason"
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

# Run a fence verbatim; a Cypher error surfaces as RAW text the cases check for.
run_fence() { # $1=fence body
  terminate "$1" | cy
}

is_cypher_error() { # $1=output
  printf '%s' "$1" | grep -qiE 'Invalid input|SyntaxError|Neo\.ClientError'
}

one_line() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-140; }

L38_CYPHER=""
L39_CYPHER=""
L36B_CYPHER=""
L139_CYPHER=""
L1310_CYPHER=""
DEBT_CYPHER=""
SUGGEST_CYPHER=""
SETTER_CYPHER=""

load_artifacts() {
  L38_CYPHER=$(extract_fence "$SA_VALIDATE_SKILL" 'L3.8 --')
  L39_CYPHER=$(extract_fence "$SA_VALIDATE_SKILL" 'L3.9 --')
  L36B_CYPHER=$(extract_fence "$SA_VALIDATE_SKILL" 'L3.6b --')
  L139_CYPHER=$(extract_fence "$SA_VALIDATE_SKILL" 'L13.9 --')
  L1310_CYPHER=$(extract_fence "$SA_VALIDATE_SKILL" 'L13.10 --')
  DEBT_CYPHER=$(extract_fence "$SA_VALIDATE_SKILL" 'escape-valve debt')
  SUGGEST_CYPHER=$(extract_fence "$SA_FLAGS_SKILL" 'suggest-coverage-exempt (READ-ONLY)')
  SETTER_CYPHER=$(extract_fence "$SA_FLAGS_SKILL" 'set-coverage-exempt --step')
}

# One UC with every step shape the L3 cases need, plus a cache layer with the
# three L13.9 pair shapes. Seeded once; every case is read-only.
seed_graph() {
  printf 'MATCH (n) DETACH DELETE n;\n' | cy >/dev/null
  cy >/dev/null <<'EOF'
CREATE (uc:UseCase {id: 'UC-701', name: 'Выбор сеанса'})
CREATE (s1:ActivityStep {id: 'UC-701-A01', actor: 'System', description: 'Проверяет доступность мест'})
CREATE (s2:ActivityStep {id: 'UC-701-A02', actor: 'System', description: 'Резервирует места'})
CREATE (s3:ActivityStep {id: 'UC-701-A03', actor: 'System', description: 'Отображает список сеансов',
                         coverage_exempt: true, coverage_exempt_reason: 'pure render of data loaded in A01'})
CREATE (s4:ActivityStep {id: 'UC-701-A04', actor: 'System', description: 'Перенаправляет на оплату',
                         coverage_exempt: true, coverage_exempt_reason: '  '})
CREATE (s5:ActivityStep {id: 'UC-701-A05', actor: 'User',   description: 'Выбирает сеанс'})
CREATE (s6:ActivityStep {id: 'UC-701-A06', actor: 'System', description: 'Отображает схему зала'})
CREATE (s7:ActivityStep {id: 'UC-701-A07', actor: 'System', description: 'Показывает и сохраняет черновик заказа'})
CREATE (rq:Requirement {id: 'RQ-701', rq_type: 'behavioral', description: 'Seats must be free'})
CREATE (uc)-[:HAS_STEP]->(s1), (uc)-[:HAS_STEP]->(s2), (uc)-[:HAS_STEP]->(s3),
       (uc)-[:HAS_STEP]->(s4), (uc)-[:HAS_STEP]->(s5), (uc)-[:HAS_STEP]->(s6),
       (uc)-[:HAS_STEP]->(s7)
CREATE (uc)-[:HAS_REQUIREMENT]->(rq), (rq)-[:REALIZED_BY]->(s1)
CREATE (bad:UseCase {id: 'UC-702', name: 'Migrated shell'})
CREATE (b1:ActivityStep {id: 'UC-702-A01', actor: 'User',   description: '1'})
CREATE (b2:ActivityStep {id: 'UC-702-A02', actor: 'User',   description: '7a'})
CREATE (b3:ActivityStep {id: 'UC-702-A03', actor: 'System', description: '--'})
CREATE (b4:ActivityStep {id: 'UC-702-A04', actor: 'System', description: ''})
CREATE (b5:ActivityStep {id: 'UC-702-A05', actor: 'System', description: 'Снимает резерв мест'})
CREATE (bad)-[:HAS_STEP]->(b1), (bad)-[:HAS_STEP]->(b2), (bad)-[:HAS_STEP]->(b3),
       (bad)-[:HAS_STEP]->(b4), (bad)-[:HAS_STEP]->(b5)
CREATE (m:Module {id: 'MOD-media'})
CREATE (api1:APIEndpoint {id: 'API-poster'}), (api2:APIEndpoint {id: 'API-trailer'}),
       (api3:APIEndpoint {id: 'API-schedule'})
CREATE (a:CachePolicy {id: 'CACHE-PosterApp', storage_kind: 'cache_api', invalidation_kind: 'never',
                       overlap_accepted: true, overlap_accepted_reason: 'DEC-042: distinct cache names, versioned URLs'})
CREATE (b:CachePolicy {id: 'CACHE-PosterSw',  storage_kind: 'cache_api', invalidation_kind: 'never',
                       overlap_accepted: true, overlap_accepted_reason: 'DEC-042: SW runtime layer'})
CREATE (c:CachePolicy {id: 'CACHE-TrailerApp', storage_kind: 'cache_api', invalidation_kind: 'never',
                       overlap_accepted: true, overlap_accepted_reason: ''})
CREATE (d:CachePolicy {id: 'CACHE-TrailerSw',  storage_kind: 'cache_api', invalidation_kind: 'never'})
CREATE (e:CachePolicy {id: 'CACHE-SchedA', storage_kind: 'memory', invalidation_kind: 'event'})
CREATE (f:CachePolicy {id: 'CACHE-SchedB', storage_kind: 'memory', invalidation_kind: 'ttl', ttl_seconds: 60})
CREATE (m)-[:HAS_CACHE]->(a), (m)-[:HAS_CACHE]->(b), (m)-[:HAS_CACHE]->(c),
       (m)-[:HAS_CACHE]->(d), (m)-[:HAS_CACHE]->(e), (m)-[:HAS_CACHE]->(f)
CREATE (a)-[:CACHES]->(api1), (b)-[:CACHES]->(api1),
       (c)-[:CACHES]->(api2), (d)-[:CACHES]->(api2),
       (e)-[:CACHES]->(api3), (f)-[:CACHES]->(api3);
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
        seed_graph
      else
        DOCKER_SKIP_REASON="neo4j-not-ready"
      fi
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Case: l38-coverage-exempt — the shipped L3.8 fence must execute, list the
# unrealized System step A02, and skip the exempted A03/A04 (flag alone is the
# filter; the missing reason on A04 is L3.9's job, not L3.8's).
# ---------------------------------------------------------------------------
run_l38() {
  [ -n "$L38_CYPHER" ] || { CASE_STATUS=FAIL; CASE_REASON="l3.8-fence-missing"; return; }
  out=$(run_fence "$L38_CYPHER")
  if is_cypher_error "$out"; then
    CASE_STATUS=FAIL; CASE_REASON="l3.8-cypher-error:$(one_line "$out")"; return
  fi
  a02=false; a03=false; a04=false; a01=false
  printf '%s' "$out" | grep -q 'UC-701-A01' && a01=true
  printf '%s' "$out" | grep -q 'UC-701-A02' && a02=true
  printf '%s' "$out" | grep -q 'UC-701-A03' && a03=true
  printf '%s' "$out" | grep -q 'UC-701-A04' && a04=true
  if [ "$a02" = true ] && [ "$a01" = false ] && [ "$a03" = false ] && [ "$a04" = false ]; then
    CASE_STATUS=PASS; CASE_REASON="ok gap A02 listed; realized A01 and exempted A03/A04 skipped"
  else
    CASE_STATUS=FAIL; CASE_REASON="l3.8-wrong:A01=$a01 A02=$a02 A03=$a03 A04=$a04"
  fi
}

# ---------------------------------------------------------------------------
# Case: l39-reason-required — the valve cannot be pulled silently: A04 (blank
# reason) is listed, A03 (reason given) is not.
# ---------------------------------------------------------------------------
run_l39() {
  [ -n "$L39_CYPHER" ] || { CASE_STATUS=FAIL; CASE_REASON="l3.9-fence-missing:valve-without-reason-unchecked"; return; }
  out=$(run_fence "$L39_CYPHER")
  if is_cypher_error "$out"; then
    CASE_STATUS=FAIL; CASE_REASON="l3.9-cypher-error:$(one_line "$out")"; return
  fi
  a03=false; a04=false
  printf '%s' "$out" | grep -q 'UC-701-A03' && a03=true
  printf '%s' "$out" | grep -q 'UC-701-A04' && a04=true
  if [ "$a04" = true ] && [ "$a03" = false ]; then
    CASE_STATUS=PASS; CASE_REASON="ok blank-reason A04 listed; justified A03 not"
  else
    CASE_STATUS=FAIL; CASE_REASON="l3.9-wrong:A03=$a03 A04=$a04"
  fi
}

# ---------------------------------------------------------------------------
# Case: l36b-description-probe — UC-702 carries "1", "7a", "--", "" and one
# real step: count must be 4; UC-701 (all real text) must not appear.
# ---------------------------------------------------------------------------
run_l36b() {
  [ -n "$L36B_CYPHER" ] || { CASE_STATUS=FAIL; CASE_REASON="l3.6b-fence-missing:migration-defect-invisible"; return; }
  out=$(run_fence "$L36B_CYPHER")
  if is_cypher_error "$out"; then
    CASE_STATUS=FAIL; CASE_REASON="l3.6b-cypher-error:$(one_line "$out")"; return
  fi
  if printf '%s' "$out" | grep -qE '^"UC-702", 4,' && ! printf '%s' "$out" | grep -q '"UC-701"'; then
    CASE_STATUS=PASS; CASE_REASON="ok UC-702 counts 4 bad descriptions (1, 7a, --, empty); clean UC-701 absent"
  else
    CASE_STATUS=FAIL; CASE_REASON="l3.6b-wrong:$(one_line "$out")"
  fi
}

# ---------------------------------------------------------------------------
# Case: l139-overlap-accepted — poster pair (both accept) is silent; trailer
# pair (one side accepts) and schedule pair (none) still fire.
# ---------------------------------------------------------------------------
run_l139() {
  [ -n "$L139_CYPHER" ] || { CASE_STATUS=FAIL; CASE_REASON="l13.9-fence-missing"; return; }
  out=$(run_fence "$L139_CYPHER")
  if is_cypher_error "$out"; then
    CASE_STATUS=FAIL; CASE_REASON="l13.9-cypher-error:$(one_line "$out")"; return
  fi
  poster=false; trailer=false; sched=false
  printf '%s' "$out" | grep -q 'API-poster' && poster=true
  printf '%s' "$out" | grep -q 'API-trailer' && trailer=true
  printf '%s' "$out" | grep -q 'API-schedule' && sched=true
  if [ "$poster" = false ] && [ "$trailer" = true ] && [ "$sched" = true ]; then
    CASE_STATUS=PASS; CASE_REASON="ok both-accepted pair silent; one-sided and unaccepted pairs fire"
  else
    CASE_STATUS=FAIL; CASE_REASON="l13.9-wrong:poster(both-accept)=$poster trailer(one-side)=$trailer schedule(none)=$sched"
  fi
}

# ---------------------------------------------------------------------------
# Case: l1310-reason-required — CACHE-TrailerApp accepts with a blank reason.
# ---------------------------------------------------------------------------
run_l1310() {
  [ -n "$L1310_CYPHER" ] || { CASE_STATUS=FAIL; CASE_REASON="l13.10-fence-missing:acceptance-without-reason-unchecked"; return; }
  out=$(run_fence "$L1310_CYPHER")
  if is_cypher_error "$out"; then
    CASE_STATUS=FAIL; CASE_REASON="l13.10-cypher-error:$(one_line "$out")"; return
  fi
  if printf '%s' "$out" | grep -q 'CACHE-TrailerApp' && ! printf '%s' "$out" | grep -q 'CACHE-Poster'; then
    CASE_STATUS=PASS; CASE_REASON="ok blank-reason TrailerApp listed; justified Poster pair not"
  else
    CASE_STATUS=FAIL; CASE_REASON="l13.10-wrong:$(one_line "$out")"
  fi
}

# ---------------------------------------------------------------------------
# Case: step0d-valve-debt — exempted counts stay visible: 2 coverage_exempt
# (1 without reason), 3 overlap_accepted (1 without reason), 0 anchor_exempt.
# ---------------------------------------------------------------------------
run_debt() {
  [ -n "$DEBT_CYPHER" ] || { CASE_STATUS=FAIL; CASE_REASON="step0d-debt-fence-missing:exemptions-invisible"; return; }
  out=$(run_fence "$DEBT_CYPHER")
  if is_cypher_error "$out"; then
    CASE_STATUS=FAIL; CASE_REASON="step0d-cypher-error:$(one_line "$out")"; return
  fi
  cov=false; ovl=false; anc=false
  printf '%s' "$out" | grep -q '"ActivityStep.coverage_exempt", 2, 1' && cov=true
  printf '%s' "$out" | grep -q '"CachePolicy.overlap_accepted", 3, 1' && ovl=true
  printf '%s' "$out" | grep -q '"Requirement.anchor_exempt", 0, 0' && anc=true
  if [ "$cov" = true ] && [ "$ovl" = true ] && [ "$anc" = true ]; then
    CASE_STATUS=PASS; CASE_REASON="ok coverage_exempt 2/1, overlap_accepted 3/1, anchor_exempt 0/0"
  else
    CASE_STATUS=FAIL; CASE_REASON="step0d-wrong:$(one_line "$out")"
  fi
}

# ---------------------------------------------------------------------------
# Case: flags-suggest-report-only — A06 (pure render) is a candidate, A07
# (render + "сохраняет") is marked review, A02 (no plumbing wording) and the
# already-exempted A03 are absent; and the command writes nothing.
# ---------------------------------------------------------------------------
run_suggest() {
  [ -n "$SUGGEST_CYPHER" ] || { CASE_STATUS=FAIL; CASE_REASON="suggest-fence-missing"; return; }
  before=$(printf 'MATCH (s:ActivityStep) WHERE s.coverage_exempt = true RETURN count(s);\n' | cy | tail -1)
  out=$(terminate "$SUGGEST_CYPHER" | cy --param 'ucId => null')
  after=$(printf 'MATCH (s:ActivityStep) WHERE s.coverage_exempt = true RETURN count(s);\n' | cy | tail -1)
  if is_cypher_error "$out"; then
    CASE_STATUS=FAIL; CASE_REASON="suggest-cypher-error:$(one_line "$out")"; return
  fi
  a06=$(printf '%s' "$out" | grep 'UC-701-A06' | grep -c '"candidate"')
  a07=$(printf '%s' "$out" | grep 'UC-701-A07' | grep -c 'review')
  noise=$(printf '%s' "$out" | grep -cE 'UC-701-A0(2|3)')
  if [ "$a06" = 1 ] && [ "$a07" = 1 ] && [ "$noise" = 0 ] && [ "$before" = "$after" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok A06 candidate, A07 review, A02/A03 absent, no writes ($before=$after)"
  else
    CASE_STATUS=FAIL; CASE_REASON="suggest-wrong:A06=$a06 A07=$a07 noise=$noise writes=$before->$after"
  fi
}

# ---------------------------------------------------------------------------
# Case: flags-setter-needs-reason — true with a blank reason writes nothing;
# true with a reason writes both properties.
# ---------------------------------------------------------------------------
run_setter() {
  [ -n "$SETTER_CYPHER" ] || { CASE_STATUS=FAIL; CASE_REASON="setter-fence-missing"; return; }
  terminate "$SETTER_CYPHER" | cy --param 'stepId => "UC-701-A06"' --param 'value => true' --param 'reason => " "' >/dev/null
  blank=$(printf 'MATCH (s:ActivityStep {id: "UC-701-A06"}) RETURN coalesce(s.coverage_exempt, false);\n' | cy | tail -1)
  terminate "$SETTER_CYPHER" | cy --param 'stepId => "UC-701-A06"' --param 'value => true' --param 'reason => "pure render"' >/dev/null
  set_ok=$(printf 'MATCH (s:ActivityStep {id: "UC-701-A06"}) RETURN s.coverage_exempt = true AND s.coverage_exempt_reason = "pure render";\n' | cy | tail -1)
  if [ "$blank" = "FALSE" ] || [ "$blank" = "false" ]; then blank_ok=true; else blank_ok=false; fi
  if [ "$blank_ok" = true ] && { [ "$set_ok" = "TRUE" ] || [ "$set_ok" = "true" ]; }; then
    CASE_STATUS=PASS; CASE_REASON="ok blank reason refused; reasoned write sets flag+reason"
  else
    CASE_STATUS=FAIL; CASE_REASON="setter-wrong:after-blank=$blank after-reasoned=$set_ok"
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
      l38-coverage-exempt) run_l38 ;;
      l39-reason-required) run_l39 ;;
      l36b-description-probe) run_l36b ;;
      l139-overlap-accepted) run_l139 ;;
      l1310-reason-required) run_l1310 ;;
      step0d-valve-debt) run_debt ;;
      flags-suggest-report-only) run_suggest ;;
      flags-setter-needs-reason) run_setter ;;
    esac
    status="$CASE_STATUS"; reason="$CASE_REASON"
  fi
  if should_print "$name"; then report "$name" "$status" "$reason"; fi
done

exit "$OVERALL_RC"

#!/usr/bin/env bash
# tests/desktop/graph-smoke.sh — live desktop graph smoke matrix.
#
# MANUAL / stage-3 verification only. This script drives real Docker containers
# and a real Neo4j instance; it is intentionally NOT wired into CI (CI has no
# docker daemon) and is NOT picked up by the */scripts/*.test.sh convention.
# Run it by hand on a developer machine that has Docker running.
#
# What it exercises: the REAL nacl-tl-core/scripts/setup-graph.sh and
# nacl-core/scripts/graph-doctor.mjs tools end-to-end (no mocks), against a
# disposable scratch project created under the OS tmpdir. It never touches
# the operator's own graph containers: everything it creates/starts/stops is
# named with the "naclsmoke" prefix, and cleanup only ever acts on things
# matching that prefix.
#
# Usage:
#   tests/desktop/graph-smoke.sh [--case <name>] [--skip-docker]
#
#   --case <name>    Run only one case (state from earlier cases in the fixed
#                     order below is still built up internally so the matrix
#                     stays self-contained — see "case order" note below).
#   --skip-docker    Force every docker-dependent case to report SKIP
#                     (useful on a machine without Docker installed).
#
# Output contract: one line per RAN case (i.e. per case actually reported —
# with --case that is just the requested case):
#   NACL_SMOKE_RESULT: case=<name> status=PASS|FAIL|SKIP reason=<short>
# Exit code is non-zero iff any ran case is FAIL.
#
# Case order (fixed; each case leaves the stack in the state the next one
# expects — see the comment above each run_* function for the precondition
# it relies on and the postcondition it leaves):
#   local-init -> doctor-up -> down-detect -> fix-up -> worktree-resolve ->
#   race -> hook-not-nacl -> hook-down-json -> daemon-down -> remote-sidecar
#
# Note on `set -e`: deliberately NOT used. Several steps in this matrix are
# expected to return non-zero on the "down" side of a check (docker inspect
# on a stopped/absent container, grep with no match, etc.) and the harness
# must keep running and report PASS/FAIL/SKIP itself rather than let the
# shell abort on the first such probe. Every command whose exit status
# matters is checked explicitly instead.
set -u

# ---------------------------------------------------------------------------
# Constants (unique to this smoke run — never touches the operator's stack)
# ---------------------------------------------------------------------------
PREFIX="naclsmoke"
CONTAINER="${PREFIX}-neo4j"
SMOKE_PASSWORD="neo4j_graph_dev"
PORT_SCAN_START=3910

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SETUP_GRAPH_SH="$REPO_ROOT/nacl-tl-core/scripts/setup-graph.sh"
GRAPH_DOCTOR_MJS="$REPO_ROOT/nacl-core/scripts/graph-doctor.mjs"

CASE_FILTER=""
FORCE_SKIP_DOCKER=false

while [ $# -gt 0 ]; do
  case "$1" in
    --case) CASE_FILTER="$2"; shift 2 ;;
    --skip-docker) FORCE_SKIP_DOCKER=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

KNOWN_CASES="local-init doctor-up down-detect fix-up worktree-resolve race hook-not-nacl hook-down-json daemon-down remote-sidecar"
if [ -n "$CASE_FILTER" ]; then
  case " $KNOWN_CASES " in
    *" $CASE_FILTER "*) : ;;
    *) echo "Unknown --case: $CASE_FILTER (known: $KNOWN_CASES)" >&2; exit 2 ;;
  esac
fi

# ---------------------------------------------------------------------------
# Scratch layout — all under the OS tmpdir, never inside the repo.
# ---------------------------------------------------------------------------
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/naclsmoke.XXXXXX")
MAIN_ROOT="$TMP_ROOT/proj"
WT_ROOT="$TMP_ROOT/proj-wt"
EMPTY_ROOT="$TMP_ROOT/empty"
mkdir -p "$MAIN_ROOT" "$EMPTY_ROOT"
MAIN_ROOT_CANON=$(cd "$MAIN_ROOT" && pwd -P)

OVERALL_RC=0
DOCKER_BIN=""
DOCKER_OK=false
DOCKER_SKIP_REASON=""
BOLT_PORT=""
HTTP_PORT=""

# ---------------------------------------------------------------------------
# Cleanup — runs on every exit path. Only ever touches naclsmoke-prefixed
# resources (verified by name before any stop/rm) plus this script's own
# temp dirs.
# ---------------------------------------------------------------------------
cleanup() {
  set +e
  if [ -d "$WT_ROOT/.git" ] || [ -f "$WT_ROOT/.git" ]; then
    git -C "$MAIN_ROOT" worktree remove --force "$WT_ROOT" >/dev/null 2>&1
  fi
  if [ -n "$DOCKER_BIN" ] && [ -d "$MAIN_ROOT/graph-infra" ]; then
    ( cd "$MAIN_ROOT" && "$DOCKER_BIN" compose --env-file graph-infra/.env -f graph-infra/docker-compose.yml down -v ) >/dev/null 2>&1
  fi
  if [ -n "$DOCKER_BIN" ]; then
    for c in $("$DOCKER_BIN" ps -a --format '{{.Names}}' 2>/dev/null | grep "^${PREFIX}"); do
      [ "${c#${PREFIX}}" = "$c" ] && continue # safety: name must actually start with our prefix
      "$DOCKER_BIN" rm -f "$c" >/dev/null 2>&1
    done
    for v in $("$DOCKER_BIN" volume ls --format '{{.Name}}' 2>/dev/null | grep "^${PREFIX}"); do
      [ "${v#${PREFIX}}" = "$v" ] && continue
      "$DOCKER_BIN" volume rm "$v" >/dev/null 2>&1
    done
    for n in $("$DOCKER_BIN" network ls --format '{{.Name}}' 2>/dev/null | grep "^${PREFIX}"); do
      [ "${n#${PREFIX}}" = "$n" ] && continue
      "$DOCKER_BIN" network rm "$n" >/dev/null 2>&1
    done
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
report() {
  # $1=case $2=status $3=reason
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
  # $1=start $2=port-to-exclude (already chosen)
  start="$1"; exclude="${2:-0}"; p="$start"
  while [ "$p" -lt $((start + 500)) ]; do
    if [ "$p" != "$exclude" ] && port_free "$p"; then echo "$p"; return 0; fi
    p=$((p + 1))
  done
  return 1
}

wait_tcp_port() {
  # $1=port $2=timeout_s — plain bash /dev/tcp probe, no extra deps.
  port="$1"; timeout="$2"; i=0
  while [ "$i" -lt "$timeout" ]; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
      exec 3>&- 2>/dev/null; exec 3<&- 2>/dev/null
      return 0
    fi
    i=$((i + 1)); sleep 1
  done
  return 1
}

docker_running() {
  "$DOCKER_BIN" inspect -f '{{.State.Running}}' "$1" 2>/dev/null || echo false
}

ensure_container_up() {
  if [ "$(docker_running "$CONTAINER")" != "true" ]; then
    "$DOCKER_BIN" start "$CONTAINER" >/dev/null 2>&1
  fi
  wait_tcp_port "$BOLT_PORT" 30
}

# Set by each run_* function.
CASE_STATUS=""
CASE_REASON=""

# ---------------------------------------------------------------------------
# Preconditions: docker + node + python3
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  for name in $KNOWN_CASES; do
    if should_print "$name"; then report "$name" SKIP "node-missing"; fi
  done
  exit "$OVERALL_RC"
fi

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
  BOLT_PORT=$(find_free_port "$PORT_SCAN_START" 0) || { DOCKER_OK=false; DOCKER_SKIP_REASON="no-free-port"; }
fi
if [ "$DOCKER_OK" = "true" ]; then
  HTTP_PORT=$(find_free_port $((BOLT_PORT + 1)) "$BOLT_PORT") || { DOCKER_OK=false; DOCKER_SKIP_REASON="no-free-port"; }
fi

# ---------------------------------------------------------------------------
# Case 1: local-init
# Precondition: nothing (first case). Postcondition: scratch project at
# $MAIN_ROOT with config.yaml + graph-infra/, container UP.
# ---------------------------------------------------------------------------
run_local_init() {
  (
    cd "$MAIN_ROOT" || exit 1
    git init -q
    git config user.email smoke@naclsmoke.local
    git config user.name naclsmoke
    cat > config.yaml <<EOF
project:
  name: naclsmoke-scratch
  type: other

graph:
  mode: local
  neo4j_bolt_port: $BOLT_PORT
  container_prefix: $PREFIX
EOF
    git add -A >/dev/null 2>&1
    git commit -q -m "naclsmoke scratch init" --allow-empty
  )

  out=$(sh "$SETUP_GRAPH_SH" \
    --project-root "$MAIN_ROOT" --skills-dir "$REPO_ROOT" --prefix "$PREFIX" \
    --bolt-port "$BOLT_PORT" --http-port "$HTTP_PORT" --password "$SMOKE_PASSWORD" 2>&1)
  rc=$?

  if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q 'NACL_GRAPH_RESULT: status=READY'; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    tail_line=$(printf '%s' "$out" | tail -3 | tr '\n' '|')
    CASE_STATUS=FAIL; CASE_REASON="setup-graph-rc=${rc}:${tail_line}"
  fi
}

# ---------------------------------------------------------------------------
# Case 2: doctor-up
# Precondition: container UP (from local-init). Postcondition: unchanged
# (still UP).
# ---------------------------------------------------------------------------
run_doctor_up() {
  ensure_container_up
  out=$(cd "$MAIN_ROOT" && node "$GRAPH_DOCTOR_MJS" 2>&1)
  if printf '%s' "$out" | grep -q "NACL_GRAPH_DOCTOR: status=UP mode=local port=${BOLT_PORT}"; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    CASE_STATUS=FAIL; CASE_REASON="unexpected-output:$(printf '%s' "$out" | tr '\n' ' ')"
  fi
}

# ---------------------------------------------------------------------------
# Case 3: down-detect
# Precondition: container UP. Postcondition: container STOPPED.
# ---------------------------------------------------------------------------
run_down_detect() {
  ensure_container_up
  "$DOCKER_BIN" stop "$CONTAINER" >/dev/null 2>&1
  t0=$(date +%s)
  out=$(cd "$MAIN_ROOT" && node "$GRAPH_DOCTOR_MJS" 2>&1)
  t1=$(date +%s)
  elapsed=$((t1 - t0))
  if printf '%s' "$out" | grep -q "status=DOWN" && [ "$elapsed" -lt 5 ]; then
    CASE_STATUS=PASS; CASE_REASON="ok elapsed=${elapsed}s"
  else
    CASE_STATUS=FAIL; CASE_REASON="elapsed=${elapsed}s output:$(printf '%s' "$out" | tr '\n' ' ')"
  fi
}

# ---------------------------------------------------------------------------
# Case 4: fix-up
# Precondition: container STOPPED (from down-detect). Postcondition: UP.
# ---------------------------------------------------------------------------
run_fix_up() {
  if [ "$(docker_running "$CONTAINER")" = "true" ]; then
    "$DOCKER_BIN" stop "$CONTAINER" >/dev/null 2>&1
  fi
  out=$(cd "$MAIN_ROOT" && node "$GRAPH_DOCTOR_MJS" --fix 2>&1)
  running=$(docker_running "$CONTAINER")
  if printf '%s' "$out" | grep -q "NACL_GRAPH_FIX: status=UP" && [ "$running" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    CASE_STATUS=FAIL; CASE_REASON="running=${running} output:$(printf '%s' "$out" | tr '\n' ' ')"
  fi
}

# ---------------------------------------------------------------------------
# Case 5: worktree-resolve
# Precondition: container UP (from fix-up). Postcondition: unchanged (still
# UP); a linked worktree at $WT_ROOT exists (removed in cleanup()).
# ---------------------------------------------------------------------------
run_worktree_resolve() {
  ensure_container_up
  [ -f "$MAIN_ROOT/.mcp.json" ] || echo '{"mcpServers":{}}' > "$MAIN_ROOT/.mcp.json"

  if ! git -C "$MAIN_ROOT" worktree add -q "$WT_ROOT" -b naclsmoke-wt-branch >/dev/null 2>&1; then
    CASE_STATUS=FAIL; CASE_REASON="git-worktree-add-failed"
    return
  fi

  plain_out=$(cd "$WT_ROOT" && node "$GRAPH_DOCTOR_MJS" 2>&1)
  plain_ok=false
  if printf '%s' "$plain_out" | grep -q "NACL_GRAPH_DOCTOR: status=UP mode=local port=${BOLT_PORT} root=${MAIN_ROOT_CANON}"; then
    plain_ok=true
  fi

  rm -f "$WT_ROOT/.mcp.json"
  hook_out=$(cd "$WT_ROOT" && node "$GRAPH_DOCTOR_MJS" --hook 2>&1)
  hook_ok=false
  if [ -z "$hook_out" ] && [ -f "$WT_ROOT/.mcp.json" ]; then hook_ok=true; fi

  if [ "$plain_ok" = "true" ] && [ "$hook_ok" = "true" ]; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    CASE_STATUS=FAIL; CASE_REASON="plain_ok=${plain_ok}(${plain_out}) hook_ok=${hook_ok}(stdout='${hook_out}')"
  fi
}

# ---------------------------------------------------------------------------
# Case 6: race
# Precondition: container UP (from worktree-resolve). Postcondition: UP
# (both concurrent --fix runs converge on a single running container).
# ---------------------------------------------------------------------------
run_race() {
  if [ "$(docker_running "$CONTAINER")" = "true" ]; then
    "$DOCKER_BIN" stop "$CONTAINER" >/dev/null 2>&1
  fi
  out1=$(mktemp); out2=$(mktemp)
  ( cd "$MAIN_ROOT" && node "$GRAPH_DOCTOR_MJS" --fix > "$out1" 2>&1 ) &
  pid1=$!
  ( cd "$MAIN_ROOT" && node "$GRAPH_DOCTOR_MJS" --fix > "$out2" 2>&1 ) &
  pid2=$!
  wait "$pid1"
  wait "$pid2"

  combined="$(cat "$out1" "$out2")"
  count=$("$DOCKER_BIN" ps -q -f "name=^${CONTAINER}\$" | wc -l | tr -d ' ')
  running=$(docker_running "$CONTAINER")
  rm -f "$out1" "$out2"

  if [ "$running" = "true" ] && [ "$count" -eq 1 ] && printf '%s' "$combined" | grep -q "status=UP"; then
    CASE_STATUS=PASS; CASE_REASON="ok instances=${count}"
  else
    CASE_STATUS=FAIL; CASE_REASON="running=${running} instances=${count} combined:$(printf '%s' "$combined" | tr '\n' ' ')"
  fi
}

# ---------------------------------------------------------------------------
# Case 7: hook-not-nacl — independent of docker/stack state.
# ---------------------------------------------------------------------------
run_hook_not_nacl() {
  out=$(cd "$EMPTY_ROOT" && node "$GRAPH_DOCTOR_MJS" --hook 2>&1)
  rc=$?
  if [ -z "$out" ] && [ "$rc" -eq 0 ]; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    CASE_STATUS=FAIL; CASE_REASON="rc=${rc} stdout='${out}'"
  fi
}

# ---------------------------------------------------------------------------
# Case 8: hook-down-json
# Precondition: none assumed beyond the stack existing; stops the container
# itself. Postcondition: container STOPPED (last docker-dependent case).
# ---------------------------------------------------------------------------
run_hook_down_json() {
  if [ "$(docker_running "$CONTAINER")" = "true" ]; then
    "$DOCKER_BIN" stop "$CONTAINER" >/dev/null 2>&1
  fi
  out=$(cd "$MAIN_ROOT" && node "$GRAPH_DOCTOR_MJS" --hook 2>&1)
  if printf '%s' "$out" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
ctx = data['hookSpecificOutput']['additionalContext']
port = '${BOLT_PORT}'
sys.exit(0 if port in ctx else 1)
" >/dev/null 2>&1; then
    CASE_STATUS=PASS; CASE_REASON="ok"
  else
    CASE_STATUS=FAIL; CASE_REASON="not-valid-hook-json:$(printf '%s' "$out" | tr '\n' ' ')"
  fi
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
for name in $KNOWN_CASES; do
  case "$name" in
    daemon-down)
      status=SKIP; reason="destructive-manual"
      ;;
    remote-sidecar)
      status=SKIP; reason="needs-ghostunnel-and-remote-fixture"
      ;;
    hook-not-nacl)
      run_hook_not_nacl
      status="$CASE_STATUS"; reason="$CASE_REASON"
      ;;
    *)
      if [ "$DOCKER_OK" != "true" ]; then
        status=SKIP; reason="$DOCKER_SKIP_REASON"
      else
        case "$name" in
          local-init) run_local_init ;;
          doctor-up) run_doctor_up ;;
          down-detect) run_down_detect ;;
          fix-up) run_fix_up ;;
          worktree-resolve) run_worktree_resolve ;;
          race) run_race ;;
          hook-down-json) run_hook_down_json ;;
        esac
        status="$CASE_STATUS"; reason="$CASE_REASON"
      fi
      ;;
  esac
  if should_print "$name"; then report "$name" "$status" "$reason"; fi
done

exit "$OVERALL_RC"

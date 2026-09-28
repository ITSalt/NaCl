#!/usr/bin/env bash
# tests/graph/regression-cypher-fence-parse.sh — RED/GREEN parse matrix for
# the Cypher fences that carried `-- ...` annotations.
#
# THE DEFECT. Validator and authoring fences annotated lines SQL-style:
#
#   AND coalesce(ff.field_category, 'input') = 'input'  -- REQUIRED FILTER: ...
#
# `--` is not a Cypher comment. Neo4j 5.26 rejects the query ("Invalid input
# 'FILTER'"), so an agent that follows nacl-sa-validate's own instruction to
# copy each query CHARACTER-FOR-CHARACTER gets a syntax error instead of a
# result — and every one of these fences carries a REQUIRED exemption filter,
# i.e. the lines an agent is least allowed to drop. The Cypher line comment
# is `//`.
#
# THE CONTRACT UNDER TEST. Every fence below parses: `EXPLAIN <fence>` returns
# no error. EXPLAIN plans without executing, so write fences (MERGE/SET) are
# safe and unbound $params are accepted.
#
# Each fence is sent through Neo4j's HTTP transaction endpoint as ONE string —
# the way the MCP driver sends it — not through cypher-shell, whose client-side
# splitter treats a `;` inside a `// ...` comment as a statement boundary.
#
# MANUAL / stage-3 verification only (Docker; CI has no daemon). Everything it
# creates carries the "naclvalve" prefix; it never connects to a project graph.
# Fences are EXTRACTED FROM THE SHIPPED FILES at run time (first ```cypher
# fence in the file whose body contains the marker). Read the files from a git
# ref instead to see the RED side:
#   NACL_FENCE_REF=origin/main tests/graph/regression-cypher-fence-parse.sh
#
# Usage:
#   tests/graph/regression-cypher-fence-parse.sh [--case <name>] [--skip-docker]
#
# Output contract: one line per ran case:
#   NACL_SMOKE_RESULT: case=<name> status=PASS|FAIL|SKIP reason=<short>
# Exit code is non-zero iff any ran case is FAIL.
set -u

PREFIX="naclvalve"
CONTAINER="${PREFIX}-parse-neo4j"
PASSWORD="neo4j_graph_dev"
PORT_SCAN_START=3970
NEO4J_IMAGE="neo4j:5-community"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
FENCE_REF="${NACL_FENCE_REF:-}"

CASE_FILTER=""
FORCE_SKIP_DOCKER=false
while [ $# -gt 0 ]; do
  case "$1" in
    --case) CASE_FILTER="$2"; shift 2 ;;
    --skip-docker) FORCE_SKIP_DOCKER=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# case | file | marker (unique substring of the fence) | mode (whole|per-line)
CASES='sa-validate-L3.7|nacl-sa-validate/SKILL.md|// L3.7 -- Severity|whole
sa-validate-L4.1|nacl-sa-validate/SKILL.md|// L4.1 -- Severity|whole
sa-validate-L5.1|nacl-sa-validate/SKILL.md|// L5.1 -- Severity|whole
sa-validate-L5.4|nacl-sa-validate/SKILL.md|// L5.4 -- Severity|whole
sa-validate-L6.1|nacl-sa-validate/SKILL.md|// L6.1 -- Severity|whole
sa-validate-L7.2|nacl-sa-validate/SKILL.md|// L7.2 -- Severity|whole
sa-validate-L7.4|nacl-sa-validate/SKILL.md|// L7.4 -- Severity|whole
sa-validate-L9.1|nacl-sa-validate/SKILL.md|// L9.1 -- Severity|whole
sa-validate-L10.2|nacl-sa-validate/SKILL.md|// L10.2 -- Severity|whole
sa-validate-L10.6a|nacl-sa-validate/SKILL.md|// L10.6a -- Severity|whole
sa-validate-L10.6b|nacl-sa-validate/SKILL.md|// L10.6b -- Severity|whole
sa-validate-XL8.2|nacl-sa-validate/SKILL.md|// XL8.2 -- Severity|whole
sa-uc-realized-by-write|nacl-sa-uc/SKILL.md|MERGE (rq)-[rel:REALIZED_BY]->(anchor)|whole
sa-uc-form-candidates|nacl-sa-uc/SKILL.md|validation / interface candidates|whole
sa-uc-step-candidates|nacl-sa-uc/SKILL.md|behavioral / functional candidates|whole
sa-domain-anchor-requirement|nacl-sa-domain/SKILL.md|anchor_requirement (when the implementing|whole
methodology-L4.1|docs/methodology/validation.md|// L4.1 -- Severity|whole
methodology-ru-L4.1|docs/methodology/validation.ru.md|// L4.1 -- Severity|whole
runbook-rq-type-normalize|docs/runbooks/requirement-anchoring-upgrade.md|SET rq.rq_type = CASE|whole
runbook-anchor-write|docs/runbooks/requirement-anchoring-upgrade.md|ON CREATE SET rel.provenance = '"'"'backfill'"'"'|whole
analyst-tool-probe-appendix|analyst-tool/docs/diagrams/schema-coverage-audit.md|Node label counts (both graphs)|per-line'

KNOWN_CASES=$(printf '%s\n' "$CASES" | cut -d'|' -f1 | tr '\n' ' ')
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
HTTP_PORT=""

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

should_print() { [ -z "$CASE_FILTER" ] || [ "$CASE_FILTER" = "$1" ]; }

port_free() {
  python3 - "$1" <<'PY'
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(("127.0.0.1", int(sys.argv[1])))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
}

find_free_port() {
  p="$1"
  while [ "$p" -lt $(($1 + 500)) ]; do
    if port_free "$p"; then echo "$p"; return 0; fi
    p=$((p + 1))
  done
  return 1
}

# Read a repo file from the working tree, or from $NACL_FENCE_REF when set.
read_source() { # $1=repo-relative path
  if [ -n "$FENCE_REF" ]; then
    git -C "$REPO_ROOT" show "$FENCE_REF:$1" 2>/dev/null
  else
    cat "$REPO_ROOT/$1"
  fi
}

# Extract the fence, EXPLAIN it over HTTP, print "OK <n>" or "ERR <message>".
parse_fence() { # $1=file $2=marker $3=mode
  read_source "$1" | parse_fence_stdin "$2" "$3"
}

# Same, reading the markdown from stdin.
parse_fence_stdin() { # $1=marker $2=mode
  python3 -c "$PARSE_PY" "$1" "$2" "$HTTP_PORT" "$PASSWORD"
}

PARSE_PY=$(cat <<'PY'
import base64, json, re, sys, urllib.request
marker, mode, port, password = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
text = sys.stdin.read()
body, buf, inf = None, [], False
for line in text.split("\n"):
    if not inf and re.match(r"^\s*```\s*cypher\b", line, re.I):
        inf, buf = True, []
        continue
    if inf and re.match(r"^\s*```\s*$", line):
        if marker in "\n".join(buf):
            body = "\n".join(buf)
            break
        inf = False
        continue
    if inf:
        buf.append(line)
if body is None:
    print("ERR fence-not-found")
    sys.exit(0)
if mode == "per-line":
    stmts = [l.strip() for l in body.split("\n")
             if l.strip() and not l.strip().startswith("//")]
else:
    stmts = [re.sub(r";\s*$", "", body.rstrip())]
auth = base64.b64encode(f"neo4j:{password}".encode()).decode()
for stmt in stmts:
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/db/neo4j/tx/commit",
        data=json.dumps({"statements": [{"statement": "EXPLAIN " + stmt}]}).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Basic " + auth},
    )
    res = json.load(urllib.request.urlopen(req, timeout=30))
    if res.get("errors"):
        msg = res["errors"][0].get("message", "").replace("\n", " ")
        print("ERR " + msg[:120])
        sys.exit(0)
print(f"OK {len(stmts)}")
PY
)

# ---------------------------------------------------------------------------
# Preconditions: docker + python3, then a scratch Neo4j with HTTP exposed.
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
    HTTP_PORT=$(find_free_port "$PORT_SCAN_START")
    if [ -z "$HTTP_PORT" ]; then
      DOCKER_SKIP_REASON="no-free-port"
    elif ! "$DOCKER_BIN" run -d --name "$CONTAINER" \
            -p "127.0.0.1:${HTTP_PORT}:7474" \
            -e NEO4J_AUTH="neo4j/${PASSWORD}" \
            "$NEO4J_IMAGE" >/dev/null 2>&1; then
      DOCKER_SKIP_REASON="container-start-failed"
    else
      i=0
      while [ "$i" -lt 60 ]; do
        # Ready = the same HTTP endpoint the cases use answers a query.
        if [ "$(printf '```cypher\nRETURN 1 // readiness\n```\n' | parse_fence_stdin 'readiness' whole 2>/dev/null)" = "OK 1" ]; then
          DOCKER_OK=true; break
        fi
        i=$((i + 1)); sleep 2
      done
      [ "$DOCKER_OK" = "true" ] || DOCKER_SKIP_REASON="neo4j-not-ready"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Main loop — one case per fence.
# ---------------------------------------------------------------------------
while IFS='|' read -r name file marker mode; do
  [ -n "$name" ] || continue
  if [ "$DOCKER_OK" != "true" ]; then
    status=SKIP; reason="$DOCKER_SKIP_REASON"
  else
    out=$(parse_fence "$file" "$marker" "$mode")
    case "$out" in
      OK*) status=PASS; reason="parses (${out#OK } statement(s)) $file" ;;
      *)   status=FAIL; reason="${out#ERR }" ;;
    esac
  fi
  if should_print "$name"; then report "$name" "$status" "$reason"; fi
done <<EOF
$CASES
EOF

exit "$OVERALL_RC"

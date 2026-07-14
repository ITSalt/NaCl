#!/usr/bin/env sh
# Self-test for check-graph-halt-snippet.sh: PASS on the pristine tree,
# FAIL on each drift class (block edit, wrong tail, missing compact copy,
# resurrected legacy wording).
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SCRIPT=scripts/check-graph-halt-snippet.sh
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $1"; exit 1; }

# Case 0 — pristine repo passes
(cd "$REPO_ROOT" && sh "$SCRIPT" >/dev/null) || fail "gate must pass on pristine tree"
echo "PASS: pristine tree accepted"

# Fixture: minimal copy of the repo layout the gate reads
make_fixture() {
  rm -rf "$TMP/fx"
  mkdir -p "$TMP/fx"
  cd "$TMP/fx"
  for f in nacl-core/SKILL.md \
           nacl-ba-process/SKILL.md nacl-ba-entities/SKILL.md \
           nacl-ba-roles/SKILL.md nacl-ba-rules/SKILL.md \
           nacl-ba-glossary/SKILL.md nacl-ba-sync/SKILL.md \
           nacl-sa-uc/SKILL.md nacl-sa-ui/SKILL.md \
           nacl-ba-from-board/SKILL.md nacl-render/SKILL.md \
           nacl-publish/SKILL.md; do
    mkdir -p "$(dirname "$f")"
    cp "$REPO_ROOT/$f" "$f"
  done
  mkdir -p scripts
  cp "$REPO_ROOT/$SCRIPT" "$SCRIPT"
  git init -q && git add -A
}

expect_fail() { # $1 = case name
  if (cd "$TMP/fx" && sh "$SCRIPT" >/dev/null 2>&1); then
    fail "gate must reject: $1"
  fi
  echo "PASS: rejected $1"
}

# Case 1 — drifted full block (word changed inside the canonical lines)
make_fixture
sed -i.bak 's/works in Claude Code Desktop and CLI/works only in CLI/' "$TMP/fx/nacl-ba-process/SKILL.md"
expect_fail "drifted full block"

# Case 2 — unregistered tail line
make_fixture
sed -i.bak 's/^> Cannot proceed with sync\.$/> Sync aborted./' "$TMP/fx/nacl-ba-sync/SKILL.md"
expect_fail "unregistered tail line"

# Case 3 — compact occurrence count off (one publish copy mangled)
make_fixture
awk 'BEGIN{done=0} { if (!done && $0 ~ /Neo4j is not reachable at bolt/) { sub(/Neo4j is not reachable at bolt/, "Neo4j is unreachable at bolt"); done=1 } print }' \
  "$TMP/fx/nacl-publish/SKILL.md" > "$TMP/fx/nacl-publish/SKILL.md.new"
mv "$TMP/fx/nacl-publish/SKILL.md.new" "$TMP/fx/nacl-publish/SKILL.md"
expect_fail "compact occurrence count off"

# Case 4 — legacy wording resurrected in a tracked root skill
make_fixture
printf '\n> Check config and ensure Docker is running.\n' >> "$TMP/fx/nacl-ba-roles/SKILL.md"
(cd "$TMP/fx" && git add -A)
expect_fail "legacy wording resurrected"

echo "All check-graph-halt-snippet self-tests passed."

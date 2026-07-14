#!/usr/bin/env sh
# check-graph-halt-snippet.sh — fail if any graph skill's "Neo4j is not
# reachable" HALT message drifted from the canonical snippet defined in
# nacl-core/SKILL.md § "Graph-Down HALT (canonical)".
#
# Why: the HALT message is duplicated across skills (skills are self-contained
# prompts — nacl-core may not be in context at HALT time). Duplication invites
# drift; drifted copies resurrect stale remediation (e.g. terminal-only
# guidance that Claude Code Desktop users cannot follow). Edit the canon in
# nacl-core/SKILL.md first, then re-sync every copy.
#
# Contract enforced here:
#   Full form    — marker line `<!-- nacl-graph-halt -->` immediately followed
#                  by the canonical block (byte-identical), then exactly one
#                  allowed tail line.
#   Compact form — the canonical one-line variant appears verbatim (substring)
#                  the expected number of times in each registered file.
#   Negative     — no root SKILL.md still carries the legacy wording
#                  "and ensure Docker is running".
set -eu

CORE=nacl-core/SKILL.md

# marker → canonical text registry
FULL_FILES="nacl-ba-process/SKILL.md nacl-ba-entities/SKILL.md nacl-ba-roles/SKILL.md nacl-ba-rules/SKILL.md nacl-ba-glossary/SKILL.md nacl-ba-sync/SKILL.md nacl-sa-uc/SKILL.md nacl-sa-ui/SKILL.md"
# file:expected-occurrences of the compact form
COMPACT_FILES="nacl-ba-from-board/SKILL.md:1 nacl-render/SKILL.md:1 nacl-publish/SKILL.md:3"

TAIL_DEFAULT='> This skill requires Neo4j --- cannot proceed without it.'
TAIL_SYNC='> Cannot proceed with sync.'

canon_full=$(awk '/<!-- nacl-graph-halt-canonical-start -->/{f=1;next} /<!-- nacl-graph-halt-canonical-end -->/{f=0} f' "$CORE")
canon_compact=$(awk '/<!-- nacl-graph-halt-compact-start -->/{f=1;next} /<!-- nacl-graph-halt-compact-end -->/{f=0} f' "$CORE" | grep -v '^[[:space:]]*$' || true)

if [ -z "$canon_full" ]; then
  echo "ERROR: canonical full block not found between markers in $CORE"
  exit 1
fi
if [ -z "$canon_compact" ]; then
  echo "ERROR: canonical compact line not found between markers in $CORE"
  exit 1
fi

n=$(printf '%s\n' "$canon_full" | grep -c '')
found=0

for f in $FULL_FILES; do
  markers=$(grep -c '<!-- nacl-graph-halt -->' "$f" || true)
  if [ "$markers" -ne 1 ]; then
    echo "ERROR: $f — expected exactly 1 '<!-- nacl-graph-halt -->' marker, found $markers"
    found=1
    continue
  fi
  block=$(awk -v n="$n" '/<!-- nacl-graph-halt -->/{f=1;c=0;next} f&&c<n{print;c++;next} f{exit}' "$f")
  if [ "$block" != "$canon_full" ]; then
    echo "ERROR: $f — HALT block drifted from the canon in $CORE:"
    printf '%s\n' "$canon_full" >/tmp/nacl-halt-canon.$$
    printf '%s\n' "$block"      >/tmp/nacl-halt-block.$$
    diff -u /tmp/nacl-halt-canon.$$ /tmp/nacl-halt-block.$$ | sed 's/^/  /' || true
    rm -f /tmp/nacl-halt-canon.$$ /tmp/nacl-halt-block.$$
    found=1
  fi
  tail_line=$(awk -v n="$n" '/<!-- nacl-graph-halt -->/{f=1;c=0;next} f{c++; if(c==n+1){print;exit}}' "$f")
  case "$f" in
    nacl-ba-sync/SKILL.md) allowed=$TAIL_SYNC ;;
    *)                     allowed=$TAIL_DEFAULT ;;
  esac
  if [ "$tail_line" != "$allowed" ]; then
    echo "ERROR: $f — HALT tail line is not the registered one."
    echo "  expected: $allowed"
    echo "  actual:   $tail_line"
    found=1
  fi
done

for entry in $COMPACT_FILES; do
  f=${entry%:*}
  expected=${entry##*:}
  actual=$(grep -cF "$canon_compact" "$f" || true)
  if [ "$actual" -ne "$expected" ]; then
    echo "ERROR: $f — expected $expected verbatim compact HALT occurrence(s), found $actual"
    found=1
  fi
done

legacy=$(git ls-files | grep -E '^nacl-[^/]*/SKILL.md$' | xargs grep -l 'and ensure Docker is running' 2>/dev/null || true)
if [ -n "$legacy" ]; then
  echo "ERROR: legacy graph-down wording ('and ensure Docker is running') still present in:"
  printf '%s\n' "$legacy" | sed 's/^/  /'
  found=1
fi

if [ "$found" -ne 0 ]; then
  echo ""
  echo "Fix: edit the canon in $CORE first, then copy it verbatim under each"
  echo "'<!-- nacl-graph-halt -->' marker (full form) or into the registered"
  echo "table cells / ERROR strings (compact form)."
  exit 1
fi
echo "All graph-down HALT snippets match the canon."

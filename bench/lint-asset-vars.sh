#!/usr/bin/env bash
# Check that {UPPER_SNAKE_CASE} placeholders in a skill's assets/ are
# mentioned in its SKILL.md and vice versa. Catches drift between the
# template and the skill that's supposed to fill it in.
#
# Usage: bench/lint-asset-vars.sh <skill-dir>
# Example: bench/lint-asset-vars.sh nacl-ba-import-doc

set -euo pipefail

SKILL_DIR="${1:?usage: lint-asset-vars.sh <skill-dir>}"
SKILL_MD="${SKILL_DIR}/SKILL.md"
ASSETS_DIR="${SKILL_DIR}/assets"

if [ ! -f "$SKILL_MD" ]; then
  echo "ERROR: $SKILL_MD not found" >&2
  exit 2
fi

if [ ! -d "$ASSETS_DIR" ]; then
  echo "no assets/ in $SKILL_DIR — nothing to lint"
  exit 0
fi

vars_in_assets="$(grep -oh '{[A-Z][A-Z0-9_]*}' "$ASSETS_DIR"/* 2>/dev/null | sort -u || true)"
vars_in_skill="$(grep -oh '{[A-Z][A-Z0-9_]*}' "$SKILL_MD" | sort -u || true)"

missing_in_skill="$(comm -23 <(echo "$vars_in_assets") <(echo "$vars_in_skill") | tr -d '[:space:]' || true)"
orphan_in_skill="$(comm -13 <(echo "$vars_in_assets") <(echo "$vars_in_skill") | tr -d '[:space:]' || true)"

fail=0

if [ -n "$(comm -23 <(echo "$vars_in_assets") <(echo "$vars_in_skill"))" ]; then
  echo "FAIL: placeholders used in assets/ but not documented in SKILL.md:"
  comm -23 <(echo "$vars_in_assets") <(echo "$vars_in_skill") | sed 's/^/  /'
  fail=1
fi

if [ -n "$(comm -13 <(echo "$vars_in_assets") <(echo "$vars_in_skill"))" ]; then
  echo "WARN: placeholders mentioned in SKILL.md but absent in assets/:"
  comm -13 <(echo "$vars_in_assets") <(echo "$vars_in_skill") | sed 's/^/  /'
  # This is a warning, not a failure — SKILL.md can reference derived vars.
fi

if [ "$fail" -eq 0 ]; then
  echo "OK: $(echo "$vars_in_assets" | grep -c . || true) placeholders consistent between SKILL.md and assets/"
fi

exit "$fail"

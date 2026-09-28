#!/bin/sh
# Remove the NaCl symlink install for Claude Code.
#
# Deletes ONLY symlinks that point into this repository checkout:
#   $HOME/.claude/skills/nacl-*  -> <repo>/...
#   $HOME/.claude/agents/*.md    -> <repo>/...
# Real directories, real files, and symlinks pointing anywhere else are left
# untouched. Stale links into the repo (target since deleted) are removed too.
# Pass --dry-run to list what would be removed without deleting anything.
#
# Use it when switching this machine to the plugin channel. Reverse with
# scripts/install-claude-code-skills.sh.

set -u

dry_run=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      dry_run=1
      ;;
    -h|--help)
      sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
      echo ""
      echo "Usage: uninstall-claude-code-skills.sh [--dry-run]"
      exit 0
      ;;
    *)
      printf 'unknown argument: %s\n' "$arg" >&2
      printf 'try --help\n' >&2
      exit 2
      ;;
  esac
done

# Locate repo root from the script's own location.
script_path=$0
case $script_path in
  */*) script_dir=$(CDPATH= cd "$(dirname "$script_path")" && pwd -P) ;;
  *) script_dir=$(CDPATH= cd "." && pwd -P) ;;
esac
repo_root=$(CDPATH= cd "$script_dir/.." && pwd -P)

skills_dest="$HOME/.claude/skills"
agents_dest="$HOME/.claude/agents"

resolve_link_target() {
  # POSIX-portable: absolute path of a symlink's target, with the target's
  # parent directory canonicalised (works for stale links too).
  # $1 = symlink path
  target=$(readlink "$1" 2>/dev/null) || return
  [ -z "$target" ] && return
  case $target in
    /*) ;;
    *) target="$(dirname "$1")/$target" ;;
  esac
  parent=$(CDPATH= cd "$(dirname "$target")" 2>/dev/null && pwd -P) || {
    printf '%s' "$target"
    return
  }
  printf '%s/%s' "$parent" "$(basename "$target")"
}

removed=0
kept=0

process() {
  # $1 = candidate path
  [ -L "$1" ] || { kept=$((kept + 1)); return; }
  target=$(resolve_link_target "$1")
  case $target in
    "$repo_root"/*)
      if [ "$dry_run" -eq 1 ]; then
        echo "  WOULD_REMOVE   $(basename "$1") -> $target"
      else
        rm -f "$1" && echo "  REMOVED        $(basename "$1")"
      fi
      removed=$((removed + 1))
      ;;
    *)
      echo "  KEPT           $(basename "$1") (points outside $repo_root)"
      kept=$((kept + 1))
      ;;
  esac
}

echo "==> Skills in $skills_dest"
for entry in "$skills_dest"/nacl-*; do
  [ -e "$entry" ] || [ -L "$entry" ] || continue
  process "$entry"
done

echo ""
echo "==> Agents in $agents_dest"
for entry in "$agents_dest"/*.md; do
  [ -e "$entry" ] || [ -L "$entry" ] || continue
  process "$entry"
done

echo ""
if [ "$dry_run" -eq 1 ]; then
  echo "Summary (dry run): would_remove=$removed kept=$kept"
else
  echo "Summary: removed=$removed kept=$kept"
fi
exit 0

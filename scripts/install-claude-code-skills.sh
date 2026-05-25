#!/bin/sh
# Install or update NaCl skills and agents for Claude Code.
#
# Default behaviour: `git pull --ff-only` in the repo root, then refresh
# user-level symlinks. Pass --no-pull to skip the git step.
#
# Symlinks created (idempotent — re-run any time):
#   <repo>/nacl-*/           -> $HOME/.claude/skills/<name>
#   <repo>/.claude/agents/*  -> $HOME/.claude/agents/<name>
#
# Symmetric with skills-for-codex/scripts/install-user-symlinks.sh
# (which handles the Codex distribution to $HOME/.agents/skills).

set -u

no_pull=0
for arg in "$@"; do
  case "$arg" in
    --no-pull)
      no_pull=1
      ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      echo ""
      echo "Usage: install-claude-code-skills.sh [--no-pull]"
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

skills_src="$repo_root"
agents_src="$repo_root/.claude/agents"
skills_dest="$HOME/.claude/skills"
agents_dest="$HOME/.claude/agents"

# Optional git pull.
if [ "$no_pull" -eq 0 ]; then
  if [ -d "$repo_root/.git" ]; then
    echo "==> git pull --ff-only in $repo_root"
    if ! ( cd "$repo_root" && git pull --ff-only ); then
      echo ""
      echo "ERROR: git pull failed."
      echo "       Rerun with --no-pull to skip git and refresh symlinks only."
      exit 1
    fi
    echo ""
  else
    echo "WARNING: $repo_root is not a git checkout; skipping git pull"
    echo ""
  fi
fi

mkdir -p "$skills_dest" "$agents_dest"

resolve_dir() {
  CDPATH= cd "$1" 2>/dev/null && pwd -P
}

resolve_link_target() {
  # POSIX-portable: return the absolute path of a symlink's target.
  # $1 = symlink path
  target=$(readlink "$1" 2>/dev/null) || return
  [ -z "$target" ] && return
  case $target in
    /*) printf '%s' "$target" ;;
    *)  d=$(CDPATH= cd "$(dirname "$1")" 2>/dev/null && pwd -P) || return
        printf '%s/%s' "$d" "$target" ;;
  esac
}

skills_created=0
skills_present=0
skills_blocked=0
agents_created=0
agents_present=0
agents_blocked=0

echo "==> Linking skills into $skills_dest"
for src_dir in "$skills_src"/nacl-*/; do
  [ -d "$src_dir" ] || continue
  [ -f "$src_dir/SKILL.md" ] || continue
  src=${src_dir%/}
  name=$(basename "$src")
  dest="$skills_dest/$name"

  if [ ! -e "$dest" ] && [ ! -L "$dest" ]; then
    if ln -s "$src" "$dest" 2>/dev/null; then
      echo "  CREATED        $name"
      skills_created=$((skills_created + 1))
    else
      echo "  BLOCKED        $name (ln -s failed)"
      skills_blocked=$((skills_blocked + 1))
    fi
    continue
  fi

  if [ -L "$dest" ]; then
    src_real=$(resolve_dir "$src")
    dest_target=$(resolve_link_target "$dest")
    if [ -n "$dest_target" ] && [ -d "$dest_target" ]; then
      dest_real=$(resolve_dir "$dest_target")
    else
      dest_real=""
    fi
    if [ -n "$src_real" ] && [ "$src_real" = "$dest_real" ]; then
      skills_present=$((skills_present + 1))
      continue
    fi
  fi

  echo "  BLOCKED        $name (destination exists and is not the correct symlink)"
  skills_blocked=$((skills_blocked + 1))
done

echo ""
echo "==> Linking agents into $agents_dest"
if [ -d "$agents_src" ]; then
  for src in "$agents_src"/*.md; do
    [ -f "$src" ] || continue
    name=$(basename "$src")
    dest="$agents_dest/$name"

    if [ ! -e "$dest" ] && [ ! -L "$dest" ]; then
      if ln -s "$src" "$dest" 2>/dev/null; then
        echo "  CREATED        $name"
        agents_created=$((agents_created + 1))
      else
        echo "  BLOCKED        $name (ln -s failed)"
        agents_blocked=$((agents_blocked + 1))
      fi
      continue
    fi

    if [ -L "$dest" ]; then
      dest_target=$(resolve_link_target "$dest")
      if [ -n "$dest_target" ] && [ "$dest_target" = "$src" ]; then
        agents_present=$((agents_present + 1))
        continue
      fi
    fi

    echo "  BLOCKED        $name (destination exists and is not the correct symlink)"
    agents_blocked=$((agents_blocked + 1))
  done
else
  echo "  (no .claude/agents/ directory in repo; skipping)"
fi

echo ""
echo "Summary:"
echo "  Skills: created=$skills_created already_present=$skills_present blocked=$skills_blocked"
echo "  Agents: created=$agents_created already_present=$agents_present blocked=$agents_blocked"

if [ $((skills_blocked + agents_blocked)) -ne 0 ]; then
  echo ""
  echo "One or more entries were BLOCKED. Inspect the destination(s) above."
  exit 1
fi
exit 0

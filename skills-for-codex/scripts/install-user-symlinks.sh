#!/bin/sh

set -u

script_path=$0
case $script_path in
  */*) script_dir=$(CDPATH= cd "$(dirname "$script_path")" && pwd -P) ;;
  *) script_dir=$(CDPATH= cd "." && pwd -P) ;;
esac

repo_root=$(CDPATH= cd "$script_dir/../.." && pwd -P)
source_dir="$repo_root/skills-for-codex"
dest_dir="$HOME/.agents/skills"
skills=$(find "$source_dir" -mindepth 2 -maxdepth 2 -name SKILL.md \
  | sed "s#^$source_dir/##; s#/SKILL.md\$##" \
  | sort)
blocked=0
created=0
already_present=0

if ! mkdir -p "$dest_dir"; then
  echo "BLOCKED install: cannot create destination directory $dest_dir"
  exit 1
fi

resolve_dir() {
  CDPATH= cd "$1" 2>/dev/null && pwd -P
}

for skill in $skills; do
  source_path="$source_dir/$skill"
  dest_path="$dest_dir/$skill"

  if [ ! -d "$source_path" ]; then
    echo "BLOCKED $skill: missing source directory $source_path"
    blocked=$((blocked + 1))
    continue
  fi

  if [ ! -f "$source_path/SKILL.md" ]; then
    echo "BLOCKED $skill: missing source SKILL.md $source_path/SKILL.md"
    blocked=$((blocked + 1))
    continue
  fi

  if [ ! -e "$dest_path" ] && [ ! -L "$dest_path" ]; then
    if ln -s "$source_path" "$dest_path" 2>/dev/null; then
      echo "CREATED $skill: $dest_path -> $source_path"
      created=$((created + 1))
    else
      echo "BLOCKED $skill: failed to create symlink: $dest_path -> $source_path"
      blocked=$((blocked + 1))
    fi
    continue
  fi

  if [ -L "$dest_path" ]; then
    link_target=$(readlink "$dest_path" 2>/dev/null || printf '')
    case $link_target in
      /*) target_path=$link_target ;;
      *) target_path="$dest_dir/$link_target" ;;
    esac

    source_real=$(resolve_dir "$source_path" || printf '')
    target_real=$(resolve_dir "$target_path" || printf '')

    if [ -n "$source_real" ] && [ "$source_real" = "$target_real" ]; then
      echo "ALREADY_PRESENT $skill: $dest_path -> $link_target"
      already_present=$((already_present + 1))
      continue
    fi
  fi

  echo "BLOCKED $skill: destination exists and is not the correct symlink: $dest_path"
  blocked=$((blocked + 1))
done

echo "Summary: created=$created already_present=$already_present blocked=$blocked"

if [ "$blocked" -ne 0 ]; then
  exit 1
fi

exit 0

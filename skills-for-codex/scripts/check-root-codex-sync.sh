#!/bin/sh

set -u

base_ref=${1:-origin/main}
head_ref=${2:-HEAD}

if ! git rev-parse --verify "$base_ref^{commit}" >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: base ref cannot be resolved: $base_ref"
  exit 2
fi

if ! git rev-parse --verify "$head_ref^{commit}" >/dev/null 2>&1; then
  echo "Status: BLOCKED"
  echo "Reason: head ref cannot be resolved: $head_ref"
  exit 2
fi

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/nacl-codex-sync.XXXXXX") || exit 2
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

changed_files="$tmp_dir/changed-files.txt"
root_skills="$tmp_dir/root-skills.txt"
codex_skills="$tmp_dir/codex-skills.txt"
failed=0

if ! git diff --name-only "$base_ref...$head_ref" >"$changed_files" 2>/dev/null; then
  git diff --name-only "$base_ref" "$head_ref" >"$changed_files"
fi

find . -maxdepth 1 -type d -name 'nacl-*' -exec test -f '{}/SKILL.md' ';' -print \
  | sed 's#^\./##' \
  | sort >"$root_skills"

find skills-for-codex -mindepth 2 -maxdepth 2 -name SKILL.md \
  | sed 's#^skills-for-codex/##; s#/SKILL.md$##' \
  | sort >"$codex_skills"

valid_exemption() {
  exemption=$1
  test -f "$exemption" || return 1
  grep -q '^Source root:' "$exemption" || return 1
  grep -q '^Intentional divergence:' "$exemption" || return 1
  grep -q '^Next review:' "$exemption" || return 1
  return 0
}

codex_changed_for() {
  skill=$1
  grep -qx "skills-for-codex/$skill/SKILL.md" "$changed_files"
}

exemption_changed_for() {
  skill=$1
  grep -qx "skills-for-codex/sync-exemptions/$skill.md" "$changed_files"
}

while IFS= read -r skill; do
  if grep -qx "$skill" "$codex_skills"; then
    continue
  fi

  if valid_exemption "skills-for-codex/sync-exemptions/$skill.md"; then
    echo "VERIFIED exemption: $skill"
    continue
  fi

  echo "FAILED inventory: root skill has no Codex variant or valid exemption: $skill"
  failed=1
done <"$root_skills"

while IFS= read -r skill; do
  if grep -qx "$skill" "$root_skills"; then
    continue
  fi

  if [ "$skill" = "nacl-tl-core" ]; then
    echo "VERIFIED codex-only allowlist: $skill shared Codex TL reference"
    continue
  fi

  echo "FAILED inventory: Codex-only skill is not allowlisted: $skill"
  failed=1
done <"$codex_skills"

while IFS= read -r path; do
  case $path in
    nacl-*/SKILL.md)
      skill=${path%%/*}
      if codex_changed_for "$skill"; then
        echo "VERIFIED sync response: $skill root and Codex skill changed"
        continue
      fi
      if exemption_changed_for "$skill" && valid_exemption "skills-for-codex/sync-exemptions/$skill.md"; then
        echo "VERIFIED changed exemption: $skill"
        continue
      fi
      if valid_exemption "skills-for-codex/sync-exemptions/$skill.md"; then
        echo "VERIFIED existing exemption: $skill"
        continue
      fi
      echo "FAILED changed root skill lacks Codex response: $skill"
      failed=1
      ;;
  esac
done <"$changed_files"

if [ "$failed" -ne 0 ]; then
  echo "Status: FAILED"
  exit 1
fi

echo "Status: VERIFIED"

#!/bin/sh
# Self-asserting test for uninstall-claude-code-skills.sh.
# Runs against a throwaway HOME: install -> uninstall --dry-run -> uninstall ->
# reinstall round-trip, and checks that nothing outside the repo is touched.

set -u

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
repo_root=$(CDPATH= cd "$script_dir/.." && pwd -P)
install="$script_dir/install-claude-code-skills.sh"
uninstall="$script_dir/uninstall-claude-code-skills.sh"

fake_home=$(mktemp -d "${TMPDIR:-/tmp}/nacl-uninstall-test.XXXXXX")
trap 'rm -rf "$fake_home"' EXIT HUP INT TERM

failed=0
check() {
  # $1 = description, $2 = expected, $3 = actual
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1"
  else
    echo "  FAIL  $1 (expected '$2', got '$3')"
    failed=1
  fi
}

count_links() {
  find "$1" -maxdepth 1 -type l 2>/dev/null | wc -l | tr -d ' '
}

expected_skills=$(for d in "$repo_root"/nacl-*/; do [ -f "$d/SKILL.md" ] && echo x; done | wc -l | tr -d ' ')
expected_agents=$(ls "$repo_root"/.claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')

HOME="$fake_home" sh "$install" --no-pull >/dev/null
check "install created skill links" "$expected_skills" "$(count_links "$fake_home/.claude/skills")"
check "install created agent links" "$expected_agents" "$(count_links "$fake_home/.claude/agents")"

# Foreign entries that must survive: a real skill dir, a symlink elsewhere,
# and a user agent file.
mkdir -p "$fake_home/.claude/skills/my-own-skill"
mkdir -p "$fake_home/elsewhere/nacl-foreign"
ln -s "$fake_home/elsewhere/nacl-foreign" "$fake_home/.claude/skills/nacl-foreign"
echo "user agent" >"$fake_home/.claude/agents/my-agent.md"
# A stale link into the repo whose target no longer exists must be removed.
ln -s "$repo_root/nacl-removed-long-ago" "$fake_home/.claude/skills/nacl-removed-long-ago"

before_skills=$(count_links "$fake_home/.claude/skills")
out=$(HOME="$fake_home" sh "$uninstall" --dry-run)
rc=$?
check "dry-run exit code" "0" "$rc"
check "dry-run removes nothing" "$before_skills" "$(count_links "$fake_home/.claude/skills")"
check "dry-run reports repo links" "$((expected_skills + expected_agents + 1))" \
  "$(printf '%s\n' "$out" | grep -c '^  WOULD_REMOVE')"

HOME="$fake_home" sh "$uninstall" >/dev/null
rc=$?
check "uninstall exit code" "0" "$rc"
check "only foreign skill link remains" "1" "$(count_links "$fake_home/.claude/skills")"
check "foreign skill link kept" "yes" "$([ -L "$fake_home/.claude/skills/nacl-foreign" ] && echo yes || echo no)"
check "real skill dir kept" "yes" "$([ -d "$fake_home/.claude/skills/my-own-skill" ] && echo yes || echo no)"
check "no agent links remain" "0" "$(count_links "$fake_home/.claude/agents")"
check "user agent file kept" "yes" "$([ -f "$fake_home/.claude/agents/my-agent.md" ] && echo yes || echo no)"
check "repo untouched" "yes" "$([ -f "$repo_root/nacl-init/SKILL.md" ] && echo yes || echo no)"

HOME="$fake_home" sh "$install" --no-pull >/dev/null
check "reinstall restores skill links" "$((expected_skills + 1))" "$(count_links "$fake_home/.claude/skills")"
check "reinstall restores agent links" "$expected_agents" "$(count_links "$fake_home/.claude/agents")"

HOME="$fake_home" sh "$uninstall" --bogus >/dev/null 2>&1
check "unknown argument exits 2" "2" "$?"

if [ "$failed" -ne 0 ]; then
  echo "uninstall-claude-code-skills.test.sh: FAILED"
  exit 1
fi
echo "uninstall-claude-code-skills.test.sh: OK"

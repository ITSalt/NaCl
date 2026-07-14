#!/bin/sh
# check-coexistence.sh — warn (never fail) if the repo-side symlink install
# of NaCl skills is also present alongside this plugin install.
if [ -e "$HOME/.claude/skills/nacl-init" ]; then
  echo "nacl plugin: detected $HOME/.claude/skills/nacl-init (repo-side symlink install) alongside the nacl plugin — remove the symlinks (see docs/skills-guide.md) to avoid duplicate/conflicting skills."
fi
exit 0

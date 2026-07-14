#!/bin/sh
# check-coexistence.sh — warn (never fail) if the repo-side symlink install
# of NaCl skills is also present alongside this plugin install.
# Intentional dual-channel setups (e.g. framework dogfooding: Desktop via
# the plugin, CLI via the symlinked skills) opt out with NACL_ALLOW_DUAL=1.
if [ "${NACL_ALLOW_DUAL:-}" = "1" ]; then exit 0; fi
if [ -e "$HOME/.claude/skills/nacl-init" ]; then
  echo "nacl plugin: detected $HOME/.claude/skills/nacl-init (repo-side symlink install) alongside the nacl plugin — remove the symlinks (see docs/skills-guide.md) to avoid duplicate/conflicting skills, or set NACL_ALLOW_DUAL=1 if the dual setup is intentional."
fi
exit 0

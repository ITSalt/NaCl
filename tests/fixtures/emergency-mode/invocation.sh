#!/usr/bin/env bash
# Emergency-mode invocation example (W4-blocking-release fixture).
#
# Three env vars REQUIRED:
#   - NACL_EMERGENCY=1               (literal "1"; any other value: ignored)
#   - NACL_EMERGENCY_REASON="..."    (non-empty string)
#   - NACL_EMERGENCY_OWNER="..."     (non-empty string)
#
# The skill refuses to enter emergency mode if any is missing.
#
# Emergency mode lasts for the duration of ONE explicit invocation.
# The env vars do NOT propagate across subagent / sub-skill launches
# automatically. For a chained workflow, set the vars in each
# invocation.

set -euo pipefail

# Wire the project under release-gate-strict/project-alpha-blocked
# into the run (the fixture's six-condition project).
cd "$(dirname "$0")/../release-gate-strict/project-alpha-blocked"

NACL_EMERGENCY=1 \
NACL_EMERGENCY_REASON="prod 500s on /api/release/v0.18.0 — rolling back" \
NACL_EMERGENCY_OWNER="magznikitin" \
  claude --skill nacl-tl-release

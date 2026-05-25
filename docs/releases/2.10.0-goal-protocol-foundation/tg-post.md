NaCl 2.10.0 — goal-protocol-foundation

NaCl now wraps Anthropic's `/goal` command (shipped in Claude Code 2.1.139, approx. May 2026) with the methodology you already rely on. The new `/nacl-goal` skill resolves a high-level alias into a `/goal` completion condition that the transcript-only evaluator can actually verify — through GOAL_PROOF, a wire format the primary session prints into the conversation every turn.

The design constraint in one sentence: the `/goal` evaluator (Haiku 4.5 by default) reads only the transcript and cannot call tools, run Cypher, or read files — so NaCl's check scripts surface machine-checkable state directly into the conversation via the GOAL_PROOF block.

Four aliases ship in 2.10.0:

— wave:<N> — Tier M: drive a wave to all tasks PASS
— fix:<BUG-NNN> — Tier S: fix, regression-test, open PR
— validate:module:<MOD-ID> — Tier S: all L1-L7 validators green
— reopened-drain — Tier M: drain the YouGile Reopened column

Usage:

/nacl-goal wave:5             # preview only — prints the full plan
/nacl-goal wave:5 --start     # 2.10.0: warns; autonomous execution is 2.10.1

This release ships rails, not autonomy. Every gate that requires human judgment (BA-SA handoff, SA phase confirmation, hotfix routing, post-canary retrospective) is enforced via a structured refusal code. Autonomous execution arrives in 2.10.1.

Full guide: docs/guides/goal-command.md

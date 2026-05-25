NaCl 2.10.2 — codex-sync-2.10.0

Codex skills are now synchronized with the 2.10.0 `/goal` protocol.

What ships:

— New `skills-for-codex/nacl-goal` skill for Codex-compatible previews, alias resolution, GOAL_PROOF checks, and structured refusals.
— Shared `goal-codex-contract.md` reference that keeps the runtime boundary honest: Codex can prepare and verify goal-compatible commands, but it must not claim Anthropic `/goal` ran unless the runtime exposes it and evidence exists.
— Ten Codex skills now state whether they are goal-compatible or blocked by a mandatory human gate.
— Codex installer/source count is now 59 skills.
— New root/Codex sync guard runs locally and in GitHub Actions so future root SKILL.md changes need a matching Codex update or explicit exemption.

Update:

sh skills-for-codex/scripts/install-user-symlinks.sh

Windows:

skills-for-codex/scripts/install-user-symlinks.ps1

This release does not ship 2.10.1 autonomous execution. It aligns the Codex package with the 2.10.0 protocol and adds the drift guard.

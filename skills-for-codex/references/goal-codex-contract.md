# Codex Goal Compatibility Contract

Use this reference when a Codex-adapted NaCl skill mentions `nacl-goal`,
GOAL_PROOF, or root `/goal` aliases.

## Runtime Boundary

- Codex skills may prepare goal-compatible previews, check commands, and
  handoff text.
- Codex must not claim Anthropic `/goal` ran unless the active runtime exposes
  that command and the transcript contains evidence.
- If the runtime has no `/goal` primitive, report `Status: BLOCKED` with reason
  `goal-runtime-unavailable` for requested autonomous start, or `Status: NOT_RUN`
  with reason `preview-only` when only a preview was requested.
- GOAL_PROOF is transcript evidence for the evaluator and check scripts. It is
  not proof that a goal loop executed.

## Path Resolution

- From a Codex skill, reference the Codex wrapper as `../nacl-goal/SKILL.md`.
- Reference the root alias catalog as `../../nacl-goal/aliases.md`.
- Reference the root refusal catalog as `../../nacl-goal/refusal-catalog.md`.
- Reference root check scripts as `../../nacl-goal/checks/<name>.sh`.
- When operating outside the NaCl checkout, resolve the checkout first and show
  absolute check-script paths in generated previews.

## Status Mapping

- Use `VERIFIED` only when the relevant local check ran and produced compatible
  evidence.
- Use `BLOCKED` for missing checkout, missing scripts, unavailable `/goal`,
  disabled hooks, untrusted workspace, or denied permissions.
- Use `UNVERIFIED` when preview text can be composed but no deterministic check
  ran.
- Use `NOT_RUN` when start was intentionally not attempted.

## Public Repo Constraints

`feedback_no_private_info_in_public_repo`: do not include private project names,
machine-specific paths, export identifiers, or operational anecdotes in Codex
goal skill text or release artifacts.

`feedback_baseline_failures_need_proof`: any claim that a start or check path is
safe must cite the exact command that proves it.

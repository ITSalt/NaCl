Source root: fix/skill-branch-literals (hardcoded `main` → `{main_branch}` fix)
Intentional divergence: The Codex variant is a condensed, delegating version that reads `../nacl-tl-core/references/*` and does not reproduce the production-delivery pre-check git-command block (`git log main …`) where the literal `main` → `{main_branch}` fix applies. The Codex variant contains no literal branch names in git commands, so the fix is root-only.
Next review: next NaCl release that touches nacl-tl-deliver

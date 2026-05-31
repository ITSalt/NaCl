Source root: fix/skill-branch-literals (hardcoded `main` → `{main_branch}` fix)
Intentional divergence: The Codex variant is a condensed, delegating version that reads `../nacl-tl-core/references/*` and does not reproduce the changelog-freshness cross-check git-command block (`gh pr list … --base main …`) where the literal `main` → `{main_branch}` fix applies. The Codex variant contains no literal branch names in git commands, so the fix is root-only.
Next review: next NaCl release that touches nacl-tl-release

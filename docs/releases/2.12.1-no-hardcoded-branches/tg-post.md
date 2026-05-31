NaCl 2.12.1 — no-hardcoded-branches

`config.yaml` is the single source of truth for the base branch. A skill must resolve it (`{main_branch}` / `<git_base_branch>`), never bake a literal branch name into a git command. The trap: a hardcoded `main` works on a default project and breaks *silently* the moment the base branch is `master`/`develop` — the fallback default hides it until then. We audited NaCl's own skills and found seven such literals.

What ships:

— Fixed: seven git/gh commands in nacl-tl-hotfix (fetch/checkout/pull/baseline/diff), nacl-tl-deliver (production-merge pre-check) and nacl-tl-release (changelog-freshness PR query) used a literal `main` while the rest of each skill already resolved `{main_branch}` from config. Now they all use the variable; user-facing advisory prose too, so messages read right on non-`main` projects.

— New CI guard: `scripts/check-branch-literals.sh` (in Lint Skills) fails a PR that hardcodes `main`/`master`/`develop` in a git/gh command. It scans only bash/sh fences, so prose, output blocks and prohibition rules ("never `git checkout main`") don't trip; whitelist a genuine literal with `# branch-literal-ok`. Proven RED/GREEN. A "Branch-name discipline" note in docs/configuration.md states the rule: resolve from config, never duplicate config values into a convenience table — the copy is what goes stale.

— The more interesting half — "find a skill defect → surface and wait." New rule in tl-protocol.md (#8) + a Skill / Framework Defects section in the generated CLAUDE.md: an agent may inspect any file, including the skill files themselves, and when it finds a contradiction in a global skill (a hardcoded value that now disagrees with config) it must surface the exact file/lines/values and wait — never silently fix the global skill, never silently proceed. "Don't touch" means don't autonomously write — never "don't look." Surfacing the find is the correct behavior, not overreach.

No breaking changes — the literal fix is a no-op on default-`main` projects; the guard, the note and the rule are additive. Codex mirrors carry no inline git blocks, so the fix is root-only (recorded via sync-exemptions).

Release notes: docs/releases/2.12.1-no-hardcoded-branches/release-notes.md

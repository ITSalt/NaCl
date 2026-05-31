# Release 2.12.1 — `no-hardcoded-branches`

## Theme

`config.yaml` is the single source of truth for the base branch. Skills must resolve it
(`{main_branch}` / `<git_base_branch>`) — never bake a literal branch name into a git
command, and never duplicate a config value into a convenience table. A hardcoded branch
works on a default-`main` project and breaks silently the moment the base branch is
`master`, `develop`, or anything else. This patch removes the literals from NaCl's own
skills, adds a CI guard so they can't come back, and — the more interesting half —
codifies what an agent should do when it *finds* such a defect in a skill: surface it and
wait, don't suppress the look.

## Background

The bug class showed up the way these always do: a base-branch rename updated
`config.yaml`, but a skill carried its own stale copy of that branch name and started
contradicting config. Auditing NaCl's own skills for the same shape surfaced seven
literal `main` occurrences that the fallback default had been masking all along.

The second half is a process lesson. When an agent, mid-task, looked past the project
files into the skill files and flagged the contradiction instead of silently acting,
that was exactly the right move — and the wrong response would have been to tell agents
"stop touching the skills." The fix preserves the diagnostic behavior and gates only the
autonomous write.

## What's Fixed — hardcoded `main` → `{main_branch}`

Seven git/gh commands used a literal `main` while the rest of each skill already resolved
`{main_branch}` from `config.yaml → git.main_branch > modules.[name].git_base_branch >
"main"`:

- **`nacl-tl-hotfix`** — `git fetch origin main`, `git checkout main` / `git pull origin
  main`, the worktree baseline `git rev-parse main`, and the impact `git diff --stat
  main..HEAD`. Adjacent advisory prose ("does not exist on main", "write a standalone fix
  for main") was switched to `{main_branch}` too, since it is shown to the user.
- **`nacl-tl-deliver`** — the production-merge pre-check `git log main --oneline | grep …`
  and its surrounding "merged to main" prose.
- **`nacl-tl-release`** — the changelog-freshness cross-check `gh pr list --state merged
  --base main …`.

The fallback default *being* `"main"` is exactly why this slipped through: every command
worked on a default project and would only have failed — silently, with a wrong baseline
or a wrong pre-check — on a project whose base branch is not `main`.

## What's New — branch-literal CI guard

`scripts/check-branch-literals.sh` (new, wired into the `Lint Skills` workflow) fails a
PR that hardcodes `main`/`master`/`develop` in a git/gh command. Design choices that keep
it low–false-positive:

- It scans **only `bash`/`sh`/`shell`/`zsh`/`console` code fences** (awk fence-state
  tracking). Prose, plain output/display fences, and prohibition rules ("never `git
  checkout main`") are never scanned, so the legitimate documentation mentions don't trip.
- The literal must appear as an argument to a git/gh branch-consuming command
  (`checkout`/`switch`/`fetch`/`pull`/`merge`/`rebase`/`rev-parse`/`log`/`diff`, or
  `--base`); a `{main_branch}` / `<git_base_branch>` placeholder is not a literal.
- Escape hatch: a trailing `# branch-literal-ok` whitelists a genuinely intentional line.

Proven RED/GREEN before adoption: clean on the fixed tree; flags a reintroduced literal
inside a bash fence while leaving prose and display blocks alone.

`docs/configuration.md` gains a **"Branch-name discipline"** section (beside the
config-resolution priority table) stating the authoring rule: resolve the branch from
config; never duplicate config values into a convenience table — that second copy is what
goes stale.

## What's New — "skill / framework defect → surface and wait"

The CI guard is a backstop for NaCl-repo authoring; the **primary** prevention is a
runtime behavioral rule, so the lesson survives in any project, not just this repo:

- **`nacl-tl-core/references/tl-protocol.md` — rule #8.** An agent is encouraged to
  inspect beyond project files, including the skill/framework files themselves. On finding
  a contradiction or defect in a global skill (e.g. a hardcoded value that duplicates and
  now disagrees with `config.yaml`), it must **stop, show the exact contradiction (file,
  lines, both conflicting values), and wait for instructions** — never autonomously edit a
  global skill, never silently proceed.
- **`nacl-tl-core/templates/claude-md-template.md` — `Skill / Framework Defects`
  section.** The same rule echoes into the `CLAUDE.md` that `nacl-init` generates, so every
  project inherits it.

"Don't touch" means *don't autonomously write* to a global skill — never "don't inspect."
Surfacing the find is success, not overreach.

## Codex parity

The three changed root skills have condensed, delegating Codex variants in
`skills-for-codex/` that read `../nacl-tl-core/references/*` and do not reproduce the
inline git-command blocks — so they carry no literal branch names and need no change. The
divergence is recorded with valid `skills-for-codex/sync-exemptions/{nacl-tl-hotfix,
nacl-tl-deliver,nacl-tl-release}.md` entries, satisfying the root↔Codex sync gate.

## What did NOT change

- **Output contracts.** No headline or status-vocabulary change in any skill; every edit
  is additive or a literal-for-variable substitution that is a no-op on default-`main`
  projects.
- **Versioned config / scripts.** No `config.yaml` schema change — the resolution chain
  (`git.main_branch` > `modules.[name].git_base_branch` > `"main"`) was already in place;
  this release just makes the skills actually use it everywhere.

## Files

- `nacl-tl-hotfix/SKILL.md`, `nacl-tl-deliver/SKILL.md`, `nacl-tl-release/SKILL.md`
  (literal `main` → `{main_branch}`)
- `scripts/check-branch-literals.sh` (new guard) + `.github/workflows/lint-skills.yml`
  (new `Check for hardcoded branch names` step)
- `docs/configuration.md` ("Branch-name discipline" section)
- `nacl-tl-core/references/tl-protocol.md` (rule #8) +
  `nacl-tl-core/templates/claude-md-template.md` (`Skill / Framework Defects` section)
- `skills-for-codex/sync-exemptions/{nacl-tl-hotfix,nacl-tl-deliver,nacl-tl-release}.md`
  (new exemptions)

No breaking changes — the literal fix is a no-op on default-`main` projects; the guard,
discipline note, and behavioral rule are additive.

# Runbook: releasing the NaCl framework itself

Written: 2026-07-15. Cross-checked against how v2.23.0 (tag `v2.23.0`, release
commit `f0a8923`) and v2.24.0 (tag `v2.24.0`, release commit `0ddf80c`, PRs
#17–#20) actually shipped. Re-verify every snapshot fact against the live repo
before acting on it.

**Scope.** This is the manual procedure for cutting a release of the NaCl
framework repo (ITSalt/NaCl) — CHANGELOG + release bundle + plugin rebuild +
tag + `gh release`. It is NOT `/nacl-tl-release`: that skill releases projects
*built with* NaCl; the framework itself has no YouGile board, no staging, no
version file besides the CHANGELOG. The procedure is a single "release-docs
commit" on `main`, then a tag on that commit, then a GitHub release from the
committed notes file.

**Who pushes what.** Direct push to `main` is allowed for the repo owner (this
is how the v2.24.0 release commit `0ddf80c` landed). Non-owner agents ship the
release-docs commit as a PR to `main` with CI green and stop there — tagging,
`gh release create`, and Telegram publication are owner actions. Never create
tags, releases, or version bumps unless the invoking prompt explicitly says
this release is yours to cut.

## 0. Preconditions

- All feature PRs for the release are already merged; you are on fresh `main`
  (`git fetch origin && git status`), working tree clean.
- You know the version `X.Y.Z` and the release slug. Convention: semver-ish
  version + short kebab-case slug naming the theme, e.g.
  `2.23.0-multi-user-shared-graph`, `2.24.0-desktop-plugin`. Check
  `git tag --sort=-creatordate | head -5` and the first CHANGELOG heading so
  you don't reuse or skip a number.
- Capture the baseline BEFORE any edit: run the test suite (step 5) and record
  the pass count. A missing runner is BLOCKED, not success.

## 1. Absorb `docs/releases/_drafts/` (if present)

Convention: `docs/releases/_drafts/` holds fragments written while features
land mid-cycle, and is **empty between releases**. If the directory exists:

1. Read every fragment and fold its content into the new release notes
   (step 3) — unshipped scope must not leak in; drop anything describing work
   that did not actually merge.
2. `git rm docs/releases/_drafts/<fragment>.md` — deletion happens in the SAME
   release-docs commit.

Precedent: commit `f0a8923` (2.23.0) added the release bundle and deleted
`docs/releases/_drafts/multi-user-shared-graph.md` in one commit. If the
directory is absent (as after 2.24.0), skip this step.

## 2. CHANGELOG entry

Add the new entry at the TOP of `CHANGELOG.md` (directly under the file
header), formatted exactly:

```markdown
## [X.Y.Z] — YYYY-MM-DD
```

- The dash is an **em dash** (`—`, U+2014), not a hyphen. Every entry since
  2.23.0 uses it; keep the file uniform.
- Keep a Changelog sections as applicable: `### Added`, `### Changed`,
  `### Fixed`, `### Notes`.
- Position matters: `scripts/build-plugin.mjs` derives the plugin version from
  the FIRST heading matching `^## \[(\d+\.\d+\.\d+)\]` in `CHANGELOG.md`
  (`parseChangelogVersion`). A new entry placed below an older one ships the
  wrong plugin version.

## 3. Release bundle `docs/releases/<X.Y.Z>-<slug>/`

Create the directory with exactly two files:

- **`release-notes.md`** — becomes the GitHub release body verbatim (step 7).
  Structure used by 2.23.0/2.24.0: H1 `# NaCl X.Y.Z — <slug>`, a bold
  one-paragraph summary, `## The problem`, `## How it works`, then
  release-specific sections (channel/upgrade notes, verification evidence,
  known gaps). State what was verified live vs. fixture-only — 2.24.0's notes
  were amended with live-Desktop verification results before tagging
  (`0ddf80c`).
- **`tg-post.md`** — the Telegram announcement DRAFT (Russian, per every
  bundle since 2.10.0). Writing the draft is part of the release; actually
  publishing it is the owner's manual step and is not part of this runbook.

Do not touch `.claude-plugin/marketplace.json` (repo root) — it is static and
points at `./plugin`; nothing version-specific lives there.

## 4. Rebuild the plugin (mandatory since 2.24.0)

```sh
node scripts/build-plugin.mjs
```

The build regenerates `plugin/` from the root skills per
`scripts/plugin-manifest.json`. The version you wrote in the CHANGELOG heading
flows into `plugin/.claude-plugin/plugin.json` (`version`), `plugin/README.md`
("Version X.Y.Z"), and `plugin/.build-report.json` — so a release commit that
bumps the CHANGELOG **must** include the rebuilt `plugin/` in the same
commit/PR. Verify with the drift gate (byte-compares a temp rebuild against
the committed `plugin/`):

```sh
node scripts/build-plugin.mjs --check
```

**CI trigger gotcha.** `.github/workflows/build-plugin.yml` runs the same
`--check` in CI, but its `paths:` filter does NOT include `CHANGELOG.md`. A
release PR that bumps only the CHANGELOG (forgetting the rebuild) will pass CI
green and land version drift on `main`; the failure then surfaces on the next
unrelated PR that touches any plugin path. Rebuilding `plugin/` in the same
commit both fixes the version and (via the `plugin/**` path) makes CI actually
run the gate. The local `--check` above is therefore load-bearing, not a
formality.

Precedent: PR #19 carried the 2.24.0 CHANGELOG + release bundle (`28646f3`)
and the plugin rebuild with the version bump (`5b5fa32`) together.

## 5. Local gates before pushing anything public

Run all of these on the release diff and record exit codes. Direct pushes to
`main` skip `lint-skills.yml` entirely (it has only a `pull_request` trigger),
so on the owner's direct-push path these local runs are the ONLY gate.

```sh
# 1. Canonical graph-down HALT copies in sync
sh scripts/check-graph-halt-snippet.sh

# 2. Plugin drift gate (step 4)
node scripts/build-plugin.mjs --check

# 3. Tool tests (record the pass count; compare with your pre-change baseline)
git ls-files '*/scripts/*.test.mjs' 'scripts/*.test.mjs' ':!plugin/**' | xargs node --test

# 4. Privacy canary — machine-specific paths in the release diff
BASE=$(git merge-base origin/main HEAD)   # or the previous release tag for a full sweep
git diff "$BASE"..HEAD | grep -nE '/Users/[A-Za-z0-9_-]+/' && echo "LEAK: local paths"
```

**Privacy canary, the non-mechanical part.** This is a public repo. Before any
push, grep the diff for:

- client project names — check against the owner's private client list (the
  list itself must not live in this repo). `family-cinema` is explicitly
  allowed: it is the owner's own shareable demo project, not a client;
- `/Users/<name>/` literals or other machine-specific paths (the grep above;
  same regex as the CI gate in `lint-skills.yml`);
- dump metadata and operational anecdotes: per-project node counts, dump file
  names, dates tied to client work.

Zero matches is the bar. The 2.11.0 pre-release canary caught a real
client-name fragment — treat this step as one that finds things.

If the release-docs commit touches any root `nacl-*/SKILL.md` (it normally
does not — release commits are docs + `plugin/`), the Codex sync gate also
applies: `sh skills-for-codex/scripts/check-root-codex-sync.sh <merge-base> HEAD`.

## 6. Ship the release-docs commit

One commit containing: CHANGELOG entry, `docs/releases/<ver>-<slug>/` bundle,
`_drafts/` deletions (if any), rebuilt `plugin/`. Message convention
(both precedented): `docs(release): finalize X.Y.Z <slug> release` or
`chore(release): X.Y.Z — <slug>`.

- **Owner:** direct push to `main` is allowed. Remember: no PR means no
  `lint-skills.yml` — step 5 already covered you locally.
- **Non-owner / agent:** branch + PR to `main`, wait for CI green
  (`gh pr checks <num> --watch`, ~5 min), owner merges. PR-triggered checks a
  release PR will hit: `lint-skills.yml` (always), `build-plugin.yml` (via
  `plugin/**`), `test-tools.yml` (only if `scripts/` paths changed),
  `test-python.yml` / `build-cli.yml` (only if their paths changed).

Do not tag until the release commit is on `main` and CI on it is green.

## 7. Tag + GitHub release

On the release commit (fresh `main`):

```sh
git tag -a vX.Y.Z -m "NaCl X.Y.Z — <slug>"
git push origin vX.Y.Z
gh release create vX.Y.Z \
  --title "NaCl X.Y.Z — <slug>" \
  --notes-file docs/releases/<X.Y.Z>-<slug>/release-notes.md
```

- Annotated tag, message `NaCl X.Y.Z — <slug>` (2.21.0–2.23.0 style; 2.24.0
  used a longer descriptive message — either is fine, keep the version first).
- The release body is the committed `release-notes.md` verbatim — do not
  hand-write notes into the `gh` prompt.
- Verify: `gh release view vX.Y.Z` shows the right title, tag, and body.

Both v2.23.0 and v2.24.0 tags sit exactly on their release-docs commits
(`be306fc` merge commit and `0ddf80c` respectively) — the tag points at the
commit whose tree contains the notes being published.

## 8. Plugin-update semantics after the release

`claude plugin update nacl@nacl` on user machines is a **no-op while
`plugin/.claude-plugin/plugin.json` `version` is unchanged**. Consequences:

- A tagged release bumps the version (step 4), so existing plugin installs
  pick it up via the normal `claude plugin update` path. This is the main
  reason same-version hotfixing of `plugin/` on `main` is a trap.
- If a same-version rebuild of `plugin/` does land on `main` between releases
  (e.g. a plugin-only fix without a release), it reaches existing installs
  only via `claude plugin uninstall nacl@nacl && claude plugin install
  nacl@nacl`. The next tagged release clears the condition for everyone.

## 9. Post-release checklist

- [ ] `docs/releases/_drafts/` is absent or empty.
- [ ] First CHANGELOG heading == `plugin/.claude-plugin/plugin.json` version
      == the new tag.
- [ ] `gh release view vX.Y.Z` body matches the committed notes.
- [ ] `tg-post.md` handed to the owner for manual Telegram publication (do not
      post it yourself).
- [ ] Nothing in the release references unshipped scope.

## Appendix: how the last two releases actually shipped

**v2.23.0 (2026-06-29).** Feature branch `feature/multi-user-shared-graph`
(PR #16). Final branch commit `f0a8923 docs(release): finalize 2.23.0
multi-user-shared-graph release` = CHANGELOG entry + release bundle +
`_drafts/` fragment deleted (pre-plugin era: no `plugin/` rebuild existed).
Merge commit `be306fc` tagged `v2.23.0`; `gh release create` from the notes
file. The orphaned `v2.22.0` tag was created retroactively the same day to
close the tag-sequence gap — check for such gaps before tagging.

**v2.24.0 (2026-07-14/15).** Feature PRs #17, #18. PR #19 carried the release
docs: `28646f3` (CHANGELOG `## [2.24.0] — 2026-07-14` + release bundle + smoke
matrix) and `5b5fa32` (plugin rebuild, `plugin.json` 2.23.0 → 2.24.0) in one
PR. Live-Desktop verification then found two defects → fix PR #20 merged.
Owner direct-pushed `0ddf80c docs(release): 2.24.0 notes — live-Desktop
verification results + plugin-update note` amending the release notes, tagged
`v2.24.0` on it, and created the GitHub release from the amended notes file.
Order of operations to copy: **verify live → amend notes → tag last**.

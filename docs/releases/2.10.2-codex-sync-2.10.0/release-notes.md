# Release 2.10.2 — `codex-sync-2.10.0`

## Theme

Synchronize the Codex skill package with the 2.10.0 `/goal` protocol and add a
root/Codex sync guard, without shipping the 2.10.1 autonomous-execution layer.

## What's New

- New Codex skill: `skills-for-codex/nacl-goal/SKILL.md`.
- New shared Codex reference:
  `skills-for-codex/references/goal-codex-contract.md`.
- Ten Codex skills now carry compact goal compatibility or boundary sections:
  `nacl-ba-full`, `nacl-sa-full`, `nacl-sa-validate`, `nacl-migrate`,
  `nacl-tl-conductor`, `nacl-tl-fix`, `nacl-tl-full`, `nacl-tl-hotfix`,
  `nacl-tl-reopened`, and `nacl-tl-stubs`.
- Codex install documentation now expects 59 user-level skill symlinks.
- New guard script:
  `skills-for-codex/scripts/check-root-codex-sync.sh`.
- GitHub Actions `lint-skills` now runs the guard on pull requests.
- New exemption convention:
  `skills-for-codex/sync-exemptions/<skill>.md`.
- Contributor docs explain how release authors should handle root
  `nacl-*/SKILL.md` changes.

## Runtime Boundary

Codex can prepare `/nacl-goal` previews, resolve aliases, run deterministic
local check scripts, and report compatibility status. Codex must not claim that
Anthropic `/goal` ran unless the active runtime exposes that command and
evidence exists.

This preserves the 2.10.0 split: protocol and preview semantics are documented,
while autonomous execution remains in the separate 2.10.1 release.

## Install Or Update

macOS, Linux, and WSL2:

```sh
sh skills-for-codex/scripts/install-user-symlinks.sh
```

Windows PowerShell:

```powershell
skills-for-codex/scripts/install-user-symlinks.ps1
```

See `docs/setup/install-skills.md` section "Update Codex Skills".

## Safety Constraints

- `feedback_no_private_info_in_public_repo`: release text and Codex skill text
  must avoid private project names, machine-specific paths, export identifiers, and
  operational anecdotes.
- `feedback_skill_vs_agent_frontmatter`: Codex SKILL.md frontmatter remains
  `name` and `description` only.
- `feedback_baseline_failures_need_proof`: install and discovery claims must be
  backed by the exact verification commands listed below.
- `feedback_release_artifacts`: release notes and TG-post drafts live under
  this release directory.

## Guard Behavior

The guard reports:

- `Status: VERIFIED` when every root skill has a Codex variant or valid
  exemption, every changed root skill has a Codex response or valid exemption,
  and only known Codex-only skills are allowlisted.
- `Status: FAILED` when a changed root skill lacks a Codex response.
- `Status: BLOCKED` when the base or head ref cannot be resolved.

The only Codex-only allowlist entry is `nacl-tl-core`, the shared Codex TL
reference.

## Verification

Verification evidence from this execution:

```sh
find skills-for-codex -mindepth 1 -maxdepth 2 -name SKILL.md | wc -l
# 59

sh -n skills-for-codex/scripts/install-user-symlinks.sh
# pass

sh skills-for-codex/scripts/install-user-symlinks.sh
# Summary: created=1 already_present=58 blocked=0

find -L "$HOME/.agents/skills" -maxdepth 2 -name SKILL.md | wc -l
# 59

sh -n skills-for-codex/scripts/check-root-codex-sync.sh
# pass

sh skills-for-codex/scripts/check-root-codex-sync.sh HEAD HEAD
# Status: VERIFIED

git diff --check -- skills-for-codex docs CHANGELOG.md
# pass
```

Synthetic guard evidence:

```text
root-only change: exit 1, Status: FAILED
root plus matching Codex change: exit 0, Status: VERIFIED
root change with valid exemption: exit 0, Status: VERIFIED
```

## Not Included

- No 2.10.1 autonomous execution implementation.
- No copied root guide docs.
- No root-level `nacl-*` skill edits.

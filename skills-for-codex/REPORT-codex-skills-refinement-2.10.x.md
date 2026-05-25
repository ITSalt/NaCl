# Report — Codex Skill Refinement Post-2.10.0

## Phase A Drift Audit

Inventory was re-run from this checkout before edits.

| Check | Result |
|---|---|
| Root installable `nacl-*/*/SKILL.md` directories | 58 |
| Codex installable `skills-for-codex/*/SKILL.md` before execution | 58 |
| Codex installable `skills-for-codex/*/SKILL.md` after execution | 59 |
| Root-only installable skill before execution | `nacl-goal` |
| Codex-only installable skill | `nacl-tl-core` |
| Root directories without `SKILL.md` | `nacl-migrate-core`, `nacl-tl-core` |

`nacl-tl-core` is a Codex shared reference, not a missing root skill.

Root `/goal` annotations were rechecked with:

```sh
rg -n "## Use with /goal|## NOT for /goal" nacl-*/SKILL.md
```

No newer annotated root skill was discovered beyond the plan snapshot. The
updated drift table is:

| Classification | Skills |
|---|---|
| `MISSING_IN_CODEX` before execution, resolved | `nacl-goal` |
| `STALE_CODEX` before execution, resolved | `nacl-ba-full`, `nacl-sa-full`, `nacl-sa-validate`, `nacl-migrate`, `nacl-tl-conductor`, `nacl-tl-fix`, `nacl-tl-full`, `nacl-tl-hotfix`, `nacl-tl-reopened`, `nacl-tl-stubs` |
| `INTENTIONAL_DIVERGENCE` | `nacl-tl-core` |
| `IN_SYNC` | All other root/Codex skill pairs from the plan table |

`feedback_no_private_info_in_public_repo` applied to this report and the new
release artifacts. `feedback_skill_vs_agent_frontmatter` applied to the new
`nacl-goal` Codex skill. `feedback_baseline_failures_need_proof` applied to all
install and guard claims.

## Phase B Codex `nacl-goal`

Created:

- `skills-for-codex/nacl-goal/SKILL.md`
- `skills-for-codex/references/goal-codex-contract.md`

The Codex variant preserves alias resolution, GOAL_PROOF, refusals, permission
boundaries, and preview/start split while stating the Codex runtime boundary
explicitly.

## Phase C Stale Skill Remediation

Added compact sections to exactly the ten stale Codex skills:

- `Goal Boundary`: `nacl-ba-full`, `nacl-sa-full`, `nacl-tl-hotfix`
- `Goal Compatibility`: `nacl-sa-validate`, `nacl-migrate`,
  `nacl-tl-conductor`, `nacl-tl-fix`, `nacl-tl-full`,
  `nacl-tl-reopened`, `nacl-tl-stubs`

Root-level `nacl-*` skills were not edited.

## Phase D Sync Discipline

Implemented Option 2, the CI guard:

- `skills-for-codex/scripts/check-root-codex-sync.sh`
- `.github/workflows/lint-skills.yml`
- `skills-for-codex/sync-exemptions/README.md`
- contributor documentation updates

The guard allowlists `nacl-tl-core` as the Codex-only shared TL reference and
requires matching Codex updates or explicit exemptions for root skill changes.

## Phase E Release Packaging

Created release artifacts:

- `docs/releases/2.10.2-codex-sync-2.10.0/release-notes.md`
- `docs/releases/2.10.2-codex-sync-2.10.0/tg-post.md`
- `docs/releases/2.10.2-codex-sync-2.10.0/tg-post.ru.md`

The sync guard was folded into 2.10.2 before release so the published tag has
one coherent documentation set. 2.11.0 remains deferred because broader Codex
refinement and generation-script spikes are optional follow-up work, not part
of the immediate 2.10.0 sync and guard release.

## Verification Evidence

```text
find . -maxdepth 2 -path './nacl-*' -type d -exec test -f '{}/SKILL.md' ';' -print | wc -l
=> 58

find skills-for-codex -mindepth 1 -maxdepth 2 -name SKILL.md | wc -l
=> 59

sh -n skills-for-codex/scripts/install-user-symlinks.sh
=> pass

sh skills-for-codex/scripts/install-user-symlinks.sh
=> Summary: created=1 already_present=58 blocked=0

find -L "$HOME/.agents/skills" -maxdepth 2 -name SKILL.md | wc -l
=> 59

python3 <skill-creator>/scripts/quick_validate.py skills-for-codex/nacl-goal
=> Skill is valid!

sh -n skills-for-codex/scripts/check-root-codex-sync.sh
=> pass

sh skills-for-codex/scripts/check-root-codex-sync.sh HEAD HEAD
=> Status: VERIFIED

synthetic root-only guard check
=> exit 1, Status: FAILED

synthetic root plus matching Codex guard check
=> exit 0, Status: VERIFIED

synthetic root plus valid exemption guard check
=> exit 0, Status: VERIFIED

git diff --check -- skills-for-codex docs CHANGELOG.md .github/workflows/lint-skills.yml
=> pass
```

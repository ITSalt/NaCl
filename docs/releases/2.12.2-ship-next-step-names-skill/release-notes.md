# Release 2.12.2 — `ship-next-step-names-skill`

## Theme

`nacl-tl-ship`'s final `Next step:` block must always name a concrete `/nacl-...`
command — never a prose description. Shipping is a hand-off, and the hand-off only works
if the operator is told the exact skill to run next. This patch closes a gap where one
ship path emitted prose instead of a skill name, and — the useful half — wires the merge
skill (`/nacl-tl-release`) into the suggested chain so "now I need to merge" always
resolves to a runnable command.

## Background

A bare bug-fix ship surfaced the gap. The change had already passed verification (PASS,
e.g. shipped after `/nacl-tl-fix` ran a RED→GREEN regression test), it had no UC/FR id,
and a PR was already open against a non-default base branch. Ship's report ended with:

```
Next step:
  Review and merge the PR → <base>
```

— prose, naming no skill. The operator asked, reasonably, "which skill does the merge?"

Root cause: ship's `Next step:` templates assumed the UC development flow and a UC id
(`/nacl-tl-verify UC028 …`). There was no documented variant for "upstream already PASS +
PR open + no UC id", so with no id to substitute, the model filled the line with prose.
The merge step was never named because merging is deliberately downstream of ship —
`/nacl-tl-release` is the only skill that runs `gh pr merge` — and ship's templates only
pointed at the immediate next step (`verify`), never surfacing the merge command.

## What's New — the `Next step:` invariant

`nacl-tl-ship`'s `## Output` section now opens with an explicit rule: the `Next step:`
block lists **only** concrete `/nacl-...` commands with current, real flags — never prose.
When no UC/FR id is available, the id argument is omitted rather than replaced by a
description like "review and merge the PR".

## What's New — Next-step resolution table

A small table tells ship exactly how to fill the block from data it already has
(`strategy`, `pr_number` + resolved `base_branch`, the consumed verification status, and
whether a UC/FR id was provided):

| Strategy | Verification status | `Next step:` block (named skills, in order) |
|---|---|---|
| feature-branch | PASS, UC/FR id present | `/nacl-tl-verify <id>` — verify; then `/nacl-tl-release --pr <N>` — merge PR into `<base>` |
| feature-branch | PASS, **no id** (bare fix) | `/nacl-tl-release --pr <N>` — merge PR into `<base>`; optional `/nacl-tl-verify` E2E first |
| feature-branch | UNVERIFIED / BLOCKED (override) | `/nacl-tl-deploy --staging`; `/nacl-tl-verify <id>` to restore status |
| direct | PASS | `/nacl-tl-deploy` — monitor CI/deploy (no PR to merge) |

The table states plainly that the merge skill is always `/nacl-tl-release`: it is the only
skill that runs `gh pr merge`, it reads the base branch from `git.main_branch` (so it
targets whatever `<base>` the project uses, not a hardcoded `main`), and it gates the
merge on PASS status. The two PASS report templates now show the
`/nacl-tl-verify … → /nacl-tl-release --pr <N>` chain explicitly.

## What's New — the bare bug-fix example

A new worked example in `## Output` mirrors the exact scenario that surfaced the gap — a
bare-message ship, PASS upstream, PR open against a non-default base, no YouGile — and
ends with `Next step: /nacl-tl-release --pr <N> — merge PR #<N> into <base>` plus an
optional verify. With a pattern to copy, the model no longer improvises prose.

## Codex parity

The condensed Codex variant `skills-for-codex/nacl-tl-ship/SKILL.md` mirrors the
methodology change (new Workflow step naming the concrete follow-on skill — verify, or
release to merge — and a matching "Preserved Methodology" bullet). Both files change in
the same commit, satisfying the root↔Codex sync gate
(`skills-for-codex/scripts/check-root-codex-sync.sh`).

## Repo hygiene

A pre-release canary (analyst-tool `CLAUDE.md` Rule 5) was run. An internal audit artifact
was removed from the tree and a couple of example identifiers in the `analyst-tool`
subproject were genericized — a separate commit with no skill or output-contract change.

## What did NOT change

- **Output contract.** No headline, status-vocabulary, commit, or PR change. The
  `Next step:` block is human-facing guidance, not part of ship's machine output contract,
  so no downstream consumer (`nacl-tl-deliver` / `nacl-tl-deploy` / `nacl-tl-release`)
  needed a contract audit.
- **No auto-chaining.** Next-step suggestions remain informational; ship never invokes the
  follow-on skill itself.
- **No new flags.** Only the existing `/nacl-tl-release --pr <N>` flag is referenced, so
  the branch-literal and removed-flag CI guards stay green.

## Files

- `nacl-tl-ship/SKILL.md` — `## Output`: next-step invariant, resolution table, two PASS
  templates updated, bare bug-fix example, parametrized YouGile `Next:` line.
- `skills-for-codex/nacl-tl-ship/SKILL.md` — mirrored methodology (Workflow step +
  Preserved Methodology bullet).

No breaking changes — the change is additive guidance on one skill's report, plus a
matching Codex-parity edit.

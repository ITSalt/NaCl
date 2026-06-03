# Release 2.13.1 — `plain-language-refusals`

## Theme

2.13.0 made the question-*gates* of `nacl-tl-intake` and `nacl-tl-fix` speak plainly.
This patch carries the same rule to the place an autonomous run is most likely to stop
in front of a user: the **refusal surface of `/nacl-goal`**. When the wrapper refuses to
start a goal, the user should read *why* — not decode a gate code.

## Background

A correctness check of `/nacl-goal intake` on a multi-bug request confirmed the
decision logic was right on every count: the wrapper hit its pre-`/goal` prechecks,
fired the correct `PLAN_BLOCKED_*` codes for the actual conditions (run artifacts not
yet gitignored; a dirty working tree), wrote no run artifacts, issued no `/goal`, and
offered to unblock — all exactly as specified.

The one gap was presentation. The refusal *led with* internal vocabulary —
`PLAN_BLOCKED_*` codes as section headlines, plus `Tier-C` and `step 0` / `step 3` — and
subordinated the plain-language "why" beneath them. That contradicts the skill's own
contract (`SKILL.md`: *"print user-facing reason + copy-paste fallback per
refusal-catalog.md"*; the catalog's *"avoid internal-gate vocabulary"* note) and the
autonomy-default-UX principle that a user "shouldn't need to remember internal flags or
gate names." The descriptive note alone had not been enough to change the rendering.

## What's New — a normative rendering rule

`refusal-catalog.md`'s descriptive note is promoted to an imperative **Rendering rule**
governing how *any* refusal is surfaced to the user:

- the **headline is the plain-language `Message`** (the "why this goal cannot be safely
  driven autonomously" copy), immediately followed by the **copy-paste fallback**;
- the `PLAN_BLOCKED_*` / `GOAL_BLOCKED_*` code is wire-format and may appear **only as a
  trailing tag** on the last line — never as the headline;
- internal **step numbers** (`step 0`, `step 3`) and **tier vocabulary** (`Tier-C`) never
  appear in user-facing text.

The code is unchanged where it belongs: verbatim in the PR body (`pr-body-template.md`),
which is a reviewer surface, in `index.json`, and in logs. Only the local console
framing changes.

The rule is reinforced at the two always-loaded surfacing touchpoints in
`nacl-goal/SKILL.md` (the *Structured refusal flow* contract and the loop-blocked print),
and mirrored into `skills-for-codex/nacl-goal/SKILL.md` so the Codex
`Status: BLOCKED` / `NOT_RUN` reports lead with the reason too.

## Fixed — `PLAN_BLOCKED_DIRTY_WORKTREE` wording

The precheck trigger is `git status --porcelain` non-empty, which includes **untracked**
files — and an untracked file is exactly what blocked a real run. The message, however,
described only "modified/added/deleted" files and offered a bare `git stash` fallback
(which leaves untracked files in place). The message now reads
"modified/added/deleted/**untracked**" with a `git stash -u` fallback.

## Codex parity

`skills-for-codex/nacl-goal/SKILL.md` carries the parallel rendering rule, changed in the
same commit per the root↔Codex sync gate (`skills-for-codex/scripts/check-root-codex-sync.sh`,
`Status: VERIFIED`). The catalog itself is referenced by the Codex variant via link, so the
wording fix flows through without duplication.

## What did NOT change

- **The decision logic.** Every gate, code, step attribution, path check, the
  untracked-counts-as-dirty semantics, the production-branch pass, and the
  no-artifacts/no-`/goal` guarantee were already correct. This release changes only how a
  refusal is *worded* to the user.
- **The wire format.** `PLAN_BLOCKED_*` / `GOAL_BLOCKED_*` code IDs and the PR-body
  verbatim-code contract are untouched; the code is demoted in the console, not renamed or
  removed.

## Files

- `nacl-goal/refusal-catalog.md` — the imperative *Rendering rule*; `DIRTY_WORKTREE`
  message + fallback wording.
- `nacl-goal/SKILL.md` — rule reinforced at the *Structured refusal flow* contract and the
  loop-blocked surfacing print.
- `skills-for-codex/nacl-goal/SKILL.md` — mirrored rule for the Codex blocked-reporting
  contract.

No breaking changes — documentation-and-rendering only; no schema, code-ID, or contract
changes.

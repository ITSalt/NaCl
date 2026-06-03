NaCl 2.13.1 — plain-language-refusals

2.13.0 made the question-gates of `nacl-tl-intake` and `nacl-tl-fix` speak plainly. This patch carries the same rule to the place an autonomous run is most likely to stop in front of a user: the refusal surface of `/nacl-goal`. When the wrapper refuses to start a goal, you should read why — not decode a gate code.

The trigger: a correctness check of `/nacl-goal intake` confirmed the decision logic was right on every count — the right `PLAN_BLOCKED_*` codes fired, no artifacts were written, no `/goal` was issued. But the refusal led with internal vocabulary — `PLAN_BLOCKED_*` codes as headlines, `Tier-C`, `step 0` / `step 3` — and buried the plain-language "why" underneath. That contradicts the skill's own contract ("print user-facing reason + fallback"; "avoid internal-gate vocabulary") and the autonomy-default rule that you shouldn't need to know gate names.

What ships:

— A normative Rendering rule: the headline is the plain-language reason + copy-paste fallback; the `PLAN_BLOCKED_*` / `GOAL_BLOCKED_*` code may appear only as a trailing tag, never the headline; `step 0/3` and `Tier-C` never reach user-facing text. The code stays verbatim where machines and reviewers read it — the PR body, `index.json`, logs.

— The rule is reinforced at both always-loaded surfacing points in `nacl-goal/SKILL.md` and mirrored into the Codex variant's `Status: BLOCKED` reporting.

— Wording fix: `PLAN_BLOCKED_DIRTY_WORKTREE` is triggered by `git status --porcelain` (which includes untracked files, as fired in a real run) but said only "modified/added/deleted". Now reads ".../untracked" with a `git stash -u` fallback.

No breaking changes — documentation-and-rendering only. The decision logic was already correct; this changes only how a refusal is worded to you.

Release notes: docs/releases/2.13.1-plain-language-refusals/release-notes.md

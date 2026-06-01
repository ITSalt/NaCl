NaCl 2.12.2 — ship-next-step-names-skill

`nacl-tl-ship`'s final `Next step:` block must always name a concrete `/nacl-...` command — never prose. Shipping is a hand-off, and the hand-off only works if the operator is told the exact skill to run next. This patch closes a path where ship emitted a prose "review and merge the PR" instead of a skill name, and wires the merge skill into the suggested chain so "now I need to merge" resolves to a runnable command.

What ships:

— The gap: a bare bug-fix ship (already PASS, no UC id, PR open against a non-default base) ended with `Next step: Review and merge the PR` — naming no skill. Root cause: ship's templates assumed the UC dev flow and a UC id, with no variant for "PASS + PR open + no id", so the model filled the line with prose. Merge was never named because it's downstream of ship — `/nacl-tl-release` is the only skill that runs `gh pr merge`.

— New invariant: ship's `Next step:` block now lists only concrete `/nacl-...` commands (real flags), never prose; with no UC/FR id, the id argument is omitted, not replaced by a description.

— New resolution table: ship fills the block from data it already has (strategy, PR number + resolved base branch, verification status, id-presence). It names `/nacl-tl-release --pr <N>` as the merge route for the bare-fix case and states plainly that release is the only merge skill — it reads the base from `git.main_branch` (no hardcoded `main`) and gates on PASS. A worked bare-bug-fix example mirrors the exact scenario so the model has a pattern to copy.

— Codex parity: the condensed `skills-for-codex/nacl-tl-ship` variant mirrors the methodology (a Workflow step that names the concrete follow-on skill), satisfying the root↔Codex sync gate.

No breaking changes — the `Next step:` block is human-facing guidance, not part of ship's machine output contract, so no downstream consumer needed a contract audit; only the existing `--pr` flag is referenced, so the CI guards stay green. Next-step suggestions stay informational (no auto-chaining).

Release notes: docs/releases/2.12.2-ship-next-step-names-skill/release-notes.md

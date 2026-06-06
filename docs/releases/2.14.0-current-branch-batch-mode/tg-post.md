NaCl 2.14.0 — current-branch-batch-mode

`/nacl-goal intake` was built for a pristine working tree: refuse on any uncommitted change, create a fresh goal branch, push after every atom. Real trees don't look like that — you keep one open feature branch, batch several fixes into it, and your CI costs ~5 minutes per push. Worse: two or three agents may be working in the same checkout, each holding uncommitted files. The old preconditions read all of that as "dirty, refuse".

What ships:

— **Current-branch batch mode is the new default.** From a non-production branch the run executes ON your branch: atoms commit locally, ONE push and ONE CI run happen at deliver. Pre-existing commits are annotated in the PR body; goal commits carry a `Goal-run-id:` trailer so `git log --grep` (and `git bisect`) separate them cleanly. `--branch=new` restores the old flow byte-for-byte; `main`/`release/*` still refuse.

— **Smart WIP.** Uncommitted files are presumed to be another agent's in-flight work — never staged, never reverted, no longer a refusal. Overlap protection is two-layered: a predicted-zone check before the run (one consolidated question only on real intersection) and a hard commit-time gate — ship stages selectively (never `git add -A` in a shared worktree) and refuses snapshot paths; collisions emit the only *resumable* GOAL_BLOCKED code. Regression baseline/postfix run in throwaway worktrees pinned to fixed SHAs, so a neighbor's evolving WIP can't contaminate the diff.

— **An autonomous orchestrator stops asking "I found a bug — confirm it's a bug?"** Under the wrapper-only `--autonomous` flag, launch-sanity checks auto-confirm (invoking the orchestrator IS the intent), medium-confidence atoms route on the leading guess with the alternative tracked and disclosed, low-confidence atoms batch into ONE pre-start question. Billing, auth, schema migrations, destructive ops, product decisions — still refuse before `/goal`, always. Autonomy widens routing; it never swallows the critical questions.

Backward compatible throughout: old run artifacts stay valid, absent env vars mean the pre-2.14 behavior, GOAL_PROOF keys only gain advisory appendices.

Release notes: docs/releases/2.14.0-current-branch-batch-mode/release-notes.md

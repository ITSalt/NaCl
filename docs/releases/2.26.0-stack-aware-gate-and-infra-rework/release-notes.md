# NaCl 2.26.0 — stack-aware-gate-and-infra-rework

**Two conductor dead-ends removed: the repo-wide review gate now works on any package
manager, and a review-rejected infrastructure task has a sanctioned path back to PASS.**

## The problems

Both defects were found the right way — a live conductor run on a 2.25.0 project halted and
surfaced exact contradictions (file, lines, both conflicting values) per the
framework-defect protocol, instead of improvising around them.

**1. The review gate was pnpm-only.** `nacl-tl-review`'s Repo-wide Check Gate required
literal `pnpm -r lint / typecheck / test` on the wave-tip commit, said "Do not substitute
`npm` for `pnpm`" in so many words, counted a missing script as `unrunnable` (correct), and
offered no inline operator override (also correct). But the framework itself stopped
prescribing a technology stack in the stack-de-prescription release: `config.yaml` command
fields are the source of truth, and `nacl-tl-fix` discovers the runner from `scripts.test`.
On an npm-workspaces project — a stack the framework explicitly supports — every review of
every task resolved to `repo-checks-UNRUNNABLE` and VERIFIED was refused, permanently. The
gate was dead on arrival for any non-pnpm project.

**2. A rejected infrastructure task could not be re-worked.** The Wave-0 retry cycle sends a
rejected TECH task through `tl-dev --continue`, which fully delegates to `nacl-tl-fix` — and
`tl-fix` resolved `NO_INFRA` for any layer without `scripts.test` ("For TECH-tasks whose
review issues are infrastructure-only… the fix sub-agent will resolve to `NO_INFRA`", said
`tl-dev` itself). The conductor sends `NO_INFRA` to `failed`. So 2.25.0's verify-GREEN fix
covered the first pass, but a Workflow-B task rejected in review (a real case: an inert
`.dockerignore` outside the build context, a hardcoded healthcheck port) had no sanctioned
way back to PASS.

## How it works

**Stack-aware gate.** The command triple now resolves per stage through a priority chain in
the spirit of the framework's config-first discipline:

1. `config.yaml` → `repo_checks.lint` / `repo_checks.typecheck` / `repo_checks.test` — the
   project's declared repo-wide commands, used verbatim (covers turbo/nx/make wrappers);
2. otherwise package-manager autodetect from the repository root — the `packageManager`
   field, else the lockfile: pnpm → `pnpm -r <stage>`, npm → `npm run <stage> --workspaces`,
   yarn → `yarn workspaces run <stage>`. Never `--if-present` or anything that turns a
   missing script into silent success;
3. neither resolves → `unrunnable`, exactly as before.

Strictness is untouched: the chain selects *which* commands run, never *whether* they run.
A missing script still fails the stage; red checks still refuse VERIFIED; there is still no
inline operator override; `project_kind: prototype` still gets no relaxation. The
`repo-checks-GREEN:<sha>` evidence now means "the project's resolved triple all exited 0 on
this commit" — package-manager-neutral. The new `repo_checks:` config block is documented in
the config schema and seeded by `nacl-init` from the detected package manager.

**Path C in `nacl-tl-fix`.** The fix pipeline gains a third path next to Path A (new
RED-first regression test) and Path B (existing coverage): **Path C — infrastructure
verification**, taken when the affected layer has no `scripts.test` but the TECH task
carries a documented verification command (task.md Verification section, or the committed
`.tl/tasks/<ID>/verification.md` record). The flow mirrors Workflow B: run the verification
command as the pre-fix baseline → record the defect being fixed → apply the fix → re-run
cleanly → append a "Fix re-verification" section (date, review issues, baseline → post-fix
output, resources re-confirmed) to the committed record → `PASS` with
`Regression test: verification: <path>`. Orchestrators already map that line to
`verify-GREEN:<path>` evidence since 2.25.0, so the conductor and `tl-full` needed no
changes. No regression test is written on Path C — RED-first is not achievable for
configuration defects by nature; that is the same sanctioned semantics Workflow B has had
since 2.25.0. `NO_INFRA` now means what it says: no test seam AND no verification command.

## What did NOT change

Path A/B TDD discipline, the six-status vocabulary, the review gate's refusal semantics, W4
signed exceptions, emergency mode, conductor/`tl-full` orchestration, and the spec-first fix
protocol (L-classification, docs before code, Decision provenance) — Path C runs inside it.

## Compatibility

Additive. Projects with pnpm keep working with zero config (autodetect step 2 resolves the
same commands the gate used to hardcode). Projects on npm/yarn start passing the gate the
moment they upgrade. Declaring `repo_checks:` is optional and only needed for non-standard
repo-wide commands.

## Upgrade

- **CLI (symlinks):** `git pull` in the NaCl checkout (or re-run
  `sh scripts/install-claude-code-skills.sh`).
- **Claude Code Desktop (plugin):** Settings → Customize → Plugins → the `nacl` marketplace →
  Sync, then Update on the `nacl` plugin; or from a terminal:
  `claude plugin marketplace update nacl && claude plugin update nacl@nacl`, then restart
  Desktop. Verify the plugin shows version 2.26.0.

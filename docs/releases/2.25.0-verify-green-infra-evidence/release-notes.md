# NaCl 2.25.0 — verify-green-infra-evidence

**Infrastructure tasks can reach `done` again: a Workflow-B (verification-based) infra PASS now
carries first-class `verify-GREEN` evidence instead of falling into a contract hole that HALTed
every conductor run at Wave 0.**

## The problem

`nacl-tl-dev` Workflow B is the sanctioned path for infrastructure TECH tasks (Docker Compose,
CI/CD pipelines, environment configuration): run the documented verification command before and
after the change, confirm every expected resource, and mark the task `PASS` — with no unit test,
by design. But the `Regression test:` line, mandatory on every PASS report, enumerated only three
values: a test path, `"none — UNVERIFIED"`, or `"n/a — NO_INFRA"`. None fits a verified-but-untested
infra PASS: there is no test path, the task *was* verified, and infra *does* exist. Downstream,
`nacl-tl-conductor` and `nacl-tl-full` treat any path-less PASS as a contract violation and HALT —
and the escape they used to have (`'no-test'` evidence) was deliberately removed in
W4-blocking-release. Net effect: a task type the framework explicitly supports could never be
carried to `done`, and since infra tasks gate Wave 0, an entire batch could never start.

The defect was found the right way: a live conductor run refused to improvise an evidence string,
halted, and surfaced the exact contradiction (file, lines, both conflicting values) per the
framework-defect protocol. The halt also flagged an internal inconsistency — a code comment in the
conductor still advertised `'no-test'` as writable while the prose four paragraphs later declared
it no longer producible.

## How it works

**A durable verification record.** Workflow B gains step **B.3.5**: on a clean re-run of the
verification command, the dev agent writes `.tl/tasks/TECH-###/verification.md` — the exact
command, the baseline output captured before the change, the post-change output, and the list of
resources confirmed — and commits it alongside the configuration. Console output alone is not
evidence; without the committed record the task is not a PASS.

**A first-class report value.** The Workflow-B PASS report now carries
`Regression test: verification: <repo-relative path>` pointing at that record. The line label is
unchanged, so orchestrator parsing stays single-pass; the value is enumerated, so improvised forms
(`n/a — Workflow B` and friends) remain contract violations that HALT.

**A new evidence level, end to end.** `nacl-tl-conductor` (Phase 3) and `nacl-tl-full` (TECH
aggregation) derive `verify-GREEN:<path>` from the new value and write `t.status = 'done'`.
`nacl-core` § Task.verification_evidence documents the value; `nacl-tl-release` parses the prefix
and shows it in the Evidence-level column — it is *not* a verification gap. The release report now
honestly distinguishes test-backed PASSes (`test-GREEN`) from verification-backed infra PASSes
(`verify-GREEN`) instead of laundering one through the other.

**Taxonomy cleanup.** The stale `no-test` row in `nacl-core` is marked legacy: readers keep
parsing it for graphs written before W4, but no skill produces it — matching what the conductor
and release skills have said since W4. The conductor's contradictory code comment is fixed.

## What did NOT change

Workflow A (TDD) is untouched. `NO_INFRA`, `RUNNER_BROKEN`, `UNVERIFIED`, and `BLOCKED` semantics
are unchanged. UC (BE/FE) aggregation remains strictly test-based — `verify-GREEN` is derivable
only from a Workflow-B infrastructure report. The W4 hard gate stands: a bare PASS without
parseable evidence still HALTs; 2.25.0 adds the missing honest value, not an escape hatch.

## Compatibility

Additive. Existing graphs need no migration: `test-GREEN`/`test-UNVERIFIED` values are untouched,
and legacy `no-test` values continue to parse. Pre-2.25.0 release skills would classify a
`verify-GREEN:` value as `unknown`, so upgrade the framework (or Desktop plugin) before running a
release over tasks completed with 2.25.0 orchestrators.

## Upgrade

- **CLI (symlinks):** `git pull` in the NaCl checkout (or re-run
  `sh scripts/install-claude-code-skills.sh`).
- **Claude Code Desktop (plugin):** Settings → Customize → Plugins → the `nacl` marketplace →
  Sync, then Update on the `nacl` plugin; or from a terminal:
  `claude plugin marketplace update nacl && claude plugin update nacl@nacl`, then restart
  Desktop. Verify the plugin shows version 2.25.0.

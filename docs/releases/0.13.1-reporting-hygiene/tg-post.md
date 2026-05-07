NaCl 0.13.1 — Reporting Hygiene & Low-Risk Visibility

0.13.0 threaded the six-status vocabulary (PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION) through the dev, verification, fix-derivative, operational, and reliability layers. After tagging, an audit of the remaining `nacl-tl-*` skills found a residue: a few reporting skills still had happy-path headlines, a couple of skills still fell back to invented `npm test` / `npx tsc` commands when the workspace had not declared them, and the status renderer collapsed `verified-pending` and `NO_INFRA` into generic indicators.

0.13.1 closes that residue across eight skills. No new contracts, no new flags, no behavior changes beyond stopping a few skills from reporting partial work as if it were complete.

Highlights:
— `nacl-tl-docs` reorders Steps 9 / 10 / 11 so verification runs before "Mark Task as Done". The link checker now scans every modified markdown file (not just `docs/`) and resolves links source-file-relative. Code-syntax check uses the workspace's declared TypeScript command, never an invented `npx tsc`. Broken links and syntax errors emit `DOCS INCOMPLETE` — they are no longer eligible for `DONE (with acknowledged gaps)`, which is now reserved for coverage gaps only.
— `nacl-tl-qa` headline is now status-aware (`QA COMPLETE` / `QA APPLIED — UNVERIFIED` / `QA HALTED — NO_INFRA` / `QA INCOMPLETE — REGRESSION`); the legacy `E2E QA Testing Complete` happy-path header is gone.
— `nacl-tl-plan` introduces a planning status contract: `PLAN COMPLETE`, `PLAN APPLIED — PARTIAL (incomplete SA inputs)`, `PLAN HALTED — NO_SA_DATA`. The "create task files with available information" path is now explicit PARTIAL with missing SA inputs listed.
— `nacl-tl-diagnose` reads declared workspace commands only; missing `scripts.build` / `scripts.test` / typecheck command emits `NO_INFRA` for that component, not a synthetic measurement.
— `nacl-tl-reconcile` `--force` is scoped to per-task confirmation prompts; the unverified-upstream acknowledgment gate remains separate and unconditional. Phase 4.4 build/test uses declared scripts only.
— `nacl-tl-status` health indicators surface `verified-pending`, `NO_INFRA`, `RUNNER_BROKEN`, `REGRESSION` on dedicated rows; a mandatory "Per-Status Counts" table renders every six-status row, including zeros.
— `nacl-tl-next` recommends `/nacl-tl-deliver` only when every relevant Task is `done` AND PASS-family. `verified-pending` and non-PASS statuses produce a prominent `[!! UNVERIFIED DELIVERY — NOT RECOMMENDED]` warning block instead of a normal recommendation.
— `nacl-tl-stubs` `phases.stubs` aligns one-to-one with the headline vocabulary: `done` only when `STUBS COMPLETE`; empty/no-test-file states map to `unverified` / `regression` / `blocked` consistently.

Migration impact is minimal — no flag surfaces, exit codes, or parser contracts changed. Workflows that read `phases.stubs` may now see `unverified` / `regression` in addition to `done` / `blocked`. Workspaces relying on `nacl-tl-diagnose` running undeclared `npm test` will see `NO_INFRA` until the script is declared.

Full release notes: docs/releases/0.13.1-reporting-hygiene/release-notes.md

https://github.com/ITSalt/NaCl

# NaCl 0.13.1 — Reporting Hygiene & Low-Risk Visibility

This patch release closes the eight low- and medium-severity findings from
the post-0.13.0 audit. It introduces no new contracts and no new flags. It
only stops a handful of skills from reporting partial, skipped, or inferred
work as if it were normal completion, and removes a few invented
`npm`/`tsc` fallbacks that bypassed the workspace's declared scripts.

---

## Why This Patch

0.13.0 threaded the six-status vocabulary through the dev, verification,
fix-derivative, operational, and reliability layers. After tagging, an audit
of the remaining `nacl-tl-*` skills found a residue: a handful of reporting
skills still had happy-path headlines, a couple of skills still fell back to
`npm test` / `npx tsc` when the workspace had not declared them, and the
status renderer still collapsed `verified-pending` and `NO_INFRA` into
generic indicators. None of these is critical — none can ship unverified
work — but each one let a partial outcome read as a complete one. 0.13.1
fixes that.

---

## Per-Skill Changes

### `nacl-tl-docs`

**Before:** "Mark Task as Done" ran before verification. The link checker
walked only `docs/` and resolved internal links from the repo root, missing
broken links in modified READMEs and resolving paths in non-`docs/` files
incorrectly. Code-example syntax check used a hardcoded `npx tsc`. The
`DONE (with acknowledged gaps)` headline could absorb broken links and code
syntax errors, masking real problems.

**After:** The numbered steps are reordered. Step 9 (Verify Documentation)
now runs before Step 10 (Commit) and Step 11 (Mark Task as Done). Done is
conditional on every Step 9 sub-step returning PASS, or on Step 9.3
(coverage) returning PARTIAL with an explicit user-acknowledged reason. The
link check (9.1) now collects every markdown file modified for the task
(via `git diff --name-only --diff-filter=AMR`) and resolves each link
relative to the source file's directory, not the repo root. The syntax
check (9.2) reads `package.json.scripts.typecheck` (or the closest declared
equivalent) and refuses to invent `npx tsc`; missing declared command emits
`INFO: <language> unchecked (no declared command)` or, when no language can
be checked, `DOCS HALTED — NO_INFRA`. `DONE (with acknowledged gaps)` is
reserved for coverage gaps only — broken links and syntax errors emit
`DOCS INCOMPLETE` and the task is not marked done.

### `nacl-tl-qa`

**Before:** The Output Summary's first line was the legacy
`E2E QA Testing Complete` header, which fired regardless of the final
verdict (the verdict line below it carried the truth, but the headline
read as a happy path).

**After:** The first line is now status-aware and matches the same
six-status vocabulary used by `nacl-tl-fix`: `QA COMPLETE` /
`QA APPLIED — UNVERIFIED` / `QA HALTED — NO_INFRA` /
`QA INCOMPLETE — REGRESSION`. The `Status:` line below the headline remains
the authoritative classifier; the headline is decoration. Single small
replacement, no flag changes, no behavior changes beyond the report
template.

### `nacl-tl-plan`

**Before:** The Output Summary had a single happy-path header
(`Development Plan Created`) that fired whether all UCs were fully
specified or some were missing activity steps / requirements. The
"missing UC data" path silently created task files with placeholder notes
and exited via the same headline as a complete plan.

**After:** A planning status contract makes partial planning visible.
Three headlines: `PLAN COMPLETE` (every UC specified), `PLAN APPLIED —
PARTIAL (incomplete SA inputs)` (at least one UC missing activity steps or
requirements; tasks generated, missing inputs listed in the report and in
`status.json` under `partial_inputs`), `PLAN HALTED — NO_SA_DATA`
(pre-flight returned zero SA nodes; no TL nodes or task files created).
The report's "Missing SA inputs" section names every UC and every missing
input.

### `nacl-tl-diagnose`

**Before:** Agent 3 (Code Health) ran hardcoded `npm run build`, `npm
test`, and `npx tsc --noEmit` regardless of whether the workspace had
declared those commands. Workspaces without `scripts.build` / `scripts.test`
got a synthetic measurement instead of an honest "no infra" signal.

**After:** Agent 3 reads `package.json.scripts.{build,test,typecheck}` (or
the closest declared equivalents). Missing declared command emits
`build: NO_INFRA (scripts.build undeclared)` (or analogous) for that
sub-project; runner crash before any task runs emits
`RUNNER_BROKEN (<reason>)`. The skill MUST NOT fall back to
`npm run build` / `npm test` / `npx tsc --noEmit` / `npm audit`. Each
component is one of `pass` / `fail` / `NO_INFRA` / `RUNNER_BROKEN` —
never a 0.5 fill, never an invented command.

### `nacl-tl-reconcile`

**Before:** Phase 4.4 (Build + Test validation after docs-only changes)
ran hardcoded `npm run build` and `npm test`. `--force` was documented as
"skip the user gate" without distinguishing the per-task confirmation
prompts from the unverified-upstream acknowledgment gate, leaving a
loophole where `--force` could plausibly suppress the unverified gate.

**After:** Phase 4.4 reads declared scripts only; missing declared command
records `NO_INFRA` for that component in the Phase 5 `validation-result`
column. `--force` scope is explicitly scoped to the per-task confirmation
prompts in the user gate and the per-discrepancy prompts inside Phase 3.
The unverified-upstream acknowledgment gate (`Phase 1`'s "UNVERIFIED
upstream fix detected" prompt) remains separate and unconditional — even
with `--force`, the user must explicitly acknowledge that documenting
unverified behavior is intentional, and the acknowledgment is recorded
verbatim in the Phase 5 report.

### `nacl-tl-status`

**Before:** Health indicators showed `[OK]` / `[IN PROGRESS]` /
`[BLOCKED]` / `[STALE]` and the SA-coverage variants. `verified-pending`,
`NO_INFRA`, `RUNNER_BROKEN`, and `REGRESSION` had nowhere to live; they
silently rolled up under generic `[BLOCKED]` or `[IN PROGRESS]`.

**After:** Each of the six-status values has a dedicated indicator row
(`[!! VERIFIED-PENDING: N]`, `[!! NO_INFRA: N]`, `[!! RUNNER_BROKEN: N]`,
`[!! REGRESSION: N]`, `[BLOCKED: N]`, `[UNVERIFIED: N]`) and a mandatory
"Per-Status Counts" table renders one row per status value — even when the
count is zero — so unverified work is always visible. Indicators combine
explicitly: `Health: [IN PROGRESS] [UNVERIFIED: 2] [!! NO_INFRA: 1] [SA: GAPS]`.

### `nacl-tl-next`

**Before:** Priority 0 (`/nacl-tl-deliver`) recommendation fired on the
weak condition "all dev tasks done, no failed". A Task with status `done`
but last-fix `Status: UNVERIFIED` would be recommended for delivery
without any warning.

**After:** Priority 0 recommends `/nacl-tl-deliver` only when every
relevant Task has both `Task.status == 'done'` AND last-fix `Status:` in
PASS-family (PASS, or BLOCKED with recorded operator acceptance). Tasks in
`verified-pending`, `blocked`, `UNVERIFIED`, `NO_INFRA`, `RUNNER_BROKEN`,
or `REGRESSION` produce a prominent warning block — `[!! UNVERIFIED
DELIVERY — NOT RECOMMENDED]` — instead of a normal recommendation. The
warning block names the offending Task, the reason, and the unblock paths.
`/nacl-tl-deliver` is never silently recommended for unverified work.

### `nacl-tl-stubs`

**Before:** Step 8 set `phases.stubs` to `"blocked"` if critical > 0 and
`"done"` otherwise — a binary collapse that contradicted the skill's own
empty-test-file warning states (`STUBS APPLIED — REGRESSION`, `STUBS
HALTED — RUNNER_BROKEN`, the warnings-only path) and could mark a scan
with 44 empty test files as `done`.

**After:** `phases.stubs` aligns one-to-one with the headline vocabulary:
`done` only when `STUBS COMPLETE` (triple condition met); `unverified` for
warnings-only or no-test-files-scanned; `regression` for empty-test-files
exceeding the 50% threshold; `blocked` for critical/orphaned stubs or
runner failure. A mapping table in Step 8 lists every headline, the
`phases.stubs` value, and the six-status equivalent. Mapping rules are
applied in order, first-match-wins.

---

## Migration Impact

**Minimal.** Nothing in this release changes a flag's surface, an exit
code, or an upstream/downstream skill's parser contract. Effects on
existing workflows:

- Workflows that recommend `/nacl-tl-deliver` based on `nacl-tl-next`
  output may see fewer green-light recommendations and more warning blocks
  for Tasks with `verified-pending` or non-PASS last-fix status. The
  remediation is to run `/nacl-tl-verify` on the offending Task before
  delivering, or to invoke `/nacl-tl-deliver` directly with the explicit
  unverified override.
- Workflows that read `phases.stubs` from `.tl/status.json` may now see
  the values `unverified` and `regression` in addition to `done` and
  `blocked`. Downstream readers that switched only on `done` vs everything
  else continue to work; readers that want finer granularity can use the
  new values.
- Workflows that read `nacl-tl-status` output programmatically may need
  to handle the new "Per-Status Counts" section and the dedicated
  six-status indicator rows. The legacy `[OK]` / `[IN PROGRESS]` /
  `[BLOCKED]` / `[STALE]` indicators continue to render.
- Workspaces that previously relied on `nacl-tl-diagnose` running
  `npm test` / `npm run build` / `npx tsc --noEmit` without declaring
  those scripts will now see `NO_INFRA` for the affected components. Add
  the declared scripts to `package.json` to restore measurement, or
  accept the `NO_INFRA` signal as accurate.
- `nacl-tl-docs` users will see `DOCS INCOMPLETE` instead of
  `DOCS APPLIED — UNVERIFIED` when broken links or code-syntax errors are
  present. The task is no longer marked done in those cases. Fix the
  links / syntax and re-run.
- `nacl-tl-reconcile` `--force` no longer suppresses the unverified-upstream
  acknowledgment gate. Automation that passed `--force` to skip every
  prompt will hit the unverified gate when applicable. Acknowledge the gate
  explicitly or remove `--force`.
- `nacl-tl-plan` invocations against an SA layer with partially specified
  UCs now produce `PLAN APPLIED — PARTIAL` instead of the legacy
  happy-path headline. Task files are still generated; the report now
  names every UC with missing inputs.

No invocation syntax changed. No skill output schema changed.

---

## Verification (Manual Scenarios)

These skills are prompt files, not code. Verification is manual.

### Scenario 1 — `nacl-tl-docs` halts on a broken markdown link

**Setup:** Run `/nacl-tl-docs UC050` against a workspace where the just-
edited `docs/api/endpoint.md` contains `[see migration](../migrations/v2.md)`
and `docs/migrations/v2.md` does not exist.

**Expected behavior:**
1. Step 9.1 link check collects every modified markdown file via
   `git diff --name-only`. `endpoint.md` is in the list.
2. The check resolves `../migrations/v2.md` relative to
   `docs/api/endpoint.md`'s directory (i.e. `docs/migrations/v2.md`),
   not relative to the repo root. The target does not exist.
3. Result: `DOCS INCOMPLETE (broken links: 1)` with the broken target
   listed (`docs/api/endpoint.md -> ../migrations/v2.md`).
4. Step 10 (commit) does NOT run. Step 11 (Mark Task as Done) does NOT
   run. `status.json` is not advanced to `done`.
5. The headline is NOT `DOCS APPLIED — UNVERIFIED` and NOT
   `DONE (with acknowledged gaps)`. The user has no acknowledged-gap
   path for broken links.

**Failure condition:** task is marked done, or the headline reads `DONE
(with acknowledged gaps)`.

### Scenario 2 — `nacl-tl-status` surfaces `verified-pending` and `NO_INFRA` distinctly

**Setup:** Run `/nacl-tl-status` against a project where:
- UC037 has `verification_status = 'verified-pending'`.
- UC042 has last-fix `Status: NO_INFRA`.
- UC051 has last-fix `Status: PASS` and `status: done`.

**Expected behavior:**
1. The Health line includes both `[!! VERIFIED-PENDING: 1]` and
   `[!! NO_INFRA: 1]` as distinct indicator rows. They are NOT collapsed
   into a single `[BLOCKED]` or `[IN PROGRESS]` indicator.
2. The "Per-Status Counts" section renders every six-status row,
   including `PASS: 1`, `NO_INFRA: 1`, and the `verified-pending` row
   below the six-status block.
3. Zero-count rows still render (e.g. `BLOCKED: 0`).

**Failure condition:** `verified-pending` or `NO_INFRA` is folded into a
generic indicator, or any zero-count row is omitted.

### Scenario 3 — `nacl-tl-diagnose` reports `NO_INFRA` for an undeclared test script

**Setup:** Run `/nacl-tl-diagnose` against a workspace whose
`package.json` declares `scripts.build` but does NOT declare
`scripts.test` (no test infrastructure).

**Expected behavior:**
1. Agent 3 reads `package.json.scripts.test` and finds it undeclared.
2. Agent 3 records component status `test: NO_INFRA (scripts.test
   undeclared)` for that sub-project. It does NOT fall back to running
   `npm test`.
3. The aggregated diagnose report surfaces the `NO_INFRA` signal for
   the test component without inventing a measurement.
4. Agent 3 still runs the declared `scripts.build` for the build
   component (that one is declared).

**Failure condition:** the report contains an `npm test` output, or a
synthetic test status (e.g. "0 tests, 0 failures"), or claims the test
component as `pass` / `fail` despite the absence of a declared command.

### Scenario 4 — `nacl-tl-next` warns instead of recommending `/nacl-tl-deliver`

**Setup:** Run `/nacl-tl-next` against a project where every Task is
`status: done` AND wave-complete EXCEPT UC037, which has
`status: done` but last-fix `Status: UNVERIFIED`.

**Expected behavior:**
1. Priority 0 evaluates: not every relevant Task is in PASS-family.
   UC037 fails the second condition (last-fix `Status: UNVERIFIED`).
2. The skill does NOT render the normal `/nacl-tl-deliver` recommendation
   card.
3. The skill renders the `[!! UNVERIFIED DELIVERY — NOT RECOMMENDED]`
   warning block, naming UC037 and the reason
   (`last-fix Status: UNVERIFIED`).
4. The warning block lists unblock paths: run `/nacl-tl-verify UC037`
   to obtain PASS evidence, or invoke `/nacl-tl-deliver` directly with
   the explicit operator override.
5. The skill suggests an alternative next step from the priority table
   (the next non-blocked phase action), if any.

**Failure condition:** the recommendation card is rendered alongside
the warning block, or `/nacl-tl-deliver` is silently recommended.

---

## Known Limitations

- The link-resolution change in `nacl-tl-docs` Step 9.1 uses
  `readlink -f` for normalization, which has different semantics on
  macOS BSD vs GNU coreutils. Workspaces on macOS without `coreutils`
  installed may see the check skip a few resolution edge cases (URL
  fragments, query strings). The skill's documented behavior matches
  GNU semantics; the BSD fallback is best-effort.
- The "Per-Status Counts" section in `nacl-tl-status` renders all rows
  even when zero. Operators who prefer a compact view will need to
  filter the output downstream; the skill itself never omits rows.
- `nacl-tl-stubs` `phases.stubs: regression` is a new value some
  pre-0.13.1 dashboards may not handle. The mapping table in Step 8
  documents every value the skill emits; downstream consumers can
  switch on the closed set.
- `nacl-tl-plan` `partial_inputs` is recorded in `status.json` but is
  not yet consumed by any downstream skill. It is informational for
  the operator. A future release may have `nacl-tl-next` skip Tasks
  for UCs in `partial_inputs` until the SA work is complete.

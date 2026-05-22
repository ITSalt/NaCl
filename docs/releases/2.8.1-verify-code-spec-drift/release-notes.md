# NaCl 2.8.1 — Verify-Code Spec-Drift Reclassification

This patch fixes a recurring class of false positives in
`nacl-tl-verify-code` where stale enum vocabulary in a UC's `task-*.md`
was reported as a code defect even when the code was internally
consistent and an upstream BE/FE review had already catalogued the
drift as a non-blocking minor. The fix introduces a structured
enum-vocabulary cross-check, a pre-flag suppression step that respects
prior review classifications, and an explicit canonicality rule for
runtime artefacts. The eight-status top-level result vocabulary is
unchanged; spec drift surfaces as a routed SUGGESTION, never as
`FAIL`.

---

## Why This Patch

A UC was approved by both BE and the BE re-review, with a minor
vocabulary drift catalogued and routed to `/nacl-tl-reconcile`. A
later `/nacl-tl-verify <UC>` run then surfaced the same drift again
through its `nacl-tl-verify-code` sub-skill, this time as a code
defect on an already-APPROVED task — visible noise without a code
issue underneath.

Three properties of the pre-2.8.1 `nacl-tl-verify-code/SKILL.md` made
this possible:

1. **No structured enum-comparison step.** Enum value mismatches
   between spec text and code were lumped into Step 4's free-form
   "Incomplete renames (old name still used in some files)" bullet,
   which did not distinguish *spec lags behind code* (documentation
   issue) from *some code files still use the old name* (code
   defect).
2. **No read of prior `review-*.md` flags.** The skill had no path to
   the upstream review's "Minor Issues" / "Critical Issues" sections,
   so an issue already classified and routed by `/nacl-tl-review` was
   re-litigated by `/nacl-tl-verify-code` on the next pass.
3. **Implicit docs-canonical posture for runtime tokens.** Step 3's
   "Verify schema matches entity definition in docs" treated docs as
   canonical without exception. For runtime artefacts (Prisma enums,
   shared enums, runtime constants), the *code* is canonical — docs
   that disagree are SPEC drift, not code drift.

2.8.1 addresses all three.

---

## Per-Skill Changes

### `nacl-tl-verify-code`

**Before:** Step 4 contained a single "Incomplete renames" bullet. Step
3 said "Verify schema matches entity definition in docs" without
direction. The result vocabulary's `findings[*]` entries had only
`status: OK | ISSUE | SUGGESTION` with no classification of *why* a
finding existed. Re-runs of the verifier on an APPROVED UC could
re-emit the same drift as `ISSUE`.

**After:**

- **Step 1.4 — Load prior review flags.** Before tracing data flow,
  the verifier reads every `.tl/tasks/<UC>/review-*.md` for the UC
  under verification and parses the issues sections. Both the
  template convention (`### 🔴 Blockers (Must Fix)` /
  `### 🟢 Minor Issues (Nice to Have)`, with IDs `B01..N01`) and the
  ad-hoc convention (`## Critical Issues` / `## Minor Issues (carried
  forward, non-blocking)`, with lowercase `m-1`/`m-2`) are
  recognised. The output is a `prior_flagged` list whose `tokens`
  field is a **set** — a multi-token rename catalogued in one issue
  body (e.g. four CAPS values renamed together) suppresses any
  individual-token re-flag in the next pass.

- **Step 2.5 — Enum vocabulary cross-check (new).** A structured
  procedure that (a) enumerates canonical enums from
  `**/prisma/schema.prisma` and `**/shared/**/enums.{ts,js,mjs,cjs}`
  (and optional workspace globs), (b) extracts ALL-CAPS tokens from
  `.tl/tasks/<UC>/task-*.md` with the same acronym filter used by the
  pre-flag parser, (c) cross-references each canonical value's usage
  across the source roots, and (d) classifies findings into three
  buckets:
  - `SPEC_DRIFT` — code consistent on canonical values, spec lags →
    `SUGGESTION` + `routedTo: /nacl-tl-reconcile`. **Never causes
    FAIL.**
  - `CODE_DRIFT` — code usages disagree among themselves → `ISSUE` +
    `kind: code-defect`. Contributes to `FAIL`.
  - `UNUSED_ENUM_VALUE` — declared but never used → informational
    `SUGGESTION`.

  Step 2.5 ends with a pre-flag suppression pass that downgrades any
  finding already covered by a `prior_flagged` entry to `INFO` with
  a `note: pre-flagged in review-<phase>.md:<line>`. The matcher
  has three rules: exact token match, enum-name match, and an
  **umbrella match** where any current canonical value of the
  disputed enum appears in the prior issue's token set. The umbrella
  rule handles the common case where a review issue lists the
  *current* (post-rename) values without naming the stale token by
  itself.

  An escalation guard is built in: if the current pass classifies a
  drift as `CODE_DRIFT` but the prior flag was `SPEC_DRIFT`, the
  suppression refuses to fire. The finding emerges as a regular
  `ISSUE` with `note: escalated from prior <source> SPEC_DRIFT
  classification`. Reviews are not a permanent ratchet against newly
  introduced regressions.

  Step 2.5 skips silently when `.tl/tasks/<UC>/` does not exist
  (TECH task), when no `code_enums` were found in the workspace, or
  when no `task-*.md` exists.

- **Step 3 — Directionality fix.** The "Verify schema matches entity
  definition in docs" bullet now reads, in part, "Canonicality for
  runtime artefacts: DB schema columns, language-level enums,
  runtime constants and shared API DTOs are CANONICAL. Spec text
  that disagrees with code-that-compiles is SPEC_DRIFT, not a code
  defect — finding goes out as SUGGESTION routed to
  /nacl-tl-reconcile, NOT FAIL. Docs remain canonical for
  new-requirement *meaning* (semantic intent of a new field or
  entity), but never for the wire-level name of a token already
  present in compiled code."

- **Step 4 — Split the renames bullet.** The single "Incomplete
  renames" item is replaced with two: "Incomplete CODE rename — old
  name still used in some code files (CODE_DRIFT per Step 2.5 →
  ISSUE → contributes to FAIL)" and "Spec lags code rename — code
  consistent on the new name, only the spec text still uses the old
  name (SPEC_DRIFT per Step 2.5 → SUGGESTION + routedTo:
  /nacl-tl-reconcile, never FAIL)."

- **Step 6 — Findings schema extension.** Each `findings[*]` entry
  may now carry three new optional fields: `kind` (`code-defect` |
  `spec-drift` | `coverage-gap` | `suggestion` | `info`), `routedTo`
  (e.g. `/nacl-tl-reconcile`), and `note` (the pre-flag breadcrumb).
  Absence of any of the three is backward-compatible — fields
  default to `kind: code-defect` for ISSUE status and
  `kind: suggestion` for SUGGESTION status, with empty `routedTo`
  and empty `note`.

- **Decision-logic summary.** One new bullet pins the contract
  explicitly: **SPEC_DRIFT findings never affect the top-level
  result.** The eight-status outcome (PASS / PASS_NEEDS_E2E /
  UNVERIFIED / NO_INFRA / RUNNER_BROKEN / BLOCKED / REGRESSION /
  FAIL) is determined solely by the test suite, the integrity gate,
  and CODE_DRIFT-class findings.

### `nacl-tl-verify`

**Before:** The Step 5 console-report Suggestions block rendered each
finding as `[SUGGESTION] <detail>`, with no surface for the new
`routedTo` or `note` fields a downstream sub-skill might emit.

**After:** When a finding has a non-empty `routedTo`, the prefix
becomes `[SUGGESTION → <routedTo>]` (or `[INFO → <routedTo>]` for
INFO-level findings). A non-empty `note` is rendered on a continuation
line indented with five spaces, in parentheses. The Decision Matrix,
headline vocabulary, and integrity gate are unchanged — `kind:
spec-drift` findings cannot flip a `VERIFY COMPLETE` headline to a
non-COMPLETE state under any condition.

---

## New fixture

`tests/fixtures/verify-code-enum-drift-snapshot/` reproduces the
trigger episode with a generic `WidgetStatus` enum (`INACTIVE →
ARCHIVED` rename) and an ad-hoc-style `review-be.md` whose `m-1`
minor catalogues the drift and routes it to `/nacl-tl-reconcile`. The
fixture is plain ESM JavaScript so `node --test` runs without a TS
loader (three tests, all passing). Three scenarios are documented in
the fixture README:

- **S1** — SPEC_DRIFT with pre-flag suppression (default): expected
  finding is one `INFO`/`kind: spec-drift` entry; top-level result is
  never `FAIL`.
- **S2** — CODE_DRIFT escalation (add the optional
  `widget-alt.service.js` shown in the README): expected finding
  escalates to `ISSUE`/`kind: code-defect` with the escalation
  breadcrumb, and the top-level result is `FAIL`.
- **S3** — Pre-fix replay against an older `nacl-tl-verify-code`
  SKILL.md: produces the false-positive `ISSUE`/`code-defect`
  classification that 2.8.1 prevents. This is the RED state the
  regression fixture protects against.

---

## Contract-change discipline checklist

Per the discipline note in both edited skill files, every contract
change is paired with a downstream audit. The audit for 2.8.1:

- `nacl-tl-verify` parses `findings[*]` only for the Step 5
  Suggestions rendering. Added optional fields surface there with
  defaults; behaviour for findings without the new fields is byte-for-byte
  unchanged. Decision Matrix unaffected.
- `nacl-tl-deliver` and `nacl-tl-release` were grepped for any
  reference to `findings[*]` structure: no structural parsers exist.
  Both skills consume only the eight-status headline.
- `nacl-tl-reopened` references `findings[]` in a documentation table
  (Step 2 marker list) and matches file paths inside YouGile chat
  text. Spec-drift findings never produce a non-COMPLETE headline →
  spec-drift never reaches Reopened. No code change required.

---

## Migration impact

None for downstream projects. The new finding fields (`kind`,
`routedTo`, `note`) are all optional with documented defaults. No
SKILL.md inputs, no exit codes, no headline strings, and no
`config.yaml` keys changed. Pre-2.8.1 verifier outputs continue to
parse and render the same as before. Projects that have already
catalogued vocabulary drifts in their `review-*.md` Minor sections
will see those flags honoured automatically — no manual edits
required.

Projects whose `review-*.md` files use a custom convention not yet
recognised by the Step 1.4 parser (i.e. neither the template
`B01/C01/M01/N01` style nor the ad-hoc `m-1/m-2` style) will see
zero pre-flagged entries — the verifier will not crash, only the
suppression effect will be absent. File a project-specific adapter
extension if your repo uses a third convention.

---

## How to verify the fix

1. On a UC whose `task-*.md` has stale enum vocabulary and whose
   `review-*.md` already catalogues that drift as a minor:
   ```
   /nacl-tl-verify-code <UC>
   ```
   Expected: top-level `result` is not `FAIL`; `findings[]` contains
   one entry with `kind: spec-drift`, `status: INFO`, and a `note`
   pointing at the prior review file and line.

2. Run the orchestrator:
   ```
   /nacl-tl-verify <UC>
   ```
   Expected: the Suggestions block shows the routed line, the
   headline remains `VERIFY COMPLETE` / `VERIFY COMPLETE
   (E2E-verified)` / one of the other test-driven outcomes, and the
   task is not moved to Reopened on account of the spec-drift entry.

3. Replay the regression fixture (S1/S2/S3 in
   `tests/fixtures/verify-code-enum-drift-snapshot/README.md`).

---

## Files changed

- `nacl-tl-verify-code/SKILL.md`
- `nacl-tl-verify/SKILL.md`
- `tests/fixtures/verify-code-enum-drift-snapshot/` (new fixture
  bundle: README, package.json, schema.prisma, two service files,
  test file, three `.tl/tasks/UC-EXP-001/` artefacts)

Full release notes path:
`docs/releases/2.8.1-verify-code-spec-drift/release-notes.md`.

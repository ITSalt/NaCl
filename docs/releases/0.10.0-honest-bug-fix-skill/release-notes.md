# NaCl 0.10.0 — Honest Bug-Fix Skill

This release closes two failure modes where automated NaCl skills were silently producing misleading "all clear" results: `nacl-tl-fix` (the bug-fix skill) and `nacl-sa-validate` (the spec validator). In both cases the underlying issue was the same — a green checkmark that didn't reflect reality. Two concrete things land:

1. **`nacl-tl-fix` is now honest about test coverage.** It reorders the bug-fix workflow to TDD (write the regression test against broken code first, verify RED, then apply the fix, verify GREEN), captures a failing-test baseline before any change so "pre-existing/unrelated failures" is a checkable claim instead of an assertion, and replaces the single `FIX COMPLETE` header with a status-aware report (`PASS` / `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION`). The skill never again claims `[✓] Tests pass` when zero tests passed.

2. **New skill `nacl-tl-regression-test`.** Single-purpose: writes a regression test against currently-broken code; the test must be RED. Touches only test files, never production code. Refuses cleanly when the affected workspace has no test runner. This is the "independent test author" seam — the agent that authored a fix is no longer also the agent that grades whether the fix is verified.

Bundled with the headline: **`nacl-sa-validate` schema-drift hardening** (queued from the previous draft). The validator now detects non-canonical SA-layer labels in pre-flight and HALTs with an explicit drift report, instead of silently FAILing with seven false-positive `CRITICAL` entries.

Also bundled: **a three-layer fix for silent activity-diagram swimlane degradation.** The SA inline-table markdown parser was discarding the per-step actor column; UC-level Russian actor strings (e.g. `Система (триггер: ...)`, `ACT-01 Пользователь (Посетитель)`) failed exact-match canonicalization; and `nacl-sa-validate` had no check for empty or non-canonical `ActivityStep.actor`. Result: graphs passed validation as healthy while the renderer fell back to single-lane mode behind a warning banner — the majority of ActivitySteps in mid-size projects rendered without their swimlane assignment. Same theme as the rest of v0.10.0: silent green is the bug.

## Highlights

- **Regression test BEFORE the fix, not after.** `nacl-tl-fix` Step 6 is now sub-stepped 6a→6h: capture baseline → write the regression test against broken code → verify RED → apply the fix → re-run the suite → verify the test went GREEN AND no new failures vs baseline. The "is the test honest?" question disappears by construction.
- **Fix author ≠ test author.** When `nacl-tl-fix` needs to write a regression test, it delegates to `nacl-tl-regression-test` as a separate sub-agent (`developer` subagent_type). The fix author cannot tune the test to match its own fix.
- **Six honest statuses in the report.** `PASS` / `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION` — each has its own header (`FIX COMPLETE` / `FIX APPLIED — UNVERIFIED` / `FIX INCOMPLETE`) and a status-specific Next-step recommendation. `--auto-ship` only fires on `PASS`.
- **No invented test runners.** Step 7.1 reads `scripts.test` from the affected workspace's `package.json` and runs **exactly that command** at every test step. No fallback to `npx vitest` or `npx jest` when the project uses something else (e.g. Node native `node:test`).
- **`SUITE_EMPTY` triggers a runner sanity check.** Zero collected tests no longer silently passes — the skill re-runs against any single known-good test in the workspace before deciding whether the original glob was misconfigured (treat as missing-regression) or the runner is broken (treat as `RUNNER_BROKEN`).
- **"Pre-existing failures" must be proven, not asserted.** Step 6b captures the baseline failing-test set; Step 7 compares post-fix to baseline. Identical = `BLOCKED` with confidence (failures are baseline-confirmed unrelated). Different = `REGRESSION` caused by this fix.
- **`nacl-sa-validate` schema-drift detection in pre-flight.** Validator now calls `db.labels()` + `db.relationshipTypes()` and HALTs when non-canonical SA aliases are present without canonical counterparts — instead of running queries that silently match zero rows and produce 7 false-positive CRITICAL findings. Two-section pre-flight node-count report makes drift visible on the first screen.
- **Bilingual stereotype tolerance + enum-property tolerance in `nacl-sa-validate`.** XL6.1/XL6.4 accept both `'Автоматизируется'` and `'Automated'`; L1.4 enum-empty/duplicate check coalesces `EnumValue.value` / `.code` / `.label`; new informational L1.5 reports which property convention the graph uses.
- **Activity-diagram `ActivityStep.actor` end-to-end honesty.** Three coordinated changes close a silent failure where the renderer fell back to single-lane mode while validation reported healthy: the `inline-table-v1` SA adapter now extracts per-step actor from the `Компонент` / `Исполнитель` / `Actor` / `Актор` column with substring canonicalization (handles `Система (триггер: ...)`, `ACT-01 Пользователь (Посетитель)`, lowercase `system`, etc.); `nacl-sa-uc` MERGE template writes `as.actor` (matching the schema and the renderer) instead of legacy `as.step_type`; `nacl-sa-validate` adds checks **L3.5 (CRITICAL)** for empty `ActivityStep.actor` and **L3.6 (WARNING)** for non-canonical actor values; renderer warning text aligns with the schema property name (`actor не задан` instead of legacy `actor_type не задан`).

---

## Added

### `nacl-tl-regression-test/SKILL.md` (new skill, ~150 lines)

Tier: code-generation (Sonnet, effort `medium`). Routed through the `developer` agent. Single-purpose: write one regression test against currently-broken code. Refuses on `NO_INFRA`.

**Workflow:**

| Step | Behavior |
|---|---|
| 1. Discover framework | Walk up to nearest `package.json`, read `scripts.test`, refuse if missing. Read 1–2 sibling tests to learn imports / assertion style / fixtures conventions. |
| 2. Write the test | Assert Expected behavior (not Current). Exercise the affected file directly. One assertion target per test. Deterministic inputs. Test name describes the bug, not the fix. |
| 3. Verify RED | Run the new test in isolation against the still-broken code. If RED → success, hand off to caller. If GREEN → the test does not capture the bug; report honestly and stop. Do NOT invert the assertion to force RED. |
| 4. Report | Print test path, framework, runner command, failure excerpt confirming the test caught the bug. |

**Hard constraints:**

- Touches only test files. Never modifies production code, configuration, or build files.
- Uses the workspace's existing test framework — never introduces a new one.
- Refuses on `NO_INFRA` instead of attempting to set up a runner.
- One test per invocation. No "improvements" to neighboring tests.
- No retries on its own — caller decides when the test is wrong.

**Failure-mode reports:**

- `NO_INFRA` — workspace has no `scripts.test`. Caller falls back to `FIX APPLIED — UNVERIFIED` and recommends `/nacl-tl-dev` to set up a runner.
- "DID NOT CAPTURE BUG" — written test is GREEN against broken code. Test left in place for inspection. Caller refines bug description and re-invokes with sharper Current/Expected inputs.

### `nacl-tl-fix` Step 6 sub-steps (6a–6h)

Step 6 is restructured into TDD-ordered sub-steps:

```
6a  Restate Current / Expected / Unchanged
6b  Capture BASELINE (run scripts.test, record failing-test set)
6c  Pick path: Path A (no test imports the file) or Path B (test imports it)
6d  (Path A) Invoke /nacl-tl-regression-test as sub-agent
6e  (Path A) Verify the new test is RED — discard and retry if GREEN
6f  Apply the production-code fix
6g  Re-run the full suite, record postfix failing-test set
6h  Hand off to Step 7 for status determination
```

### Step 7 status table (7 rules, first-match wins)

| # | Condition | Status | Step 8 header |
|---|---|---|---|
| 1 | `scripts.test` missing | `NO_INFRA` | `FIX APPLIED — UNVERIFIED` |
| 2 | Runner broken / 7.2 sanity check failed | `RUNNER_BROKEN` | `FIX APPLIED — UNVERIFIED` |
| 3 | `new_failures` non-empty | `REGRESSION` | `FIX INCOMPLETE` (return to 6f) |
| 4 | Path A and the new regression test still RED | `REGRESSION` | `FIX INCOMPLETE` (return to 6f) |
| 5 | Some test transitioned RED→GREEN, postfix_failures empty | `PASS` | `FIX COMPLETE` |
| 6 | Some test transitioned RED→GREEN, postfix_failures ⊆ baseline (pre-existing unrelated failures) | `BLOCKED` | `FIX APPLIED — UNVERIFIED` |
| 7 | No test transitioned (Path B with no baseline-failing test for this bug) | `UNVERIFIED` | `FIX APPLIED — UNVERIFIED` |

Rule 6 (`BLOCKED`) is reachable from both Path A and Path B — the underlying condition is "fix verified by some RED→GREEN transition AND pre-existing failures are unchanged," and that transition can come from either the newly-written regression test or an existing baseline-failing test.

### Test-command discovery (Step 7.1)

`nacl-tl-fix` now reads `scripts.test` from the **affected workspace's** `package.json` (nearest one walking up from the changed file) and runs exactly that command. Eliminates the failure mode where the skill fell back to an invented runner (e.g. `npx vitest run` against a `node:test` codebase) and reported "No test suite found" as if it were truth.

### Runner sanity check (Step 7.2)

When `scripts.test` collects 0 tests, the skill re-runs against a single known-good test file in the workspace before classifying. If at least one test runs, the original glob was misconfigured (treat as `MISSING_REGRESSION`); if still zero, the runner is broken (`RUNNER_BROKEN`).

### `nacl-sa-validate` L3.5 / L3.6 — `ActivityStep.actor` checks

Two new step-level structural checks close the gap that let activity diagrams render as single-lane while validation reported healthy:

- **L3.5 (CRITICAL)** — flags UseCases whose ActivitySteps have empty / NULL `actor`. The renderer cannot lay out swimlanes for these UCs and falls back to single-lane mode with a warning banner; the validator now surfaces this at quality-gate time instead of leaving it to be discovered visually.
- **L3.6 (WARNING)** — flags ActivitySteps whose `actor` is non-canonical (anything outside the canonical pair `User` / `System`). Catches authoring drift where steps land with values like `admin`, lowercase `system`, `authenticated`, etc.

`nacl-ba-validate` gains a cross-reference note pointing users at `nacl-sa-validate` L3.5/L3.6 for SA-layer step-level structural checks. Prevents the false-confidence trap of running BA validation alone and assuming SA is also covered.

---

## Changed

### `nacl-tl-fix/SKILL.md` — Step 6 / Step 7 / Step 8 rewritten

- Step 6: TDD-ordered sub-steps 6a–6h (above).
- Step 7: workspace `scripts.test` discovery, sanity check for `SUITE_EMPTY`, 7-rule status table, mini sa-validate, impact check, changelog now includes `Status:` and explicit `Tests:` field.
- Step 8: status-aware header (`FIX COMPLETE` / `FIX APPLIED — UNVERIFIED` / `FIX INCOMPLETE`); per-status Next-step recommendations; report includes baseline/postfix counts, regression-test path, RED→GREEN evidence, and an explicit "Pre-existing failures (baseline-confirmed unrelated)" line for `BLOCKED`. `--auto-ship` only fires on `PASS`.
- The "Tests are treated as code (L1)" line at the top of the skill is clarified: classification level is independent of test-writing — the level determines what happens to *docs*; a regression test for the bug is mandatory for L1+ regardless.

### `nacl-tl-core/references/fix-classification-rules.md` — actions reordered, `NO_INFRA` carve-out

- L1 / L2 / L3 actions reordered to TDD: write regression test against broken code FIRST → verify RED → apply fix → verify GREEN → no new failures vs baseline.
- New "What is NOT L0" callout: a workspace having no test runner is **not** L0 (it's `NO_INFRA`, an infrastructure-shaped follow-up via `/nacl-tl-dev`); a broken test runner is **not** L0 either (it's `RUNNER_BROKEN` → `/nacl-tl-diagnose`). The fix's own L0/L1/L2/L3 classification is independent of test-runner state.

### `.claude/agents/developer.md` — routes `nacl-tl-regression-test`

The developer agent's "Routes skills" list now includes `nacl-tl-regression-test`. This is what makes the sub-agent invocation from `nacl-tl-fix` Step 6d resolve to the right cognitive profile.

### `docs/skills-reference.md` + `.ru.md`, `README.md` + `.ru.md`

- New row for `nacl-tl-regression-test` in the Fix & Recovery section.
- `nacl-tl-fix` row description updated to mention TDD ordering and honest-status reporting.
- Skill count bumped (55 → 56 in EN; 51 → 52 in RU).

### `inline-table-v1` SA adapter — per-step actor extraction with canonicalization

`nacl-migrate-core/nacl_migrate_core/adapters/inline_table_v1_sa.py` now extracts per-step actor from the main-flow table's `Компонент` / `Исполнитель` / `Actor` / `Актор` column (case-insensitive header match). Cell values are canonicalized via substring match: `пользовател` / `клиент` / `user` / `client` → `User`; `систем` / `сервер` / `system` / `server` → `System`. UC-level actor fallback uses the same substring canonicalization, so strings like `Система (триггер: ...)` and `ACT-01 Пользователь (Посетитель)` resolve to canonical values instead of failing exact-match. Round-1 `User:` / `System:` step-prefix detection (matching `frontmatter-v1` convention) is retained as a higher-precedence fallback.

Before this change the adapter discarded the actor column entirely and relied on UC-level fallback alone, which itself could not handle natural-language actor strings. The combined effect: ActivitySteps landed in the graph with empty `actor`, the renderer fell back to single-lane mode, and validation said nothing was wrong.

### `nacl-sa-uc/SKILL.md` — schema drift on the writer side

The MERGE template now writes `as.actor = $actor` instead of the legacy `as.step_type = $stepType`. The graph schema and the renderer both use `actor`; the skill template was the only writer still emitting the legacy property name, so even when `actor` was successfully extracted upstream (e.g. by other writers or by hand), `nacl-sa-uc` would write it under the wrong property. Matching parameter name, the inline comment, and the schema cheatsheet entry for `ActivityStep` are updated to follow.

### Activity diagram renderer — warning text aligned with schema

`analyst-tool/server/src/render/excalidraw/activity.ts` — the user-facing warning banner is renamed from `actor_type не задан` to `actor не задан` (lines 312, 375); inline comments at lines 260 and 364 follow. The graph-schema property has always been `actor`; the warning text was the last legacy `actor_type` reference, and reading it gave a misleading impression that the renderer was looking for a different property than the one the writer skills set.

---

## Fixed (validation hardening — bundled from `_drafts/sa-validate-schema-drift.md`)

### `nacl-sa-validate` — schema-drift detection in pre-flight (Step 0a)

The validator previously had four hardcoded schema assumptions with no introspection guardrail:

1. SA-layer node labels: `Module`, `DomainEntity`, `Requirement`, `SystemRole`, `Component` (~40 inline references in Cypher).
2. BA→SA handoff edge types: `AUTOMATES_AS`, `REALIZED_AS`, `IMPLEMENTED_BY`, `MAPPED_TO`, `TYPED_AS`.
3. `WorkflowStep.stereotype = 'Автоматизируется'` (Russian only) on XL6.1 / XL6.4.
4. `EnumValue.value` as the only recognized value-property name on L1.4.

A graph that diverged from any of these (e.g. `:SAModule` / `:SAEntity` / edge `TRACES_TO` / English `'Automated'` stereotype / `EnumValue.code`) produced **silent FAIL** with all L2-L7 / XL6-XL9 returning zero rows. The conversion of "zero rows = zero violations" into 7 false-positive CRITICAL findings was load-bearing on a real graph and burned hours of orchestrated "fix" work on data that was actually fine.

This release closes the failure mode at the source. The validator now:

- **Calls `db.labels()` + `db.relationshipTypes()` in pre-flight (Step 0a, new)** and compares against the canonical SA dictionary. If non-canonical aliases (`:SAModule`, `:SAEntity`, `:SARequirement`, `:SAActor`, `:SAComponent`, edge `TRACES_TO`) are present without canonical counterparts, validation **HALTs** with an explicit drift report. Silent FAIL becomes loud, actionable diagnostic.
- **Two-section pre-flight node-count report (Step 0b).** Canonical labels and any non-canonical labels are listed side-by-side; schema drift is visible on the first screen rather than buried under 7 false-positive criticals.
- **XL6.1 / XL6.4 stereotype tolerance.** Now accept both `'Автоматизируется'` (Russian) and `'Automated'` (English). XL6.4 coverage summary additionally counts steps that have an `AUTOMATES_AS` edge, treating the edge as authoritative ground truth.
- **L1.4 enum-property tolerance.** `EnumValue` empty/duplicate check now coalesces `.value` / `.code` / `.label`. New informational L1.5 reports which property convention the graph uses (`canonical (.value)` / `drift (.code only)` / `mixed` / `broken`).

---

## Documentation

- `nacl-sa-validate/SKILL.md` — new "Schema Reference" section enumerating canonical writers (`/nacl-sa-architect`, `/nacl-sa-domain`, etc.) and the non-canonical aliases that trigger HALT. Removes guesswork from "what does this validator expect."
- `nacl-sa-validate/SKILL.md` — new "Migration Cypher Appendix" with idempotent rename blocks for the five label dialects and a six-way split of `TRACES_TO` into the canonical handoff edges (`SUGGESTS`, `REALIZED_AS`, `MAPPED_TO`, `IMPLEMENTED_BY`, `AUTOMATES_AS`, `TYPED_AS`) based on (source, target) label pair. APOC-based.
- `docs/skills-reference.md` + `.ru.md` — new `nacl-tl-regression-test` row; `nacl-tl-fix` row description updated.

---

## Motivation

### The bug-fix skill was lying about test coverage

A user invoked `/nacl-tl-fix` to fix a 400 error in the analyst tool's frontend (`web/src/api/client.ts` was setting `Content-Type: application/json` on bodyless POST requests; Fastify rejected the empty body). The fix itself was correct. But the validation step then ran `npx vitest run` against a codebase that uses Node native `node:test`, observed "No test suite found in 44 files," waved off the result as "pre-existing stubs," and printed `[✓] Unit tests pass` followed by `FIX COMPLETE`. The `web/` workspace in fact has no test runner at all (`web/package.json` only declares lint + typecheck), and the existing `server/` tests — 19 files with 248 substantive test blocks — were never even attempted with the right runner.

Three problems compounded:

1. **The skill ran the wrong test runner** (vitest, not the project's `scripts.test`). Substituting an invented command and treating its output as truth is the same class of error as not running tests at all.
2. **No handling for "no tests exist."** When zero tests ran, the skill silently treated that as "tests passed." The report claimed `[✓] Unit tests pass` over an empty suite.
3. **No proof for "unrelated failures."** The skill labeled all 44 phantom failures as "pre-existing stubs not related to this fix" with zero evidence — no baseline comparison, no inspection of any individual file.

The user's review surfaced a deeper structural seam: **the agent that authored the fix is not a fair grader of its own test coverage.** It will tend to write tests that confirm whatever the fix happens to do. The clean answer is to make test-writing a separate skill invoked by a different sub-agent, run **before** the fix is applied (so RED-first verifies the test honestly captures the bug, with no after-the-fact audit needed).

This release implements that seam (`nacl-tl-regression-test`) and rewires `nacl-tl-fix` to use it, plus adds the missing baseline comparison and honest-status report that should have been there from the start.

### `nacl-sa-validate` was silently failing on label-renamed graphs

The schema-drift bullet above. A real-world graph with `:SAModule` / `:SAEntity` labels (rather than canonical `:Module` / `:DomainEntity`) produced 7 false-positive `CRITICAL` findings on every `validate full` because the L2-L7 queries silently matched zero rows. `nacl-sa-validate` is a quality gate; a quality gate that lies about its findings is worse than no gate. The fix follows the same principle as the bug-fix skill rewrite: convert silent zero-result-as-success into a loud, actionable diagnostic.

### Activity diagrams were silently degrading to single-lane mode

Same shape, different layer. The activity-diagram renderer needs a per-step `actor` value to lay out swimlanes; when `actor` is empty it falls back to single-lane and shows a warning banner. That fallback is intentional — but in practice it was masking three quietly-broken upstream layers: the `inline-table-v1` SA-layer markdown parser was discarding the `Компонент` / `Исполнитель` column outright; UC-level Russian actor strings like `Система (триггер: ...)` and `ACT-01 Пользователь (Посетитель)` failed exact-match canonicalization and were silently dropped; and `nacl-sa-uc` writes had no validator check that `ActivityStep.actor` was populated and canonical. Combined effect: the majority of ActivitySteps in mid-size projects landed with empty `actor`, the renderer rendered them in single-lane mode, the warning banner became wallpaper, and `nacl-sa-validate full` reported the graph as healthy. Three layers fixed in concert (parser canonicalization, writer-side schema correctness, validator coverage), plus the renderer warning text aligned with the schema property name so the diagnostic chain is self-consistent end-to-end.

---

## Upgrading

### 1. The new `nacl-tl-regression-test` skill is automatic

After `git pull`, run the install alias from your shell rc (typical name `nacl-update`) to refresh symlinks:

```
nacl-update
```

This walks the repo, creating `~/.claude/skills/<name>` symlinks for every directory containing a `SKILL.md`. The new `nacl-tl-regression-test/` will be picked up the same way as any other skill.

If you don't have the alias, do the equivalent manually:

```
ln -sf ~/path/to/NaCl/nacl-tl-regression-test ~/.claude/skills/nacl-tl-regression-test
```

### 2. `nacl-tl-fix` invocations are unchanged

The CLI is the same — `/nacl-tl-fix "what's broken"` — and existing flags (`--dry-run`, `--l1`, `--auto-ship`) still work. The TDD reordering happens internally.

The behavior changes:
- The skill now writes a regression test before applying the fix (delegated to `nacl-tl-regression-test`). For L0 fixes (environment-only), this step is skipped as before.
- The Step 8 report now uses status-aware headers. If you have downstream tooling that greps for the literal string `FIX COMPLETE`, it will still match the `PASS` case but will miss the `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION` cases. Update such tooling to grep for the `Status:` line instead.
- `--auto-ship` only triggers on `PASS`. For all other statuses, the report stops and lets you decide.

### 3. `nacl-sa-validate` invocations are unchanged

Same CLI, same flags. New behavior:
- Pre-flight `Step 0a` runs schema introspection. If your graph has non-canonical SA-layer labels (`:SAModule`, `:SAEntity`, `:SARequirement`, `:SAActor`, `:SAComponent`) without canonical counterparts, the validator will HALT with a drift report instead of running the L2-L7 queries.
- If you see the new HALT, see `nacl-sa-validate/SKILL.md` "Migration Cypher Appendix" for idempotent rename blocks. The validator will not run `validate full` against a drifted graph until the rename is applied.

### 4. Workspaces with no test runner

If `nacl-tl-fix` reports `FIX APPLIED — UNVERIFIED — NO_INFRA`, the affected workspace doesn't have `scripts.test` in its `package.json`. Open a TECH task to set one up:

```
/nacl-tl-dev TECH-### "set up test runner for [workspace]"
```

Then re-run `/nacl-tl-fix` to add a regression test for the original bug. In the meantime, the fix can ship at your discretion (the fix itself is applied; only its test verification is missing).

---

## Known limitations

- **Import-grep heuristic** at `nacl-tl-fix` Step 6c is coarse. It detects "no test imports the changed module" but doesn't detect "a test imports the module yet doesn't exercise the bug" — which surfaces as the Path B / `UNVERIFIED` status in Step 7. The recommended remediation in that case is invoking `/nacl-tl-regression-test` retroactively (which is weaker than RED-first because the fix is already applied, but better than nothing).
- **`nacl-tl-regression-test` does not retry on its own.** If the test it writes is GREEN against broken code (does not capture the bug), it stops and asks the caller to refine inputs. Two retry rounds in `nacl-tl-fix` are recommended before escalating to the user.
- **`nacl-sa-validate` schema-drift detection covers one observed dialect** (`:SA*` prefix + `TRACES_TO`). A future graph with a third dialect would surface as a new HALT scenario; revisit at that point. No `--label-aliases` runtime override flag — HALT + migration is cleaner than per-run remapping.

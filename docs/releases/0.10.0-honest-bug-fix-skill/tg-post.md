**NaCl 0.10.0: Honest Bug-Fix Skill**

`/nacl-tl-fix` no longer lies about test coverage. Until 0.10.0 the skill could see "0 tests collected" and report `[✓] Unit tests pass — FIX COMPLETE`, claiming pre-existing failures were "unrelated" without checking. Released today: TDD-ordered fix flow, baseline comparison, and an honest status table — `PASS` / `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION` — each with its own header and follow-up recommendation.

The biggest structural change: regression tests for bug fixes are written **before** the fix is applied, by a separate sub-agent (`nacl-tl-regression-test` — new in this release). The test must be RED against broken code; only then is the fix applied; only then is the report allowed to say `FIX COMPLETE`. The "is the test honest?" question disappears by construction — no more agent grading its own homework.

Also bundled: `/nacl-sa-validate` now detects schema drift in pre-flight via `db.labels()` / `db.relationshipTypes()` and HALTs with an actionable diagnostic instead of silently FAILing with 7 false-positive CRITICAL findings on graphs that use non-canonical SA labels (`:SAModule`, `:SAEntity`, `TRACES_TO`). XL6.1 / XL6.4 also accept English `'Automated'` in addition to Russian `'Автоматизируется'`; L1.4 tolerates `EnumValue.code` / `.label` in addition to `.value`.

Also bundled — same shape, different layer: activity-diagram swimlanes were silently degrading to single-lane mode. Three coordinated fixes: the `inline-table-v1` SA parser now canonicalizes per-step actor (handles `Система (триггер: ...)`, `ACT-01 Пользователь (Посетитель)`, `Компонент` / `Исполнитель` column); the `nacl-sa-uc` MERGE template writes `as.actor` instead of legacy `as.step_type`; `nacl-sa-validate` adds **L3.5 (CRITICAL)** for empty `ActivityStep.actor` and **L3.6 (WARNING)** for non-canonical values. Renderer warning text now reads `actor не задан`, matching the schema property. Graphs no longer pass validation as healthy while the renderer falls back to single-lane behind a warning banner.

Common thread across all three: a quality gate that lies about its findings is worse than no gate. This release converts every silent-FAIL path into a loud, actionable diagnostic.

Full upgrade walkthrough and skill reference: `docs/releases/0.10.0-honest-bug-fix-skill/release-notes.md`

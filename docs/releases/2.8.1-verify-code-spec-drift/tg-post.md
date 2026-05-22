NaCl 2.8.1 — Verify-Code Spec-Drift Reclassification

`nacl-tl-verify-code` no longer treats stale enum vocabulary in a UC's `task-*.md` as a code defect when the code is internally consistent on the canonical name. Spec drift is now a separate class — surfaced as a SUGGESTION routed to `/nacl-tl-reconcile`, never as `FAIL`. The eight-status top-level vocabulary is unchanged.

Trigger: a UC was approved by both BE and BE re-review, with the vocabulary drift catalogued as a non-blocking minor and routed to reconcile. A later `/nacl-tl-verify` pass re-flagged the same drift through `nacl-tl-verify-code` — on an already-APPROVED task — generating visible noise without a code issue underneath.

What changed:
— New `Step 1.4` reads every `.tl/tasks/<UC>/review-*.md` and parses both the template `B01/C01/M01/N01` convention and the ad-hoc `m-1/m-2` convention. The token field is a **set** — multi-token renames in one issue body suppress single-token re-flags.
— New `Step 2.5` is a structured enum-vocabulary cross-check: enumerate `code_enums` from `**/prisma/schema.prisma` + `**/shared/**/enums.*`, extract CAPS tokens from `task-*.md` with the standard acronym filter, cross-reference usage. Three classifications: `SPEC_DRIFT` (SUGGESTION + `routedTo: /nacl-tl-reconcile`, never FAIL), `CODE_DRIFT` (ISSUE + FAIL), `UNUSED_ENUM_VALUE` (informational).
— Pre-flag suppression at the end of Step 2.5 has three rules: exact token match, enum-name match, and an **umbrella match** that handles the common case where the prior issue lists current canonical values instead of the stale alien token. An escalation guard refuses to suppress when the new classification severity exceeds the prior one — fresh CODE_DRIFT regressions are not hidden by an old SPEC_DRIFT flag.
— `Step 3` directionality is now explicit: for runtime artefacts (Prisma columns, language-level enums, runtime constants, shared API DTOs) the code is canonical, not the docs. Docs are canonical only for the *meaning* of a new field, never for the wire-level name of a token already present in compiled code.
— `Step 6` `findings[*]` extends with three optional fields: `kind` (`code-defect` | `spec-drift` | `coverage-gap` | `suggestion` | `info`), `routedTo`, `note`. All optional, backward-compatible defaults documented.
— Orchestrator (`nacl-tl-verify`) Suggestions block renders `[SUGGESTION → <routedTo>]` and continuation `(note)` lines. Decision Matrix, headline vocabulary, and integrity gate untouched.

New regression fixture: `tests/fixtures/verify-code-enum-drift-snapshot/`. Plain ESM JavaScript (`node --test` runs without a TS loader, three passing tests), generic `WidgetStatus` enum, three scenarios documented in the fixture README (default SPEC_DRIFT suppression, CODE_DRIFT escalation via an optional alt-service file, and a pre-fix replay state).

Migration impact: none for downstream projects. New finding fields are optional with documented defaults. No flag surfaces, exit codes, headline strings, or `config.yaml` keys changed. Projects with existing review-catalogued drifts get the suppression effect automatically.

Full release notes: docs/releases/2.8.1-verify-code-spec-drift/release-notes.md

https://github.com/ITSalt/NaCl

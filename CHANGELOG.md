# Changelog

All notable changes to NaCl (Natural Agent Control Language) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.11.0] — 2026-05-29

Minor release splitting `/nacl-tl-fix` into a two-phase orchestrator so its
diagnostic half runs on Opus and its code-generation half stays on Sonnet.

**The diagnose/execute split.** `/nacl-tl-fix` ran entirely on Sonnet because it
ends in code generation and was routed wholesale to the `developer` agent — but
its first five steps (graph impact traversal, gap-check, L0/L1/L2/L3
classification, correct-behavior definition, spec authoring) are strategist-tier
reasoning. Running them on Sonnet under-powered the single most important guardrail
in the skill, the L3-feature classification. Now:

- **New agent `diagnostician`** (Opus, high effort) runs Phase A (Steps 1–5) as a
  sub-agent and returns a structured fix-plan. It authors specs/docs/graph nodes —
  never production code, never commits. The framework grows from six agents to
  seven.
- `/nacl-tl-fix` becomes a two-phase orchestrator: Phase A (diagnose & spec) on
  Opus, the USER GATE presented between phases, Phase B (execute: baseline →
  RED-first regression test → apply → six-status → impact survey) inline on Sonnet.
  The seam falls after Step 5 so Phase B receives a complete spec, restoring the
  developer-tier premise. Phase B is the same honest-execution core that
  `nacl-tl-dev-be/fe --continue`, `nacl-tl-reopened`, and `nacl-tl-hotfix` already
  delegate into — a new `## Contract` section makes that dependency explicit.

**L1 spec-first gate fix.** The 6.SF gate required a spec-update *commit* for "L1
or higher", but a pure L1 fix changes no docs and could never produce one — so
every honest L1 was structurally forced to BLOCK or file a signed exception. L1
now passes 6.SF with a **gap-check attestation** (the diagnostician's "docs
current, no drift" verdict, recorded to `.tl/status.json` as
`phases.spec: gapcheck-no-drift` before code). Anti-gaming preserved: no attestation
→ FAIL (the "jumped straight to code" case). The W10 binding logic for L2/L3 is
unchanged.

**Design Principle 1 refined** in `docs/agents.md`: "thinkers don't write" →
"thinkers don't write _code_." An Opus agent may write specifications (docs,
`.tl/*` artifacts, graph nodes), not production code, and must not commit — the
firewall is spec author ≠ code author.

No breaking changes — the output contract and default behavior are preserved; the
Codex variant (`skills-for-codex/nacl-tl-fix`) stays monolithic (no sub-agents in
that runtime).

Housekeeping: the pre-release canary caught a leftover client-name fragment on the
sanitized `Project-Alpha` placeholder in post-mortem examples (skill bodies, two
fixture READMEs, an exception-id example, one stale fixture path); all sanitized.

Release notes:
`docs/releases/2.11.0-diagnose-execute-split/release-notes.md`.

## [2.10.3] — 2026-05-26

Patch release closing the "clean audit, empty migration" gap in the SA
migration pipeline (`/nacl-migrate-sa`). Two halves of one incident:

**Parser (extraction).** The inline-table SA adapter under-extracted on
several common document dialects, so use cases migrated as empty shells —
blank module, zero activity steps, zero form links. Fixed:

- 4-digit use-case id families (`UC-NNNN`) alongside the existing 3-digit and
  letter-prefix shapes, in both the id validators and the adapter's id scan.
- A numbered-H2 module-layout fallback (e.g. `## 1. Orders (...)`), so
  `Module` nodes and `UseCase.module` populate when there is no module table.
- Screen→use-case derivation from `uc` / `relatedUC` frontmatter, so
  `Form.used_by_uc` (and therefore `USES_FORM` edges) populate.
- A numbered-list activity-step fallback under "main scenario" (`1. … 2. …`),
  the dominant inline-table dialect, so `activity_steps` populate.

**Audit (visibility).** The migration audit (`audit_sa.py`) compared
IR-expected counts to live graph counts, but derived the "expected" numbers
from the same IR just written — so it was structurally blind to
under-extraction and could report "All SA counts match" while most use cases
were empty. New completeness/coverage dimension in `validate_sa_ir.py`
(SC1–SC7): per-node-type populated-vs-total ratios with capped samples of the
missing ids (UC activity steps, UC module, UC↔form links, entity attributes,
enum values, form fields). Advisory by default — some emptiness is legitimate,
e.g. a pure list-view use case has no steps — with `--strict` / `--min-coverage`
to gate it in CI. `audit_sa.py` now documents the count-parity blind spot and
prints a pointer to the coverage section so a clean audit is never mistaken for
a complete one. The `nacl-migrate-sa` report template carries a
Completeness / Coverage section adjacent to the audit headline.

Release notes:
`docs/releases/2.10.3-clean-isnt-complete/release-notes.md`.

## [2.10.2] — 2026-05-25

Codex sync release for the 2.10.0 `/goal` protocol. Adds the Codex
`nacl-goal` skill, a shared Codex goal compatibility reference, and compact
goal compatibility or boundary sections for the ten root skills that gained
2.10.0 `/goal` annotations. Codex install documentation now expects 59
user-level skill symlinks, matching every `skills-for-codex/*/SKILL.md`
directory.

Also adds a local and CI-capable guard that checks root `nacl-*/SKILL.md`
changes against matching `skills-for-codex/` updates or an explicit sync
exemption.

Release notes:
`docs/releases/2.10.2-codex-sync-2.10.0/release-notes.md`.

## [2.10.0] — 2026-05-25

Minor release. New `/nacl-goal` skill wraps Anthropic's `/goal` command
(Claude Code 2.1.139, approx. May 2026) with NaCl semantics. The
`/goal` evaluator (Haiku 4.5 by default) is transcript-only — it cannot
run Cypher, read files, or inspect graph state — so this release ships
the GOAL_PROOF wire format: a structured block the primary session prints
into the transcript every turn so the evaluator has something
deterministic to judge.

Alias catalog (four aliases in 2.10.0): `wave:<N>` (Tier M),
`fix:<BUG-NNN>` (Tier S), `validate:module:<MOD-ID>` (Tier S),
`reopened-drain` (Tier M). Check scripts live under `nacl-goal/checks/`.
Contracts pinned in `nacl-goal/aliases.md`.

Ten refusal codes in `nacl-goal/refusal-catalog.md` cover every
mandatory human gate: BA-SA handoff, SA phase confirmation, hotfix
judgment, post-canary retrospective, production mutations,
`--dangerously-skip-permissions`, and more. Each refusal names the gate
and prints the copy-paste command for the interactive path.

`/nacl-goal` runs in preview mode by default. The `--start` flag exists
but warns for Tier S/M and refuses for Tier L/XL; autonomous execution
is deferred to 2.10.1. No `.tl/goal-runs/` writes, no concurrent lock,
no crash/resume, no runtime gate detector in this release.

Seven orchestrator SKILL.md files gain `## Use with /goal` sections
(`nacl-tl-full`, `nacl-tl-conductor`, `nacl-tl-reopened`,
`nacl-sa-validate`, `nacl-tl-fix`, `nacl-tl-stubs`, `nacl-migrate`).
Three gate skills gain `## NOT for /goal` sections (`nacl-ba-full`,
`nacl-sa-full`, `nacl-tl-hotfix`). Four new docs under `docs/guides/`:
`goal-command.md`, `goal-proof-protocol.md`, `goal-run-schema.md`,
`goal-permissions.md`.

Migration impact: none for existing projects. No config.yaml, Neo4j, or
YouGile schema changes.

Full release notes:
`docs/releases/2.10.0-goal-protocol-foundation/release-notes.md`.

## [2.10.1] — in development

Autonomous execution: `--start` fully enabled, `.tl/goal-runs/` enforced,
concurrent-execution lock, crash/resume, three new aliases
(`stubs-cleanup`, `migrate-canary`, `feature`), stop-signal probe, and
runtime gate detector. See
`docs/releases/2.10.1-autonomous-execution/release-notes.md`.

## [2.9.0] — 2026-05-25

Minor release. `/nacl-tl-intake` no longer fires the same generic
"Correct? [yes / adjust / skip]" prompt after every atom classification.
The confirmation gate is now case-driven: clean HIGH-confidence
graph-backed calls auto-route without prompting, and the cases that do
warrant a prompt get a template that names the actual ambiguity instead
of asking a question that hides it.

A new `SPEC_GAP` branch in Step 2b's decision tree distinguishes
"matching UC exists and the behavior is broken" (regular BUG) from
"matching UC exists but does not specify the sub-aspect the user is
asking about" (BUG L2 with `spec_gap: true`, bug-vs-feature escalated
as a `POLICY_CALL` to the user). Four heuristics set `spec_gap: true`:
per-X qualifier absent from the matched UC's name/description;
refinement noun (naming, ordering, chronology, count, format detail)
not in acceptance criteria; UI element or artifact type unreachable via
`HAS_FORM → HAS_FIELD` or `PRODUCES`; or the reasoning paragraph
naturally containing the phrase "spec gap also present" / "UC-X does
not currently specify ...".

Five prompt templates are now selected by a small case table:
**A** auto-route with no prompt (HIGH+GRAPH, no spec gap, L0/L1);
**B** launch-sanity check (HIGH+GRAPH, no spec gap, L2/L3 — asks about
launch readiness, not classification);
**C** SPEC_GAP policy-call prompt (HIGH+GRAPH, `spec_gap: true` —
names the sub-aspect and offers BUG / FEATURE / SKIP with the
implicit-requirement vs. new-scope distinction explained);
**D** recommendation prompt (MEDIUM+GRAPH);
**E** open-disambiguation prompt (LOW / HEURISTIC).

`--yes` flag scope tightened: auto-confirm fires Template A ONLY when
all of `confidence: HIGH`, `evidence: GRAPH`, `spec_gap: false`, and
classification level L0/L1 hold. The flag does NOT bypass SPEC_GAP
atoms, L2/L3 launch-sanity, MEDIUM, or LOW/HEURISTIC. Clean L0/L1
HIGH+GRAPH atoms now auto-route without `--yes`; L2/L3 HIGH+GRAPH atoms
now prompt with `--yes` — launch readiness and classification certainty
are separate questions.

Final-summary headline gains one first-match-wins rule:
`INTAKE TRIAGE APPLIED — REROUTED (spec-gap policy call: N atoms moved
to /nacl-sa-feature)` when one or more atoms travel through the
SPEC_GAP gate to FEATURE. All other headline rules unchanged.

Step 2d evidence block now prints explicit `Spec gap:`, `Confidence:`,
and `Level:` lines so the gate-template selection is auditable from
output. The "Neo4j unavailable" edge case wording was aligned with the
decision tree's `confidence: LOW` assignment (was inconsistently called
MEDIUM). The Codex contract variant
(`skills-for-codex/nacl-tl-intake/SKILL.md`) gets one bullet under
Source-Parity Requirements referencing the differentiated gate and
pointing back at the main skill for the decision tree.

Migration impact: none for downstream projects. Inputs unchanged,
downstream skill invocations unchanged, no `config.yaml` / Neo4j /
YouGile schema changes.

Full release notes:
`docs/releases/2.9.0-intake-differentiated-gate/release-notes.md`.

## [2.8.1] — 2026-05-22

Patch release. `nacl-tl-verify-code` no longer mis-classifies stale enum
vocabulary in a UC's `task-*.md` as a code defect when the code is
internally consistent on the canonical name. Spec drift is now its own
class — `kind: spec-drift` finding with `routedTo: /nacl-tl-reconcile` —
and never causes `FAIL`. The eight-status top-level result vocabulary is
unchanged.

`nacl-tl-verify-code` gains a structured `Step 2.5` enum cross-check
(enumerate canonical enums from `**/prisma/schema.prisma` and
`**/shared/**/enums.*`, extract CAPS tokens from `task-*.md`,
cross-reference usage across source roots, classify as `SPEC_DRIFT` /
`CODE_DRIFT` / `UNUSED_ENUM_VALUE`); a new `Step 1.4` pre-flag loader
that parses both template (`B01/C01/M01/N01`) and ad-hoc (`m-1/m-2`)
review conventions and downgrades any current finding whose tokens
were already catalogued upstream; and an explicit `Step 3` directionality
rule that names code (not docs) as canonical for runtime artefacts.
`findings[*]` schema extends with three optional, backward-compatible
fields: `kind`, `routedTo`, `note`. An escalation guard refuses to
suppress fresh `CODE_DRIFT` regressions that previously appeared as
`SPEC_DRIFT`.

`nacl-tl-verify` Suggestions block renders the new `routedTo` and `note`
fields when present. Headline vocabulary, Decision Matrix, and integrity
gate are unchanged.

Regression fixture: `tests/fixtures/verify-code-enum-drift-snapshot/` —
plain ESM JavaScript, generic `WidgetStatus` enum, three documented
scenarios (default SPEC_DRIFT suppression, CODE_DRIFT escalation,
pre-fix replay). `node --test` runs without a TypeScript loader.

Migration impact: none. New finding fields are optional with documented
defaults; no flag surfaces, exit codes, headline strings, or
`config.yaml` keys changed.

Full release notes: `docs/releases/2.8.1-verify-code-spec-drift/release-notes.md`.

## [2.8.0] — 2026-05-22

Strict-mode transition. The chain moves from evidence-descriptive to
evidence-blocking gates: missing evidence halts the chain instead of being
downgraded to "explained." Eight skip flags removed; `--skip-e2e` retained
with explicit scope. Forbidden terminal success states (`UNVERIFIED`,
`BLOCKED`, `FAILED`, `NOT_RUN`) now refuse closure across `nacl-tl-release`,
`nacl-tl-conductor`, and `nacl-tl-deliver`. `.cypher` graph exports are no
longer accepted as graph source of truth — the chain queries live Neo4j.

New artifact contracts: `.tl/exceptions/` (signed, scoped, expiring
overrides), `.tl/emergencies/` (one-shot loud records), `.tl/reconciliation/`
(cross-artifact alignment snapshots from conductor Phase 4.5),
`.tl/clean-checkout/` (release-required tree assets), `.tl/external-contracts/`
(per-provider and per-protocol contracts feeding `nacl-tl-plan`'s W6 gate).

New long-form references under `nacl-tl-core/references/`:
`strict-mode-changes.md`, `gate-fire-catalog.md`, `project-gap-closure.md`,
`config-schema.md`, `emergency-mode.md`. SKILL.md bodies remain operational;
the references are where the rules are.

Migration path: start at `nacl-tl-core/references/project-gap-closure.md`.
Expect immediate gate fires on pre-2.8 projects — that is correct behavior.
File signed exceptions for gaps that cannot be closed in the current wave.
`gate_mode: lenient` remains expressible in `config.yaml` for the migration
window, but is itself audited.

This release also ships the public repo with all client project references,
personal local paths, and operational deployment hostnames redacted. The
`ITSalt` org name, the documented Neo4j ports (`3587` Bolt / `3574` HTTP),
and the real public URLs (`github.com/ITSalt/NaCl`, `github.com/ITSalt/pinch`)
are preserved as the project's actual public identity.

Full release notes: `docs/releases/2.8.0-strict-mode-transition/release-notes.md`.

## [0.18.0] — 2026-05-21

Methodological-gap release. 0.13.0 introduced a reader for
`Task.verification_evidence` in `/nacl-tl-release` but no writer was ever
landed; every release call surfaced "Verification gap" regardless of how
thoroughly the conductor had verified the work. 0.18.0 closes the gap:
canonical taxonomy in one place, explicit writers in every skill that
advances a Task to a terminal status, and an orchestrator-side
evidence-completeness gate that HALTs before release rather than letting
the release skill be the first to detect the missing field. Full release
notes:
`docs/releases/0.18.0-evidence-writer-contract/release-notes.md`.

### Added

- `nacl-core/SKILL.md` — new § Task.verification_evidence: canonical
  taxonomy (`test-GREEN:<path>` / `test-UNVERIFIED` / `no-test` / NULL),
  format rules, writer list, reader contract. Single source of truth;
  individual skills reference this section rather than restate it.
- `skills-for-codex/references/verification-evidence.md` — Codex-pilot
  parallel reference using the closed VERIFIED / FAILED /
  PARTIALLY_VERIFIED / BLOCKED / NOT_RUN / UNVERIFIED vocabulary.
- `nacl-tl-conductor` Phase 3 — `t.verification_evidence` is now written
  in the same Cypher statement as `t.status` for PASS / UNVERIFIED /
  BLOCKED branches. The PASS branch parses the sub-skill report's
  canonical `Regression test:` line to compose `test-GREEN:<path>`.
- `nacl-tl-conductor` Phase 4 — new evidence-completeness gate. A second
  graph-truth query checks every terminal-state task in scope for
  non-empty `verification_evidence`; HALTs before Phase 5 with an
  explicit writer-contract advisory if any task is missing the field.
- `nacl-tl-conductor` Phase 6 — Development per-item table gains an
  Evidence column showing the same string the release skill will surface;
  optional `Verification gaps:` footer mirrors the release skill exactly
  when any task carries `test-UNVERIFIED` or `no-test`.
- `nacl-tl-full` Step 8 — terminal aggregator now collects regression-test
  paths from BE and FE dev sub-skill reports and writes evidence in the
  same Cypher block as `t.status`. Wave 0 TECH path Step 1.g gets the
  same treatment.
- `nacl-tl-deliver` `--skip-verify` branch — writes
  `verification_evidence = 'no-test'` to every Task in scope alongside
  the existing `verification_skip_reason`. The operator's explicit
  decision to skip verification is recorded positively, not left to the
  release skill to infer as `unknown`.
- `nacl-tl-hotfix` Step 4.3 (new) — writes
  `verification_evidence = 'test-GREEN:<path>'` to every affected Task
  node when Step 4.2 returned PASS. Collected from `/nacl-tl-fix`'s
  Step 8 triage report's "Affected UCs" list.
- `nacl-tl-regression-test` — both `REGRESSION TEST WRITTEN` (bug-fix
  mode) and `FEATURE-TEST WRITTEN` (feature-dev mode) report blocks gain
  a canonical machine-readable `Regression test: <repo-relative path>`
  line. One line per test file when multiple files were written in one
  invocation.
- `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-dev` — the primary report
  template's `Tests:` / `Verification:` block gains a `Regression test:`
  row that orchestrators parse verbatim.
- `graph-infra/schema/tl-schema.cypher` — `verification_evidence` is
  documented in the extended Task properties comment.

### Changed

- `nacl-tl-conductor` Phase 3 PASS branch — a PASS report without a
  parseable `Regression test:` line now HALTs the conductor instead of
  writing `done` with empty evidence. The only path to `'no-test'`
  evidence is an explicit user `--no-test` override on the conductor
  invocation.
- `nacl-tl-full` Step 8 — aggregated `done` status without a parseable
  regression-test path from either BE or FE report HALTs the wave with
  `WAVE HALTED — UNVERIFIED (UC###: aggregated PASS without parseable
  Regression test path)`. The TECH path Step 1.g gains the same HALT
  contract.
- Codex pilot mirrors — `nacl-core`, `nacl-tl-conductor`, `nacl-tl-full`,
  `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-regression-test`,
  `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe` reference the new
  evidence-taxonomy file in their rules / contract sections.

### Fixed

- "Verification gap" footer in `/nacl-tl-release` no longer triggers on
  every release for tasks that completed correctly through the conductor.
  The footer now reflects a genuine evidence gap (an explicit
  `no-test` / `test-UNVERIFIED` value), not a missing-writer bug.

### Notes

- No invocation syntax changed. No graph property was renamed or removed.
- Legacy `done` tasks that predate this release retain
  `verification_evidence = NULL` and will be surfaced once by the
  release skill's "Verification gap" footer, prompting reconciliation via
  `/nacl-tl-diagnose` or a small manual Cypher patch when the regression
  test path is known.
- `nacl-tl-fix` itself is intentionally unchanged — it produces the
  canonical `Regression test:` report line; orchestrators consume it and
  own the graph writes.

## [0.17.0] — 2026-05-21

Single-skill release. `/nacl-tl-fix` gains entity-driven graph impact
traversal, a migration-verification sub-flow, a data-flow impact survey,
and an `L3-feature` routing exit that stops the skill from acting as a
feature factory. Full release notes:
`docs/releases/0.17.0-fix-skill-impact-and-routing/release-notes.md`.

### Added

- `nacl-tl-fix` Step 1: three-stage Cypher impact traversal. Stage 1
  resolves the touched `DomainEntity` from the affected file / SQL table /
  changed column. Stage 2 enumerates every UC that reads or writes the
  entity via `CONSUMES | PRODUCES | MUTATES | REFERENCES | AFFECTS_ENTITY`
  plus 2-hop `DEPENDENCY` neighbours. Stage 3 keeps the legacy keyword UC
  search as a secondary probe. The TRIAGE table must list every UC
  returned by Stage 2; missing the entity is a hard `IMPACT_UNVERIFIED`
  flag in the Step 8 report.
- `nacl-tl-fix` Fix Levels table: `L3-spec-gap` and `L3-feature`
  classifications. `L3-spec-gap` covers a missing UC node / enum value /
  minor doc for a code path that already works; `L3-feature` covers
  requests whose resolution requires creating a new HTTP route, new DB
  column, new graph entity, new FE page/component, or new enum
  transition.
- `nacl-tl-fix` Step 3: `L3-feature` routing exit. Classification of
  `L3-feature` stops the workflow before Step 4. The skill prints a
  routing report (reason, affected entities from Stage 2, verbatim
  `/nacl-sa-feature "<description>"` command, fresh-session explanation,
  disambiguation path into `/nacl-tl-intake`) and exits without writing
  any files or graph nodes.
- `nacl-tl-fix` Step 6M: migration verification sub-flow. Pre-check the
  migrator manifest (drizzle `meta/_journal.json`, knex
  `knex_migrations`, prisma timestamped dir, custom fallback); run
  declared migrate command; post-check DB state with
  `SELECT COUNT(*) WHERE <pre-migration-condition>` (must return 0).
  Silent skips become `RUNNER_BROKEN`. Step 8 report gains a
  `Migration verification:` block.
- `nacl-tl-fix` Step 6c: brand-new-file anchor for Path A. Files not in
  the git tree before the fix force `Path A` unconditionally; the import
  grep is treated as meaningless for them. Closes the historical
  "no import found ⇒ Path B" inversion.
- `nacl-tl-fix` Step 7.5: data-flow survey replacing the two-bullet
  impact check. Five mandatory items: read paths, write paths,
  refresh / sync / cache / re-derivation, snapshot vs source-of-truth,
  adjacent UCs / shared types. Items 1–4 unanswered ⇒ status downgrades
  to `UNVERIFIED`.
- `nacl-tl-fix`: new `## Routing — When /nacl-tl-fix vs /nacl-tl-intake`
  preamble. Explains the new TRIAGE neighbour output and when to prefer
  `/nacl-tl-intake` for ambiguous requests.
- `nacl-tl-fix`: `--force-l3-spec-gap` flag — escape hatch for genuine
  Step 3 mis-classifications. Bypasses the `L3-feature` routing exit and
  treats the request as `L3-spec-gap`.

### Changed

- `nacl-tl-fix` Step 1: keyword UC-name search is no longer the primary
  graph probe. It is Stage 3, secondary to the entity-driven traversal.
- `nacl-tl-fix` Step 5: the previous "For L3 (create new docs): create
  minimal specification" subsection is renamed to "For L3-spec-gap" and
  restricted to (one enum value | one transition | one UC node for an
  existing route | one minor doc addition). A "Forbidden under
  L3-spec-gap" list escalates new UCs alongside new code, new API
  endpoints, and new entities back to `L3-feature` — Step 5 aborts and
  returns to Step 3 for reclassification.
- `nacl-tl-fix` edge case "Bug in area with no docs at all": rewritten
  to route to `/nacl-sa-feature` instead of "create MINIMAL
  specification". Inline spec-creation for new code paths is explicitly
  forbidden.

### Fixed

- `nacl-tl-fix` no longer treats `npm run migrate` exit-0 as proof that
  the migration applied. The DB post-check `SELECT` is the proof; the
  exit code is not.
- `nacl-tl-fix` no longer silently falls back to grep when the graph is
  available. `IMPACT_UNVERIFIED` is a hard flag in the Step 8 report
  whenever Stage 1 returns no entity match, so the gap is visible
  instead of hidden.

## [2.7.1] - 2026-05-16

### Fixed

- `skills-for-codex/scripts/install-user-symlinks.ps1` now falls back from
  Windows directory symlinks to directory junctions when symlink creation is not
  available.
- The Windows Codex installer now treats both correct `SymbolicLink` and
  `Junction` skill links as valid, so repeated installs do not block on
  junction-based user-level skill entries.

### Changed

- Codex skill installation docs now describe skill links instead of requiring
  symlinks only, and document the Windows junction fallback path.

## [2.7.0] — 2026-05-13

### Added

- **NaCl Analyst Tool** (`analyst-tool/`) -- local web application that wraps Excalidraw with a full board browser, sync-status sidebar, snapshot browser with diff overlay, and unified board + graph search.
- `skills-for-codex/nacl-tl-core/` as a Codex-side shared TL reference skill,
  including `references/tl-codex-contract.md` for graph, status, mutation,
  runner, TDD, gate, and Codex orchestration rules.
- Codex BA/SA/TL review handoff documents under `skills-for-codex/` for the
  completed contract-hardening passes.
- `skills-for-codex/references/ba-codex-contract.md` and
  `skills-for-codex/scripts/nacl-init-project.sh` as shared Codex support
  artifacts.
- Runtime-specific skill installation docs for Claude Code and Codex, including
  macOS, Linux, Windows WSL2, and Windows PowerShell commands.
- Native PowerShell installer for Codex skill symlinks at
  `skills-for-codex/scripts/install-user-symlinks.ps1`.
- `inline-table-v1` SA adapter: table-format requirements parser (RQ-NNN-NN rows) as fallback when no `### FR-NNN:` headings are found.
- `inline-table-v1` SA adapter: YAML frontmatter fallbacks for module ownership, form SCR-ID, and UC-ID resolution in requirements files.
- `inline-table-v1` SA adapter: Module ID derived from English «Код» column (kebab-case value) instead of transliterated Russian name; projects without the column are unaffected.
- `inline-table-v1` SA adapter: multi-column search for UC-IDs and domain-entity names in traceability-matrix rows (previously only `vals[1]` was checked).
- `inline-table-v1` SA adapter: `ROL-NN` accepted alongside `ACT-NN` as BA role identifier in traceability-matrix role section.
- `inline-table-v1` SA adapter: BRQ→requirement resolution now handles raw `RQ-NNN-NN` references in addition to canonical `REQ-*` IDs.
- `audit_sa`, `generate_sa_cypher`, `validate_sa_ir`: extended module lookup accepts English code (stored in `description`) and `MOD-` suffix as aliases for module name.

### Fixed

- Codex BA skills now require explicit graph-write confirmation, graph-ready
  fallback plans, and read-back evidence instead of generic "when available"
  persistence language.
- Codex SA orchestration and specialist skills now preserve graph labels,
  relationships, handoff edges, phase gates, and closed-vocabulary reporting
  more closely to the source methodology.
- Codex TL skills now share the hardened TL lifecycle contract: closed
  `Status:` parsing, graph-first/file-fallback rules, configured
  `scripts.test` discovery, RED-first discipline, baseline/post-change
  comparison, and separated review/sync/stub/QA/docs/ship/verify/deploy/release
  gates.
- `nacl-init` for Codex now separates project-name input from mutation approval
  and delegates scaffold writes to the deterministic init runner.
- `skills-for-codex/scripts/install-user-symlinks.sh` now reports blocked
  destination creation or symlink creation failures instead of assuming success.
- `inline-table-v1` SA adapter: skip summary rows (`Итого`, `Total`, `Всего`) and strip backtick/asterisk formatting from the «Код» column in the module table.
- `inline-table-v1` SA adapter: deduplicate `HandoffEdge` pairs `(BP-*, UC-*)` — previously the same edge could be appended multiple times.
- `validate_sa_ir` SV5: `Form.used_by_uc` check is now advisory-only (always PASS, collects info); secondary and deleted UC references are not a migration blocker.

### Changed

- Codex install documentation now expects 58 user-level skill symlinks, matching
  every `skills-for-codex/*/SKILL.md` directory.

## [0.16.0] — 2026-05-11

Codex packaging release. This release turns the Codex adaptation from a
five-skill pilot into a complete installable package: all 57 migrated NaCl
skills now exist under `skills-for-codex/`, the installer discovers every
`SKILL.md` automatically, and the public documentation reflects the current
skill count and installation model.

### Added

- 52 additional Codex skill adaptations under `skills-for-codex/`, completing
  the migrated Codex package at 57 installable `SKILL.md` files.
- `skills-for-codex/INSTALL.md` with user-level symlink installation,
  verification, and uninstall commands.
- `skills-for-codex/scripts/install-user-symlinks.sh` for safe installation
  into `$HOME/.agents/skills/`.
- Release documentation at
  `docs/releases/0.16.0-codex-skills-package/`.

### Changed

- Codex skill installation now discovers every
  `skills-for-codex/*/SKILL.md` directory instead of maintaining a fixed
  five-skill pilot list.
- Codex migration docs now mark the full migration as complete and reserve
  follow-up work for polish, validation automation, and runtime discovery
  checks.
- README, skills reference, methodology, agent, and install docs now report
  the current 57-skill set: 14 BA, 10 SA, 26 TL, 4 utilities, and 3 migration
  skills.

### Notes

- Root-level `nacl-*` Claude-oriented source skill folders remain unchanged.
- Codex skills are installed as symlinks to a git checkout, so updates arrive
  through `git pull`.

## [0.15.0] — 2026-05-07

Bundled release closing the dev `--continue` paths, the verifier and sync
baseline procedures, the review runner discovery, and the wave / intake /
deploy stamping. After 0.14.0 the five orchestration paths to `main` /
deploy / delivery / release honoured the six-status output. 0.15.0 closes
the layer in between: every implementation and quality gate now consumes or
emits the same six-status contract with exact runner discovery and explicit
baseline evidence. Dev `--continue` no longer self-grades; it delegates to
`/nacl-tl-fix` with a new `--from-review` metadata flag.

Five cross-cutting principles thread through the affected skills:
1. `Status: {value}` is the only authoritative classifier (headlines are
   advisory).
2. Declared workspace commands only — no `npm test` / `npm run build` /
   `npx tsc` fallbacks.
3. Baseline before any "pre-existing" / "regression" / "new failures"
   claim.
4. Skip ⇒ unverified, never PASS.
5. No autonomous branch switching.

### Added

- `nacl-tl-fix`: `--from-review` flag (metadata-only). When set, the Step 8
  report adds `Invocation source: review (--from-review)` under the Problem
  line, and the `.tl/changelog` entry records `- **Invocation source:**
  review`. The six-status contract, baseline procedure, and RED-first
  discipline are unchanged. The flag exists so the dev trio can prove its
  review-rework path delegated to the hardened fix contract.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: explicit `--continue`
  delegation block. The dev skill reads `review-{be,fe}.md` (or
  `review.md` for TECH), parses Blocker / Critical / Major issues into a
  problem description, invokes `/nacl-tl-fix "<problem>" --uc UC###
  --from-review` as a sub-agent, parses the fix report's `Status:` line,
  verifies the regression-test seam (`Tests > Regression test` path +
  `Tests > RED→GREEN` evidence), appends a `## Fix Iteration N` block to
  `result-{be,fe}.md`, and gates `phases.{be,fe}.status =
  "ready_for_review"` on `Status: PASS` (or operator-gated accepted-
  `BLOCKED`). Status-aware `--continue Output Summary` in every dev skill.
- `nacl-tl-verify-code` Step 5.2: baseline-ref discovery (priority:
  `--base <ref>` flag → saved `.tl/tasks/<id>/baseline-failures.json`
  artifact → `git merge-base HEAD main`). Baseline run uses
  `git worktree add` to a temp dir; worktree removed on every exit path.
  New `UNVERIFIED (no baseline)` row in the Step 5.4 classification
  table.
- `nacl-tl-sync` Step 7.2: per-workspace baseline capture via
  `git worktree add`. New per-workspace deltas: `be_new_failures`,
  `be_pre_existing`, `fe_new_failures`, `fe_pre_existing`. New
  `UNVERIFIED (no baseline)` classification rule for workspaces without a
  resolvable baseline.
- `nacl-tl-review` Step 6a-baseline: explicit baseline-ref discovery
  (mirroring `nacl-tl-verify-code` and `nacl-tl-sync`). New
  "`APPROVED` allowed?" column in the Step 8b headline table; explicit
  `APPROVED`-promotion rule documenting that `Code judgment: APPROVED`
  may only be written when the headline is `REVIEW COMPLETE`.
- `nacl-tl-reopened` Batch mode sub-agent prompt: now includes the full
  six-status contract — Step 7.5 status-line parsing, Step 7.5.1
  regression-test-seam evidence gate (`Tests > Regression test` path +
  `Tests > RED→GREEN` evidence required for any status other than
  `NO_INFRA` / `RUNNER_BROKEN`), and per-status branching that prevents
  `/nacl-tl-review`, `/nacl-tl-stubs`, and `/nacl-tl-ship` from running
  on non-PASS outcomes.
- `nacl-tl-full` `--skip-qa`: explicit P4 semantics. Sets
  `phase_qa = 'skipped'`, `Task.verification_skip_reason =
  'full --skip-qa'`. Forces wave aggregate headline
  `FULL APPLIED — UNVERIFIED (qa skipped)`. Forbids downstream stamping;
  UCs that completed every other phase land at `verified-pending`,
  not `done`. Records `run.skip_flags = ['qa']` in `status.json`.
- `nacl-tl-intake`: `Fix Status` and `State` columns in the final
  summary table. Headline-selection rules surface non-PASS bug atoms in
  the headline (`INTAKE TRIAGE INCOMPLETE — REGRESSION`,
  `INTAKE TRIAGE HALTED — RUNNER_BROKEN`,
  `INTAKE TRIAGE APPLIED — UNVERIFIED (NO_INFRA: N atoms unfinished)`,
  etc.). Progress rows surface the verbatim downstream `Status:` value
  per atom.

### Changed

- `nacl-tl-dev-fe` Step 3.3: silence-on-regressions is no longer
  treated as no-regression. The previous "if the agent's report is
  silent on regressions, trust the agent's RED confirmation" rule is
  replaced with: silence is `UNVERIFIED`; require an explicit
  no-regression line in the sub-agent's report (e.g. `Regressions:
  none introduced (postfix ⊆ baseline)`) before advancing.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe` Step 7 (Update
  Tracking): explicit status-gating table. `phases.{be,fe}.status =
  "ready_for_review"` only for `Status: PASS` (or operator-gated
  accepted-`BLOCKED`); every other status keeps the phase in
  `in_progress` with `failure_reason` recorded.
- `nacl-tl-reopened`: `modules.[name].test_cmd` and
  `modules.[name].build_cmd` config keys read declared workspace
  `package.json` `scripts.{test,build}` only (P2). The previous
  `fallback npm test` / `fallback npm run build` clauses are removed.
  Missing → `REOPENED HALTED — NO_INFRA (scripts.test undeclared)`.
- `nacl-tl-reopened` Step 8 re-run gate: missing `scripts.test` halts
  as `REOPENED HALTED — NO_INFRA`. The "proceed to review with a
  warning" path is removed.
- `nacl-tl-reopened` final report: `Status: DevDone ✅` is gated on
  the headline `REOPENED COMPLETE` (i.e. fix `Status: PASS` AND
  re-run suite green AND review approved). Every other outcome
  renders `REOPENED APPLIED — <STATUS>` or `REOPENED HALTED —
  <STATUS>` and leaves the YouGile column at InWork (or the matching
  halt state).
- `nacl-tl-verify-code` Step 5.2: the previous "before touching any
  files, run the exact `scripts.test` command on the current working
  tree" baseline rule is replaced with `git worktree add` against a
  resolved baseline ref. The working tree is treated exclusively as
  the postfix.
- `nacl-tl-sync` Step 7.4 classifier: the contradictory rule "Both
  suites pass AND pre-existing failures remain → `BLOCKED`" is
  removed. `BLOCKED` is now reserved for "at least one workspace has
  failures, all of which are baseline-confirmed pre-existing
  (`postfix ⊆ baseline`) AND no new failures in either workspace".
- `nacl-tl-review` Step 6a: declared `scripts.test` only — no
  `npm test` / `npx jest` / `npx vitest` fallbacks (P2). Missing →
  `REVIEW HALTED — NO_INFRA`; runner crash → `REVIEW HALTED —
  RUNNER_BROKEN`. `Code judgment: APPROVED` is forbidden under both
  halt headlines.
- `nacl-tl-full` Phase 1 Wave 0 TECH flow: reads `/nacl-tl-dev
  TECH-###`'s `Status:` line before advancing. Mirrors the BE/FE
  branching at Phase 2. The previous unconditional advancement to
  review/commit is replaced with explicit per-status branching.
- `nacl-tl-deploy` upstream gate: `verified-pending` halts by
  default as `DEPLOY HALTED — UNVERIFIED (upstream verified-pending)`;
  operator override emits `DEPLOY APPLIED — UNVERIFIED (operator
  override)` and refuses to move the source Task to `done`/`released`.
  Unknown verification state ("Not found in graph") halts
  unconditionally as `DEPLOY HALTED — UNVERIFIED (upstream status
  unknown)`. The "warn and proceed (backward-compat)" path is removed.
- `nacl-tl-intake`: progress and final-summary rows surface the
  verbatim downstream `Status:` value. Bug atoms with non-PASS
  downstream status appear as `unfinished`, not `fixed`. Final state
  movement (`Done`, `Delivered`) requires PASS-family downstream
  status.

### Removed

- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: the inline
  `--continue` "fix the issue, run tests to verify fix" loop.
  Replaced with delegation to `/nacl-tl-fix --from-review`.
- `nacl-tl-dev-fe` Step 3.3: "if the agent's report is silent on
  regressions, trust the agent's RED confirmation" — replaced with
  explicit no-regression-evidence requirement.
- `nacl-tl-reopened`: `fallback npm test` / `fallback npm run build`
  configuration clauses.
- `nacl-tl-reopened` Step 8 re-run gate: "proceed to review with a
  warning" on missing `scripts.test`.
- `nacl-tl-verify-code` Step 5.2: single-run "current working tree"
  baseline measurement.
- `nacl-tl-sync` Step 7.4: contradictory "Both suites pass AND
  pre-existing failures remain → `BLOCKED`" rule.
- `nacl-tl-review` Step 6a: `npm test (or workspace's scripts.test)`
  fallback; ability to promote to `APPROVED` under `NO_INFRA` /
  `RUNNER_BROKEN`.
- `nacl-tl-full` `--skip-qa`: `phase_qa = 'pending'` semantics.
- `nacl-tl-full` graph-write-failure handler: "continuing with
  status.json only" path.
- `nacl-tl-deploy` upstream gate: "Not found in graph | Warn and
  proceed" backward-compat path.
- `nacl-tl-intake`: progress / final-summary rows that collapsed
  every bug atom to "fixed" regardless of the downstream `Status:`
  value.

## [0.14.0] — 2026-05-07

Bundled release closing the five orchestration paths that could still move
unverified or unknown-status work toward `main`, deployment, delivery, or
release. After 0.13.0 every leaf skill produced honest six-status output;
0.14.0 makes the orchestrators that consume that output consistently honour
it.

Five cross-cutting principles thread through the affected skills:
1. `Status: {value}` is the only authoritative classifier (headlines are
   advisory).
2. Declared workspace commands only — no `npm test` / `npm run build`
   fallbacks.
3. Baseline before any "pre-existing" / "regression" claim.
4. Skip ⇒ unverified, never PASS.
5. Ship never switches branches.

### Added

- `nacl-tl-hotfix`: Step 4.0 captures a `main`-branch baseline via
  `git worktree add`; Step 4.2 computes
  `new_failures = postfix − baseline`,
  `pre_existing = postfix ∩ baseline`,
  `transitioned = baseline − postfix` and only classifies as `BLOCKED`
  (pre-existing) when set membership confirms it. The worktree is
  removed on every exit path (Step 7 RESTORE and Cleanup on Failure).
  PR body and Step 9 report gain a baseline-vs-postfix table.
- `nacl-tl-hotfix`: `modules.[name].test_filter_flag` config knob;
  Step 4.1 uses the declared filter or runs the full declared test
  command (no synthetic `--test-name-pattern`).
- `nacl-tl-deliver`: explicit `--skip-verify` semantics (P4 — skip ⇒
  unverified, never PASS). Headline forced to `DELIVER APPLIED —
  UNVERIFIED (skipped: --skip-verify)`; IntakeItem stamping refused;
  `Task.verification_skip_reason` written to graph; skip recorded in
  `delivery-status.json` and report.
- `nacl-tl-deliver`: operator health-failure override path (Step 5 →
  3a) — emits `DELIVER APPLIED — UNVERIFIED (health failed, operator
  override)`, refuses IntakeItem stamping, writes
  `Task.verification_skip_reason`.
- `nacl-tl-ship`: status-aware deploy headlines —
  `SHIP COMPLETE — DEPLOYED (direct)` (PASS),
  `SHIP APPLIED — UNVERIFIED (auto-deploy refused)` (operator-confirmed
  unverified ship), and a full `Headline selection` block enumerating
  every halt / applied / incomplete variant.
- `nacl-tl-release`: production health-failure operator override path
  (Step 3b) — emits `RELEASE INCOMPLETE — UNVERIFIED (production
  health failed, operator override)` and appends a changelog
  annotation blockquote under the version heading.
- `nacl-tl-release`: "Excluded from this release artifact (no
  IntakeItem stamped)" section in the final report listing UCs whose
  IntakeItems were excluded for non-PASS upstream status.
- `nacl-tl-conductor`: Status-line-based parser for `nacl-tl-full` and
  `nacl-tl-fix` reports (UC and BUG loops). Reports without a parseable
  `Status:` line halt with `CONDUCTOR HALTED — UNVERIFIED (downstream
  report unparseable: <id>)`.

### Changed

- `nacl-tl-hotfix`: build/test commands read declared workspace
  `scripts.{build,test}` only — no `npm run build` / `npm test`
  fallbacks (P2). Missing → `HOTFIX HALTED — NO_INFRA`.
- `nacl-tl-hotfix`: Step 6 PR + auto-merge gate. PASS → `gh pr merge
  --auto` enabled; non-PASS operator override → auto-merge skipped,
  PR annotated `HOTFIX APPLIED — UNVERIFIED`, operator runs the merge
  manually.
- `nacl-tl-conductor`: TECH path commit gate (Wave 0 sub-loop) reads
  the dev report's `Status:` line. Review approval no longer upgrades
  unverified dev work — `Status: PASS` is required to commit; non-PASS
  branches the same way the UC loop does.
- `nacl-tl-conductor`: UC and BUG loops parse `Status: {value}`
  (P1) — headlines are advisory only. Status-line and headline
  contradictions are surfaced in Phase 6.
- `nacl-tl-deliver`: build/test commands read declared workspace
  `scripts.{build,test}` only (P2). Missing → `DELIVER HALTED —
  NO_INFRA`.
- `nacl-tl-deliver`: failed health check (Step 5) halts by default
  as `DELIVER HALTED — UNVERIFIED (health failed)`. The previous
  "report as unhealthy but don't fail delivery" behaviour is removed.
- `nacl-tl-ship`: unknown upstream status (no `status.json` AND no
  Task node) halts as `SHIP HALTED — UNVERIFIED (upstream status
  unknown)`. The "warn and proceed" path is removed.
- `nacl-tl-ship`: operator-confirmed unverified ship (UNVERIFIED or
  BLOCKED, explicit "yes" not auto-confirmed by `--yes`) sets headline
  `SHIP APPLIED — UNVERIFIED`; auto-deploy via `--deploy` is refused
  under non-PASS upstream — operator runs `/nacl-tl-deploy` separately.
- `nacl-tl-ship`: documentation reaffirms "ship never switches
  branches autonomously" (P5) explicitly under the Step 1.0 status
  table.
- `nacl-tl-release`: UC status gate in Step 2 runs in every mode —
  `--skip-merge` and `git.strategy == "direct"` no longer skip Steps
  1–3. The skip flag changes which artifacts are produced, not whether
  the gate runs. In skip-merge mode the gate runs over UCs derived
  from commits-since-last-tag.
- `nacl-tl-release`: Step 3b production health failure halts by
  default as `RELEASE HALTED — UNVERIFIED (production health failed)`;
  the tag is NOT pushed. Operator override permitted (see Added).
- `nacl-tl-release`: Step 7 IntakeItem stamping is strictly gated on
  PASS. UNVERIFIED, BLOCKED, REGRESSION UCs are excluded from the
  release artifact — NOT stamped with a release version, NOT stamped
  with a "release note instead". The previous "stamp with a note"
  path is removed.

### Removed

- `nacl-tl-hotfix`: `npm run build` and `npm test` fallback rows in
  Configuration Resolution.
- `nacl-tl-hotfix`: synthetic `[test_cmd] --test-name-pattern "[test
  name]"` runner-flag heuristic in Step 4 regression-test execution.
- `nacl-tl-hotfix`: "If the failure appears unrelated... Warn but allow
  user to proceed" pre-existing-failure escape hatch.
- `nacl-tl-conductor`: headline-based parsing of `nacl-tl-full` and
  `nacl-tl-fix` reports. Headline-to-status mapping table replaced
  with `Status:` line parser.
- `nacl-tl-deliver`: `npm run build` and `npm test` fallback rows.
- `nacl-tl-deliver`: "report as unhealthy (but don't fail delivery)"
  health-check tolerance.
- `nacl-tl-ship`: "Not found (no status.json) | Warn and proceed
  (backward-compat)" row from the Step 1.0 prior-status table.
- `nacl-tl-ship`: `SHIPPED + DEPLOYED (direct)` headline (replaced
  with status-aware variants).
- `nacl-tl-release`: "If `--skip-merge` OR `git.strategy == "direct"`:
  Skip Steps 1-3 entirely → jump to Step 4" path. The merge action is
  skipped; the UC status gate is not.
- `nacl-tl-release`: "Warn but do NOT block release" health-check
  tolerance.
- `nacl-tl-release`: "For IntakeItems associated with UNVERIFIED UCs,
  stamp with a note instead" Cypher block.

## [0.13.1] — 2026-05-07

Patch release. Closes the eight low- and medium-severity findings from the
post-0.13.0 audit. No new contracts, no new flags, no parser changes — only
stops a handful of skills from reporting partial, skipped, or inferred work
as if it were complete, and removes invented `npm`/`tsc` fallbacks that
bypassed declared workspace scripts.

### Changed

**Reporting hygiene:**
- `nacl-tl-docs`: Steps 9 / 10 / 11 reordered so verification runs before
  "Mark Task as Done". Link checker now scans every modified markdown file
  (collected via `git diff --name-only`) and resolves links source-file-
  relative, not repo-root-relative. Code-syntax check uses the workspace's
  declared `scripts.typecheck` (or closest declared equivalent) instead of
  invented `npx tsc`. `DONE (with acknowledged gaps)` is reserved for
  coverage gaps only — broken links and code-syntax errors emit
  `DOCS INCOMPLETE` and the task is not marked done.
- `nacl-tl-qa`: Output Summary first line is now status-aware
  (`QA COMPLETE` / `QA APPLIED — UNVERIFIED` / `QA HALTED — NO_INFRA` /
  `QA INCOMPLETE — REGRESSION`); the legacy `E2E QA Testing Complete`
  happy-path header is removed.
- `nacl-tl-plan`: planning status contract added — `PLAN COMPLETE` /
  `PLAN APPLIED — PARTIAL (incomplete SA inputs)` /
  `PLAN HALTED — NO_SA_DATA`. The "create task files with available
  information" path is now explicit PARTIAL with missing SA inputs listed
  in the report and recorded under `partial_inputs` in `status.json`.
- `nacl-tl-status`: health indicators surface `verified-pending`,
  `NO_INFRA`, `RUNNER_BROKEN`, `REGRESSION` on dedicated rows; new
  mandatory "Per-Status Counts" section renders one row per six-status
  value, including zero counts.
- `nacl-tl-next`: Priority 0 (`/nacl-tl-deliver`) recommendation now
  requires every relevant Task to be `done` AND PASS-family.
  `verified-pending`, `blocked`, `UNVERIFIED`, `NO_INFRA`, `RUNNER_BROKEN`,
  and `REGRESSION` produce a prominent `[!! UNVERIFIED DELIVERY — NOT
  RECOMMENDED]` warning block instead of a normal recommendation.
- `nacl-tl-stubs`: `phases.stubs` in `status.json` aligns one-to-one with
  the headline vocabulary. `done` only when `STUBS COMPLETE` (triple
  condition); `unverified` for warnings or no-test-files-scanned;
  `regression` for empty-test-files exceeding 50%; `blocked` for
  critical/orphaned/runner-broken. Mapping table in Step 8 documents every
  headline → `phases.stubs` value → six-status equivalent.

**Declared-command discipline (P2):**
- `nacl-tl-diagnose`: Agent 3 (Code Health) reads
  `package.json.scripts.{build,test,typecheck}` (or closest declared
  equivalents) and refuses to fall back to `npm run build`, `npm test`,
  `npx tsc --noEmit`, or `npm audit`. Missing declared command emits
  `<component>: NO_INFRA (scripts.<name> undeclared)` for that
  sub-project; runner crash before any task runs emits `RUNNER_BROKEN`.
- `nacl-tl-reconcile`: Phase 4.4 build/test validation reads declared
  scripts only. Missing declared command records `NO_INFRA` for that
  component in the Phase 5 `validation-result` column. `--force` scope
  is now strictly limited to per-task confirmation prompts (user gate
  + Phase 3 per-discrepancy prompts); the unverified-upstream
  acknowledgment gate remains separate and unconditional.

### Removed

- Legacy `E2E QA Testing Complete` happy-path header in `nacl-tl-qa`.
- Hardcoded `npm run build` / `npm test` / `npx tsc --noEmit` / `npm audit`
  fallbacks in `nacl-tl-diagnose` Agent 3.
- Hardcoded `npm run build` / `npm test` in `nacl-tl-reconcile` Phase 4.4.
- `phases.stubs` binary collapse (`"blocked" if critical > 0, "done"
  otherwise`) in `nacl-tl-stubs` Step 8.
- Single happy-path `Development Plan Created` header in `nacl-tl-plan`.
- Generic `[OK]` / `[BLOCKED]` collapse for `verified-pending` /
  `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION` in `nacl-tl-status` health
  indicators.

## [0.13.0] — 2026-05-07

Single bundled release: honest reporting threaded through the remaining 22
skills in one narrative. After 0.10.0 (bug-fix), 0.11.0 (verification), and
0.12.0 (dev + orchestrators), the verification family, fix-derivative skills,
operational gates, reporting-hygiene skills, and reliability layer all still
had local PASS loopholes. 0.13.0 closes them.

Four discipline patterns are propagated across the catalogue:
1. Test-author isolation as an absolute principle (now applies to feature-dev,
   not just bug-fix).
2. Baseline-vs-postfix discipline gating every PASS.
3. `Status:` line as the authoritative classifier; headlines are decoration.
4. Neo4j graph as primary source of truth for operational gates.

### Added

**Test-author isolation seam:**
- `nacl-tl-regression-test`: new `feature-dev` mode (alongside existing `bug-fix`).
  Reads `test-spec.md` / `test-spec-fe.md` / `acceptance.md`; writes a test that
  FAILS because the feature surface does not exist; emits `FEATURE-TEST WRITTEN`
  / `FEATURE-TEST FAILED TO RED` / `FEATURE-TEST HALTED — NO_INFRA` /
  `FEATURE-TEST INVALID — NOT RED`.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: delegate test authorship
  to `nacl-tl-regression-test mode=feature-dev` — zero direct test-file
  `Write` calls in TDD paths.

**Verification family:**
- `nacl-tl-verify-code`: baseline-and-postfix runs; `new_failures` /
  `transitioned` set computation; `FAIL` added to status vocabulary;
  `tests_collected > 0` precondition for any PASS.
- `nacl-tl-qa`: Step 0 testable-criteria gate; HTTP-200 assertion on
  prerequisite check; `stat` validation after every screenshot.
- `nacl-tl-stubs`: sanity-seed against known stub marker; triple-condition
  gate on `STUBS COMPLETE`; `STUBS APPLIED — REGRESSION` headline for empty
  test files exceeding 50%.
- `nacl-tl-verify`: integrity gate against verify-code result fields;
  `VERIFY COMPLETE (code-only)` vs `VERIFY COMPLETE (E2E-verified)` headlines.

**Fix-derivative skills:**
- `nacl-tl-hotfix`: Step 3.5 regression-test seam audit; Scenarios 1/2
  RED-on-main precondition; PR template fields for regression-test path and
  RED→GREEN evidence.
- `nacl-tl-reopened`: Step 7.5 `Status:` line parser; Step 7.5.1 seam audit;
  Step 8 re-run gate before review/stubs.

**Operational gates:**
- `nacl-tl-deploy`: shape-validated health probe driven by
  `deploy.{env}.health_contract` in `config.yaml`; poll-and-timeout instead
  of fixed sleep; `## Contract` section; per-task status table.
- `nacl-tl-reconcile`: automated freshness skip via `git log`; mandatory
  validation path (≥10 docs gap-check fallback); per-task status table.
- `nacl-tl-intake`: `## Contract` section; per-atom user gate; YouGile API
  retry with explicit failure path.

**Reporting hygiene:**
- `nacl-tl-sync`: production-path mock-import detection (BLOCKER);
  `grep -F` for endpoint paths; FE-test mock detection.
- `nacl-tl-docs`: executable Step 10 (link check + `tsc --noEmit` + Python
  `py_compile` + implementation-coverage audit).
- `nacl-tl-review`: ticket-ID regex on stub justifications; tri-state
  checklist (PASS / PARTIAL / FAIL); combined status line.
- `nacl-tl-diagnose`: aggregation step for parallel sub-agents;
  `not_assessable` tags replace 0.5 fills; root-cause hypotheses require
  evidence; pre-finalize section checklist.

**Reliability:**
- `nacl-tl-conductor`: Cypher sentinel before Phase 4→5 advancement.
- `nacl-tl-full`: dual-write fence on Neo4j failure; Outage Recovery section.
- `nacl-tl-deliver`: graph-primary read at pre-verify gate; symmetric FAIL
  exclusion.
- `nacl-tl-release`: graph-only enforcement (no JSON fallback for status
  gate); per-UC `UC status` and `Evidence level` columns; changelog freshness
  cross-check.
- `nacl-tl-ship`: documentation note for conductor-driven multi-UC branches
  (no logic change — branch-switching remains forbidden).

### Changed

- `nacl-tl-verify-code` result schema: adds `baseline_failures`,
  `postfix_failures`, `new_failures`, `transitioned` fields. Existing
  consumers reading only `status` continue to work.
- Vacuous PASS scenarios (no testable criteria, no `it()` calls, all-mock FE
  tests) now produce explicit halt or UNVERIFIED statuses where 0.12.0 would
  have returned PASS.
- `nacl-tl-hotfix` `--yes` documentation: scope is "non-safety prompts only"
  — does NOT bypass the pre-merge non-PASS gate at Step 6.
- `nacl-tl-reopened` classification: `Status: {value}` is the authoritative
  source; the report headline is decoration.
- `nacl-tl-release` pre-merge gate: graph-only; missing Task nodes HALT
  rather than fall back to `.tl/status.json`.

### Removed

- Legacy first-match-wins headline regex in `nacl-tl-reopened` Step 7.5.
- 232/440 contradiction in `nacl-tl-stubs` between empty-test-file rule and
  headline-vocabulary table.
- Per-status escape hatches (BLOCKED/UNVERIFIED/NO_INFRA/RUNNER_BROKEN ship
  paths) at `nacl-tl-hotfix` lines 199–217 — consolidated into the single
  Step 6 mandatory gate.
- Untranslated placeholder text in `nacl-tl-deploy` SSH-diagnostics block.


- Sidebar with board tree, global search bar, and batch Regenerate / Sync actions.
- Canvas zone: full `@excalidraw/excalidraw` component with diff overlay for comparing current scene against snapshots.
- Status bar per board: `lastGeneratedAt`, `lastSyncedAt`, Regenerate / Sync / Analyze buttons.
- Run panel (bottom-right) streaming live pinch events: enqueued, started, blocked (with reason + countdown), completed, failed.
- Skill execution via `itsalt-pinch` -- programmatic Node.js API with WebSocket event streaming; hard caps (≥15 s spawn delay, ≥120 s wave cooldown, max 5 parallel) are enforced by pinch and surfaced to the user in the run panel.
- Snapshot browser: save, list, compare, and restore board snapshots; restore auto-saves a safety snapshot before overwriting.
- `<board>.meta.json` sidecar convention for per-board sync metadata (`lastGeneratedAt`, `lastGeneratedBy`, `lastSyncedAt`, `lastSyncStatus`, `lastSyncRunId`, `contentHashAtLastSync`); documented in `nacl-core/SKILL.md`.
- Fastify backend (`127.0.0.1:3583`) with REST routes for boards, skills, snapshots, search, and run history.
- Unified search: board element text / `customData.nodeId` / `customData.sourceDoc` + Neo4j graph nodes (name, title, label, description, id, uc_id, bp_id); degrades gracefully to board-only when Neo4j is unreachable.
- Batch operations: one-click Regenerate or Sync for all eligible boards.

### Changed

- `graph-infra/docker-compose.yml` no longer includes the `excalidraw` or `excalidraw-room` services; the Analyst Tool replaces them entirely.
- Board diagram generation and graph sync now go through the Analyst Tool's skill runner (pinch-mediated) rather than being triggered manually from the command line.

### Removed

- `excalidraw` Docker service (bare Excalidraw at `localhost:3580`) -- replaced by Analyst Tool at `localhost:3582`.
- `excalidraw-room` Docker service (live-collab container) -- removed as out of scope for a single-analyst workflow; can be reintroduced separately if needed.

## [0.12.0] — 2026-05-07

Two-part release. Part 1 hardened three dev skills with enforced TDD discipline.
Part 2 hardened seven orchestrator skills to consume and propagate the resulting
honest status across the full pipeline. The v0.12.0 tag is applied after both parts ship.

**Part 1 — TDD Discipline at the Dev Layer:**
`nacl-tl-dev`, `nacl-tl-dev-be`, and `nacl-tl-dev-fe` all claimed RED-first TDD but
had no enforcement — no baseline capture, no VERIFY RED step confirming new tests
appeared in the failure set, and no delta comparison at GREEN. A developer could report
"all tests pass" against a pre-existing clean suite without ever writing a test that
exercised the new code.

**Part 2 — Orchestrator Status Propagation:**
Seven orchestrator skills (`nacl-tl-conductor`, `nacl-tl-full`, `nacl-tl-ship`,
`nacl-tl-deliver`, `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-reconcile`) were
collapsing sub-skill status into binary pass/fail. With Part 1 producing honest signal,
Part 2 makes orchestrators act on it: gate graph writes, halt on REGRESSION, require
user confirmation for UNVERIFIED, and surface per-task status in all reports.

### Added

**Part 1 — Dev skills:**
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Step N.0 DISCOVER RUNNER — reads `scripts.test` from workspace `package.json`; halts with `NO_INFRA` if absent (never invents a fallback runner).
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Step N.1 CAPTURE BASELINE — runs the test suite once before writing any test; stores failing-test set to a temp file as the reference for all subsequent comparisons.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Step N.3 VERIFY RED — parses runner output after tests are written; confirms (a) new tests appear in the failure set, (b) no previously-passing test has flipped to fail. Halts if either condition fails.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Step N.5 VERIFY GREEN + COMPARE — computes delta against baseline; determines status (`PASS` / `UNVERIFIED` / `BLOCKED` / `RUNNER_BROKEN` / `REGRESSION`) before commit.
- `nacl-tl-dev` (Workflow B — infra): Steps B.0–B.3 verification-command discipline: DISCOVER VERIFICATION COMMAND → CAPTURE BASELINE STATE → APPLY CHANGE → RE-RUN VERIFICATION COMMAND. Parallel to the TDD path for Docker/CI/CD tasks.
- All three dev skills: `## Contract` section documenting inputs, outputs, downstream consumers, and the contract-change audit discipline introduced in 0.10.1.

**Part 2 — Orchestrator skills:**
- New graph property value `t.status = 'verified-pending'` for Task nodes where dev returned UNVERIFIED; `t.status = 'blocked'` for BLOCKED with user override.
- `nacl-tl-ship`: Step 1.0 pre-flight upstream status check — reads `.tl/status.json` BEFORE running local tests; UNVERIFIED/BLOCKED/REGRESSION halt before commit.
- `nacl-tl-deliver`: Step 4.0 pre-verify dev status gate — checks each UC's dev status before invoking `/nacl-tl-verify`; UNVERIFIED UCs require user gate.
- `nacl-tl-release`: Step 2 pre-merge UC status gate — looks up underlying UC statuses before presenting merge plan; UNVERIFIED requires per-PR confirmation (not bypassed by `--yes`).
- `nacl-tl-deploy`: Step 1.0 pre-monitor gate — confirms commit SHA came from PASS-status tasks before starting CI monitoring.
- `nacl-tl-reconcile`: Phase 1 pre-flight unverified fix scan — mandatory scan of recent fixes; UNVERIFIED fixes require explicit acknowledgment "documenting unverified behavior is intentional"; Health Score adjusted -5 per UNVERIFIED task.
- All seven orchestrator skills: `## Contract` section with aggregation rules and contract-change discipline.

### Changed

**Part 1 — Dev skills:**
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Output summary block replaced — single "Ready for Review" header replaced with status-aware headline: `DEV COMPLETE` / `DEV APPLIED — UNVERIFIED` / `DEV APPLIED — BLOCKED` / `DEV APPLIED — NO_INFRA` / `DEV APPLIED — RUNNER_BROKEN` / `DEV INCOMPLETE — REGRESSION` (and `DEV-BE *` / `DEV-FE *` variants).
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Output template gains baseline diff section (failures pre vs post the change) and test-runner output snippet.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Anti-patterns tables gain "no baseline capture" and "no postfix comparison" rows citing the new sub-steps.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Development checklists updated with per-sub-step checkboxes (N.0 through N.5).
- `nacl-tl-dev` Workflow A: A1/A2/A3 renamed to A.0–A.6 with new enforcement steps inserted. Existing RED/GREEN/REFACTOR content preserved as A.2/A.4/A.6.
- `nacl-tl-dev-be` Step 3 (RED Phase): restructured into sub-steps 3.0–3.3; Step 4 (GREEN Phase) gains Step 4.2 VERIFY GREEN + COMPARE.
- `nacl-tl-dev-fe` Step 3 (RED Phase): restructured into sub-steps 3.0–3.3 (RTL test categories CT/HT/FT/IT/AT/EC preserved as Step 3.2 content); Step 4 (GREEN Phase) gains Step 4.2 VERIFY GREEN + COMPARE.
- changelog.md append templates in all three skills: "Status: Ready for Review" replaced with status headline placeholder.

**Part 2 — Orchestrator skills:**
- `nacl-tl-conductor`: Phase 3 UC loop reads nacl-tl-full headline; graph write gated on PASS; failure matrix extended with UNVERIFIED/BLOCKED/REGRESSION rows; Phase 6 report gains per-task status column.
- `nacl-tl-conductor`: Bug fix branch reads nacl-tl-fix `Status:` field; `t.status = 'done'` written only on PASS.
- `nacl-tl-full`: STEP 1 BE dev / STEP 3 FE dev read sub-skill headline; `phase = 'approved'` written only on PASS (UNVERIFIED keeps phase at 'ready_for_review'); STEP 8 aggregates all phase statuses before writing overall task status.
- `nacl-tl-full`: WAVE_RESULT gains per-UC status, aggregated counts, and headline selection logic.
- `nacl-tl-ship`: PR body includes `**Verification status:**` field; `--deploy` cannot bypass upstream UNVERIFIED/BLOCKED status.
- `nacl-tl-deliver`: Step 6 graph write gated on aggregated PASS; partially-verified batches only stamp PASS-UC IntakeItems; final report gains per-UC dev status column.
- `nacl-tl-release`: Merge plan shows UC status column; Step 7 graph stamp excludes UNVERIFIED UCs from standard stamp.
- `nacl-tl-deploy`: Health failure in Step 3 halts pipeline (no longer report-and-continue); Step 4 success path only reachable with 200 OK health.
- `nacl-tl-reconcile`: Phase 5 report records UNVERIFIED acknowledgments; headline selection documents RECONCILE APPLIED — UNVERIFIED path.

## [0.11.0] — 2026-05-06

Five verification and quality-gate skills updated to apply the same honesty standard introduced by `nacl-tl-fix` in 0.10.0: all five were returning PASS based on static analysis or file scanning alone, with no test-runner discovery and no coverage check. A workspace with 44 hollow test files received the same output as one with a complete, green test suite.

### Added

- `nacl-tl-verify-code`: Step 5 "Run test suite" — discovers `scripts.test`, runs it, checks whether any test imports the changed file. Static analysis alone now produces `UNVERIFIED`, not `PASS`.
- `nacl-tl-stubs`: Step 2b "Scan test files" — counts `it()`/`test()` calls per test file; zero → `STUB-EMPTY-TEST-FILE` (WARNING). Detects the "44-stub scenario" (hollow describe blocks).
- `nacl-tl-stubs`: `STUB-EMPTY-DESCRIBE` check — flags describe blocks within non-empty test files that contain no test cases.
- `nacl-tl-sync`: Step 7 "Run BE and FE test suites" — runs both workspace runners after static checks; checks endpoint path coverage by grepping test files.
- `nacl-tl-review`: Step 6b "Test Author Independence Check" — `git log` author overlap check; MAJOR flag when tests and production code share the same primary author (>50% overlap).
- All five skills: `## Contract` section documenting inputs, outputs, downstream consumers, and the contract-change audit discipline introduced in 0.10.1.

### Changed

- `nacl-tl-verify-code`: result vocabulary expanded from `PASS | PASS_NEEDS_E2E | FAIL` to eight statuses: `PASS | PASS_NEEDS_E2E | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | BLOCKED | REGRESSION | FAIL`.
- `nacl-tl-stubs`: headline status vocabulary added: `STUBS COMPLETE / STUBS APPLIED — UNVERIFIED / STUBS RUNNER_BROKEN / STUBS APPLIED — REGRESSION`. Binary "0 stubs = PASS" replaced.
- `nacl-tl-stubs`: WARNING stub justification (count > 3) now requires a TASK ticket or backlog item ID reference; free-text alone rejected.
- `nacl-tl-verify`: adopted six-status headline vocabulary (`VERIFY COMPLETE` / `VERIFY APPLIED — *` / `VERIFY INCOMPLETE — REGRESSION`). PASS report body now distinguishes code-only vs E2E-verified. YouGile-unavailable case now prints explicit fallback text instead of silently skipping.
- `nacl-tl-sync`: verdict logic now requires both BE and FE suites to pass AND endpoint paths to be covered before `SYNC COMPLETE`. Headline vocabulary expanded to six statuses.
- `nacl-tl-review`: headline vocabulary expanded to six statuses; APPROVED / CHANGES REQUESTED retained as verdict refinement within headline. Rejection path now distinguishes implementation-wrong from tests-tuned-to-bug.

## [0.10.1] — 2026-05-06

Downstream skills `nacl-tl-reopened` and `nacl-tl-hotfix` are updated to honor the six-status output contract introduced by `nacl-tl-fix` in 0.10.0. Both skills were previously unaware of the new status vocabulary and could auto-ship or merge to main an UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION fix without halting. Both skills also gain a `## Contract` section that documents inputs, outputs, downstream consumers, and a standing discipline: when a skill's output contract changes, its consumers must be audited in the same release.

### Fixed

- `nacl-tl-reopened`: Step 2 marker scan now recognizes all six 0.10.0 status-aware headers (`FIX COMPLETE`, `FIX APPLIED — UNVERIFIED`, `FIX INCOMPLETE`, etc.); old markers retained for backward-compat.
- `nacl-tl-reopened`: new Step 7.5 "Parse fix status" branches on PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION. Non-PASS statuses post advisory and halt rather than silently advancing to review + ship.
- `nacl-tl-reopened`: Step 9 auto-ship gated on Step 7.5 status == PASS. BLOCKED/UNVERIFIED/NO_INFRA/RUNNER_BROKEN/REGRESSION never auto-ship.
- `nacl-tl-hotfix`: Step 3 Scenario 3 captures `/nacl-tl-fix` `Status:` field explicitly; any non-PASS status triggers halt-and-confirm (default: no) before proceeding.
- `nacl-tl-hotfix`: Step 4 VALIDATE distinguishes `NO_INFRA` / `RUNNER_BROKEN` from code-level test failures and from missing feature-branch dependencies.
- `nacl-tl-hotfix`: Step 6 pre-merge gate added: if fix status is not PASS, an additional confirmation is required before PR creation (`"Shipping a non-PASS fix to main is high-risk. Confirm? [yes/no]"`).

### Changed

- `nacl-tl-reopened/SKILL.md` + `nacl-tl-hotfix/SKILL.md`: added `## Contract` section after frontmatter documenting inputs consumed, outputs produced, downstream consumers, and the contract-change audit discipline.
- `nacl-tl-reopened`: YouGile rework report template gains `📊 Статус фикса: {STATUS}` field with a one-line rationale line from `/nacl-tl-fix` Step 8.
- `nacl-tl-hotfix`: PR body template includes `**Fix status:**` and, for non-PASS cases, notes that the fix was shipped with explicit user override.

## [0.10.0] — 2026-05-06

Honest bug-fix skill: `nacl-tl-fix` is rewritten to enforce TDD ordering (regression test before the fix, RED-first), capture a failing-test baseline before any change, and report status-aware results (`PASS` / `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION`) instead of always claiming `FIX COMPLETE`. New skill `nacl-tl-regression-test` is the independent test author that the fix skill delegates to. Bundled: `nacl-sa-validate` schema-drift hardening (queued from `_drafts/sa-validate-schema-drift.md`); plus a three-layer fix (parser canonicalization, writer schema correctness, validator coverage L3.5/L3.6) that closes a silent activity-diagram swimlane degradation where graphs passed validation as healthy while the renderer fell back to single-lane mode.

### Added

- **New skill `nacl-tl-regression-test`** — single-purpose skill that writes one regression test against currently-broken code; the test must be RED. Touches only test files, never production code. Refuses on `NO_INFRA`. Invoked by `nacl-tl-fix` Step 6d as a separate sub-agent (`developer` subagent_type) so the fix author cannot grade its own test coverage. Also callable directly.
- `nacl-tl-fix` Step 6 sub-stepped 6a→6h (TDD ordering): capture baseline → write regression test against broken code → verify RED → apply fix → re-run suite → verify GREEN AND no new failures vs baseline.
- `nacl-tl-fix` Step 7 — workspace `scripts.test` discovery (no fallback runner), runner sanity check for `SUITE_EMPTY`, 7-rule status table.
- `nacl-tl-fix` Step 8 — status-aware report headers (`FIX COMPLETE` / `FIX APPLIED — UNVERIFIED` / `FIX INCOMPLETE`) with per-status Next-step recommendations; explicit `Status:` line in the changelog template.
- `nacl-sa-validate` **L3.5 (CRITICAL)** — flags UseCases whose ActivitySteps have empty / NULL `actor`. The renderer cannot lay out swimlanes for these UCs and falls back to single-lane mode with a warning banner; previously this surfaced only visually.
- `nacl-sa-validate` **L3.6 (WARNING)** — flags ActivitySteps whose `actor` is non-canonical (anything outside `User` / `System`). Catches authoring drift where steps land with values like `admin`, lowercase `system`, `authenticated`.
- `nacl-ba-validate` — cross-reference note pointing users at `nacl-sa-validate` L3.5/L3.6 for SA-layer step-level structural checks. Prevents the false-confidence trap of running BA validation alone and assuming SA is also covered.

### Changed

- `nacl-tl-fix/SKILL.md` — Step 6, Step 7, Step 8 rewritten as described above. The "Tests are treated as code (L1)" line clarified: classification level is independent of test-writing — a regression test for the bug is mandatory for L1+ regardless of L0/L1/L2/L3.
- `nacl-tl-fix` `--auto-ship` flag now only fires on `PASS`; `BLOCKED`/`UNVERIFIED`/`NO_INFRA`/`RUNNER_BROKEN`/`REGRESSION` stop and let the user decide.
- `nacl-tl-core/references/fix-classification-rules.md` — L1 / L2 / L3 actions reordered to TDD (regression test first against broken code, then fix). New "What is NOT L0" callout: a workspace having no test runner is `NO_INFRA`, not L0; a broken runner is `RUNNER_BROKEN`, not L0. The fix's L0/L1/L2/L3 classification is independent of test-runner state.
- `.claude/agents/developer.md` — routes `nacl-tl-regression-test`.
- `docs/skills-reference.md` — added `nacl-tl-regression-test` row in Fix & Recovery; updated `nacl-tl-fix` row description; skill count 55 → 56.
- `docs/skills-reference.ru.md` — same updates in Russian; skill count 51 → 52.
- `README.md` + `README.ru.md` — skill count bumped.
- `nacl-migrate-core/nacl_migrate_core/adapters/inline_table_v1_sa.py` — per-step actor extraction. The adapter now reads the main-flow table's `Компонент` / `Исполнитель` / `Actor` / `Актор` column (case-insensitive header match) and applies substring canonicalization to cell values: `пользовател` / `клиент` / `user` / `client` → `User`; `систем` / `сервер` / `system` / `server` → `System`. UC-level actor fallback uses the same substring canonicalization, so strings like `Система (триггер: ...)` and `ACT-01 Пользователь (Посетитель)` resolve to canonical values. Round-1 `User:` / `System:` step-prefix detection (matching `frontmatter-v1` convention) retained as a higher-precedence fallback. Previously the actor column was discarded outright, leaving ActivitySteps with empty `actor` and the renderer falling back to single-lane mode.
- `nacl-sa-uc/SKILL.md` — MERGE template now writes `as.actor = $actor` instead of legacy `as.step_type = $stepType`. The graph schema and the renderer both use `actor`; the skill template was the only writer still emitting the legacy property name. Parameter name, comment, and schema cheatsheet entries updated to match.
- `analyst-tool/server/src/render/excalidraw/activity.ts` — warning text aligned with schema. Banner renamed from `actor_type не задан` to `actor не задан` (lines 312, 375); inline comments at lines 260 and 364 follow. The graph-schema property has always been `actor`; the user-facing warning was the last legacy `actor_type` reference.

### Fixed

- `nacl-sa-validate`: detect schema drift in pre-flight (Step 0a) via `db.labels()` / `db.relationshipTypes()`. When the graph uses non-canonical labels (`:SAModule`, `:SAEntity`, `:SARequirement`, `:SAActor`, `:SAComponent`) or non-canonical handoff edge `TRACES_TO`, the skill now HALTs with an explicit drift report instead of producing false-positive CRITICAL findings. Previously such a graph yielded 7 bogus CRITICAL + 5 bogus WARNING entries because the L2-L7 / XL6-XL9 queries silently matched zero rows.
- `nacl-sa-validate`: XL6.1 / XL6.4 now accept both Russian (`'Автоматизируется'`) and English (`'Automated'`) stereotype values; XL6.4 coverage summary additionally counts steps that have `AUTOMATES_AS` edge regardless of stereotype text.
- `nacl-sa-validate`: L1.4 enum-empty/duplicate check now coalesces `EnumValue.value`, `.code`, `.label` to tolerate naming drift; new informational L1.5 surfaces which property convention is in use.
- `nacl-sa-validate`: pre-flight node-count report now has two sections (canonical + non-canonical), making schema drift visible immediately.

### Documentation

- `nacl-sa-validate/SKILL.md`: added "Schema Reference" section listing canonical writers and the non-canonical aliases that trigger HALT.
- `nacl-sa-validate/SKILL.md`: added "Migration Cypher Appendix" with idempotent label/edge rename blocks (`SAModule->Module`, `SAEntity->DomainEntity`, etc., and `TRACES_TO` split into the four canonical handoff edges).
- `nacl-tl-fix/SKILL.md`: References section now points to `/nacl-tl-regression-test` as the canonical source for Step 6d.
- `nacl-tl-regression-test/SKILL.md`: new file (~150 lines) — workflow, hard constraints, failure-mode reports.
- `docs/releases/0.10.0-honest-bug-fix-skill/`: full release notes + Telegram drafts (en + ru).

## [0.6.0] — 2026-04-19

### Added
- Graph handover scripts (`graph-infra/scripts/handover-{export,import}.sh` + `_lib.sh`) for inter-machine transfer of a project's Neo4j graph. Uses APOC cypher export + gzip + age symmetric encryption; verified via manifest round-trip.
- `graph-infra/handover/` directory for committed encrypted snapshots, with `.gitattributes` binary marker and cleanup policy in local `README.md`.

### Fixed
- Cross-project container isolation: every `graph-infra/docker-compose.yml` now inherits a unique Compose project name via `name:` + `COMPOSE_PROJECT_NAME` (`nacl-tl-core/templates/graph-docker-compose.yml:1`). Previously all `graph-infra/` folders across the workspace resolved to the same project name, which allowed `docker compose up -d --remove-orphans` in one project to silently cull containers and data volumes of other projects. `nacl-init/SKILL.md` step 2c.4 now emits `COMPOSE_PROJECT_NAME=<slug>-graph` in every new project's `.env`/`.env.example`. Regression test confirms the class of incident is closed.

### Infrastructure
- Existing NaCl-using projects can be migrated to the templated form: named volumes, unique project labels, anonymous SHA-hashed volumes cleaned up. Projects on anonymous volumes should be dumped before the structural change (see `docs/HANDOVER.md`) as a one-time durability hedge.

### Documentation
- `docs/HANDOVER.md` + `docs/HANDOVER.ru.md` — runbook for exporting and importing a graph between machines.

## [0.5.0] — 2026-04-13

### Added
- Migration system for transitioning projects to the graph-based skill architecture (`nacl-migrate/`, `nacl-migrate-ba/`, `nacl-migrate-sa/`, `nacl-migrate-core/`)

### Fixed
- Post-migration retrospective gate: mandatory 3-sub-agent audit + user approval required before proceeding to next project after canary run

## [0.4.0] — 2026-04-12

### Added
- Agent architecture with explicit model and effort routing (`cd2e14d`)
- Central skill modifiers reference and conventions documentation (`778dbba`)

## [0.3.0] — 2026-04-11

### Added
- `nacl-tl-hotfix` skill for strategist-tier hotfix workflow (`872efcf`)
- Full release pipeline in `nacl-tl-release`: merge PRs, deploy verify, and tag (`e91ec37`)
- BA/SA methodology documentation in English and Russian (`59741d3`)

### Fixed
- `nacl-tl-ship` hardened against autonomous switching to base branch (`872efcf`, `ddaa97c`)

## [0.2.0] — 2026-04-10

### Added
- GitHub Actions CI pipeline and issue/PR templates (`2622bb6`)
- Platform compatibility notes for Desktop app and IDE extensions (`11759bf`)

### Changed
- All skills renamed with `nacl-` prefix and unified separator convention (`c1ea979`, `1050922`)

### Fixed
- Cleaned up remaining old naming references after prefix rename (`7295492`)

## [0.1.0] — 2026-04-09

### Added
- Initial project structure (`1985270`)
- Graph BA skills and infrastructure (`472e390`)
- Graph SA skills (`930949e`)
- Graph TL skills and rendering engine (`76aaead`)
- TL development skills and core code-generation templates (`2039ae0`)
- CLI tools: `docmost-sync` and `yougile-setup` (`bfbc82f`)
- `nacl-project-init` skill for bootstrapping new projects (`05279ff`)
- README and project documentation (`2622bb6`)

[Unreleased]: https://github.com/itsalt/NaCl/compare/v2.7.0...HEAD
[2.7.0]: https://github.com/itsalt/NaCl/compare/v2.6.0...v2.7.0
[0.16.0]: https://github.com/itsalt/NaCl/compare/v0.15.0...v0.16.0
[0.10.0]: https://github.com/itsalt/NaCl/compare/v0.9.0...v0.10.0
[0.5.0]: https://github.com/itsalt/NaCl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/itsalt/NaCl/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/itsalt/NaCl/compare/v0.2.0...v0.3.0

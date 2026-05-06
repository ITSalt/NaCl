# Changelog

All notable changes to NaCl (Natural Agent Control Language) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **NaCl Analyst Tool** (`analyst-tool/`) -- local web application that wraps Excalidraw with a full board browser, sync-status sidebar, snapshot browser with diff overlay, and unified board + graph search.
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

[Unreleased]: https://github.com/itsalt/NaCl/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/itsalt/NaCl/compare/v0.9.0...v0.10.0
[0.5.0]: https://github.com/itsalt/NaCl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/itsalt/NaCl/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/itsalt/NaCl/compare/v0.2.0...v0.3.0

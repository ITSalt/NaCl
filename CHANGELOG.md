# Changelog

All notable changes to NaCl (Natural Agent Control Language) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.6.0] — 2026-04-19

### Added
- Graph handover scripts (`graph-infra/scripts/handover-{export,import}.sh` + `_lib.sh`) for inter-machine transfer of a project's Neo4j graph. Uses APOC cypher export + gzip + age symmetric encryption; verified via manifest round-trip.
- `graph-infra/handover/` directory for committed encrypted snapshots, with `.gitattributes` binary marker and cleanup policy in local `README.md`.

### Fixed
- Cross-project container isolation: every `graph-infra/docker-compose.yml` now inherits a unique Compose project name via `name:` + `COMPOSE_PROJECT_NAME` (`nacl-tl-core/templates/graph-docker-compose.yml:1`). Previously all `graph-infra/` folders across the workspace resolved to the same project name, which allowed `docker compose up -d --remove-orphans` in one project to silently cull containers and data volumes of other projects. `nacl-init/SKILL.md` step 2c.4 now emits `COMPOSE_PROJECT_NAME=<slug>-graph` in every new project's `.env`/`.env.example`. Regression test confirms the class of incident is closed.

### Infrastructure
- All eight existing NaCl-using projects on the dev machine migrated to the templated form: named volumes, unique project labels, 18 anonymous SHA-hashed volumes cleaned up. Data preserved via pre-migration dumps for the four at-risk projects; dumps retained at `<project>/graph-infra/backup-20260419.dump` as a one-time durability hedge.

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

[Unreleased]: https://github.com/itsalt/NaCl/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/itsalt/NaCl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/itsalt/NaCl/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/itsalt/NaCl/compare/v0.2.0...v0.3.0

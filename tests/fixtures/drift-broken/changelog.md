# Changelog — drift-broken fixture project

## [0.18.0] — 2026-05-21 — verification-evidence writer contract

### Added

- **FR-007** — verification-evidence writer contract. Establishes
  the per-task evidence taxonomy and the Phase 3 writer contract
  that every UC/TECH/BUG path must populate
  `Task.verification_evidence` before reaching a terminal status.
- UC-105, UC-106, UC-107 — post-commit emit timing wired to the
  evidence taxonomy (L2 change).

### Released

- Tag: `v0.18.0`
- Health: warn ("no IntakeItem nodes and stale Task statuses; release proceeded by operator override")

## [0.17.0] — 2026-05-15

### Added

- FR-001 — base intake parsing
- FR-002 — wave plan derivation
- FR-003 — TECH task seeding
- FR-004 — sync-report shape
- FR-005 — verify-code baseline integrity
- FR-006 — release Step 7 IntakeItem stamping

<!--
W5 reconciliation note (not part of the actual changelog):

This file references FR-007 in the latest section. The companion
graph-snapshot.json shows the live graph contains FeatureRequest
nodes for FR-001 .. FR-006 only — FR-007 is ABSENT. This is the
P-S2 failure case (changelog FR not in graph). It mirrors
Project-Alpha-real episode 10 from W0-baseline.md anomaly #7.
-->

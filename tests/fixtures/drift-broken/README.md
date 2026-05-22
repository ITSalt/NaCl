# Fixture: drift-broken

A NaCl project state that reproduces Project-Alpha-style five-way artifact
drift. The W5 cross-artifact reconciliation gate (nacl-tl-conductor
Phase 4.5) MUST emit `Status: BLOCKED` with workflow detail
`artifact-drift` and a per-pair delta report when run against this
fixture.

The two embedded drift episodes (each from the W0 baseline):

1. **FR-007-in-changelog-but-not-in-graph** — `changelog.md` ships a
   "0.18.0 — verification-evidence writer contract" section
   referencing FR-007; the live graph contains NO `FeatureRequest
   {id: 'FR-007'}` node. (Source: Codex postmortem episode 10;
   `tests/fixtures/graph-snapshots/project-alpha/_summary.json`
   shows the live shape.)

2. **conductor-state-says-clean-but-CI-says-red** —
   `conductor-state.json.phase == "quality_gate_passed"` while
   `status.json.tasks` still has UC-105 in `in_progress`, and the
   live graph confirms `Task {id: 'UC-105'}.status = 'in_progress'`.
   (Source: Project-Alpha postmortem § 3.12 — Wave 4 closed PASS at
   17:07 with three TypeScript errors and red lint; the 17:35 audit
   reproduced it.)

## Sources of truth in this fixture

| Source | Path | State |
|---|---|---|
| status.json | `status.json` | Reports 76 tasks / 26 use cases / 12 modules — old snapshot of the Project-Alpha stale handover. UC-105 still `in_progress`. |
| conductor-state.json | `conductor-state.json` | phase = `quality_gate_passed` (advanced prematurely); says UC-105 is `done` — disagrees with status.json AND graph. |
| changelog.md | `changelog.md` | Latest section references FR-007 plus FR-001 … FR-006. |
| live graph (snapshot) | `graph-snapshot.json` | `Module=12`, `UseCase=26`, `Task=76`, `FeatureRequest=6` (FR-001 … FR-006 only — FR-007 ABSENT). UC-105 graph status `in_progress`. Matches `tests/fixtures/graph-snapshots/project-alpha/_summary.json` shape. |
| release-status.json | `release-status.json` | `release_tag = v0.18.0`; `graph.status = warn` (Project-Alpha-real: "no IntakeItem nodes and stale Task statuses; release proceeded by operator override"). |
| exceptions/ | (empty) | No active or expired exceptions — the gate has no cover. |

## Pairwise assertions (multiple FAIL)

| Pair | Outcome | Why |
|---|---|---|
| P-S1 status.json totals vs graph counts | PASS | both say 76 / 26 / 12 (the stale snapshot happens to match the stale status.json — drift is elsewhere) |
| P-S2 changelog FR list vs graph FeatureRequest | **FAIL** | changelog references FR-007; graph has only FR-001 … FR-006 |
| P-S3 release-status tag vs graph release_tag | **FAIL** | `release-status.json.release_tag = v0.18.0`; no graph node carries `release_tag = 'v0.18.0'` (FR-007 would have, but it does not exist) |
| P-S4 conductor phase vs status.json terminal | **FAIL** | phase advanced to `quality_gate_passed` but UC-105 still `in_progress` in status.json |
| P-S5 conductor task entries vs graph Task.status | **FAIL** | conductor-state says UC-105 = `done`; graph says UC-105 = `in_progress` |

## Expected reconciliation evidence

A reconciliation run against this fixture writes
`reconciliation/<ISO>.json` with:

```json
{
  "terminal_status": "BLOCKED",
  "workflow_detail": "artifact-drift"
}
```

The HALT advisory in nacl-tl-conductor Phase 4.5 / Step 4 lists each
failing pair with its delta. Phase 5 (DELIVERY) MUST NOT run.

The expected artifact is materialized at
`expected-reconciliation.json` for W11 assertion.

## What the operator must do to unblock

Three legitimate paths (none of them bypass):

1. **Replay the missing graph write.** FR-007 was emitted to
   changelog by a release that did not commit its graph mutations.
   Run `/nacl-sa-feature FR-007` to reissue. Drive UC-105 to a
   terminal state via `/nacl-tl-full UC-105`. Rerun.
2. **Roll back the changelog claim.** If FR-007 was added to the
   changelog by mistake, remove the entry, rerun.
3. **File a signed exception.** Per W4 schema in
   `.tl/exceptions/<id>.yaml`, against gate `graph-stale`, with
   non-empty `reason`, `expiry ≤ 24h`, and `followup_task`. Rerun.
   The signed exception converts `outcome` to
   `PASS_UNDER_EXCEPTION` and is recorded in `active_exceptions`;
   expired exceptions never satisfy a pair.

There is no `--skip-reconciliation` flag. There is no `--force`.
The W5 binding forbids `.cypher` export fallback on graph
unreachability.

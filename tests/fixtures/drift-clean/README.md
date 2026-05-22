# Fixture: drift-clean

A minimal NaCl project where all five sources of truth agree. The
W5 cross-artifact reconciliation gate (nacl-tl-conductor Phase 4.5)
runs and emits `Status: VERIFIED`.

This fixture is used by W11 to assert the reconciliation gate does
not produce false positives on internally consistent state.

## Sources of truth in this fixture

| Source | Path | Content |
|---|---|---|
| status.json | `status.json` | 1 intake, 2 tasks (1 UC, 1 TECH), both `done` |
| conductor-state.json | `conductor-state.json` | phase = `quality_gate_passed`; both task entries match status.json |
| changelog.md | `changelog.md` | latest section ships FR-100; references UC-100 and TECH-100 |
| live graph (snapshot) | `graph-snapshot.json` | `Module=1`, `UseCase=1`, `Task=2`, `FeatureRequest=1`; FR-100 present; all properties consistent |
| release-status.json | `release-status.json` | `release_tag = v0.1.0`; `health.status = ok` |
| exceptions/ | (empty) | No exceptions needed — all assertions pass on their own |

## Pairwise assertions (all PASS)

| Pair | Outcome |
|---|---|
| P-S1 status.json totals vs graph counts | PASS — both report `tasks=2, use_cases=1, modules=1` |
| P-S2 changelog FR list vs graph FeatureRequest | PASS — FR-100 in changelog; FR-100 in graph |
| P-S3 release-status tag vs graph release_tag | PASS — `v0.1.0` on FR-100 in graph |
| P-S4 conductor phase vs status.json terminal | PASS — `quality_gate_passed` and no tasks pending/in_progress |
| P-S5 conductor task entries vs graph Task.status | PASS — both tasks `done` in both artifacts |

## Expected reconciliation evidence

A successful reconciliation run against this fixture writes
`reconciliation/<ISO>.json` with:

```json
{
  "terminal_status": "VERIFIED",
  "workflow_detail": ""
}
```

and every pair entry carrying `"outcome": "PASS"`.

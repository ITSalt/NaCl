# Gate-evaluation matrix — project-alpha-blocked

This matrix records the expected per-gate verdict under four
fixture scenarios. The W11-pilot harness will assert against this
matrix.

## Scenario A — no exceptions, no emergency mode

| # | Condition                                                | Expected verdict | Workflow detail                                  |
|---|----------------------------------------------------------|------------------|--------------------------------------------------|
| 1 | upstream-sync-unverified                                 | REFUSE           | upstream-sync-unverified                         |
| 2 | upstream-qa-unverified                                   | REFUSE           | upstream-qa-unverified                           |
| 3 | graph-stale (live 1083 vs baseline 970)                  | REFUSE           | graph-stale                                      |
| 4 | sa-validate-critical (1 CRITICAL + 156 WARNINGs)         | REFUSE           | sa-validate-critical                             |
| 5 | missing-prod-golden-path (LIVE_PROVIDER_SMOKE NOT_RUN)   | REFUSE           | missing-prod-golden-path                         |
| 6 | direct-strategy-on-standard-project                      | REFUSE           | direct-strategy-on-standard-project              |

Terminal headline: first refusal encountered in step order →
`RELEASE HALTED — UNVERIFIED (direct-strategy-on-standard-project)`.
Closed Status: `BLOCKED`.

## Scenario B — `EXC-2026-05-22-valid-graph-stale.yaml` present (in-window)

Same as Scenario A, EXCEPT row #3 changes:

| # | Condition                                                | Expected verdict | Workflow detail                                  |
|---|----------------------------------------------------------|------------------|--------------------------------------------------|
| 3 | graph-stale                                              | PASS-via-exception | exception-applied:EXC-2026-05-22-valid-graph-stale |

Terminal headline still: `RELEASE HALTED — UNVERIFIED (direct-strategy-on-standard-project)` (#6 fires first; the exception suppresses #3 only).

release-status.json gains `"exceptions": [{ "exception_id": "EXC-2026-05-22-valid-graph-stale", "affected_gates": ["graph-stale"], "expiry": "2026-05-23T08:35:00Z", "followup_task": "TECH-042-graph-refresh" }]`.

## Scenario C — `EXC-2025-12-01-expired-graph-stale.yaml` present (only)

Same as Scenario A, EXCEPT a banner is printed on stderr:

```
Exception EXC-2025-12-01-expired-graph-stale is EXPIRED
(expiry: 2025-12-31T23:59:59Z, now: 2026-05-22T10:05:00Z).
Treating as absent.
```

Workflow detail recorded alongside #3: `exception-expired`. The
graph-stale gate still REFUSES. Terminal headline unchanged.

## Scenario D — `EXC-2026-05-22-blanket-rejected.yaml` present (only)

Same as Scenario A, EXCEPT a load-time error is recorded:

```
Exception EXC-2026-05-22-blanket-rejected REJECTED at load:
affected_gates contains blanket entry "*". Treating as absent.
Workflow detail: exception-affects-blanket-gates.
```

All gates fire. Terminal headline unchanged.

## Scenario E — `EXC-2026-05-22-prototype-on-standard.yaml` present (only)

Same as Scenario A, EXCEPT a load-time error is recorded:

```
Exception EXC-2026-05-22-prototype-on-standard REJECTED at load:
affected_gates includes [skipped-pr, skipped-ci] but
config.yaml declares project_kind: standard. Treating as absent.
Workflow detail: exception-prototype-only-gate-on-standard-project.
```

All gates fire. Terminal headline unchanged.

## Scenario F — `NACL_EMERGENCY=1` + companion env vars set

All six gates evaluate, all six refuse. The skill prints one
bypass banner per refusal (on stderr). The skill writes
`.tl/emergencies/<UTC-timestamp>-prod-rollback.yaml` with a
`bypassed_gates` array of length 6. The skill appends to
`release-status.json` under `"emergency"`. The skill appends a
blockquote line to `.tl/changelog.md`. Skill advances; terminal
headline: `RELEASE COMPLETE — emergency-bypass`. Closed Status:
`PARTIALLY_VERIFIED`. NEVER `VERIFIED`.

# Fixture: no-provider-dep (UC-FIX-001)

## Scenario

A UC with `actor != SYSTEM` and NO external provider dependency. All
four mandatory stages run and pass. The two optional stages
(`LIVE_PROVIDER_SMOKE`, `PROD_GOLDEN_PATH`) are `NOT_RUN`, which is
permissible because they are not mandatory for this UC trait.

## UC Manifest

```yaml
uc_id: UC-FIX-001
title: "Synthetic UC — actor != SYSTEM, no provider dependency"
actor: user
provider_dependency: false
```

## Per-stage QA result (synthetic)

| Stage | Status | Note |
|---|---|---|
| `COMPONENT_QA` | `VERIFIED` | Component renders. |
| `LOCAL_RUNTIME_QA` | `VERIFIED` | Dev cluster boots; `/api/health` 200. |
| `WIRE_CONTRACT_QA` | `VERIFIED` | Contract test asserts envelope. |
| `PROVIDER_FIXTURE_QA` | `VERIFIED` | Degenerate no-op (no provider declared). Evidence: `n/a — no provider dependency declared`. |
| `LIVE_PROVIDER_SMOKE` | `NOT_RUN` | Not mandatory for this UC trait. |
| `PROD_GOLDEN_PATH` | `NOT_RUN` | Not mandatory for this UC trait. |

## Mandatory stages (per matrix)

For `actor != SYSTEM` + no provider dependency:

- `COMPONENT_QA`
- `LOCAL_RUNTIME_QA`
- `WIRE_CONTRACT_QA`
- `PROVIDER_FIXTURE_QA`

All four are `VERIFIED`. The two `NOT_RUN` stages are optional.

## Expected aggregate

```
aggregate = weakest non-NOT_RUN stage status
          = min(VERIFIED, VERIFIED, VERIFIED, VERIFIED)
          = VERIFIED

mandatory-NOT_RUN floor: none of the four mandatory stages is NOT_RUN
  → floor does NOT fire
```

**Aggregate: `VERIFIED`.**

## Expected `verification_evidence` string

```
qa-stage:component:VERIFIED qa-stage:local-runtime:VERIFIED qa-stage:wire-contract:VERIFIED qa-stage:provider-fixture:VERIFIED qa-stage:live-provider-smoke:NOT_RUN qa-stage:prod-golden-path:NOT_RUN
```

## Why this fixture matters

Demonstrates the baseline pass-path: a UC without a provider dependency
can VERIFIED-ship without any live-deployment evidence. The four
mandatory stages cover the wire and runtime; the two live-deployment
stages are optional.

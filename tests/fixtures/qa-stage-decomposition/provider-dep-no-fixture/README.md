# Fixture: provider-dep-no-fixture (UC-FIX-003)

## Scenario

A UC with `actor != SYSTEM` AND an external provider dependency, but
NEITHER a recorded `PROVIDER_FIXTURE_QA` evidence NOR a live smoke
test. The QA team only ran component, local-runtime, and wire-contract
stages. Both mandatory provider-side stages are `NOT_RUN`.

## UC Manifest

```yaml
uc_id: UC-FIX-003
title: "Synthetic UC — actor != SYSTEM, provider dep, no fixture, no smoke"
actor: user
provider_dependency: true
provider: api.kie.example.invalid
```

## Per-stage QA result (synthetic)

| Stage | Status | Note |
|---|---|---|
| `COMPONENT_QA` | `VERIFIED` | UI surface renders. |
| `LOCAL_RUNTIME_QA` | `VERIFIED` | Dev cluster boots; pre-provider pipeline executes. |
| `WIRE_CONTRACT_QA` | `VERIFIED` | Adapter contract test passes (typed envelope). |
| `PROVIDER_FIXTURE_QA` | `NOT_RUN` | No fixture recorded for api.kie.example.invalid response shape. |
| `LIVE_PROVIDER_SMOKE` | `NOT_RUN` | No live key; no recorded call. |
| `PROD_GOLDEN_PATH` | `NOT_RUN` | Not yet deployed. |

## Mandatory stages (per matrix)

For `actor != SYSTEM` + provider dependency:

- `COMPONENT_QA`
- `LOCAL_RUNTIME_QA`
- `WIRE_CONTRACT_QA`
- `PROVIDER_FIXTURE_QA`  ← **mandatory; `NOT_RUN`**
- `LIVE_PROVIDER_SMOKE`  ← **mandatory; `NOT_RUN`**

## Expected aggregate

```
aggregate = weakest non-NOT_RUN stage status
          = min(VERIFIED, VERIFIED, VERIFIED)
          = VERIFIED

mandatory-NOT_RUN floor: PROVIDER_FIXTURE_QA AND LIVE_PROVIDER_SMOKE
  are both mandatory AND NOT_RUN
  → floor fires; aggregate := UNVERIFIED
```

**Aggregate: `UNVERIFIED`.**

The qa-report explicitly classifies this state as `BLOCKED on
PROVIDER_FIXTURE_QA = NOT_RUN (mandatory)` — the missing fixture is a
durable artifact the project should have produced before QA ran, not a
runtime gap. The release reader surfaces both NOT_RUN entries in the
"QA gap" footer.

## Expected `verification_evidence` string

```
qa-stage:component:VERIFIED qa-stage:local-runtime:VERIFIED qa-stage:wire-contract:VERIFIED qa-stage:provider-fixture:NOT_RUN qa-stage:live-provider-smoke:NOT_RUN qa-stage:prod-golden-path:NOT_RUN
```

## Why this fixture matters

The worst-of-three scenarios. Both provider-side mandatory stages are
absent. Unlike `provider-dep-with-fixture/` (where the fixture
discharges the provider-shape evidence and only live smoke is gated by
a signed exception), here a signed exception would need to name BOTH
`PROVIDER_FIXTURE_QA` and `LIVE_PROVIDER_SMOKE` — and `PROVIDER_FIXTURE_QA`
is much harder to justify skipping (the fixture costs nothing to
record once the adapter exists).

The fixture demonstrates that the matrix correctly distinguishes a
"missing live-call evidence" gap (which a sandboxed environment may
legitimately have) from a "missing provider-shape evidence" gap
(which is almost always a discipline failure).

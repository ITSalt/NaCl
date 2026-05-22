# Fixture: provider-dep-with-fixture (UC-FIX-002)

## Scenario

A UC with `actor != SYSTEM` AND an external provider dependency. The
pre-deployment stages all pass, including a recorded
`PROVIDER_FIXTURE_QA` against the provider's documented envelope. But
`LIVE_PROVIDER_SMOKE` was not run (no live provider key in environment
this run). This is the **project-beta UC-300 provider-skip episode**
shape after W3.

## UC Manifest

```yaml
uc_id: UC-FIX-002
title: "Synthetic UC — actor != SYSTEM, provider dep, fixture present, live smoke skipped"
actor: user
provider_dependency: true
provider: api.kie.example.invalid
```

## Per-stage QA result (synthetic)

| Stage | Status | Note |
|---|---|---|
| `COMPONENT_QA` | `VERIFIED` | UI surface renders. |
| `LOCAL_RUNTIME_QA` | `VERIFIED` | Dev cluster boots; pre-provider pipeline executes (storage, ffmpeg, queue, route). |
| `WIRE_CONTRACT_QA` | `VERIFIED` | Adapter sends Anthropic-shaped envelope; contract test passes. |
| `PROVIDER_FIXTURE_QA` | `VERIFIED` | Recorded api.kie.example.invalid fixture; adapter parses `content[]` array. |
| `LIVE_PROVIDER_SMOKE` | `NOT_RUN` | No `KIE_API_KEY` in environment. |
| `PROD_GOLDEN_PATH` | `NOT_RUN` | Not yet deployed. |

## Mandatory stages (per matrix)

For `actor != SYSTEM` + provider dependency:

- `COMPONENT_QA`
- `LOCAL_RUNTIME_QA`
- `WIRE_CONTRACT_QA`
- `PROVIDER_FIXTURE_QA`
- `LIVE_PROVIDER_SMOKE`  ← **mandatory; this stage is `NOT_RUN`**

`PROD_GOLDEN_PATH` is optional for this UC trait (mandatory only for
release-gate UCs).

## Expected aggregate

```
aggregate = weakest non-NOT_RUN stage status
          = min(VERIFIED, VERIFIED, VERIFIED, VERIFIED)
          = VERIFIED

mandatory-NOT_RUN floor: LIVE_PROVIDER_SMOKE is mandatory AND NOT_RUN
  → floor fires; aggregate := UNVERIFIED
```

**Aggregate: `PARTIALLY_VERIFIED` per-stage view → forced to
`UNVERIFIED` by the mandatory-NOT_RUN floor.**

The result is described as `PARTIALLY_VERIFIED` in the qa-report body
(all four pre-deployment mandatory stages green; one mandatory live
stage skipped) but the aggregate `Status:` line is `UNVERIFIED` until
either:

1. `LIVE_PROVIDER_SMOKE` is executed (a real key is supplied and the
   call succeeds), bringing aggregate to `VERIFIED`; **OR**
2. A W4 signed exception is filed with
   `affected_gates: [LIVE_PROVIDER_SMOKE]` and `owner`, `reason`,
   `expiry` per the schema. With the exception in place the aggregate
   reader treats `LIVE_PROVIDER_SMOKE: NOT_RUN` as covered and the
   aggregate becomes `PARTIALLY_VERIFIED` (release can proceed under
   the documented exception).

## Expected `verification_evidence` string

```
qa-stage:component:VERIFIED qa-stage:local-runtime:VERIFIED qa-stage:wire-contract:VERIFIED qa-stage:provider-fixture:VERIFIED qa-stage:live-provider-smoke:NOT_RUN qa-stage:prod-golden-path:NOT_RUN
```

## Why this fixture matters

Reproduces the project-beta provider-skip episode shape after the W3
decomposition. Before W3, missing `KIE_API_KEY` collapsed the entire
QA dimension to "skipped" → shipped under `QA APPLIED — UNVERIFIED`
non-blocking → 404 on first real call. After W3, the four pre-provider
stages still verify (their evidence is durable), and the missing
`LIVE_PROVIDER_SMOKE` forces aggregate `UNVERIFIED` (release is
refused unless a signed exception is filed).

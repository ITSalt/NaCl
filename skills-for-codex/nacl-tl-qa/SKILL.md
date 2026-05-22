---
name: nacl-tl-qa
description: |
  Run end-to-end QA for NaCl UC tasks through available browser automation,
  screenshots, and acceptance criteria evidence. Use when testing a UC,
  checking user-visible behavior, running QA, or when the user says
  `/nacl-tl-qa`.
---

# NaCl TL QA For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

QA checks behavior, not implementation internals. Read `../nacl-tl-core/SKILL.md`
and task acceptance criteria before testing.

## QA Stage Decomposition (binding)

QA is decomposed into six named stages. Each stage emits its OWN
closed Codex status independently. The aggregate terminal status of
tl-qa equals the WEAKEST non-`NOT_RUN` stage status — `NOT_RUN` on a
mandatory stage forces the aggregate to `UNVERIFIED`.

| Stage | Purpose |
|---|---|
| `COMPONENT_QA` | Per-component / per-unit behavior in isolation (form fields render, validation appears, single-surface state transitions). |
| `LOCAL_RUNTIME_QA` | Dev-server cluster boots and serves routes; pre-provider pipeline executes (storage fetch, ffmpeg, queue transition, route mount). |
| `WIRE_CONTRACT_QA` | The wire envelope matches the api-contract: headers, content-types, body shapes, metadata keys, SSE event names, error envelopes. Recorded request/response or a runnable contract test against the real envelope (NOT a typed mock). |
| `PROVIDER_FIXTURE_QA` | Recorded fixture (or replay tape) exercises the adapter against the provider's documented request/response shape, including failure-code paths. |
| `LIVE_PROVIDER_SMOKE` | Real call against the live provider with a real key returns a parseable response. Distinct from `PROVIDER_FIXTURE_QA`: this stage exercises authentication, rate limits, and the current model namespace. |
| `PROD_GOLDEN_PATH` | The deployed UC, end-to-end, from a real user's browser against the production stack. |

Per-stage status vocabulary is the closed Codex set:
`VERIFIED / PARTIALLY_VERIFIED / FAILED / BLOCKED / NOT_RUN / UNVERIFIED`.

### Aggregate Status Rule

```
aggregate_status = weakest non-NOT_RUN stage status, where the
weakness ordering is:

VERIFIED < PARTIALLY_VERIFIED < UNVERIFIED < FAILED < BLOCKED

(VERIFIED is the strongest; BLOCKED is the weakest non-NOT_RUN value.)

THEN, if ANY mandatory stage (per the UC-type matrix below) is NOT_RUN
AND no signed exception covers it:
  aggregate_status := UNVERIFIED  (forced floor)
```

### Mandatory-stage matrix per UC type

Defaults (overridable per project via `config.yaml` →
`qa_mandatory_stages`):

| UC trait | Mandatory stages |
|---|---|
| `actor == SYSTEM` (background workers, schedulers) | `LOCAL_RUNTIME_QA`, `WIRE_CONTRACT_QA` |
| `actor != SYSTEM`, no provider dependency | `COMPONENT_QA`, `LOCAL_RUNTIME_QA`, `WIRE_CONTRACT_QA`, `PROVIDER_FIXTURE_QA` |
| `actor != SYSTEM`, has provider dependency | `COMPONENT_QA`, `LOCAL_RUNTIME_QA`, `WIRE_CONTRACT_QA`, `PROVIDER_FIXTURE_QA`, `LIVE_PROVIDER_SMOKE` |
| Release-gate UCs | All six |

A UC has a "provider dependency" when its impl-brief or external-contracts
artifact declares an external API call. `PROVIDER_FIXTURE_QA` for a UC
without a provider dependency degenerates to a `VERIFIED` no-op stage with
evidence `n/a — no provider dependency declared`.

### `qa_mandatory_stages` override (config.yaml)

A project may override per-stage mandatoriness in `config.yaml`. The
override sets project defaults — it is NOT a per-run gate bypass. To
bypass a mandatory stage on a single run, file a signed exception per
W4 with `affected_gates` enumerating the specific stage names.

```yaml
qa_mandatory_stages:
  default:
    - LOCAL_RUNTIME_QA
    - WIRE_CONTRACT_QA
  by_uc_trait:
    "actor != SYSTEM":
      - COMPONENT_QA
      - LOCAL_RUNTIME_QA
      - WIRE_CONTRACT_QA
      - PROVIDER_FIXTURE_QA
    "provider_dependency":
      - LIVE_PROVIDER_SMOKE
  per_uc:
    UC-300:
      - LIVE_PROVIDER_SMOKE
      - PROD_GOLDEN_PATH
```

### Worked example — project-beta provider-skip episode

Before (project-beta-postmortem § 3.3, § 3.8): `KIE_API_KEY` absent →
entire QA dimension marked skipped → shipped under non-blocking
`UNVERIFIED` → 404 on first real call in prod.

After (this skill, post-W3): the six stages evaluate independently.
`WIRE_CONTRACT_QA: VERIFIED` and `PROVIDER_FIXTURE_QA: VERIFIED`
(recorded fixture against the Anthropic-shaped kie.ai envelope) still
fire; only `LIVE_PROVIDER_SMOKE: NOT_RUN`. For a provider-dep UC that
stage is mandatory, so aggregate is `UNVERIFIED` (not `VERIFIED`).
Release is refused unless a signed exception covering
`LIVE_PROVIDER_SMOKE` is filed. The pre-provider pipeline is no longer
hidden behind the provider-key gate.

### `--skip-e2e` flag (single preserved skip flag)

`tl-qa` exposes exactly one operator flag for stage selection:

```
/nacl-tl-qa UC### --skip-e2e
```

**Scope:** `--skip-e2e` marks the `LIVE_PROVIDER_SMOKE` and
`PROD_GOLDEN_PATH` stages as `NOT_RUN` for this run only. It does NOT
mark any other stage as `NOT_RUN`. It is NOT a bulk QA bypass.

- If neither stage is mandatory for the UC, `--skip-e2e` may leave
  aggregate `VERIFIED`.
- If either stage is mandatory (per the matrix or project override),
  `--skip-e2e` produces aggregate `UNVERIFIED`. The user must either
  run the stage or file a W4 signed exception with
  `affected_gates: [LIVE_PROVIDER_SMOKE]` (and/or `PROD_GOLDEN_PATH`)
  — no blanket overrides.
- **The bulk-QA-skip flag was removed across the skill family in
  W3.** It is no longer accepted by any skill. Bulk-bypass needs are
  handled by W4 emergency mode.

## Workflow

1. Resolve UC task ID, frontend URL, backend URL, credentials, and report paths.
2. Check task readiness from sync and stub evidence.
3. Determine the UC trait (`actor`, `provider_dependency`) and compute the mandatory-stage set from the matrix + any project `qa_mandatory_stages` override.
4. For each of the six stages: run when in scope, capture per-stage evidence, and emit a closed-set status.
5. Compute the aggregate per the Aggregate Status Rule (weakest non-NOT_RUN, then mandatory-NOT_RUN floor).
6. Write per-stage statuses and the aggregate to `qa-report.md` and to `phases.qa_stages` / `phases.qa_aggregate_status` in the task tracking file when file editing is available and confirmed.

## Source-Parity Requirements

- QA is a user-visible behavior gate, separate from code review and code
  verification.
- Run browser/server checks only when the required app, credentials, routes,
  data, and tooling are available. Missing infrastructure is `Status: BLOCKED`
  or `Status: NOT_RUN`, not a pass.
- Evidence must include the executed scenario, observed result, and any
  screenshot, log, or trace available from the tooling.
- Acceptance criteria that are not exercised must be listed as unverified.
- Tracker, graph, and report writes require confirmation and read-back.

## Capabilities

### May Do

- Read UC task files and acceptance criteria.
- Use available browser automation to test user workflows.
- Capture screenshots or equivalent evidence.
- Produce QA reports and update TL tracking files.
- Identify non-testable criteria separately from failing behavior.

### Must Not Do

- Review source code as a substitute for user-visible QA.
- Claim QA verification without executed scenarios and evidence.
- Delete existing evidence without confirming replacement behavior.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Browser testing requires available browser automation tooling.
- Server checks require reachable configured URLs.
- Screenshot and report writes require writable paths.
- Task tracker or graph updates require available tooling and confirmation.

### Blocked Or Unverified Reporting

Per-stage status discipline (applies to each of the six stages
independently):

- Use `BLOCKED` when a stage's pre-conditions cannot be satisfied
  (servers unreachable for `LOCAL_RUNTIME_QA`, missing credentials,
  browser tooling absent, confirmation missing).
- Use `FAILED` when a stage's testable assertion does not hold.
- Use `PARTIALLY_VERIFIED` when a stage ran on a subset of its scope
  and the unran subset is enumerated in the report.
- Use `NOT_RUN` for a stage that was not executed in this run
  (including stages skipped by `--skip-e2e` and stages outside the
  mandatory matrix for this UC).
- Use `UNVERIFIED` when a stage ran but the evidence is ambiguous
  (screenshot missing, tool returned no parseable result).

Aggregate-status reporting follows the Aggregate Status Rule above.
`NOT_RUN` on a mandatory stage forces aggregate `UNVERIFIED` — it is
NOT `VERIFIED`. The only override path is a W4 signed exception with
`affected_gates` naming the specific stage(s).

## Source Comparison

- Source Claude skill path: `../../nacl-tl-qa/SKILL.md`

### Preserved Methodology

- Acceptance-criteria-driven E2E QA.
- Real user perspective through browser automation.
- Screenshot-backed evidence.
- QA report and tracking updates.

### Removed Claude Mechanics

- Guaranteed runtime-specific browser tool names.
- Source headline vocabulary outside the closed status set.
- Hardcoded report decorations.
- Model routing fields.

### Codex Replacement Behavior

- Use browser automation only when available.
- Treat missing infrastructure as `BLOCKED`.
- Report partial scenario coverage explicitly.
- Keep QA separate from code review.

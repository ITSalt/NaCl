# UC-300 — Generate protocol via api.kie.example.invalid LLM

**Wave:** 3
**Module:** MOD-PROTOCOL
**Actor:** analyst (user-initiated protocol generation)  — `actor != SYSTEM`
**UC traits:** async-provider, recoverable

## Source

Reconstructed from project-beta-postmortem.md § 3.3 ("UC-300 api.kie.example.invalid
endpoint shape — SPEC MISSING") and commit `1f025b7 fix(UC-300):
switch api.kie.example.invalid client to Anthropic /claude/v1/messages`.

## TS-type alignment (current state)

Both BE and FE import `ILlmProvider` and `LlmResult` from `shared/`.
`nacl-tl-sync` Category 1–6 type-alignment passes.

## Wire-evidence (POST-W2 requirement)

**None present.** Files that would satisfy the W2 gate:

- `tests/fixtures/wire-evidence/kieai-protocol.json` (recorded response shape) — ABSENT
- `tests/integration/kieai-contract.test.ts` (runnable round-trip) — ABSENT
- `.tl/qa-smoke/kieai-LIVE-SMOKE-<timestamp>.json` — ABSENT

Because UC-300 declares `actor: analyst` (`actor != SYSTEM`), the
post-W2 sync gate emits:

```
Status: UNVERIFIED
workflow_detail: wire-evidence-missing
```

## QA decomposition (post-W3)

| Stage | Pre-W3 | Post-W3 |
|---|---|---|
| COMPONENT_QA | — | VERIFIED |
| LOCAL_RUNTIME_QA | — | VERIFIED |
| WIRE_CONTRACT_QA | "type-aligned mock = QA" | NOT_RUN (no contract test) |
| PROVIDER_FIXTURE_QA | — | NOT_RUN (no recorded fixture) |
| LIVE_PROVIDER_SMOKE | "skipped because no KIE_API_KEY in test env" | NOT_RUN (mandatory; floor forces aggregate UNVERIFIED) |
| PROD_GOLDEN_PATH | "skipped" | NOT_RUN (mandatory for actor != SYSTEM) |
| **Aggregate** | **PASS-equivalent ("QA APPLIED — UNVERIFIED" non-blocking)** | **UNVERIFIED** |

## Expected W11-pilot fire points

- W2 `nacl-tl-sync` → `UNVERIFIED (wire-evidence missing)` for UC-300
- W3 `nacl-tl-qa` → aggregate `UNVERIFIED` (mandatory-NOT_RUN floor)
- W4 `nacl-tl-release` → `BLOCKED (upstream-sync-unverified)` AND `BLOCKED (upstream-qa-unverified)`

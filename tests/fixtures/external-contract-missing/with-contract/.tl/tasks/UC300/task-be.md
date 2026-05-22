---
uc_id: UC300
title: Generate protocol via api.kie.example.invalid LLM
type: uc-be
external_contracts:
  - ext-kie       # api.kie.example.invalid (provider) — REQUIRES_EXTERNAL edge in SA graph
depends_on:
  - TECH-001
blocks:
  - UC300-FE
---

# UC-300 BE — Generate protocol via api.kie.example.invalid LLM

## Actor

`SystemRole: WorkerService` (no human actor; this is a backend pipeline UC).

## External dependency

This UC calls a `kind: provider` external surface — `api.kie.example.invalid` — to
synthesize a protocol document from the prepared session transcript.

**External contract reference:** `.tl/external-contracts/kie.md`
(`ExternalContract.id = "ext-kie"`).

The contract enumerates: endpoint URL with version path, Anthropic-shape
request and response envelopes (note `response.content[0].text`, NOT
`response.choices[0].message.content`), sync lifecycle for the LLM call,
no file URLs, the failure-code consumer matrix, the model namespace
policy (no `google/` prefix), the fixture-test path
(`tests/wire/kie-ai.fixture.test.ts`), and the smoke-test path
(`tests/smoke/kie-ai.smoke.test.ts`).

## Main flow

1. Worker dequeues a `protocol_generation` job carrying the prepared
   transcript and the chosen model id.
2. Worker constructs the Anthropic-shape request per § 4 of the contract.
3. Worker calls `POST /api/v1/messages` per § 2.
4. Worker parses `response.content[0].text` per § 5.
5. Worker stores the resulting protocol body keyed by job id.

## Acceptance

- The model id passed to api.kie.example.invalid is verbatim from the catalog in § 9 of
  the contract (no `google/` prefix).
- The response parser extracts text via `content[0].text`, not via the
  OpenAI-shape accessor.
- The failure-code matrix from § 8 of the contract is honored.
- Wire-evidence per W2 is satisfied by the fixture test referenced in
  § 10 of the contract (`tests/wire/kie-ai.fixture.test.ts`).

## Notes

This file is a fixture for the W6 External Contracts Gate. It is not a
real production task — it exists to demonstrate to `nacl-tl-plan` that
UC-300 has a declared external dependency on `ext-kie`, and that the
contract file referenced by `ExternalContract.file_path` is present and
complete in this fixture's `.tl/external-contracts/` directory.

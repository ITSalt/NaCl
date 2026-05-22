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

In this fixture, the contract file is **absent on disk**. The
`nacl-tl-plan` External Contracts Gate (Step 1.6) MUST refuse to
generate this task and MUST emit `Status: BLOCKED` workflow detail
`external-contract-missing` per the W6 plan brief.

## Main flow

(Identical to the sibling `with-contract/` fixture's task spec —
this fixture demonstrates the gate refusal path, not a different UC.)

## Notes

This file is a fixture for the W6 External Contracts Gate. The single
difference from the sibling `with-contract/` fixture is the absence of
`.tl/external-contracts/kie.md`. That delta drives the verdict
difference (BLOCKED here vs VERIFIED in the sibling).

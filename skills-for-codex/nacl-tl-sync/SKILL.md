---
name: nacl-tl-sync
description: |
  Verify backend and frontend synchronization for a NaCl UC task against the API
  contract, shared types, endpoint usage, errors, and mock removal. Use when
  checking BE/FE alignment, API contract compliance, or when the user says
  `/nacl-tl-sync`.
---

# NaCl TL Sync For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Sync verification compares both sides to the API contract. Read
`../nacl-tl-core/SKILL.md` and the task `api-contract.md` first.

## Workflow

1. Resolve UC task, backend and frontend paths, API contract, result files, and
   current phase state.
2. Check prerequisites for approved backend and frontend implementation.
3. Compare endpoints, methods, request bodies, response shapes, auth, errors,
   shared types, and mock remnants. This dimension is **type-alignment**.
4. Run configured backend and frontend tests when available.
5. Check endpoint test coverage for changed endpoints.
6. **Run the wire-evidence gate** for any UC whose `actor != SYSTEM` (see
   "Wire-Evidence Gate" below). If the gate refuses, emit
   `Status: UNVERIFIED` with workflow detail `wire-evidence-missing` or
   `wire-evidence-stale` and stop short of VERIFIED.
7. Write sync report and update tracking files when file editing is available
   and confirmed.

## Wire-Evidence Gate

Sync verification has two named evidence dimensions, and the two are not
interchangeable:

| Dimension | What it proves | Sufficient for VERIFIED? |
|---|---|---|
| **type-alignment** | BE DTO and FE consumer agree on field names, optionality, and TS types at compile time. Endpoint, request DTO, response DTO, error handling, auth, shared types, mock elimination. | No — necessary but not sufficient when `actor != SYSTEM`. |
| **wire-evidence** | A *runnable* artifact exercises the actual wire format end-to-end: byte-on-the-wire request, byte-on-the-wire response, real header set, real status code, real envelope. | Yes — required for VERIFIED when `actor != SYSTEM`. |

This gate is strict-only — strict is the single, unconditional mode for
this gate. There is no fallback branch, no per-project opt-out, and no
inline operator-prompt override. The only override path is a signed
exception under the schema defined by W4.

Recognised wire-evidence shapes (evidence string written to
`Task.verification_evidence`):

- `wire-evidence:fixture:<path>` — runnable test that loads a recorded
  response fixture (HTTP body, headers, status) and asserts BE/FE code
  parses/produces it without mocking.
- `wire-evidence:contract-test:<path>` — runnable contract test against
  the live provider in a sandboxed environment (provider sandbox
  endpoint or provider-supplied mock; not an in-repo mock).
- `wire-evidence:live-smoke:<timestamp>` — captured request/response/
  status of a live call to the real provider, with the ISO-8601
  capture timestamp.

Gate outcomes:

- `actor == SYSTEM` — wire-evidence is not required; report
  `wire-evidence: n/a (actor=SYSTEM)` and proceed.
- `actor != SYSTEM` AND ≥1 recognised wire-evidence shape is present
  and runnable — record the evidence string(s) and proceed to VERIFIED
  if all other gates pass.
- `actor != SYSTEM` AND no wire-evidence shape present — emit
  `Status: UNVERIFIED` with workflow detail `wire-evidence-missing`.
  Type-alignment passing does not promote this to VERIFIED.
- `actor != SYSTEM` AND a referenced wire-evidence artifact does not
  exist on disk OR does not run cleanly — emit `Status: UNVERIFIED`
  with workflow detail `wire-evidence-stale`.

**VERIFIED requires wire-evidence for `actor != SYSTEM`; override via
signed exception only.** Strict is the single, unconditional mode for
this gate. Every project moves through it the same way; there is no
fallback branch and no inline override.

### Worked examples (from the W0 baseline)

**Project-Alpha FE-sync UNVERIFIED-normalization episode.** Wave 5 closed
with all six FE sync verdicts normalized to UNVERIFIED because FE
tests relied on MSW (`setupServer(`) rather than wire-level parity.
MSW interception is not wire-evidence: the request never leaves the
FE. Under the new gate: `Status: UNVERIFIED` with workflow detail
`wire-evidence-missing`. To advance to VERIFIED the UC must add a
`wire-evidence:fixture:<path>` test that loads a recorded BE
response and asserts the FE parses it, OR a
`wire-evidence:contract-test:<path>` against a real BE process — not
in-process MSW.

**Project-Beta kie.ai `404 model not found` episode.** UC-300: BE and
FE TS types matched, `vi.mock(...)` unit tests passed, sync emitted
PASS. The live request to `kie.ai` returned `HTTP 404 model not
found` on the first prod call because the endpoint shape was
Anthropic-flavored (not OpenAI-flavored) and the model namespace was
wrong. No `wire-evidence:*` was recorded for UC-300 (`actor =
LLM_PROVIDER ≠ SYSTEM`). Under the new gate: `Status: UNVERIFIED`
with workflow detail `wire-evidence-missing`. Closing the gap
requires a recorded fixture
(`wire-evidence:fixture:tests/fixtures/kie-ai/protocol-response.json`)
or a sandboxed live call
(`wire-evidence:live-smoke:2026-05-19T22:28:00Z`).

W6 will provide the per-provider `external-contracts.md` artifact;
tl-sync only requires the existence of some wire-evidence shape —
fixture, contract test, or live smoke.

The evidence taxonomy entry is in
`../references/verification-evidence.md`.

## Source-Parity Requirements

- Preserve source categories: endpoint compliance, request DTOs, response DTOs,
  error handling, authentication, shared types, mock elimination, and
  WebSocket/SSE events when applicable. Collectively these are the
  **type-alignment** dimension.
- Runtime verification must discover BE and FE `scripts.test` commands from
  their nearest `package.json` files. Missing or broken runners are details
  under the closed top-level status.
- Mock usage in FE tests and production code must be checked separately; mocks
  are not acceptable evidence for BE/FE synchronization, and they are not
  acceptable wire-evidence under the Wire-Evidence Gate.
- Wire-evidence is a separate, named dimension from type-alignment. For any
  UC with `actor != SYSTEM`, VERIFIED requires at least one
  `wire-evidence:fixture:<path>`, `wire-evidence:contract-test:<path>`, or
  `wire-evidence:live-smoke:<timestamp>` artifact present and runnable.
- Result files and API contracts are required inputs. Missing files report
  `Status: BLOCKED`, not success.
- Report/tracking writes require confirmation and read-back.

## Capabilities

### May Do

- Read API contract and implementation files.
- Compare backend implementations and frontend consumers.
- Run configured test suites.
- Find mocks, duplicated types, and contract drift.
- Produce sync reports and update TL tracking when confirmed.

### Must Not Do

- Treat static comparison (type-alignment) alone as complete verification
  for any UC with `actor != SYSTEM`. Wire-evidence is required.
- Treat an in-repo mock (jest/vi mock, MSW `setupServer`, hand-rolled
  mockApi module) as wire-evidence — those artefacts never exercise the
  real envelope.
- Modify implementation code.
- Ignore missing API contract files.
- Modify root-level source skill folders.
- Select or constrain the runtime model.
- Apply any inline operator-prompt override to the Wire-Evidence Gate.
  The only override is a signed exception under the W4 schema.

### Conditional Tools And Actions

- File reads require workspace access.
- Test execution requires configured commands and dependencies.
- Report and tracking writes require writable workspace access and confirmation.
- Graph or tracker updates require available tooling and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task files, API contract, code paths, tests, or
  confirmation are missing.
- Use `FAILED` when BE/FE contract mismatch or test failure is found.
- Use `PARTIALLY_VERIFIED` when static checks pass but runtime checks cannot run,
  or the reverse.
- Use `NOT_RUN` for checks outside requested scope.
- Use `UNVERIFIED` when required behavior cannot be established. This
  includes the Wire-Evidence Gate outcomes: `wire-evidence-missing`
  (no recognised wire-evidence shape recorded for an `actor != SYSTEM`
  UC) and `wire-evidence-stale` (referenced artifact does not exist or
  does not run).

## Source Comparison

- Source Claude skill path: `../../nacl-tl-sync/SKILL.md`

### Preserved Methodology

- API contract as source of truth.
- BE and FE endpoint, DTO, error, auth, and shared-type comparison
  (the type-alignment dimension).
- Mock-remnant checks.
- Sync report and phase tracking.

### Added For Codex Flavor

- Wire-Evidence Gate as a strict-only, named dimension separate from
  type-alignment. VERIFIED requires wire-evidence for `actor != SYSTEM`;
  override via signed exception only.

### Removed Claude Mechanics

- Source headline vocabulary outside the closed status set.
- Guaranteed test runner and tracker availability.
- Runtime-specific report status wording.
- Model routing fields.

### Codex Replacement Behavior

- Treat tests, graph, and trackers as conditional.
- Keep implementation changes outside sync verification.
- Report partial static or runtime evidence explicitly.
- Use the closed verification vocabulary.

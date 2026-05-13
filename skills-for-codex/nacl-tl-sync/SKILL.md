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
   shared types, and mock remnants.
4. Run configured backend and frontend tests when available.
5. Check endpoint test coverage for changed endpoints.
6. Write sync report and update tracking files when file editing is available
   and confirmed.

## Source-Parity Requirements

- Preserve source categories: endpoint compliance, request DTOs, response DTOs,
  error handling, authentication, shared types, mock elimination, and
  WebSocket/SSE events when applicable.
- Runtime verification must discover BE and FE `scripts.test` commands from
  their nearest `package.json` files. Missing or broken runners are details
  under the closed top-level status.
- Mock usage in FE tests and production code must be checked separately; mocks
  are not acceptable evidence for BE/FE synchronization.
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

- Treat static comparison alone as complete verification when runtime tests are
  required by the contract.
- Modify implementation code.
- Ignore missing API contract files.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

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
- Use `UNVERIFIED` when required behavior cannot be established.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-sync/SKILL.md`

### Preserved Methodology

- API contract as source of truth.
- BE and FE endpoint, DTO, error, auth, and shared-type comparison.
- Mock-remnant checks.
- Sync report and phase tracking.

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

---
id: UC-020-BE
uc: UC-020
title: "Live-update — server WS/PUT origin contract"
type: uc-be
wave: 3
agent: nacl-tl-dev-be
feature_request: FR-002
priority: high
status: pending
depends_on: []
blocks: [UC-020-FE]
---

# UC-020-BE — Live-update: server WS/PUT origin contract

## User Story

As an analyst editing a board, when that board is changed outside my canvas —
by a skill, an out-of-band PUT, or another client — I want to be notified over
the existing WebSocket so I can decide whether to reload, without the server
silently suppressing the event because of a global write-marker collision.

## Actor

**SR-ANALYST** (single human operator; local). Also affects any API consumer
(skill runner, CI) that performs out-of-band PUTs.

## Preconditions

- The analyst-tool server is running with the fs-watcher active.
- A WebSocket client is subscribed to `board:<name>`.
- `services/self-writes.ts` exists and exports `markSelfWrite` / `isRecentSelfWrite`.

## Postconditions

- Every write to a board file (regardless of origin) produces a `board.changed`
  event on `board:<boardName>` carrying `{ board, mtime, originId }`.
- The global 2 s `isRecentSelfWrite` gate in the fs-watcher handler is removed.
  Suppression is now the responsibility of each connected client.
- PUT `/boards/:name` accepts an optional `originId` body field and propagates
  it through `writeBoard` → fs-watcher broadcast.
- The `board.changed` payload NEVER includes the scene.

## Root Cause (must be fixed)

`writeBoard()` in `server/src/services/boards.ts` (line ~219) calls
`markSelfWrite(name)` after every write, including out-of-band PUTs. The
fs-watcher handler in `server/src/index.ts` (lines ~139-157) calls
`isRecentSelfWrite(name)` and returns early (no broadcast) if the marker is
set. Because the marker is **global per board name** (not per client), any PUT
— regardless of which client issued it — suppresses the notification for ALL
subscribers for 2 seconds. Out-of-band PUTs therefore never produce a
`board.changed` event.

The fix: remove the `isRecentSelfWrite` gate from the fs-watcher handler.
Propagate `originId` from the PUT request through `writeBoard` and into the
broadcast payload. Each client suppresses its own echo using the `originId`
it sent on `subscribe`.

## Main Flow (server-side)

| # | Step | Source file |
|---|------|-------------|
| 1 | PUT `/boards/:name` route receives `{ content, originId? }` in body. | `server/src/routes/boards.ts` |
| 2 | Route calls `writeBoard(name, content, { originId })`. | `server/src/services/boards.ts` |
| 3 | `writeBoard` writes the file to disk. It **no longer** calls `markSelfWrite`. Instead it stores `originId` in a short-lived map keyed by board name (or passes it via an event emitter / callback, see impl-brief.md). | `server/src/services/boards.ts` |
| 4 | The fs-watcher in `index.ts` fires on the file change. It reads the stored `originId` for the board (if any) and clears it. | `server/src/index.ts:~139-157` |
| 5 | The handler broadcasts `board.changed` on `board:<name>` to ALL subscribers with payload `{ board: name, mtime: <ms>, originId: originId \| null }`. **No `isRecentSelfWrite` gate.** | `server/src/index.ts`, `server/src/ws/events.ts` |
| 6 | The handler also broadcasts `tree.changed` on `boards` (existing behaviour, unchanged). | `server/src/index.ts` |

## Requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| REQ-UC020-01 | Functional | Must | Every external write to a board file MUST produce a `board.changed` notification to all subscribed clients except the originator. Out-of-band PUTs, skill regenerations, and other clients' saves all count as "external" relative to a given client. |
| REQ-UC020-02 | Contract | Must | The PUT `/boards/:name` contract carries an optional `originId` body field. The server tags the resulting `board.changed` with that `originId`; only the matching client suppresses. The global `markSelfWrite`/`isRecentSelfWrite` suppression is removed. |
| REQ-UC020-04 | Non-functional | Must | The `board.changed` payload is metadata only: `{ board: string, mtime: number, originId: string \| null }`. The full scene is never included. |
| REQ-UC002-03 | Contract (UC-002 delta) | Must | PUT `/boards/:name` accepts `originId` as an optional body field (additive, backwards-compatible). Absent `originId` → treated as external → all clients notified. This is the contract delta for the existing board-save use case (UC-002). |

## Authorization

Unchanged. `SR-ANALYST` (local; no real auth).

## Acceptance Criteria

See `acceptance.md`. Key items for the BE half:

- An out-of-band PUT not carrying a connected client's `originId` produces a `board.changed` on `board:X` that reaches all subscribed clients.
- The `board.changed` payload contains `{ board, mtime, originId }` and nothing else.
- The global `isRecentSelfWrite` gate is absent from the fs-watcher code path.
- Absent `originId` in PUT → `originId: null` in `board.changed` → all clients notified.

## Implementation Pointer

See `impl-brief.md` for the step-by-step. Key files:

| File | Change |
|------|--------|
| `server/src/services/self-writes.ts` | Remove `markSelfWrite` call from `writeBoard` (or neutralize the export so the fs-watcher gate cannot be hit). |
| `server/src/services/boards.ts` | `writeBoard` signature gains `originId?: string`; stores it in a pending-origin map instead of calling `markSelfWrite`. |
| `server/src/routes/boards.ts` | Extract `originId` from request body; pass to `writeBoard`. |
| `server/src/index.ts:~139-157` | Remove `isRecentSelfWrite` guard; read pending `originId`; broadcast with it. |
| `server/src/ws/events.ts` | `board.changed` payload type includes `originId: string \| null`. |
| `server/src/services/boards.test.ts` | Regression + new tests per `test-spec.md`. |

## Notes

- `services/self-writes.ts` may be left in place (exported functions kept for any
  other callers) but the `markSelfWrite` call inside `writeBoard` is removed. Do
  not delete the file without checking for other callers first.
- The `originId` pending-map should have a short TTL (e.g. 3 s) and be keyed by
  board name. The fs-watcher typically fires within milliseconds of the write, so
  the TTL is only a safety net.
- Do NOT change the WebSocket broadcast logic in a way that requires the server
  to track per-client `originId` server-side — the client does its own suppression.
  The server only echoes the `originId` back in the payload.

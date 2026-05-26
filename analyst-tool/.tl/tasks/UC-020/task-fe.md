---
id: UC-020-FE
uc: UC-020
title: "Live-update — consent banner + sidebar indicator + originId"
type: uc-fe
wave: 4
agent: nacl-tl-dev-fe
feature_request: FR-002
priority: high
status: pending
depends_on: [UC-020-BE]
blocks: []
---

# UC-020-FE — Live-update: consent banner + sidebar indicator + originId

## User Story

As an analyst editing a board, when I receive a `board.changed` notification
for the board I have open, I want to see a non-destructive banner asking whether
to reload — not a silent replacement of my canvas — so I never silently lose
in-progress edits. When another board changes, I want to see a "changed"
indicator on its sidebar row so I can decide to open and reload it at my
convenience.

## Actor

**SR-ANALYST** (single human operator; local).

## Preconditions

- UC-020-BE merged: every external write produces a `board.changed` on
  `board:<name>` with payload `{ board, mtime, originId }`.
- The frontend has access to the existing WebSocket connection.

## Postconditions

- A stable per-client `originId` (UUID) is generated at app startup and sent
  on every WS `subscribe` message and every PUT body.
- When `board.changed` arrives for the currently-open board and `originId`
  does NOT match the client's own token, a non-destructive `CMP-BOARD-CHANGED-BANNER`
  is shown over the canvas. Canvas content is NOT replaced.
- When `board.changed` arrives for a non-open board (or `tree.changed` arrives),
  the affected board's sidebar row shows a "changed" indicator. No scene is fetched.
- On user consent (click "Reload"): the canvas is replaced via `GET /boards/:name`
  → CanvasHost remount. The banner is dismissed.
- On user ignore (click "Dismiss" or close banner): the banner disappears, local
  edits are preserved, nothing is fetched.
- When `board.changed` arrives and `originId` matches the client's own token,
  the event is silently suppressed — no banner, no indicator.

## User Interactions

| # | Step ID | User action | System response | UI element |
|---|---------|------------|-----------------|------------|
| 1 | (passive) | External write changes the open board | `board.changed` arrives over WS; consent banner appears over canvas | `CMP-BOARD-CHANGED-BANNER` |
| 2 | UC020-FE-02 | User clicks "Reload" in the banner | Client GETs `/boards/:name`; CanvasHost remounts with new scene; banner dismissed | `CMP-BOARD-CHANGED-BANNER`, `CanvasHost.tsx` |
| 3 | UC020-FE-03 | User clicks "Dismiss" (or ignores) in the banner | Banner dismissed; local edits preserved; no fetch | `CMP-BOARD-CHANGED-BANNER` |
| 4 | (passive) | External write changes a non-open board | Sidebar row for that board shows a "changed" indicator (dot or badge) | `Sidebar.tsx` per-row indicator |
| 5 | UC020-FE-05 | User clicks a sidebar row that has the "changed" indicator | Board is opened; indicator cleared; CanvasHost mounts with the fetched scene (normal open flow) | `Sidebar.tsx`, `CanvasHost.tsx` |
| 6 | UC020-FE-06 | Client sends PUT for its own canvas save | PUT body includes `originId`; resulting `board.changed` is silently suppressed on this client | `api/client.ts`, `state/store.ts` |

## Forms

No new forms. The consent banner has two actions: "Reload" and "Dismiss".

## Domain Context

No new domain entity. `originId` is a runtime session token, not persisted to
Neo4j. The sidebar "changed" indicator is a transient UI state derived from
incoming WS events.

## Requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| REQ-UC020-03 | Functional | Must | A `board.changed` for the currently-open board MUST NOT silently replace canvas content. The client shows a non-destructive banner; reload happens only on explicit user action. Unsaved local edits are never discarded without consent. |
| REQ-UC020-05 | Functional | Must | For boards not currently open, a `board.changed`/`tree.changed` marks the board's sidebar row with a "changed" indicator; the full board is fetched only when the analyst opens it. |
| REQ-UC020-06 | Non-functional | Must | Change detection is push-based over the existing WebSocket; the client MUST NOT introduce periodic polling for board freshness. |
| REQ-UC020-02 (client half) | Contract | Must | The client generates a stable per-session `originId` (UUID). It sends this token on WS `subscribe` messages and in PUT `/boards/:name` body. It suppresses `board.changed` events whose `originId` matches its own token. |

## WS / PUT Contract Reference

Full contract is in `api-contract.md` (same directory). Key points:

- `board.changed` payload: `{ board: string, mtime: number, originId: string | null }`.
- PUT body: `{ content: string, originId?: string }`.
- WS subscribe: `{ type: 'subscribe', channel: string, originId?: string }`.
- Suppression: client suppresses when `event.originId === ownOriginId`.
- Scene: never in the WS payload; fetched via `GET /boards/:name` on consent.

## Authorization

Unchanged. `SR-ANALYST` (local).

## Acceptance Criteria

See `acceptance.md`. Key items for the FE half:

- `board.changed` for open board → banner shown; canvas NOT replaced.
- Banner "Reload" → GET scene → remount.
- Banner "Dismiss" → local edits preserved; nothing fetched.
- Non-open board changed → sidebar indicator shown; no fetch.
- Client's own write → `originId` match → banner suppressed.
- No `setInterval` / `setTimeout` polling introduced anywhere.

## Implementation Pointer

See `impl-brief-fe.md` for the step-by-step. Key files:

| File | Change |
|------|--------|
| `web/src/api/ws.ts` | Generate module-level `originId`; include in every `subscribe` message. |
| `web/src/api/client.ts` | Thread `originId` in PUT body. |
| `web/src/state/store.ts` | `applyBoardChange` no longer force-remounts; introduces `pendingBoardChange` consent state. |
| `web/src/App.tsx:~105-127` | Route `board.changed` to consent banner instead of silent reload. |
| `web/src/components/CanvasHost.tsx` | Reload/remount only on explicit consent; no auto-remount on `board.changed`. |
| `web/src/components/Sidebar.tsx` | Per-row "changed" indicator; cleared on open. |
| `web/src/components/BoardChangedBanner.tsx` | NEW — `CMP-BOARD-CHANGED-BANNER` consent UI over canvas. |

## Notes

- The banner is displayed as an overlay above the Excalidraw canvas — use an
  absolutely-positioned `div` with a high `z-index`, not a modal that blocks the
  whole UI. The analyst should still be able to read their edits while deciding.
- Russian UI copy is acceptable for user-facing text (per project conventions).
  Suggested: "Изменено на сервере — Перезагрузить?" with buttons "Перезагрузить"
  and "Закрыть".
- The sidebar "changed" indicator must be cleared when the board is opened
  (regardless of whether the user clicks "Reload" or not — opening the board
  and seeing the fresh scene is the natural resolution).
- Do not introduce a new CSS file if there is an existing sidebar stylesheet
  already in scope — extend it in place.

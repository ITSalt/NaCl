---
id: UC-020
title: "Acceptance criteria — Live-update notification on external board change (FR-002)"
feature_request: FR-002
---

# UC-020 — Acceptance Criteria

## Pre-existing behaviour that must not regress

- Given the PUT `/boards/:name` endpoint exists without `originId`, when a
  client saves a board with the old request shape `{ content: string }`, then
  the board is saved successfully (200 OK) and the `board.changed` event is
  emitted with `originId: null`.
- Given a WS client subscribes without sending `originId`, the connection is
  accepted and the client receives `board.changed` events as normal.
- Given no external write occurs, no `board.changed` event is emitted.

---

## UC-020 Acceptance Criteria

### AC-UC020-01 — External write notifies all subscribers (REQ-UC020-01)

| Given | When | Then |
|-------|------|------|
| An out-of-band PUT `/boards/X` is made that does NOT carry the `originId` of any connected client (or carries no `originId` at all), and at least one WS client is subscribed to `board:X`. | The file change is detected by the fs-watcher. | Every subscribed client receives a `board.changed` message on channel `board:X`. The global `isRecentSelfWrite` gate does NOT suppress this event. |

### AC-UC020-02 — Per-origin echo suppression via `originId` (REQ-UC020-02)

| Given | When | Then |
|-------|------|------|
| Client A subscribed to `board:X` with `originId: 'tok-A'`, and Client B subscribed with `originId: 'tok-B'`. Client A performs PUT `/boards/X` with body `{ content: '...', originId: 'tok-A' }`. | The `board.changed` event is emitted carrying `originId: 'tok-A'`. | Client A detects that `originId === ownOriginId` and suppresses the notification (no banner shown). Client B receives the notification normally (banner or sidebar indicator as appropriate). |

### AC-UC020-03 — Consent-gated reload — no silent data loss (REQ-UC020-03)

| Given | When | Then |
|-------|------|------|
| Client has board X open in the canvas with unsaved local edits. An external write changes board X. The `board.changed` event arrives with an `originId` that does not match the client's own token. | The `board.changed` message is processed. | A non-destructive consent banner (`CMP-BOARD-CHANGED-BANNER`) is displayed over the canvas. The canvas content is NOT replaced. Unsaved local edits are preserved. The full scene is NOT fetched. |
| (continuation) The user clicks "Reload" in the banner. | The banner "Reload" action fires. | The client performs `GET /boards/X`; the canvas remounts with the fetched scene; the banner is dismissed. |
| (continuation) The user clicks "Dismiss" in the banner. | The banner "Dismiss" action fires. | The banner is dismissed. No `GET` is performed. Local edits are preserved. |

### AC-UC020-04 — Notify-only payload — no scene in event (REQ-UC020-04)

| Given | When | Then |
|-------|------|------|
| Any board write occurs and triggers a `board.changed` event. | A subscribed client receives the event. | The payload contains exactly `{ board: string, mtime: number, originId: string \| null }`. No `content`, `elements`, `appState`, or any other scene property is present. The full scene is fetched via `GET /boards/:name` only on explicit user consent. |

### AC-UC020-05 — Sidebar changed indicator for non-open boards (REQ-UC020-05)

| Given | When | Then |
|-------|------|------|
| Board Y is NOT the currently-open board. An external write changes board Y (triggering a `board.changed` or `tree.changed` event for board Y). | The event is received by the client. | Board Y's sidebar row shows a "changed" indicator (visual dot or badge). No `GET /boards/Y` is performed. The indicator is cleared when the user opens board Y. |

### AC-UC020-06 — Push-only, no polling (REQ-UC020-06)

| Given | When | Then |
|-------|------|------|
| The app is running and a board is open. No user interaction occurs for 30 seconds. | The client is observed for outbound HTTP requests and timer registrations. | No periodic `GET /boards/...` or `GET /boards` requests are made. No `setInterval` with an interval below 30 000 ms is registered by the board-freshness logic. All change detection is driven by incoming WebSocket messages only. |

---

## Requirement traceability

| AC ID | Requirement |
|-------|-------------|
| AC-UC020-01 | REQ-UC020-01 |
| AC-UC020-02 | REQ-UC020-02, REQ-UC002-03 |
| AC-UC020-03 | REQ-UC020-03 |
| AC-UC020-04 | REQ-UC020-04 |
| AC-UC020-05 | REQ-UC020-05 |
| AC-UC020-06 | REQ-UC020-06 |

---

## Definition of Done (whole UC, both halves)

- [ ] TC-REG-01 (regression: out-of-band PUT produces `board.changed`) transitions RED → GREEN.
- [ ] All 6 UC-020 ACs above pass (manual or automated).
- [ ] `npm run test --workspace=server` is green (including the regression test).
- [ ] `npm run test --workspace=e2e` is green (including all live-update tests).
- [ ] `npm run build --workspace=server` and `npm run build --workspace=web` are both clean.
- [ ] Manual end-to-end check:
  - Dev server running; app open in browser.
  - `curl -X PUT .../boards/X -d '{"content":"..."}' -H 'Content-Type: application/json'`
    → browser shows consent banner without replacing the canvas.
  - Click "Reload" → canvas updates.
  - Repeat; click "Dismiss" → canvas unchanged.
  - Open a second tab; PUT a board → first tab shows banner, second tab shows banner
    (or neither if they both sent matching `originId` — confirm behaviour).
  - Sidebar row for a non-open board shows indicator after external PUT; indicator
    clears on board open.
- [ ] No new `setInterval`/`setTimeout` polling introduced anywhere in the WS or
      board-change detection path.
- [ ] Pre-existing regression tests (board CRUD, sidebar render) continue to pass.

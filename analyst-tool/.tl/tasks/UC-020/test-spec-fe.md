---
id: UC-020-FE
title: "Test spec — consent banner + sidebar indicator + originId"
runner: playwright (e2e workspace)
file: e2e/tests/live-update.spec.ts (new)
feature_request: FR-002
---

# UC-020-FE Test Spec

## Test infrastructure

- Runner: **Playwright** (`e2e/` workspace).
- Run: `npm run test --workspace=e2e`.
- Backend: stub WS events and API responses via `page.route(...)` and a
  `page.evaluate(...)` WebSocket injection — do not rely on a live Neo4j or a
  real fs-watcher firing during e2e. Inject synthetic `board.changed` messages
  directly into the page's WebSocket to simulate server pushes.
- WebSocket injection pattern: `page.evaluate(() => { window.__ws?.dispatchEvent(...) })`
  or equivalent — use whatever WS handle the frontend exposes or that Playwright
  can intercept. Consult the existing e2e helpers for the WS mock pattern.
- If no WS mock helper exists yet, create a minimal one in `e2e/helpers/ws-mock.ts`.

---

## Required test cases

### TC-1: Consent banner appears on `board.changed` for the open board (no silent replace)

**Setup:**
1. Navigate to the app; stub `/boards` to return one activity board `activity-UC-003`.
2. Open the board (click its sidebar row).
3. The canvas renders (CanvasHost is mounted).

**Action:**
Inject a synthetic `board.changed` WS message:
```json
{ "type": "board.changed", "channel": "board:activity-UC-003",
  "payload": { "board": "activity-UC-003", "mtime": 1748300000000, "originId": "other-client" } }
```
(where `"other-client"` does not match the page's own `originId`)

**Assert:**
- `[data-testid="board-changed-banner"]` is visible.
- The canvas content (Excalidraw container) is still present and has NOT been
  replaced by a loading state or an empty scene.
- `GET /boards/activity-UC-003` has NOT been called (stub it and assert zero calls).

**Selector hint:** add `data-testid="board-changed-banner"` to the banner root element.

### TC-2: Consent banner "Reload" triggers a scene fetch and canvas remount

**Setup:** same as TC-1; banner is visible.

**Action:**
Click the "Reload" button inside the banner
(`[data-testid="board-changed-banner-reload"]`).

**Assert:**
- `GET /api/v1/boards/activity-UC-003` is called exactly once.
- The banner is no longer visible.
- The canvas remounts with the fetched content (Excalidraw container re-renders;
  assert the container is still present).

### TC-3: Consent banner "Dismiss" preserves local edits and makes no fetch

**Setup:** same as TC-1; make a local edit in the canvas (type something or
move an element via Playwright keyboard/pointer actions).

**Action:**
Click the dismiss button (`[data-testid="board-changed-banner-dismiss"]`).

**Assert:**
- `GET /boards/activity-UC-003` is NOT called (stub and assert zero calls).
- The banner is no longer visible.
- The Excalidraw container is still present (canvas not replaced).

### TC-4: Sidebar "changed" indicator for a non-open board

**Setup:**
1. Stub `/boards` to return two boards: `activity-UC-003` (open) and
   `activity-UC-010` (not open).
2. Open `activity-UC-003`.

**Action:**
Inject a synthetic `board.changed` or `tree.changed` WS message for
`activity-UC-010`.

**Assert:**
- The sidebar row for `activity-UC-010` shows a "changed" indicator
  (`[data-testid="sidebar-item-changed-activity-UC-010"]` or a generic
  `[data-testid^="sidebar-item-changed-"]`).
- The sidebar row for `activity-UC-003` (currently open) does NOT show the
  indicator (it gets the banner instead).
- No `GET /boards/activity-UC-010` call is made.

**Selector hint:** add `data-testid="sidebar-item-changed-{boardName}"` to the
indicator element in each sidebar row.

### TC-5: `originId` is sent in PUT body

**Setup:**
1. Load the app; open a board.
2. Intercept PUT requests via `page.route('**/boards/**', route => ...)`.

**Action:**
Trigger a board save (either via the save button or `Ctrl+S` if wired).

**Assert:**
- The intercepted PUT request body contains an `originId` field.
- The `originId` value is a non-empty string (UUID format: matches
  `/^[0-9a-f-]{36}$/i`).

### TC-6: `originId` is sent in WS subscribe message

**Setup:**
Use Playwright's `page.on('websocket', ws => ws.on('framesent', ...))` to
capture outbound WS frames.

**Action:**
Load the app and wait for the initial board subscription to fire.

**Assert:**
- At least one captured outbound frame has `type === 'subscribe'` and a
  non-empty `originId` string.
- The same `originId` value appears in both a `subscribe` frame and a
  subsequent PUT body (same session).

### TC-7: Own-write `board.changed` is suppressed — no phantom banner

**Setup:**
1. Load the app; open a board.
2. Capture the `originId` the client sends in its subscribe message
   (via WS frame inspection or a `window.__originId` test-helper export).

**Action:**
Inject a synthetic `board.changed` where `originId` matches the client's own
token (the one captured in setup).

**Assert:**
- `[data-testid="board-changed-banner"]` is NOT visible (never appears).
- No `GET /boards/...` call is made.

### TC-8: No polling — no `setInterval` or `setTimeout` loop introduced

**Setup:** load the app.

**Action:**
Spy on `window.setInterval` before page load and capture calls.

**Assert:**
- No `setInterval` call with an interval below 30 000 ms is registered by the
  app code (allow UI animation timers; reject any timer that fires repeatedly
  and hits the `/boards` endpoint).

**Implementation note:** this can also be done by asserting `GET /boards` is
called at most N times in a 5-second window with no user interaction (N = 1
for the initial load).

---

## Validation rules

| Aspect | Rule |
|--------|------|
| Banner visibility | Visible only when `originId` in event does NOT match own token. |
| No silent replace | Canvas content is never replaced without user consent. |
| Fetch on consent only | `GET /boards/:name` called only after explicit "Reload" click. |
| Sidebar indicator | Appears for non-open boards only; cleared on board open. |
| `originId` in PUT | Present and UUID-shaped on every save request. |
| `originId` in subscribe | Present in WS subscribe; same value as in PUT. |
| No polling | No periodic fetch for board freshness. |

## TDD ordering

1. Write TC-1 → RED (no banner exists yet) → implement `CMP-BOARD-CHANGED-BANNER` → GREEN.
2. TC-2 ("Reload") → RED → implement fetch + remount on consent → GREEN.
3. TC-3 ("Dismiss") → should be GREEN if the dismiss handler is correct.
4. TC-4 (sidebar indicator) → RED → implement per-row indicator in `Sidebar.tsx` → GREEN.
5. TC-5 and TC-6 (originId threading) → implement `originId` generation and wiring → GREEN.
6. TC-7 (own-write suppression) → implement suppression check in `board.changed` handler → GREEN.
7. TC-8 (no polling) → should be GREEN for free; include as a regression guard.

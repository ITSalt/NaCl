# Feature Request: FR-002 Live-update on External Board Edits

## Metadata
| Field | Value |
|-------|-------|
| Created | 2026-05-26 |
| Status | spec-complete |
| Source | /nacl-sa-feature "Live-update on external edits — surfaced during #4: an out-of-band API PUT does not notify already-open clients (self-write echo suppression) — must be realized live-update" |
| Impact method | **Code inspection** at draft time → **graph-persisted 2026-05-26**. The tool's SA graph was unreachable when this FR was first drafted (a Neo4j host-port collision routed the MCP to another client's graph). After re-porting the tool graph to `bolt://localhost:3608`, `FeatureRequest FR-002` + `UC-020` (+ REQ-UC020-01..06 + 6 ActivitySteps) + the `UC-002` contract delta were written to the graph. |
| Classification | **L2** — cross-module contract change (server WS/PUT ↔ web store/UI) |

## Feature Description
When a board file changes outside a client's own canvas — an out-of-band `PUT /api/v1/boards/:name`, a skill regeneration, another client's save, or a manual file edit — already-open clients are **not** notified and keep a stale scene. This feature realizes live-update: the server pushes a lightweight change notification over the existing WebSocket, and the analyst is given an **explicit consent** prompt before any redraw, so in-progress edits are never silently lost. Detection is push-based (no client polling).

## Root Cause (confirmed in code)
Two echo-suppression layers exist; the **server** layer is the defect:

| Layer | Where | Keyed by | Effect |
|-------|-------|----------|--------|
| Server | `services/self-writes.ts` + `index.ts:145` | board name, **global**, 2000 ms TTL | Drops the fs-watcher event entirely → **no broadcast at all** |
| Client | `state/store.ts` `expectedMtime` + `applyBoardChange` | the mtime *this client* just wrote | Suppresses reload of the writer's own echo |

`writeBoard()` calls `markSelfWrite(name)` (`services/boards.ts:219`), but `writeBoard` serves **both** the open canvas's debounced save **and** any out-of-band PUT. The global per-board marker cannot tell origins apart, so **every** PUT suppresses the broadcast for **every** subscriber for 2 s. An out-of-band PUT therefore never produces a `board.changed` on `board:<name>` → open clients keep the stale scene (the #4 symptom). The client already has a correct, per-origin guard (`expectedMtime`), so the server's global suppression is redundant for the writer and harmful for everyone else.

## Design Decisions (resolved with user)
Judged on **client experience** and **system load**, not implementation effort:

1. **Payload = notify-only.** The server pushes a tiny ping `{ board, mtime, originId }` (~bytes). The full scene is fetched via `GET /boards/:name` **only on explicit consent**, and only for the board being opened/reloaded. Rejected: pushing the full scene to every viewer on every change (wasteful — payload often discarded mid-edit).
2. **Explicit consent — never lose edits.** A `board.changed` for the open board MUST NOT silently replace canvas content. The client shows a non-destructive banner ("Изменено на сервере — Перезагрузить?"); reload happens only on user action. The current force-remount in `applyBoardChange` is replaced by banner-gated reload.
3. **Origin-marker suppression (per-client).** Each write carries an origin marker; the resulting notification is tagged with it; only the originating client suppresses. All other clients — including out-of-band/API/skill writers — receive the notification. The global `markSelfWrite`/`isRecentSelfWrite` suppression is removed.
4. **Notify scope = open board + sidebar mark.** The open board gets the consent banner; boards not currently open get a "changed" indicator on their sidebar row (full fetch deferred until opened).
5. **Push, not poll.** Change detection stays on the existing WebSocket; no periodic polling is introduced.

## Impact Summary
| Area | Change | Details |
|------|--------|---------|
| Architecture | no new module | Touches existing M-BACKEND-API (WS bridge, fs-watcher, boards PUT) + M-WEB-UI; **changes the live-update/WS contract** |
| Domain | no change | Live-update is a runtime concern; no DomainEntity/attribute change |
| Use Cases | +1 NEW | UC-020 — Live-update notification on external board change |
| Use Cases | ~1 MODIFIED | **UC-002** Edit and Save Board — `PUT /boards/:name` contract gains an `originId` marker (persisted as `REQ-UC002-03`) |
| Roles | no change | |
| UI: Components | +1 NEW, ~2 MODIFIED | NEW: CMP-BOARD-CHANGED-BANNER; MODIFIED: CanvasHost (consent-gated reload), CMP-SIDEBAR (per-row changed indicator) |

## Code Impact Trace
- **Server (M-BACKEND-API):**
  - `services/self-writes.ts` — global suppression removed/neutralized (root cause)
  - `index.ts:139-157` — fs-watcher handler: always broadcast external changes with `originId`; drop the `isRecentSelfWrite` gate
  - `routes/boards.ts` (PUT `/boards/:name`) + `services/boards.ts` (`writeBoard`) — accept and propagate an `originId`
  - `ws/events.ts` — `board.changed` payload carries `originId` (notify-only metadata; no scene)
- **Web (M-WEB-UI):**
  - `state/store.ts` — `applyBoardChange` no longer force-remounts; introduces consent state; `saveCurrent`/subscribe send a stable per-client `originId`
  - `App.tsx:105-127` — `board.changed` handler routes to consent banner instead of silent reload
  - `components/CanvasHost.tsx` — reload (remount) only on explicit consent
  - `components/Sidebar.tsx` — per-row "changed" indicator for non-open boards
  - `api/client.ts` / `api/ws.ts` — thread `originId` on PUT and on WS subscribe
- **Surfaced during:** #4 — out-of-band API PUT does not notify already-open clients

## New UCs to Plan

### UC-020 — Live-update notification on external board change
**User story:** As an analyst editing a board, when that board (or another board) is changed outside my canvas — by a skill, an API consumer, or another client — I want to be notified and decide myself whether to reload, so I never silently lose my in-progress edits and never poll the server.

**Activity flow:**
1. An external write modifies board X's file (skill regeneration, out-of-band PUT, another client's save, manual file edit).
2. Server fs-watcher detects the change and identifies the write origin.
3. Server broadcasts a lightweight `board.changed` on `board:X` (and `tree.changed` on `boards`) carrying `{ mtime, originId }` — never the scene.
4. The originating client (`originId` == its own token) ignores the notification (no phantom banner).
5. Other clients viewing X show a consent banner; clients not viewing X mark X's sidebar row as changed.
6. On consent → client `GET /boards/X` → redraw (CanvasHost remount). On ignore → local edits preserved; nothing fetched.

**Requirements:**
- **REQ-UC020-01 (BE — notification):** Every external write to a board file MUST produce a `board.changed` notification to all subscribed clients **except** the originating client. Out-of-band PUTs, skill regenerations, and other clients' saves all count as "external" relative to a given client.
- **REQ-UC020-02 (contract — origin suppression):** The `PUT /boards/:name` contract carries an `originId`. The server tags the resulting `board.changed` with that `originId`; only the matching client suppresses. The global `markSelfWrite`/`isRecentSelfWrite` suppression is **removed** (it conflates origins and swallows out-of-band writes).
- **REQ-UC020-03 (FE — consent / no data loss):** A `board.changed` for the currently-open board MUST NOT silently replace canvas content. The client shows a non-destructive banner; reload happens only on explicit user action. Unsaved local edits are never discarded without consent.
- **REQ-UC020-04 (load — notify-only payload):** The notification payload is metadata only (`board`, `mtime`, `originId`) — never the full scene. The full scene is fetched via `GET` only on consent and only for the board being opened/reloaded.
- **REQ-UC020-05 (FE — sidebar indicator):** For boards not currently open, a `board.changed`/`tree.changed` marks the board's sidebar row with a "changed" indicator; the full board is fetched only when the analyst opens it.
- **REQ-UC020-06 (no polling):** Change detection is push-based over the existing WebSocket; the client MUST NOT introduce periodic polling for board freshness.

## Modified UCs to Re-plan
- **UC-002 — Edit and Save Board** (PUT `/boards/:name`): contract gains an `originId` marker so the server can attribute writes per-origin. *Reconciled 2026-05-26:* the board-save UC is **UC-002** (module M-WEB-UI); the delta is persisted in the graph as `REQ-UC002-03`. The contract delta remains the load-bearing artifact.

## New TECH Tasks
None — all changes are incremental to existing files (`self-writes.ts` neutralized; `index.ts`, `routes/boards.ts`, `services/boards.ts`, `ws/events.ts`, and the web store/components updated). The WS `board.changed` payload gains `originId` (additive); the PUT body/headers gain `originId` (additive, backwards-compatible — absent `originId` → treated as external, always notified).

## Dependencies
- BE WS-contract change (REQ-UC020-01/02/04) must land before the FE consent banner (REQ-UC020-03) is useful.
- `originId` requires a stable per-client identifier generated on the web side and sent on both `PUT` and WS `subscribe`.
- The consent banner (CMP-BOARD-CHANGED-BANNER) depends on the store exposing consent state from `applyBoardChange`.

## Regression Anchor (for /nacl-tl-fix → /nacl-tl-regression-test)
The #4 symptom must be captured as a RED test before any fix:
> An out-of-band `PUT /api/v1/boards/X` (not carrying an open client's `originId`) produces a `board.changed` on `board:X` that reaches a subscribed client. Under current code the event is dropped by `isRecentSelfWrite('X')` → no broadcast → test is RED until the global suppression is removed.

## SA Artifacts Created/Modified
*(Persisted to the Neo4j SA graph on 2026-05-26 after the tool graph was reattached at `bolt://localhost:3608`: `FeatureRequest FR-002`, `UC-020` + REQ-UC020-01..06 + 6 ActivitySteps + ACTOR/CONTAINS_UC edges, and `REQ-UC002-03` on UC-002. `INCLUDES_UC` edges: UC-020 (new), UC-002 (modified); `AFFECTS_MODULE`: M-BACKEND-API, M-WEB-UI.)*
- NEW: UC-020 — Live-update notification on external board change (+ REQ-UC020-01..06)
- MODIFIED: board edit/save UC — PUT `/boards/:name` contract gains `originId`
- NEW: CMP-BOARD-CHANGED-BANNER — consent banner over the open canvas
- MODIFIED: CMP-SIDEBAR — per-row "changed" indicator
- MODIFIED: CanvasHost — consent-gated reload (no auto-remount on `board.changed`)
- CONTRACT: WS `board.changed` event — notify-only, carries `originId`

## Skills Invoked
- nacl-sa-feature (impact analysis via code inspection at draft time; graph persistence completed 2026-05-26 against the reattached tool graph at bolt 3608)

## Next Steps
- `/nacl-tl-plan --feature FR-002` — create dev tasks (BE WS/PUT contract → FE consent banner + sidebar indicator)
- Board-save UC reconciled to **UC-002** (done 2026-05-26); graph now holds FR-002/UC-020 for graph-aware planning.

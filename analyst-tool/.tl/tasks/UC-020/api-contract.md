---
id: UC-020
title: Live-update — API & WS contract
feature_request: FR-002
status: contract-change
---

# UC-020 — API & WebSocket Contract

## Overview

FR-002 changes two integration surfaces:

1. **PUT `/api/v1/boards/:name`** — gains an optional `originId` field (request body or header; see choice below).
2. **WS `board.changed` event** — payload gains `originId`; scene is never included.
3. **WS `subscribe` message** — client sends its stable `originId` on connection.

Both changes are **additive and backwards-compatible**. Absent `originId` is treated as external (always notified); no existing callers break.

---

## 1. PUT `/api/v1/boards/:name`

### Choice: body field (not header)

`originId` is carried as an optional **body field** (JSON). Rationale: the PUT body is already JSON; adding a field is simpler than teaching all callers to set a custom header, and the body is already parsed server-side. Callers that omit the field receive the same "external write" behaviour as before.

> Note: the existing route may be mounted at `/boards/:name` without the `/api/v1/` prefix. Apply the contract change to the in-tree route path, whatever it currently is.

### Request

```ts
// PUT /api/v1/boards/:name
// Content-Type: application/json

type PutBoardRequest = {
  scene: object;          // full Excalidraw scene object (elements, appState, files)
  originId?: string;      // stable per-client token; absent → treated as external
};
```

### Response (200)

Unchanged from pre-FR-002:

```ts
type PutBoardResponse = {
  name: string;
  mtime: string;   // ISO timestamp of the written file
};
```

### Error responses

Unchanged.

PUT remains **upsert** (create-or-overwrite) as before FR-002 — FR-002 does not change PUT create-semantics.

| Code | Body                                | When                        |
|------|-------------------------------------|-----------------------------|
| 400  | `{ "error": "Missing scene" }`      | Body lacks `scene`.         |
| 500  | `{ "error": "Failed to write board" }` | Filesystem write fails.  |

### Backwards compatibility

`originId` is optional. Callers that do not send it receive `originId: null` in the resulting `board.changed` event, which means **all** subscribed clients are notified (the safest default — no silent suppression).

---

## 2. WebSocket — `board.changed` event

### When emitted

After every write that reaches the fs-watcher (external PUT, skill regeneration, another client's save, manual file edit). The server emits this event on the channel `board:<boardName>`.

### Payload

```ts
// WS event: board.changed
// Channel:  board:<boardName>
type BoardChangedPayload = {
  board: string;          // board name (no .excalidraw extension)
  mtime: number;          // Unix milliseconds of the file's mtime
  originId: string | null; // token of the writing client; null if out-of-band / unknown
};
```

**MUST NOT include the scene.** The full scene is fetched via `GET /api/v1/boards/:name` only on explicit user consent.

### Suppression rule (client-side)

A client that sent its `originId` on the `subscribe` message suppresses a `board.changed` whose `originId` matches its own token. This is a client-side check — the server broadcasts to all subscribers; each client decides whether to surface the notification.

---

## 3. WebSocket — `tree.changed` event

Unchanged in shape from pre-FR-002. Emitted on channel `boards` after any board write. No `originId` needed on this event (the sidebar indicator does not require suppression per-origin — it is safe to always mark the sidebar row as changed).

```ts
// WS event: tree.changed
// Channel:  boards
type TreeChangedPayload = {
  // existing shape — no change in FR-002
};
```

---

## 4. WebSocket — `subscribe` message (client → server)

The client sends its stable `originId` when subscribing to a board channel, so the server can record the association for future use (and so the field is available in request context if needed).

```ts
// WS message: subscribe
// Direction:  client → server
type SubscribeMessage = {
  type: 'subscribe';
  channel: string;        // e.g. "board:activity-UC-003" or "boards"
  originId?: string;      // stable per-client token; same value used in PUT body
};
```

---

## 5. Per-client `originId` — generation contract

`originId` is a stable string unique to one browser session. It is generated once at app startup and reused for the lifetime of the tab.

Recommended generation (FE):

```ts
// web/src/api/ws.ts or state/store.ts — generated once, module-level
const originId: string = crypto.randomUUID();
```

The same value is:
- sent in `subscribe` messages for every channel the client subscribes to.
- included in every PUT `/boards/:name` request body as `originId`.

---

## 6. Summary of changes vs. pre-FR-002

| Surface                        | Before FR-002                          | After FR-002                                  |
|-------------------------------|----------------------------------------|-----------------------------------------------|
| PUT body                      | `{ scene: object }`                    | `{ scene: object, originId?: string }`        |
| `board.changed` payload        | `{ board, mtime }` (no originId)       | `{ board, mtime, originId: string \| null }`  |
| `board.changed` suppression    | Global 2 s server-side TTL (broken)    | Client-side: suppress if `originId` matches own token |
| WS subscribe message           | `{ type, channel }`                    | `{ type, channel, originId? }`                |
| Scene in `board.changed`       | No (was already absent)                | No (explicitly enforced)                      |

---

## Authentication

`SR-ANALYST` (single local user; no auth in the analyst-tool). Unchanged.

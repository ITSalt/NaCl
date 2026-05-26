---
id: UC-020-BE
title: "Implementation brief — live-update server WS/PUT origin contract"
feature_request: FR-002
---

# UC-020-BE Implementation Brief

## Files to modify

| File | Change |
|------|--------|
| `server/src/services/self-writes.ts` | Remove `markSelfWrite` call from `writeBoard`; keep the file (other callers may exist). |
| `server/src/services/boards.ts` | `writeBoard` gains `originId?: string` param; stores it in a `pendingOrigins` map instead of calling `markSelfWrite`. |
| `server/src/routes/boards.ts` | Extract `originId` from PUT body; pass to `writeBoard`. |
| `server/src/index.ts` (lines ~139-157) | Remove `isRecentSelfWrite` guard; read + clear `pendingOrigins`; broadcast `board.changed` with `originId`. |
| `server/src/ws/events.ts` | `board.changed` payload type includes `originId: string \| null`. |
| `server/src/services/boards.test.ts` | Add regression test TC-REG-01 + TC-1..TC-9 from `test-spec.md`. |

## Files NOT to modify

- `web/` — FE is UC-020-FE.
- Any renderer or graph-related service.
- The test for existing PUT/GET board functionality — extend, do not rewrite.

---

## Root Cause Recap

`server/src/services/boards.ts` line ~219: `writeBoard()` calls `markSelfWrite(name)`.

`server/src/index.ts` lines ~139-157: the fs-watcher `onChange` handler calls
`isRecentSelfWrite(name)` and returns early (no broadcast) when true.

Because `markSelfWrite` is global per board name, **any** PUT — not just the
open client's own save — sets the marker and suppresses the broadcast for all
subscribers for 2 seconds. Out-of-band PUTs from skills or external API consumers
therefore never produce a `board.changed` event.

---

## Step-by-step

### Step 1 — Add `pendingOrigins` map in `services/boards.ts`

Above `writeBoard`, add a module-level map with auto-expiry:

```ts
// Keyed by board name; value is the originId of the most recent write.
// Auto-expires after 5 s to prevent leaks if the fs-watcher is slow or skipped.
const pendingOrigins = new Map<string, { originId: string | null; expiresAt: number }>();

export function setPendingOrigin(name: string, originId: string | null): void {
  pendingOrigins.set(name, { originId, expiresAt: Date.now() + 5000 });
}

export function consumePendingOrigin(name: string): string | null {
  const entry = pendingOrigins.get(name);
  pendingOrigins.delete(name);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.originId;
}
```

### Step 2 — Modify `writeBoard` signature

Change:

```ts
// Before
export async function writeBoard(name: string, content: string): Promise<{ mtime: string }> {
  // ...
  markSelfWrite(name);   // <-- REMOVE THIS LINE
  // ...
}
```

To:

```ts
// After
export async function writeBoard(
  name: string,
  content: string,
  opts: { originId?: string } = {},
): Promise<{ mtime: string }> {
  // ...
  setPendingOrigin(name, opts.originId ?? null);   // replaces markSelfWrite
  // ...
}
```

Do NOT call `markSelfWrite` anymore. The `setPendingOrigin` call replaces it —
but instead of gating the broadcast server-side, it records the origin so the
fs-watcher can attach it to the payload.

### Step 3 — Update `routes/boards.ts` to extract `originId`

In the PUT handler:

```ts
// Before (approximate)
const { content } = req.body as { content: string };
await writeBoard(name, content);

// After
const { content, originId } = req.body as { content: string; originId?: string };
await writeBoard(name, content, { originId });
```

Add `originId` to the body schema/validation if the route uses a Fastify schema.
Mark it as optional — `absent → null`.

### Step 4 — Update `ws/events.ts` payload type

Find the `board.changed` payload type (or the helper that builds it) and add
`originId`:

```ts
// Before
type BoardChangedPayload = { board: string; mtime: number };

// After
type BoardChangedPayload = { board: string; mtime: number; originId: string | null };
```

Update any function that constructs this payload to accept and pass through
`originId`.

### Step 5 — Update `index.ts` fs-watcher handler (lines ~139-157)

The critical change: remove the `isRecentSelfWrite` early return and attach the
`originId` from `consumePendingOrigin`.

```ts
// Before (approximate)
watcher.on('change', (filePath) => {
  const name = boardNameFromPath(filePath);
  if (isRecentSelfWrite(name)) return;   // <-- REMOVE THIS ENTIRE GUARD
  const mtime = fs.statSync(filePath).mtimeMs;
  broadcastBoardChanged({ board: name, mtime });
});

// After
watcher.on('change', (filePath) => {
  const name = boardNameFromPath(filePath);
  const originId = consumePendingOrigin(name);   // null for external writes
  const mtime = fs.statSync(filePath).mtimeMs;
  broadcastBoardChanged({ board: name, mtime, originId });
});
```

`broadcastBoardChanged` must be updated to accept and forward `originId` (see
Step 4).

### Step 6 — Tests

Per `test-spec.md`. Start with TC-REG-01 (the regression anchor). Verify RED
against unmodified code before applying Steps 1-5. Then apply and verify GREEN.

For the in-process WS test setup, use the existing Fastify test-server helper
if one exists. If not, create a minimal helper that:
1. Creates a temp directory.
2. Starts the server in test mode pointing at that directory.
3. Opens a real `WebSocket` connection (Node.js `ws` module or similar).
4. Returns cleanup handles.

---

## Risks

- **Race condition:** if the fs-watcher fires before `setPendingOrigin` is
  called (extremely unlikely — the file write and the pending-origin assignment
  happen in the same synchronous block before the await), `consumePendingOrigin`
  returns `null` and the event is treated as external. This is safe — it means
  the writing client will receive a banner unnecessarily once, which is far less
  bad than the current total-suppression bug.
- **Other callers of `markSelfWrite`:** check `server/src/` for any call site of
  `markSelfWrite` that is NOT inside `writeBoard`. If none, the function can be
  deprecated. Do not delete `services/self-writes.ts` in this PR; just stop
  calling it from `writeBoard`.
- **Fastify body schema:** if the PUT route has a strict JSON schema with
  `additionalProperties: false`, adding `originId` to the allowed set is
  required or the field will be stripped before reaching the handler.

## Validation gate

- [ ] `npm run build --workspace=server` is clean (no TypeScript errors).
- [ ] `npm run test --workspace=server` is green, including TC-REG-01 GREEN.
- [ ] Manual: run the dev server; open the app; use `curl` or Postman to PUT a
      board without `originId`; confirm the browser's DevTools WS panel shows a
      `board.changed` message arriving.

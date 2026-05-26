---
id: UC-020-FE
title: "Implementation brief — consent banner + sidebar indicator + originId"
feature_request: FR-002
---

# UC-020-FE Implementation Brief

## Files to modify

| File | Change |
|------|--------|
| `web/src/api/ws.ts` | Generate module-level `originId` (UUID); include in every `subscribe` message sent. |
| `web/src/api/client.ts` | Thread `originId` in PUT `/boards/:name` body. |
| `web/src/state/store.ts` | `applyBoardChange` introduces `pendingBoardChange` consent state instead of force-remounting; `saveCurrent` sends `originId`. |
| `web/src/App.tsx` (~lines 105-127) | Route `board.changed` to consent banner logic instead of silent reload. |
| `web/src/components/CanvasHost.tsx` | Reload/remount only on explicit consent; remove any auto-remount triggered by `board.changed`. |
| `web/src/components/Sidebar.tsx` | Per-row "changed" indicator; clear indicator when board is opened. |
| `web/src/components/BoardChangedBanner.tsx` | **NEW** — `CMP-BOARD-CHANGED-BANNER`. |
| Sidebar stylesheet | Add styles for the "changed" indicator if not already present. |
| `e2e/tests/live-update.spec.ts` | New e2e test file per `test-spec-fe.md`. |
| `e2e/helpers/ws-mock.ts` | New WS injection helper (if no equivalent exists). |

## Files NOT to modify

- `server/` — BE is UC-020-BE.
- Other components not listed above.

---

## Step-by-step

### Step 1 — Generate `originId` in `api/ws.ts`

At the top of `web/src/api/ws.ts` (module level, evaluated once per tab):

```ts
export const originId: string = crypto.randomUUID();
```

Update the `subscribe` helper to include it:

```ts
function sendSubscribe(ws: WebSocket, channel: string): void {
  ws.send(JSON.stringify({ type: 'subscribe', channel, originId }));
}
```

Export `originId` so `api/client.ts` and `state/store.ts` can import the same
value without generating a second UUID.

### Step 2 — Thread `originId` in PUT (`api/client.ts`)

Find the function that performs `PUT /boards/:name`. Add `originId` to the body:

```ts
import { originId } from './ws';

export async function putBoard(name: string, content: string): Promise<PutBoardResponse> {
  const res = await fetch(`/api/v1/boards/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, originId }),
  });
  // ... existing error handling
}
```

If the route path in the in-tree server is `/boards/:name` (no `/api/v1/`
prefix), match the existing call path — do not rename routes in this FR.

### Step 3 — Introduce consent state in `state/store.ts`

Replace the force-remount logic in `applyBoardChange` with a consent gate.

**Add to the store's state shape:**

```ts
type PendingBoardChange = {
  board: string;
  mtime: number;
};

// In the store state:
pendingBoardChange: PendingBoardChange | null;
```

**Update `applyBoardChange`:**

```ts
// Before (approximate)
function applyBoardChange(board: string, mtime: number, originId: string | null): void {
  // checks expectedMtime, then force-remounts the canvas
  setSelectedBoard(board);   // or remounts CanvasHost
}

// After
function applyBoardChange(board: string, mtime: number, originId: string | null): void {
  import { originId as ownOriginId } from '../api/ws';

  // Suppress own writes
  if (originId !== null && originId === ownOriginId) return;

  if (board === get().selectedBoard) {
    // Open board: offer consent banner
    set({ pendingBoardChange: { board, mtime } });
  } else {
    // Non-open board: mark sidebar row changed
    set((s) => ({ changedBoards: new Set(s.changedBoards).add(board) }));
  }
}
```

**Add to state:**

```ts
changedBoards: Set<string>;   // boards with a pending "changed" indicator
```

**Add actions:**

```ts
// Called when user clicks "Reload" in the banner
confirmBoardReload(): void {
  const pending = get().pendingBoardChange;
  if (!pending) return;
  set({ pendingBoardChange: null });
  // trigger CanvasHost remount via selectBoard or a dedicated reload flag
  get().reloadBoard(pending.board);
}

// Called when user clicks "Dismiss"
dismissBoardChange(): void {
  set({ pendingBoardChange: null });
}

// Called when user opens a board (clears the indicator)
clearChangedBoard(name: string): void {
  set((s) => {
    const next = new Set(s.changedBoards);
    next.delete(name);
    return { changedBoards: next };
  });
}
```

### Step 4 — Update `App.tsx` `board.changed` handler (~lines 105-127)

The handler currently calls something like `applyBoardChange(data.board)` or
directly remounts. After the store refactor, the handler should simply call:

```ts
// In the board.changed WS message handler
store.applyBoardChange(data.board, data.mtime, data.originId ?? null);
```

No remount or navigation in the handler itself — the store drives the UI state.

### Step 5 — New component: `CMP-BOARD-CHANGED-BANNER`

Create `web/src/components/BoardChangedBanner.tsx`:

```tsx
// web/src/components/BoardChangedBanner.tsx
import React from 'react';
import { useStore } from '../state/store';

export function BoardChangedBanner(): React.ReactElement | null {
  const pending = useStore((s) => s.pendingBoardChange);
  const confirm = useStore((s) => s.confirmBoardReload);
  const dismiss = useStore((s) => s.dismissBoardChange);

  if (!pending) return null;

  return (
    <div
      data-testid="board-changed-banner"
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'var(--surface-elevated, #fff)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        padding: '10px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      <span>Изменено на сервере — Перезагрузить?</span>
      <button
        data-testid="board-changed-banner-reload"
        onClick={confirm}
      >
        Перезагрузить
      </button>
      <button
        data-testid="board-changed-banner-dismiss"
        onClick={dismiss}
      >
        Закрыть
      </button>
    </div>
  );
}
```

**Positioning:** render `<BoardChangedBanner />` inside `CanvasHost.tsx` (or in
`App.tsx` above the canvas area) with `position: relative` on the canvas
container so the banner sits over the canvas without covering the sidebar.

### Step 6 — Update `CanvasHost.tsx`

Remove any auto-remount logic triggered by `board.changed`. Remounting should
only happen when `confirmBoardReload()` is called in the store, which triggers
a state change that CanvasHost reacts to (e.g. increments a `reloadKey` used
as the Excalidraw key prop).

Suggested remount pattern:

```ts
// In the store
reloadKey: number;   // increment to force Excalidraw remount

reloadBoard(name: string): void {
  set({ selectedBoard: name, reloadKey: get().reloadKey + 1 });
}
```

```tsx
// In CanvasHost.tsx
const reloadKey = useStore((s) => s.reloadKey);
// ...
<Excalidraw key={reloadKey} ... />
```

### Step 7 — Update `Sidebar.tsx` — per-row "changed" indicator

```tsx
// In the sidebar row render
const changedBoards = useStore((s) => s.changedBoards);
// ...
<button className="sidebar-item" onClick={() => { store.clearChangedBoard(board.name); selectBoard(board.name); }}>
  <span className="sidebar-item-name">{board.displayName}</span>
  {changedBoards.has(board.name) && (
    <span
      className="sidebar-item-changed-dot"
      data-testid={`sidebar-item-changed-${board.name}`}
      title="Changed externally"
    />
  )}
</button>
```

Add CSS for `.sidebar-item-changed-dot`:

```css
.sidebar-item-changed-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #f59e0b);
  flex-shrink: 0;
  margin-left: auto;
}
```

### Step 8 — E2E tests

Per `test-spec-fe.md`. Create `e2e/tests/live-update.spec.ts`. If a WS mock
helper does not exist, create `e2e/helpers/ws-mock.ts` with a utility that
dispatches synthetic `MessageEvent`s to the page's WebSocket instance.

---

## Risks

- **Store shape change:** adding `pendingBoardChange` and `changedBoards` to the
  store changes its shape. Any existing test that snapshots the full store state
  will need updating — add the new fields to snapshots.
- **`applyBoardChange` removal of `expectedMtime`:** the old client-side guard
  used `expectedMtime` to suppress the writer's own echo. This guard can be
  removed now that `originId` suppression is in place — but verify no other code
  path reads `expectedMtime` before deleting it.
- **Banner z-index conflict:** if the app has other absolute/fixed overlays
  (e.g. a loading spinner), ensure the banner's `z-index: 9999` does not clash.
  Check existing z-index values in the codebase.
- **`crypto.randomUUID` availability:** available in all modern browsers and
  Node.js 14.17+. The project targets Node.js 20+ so this is safe.

## Validation gate

- [ ] `npm run build --workspace=web` is clean.
- [ ] `npm run test --workspace=e2e` passes all live-update tests.
- [ ] Manual: open the app; use `curl` to PUT a board; confirm banner appears
      without replacing the canvas. Click "Reload" — canvas updates. Click
      "Dismiss" on a second PUT — canvas unchanged.
- [ ] Manual: sidebar indicator appears on the board row for a board that is
      not currently open when an external PUT changes it.

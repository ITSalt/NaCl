---
id: UC-020-BE
title: "Test spec — live-update server broadcast + origin suppression"
runner: vitest
file: server/src/services/boards.test.ts (extend) + server/src/index.test.ts (new or extend)
feature_request: FR-002
---

# UC-020-BE Test Spec

## Test infrastructure

- Runner: **vitest**.
- Run: `npm run test --workspace=server`.
- WebSocket: use the existing in-process Fastify test helper (or `supertest`-ws
  equivalent) to create real WS connections against the test server. Do not mock
  the WS layer — the regression test must exercise the actual broadcast path.
- Filesystem: use `tmp` or `os.tmpdir()` for a throwaway boards directory; clean
  up after each test.
- `services/self-writes.ts`: import and assert on its exports where needed, but
  do not mock the fs-watcher — let the real watcher fire.

---

## TC-REGRESSION (headline RED test — write this first)

### TC-REG-01: Out-of-band PUT produces `board.changed` for a subscribed client

**This is the regression anchor for FR-002 / the #4 symptom.**

**Setup:**
1. Start the test server against a temp boards directory.
2. Create `activity-UC-003.excalidraw` in the temp dir.
3. Open WS connection A; send `{ type: 'subscribe', channel: 'board:activity-UC-003' }`.
4. Note: WS connection A does NOT own the write — it is a pure observer.

**Action:**
PUT `/api/v1/boards/activity-UC-003` (or the in-tree path `/boards/activity-UC-003`)
with body `{ "content": "<new scene json>" }` — **no `originId` in the body**.

**Assert:**
WS connection A receives a `board.changed` message on channel `board:activity-UC-003`
with payload shape `{ board: 'activity-UC-003', mtime: <number>, originId: null }`.

**RED state:** Under current code, `writeBoard` calls `markSelfWrite('activity-UC-003')`.
The fs-watcher fires and `isRecentSelfWrite('activity-UC-003')` returns `true` → no
broadcast → WS connection A receives nothing → test times out or asserts `undefined`.

**GREEN state:** After the fix, the `isRecentSelfWrite` gate is removed from the
fs-watcher handler and the event reaches WS connection A.

**TDD ordering:** Write this test first. Confirm RED against the unmodified code.
Then implement the fix. Confirm GREEN.

---

## Required test cases

### TC-1: `board.changed` payload shape — notify-only, no scene

**Setup:** perform a PUT to a board (any body, no `originId`); subscribe a WS
client before the PUT.

**Assert:** the received `board.changed` message has exactly the keys
`{ board: string, mtime: number, originId: null }`. No `content`, `elements`,
`appState`, or any other scene key is present.

### TC-2: Per-origin suppression — originating `originId` echoed in payload

**Setup:**
1. Subscribe two WS connections: A (originId `'client-A'`) and B (originId `'client-B'`).
2. PUT `/boards/X` with body `{ content: '...', originId: 'client-A' }`.

**Assert:**
- Both A and B receive the `board.changed` event.
- The event payload has `originId: 'client-A'`.
- (The actual suppression decision is the client's responsibility — the server
  broadcasts to all; the test confirms the `originId` is carried faithfully in
  the payload so the client can decide.)

**Note:** A client-side suppression test is in `test-spec-fe.md`. This test only
verifies server broadcast fidelity.

### TC-3: Two subscribers — both receive `board.changed` for an out-of-band PUT

**Setup:** two independent WS connections subscribe to `board:X`. PUT `/boards/X`
with no `originId`.

**Assert:** both connections receive `board.changed` within the test timeout (1 s).

### TC-4: `originId: null` when PUT carries no `originId`

**Setup:** PUT body is `{ content: '...' }` (no `originId` key).

**Assert:** the broadcast `board.changed` has `originId: null`.

### TC-5: `originId` propagated when PUT carries one

**Setup:** PUT body is `{ content: '...', originId: 'tok-xyz' }`.

**Assert:** the broadcast `board.changed` has `originId: 'tok-xyz'`.

### TC-6: fs-watcher broadcast fires for skill/manual writes (no PUT)

**Setup:** write a file directly to the boards directory using `fs.writeFile`
(simulating a skill regeneration that bypasses the PUT route). A WS client is
subscribed to the board channel.

**Assert:** the client receives `board.changed` with `originId: null` (no origin
to attribute).

### TC-7: `isRecentSelfWrite` gate is absent from the broadcast path

This is a static/structural test. After the fix, the fs-watcher handler in
`server/src/index.ts` must NOT call `isRecentSelfWrite`.

**Implementation:** use `vi.spyOn` on the `isRecentSelfWrite` export and assert
`toHaveBeenCalledTimes(0)` during a PUT+broadcast cycle.

Alternatively: read the source file and assert the string `isRecentSelfWrite`
does not appear in the watcher callback body (grep-level check in a test
comment is acceptable if the spy approach is fragile with the module system).

### TC-8: Backwards compatibility — PUT without `originId` still saves the board

**Assert:** after a PUT with no `originId`, `GET /boards/X` returns the new
content. The write itself must not fail.

### TC-9: `board.changed` NOT emitted for non-existent board write

**Setup:** no file named `ghost-UC-999.excalidraw` on disk. Attempt PUT returns
404. No WS message emitted.

**Assert:** a subscribed client receives no `board.changed` (timeout check or
`expect(received).toHaveLength(0)`).

---

## Validation rules

| Aspect | Rule |
|--------|------|
| Payload shape | `board.changed` has exactly `{ board, mtime, originId }` — no extra keys. |
| `originId` type | `string` or `null`. Never `undefined`. |
| Suppression gate | `isRecentSelfWrite` must not be called in the watcher path after the fix. |
| Broadcast scope | All subscribed clients receive the event; suppression is client-side only. |
| No polling | No `setInterval`/`setTimeout` added in the server broadcast path. |

## TDD ordering

1. Write TC-REG-01 → confirm RED (no event received under current code).
2. Remove `isRecentSelfWrite` gate + propagate `originId` → TC-REG-01 GREEN.
3. Write TC-1 (payload shape) → should be GREEN if step 2 is correct.
4. Write TC-2..TC-5 (origin propagation).
5. Write TC-6 (skill/manual write path).
6. Write TC-7 (structural gate-absence assertion).
7. TC-8 and TC-9 should pass for free; include for regression safety.

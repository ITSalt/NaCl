---
id: UC-008-BE
title: Implementation brief — /boards label resolution
feature_request: FR-001
---

# UC-008-BE Implementation Brief

## Files to modify

| File                                              | Change                                                              |
|---------------------------------------------------|---------------------------------------------------------------------|
| `server/src/services/boards.ts`                   | Extend `BoardListItem` type; resolve `label` in batch via Neo4j.    |
| `server/src/services/boards.test.ts` (new)        | Tests TC-1..TC-8 from `test-spec.md`. (Or extend an existing test.) |

## Files NOT to modify

- `server/src/routes/boards.ts` — response shape change is automatic via the type.
- Any frontend file — UC-008-FE consumes the new field.
- Any other service — keep blast radius minimal.

## Step-by-step

### Step 1 — Extend the type

In `server/src/services/boards.ts:16-28`, add `label: string | null` to `BoardListItem`.
Run TC-1 (TypeScript compile + presence check) — it should now compile and the field
is `undefined` until step 2.

### Step 2 — Helper: batch-resolve labels

Add a private function in `boards.ts`:

```ts
async function resolveLabels(items: BoardListItem[]): Promise<Map<string, string | null>> {
  const ucIds = items
    .filter((b) => b.kind === 'activity' && b.relatedId !== null)
    .map((b) => b.relatedId as string);
  const bpIds = items
    .filter((b) => b.kind === 'process' && b.relatedId !== null)
    .map((b) => b.relatedId as string);

  const labels = new Map<string, string | null>();
  if (ucIds.length === 0 && bpIds.length === 0) return labels;

  try {
    const driver = await getDriverAsync(getConfig().repoRoot);
    const session = driver.session();
    try {
      if (ucIds.length > 0) {
        const r = await session.run(
          'UNWIND $ucIds AS ucId MATCH (uc:UseCase {id: ucId}) RETURN uc.id AS id, uc.name AS name',
          { ucIds },
        );
        for (const rec of r.records) {
          labels.set(rec.get('id') as string, (rec.get('name') as string) ?? null);
        }
      }
      if (bpIds.length > 0) {
        const r = await session.run(
          'UNWIND $bpIds AS bpId MATCH (bp:BusinessProcess {id: bpId}) RETURN bp.id AS id, bp.name AS name',
          { bpIds },
        );
        for (const rec of r.records) {
          labels.set(rec.get('id') as string, (rec.get('name') as string) ?? null);
        }
      }
    } finally {
      await session.close();
    }
  } catch {
    // Neo4j unreachable — labels stay empty; caller will default to null.
  }
  return labels;
}
```

`getDriverAsync` is already imported in `routes/boards.ts`; import it in `services/boards.ts` too.

### Step 3 — Wire it in `listBoards`

After the existing `for (const entry of entries)` loop builds `results`, before `return results`:

```ts
const labels = await resolveLabels(results);
for (const item of results) {
  item.label = item.relatedId !== null ? labels.get(item.relatedId) ?? null : null;
}
```

### Step 4 — Tests

Per `test-spec.md`. Use a mocked driver. The existing project pattern (see
`server/src/services/neo4j.test.ts`) already stubs the driver; reuse the same
mocking helper if there is one, otherwise stub locally with `vi.fn()`.

For TC-6 (no N+1), assert `session.run.mock.calls.length === 2` (or the
equivalent if a different primitive is mocked).

For TC-7 (graceful degradation), make the mock throw and confirm the response
still resolves with `label: null` on every item.

## Risks

- **Driver lifecycle:** `getDriverAsync` is cached; do not close the driver
  inside `resolveLabels` — only close the session.
- **Large board counts:** `UNWIND` with a few hundred ids is fine; no batching
  needed unless a project has > 10k boards (it won't).
- **Type drift:** if a `web/` mirror of `BoardListItem` exists, it will start
  diverging — UC-008-FE will sync it. Don't try to dedupe types in this FR.

## Validation gate

Before declaring done:

- [ ] `npm run build --workspace=server` is clean.
- [ ] `npm run test --workspace=server` is green, including the 8 new test cases.
- [ ] Manual: hit `GET http://127.0.0.1:3583/boards` with the dev server running
      against a real project, confirm `label` is populated for activity/process
      boards and null otherwise.

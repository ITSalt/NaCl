---
id: UC-003-BE
title: Implementation brief — activity renderer title
feature_request: FR-001
---

# UC-003-BE Implementation Brief

## Files to modify

| File                                              | Change                                                    |
|---------------------------------------------------|-----------------------------------------------------------|
| `server/src/render/semantic-ids.ts`               | Add `ucTitle` helper (or reuse `baTitle` — see decision). |
| `server/src/render/excalidraw/activity.ts`        | Build a `titleText` element via `makeText`; include it in `assembleScene` output. |
| `server/src/render/render.test.ts` (or new file)  | Add tests TC-1..TC-4 from `test-spec.md`.                 |

## Files NOT to modify

- `server/src/render/excalidraw/ba-process.ts` — already correct.
- `server/src/render/excalidraw/domain-model.ts`, `context-map.ts` — out of scope.
- Any route, service, or storage code — this is renderer-internal.

## Step-by-step

### Step 1 — semantic-ids.ts

Decide between (A) adding `ucTitle: (ucId: string) => 'title-${ucId}'` next to `baTitle`,
or (B) reusing `baTitle` (since the prefix `title-` is shared and ids don't collide
because UC ids start with `UC-` and BP ids don't).

**Recommendation:** add `ucTitle` for symmetry and grep-ability. Place it in the
"activity-specific" section — there isn't one yet, so add a section header similar
to the existing `ba-process` and `domain-model` sections, around line ~135.

### Step 2 — activity.ts

Inside the activity renderer (`renderActivity` or equivalent — the function that
returns the scene; ends around line 505 with `return assembleScene(elements)`),
just before the `elements` array is built:

```ts
// Title text — centered above the swimlanes. Mirrors ba-process pattern.
const titleText = makeText({
  logicalId: `${ucId}::title`,
  id: semIds.ucTitle(ucId),  // or semIds.baTitle(ucId) if you decide to reuse
  x: SWIMLANE_LABEL_W + 30,  // reuse whatever constant the activity renderer uses
  y: -50,
  width: Math.max(/* totalWidth - SWIMLANE_LABEL_W - 60 */, 200),
  height: 36,
  text: `${uc_name} (${ucId})`,
  fontSize: 24,
  strokeColor: '#1e1e1e',
});
```

Then append `titleText` to the `elements` spread (lines ~497–503), as the **last**
entry so it draws on top:

```ts
const elements: AnyElement[] = [
  ...bgRects,
  ...headerElements,
  ...stepElements,
  ...arrowElements,
  ...warningElements,
  titleText,
];
```

If a `SWIMLANE_LABEL_W` constant doesn't exist in `activity.ts`, use whatever
header-x-offset constant is already defined; the title just needs to be centered
above the system+user swimlane block.

### Step 3 — empty/missing `uc_name`

Pick one of:
- (A) Emit title `'(UC-003)'` when `uc_name` is empty/null. **Recommended.**
- (B) Skip the title entirely.

Document the choice in the implementation commit.

### Step 4 — tests

Per `test-spec.md`. RED first, GREEN after. Use a stubbed Cypher driver or the
existing fixture pattern in `render.test.ts` — do NOT hit a live Neo4j instance
in tests.

## Risks

- **Element ordering:** if `titleText` is placed before background rects, it will
  be hidden. Always last in the spread.
- **Snapshot drift:** any existing golden/snapshot assertion on activity scenes
  will need to be updated. Search `*.snap` files near `render.test.ts` and update
  if needed.
- **Logical id collision:** none — `${ucId}::title` is unique per UC.

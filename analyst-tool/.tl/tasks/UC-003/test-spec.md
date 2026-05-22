---
id: UC-003-BE
title: Test spec — Activity renderer diagram title
runner: vitest
file: server/src/render/render.test.ts (extend) or server/src/render/excalidraw/activity.test.ts (new)
feature_request: FR-001
---

# UC-003-BE Test Spec

## Test infrastructure

- Runner: **vitest** (already configured in `server/`).
- Target file: prefer extending `server/src/render/render.test.ts`. If the file is large,
  add a focused `server/src/render/excalidraw/activity.title.test.ts` instead.
- Run: `npm run test --workspace=server`.

## Required test cases

### TC-1: Activity renderer emits a title element with the expected id

Given a UseCase node with `id: 'UC-003'` and `name: 'Regenerate Board from Graph'`
in a stubbed/mocked Cypher result, when the activity renderer is invoked, then the
returned scene's `elements` array contains an Excalidraw text element with
`id === 'title-UC-003'`.

**Acceptance:** test fails before the renderer change (RED), passes after (GREEN).

### TC-2: Title text matches the FR-001 format

Given the same fixture, the matched title element has:
- `text === 'Regenerate Board from Graph (UC-003)'`
- `type === 'text'`
- `fontSize: 24` (matches BA-process pattern; not strict — assert >= 20)
- A non-zero width and height
- `strokeColor: '#1e1e1e'`

**Acceptance:** locked to FR-001 wording — fails on `${ucId} - ${uc_name}` or
similar reorderings.

### TC-3: Title appears in `assembleScene` output (not dropped)

Iterate the full `scene.elements` array (post-`assembleScene`) and confirm the
title element survives — guards against accidental omission from the
`elements: AnyElement[] = [ ...bgRects, ..., titleText ]` spread.

### TC-4: Empty/missing `uc_name` falls back gracefully

Given a UseCase row where `uc_name` is missing or empty (defensive), the title
element either:
- Is still emitted with text `'(UC-003)'` (showing just the id), OR
- Is omitted entirely.

Either behaviour is acceptable — pick one in the impl-brief and document it. Test
asserts no exception is thrown and the rest of the diagram still renders.

### TC-5: Existing tests in render.test.ts continue to pass

Run the existing render-test suite. No prior assertion may be broken.

## Validation rules (from REQ-UC003-02)

| Field          | Rule                                                            |
|----------------|-----------------------------------------------------------------|
| `id`           | Must equal `title-{ucId}` exactly (kebab/lowercase preserved).  |
| `text`         | Must equal `${uc_name} (${ucId})` — order matters.              |
| `logicalId`    | Must be `${ucId}::title`.                                       |
| Element order  | Title must be **after** background rects and steps (z-top).     |

## Negative tests

- Process (BP) renderer output is **unchanged** — assert a snapshot/golden test
  on `ba-process.ts` output stays byte-identical to its baseline. (If no snapshot
  exists yet, skip — don't introduce a snapshot in this task.)

## TDD ordering reminder

Per project convention (`/nacl-tl-regression-test` for fixes, but TDD ordering
applies to features too): write test cases TC-1 and TC-2 first, run them, confirm
RED. Then implement the renderer change. Then re-run, confirm GREEN.

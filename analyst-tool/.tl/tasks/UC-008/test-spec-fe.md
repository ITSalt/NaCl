---
id: UC-008-FE
title: Test spec — Sidebar label subtitle
runner: playwright (e2e workspace)
file: e2e/tests/sidebar.spec.ts (new or extend existing)
feature_request: FR-001
---

# UC-008-FE Test Spec

## Test infrastructure

- Runner: **Playwright** (`e2e/` workspace).
- Run: `npm run test --workspace=e2e`.
- Backend: dev server at http://127.0.0.1:3583. Test should either start the
  full stack via the existing helper or stub `/boards` via `page.route(...)`.

## Required test cases

### TC-1: Subtitle shows when `label` is present

Given the `/boards` response stubs an activity board with
`label: 'Regenerate Board from Graph'`, when the sidebar renders, then
the row shows both `displayName` and the label as a smaller subtitle line.

**Selector hint:** `[data-testid="sidebar-item-label"]` — add this attribute
to the new span during impl.

### TC-2: No subtitle when `label` is null

Given a stubbed `domain-model` board with `label: null`, the row shows only
`displayName`. The subtitle span is absent (or empty).

### TC-3: Filter matches by label

Type a substring of the UC name into the sidebar search input. The board
whose `label` matches stays visible; non-matching rows are hidden.

### TC-4: Layout doesn't break

Visual regression check — the Regenerate button stays clickable and visible
on the right side of each row when subtitles are shown for some rows but not
others. (Use `expect(locator).toBeVisible()` and click coordinates check.)

## Component-level alternative (optional)

If the project gains a vitest+jsdom setup for `web/` later, add a unit test
for `Sidebar.tsx` that renders with stub boards and asserts the subtitle DOM
node. Until then, e2e is the only enforced layer.

## TDD ordering

Write TC-1 → RED → implement subtitle render → GREEN.
Then TC-3 (filter) → RED → update filter → GREEN.
TC-2 should pass for free if the `{label && (...)}` short-circuit is correct.

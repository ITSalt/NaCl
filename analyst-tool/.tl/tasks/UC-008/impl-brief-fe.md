---
id: UC-008-FE
title: Implementation brief — Sidebar label subtitle
feature_request: FR-001
---

# UC-008-FE Implementation Brief

## Files to modify

| File                                          | Change                                                              |
|-----------------------------------------------|---------------------------------------------------------------------|
| `web/src/components/Sidebar.tsx`              | Render `label` subtitle below `displayName`; extend filter.         |
| Frontend `BoardListItem` mirror type          | Add `label: string | null` field. Locate in `state/store.ts` or `api/client.ts`. |
| Sidebar stylesheet (CSS or CSS-in-JS module) | Style for `.sidebar-item-label` (smaller, muted, ellipsis on overflow). |
| `e2e/tests/sidebar.spec.ts`                   | Add tests TC-1..TC-4 from `test-spec-fe.md`.                        |

## Files NOT to modify

- `server/` — UC-008-BE owns the API.
- Other components — keep blast radius minimal.

## Step-by-step

### Step 1 — Mirror type

Find the FE type for `BoardListItem` (likely in `web/src/state/store.ts` or
`web/src/api/client.ts`). Add:

```ts
label: string | null;
```

If TypeScript complains in `Sidebar.tsx` about the field not existing on `board`,
the mirror type wasn't found yet — search again before improvising.

### Step 2 — DOM markup

In `web/src/components/Sidebar.tsx` around line 308 (`<span className="sidebar-item-name">`),
restructure the row to include a subtitle. Suggested change (preserve existing
classNames where possible — match the project's style):

```tsx
<button
  className={clsx('sidebar-item sidebar-item--flex', { 'sidebar-item--active': selectedBoard === board.name })}
  title={`${board.name}.excalidraw`}
  onClick={() => void selectBoard(board.name)}
>
  <span className="sidebar-item-dot">{statusDot(board.syncStatus)}</span>
  <span className="sidebar-item-text">
    <span className="sidebar-item-name">{board.displayName}</span>
    {board.label && (
      <span className="sidebar-item-label" data-testid="sidebar-item-label">
        {board.label}
      </span>
    )}
  </span>
</button>
```

### Step 3 — Styles

Add to the sidebar's stylesheet (find by searching for `.sidebar-item-name`):

```css
.sidebar-item-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;       /* enables ellipsis on children */
  flex: 1 1 auto;
}
.sidebar-item-label {
  font-size: 0.75rem;
  color: var(--text-muted, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
```

If the project uses a different theme variable name, match it; do not introduce
a new color token.

### Step 4 — Filter

Update the filter at line 151:

```ts
const matchesFilter = (b: BoardListItem) =>
  b.displayName.toLowerCase().includes(filter.toLowerCase()) ||
  (b.label?.toLowerCase().includes(filter.toLowerCase()) ?? false);

const filteredBoards = filter ? boards.filter(matchesFilter) : boards;
```

### Step 5 — E2E tests

Per `test-spec-fe.md`. Use `page.route('**/boards', (route) => route.fulfill({...}))`
to stub the API response so tests are deterministic and don't depend on a project
state.

## Risks

- **Layout overflow:** boards with very long UC names could push the Regenerate
  button off-screen. The CSS above (ellipsis on `.sidebar-item-label`,
  `min-width: 0` on the wrapper) prevents this — verify in TC-4.
- **Type duplication:** if `BoardListItem` is duplicated between server and web,
  both must stay in sync. Consider a TODO comment pointing at the duplication —
  do not refactor in this FR.
- **Existing behaviour:** clicking the row still selects the board; clicking
  Regenerate does not select. Don't break this.

## Validation gate

- [ ] `npm run build --workspace=web` is clean.
- [ ] `npm run test --workspace=e2e` passes the new sidebar tests.
- [ ] Manual: open the running app against a project with at least one activity
      and one domain-model board. Activity rows show subtitles. Domain-model
      rows do not. Filter by label works.

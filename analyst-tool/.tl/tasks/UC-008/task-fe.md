---
id: UC-008-FE
uc: UC-008
title: Sidebar — render `label` as subtitle below board id
type: uc-fe
wave: 2
agent: nacl-tl-dev-fe
feature_request: FR-001
priority: high
status: pending
depends_on: [UC-008-BE]
blocks: []
---

# UC-008-FE — Sidebar shows `label` subtitle

## User Story

As an Analyst, I want the sidebar to show each board's UC/BP name as a subtitle
beneath its id, so that I can identify boards at a glance without opening them.

## Actor

**SR-ANALYST** (single human operator; admin; local).

## Preconditions

- UC-008-BE merged: `GET /boards` items include `label: string | null`.
- The frontend's `BoardListItem` mirror type is updated to include `label`.

## Postconditions

- `CMP-SIDEBAR` renders the `label` (when non-null) as a subtitle line
  beneath `board.displayName` in each sidebar item row.
- When `label` is `null`, the row renders unchanged (single-line, just `displayName`).
- Filtering (the existing search box) also matches `label`, not just `displayName`.

## User Interactions

| Step | Step ID         | User action                              | System response                                                                  | UI element             |
|------|-----------------|------------------------------------------|----------------------------------------------------------------------------------|------------------------|
| 1    | (existing)      | User opens the sidebar                   | Sidebar lists boards grouped by kind.                                            | `Sidebar.tsx`          |
| 2    | (FR-001)        | (passive)                                | Each row shows `displayName` and, below it (smaller font), `label` if non-null.  | `Sidebar.tsx` row markup |
| 3    | (FR-001 stretch)| User types in the search box             | Filter matches against both `displayName` and `label` (case-insensitive).        | `Sidebar.tsx:151`      |

## Forms

No forms — this is a list-rendering change.

## Domain context

`BoardListItem` (frontend mirror) — extend with `label: string | null`. Locate
the existing type. If not extracted yet, find it inline in `web/src/state/store.ts`
or `web/src/api/client.ts` and add the field there.

## Requirements

| ID            | Type       | Priority | Description                                                                                                              |
|---------------|------------|----------|--------------------------------------------------------------------------------------------------------------------------|
| REQ-UC008-01  | Functional | Must     | Sidebar items render `label` as a subtitle when non-null. Filter matches `label`. Backwards-compatible: null → no subtitle. |

## Acceptance Criteria

- See `acceptance.md`. Key items: subtitle visible when `label` set,
  invisible when null, sidebar layout doesn't break, search filters by label.

## Implementation Pointer

- File: `web/src/components/Sidebar.tsx` (lines 287–328 build the tree).
- Insert markup directly after the `<span className="sidebar-item-name">` line
  (currently line 308) — wrap the existing single span and the new subtitle span
  in a column flex container.
- Suggested DOM (illustrative — match the project's existing className conventions):
  ```tsx
  <span className="sidebar-item-text">
    <span className="sidebar-item-name">{board.displayName}</span>
    {board.label && (
      <span className="sidebar-item-label">{board.label}</span>
    )}
  </span>
  ```
- Add CSS for `.sidebar-item-label` in the existing sidebar stylesheet:
  smaller font, muted color, `text-overflow: ellipsis` on overflow.
- Filter update at line 151:
  ```ts
  ? boards.filter((b) =>
      b.displayName.toLowerCase().includes(filter.toLowerCase()) ||
      (b.label?.toLowerCase().includes(filter.toLowerCase()) ?? false)
    )
  ```

## Notes

- No new component needed — extend `Sidebar.tsx` in place.
- The Regenerate button column layout must not be pushed off-screen; verify
  manually after implementing.
- For activity-only / process-only boards the label is the UC/BP name; for
  `domain-model` and `context-map` the label is null and the row stays as today.

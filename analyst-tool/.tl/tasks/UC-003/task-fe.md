---
id: UC-003-FE
uc: UC-003
title: Activity board UI — no FE work in FR-001
type: uc-fe
wave: 2
agent: nacl-tl-dev-fe
feature_request: FR-001
priority: low
status: no-op
depends_on: [UC-003-BE]
blocks: []
---

# UC-003-FE — No FE work in FR-001

FR-001 changes the **activity renderer's output** (a server-side change inside
`server/src/render/excalidraw/activity.ts`). The frontend does not need any
modifications to consume the change:

- Excalidraw editor renders whatever scene the file contains. The new
  `title-{ucId}` element is just another standard Excalidraw text element.
- The Regenerate button (`web/src/components/Sidebar.tsx`) and the
  RegenConfirmDialog flow are unchanged.
- The StatusBar timestamp behavior is unchanged.

## Status

**no-op for FR-001.** Mark as `done` after UC-003-BE ships and a manual visual
check confirms the title shows up in the Excalidraw canvas after regenerate.
No code changes, no PR.

## Verification (instead of dev work)

1. Run UC-003-BE.
2. In the running app, open an activity board (e.g. `activity-UC-003`).
3. Click Regenerate.
4. Confirm the new title text `"Regenerate Board from Graph (UC-003)"` appears
   centered above the swimlanes. (This is purely a visual/manual check —
   the FE has no logic to test.)

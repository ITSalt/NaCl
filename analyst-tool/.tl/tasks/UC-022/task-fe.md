---
id: UC-022-FE
type: fe
wave: 6
agent: nacl-tl-dev-fe
priority: medium
depends_on: [UC-022-BE]
blocks: []
module: M-WEB-UI
---

# UC-022-FE — Interface-model board in web navigator

## Description
Surface the new `interface-model` board kind in the web UI so the analyst can see and regenerate it.
Depends on UC-022-BE (backend discovery + renderer).

## Target files
- `web/` board navigator / sidebar (find the component that lists discovered boards and renders the ↺ Regenerate control — likely `web/src/components/Sidebar*` / board list).
- Any board-kind → display-name / icon map on the FE side.

## Main flow
1. Confirm whether the navigator is **data-driven** from the backend `renderable`/board-list endpoint.
   - If YES (boards auto-appear once backend registers the kind): the only FE work is a friendly display
     name/icon for `interface-model` (and grouping). Verify the ↺ Regenerate button posts the correct board name.
   - If NO (hard-coded board kinds): add `interface-model` to the FE board-kind registry with label
     "Interface Model" / "Модель интерфейсов" and wire the regenerate action.
2. Ensure the board opens in the Excalidraw editor like other generated boards.

## Requirements
- REQ-UC022-04 (behavioral): interface-model board is selectable in the navigator and regenerable via the ↺ control.

## Acceptance / verify
- [ ] After UC-022-BE, the interface-model board appears in the navigator for a project that has Forms/Screens.
- [ ] ↺ Regenerate triggers `POST /skills/regenerate { board: "interface-model" }` and the editor reloads the result.
- [ ] e2e (Playwright) covers: board listed → regenerate → canvas shows form cards. Runner: `npm run test --workspace=e2e`.

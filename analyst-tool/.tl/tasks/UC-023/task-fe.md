---
id: UC-023-FE
type: fe
wave: 7
agent: nacl-tl-dev-fe
priority: medium
depends_on: [UC-023-BE]
blocks: []
module: M-WEB-UI
---

# UC-023-FE — State-machine / code-contract boards in web navigator

## Description
Surface the new `state-machine` (per RuntimeContract/Screen) and `code-contract` board kinds in the web
navigator. Same pattern as UC-022-FE — likely data-driven discovery, so mostly display-name/icon mapping.

## Target files
- `web/` board navigator / board-kind registry (same component as UC-022-FE).

## Main flow
1. Add display names: `state-machine` → "State Machine" / "Машина состояний"; `code-contract` → "Code Contracts" / "Контракты".
2. If state-machine boards are per-contract (`state-machine-<contractId>`), ensure the navigator groups/lists them like per-UC activity boards.
3. Verify ↺ Regenerate posts the correct board names.

## Requirements
- REQ-UC023-01/03 (FE surfacing): state-machine and code-contract boards are listed, regenerable, and open in the editor.

## Acceptance / verify
- [ ] After UC-023-BE, the new boards appear in the navigator for a project that has the source nodes (Sample B: Runtime*; fc: Screen*).
- [ ] ↺ Regenerate produces the board and the editor renders it.
- [ ] e2e covers list → regenerate → canvas non-empty. Runner: `npm run test --workspace=e2e`.

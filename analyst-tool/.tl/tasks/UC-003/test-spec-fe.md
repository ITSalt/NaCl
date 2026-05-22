---
id: UC-003-FE
title: Test spec — no-op for FR-001
feature_request: FR-001
---

# UC-003-FE Test Spec — N/A for FR-001

No FE code changes in this feature. No automated FE test is added.

**Manual visual check** (run once after UC-003-BE merges):
- Open the running analyst-tool, select an activity board, click Regenerate.
- Confirm the title `"<UC name> (<UC-id>)"` appears centered above the swimlanes.

If a regression test is later requested for the title showing up in the canvas
end-to-end, write a Playwright spec under `e2e/` — but that is not a FR-001 task.

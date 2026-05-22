# Wave 4 audit — fix plan

**Created:** 2026-05-11
**Source:** External audit verified against repo HEAD `d2d90eb` on `main`.
**Verdict:** All audit findings reproduced. Wave 4 is NOT release-ready.

## Verification of audit claims

| # | Claim | Verified? | Evidence |
|---|---|---|---|
| 1 | `publishTaskEvent` not wired into worker/engine | YES | `grep -rn` in `backend/src` returns only the definition in `task.events.ts:33` and its unit test. `worker.ts`, `engine.ts`, `event-listener.ts` have zero references. |
| 2 | `publishNotification` / `pushSseEvent` not wired after terminal commits | YES | Same — only the publisher modules and their unit tests reference these symbols. No call from `queue/worker.ts` or `workflow-engine/`. |
| 3 | `pnpm -r typecheck` fails (3 errors) | YES | Reproduced: `usage-report.routes.ts:35`, `usage-report.service.ts:146`, `usage-report.authz.test.ts:50`. Root cause for the first two: `exactOptionalPropertyTypes: true` rejects passing `string \| undefined` where the param type is declared `string` (optional, but not `\| undefined`). Test:50 is an empty `db.delete().where()` call missing the required predicate argument. |
| 4 | `pnpm -r lint` fails on `packages/shared/src/asset.ts:12` | YES | Inline `import('./task-105.js').FileType` annotation; rule `@typescript-eslint/consistent-type-imports` forbids it. `FileType` is already re-exported on line 4 — drop the inline import. |
| 5 | `conductor-state.json` overstates "typecheck clean" | YES | File literally states `"typecheck": "clean across packages/shared, frontend, backend"`. |
| 6 | `status.json` Wave 4 still `"status": "planned"` while task entries are `"done"` | YES | `.tl/status.json` line ~51. |
| 7 | Backend route/integration tests not re-verified (Postgres unavailable) | YES | DB-backed tests need Docker; auditor's environment had it down. Must be re-run after the fixes. |

**Conclusion:** Audit is accurate end-to-end. Proceed with remediation.

---

## Fix plan

Group order is the recommended execution order (cheap-and-blocking first, functional gap, then state reconciliation, then verification).

### FIX-A — Build hygiene (release blocker, ~30 min)

#### FIX-A1 — Lint: drop inline `import()` in `packages/shared/src/asset.ts`

- File: `packages/shared/src/asset.ts:12`
- Change: replace `file_type: import('./task-105.js').FileType;` with `file_type: FileType;`. `FileType` is already re-exported from line 4, so the inline import is redundant.
- Acceptance: `pnpm --filter @project-alpha/shared lint` → clean.

#### FIX-A2 — Typecheck: `exactOptionalPropertyTypes` in reporting

- Files:
  - `backend/src/modules/reporting/usage-report.routes.ts:35`
  - `backend/src/modules/reporting/usage-report.service.ts:146`
- Root cause: `UsageReportQuery.user_id` and `.task_type` (and `AggregationParams.userId`, `.taskType`) are declared as plain `string` (optional via `?:`) but the call sites pass values typed `string | undefined` from Zod parse output. With `exactOptionalPropertyTypes: true`, the optional shape must explicitly include `| undefined`.
- Decision needed (pick ONE — both are valid; option B is the smaller diff):
  - **Option A** — widen the type declarations to `user_id?: string \| undefined` (and similarly for `task_type`, `userId`, `taskType`).
  - **Option B** — strip `undefined` at the call site: build the arg conditionally with `...(query.user_id !== undefined && { user_id: query.user_id })` and same for the inner aggregation call.
- Acceptance: `pnpm --filter backend typecheck` clean on these two files.

#### FIX-A3 — Typecheck: empty `db.delete().where()` in `usage-report.authz.test.ts`

- File: `backend/tests/reporting/usage-report.authz.test.ts:50`
- The `afterAll` calls `app.db.delete(users).where(/* comment only */)` — no predicate. With strict signatures, `where()` requires its arg.
- Fix: either drop the `.where()` and delete every row in `users` for the test, or pass a real predicate. Looking at the test, the safe action is the targeted cleanup the comment hints at — capture the two seeded IDs in `beforeAll` and delete by `inArray(users.id, [adminId, endUserId])`. The current code never actually deletes anything anyway, so this is also a test-hygiene fix.
- Acceptance: backend `typecheck` and the test suite still pass.

### FIX-B — SSE / notification wiring (functional gap, ~1–2 days)

This is the substantive Wave 4 gap and the only piece that needs spec-level care. Both publishers exist but no production code path calls them.

#### FIX-B1 — Wire `publishTaskEvent` (UC-105 lifecycle SSE)

Required emissions, per UC-105 spec (`task_status_changed` on every transition, `task_completed` / `task_failed` / `task_cancelled` as terminal events):

| When | Source | Event |
|---|---|---|
| Task is dispatched (queued → running) | `workflow-engine/engine.ts` on first step enqueue | `task_status_changed` |
| Workflow step succeeds / advances | `workflow-engine/engine.ts` after step transition commits | `task_status_changed` (with `step_id`) |
| Terminal success | `workflow-engine/engine.ts` on workflow-complete commit | `task_completed` |
| Terminal failure | `workflow-engine/engine.ts` on workflow-failed commit | `task_failed` |
| User-initiated cancel | `content/task.routes.ts` cancel handler (UC-107) after `tasks.status='cancelled'` commit | `task_cancelled` |

Implementation rules (from `task.events.ts` header comment — RESPECT THESE):
- **Always after COMMIT** — never inside the same transaction as the row mutation.
- Engine is the FSM authority for status; it already subscribes to the workflow bus in `event-listener.ts`. Add the `publishTaskEvent` calls there at the post-commit boundary.
- Cancel emits from the cancel route, not from the engine (race-free because the cancel handler owns the commit for terminal-state transitions).

Test:
- Add an integration test that drives a fake task through queued → running → completed and asserts a real SSE consumer (via `subscribeToTask`) receives the expected event sequence.

#### FIX-B2 — Wire `publishNotification` + `pushSseEvent` (UC-106)

Required emissions on terminal commit:

| Terminal state | Notification kind |
|---|---|
| `completed` | `task_ready` |
| `failed` | `task_failed` |
| `cancelled` | none (per UC-106 spec — cancellations are user-initiated; no notification) |

Implementation rules (from `notification.service.ts` header comment — RESPECT THESE):
- `publishNotification(...)` is called **inside** the engine's terminal-commit transaction (notification row + task row in the same tx).
- `pushSseEvent(...)` is called by the **caller** AFTER COMMIT (same boundary as FIX-B1).
- Wire both in `workflow-engine/engine.ts` (or `event-listener.ts`) at the workflow-terminal handler.

Test:
- Integration test: complete a fake task, assert one notification row exists for the owner with `kind='task_ready'`, and that an SSE subscriber on the user channel received the corresponding event.
- Repeat for a failed task.

### FIX-C — State reconciliation (~10 min)

#### FIX-C1 — `.tl/status.json` Wave 4 closure

- Set `waves.list[4].status` → `"complete"` once FIX-A and FIX-B are merged AND backend tests re-run green.
- Add `"completed_at": "<ISO ts>"`.
- Reconcile the per-task `phases.review` / `phases.qa` fields for UC-105/106/107/108/401/103-FE so they reflect ground truth (currently the wave is "planned" so they were never closed properly).

#### FIX-C2 — `.tl/conductor-state.json` correction

- Update `qualityGate.typecheck` from the incorrect `"clean across…"` to the actual final state after FIX-A. Same for `tests_backend` once the full backend suite is rerun under Docker.

### FIX-D — Verification gate (must all be green before declaring Wave 4 done)

1. `pnpm -r lint` → clean.
2. `pnpm -r typecheck` → clean.
3. `pnpm --filter frontend test` → 234/234 (unchanged).
4. `pnpm --filter backend test` under Docker (Postgres reachable) → full suite green, including the new SSE/notification integration tests from FIX-B.
5. Manual smoke: open `GET /api/content/tasks/:taskId/events` against a real task, dispatch it through the queue, observe the lifecycle event stream end-to-end.
6. Repeat for the user notification channel.

Only after step 6 passes should FIX-C be applied and the wave closed.

---

## Out of scope (intentional)

- Playwright/E2E run — the auditor flagged it as skipped due to NO_INFRA. That belongs to the regular QA pass, not this remediation. Tracked separately.
- Re-running Wave 4 `/nacl-tl-verify` on a Docker-up environment — that is what FIX-D step 4 accomplishes.

## Notes for the operator

- FIX-A is independent and can be shipped first as a small "build hygiene" commit; it unblocks CI immediately.
- FIX-B should ship as a single commit (or paired BE commits) since the two publishers are conceptually one feature ("post-commit emission").
- Per `CLAUDE.md` bug fix protocol, this is an **L2** fix (multi-UC: UC-105 + UC-106 + UC-107 cancel emit + UC-401 typecheck). Update SA `USE_CASE` / `API_CONTRACT` nodes for UC-105 and UC-106 to reflect the precise emit timing (post-commit) before code changes; spec already implies it via comments in `task.events.ts` / `notification.service.ts` but should be canonical in the graph.

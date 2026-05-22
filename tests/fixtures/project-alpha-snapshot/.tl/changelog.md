# Changelog

### [2026-05-22] nacl-tl-fix: prepare-prompt VLM receives no image; HTML assets in task results
- **Level:** L2
- **Status:** PASS
- **Root cause:** (1) All 5 workflow YAMLs had `prepare-prompt` with no `inputs`, so the user's uploaded file was never in the payload and never reached the VLM. The `openai-chat-completions` adapter sent text-only messages, ignoring `model_kind=vlm`. (2) `getTaskDetail` returned ALL `generated_assets` including stale HTML rows (from old code that saved OpenRouter error pages as assets with `is_final=true`).
- **Affected UC:** UC-150, UC-202
- **Docs updated:** `docs/SA/usecases/UC-150.md` — added VLM image-input implementation note
- **Code changed:**
  - `backend/src/workflows/{retouch,model,interior,video,full-flow}.yaml` — added `inputs: [{from: input_files[0].s3_key}]` to `prepare-prompt`
  - `backend/src/queue/providers/adapters/types.ts` — added `imageUrl?: string` to `AdapterRequest`
  - `backend/src/queue/providers/adapters/openai-chat-completions.ts` — multimodal content array when `imageUrl` is set
  - `backend/src/modules/queue/worker.ts` — for `vlm` slots: read image from S3, base64-encode, pass as `imageUrl`; covers both `prepare-prompt` (`s3_key`) and verifier (`asset_s3_key`)
  - `backend/src/modules/content/task.service.ts` — filter `generatedAssets` to `file_type IN ('image','video')`
- **Tests:** `src/queue/providers/adapters/__tests__/openai-chat-completions-vlm.test.ts` (TC-9 RED→GREEN, TC-10 stay GREEN)

### [2026-05-22] nacl-tl-fix: task status stale on SSE initial connect — missing synthetic status_changed
- **Level:** L1
- **Status:** PASS
- **Root cause:** SSE route emitted synthetic `status_changed` only on reconnect (when `Last-Event-ID` header present), not on initial connect. Race window between GET response and `subscribeToTask` registration caused missed state transitions.
- **Affected UC:** UC-105
- **Docs updated:** none (L1)
- **Code changed:** backend/src/modules/content/task.routes.ts (always emit status_changed on SSE open)
- **Tests:** backend/tests/content/task.events.test.ts — new regression test `initial connect (no Last-Event-ID) → synthetic status_changed emitted immediately` (RED→GREEN); updated `publishTaskEvent status_changed` assertion + `task_cancelled live event` assertion for adjacent affected test in task.cancel.sse.test.ts

### [2026-05-21] nacl-tl-fix: text/html assets download as .bin + VerdictParseError shows Buffer JSON (L1 × 2)
- **Level:** L1
- **Status:** PASS
- **Root cause A:** `mimeToExt()` in `asset.service.ts` didn't normalise MIME parameters (charset) before MAP lookup and was missing text/html, text/plain, application/json entries — any `text/html; charset=utf-8` asset downloaded as `.bin`
- **Root cause B:** `safeStringify()` in `verdict-mapper.ts` called `JSON.stringify(Buffer)` which outputs `{"type":"Buffer","data":[...]}` instead of the human-readable decoded text
- **Affected UC:** UC-108 (asset download), UC-151 (verifier error message)
- **Docs updated:** none (L1)
- **Code changed:** `backend/src/modules/content/asset.service.ts`, `backend/src/modules/content/verifier/verdict-mapper.ts`
- **Tests:** `backend/tests/content/asset.mime-to-ext.test.ts` (new, Path A) — 6 tests RED→GREEN

### [2026-05-21] nacl-tl-fix: boot-refresh race condition — reload/direct-link redirects to /login (L1)
- **Level:** L1
- **Status:** PASS
- **Root cause:** `useBootRefresh` fired via `useEffect` AFTER React rendering. TanStack Router's `beforeLoad` hooks run during the routing phase, before any component mounts. So on page reload, child route guards (`sessions/_layout`, `admin/_layout`) saw `user: null` and redirected to `/login` before the refresh call could complete.
- **Affected UC:** UC-102 (boot-refresh), UC-103 (sessions guard), UC-302 (admin guard)
- **Docs updated:** none (L1 — spec in impl-brief-fe.md §5 already described "after refresh resolves, hand control to the router")
- **Code changed:** `frontend/src/routes/__root.tsx` (moved refresh from `useEffect` to `async beforeLoad` on root route; removed splash state)
- **Tests:** existing test in `src/routes/boot-refresh.test.tsx` transitioned; RED→GREEN confirmed
- **Pre-existing failures:** none

### [2026-05-21] nacl-tl-fix: FR-007 — VERDICT_PARSE_ERROR in verify step (L1)
- **Level:** L1
- **Status:** PASS
- **Root cause:** `isLlmSlot = !isVerifier && (vlm|text_llm)` — `!isVerifier` guard forced verifier+VLM slots onto legacy `openrouterAdapter` which sent raw payload (with `kind`, `asset_s3_key`, etc.) to OpenRouter `/chat/completions` without a `messages` array. OpenRouter returned HTML error page → `VERDICT_PARSE_ERROR`.
- **Affected UC:** UC-202 (dispatch routing), UC-151 (verifier петля)
- **Docs updated:** none (L1 — spec was current)
- **Code changed:** `backend/src/modules/queue/worker.ts` (removed `!isVerifier &&` guard; verifier branch uses `outputText` instead of empty `output_buffer` as `rawResponse`)
- **Tests:** `tests/queue/worker.verifier-vlm.test.ts` (new regression test, RED→GREEN confirmed)
- **Pre-existing failures:** none

### [2026-05-21] nacl-tl-fix: UC-104+UC-112+UC-202 PROVIDER_501 in retouch.generate — iter 3 (L2)
- **Level:** L2
- **Status:** SHIP
- **Root cause:** Two independent regressions behind one symptom:
  1. **BUG #1 (image_input unreachable):** api.kie.example.invalid server tried to fetch `image_input` URL pointing at internal S3 (localhost:9000 / VPC-internal). Solution: stream-upload bytes to `kieai.redpandaai.co/api/file-stream-upload` (separate host from jobs API), pass returned `downloadUrl` as `image_input`. ADR-011 documents the constraint that internal presigned URLs cannot be passed to external SaaS providers.
  2. **BUG #2 (missing routing metadata):** `enqueueFirstStep` built payload without `model_kind`/`api_shape`/`endpoint_path`/`model_profile_id`. Worker without `model_kind` classified first steps as legacy `image_gen` → `openrouterAdapter` returned binary HTML buffer → `output_text` null → next step (generate) received payload with unrendered `{prepared_prompt}` template literal.
- **Affected UC:** UC-104 (createTask), UC-112 (restartTask), UC-202 (dispatcher), UC-202-BE-FR003
- **Docs updated:** ADR-011 (new), `REQ-FR-022` extended in Neo4j, `ActivityStep step-202-4a` added
- **Code changed:**
  - `backend/src/modules/content/workflow-engine/step-payload.ts` (NEW — `buildStepPayload` helper)
  - `backend/src/modules/content/workflow-engine/engine.ts` — use `buildStepPayload`
  - `backend/src/modules/content/workflow-engine/index.ts` — export helper
  - `backend/src/modules/content/task.service.ts` — `enqueueFirstStep` + `restartTask` use helper; hydrate `input_files`
  - `backend/src/modules/queue/providers/kie-ai.ts` — `getObject` → `/api/file-stream-upload` → `downloadUrl` flow, 30 MB guard
- **Tests:** 5 new regression tests RED→GREEN; baseline 1262 tests pass (`kie-ai.adapter.test.ts` + `task.service.enqueue-payload.test.ts` + `task.restart.test.ts`)
- **Verified:** E2E asset `d53764bd-5806-4228-87e6-651cd32a9e4b` image/jpeg generated; all 10 AC confirmed by verifier
- **Traces:** `.tl/diagnostics/UC-202-PROVIDER_501-trace-2026-05-21*.log`, `.tl/diagnostics/UC-202-engine-trace-2026-05-21.log`
- **Follow-up:** FR-007 — verify step `VERDICT_PARSE_ERROR` (separate L2 fix, VLM verifier receives HTML buffer)

### [2026-05-21] nacl-ship: FR-007 bug report created — verify step VERDICT_PARSE_ERROR (HTML buffer instead of JSON verdict)
- **File:** `.tl/feature-requests/FR-007-verify-html-buffer-bug.md`
- **Status:** OPEN — pending `/nacl-tl-fix L2` separate iteration

### [2026-05-21] BA cleanup — pruned 46 EntityAttributes with no SA twin, added 4 BA RELATES_TO edges, XL7.3 cleared (plan `.tl/plans/BA-FIX-2026-05-21.md`)

### [2026-05-21] SA validation cleanup — CRITICAL L1.2 fixed, 156 WARNINGs resolved, 49 INFO triaged (plan `.tl/plans/SA-FIX-2026-05-21.md`)

### [2026-05-21] nacl-sa-feature: FR-006 — Restart failed/timeout task (UC-112 spec reconciliation)
- **Scope:** UC-112 written into Neo4j graph after-the-fact (code already shipped via nacl-tl-fix entries below)
- **Graph:** +1 UseCase, +10 ActivityStep, +1 Form, +2 FormField, +1 Component, +6 Requirement, +1 CONTAINS_UC, +1 ACTOR
- **FR artifact:** `.tl/feature-requests/FR-006-restart-failed-task.md`
- **Validation:** scoped L4/L5 passed (0 problems)

### [2026-05-21] nacl-tl-fix: restartTask() — stale queue_items block re-enqueue + TASK_NOT_RESTARTABLE returns 500
- **Level:** L1
- **Status:** PASS
- **Root cause:** (1) `enqueue()` uses `ON CONFLICT DO NOTHING` on `(task_id, step_id)` — when a `failed` queue_items row exists, the re-insert silently no-ops and the task never transitions to queued. (2) `TASK_NOT_RESTARTABLE` was absent from the `STATUS` map in `api-error.ts`, causing ApiError to default to 500 instead of 409.
- **Affected UC:** UC-112 — Task restart
- **Docs updated:** none (L1)
- **Code changed:**
  - `backend/src/modules/content/task.service.ts` — DELETE queue_items for task before calling enqueueFirstStep inside restartTask transaction
  - `backend/src/errors/api-error.ts` — added `TASK_NOT_RESTARTABLE: 409` to STATUS map
- **Tests:** `backend/tests/content/task.restart.test.ts` (Path A — regression test written before fix, RED→GREEN confirmed)

### [2026-05-21] nacl-tl-fix: restart button missing on failed task page (UC-112)
- **Level:** L3 (feature unspecified — spec created during fix)
- **Status:** PASS
- **Root cause:** Restart-failed-task feature was never specified in SA. No UC, no BE endpoint, no FE component existed.
- **Affected UC:** UC-112 (новый) — Перезапуск провальной задачи
- **Docs updated:** `.tl/tasks/UC-112/task.md` created; UC-112 node added to Neo4j graph; `TASK_NOT_RESTARTABLE` added to shared error codes
- **Code changed:**
  - `packages/shared/src/task-112.ts` — RestartTaskResponse type
  - `packages/shared/src/errors.ts` — TASK_NOT_RESTARTABLE error code
  - `packages/shared/src/index.ts` — re-export task-112
  - `backend/src/modules/content/task.service.ts` — restartTask()
  - `backend/src/modules/content/task.routes.ts` — POST /api/content/tasks/:taskId/restart
  - `frontend/src/features/task-detail/hooks.ts` — useRestartTaskMutation()
  - `frontend/src/features/task-detail/RestartTaskButton.tsx` — new component
  - `frontend/src/features/task-detail/TaskDetailPage.tsx` — render RestartTaskButton for failed/timeout
- **Tests:** existing suite (Path B — no pre-existing coverage of restart, no import of new files found)
- **Status detail:** 1249 BE + 571 FE tests, all green. No test infrastructure for restart flow yet (no unit test exists for this new code path).

### [2026-05-21] nacl-tl-fix: api.kie.example.invalid PROVIDER_422 — nano-banana model names have wrong prefix
- **Level:** L1
- **Status:** PASS
- **Root cause:** api.kie.example.invalid catalog used "google/nano-banana-*" names as internal identifiers, but api.kie.example.invalid API only accepts the short form ("nano-banana-pro", etc.). Engine passes model_name verbatim → 422.
- **Affected UC:** UC-202-BE (api.kie.example.invalid provider adapter) / retouch generate step
- **Docs updated:** none (L1)
- **Code changed:** `backend/src/modules/admin/list-models-adapters/kie-ai.adapter.ts` (3 catalog entries renamed), `backend/migrations/0022_fix_kie_nano_banana_model_names.sql` (data migration for existing model_profiles)
- **Tests:** existing test `tests/queue/providers/kie-ai.adapter.test.ts` already used "nano-banana-pro"; 1249/1249 pass post-fix

### [2026-05-21] nacl-tl-fix: api.kie.example.invalid PROVIDER_404 — /generate endpoint removed
- **Level:** L2
- **Status:** PASS
- **Root cause:** api.kie.example.invalid migrated from sync `POST /generate` (binary response) to async `POST /api/v1/jobs/createTask` + poll `GET /api/v1/jobs/recordInfo`. The `kieAiAdapter` still called the old endpoint.
- **Affected UC:** UC-202-BE (api.kie.example.invalid provider adapter)
- **Docs updated:** `docs/SA/UC-202-kie-ai-async-protocol.md` (created)
- **Code changed:** `backend/src/modules/queue/providers/kie-ai.ts` (full rewrite for async task protocol)
- **Tests:** `tests/queue/providers/kie-ai.adapter.test.ts` (rewritten for async API + 4 new test cases; all 9 pass)

### [2026-05-21] nacl-tl-fix: SessionBreadcrumb crashes — task.session undefined from partial cache
- **Level:** L1
- **Status:** PASS
- **Root cause:** `useCreateSessionMutation` seeds the TanStack Query cache key `['tasks', taskId]` with a `TaskPublic` object (UC-104 shape, no `session` field). `TaskDetailPage` guarded for missing `assets`/`latest_verdict` but not `session`, so `<SessionBreadcrumb session={undefined}>` threw `TypeError: Cannot read properties of undefined (reading 'name')` on every post-creation navigation.
- **Affected UC:** UC-105-FE
- **Docs updated:** none (L1)
- **Code changed:** `frontend/src/features/task-detail/TaskDetailPage.tsx` — added `session` coercion alongside existing `assets`/`latest_verdict` coercions
- **Tests:** `frontend/src/features/task-detail/__tests__/TaskDetailPage.session-undefined.test.tsx` (new regression test, RED→GREEN confirmed)

### [2026-05-20] nacl-tl-fix: PopoverContent transparent background — step combobox shows through form
- **Level:** L1
- **Status:** PASS
- **Root cause:** `bg-popover` / `text-popover-foreground` are shadcn design tokens that require `--color-popover` CSS variable. In this project's Tailwind v4 setup (`@import "tailwindcss"` only, no CSS variable definitions) these resolve to `undefined` → transparent background, making form content visible through the open dropdown.
- **Affected UC:** UC-302-FE (PromptTemplate edit form — WorkflowStepCombobox)
- **Docs updated:** none (L1)
- **Code changed:** `frontend/src/components/ui/popover.tsx`, `frontend/src/components/ui/command.tsx`
- **Tests:** `frontend/src/components/ui/popover.test.tsx` (new regression test, RED→GREEN confirmed)

### [2026-05-19] nacl-tl-fix: UC-302-FE filter dropdown not grouped (Все шаги)
- **Level:** L1
- **Status:** UNVERIFIED (no test asserts on optgroup presence; functional filter test passes before+after)
- **Root cause:** UC-302-FE-FR005 updated PromptTemplateForm.tsx (the form step selector) but missed PromptTemplatesPage.tsx (the list-page filter dropdown). The filter still used the flat ALL_STEP_IDS array without grouping or numbering.
- **Affected UC:** UC-302
- **Docs updated:** none (L1, FR-005 spec already described grouped behavior)
- **Code changed:** `frontend/src/features/admin/PromptTemplatesPage.tsx` — replaced flat `<Select>` + `ALL_STEP_IDS` with grouped `<select>` + `<optgroup>` per workflow; each option prefixed with 1-based index within that workflow. Import `workflowLabel` added.
- **Tests:** existing test `selects step and triggers refetch with workflow_step_id` passes (selects by value — unchanged); no test asserts optgroup display
- **Pre-existing failures:** none

## [WAVE-11-PLAN] 2026-05-19 — nacl-tl-plan --feature FR-005
- **Source:** Neo4j SA layer (FeatureRequest FR-005 — Workflow Step Ordering; UC-302 / UC-305 full context)
- **Tasks generated:** 5 — 1 TECH + 4 UC-FR005 (TECH-WF-ORDER-DB, UC-305-BE-FR005, UC-302-BE-FR005, UC-305-FE-FR005, UC-302-FE-FR005)
- **Wave:** WAVE-11 — "FR-005 — Workflow Step Ordering (Flow-view + grouped dropdown)"
- **Files:**
  - `.tl/tasks/TECH-WF-ORDER-DB/` (task, impl-brief, test-spec) — add `step_order INT NOT NULL` + UNIQUE `(workflow_id, step_order)` + CHECK `>= 1` to `workflow_step_configs`; backfill from YAML position via in-migration `VALUES` table + tail-position fallback.
  - `.tl/tasks/UC-305-BE-FR005/` (api-contract, task-be, test-spec, impl-brief, acceptance) — extend GET with `step_order` + default sort + `?grouped=true`; new `PATCH /api/admin/workflow-step-configs/reorder` (transactional, full-coverage + contiguous-range validation); optional `step_order` on POST/PATCH.
  - `.tl/tasks/UC-302-BE-FR005/` (api-contract, task-be, test-spec, impl-brief, acceptance) — new `GET /api/admin/workflow-steps[?grouped=true]` returning the YAML-sourced catalog (sources from `app.workflows` decorator, never the DB).
  - `.tl/tasks/UC-305-FE-FR005/` (api-contract, task-fe, test-spec-fe, impl-brief-fe, acceptance) — `/admin/workflows` page gets `Таблица | Flow` segmented toggle (localStorage), Flow view with `@dnd-kit/sortable` reordering, optimistic updates + RU error toasts, keyboard-accessible drag handles.
  - `.tl/tasks/UC-302-FE-FR005/` (api-contract, task-fe, test-spec-fe, impl-brief-fe, acceptance) — replace flat `Шаг workflow` `<Select>` with shadcn `Command` grouped combobox (one `CommandGroup` per workflow, items `{step_order}. {step_id}`); stored value still `step_id`.
- **Master plan:** `.tl/master-plan.md` §3 — appended Wave 11 section with task table + release note.
- **Status:** `.tl/status.json` — added Wave 11 entry; appended 5 task entries with `feature_request: "FR-005"`, status `pending`; bumped `total_uc_tasks` 56→60, `total_tech` 15→16, `pending` 0→5, `waves.total` 11→12, `waves.planned_through` 10→11.
- **Neo4j graph writes:** `Wave {number: 11}` + 5 `Task` nodes (`TECH-WF-ORDER-DB`, `UC-305-BE-FR005`, `UC-302-BE-FR005`, `UC-305-FE-FR005`, `UC-302-FE-FR005`); `:IN_WAVE`, `:DEPENDS_ON` edges per task; `:GENERATES` edges from UC-302/UC-305 to the respective tasks.
- **Planning status:** PLAN COMPLETE (both UCs have full SA context — activity steps, requirements, forms, attributes; new `SA-WorkflowStepConfig.step_order` attribute + `REQ-FR-WF-ORDER`/`REQ-FR-WF-DROPDOWN` requirements were created during the prior SA-feature step).

### [2026-05-18] nacl-tl-fix: provider_configs base_url doubled paths + api.kie.example.invalid/apiframe static catalogs
- **Level:** L1
- **Status:** PASS (105 test files / 1209 tests green; all 3 functional providers verified via live API)
- **Root cause:** Seed 08 seeded `base_url` WITH version path (e.g. `https://openrouter.ai/api/v1`). List-models adapters appended the same version path again (`/api/v1/models`) → doubled URL → HTTP 404 → 503 to client. Additionally: api.kie.example.invalid and apiframe have no `/models` discovery endpoint and used wrong base domains (`kieai.erweima.ai`, `api.apiframe.pro`).
- **Affected UC:** UC-306 (model catalog refresh)
- **Docs updated:** none (L1)
- **Code changed:**
  - `backend/src/db/seed/08-provider-configs.ts` — corrected all 4 base_urls to host-only; apiframe `.pro` → `.ai`
  - `backend/src/modules/admin/list-models-adapters/openrouter.adapter.ts` — strip trailing slash from base_url
  - `backend/src/modules/admin/list-models-adapters/kie-ai.adapter.ts` — rewritten as static catalog (85 models: 15 LLM + 44 image + 26 video)
  - `backend/src/modules/admin/list-models-adapters/apiframe.adapter.ts` — rewritten as static catalog (82 models from openapi.json sourced 2026-05-18)
  - `backend/tests/admin/list-models-adapters/kie-ai.adapter.test.ts` — rewritten for static catalog (no HTTP mocking)
  - `backend/tests/admin/list-models-adapters/apiframe.adapter.test.ts` — rewritten for static catalog (no HTTP mocking)
  - `backend/tests/admin/model-catalog.routes.test.ts` — updated fixture base_url to match corrected seed
- **DB patched:** Direct UPDATE on provider_configs for openrouter, kie_ai, gemini, apiframe
- **Tests:** PASS (105 test files, 1209 tests; apiframe 14 new tests RED→GREEN; kie-ai 8 tests GREEN; openrouter trailing-slash regression GREEN)
- **Verified via:** Direct API call POST /api/admin/model-catalog/refresh:
  - openrouter: 356 models updated ✓
  - kie_ai: 85 models updated ✓ (static catalog, 15 LLM + 44 image + 26 video)
  - apiframe: 82 models updated ✓ (static catalog from openapi.json)
  - gemini: http_error (expected — dev placeholder key invalid; URL is correct)

## [WAVE-10-PLAN] 2026-05-18 — nacl-tl-plan --feature FR-004
- **Source:** Neo4j SA layer (FeatureRequest FR-004 — ModelProfile model picker + provider model catalog; UC-303 / UC-306 full context)
- **Tasks generated:** 7 — 3 TECH + 4 UC-FR004 (TECH-013, TECH-014, TECH-015, UC-306-BE-FR004, UC-306-FE-FR004, UC-303-BE-FR004, UC-303-FE-FR004)
- **Wave:** WAVE-10 — "FR-004 — ModelProfile model picker + provider model catalog"
- **Files:**
  - `.tl/tasks/TECH-013/` (task, impl-brief, test-spec) — DB migration: `provider_model_catalog_entry` (13 cols + 3 indexes), `model_catalog_source` PG enum, `model_profile.overrides_catalog` column
  - `.tl/tasks/TECH-014/` (task, impl-brief, test-spec) — Shared types (`MODEL_CATALOG_SOURCE_VALUES`, `ProviderModelCatalogEntryPublic`, `ProviderModelCatalogEntryCreateInput`) + idempotent seed for openrouter/api.kie.example.invalid (3 api_shapes)/apiframe/gemini
  - `.tl/tasks/TECH-015/` (task, impl-brief, test-spec) — `ListModelsAdapter` interface + 4 provider implementations (openrouter `/api/v1/models`, api.kie.example.invalid `/v1/models`, apiframe `/v1/models`, gemini `/v1beta/models?key=…`) + factory; reuses existing crypto for `api_key_encrypted`
  - `.tl/tasks/UC-306-BE-FR004/` (task-be, api-contract, impl-brief, test-spec, acceptance) — `GET /admin/model-catalog` (list + filters) + `POST /admin/model-catalog/refresh` (merge: insert new, update existing discovery, deprecate missing discovery; seed rows protected)
  - `.tl/tasks/UC-306-FE-FR004/` (task-fe, api-contract, impl-brief-fe, test-spec-fe, acceptance) — `/admin/model-catalog` page: `ModelCatalogTable`, provider/substring filters, per-provider Refresh button + summary toast, `AdminNavModelCatalog` sidebar entry
  - `.tl/tasks/UC-303-BE-FR004/` (task-be, api-contract, impl-brief, test-spec, acceptance) — `GET /admin/model-profiles/catalog?provider=…` proxy + server-computed `overrides_catalog` on POST/PUT
  - `.tl/tasks/UC-303-FE-FR004/` (task-fe, api-contract, impl-brief-fe, test-spec-fe, acceptance) — `ModelPickerCombobox` (substring search, deprecated grouping, free-text fallback) + `CatalogAutofillBanner` (diff display + Revert) + override badge in list/form
- **Graph writes:** Wave(WAVE-10); 7 Task nodes (IN_WAVE → WAVE-10); 13 DEPENDS_ON edges (TECH chain + UC→TECH/base-UC/UC-306-BE); 4 GENERATES edges from UC-306 and UC-303
- **Status:** PLAN APPLIED — PARTIAL (UNVERIFIED)
- **Missing SA inputs (graph gap, derivable):**
  - `SA-Enum-ModelCatalogSource` node + 2 EnumValues — referenced by `SA-ProviderModelCatalogEntry.source` (`enum:ModelCatalogSource`) but never created in graph. **Mitigation:** TECH-013 defines the PG enum (`model_catalog_source AS ENUM ('seed', 'discovery')`) and TECH-014 ships the TypeScript union (`MODEL_CATALOG_SOURCE_VALUES`); both are authoritative for the codebase. Operator may backfill the graph via `/nacl-sa-domain` later for parity.
- **Scope summary:**
  - TECH-013: PG enum `model_catalog_source`; new `provider_model_catalog_entry` (13 cols, 3 indexes incl. `(provider, model_name) UNIQUE` + CHECK on `default_endpoint_path ~ '^/.+'`); `model_profile.overrides_catalog bool NOT NULL DEFAULT false`
  - TECH-014: shared types in `@project-alpha/shared`; idempotent seed (`ON CONFLICT (provider, model_name) DO UPDATE … WHERE source = 'seed'`) for ~10 rows covering 4 providers and api.kie.example.invalid's 3 api_shapes (REQ-FR-023)
  - TECH-015: 4 HTTP adapters with `ListModelsError` envelope (timeout / http_error / parse_error / no_api_key / no_models_returned); decryption via existing `decryptApiKey`; per-provider id → kind/shape inference rules documented
  - UC-306-BE: list endpoint with `provider/q/include_deprecated` filters, ordering `is_deprecated ASC, provider ASC, display_name ASC`; refresh runs single-transaction merge; seed metadata protected from discovery overwrite; `ListModelsError` → 503 `PROVIDER_UNREACHABLE`
  - UC-306-FE: page at `/admin/model-catalog` with URL-backed filter state, debounced (300ms) substring, per-provider Refresh w/ spinner; RU toast copy; sidebar entry
  - UC-303-BE: convenience `/admin/model-profiles/catalog?provider=…` (same SQL as UC-306 list, `provider` mandatory); `overrides_catalog` computed server-side on every POST/PUT comparing 4 fields with capabilities-equality (null≡{}, key-order-insensitive); client-supplied value ignored
  - UC-303-FE: ComboBox replaces `model_name` text input, fires `onCatalogPick` separately from `onChange` for free-text path; banner persists until Revert or Dismiss; override badge derived from server response; `17f71a3` VALIDATION_FAILED handler regression-tested
- **Out of scope (binding):** Bulk Refresh across all providers; per-row catalog edit UI (read-only in MVP); catalog-aware compat dry-run for existing WorkflowStepConfig rows; manual `is_deprecated` toggle; pagination of catalog list (≲ few hundred rows bounded)
- **Decisions captured (Open Questions from FR-004 doc):**
  - Q1 seed storage → Drizzle seed file `backend/src/db/seed/05-provider-model-catalog.ts` (matches FR-003 pattern, not a `.json` import)
  - Q2 Refresh transport → direct synchronous HTTP from admin API with `ProviderConfig.request_timeout_ms` (NOT durable queue); admin-initiated, low frequency
  - Q3 deprecated rows in UC-303 dropdown → separate group at bottom with "(устарело)" suffix (per FR-004 default)
- **Next:** `/nacl-tl-dev TECH-013` (Wave 10 entry point)

### [2026-05-18] nacl-tl-fix: seed/04 — add api.kie.example.invalid text_llm profile + fix stale backfill via upsert
- **Level:** L1
- **Status:** NO_INFRA (seed scripts have no test runner — verified by direct DB query)
- **Root cause:** Migration 0019 backfilled all model_profiles to image_gen/openai_chat_completions as placeholder. Seed used ON CONFLICT DO NOTHING so stale values were never corrected. api.kie.example.invalid text_llm profile (gpt-5-2) was never added.
- **Affected UC:** TECH-010 / FR-003 seed layer
- **Docs updated:** none (L1)
- **Code changed:** backend/src/db/seed/04-model-profiles.ts
- **Tests:** none — NO_INFRA (seed layer has no test runner); fix verified by running seed and querying dev DB

### [2026-05-18] nacl-tl-fix: Retroactive L1 doc update — UC-303 VALIDATION_FAILED details.issues[].path
- **Level:** L1 (single UC, FE layer, MOD-ADMIN)
- **Commit ref:** `17f71a3` — fix(UC-303-FE): read details.issues[].path in ModelProfileForm VALIDATION_FAILED handler
- **Classification:** retroactive — code already merged; doc update applied post-merge
- **Root cause:** ModelProfileForm was reading `details.errors[]` on VALIDATION_FAILED response; BE returns Zod-shaped `details.issues[].path`. Fix in 17f71a3 corrected the FE read path. Spec was never written to document the response shape.
- **SA Graph changes (Neo4j):**
  - Updated `form-303-models` node: added `validation_error_shape` property (`VALIDATION_FAILED: { code: "VALIDATION_FAILED", details: { issues: [ { path: (string|number)[], message: string } ] } }`) and `validation_inline_errors` property (`FE maps each issue.path[0] to RHF setError(field, {message}); errors displayed inline under the corresponding input`)
  - Created `ActivityStep` node `step-303-2` (order 2, actor System, kind system_action, name "VALIDATION_FAILED inline error display"): on VALIDATION_FAILED from POST/PUT /admin/model-profiles, FE reads `details.issues[].path` (NOT `details.errors[]`); for each issue, `path[0]` is treated as field name and passed to `setError(path[0], {message})` for inline display; `fix_commit: 17f71a3`, `fix_level: L1`
  - Added `(UC-303)-[:HAS_STEP]->(step-303-2)`
- **No code change** — fix was already in `17f71a3`; this entry closes the spec-first protocol debt

### [2026-05-18] nacl-tl-fix: Retroactive L1 doc update — UC-401 month selector stale-data reset
- **Level:** L1 (single UC, FE layer, MOD-REPORTING)
- **Commit ref:** `818dec1` — fix(UC-401-FE): clear stale report on month change
- **Classification:** retroactive — code already merged; doc update applied post-merge
- **SA Graph changes (Neo4j):**
  - Created `ActivityStep` node `step-401-4` (order 4, actor Admin, kind user_action, name "Изменение периода (month selector)"): FE immediately clears previously loaded report data when user selects a new month, preventing stale data from the prior period from being visible while the new request loads; after the reset a fresh GET /admin/reports/usage?period=YYYY-MM fires automatically.
  - Added `(UC-401)-[:HAS_STEP]->(step-401-4)`
- **No code change** — fix was already in `818dec1`; this entry closes the spec-first protocol debt

### [2026-05-18] nacl-tl-fix: Retroactive L1 doc update — UC-104 upload-complete submit gate
- **Level:** L1 (single UC, FE layer, MOD-CONTENT)
- **Commit ref:** `2cdb42e` — fix(UC-104-FE): require all uploads complete before submit
- **Classification:** retroactive — code already merged; doc update applied post-merge
- **SA Graph changes (Neo4j):**
  - Created `FormPrecondition` node `precond-104-uploads_complete` (AllUploadsComplete): rule — all TaskInputFile entries must reach `status=complete` (S3 PUT confirmed) before Submit button is enabled; `affected_action=submit`, `fix_level=L1`
  - Added `(form-104-create_task)-[:HAS_PRECONDITION]->(precond-104-uploads_complete)`
  - Updated `step-104-5` (Submit: Task → queued + enqueue): `precondition = "All input_files entries status=complete (upload confirmed)"`
  - Updated `step-104-2` (Загрузка TaskInputFile в S3): `postcondition = "Each uploaded file reaches status=complete after S3 PUT confirmed"`
- **No code change** — fix was already in `2cdb42e`; this entry closes the spec-first protocol debt

### [2026-05-18] nacl-tl-reconcile: Emergency reconciliation — admin-forms scope
- **Scope:** SMALL (2 files modified)
- **Docs updated:** 2 — `.tl/status.json` (summary block), `.tl/changelog.md` (this entry + WAVE-9 DEV/SHIP block below)
- **Docs created:** 0
- **Health Score before:** 66 raw → 56 adjusted (−5 × 2 UNVERIFIED tasks: UC-150-BE, UC-151-BE — outside admin scope, surfaced for honesty)
- **Trigger:** DIAGNOSTIC-REPORT.md Rec #1 — `.tl/status.json.summary` drift (done 53→52, ready_for_dev 7→9, verified_pending 0→2, ghost pending=2 / ready_for_review=2 cleared) + missing WAVE-9 DEV/SHIP block for FR-003 (5-day gap 2026-05-13..18).
- **Out of scope (graph-resident):** UC-301..303 SA specs live in Neo4j (CLAUDE.md Rule 1: graph is authoritative). Not reconciled on disk — would duplicate truth source.
- **Out of scope (code, not docs):** Cluster A admin-test regression chain (8522d1d→43fc84d→311635f→17f71a3) — separate `/nacl-tl-fix` needed for shared mock-setup fragility.

## [WAVE-9-DEV-SHIP] 2026-05-18 — FR-003 api.kie.example.invalid text-LLM models — DEV / REVIEW / SHIP
- **Trigger:** Backfill — Wave 9 (FR-003) was developed, reviewed, QA'd, and merged 2026-05-13 → 2026-05-18 without corresponding changelog entries (gap surfaced by `/nacl-tl-diagnose`).
- **Commits (chronological, oldest → newest):**
  - `9bce7e9` — TECH-010 + TECH-011: `model_profile` schema + `chat_completion_log` table + shared types (ModelKind / ApiShape / ModelCapabilities)
  - `1f41e49` — TECH-012: ProviderAdapter abstraction (3 adapters: openai-chat-completions / openai-responses / gemini-native + factory `getAdapter(api_shape)`)
  - `111ceea` — UC-303-BE-FR003: ModelProfile REST API + 4 routing fields (model_kind, api_shape, endpoint_path, capabilities); preserves `VALIDATION_FAILED` shape
  - `f5a9fa7` — UC-150-BE-FR003 + UC-202-BE-FR003: workflow `validateModelKindCompatibility` pre-enqueue gate (step-150-4) + dispatcher adapter selection (step-202-4) with transactional `chat_completion_log` insert
  - `9c67b6c` — UC-303-FE-FR003: admin ModelProfileForm +4 inputs + `CapabilitiesEditor` (JSON textarea + capability checkboxes); list view +"Класс" / "API shape" columns
  - `b1827ae` — chore(wave-9): close FR-003 batch (status.json + conductor-state)
  - `a3868c2` — chore(wave-9): finalize FR-003 conductor state (ci_failed pre-existing pnpm config flagged)
  - `f0dd78c` — fix(ci): remove hardcoded pnpm version — read from `package.json#packageManager` (L0)
  - `17f71a3` — fix(UC-303-FE): read `details.issues[].path` in ModelProfileForm VALIDATION_FAILED handler (L1)
- **Review:** all UC/TECH tasks reached `review: approved` per `.tl/status.json.tasks[]`; UC-303-BE/FE-FR003 `qa: pass`
- **Tests:** 1627 passed / 0 failed at HEAD (95 backend + 52 frontend + 5 shared per diagnostic)
- **Known follow-up:** Cluster A regression chain on 6 admin test files (8522d1d→43fc84d→311635f→17f71a3) — shared mock-setup fragility; queue separate `/nacl-tl-fix`

### [2026-05-18] nacl-tl-fix: CI pnpm version conflict — single source of truth
- **Level:** L0 (Environment / CI config)
- **Status:** NO_INFRA (CI-only change, no local test runner applicable)
- **Root cause:** `.github/workflows/ci.yml` hardcoded `version: 9` in `pnpm/action-setup@v4`, overriding the pinned `packageManager: pnpm@9.15.0` in `package.json`. CI installed latest pnpm 9.x instead of the locked version, causing potential lockfile hash mismatches.
- **Affected UC:** infrastructure (CI)
- **Docs updated:** none (L0)
- **Code changed:** `.github/workflows/ci.yml` — removed `version: 9` from Setup pnpm step; `pnpm/action-setup@v4` now reads from `package.json#packageManager` automatically.
- **Tests:** n/a — CI config change, no local test runner

## [WAVE-9-PLAN] 2026-05-18 — nacl-tl-plan --feature FR-003
- **Source:** Neo4j SA layer (FeatureRequest FR-003 — api.kie.example.invalid text-LLM models; UC-303 / UC-202 / UC-150 full context)
- **Tasks generated:** 7 — 3 TECH + 4 UC-FR003 (TECH-010, TECH-011, TECH-012, UC-303-BE-FR003, UC-303-FE-FR003, UC-202-BE-FR003, UC-150-BE-FR003)
- **Wave:** WAVE-9 — "FR-003 — api.kie.example.invalid text-LLM models support"
- **Files:**
  - `.tl/tasks/TECH-010/` (task, impl-brief, test-spec) — DB migration: model_profile new cols + chat_completion_log table
  - `.tl/tasks/TECH-011/` (task, impl-brief, test-spec) — Shared types ModelKind/ApiShape/ChatCompletionLog + Drizzle regen
  - `.tl/tasks/TECH-012/` (task, impl-brief, test-spec) — Provider adapter abstraction (3 adapters + factory by ApiShape)
  - `.tl/tasks/UC-303-BE-FR003/` (task-be, api-contract, impl-brief, test-spec, acceptance) — ModelProfile API: 4 new fields
  - `.tl/tasks/UC-303-FE-FR003/` (task-fe, api-contract, impl-brief-fe, test-spec-fe, acceptance) — Admin form: 4 new fields
  - `.tl/tasks/UC-202-BE-FR003/` (task-be, api-contract, impl-brief, test-spec, acceptance) — Dispatcher: adapter selection + ChatCompletionLog write
  - `.tl/tasks/UC-150-BE-FR003/` (task-be, api-contract, impl-brief, test-spec, acceptance) — Workflow engine: pre-enqueue model_kind compatibility validation
- **Graph writes:** Wave(WAVE-9); 7 Task nodes (IN_WAVE → WAVE-9); 14 DEPENDS_ON edges (TECH chain + UC→TECH/base-UC); 4 GENERATES edges from UC-303/UC-202/UC-150
- **Status:** PLAN COMPLETE — all 3 UCs have activity_steps + requirements + (for UC-303) form-field mapping in graph; new entities/enums/requirements created by `/nacl-sa-feature` earlier today are wired
- **Scope summary:**
  - TECH-010: PG enums `model_kind`, `api_shape`; 4 new model_profile cols (NOT NULL + backfill); new `chat_completion_log` table (16 cols, 3 indexes, FKs CASCADE/RESTRICT)
  - TECH-011: `MODEL_KIND_VALUES`, `API_SHAPE_VALUES`, `ModelCapabilities`, extended `ModelProfilePublic`, new `ChatCompletionLogPublic` — exported from `@project-alpha/shared`
  - TECH-012: `ProviderAdapter` interface + three implementations (`openaiChatCompletionsAdapter`, `openaiResponsesAdapter`, `geminiNativeAdapter`) + `getAdapter(api_shape)` factory
  - UC-303-BE: Zod create/update schemas + service + mapper extended with the 4 new fields; `VALIDATION_FAILED` shape preserved
  - UC-303-FE: ModelProfileForm gets 4 inputs + new `CapabilitiesEditor` (JSON textarea + capability checkboxes); list view gains "Класс" / "API shape" columns
  - UC-202-BE: inline `fetch` swap → `getAdapter(api_shape).call(...)` for `model_kind in {text_llm, vlm}`; `image_gen`/`video_gen` keep pre-existing inline path; transactional `chat_completion_log` insert preserved alongside `generation_log`
  - UC-150-BE: new `validateModelKindCompatibility(stepKind, modelKind)` pre-enqueue guard in `step-150-4`; mismatch → Task FAILED with `INCOMPATIBLE_MODEL_KIND`, no slot enqueued
- **Out of scope (binding):** `image_gen`/`video_gen` adapter migration (kept on inline path); streaming response handling; reporting on `chat_completion_log` (post-MVP); admin "dry-run" compat validator across all WorkflowStepConfig rows
- **Next:** `/nacl-tl-dev TECH-010` (Wave 9 entry point)

### [2026-05-13] nacl-tl-fix: CI minio service container init failure
- **Level:** L0 (CI infrastructure)
- **Status:** NO_INFRA (CI config-only fix; no backend/frontend test runner applies)
- **Root cause:** `minio/minio:latest` requires `server /data` command to start the server. GitHub Actions `services:` blocks only support docker `--options` flags — there is no way to pass the container command via YAML. Without `server /data`, minio exits immediately, port 9000 never opens, health-cmd times out after 10 retries (50s), and GitHub Actions aborts job initialization before any step runs.
- **Affected UC:** infrastructure (not application code)
- **Docs updated:** none (L0)
- **Code changed:** `.github/workflows/ci.yml` — removed minio from `services:`, added "Start MinIO" step using `docker run minio/minio:latest server /data` with host-side `curl` health wait
- **Tests:** none — CI infra change; verified by structure inspection
- **Pre-existing failures (baseline-confirmed unrelated):** none

## [WAVE-8 CLOSED] 2026-05-13 — nacl-tl-conductor --feature=FR002
- **Items:** UC-105-BE-FR002 (PASS), UC-105-FE-FR002 (PASS) — both APPROVED at review
- **Commits:** `9ab477a` (planning artifacts), `eb4a87b` (BE), `84ef9ad` (FE) — pushed to origin/main (direct strategy)
- **Verification:**
  - BE: 998/998 backend tests passing (dev sub-agent), pnpm -r typecheck clean
  - FE: 475/475 frontend tests passing, pnpm -r typecheck clean
  - Stub scan: no TODO/FIXME/STUB on touched files
- **CI (delivery):** FAILED — pre-existing `minio` service-container init failure (29s, same failure mode on commits 67663ed and earlier; NOT caused by FR-002 work). Run id 25807289680.
- **Staging verify:** skipped (CI gate red — `/nacl-tl-deliver` did not proceed past push).
- **Graph:** UC-105-BE-FR002 / UC-105-FE-FR002 → status=done; phase_be/phase_fe/phase_review_be/phase_review_fe=approved.
- **Headline:** CONDUCTOR APPLIED — UNVERIFIED-AT-CI (dev+review PASS, CI infra unblocks needed before staging verify can confirm).
- **Follow-up TECH bug:** investigate why GitHub Actions `minio` service container fails to initialize (affects all CI runs since 2026-05-12, not FR-002 specific).
- **Conductor state:** `.tl/conductor-state.json` (open run); prior wave-7 state archived at `.tl/conductor-state.wave-7-fr-001-2026-05-13.json`.

## [WAVE-8-PLAN] 2026-05-13 — nacl-tl-plan --feature FR-002
- **Source:** Neo4j SA layer (FeatureRequest FR-002 + UC-105 full context — 24 UCs, 17 Forms, 36 Requirements available)
- **Tasks generated:** 2 (UC-105-BE-FR002, UC-105-FE-FR002)
- **Wave:** WAVE-8 — "FR-002 — Session context on task detail page"
- **Files:** `.tl/tasks/UC-105-FR002/` (8 files: task-be, task-fe, test-spec, test-spec-fe, impl-brief, impl-brief-fe, acceptance, api-contract)
- **Graph writes:** Wave(WAVE-8), Task(UC-105-BE-FR002), Task(UC-105-FE-FR002); IN_WAVE + DEPENDS_ON(UC-105-BE, UC-105-FE) + GENERATES edges from UC-105
- **Status:** PLAN COMPLETE (UC-105 has activity_steps + REQ-UC105-session-context wired in graph)
- **Scope summary:**
  - BE: extend `GET /api/content/tasks/:taskId` response with `session: { id, name }` via JOIN on sessions; shared type `SessionRef` added; SSE unchanged
  - FE: new `SessionBreadcrumb` component above `<h1>Задача</h1>`; remove raw `Сессия: <uuid>` row from TaskStatusCard
- **Next:** `/nacl-tl-dev-be UC-105-BE-FR002` (Wave 8, ready_for_dev)

## [2026-05-13 11:35] QA: fix-2026-05-13-upload-url-inlinetask
- Phase: Automated QA (vitest suites — no E2E browser test; fix is not a UC)
- Verdict: QA COMPLETE
- Method: code inspection + automated test suites
- BE: 993/993 tests pass (84 files); new route `POST /api/content/tasks/upload-url` confirmed in task.routes.ts:55; `getPendingUploadUrl` confirmed in task.service.ts:135; 3 tests cover new route (tasks.test.ts:772-803)
- FE: 464/464 tests pass (49 files); useEffect sync confirmed at InlineTaskBlock.tsx:209-211; setEntries updaters in uploadFile path are now pure; regression test F-2.6 PASS
- Minor finding: `handleRemove` still calls `syncToParent` inside `setEntries` (pre-existing, not in fix scope; covered by the new useEffect)
- Criteria: 2 bugs tested, 2 passed, 0 failed, 0 N/A
- Bugs: 0 new

### [2026-05-13] nacl-tl-fix: session-independent upload-url + InlineTaskBlock setState fix
- **Level:** L1 (code-only, two distinct bugs)
- **Status:** UNVERIFIED (all tests pass; no test was RED before fix)
- **Root cause A:** CreateSessionForm called POST /api/content/tasks/upload-url (no sessionId), but only the per-session route existed — missing backend endpoint
- **Root cause B:** InlineTaskBlock.uploadFile called syncToParent (→ parent onChange) inside setEntries functional updater — illegal side-effect during React render
- **Affected UC:** UC-103-FE, UC-103-BE
- **Docs updated:** none (L1)
- **Code changed:**
  - backend/src/modules/content/task.service.ts: added getPendingUploadUrl (no sessionId, pending/ key prefix)
  - backend/src/modules/content/task.routes.ts: added POST /api/content/tasks/upload-url route
  - frontend/src/features/sessions/InlineTaskBlock.tsx: moved entries→parent sync to useEffect; setEntries updaters now pure
- **Tests:** existing (Path B) — InlineTaskBlock.test.tsx F-2.2/F-2.3 cover upload; no RED→GREEN transition (no test captured the warning)

## [WAVE-7-COMPLETE] 2026-05-13 — nacl-tl-conductor "Wave7"
- **Scope:** FR-001 (inline first task + auto session name)
- **Items:** UC-103-BE-FR001 (done @ 85f078d), UC-103-FE-FR001 (done @ 9de836b), UC-104-FE-FR001 (done @ 11deca0); UC-104-BE-FR001 deferred (audit-only, no defect)
- **Pre-commits in same batch:** plan @ 713b5b2; tl-fix (session task list, UNVERIFIED) @ 65e2a85
- **Sub-skill status:** 3/3 active UC items PASS; 1 UNVERIFIED pre-commit
- **Quality gate:** typecheck PASS across packages/shared+backend+frontend; lint has 2 pre-existing errors in unrelated files; no new TODO/FIXME stubs; graph terminal (3 done, 1 deferred)
- **Tests:** backend 990 (+18); frontend 463 (+26 across UC-103-FE + UC-104-FE)
- **Open follow-up:** UC-103-FE-FR001 inline upload presigns via `POST /api/content/tasks/upload-url` — BE only exposes the per-session variant. Tests mock; runtime needs a new BE route (POST_MVP or follow-up BE task).
- **Delivery:** skipped (--skip-deliver); next: /nacl-tl-ship or /nacl-tl-release

## [WAVE-7-PLAN] 2026-05-13 — nacl-tl-plan --feature FR-001
- **Source:** Neo4j SA layer (FeatureRequest FR-001 + UC-103, UC-104 full context)
- **Tasks generated:** 4 (UC-103-BE-FR001, UC-103-FE-FR001, UC-104-BE-FR001 [deferred audit], UC-104-FE-FR001)
- **Wave:** WAVE-7 — "FR-001 — Inline first task + auto session name"
- **Files:** `.tl/tasks/UC-103-FR001/` (8 files), `.tl/tasks/UC-104-FR001/` (8 files)
- **Graph writes:** Wave node WAVE-7, 4 Task nodes, 9 DEPENDS_ON edges, 4 GENERATES_TASK edges from FR-001
- **Breaking note:** `POST /api/content/sessions` response shape changes from `SessionPublic` to `{ session, task? }` — BE and FE in WAVE-7 ship together; bump `@project-alpha/shared`.
- **Next:** `/nacl-tl-dev-be UC-103-BE-FR001`

## [2026-05-13] nacl-sa-feature: FR-001 — inline создание первой задачи + опциональное имя сессии
- **Type:** Feature specification (graph)
- **FR:** [FR-001](feature-requests/FR-001-inline-first-task-and-auto-session-name.md)
- **Affected UC:** UC-103 (modified), UC-104 (clarified)
- **Affected module:** MOD-CONTENT
- **Affected entity:** SA-Session (атрибут `name`: default-rule auto-name)
- **Graph changes:**
  - Domain: `attr-Session-name` — `description`, `type`, `default_rule`
  - UCs: UC-103 (8 ActivityStep'ов, новые requirements), UC-104 (description/user_story/preconditions)
  - Forms: `form-103-create_session` расширена 3 полями (task_type, input_files, input_params)
  - Components: NEW `comp-inline-task-block`
  - Requirements: NEW REQ-FR-AutoSessionName, REQ-FR-InlineFirstTask, REQ-FR-PostCreateRedirect
  - FeatureRequest: NEW `:FeatureRequest {id:'FR-001'}` + INCLUDES_UC × 2, AFFECTS_MODULE × 1, AFFECTS_ENTITY × 1
- **Validation:** L4/L5 — 0 проблем
- **Next:** `/nacl-tl-plan --feature FR-001` для генерации задач разработки

## [2026-05-13] nacl-tl-fix: нет навигации к задаче из страницы сессии
- **Level:** L1 (Code-only)
- **Status:** UNVERIFIED (нет теста на SessionDetailPage task list)
- **Root cause:** `SessionDetailPage` отображал только кнопку "Создать задачу" без списка существующих задач. `GET /api/content/sessions/:sessionId/tasks` отсутствовал на бэкенде. Комментарий "Task list panel is added by UC-106-FE" ошибочный — UC-106-FE про уведомления.
- **Affected UC:** UC-103 (session detail), UC-104 (task create)
- **Docs updated:** none (L1)
- **Code changed:**
  - `backend/src/modules/content/task.service.ts` — добавлен `listSessionTasks(db, sessionId, userId)`
  - `backend/src/modules/content/task.routes.ts` — добавлен `GET /api/content/sessions/:sessionId/tasks`
  - `frontend/src/features/sessions/hooks.ts` — добавлен `useSessionTasksQuery` + `sessionTasksKey`
  - `frontend/src/features/sessions/SessionDetailPage.tsx` — задачи сессии отображаются, каждая ссылка ведёт на `/sessions/$sessionId/tasks/$taskId`
  - `frontend/src/features/task-create/CreateTaskPage.tsx`, `frontend/src/features/task-detail/TaskDetailPage.tsx` — «← Назад к сессии» link
  - `frontend/src/features/task-create/hooks.ts` — `useCreateTaskMutation.onSuccess` инвалидирует кэш списка задач сессии
- **Tests:** Path B — vitest run; 437 passed; ни один тест не покрывает task list на session detail (нет E2E теста). Рекомендуется добавить.

## [2026-05-12] nacl-tl-fix: backend tests destroy dev DB (no test/dev isolation)
- **Level:** L1 (Code-only)
- **Status:** PASS
- **Root cause:** `backend/vitest.setup.ts` loaded `.env` but did not override `DATABASE_URL`, so vitest connected to `project-alpha_dev`. Multiple test files (`tests/admin/users.test.ts:65,78`, `tests/reporting/usage-report.routes.test.ts:133`, sessions list tests, etc.) call `db.delete(users|categories|promptTemplates|categoryMappings)` with no WHERE between suites — wiping dev data on every `pnpm test`.
- **Affected UC:** none — infrastructure
- **Docs updated:** none (L1)
- **Code changed:**
  - `backend/vitest.setup.ts` — override `DATABASE_URL ← TEST_DATABASE_URL` after loading `.env`, fail-fast if missing or not pointing at `project-alpha_test`
  - `.env`, `.env.example` — add `TEST_DATABASE_URL` (and `PROJECT-ALPHA_DB_NAME_TEST`)
  - `scripts/dev-setup.sh` — additive idempotent block creating `project-alpha_test`
  - `scripts/test-db-setup.sh` — new; self-contained `project-alpha_test` provisioner (does not depend on dev-setup's broken role-creation block)
  - `backend/package.json` — new `db:test:setup` script (`test-db-setup.sh` + `tsx src/db/migrate.ts` with `DATABASE_URL=$TEST_DATABASE_URL`)
- **Tests:** new regression `backend/tests/infra/test-db-isolation.test.ts` (2 cases). RED-first verified at 6e (2/2 failing on unfixed code), GREEN at 6g (2/2 passing after fix).
- **Verification:**
  - `pnpm --filter backend test` → 972/972 green (970 prior + 2 new infra)
  - Dev DB (`project-alpha_dev`) row counts after full test run: `users=2`, `categories=4` — UNCHANGED from baseline
  - `project-alpha_test`: 17 tables (migrations applied)
- **Out of scope (left as-is per user invariants):**
  - The `delete(...)`-without-WHERE calls in tests stay — "clean slate per suite" is valid once the DB is isolated
  - `vitest.config.ts → fileParallelism: false` preserved
  - Pre-existing broken `DO $$` role-creation block in `scripts/dev-setup.sh` is NOT modified

## [2026-05-12] nacl-tl-fix: categories table empty — "Нет доступных категорий" + пустой список сессий
- **Level:** L0 (Environment — seed not applied)
- **Status:** PASS
- **Root cause:** таблица `categories` была пустой; bootstrap seed не был выполнен после последнего пересоздания БД
- **Affected UC:** UC-103 (CreateSession, SessionsList)
- **Docs updated:** none (L0)
- **Code changed:** none
- **Fix applied:** `pnpm --filter backend db:bootstrap` — 4 категории вставлены (КОЛЬЦО, СЕРЬГИ, ПОДВЕСКА active; БРОШЬ inactive), 18 category_mappings
- **Tests:** 970/970 passing after fix

## [2026-05-12] nacl-tl-fix: session detail page missing "Создать задачу" CTA
- **Level:** L1 (code-only)
- **Status:** PASS
- **Root cause:** `SessionDetailPage` was a minimal stub from UC-103-FE and never received the navigation link to `/sessions/:id/tasks/new`, leaving users stranded after session creation
- **Affected UC:** UC-103, UC-104
- **Docs updated:** none (L1)
- **Code changed:** `frontend/src/features/sessions/SessionDetailPage.tsx`
- **Tests:** `frontend/tests/content/session-detail.render.test.tsx` (new, Path A — RED→GREEN)
- **Pre-existing failures:** none

## [2026-05-12] nacl-tl-fix: admin UI dropdowns broken (workflow steps + categories shape + paging + WSC hint)
- **Level:** L2 (cross-module: shared package + BE response shape + FE forms/tables)
- **Status:** PASS (typecheck clean BE+FE; shared 30/30; agent reports BE 969/969 + FE 433/433; manual API curl verifies envelope)
- **Root causes:**
  - **A.** `packages/shared/src/workflows.ts` was a UC-305 stub never wired to reality — `WorkflowId` missing `Edit`, `WORKFLOW_STEPS` containing fake dot-notation IDs (`retouch.generate` etc.) that don't match `backend/src/workflows/catalog.ts:WORKFLOW_STEP_IDS`. Result: PromptTemplateForm could not find `regenerate`/`reprompt`/`prepare-prompt`/etc. in `ALL_STEP_IDS` → workflow-step dropdown displayed «— без шага —» on every seeded edit-workflow row.
  - **B.** `GET /api/admin/categories` returned a plain `Category[]` while FE hooks (`category.hooks.ts`, `prompt-template.hooks.ts`) and TS types declared `{items, total, page, page_size}` envelope. Result: `categoriesData?.items` was undefined → fallback `[]` → category dropdown empty across PromptTemplateForm, PromptTemplatesPage filters, CategoryMappingForm. Other admin list endpoints already returned envelope — BE was the outlier.
  - **C.** `WorkflowStepConfigForm` called `usePromptTemplates({})` without `page_size`; BE defaults to 20 → dropdown saw only 20 of 24 seeded templates.
  - **D.** WSC table rendered bare «—» for `prompt_template_id = NULL` rows; engineering intent is that engine falls back to per-(category, step_id) resolution via `step-resolver.ts:100-122`, but UI gave no hint of that — admins thought their seed was incomplete.
- **Affected UC:** UC-302-FE (PromptTemplate admin form/page), UC-305-FE (WorkflowStepConfig admin form/page/table), UC-303-BE (categories listing shape).
- **Docs updated:** none required — Bug A fix removes a documented-as-stub state; Bug B aligns BE with established envelope convention; C/D are UI-level.
- **Files modified:**
  - `packages/shared/src/workflows.ts` — added `Edit: 'edit'` to `WorkflowId`; replaced stub `WORKFLOW_STEPS` with real per-workflow step IDs from `catalog.ts` (`retouch`, `model`, `interior`, `video`, `full_flow`, `edit`)
  - `packages/shared/src/admin.ts` — added `ListCategoriesResponse` envelope type
  - `packages/shared/tests/workflows.test.ts` — new (8 tests: WorkflowId completeness, step-id parity with catalog, `edit` regression, absence of dot-notation stubs, `isStepInWorkflow`)
  - `backend/src/modules/admin/category.routes.ts` — wrap response in `{items, total, page, page_size}`
  - `backend/tests/admin/categories.routes.test.ts` — assert envelope shape
  - `backend/tests/admin/workflow-step-configs.crud.test.ts` — replaced dot-notation step IDs with real ones (`generate`, `place-on-model`, `place-in-interior`, `generate-video`, `retouch-generate`)
  - `frontend/src/features/admin/WorkflowStepConfigForm.tsx` — added `Edit` to `WORKFLOW_OPTIONS`; both `usePromptTemplates` calls now pass `page_size: 100`
  - `frontend/src/features/admin/WorkflowStepConfigsPage.tsx` — added `Edit` to `WORKFLOW_OPTIONS`
  - `frontend/src/features/admin/WorkflowStepConfigsTable.tsx` — render «— (наследует по категории)» hint (`data-testid="wsc-no-template-hint"`) when `prompt_template_id` is null
  - `frontend/src/features/admin/CategoryMappingForm.test.tsx` — updated "5 workflow options" → "6 including edit"; fixed pre-existing TS2532
  - `frontend/src/routes/admin/workflows.test.tsx` — replaced `retouch.generate` with `generate` in 4 cases; added WSC null-template-hint test (Fix D regression)
  - `frontend/src/routes/admin/prompt-templates.test.tsx` — replaced `retouch.generate` step-filter assertion with `generate`
- **Tests:** shared +8 (22→30); BE 969/969; FE 433/433.
- **RED→GREEN:** Fix D test verified RED before/GREEN after; other fixes verified by typecheck failures pre-fix and API curl envelope post-fix.
- **Invocation source:** user screenshot review (admin UI debugging).

## [2026-05-12] feat(db): idempotent bootstrap seed system
- **Level:** TECH (infrastructure)
- **Status:** PASS (verified locally: 1st run inserts all, 2nd run all skipped; typecheck clean)
- **Scope:** populate reference data (categories, model_profiles, category_mappings, prompt_templates, workflow_step_configs, provider_configs, users, app_settings) so a freshly migrated DB is usable end-to-end without manual SQL inserts. Automatically wired into `deploy/start.sh` after `migrate`.
- **Counts seeded:** categories=4 (3 active + БРОШЬ inactive), model_profiles=4, category_mappings=18, prompt_templates=24 (8 step_id × 3 active categories per engine resolver `step-resolver.ts:100-122`), workflow_step_configs=22 (interior/video.verify inactive per BR-7), provider_configs=4, users=2 (admin+demo), app_settings=1.
- **Engine alignment:** prompt_templates seeded by `(category_id, workflow_step_id)` only — workflow_step_configs.prompt_template_id stays NULL because engine prefers (category, step_id) fallback when null. Verifier-kind steps skipped (engine doesn't resolve templates for them).
- **Files added:** `backend/src/db/seed/{bootstrap.ts, 01-app-settings.ts, 02-users.ts, 03-categories.ts, 04-model-profiles.ts, 05-category-mappings.ts, 06-prompt-templates.ts, 07-workflow-step-configs.ts, 08-provider-configs.ts}`, `backend/src/db/seed/prompts/{image-desc, verifier, retouch-prepare, model-prepare, interior-prepare, video-prepare}.md` (image-desc + verifier extracted from n8n AS-IS as full text with `{{handlebars}}` placeholders; 4 prepare files — placeholders to fill via admin UC-302).
- **Files removed:** `backend/src/db/seed/provider-configs.dev.ts` — replaced by `08-provider-configs.ts` (function export, run by bootstrap orchestrator).
- **Files modified:** `backend/package.json` (+`db:bootstrap`/`db:init`), `deploy/start.sh` (+bootstrap hook after migrate), `.env.example` (+ADMIN_/DEMO_ placeholders).
- **Idempotency:** ON CONFLICT DO NOTHING on tables with unique indexes; lookup-then-insert by deterministic `name` field on `prompt_templates`. Secrets read from env with `dev-placeholder-…` / `change-me` fallback so first-deploy never fails.

## [2026-05-12] nacl-tl-fix: admin layout missing navigation sidebar
- **Level:** L1
- **Status:** PASS
- **Root cause:** AdminLayout rendered only `<Outlet />` — no navigation component existed. All 7 admin sections were unreachable via UI (users had to type URLs manually).
- **Affected UC:** UC-302-FE (admin layout shell)
- **Docs updated:** none (L1)
- **Code changed:** frontend/src/routes/admin/_layout.tsx (added sidebar nav with 7 links); frontend/src/routes/admin/{categories,model-profiles,prompt-templates,users,providers,workflows}.test.tsx (6 files: tightened `getByText` → `getByRole('heading')` to avoid nav/heading ambiguity)
- **Tests:** frontend/src/routes/admin/layout-nav.test.tsx (new — 8 tests verifying all nav links render)
- **RED→GREEN:** ✓ confirmed (8 tests: all RED before fix, all GREEN after)

## [2026-05-12] nacl-tl-fix: empty modelProfiles dropdown in CategoryMappingForm
- **Level:** L1
- **Status:** PASS
- **Root cause:** CategoriesPage allows opening the mapping modal before useModelProfiles() resolves; modelProfiles defaults to [], leaving the select with only the placeholder and no way to complete the form.
- **Affected UC:** UC-304-FE
- **Docs updated:** none (L1)
- **Code changed:** frontend/src/features/admin/CategoryMappingForm.tsx
- **Tests:** frontend/src/features/admin/CategoryMappingForm.test.tsx — new test "shows empty-state note and only placeholder option when modelProfiles is []"
- **RED→GREEN:** ✓ confirmed

## [2026-05-12] nacl-tl-fix: index route dead-end — add role-based redirect
- **Level:** L1
- **Status:** PASS
- **Root cause:** `routes/index.tsx` had no `beforeLoad` guard — authenticated users landed on a blank placeholder page with no navigation or redirect. Admin users were stranded at `/` with only an `<h1>` tag.
- **Affected UC:** routing infrastructure (IndexRoute)
- **Docs updated:** none (L1 — routing behavior was implied by UC-103/UC-302 redirect chains)
- **Code changed:** `frontend/src/routes/index.tsx` — added `beforeLoad` that redirects: unauthenticated→`/login`, admin→`/admin/categories`, end_user→`/sessions`
- **Tests updated (spec alignment, not new bugs):** `tests/index.test.tsx`, `tests/content/sessions.authz.test.tsx`, `tests/reporting/usage-report.authz.test.tsx`, `src/routes/admin/{categories,model-profiles,prompt-templates,users,workflows,providers}.test.tsx` — updated assertions from "renders Project Alpha heading" / "pathname=/" to the correct final destinations
- **Tests:** `tests/index-redirect.test.tsx` (new regression test, 3 cases — RED→GREEN confirmed)

## [2026-05-12] nacl-tl-fix: conductor-state.json sync-verdict normalization (--from-review)
- **Level:** L1
- **Status:** NO_INFRA (metadata-only file; no test runner for .tl/ artifacts)
- **Root cause:** wave-5-followup re-synced all 6 UCs to UNVERIFIED and raised FE tests 408→420, but conductor-state.json was never patched — left with mixed verdicts (UNVERIFIED_PROJECT_CONVENTION / OK / PASS / COMPLETE) and stale counters (items_pass:6, items_unverified:0, fe_tests_final:408)
- **Affected UC:** UC-104, UC-105, UC-106, UC-107, UC-108, UC-401 (Wave 5 sync verdicts)
- **Docs updated:** none (L1)
- **Code changed:** `.tl/conductor-state.json` — all 6 ucTasks `sync_verdict` → `"UNVERIFIED"`; `summary.items_pass` 6→0; `summary.items_unverified` 0→6; `summary.fe_tests_final` 408→420; `qualityGate.tests_frontend` updated to 420/420 (42 files)
- **Tests:** none — NO_INFRA (no test runner for .tl/ metadata files)
- **Invocation source:** review

## [2026-05-12] nacl-tl-fix: backend lint errors — unused imports and vars in tests
- **Level:** L1
- **Status:** PASS
- **Root cause:** Unused type imports (`WorkflowDefinition`, `WorkflowEngineType`) and unused vars (`capturedTaskEvents`, `capturedPushEvents`, `taskEvents`, `tokenB` ×4, `SUFFIX`, `pcProvider`, `USER_ID` ×2, etc.) accumulated across test files; ESLint errored on `unused-imports/no-unused-imports`; all import/order warnings auto-fixed by `--fix`
- **Affected UC:** test infrastructure (L1, no production code changed)
- **Docs updated:** none (L1)
- **Code changed:** `tests/content/engine.cancel-race.test.ts`, `tests/admin/category-mappings.routes.test.ts`, `tests/admin/prompt-templates.routes.test.ts`, `tests/admin/provider-configs.crud.test.ts`, `tests/auth/refresh.routes.test.ts`, `tests/content/asset.download.test.ts`, `tests/content/notifications.dismiss.test.ts`, `tests/content/notifications.list.test.ts`, `tests/queue/dispatcher.test.ts`, `tests/queue/heartbeat.test.ts`, `tests/queue/result-commit.test.ts`, `tests/queue/sse-after-commit.test.ts`, `tests/queue/uc107-p2-notification-atomicity.test.ts`, `tests/queue/watchdog.race.test.ts`, `tests/queue/watchdog.recovery.test.ts`, `tests/queue/worker.cancel-fail-race.test.ts`
- **Tests:** existing 969 tests; `npm run lint` exits 0 (was 2 errors + 61 warnings)

## [2026-05-12] nacl-tl-fix: tasks row non-locking SELECT in worker commit TX (P1 cancel race)
- **Level:** L2
- **Status:** PASS
- **Root cause:** `worker.ts:330` used a non-locking `SELECT status FROM tasks WHERE id=$1 LIMIT 1` inside the commit transaction. `cancelTask` uses a separate TX that acquires an implicit row lock via `UPDATE tasks SET status='cancelled'`. Between the worker's non-locking SELECT and its COMMIT, cancel could commit 'cancelled' without being visible to the worker — the worker then proceeded with `finalSlotStatus='completed'/'failed'`, inserting spurious assets/logs and emitting a success bus event for a cancelled task.
- **Affected UC:** UC-107, UC-202
- **Docs updated:**
  - `.tl/tasks/UC-107/impl-brief.md` §8 — pseudocode updated to show `FOR UPDATE` on tasks SELECT
  - `.tl/tasks/UC-202/impl-brief.md` §6 — added tasks.status `FOR UPDATE` check to the cancel-handling spec
- **Code changed:**
  - `backend/src/modules/queue/worker.ts:330` — `SELECT status FROM tasks … LIMIT 1` → `SELECT status FROM tasks … LIMIT 1 FOR UPDATE`
- **Tests:**
  - New regression test: `backend/tests/queue/worker.tasks-lock.test.ts`
  - Baseline: 968 tests / 0 failing; postfix: 969 tests / 0 failing
  - RED→GREEN confirmed at 6e and 6g (Path A)
- **Pre-existing failures (baseline-confirmed unrelated):** none
- **Invocation source:** review

## [2026-05-11] nacl-tl-fix: cancel/failure SSE+notification correctness gaps (3×P2 from review)
- **Level:** L1
- **Status:** UNVERIFIED (code fixed + typechecks + 949/949 tests pass; no regression test exercises the three new invariants yet — see "Next step" for /nacl-tl-regression-test)
- **Root cause:**
  - P1 (cancel race): `worker.ts` checked only `queue_items.status`; the running-cancel path flips `tasks.status` without touching `queue_items`, so the worker could still insert `generated_assets`/`generation_logs` after cancel. Also: existing `queue_items.status='cancelled'` check never guarded asset/log inserts — only `finalSlotStatus` was set.
  - P2 (failure notification atomicity): Worker committed `tasks.status='failed'` in TX1; engine's `failTask` wrote the `user_notifications` row in TX2. Crash between TX1 and TX2 left the task durably failed without a notification row.
  - P3 (wrong cancel event type): Route emitted `{ type: 'status_changed', status: 'cancelled' }` instead of the contracted `{ type: 'task_cancelled' }`; `TaskEvent` union was missing the `task_cancelled` variant.
- **Affected UC:** UC-107, UC-202 (queue worker cancel guard)
- **Docs updated:** none (L1 — all three specs already described the correct behaviour)
- **Code changed:**
  - `packages/shared/src/task-105.ts` — added `| { type: 'task_cancelled'; task_id: string }` to `TaskEvent` union
  - `backend/src/modules/content/task.routes.ts` — changed cancel emit to `{ type: 'task_cancelled', task_id }`
  - `backend/src/modules/queue/worker.ts` — (1) task-status guard in success TX (query `tasks.status`, set `finalSlotStatus='cancelled'` if cancelled); (2) `generated_assets`/`generation_logs` inserts gated on `finalSlotStatus !== 'cancelled'`; (3) `userNotifications` insert inside failure TX when `taskUpdateResult.rowCount > 0`
  - `backend/src/modules/content/workflow-engine/engine.ts` — `failTask` UPDATE uses `WHERE NOT IN terminal states + .returning()`; if 0 rows updated (worker already committed), reads existing notification row for SSE push instead of writing duplicate
- **Tests:** none — UNVERIFIED (Path B: existing imports cover the changed files but no test asserts the new invariants)
- **Pre-existing failures (baseline-confirmed unrelated):** none
- **Invocation source:** review

## [WAVE-4-COMPLETE] 2026-05-11
- Wave 4 delivered: 6/6 items PASS (5 BE + 1 FE), 0 unverified, 0 blocked, 0 regression
- Commits a659a2b → 05c8f72 (6 atomic commits on main)
- UC-105-BE: GET /tasks/:id + SSE event stream (status_changed / task_completed / task_failed)
- UC-106-BE: per-user notifications channel (SSE + REST list/dismiss) + user_notifications table (migration 0018)
- UC-107-BE: DELETE /tasks/:id cancel with state-machine, optimistic concurrency, MOD-QUEUE coordination
- UC-108-BE: GET /assets/:id/download with 5-min presigned S3 URLs, owner-only, readiness gate
- UC-401-BE: GET /admin/reports/usage monthly user × task_type aggregation from generation_logs
- UC-103-FE: session view (create/list/detail-stub) under /sessions, route-guarded layout
- Quality gate: 0 critical stubs, 3 cosmetic warnings (stale code-comment UC-refs only)
- BE tests: 941/941 green at last full run (Docker turned off mid-wave; re-run after restart)
- FE tests: 234/234 green (19 files)
- Sync check UC-103: PASS (shared types, endpoint URLs, error codes all aligned)
- MVP backend feature set closed. Next: Wave 5 user-facing FE (UC-104..108, UC-401).

## [2026-05-11] nacl-tl-fix: race-captured text-llm null output_text → TEXT_STEP_OUTPUT_UNRECOVERABLE (from review)
- **Level:** L1
- **Status:** PASS
- **Root cause:** Race-captured path (engine.ts:241-255) was missing the text-llm guard present in the crash-recovery path (L318). When the bus emitted a successful completion with `output_text: null` during the race window, the engine advanced with an empty `StepOutput{}`, silently corrupting the downstream image step's prompt context.
- **Affected UC:** UC-150 (workflow engine FSM)
- **Docs updated:** none (L1 — invariant already encoded in crash-recovery guard at L318)
- **Code changed:**
  - `backend/src/modules/content/workflow-engine/engine.ts` — guard added at race-captured branch: `stepDef.kind === 'text-llm' && captured.event.output_text == null` → `failTask(TEXT_STEP_OUTPUT_UNRECOVERABLE)`, mirrors crash-recovery path
- **Tests:**
  - Regression test: `tests/content/engine.crash-recovery.test.ts` — crash-recovery.7 (Path A, RED→GREEN confirmed)
  - Baseline: 746 passing; postfix: 747 passing (new test transitioned RED→GREEN, no new failures)
- **Invocation source:** review

## [2026-05-11 13:11] nacl-tl-fix: verifier verdict bypassed + text-llm guard wrong in crash-recovery (from review)
- **Level:** L1
- **Status:** BLOCKED (event-listener unit tests GREEN; DB-backed crash-recovery tests blocked by sandbox EPERM — pre-existing constraint)
- **Root cause:**
  - P1 (verifier verdict bypassed): `waitForVerification` had no `.captured` property, so the verifier race-window path was never detected. In true crash-recovery, `qi.status='completed'` for verifier steps fell through to `advanceOrFinalize` unconditionally — `fail` and `retry` verdicts were treated as `pass`, silently marking tasks completed.
  - P2 (text-llm guard too narrow): guard was `stepDef.kind === 'text-llm' && !firstAsset`. `processSlot` uploads JSON responses to S3 and inserts `generated_assets` rows for ALL providers including OpenRouter, making `firstAsset` truthy. Guard never fired; engine advanced with no `output_text`, corrupting downstream step inputs.
- **Affected UC:** UC-150 (workflow engine FSM)
- **Docs updated:** none (L1)
- **Code changed:**
  - `backend/src/modules/content/workflow-engine/step-resolver.ts` — exported `DEFAULT_MAX_RETRIES`
  - `backend/src/modules/content/workflow-engine/event-listener.ts` — added `.captured` getter to `waitForVerification` return (parallel to `waitForStepCompletion`)
  - `backend/src/modules/content/workflow-engine/engine.ts` — (1) reads `verificationPromise?.captured` in the race-window block and routes through `handleVerdict`; (2) new verifier crash-recovery branch queries `verification_reports` ordered by `attempt_no DESC`, reconstructs `VerificationReport`, calls `handleVerdict`; (3) text-llm guard changed from `text-llm && !firstAsset` to `text-llm` (unconditional); asset query moved to image-llm/other branch only
- **Tests:**
  - `backend/tests/content/engine.event-listener.test.ts` — 6 new unit tests for `waitForVerification.captured`; RED→GREEN confirmed (11/11 pass)
  - `backend/tests/content/engine.crash-recovery.test.ts` — 2 new DB regression tests (crash-recovery.4 P2, crash-recovery.5 P1); DB-blocked in sandbox
- **Pre-existing failures (baseline-confirmed unrelated):** DB-backed integration suite blocked by sandboxed localhost PostgreSQL access
- **Invocation source:** review

## [2026-05-11 12:33] nacl-tl-fix: race-window captured completion discarded as unrecoverable (from review)
- **Level:** L1
- **Status:** PASS
- **Root cause:** `engine.ts` entered the `qi.completed` crash-recovery branch and called `cancelListeners()` without first checking whether the bus listener had already captured the event during the race window (dispatcher fired after listener registration, before the DB pre-check returned). For text-llm steps, crash-recovery then queried `generated_assets` (empty), and failed with `TEXT_STEP_OUTPUT_UNRECOVERABLE` — converting a valid in-flight completion into a permanent failure.
- **Affected UC:** UC-150 (workflow engine FSM)
- **Docs updated:** none (L1 — spec intent at engine.ts:186-193 was already correct)
- **Code changed:**
  - `backend/src/modules/content/workflow-engine/event-listener.ts` — added live `captured` getter (via `Object.defineProperty`) to `waitForStepCompletion` return; handlers set `capturedValue` synchronously so engine can read it without awaiting
  - `backend/src/modules/content/workflow-engine/engine.ts` — in `qi.completed` branch, read `stepCompletionPromise?.captured` before `cancelListeners()`; if event was captured in race window, advance with its payload; otherwise fall through to unchanged crash-recovery path
- **Tests:** `backend/tests/content/engine.event-listener.test.ts` (new, Path A) — 6 pure-EventEmitter unit tests, RED against pre-fix code, GREEN after
- **Pre-existing failures (baseline-confirmed unrelated):** DB-backed integration suite blocked by sandboxed localhost PostgreSQL access (pre-existing environment constraint, unrelated to this fix)
- **Invocation source:** review

## [2026-05-11 12:12] nacl-tl-fix: 3 P1 crash-recovery holes in workflow engine (from review)
- **Level:** L1
- **Status:** PASS
- **Root cause:**
  - Bug 1 (race window): bus listeners were registered after the terminal-status pre-check; the dispatcher could complete the pre-inserted step-0 slot in the gap, emitting an event with no listener — the engine then awaited a promise that would never resolve.
  - Bug 2 (empty text recovery): completed `text-llm` steps don't persist `output_text` to `generated_assets`; the crash-recovery path built an empty `StepOutput{}` and advanced to the next step, silently passing `undefined` as the downstream prompt input.
  - Bug 3 (startup scan): `plugin.ts` onReady hook only scanned `queue_items WHERE status IN ('queued','running')`; terminal queue rows whose task hadn't been advanced (crash between worker commit and bus event) were invisible to the scan, leaving those workflows stuck permanently.
- **Affected UC:** UC-150 (workflow engine)
- **Docs updated:** none (L1 — spec describes correct behavior)
- **Code changed:**
  - `backend/src/modules/content/workflow-engine/event-listener.ts` — added `cancel()` to both `waitForStepCompletion` and `waitForVerification` return types
  - `backend/src/modules/content/workflow-engine/engine.ts` — moved listener registration before the terminal-status pre-check; added `TEXT_STEP_OUTPUT_UNRECOVERABLE` guard for text-llm steps; added `cancelListeners()` at all early-exit paths
  - `backend/src/modules/content/workflow-engine/plugin.ts` — startup scan SQL extended with JOIN to `tasks` to also resume tasks with terminal queue rows that are still non-terminal themselves
- **Tests:** new regression tests in `tests/content/engine.crash-recovery.test.ts` (2 tests, RED→GREEN confirmed); full suite 732/732 pass (baseline 730)
- **Pre-existing failures:** none
- **Invocation source:** review

## [2026-05-11 11:44] nacl-tl-fix: workflow-resume race + lint errors (from review)
- **Level:** L1
- **Status:** PASS (lint errors fixed) / UNVERIFIED (race — no unit test exercises the timing)
- **Root cause (P1):** engine.ts registered `waitForStepCompletion` AFTER calling `enqueue`; dispatcher could process the pre-inserted step-0 slot before the listener attached, dropping the bus event and stalling the workflow. Additionally, worker.ts prematurely set `task.status='completed'` after every step, causing engine's advisory-lock check to abort multi-step workflows. No startup recovery existed for tasks orphaned by a process crash.
- **Root cause (P2 × 2):** inline `import()` type annotations in task.routes.ts:70 and tasks.test.ts:46 violated @typescript-eslint/consistent-type-imports, breaking the lint gate.
- **Affected UC:** UC-104, UC-150
- **Docs updated:** none (L1, docs describe correct behavior)
- **Code changed:**
  - `backend/src/modules/content/workflow-engine/engine.ts` — register bus listeners before enqueue; add queue_items.status pre-check for crash recovery
  - `backend/src/modules/content/workflow-engine/plugin.ts` — startup scan resumes tasks with pending queue_items on onReady
  - `backend/src/modules/queue/worker.ts` — only UPDATE tasks to 'failed' (not 'completed'); engine is sole authority on task completion
  - `backend/src/modules/content/task.routes.ts` — top-level `import type { WorkflowDefinition }`
  - `backend/tests/content/tasks.test.ts` — top-level `import type * as QueueServiceModule`
- **Tests:** existing 730/730 pass; lint gate now 0 errors (was 2)
- **Pre-existing failures:** none
- **Invocation source:** review

## [2026-05-11 11:00] CONDUCTOR: fix-uc104-contract — 4 P1/P2 strategist findings
- **Batch:** `.tl/history/conductor-state-wave3-2026-05-11.json` (Wave 3 closure) is source of truth for prior wave completion; this batch fixes 4 audit findings against UC-104 + reconciles status.json.
- **Commits (direct-to-main):**
  - `349a592` — fix(UC-104): ensure task_input_files FK cascades on task delete (P2, L1)
  - `d56155f` — fix(UC-104): make task creation + first-step enqueue atomic (P1, L1)
  - `2afa052` — fix(UC-104): forward uploaded_files into workflow render context (P1, L1)
  - `6b66ef6` — fix(test-infra): restore task_input_files → tasks FK across destructive tests
- **Tests:** 730/730 green across two consecutive runs (was 724/1 fail at start of batch).
- **status.json reconciliation:** Wave 3 now `complete`; UC-301-FE / UC-305-FE flipped from `ready_for_dev` to `done` with commits `4f9406f` / `b4ee46d`; `summary.done` 24 → 28, `ready_for_dev` 27 → 21, added `verified_pending: 2`; `waves.current` 3 → 4.
- **SA spec change:** none — UC-104 atomicity + input-files invariants were already encoded in `impl-brief.md` / `acceptance.md` / migration 0015 header; this batch realigned implementation with spec.

## [2026-05-11 07:45] SYNC: UC-104 — Создание задачи и запуск workflow (BE-side)
- Phase: Sync Verification (BE-side only — UC-104-FE not yet implemented)
- Headline: SYNC APPLIED — BE_READY (partial; FE pending)
- Static checks: 8/8 BE PASS (endpoints, request/response DTOs, error codes, auth, shared types, mocks, test suite)
- Runtime: BE suite PASS (725/725) | FE suite N/A (UC-104-FE wave 5, pending)
- Endpoint coverage: 2/2 BE endpoints covered by `tasks.test.ts` (36 tests)
- Verdict: be_ready (same pattern as UC-103-BE, UC-150-BE, UC-151-BE)
- Next: re-run `/nacl-tl-sync UC-104` after UC-104-FE ships

## [2026-05-11 07:44] REVIEW: UC-104-BE — Создание задачи и запуск workflow (BE)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: none.
- Stub Gate: PASSED (no markers, no console.log)
- Result: approved
- Issues: 1 blocker (resolved during review), 0 critical, 0 major, 0 minor
- Tests: 725 passed (initial run 724/1 failed → root cause: migration 0015 missing `--> statement-breakpoint` markers, FK CASCADE not created by drizzle migrator; fix added markers, re-applied migration, 725/725 green)
- Test author independence: N/A (files untracked at review time)
- Checklist PARTIAL rows: 0
- Files modified during review: `backend/migrations/0015_create_task_input_files.sql` (added `--> statement-breakpoint` markers between CREATE TABLE / DO block / CREATE INDEX)

### [2026-05-11] nacl-tl-fix: FIX-8 + FIX-9 — dispatcher cap race + watchdog timeout without tasks table
- **Level:** L2 (both)
- **Status:** PASS
- **Root cause (FIX-8):** `claimSomething()` read dbRunning in a standalone query before `claimForProvider()` opened its transaction. Two concurrent dispatcher processes both saw dbRunning=0, both computed available=concurrency_limit, and SKIP LOCKED only prevented duplicate row claims — so 2×limit rows could become running. Fix: `pg_advisory_xact_lock(hashtext('queue_claim:' || provider))` at transaction start; running count re-queried inside the locked transaction.
- **Root cause (FIX-9):** `findStalled()` was fixed (FIX-3) to return rows without tasks table, but `timeout()` still ran `UPDATE tasks` unconditionally. Without public.tasks, the transaction rolled back and the slot stayed stuck in `running`. Fix: `tasksTableExists()` checked once per tick in `tick()`; result threaded into `process()` and `timeout()`; `UPDATE tasks` skipped with a WARN log when table is absent.
- **Affected UC:** UC-202 (dispatcher), UC-203 (watchdog)
- **Docs updated:** `.tl/tasks/UC-202/task-be.md` (step 1 — advisory lock + in-tx count invariant); `.tl/tasks/UC-203/task-be.md` (step 3 — conditional UPDATE tasks)
- **Code changed:** `backend/src/modules/queue/dispatcher.ts`, `backend/src/modules/queue/watchdog.ts`
- **Tests:** `npm test` (vitest run) — baseline 558/42 green. Regression tests written first (Path A): `tests/queue/dispatcher.concurrency-cap.test.ts` (3 tests), `tests/queue/watchdog.timeout-no-tasks.test.ts` (4 tests). All 4 target tests RED before fix, all 7 GREEN after. Full suite: 565/44 green, 0 new failures.
- **Pre-existing failures:** none

### [2026-05-11] nacl-tl-fix: backend lint cleanup (FIX-7)
- **Level:** L1
- **Status:** PASS
- **Root cause:** Three pre-existing error families masked by pnpm -r first-fail short-circuit (frontend used to abort before backend ran): (a) unused imports auto-introduced during Wave 2 dev and FIX-2/FIX-3/FIX-4 cleanup; (b) `import()` inline type annotations in worker.ts and dispatcher.test.ts (not auto-fixed because they're inside interface/class bodies); (c) `method as any` in six route test files — endpoints arrays typed as `string` but Fastify inject expects `HTTPMethods`.
- **Affected UC:** none (lint hygiene, no spec impact)
- **Docs updated:** none (L1)
- **Code changed:** backend/src/modules/queue/worker.ts, backend/tests/queue/dispatcher.test.ts, backend/tests/admin/{categories,category-mappings,model-profiles,prompt-templates,provider-configs.crud,workflow-step-configs.crud}.routes/crud.test.ts, + auto-fixed unused imports across 20 source/test files
- **Tests:** `pnpm -r lint` — 31 backend errors → 0 errors. `pnpm --filter backend test` — 558/42 green.
- **Pre-existing failures:** none

## [PLAN-RECONCILE] 2026-05-07

Audit-driven reconciliation after a full plan-vs-graph-vs-files verification pass.

**master-plan.md edits:**
- Header counts corrected: `19 MVP + 5 POST_MVP` (was `18 MVP + 6 POST_MVP`)
- §3 Wave 2 split corrected: `5 FE + 5 BE` (was `6 FE + 4 BE`; total 10 unchanged)
- §3 Wave 6: dropped "(deferred)" and the "NOT generated in initial pass" sentence — Wave 6 is now treated as a full-fledged execution stage on equal footing with Waves 0–5 (per user direction; task files and graph were already complete)
- §3 Wave 0 / TECH-009 row: corrected `ecosystem.config.js` → `ecosystem.config.cjs` (PM2 ecosystem files require CommonJS in an ESM monorepo)
- §5.2: extended worker-only `internal-contract.md` rule to all `MOD-QUEUE` UCs including UC-201 (in-process function-call interface, no HTTP surface — consistent with ADR-007). Also documented the pure-BE `phases: { be, review, qa }` shape for status.json

**Neo4j (TL layer):**
- Added 11 missing TECH→TECH `DEPENDS_ON` edges so Wave-0 ordering is enforced in the graph (TECH-001 is the root; TECH-002..009 each depend on it; TECH-003/008 also depend on TECH-002 for the DB/MinIO container; TECH-005 also depends on TECH-003 for DB-backed auth)

**Task files:**
- Updated frontmatter `depends_on` / `blocks` on all 9 TECH `task.md` files to mirror the new graph edges (was `[]` on most files — now matches §5.6 contract)
- TECH-006/test-spec.md: replaced `(placeholder modules)` with `(test-only route fixtures emulating the modules)` to avoid §5.5 keyword overlap

**status.json:**
- Stripped `sync` phase from 6 pure-BE UC entries (UC-150, UC-151, UC-201, UC-202, UC-203, UC-410); each now carries `phases: { be, review, qa }` and a `pure_be: true` flag for downstream consumers

No code under `backend/` or `frontend/` was modified — this is a planning-artifact-only reconciliation.

## [PLAN] 2026-05-06

- Created high-level development plan from Neo4j SA layer (24 UCs, 4 modules, 32 requirements)
- Generated 51 task entries: **9 TECH** (Wave 0) + **33 MVP UC tasks** (Waves 1–5) + **9 POST_MVP UC tasks** (Wave 6, deferred)
- Created 7 Wave nodes and 51 Task nodes in Neo4j (TL layer)
- Wrote 55 `Task -[:DEPENDS_ON]-> Task` edges encoding the dependency graph
- Wrote `(UseCase)-[:GENERATES]->(Task)` for every UC task
- Authored `master-plan.md` (architecture contract — invariants, naming, file rules, wave breakdown) and `wave-brief-template.md` (standing instructions for fresh-context wave-generation agents)
- **Per-UC task files (8 per UC) NOT generated yet.** Each wave will be expanded by a dedicated fresh-context agent following `wave-brief-template.md`, so each agent's context budget is used on careful, accurate transcription of one wave's UCs only

### Next

Spawn a fresh-context agent for Wave 0 (TECH tasks):
```
Read .tl/master-plan.md and .tl/wave-brief-template.md.
Generate task files for Wave 0 (9 TECH tasks).
Tasks: TECH-001..TECH-009 (see .tl/status.json wave 0).
```

## [WAVE-0-PLAN] 2026-05-06

- Generated task files for Wave 0 (9 TECH tasks): TECH-001..TECH-009
- 27 files written under `.tl/tasks/TECH-NNN/` (3 per task: `task.md`, `impl-brief.md`, `test-spec.md`)
- All files self-sufficient (no `see SA docs` / `query Neo4j` references); architecture invariants from master-plan §1.2 embedded in each `impl-brief.md`
- Frontmatter aligned with Neo4j `Task.depends_on` / `blocks` (Wave 0 has no upstream deps; `blocks` reflects future Wave 1+ unblocks)
- Neo4j: 9 `Task.status = 'ready_for_dev'`, `task_files_generated = true`; `Wave 0.status = 'planned'`, `planned_at` set
- Ready for `/nacl-tl-dev TECH-001` (start with monorepo scaffold; TECH-001..009 have no inter-deps so any can start, but recommend the order TECH-001 → 002 → 003/004/005/006/007/008 → 009)

## [WAVE-1-PLAN] 2026-05-06

- Generated task files for Wave 1 (5 BE tasks): UC-101-BE, UC-102-BE, UC-302-BE, UC-303-BE, UC-304-BE
- 40 files written under `.tl/tasks/UC-NNN/` (8 per UC — full UCs with forms): `api-contract.md`, `task-be.md`, `task-fe.md`, `test-spec.md`, `test-spec-fe.md`, `impl-brief.md`, `impl-brief-fe.md`, `acceptance.md`
- FE files (task-fe / test-spec-fe / impl-brief-fe) carry Wave-2 frontmatter so Wave-2 agent can verify them in place rather than regenerate
- All files self-sufficient (no `see SA docs` / `query Neo4j` references — only prohibitions reminding dev agents NOT to read those sources)
- Architecture invariants from master-plan §1.2 embedded per impl-brief: argon2id password hashing (UC-101/102), JWT 1h/30d + httpOnly refresh cookie (UC-101/102), single-tenant (all 5), admin-only auth (UC-302/303/304), soft-delete only (UC-302/303/304), envelope-encrypted secrets (UC-303 cross-references — actual encryption lives in UC-305/ProviderConfig)
- **Spec discrepancy noted, not papered over.** SA graph activity step `step-101-3` says "bcrypt cost factor 12"; TECH-005 task contract chose `argon2id`. UC-101 task files align with TECH-005 (the active TL contract). If the project wants bcrypt instead, update TECH-005 first, then UC-101 will follow on regeneration.
- **Stub Requirements observed.** REQ-FR-001/002/003 and REQ-AUTH-001/002 are linked but lack `name`/`description` in the graph. acceptance.md files cite them by ID and reproduce the UC's `acceptance_criteria` text as the working checklist.
- Frontmatter aligned with Neo4j Task→Task DEPENDS_ON edges (verified bidirectionally — `depends_on` lists upstream tasks, `blocks` lists downstream)
- Neo4j: 5 `Task.status = 'ready_for_dev'`, `task_files_generated = true`; `Wave 1.status = 'planned'`, `planned_at` set
- Migration order coordination noted in impl-briefs: UC-304 (`categories`) → UC-303 (`model_profiles`) → UC-302 (`prompt_templates`) so FK targets exist when each migration runs
- Ready for `/nacl-tl-dev-be UC-101-BE` (or any of UC-102/302/303/304 — they're independent within Wave 1 once their TECH preconditions are done)

## [WAVE-2-PLAN] 2026-05-06

- Generated task files for Wave 2 (10 tasks): 5 FE verified-in-place (UC-101-FE, UC-102-FE, UC-302-FE, UC-303-FE, UC-304-FE — Wave 1 had pre-shipped them with Wave-2 frontmatter) + 5 NEW dirs (UC-201, UC-202, UC-203 pure-BE workers; UC-301 admin user mgmt; UC-305 WorkflowStepConfig + ProviderConfig admin)
- 31 NEW files written: 3×5 (queue UCs — `internal-contract.md` + `task-be.md` + `test-spec.md` + `impl-brief.md` + `acceptance.md`) + 8 (UC-301) + 8 (UC-305). UC-101/102/302/303/304 FE files were already in place from Wave 1 (only frontmatter + content verified)
- UC-201 / 202 / 203 use **`internal-contract.md`** (pure-BE workers with no HTTP surface, per master-plan §5.2). UC-301 and UC-305 have full HTTP CRUDs and use `api-contract.md`
- All files self-sufficient (no `see SA docs` / `query Neo4j` references — only prohibitions reminding dev agents NOT to read those sources, identical pattern to Wave 1)
- Architecture invariants from master-plan §1.2 embedded per impl-brief: durable queue + `SELECT FOR UPDATE SKIP LOCKED` + heartbeat + transactional commit before SSE (UC-201/202/203), AES-256-GCM envelope for `provider_configs.api_key` (UC-305), workflow hardcoded — UI tunes step parameters only (UC-305), `requireRole('admin')` on all admin endpoints (UC-301/305), JWT 1h/30d (UC-301), single-tenant (all 5 UCs), Pino redaction extended to mask `req.body.api_key` (UC-305 → coordinates with TECH-006)
- **Cross-UC coordination noted**: UC-202 introduces `generated_assets`, `generation_logs`, `task_status` / `task_type` / `file_type` pgEnums (the `tasks` table itself is shipped by UC-103-BE in Wave 3; FK constraints from `generated_assets` / `generation_logs` to `tasks` are deferred — `NOT VALID` — until UC-103-BE migration validates them). UC-201's `queue_items.task_id` FK is similarly deferred. UC-305 introduces `workflow_step_configs` (FK to `prompt_templates` from UC-302 — already shipped) and `provider_configs` (UNIQUE on `provider`)
- **Stub Requirements observed**. REQ-FR-005 / REQ-FR-010 / REQ-FR-014 / REQ-FR-015 / REQ-AUTH-001 / REQ-AUTH-002 are linked but `proposed=true` with no name/description in graph. acceptance.md files cite them by ID and reproduce the UC's `acceptance_criteria` text as the working checklist
- **Process model decision (UC-202)**: in-process worker loop registered as Fastify `onReady` hook (PM2 `cluster_mode` disabled). Sidecar PM2 process documented as the alternative for scaling. UC-203 watchdog runs alongside as a separate ticker
- **Provider adapter pattern (UC-202)**: pluggable `ProviderAdapter` interface; one file per provider (`openrouter.ts`, `kie-ai.ts`, `apiframe.ts`, `gemini.ts`) sharing a uniform `(payload, apiKey, baseUrl, timeoutMs) → ProviderResult` contract
- **Last-admin guard (UC-301)**: PATCH that disables/demotes the only active admin → 409 `LAST_ADMIN_DISABLE`. Also blocks self-disable to prevent admin lock-out. Check uses `SELECT count(*) … FOR UPDATE` inside the same transaction
- **Write-only `api_key` (UC-305)**: BE never returns plaintext; FE strips it from RHF state via `form.resetField('api_key')` after submit; `autocomplete="new-password"`. PATCH with empty `api_key` does NOT include the field in the body — preserving the encrypted value. Dedicated `POST /:id/rotate-key` endpoint re-encrypts with current KEK and audit-logs `provider.api_key.rotated`
- **Cache invalidation contract (UC-305 ↔ UC-202/UC-203)**: PATCH and rotate-key call `app.queue.providerConfigCache.invalidate(provider)` — UC-202's claim loop and UC-203's watchdog see updated config within ≤ 60s (cache TTL fallback) and immediately on explicit invalidation
- Frontmatter aligned with Neo4j Task→Task DEPENDS_ON edges (verified bidirectionally — `depends_on` lists upstream tasks, `blocks` lists downstream)
- Neo4j: 10 `Task.status = 'ready_for_dev'`, `task_files_generated = true`; `Wave 2.status = 'planned'`, `planned_at` set
- status.json: 24 tasks now `ready_for_dev` (9 TECH + 5 Wave-1 BE + 10 Wave-2); 27 still pending (Waves 3–6)
- Ready for `/nacl-tl-dev-be UC-201-BE` (highest leverage — unblocks UC-202/203/150/104) or any of `/nacl-tl-dev-fe UC-101-FE`, `UC-102-FE`, `UC-302-FE`, `UC-303-FE`, `UC-304-FE` (FE for already-shipped Wave-1 BE)

## [WAVE-3-PLAN] 2026-05-06

- Generated task files for Wave 3 (6 tasks): UC-103-BE (session creation), UC-104-BE (create task + start workflow), UC-150-BE (workflow execution engine — pure-BE worker), UC-151-BE (verifier-loop — pure-BE worker), UC-301-FE (admin user mgmt — verified in place from Wave 2 pre-ship), UC-305-FE (WorkflowStepConfig + ProviderConfig admin — verified in place from Wave 2 pre-ship)
- 26 NEW files written: 8 (UC-103: full UC with form — `api-contract.md` + `task-be.md` + `task-fe.md` + `test-spec.md` + `test-spec-fe.md` + `impl-brief.md` + `impl-brief-fe.md` + `acceptance.md`, FE files carry Wave-4 frontmatter), 8 (UC-104: full UC with form, FE files carry Wave-5 frontmatter), 5 (UC-150: pure-BE worker with `internal-contract.md`), 5 (UC-151: pure-BE worker with `internal-contract.md`). UC-301-FE and UC-305-FE were already in place from Wave 2 pre-ship; only frontmatter + content verified
- UC-150 and UC-151 use **`internal-contract.md`** (pure-BE workers with no HTTP surface, per master-plan §5.2). UC-103 and UC-104 have full HTTP CRUDs and use `api-contract.md`
- All files self-sufficient (no `see SA docs` / `query Neo4j` references — only prohibitions reminding dev agents NOT to read those sources, identical pattern to Waves 1 & 2)
- Architecture invariants from master-plan §1.2 embedded per impl-brief: presigned PUT for upload (UC-104), presigned GET TTL ≤ 15min for verifier asset URL (UC-151), durable queue + transactional commit before SSE emit (UC-104/150/151), workflow hardcoded in YAML/JSON (UC-150 — engine loads at boot from `backend/src/workflows/*.yaml`), AES-256-GCM envelope for verifier provider `api_key_encrypted` (UC-151 reads via TECH-003 envelope util — never logs plaintext), single-tenant (all 4 NEW UCs), JWT user_id never trusted from body — always taken from JWT (UC-103/104), advisory `pg_advisory_xact_lock(hashtext(task_id))` for per-task FSM serialization (UC-150)
- **Cross-UC coordination notes**: (a) UC-103-BE ships the `sessions` table; UC-104-BE adds the `tasks` and `task_input_files` tables (the deferred FK from `generated_assets`/`generation_logs`/`queue_items` introduced in Wave 2 will be VALIDATED on UC-104 migration). (b) UC-150-BE adds `generated_assets` and `generation_logs` schemas iff Wave-2 UC-202 hasn't already (coordinated via migration ordering in impl-brief). (c) UC-151-BE introduces `verification_reports` table; UC-150 reads from it. (d) UC-150 emits internal events on `app.workflowBus` (Fastify-decorated EventEmitter) — UC-202 worker (Wave 2) must publish on it after its result transaction commits (small additive change documented in UC-150/impl-brief.md §9). (e) Verifier event channels: `verifier:{taskId}:{stepId}` with payloads `{ task_id, step_id, asset_id, attempt_no }` for `verifier.passed`/`retry`/`failed` — contract pinned in UC-151/internal-contract.md
- **Design decision (UC-104)**: single endpoint `POST /api/content/sessions/:sessionId/tasks` does the full create+resolve+enqueue in one transaction. Rationale: SA `step-104-5` is transactional by spec; splitting create/submit invites half-created tasks. Documented in UC-104/api-contract.md "Design notes"
- **Design decision (UC-150)**: workflow YAML lives in `backend/src/workflows/<task_type>.yaml`, loaded at boot. Step kinds: `text-llm | image-llm | video-llm | verifier`. Per-task FSM is single-threaded via advisory lock; many tasks run concurrently
- **Design decision (UC-151)**: VerificationReport uniqueness is `(task_id, step_id, attempt_no)`. UC-151 emits `verifier.failed` automatically if `attempt_no >= retry_max` even on a `retry` verdict (safety guard against UC-150 looping if event bus delays delivery). Verifier prompt template hardcoded in repo (`backend/src/workflows/verifier.yaml` or `verifier-prompt.ts`) — not admin-editable in MVP
- **Stub Requirements observed**. REQ-FR-001/004/005/006/007/008/009/010/011/014/015/019, REQ-AUTH-001/002 are linked but `proposed=true` with no name/description in graph. acceptance.md files cite them by ID and reproduce the UC's `acceptance_criteria` text as the working checklist (same pattern as Waves 1 & 2)
- **Assumptions flagged in files** (not papered over): UC-103 — `GET /api/content/categories` is a thin read-through of UC-304's table restricted to `is_active=true`; coordination noted in UC-103/api-contract.md. UC-104 — `Task.completed_at` column inferred and marked "(confirm with UC-105 read schema)"; first-step resolution assumes a `step_order` column on `workflow_step_configs` (UC-150 owner). UC-150 — assumes `app.workflowBus` EventEmitter decorated on Fastify app and that UC-202 emits after its result tx commits. UC-151 — its `verification_reports` schema is owned here; UC-150 reads but does not own it
- Frontmatter aligned with Neo4j Task→Task DEPENDS_ON edges (verified bidirectionally for all 6 tasks). UC-103-BE depends_on: [UC-101-BE]; UC-104-BE depends_on: [UC-103-BE, UC-201-BE, UC-150-BE, TECH-008]; UC-150-BE depends_on: [UC-201-BE, UC-302-BE, UC-303-BE, UC-305-BE, TECH-008]; UC-151-BE depends_on: [UC-150-BE]
- Neo4j: 6 `Task.status = 'ready_for_dev'`, `task_files_generated = true`; `Wave 3.status = 'planned'`, `planned_at` set
- status.json: 30 tasks now `ready_for_dev` (9 TECH + 5 Wave-1 + 10 Wave-2 + 6 Wave-3); 21 still pending (Waves 4–6)
- Ready for `/nacl-tl-dev-be UC-103-BE` (smallest, fewest deps — UC-101-BE only) or `/nacl-tl-dev-fe UC-301-FE` / `UC-305-FE` (FE for already-shipped Wave-2 BE). UC-150-BE is the largest single task and the critical-path bottleneck for Waves 4–5

## [WAVE-4-PLAN] 2026-05-06

- Generated task files for Wave 4 (6 tasks): UC-103-FE (session view — already in place from Wave 3 full-UC generation, frontmatter `wave:4` verified), UC-105-BE (task status & results read — GET + SSE), UC-106-BE (SSE notification on task completion + persisted UserNotification list), UC-107-BE (cancel task — DELETE with idempotent semantics across all 5 source statuses), UC-108-BE (presigned S3 download URL, TTL 5 min), UC-401-BE (admin monthly usage report, on-demand aggregation from GenerationLog)
- 40 NEW files written across UC-105/106/107/108/401 (8 per UC: `api-contract.md` + `task-be.md` + `task-fe.md` + `test-spec.md` + `test-spec-fe.md` + `impl-brief.md` + `impl-brief-fe.md` + `acceptance.md`); UC-103 already had its 8 files from Wave 3. Wave-5 frontmatter on the FE files of UC-105/106/107/108/401 (their FE counterparts ship in Wave 5)
- All UCs in this wave have a Form, so all use `api-contract.md` (no `internal-contract.md` this wave). UC-106 introduces a small persisted entity `UserNotification` (BE-owned migration) to satisfy «История уведомлений доступна»
- All files self-sufficient (no `see SA docs` / `query Neo4j` references — only prohibitions reminding dev agents NOT to read those sources, identical pattern to Waves 1–3)
- Architecture invariants from master-plan §1.2 embedded per impl-brief: SSE plumbing (UC-105 `/tasks/:id/events`, UC-106 `/notifications/events` — `fastify-sse-v2`, Caddy `flush_interval -1`, `X-Accel-Buffering: no`, heartbeat 25s; UC-106 tightens to 15-25s per spec); transactional commit before SSE publish (UC-105 read invariant; UC-106 `UserNotification` INSERT in same tx as Task status flip, SSE publish after COMMIT — REQ-NFR-011); presigned S3 GET TTL ≤ 15 min general + UC-108 narrows to 300s with `response-content-disposition=attachment`; JWT 1h access / 30d refresh httpOnly cookie + EventSource fallback to access_token cookie on SSE endpoints; admin preHandler `role=admin` (UC-401); single-tenant (no `client_id` anywhere — explicit negative assertions in every acceptance.md)
- **Cross-UC coordination notes**: (a) UC-105 SSE channel format is `task:{taskId}` published by UC-202 worker after its result-tx COMMIT; UC-105 documents the contract for what events to expect (`status_changed`, `step_advanced`, `asset_added`, `verdict_set`, `task_completed`, `task_failed`, `heartbeat`). (b) UC-106 SSE channel is `user:{userId}`, populated by the same worker hook — UC-106 spec adds `notifications.publishNotification(tx, {...})` called by UC-202 inside its tx. (c) UC-107 cancel touches both Task and QueueItem in one tx; queue-side propagation via `queueService.cancelByTaskId(tx, taskId)` from UC-202's `queue.service.ts`. UC-107 documents the worker contract: «UC-202 must check `Task.status='cancelled'` before each step commit and abort cleanly». (d) UC-108 download endpoint reads `s3_key` via JOIN `generated_assets` ↔ `tasks` and never writes GenerationLog (acceptance criterion 3). (e) UC-401 reads from `generation_log` + `users` + `tasks`; uses on-demand SQL aggregation (no materialized view in MVP — UC-410 POST_MVP)
- **Design decision (UC-105)**: dual transport (`GET /tasks/:id` for initial+reconnect fetch + `GET /tasks/:id/events` SSE stream for incremental updates) per REQ-NFR-011. EventSource native + `fetch-event-source` fallback for header-based auth. `Last-Event-ID` resume supported
- **Design decision (UC-106)**: small new persisted table `user_notifications` (id, user_id, task_id, event_type, failure_reason, read_at, created_at) with index `(user_id, created_at DESC)` and partial index `WHERE read_at IS NULL` for unread count. Browser tab title blink via `useTabBlink` hook gated on `document.visibilityState==='hidden'`
- **Design decision (UC-107)**: chose DELETE over PATCH for cancel verb. Idempotent: 200 with current state if already in target. 409 `TASK_ALREADY_FINISHED` only for terminal-not-cancelled (`completed`/`failed`/`timeout`). `running` cancels are best-effort (set `Task.status='cancelled'`; worker checks before each step commit)
- **Design decision (UC-108)**: presigned URL TTL **exactly 300s** (5 min) per UC SA acceptance, narrower than the project-wide ≤ 15min ceiling. Filename via `response-content-disposition=attachment` set server-side. FE never caches the URL — always re-fetches on each click. Optional 409 `ASSET_NOT_READY` gate when `is_final=false` AND task status not terminal
- **Design decision (UC-401)**: on-demand aggregation (no materialized view in MVP). `tasks_completed` requires DISTINCT counting (CTE) to avoid double-counting tasks with multiple log rows. Period validation: `/^\d{4}-(0[1-9]|1[0-2])$/` plus future-month + pre-2024-01 floor. `cost_usd_total` returned as string (pg numeric → JSON string) to preserve precision. Freshness badge (green <24h, amber otherwise) on FE per REQ-NFR-009
- **Stub Requirements observed**. REQ-FR-001/010/011/018, REQ-AUTH-002 linked from these UCs but `proposed=true` with no name/description in graph. acceptance.md files cite them by ID and use the UC's `acceptance_criteria` text as the working checklist (same pattern as Waves 1–3)
- **Assumptions flagged in files**: UC-105 — embeds `latest_verification` payload in the GET response (denormalized convenience; alternative would be a separate `/tasks/:id/verifications` endpoint, deferred). UC-106 — `user_notifications` rows are inserted by UC-202's worker tx via the publish hook; if UC-202 has not yet wired the hook at dev-time, UC-106 BE provides a no-op stub and the wiring is a small additive step in UC-202's impl-brief. UC-107 — `cancel` for `running` tasks is best-effort (worker may have already crossed the commit boundary). UC-108 — readiness gate is documented but optional; default impl allows download for `is_final=true` regardless of task status. UC-401 — `freshness_hours` is computed FE-side from `generated_at`; if a UC-410 snapshot table is introduced later, swap source without changing the response shape
- Frontmatter aligned with Neo4j Task→Task DEPENDS_ON edges (verified bidirectionally for all 6 tasks). UC-103-FE: [UC-103-BE]; UC-105-BE: [UC-104-BE]; UC-106-BE: [UC-104-BE, TECH-007]; UC-107-BE: [UC-104-BE, UC-202-BE]; UC-108-BE: [UC-104-BE, TECH-008]; UC-401-BE: [UC-150-BE]
- Neo4j: 6 `Task.status = 'ready_for_dev'`, `task_files_generated = true`; `Wave 4.status = 'planned'`, `planned_at` set
- status.json: 36 tasks now `ready_for_dev` (9 TECH + 5 Wave-1 + 10 Wave-2 + 6 Wave-3 + 6 Wave-4); 15 still pending (Waves 5–6)
- Ready for `/nacl-tl-dev-be UC-105-BE` (read endpoints, simplest entry point for Wave 4) or `/nacl-tl-dev-be UC-108-BE` (S3 wrapper consumer — verifies TECH-008 integration). UC-401-BE depends on UC-150-BE landing first; UC-107-BE waits on UC-202-BE

## [WAVE-5-PLAN] 2026-05-06

- Generated task files for Wave 5 (6 tasks): UC-104-FE (создание задачи + presigned upload), UC-105-FE (статус и результаты задачи + SSE), UC-106-FE (уведомления о завершении + SSE + bell + history), UC-107-FE (отмена задачи), UC-108-FE (скачивание результата по presigned URL), UC-401-FE (admin monthly usage report)
- 0 NEW files written — all 48 Wave-5 FE artifacts (8 files × 6 UCs) were pre-shipped in Waves 3–4 with `wave: 5` frontmatter (UC-104-FE during Wave 3, UC-103/UC-105/UC-106/UC-107/UC-108/UC-401 FE during Wave 4 BE generation, UC-103-FE landed in Wave 4 with `wave: 4` per master-plan §3). Wave-5 work is verification + status promotion: every file checked for frontmatter contract compliance, Neo4j edge alignment, embedded §1.2 invariants, no forbidden references
- Frontmatter verified bidirectionally for all 6 tasks. UC-104-FE depends_on: [UC-104-BE]; UC-105-FE: [UC-105-BE]; UC-106-FE: [UC-106-BE]; UC-107-FE: [UC-107-BE]; UC-108-FE: [UC-108-BE]; UC-401-FE: [UC-401-BE]. All `blocks: []` (Wave 5 is the terminal MVP wave; nothing downstream in Waves 0–5)
- Self-sufficiency clean across all 30 verified files (5 per UC: `task-fe.md` + `test-spec-fe.md` + `impl-brief-fe.md` + `acceptance.md` + `api-contract.md` shared with BE) — zero unauthorized "see SA docs" / "query Neo4j" / "refer to graph" occurrences (only the mandated dev-agent prohibitions remain)
- Architecture invariants from master-plan §1.2 verified embedded per `impl-brief-fe.md`:
  - **UC-104-FE**: single-tenant (no tenant selector / no `client_id` in S3 keys); JWT 1h access + 30d refresh httpOnly+SameSite=Lax cookie + `credentials: 'include'`; presigned PUT TTL 900s — binary never proxied through Fastify; shared types from `@project-alpha/shared`
  - **UC-105-FE**: SSE via `@microsoft/fetch-event-source` against `/api/content/tasks/:id/events` (`fastify-sse-v2` server, Caddy `flush_interval -1`, `X-Accel-Buffering: no`, heartbeat 25s); REQ-NFR-011 durability — on disconnect, GET `/tasks/:id` re-fetch BEFORE re-subscribing to SSE (Last-Event-ID resume supported); shared types `TaskWithDetail` / `TaskSseEvent` from `@project-alpha/shared`
  - **UC-106-FE**: SSE on `/api/content/notifications/events` with heartbeat 15–25s; on reconnect, FE calls `GET /api/content/notifications?status=unread` to recover events missed during disconnect; tab-blink via `useTabBlink` gated on `document.visibilityState==='hidden'`; persisted UserNotification list (read/unread toggle); shared types `NotificationSseEvent` / `NotificationEventType`
  - **UC-107-FE**: idempotent DELETE `/api/content/tasks/:taskId` (200 with current state if already cancelled, 409 `TASK_ALREADY_FINISHED` for completed/failed/timeout); FE relies on TanStack Query invalidation + UC-106 SSE for cancel feedback (no dedicated `task_cancelled` event); JWT in Zustand auth store
  - **UC-108-FE**: presigned GET TTL **exactly 300s** (5 min, narrower than project-wide ≤15min ceiling); FE never caches presigned URL — re-fetches on each click; download via anchor with `download` attr + `response-content-disposition=attachment` set server-side; optional 409 `ASSET_NOT_READY` UX path
  - **UC-401-FE**: `requireRole('admin')` enforced server-side; FE gates the `/admin/reports` route via Zustand auth selector and redirects non-admin to `/login`; no `client_id` in any request; freshness badge (green <24h, amber otherwise) computed FE-side from `generated_at` per REQ-NFR-009
- **No new design decisions** in Wave 5 — all FE choices follow the BE contracts shipped in Waves 3–4. Verification confirmed each FE consumes exactly the api-contract.md endpoints/error codes its BE counterpart implements
- **Stub Requirements observed** (same pattern as Waves 1–4). REQ-FR-001/004/006/010/011/018, REQ-AUTH-002, REQ-NFR-009/011 are linked but `proposed=true` with no name/description in graph. acceptance.md files cite them by ID and reproduce the UC's `acceptance_criteria` text as the working checklist
- Neo4j: 6 `Task.status = 'ready_for_dev'`, `task_files_generated = true`; `Wave 5.status = 'planned'`, `planned_at` set
- status.json: 42 tasks now `ready_for_dev` (9 TECH + 5 Wave-1 + 10 Wave-2 + 6 Wave-3 + 6 Wave-4 + 6 Wave-5 = 42), 9 deferred (Wave 6 POST_MVP), 0 pending. `waves.planned_through = 5`
- **MVP planning complete**. Wave 5 is the terminal MVP wave — Wave 6 (UC-109/110/204/402/410) remains deferred per master-plan §3 until product confirms scope
- Ready for `/nacl-tl-dev-fe UC-104-FE` (highest leverage — kicks off the user-facing journey: create task → status → notifications → cancel/download). UC-401-FE can run in parallel (admin-only, isolated module). All 6 Wave-5 FE tasks have their BE counterparts at `ready_for_dev` and may begin once the relevant BE is shipped + reviewed

## [WAVE-6-PLAN] 2026-05-06

- Generated task files for Wave 6 (9 POST_MVP tasks): UC-109-BE/FE (edit-агент с mask painter — лифт MVP-deferral "Mask Editor"), UC-110-BE/FE (просмотр истории сессий с фильтрами), UC-204-BE/FE (admin: мониторинг очереди + cancel/retry), UC-402-BE/FE (экспорт отчёта в CSV/XLSX), UC-410-BE (cron-материализация снапшота отчёта)
- 37 files written: 8 per full UC (UC-109/110/204/402) + 5 for pure-BE UC-410 (`internal-contract.md` instead of `api-contract.md` per master-plan §5.2 — UC-410 has no HTTP surface)
- Wave 6 was previously `deferred` per master-plan §3 ("not specified until product confirms scope"); user invoked /nacl-tl-plan with explicit scope confirmation
- Frontmatter verified bidirectionally against Neo4j `DEPENDS_ON` edges:
  - UC-109-BE depends_on:[UC-104-BE], blocks:[UC-109-FE]
  - UC-110-BE depends_on:[UC-103-BE], blocks:[UC-110-FE]
  - UC-204-BE depends_on:[UC-201-BE, UC-202-BE], blocks:[UC-204-FE]
  - UC-402-BE depends_on:[UC-401-BE], blocks:[UC-402-FE]
  - UC-410-BE depends_on:[UC-401-BE], blocks:[] (terminal — no Wave 6 task depends on it)
  - All FE tasks depend_on their BE counterpart, blocks:[]
- Self-sufficiency clean across all 37 files — zero unauthorized "see SA docs" / "query Neo4j" / "refer to graph" / "as defined in the graph" occurrences (one false-positive in UC-109 impl-brief invariant statement was reworded)
- Architecture invariants from master-plan §1.2 embedded per `impl-brief*.md`:
  - **UC-109-BE**: single-tenant (no `client_id` on `tasks`); workflow hardcoded — UC ships `backend/src/workflows/edit.yaml`; transactional commit before SSE — handler does NOT publish; SSE owned by queue worker (UC-202 → UC-106); `MOD-QUEUE` enqueue inside same tx as task INSERT (test P-04 atomicity); no PII in logs (`edit_prompt` content excluded)
  - **UC-109-FE**: shared types from `@project-alpha/shared`; mask polygon stored in CSS-px state and converted to normalized [0,1] only at submit (resize-safe); access JWT via global interceptor; navigates to existing UC-105/UC-106 in-flight view post-202
  - **UC-110-BE**: read-only; per-row scope via `WHERE user_id = :jwt.user_id` on every query; cross-user 404 (not 403) to avoid existence leak; cursor-based pagination on `(updated_at, id)` for sessions and `(created_at, id)` for tasks; new indexes shipped (`idx_sessions_user_updated`, `idx_tasks_session_created`)
  - **UC-110-FE**: TanStack Query `useInfiniteQuery`; filters in route search-params (Zod-validated); no client-side filtering; drawer pattern via `?selected=<id>`
  - **UC-204-BE**: `FOR UPDATE` (NOT `SKIP LOCKED`) — admin must serialize against worker; transactional commit before SSE — `pushEvent` called from route handler AFTER `db.transaction(...)` returns; idempotent cancel (`already: true` for re-cancel of cancelled row); retry creates NEW row with `attempt_no=1` per acceptance criteria, original kept for audit; `HEARTBEAT_STALE_SECONDS` constant shared with UC-203 watchdog
  - **UC-204-FE**: admin-only via `<AdminGuard>`; TanStack Query `refetchInterval: 5000` paused on tab hidden; per-row Cancel/Retry hidden by status; confirm dialogs prevent double-click via mutation pending state
  - **UC-402-BE**: streaming download (CSV via `csv-stringify` + `pipeline()`, XLSX via `exceljs` `WorkbookWriter`); UTF-8 BOM in CSV for Excel Cyrillic; refactors UC-401 aggregation into shared service `monthly-usage.service.ts`; pre-stream errors return JSON envelope, mid-stream errors close response cleanly; no PII in logs; reads `monthly_usage_snapshots` (UC-410) when present, falls back to on-demand
  - **UC-402-FE**: fetch+blob+anchor download (so Bearer auth header attaches); local `useState` for busy flag; not a TanStack Query (binary response, do not cache)
  - **UC-410-BE**: pure-BE worker, no HTTP, no SSE; PM2 cron `0 3 1 * *` (UTC) satisfies REQ-NFR-009 ≤24h freshness; idempotent UPSERT via `INSERT ... ON CONFLICT (period, user_id, task_type) DO UPDATE`; aggregates ALL `generation_log` rows per REQ-NFR-008 (success+fail+retry); empty-month warn-log as alert hook; ad-hoc `--period=YYYY-MM` for backfill
- Stub Requirements observed (same pattern as Waves 1–5). REQ-FR-010/011/018/019, REQ-AUTH-001/002 are linked but `proposed=true` with no name/description in graph. `acceptance.md` files cite them by ID and reproduce UC's `acceptance_criteria` as the working checklist. REQ-NFR-008/009 (UC-410) have full descriptions and are quoted verbatim
- Neo4j: 9 `Task.status = 'ready_for_dev'`, `task_files_generated = true`; `Wave 6.status = 'planned'`, `planned_at = 2026-05-06T20:52:48Z`
- status.json: 51 tasks now `ready_for_dev` (42 MVP + 9 POST_MVP), 0 deferred, 0 pending. `waves.planned_through = 6`. WAVE-6 status flipped from `deferred` to `planned`; name simplified from "POST_MVP (deferred)" to "POST_MVP"
- **All planning complete**. Every task in the project has its files generated and is `ready_for_dev`. Wave 6 unblocks once Wave 5 dev cycle (or earlier upstream BE deps) completes — see frontmatter `depends_on` for each task
- Ready for `/nacl-tl-dev-be` on Wave 6 backends. UC-410-BE is independent (only depends on UC-401-BE which already shipped) — can start in isolation. UC-109/110/204/402-BE wait on their respective Wave 4–5 prerequisites

## [2026-05-11 06:36] DEV-BE: UC-103-BE — Создание сессии генерации (MOD-CONTENT)
- Phase: Backend Development
- Status: DEV-BE COMPLETE (PASS)
- Changes: 12 new files, 5 modified, ~870 LOC
- Tests: 39 new (3+10+10+4+12), full suite 604/604 passing (was 565/565); zero regressions
- Endpoints:
  - GET  /api/content/categories     — list active categories
  - POST /api/content/sessions       — create session (user_id from JWT.sub)
  - GET  /api/content/sessions       — list own sessions, paginated, status-filterable
  - GET  /api/content/sessions/:id   — read own session (404 cross-user)
- Migration: 0012_create_sessions (session_status enum + sessions table + 2 indexes + FKs to users/categories)
- Architecture invariants verified: single-tenant (no client_id), user_id sourced from JWT only, end_user-only via requireRole preHandler, standard error envelope, admin-JWT rejected with 403
- Phase transition: phase_be pending → in_progress → ready_for_review; graph + status.json dual-write confirmed

## [2026-05-11 06:38] REVIEW: UC-103-BE — Создание сессии генерации (BE)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: none.
- Stub Gate: PASSED (0 stub markers in 17 reviewed files)
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major, 2 minor (non-null assertion ergonomics; getActiveCategories ownership follow-up)
- Tests: 604/604 passing; 39 new added; coverage not measured (no threshold gate)
- Test author independence: MAJOR (same-author overlap 100% — structural; retroactive regression-test recommended)
- BE Checklist: 7 PASS / 1 N/A (git commits handled by conductor)

## [2026-05-11 07:40] DEV-BE: UC-104-BE — Создание задачи и запуск workflow (BE)
- Phase: Backend Development
- Status: DEV-BE COMPLETE (PASS)
- Changes: 7 files created, 6 files modified
- Tests: 725/725 passing (689 baseline + 36 new); 0 failing; runner `vitest run`
- Endpoints:
  - POST /api/content/sessions/:sessionId/tasks/upload-url  — presign PUT URL (TTL 900 s)
  - POST /api/content/sessions/:sessionId/tasks              — atomic create + enqueue + engine kick
- Migration: 0015_create_task_input_files (task_input_files table + FK CASCADE + index)
- Architecture invariants verified: single-tenant (no client_id), transactional COMMIT before engine start, session ownership in service layer (REQ-AUTH-002), 50 MB cap, presigned PUT TTL 900 s exact
- New error codes: SESSION_ACCESS_DENIED (403), WORKFLOW_RESOLUTION_FAILED (422), NO_PROMPT_TEMPLATE (422), INVALID_FILE_REF (422)
- Reconciliation: workflow_id derived from task_type via WORKFLOW_IDS catalog (1:1); DB task_status enum (`created`/`running`/`timeout`) mapped to public `TaskStatus` (`pending`/`processing`/`failed`) in toPublic()
- Phase transition: phases.be pending → in_progress → ready_for_review; status → ready_for_review

## [2026-05-12 09:38] STUBS: UC-107-FE — Отмена задачи
- Scanned: 4 production files + 2 test files | Found: 0 (0 critical, 0 warning, 0 info)
- Empty test files: 0 | Empty describe blocks: 0
- New: 0, Resolved: 0, Orphaned: 0 | Gate: STUBS COMPLETE
- phases.stubs: done

## [2026-05-12 10:21] DEV-FE: UC-401 — Просмотр ежемесячного отчёта по генерациям
- Phase: Frontend Development
- Status: DEV-FE COMPLETE
- Changes: 9 files created, 3 modified, +500/-0 lines
- Tests: 408 passed (Δ+25), coverage adequate
- Components: UsageReportPage, UsageReportTable, MonthPicker, FreshnessBadge
- Pages: /admin/reports/usage

## [2026-05-12 10:23] REVIEW: UC-401 — Просмотр ежемесячного отчёта по генерациям (FE)
- Status: Workflow `REVIEW APPLIED — UNVERIFIED (test author overlap 100%)`. Judgment `APPROVED`. Action required: `/nacl-tl-regression-test --retroactive UC-401`.
- Stub Gate: PASSED (0 stubs)
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major, 2 minor
- Tests: 408 passed
- Test author independence: MAJOR (100% overlap — single-agent conductor turn)
- Checklist PARTIAL rows: 0

## [2026-05-12 10:28] SYNC: UC-401 — Просмотр ежемесячного отчёта по генерациям
- Phase: Sync Verification
- Headline: SYNC APPLIED — UNVERIFIED
- Static checks: 1/1 endpoint, 3/3 types, 5/5 errors, 0 mocks — 0 blockers
- Runtime: BE suite PASS (969/969), FE suite PASS (408/408)
- Endpoint coverage: FE=9 references (MSW pattern → fe_coverage_gap=true)
- Endpoints verified: 1

## [2026-05-12 10:38] QA: UC-401 — Просмотр ежемесячного отчёта по генерациям
- Phase: E2E QA Testing
- Verdict: QA COMPLETE
- Criteria: 14 tested, 14 passed, 0 failed, 6 N/A
- Bugs: 0 found (0 critical, 0 major, 0 minor)
- Screenshots: 11 taken

## [2026-05-12 10:38] STUBS: UC-401 — Просмотр ежемесячного отчёта по генерациям
- Scanned: 9 files (production) + 3 test files | Found: 0 (0 critical, 0 warning, 0 info)
- Empty test files: 0 | Empty describe blocks: 0
- New: 0, Resolved: 0, Orphaned: 0 | Gate: PASS
- phases.stubs: done

## [2026-05-12 13:42] SYNC: UC-104 — Создание задачи и запуск workflow
- Phase: Sync Verification (post-lint-fix re-sync)
- Headline: SYNC APPLIED — UNVERIFIED
- Static checks: 8 passed, 0 warnings, 0 blockers
- Runtime: BE suite PASS (969/969), FE suite PASS (420/420)
- Endpoint coverage: 2/2 endpoints covered

## [2026-05-12 13:42] SYNC: UC-105 — Просмотр статуса и результатов задачи
- Phase: Sync Verification (post-lint-fix re-sync)
- Headline: SYNC APPLIED — UNVERIFIED
- Static checks: 10 passed, 0 warnings, 0 blockers
- Runtime: BE suite PASS (969/969), FE suite PASS (420/420)
- Endpoint coverage: 2/2 endpoints covered

## [2026-05-12 13:42] SYNC: UC-106 — Уведомление о завершении задачи
- Phase: Sync Verification (post-lint-fix re-sync)
- Headline: SYNC APPLIED — UNVERIFIED
- Static checks: 10 passed, 0 warnings, 0 blockers
- Runtime: BE suite PASS (969/969), FE suite PASS (420/420)
- Endpoint coverage: 4/4 endpoints covered

## [2026-05-12 13:42] SYNC: UC-107 — Отмена задачи
- Phase: Sync Verification (post-lint-fix re-sync)
- Headline: SYNC APPLIED — UNVERIFIED
- Static checks: 10 passed, 0 warnings, 0 blockers
- Runtime: BE suite PASS (969/969), FE suite PASS (420/420)
- Endpoint coverage: 1/1 endpoints covered

## [2026-05-12 13:42] SYNC: UC-108 — Скачивание результата
- Phase: Sync Verification (post-lint-fix re-sync)
- Headline: SYNC APPLIED — UNVERIFIED
- Static checks: 9 passed, 0 warnings, 0 blockers
- Runtime: BE suite PASS (969/969), FE suite PASS (420/420)
- Endpoint coverage: 1/1 endpoints covered

## [2026-05-12 13:42] SYNC: UC-401 — Просмотр ежемесячного отчёта по генерациям
- Phase: Sync Verification (post-lint-fix re-sync)
- Headline: SYNC APPLIED — UNVERIFIED
- Static checks: 10 passed, 0 warnings, 0 blockers
- Runtime: BE suite PASS (969/969), FE suite PASS (420/420)
- Endpoint coverage: 1/1 endpoints covered

## [2026-05-13] SA-FEATURE: FR-002 — Session context on task detail page
- Skill: /nacl-sa-feature
- Scope: UC-105 (modified) — MOD-CONTENT
- Graph: +Component comp-session_breadcrumb, +2 FormField (session_id/session_name) on form-105-task_view, +ActivityStep step-105-4, +Requirement REQ-UC105-session-context, ActivityStep step-105-1 description updated, :FeatureRequest FR-002 persisted with INCLUDES_UC/AFFECTS_MODULE/AFFECTS_ENTITY edges
- API contract delta: GET /tasks/:id response gains session: { id, name } (additive)
- Validation: scoped L4/L5 PASS (pre-existing field-105-assets MAPS_TO gap unchanged, out of scope)
- Artifact: .tl/feature-requests/FR-002-session-context-on-task-page.md
- Next: /nacl-tl-plan --feature FR-002

## [2026-05-18] SA-FEATURE: FR-003 — api.kie.example.invalid text-LLM models support
- Skill: /nacl-sa-feature
- Scope: UC-303, UC-202, UC-150 (all modified) — MOD-ADMIN, MOD-QUEUE, MOD-CONTENT
- Graph: +Enumeration enum-ModelKind (4 values), +Enumeration enum-ApiShape (3 values), +DomainEntity SA-ChatCompletionLog (16 attrs) in MOD-CONTENT with REFERENCES → SA-ModelProfile, +4 DomainAttribute on SA-ModelProfile (model_kind, api_shape, endpoint_path, capabilities) with OF_ENUM links, +4 FormField on form-303-models with MAPS_TO links, +3 Requirement (REQ-FR-022, REQ-FR-023, REQ-FR-024), updated EnumValue ev-PT-kie_ai label, updated ActivityStep descriptions on step-202-4 and step-150-4, updated UC-303 description, :FeatureRequest FR-003 persisted with INCLUDES_UC/AFFECTS_MODULE/AFFECTS_ENTITY edges
- API contract delta: admin /model-profiles POST/PUT/GET schemas gain model_kind/api_shape/endpoint_path (required) + capabilities (optional jsonb); dispatcher emits ChatCompletionLog rows for text_llm/vlm calls
- Validation: scoped L1 (attr completeness), L2 (enum connectivity), L4 (form-domain traceability), L5 (UC-form-requirements) — all PASS
- Artifact: .tl/feature-requests/FR-003-kie-ai-text-llm-models.md
- Next: /nacl-tl-plan --feature FR-003

## [2026-05-18] SA-FEATURE: FR-004 — ModelProfile model picker + provider model catalog
- Skill: /nacl-sa-feature
- Scope: UC-303 (modified), UC-306 (new) — MOD-ADMIN
- Graph: +DomainEntity SA-ProviderModelCatalogEntry (13 attrs), +DomainEnum SA-Enum-ModelCatalogSource (2 values), +DomainAttribute SA-ModelProfile.overrides_catalog, +UseCase UC-306 with 5 ActivitySteps + form-306-model-catalog (11 fields), +6 ActivitySteps on UC-303, +1 FormField field-303-overrides_catalog on form-303-models, field-303-model_name field_type→combobox_searchable, +3 Components (ModelPickerCombobox, CatalogAutofillBanner, ModelCatalogTable) + 1 navigation (AdminNavModelCatalog), +3 Requirements (REQ-FR-025, REQ-FR-026, REQ-FR-027), :FeatureRequest FR-004 persisted with INCLUDES_UC/AFFECTS_MODULE/AFFECTS_ENTITY edges
- API contract delta (proposed for TL): admin GET /model-profiles/catalog?provider=… returns ProviderModelCatalogEntry[]; admin POST /model-profiles/catalog/refresh?provider=… triggers provider list-models merge; UC-303 PUT/POST adds overrides_catalog: bool (server-computed)
- Validation: scoped L4 — 2 acceptable warnings (UI-only fields field-306-search, field-306-refresh_action); L5 PASS; new entity attribute completeness PASS
- Artifact: .tl/feature-requests/FR-004-model-picker-and-catalog.md
- Next: /nacl-tl-plan --feature FR-004

### [2026-05-22] nacl-tl-fix: asset_added SSE event not emitted by workflow engine
- **Level:** L1 (code-only)
- **Status:** PASS
- **Root cause:** engine.ts never called publishTaskEvent with type='asset_added' after a step committed an asset to DB. FE hook applyTaskEvent handled the event correctly; shared types defined it; BE simply never emitted it. Status updates (status_changed) arrived in real-time but assets appeared only on reconnect/polling.
- **Affected UC:** UC-150 (workflow engine), UC-105 (task detail SSE)
- **Docs updated:** none (L1, shared type was already correct)
- **Code changed:**
  - backend/src/modules/content/workflow-engine/engine.ts — added private emitAssetAdded() method + calls at 3 completion paths (normal, race-window, crash-recovery)
  - backend/tests/content/engine.lifecycle-sse.test.ts — added generated_asset_ids to bus event, added asset_added assertion; fixed missing afterAll cleanup for b1sse-image-profile
- **Tests:** existing test "emits task_completed" (engine.lifecycle-sse.test.ts) — RED→GREEN confirmed

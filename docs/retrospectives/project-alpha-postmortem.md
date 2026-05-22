# Project Alpha Post-Mortem: Where the nacl-* Skill Chain Failed

**Project:** `project-alpha` (Fastify 5 + Vite/React 19 monorepo, ~200 source files across `backend/`, `frontend/`, `packages/shared`).
**BA/SA storage:** Hybrid — Neo4j graph (`graph-infra/`) as source of truth, on-disk `docs/SA/` mostly frozen 2026-05-07.
**Declared done:** `99d63ba` "chore(.tl): close Wave 5 batch (6/6 UCs PASS, MVP feature-complete)" on 2026-05-12 10:46.
**Stabilization window:** 2026-05-11 17:35 → 2026-05-21 18:30 — **45 bug-fix commits across five sub-waves** (pre-MVP Wave-4 audit · pre-MVP cancel-race · Wave-5 stabilization · FR-001…FR-004 follow-ups · Wave-11 post-FR-005 cleanup).

This document maps each post-delivery bug-fix back to the skill that owned the gate, with verbatim quotes from `.tl/tasks/*` spec files. The user explicitly scoped this analysis to **bugs only** — feature-additions (`FR-001 … FR-007` under `.tl/feature-requests/`) are deferred to a separate pass that will decide which were genuine new asks vs. specification gaps.

---

## 1. TL;DR

| Bucket | Count | % | Owning skill(s) |
|---|---|---|---|
| Config / infra / CI (TEST_DATABASE_URL, pnpm version, MinIO, migration journal, tsconfig divergence, lint cleanup) | 13 | 29% | `nacl-sa-architect` (TECH tasks), `nacl-tl-dev`, `nacl-tl-review` |
| API-contract mismatch (BE/FE wire-format, external-provider shape, Zod envelope) | 8 | 18% | `nacl-sa-uc`, `nacl-tl-sync`, `nacl-sa-architect` |
| Domain logic / state-machine / race (worker FSM, cancel/restart, advisory lock) | 8 | 18% | `nacl-sa-uc`, `nacl-sa-architect` |
| UI / missing-element (sidebar nav, CTA, breadcrumb crash, filter group, dropdown bg) | 7 | 16% | `nacl-sa-ui`, `nacl-tl-review` |
| Test-infra (shared admin fixtures, UUID validity, schema-ns, isolated test DB) | 4 | 9% | `nacl-tl-dev-be`, `nacl-tl-review` |
| Stub/mock leak (WORKFLOW_STEPS fake IDs, placeholder image_gen profiles) | 2 | 4% | `nacl-tl-stubs`, `nacl-tl-plan` |
| Auth/RBAC (boot-refresh race, role-based redirect on `/`) | 2 | 4% | `nacl-sa-uc`, `nacl-tl-review` |
| Process/docs catch-up (SA L2 docs after wired events) | 1 | 2% | `nacl-tl-fix` (Rule 1 enforcement) |

Of 12 cases analyzed in depth: **2 SPEC WRONG, 7 SPEC MISSING, 1 SPEC WRONG + SPEC MISSING (compound, case 3.10), 1 SPEC INTERNALLY CONTRADICTORY, 1 SPEC RIGHT-DEV-DRIFTED, 1 SPEC RIGHT-REVIEW-DRIFTED.** Dev agents executed spec faithfully in 10 of 12 — gaps were upstream (spec wrong, spec silent, or review PASS while spec wasn't implemented).

Three load-bearing patterns surface across the buckets:

1. **Provider-adapter contracts have no spec layer.** kie.ai deprecated sync `/generate` mid-build (rewritten in `1a55c11`), nano-banana model namespace mismatch (`9bcf4fd`), provider `base_url` doubled by seed + adapter (`6095a3d`, `9a24613`). Four of eight API-contract bugs trace to one missing artifact: external-API protocol pinning.
2. **`DIAGNOSTIC-REPORT.md` itself reads as a process-gap admission.** Dated 2026-05-18, score 66/100, fix-to-feature ratio 1.28, "39% of fixes never updated docs" — i.e., the spec snapshot used by *this* post-mortem is unreliable, and every undocumented fix makes the *next* post-mortem harder.
3. **The skill chain produced two declared-done waves that weren't done.** Wave 4 was closed at 17:07 on 2026-05-11; the audit at 17:35 the same evening reproduced "lint red, typecheck red, `publishTaskEvent` defined but never called" — seven-commit remediation followed. Wave 5 closed at 10:46 on 2026-05-12; the first stabilization fix landed 23 minutes later. The skill that PASS-flagged both owns the highest-leverage gap (§ 4 `nacl-tl-review`).

`nacl-tl-qa` SKIPs and CI bootstrap failures dominate the Config/infra bucket — the CI runner was never exercised on a clean checkout before Wave 10 (2026-05-18), so 6 of 13 infra fixes are "CI-only" errors caught the first time the pipeline actually ran.

---

## 2. Fix-by-fix mapping

Chronological. "Why it slipped" first guess; promoted cases get full evidence in § 3.

| SHA | Commit subject (verbatim) | Bucket | Owning skill | Why it slipped |
|---|---|---|---|---|
| `07c11fe` | fix(build): wave-4 lint + typecheck hygiene | Config/infra | `nacl-tl-review` | Wave 4 PASS-flagged with lint+typecheck red on `main` |
| `a7eb747` | docs(SA): UC-105/UC-106/UC-107 post-commit emit timing (L2) | Process/docs | `nacl-tl-fix` | Rule 1 (Spec First) violated by FIX-B; docs caught up after code |
| `01f2fcb` | fix(UC-105/UC-106/UC-107): wire post-commit task events + notifications (L2) | Domain logic | `nacl-sa-uc` + `nacl-tl-review` | `publishTaskEvent`/`publishNotification`/`pushSseEvent` defined but never called; Wave 4 PASS missed it |
| `14f3000` | fix(build): clear pre-existing lint errors not enumerated by audit | Config/infra | `nacl-tl-review` | Lint state on `main` never reconciled before Wave 4 close |
| `c83e84f` | fix(tests): valid UUID fixtures + maxEvents headroom for FIX-B integration tests | Test-infra | `nacl-tl-dev-be` | Test fixtures used invalid UUIDs; SSE harness needed headroom |
| `92da5c7` | fix(tests): correct schema namespace in task.cancel.sse.test.ts (FIX-B audit) | Test-infra | `nacl-tl-dev-be` | Drizzle schema namespace import drifted; not caught by `tsc` |
| `135b14b` | fix(UC-107/UC-150/UC-202): gate post-commit emits on finalSlotStatus (FIX-B audit P1) | Domain logic | `nacl-sa-uc` | Event-emit gate not specified for cancel/fail race |
| `6ed12ac` | fix(UC-107/UC-150/UC-202): cancel/fail race correctness (L2, FIX-B audit P2) | Domain logic | `nacl-sa-uc` | Cancel-while-failing terminal-state ordering unspecified |
| `3acb2fd` | fix(UC-107/UC-202): lock tasks row FOR UPDATE in worker commit TX (P1 cancel race) | Domain logic | `nacl-sa-uc` | Worker commit TX missed row-level lock; race window not enumerated |
| `2cdb42e` | fix(UC-104-FE): require all uploads complete before submit (L1) | Domain logic | `nacl-sa-uc` (FE form lifecycle) | Form spec said "submit"; didn't pin pending-upload guard |
| `a94601d` | fix(UC-106-FE): render tray from Zustand store (L1) | UI/missing | `nacl-sa-ui` | Tray spec rendered `query.data?.items` only; SSE-prepended Zustand items invisible |
| `818dec1` | fix(UC-401-FE): clear stale report on month change (L1) | UI/missing | `nacl-sa-ui` | placeholderData cache persisted prior month; spec silent on invalidation |
| `53d2edc` | fix(lint): remove unused imports and vars in test files | Config/infra | `nacl-tl-review` | Pre-existing lint never gated review PASS |
| `311635f` | fix(routing): add role-based redirect on index route | Auth/RBAC | `nacl-sa-uc` (UC-101/102) | `/` had no auth-aware redirect; spec covered login page, not index |
| `43fc84d` | fix(admin): layout sidebar nav + empty modelProfiles guard | UI/missing | `nacl-sa-ui` + `nacl-tl-review` | Admin sidebar never written down in any form spec → § 3.11 |
| `8522d1d` | fix(admin): unstub WORKFLOW_STEPS + categories envelope + WSC dropdown paging | Stub/mock leak | `nacl-tl-stubs` | Stub satisfied "no TODO" but held fake IDs; not data-shape validated |
| `e72204d` | fix(sessions): add Создать задачу CTA to session detail page | UI/missing | `nacl-sa-ui` | UC-103 spec had no nav-action to UC-104 → § 3.11 |
| `41ca8e8` | fix(env): run db:bootstrap — seed categories | Config/infra | `nacl-sa-architect` (TECH-005 seed) | Bootstrap seed not auto-run in CI; categories empty post-reset |
| `21c1290` | fix(tests): isolate backend tests onto project-alpha_test DB | Test-infra | `nacl-sa-architect` (TECH-002) | CI test DB isolation never specified; tests could write to dev DB |
| `65e2a85` | fix(sessions): show task list + back navigation on session detail (UNVERIFIED) | UI/missing | `nacl-sa-uc` (UC-103) + `nacl-sa-ui` | UC-103 endpoint table missing `GET /sessions/:id/tasks` → § 3.6 |
| `67663ed` | fix(UC-103): session-independent upload-url + InlineTaskBlock setState fix | API-contract | `nacl-sa-feature` (FR-001) | FR-001 needed presession upload route not in UC-104 spec → § 3.3 |
| `1f8efa7` | fix(ci): move minio to docker-run step to pass server /data command | Config/infra | `nacl-sa-architect` (TECH-006 S3) | `services: minio` doesn't accept inline command; not in TECH lore |
| `f0dd78c` | fix(ci): remove hardcoded pnpm version — reads from packageManager | Config/infra | `nacl-sa-architect` (TECH-001 CI) | CI hardcoded `pnpm@9` while package.json said `pnpm@9.15.0` |
| `17f71a3` | fix(UC-303-FE): read details.issues[].path in ModelProfileForm VALIDATION_FAILED | API-contract | `nacl-sa-uc` / `nacl-tl-sync` | UC-303 contract didn't specify `details` shape; UC-305 assumed flat → § 3.2 |
| `d4cc03a` | fix(test): extract shared admin test setup to eliminate shared-mock fragility | Test-infra | `nacl-tl-review` | 6 admin form-test files duplicated setup inline; review missed it |
| `2ffd29d` | fix(test): resolve TS2537 in admin-setup.tsx — Route type not indexable by number | Config/infra | `nacl-tl-verify-code` | TanStack Router type alias indexed wrong; CI-only |
| `19bbca6` | fix(seed): add kie.ai text_llm profile + upsert routing fields | Stub/mock leak | `nacl-tl-plan` | migration 0019 backfilled placeholders; seed used `ON CONFLICT DO NOTHING` |
| `2ea1eeb` | fix(typecheck): fix CI-only TS errors in test fixtures and seed type | Config/infra | `nacl-sa-architect` (tsconfig) | `tsconfig.typecheck.json` includes tests, `tsconfig.json` doesn't |
| `2580bd6` | fix(lint): resolve 7 CI-only ESLint errors in frontend | Config/infra | `nacl-tl-review` | Local ESLint config looser than CI; lint state never reconciled |
| `5134604` | fix(lint): resolve pre-existing backend ESLint errors uncovered by CI | Config/infra | `nacl-tl-review` | Same pattern — first CI run exposed accumulated drift |
| `49eee5d` | fix(ci): set TEST_DATABASE_URL in CI env + accept project-alpha_ci in guard | Config/infra | `nacl-sa-architect` (CI bootstrap) | `vitest.setup.ts` required env var CI never set |
| `0bb40f2` | fix(ci): update db-isolation test to accept project-alpha_ci database name | Config/infra | `nacl-sa-architect` (CI bootstrap) | Guard regex too strict; CI db name differs from local |
| `6095a3d` | fix(UC-306): correct provider base_url in seed — remove doubled version paths | API-contract | `nacl-sa-architect` (TECH-014 seed) | Seed base_url already had `/v1`; adapters appended again → § 3.10 |
| `9a24613` | fix(UC-306): rewrite kie.ai & apiframe adapters as static catalogs + fix base_url doubled paths | API-contract | `nacl-sa-architect` (TECH-015 adapters) | Discovery mechanism (HTTP vs static) never specified → § 3.10 |
| `546fb53` | fix(UC-305-BE): wrap createWorkflowStepConfig in tx + advisory lock | Domain logic | `nacl-sa-uc` (UC-305) | Concurrent WSC creates raced on `step_order`; lock not specified |
| `e8d9280` | fix(UC-302-FE): group Все шаги filter by workflow with numbering | UI/missing | `nacl-sa-ui` | FR-005 patched form combobox, missed list-page filter |
| `eb1a34a` | fix: opaque background on WorkflowStepCombobox dropdown | UI/missing | `nacl-sa-ui` | Tailwind v4 `bg-popover` token needed CSS var; theme spec silent |
| `4820d59` | fix(UC-105-FE): coerce task.session when partial cache seeded by UC-104 | API-contract | `nacl-sa-uc` / `nacl-tl-sync` | UC-105 type has `session_id` only; FE breadcrumb read `task.session.name` → § 3.7 |
| `1a55c11` | fix(UC-202-BE): replace kie.ai /generate with async task API | API-contract | `nacl-sa-architect` (UC-202) | kie.ai deprecated sync endpoint; no spec pinned protocol → § 3.8 |
| `9bcf4fd` | fix: correct kie.ai nano-banana model names (remove google/ prefix) | API-contract | `nacl-sa-architect` | Catalog seeded with `google/` namespace; kie.ai rejects it |
| `9b72bbc` | fix: register migration 0022 in drizzle journal | Config/infra | `nacl-sa-architect` (TECH-003 migrations) | Drizzle journal entry missed; migrator silently skipped 0022 |
| `67a6a44` | fix(UC-112): clear stale queue_items before restart + TASK_NOT_RESTARTABLE → 409 | Domain logic | `nacl-sa-uc` (UC-112) | Restart re-enqueue hit `ON CONFLICT DO NOTHING` → silent no-op → § 3.5 |
| `ddeae5b` | fix(UC-104+UC-112+UC-202): L2 — fix PROVIDER_501 in retouch.generate (iter 3) | API-contract | `nacl-tl-plan` | First-step payload omitted routing metadata → § 3.1 |
| `ee37928` | fix(UC-202+UC-151): FR-007 — verifier VLM slot routes to getAdapter instead of legacy openrouterAdapter | Domain logic | `nacl-sa-uc` (UC-151) | `isLlmSlot = !isVerifier && (vlm\|text_llm)` excluded verifier silently → § 3.9 |
| `749440e` | fix(UC-102): boot-refresh race — move to beforeLoad so route guards see populated auth store on reload | Auth/RBAC | `nacl-tl-review` | Spec said "after resolves, hand to router"; impl used `useEffect` → § 3.4 |

---

## 3. Twelve specification failures — verbatim evidence

### 3.1 UC-104 first-step payload omits routing metadata — *SPEC MISSING*

- **Symptom:** UC-104 createTask enqueues the first workflow step. UC-202 dispatcher cannot select the right provider adapter without routing fields; verifier/VLM/text_llm slots silently fall back to legacy `openrouterAdapter`, which returns HTML instead of JSON → `PROVIDER_501`. Three iterations of fixes (`#3` is `ddeae5b`).
- **Fix:** `ddeae5b` "fix(UC-104+UC-112+UC-202): L2 — fix PROVIDER_501 in retouch.generate (iter 3)" — introduces `buildStepPayload` helper and `step-payload.ts` with routing metadata.
- **Spec:** `project-alpha/.tl/tasks/UC-104/task-be.md:183-184`:
  > "4. Call `enqueue(tx, { task_id, step_id, provider, payload: { task_id, workflow_id, input_params, input_files: [s3_keys] } })`."
- **Reality:** payload must include `model_profile_id`, `model_kind` (`text_llm`|`vlm`|`image_gen`|`video_gen`), `api_shape` (adapter discriminator), `endpoint_path` (override). Without them, UC-202 has to re-query `model_profiles` at dispatch time, which the FSM doesn't do.
- **Class:** SPEC MISSING. Spec specified what to send, omitted the load-bearing fields that UC-202 needs.
- **Owning skill:** `nacl-tl-plan`. The plan should have traced UC-104 enqueue → UC-202 dispatch → adapter selection and annotated the payload accordingly. The graph has the dependency edge but no payload-shape constraint on it.
- **Why missed:** payload shape was left implicit (assumed identical to UC-150's intermediate-step payload, which itself was finalized later). `nacl-tl-sync` PASS'd because both sides imported the same `EnqueueInput` type — `payload: Record<string, unknown>` is opaque.

### 3.2 VALIDATION_FAILED `details` shape — *SPEC INTERNALLY CONTRADICTORY*

- **Symptom:** Admin forms (UC-302, UC-303, UC-305) all return HTTP 400 `VALIDATION_FAILED` from Zod. UC-305 forms map errors via `Object.entries(err.details).forEach([field, msgs] => …)`. UC-303 (ModelProfileForm) receives Zod's native `{ issues: [{ path, message }] }` envelope → `Object.entries` walks `issues` and `path` is an array, not a string → form errors silently never appear.
- **Fix:** `17f71a3` "fix(UC-303-FE): read details.issues[].path in ModelProfileForm VALIDATION_FAILED".
- **Spec A:** `project-alpha/.tl/tasks/UC-305/impl-brief-fe.md:227-232`:
  > ```tsx
  > function handleApiError(err: ApiError, form: UseFormReturn<any>) {
  >   if (err.code === 'VALIDATION_FAILED' && err.details) {
  >     Object.entries(err.details).forEach(([field, messages]) =>
  >       form.setError(field as any, { message: (messages as string[])[0] }));
  >     return;
  >   }
  > ```
- **Spec B:** `project-alpha/.tl/tasks/UC-303/api-contract.md:113-117`:
  > "| 400  | `VALIDATION_FAILED`             | Zod (provider not in enum, missing fields, etc.)        |"

  No `details` shape defined; the table column is "when", not "shape".
- **Class:** SPEC INTERNALLY CONTRADICTORY. UC-305 codifies one assumption (flat `{field: msgs[]}`); UC-303 leaves it unspecified and ships the raw Zod envelope. Both are MOD-ADMIN forms sharing a `handleApiError` helper.
- **Owning skill:** `nacl-sa-uc` (cross-document consistency within MOD-ADMIN), backstopped by `nacl-tl-sync` (envelope-shape validation across UCs sharing an error code).
- **Why missed:** the standard error envelope in `master-plan.md` §1.4 names the codes but not the `details` payload. Each form was specified independently. `nacl-tl-sync` checks TS-type alignment; `ApiError.details: unknown` carried no constraint.

### 3.3 FR-001 needs presession upload-url — *SPEC MISSING*

- **Symptom:** FR-001 ("Inline first task + auto session name") lets a user fill out a session form *and* upload files before pressing Create. UC-104 only specifies session-scoped presigning; calling it before the session exists 404s.
- **Fix:** `67663ed` "fix(UC-103): session-independent upload-url + InlineTaskBlock setState fix" — adds `POST /api/content/tasks/upload-url` (no `sessionId`) and a `pending/` S3 prefix.
- **Spec:** `project-alpha/.tl/tasks/UC-104/task-be.md:199`:
  > "| POST   | `/api/content/sessions/:sessionId/tasks/upload-url`        | end_user | `GetUploadUrlRequest`   | 200 `GetUploadUrlResponse` |"

  No presession endpoint elsewhere in UC-103 / UC-104 endpoint tables (cross-referenced `UC-103/task-be.md:148-153`, which lists session CRUD only).
- **Class:** SPEC MISSING. UC-103-FR001 introduced presession uploads but the upstream UC-104 spec was never amended.
- **Owning skill:** `nacl-sa-feature` (FR-001 impact analysis), backstopped by `nacl-tl-plan` (cross-UC dependency tracing).
- **Why missed:** FR-001 was specified as an incremental feature; its impact on UC-104 was discovered during FE implementation. No `IMPACTS` edge was created from FR-001 → UC-104.

### 3.4 UC-102 boot-refresh fires after route guards — *SPEC RIGHT, DEV DRIFTED*

- **Symptom:** On reload, every authenticated route briefly bounces to `/login` because the `useRefreshMutation` is fired from a `useEffect` that runs *after* TanStack Router's `beforeLoad` guards have already inspected the (empty) auth store.
- **Fix:** `749440e` "fix(UC-102): boot-refresh race — move to beforeLoad so route guards see populated auth store on reload".
- **Spec:** `project-alpha/.tl/tasks/UC-102/impl-brief-fe.md:114-119`:
  > "## 5. Boot refresh
  >
  > `frontend/src/main.tsx` (or root route loader): call `useRefreshMutation` once on app mount. While the call is in flight, show a splash/loader. After it resolves (success or failure), hand control to the router."
- **Class:** SPEC RIGHT, DEV DRIFTED. The spec correctly demanded "hand control to the router *after* it resolves" — `useEffect` semantically does the opposite. The developer mapped "on app mount" → `useEffect` (standard React pattern) without checking the ordering constraint relative to TanStack Router's lifecycle.
- **Owning skill:** `nacl-tl-review`. The diff would have looked semantically reasonable to a reviewer not familiar with TanStack Router's load lifecycle — but the spec's "after it resolves, hand control" is a testable invariant (refresh→render→guard ordering) and the review should have demanded a corresponding test.
- **Why missed:** no integration test exists in `test-spec-fe.md` for the reload→guard sequence. The skill-chain ceiling: this is one of only two `SPEC RIGHT, DEV DRIFTED` cases out of 12 — the dev agents otherwise executed spec faithfully.

### 3.5 UC-112 restart silent no-op — *SPEC MISSING*

- **Symptom:** Pressing "Restart" on a failed task returns 200 but the task stays in `failed`. UC-112 calls `enqueueFirstStep`, which uses `enqueue()` with `ON CONFLICT DO NOTHING`. A previous `failed` `queue_item` exists for `(task_id, step_id)` so the insert is suppressed. Worker never picks it up.
- **Fix:** `67a6a44` "fix(UC-112): clear stale queue_items before restart + TASK_NOT_RESTARTABLE → 409".
- **Spec:** `project-alpha/.tl/tasks/UC-201/internal-contract.md:36-39`:
  > "Idempotency is enforced by a UNIQUE INDEX on `(task_id, step_id)` — re-enqueueing the same `(task_id, step_id)` returns the existing row's id and status without inserting (the SA acceptance criterion #3: \"Если QueueItem уже существует для (task_id, step_id) — return existing\")."
- **Reality:** UC-112 must `DELETE FROM queue_items WHERE task_id = $id` (or transition the failed slot back to `queued`) before calling `enqueueFirstStep`, and the route must return 409 `TASK_NOT_RESTARTABLE` if the task isn't in a terminal-failure state.
- **Class:** SPEC MISSING. UC-201's idempotency rule covers the normal re-enqueue path but is silent on the restart-after-failure edge. UC-112 was scheduled as POST_MVP and added late, after UC-201's invariants were already set in stone.
- **Owning skill:** `nacl-sa-uc` (UC-201/UC-112 spec interaction) and `nacl-tl-plan` (should have flagged that UC-112 contradicts UC-201 acceptance criterion #3).
- **Why missed:** the `enqueue` contract is "return existing on conflict", which is the *correct* behavior for steady-state idempotency. The restart use-case demands the opposite (purge then re-enqueue) — but no spec annotates the FSM transition that selects between them.

### 3.6 Session detail has no task list endpoint — *SPEC MISSING*

- **Symptom:** Opening a session shows the session header but no way to view existing tasks or get to UC-104. FE either crashes or shows an empty pane.
- **Fix:** `65e2a85` "fix(sessions): show task list + back navigation on session detail (UNVERIFIED)" — adds `listSessionTasks` service + `GET /api/content/sessions/:sessionId/tasks`.
- **Spec:** `project-alpha/.tl/tasks/UC-103/task-be.md:148-153`:
  > "| Method | Path                            | Role     | Body / Query              | Response                    |
  > |--------|---------------------------------|----------|---------------------------|-----------------------------|
  > | GET    | `/api/content/categories`       | end_user | —                         | `200 { items: CategoryPublic[] }` |
  > | POST   | `/api/content/sessions`         | end_user | `CreateSessionRequest`    | `201 SessionPublic`          |
  > | GET    | `/api/content/sessions`         | end_user | `ListSessionsQuery`       | `200 ListSessionsResponse`   |
  > | GET    | `/api/content/sessions/:id`     | end_user | (path param)              | `200 SessionPublic`          |"

  No `/api/content/sessions/:id/tasks`. UC-104 lists task-create endpoints, UC-105 lists task-detail endpoints; no UC owns "list tasks in a session".
- **Class:** SPEC MISSING. The data shape (`SessionPublic`) has no `tasks` field; the endpoint list has no `tasks` query.
- **Owning skill:** `nacl-tl-plan` (cross-UC dependency synthesis) and `nacl-sa-ui` (page-spec for SessionDetail should have demanded the data it needs).
- **Why missed:** per-UC specs were complete in isolation. The SessionDetail page is FE-only territory (UC-103-FE) and the BE side never received a "this UC requires a list endpoint" handoff.

### 3.7 UC-104 cache seed crashes UC-105 breadcrumb — *SPEC WRONG*

- **Symptom:** Creating a task and immediately navigating to its detail page crashes with `Cannot read properties of undefined (reading 'name')` on `task.session.name`. UC-104 optimistic-seeds `['tasks', id]` with a `TaskPublic` (which has `session_id` only); UC-105-FE `SessionBreadcrumb` reads `task.session.name` (nested object).
- **Fix:** `4820d59` "fix(UC-105-FE): coerce task.session when partial cache seeded by UC-104".
- **Spec:** `project-alpha/.tl/tasks/UC-105/api-contract.md:75-99`:
  > ```ts
  > export interface TaskDetailPublic {
  >   id: string;
  >   user_id: string;
  >   session_id: string;
  >   workflow_id: string;
  >   …
  >   assets: GeneratedAssetPublic[];
  >   latest_verdict: VerdictType | null;
  >   latest_verification: { … } | null;
  > }
  > ```

  No `session: SessionPublic` field — only the foreign-key `session_id`.
- **Reality:** the FE UI uses a `SessionBreadcrumb` that needs `session.name`. Either the type should have nested `session`, or the FE should fetch the session separately via `useSessionQuery`.
- **Class:** SPEC WRONG (FE design contradicted BE contract). The api-contract correctly mirrors the BE response; the FE design implicitly required a different shape and the two were never reconciled.
- **Owning skill:** `nacl-sa-ui` (page-spec for TaskDetail should have demanded a populated `session` object or specified a separate fetch) and `nacl-tl-sync` (cache-shape consistency).
- **Why missed:** FR-002 introduced the breadcrumb after UC-105 was already shipped; UC-105 api-contract was not amended to match the new FE need. `nacl-tl-sync` PASS'd because TS types still agreed — the cache crash is a runtime field access, not a type mismatch.

### 3.8 kie.ai deprecated sync `/generate` mid-build — *SPEC MISSING + EXTERNAL CHANGE*

- **Symptom:** Image-generation jobs return HTTP 404 from kie.ai. The provider deprecated the sync `POST /generate` endpoint and replaced it with an async pattern: `POST /api/v1/jobs/createTask` + polling `GET /api/v1/jobs/recordInfo`.
- **Fix:** `1a55c11` "fix(UC-202-BE): replace kie.ai /generate with async task API" — adapter rewritten as create-task + polling state machine.
- **Spec:** `project-alpha/.tl/tasks/UC-202/task-be.md:25-32`:
  > "This task delivers:
  > - The polling loop and slot-claim SQL.
  > - A heartbeat ticker per claimed slot.
  > - A pluggable provider call adapter (one adapter file per provider — but the underlying contract is uniform: `(payload, apiKey, timeoutMs) → ProviderResult`).
  > - The transactional result-write helper.
  > - Post-commit SSE emission via TECH-007's `pushEvent`."

  No mention of kie.ai endpoint URLs, request/response shapes, sync-vs-async semantics, or version-migration strategy.
- **Class:** SPEC MISSING + EXTERNAL CHANGE. The spec named the abstraction (`ProviderResult`) and the *uniform internal* contract, but left the *external* contract unbounded. The kie.ai deprecation is the kind of risk such a spec would have flagged (with a version pin and a "if provider migrates, do X" branch).
- **Owning skill:** `nacl-sa-architect` (TECH-011/TECH-015 provider adapters) and `nacl-tl-qa` (no real kie.ai call in QA means deprecation went unnoticed until prod).
- **Why missed:** the abstraction layer was specified; the contract layer was implicit in adapter code. The graph has no node for "external API protocol" — it's prose-only inside TECH task markdown.

### 3.9 Verifier VLM slots routed to legacy adapter — *SPEC MISSING*

- **Symptom:** Verifier-loop steps (UC-151) using VLM slots return HTML instead of JSON, which then fails verdict parsing → `VERDICT_PARSE_ERROR`. Root: UC-202-BE-FR003 (the kie.ai text_llm adapter addition) introduced a routing guard `isLlmSlot = !isVerifier && (vlm | text_llm)`; the `!isVerifier` part silently excludes verifier slots from `getAdapter` and routes them back to the legacy `openrouterAdapter`, which expects a `messages` array and receives a raw queue payload instead.
- **Fix:** `ee37928` "fix(UC-202+UC-151): FR-007 — verifier VLM slot routes to getAdapter instead of legacy openrouterAdapter".
- **Spec:** `project-alpha/.tl/tasks/UC-202/task-be.md:28-30`:
  > "- A pluggable provider call adapter (one adapter file per provider — but the underlying contract is uniform: `(payload, apiKey, timeoutMs) → ProviderResult`)."

  No decision table for "which adapter applies to which slot type". UC-151's verifier-loop spec lives in the graph; on-disk markdown is silent on whether verifier steps are subject to the same adapter-selection algorithm as regular steps.
- **Class:** SPEC MISSING. The routing guard was authored without a spec to validate it against — `!isVerifier` was a silent assumption that nobody else read.
- **Owning skill:** `nacl-sa-uc` (UC-151 verifier-loop spec) + `nacl-tl-plan` (should have synthesized UC-151's adapter requirements with UC-202-BE-FR003's adapter-selection table).
- **Why missed:** UC-151 was Wave 3; UC-202-BE-FR003 was Wave 9 (FR-003); the two specs were never reconciled. A decision table per `(slot_type, is_verifier)` would have made the guard explicit.

### 3.10 Provider `base_url` doubled + discovery mechanism unspecified — *SPEC WRONG + SPEC MISSING*

- **Symptom:** Admin UC-306 (provider catalog) returns HTTP 503; kie.ai and apiframe model lists never load. Two compounding bugs: (a) seed populated `base_url` as `https://kie-ai.redpandaai.co/api/v1`, adapters then appended `/api/v1/models` → `…/api/v1/api/v1/models` → 404; (b) the adapters tried HTTP discovery against endpoints that don't exist on these providers.
- **Fix A:** `6095a3d` "fix(UC-306): correct provider base_url in seed — remove doubled version paths".
- **Fix B:** `9a24613` "fix(UC-306): rewrite kie.ai & apiframe adapters as static catalogs + fix base_url doubled paths".
- **Spec:** `project-alpha/.tl/tasks/UC-202/task-be.md:28-30` (same uniform-adapter quote as 3.8). No file under `.tl/tasks/TECH-014/` or `.tl/tasks/TECH-015/` specifies the `base_url` format (host-only vs full version path) or the discovery mechanism (HTTP list vs static catalog).
- **Reality:** seed `base_url` must be host-only (no `/v1`), adapters append the version path. For providers that don't expose a `/models` endpoint, the adapter must be a static catalog (hardcoded model list, no HTTP).
- **Class:** SPEC WRONG (seed format incorrect) + SPEC MISSING (discovery mechanism not chosen, left to each adapter).
- **Owning skill:** `nacl-sa-architect` (TECH-014 seed + TECH-015 adapters).
- **Why missed:** the SA spec described the abstraction (`ListModelsAdapter`) without binding each provider to a discovery strategy. Seed and adapter code were authored independently; no contract test forced them to agree on URL construction.

### 3.11 Admin sidebar is absent — *SPEC MISSING*

- **Symptom:** Admin users can log in but see no navigation. Admin routes exist (`/admin/users`, `/admin/categories`, `/admin/workflow-steps`, `/admin/model-profiles`, `/admin/providers`) but are unreachable from any page — only by typed URL. Same pattern: SessionDetail had no "Create task" CTA so users couldn't reach UC-104 from UC-103.
- **Fix A:** `43fc84d` "fix(admin): layout sidebar nav + empty modelProfiles guard".
- **Fix B:** `e72204d` "fix(sessions): add Создать задачу CTA to session detail page".
- **Spec:** form-spec tables in UC-301 / UC-302 / UC-303 / UC-305 list fields like `name`, `provider`, `model_name`, etc., and acceptance criteria describe per-page behavior, but no spec file declares the AdminLayout sidebar or its menu entries. Same for `UC-103/task-fe.md` — the SessionDetail spec lists fields but no outgoing nav-action to UC-104.
- **Class:** SPEC MISSING (UI navigation is negative space). The reviewer cannot see "missing nav" in a diff because there's nothing to compare against.
- **Owning skill:** `nacl-sa-ui` (page/form spec should enumerate outgoing nav-actions); `nacl-tl-review` (should flag a UC marked "user-triggered" with zero inbound links).
- **Why missed:** form-fields tables are authoritative for *contents* of a page but mute on *connections* between pages. The graph models UCs and their entry-points but the on-disk form spec doesn't render that edge as a DOM affordance.

### 3.12 Wave 4 declared 6/6 PASS with lint+typecheck red — *SPEC RIGHT, REVIEW DRIFTED*

- **Symptom:** Wave 4 was closed at 2026-05-11 17:07 via `d2d90eb` "chore(.tl): close wave-4 conductor batch — 6/6 PASS". The external audit at 17:35 the same evening reproduced: `pnpm -r lint` fails, `pnpm -r typecheck` fails (3 errors), `publishTaskEvent`/`publishNotification`/`pushSseEvent` defined in `task.events.ts` and `notification.events.ts` but never called from `worker.ts` / `engine.ts`. Seven-commit remediation followed (`07c11fe`, `a7eb747`, `01f2fcb`, `14f3000`, `c83e84f`, `92da5c7`, `135b14b`, `6ed12ac`).
- **Fix-plan:** `project-alpha/.tl/fix-plan-wave-4-audit-2026-05-11.md:7-19`:
  > "| # | Claim | Verified? | Evidence |
  > |---|---|---|---|
  > | 1 | `publishTaskEvent` not wired into worker/engine | YES | `grep -rn` in `backend/src` returns only the definition in `task.events.ts:33` and its unit test. `worker.ts`, `engine.ts`, `event-listener.ts` have zero references. |
  > | 2 | `publishNotification` / `pushSseEvent` not wired after terminal commits | YES | Same — only the publisher modules and their unit tests reference these symbols. No call from `queue/worker.ts` or `workflow-engine/`. |
  > | 3 | `pnpm -r typecheck` fails (3 errors) | YES | Reproduced: `usage-report.routes.ts:35`, `usage-report.service.ts:146`, `usage-report.authz.test.ts:50`. …
  > | 4 | `pnpm -r lint` fails on `packages/shared/src/asset.ts:12` | YES | Inline `import('./task-105.js').FileType` annotation; rule `@typescript-eslint/consistent-type-imports` forbids it. …
  > | 5 | `conductor-state.json` overstates \"typecheck clean\" | YES | File literally states `\"typecheck\": \"clean across packages/shared, frontend, backend\"`. |
  > | 6 | `status.json` Wave 4 still `\"status\": \"planned\"` while task entries are `\"done\"` | YES | `.tl/status.json` line ~51. |
  > | 7 | Backend route/integration tests not re-verified (Postgres unavailable) | YES | DB-backed tests need Docker; auditor's environment had it down. Must be re-run after the fixes. |
  >
  > **Conclusion:** Audit is accurate end-to-end."
- **Class:** SPEC RIGHT, REVIEW DRIFTED. UC-105/106/107 specs correctly demanded post-commit emissions; `task.events.ts` correctly defines the publishers; the gap is between "code-against-spec review" and "spec-end-to-end review". The skill chain PASS-flagged a wave that hadn't actually wired the spec.
- **Owning skill:** `nacl-tl-review`. The fact that `conductor-state.json` literally claimed `"typecheck": "clean across packages/shared, frontend, backend"` while CI reports the opposite is the single most actionable item in this post-mortem.
- **Why missed:** `nacl-tl-review` PASS doesn't require `pnpm -r lint && pnpm -r typecheck` to be green. It is implicitly trusted to be — and on a fast-moving wave, it isn't. The same skill PASS-flagged Wave 5 minutes before the first Wave-5 stabilization fix landed.

---

## 4. Skill-by-skill diagnosis

### `nacl-sa-uc` — cases 3.1 partial, 3.2, 3.5, 3.6 partial, 3.7 partial, 3.9, 3.11 partial

- **Gap A: error-envelope inconsistency.** `VALIDATION_FAILED` is declared without a `details` shape; each form invents one (3.2). No automated check that error codes shared across UCs carry the same envelope.
- **Gap B: state-machine edges (restart, cancel-while-failing) not enumerated.** UC-201's idempotency invariant covers re-enqueue but not restart (3.5); cancel/fail race specified only as "after commit" without finalSlotStatus gating (`135b14b`, `6ed12ac`).
- **Gap C: cross-UC connectivity invisible.** UC-103 doesn't enumerate "I need to list tasks" (3.6); UC-151 (verifier) and UC-202-BE-FR003 (adapter selection) drift apart (3.9).
- **Gap D: cache-seeding consistency unspecified.** When a mutation populates a cache key, no spec asserts which fields downstream reads can rely on (3.7).
- **Recommendation:** add an `external-contracts.md` slot per UC for error-envelope shapes; add a `nav-actions` section to form specs enumerating outgoing links; add a `cache-seeding.md` per UC that touches shared cache keys.

### `nacl-sa-architect` (TECH tasks) — cases 3.8, 3.10, plus 8 of 13 config/infra fixes

- **Gap A: external-protocol lore.** Provider URLs, request/response shapes, version-migration paths are prose inside adapter code, never in `.tl/`. kie.ai sync→async migration (3.8), provider `base_url` semantics (3.10), nano-banana namespace (9bcf4fd) all trace to one missing artifact.
- **Gap B: CI-environment consistency.** Six of thirteen config/infra fixes are "first time CI ran on a clean runner". `TEST_DATABASE_URL` unset, `pnpm` version hardcoded, MinIO command argument missing, tsconfig.typecheck vs tsconfig divergence, Drizzle migration journal desync. TECH tasks documented intent but no smoke-test gate.
- **Gap C: seed-vs-adapter contract.** Seed wrote `base_url` with version path; adapter appended again (3.10). No linter checks that `seed_url + adapter_path` round-trips against a recorded provider call.
- **Recommendation:** new `external-contracts.md` artifact pinned per TECH provider task with version + endpoint shape + fallback strategy; mandatory CI smoke-test job (bootstrap DB, run migrations, lint seed against adapters) before any TECH task can be marked DONE.

### `nacl-sa-ui` — cases 3.7, 3.11, `a94601d`, `818dec1`, `e8d9280`, `eb1a34a`

- **Gap A: navigation as negative space.** Sidebars, CTAs to next UC, breadcrumb links are not part of any form-fields table; reviewers cannot see "missing button" in a diff (3.11).
- **Gap B: list-page vs form coverage gap.** FR-005 patched the workflow-step combobox inside the form but missed the filter combobox on the list page (`e8d9280`). Form specs and list specs evolve independently.
- **Gap C: cache invalidation in dynamic data views.** UC-401-FE held stale data on month change (`818dec1`); UC-106-FE tray rendered from query data only, ignoring Zustand-prepended SSE items (`a94601d`).
- **Recommendation:** form-fields table gains a `nav-actions` column; page specs declare which cache keys they read and what triggers invalidation; combobox/dropdown specs pin the design token (Tailwind v4 var) that supplies background to avoid theme regressions.

### `nacl-tl-plan` — cases 3.1, 3.3 partial, 3.5, 3.6, 3.9 partial, `19bbca6`

- **Gap A: payload-shape across UC boundaries not synthesized.** UC-104 enqueues, UC-202 dispatches; the plan should annotate the payload with the union of fields all downstream consumers need (3.1).
- **Gap B: seed/migration ordering.** migration 0019 backfilled placeholders; seed used `ON CONFLICT DO NOTHING` (`19bbca6`). The plan should declare upsert strategy when a migration touches a table the seed also populates.
- **Gap C: FR impact analysis.** FR-001 needed presession upload-url that UC-104 doesn't expose (3.3). No `IMPACTS` edge was added from FR-001 to UC-104.
- **Recommendation:** every Wave-plan generation includes a "cross-UC payload trace" pass that walks each enqueue/dispatch chain and asserts the payload's field union covers all dispatch-time consumers.

### `nacl-tl-sync` — cases 3.2, 3.7, 3.10

- **Gap: TS-type alignment ≠ wire-format ≠ cache-seeding ≠ provider-contract.** Cache crash (3.7) passed sync because `TaskPublic` matched on both sides; Zod envelope mismatch (3.2) passed sync because `ApiError.details: unknown`; kie.ai shape (3.8) passed sync because the adapter interface didn't change.
- **Recommendation:** runnable-contract test required before PASS for any UC with `actor != SYSTEM` — either a real HTTP round-trip or a recorded fixture for each endpoint. Extend to cache-seeding: assert all mutations writing to a cache key populate the same shape as reads expect.

### `nacl-tl-verify-code` — cases `2ffd29d`, `2ea1eeb`

- **Gap: local-vs-CI tsconfig divergence.** `tsconfig.typecheck.json` includes tests, `tsconfig.json` doesn't; local dev compiled clean while CI surfaced TS2537 in `admin-setup.tsx`. Static analysis caught nothing because it ran the wrong tsconfig.
- **Note:** This is a small footprint but compound with `nacl-tl-review`'s lint+typecheck blind-spot (3.12) it's the same systemic issue: the review path doesn't exercise the CI path.
- **Recommendation:** `nacl-tl-verify-code` must run `tsc --project tsconfig.typecheck.json` (the strictest config) in addition to whatever the build runs.

### `nacl-tl-review` — case 3.12, plus 3.4, 3.11, `d4cc03a`, all lint-cleanup fixes

- **Gap A: PASS without lint/typecheck/test green.** Wave 4 PASS-flagged with `pnpm -r lint` red, `pnpm -r typecheck` red (3 errors), and three publishers defined-but-uncalled (3.12). The conductor-state file literally claimed "typecheck clean" while CI was red.
- **Gap B: navigation reachability unchecked.** Admin sidebar absent (3.11); SessionDetail had no CTA to UC-104; UC-105 → UC-103 back-nav missing — none flagged by review.
- **Gap C: lifecycle-ordering invariants untested.** UC-102 boot-refresh raced TanStack Router guards (3.4); spec said "after resolves, hand to router" but no test asserted the ordering.
- **Gap D: test-fixture duplication invisible in diff.** 6 admin form-test files duplicated `ADMIN_USER` / `NON_ADMIN_USER` / `renderAdminPage` setup inline (`d4cc03a`); one form change broke all 6.
- **Recommendation:** make PASS *require* `pnpm -r lint && pnpm -r typecheck && pnpm -r test` green; require explicit "negative-space checks" for missing nav-actions; require a duplication scan against the test/__shared__ folder.

### `nacl-tl-qa` — implicit in 3.8, 3.10

- **Gap: provider migrations and prod-only URL constructions never tested.** kie.ai async migration (3.8) and `base_url` doubling (3.10) only surfaced in prod (or post-deploy verify). No recorded-fixture pattern keeps QA exercising real provider shapes when API keys are missing.
- **Recommendation:** treat any UC with an external-API adapter as QA-mandatory; if real keys absent, ship recorded provider fixtures (one per provider) and replay them. Otherwise QA SKIP is a release-blocker.

### `nacl-tl-stubs` — cases `8522d1d`, `19bbca6`

- **Gap: stub considered "complete" when TODO marker removed, not when real data is plugged in.** `WORKFLOW_STEPS` carried fake dot-notation IDs ("retouch.generate") that didn't match the real step catalog; the file had no `TODO`, so the scanner passed. Seed `model_profiles` had placeholder `image_gen` profiles that never received text_llm via upsert until forced (`19bbca6`).
- **Recommendation:** for any const declared as "stub" in a previous task, require post-build assertion that real data is non-empty *and* shape-matches against the SA model.

### `nacl-tl-fix` — case `a7eb747`

- **Gap: Rule 1 (Spec First) drift.** DIAGNOSTIC-REPORT measured 9 code-only fixes (39% of analyzed fixes). One `a7eb747` "docs(SA): UC-105/UC-106/UC-107 post-commit emit timing (L2)" tried to retro-fit the spec after the FIX-B code wave — backwards from the protocol.
- **Recommendation:** `nacl-tl-fix` must refuse to proceed on L1+ classification without spec-update commit listed *first* in the chain.

---

## 5. Cross-cutting patterns

1. **No structured external-API contract artifact.** kie.ai endpoint URLs, request/response shapes, version-migration strategies, and provider-specific quirks all live as prose inside adapter code, never in `.tl/`. Four of eight API-contract bugs (3.8, 3.10, `9bcf4fd`, `1a55c11`) are this shape. A single source of truth — `.tl/tasks/TECH-015/external-contracts.md` per provider — would have prevented half the API-contract bucket.
2. **Declared-done is not validated-done.** Wave 4 closed at 17:07; audit at 17:35 re-opened it (3.12). Wave 5 closed at 10:46; first stabilization fix at 11:09. The skill chain currently treats `conductor-state.json: status="done"` as authoritative even when CI is red and core publishers are dead code. `nacl-tl-review` PASS conflates "code matches spec" with "spec is complete and tests run green" — and on a fast-moving wave, the second clause is the one that breaks.
3. **Spec-first discipline eroded over time.** DIAGNOSTIC-REPORT measured 39% of fixes never updated docs; 5-day changelog gap between FR-002 and FR-003; ADR-001…010 referenced in CLAUDE.md but never written. Every undocumented fix makes the next post-mortem harder because the spec snapshot is unreliable.
4. **Cross-UC connectivity invisible to per-UC review.** Each UC was correct in isolation; the seams between them were not. SessionDetail (UC-103) had no path to UC-104 (3.11); no `/sessions/:id/tasks` endpoint existed (3.6); admin sidebar was negative space (3.11). The graph models UC-to-UC edges, but the on-disk form spec doesn't materialize them as DOM affordances.
5. **CI environment is a second-class deployment target.** Six of thirteen config/infra fixes (`49eee5d`, `0bb40f2`, `f0dd78c`, `2ea1eeb`, `2580bd6`, `5134604`) are "first time CI bootstrapped on a clean runner". The CI pipeline was never exercised end-to-end before Wave 10 on 2026-05-18 — six days after MVP. `nacl-sa-architect` TECH tasks documented intent but no smoke-test gate.
6. **Test-infrastructure duplication is invisible to `nacl-tl-review`.** Six admin form-test files independently duplicated setup (`d4cc03a`); the duplication only became visible when a shared change broke all six simultaneously. Negative-space patterns — missing sidebar, missing test/__shared__, missing nav-action — are the per-UC review's blind spot.

---

## 6. Recommended next steps

Candidates for separate PRs, ordered by leverage:

1. **`nacl-tl-review` cannot PASS while lint/typecheck/test red.** One-line guard: PASS requires `pnpm -r lint && pnpm -r typecheck && pnpm -r test` green on the wave-tip commit. Would have prevented case 3.12 entirely and surfaced the lint/typecheck cluster (~6 fixes) before MVP.
2. **`external-contracts.md` artifact per UC with `actor != SYSTEM` or per TECH adapter.** Pins endpoint URL, request/response Zod, version, fallback strategy, error envelope. Addresses 3.2, 3.7, 3.8, 3.10, plus the nano-banana model namespace (`9bcf4fd`). One file would have prevented ~5 of 8 API-contract bugs.
3. **`nacl-tl-sync` wire-format gate.** Add a "runnable contract test required before PASS" step for any UC with `actor != SYSTEM`, plus cache-key shape consistency check. Addresses 3.1, 3.7, 3.10 — and extends to FR impact analysis (when a new FR uses a cache key, all writers must hydrate the same shape).
4. **CI smoke-test gate before any TECH task is marked DONE.** Bootstrap fresh DB, run migrations, lint seed against adapters, exercise `pnpm -r typecheck` against the strictest tsconfig. Addresses 6 of 13 config/infra fixes.
5. **`nacl-sa-ui` nav-actions section in form specs.** Form-fields tables grow a `nav_actions` column listing outgoing links to other UCs. `nacl-tl-review` rejects a UC marked "user-triggered" with zero inbound nav-actions from related UCs. Addresses 3.6, 3.11 + the SessionDetail CTA.
6. **`nacl-tl-stubs` shape validation.** Stub considered "complete" only when real data passes type-check + non-empty + matches SA-graph entity shape. Addresses 3.10 and the `19bbca6` placeholder pattern.
7. **Follow-up feature-pass on FR-001…FR-007.** Per the user's framing: a separate analysis decides which feature-requests should have been in the original SA spec vs. genuine new asks discovered during use. Five of seven FRs ship work that touches UCs already declared DONE; the question is whether `nacl-sa-feature` should have caught the gap during BA→SA handoff or whether the user genuinely added scope.

After any of these land, re-run this post-mortem algorithm on the same project (or a fresh end-to-end build under the updated skills) and check whether the same buckets reappear.

---

## Appendix: how this report was built

Algorithm: `feedback_skill_postmortem_algorithm.md` in user memory. Same procedure as `project-beta-postmortem.md`:

1. Three parallel `Explore` agents: (a) project shape & dev→fix boundary; (b) categorize fix commits into buckets with quoted examples; (c) drill into spec artifacts to classify each case.
2. Verify quotes by direct `Read` of cited files — agents paraphrase.
3. Synthesize: every category maps to the skill that owned the gate.
4. Write a single retrospective markdown to `NaCl/docs/retrospectives/`. No skill edits in this turn.

Input artifacts: `project-alpha/.tl/` (21 conductor-state files, 25 UC dirs, 16 TECH dirs, 7 feature-requests, 1 fix workstream), `git log --no-merges` (174 non-merge commits), `project-alpha/DIAGNOSTIC-REPORT.md` (dated 2026-05-18, score 66/100), and `project-alpha/.tl/fix-plan-wave-4-audit-2026-05-11.md`.

Feature-requests FR-001…FR-007 were excluded from this analysis per user direction. A separate pass will determine which were genuine new asks vs. specification gaps the original BA/SA layer should have anticipated.

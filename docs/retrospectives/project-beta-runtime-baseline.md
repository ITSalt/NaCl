# Project-Beta Runtime Baseline — W0 (read-only)

**Generated:** 2026-05-22 by W0-baseline subagent.
**Sources:**
- `/home/project-owner/projects/NaCl/docs/retrospectives/project-beta-postmortem.md`
- `/home/project-owner/projects/NaCl/docs/retrospectives/project-beta-postmortem-codex.md`
- `/home/project-owner/projects/NaCl/docs/retrospectives/nacl-postmortems-synthesis.md`

This baseline catalogs every wire / runtime asset / FSM / queue / provider gap surfaced by the project-beta postmortems. It is read-only inventory; no fix is proposed here. W6 (wire-contracts), W7 (UI reachability), W8 (runtime FSM), W9 (clean-checkout + runtime asset) consume this catalog.

The synthesis pattern is: **TS types and graph artifacts matched on both sides of every interface, but the wire, the runtime, and the bundle did not.** Categorized below.

---

## A. Providers (external-API contract gaps)

| # | Provider | Symptom (prod) | Fix SHA | Spec gap (what was missing) | Owning skill (per postmortems) |
|---|---|---|---|---|---|
| A1 | kie.ai (LLM Anthropic-shape) | HTTP 404 on every protocol-generation call; endpoint shape was Anthropic, not OpenAI | `1f025b7` | TECH-011 named `ILlmProvider` abstraction; did not pin endpoint URL, request body shape, response body shape, model namespace | `nacl-sa-architect` (TECH-011), `nacl-tl-qa` (skipped — no KIE_API_KEY in test env) |
| A2 | kie.ai (image_gen) — Project-Alpha | HTTP 404; sync `/generate` deprecated mid-build; replaced by async `POST /api/v1/jobs/createTask` + polling `GET /api/v1/jobs/recordInfo` | Project-Alpha `1a55c11` | sync-vs-async lifecycle, polling cadence, fallback strategy unspecified | `nacl-sa-architect` (TECH-011 / TECH-015) |
| A3 | kie.ai nano-banana model namespace — Project-Alpha | model IDs prefixed `google/` (wrong) → 400 | Project-Alpha `9bcf4fd` | model namespace not pinned per provider | `nacl-sa-architect` |
| A4 | Deepgram (transcription) | UC-200 marked QA skip because Deepgram key absent; ffmpeg stage failed silently before any Deepgram call | (handled by `5eb7e18` — ffmpeg is the visible failure, Deepgram never got reached) | provider key absence treated as full-UC skip; no pre-provider stage decomposition | `nacl-tl-qa` (SKIP-on-missing-keys masks earlier-stage failure) |
| A5 | Anthropic Claude (via kie.ai routing) | per A1, response parsing assumed OpenAI `choices[0].message.content`; Anthropic returns `content[]` array | `1f025b7` | response shape per provider not in spec | `nacl-sa-architect` |
| A6 | TUS (upload protocol) | every TUS upload returned 415 — metadata key mismatch + Fastify content-type rejection | `29c175a`, `5398e7c` | wire-protocol envelope details (metadata key, content-type parser) absent from TECH-008 | `nacl-sa-architect` (TECH-008), `nacl-sa-uc` (UC-100 api-contract.md self-consistency) |
| A7 | kie.ai (text_llm via FR-003) — Project-Alpha | UC-202 routing guard `isLlmSlot = !isVerifier && (vlm \| text_llm)` excluded verifier slots; verifier VLM routed back to legacy openrouter → HTML returned, JSON expected → VERDICT_PARSE_ERROR | Project-Alpha `ee37928` | adapter-selection decision table per `(slot_type, is_verifier)` absent | `nacl-sa-uc` (UC-151 verifier-loop), `nacl-tl-plan` |
| A8 | kie.ai/apiframe provider base_url — Project-Alpha | base_url seeded as `https://kie-ai.redpandaai.co/api/v1` and adapter appended `/api/v1/models` → 404 | Project-Alpha `6095a3d`, `9a24613` | base_url format (host-only vs full version path) + discovery mechanism (HTTP list vs static catalog) unspecified | `nacl-sa-architect` |
| A9 | nano-banana provider routing — Project-Alpha | placeholder image_gen profiles never received text_llm via upsert until forced | Project-Alpha `19bbca6` | seed upsert vs `ON CONFLICT DO NOTHING` semantics unspecified | `nacl-tl-plan` |

**Pattern:** Every provider failure traces to one missing artifact — a per-provider `external-contracts.md` pinning endpoint, request/response shape, sync-vs-async lifecycle, polling, model namespace, file-URL accessibility, failure codes. W6 introduces this artifact.

---

## B. Protocols (wire-envelope gaps)

| # | Protocol | Symptom | Fix SHA | Spec gap | Owning skill |
|---|---|---|---|---|---|
| B1 | TUS metadata key | three-way contradiction across TECH-008, UC-100 api-contract.md prose, UC-100 Zod schema | `29c175a` | string-literal field name (`mime_type` / `filetype`) appears with different casings across prose, Zod, and table sections; no automated check enforces consistency | `nacl-sa-uc` (cross-document self-consistency), `nacl-tl-sync` |
| B2 | Fastify 5 content-type parser for TUS PATCH | TUS PATCH always uses `application/offset+octet-stream`; Fastify 5 rejects unregistered content-types with 415 | `5398e7c` | framework-specific integration trap not captured; TECH-008 said "mount @tus/server" only | `nacl-sa-architect` (TECH-008) — no stack-tagged "gotchas registry" |
| B3 | SSE frame envelope | API emitted SSE bytes correctly, but no `event: <type>` line; browser EventSource listeners on `meeting.status` silently never fired (default `'message'` event) | `7f983f6` | TECH-012 spec documented `Event payload` shape but not the SSE *frame envelope* | `nacl-sa-architect` (TECH-012); `nacl-tl-sync` did not check browser EventSource event names |
| B4 | Reverse proxy URL scheme (Caddy → Fastify TUS) | TUS Location header returned `http://…` from origin server even though the public URL was `https://`; `respectForwardedHeaders` was not set; `X-Forwarded-Proto` not consumed | `15c6a20` | reverse-proxy public-scheme behavior not in TECH-008 (deploy plan covered Caddy topology but did not translate it into endpoint acceptance tests) | `nacl-sa-architect` deploy planning, `nacl-tl-deploy` |
| B5 | TUS-to-S3-presigned-multipart rewrite | TUS chunked uploads were rewritten to direct S3 presigned multipart due to repeated runtime issues | `ed6aaa9` (feature rewrite, not a fix) | underlying protocol risk not surfaced at planning time | `nacl-sa-architect` (TECH-008) |
| B6 | ffprobe `s3://` scheme | finalize step passed `s3://bucket/key` to ffprobe; ffprobe rejected scheme | `5d9585d` (also `unblock CI`) | URL scheme acceptance for the chosen ffmpeg/ffprobe binary not specified | `nacl-sa-architect`, `nacl-tl-dev-be` |
| B7 | Zod error envelope (VALIDATION_FAILED `details` shape) — Project-Alpha | UC-303 received Zod `{ issues: [{ path, message }] }`; UC-305 form handler walked `Object.entries(err.details)`; details never reached form | Project-Alpha `17f71a3` | `details` shape not in api-contract.md envelope spec; each form invented its own | `nacl-sa-uc`, `nacl-tl-sync` |

**Pattern:** Wire envelopes are protocol-tier details that live outside the TS type and outside the graph. The W2 wire-evidence gate (per the plan) requires a runnable contract test or recorded fixture for every UC with `actor != SYSTEM` — that closes the entire "type aligned, wire mismatched" cluster.

---

## C. Runtime Assets (build/dist gaps)

| # | Asset | Symptom | Fix SHA | Spec gap | Owning skill |
|---|---|---|---|---|---|
| C1 | LLM prompt markdown (`worker/src/llm/prompts/{ru,en}/protocol.md`) | Worker started, processed UC-300 job, threw `ENOENT: dist/llm/prompts/ru/protocol.md`; `tsc` emitted only `.js`, leaving `dist/llm/prompts/` empty | `66049d5` | "Prompt templates in src/" specified; build-output location ("dist/") assumed | `nacl-tl-plan` (no packaging sub-task for non-TS runtime assets); `nacl-tl-stubs` (scans source for placeholders, not dist for missing assets) |
| C2 | pm2 ecosystem entry-point (`dist/index.js` vs `dist/server.js`) | Deploy succeeded, pm2 reported "online", health check failed (port closed); `server.js` is the Fastify factory (`buildApp()` not `.listen()`); `index.js` is the real entry | `aeeae53` | TECH-019 impl-brief.md skeleton confused factory file with entry-point file | `nacl-sa-architect` (TECH-019); `nacl-tl-verify-code` does not exercise runtime entry-point |
| C3 | Prisma client generation in CI | CI script missing `prisma generate` before `api build`; blocked first deploy | `321016e`, `e3b0e3b` (re-apply) | TECH-023 CI script did not include Prisma generate before TS build | `nacl-sa-architect` (TECH-023) |
| C4 | pm2 reload caches stale ecosystem.config.cjs | pm2 reload kept stale script path; needed `pm2 delete + pm2 start` when `ecosystem.config.cjs` changes | `27da444` | pm2 reload behavior not in TECH-023 spec | `nacl-sa-architect` (TECH-023) |
| C5 | ffmpeg seekable input (UC-200) | Piping an unbuffered Readable stream into ffmpeg via stdin is non-seekable; MP4 demuxing needs to seek to the moov atom (usually at EOF); ffmpeg times out silently on stdin streams | `5eb7e18` | UC-200 impl-brief.md said `getObjectStream(...)` but did not tag the stream with seekability requirements that the chosen tool (ffmpeg + MP4) imposes | `nacl-sa-uc` (UC-200 impl-brief); `nacl-tl-qa` (no real MP4 fixture; QA-skipped for UC-200 because no Deepgram key — the ffmpeg stall would have surfaced *before* ASR; SKIP masked an earlier-stage failure) |
| C6 | StorageError.cause TS4113 in web tsconfig | TS4113 from `StorageError.cause` shadowing `Error.cause`; only caught when web TS build ran in Phase 4 QA | `77f4c73` | local-vs-CI tsconfig divergence; verify-code phase did not run web build | `nacl-tl-verify-code` (local-vs-CI tsconfig divergence); broader pattern in Project-Alpha also (`2ffd29d`, `2ea1eeb`) |
| C7 | orphaned `tus.test.ts` importing defunct `@tus/utils` | first CI run failed at compile | `5d9585d` | orphaned test file not detected at sync/review | `nacl-tl-review`, `nacl-tl-stubs` (no stale-test scan) |

**Pattern:** Non-TS runtime assets and CI-only failures share one root: the validator runs on source, not on the built artifact + clean runner. W9 introduces clean-checkout + runtime-asset verification.

---

## D. FSM / Queue / Workflow gaps (durable-state contracts)

| # | Transition | Symptom | Fix SHA | Spec gap | Owning skill |
|---|---|---|---|---|---|
| D1 | UC-100 catalog → /upload navigation | Catalog rendered; no upload button; route existed but unreachable | `0ec0a4e` (project-beta); Project-Alpha `e72204d` (UC-103 → UC-104) and `43fc84d` (admin sidebar) | cross-UC navigation as negative space; per-UC form-fields tables are authoritative for *contents* of a page but mute on *connections* between pages | `nacl-sa-ui`; `nacl-tl-review` |
| D2 | Worker FSM: cancel-while-failing race — Project-Alpha | UC-107/UC-150/UC-202: cancel/fail race correctness L2 | Project-Alpha `6ed12ac`, `135b14b`, `3acb2fd` | Worker commit TX missed row-level FOR UPDATE lock; cancel-while-failing terminal-state ordering unspecified | `nacl-sa-uc` |
| D3 | UC-112 restart silent no-op — Project-Alpha | Pressing "Restart" on a failed task returned 200 but task stayed `failed`. `enqueue()` uses `ON CONFLICT DO NOTHING`; previous `failed` queue_item exists → insert suppressed | Project-Alpha `67a6a44` | UC-201 idempotency invariant covers re-enqueue but is silent on restart-after-failure edge; restart must `DELETE FROM queue_items WHERE task_id = $id` and route must return 409 `TASK_NOT_RESTARTABLE` | `nacl-sa-uc` (UC-201/UC-112 spec interaction); `nacl-tl-plan` (should have flagged UC-112 contradiction with UC-201 acceptance criterion #3) |
| D4 | UC-104 first-step payload missing routing metadata — Project-Alpha | UC-104 enqueues first workflow step. UC-202 dispatcher cannot select adapter without routing fields; verifier/VLM/text_llm slots silently fall back to legacy openrouter | Project-Alpha `ddeae5b` (iter 3) | payload `Record<string, unknown>` opaque; load-bearing fields (`model_profile_id`, `model_kind`, `api_shape`, `endpoint_path`) not enumerated at UC-104→UC-202 edge | `nacl-tl-plan` (cross-UC payload trace) |
| D5 | UC-305 advisory lock — Project-Alpha | Concurrent WorkflowStepConfig creates raced on `step_order` | Project-Alpha `546fb53` | advisory lock not specified | `nacl-sa-uc` |
| D6 | UC-102 boot-refresh races TanStack Router guards — Project-Alpha | Spec said "after resolves, hand to router"; impl used `useEffect` which fires *after* `beforeLoad` guards | Project-Alpha `749440e` | lifecycle-ordering invariant (refresh→render→guard) untested | `nacl-tl-review` (no integration test for reload→guard sequence) |
| D7 | UC-300/UC-301 schema rename leak (project-beta) | UC-301 renamed `Protocol.contentMd` → `markdownContent` (snake_case `markdown_content`); worker for UC-300 still wrote old field | `8e92405` | cross-UC field-rename impact not propagated | `nacl-tl-sync` (TS types diverged across UCs; alignment check missed) |
| D8 | UC-401 cache invalidation on month change — Project-Alpha | UC-401-FE placeholderData held stale prior-month report; spec silent on invalidation | Project-Alpha `818dec1` | page-spec did not declare which cache keys it reads / when invalidation triggers | `nacl-sa-ui` |
| D9 | UC-106 tray cache vs Zustand store — Project-Alpha | UC-106-FE tray rendered `query.data?.items` only; SSE-prepended Zustand items invisible | Project-Alpha `a94601d` | cache-seeding consistency unspecified | `nacl-sa-uc` (cache contract), `nacl-tl-sync` (cache-shape consistency) |
| D10 | UC-104 cache seed crashes UC-105 breadcrumb — Project-Alpha | UC-104 optimistic-seeds `['tasks', id]` with `TaskPublic` (`session_id` only); UC-105-FE `SessionBreadcrumb` reads `task.session.name` (nested object) → undefined → crash | Project-Alpha `4820d59` | cache shape consistency between mutation seed and read | `nacl-sa-ui`, `nacl-tl-sync` |

**Pattern:** Every FSM/queue/workflow failure is a missing **durable state machine contract**. W8 introduces this artifact: every workflow transition must specify DB transaction boundary, lock behavior, emitted events, retry/restart, recovery.

---

## E. UI / Navigation gaps

| # | Symptom | Fix SHA | Spec gap | Owning skill |
|---|---|---|---|---|
| E1 | Project-Beta catalog had no upload button → UC-100 unreachable | `0ec0a4e` | UC-001 spec listed only `open_button`; no cross-UC nav-action to UC-100 | `nacl-sa-ui`; `nacl-tl-review` |
| E2 | Project-Alpha admin sidebar absent — UC-301/302/303/305 unreachable | `43fc84d` | no spec file declared AdminLayout sidebar or its menu entries | `nacl-sa-ui` |
| E3 | Project-Alpha SessionDetail had no UC-104 CTA | `e72204d` | UC-103/task-fe.md listed fields but no outgoing nav-action to UC-104 | `nacl-sa-ui` |
| E4 | Project-Alpha sessions list-page filter combobox missed FR-005 grouping | `e8d9280` | FR-005 patched form combobox, missed list-page filter | `nacl-sa-ui` (list-page vs form coverage gap) |
| E5 | Project-Alpha dropdown opaque-background regression | `eb1a34a` | Tailwind v4 `bg-popover` token needed CSS var; theme spec silent | `nacl-sa-ui` (design-token availability) |
| E6 | Project-Alpha role-based redirect missing on index route | `311635f` | `/` had no auth-aware redirect; spec covered login page, not index | `nacl-sa-uc` (UC-101/102) |

**Pattern:** Negative-space failures — reviewer can't see "missing button" in a diff because there's nothing to compare against. W7 introduces nav-actions section to form spec + graph rule "user-triggered UC without inbound action from a reachable screen = blocker."

---

## F. Provider/Stage QA decomposition gaps

| # | UC | What QA did | What QA should have done | Owning skill |
|---|---|---|---|---|
| F1 | UC-100 (project-beta) | opened `/upload`, checked form fields, language select, disabled upload button, i18n labels; relied on unit tests for upload | run real browser-to-server TUS upload through API + storage + finalize | `nacl-tl-qa` (no end-to-end story-map traversal) |
| F2 | UC-200 (project-beta) | skipped provider E2E because Deepgram key absent | split pipeline: storage fetch (no key needed), ffmpeg extract (no key needed), queue transition (no key needed), Deepgram call (key needed). Missing Deepgram should block only the provider stage | `nacl-tl-qa` |
| F3 | UC-300 (project-beta) | skipped because KIE_API_KEY absent | record kie.ai request/response fixture once, replay during QA; OR live smoke with rotation key | `nacl-tl-qa` |
| F4 | UC-202 (Project-Alpha) | mocked provider responses | recorded provider fixtures or per-provider QA contract | `nacl-tl-qa` (no real provider call) |

**Pattern:** SKIP-on-missing-keys is a silent prod-debt. UC-200 / UC-300 both blew on first real call. W3 enforces SKIP as a release-blocker unless an explicit `qa-debt.md` artifact carries the override.

---

## G. Cross-cutting — Spec/Graph artifact drift

| # | Symptom | Affected file | Class |
|---|---|---|---|
| G1 | Live graph 1083 nodes vs handover artifact 970 nodes (Project-Alpha) | `project-alpha/graph-infra/handover/2026-05-14T04-38_da0b0d5.cypher.gz.age` | stale handover; `project-alpha-postmortem-codex.md` § 3 |
| G2 | Changelog says FR-007 created; live FeatureRequest list lacks FR-007 (Project-Alpha) | `.tl/changelog.md` vs live graph | changelog-vs-graph drift |
| G3 | `.tl/status.json` Wave 4 still `"status": "planned"` while task entries are `"done"` (Project-Alpha) | `.tl/status.json` | status-json-vs-conductor-state drift |
| G4 | `conductor-state.json` claimed `"typecheck": "clean"` while CI red (Project-Alpha) | `.tl/conductor-state.json` | conductor-state-vs-CI drift |
| G5 | `graph-infra/exports/project-beta-graph-export.cypher` exists at 248K, 464 lines, but is by definition older than live graph state (project-beta) | `graph-infra/exports/project-beta-graph-export.cypher` | export-vs-live drift |
| G6 | `release-status.json` records `graph.status: warn` "no IntakeItem nodes and stale Task statuses; release proceeded by operator override" (Project-Alpha) | `.tl/release-status.json` | release-vs-graph drift |
| G7 | DIAGNOSTIC-REPORT measured 39% of fixes never updated documentation (Project-Alpha) | `project-alpha/DIAGNOSTIC-REPORT.md` | spec-first violation rate |

**Pattern:** Five distinct sources of truth — `.tl/status.json`, `.tl/conductor-state.json`, `.tl/changelog.md`, live graph, `release-status.json` — diverge. Only the live graph carries the latest; the rest are written-after-the-fact and become stale. W5 reconciles these against the live graph before close/release.

---

## H. Provider / TECH cluster — by stack

For W6 (external-contracts.md per provider) — the stack-tagged "gotchas registry":

| Stack | Gotchas list |
|---|---|
| Fastify 5 | `addContentTypeParser` required for non-standard content-types (TUS PATCH `application/offset+octet-stream`) — `5398e7c` |
| pm2 + Fastify | Factory file (`server.js` returning `buildApp()`) vs entry-point file (`index.js` calling `.listen()`); pm2 reload caches ecosystem path — use `pm2 delete + pm2 start` — `aeeae53`, `27da444` |
| SSE | Frame envelope `event: <type>\ndata: <json>\n\n`; without `event:` line, browser dispatches default `'message'` — `7f983f6` |
| Caddy reverse proxy | `respectForwardedHeaders` + `X-Forwarded-Proto` for absolute-URL endpoints (TUS Location, presigned URLs) — `15c6a20` |
| ffmpeg + MP4 | Non-seekable stdin breaks MP4 demux (moov atom at EOF) — `5eb7e18` |
| ffprobe | rejects `s3://` URI scheme — `5d9585d` |
| Prisma | `prisma generate` must run before `tsc` in CI — `321016e` |
| Drizzle | journal entry required for every migration; missed = silent skip — Project-Alpha `9b72bbc` |
| pnpm | hardcoded version in CI workflow drifts from `packageManager` field — Project-Alpha `f0dd78c` |
| MinIO (compose `services:`) | does not accept inline `command:` argument — Project-Alpha `1f8efa7` |
| tsconfig (typecheck vs main) | divergence between `tsconfig.typecheck.json` (tests included) and `tsconfig.json` (tests excluded) — Project-Alpha `2ea1eeb` |
| TanStack Router | guards run in `beforeLoad`; reload-time refresh must happen before `beforeLoad`, not in `useEffect` — Project-Alpha `749440e` |
| kie.ai (LLM) | endpoint shape is Anthropic-flavored, not OpenAI; model namespace per-provider; sync vs async lifecycle | A1, A2, A3, A5 |

---

## I. Categories for downstream waves

| Category | Cases (this baseline) | Owning wave |
|---|---|---|
| Provider/external-API contracts | A1–A9 | W6 |
| Wire-envelope protocols (TUS, SSE, reverse-proxy, schema rename) | B1–B7 | W2 + W6 |
| Runtime assets (non-TS in dist; pm2 entry; Prisma generate; tsconfig) | C1–C7 | W9 |
| FSM/queue/workflow contracts | D1–D10 | W8 |
| UI navigation / nav-actions / design-token / cache invalidation | E1–E6 | W7 |
| QA decomposition pre-provider / provider / golden-path | F1–F4 | W3 |
| Artifact drift across `.tl/`, graph, changelog, release-status | G1–G7 | W5 |
| Framework-specific gotchas registry (Fastify, pm2, SSE, etc.) | Section H | W6 |

---

## Verification (W0 read-only invariants)

This baseline is read-only inventory. Verification:

```bash
cd /home/project-owner/projects/NaCl
git diff --stat docs/retrospectives/         # only the three W0 deliverables are new
git diff --stat tests/fixtures/              # only graph-snapshots/<project> were added
```

No `project-beta/.tl/*` writes occurred. No project-beta graph mutations (read-only Cypher snapshot only).

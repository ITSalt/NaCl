# Project-Beta Post-Mortem: Where the nacl-* Skill Chain Failed

**Project:** `project-beta` (Fastify 5 + Vite/React + BullMQ worker monorepo, ~136 source files across `api/worker/web/shared`)
**Built:** 2026-05-18, end-to-end through nacl-* skills (BA → SA → tl-plan → tl-dev-be/fe).
**Declared done:** `4da4aca` "deliver(.tl): production live" on 2026-05-18 22:28.
**Stabilization wave:** 15 fix-commits between 2026-05-18 22:30 and 2026-05-19 17:51.

This document maps each post-delivery fix back to the skill that owned the gate, with verbatim quotes from `.tl/tasks/*` spec files. Goal: identify *systemic* gaps in the skill chain, not blame individual tasks.

---

## 1. TL;DR

| Bucket | Count | % | Owning skill(s) |
|---|---|---|---|
| API-contract mismatch (BE/FE wire-format disagreement) | 5 | 33% | `nacl-sa-uc`, `nacl-tl-sync` |
| Config/infra (pm2, prisma, deploy) | 4 | 27% | `nacl-sa-architect` (TECH tasks), `nacl-tl-dev` |
| UI/missing-element (no button, proxy headers) | 2 | 13% | `nacl-sa-ui`, `nacl-tl-review` |
| Domain logic (ffmpeg seekability, SSE envelope) | 2 | 13% | `nacl-sa-architect`, `nacl-tl-qa` |
| Asset packaging (prompts not in dist) | 1 | 7% | `nacl-tl-plan`, `nacl-tl-stubs` |
| Unblock / orphan test | 1 | 7% | `nacl-tl-dev-be` |

Of 8 cases analyzed in depth: **4 SPEC WRONG, 4 SPEC MISSING, 0 SPEC RIGHT-DEV-DRIFTED**. The dev agents executed faithfully; the failure was upstream — either the spec was wrong or silent on a load-bearing detail. `nacl-tl-qa` skipped UC-200 and UC-300 because real provider keys were unavailable; both UCs broke in production. `nacl-tl-sync` passed on TS-type alignment but missed three wire-format disagreements (TUS metadata key, kie.ai endpoint shape, schema rename).

---

## 2. Fix-by-fix mapping

| SHA | Commit message | Bucket | Owning skill | Why it slipped |
|---|---|---|---|---|
| `29c175a` | `fix: TUS upload metadata key — filetype instead of mime_type (UC-100)` | API-contract | `nacl-sa-uc` | TECH-008 spec, UC-100 api-contract.md prose, and UC-100 Zod schema gave three different names for the same MIME field; BE used one, FE used another |
| `5398e7c` | `fix: register content-type parser for TUS PATCH (prevented 415)` | API-contract | `nacl-sa-architect` (TECH-008) | TECH-008 spec said "mount @tus/server" but was silent on the Fastify 5 quirk that PATCH `application/offset+octet-stream` needs an explicit parser |
| `1f025b7` | `fix(UC-300): switch kie.ai client to Anthropic /claude/v1/messages` | API-contract | `nacl-sa-architect` (TECH-011) | TECH-011 didn't pin the kie.ai endpoint URL or request/response shape; dev defaulted to OpenAI-shape; provider is Anthropic-shape |
| `8e92405` | `fix(worker): align UC-300 protocol writes with UC-301 schema rename` | API-contract | `nacl-tl-sync` | UC-301 renamed `Protocol.contentMd` → `markdownContent` (snake_case domain spec said `markdown_content`); worker for UC-300 still wrote the old field |
| `77f4c73` | `fix(shared): drop override on StorageError.cause for web tsconfig` | API-contract | `nacl-tl-verify-code` | TS4113 from `StorageError.cause` shadowing `Error.cause`; only caught when web TS build ran in Phase 4 QA |
| `aeeae53` | `fix(TECH-019): pm2 api entry should be dist/index.js, not dist/server.js` | Config/infra | `nacl-sa-architect` (TECH-019) | Skeleton in impl-brief.md said `./dist/server.js` — but `server.js` is the Fastify factory; entry-point is `index.js` |
| `321016e` | `fix(TECH-023): generate Prisma client before building api` | Config/infra | `nacl-sa-architect` (TECH-023) | CI script missing `prisma generate` before `api build`; blocked first deploy |
| `e3b0e3b` | `fix(TECH-023): generate Prisma client before building api` (re-apply) | Config/infra | (same) | re-applied after stash conflict |
| `27da444` | `fix(TECH-023): pm2 delete+start instead of reload so ecosystem changes apply` | Config/infra | `nacl-sa-architect` (TECH-023) | pm2 reload caches stale script path; needs delete+start when ecosystem.config.cjs changes |
| `0ec0a4e` | `fix: add upload button to catalog page header` | UI/missing | `nacl-sa-ui` + `nacl-tl-review` | UC-001 form spec listed only `open_button`; no cross-UC navigation check linked UC-001 → UC-100 |
| `15c6a20` | `fix: TUS Location header uses https behind Caddy reverse proxy` | UI/missing | `nacl-sa-architect` (TECH-008) | TECH-008 silent on reverse-proxy concerns (`X-Forwarded-Proto`, `respectForwardedHeaders`) |
| `5eb7e18` | `fix(UC-200): feed ffmpeg a presigned S3 URL instead of a stdin Buffer` | Domain | `nacl-sa-uc` (UC-200) + `nacl-tl-qa` | impl-brief.md said `getObjectStream(...)` but ffmpeg needs seekable input for MP4 demux; QA was skipped (no fixture for 65 MB MP4) |
| `7f983f6` | `fix(TECH-012): emit SSE event:<type> so client listeners actually fire` | Domain | `nacl-sa-architect` (TECH-012) | Spec documented payload shape but not the SSE frame envelope (`event:` line) |
| `66049d5` | `fix(UC-300): copy llm/prompts/*.md into worker dist on build` | Asset packaging | `nacl-tl-plan` + `nacl-tl-stubs` | TECH-011 deliverable located prompts in `worker/src/llm/prompts/`; plan never produced a build-copy sub-task; tsc emits only .js |
| `5d9585d` | `fix(UC-100): unblock CI and fix ffprobe s3:// scheme for upload finalize` | Unblock/CI | `nacl-tl-dev-be` (UC-100) | Orphaned `tus.test.ts` imported defunct `@tus/utils`; ffprobe rejected `s3://` URIs (related domain issue) |

---

## 3. Eight specification failures — verbatim evidence

### 3.1 UC-100 TUS metadata key — *SPEC WRONG (three-way contradiction)*

- **Symptom:** Every TUS upload rejected with HTTP 415 from the BE pre-create hook.
- **Fix:** `29c175a fix: TUS upload metadata key — filetype instead of mime_type (UC-100)` (#3).
- **Specs that disagreed:**
  - `project-beta/.tl/tasks/TECH-008/task.md:19` — *infrastructure* spec:
    > "Upload metadata captured: filename, size_bytes, **mime_type**, meeting_id (passed via TUS Upload-Metadata header)"
  - `project-beta/.tl/tasks/UC-100/api-contract.md:24-28` — *prose* in api-contract:
    > "TUS metadata header (Base64 KV pairs): filename — original filename · **filetype** — actual MIME type string (video/mp4, video/x-matroska, video/quicktime) · size_bytes, title?, language? · Server reads \"**filetype**\" to validate MIME per RQ-008/009/010 at pre-create."
  - `project-beta/.tl/tasks/UC-100/api-contract.md:36-43` — *Zod schema* in same file:
    > `export const UploadCreateRequest = z.object({ filename: ..., size_bytes: ..., mime_type: VideoMimeType, ... })`
- **Class:** SPEC WRONG. Three documents, three values: TECH-008 says `mime_type`, api-contract prose says `filetype`, api-contract Zod says `mime_type` (for a different purpose — pre-flight client validation — but FE used this name as the TUS header key). BE handler read `filetype`.
- **Owning skill:** `nacl-sa-uc` for cross-document consistency; `nacl-sa-architect` for TECH-008 alignment with UC contracts.
- **Why missed:** `nacl-sa-validate` validates the graph, not file-level cross-references between TECH and UC artifacts. `nacl-tl-sync` checks shared TS-type alignment, which passed because both sides happily imported `UploadCreateRequest` — the wire-key was a string literal nobody validated.

### 3.2 TECH-008 Fastify 5 content-type parser — *SPEC MISSING*

- **Symptom:** Even after the metadata-key fix, every PATCH frame returned 415.
- **Fix:** `5398e7c fix: register content-type parser for TUS PATCH (prevented 415)` (#4).
- **Spec:** `project-beta/.tl/tasks/TECH-008/task.md:18`:
  > "api/src/plugins/tus.ts: mount @tus/server at /api/uploads with S3 datastore"

  Entire task.md (35 lines) contains no mention of `addContentTypeParser`, `application/offset+octet-stream`, or Fastify 5's strict content-type policy.
- **Class:** SPEC MISSING. Fastify 5 rejects bodies with unregistered content-types; TUS PATCH always uses `application/offset+octet-stream`. The integration trap was never written down.
- **Owning skill:** `nacl-sa-architect` (produces TECH tasks).
- **Why missed:** TECH-task templates lack a "framework-specific gotchas" checklist. There's no mechanism to capture "if Fastify 5 + non-standard content-type then register parser" as a reusable lore item.

### 3.3 UC-300 kie.ai endpoint shape — *SPEC MISSING*

- **Symptom:** Every protocol-generation call returned HTTP 404 from kie.ai.
- **Fix:** `1f025b7 fix(UC-300): switch kie.ai client to Anthropic /claude/v1/messages`. Adapter rewired: base URL changed, system prompt moved to top-level field, response parsing switched from `choices[0].message.content` (OpenAI shape) to walking `content[]` (Anthropic shape).
- **Spec:** `project-beta/.tl/tasks/TECH-011/task.md:13-22`:
  > "Define ILlmProvider abstraction (ADR-007) in shared/. Implement KieAiLlmProvider supporting Claude Sonnet 4.6 (default) and GPT-5.4 selectable per meeting.
  > Deliverables:
  > - shared/src/llm/ILlmProvider.ts: generate({prompt, model?, language}) -> LlmResult{text, model, tokensIn, tokensOut}
  > - worker/src/llm/kieai.ts implements provider via kie.ai HTTP API
  > - Provider reads KIE_API_KEY from env"

  No mention of the kie.ai endpoint URL, request body shape, or response body shape.
- **Class:** SPEC MISSING. The SA layer specified an *internal* abstraction (`ILlmProvider`) but not the *external* contract.
- **Owning skill:** `nacl-sa-architect` (TECH task for provider adapter).
- **Why missed:** SA-architect skill is graph-centric — external API contracts (kie.ai, Deepgram, S3) live as ADR mentions but not as graph-validated artifacts with shape definitions. Combined with `nacl-tl-qa` SKIP (no real KIE_API_KEY in test env), the failure surfaced only in production.

### 3.4 UC-001 catalog has no upload entry-point — *SPEC MISSING*

- **Symptom:** User opens the app, sees an empty/populated catalog, has no way to upload a new meeting.
- **Fix:** `0ec0a4e fix: add upload button to catalog page header` (#2).
- **Spec:** `project-beta/.tl/tasks/UC-001/task-fe.md:31-41` — form fields table lists:
  > `title`, `status`, `language`, `uploaded_at`, `duration_sec`, `open_button` (Navigates to /meetings/:id).

  Acceptance criteria (line 22-24) and user steps (line 28-29) confirm:
  > "AUTHOR opens the meeting catalog page. AUTHOR sees the list and can click 'Open' on a row to navigate to UC-002."

  No reference to UC-100 (upload) entry.
- **Class:** SPEC MISSING. Each UC was specified in isolation; cross-UC navigation never resolved into a concrete affordance on a parent page.
- **Owning skill:** `nacl-sa-ui` (navigation map), backstopped by `nacl-tl-review` (should flag missing entry-points to other UCs).
- **Why missed:** `nacl-sa-ui` produces a navigation graph between UCs but does not materialize the back-link into the form-fields spec of the parent UC. `nacl-tl-review` reviews code against the spec — and the spec said no button, so the absence was "correct".

### 3.5 TECH-019 pm2 entry — *SPEC WRONG*

- **Symptom:** Production deploy succeeded, pm2 reported "online", health check at `/api/health` failed (port 3010 closed).
- **Fix:** `aeeae53 fix(TECH-019): pm2 api entry should be dist/index.js, not dist/server.js`.
- **Spec:** `project-beta/.tl/tasks/TECH-019/impl-brief.md:32-36`:
  > ```js
  > {
  >   name: 'project-beta-api',
  >   cwd: '/opt/project-beta/api',
  >   script: './dist/server.js',
  > ```
- **Reality:** `server.js` is the Fastify factory (`buildApp()`) that does not call `.listen()`; the real entry is `index.js` (line 53 of the same skeleton, correctly used for the worker).
- **Class:** SPEC WRONG. The skeleton template confused the factory file with the entry-point file.
- **Owning skill:** `nacl-sa-architect` (TECH-019).
- **Why missed:** Skeleton blocks in impl-brief.md are not linted against the actual file layout the dev agent produces. `nacl-tl-verify-code` does static dataflow tracing but does not exercise the runtime entry-point.

### 3.6 TECH-012 SSE envelope missing — *SPEC MISSING*

- **Symptom:** Catalog auto-refresh broken; status changes required manual page reload despite SSE bytes arriving correctly.
- **Fix:** `7f983f6 fix(TECH-012): emit SSE event:<type> so client listeners actually fire`.
- **Spec:** `project-beta/.tl/tasks/TECH-012/task.md:18-22`:
  > "Deliverables:
  > - api/src/routes/events.ts: SSE handler via Fastify reply.raw stream
  > - Pub/sub backed by Redis (worker -> publish, API -> subscribe) so transitions propagate across processes
  > - **Event payload: {type:'meeting.status', meeting_id, status, error_reason?}**
  > - Heartbeat ping every 15s"
- **Class:** SPEC MISSING. The spec gives the *payload* but not the *frame envelope*. SSE frames without `event: <type>` arrive at the browser as the default `'message'` event. FE used `addEventListener('meeting.status', ...)` and silently never fired.
- **Owning skill:** `nacl-sa-architect` (TECH-012).
- **Why missed:** Same root cause as 3.2 — framework/protocol-level details (HTTP/SSE envelope semantics) live outside the graph and are not in any reusable checklist.

### 3.7 UC-300 prompts not packaged — *SPEC MISSING*

- **Symptom:** Worker starts in production, processes first UC-300 job, throws `ENOENT: dist/llm/prompts/ru/protocol.md` and stalls the job.
- **Fix:** `66049d5 fix(UC-300): copy llm/prompts/*.md into worker dist on build`.
- **Spec:** `project-beta/.tl/tasks/TECH-011/task.md:22`:
  > "Prompt templates in worker/src/llm/prompts/{ru,en}/protocol.md (RU + EN per BRQ-013)"

  No mention of build-copy step. `tsc` emits only `.js`, leaving `dist/llm/prompts/` empty.
- **Class:** SPEC MISSING. Deliverable location (src/) was specified; runtime location (dist/) was assumed.
- **Owning skill:** `nacl-tl-plan` (should generate a packaging sub-task for non-TS runtime assets); `nacl-tl-stubs` (should flag "asset referenced at runtime not present in dist").
- **Why missed:** `nacl-tl-plan` derives tasks from SA artifacts, not from build-output reality. `nacl-tl-stubs` scans source for placeholder code, not dist/ for missing runtime files. Local vitest passed because it runs from src/.

### 3.8 UC-200 ffmpeg input — *SPEC WRONG*

- **Symptom:** First real upload (65 MB MP4) silently stalls at `TRANSCRIBING` forever; worker crashes unhandled.
- **Fix:** `5eb7e18 fix(UC-200): feed ffmpeg a presigned S3 URL instead of a stdin Buffer`.
- **Spec:** `project-beta/.tl/tasks/UC-200/impl-brief.md:12-14`:
  > "1. Worker dequeues; UPDATE TranscriptionJob SET status='IN_PROGRESS' ...
  > 2. **Fetch Recording bytes from S3 via IStorage.getObjectStream(recording.storage_path).**
  > 3. extractAudio + probeContainer (TECH-009); populate Recording.duration_sec."
- **Reality:** Piping an unbuffered Readable stream into ffmpeg via stdin is non-seekable. MP4 demuxing needs to seek to the moov atom (usually at EOF); ffmpeg times out silently on stdin streams. Required path: download a presigned HTTPS URL with Range support.
- **Class:** SPEC WRONG. The spec documented the *method* (`getObjectStream`) but not the *constraint* (must be seekable for video).
- **Owning skill:** `nacl-sa-uc` (UC-200 impl-brief), backstopped by `nacl-tl-qa`.
- **Why missed:** No QA fixture for a real MP4. `nacl-tl-qa` was QA-skipped for UC-200 (no Deepgram key) — but the ffmpeg stall would have surfaced *before* ASR. The skip masked an earlier-stage failure.

---

## 4. Skill-by-skill diagnosis

### `nacl-sa-uc` — 2 cases (3.1, 3.4, partial 3.8)

- **Gap A: api-contract.md self-consistency.** The artifact mixes prose, tables, and Zod fragments. There is no automated check that string field names appearing in prose match field names in the Zod schema (case 3.1). The skill produces three independent text regions and trusts the author.
- **Gap B: cross-UC connectivity.** UC-001 spec is internally complete but does not declare reachability requirements toward UC-100. The skill specifies one UC at a time without a "this UC is entered from where?" pass (case 3.4).
- **Gap C: domain-level constraints on chosen tech.** UC-200 spec says "use stream"; doesn't tag the stream with seekability requirements that the chosen tool (ffmpeg + MP4) imposes (case 3.8).
- **Recommendation:** Add a post-generation lint that scans api-contract.md for string-literal field names and asserts they appear with the same casing in every section. Add a cross-UC navigation report (which UC is reachable from which page?) before approving a UC-FE task.

### `nacl-sa-architect` (TECH tasks) — 4 cases (3.2, 3.3, 3.5, 3.6) + 2 from §2 table (TECH-023 ×2)

- **Gap: external-protocol lore.** TECH task templates do not encode framework-specific traps:
  - Fastify 5 requires `addContentTypeParser` for non-standard content-types (3.2).
  - kie.ai endpoint shape is Anthropic-flavored, not OpenAI (3.3).
  - Factory-pattern Fastify apps need `index.js` (server bootstrap) as the entry, not `server.js` (factory) (3.5).
  - SSE protocol envelope requires `event:` line for named events (3.6).
  - CI must `prisma generate` before `tsc` (TECH-023 fixes).
  - pm2 reload caches stale ecosystem.config.cjs (TECH-023 fix).
- **Recommendation:** Maintain a per-tech-stack "gotchas registry" the skill consults when generating TECH tasks. Or — more pragmatic — require TECH tasks to include a "first-time integration checklist" pulled from a stack-specific knowledge base.

### `nacl-sa-ui` — 1 case (3.4 partial)

- **Gap: form spec doesn't include cross-UC affordances.** The form-fields table is authoritative for the page, but entry-points to other UCs are not represented as form fields.
- **Recommendation:** Extend the form-fields schema with a "nav-actions" section that lists outgoing UC links; or require `nacl-sa-ui` to validate that every UC declared as "user-triggered" has at least one inbound nav-action from another UC.

### `nacl-tl-plan` — 1 case (3.7)

- **Gap: no build-packaging sub-tasks for non-TS runtime assets.** Plan generates BE/FE pairs from UC specs and TECH tasks, but doesn't enumerate "if TECH-X delivers `*.md` / `*.json` / `*.png` to `src/`, add packaging step to dist/".
- **Recommendation:** Add a post-plan validator that scans each TECH/UC deliverable list for non-TS file paths and emits a packaging sub-task if any are referenced at runtime.

### `nacl-tl-sync` — 3 cases (3.1, 3.3, 8e92405 schema rename)

- **Gap: TS-type alignment ≠ wire-format alignment.** Skill verifies that BE and FE import the same shared types, but does not exercise the actual HTTP request to confirm field names on the wire, content-types, headers, or external-API request bodies. Three of the most expensive contract bugs (TUS metadata key, kie.ai shape, schema rename leaking into worker) passed sync verification.
- **Recommendation:** Extend sync to require either (a) a runnable contract test (real HTTP round-trip) or (b) a recorded fixture comparison for each endpoint, before issuing PASS.

### `nacl-tl-verify-code` — 1 case (77f4c73 StorageError.cause)

- **Gap: caught nothing in this set.** Static analysis surfaced TS4113 only after the web tsconfig actually compiled — i.e., the verify-code phase didn't run the web build.
- **Note:** This is a small symptom; the broader limit is that static analysis cannot catch runtime-only bugs (SSE event name, content-type rejection, pm2 entry-point). That is a *fundamental* ceiling, not a bug — but the report should be explicit that `nacl-tl-verify-code` PASS does not imply runtime correctness.

### `nacl-tl-qa` — 2 cases (3.3, 3.8) skipped, both blew in prod

- **Gap: SKIP-on-missing-keys is a silent prod-debt.** UC-200 and UC-300 were both QA-skipped because Deepgram and kie.ai keys were unavailable in test env. Both failed on the first real call in production. The SKIP outcome reads identically to a PASS in `.tl/status.json`.
- **Recommendation:** Treat SKIP as a release-blocker by default. Acceptable alternatives: (a) record provider responses once and replay during QA; (b) emit explicit `QA-DEBT` markers visible in release notes; (c) require manual prod-smoke immediately after deploy. Today the skip is invisible.

### `nacl-tl-stubs` — 1 case (3.7)

- **Gap: scans source for placeholders, not dist for missing assets.** The skill catches `TODO`/`FIXME`/mock-replaced-with-real, but doesn't ask "is every runtime-referenced file present in the output bundle?".
- **Recommendation:** Add a post-build pass: parse the built artifacts for `readFile` / `require` / `import.meta.glob` references and assert each path exists relative to `dist/`.

### `nacl-tl-review` — 1 case (3.4 partial)

- **Gap: reviews diff against spec; doesn't validate user journey.** The catalog code matched the form-fields spec exactly — there was no "missing" code from the reviewer's perspective.
- **Recommendation:** Extend review to take a "story map" (which UC reaches which UC) and flag pages whose declared outgoing edges have no DOM affordance.

---

## 5. Cross-cutting patterns

1. **No canonical machine-readable API contract.** `api-contract.md` is prose + Zod fragments + tables. Three regions, three places to disagree (§3.1). A single source of truth — either an OpenAPI document or a Zod-only file generating both server validators and client types — would have prevented the entire contract-mismatch bucket (5/15 = 33%).
2. **SA layer is graph-centric; external-system contracts are graph-blind.** Provider APIs (kie.ai, Deepgram, TUS, SSE, pm2, ffmpeg) live in prose deliverables of TECH tasks but never reach the validator. Four of eight failures (§3.2, 3.3, 3.6, 3.8 partial) are this category.
3. **Cross-UC connectivity is invisible to per-UC review.** UC-001 was perfect in isolation; the gap between it and UC-100 only surfaced when a user tried to use the app (§3.4).
4. **`nacl-tl-qa` SKIP is a release-blocker dressed as a PASS.** Both UC-200 and UC-300 went to prod without a single real provider call. This is the single highest-leverage failure mode to fix because the cost is one boolean per UC (acceptable / not acceptable to ship without QA).
5. **`nacl-tl-sync` covers <30% of real contract drift.** TS-type matching is necessary but not sufficient; wire format, header names, content-types, and external-API shapes are all opaque to it (§3.1, 3.3, 8e92405).

---

## 6. Recommended next steps

These are candidates for separate PRs — not commitments. Order by leverage:

1. **`nacl-tl-qa` SKIP policy.** One-day change: make SKIP a release-blocker absent an explicit `qa-debt.md` artifact carried into release notes. Highest leverage — would have prevented the two worst prod bugs (kie.ai, ffmpeg).
2. **`nacl-sa-uc` api-contract self-consistency lint.** Scan the artifact for string-literal field names and assert they appear with the same casing across prose, Zod, and table sections. Cheap, addresses §3.1.
3. **`nacl-tl-sync` wire-format check.** Add a "runnable contract test required before PASS" step for any UC with `actor != SYSTEM`. Addresses §3.1, 3.3, and the schema-rename leak.
4. **`nacl-sa-architect` framework-gotchas registry.** A stack-tagged YAML (Fastify 5 → required content-type parsers; SSE → required envelope; pm2 → entry-vs-factory) the skill cross-references when emitting TECH tasks.
5. **`nacl-tl-plan` non-TS asset packaging sub-tasks.** Scan TECH/UC deliverables for non-`.ts` paths, emit packaging sub-task automatically.
6. **`nacl-sa-ui` cross-UC nav validation.** Form-fields schema gains a `nav_actions` section; CI rejects a UC-FE task that doesn't enumerate inbound entry-points from related UCs.

After any of these land, re-run this post-mortem algorithm on the same project (or a fresh one built end-to-end through the updated skills) and check whether the same buckets reappear.

---

## Appendix: how this report was built

Algorithm (also saved in user memory as `feedback_skill_postmortem_algorithm.md`):

1. Three parallel `Explore` agents: (a) project shape & dev→fix boundary, (b) categorize fix commits into buckets with quoted examples, (c) drill into spec artifacts to classify each case as SPEC WRONG / SPEC MISSING / DEV DRIFTED.
2. Synthesize: every category maps to a skill that owned the gate.
3. Read the eight identified spec files directly to confirm verbatim quotes (no paraphrasing — agents paraphrase).
4. Write a single retrospective markdown to `NaCl/docs/retrospectives/`. No skill edits in this turn.

Repeatable on the next project the user hands over.

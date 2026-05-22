# External Contract — `<provider-or-protocol>`

> **What this file is.** A per-provider OR per-protocol contract written by
> `nacl-sa-architect` during the **External Contracts** phase (between Context
> Map and NFR). It pins down everything the codebase needs to know about an
> external surface that lives outside the TS type system and outside the graph.
>
> **Worked examples — canonical references.** This template was extracted from
> two recurring postmortem episodes:
>
> 1. **kie.ai** — a *provider* with an Anthropic-flavored response envelope,
>    deprecated sync `/generate` (replaced mid-build by async
>    `POST /api/v1/jobs/createTask` + `GET /api/v1/jobs/recordInfo`), and a
>    per-provider model namespace. See
>    `docs/retrospectives/project-beta-runtime-baseline.md` § A1–A3, A5, A7–A9.
> 2. **TUS (upload protocol)** — a *protocol* whose `Location` header must
>    return the public origin (`https://…`), which requires Fastify's
>    `respectForwardedHeaders` + Caddy's `X-Forwarded-Proto`, plus a
>    `addContentTypeParser` for `application/offset+octet-stream`. See
>    `docs/retrospectives/project-beta-runtime-baseline.md` § A6, B1–B4.
>
> **Naming.** One file per provider (e.g. `kie.md`, `deepgram.md`,
> `anthropic.md`) **and** one file per protocol (e.g. `tus.md`, `sse.md`,
> `multipart-presigned.md`, `reverse-proxy-url-scheme.md`,
> `ffmpeg-ffprobe-runtime.md`). Filenames use the slug-form `<name>.md`.
>
> **Consumer.** `nacl-tl-plan` (per W6 plan brief) reads this directory and
> emits `Status: BLOCKED` when generating a task that references a
> provider/protocol whose `.md` file is missing. Override requires a signed
> exception (W4 schema).

---

## 1. Identity

| Field | Value |
|---|---|
| **Name** | `<kie | tus | sse | ...>` |
| **Kind** | `provider` OR `protocol` |
| **Owner skill** | `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-sync` (wire-evidence gate, W2), `nacl-tl-dev-be`, `nacl-tl-dev-fe` |
| **Created** | `<YYYY-MM-DD>` |
| **Last updated** | `<YYYY-MM-DD>` |
| **References** | `<TECH-### / UC-### in graph>`, `<vendor doc URL>` |

---

## 2. Endpoint

> **Required.** Pin the URL down to the version path. **Do not** record
> "base host" alone if adapter code appends a version segment — record the
> form the adapter actually constructs.

| Field | Value |
|---|---|
| **Base URL** | `https://<host>/<version-path>` |
| **All endpoints** | List every endpoint the system calls. Method + path + purpose. |
| **Discovery** | `static-catalog` OR `http-list-endpoint` — if the latter, name it. |
| **Versioning** | Header? Path segment? Query param? Pinned to which version? |

Example (kie.ai):

```
Base URL:    https://kie-ai.redpandaai.co
All endpoints:
  POST /api/v1/jobs/createTask        — create async generation task
  GET  /api/v1/jobs/recordInfo        — poll task status
  POST /api/v1/messages               — Anthropic-shape LLM call (sync)
Discovery:   static-catalog
Versioning:  path segment /api/v1; pinned to v1 as of 2026-05-19
```

Example (TUS):

```
Base URL:    https://<public-origin>/tus     ← public origin, not the
                                                origin server (see § 7)
All endpoints:
  POST   /tus                  — create upload, returns Location: <upload-url>
  HEAD   /tus/<id>             — query offset
  PATCH  /tus/<id>             — append chunk; Content-Type:
                                  application/offset+octet-stream (must
                                  be registered with the BE framework's
                                  body parser; see § 7)
Discovery:   protocol spec — https://tus.io/protocols/resumable-upload
Versioning:  Tus-Resumable: 1.0.0 header
```

---

## 3. Auth

> **Required.** Name the header / scheme / token shape. Name **where** the
> secret is read from (env var, secrets manager). Name what happens when
> the secret is missing (the QA-decomposition trap from
> `project-beta-runtime-baseline.md` § F2–F3).

| Field | Value |
|---|---|
| **Scheme** | `Bearer` / `x-api-key` / `Basic` / `none` / `signature(v4)` / ... |
| **Secret env var** | `<KIE_API_KEY>` |
| **Missing-secret behavior** | `nacl-tl-qa` MUST split the pipeline so stages that do **not** need the secret still run (decomposition). See `nacl-tl-qa/SKILL.md` Stage Decomposition Gate. |
| **Rotation** | Frequency, rotation owner, rollback procedure. |

---

## 4. Request shape

> **Required.** Body, headers, query, and **literal** field names. The
> project-beta TUS episode (§ B1 in the runtime baseline) was caused by a
> three-way contradiction across prose, Zod, and table — record the
> canonical name here once.

| Field | Value |
|---|---|
| **Content-Type** | e.g. `application/json`, `application/offset+octet-stream`, `multipart/form-data` |
| **Required headers** | (list) |
| **Body shape** | Inline JSON example with **literal** field names. If the field name differs from the TS type field name, call out the mapping. |
| **Query params** | (list) |

Example (kie.ai Anthropic-shape):

```jsonc
POST /api/v1/messages
Content-Type: application/json
x-api-key: $KIE_API_KEY
anthropic-version: 2023-06-01

{
  "model": "claude-3-5-sonnet-20241022",  // model namespace: NO "google/" prefix.
                                          //   model IDs come from the provider's
                                          //   own catalog (§ 9). NOT "google/...",
                                          //   NOT "openai/...".
  "max_tokens": 4096,
  "messages": [{"role": "user", "content": "..."}]
}
```

---

## 5. Response shape

> **Required.** Status code, body envelope, header set. Where applicable,
> note the **difference from sibling providers** (kie.ai returns
> Anthropic-style `content: [{type, text}]` not OpenAI-style
> `choices[0].message.content`; § A1, A5).

| Field | Value |
|---|---|
| **Success status** | e.g. `200`, `201`, `202` |
| **Success body** | Inline JSON example with **literal** field names. |
| **Parsing path** | The exact accessor chain to extract the load-bearing value. |
| **Required response headers** | (list) — e.g. `Location` (TUS), `Tus-Resumable` (TUS), `Content-Range` |

Example (kie.ai Anthropic-shape):

```jsonc
// 200 OK
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "model": "claude-3-5-sonnet-20241022",
  "content": [
    { "type": "text", "text": "..." }   // ← extract via response.content[0].text
                                        //    NOT response.choices[0].message.content
  ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 12, "output_tokens": 34 }
}
```

---

## 6. Lifecycle: sync vs async (polling)

> **Required.** Explicitly mark the call site as **sync** or **async**.
> If async, specify the **polling lifecycle** in full. The kie.ai
> image_gen episode (§ A2) failed because the spec said sync, but the
> deployed endpoint required async with polling.

| Field | Value |
|---|---|
| **Mode** | `sync` OR `async` |
| **(If async) Submit endpoint** | The endpoint that returns a task/job id (state `queued`/`processing`). |
| **(If async) Poll endpoint** | The endpoint that returns terminal state (`succeeded`/`failed`) and the result body. |
| **(If async) Poll cadence** | Min/max interval; backoff strategy; max wait. |
| **(If async) Polling timeout** | After this, the call site MUST surface FAILED — not silently hang. |
| **Cancellation** | Is there an explicit cancel endpoint? If not, how is in-flight work abandoned safely? |

---

## 7. File-URL reachability assumptions

> **Required when** the contract returns or consumes a URL (TUS Location,
> presigned S3 URL, file-fetch URL handed to ffmpeg/ffprobe, etc.).
> The project-beta TUS `http://` vs `https://` reverse-proxy episode
> (§ B4) and the ffprobe `s3://` scheme rejection (§ B6) both live here.

| Field | Value |
|---|---|
| **Scheme expected by consumers** | `https://` ONLY for browser-facing URLs; `s3://` rejected by ffprobe; etc. |
| **Reverse-proxy translation** | If served behind Caddy / nginx / ALB, who sets `X-Forwarded-Proto`? Is `respectForwardedHeaders` enabled in the BE framework? |
| **Public origin vs origin server** | The `Location` returned to the browser MUST be the **public origin** (`https://app.example.com/...`), not the origin server (`http://api-internal:3000/...`). |
| **Lifetime** | TTL of the URL; what happens after expiry. |
| **Toolchain compatibility** | If the URL is passed to ffmpeg/ffprobe/curl/etc., name the tool and the schemes it accepts. (`ffprobe` does NOT accept `s3://` — § B6.) |

---

## 8. Failure codes

> **Required.** Enumerate the failure codes the consumer must handle,
> what each means, and what the consumer MUST do on each. The project-beta
> `404 model not found` (§ A1) and TUS `415 Unsupported Media Type` (§ A6)
> were both surface-level codes whose interpretations were not in the
> original spec.

| Code | Meaning | Consumer action |
|---|---|---|
| `<HTTP status>` | `<vendor's meaning>` | `<retry/escalate/halt>` |
| ... | ... | ... |

Required rows for any provider:

| Code | Meaning | Consumer action |
|---|---|---|
| `4xx auth` | bad/missing api key | halt, surface AUTH_FAILED |
| `4xx model/endpoint` | model namespace wrong (§ A3) | halt, surface MODEL_NOT_FOUND |
| `4xx envelope` | request body shape rejected | halt, surface CONTRACT_FAILED |
| `429` | rate limit | retry with backoff per § 8 cadence |
| `5xx transient` | provider transient | retry per cadence; budget cap |

---

## 9. Model namespace / catalog (provider-only)

> **Required when `Kind == provider`** and the provider exposes a model
> catalog. The Project-Alpha `nano-banana google/...` episode (§ A3) and the
> base_url-vs-discovery split (§ A8) both live here.

| Field | Value |
|---|---|
| **Catalog source** | `static-list-in-this-file` OR `http-list-endpoint` (named in § 2) |
| **Namespace prefix policy** | `<empty>` / `<vendor>/` / `<vendor>:` — be exact. |
| **Models in use** | List the model IDs the system passes verbatim. |

Example (kie.ai):

```
Catalog source:        HTTP list at GET /api/v1/models
Namespace prefix:      NONE — pass model id verbatim. NO "google/" prefix.
                       (The Project-Alpha image_gen episode regressed when the
                        nano-banana adapter prefixed "google/...".)
Models in use:
  claude-3-5-sonnet-20241022
  claude-3-opus-20240229
  nano-banana-v1
```

---

## 10. Fixture-test path

> **Required.** Repo-relative path to a runnable test that loads a
> recorded response fixture and parses it via the production code path
> (no mocking of the parse step). This file's existence is what
> `nacl-tl-sync`'s Wire-Evidence Gate (W2) looks for as
> `wire-evidence:fixture:<path>`.

| Field | Value |
|---|---|
| **Fixture file** | `tests/fixtures/<name>/<artifact>.json` (recorded captured response) |
| **Test file** | `tests/wire/<name>.fixture.test.ts` or equivalent |
| **What it asserts** | Parser extracts the load-bearing values from the recorded body without mocking the response shape. |
| **Run command** | `<the project's test runner>` — must exit 0 to satisfy the gate. |

If wire-evidence cannot be a recorded fixture (e.g. the provider's
output is per-call non-deterministic and a fixture would be artificial),
substitute one of the other two W2 shapes here and link it back:

- `wire-evidence:contract-test:<path>` — a runnable test against the
  provider's sandbox endpoint.
- `wire-evidence:live-smoke:<timestamp>` — a captured live call,
  committed to the repo or release-attached.

---

## 11. Smoke-test path

> **Required.** Repo-relative path to a runnable smoke test that hits
> the **real** provider/protocol surface in a sandbox or staging env.
> Distinct from the fixture test in § 10: the smoke test is allowed to
> require network access and may be skipped in unit-test CI, but it
> **must** be runnable on demand by `nacl-tl-qa` per the Stage
> Decomposition Gate (W3).

| Field | Value |
|---|---|
| **Smoke test file** | `tests/smoke/<name>.smoke.test.ts` or equivalent |
| **Env vars required** | `<KIE_API_KEY>`, `<KIE_BASE_URL>`, etc. |
| **Sandbox vs prod** | Which environment the smoke runs against. |
| **Run command** | `<the project's smoke-test command>` |
| **Stage decomposition** | Names the QA stages it exercises (e.g. `WIRE_CONTRACT_QA`, `PROVIDER_QA` — see `nacl-tl-qa/SKILL.md`). |

---

## Optional fields

The fields above are **required** for every contract file. The fields
below are **optional** — include only when the integration actually
uses the surface.

| Field | When to include |
|---|---|
| **Webhook callback shape** | The provider/protocol posts back to your system (e.g. async completion webhooks). Include the inbound endpoint, signature verification scheme, and idempotency strategy. |
| **Stream / SSE frame envelope** | The protocol uses streaming. **Include the literal `event: <type>` and `data: <json>` frame layout** — the project-beta `pushSseEvent` episode (§ B3) was caused by omitting the `event:` line, defaulting browser EventSource to `'message'`. |
| **Multi-tenant routing** | The provider expects a tenant/account header (e.g. `X-Account-Id`). Spell it out. |
| **Idempotency key header** | Provider supports/requires an idempotency key. |
| **Pagination shape** | Cursor / page-token / offset; list-endpoint envelope. |
| **Concurrency / per-key rate limits** | Hard caps, per-second/minute/day. |
| **Region pinning** | Provider has region-pinned endpoints; integration is pinned to one. |
| **Vendor SDK version pin** | If a vendor SDK is used, pin the version + capture incompatibilities. |
| **Framework-specific gotchas** | E.g. Fastify 5 requires `addContentTypeParser` for non-standard content-types (TUS PATCH — § B2); Caddy needs `respectForwardedHeaders` (§ B4). Cross-link the relevant stack from § H of `project-beta-runtime-baseline.md` if applicable. |

---

## Validation hint

The `nacl-tl-plan` consumer-side check (W6 plan brief) treats the
following as **valid** for the missing-contract gate to pass:

1. A file at `.tl/external-contracts/<name>.md` exists.
2. Sections 1–8 and 10–11 are filled (not stubs / not "TBD"). Section 9
   is filled iff `Kind == provider`. Section 7 is filled iff the contract
   handles file URLs (otherwise mark "N/A — no file URLs"). Section 6
   has `Mode: sync` filled even if no async lifecycle applies.
3. The referenced fixture/smoke paths in § 10 and § 11 either exist OR
   are accompanied by a signed exception under the W4 schema.

Anything else → `nacl-tl-plan` emits `Status: BLOCKED`, workflow detail
`external-contract-missing` (file absent) or `external-contract-stub`
(file present but required sections empty/TBD).

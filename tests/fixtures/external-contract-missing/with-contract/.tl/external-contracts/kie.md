# External Contract — `api.kie.example.invalid`

> Worked example (`kind: provider`) for the W6 External Contracts Gate.
> Cross-reference: `docs/retrospectives/project-beta-runtime-baseline.md`
> §§ A1, A3, A5 ("api.kie.example.invalid (LLM Anthropic-shape)" / "api.kie.example.invalid nano-banana
> model namespace" / "Anthropic Claude (via api.kie.example.invalid routing)").

---

## 1. Identity

| Field | Value |
|---|---|
| **Name** | api.kie.example.invalid |
| **Kind** | provider |
| **Owner skill** | `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-sync` (wire-evidence gate W2), `nacl-tl-dev-be`, `nacl-tl-qa` (stage decomposition) |
| **Created** | 2026-05-22 |
| **Last updated** | 2026-05-22 |
| **References** | UC-300 (REQUIRES_EXTERNAL → ext-kie); TECH-011 (LLM provider abstraction) |

---

## 2. Endpoint

| Field | Value |
|---|---|
| **Base URL** | `https://api.kie.example.invalid` |
| **All endpoints** | `POST /api/v1/messages` — Anthropic-shape LLM call (sync) |
| **Discovery** | `static-catalog` (this file) |
| **Versioning** | path segment `/api/v1`; pinned to v1 as of 2026-05-19 |

---

## 3. Auth

| Field | Value |
|---|---|
| **Scheme** | `x-api-key` |
| **Secret env var** | `KIE_API_KEY` |
| **Missing-secret behavior** | `nacl-tl-qa` decomposes pipeline; pre-provider stages (transcript prep) still run; provider stage marks `PROVIDER_QA NOT_RUN`. Never silent SKIP. |
| **Rotation** | quarterly; rotation owner = devops; rollback via prior key (kept in vault for 24h) |

---

## 4. Request shape

| Field | Value |
|---|---|
| **Content-Type** | `application/json` |
| **Required headers** | `x-api-key`, `anthropic-version: 2023-06-01` |
| **Body shape** | Anthropic-shape: `{ model, max_tokens, messages: [{role, content}] }` |
| **Query params** | (none) |

```jsonc
POST /api/v1/messages
Content-Type: application/json
x-api-key: $KIE_API_KEY
anthropic-version: 2023-06-01

{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 4096,
  "messages": [{"role": "user", "content": "..."}]
}
```

---

## 5. Response shape

| Field | Value |
|---|---|
| **Success status** | 200 |
| **Success body** | Anthropic envelope (see below) |
| **Parsing path** | `response.content[0].text` (NOT `response.choices[0].message.content`) |
| **Required response headers** | (none beyond standard `Content-Type: application/json`) |

```jsonc
// 200 OK
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "model": "claude-3-5-sonnet-20241022",
  "content": [{ "type": "text", "text": "..." }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 12, "output_tokens": 34 }
}
```

---

## 6. Lifecycle: sync vs async

| Field | Value |
|---|---|
| **Mode** | `sync` |
| **Cancellation** | The request is abandoned by client disconnect; no explicit cancel endpoint. |

---

## 7. File URL reachability assumptions

**N/A — no file URLs in or out of this contract.** Payload is JSON text; no
upload/download URLs are exchanged.

---

## 8. Failure codes

| Code | Meaning | Consumer action |
|---|---|---|
| `401` | bad/missing `x-api-key` | halt, surface `AUTH_FAILED` |
| `404` | model namespace wrong | halt, surface `MODEL_NOT_FOUND` |
| `400` | request body shape rejected | halt, surface `CONTRACT_FAILED` |
| `429` | rate limit | retry with backoff: 2s/4s/8s; max 3 retries |
| `5xx` | provider transient | retry; budget cap 5 retries; then surface `PROVIDER_DOWN` |

---

## 9. Model namespace / catalog

| Field | Value |
|---|---|
| **Catalog source** | `static-list-in-this-file` (validated against the provider's documented model list as of 2026-05-19) |
| **Namespace prefix policy** | `NONE` — pass the model id verbatim. NO `google/` prefix. (See the Project-Alpha nano-banana image_gen episode: a `google/`-prefixed id returned `400 model not found`.) |
| **Models in use** | `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229` |

---

## 10. Fixture-test path

| Field | Value |
|---|---|
| **Fixture file** | `tests/fixtures/kie-ai/protocol-response.json` (recorded Anthropic-shape response) |
| **Test file** | `tests/wire/kie-ai.fixture.test.ts` |
| **What it asserts** | The `KieAiProtocolProvider` parser extracts `content[0].text` from the recorded fixture and produces the literal expected protocol body. No mocking of the response shape. |
| **Run command** | `pnpm -F api test tests/wire/kie-ai.fixture.test.ts` |

---

## 11. Smoke-test path

| Field | Value |
|---|---|
| **Smoke test file** | `tests/smoke/kie-ai.smoke.test.ts` |
| **Env vars required** | `KIE_API_KEY` (sandbox tier), `KIE_BASE_URL` |
| **Sandbox vs prod** | sandbox |
| **Run command** | `pnpm -F api smoke:kie` |
| **Stage decomposition** | `PROVIDER_QA` (per `nacl-tl-qa` W3) |

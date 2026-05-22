---
name: nacl-sa-architect
description: |
  Decompose a NaCl system into modules, context-map dependencies, and NFRs in
  the SA graph. Use when the user asks to design architecture, define bounded
  contexts, add a module, create a system overview, or says `/nacl-sa-architect`.
---

# NaCl SA Architect For Codex

Perform graph-first architectural decomposition for the SA layer. User-facing SA
artifacts are Russian by default unless the user explicitly requests another
supported language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

Use `full` for an initial decomposition and `module` for adding one module to an
existing architecture.

1. Pre-flight: check available graph tooling, read `config.yaml` when available,
   inspect `Module` coverage, and verify whether BA nodes exist.
2. Import BA context: read `ProcessGroup`, `BusinessProcess`, automated
   `WorkflowStep`, `BusinessEntity`, `BusinessRole`, and `BusinessRule` data.
3. Business context: summarize goals, scope, success criteria, and assumptions
   in Russian; ask the user to confirm before continuing.
4. Module decomposition: propose `Module` nodes, UC ranges, ownership of domain
   entities, and `ProcessGroup` to `Module` handoff edges. Stop for explicit
   confirmation before graph writes.
5. Context map: propose inter-module `DEPENDS_ON` relationships with dependency
   type and rationale. Stop for explicit confirmation before graph writes.
6. **External Contracts** (between Context Map and NFR): enumerate every
   external provider and every wire-protocol the system depends on; create one
   `.tl/external-contracts/<slug>.md` artifact per provider AND per protocol;
   then create `ExternalContract` graph nodes and `DEPENDS_ON_EXTERNAL` /
   `REQUIRES_EXTERNAL` edges. Stop for explicit confirmation before writing
   any artifact or graph node. See **External Contracts Phase** below for the
   required field list and worked examples (kie.ai, TUS).
7. NFRs and constraints: propose `Requirement` nodes for NFRs, assumptions, and
   architecture decisions; connect them to modules when applicable. Stop for
   explicit confirmation before graph writes.
8. Verification: read back modules, dependencies, external contracts, NFRs, and
   BA handoff coverage. Report with the closed verification vocabulary.

When BA data is incomplete, state the gap, propose clearly marked assumptions,
and create assumption requirements only after user confirmation.

## External Contracts Phase

This phase sits between Context Map (step 5) and NFRs (step 7). It exists
because postmortems of two NaCl projects identified ~13 distinct sites where
the codebase compiled, TS types aligned, but the live wire to an external
provider or protocol failed. Examples include the kie.ai endpoint shape
(Anthropic envelope, async polling, model namespace without `google/`
prefix), the TUS upload protocol (`Location` header public-origin behind
Caddy, Fastify `addContentTypeParser` for `application/offset+octet-stream`,
canonical `mime_type` metadata key), the SSE frame envelope (`event:
<type>\ndata: <json>` lines), reverse-proxy URL scheme translation, and the
ffmpeg/ffprobe runtime URL-scheme acceptance set. See
`docs/retrospectives/project-beta-runtime-baseline.md` §§ A1–A9 and B1–B7
for the full catalog.

### Artifact

One Markdown file per provider AND one per protocol:

```
.tl/external-contracts/<slug>.md
```

Filenames are slug-form: `kie.md`, `deepgram.md`, `anthropic.md` (providers);
`tus.md`, `sse.md`, `multipart-presigned.md`, `reverse-proxy-url-scheme.md`,
`ffmpeg-ffprobe-runtime.md` (protocols). The canonical template lives at
`.tl/external-contracts/_template.md`.

### Required fields (per file)

1. **Identity.** Name; `kind: provider | protocol`; created / updated dates;
   references to TECH-### / UC-### in the graph.
2. **Endpoint.** Full URL **including** version-path (do not record "base
   host" alone if the adapter appends `/api/v1`); every called endpoint with
   method + path + purpose; discovery mechanism (`static-catalog` or
   `http-list-endpoint`); versioning strategy.
3. **Auth.** Scheme (`Bearer`, `x-api-key`, `none`, ...); secret env-var
   name; missing-secret behavior — what `nacl-tl-qa` does when the secret
   is absent (pre-provider stages still run; provider stage marks
   `NOT_RUN`; never silent SKIP).
4. **Request shape.** Content-Type; required headers; body with **literal**
   field names (not "matches the TS type" — write the literal strings; the
   project-beta TUS three-way collision `mime_type` vs `filetype` was a
   prose/Zod/table mismatch on a literal field name); query params.
5. **Response shape.** Success status; body with literal field names; the
   exact accessor chain to extract the load-bearing value (e.g. for
   kie.ai's Anthropic shape: `response.content[0].text`, not
   `response.choices[0].message.content`); required response headers
   (`Location`, `Tus-Resumable`, ...).
6. **Lifecycle: sync vs async.** Explicitly mark `sync` or `async`. If
   async: submit endpoint, poll endpoint, polling cadence (min/max
   interval, backoff), polling timeout (must surface FAILED, never silent
   hang), cancellation. (The kie.ai image_gen episode flipped sync to
   async mid-build.)
7. **File URL reachability.** When the contract returns or consumes a URL:
   expected scheme (`https://` for browser-facing; `s3://` rejected by
   ffprobe); who sets `X-Forwarded-Proto`; is `respectForwardedHeaders`
   enabled; public origin vs origin server (`Location` returned to browser
   must be the public origin); URL TTL; toolchain compatibility.
8. **Failure codes.** Enumerate the HTTP codes the consumer handles, what
   each means, and the required consumer action. Minimum rows: `4xx auth`,
   `4xx model/endpoint`, `4xx envelope`, `429 rate-limit`, `5xx transient`.
9. **Model namespace / catalog** (required when `kind == provider`).
   Catalog source (`static-list-in-this-file` or `http-list-endpoint`);
   namespace prefix policy (`NONE` / `<vendor>/` / `<vendor>:` — be exact;
   the Project-Alpha nano-banana episode regressed when the adapter prefixed
   `google/`); list of models used verbatim.
10. **Fixture-test path.** Repo-relative path to a runnable test that
    loads a recorded response fixture and parses it through the production
    code path without mocking the parse step. This file is what
    `nacl-tl-sync`'s Wire-Evidence Gate (W2) recognises as
    `wire-evidence:fixture:<path>`.
11. **Smoke-test path.** Repo-relative path to a runnable smoke test that
    hits the real provider/protocol surface in a sandbox or staging
    environment. May require network access and env vars; must be runnable
    on demand by `nacl-tl-qa` per the Stage Decomposition Gate.

### Optional fields

Include only when the integration uses the surface: webhook callback shape;
SSE/stream frame envelope; multi-tenant routing header; idempotency-key
header; pagination shape; concurrency/per-key rate limits; region pinning;
vendor SDK version pin; framework-specific gotchas (Fastify, Caddy,
ffmpeg). Full optional list in `.tl/external-contracts/_template.md`.

### Worked example 1 — kie.ai (provider)

```
File: .tl/external-contracts/kie.md
Kind: provider
Endpoint:
  Base URL:    https://kie-ai.redpandaai.co
  All endpoints:
    POST /api/v1/jobs/createTask     - async image generation
    GET  /api/v1/jobs/recordInfo     - poll task status
    POST /api/v1/messages            - Anthropic-shape LLM call (sync)
  Discovery:   static-catalog
  Versioning:  path segment /api/v1 (pinned 2026-05-19)

Auth:
  Scheme:      x-api-key
  Env var:     KIE_API_KEY
  Missing:     nacl-tl-qa decomposes pipeline; pre-provider stages run

Request (Anthropic-shape):
  Headers:     x-api-key, anthropic-version: 2023-06-01
  Body:        { model, max_tokens, messages: [{role, content}] }

Response (Anthropic-shape):
  Status:      200
  Body:        { id, type, role, model, content: [{type, text}] }
  Accessor:    response.content[0].text
               (NOT response.choices[0].message.content)

Lifecycle:
  LLM:         sync
  image_gen:   async: createTask -> recordInfo poll (2s/1.5x/cap 30s/5min)

File URL reachability: N/A (no file URLs in/out)

Failure codes:
  401 auth          -> AUTH_FAILED
  404 model         -> MODEL_NOT_FOUND
  400 envelope      -> CONTRACT_FAILED
  429 rate-limit    -> backoff 2/4/8s
  5xx transient     -> backoff, budget 5 retries

Model namespace:
  Catalog:           http-list at GET /api/v1/models
  Prefix policy:     NONE (verbatim model ids; NO "google/" prefix)
  Models:            claude-3-5-sonnet-20241022, nano-banana-v1

Fixture-test path:   tests/wire/kie-ai.fixture.test.ts
                     (loads tests/fixtures/kie-ai/protocol-response.json)
Smoke-test path:     tests/smoke/kie-ai.smoke.test.ts
                     (env: KIE_API_KEY; stage PROVIDER_QA)
```

### Worked example 2 — TUS upload (protocol)

```
File: .tl/external-contracts/tus.md
Kind: protocol
Endpoint:
  Base URL:    https://<public-origin>/tus  (public origin, not origin server)
  All endpoints:
    POST   /tus       -> 201 + Location: <upload-url-public-origin>
    HEAD   /tus/<id>  -> 200 + Upload-Offset
    PATCH  /tus/<id>  -> 204; Content-Type: application/offset+octet-stream
                         (MUST register via fastify.addContentTypeParser;
                          unregistered -> 415)
  Discovery:   protocol spec https://tus.io/protocols/resumable-upload
  Versioning:  Tus-Resumable: 1.0.0

Auth:
  Scheme:      Bearer (project JWT) on POST + PATCH
  Missing:     returns 401 before storage I/O

Request:
  Content-Type: application/offset+octet-stream (PATCH)
  Headers:
    Upload-Length          (POST)
    Upload-Metadata        (POST) - canonical key: mime_type (NOT filetype)
    Upload-Offset          (PATCH)
    Tus-Resumable: 1.0.0   (all)

Response:
  Status:     201 (POST), 204 (PATCH), 200 (HEAD)
  Headers:
    Location: <https-public-origin>     (POST)
    Tus-Resumable: 1.0.0                (all)
    Upload-Offset                       (PATCH, HEAD)

Lifecycle: sync (chunked PATCH within one resumable session)

File URL reachability:
  Scheme expected:   https:// (browser-facing)
  Proxy:             Caddy sets X-Forwarded-Proto; Fastify trustProxy: true;
                     TUS server consumes Forwarded headers when building
                     Location. Returning http://api-internal:... breaks
                     browser-side resume.
  Public vs origin:  Location MUST be public origin.

Failure codes:
  415 unsupported    -> addContentTypeParser missing
  412 precondition   -> Tus-Resumable mismatch
  409 conflict       -> Upload-Offset mismatch
  410 gone           -> session reaped; retry from POST
  413 too large      -> chunk above Upload-Length

Model namespace: N/A (protocol)

Fixture-test path:   tests/wire/tus.fixture.test.ts
Smoke-test path:     tests/smoke/tus-upload.smoke.test.ts
                     (env: PUBLIC_BASE_URL=https://...; stage WIRE_CONTRACT_QA)
```

### Graph writes

After user confirmation, persist each contract as an `ExternalContract` node
and connect it to the modules and use cases that depend on it:

```cypher
MERGE (ec:ExternalContract {id: $contract_id})
SET ec.name = $name, ec.kind = $kind, ec.file_path = $file_path,
    ec.status = 'draft', ec.created = datetime();

MATCH (m:Module {id: $module_id}), (ec:ExternalContract {id: $contract_id})
MERGE (m)-[:DEPENDS_ON_EXTERNAL]->(ec);

MATCH (uc:UseCase {id: $uc_id}), (ec:ExternalContract {id: $contract_id})
MERGE (uc)-[:REQUIRES_EXTERNAL]->(ec);
```

`$contract_id` follows `ext-<slug>` (e.g. `ext-kie`, `ext-tus`).

### Relationship to downstream skills

- `nacl-tl-plan` (W6 consumer-side): emits `Status: BLOCKED` workflow detail
  `external-contract-missing` when a task references a provider/protocol
  whose `.tl/external-contracts/<slug>.md` is absent. Override via signed
  exception only (W4 schema).
- `nacl-tl-sync` (W2 Wire-Evidence Gate): consumes field 10 (fixture-test
  path) as `wire-evidence:fixture:<path>` and field 11 (smoke-test path) as
  `wire-evidence:contract-test:<path>` / `wire-evidence:live-smoke:<ts>`.
  Without these, sync downgrades to `Status: UNVERIFIED workflow-detail
  wire-evidence-missing`.
- `nacl-tl-qa` (W3 Stage Decomposition Gate): consumes field 3
  (missing-secret behavior) and field 11 (stage decomposition tag) to keep
  pre-provider stages testable when a provider key is unavailable.

### Override

The only override is a signed exception under the W4 schema. There is no
inline `--skip-external-contract` flag and none will be introduced.

## Graph Contract

Pre-flight must check `graph-infra/schema/sa-schema.cypher` and the relevant
query files when readable. If graph tools are unavailable, stop before
persistence and return a graph-ready change plan with `Status: BLOCKED`.

Canonical writes are limited to `Module`, architectural `Requirement` records,
`ExternalContract` (with `kind: provider | protocol` and a `file_path`
pointing at the corresponding `.tl/external-contracts/<slug>.md`),
`ProcessGroup -[:SUGGESTS]-> Module`, `Module -[:DEPENDS_ON]-> Module`,
`Module -[:DEPENDS_ON_EXTERNAL]-> ExternalContract`,
`UseCase -[:REQUIRES_EXTERNAL]-> ExternalContract`, and ownership
relationships supported by the schema such as `CONTAINS_UC` and
`CONTAINS_ENTITY`. Do not introduce unsupported architecture labels or
relationships.

Before each write batch, show candidate module ids, names, UC ranges, bounded
context rationale, dependency direction, dependency type, NFR text, and BA
source evidence. After confirmed writes, read back with `sa_module_overview`,
handoff coverage queries, or equivalent graph reads and report observed counts.

## Capabilities

### May Do

- Read BA and SA graph data when graph tools are available.
- Propose modules, UC ranges, module ownership, dependencies, external
  contracts, NFRs, and assumptions.
- Write `Module`, `Requirement`, `ExternalContract`, `SUGGESTS`,
  `DEPENDS_ON`, `DEPENDS_ON_EXTERNAL`, `REQUIRES_EXTERNAL`, and related
  ownership edges after explicit confirmation.
- Write `.tl/external-contracts/<slug>.md` artifacts after explicit
  confirmation. One file per provider AND one per protocol.
- Preserve BA-to-SA traceability from process groups and automated workflow
  scope into SA architecture.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Write graph data without a user-facing confirmation gate.
- Invent BA facts that are absent from the user request and graph.
- Break BA, SA, and TL artifact boundaries.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- Schema checks require readable schema files or graph introspection.
- File reads require workspace access.
- Destructive graph changes require explicit user approval and should normally
  be avoided.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, source BA data, schema access, or
  confirmation is missing.
- Use `PARTIALLY_VERIFIED` when graph writes complete but only some read-back
  checks can run.
- Use `UNVERIFIED` when architecture coverage cannot be checked against graph
  state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-architect/SKILL.md`

### Preserved Methodology

- Full and single-module architecture workflows.
- Russian SA artifact language by default.
- Graph-first module, context-map, external-contracts, and NFR persistence.
- One `.tl/external-contracts/<slug>.md` file per provider AND per protocol,
  with all required fields filled (worked examples: kie.ai, TUS).
- BA-to-SA handoff from process groups and automation scope.
- Explicit phase gates before moving forward.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded assumptions that specific graph tools always exist.
- Slash-command-only invocation wording.
- Direct active runtime instructions from the source environment.

### Codex Replacement Behavior

- Treat graph and filesystem access as conditional.
- Ask before every graph write and every major phase transition.
- Report outcomes using only the closed verification vocabulary.
- Keep source references as comparison notes, not active runtime constraints.

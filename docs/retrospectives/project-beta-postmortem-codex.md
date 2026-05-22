# Project-Beta Postmortem For Codex Skills

**Project:** `/home/project-owner/projects/project-beta`  
**Report target:** `/home/project-owner/projects/NaCl/docs/retrospectives/project-beta-postmortem-codex.md`  
**Date:** 2026-05-21  
**Status:** PARTIALLY_VERIFIED  
**Scope:** analysis only. No NaCl skill files were modified.

## Executive Summary

Project-Beta was formally passed through the full NaCl chain: business analysis,
system analysis, TL planning, development, review, QA, delivery, and production
deployment. The failure was not that the agents ignored the process. The failure
was that the process accepted incomplete evidence as sufficient.

The core pattern is:

1. Specs and graph artifacts described business intent and internal shapes.
2. TL tasks generated code and tests that matched those artifacts.
3. Review and QA gates often reported PASS/approved while preserving important
   caveats such as `UNVERIFIED`, skipped provider E2E, simulated handler tests,
   no live DB, no real upload, and deferred production golden path.
4. Release/deploy treated health checks and unit/component tests as enough to
   ship.
5. The first real production usage hit missing UI affordances and wire/runtime
   mismatches that the gates had not required anyone to prove.

This is a methodology failure at the gate level. The largest gaps are in
`nacl-sa-ui`, `nacl-sa-architect`, `nacl-tl-sync`, `nacl-tl-review`,
`nacl-tl-qa`, and `nacl-tl-deliver/release/deploy`. The report recommends
changes to future skill behavior, but does not edit the skills.

## Evidence Base

### Local Repository State Checked

- `git -C /home/project-owner/projects/project-beta status --short --branch`
  showed uncommitted changes in `.mcp.json` and `CLAUDE.md`; analysis stayed
  read-only for that repo.
- `git -C /home/project-owner/projects/project-beta log --oneline --decorate --graph --all -n 120`
  showed the full build and stabilization sequence.
- PR data was inspected through the GitHub connector for:
  - PR #1: <https://github.com/ITSalt/project-beta/pull/1>
  - PR #2: <https://github.com/ITSalt/project-beta/pull/2>
  - PR #3: <https://github.com/ITSalt/project-beta/pull/3>
  - PR #4: <https://github.com/ITSalt/project-beta/pull/4>
- `.tl/` evidence inspected:
  - `.tl/master-plan.md`
  - `.tl/status.json`
  - `.tl/conductor-state.json`
  - `.tl/changelog.md`
  - `.tl/tasks/*`
- Graph artifacts inspected:
  - `config.yaml`
  - `graph-infra/docker-compose.yml`
  - `graph-infra/exports/project-beta-graph-export.cypher`
  - `graph-infra/seeds/*`
  - `graph-infra/queries/*`

### Existing Related Report

There is an existing report at:

- `/home/project-owner/projects/NaCl/docs/retrospectives/project-beta-postmortem.md`

This Codex report is separate and does not overwrite it. The existing report is
useful corroborating context, but this file restates the Codex-specific analysis
and graph-check status explicitly.

## Timeline

### Initial Build And Delivery

The initial project build was compressed into a single day, 2026-05-18.
The git history shows:

- `290fdf0` - bootstrap repo with BA/SA specs and planning artifacts.
- `45a6652` through `3286bb9` - TECH foundations and UC implementation.
- `f7a9467`, `176f2eb`, `5258a11` - post-intake cleanup, status sync, CI fixes.
- `474e1de`, `aeeae53`, `27da444`, `4da4aca` - production deployment path.

The formal delivery marker was:

- `4da4aca` - `deliver(.tl): production live on project-beta.example.invalid, TECH-024 result`

At that point `.tl/changelog.md` recorded production live status:

- HTTPS and `/api/health` were reachable.
- SPA was real, not placeholder.
- PM2 apps were online.
- `TECH-016..023` were approved.
- Full UC golden-path upload smoke test was deferred.

### Stabilization After Delivery

After `4da4aca`, these follow-up commits landed:

| SHA | Date | Type | Message |
|---|---:|---|---|
| `0ec0a4e` | 2026-05-18 | L1 UI | `fix: add upload button to catalog page header (#2)` |
| `29c175a` | 2026-05-18 | L2 contract | `fix: TUS upload metadata key - filetype instead of mime_type (UC-100) (#3)` |
| `15c6a20` | 2026-05-19 | runtime/proxy | `fix: TUS Location header uses https behind Caddy reverse proxy` |
| `5398e7c` | 2026-05-19 | L1 runtime | `fix: register content-type parser for TUS PATCH (prevented 415) (#4)` |
| `ed6aaa9` | 2026-05-19 | feature rewrite | `feat(UC-100): replace TUS with direct S3 presigned multipart upload` |
| `5d9585d` | 2026-05-19 | runtime | `fix(UC-100): unblock CI and fix ffprobe s3:// scheme for upload finalize` |
| `5eb7e18` | 2026-05-19 | runtime | `fix(UC-200): feed ffmpeg a presigned S3 URL instead of a stdin Buffer` |
| `66049d5` | 2026-05-19 | packaging | `fix(UC-300): copy llm/prompts/*.md into worker dist on build` |
| `1f025b7` | 2026-05-19 | external API | `fix(UC-300): switch kie.ai client to Anthropic /claude/v1/messages` |
| `ad7b8b4` | 2026-05-19 | UX | `feat(UC-100/UC-200): optional speaker count + sticky back-link on subpages` |
| `7f983f6` | 2026-05-19 | wire protocol | `fix(TECH-012): emit SSE event:<type> so client listeners actually fire` |
| `1b195b9` | 2026-05-19 | requirements change | `feat(UC-100): accept WEBM uploads, raise size limit to 1 GiB` |
| `40341a6` | 2026-05-19 | prompt quality | `feat(UC-300): rewrite RU protocol prompt with structured XML role/constraints` |

Not all post-delivery commits are process failures. The strongest process
signals are the missing upload button, TUS metadata mismatch, TUS PATCH 415,
reverse proxy upload issue, ffmpeg non-seekable input, missing prompt packaging,
wrong kie.ai wire shape, and SSE event envelope.

## Graph Verification

### GRAPH_LIVE_CHECK: BLOCKED

Live graph access could not be completed in this session.

Observed facts:

- `config.yaml` declares:
  - HTTP port: `3574`
  - Bolt port: `3587`
  - password: `neo4j_graph_dev`
  - container prefix: `project-beta`
- `graph-infra/docker-compose.yml` maps:
  - `${NEO4J_HTTP_PORT}:7474`
  - `${NEO4J_BOLT_PORT}:7687`
- `nc -z 127.0.0.1 3574` returned failure.
- `nc -z 127.0.0.1 3587` returned failure.
- `curl --max-time 3 http://127.0.0.1:3574/` failed to connect.
- `command -v cypher-shell` returned not found.
- `docker ps --format ...` failed with permission denied on the Docker socket:
  `unix:///home/project-owner/.docker/run/docker.sock`.

Conclusion: live graph validation is BLOCKED by unavailable ports and missing
local graph tooling/permissions.

### GRAPH_EXPORT_CHECK: PARTIALLY_VERIFIED

The graph export exists:

- `/home/project-owner/projects/project-beta/graph-infra/exports/project-beta-graph-export.cypher`
- Size observed: `248K`
- Lines observed: `464`

The export includes constraints for BA/SA/TL nodes:

- `BusinessEntity`
- `BusinessProcess`
- `WorkflowStep`
- `DomainEntity`
- `Form`
- `Screen`
- `UIComponent`
- `UseCase`
- `ApiContract`
- `Task`
- `Wave`

Export evidence relevant to this postmortem:

1. `UC-100` exists as `Upload meeting video`, with `has_ui:true` and
   `FORM-MeetingUpload`.
2. `FORM-MeetingUpload` has expected fields:
   - `header`
   - `file`
   - `language`
   - `title`
   - `submit_button`
   - `cancel_button`
3. `FORM-MeetingCatalog` has only the catalog row action `open_button`; it does
   not contain an `upload_button` action in the exported graph.
4. BA workflow `BP-001-S01` says the user navigates to the upload section, but
   the graph does not encode the concrete inbound navigation affordance from
   catalog or shell to upload.
5. `UC-100` links to requirements `RQ-008..RQ-013` and NFRs, but wire-level TUS
   details such as `Upload-Metadata` key names, `application/offset+octet-stream`,
   Caddy forwarded scheme behavior, and presigned upload flow are not visible as
   graph-validated properties.
6. `UC-200` and `UC-300` exist as system use cases, but graph/export inspection
   alone does not prove their provider/runtime E2E was executed.

### Planned Live Cypher Checks

Run these when the graph container is available.

```cypher
// 1. UI use cases and forms
MATCH (uc:UseCase)
OPTIONAL MATCH (uc)-[:USES_FORM|HAS_FORM|RENDERS_FORM]->(f:Form)
RETURN uc.id, uc.name, uc.has_ui, collect(f.id) AS forms
ORDER BY uc.id;
```

```cypher
// 2. Form actions for upload and catalog
MATCH (f:Form)-[:HAS_FIELD]->(field)
WHERE f.id IN ['FORM-MeetingCatalog', 'FORM-MeetingUpload']
RETURN f.id AS form, field.name AS name, field.field_category AS category,
       field.label AS label, field.order AS order
ORDER BY form, order;
```

```cypher
// 3. User-triggered UC with no inbound concrete UI action
MATCH (uc:UseCase)
WHERE uc.actor <> 'SYSTEM' AND coalesce(uc.has_ui, false) = true
OPTIONAL MATCH (f:Form)-[:HAS_FIELD]->(field)
WHERE field.field_category = 'action'
RETURN uc.id, uc.name, collect({form: f.id, action: field.name, label: field.label}) AS known_actions
ORDER BY uc.id;
```

```cypher
// 4. TL task status and QA evidence
MATCH (task:Task)
RETURN task.id, task.status, task.phase_be, task.phase_fe, task.phase_sync,
       task.phase_review_be, task.phase_review_fe, task.phase_qa
ORDER BY task.id;
```

```cypher
// 5. Tasks depending on skipped or unverified upstream tasks
MATCH (task:Task)-[:DEPENDS_ON]->(dep:Task)
WHERE dep.status IN ['verified-pending', 'qa_skip', 'skip', 'unverified']
   OR dep.phase_qa IN ['skip', 'unverified']
RETURN task.id AS task, dep.id AS dependency, dep.status AS dep_status,
       dep.phase_qa AS dep_phase_qa
ORDER BY dependency, task;
```

```cypher
// 6. Wire contracts present in TL layer
MATCH (contract:ApiContract)
OPTIONAL MATCH (contract)-[:DEFINED_FOR]->(uc:UseCase)
RETURN contract.id, contract.name, uc.id AS uc,
       keys(contract) AS contract_properties
ORDER BY contract.id;
```

```cypher
// 7. Protocol-specific risk scan
MATCH (n)
WHERE any(k IN keys(n) WHERE toString(n[k]) =~ '(?i).*tus|sse|kie|deepgram|ffmpeg|Upload-Metadata|content-type.*')
RETURN labels(n) AS labels, n.id AS id, n.name AS name, keys(n) AS keys
LIMIT 100;
```

Expected useful outcomes:

- Confirm whether the live graph mirrors export drift around `FORM-MeetingCatalog`.
- Confirm whether TL task statuses carry enough evidence to distinguish
  approved, unverified, skipped, and truly QA-passed work.
- Confirm whether `ApiContract` nodes contain only high-level contracts or
  actual wire protocol details.

## Failure Taxonomy

### 1. UI Entrypoint Missing

**Symptom:** The upload route existed, but the catalog page had no upload button.

Evidence:

- Fix: `0ec0a4e`, PR #2.
- `.tl/changelog.md` records root cause: `CatalogPage` did not contain
  `<Link to="/upload">`; i18n key already existed.
- Graph export shows `FORM-MeetingUpload`, but catalog form action list contains
  `open_button`, not `upload_button`.

Classification:

- Primary: `SPEC MISSING`
- Secondary: `GATE FAILURE`

Stage attribution:

- `nacl-ba-workflow` captured "User navigates to upload section", but not the
  concrete application entrypoint.
- `nacl-sa-ui` produced the upload form, but did not enforce inbound navigation
  from catalog or shell.
- `nacl-tl-review` reviewed page behavior against the page-local spec, not the
  cross-UC story map.
- `nacl-tl-qa` checked `/upload` directly, not "user starts from the first
  screen and reaches upload".

Corrective action:

- Future UI specs need a primary-action map: every user-triggered UC must have
  at least one inbound visible action from an already reachable screen.
- QA for user UCs must begin at a natural entrypoint, not at the route under
  test.

### 2. TUS Metadata Key Mismatch

**Symptom:** Upload failed with 415 because frontend sent `mime_type`/enum-style
data while backend expected TUS `filetype` with actual MIME string.

Evidence:

- Fix: `29c175a`, PR #3.
- `.tl/changelog.md` records this as L2: `api-contract.md` documented
  `mime_type`, backend read `filetype`.
- `.tl/tasks/UC-100/api-contract.md` after correction documents `filetype`.
- UC-100 QA before production reported PASS, but did not execute real TUS upload
  against the server.

Classification:

- Primary: `SPEC WRONG`
- Secondary: `SYNC GAP`

Stage attribution:

- `nacl-sa-uc` generated an API contract that mixed client validation type shape
  and TUS wire metadata semantics.
- `nacl-tl-sync` passed on shared type alignment, but did not verify actual
  TUS header names and encoded values.
- `nacl-tl-qa` relied on unit tests and mocked `tus-js-client` rather than a
  real upload.

Corrective action:

- Contract artifacts must distinguish JSON DTO fields from non-JSON wire keys.
- Sync gate must verify headers, content types, event names, encoded metadata,
  and actual request fixtures for non-JSON protocols.

### 3. Fastify TUS PATCH Content-Type Rejection

**Symptom:** TUS PATCH requests used `application/offset+octet-stream`; Fastify 5
rejected them because no parser was registered.

Evidence:

- Fix: `5398e7c`, PR #4.
- `.tl/changelog.md` records root cause: Fastify 5 returns 415 for any
  Content-Type without a registered parser.
- TECH-008 initial spec said to mount `@tus/server`, but did not mention
  Fastify content-type parser behavior.

Classification:

- Primary: `SPEC MISSING`
- Secondary: `FRAMEWORK GOTCHA`

Stage attribution:

- `nacl-sa-architect` generated a TECH task for TUS integration that lacked
  framework-specific acceptance conditions.
- `nacl-tl-review` did not require an integration test crossing Fastify request
  parsing into TUS handler.
- `nacl-tl-qa` did not execute the real upload path.

Corrective action:

- Stack-specific TECH tasks need protocol gotcha sections. For Fastify 5 and
  non-standard content types, registering parsers must be part of the checklist.

### 4. Reverse Proxy Scheme Handling

**Symptom:** TUS Location header used wrong scheme behind Caddy reverse proxy.

Evidence:

- Fix: `15c6a20`.
- The deployment plan and Caddy block discussed upload routes and proxying, but
  initial upload handling did not fully validate public browser-facing URL
  behavior behind TLS termination.

Classification:

- Primary: `RUNTIME/PROD ONLY`
- Secondary: `SPEC MISSING`

Stage attribution:

- `nacl-sa-architect` deploy planning covered topology but did not translate
  reverse-proxy behavior into endpoint acceptance tests.
- `nacl-tl-deploy` validated health and SPA, not upload session creation from
  the public origin.

Corrective action:

- Public-origin smoke tests must cover any endpoint that returns absolute URLs,
  redirects, presigned URLs, callback URLs, or Location headers.

### 5. ffmpeg Input Was Non-Seekable

**Symptom:** Worker stalled or failed when feeding ffmpeg from S3 stream/stdin;
MP4 needs seekable input.

Evidence:

- Fix: `5eb7e18`.
- UC-200 QA report says E2E was skipped because real Deepgram key was absent.
- The "what would be tested" list includes ffmpeg extraction, but it was not
  run.
- The failure occurs before Deepgram, so missing API key should not have blocked
  testing this part of the pipeline.

Classification:

- Primary: `SPEC WRONG`
- Secondary: `QA SKIP HID EARLIER FAILURE`

Stage attribution:

- `nacl-sa-uc` and worker impl brief assumed object stream input was acceptable.
- `nacl-tl-qa` skipped the full worker UC instead of decomposing it into
  available runtime checks: storage fetch, ffmpeg extraction, queue transition,
  provider call.
- `nacl-tl-review` accepted mocked worker tests as enough.

Corrective action:

- QA for provider-gated pipelines must split the pipeline into pre-provider and
  provider stages. Missing Deepgram should block only provider call validation,
  not ffmpeg/storage/queue validation.

### 6. Prompt Templates Missing From Worker Dist

**Symptom:** Prompt markdown files existed under `worker/src/llm/prompts`, but
were not copied into `worker/dist` by TypeScript build.

Evidence:

- Fix: `66049d5`.
- TECH-011 review had already noted result/documentation drift, but packaging
  of prompt assets was not a gate.
- Unit tests ran from source context and did not prove built worker artifact
  could read the prompts.

Classification:

- Primary: `SPEC MISSING`
- Secondary: `BUILD ARTIFACT GAP`

Stage attribution:

- `nacl-tl-plan` did not create a packaging task for non-TS runtime assets.
- `nacl-tl-review` and `nacl-tl-verify-code` did not inspect built artifact
  runtime file availability.
- `nacl-tl-stubs` scans placeholders, not missing runtime assets.

Corrective action:

- Any non-code runtime artifact referenced by production code must have a
  build-output existence check.

### 7. kie.ai Wire Shape Wrong

**Symptom:** Worker used an incompatible kie.ai request/response shape and had
to switch to Anthropic `/claude/v1/messages`.

Evidence:

- Fix: `1f025b7`.
- TECH-011 review documented a clean internal abstraction and tests, but also
  highlighted drift in result docs and no real provider E2E.
- UC-300 QA was skipped because real `KIE_API_KEY` was unavailable.

Classification:

- Primary: `SPEC MISSING`
- Secondary: `EXTERNAL API CONTRACT UNVERIFIED`

Stage attribution:

- `nacl-sa-architect` specified `ILlmProvider`, not the external provider wire
  contract.
- `nacl-tl-sync` does not validate third-party request fixtures.
- `nacl-tl-qa` skipped provider E2E without creating a release blocker.

Corrective action:

- External-provider TECH tasks need a recorded request/response fixture or live
  smoke, even if the rest of the pipeline uses mocks.

### 8. SSE Event Envelope Missing

**Symptom:** API emitted SSE data, but client listeners did not fire because
frames lacked `event:<type>`.

Evidence:

- Fix: `7f983f6`.
- TECH-012 review explicitly says:
  - "SSE connection receives status event from worker" was PARTIAL.
  - two tests simulated handler behavior instead of invoking the actual route.
  - no real publisher -> subscriber -> raw write integration test was built.
- Despite this, TECH-012 review judgment was approved.

Classification:

- Primary: `SPEC MISSING`
- Secondary: `REVIEW GATE FAILURE`

Stage attribution:

- `nacl-sa-architect` specified payload shape but not SSE frame semantics.
- `nacl-tl-review` identified a major test weakness but allowed downstream
  progression.
- `nacl-tl-sync` did not verify browser EventSource event names.

Corrective action:

- For SSE, contract must include frame envelope:
  - `event: meeting.status`
  - `data: {...}`
  - blank line terminator
- Review must block when happy-path tests manually write to mocks instead of
  invoking production handlers.

## Gate Failure Analysis

### `.tl/status.json` Was Too Optimistic

`.tl/status.json` summary showed:

- `approved`: 32
- `qa_pass`: 7
- `qa_skip`: 2
- `blocked`: 0

But the project still had deferred or missing evidence:

- UC-100 marked QA pass though real TUS upload was not run.
- UC-200 marked QA skip because Deepgram key was absent.
- UC-300 marked QA skip because KIE key was absent.
- TECH-012 had review-approved status despite missing real SSE integration.
- Release/deploy was accepted with full upload pipeline not run.

The status model allowed humans and agents to see "terminal" progress while
critical runtime evidence was missing.

### `APPROVED -- UNVERIFIED` Became A Release Path

Several artifacts carry variants of:

- `REVIEW APPLIED -- UNVERIFIED`
- `100% test author overlap`
- `operator override applied`
- `no live DB`
- `actionlint not available`
- `provider E2E skipped`

Those phrases were recorded, but downstream gates treated them as non-blocking.
This preserved honesty in text while losing it in orchestration.

The methodological issue is not the existence of overrides. The issue is that
the status graph and release gate did not preserve those overrides as blocking
or at least release-visible risk.

### QA Did Not Mean End-To-End

UC-100 QA:

- opened `/upload`;
- checked form fields;
- checked language select;
- checked disabled upload button;
- checked i18n labels;
- relied on unit tests for file and upload behavior;
- explicitly noted real TUS upload requires a running TUS server and real video.

That is a useful component QA result, but not enough for `QA PASS` on a file
upload UC.

UC-200/UC-300 QA:

- skipped provider E2E;
- did not split pre-provider validation from provider validation;
- did not block release.

### Deploy Health Was Confused With Product Health

TECH-024 confirmed:

- DNS,
- HTTPS,
- `/api/health`,
- SPA served,
- neighbors unaffected,
- resource snapshot.

It also explicitly said the full UC upload pipeline was not run. That means
deploy health was verified, but product readiness was not.

For first release of a new MVP, this should have been:

- `DEPLOY_HEALTH: VERIFIED`
- `CORE_GOLDEN_PATH: NOT_RUN`
- `RELEASE_STATUS: PARTIALLY_VERIFIED` or `BLOCKED`, depending on policy

Instead, the project narrative was "production live", and the real defects were
found after release.

## Stage Attribution

### BA / BA Workflow

What worked:

- Business processes identified the major flow: upload, transcription,
  protocol generation, review/edit, export.
- BP-001 included "User navigates to the upload section".

What failed:

- BA workflow did not require a concrete product entrypoint from the first
  screen.
- "Navigate to upload section" stayed as intent, not a checkable UI affordance.

Fix direction:

- BA handoff should include user journey start points and mandatory first-screen
  actions for primary flows.

### SA UI

What worked:

- `FORM-MeetingUpload` exists in graph/export and contains the upload fields.
- UC-100 is represented as a UI use case.

What failed:

- No graph-enforced inbound navigation from catalog/shell to upload.
- Catalog form had `open_button` but no `upload_button`.

Fix direction:

- Every actor-triggered UC must have one or more inbound navigation actions.
- Graph validation should flag user UCs that are routable but not reachable.

### SA Architect / TECH Planning

What worked:

- Major infrastructure was decomposed into TECH tasks.
- Stack choices were coherent enough to build and deploy.

What failed:

- TECH tasks missed wire/runtime traps:
  - Fastify content-type parser for TUS PATCH;
  - SSE frame envelope;
  - reverse proxy public scheme handling;
  - pm2 factory-vs-entry script;
  - Prisma generate in deploy;
  - external provider wire shape;
  - ffmpeg seekability.

Fix direction:

- TECH generation needs stack-specific gotcha checklists and external-provider
  contract fixtures.

### TL Plan

What worked:

- Produced waves, dependencies, UC/TECH tasks, and `.tl` artifacts.

What failed:

- Did not generate build packaging checks for prompt markdown assets.
- Did not transform skipped/partial gates into downstream blockers.

Fix direction:

- Add non-code asset packaging tasks.
- Carry evidence requirements in dependency graph, not only task status.

### TL Sync

What worked:

- Caught or recorded some BE/FE contract mismatches later.
- Established a place for sync evidence.

What failed:

- Treated shared types as stronger evidence than actual wire behavior.
- Did not validate headers, content-types, encoded metadata, SSE event frames,
  or third-party provider request/response shape.

Fix direction:

- Sync PASS should require at least one fixture or runtime contract test for
  each non-JSON or external boundary.

### TL Review

What worked:

- Review artifacts often noticed real weaknesses.
- TECH-012 review correctly identified simulated tests as a major problem.

What failed:

- Major test weaknesses and `UNVERIFIED` evidence were downgraded to
  non-blocking.
- "100% author/test overlap" became informational.
- Approved status did not preserve the risk strongly enough for release gates.

Fix direction:

- `APPROVED -- UNVERIFIED` should not be a phase-complete state.
- Major missing acceptance evidence should block downstream status, even if
  implementation code looks structurally correct.

### TL QA

What worked:

- Produced useful component and unit evidence.

What failed:

- QA PASS was granted without real user workflow for UC-100.
- Provider-gated UC QA was skipped without blocking release.
- Missing provider key blocked too much: it prevented testing pre-provider
  pipeline segments that did not require Deepgram/kie.ai.

Fix direction:

- Split QA status:
  - `COMPONENT_QA`
  - `LOCAL_RUNTIME_QA`
  - `PROVIDER_QA`
  - `PROD_GOLDEN_PATH`
- Release gate should consume the weakest required dimension, not the happiest.

### TL Deliver / Release / Deploy

What worked:

- Deployment shell was checked.
- Health endpoint and SPA were verified.
- Neighbor services were checked.

What failed:

- Core product golden path was deferred but release still read as successful.
- Release notes did not force a blocking decision for skipped UC-200/UC-300 and
  not-run UC-100 real upload.

Fix direction:

- First production release requires at least one real end-to-end flow for the
  product's primary value proposition.
- Health-only delivery should be labelled infrastructure-only readiness.

## Root Cause

The root cause is an evidence model mismatch.

The NaCl workflow had separate gates for plan, implementation, review, sync,
QA, delivery, and release. In the artifacts, many gates honestly recorded
partial or missing evidence. But the status model and downstream orchestration
flattened that into approved/pass/delivered.

The resulting system was honest in prose and optimistic in control flow.

That is why primitive issues and complex runtime issues survived together:

- Primitive missing button survived because cross-UC reachability was not a
  gate.
- Complex wire/runtime issues survived because non-JSON protocols and provider
  APIs were not contract-tested.
- Production failures survived because deploy health was treated as product
  readiness.

## What Was Done Correctly

- The project left a strong audit trail in git, PRs, `.tl` files, and graph
  exports.
- Post-release fixes recorded root causes clearly in `.tl/changelog.md`.
- Several reviews correctly noticed partial verification and test weaknesses.
- The graph modeled major BA/SA/TL concepts: UCs, forms, requirements, tasks,
  waves, and dependencies.
- Deployment infrastructure eventually reached a usable health state.

## What Was Done Incorrectly

- `QA PASS` was used for UC-100 without a real upload through browser, API,
  storage, and finalize path.
- `SKIP` for UC-200/UC-300 did not remain a release blocker.
- `APPROVED -- UNVERIFIED` did not block downstream phase completion.
- Sync did not verify actual wire format.
- External provider integration was mocked but not fixture-verified or live
  smoke-tested.
- Production readiness was inferred from `/api/health` and SPA reachability.
- Graph artifacts encoded forms and UCs, but not navigation reachability and
  wire protocol obligations.

## What Was Not Done At All

- Live graph verification was not completed in this session because graph ports,
  `cypher-shell`, and Docker API access were unavailable.
- Real UC-100 upload E2E was not performed before the initial release.
- UC-200 pre-provider runtime E2E was not separated from Deepgram E2E.
- UC-300 provider request/response was not validated against kie.ai before
  production.
- SSE browser listener behavior was not verified with production frame output.
- Prompt file presence in `worker/dist` was not checked after build.
- Release gate did not require a product-level golden path.

## Recommendations

These are recommendations for future work, not changes made in this report.

1. Add graph validation for UI reachability:
   - every actor-triggered UC with `has_ui=true` must have an inbound concrete
     action from a reachable form/screen or global nav.
2. Add wire contract classification:
   - JSON DTO,
   - TUS,
   - SSE,
   - multipart/presigned upload,
   - reverse-proxy-sensitive URL generation,
   - external provider.
3. Make `UNVERIFIED` non-terminal for release:
   - `APPROVED -- UNVERIFIED` can mean "code review found no structural issue",
     but must not mean phase complete.
4. Make `QA SKIP` release-visible and blocking by default:
   - allow override only with explicit `qa-debt` record and user acceptance.
5. Split provider-gated QA into stages:
   - pre-provider local runtime;
   - provider contract fixture;
   - live provider smoke.
6. Add build artifact checks for non-code runtime files.
7. Require public-origin smoke tests for endpoints that emit URLs, redirects,
   Location headers, presigned URLs, or browser-consumed event streams.
8. In release reports, separate:
   - infrastructure health,
   - application shell health,
   - primary product golden path,
   - external provider health.

## Acceptance Criteria For Future Verification

A future rerun of this postmortem should be considered improved only if:

- Graph live check can be executed and produces explicit pass/fail results.
- UC-100 cannot reach QA PASS without a real browser-to-server upload.
- UC-200 cannot be fully skipped just because Deepgram is missing; ffmpeg and
  queue stages must still be checked.
- UC-300 cannot be approved without a provider fixture or live request shape
  check.
- SSE tests verify browser-visible named events.
- Release status cannot be `VERIFIED` if the primary golden path is not run.

## Appendix A: Commands Used Or Planned

Commands already run during investigation:

```sh
git -C /home/project-owner/projects/project-beta status --short --branch
git -C /home/project-owner/projects/project-beta log --oneline --decorate --graph --all --date=short -n 120
git -C /home/project-owner/projects/project-beta remote -v
git -C /home/project-owner/projects/project-beta branch -a --verbose --no-abbrev
find /home/project-owner/projects/project-beta -maxdepth 3 -type f
rg -n "Status:|UNVERIFIED|BLOCKED|SKIPPED|QA|E2E|approved|operator override|TUS|SSE|kie|Anthropic|ffmpeg" /home/project-owner/projects/project-beta/.tl
nc -z 127.0.0.1 3574
nc -z 127.0.0.1 3587
curl -sS --max-time 3 http://127.0.0.1:3574/
command -v cypher-shell
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
ls -lh /home/project-owner/projects/project-beta/graph-infra/exports/project-beta-graph-export.cypher
wc -l /home/project-owner/projects/project-beta/graph-infra/exports/project-beta-graph-export.cypher
```

Connector checks:

- GitHub repo metadata: `ITSalt/project-beta`
- PR #1, #2, #3, #4 fetched through the GitHub connector.

## Appendix B: Final Status

Status: PARTIALLY_VERIFIED

- Source artifacts: VERIFIED
- Git history: VERIFIED
- PR #1-#4 metadata/diffs: VERIFIED
- `.tl` status and task artifacts: VERIFIED
- Graph export artifacts: PARTIALLY_VERIFIED
- Live graph database: BLOCKED
- Skill file changes: NOT_RUN, intentionally out of scope


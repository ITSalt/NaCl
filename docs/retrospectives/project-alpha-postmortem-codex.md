# Project Alpha - Codex Postmortem

**Project:** `/home/project-owner/projects/project-alpha`  
**Report date:** 2026-05-21  
**Report target:** `/home/project-owner/projects/NaCl/docs/retrospectives/project-alpha-postmortem-codex.md`  
**Mode:** read-only investigation of the project; no skill files changed.

## 1. Executive Summary

Project Alpha did not fail because one development step was weak. It failed because several NaCl skill gates independently accepted incomplete evidence:

1. BA/SA created a useful graph, but did not encode several runtime-critical contracts: provider API protocols, queue restart semantics, first-step payload routing metadata, cache shape between pages, and route/bootstrap ordering.
2. TL planning generated a wave plan from the graph, but allowed opaque or under-specified interfaces (`payload: Record<string, unknown>`, external provider adapters, direct CI/deploy assumptions) to become implementation tasks.
3. TL review and verify accepted targeted green checks while repo-wide and runtime invariants were still broken. Wave 4 was explicitly closed while lint/typecheck and SSE/notification wiring were still wrong; Wave 5 closed with all FE sync verdicts effectively `UNVERIFIED`.
4. QA proved many screens with screenshots, but did not consistently prove production-like cross-boundary flows: actual provider calls, CI from clean checkout, graph-to-code parity, route mounting, boot-refresh ordering, stale cache behavior, and queue races.
5. Status and conductor artifacts overstated completion. The repository used direct commits to `main` with no PRs, skipped CI/health in release metadata, and later needed reconciliation after `.tl/status.json`, graph state, and changelog diverged.

The strongest root cause is not "developers made mistakes"; in most examined cases implementation followed the available task files. The failure sits earlier and later: specifications omitted load-bearing contracts, then review/QA/status gates did not force those omissions back into BA/SA before calling the project done.

## 2. Evidence Base

Reviewed:

- Git history from 2026-05-06 through 2026-05-21: 176 commits, including 59 commits whose subject starts with `fix`.
- `.tl/master-plan.md`, `.tl/status.json`, `.tl/changelog.md`, `.tl/conductor-state*.json`, `.tl/release-status.json`.
- `.tl/fix-plan-wave-4-audit-2026-05-11.md`, `.tl/fixes/FIX-2026-05-21-UC-104-UC-112-UC-202-provider-501-iter3.md`.
- `DIAGNOSTIC-REPORT.md`.
- Graph infrastructure and graph artifacts under `graph-infra/`.
- Live Neo4j container and read-only Cypher checks.
- GitHub PR search for `ITSalt/project-alpha`.

Important working-tree note: `/home/project-owner/projects/project-alpha` was dirty before this analysis. Existing local changes include `.tl/changelog.md`, backend files, untracked `.tl/plans/`, `DIAGNOSTIC-REPORT.md`, rendered `docs/SA/`, and other files. I treated them as evidence and did not modify them.

## 3. Graph Database Check

Status: **PARTIALLY_VERIFIED**

Live graph:

- Docker container `project-alpha-neo4j` is running and healthy.
- Bolt/HTTP ports are configured as `3587` and `3574`.
- Read-only Cypher summary returned:
  - nodes: 1083
  - relationships: 2093
  - UseCase: 26
  - Task: 76
  - Wave: 12
  - FeatureRequest: 6

Graph artifacts:

- Schema files exist: `graph-infra/schema/ba-schema.cypher`, `sa-schema.cypher`, `tl-schema.cypher`.
- Backup exists: `graph-infra/backups/neo4j-pre-migration-2026-05-05.tgz`.
- Latest handover artifact found: `graph-infra/handover/2026-05-14T04-38_da0b0d5.cypher.gz.age` with manifest.
- That handover manifest had 970 nodes, 1792 relationships, 24 UseCases, 57 Tasks, 9 Waves, and 2 FeatureRequests.
- Live graph now has 1083 nodes, 2093 relationships, 26 UseCases, 76 Tasks, 12 Waves, and 6 FeatureRequests.

Conclusion: the graph is live and has advanced beyond the last handover artifact. The latest checked handover is stale relative to current graph state.

Critical graph drift signals:

- `.tl/release-status.json` records `graph.status: warn` with reason: no IntakeItem nodes and stale Task statuses; release proceeded by operator override.
- `.tl/plans/SA-FIX-2026-05-21.md` says `/nacl-sa-validate full` was FAIL with 1 CRITICAL, 156 WARNINGs, and 51 INFO.
- `.tl/plans/BA-FIX-2026-05-21.md` says 46 BA `EntityAttribute` nodes still had no SA twin after SA cleanup planning.
- Live graph has FR-001 through FR-006. The changelog says FR-007 was created, but live FeatureRequest count/list did not show FR-007 in the checked query.

Required follow-up:

1. Create a new graph handover/export after the 2026-05-21 BA/SA fixes.
2. Re-run `/nacl-sa-validate full` and save the output.
3. Query and reconcile FR-007 explicitly:
   ```cypher
   MATCH (fr:FeatureRequest {id: 'FR-007'}) RETURN fr
   ```
4. Rebuild `.tl/status.json` from graph and compare counts against `.tl/status.json.summary`.

## 4. PR and Request History

GitHub PR search returned no PRs for `ITSalt/project-alpha`.

This is consistent with `.tl/release-status.json`:

- `strategy: direct`
- `prs: []`
- `merge.status: skipped`
- `ci.status: skipped` with reason `no CI pipeline on main`
- `health.status: skipped` with reason `no production URL configured`
- operator override: graph task statuses stale, UC gate bypassed

Therefore the normal PR review gate was absent. In practice, quality control depended on local `.tl` status files, direct commits to `main`, local test claims, and later audit/fix cycles.

## 5. Timeline of Failure Signals

### 2026-05-07 to 2026-05-10 - Foundation and Early Waves

Wave 0 and Wave 1 established the monorepo, infrastructure, auth, shared types, SSE, storage, and admin/backend foundations. Follow-up fixes immediately corrected CI, refresh-token surface, email normalization, Cache-Control spec, and dev setup behavior.

Early lesson: even foundational TECH tasks needed post-implementation corrections. The initial skill chain did not fully validate helper scripts, CI bootstrap, and environment assumptions.

### 2026-05-10 - Wave 2

Wave 2 introduced auth/admin FE and queue infrastructure. Later fixes show green tests were insufficient:

- Admin routes were not mounted in the generated route tree.
- Queue provider concurrency needed DB-grounded enforcement.
- Watchdog logic had to be decoupled from the tasks table.

This is a planning/review failure: runtime mounting and queue invariants were not proven by task-local tests alone.

### 2026-05-11 - Wave 3

Wave 3 introduced workflow engine, task creation, verifier loop, and admin FE. It was followed by a dense fix chain:

- `UC-104` task creation and first-step enqueue had to become atomic.
- Uploaded files were not forwarded into workflow render context.
- Crash recovery and verifier verdict handling needed multiple fixes.
- Text LLM null output handling was wrong in race/recovery paths.

This is where the most important hidden complexity appeared: workflow durability, listener timing, recovery, first-step payloads, and verifier state were under-specified.

### 2026-05-11 - Wave 4 Premature Closure

`.tl/fix-plan-wave-4-audit-2026-05-11.md` is the clearest evidence of gate failure. It says the external audit verified that Wave 4 was not release-ready:

- `publishTaskEvent` existed but was not wired into worker/engine.
- `publishNotification` and `pushSseEvent` existed but were not called after terminal commits.
- `pnpm -r typecheck` failed.
- `pnpm -r lint` failed.
- `conductor-state.json` overstated "typecheck clean".
- `.tl/status.json` still had Wave 4 as planned while task entries were done.

This is a TL review/status failure. A wave was closed before the central post-commit event contract was actually wired and before repo-wide checks were green.

### 2026-05-12 - Wave 5 MVP FE Closure

Wave 5 closed as MVP feature-complete, but its own conductor state shows all six FE sync verdicts were normalized to `UNVERIFIED` because they relied on MSW rather than wire-level parity.

Immediate follow-up fixes included:

- UC-104: submit allowed still-uploading files.
- UC-106: notifications tray rendered query data while SSE updates went to Zustand store.
- UC-401: report page showed stale previous-month data due placeholder data behavior.
- Session detail needed a visible "create task" CTA.
- Admin/sidebar and route behavior needed fixes.

This is a UI/spec/review failure. QA showed screens, but did not force data-flow and state-source consistency.

### 2026-05-13 to 2026-05-18 - Feature Waves and CI Reality

Feature waves FR-001 through FR-004 exposed missing cross-UC contracts:

- FR-001 needed session-independent upload URLs.
- FR-003 introduced adapter routing fields, but seed/profile backfills were incomplete.
- FR-004 model catalog work exposed provider base URL and discovery assumptions.
- First clean CI-style runs exposed pnpm, MinIO, test DB, lint, and typecheck issues.

This shows that CI/infra assumptions were not validated from a clean environment before the system was declared ready.

### 2026-05-21 - Provider and Graph Stabilization

The latest changelog/fix artifacts show serious late failures:

- kie.ai `/generate` endpoint was wrong; adapter had to use async createTask/poll protocol.
- kie.ai model IDs had wrong `google/` prefix.
- Internal S3/MinIO presigned URLs were passed to an external provider that could not fetch them.
- First-step enqueue payload lacked routing metadata, causing fallback to legacy adapter paths.
- Verifier VLM slot routed to legacy OpenRouter adapter due `!isVerifier` guard.
- Restart failed task silently hit stale `queue_items`.
- Boot refresh happened after route guards.
- BA/SA validation had to be repaired after implementation.

This is the strongest evidence that external provider protocol and graph/runtime sync were not first-class gates.

## 6. Where the Skill Chain Failed

### BA Skills

What worked:

- BA graph existed and had substantial structure: entities, processes, roles, rules, glossary, workflows.
- Later BA cleanup plans were specific and graph-aware.

What failed:

- BA attributes leaked implementation noise and later had to be pruned.
- BA-to-SA attribute traceability was incomplete enough to leave dozens of warnings.
- Late feature requests such as restart and verifier/provider behavior were not consistently traced back to BA workflows or marked as system UCs.

Fix:

- Add a mandatory BA-to-SA validation gate before TL planning and again before release.
- Treat "remaining warnings" as blocking unless explicitly classified with an owner and expiry.
- Require a graph handover snapshot after each major feature wave.

### SA Skills

What worked:

- SA produced modules, UCs, forms, domain entities, requirements, and generated TL tasks.
- Many fixes could be mapped to existing SA concepts, which means the structure was useful.

What failed:

- External provider protocols were not modeled as versioned contracts.
- Runtime contracts were not explicit enough:
  - first-step payload routing metadata,
  - sync vs async provider behavior,
  - external-provider-accessible file URLs,
  - queue restart semantics,
  - post-commit SSE/notification emission timing,
  - cache shape shared between pages,
  - boot-refresh/router guard order.
- `payload: Record<string, unknown>` let critical fields escape type and sync checks.

Fix:

- Add explicit SA contract nodes or documents for every external provider: endpoint path, auth, payload, response, sync/async lifecycle, polling, file URL accessibility, model ID namespace, and failure codes.
- For every queue/workflow edge, require a typed payload schema and a consumer list.
- For FE pages that read cached objects produced by another UC, require a cache-shape contract.

### TL Planning Skills

What worked:

- Waves and task files were generated and allowed fast implementation.
- Dependencies were visible enough to support later audits.

What failed:

- Plans were too accepting of opaque boundaries:
  - queue payloads,
  - provider adapter abstraction,
  - CI/deploy assumptions,
  - graph status sync,
  - route generation.
- Feature waves were planned as incremental work without always updating impacted existing UCs.

Fix:

- Block task generation when a UC depends on an opaque payload or external service without a contract.
- Add "impact backfill" to feature planning: every FR must list modified existing UCs and graph nodes, not only new task files.
- Add a route/API/queue/provider contract checklist to TL plans.

### TL Development Skills

What worked:

- Developers generally produced narrow fixes and added tests for many regressions.
- Many complex bugs were eventually repaired with focused artifacts.

What failed:

- Dev tasks followed incomplete specs too literally.
- Some fixes updated code first and documented graph updates as "required manually" afterward.
- Direct-to-main strategy meant every incomplete local assumption immediately became mainline history.

Fix:

- For L2+ fixes, graph update must be applied or explicitly blocked before the code fix is considered complete.
- For provider/queue fixes, require a RED regression test that fails for the actual contract break, not only a unit path.

### TL Review and Verify Skills

What worked:

- Later reviews found real race, SSE, route, and metadata problems.
- The review memory for this repo contains good reusable tripwires.

What failed:

- Review accepted partial green evidence.
- Wave 4 closed despite red lint/typecheck and unwired post-commit event paths.
- Wave 5 closed with sync verdicts normalized to `UNVERIFIED`.
- Self-authored or same-agent review patterns appear in later conductor state, reducing independence.
- Status artifacts were not always cross-checked against live command output and graph state.

Fix:

- A wave cannot be closed if any of these are true:
  - repo-wide lint/typecheck/test not run or red,
  - sync verdict is `UNVERIFIED`,
  - graph validation is stale or skipped,
  - conductor/status/changelog disagree,
  - PR/CI gate is skipped without a named replacement.
- For queue/SSE/provider work, review must prove both durable DB state and emitted event/request payload.

### TL QA Skills

What worked:

- QA produced screenshots and useful user-flow evidence for multiple UCs.

What failed:

- QA did not consistently run production-like flows:
  - real provider API or recorded contract fixtures,
  - clean CI environment,
  - real route mounting,
  - router reload/guard ordering,
  - SSE after committed DB transitions,
  - file URLs reachable from external providers.

Fix:

- Add a "contract QA" tier for provider, queue, SSE, auth boot, and file upload/download flows.
- Screenshots are not enough for data-flow features; QA must assert the server request/response/event contract.

### TL Ship/Release Skills

What worked:

- Release metadata exists and honestly records skipped PR/CI/health gates.

What failed:

- Release proceeded with direct strategy, no PRs, no CI on main, no health URL, stale graph task statuses, and operator override.

Fix:

- Direct strategy should be allowed only for explicitly local prototypes. Otherwise PR and CI become mandatory release gates.
- If health URL is missing, release status should be `BLOCKED`, not "done with skipped health".
- If graph status is warning/stale, release must either reconcile graph or produce a signed exception with follow-up task.

## 7. Main Defect Clusters

### 7.1 Provider Contract Cluster

Examples:

- kie.ai `/generate` replaced by async createTask/poll API.
- kie.ai model IDs had wrong namespace.
- provider base URLs doubled version paths.
- internal MinIO/S3 presigned URLs were sent to external provider.
- verifier VLM routed to legacy adapter and returned HTML/buffer instead of verdict JSON.

Root cause: external provider behavior was treated as adapter implementation detail, not as SA/TL contract.

Required skill change: provider protocol artifact and provider smoke/contract test must exist before implementation.

### 7.2 Queue and Workflow Engine Cluster

Examples:

- task creation and first-step enqueue not atomic,
- listener/recovery timing problems,
- cancel/fail race,
- stale queue item restart,
- post-commit event emission drift.

Root cause: queue/workflow state machine was specified as multiple UCs rather than one strict durable FSM contract.

Required skill change: every workflow state transition must specify DB transaction boundary, lock behavior, emitted events, retry/restart behavior, and recovery behavior.

### 7.3 FE Runtime and Cache Cluster

Examples:

- missing Create Task CTA,
- admin routes not mounted,
- boot refresh after guards,
- breadcrumb expects `task.session.name` from partial cache,
- stale monthly report,
- notification tray reads query data while SSE writes store,
- transparent popover due missing CSS token.

Root cause: UI specs described screens and controls but did not always specify navigation affordances, cache ownership, route registration, and design-system runtime dependencies.

Required skill change: `nacl-sa-ui` and FE review need explicit checks for route tree, cache producer/consumer shape, visual token availability, and page-to-page actions.

### 7.4 Status/Artifact Drift Cluster

Examples:

- Wave 4 marked complete while status said planned and checks were red.
- Wave 5 complete while sync verdicts were `UNVERIFIED`.
- release graph warning was overridden.
- handover artifact is older than live graph.
- graph has FR-001..FR-006 while changelog has FR-007.

Root cause: `.tl`, graph, changelog, and release metadata were treated as documentation to update after work, not as blocking control-plane state.

Required skill change: status artifacts must be reconciled from live graph and live command evidence before close/release.

## 8. What Was Done Correctly

- The project kept unusually rich artifacts: `.tl` task files, changelog, conductor states, diagnostic report, graph schema, handover manifest, QA screenshots, fix plans.
- Later audits were concrete and did not hide failure: Wave 4 audit reproduced exact failures; release metadata recorded skipped CI/health and graph warning.
- Many fixes included tests and exact root-cause writeups.
- The graph is live and inspectable.
- The post-fix documentation improved over time: provider async protocol, BA/SA cleanup plans, and rendered `docs/SA/` files appeared later.

## 9. What Was Done Incorrectly

- Waves were closed before closure evidence was complete.
- Direct commits to `main` replaced PR review and CI gates.
- `UNVERIFIED` sync was compatible with "MVP complete".
- Provider contracts were not frozen before implementation.
- Graph validation warnings were tolerated until late.
- Some graph updates were documented as "apply manually" instead of completed in the same fix.
- Release was allowed with stale graph status and no health URL.
- Local/test-only evidence was over-weighted compared to production-like integration evidence.

## 10. What Was Not Done At All

- No GitHub PR workflow was used.
- No enforced main CI gate was present in the checked release metadata.
- No production/staging health check URL was configured for release.
- No fresh graph handover artifact exists after the latest 2026-05-21 graph changes.
- No confirmed FR-007 graph node was found in the live FeatureRequest list.
- No mandatory external-provider contract artifact appears to have blocked the kie.ai implementation.
- No mandatory graph validation PASS was required before release.

## 11. Concrete Remediation Plan for Skills

Do not edit skills blindly; implement these as explicit changes to the relevant NaCl skill contracts.

### Priority 1 - Blocking Gates

1. `nacl-tl-review`: reject wave closure if repo-wide lint/typecheck/test are red, skipped without reason, or contradicted by conductor/status files.
2. `nacl-tl-sync`: `UNVERIFIED` is not a pass state for release/MVP completion.
3. `nacl-tl-release`: block release when graph status is warn/stale, health URL is absent, or PR/CI gates are skipped without approved prototype-mode exception.
4. `nacl-sa-validate`: make current graph validation status part of TL close and release evidence.

### Priority 2 - Contract Modeling

5. `nacl-sa-architect`: add external-provider protocol contracts.
6. `nacl-sa-uc`: add durable FSM transition contracts for queue/workflow/restart/cancel/recovery.
7. `nacl-sa-ui`: add route/cache/navigation/design-token checks.
8. `nacl-tl-plan`: block tasks with opaque payload boundaries unless a typed schema and consumer list exist.

### Priority 3 - Evidence and Artifact Sync

9. `nacl-tl-conductor`: reconcile `.tl/status.json`, `.tl/conductor-state.json`, changelog, and graph before phase close.
10. `nacl-publish` / graph handoff flow: require a fresh graph handover after major feature waves and before release.
11. `nacl-tl-qa`: add contract QA for provider, queue, SSE, file URL reachability, and auth boot flows.

## 12. Final Diagnosis

Project Alpha is a better project than Project-Beta in one sense: it contains enough artifacts to explain what went wrong. But that also makes the failure clearer.

The skill chain produced a lot of work, but it did not enforce the transition from "artifact exists" to "artifact is true and complete". The graph existed, but was stale. Tasks existed, but had opaque contracts. Tests existed, but did not prove production-like boundaries. Status existed, but overstated completion. Release metadata existed, but allowed skipped PR/CI/health/graph gates.

The key repair is to make NaCl gates evidence-blocking instead of evidence-descriptive. A wave or release should not be able to say "done" while graph validation is warning, sync is unverified, CI is skipped, provider contracts are implicit, or conductor/status/changelog disagree.

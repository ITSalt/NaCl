# Gate-Fire Catalog — Strict-Mode Canonical Refusals

**Version:** post-W11 (NaCl skill-chain reform W0–W11, completed 2026-05-22).
**Primary consumer:** the per-project GAP-detection runbook
(`nacl-tl-core/references/project-gap-closure.md`). Any agent inspecting a
project against the post-W11 strict mode runs the eleven assertions in this
file.

Each section names one canonical fire point proven by the W11 pilot. The
trigger condition is stated in plain English; the resulting status carries
the closed Codex `Status:` and the workflow-detail string downstream skills
key off; the canonical fixture path under `tests/fixtures/` materialises the
fire-input shape; the postmortem episode the gate exists to prevent is
named in one sentence.

The SKILL.md text in each section is quoted verbatim with file:line. The
W11 pilot report section number (`docs/retrospectives/nacl-pilot-W11-report.md`
§§ 1–11) is named for every entry.

---

## G1 — `repo-checks-RED` (red lint/typecheck/test on wave-tip)

**Owning skill:** `nacl-tl-review`.
**SKILL.md clause:** `nacl-tl-review/SKILL.md:92-133` (Repo-wide Check Gate,
Mandatory, Strict-Only).

**Trigger condition.** Repo-wide `pnpm -r lint`, `pnpm -r typecheck`, or
`pnpm -r test` on the wave-tip commit exits non-zero, did not run (missing
script, runner crash), or is unrunnable (no pnpm, no workspace root).

**SKILL.md text (verbatim).** Quoting `nacl-tl-review/SKILL.md:123-125`:
> "| Any command exits non-zero (red checks) | **REFUSE** VERIFIED — emit
> `REVIEW APPLIED — BLOCKED (repo-checks-RED)` |
> | Any command did not run (unrun, missing script, runner crash) | **REFUSE**
> VERIFIED — emit `REVIEW APPLIED — BLOCKED (repo-checks-UNRUN)` |
> | Any command is unrunnable on this workspace (e.g. no pnpm, no workspace
> root) | **REFUSE** VERIFIED — emit `REVIEW APPLIED — BLOCKED
> (repo-checks-UNRUNNABLE)` |"

And `nacl-tl-review/SKILL.md:127-128`:
> "VERIFIED refused if repo checks are red/unrun on wave-tip — override
> requires signed exception (W4)."

**Resulting status.** `Status: BLOCKED`. Workflow detail one of
`repo-checks-RED`, `repo-checks-UNRUN`, `repo-checks-UNRUNNABLE`.

**Canonical fixture path.**
`tests/fixtures/project-alpha-snapshot/packages/shared/src/asset.ts` (lint-RED
inline `import()` annotation) +
`tests/fixtures/project-alpha-snapshot/backend/src/modules/reporting/usage-report.routes.ts`
(typecheck-RED `exactOptionalPropertyTypes` shape) +
`tests/fixtures/project-alpha-snapshot/.tl/conductor-state.wave-4-2026-05-11.json:30`
(literal `"typecheck": "clean…"` lie).

**Postmortem episode this gate prevents.** Project-Alpha Wave 4 false-PASS:
`6/6 PASS` declared at 17:07 on 2026-05-11 with `pnpm -r lint` red,
`pnpm -r typecheck` red, and three unwired publishers
(`docs/retrospectives/project-alpha-postmortem.md` § 3.12;
W11 pilot § 1).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W1-blocking-review.md:19-28`

---

## G2 — `wire-evidence-missing` (sync passes on TS types alone)

**Owning skill:** `nacl-tl-sync`.
**SKILL.md clause:** `nacl-tl-sync/SKILL.md:231-292` (Step 7b Wire-Evidence
Gate, Mandatory, Strict-Only).

**Trigger condition.** A `UseCase.actor != SYSTEM` UC reaches Step 7b with
static TS type-alignment passing but no `wire-evidence:fixture:<path>`,
`wire-evidence:contract-test:<path>`, or `wire-evidence:live-smoke:<timestamp>`
artifact present and runnable.

**SKILL.md text (verbatim).** Quoting `nacl-tl-sync/SKILL.md:286`:
> "| `actor != SYSTEM` AND no wire-evidence shape present | **REFUSE
> VERIFIED** — downgrade verdict to `UNVERIFIED`; headline `SYNC APPLIED —
> UNVERIFIED (wire-evidence missing)`. Type-alignment passing does NOT
> promote this to PASS. |"

And `nacl-tl-sync/SKILL.md:289-292`:
> "VERIFIED requires wire-evidence for `actor != SYSTEM`; override via
> signed exception only."

**Resulting status.** `Status: UNVERIFIED`. Workflow detail
`wire-evidence-missing`. Type-alignment passing does NOT promote to PASS.

**Canonical fixture path.**
`tests/fixtures/project-beta-snapshot/worker/src/llm/kieai.ts` (kie.ai adapter
with no fixture/contract test referenced) +
`tests/fixtures/project-beta-snapshot/.tl/tasks/UC-300/api-contract.md`
(`actor: analyst` declared; wire-evidence shapes intentionally absent).

**Postmortem episode this gate prevents.** Project-Beta UC-300 kie.ai 404 on
first prod call: BE+FE TS types matched (`ILlmProvider`), `vi.mock` unit
tests passed, sync emitted `SYNC COMPLETE`; the live wire envelope was
Anthropic-shape and the model namespace wrong
(`docs/retrospectives/project-beta-postmortem.md` § 3.3;
W11 pilot § 2).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W2-blocking-sync.md:19-27`

---

## G3 — `mandatory-NOT_RUN floor` (QA aggregate forced to UNVERIFIED)

**Owning skill:** `nacl-tl-qa`.
**SKILL.md clause:** `nacl-tl-qa/SKILL.md:73-117` (Aggregate Status Rule +
Mandatory-stage matrix).

**Trigger condition.** Any QA stage marked mandatory for the UC under the
W3 UC-type matrix is `NOT_RUN`, `FAILED`, or absent, and no signed exception
covers it.

**SKILL.md text (verbatim).** Quoting `nacl-tl-qa/SKILL.md:75-86`:
> "`aggregate_status = weakest non-NOT_RUN stage status`… THEN, if ANY
> mandatory stage (per the UC-type matrix below) is NOT_RUN AND no signed
> exception covers it: `aggregate_status := UNVERIFIED  (forced floor)`"

And the matrix at `nacl-tl-qa/SKILL.md:99-104`:
> "| `actor != SYSTEM`, has provider dependency | COMPONENT_QA,
> LOCAL_RUNTIME_QA, WIRE_CONTRACT_QA, PROVIDER_FIXTURE_QA,
> LIVE_PROVIDER_SMOKE | PROD_GOLDEN_PATH |
> | Release-gate UCs (declared in release plan) | All six | (none) |"

**Resulting status.** `Status: UNVERIFIED`. Workflow detail names the
specific missing stage (commonly `LIVE_PROVIDER_SMOKE` or
`PROD_GOLDEN_PATH`).

**Canonical fixture path.**
`tests/fixtures/project-beta-snapshot/.tl/conductor-state.json:55` (literal
`"phase_5_outcome": "SKIPPED — Deepgram + kie.ai keys not provided;
UC-200/UC-300 worker pipeline E2E deferred"`) +
`tests/fixtures/project-beta-snapshot/.tl/tasks/UC-200/task-be.md`
(LIVE_PROVIDER_SMOKE + PROD_GOLDEN_PATH NOT_RUN) +
`tests/fixtures/project-beta-snapshot/.tl/tasks/UC-300/api-contract.md`.

**Postmortem episode this gate prevents.** Project-Beta UC-200/UC-300
QA-skipped because Deepgram and kie.ai provider keys were unavailable;
both broke on the first real call
(`docs/retrospectives/project-beta-postmortem.md` § 3.3, § 3.8, § 5;
W11 pilot § 3).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W3-blocking-qa.md:19-36`

---

## G4 — `graph-stale` + `missing-prod-golden-path` (release gate)

**Owning skill:** `nacl-tl-release`.
**SKILL.md clause:** `nacl-tl-release/SKILL.md:162-193` (The Six Block
Conditions + HEALTH_ONLY vs PROD_GOLDEN_PATH).

**Trigger conditions** (any of the six fires this gate):

1. Upstream `tl-sync` `UNVERIFIED` (W2 wire-evidence missing).
2. `tl-qa` aggregate `UNVERIFIED` (W3 mandatory-stage floor).
3. Live graph vs snapshot mismatch (node-count delta > 0, label-histogram
   delta, or rel-type-histogram delta).
4. `/nacl-sa-validate full` reports `FAIL` with ≥1 CRITICAL finding.
5. Missing PROD_GOLDEN_PATH evidence on a UC where the matrix marks it
   mandatory.
6. PR/CI skipped without `project_kind: prototype` AND a signed exception
   with `affected_gates: [skipped-pr]` or `[skipped-ci]`.

**SKILL.md text (verbatim).** Quoting `nacl-tl-release/SKILL.md:168`:
> "| 3 | **Graph staleness detected** — snapshot vs live mismatch on the
> project's Neo4j instance. **Baseline MUST come from a live capture; never
> from a stale `.cypher` export.** … Any node-count delta > 0 OR any label
> histogram delta OR any rel-type histogram delta = STALE. | `RELEASE
> HALTED — UNVERIFIED (graph-stale)` | `graph-stale` |"

And `nacl-tl-release/SKILL.md:170-171`:
> "| 5 | **Missing PROD_GOLDEN_PATH evidence.** A bare HTTP 200 from
> `/health` is `HEALTH_ONLY` evidence and is **never product-readiness
> evidence**. … | `RELEASE HALTED — UNVERIFIED (missing-prod-golden-path)`
> | `missing-prod-golden-path` |
> | 6 | **PR / CI skipped without `project_kind: prototype` AND a signed
> exception.** … `skipped-pr-without-prototype-exception` or
> `skipped-ci-without-prototype-exception` |"

**Resulting status.** `Status: BLOCKED`. Workflow detail one of
`upstream-sync-unverified`, `upstream-qa-unverified`, `graph-stale`,
`sa-validate-critical`, `missing-prod-golden-path`,
`skipped-pr-without-prototype-exception`,
`skipped-ci-without-prototype-exception`.

**Canonical fixture path.**
`tests/fixtures/project-alpha-snapshot/.tl/release-status.json:10,13`
(`graph.status: "warn"`, `operator_override.uc_gate: "bypassed"`) +
`tests/fixtures/graph-snapshots/project-alpha/_summary.json:151`
(`total_nodes: 1083` vs handover ~970) +
`tests/fixtures/project-beta-snapshot/.tl/release-status.json:6`
(`health.status: "skipped"`) +
`tests/fixtures/project-beta-snapshot/.tl/tasks/UC-200/task-be.md`
(PROD_GOLDEN_PATH NOT_RUN).

**Postmortem episodes this gate prevents.** Project-Alpha v0.1.0 release at
2026-05-18 carrying `operator_override.confirmed_by: "user"` over a stale
graph (1083 live vs ~970 snapshot); project-beta `4da4aca` tagged
"production live" at 22:28 on 2026-05-18 with `health.status: "skipped"`
and no PROD_GOLDEN_PATH evidence for the upload flow
(`docs/retrospectives/project-alpha-postmortem-codex.md` § 3,
`docs/retrospectives/project-beta-postmortem-codex.md` § 6.6;
W11 pilot § 4).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W4-blocking-release.md:19-31`

---

## G5 — `artifact-drift` (conductor cross-artifact reconciliation)

**Owning skill:** `nacl-tl-conductor`.
**SKILL.md clause:** `nacl-tl-conductor/SKILL.md:664-699` (Phase 4.5:
Cross-artifact reconciliation).

**Trigger condition.** At least one pairwise check P-S1..P-S5 fails
under no active signed exception, OR the live graph is unreachable and
the gate falls back to `graph_unavailable`. Pairs checked:

- P-S1 `.tl/status.json` totals vs live graph counts.
- P-S2 `.tl/changelog.md` FR entries vs graph `FeatureRequest` nodes.
- P-S3 `.tl/release-status.json.release_tag` vs graph `release_tag`
  property.
- P-S4 `.tl/conductor-state.json` phase vs `.tl/status.json` terminal
  statuses.
- P-S5 `.tl/conductor-state.json` per-task entries vs graph
  `Task.status`.

**SKILL.md text (verbatim).** Quoting `nacl-tl-conductor/SKILL.md:672-676`:
> "Codex postmortem episode 9–10 (Project-Alpha FR-007 in `.tl/changelog.md` but
> not in the live graph; `.tl/conductor-state.json` declaring "typecheck
> clean" while CI reported the opposite) is exactly this drift class. This
> wave-gate catches it before the final report."

And `nacl-tl-conductor/SKILL.md:689`:
> "Live graph reads only — no `.cypher` export fallback."

**Resulting status.** `Status: BLOCKED`. Workflow detail `artifact-drift`
on any P-S* failure; `graph_unavailable` if the project's graph container
is unreachable.

**Canonical fixture path.**
`tests/fixtures/project-alpha-snapshot/.tl/conductor-state.wave-4-2026-05-11.json:30`
(the "clean lie") +
`tests/fixtures/project-alpha-snapshot/.tl/changelog.md` (FR-007 entry absent
from live graph) +
`tests/fixtures/project-alpha-snapshot/.tl/status.json` (Wave-4 status
`"planned"` while Tasks `done`) +
`tests/fixtures/project-alpha-snapshot/.tl/exceptions/` (empty — no covering
exception).

**Postmortem episode this gate prevents.** Project-Alpha five-way artifact drift:
FR-007 in `.tl/changelog.md` but not in the live graph;
`.tl/conductor-state.json` declaring `"typecheck": "clean across packages/
shared, frontend, backend"` while CI reported the opposite
(`docs/retrospectives/project-alpha-postmortem.md` § 3.12;
`project-alpha-postmortem-codex.md` § 3; synthesis § Refinement 1;
W11 pilot § 5).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W5-reconciliation.md:19-29`

---

## G6 — `clean-checkout-*` (deliver gate on shallow-clone build/smoke)

**Owning skill:** `nacl-tl-deliver`.
**SKILL.md clause:** `nacl-tl-deliver/SKILL.md:385-400` (Step 4b
CLEAN-CHECKOUT GATE, Strict-Only; W9-ci-clean-checkout).

**Trigger condition.** Any of: shallow-clone install fails; build fails;
Prisma generate is required (`config.yaml → build.requires_prisma_generate:
true`) but missing; lockfile/package-manager ambiguous; migrate command set
but `test_database_url` undefined; migrate fails; smoke endpoint returns
non-2xx; entrypoint never opens a port; any `config.yaml → runtime_assets[]`
path is absent after build.

**SKILL.md text (verbatim).** Quoting `nacl-tl-deliver/SKILL.md:385-398`:
> "This gate runs AFTER Step 4 VERIFY but BEFORE Step 5 DEPLOY HEALTH CHECK
> on every delivery. It exists because 17 of the ~60 baseline signals (the
> largest single bucket) are config / infra / CI drift that ONLY surface on
> a clean runner: pnpm version mismatch, Prisma generate missing,
> TEST_DATABASE_URL unset, tsconfig divergence, drizzle journal drift, pm2
> entry-point confusion, and non-TS runtime assets (ffmpeg, ffprobe, prompt
> markdown, fonts, locale data) absent from build output."

And `nacl-tl-deliver/SKILL.md:400`:
> "VERIFIED is refused unless this gate completes with PASS."

**Resulting status.** `Status: BLOCKED`. Workflow detail one of
`clean-checkout-install-failed`, `clean-checkout-build-failed`,
`clean-checkout-prisma-generate-missing`, `clean-checkout-pm-ambiguous`,
`clean-checkout-test-database-url-undefined`,
`clean-checkout-migrate-failed`, `clean-checkout-smoke-failed`,
`clean-checkout-entrypoint-no-port`,
`clean-checkout-runtime-assets-missing`.

**Downstream consumer.** `nacl-tl-deploy` Step 1.0
(`nacl-tl-deploy/SKILL.md:39-41`, `:122-142`) refuses the deploy when
`.tl/clean-checkout/<commit>.json` is absent, when its `commit` field
does not match the deployed SHA (`clean-checkout-commit-mismatch`), or
when its `terminal_status: BLOCKED` is not covered by a signed exception
(`clean-checkout-artifact-missing`,
`clean-checkout-<blocker_detail>`).

**Canonical fixture path.**
`tests/fixtures/project-alpha-snapshot/package.json` (pnpm/Prisma cluster shape) +
`tests/fixtures/clean-checkout-missing-asset/` (W9 fixture; declares
`runtime_assets: [bin/ffprobe, dist/llm/prompts/ru/protocol.md,
dist/index.js]` with the first two absent) +
`tests/fixtures/project-beta-snapshot/api/src/plugins/tus.ts` (TUS mount
without addContentTypeParser).

**Postmortem episodes this gate prevents.** Project-Alpha pnpm/Prisma cluster
fix-commits (`f0dd78c`, `1f8efa7`, `9b72bbc`, `49eee5d`, `2ea1eeb`) that
surfaced only after CI first ran on a clean runner; project-beta UC-300
prompts not packaged (`66049d5 fix(UC-300): copy llm/prompts/*.md into
worker dist on build`) and ffprobe/ffmpeg/pm2-entry cluster
(`project-beta-runtime-baseline.md` rows C1, C2, C5, C7;
`project-alpha-postmortem.md` § 5 pattern 5;
`project-beta-postmortem.md` § 3.7;
W11 pilot § 6).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:9-26`

---

## G7 — `nav-actions-missing` (UI reachability for actor-triggered UCs)

**Owning skill:** `nacl-sa-ui` (rule owner) + `nacl-tl-review` (consumer-side
refusal).
**SKILL.md clauses:** `nacl-sa-ui/SKILL.md:484-577` (Nav Actions subsection
+ Graph Rule — UI Reachability); `nacl-tl-review/SKILL.md:163-260`
(Nav-actions consumer check).

**Trigger condition.** An actor-triggered UC (`actor != SYSTEM`,
`has_ui = true`, `entrypoint_type ∉ {deep-link-only, embed-only}`) has no
`HAS_INBOUND_ACTION` edge from a *reachable* Component to its Form, OR
its QA evidence does not reference a natural entrypoint path (an
affordance click captured in the trace).

**SKILL.md text (verbatim).** Quoting `nacl-sa-ui/SKILL.md:544-545`:
> "An actor-triggered UseCase (actor != SYSTEM) without a
> `HAS_INBOUND_ACTION` edge from a reachable Component is a blocker."

And `nacl-tl-review/SKILL.md:253-254`:
> "| Condition 1 fails for any non-exempt affected UC | **REFUSE** VERIFIED
> — emit `REVIEW APPLIED — BLOCKED (nav-actions-missing)`; the `Code
> judgment` line is `CHANGES REQUESTED` |
> | Condition 1 holds but Condition 2 fails for any non-exempt affected UC
> | **REFUSE** VERIFIED — emit `REVIEW APPLIED — BLOCKED
> (nav-actions-no-natural-entrypoint-evidence)`; verdict is `CHANGES
> REQUESTED` |"

**Resulting status.** `Status: BLOCKED`. Workflow detail
`nav-actions-missing` or `nav-actions-no-natural-entrypoint-evidence`.
Strict-only; no inline operator override.

**Canonical fixture path.**
`tests/fixtures/project-beta-snapshot/web/src/routes/catalog/index.tsx`
(CatalogPage with no upload affordance, no `<Link to="/upload">`, no menu
item, no empty-state CTA) +
`tests/fixtures/graph-snapshots/project-beta/` (Component / Form labels
present but no inbound HAS_INBOUND_ACTION to UC-100's Form).

**Postmortem episode this gate prevents.** Project-Beta UC-100 missing upload
button on `/catalog`: the page-local Form spec for `FORM-Upload` was
satisfied but the catalog page had no way to reach the upload route; the
fix landed post-prod as `0ec0a4e fix: add upload button to catalog page
header`
(`docs/retrospectives/project-beta-postmortem.md` § 3.4;
W11 pilot § 7).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W7-ui-reachability.md:19-27`

---

## G8 — `runtime_contract_missing` (queue/long-running/recoverable UC)

**Owning skill:** `nacl-sa-uc`.
**SKILL.md clause:** `nacl-sa-uc/SKILL.md:712-742` (Phase 4.5: Runtime
Contract).

**Trigger condition.** A UseCase satisfies any of the five decision-tree
clauses (async step keywords; state-bearing domain entity; async external
provider; behavioral requirement with retry/restart/cancel vocabulary;
async dependency on another UC) but has no RuntimeContract subgraph (no
`HAS_TRANSITION` / `ACQUIRES_LOCK` / `EMITS_EVENT` edges; no
`uc.runtime_contract = 'not_required'` opt-out marker).

**SKILL.md text (verbatim).** Quoting `nacl-sa-uc/SKILL.md:342`:
> "**Phase 4.5 (Runtime Contract) is MANDATORY for any UC with queue,
> workflow, long-running, async-provider, or recoverable characteristics.**"

And `nacl-sa-uc/SKILL.md:742`:
> "If the verdict is **mandatory**, proceed with the contract authoring
> below. If the user refuses to author a contract, stop with `BLOCKED —
> runtime_contract_missing` and do not advance to Phase 5."

**Resulting status.** `Status: BLOCKED`. Workflow detail
`runtime_contract_missing`. The Phase 4.5 read-back step refuses to mark
the UC detail complete.

**Canonical fixture path.**
`tests/fixtures/project-alpha-snapshot/.tl/tasks/UC-112/task-be.md` (synthetic
UC-112 manifest declaring queue + long-running + recoverable traits) +
`tests/fixtures/project-alpha-snapshot/.tl/tasks/UC-112/runtime-contract.absent`
(explicit absence marker; no RuntimeContract node; no edges).

**Postmortem episode this gate prevents.** Project-Alpha UC-112 silent restart
no-op: pressing Restart on a `failed` task returned 200 but the task
stayed `failed` because `enqueue` used `INSERT … ON CONFLICT DO NOTHING`
and the failed `queue_items` row was not cleared. No FSM transition spec
annotated which path applied to `failed → pending`. Fix: `67a6a44 fix(UC-112):
clear stale queue_items before restart + TASK_NOT_RESTARTABLE → 409`
(`docs/retrospectives/project-alpha-postmortem.md` § 3.5;
W11 pilot § 8).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W8-runtime-fsm.md:54-64`

---

## G9 — `spec-first-prerequisite-missing` (L1+ code-first fix)

**Owning skill:** `nacl-tl-fix`.
**SKILL.md clause:** `nacl-tl-fix/SKILL.md:48-50`, `:143-201`
(Spec-First Prerequisite + Step 6 entry gate).

**Trigger condition.** A fix classified L1, L2, or L3-spec-gap is about
to enter Step 6 (APPLY FIX), but no spec-update commit precedes the first
code-fix commit in the fix chain — equivalently, the verdict computation
returns FAIL — and no signed exception against
`spec-first-prerequisite` covers the chain.

**SKILL.md text (verbatim).** Quoting `nacl-tl-fix/SKILL.md:50`:
> "L1+ blocked without preceding spec-update commit; override via signed
> exception only."

And `nacl-tl-fix/SKILL.md:200`:
> "| 5 | verdict is `FAIL` AND no valid signed exception exists | REFUSE.
> Halt with `Status: BLOCKED` and workflow detail
> `spec-first-prerequisite-missing`. Do not touch production code. Print
> the refusal advisory below and exit. |"

**Resulting status.** `Status: BLOCKED`. Workflow detail
`spec-first-prerequisite-missing`. Header `FIX HALTED — SPEC-FIRST
PREREQUISITE MISSING`. Production code is NOT modified. A second variant
(`graph-delta-unobservable`) fires when graph-delta detection has neither
a graph capture nor secondary signals available
(`nacl-tl-fix/SKILL.md:140-143`, `:201`).

**Canonical fixture path.**
`tests/fixtures/spec-first-refusal/chain.txt` (W10 fixture; carries the
Project-Alpha FIX-B seven-commit chain with classifications) +
`tests/fixtures/spec-first-refusal/expected-outcome.json` (BLOCKED
assertion).

**Postmortem episode this gate prevents.** Project-Alpha FIX-B chain landed seven
code-fix commits before `a7eb747 docs(SA): UC-105/UC-106/UC-107 post-commit
emit timing (L2)` — Rule 1 (Spec First) violated; docs caught up after
code. `DIAGNOSTIC-REPORT.md` measured 39% of fixes as code-first
(`docs/retrospectives/project-alpha-postmortem.md` § 2;
W11 pilot § 9).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W10-fix-discipline.md:19-29`

---

## G10 — `shape-unvalidated:<stub-id>` (stub closed by absence of TODO)

**Owning skill:** `nacl-tl-stubs`.
**SKILL.md clause:** `nacl-tl-stubs/SKILL.md:24`, `:72-191`, `:662`
(Closure Criterion: Shape Validation, W10 binding).

**Trigger condition.** A stub registered as candidate-for-closure has no
runtime data sample — no `wire-evidence:fixture:<path>`, no contract
test, no `wire-evidence:live-smoke`, no qa-stage fixture for the UC — to
compare against the spec's required-field set and types. The W10 binding
no longer treats "absence of TODO marker" as evidence of closure.

**SKILL.md text (verbatim).** Quoting `nacl-tl-stubs/SKILL.md:24`:
> "`STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)` — stub
> looked closed but no runtime data sample was available to compare against
> the spec"

And `nacl-tl-stubs/SKILL.md:662`:
> "| Candidate-for-closure stub has no runtime data sample (no fixture /
> contract test / live-smoke / qa-stage fixture for the UC) | Headline:
> `STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)`. Keep
> `resolvedAt: null`. |"

**Resulting status.** `Status: UNVERIFIED`. Workflow detail
`shape-unvalidated:<stub-id>` or
`shape-mismatch:<stub-id>,field:<field-name>`. The registry keeps
`resolvedAt: null`.

**Canonical fixture path.**
`tests/fixtures/stub-shape-validation/stub-registry.json` (STUB-042
candidate-for-closure) +
`tests/fixtures/stub-shape-validation/src/admin/workflow-steps.service.ts`
(TODO removed, fake dot-notation IDs) +
`tests/fixtures/stub-shape-validation/UC-302-spec.md` (required-field set:
uuid id, string name, int step_order, enum kind).

**Postmortem episode this gate prevents.** Project-Alpha `WORKFLOW_STEPS` stub
closed because the TODO marker was removed — but the data carried fake
dot-notation IDs that did not match the real step catalog; the file had no
`TODO`, so the scanner passed. Fix landed as `8522d1d fix(admin): unstub
WORKFLOW_STEPS + categories envelope + WSC dropdown paging`
(`docs/retrospectives/project-alpha-postmortem.md` § 4 nacl-tl-stubs;
W11 pilot § 10).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W10-fix-discipline.md:19-29`

---

## G11 — Emergency-mode bypass (loud, never `VERIFIED`)

**Owning artifact:** `nacl-tl-core/references/emergency-mode.md`. Hosted by
every skill that owns a Strict-Only gate (`nacl-tl-review`, `nacl-tl-sync`,
`nacl-tl-qa`, `nacl-tl-release`) and inherited by downstream skills via the
closed-set `Status:` they consume
(`nacl-tl-core/references/emergency-mode.md:175-191`).

**Trigger condition.** All three env vars set at invocation:
`NACL_EMERGENCY=1`, `NACL_EMERGENCY_REASON=<text>`,
`NACL_EMERGENCY_OWNER=<github_handle_or_team>`, AND a Strict-Only gate in
the skill run would otherwise have refused.

**emergency-mode.md text (verbatim).** Quoting
`nacl-tl-core/references/emergency-mode.md:80-83`:
> "**Advances past the refusal** without changing the `Status:`
> classification of the bypassed gate. The terminal `Status:` of the
> skill run carries the suffix `(emergency-bypass)` and is NOT promoted
> to `VERIFIED`."

And `nacl-tl-core/references/emergency-mode.md:151-156`:
> "It does NOT operate silently. The bypass banner is mandatory. The event
> file is mandatory. The release-status.json append is mandatory. The
> changelog append is mandatory. A skill that observes `NACL_EMERGENCY=1`
> but fails to produce any of these side effects is in a corrupt state
> and MUST refuse to advance with `Status: BLOCKED
> (emergency-mode-side-effect-missing)`."

**Resulting status.** `Status: PARTIALLY_VERIFIED`. Headline carries the
suffix `(emergency-bypass)`. The closed-set Status is NEVER promoted to
`VERIFIED` — a run that emits `VERIFIED` under emergency mode is a skill
bug.

**Side effects produced (every one is mandatory).**

1. Bypass banner on stderr, one per gate
   (`nacl-tl-core/references/emergency-mode.md:66-78`).
2. Structured YAML event at `.tl/emergencies/<UTC-timestamp>-<slug>.yaml`
   (schema at `.tl/emergencies/_template.yaml`).
3. `"emergency"` key appended to `.tl/release-status.json` (for release /
   deliver / deploy / ship; `nacl-tl-core/references/emergency-mode.md:93-105`).
4. Blockquote line appended to `.tl/changelog.md` under the in-flight
   version heading (`nacl-tl-core/references/emergency-mode.md:107-116`).
5. `postmortem_feed.tagged: true` set on the event file so the next
   postmortem includes the event (`nacl-tl-core/references/emergency-mode.md:118-123`).

**Canonical fixture path.** `tests/fixtures/emergency-mode/` (W4 fixture
— `invocation.sh` shows the three-env-var invocation;
`expected/emergency-event.yaml` is the full event-schema instance;
`expected/banner-per-gate.txt` is the six-bypass-banner output;
`expected/release-status.json.delta` and `expected/changelog.md.delta`
are the artifact appends; `refusal-source.txt` is the six underlying
refusals).

**Postmortem episodes this gate prevents.** Both the Project-Alpha
`operator_override.confirmed_by: "user"` pattern and the project-beta
direct-commit-to-main-with-`health.skipped` pattern. Emergency mode is
the only sanctioned bulk-bypass path; all `--skip-*` flags removed by
W3/W4/W5/W9 are NOT re-enabled by signed exceptions or emergency mode
(`docs/retrospectives/project-alpha-postmortem.md` § 5;
`docs/retrospectives/project-beta-postmortem.md` § 6;
W11 pilot § 11).

**Wave-evidence provenance.** `~/.nacl/wave-evidence/W4-blocking-release.md:27-32`

---

## Consumer

This catalog is the primary checklist consumed by per-project GAP-detection
agents running the runbook at
`nacl-tl-core/references/project-gap-closure.md`. Agents using this catalog
classify each finding against one of G1..G11 and one of the ten GAP
categories named in the runbook, then enter the finding into the GAP
register at `<project>/.tl/gap-closure/<YYYY-MM-DD>-gap-register.yaml`.

The catalog is read-only operational reference. New gate-fire points are
added only by a future strict-mode reform wave; per-project gap closure
does not add entries here.

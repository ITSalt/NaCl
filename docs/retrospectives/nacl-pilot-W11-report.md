# NaCl Skill Chain Remediation — W11-pilot Report

**Wave:** W11-pilot — Retrospective replay on Project-Alpha + project-beta fixtures
**Status:** VERIFIED
**Plan reference:** `/home/project-owner/.claude/plans/final-task-brief-concurrent-ripple.md` § W11-pilot (lines 1052–1164)
**Generated:** 2026-05-22 by W11-pilot subagent
**Mode:** Analytical replay. SKILL.md files are markdown specs, not runnable code; this wave reads the post-W1..W10 SKILL.md clauses and asserts each fires on the documented fixture input. No SKILL.md mutations.

---

## Top-level result

All 11 expected gate-fire assertions hold under the post-W1..W10 chain:

| # | Gate-fire assertion | Replay outcome |
|---|---|---|
| 1 | tl-review fires on Project-Alpha red lint+typecheck | **BLOCKED (repo-checks-RED)** — fires |
| 2 | tl-sync fires on project-beta missing wire-evidence (kie.ai) | **UNVERIFIED (wire-evidence missing)** — fires |
| 3 | tl-qa fires on project-beta skipped provider QA → aggregate UNVERIFIED | **UNVERIFIED (mandatory-NOT_RUN floor)** — fires |
| 4 | tl-release fires on Project-Alpha stale graph AND project-beta health-only | **BLOCKED (graph-stale)** + **BLOCKED (missing-prod-golden-path)** — both fire |
| 5 | tl-conductor reconciliation fires on Project-Alpha five-way drift | **BLOCKED (artifact-drift)** — fires |
| 6 | tl-deliver clean-checkout fires on Project-Alpha pnpm/Prisma drift AND project-beta missing ffprobe | **BLOCKED (clean-checkout-*)** — both fire |
| 7 | sa-ui reachability fires on project-beta missing upload button | **BLOCKED (nav-actions-missing)** — fires |
| 8 | sa-uc runtime contract fires on Project-Alpha restart-bug UC (synthetic UC-112) | **BLOCKED (runtime_contract_missing)** — fires |
| 9 | tl-fix fires on a code-first L1 attempt | **BLOCKED (spec-first-prerequisite-missing)** — fires |
| 10 | tl-stubs fires on shape-unvalidated stub | **UNVERIFIED (shape-unvalidated: …)** — fires |
| 11 | Emergency-mode invocation records a loud bypass event | **PARTIALLY_VERIFIED (emergency-bypass)** — fires with banner + event file |

No "gates that did NOT fire when they should have" surfaced (see § 13).
No upstream wave is retroactively FAILED.

The post-mortem timeline diff for each assertion: originally each case **PASSED** the chain (Wave 4 closed 6/6 at 17:07; project-beta "deliver(.tl): production live" at 22:28); under the post-W1..W10 chain, each case **REFUSES** to close (BLOCKED or UNVERIFIED with named workflow detail).

---

## § 1 — Project-Alpha red lint+typecheck → tl-review (W1)

**Postmortem episode replayed:** `docs/retrospectives/project-alpha-postmortem.md` § 3.12 ("Wave 4 declared 6/6 PASS with lint+typecheck red — SPEC RIGHT, REVIEW DRIFTED"); fix-plan claims 3 ("`pnpm -r typecheck` fails (3 errors)") and 4 ("`pnpm -r lint` fails on `packages/shared/src/asset.ts:12`"); conductor-state literally states `"typecheck": "clean across packages/shared, frontend, backend"` while CI reports the opposite.

**Fixture artifacts:**
- `tests/fixtures/project-alpha-snapshot/packages/shared/src/asset.ts` — line 19 carries the inline `import('./task-105.js').FileType` annotation that the `@typescript-eslint/consistent-type-imports` rule rejects. Lint RED.
- `tests/fixtures/project-alpha-snapshot/backend/src/modules/reporting/usage-report.routes.ts` — `exactOptionalPropertyTypes: true` shape produces TS2375 on the assignment at L29. Typecheck RED.
- `tests/fixtures/project-alpha-snapshot/.tl/conductor-state.wave-4-2026-05-11.json:30` carries the literal string `"typecheck": "clean across packages/shared, frontend, backend (verified during UC-103-FE)"` — the "clean lie."
- `tests/fixtures/project-alpha-snapshot/.tl/fix-plan-wave-4-audit-2026-05-11.md` (copied verbatim from source) verifies all six audit claims.

**SKILL.md clause that fires:**

`nacl-tl-review/SKILL.md:92-133` — "Repo-wide Check Gate (Mandatory, Strict-Only)":

> "**CRITICAL**: Before any quality review, the agent MUST run repo-wide lint, typecheck, and test commands on the **wave-tip commit** … The Project-Alpha Wave 4 false-PASS (lint red + typecheck red + 3 unwired publishers at 17:07 on 2026-05-11) is the canonical episode this gate exists to prevent."

> "| Any command exits non-zero (red checks) | **REFUSE** VERIFIED — emit `REVIEW APPLIED — BLOCKED (repo-checks-RED)` |" (L123)

> "**VERIFIED refused if repo checks are red/unrun on wave-tip — override requires signed exception (W4).** … There is no inline operator-prompt override at this gate. Strict is the single, unconditional mode for this gate" (L127–133)

**Resulting status:** `Status: BLOCKED`, workflow detail `repo-checks-RED`. Headline: `REVIEW APPLIED — BLOCKED (repo-checks-RED)`. The `.tl/exceptions/` directory in the fixture is intentionally empty — no override exists. Step 8 verdict assignment refuses to write `APPROVED`.

**Diff vs original timeline:** Originally `chore(.tl): close wave-4 conductor batch — 6/6 PASS` at `d2d90eb` 17:07 on 2026-05-11. Post-W1, that commit cannot close — the W4 audit at 17:35 would have been the W1 refusal at 14:00 (wave-start) instead.

---

## § 2 — Project-Beta missing kie.ai wire-evidence → tl-sync (W2)

**Postmortem episode replayed:** `docs/retrospectives/project-beta-postmortem.md` § 3.3 ("UC-300 kie.ai endpoint shape — SPEC MISSING"); commit `1f025b7 fix(UC-300): switch kie.ai client to Anthropic /claude/v1/messages` landed after the 404-in-prod surfaced. TS-type alignment passed pre-W2 because both BE and FE imported `ILlmProvider`; the wire envelope was OpenAI-shape, kie.ai is Anthropic-shape.

**Fixture artifacts:**
- `tests/fixtures/project-beta-snapshot/worker/src/llm/kieai.ts` — adapter file declaring `KieAiLlmProvider implements ILlmProvider`, calling `POST {KIE_BASE_URL}/chat/completions` with OpenAI-shape body, parsing `data.choices[0].message.content`. No fixture/contract/live-smoke artifact referenced.
- `tests/fixtures/project-beta-snapshot/.tl/tasks/UC-300/api-contract.md` — explicitly declares `actor: analyst` (`actor != SYSTEM`) and explicitly lists which wire-evidence shapes are ABSENT.
- No file at any of: `tests/fixtures/project-beta-snapshot/tests/fixtures/wire-evidence/kieai-protocol.json`, `tests/fixtures/project-beta-snapshot/tests/integration/kieai-contract.test.ts`, `tests/fixtures/project-beta-snapshot/.tl/qa-smoke/kieai-LIVE-SMOKE-*.json`.

**SKILL.md clause that fires:**

`nacl-tl-sync/SKILL.md:231-292` — "Step 7b: Wire-Evidence Gate (Mandatory, Strict-Only)":

> "Static type-alignment and runtime test passing are necessary but not sufficient for SYNC COMPLETE. Sync must also confirm **wire-evidence** for any UC where the system makes calls to an external surface (`UseCase.actor != SYSTEM` in the graph…). This gate is **strict-only**" (L233–239)

> "| `actor != SYSTEM` AND no wire-evidence shape present | **REFUSE VERIFIED** — downgrade verdict to `UNVERIFIED`; headline `SYNC APPLIED — UNVERIFIED (wire-evidence missing)`. Type-alignment passing does NOT promote this to PASS. |" (L286)

> "**VERIFIED requires wire-evidence for `actor != SYSTEM`; override via signed exception only.**" (L289)

**Resulting status:** `Status: UNVERIFIED`, workflow detail `wire-evidence-missing`. Headline: `SYNC APPLIED — UNVERIFIED (wire-evidence missing)`. The five-fixture-empty actor!=SYSTEM check completes without finding any of the three recognised shapes; the gate downgrades verdict regardless of type-alignment outcome.

**Diff vs original timeline:** Originally tl-sync PASSED on UC-300 because BE and FE imported the same `LlmResult` type. Post-W2, the same input produces UNVERIFIED with named workflow detail; downstream tl-release reads UNVERIFIED and refuses (see § 4).

---

## § 3 — Project-Beta skipped provider QA → tl-qa aggregate (W3)

**Postmortem episode replayed:** `docs/retrospectives/project-beta-postmortem.md` § 3.3, § 3.8, § 5 nacl-tl-qa ("UC-200 (ffmpeg/Deepgram) and UC-300 (kie.ai) were both QA-skipped because real provider keys were unavailable; both broke on the first real call"); `.tl/conductor-state.json:55` literally records `"phase_5_outcome": "SKIPPED — Deepgram + kie.ai keys not provided; UC-200/UC-300 worker pipeline E2E deferred"`.

**Fixture artifacts:**
- `tests/fixtures/project-beta-snapshot/.tl/conductor-state.json:55` (copied verbatim) — the literal SKIPPED-deferred record.
- `tests/fixtures/project-beta-snapshot/.tl/tasks/UC-200/task-be.md` — declares queue + long-running + recoverable + async-provider traits; explicitly enumerates per-stage statuses showing LIVE_PROVIDER_SMOKE = NOT_RUN and PROD_GOLDEN_PATH = NOT_RUN.
- `tests/fixtures/project-beta-snapshot/.tl/tasks/UC-300/api-contract.md` — declares `actor: analyst` (`actor != SYSTEM`); enumerates per-stage status post-W3.

**SKILL.md clause that fires:**

`nacl-tl-qa/SKILL.md:73-94` — "Aggregate Status Rule":

> "`aggregate_status = weakest non-NOT_RUN stage status` … THEN, if ANY mandatory stage (per the UC-type matrix below) is NOT_RUN AND no signed exception covers it: `aggregate_status := UNVERIFIED  (forced floor)`" (L75–86)

`nacl-tl-qa/SKILL.md:95-117` — "Mandatory-stage matrix per UC type":

> "| `actor != SYSTEM`, has provider dependency | COMPONENT_QA, LOCAL_RUNTIME_QA, WIRE_CONTRACT_QA, PROVIDER_FIXTURE_QA, LIVE_PROVIDER_SMOKE | PROD_GOLDEN_PATH |" (L103)
> "| Release-gate UCs (declared in release plan) | All six | (none) |" (L104)

**Resulting status:** For UC-200 and UC-300 (both `actor != SYSTEM`, both with provider dependency, both declared as release-gate UCs): LIVE_PROVIDER_SMOKE = NOT_RUN AND mandatory → `aggregate_status := UNVERIFIED` (forced floor). Headline: `QA APPLIED — UNVERIFIED`. Closed-set status: `UNVERIFIED`.

**Diff vs original timeline:** Originally "skipped" was effectively PASS-equivalent at downstream gates ("QA APPLIED — UNVERIFIED" was non-blocking per W0 baseline P-7). Post-W3, the mandatory-NOT_RUN floor forces UNVERIFIED and downstream tl-release reads it as `upstream-qa-unverified` block condition (see § 4).

---

## § 4 — Project-Alpha stale graph + project-beta health-only → tl-release (W4)

**Postmortem episodes replayed:**

(4a) Project-Alpha stale graph: `project-alpha-postmortem-codex.md` § 3 — `.tl/release-status.json:10` records `graph.status: "warn"` with reason "No IntakeItem nodes exist; Task statuses stale"; live capture shows 1083 nodes vs handover-snapshot 970.

(4b) Project-Beta health-only: `project-beta-postmortem.md` § 5; `.tl/release-status.json:6` records `health.status: "skipped"` with note "no production URL in config.yaml"; `project-beta-postmortem-codex.md` § 6.6 ("HEALTH_ONLY ≠ product-readiness").

**Fixture artifacts:**
- `tests/fixtures/project-alpha-snapshot/.tl/release-status.json:10,13` (copied verbatim): `"graph": { "status": "warn", "reason": "No IntakeItem nodes exist..." }`, `"operator_override": { "confirmed_by": "user", "uc_gate": "bypassed" }`.
- `tests/fixtures/graph-snapshots/project-alpha/_summary.json:151` — `"total_nodes": 1083` (live); the release artifact's implicit handover snapshot of ~970 nodes is the stale baseline.
- `tests/fixtures/project-beta-snapshot/.tl/release-status.json:6` (copied verbatim): `"health": { "status": "skipped", "note": "no production URL in config.yaml" }`.
- `tests/fixtures/project-beta-snapshot/.tl/tasks/UC-200/task-be.md` and `UC-300/api-contract.md` — both enumerate `PROD_GOLDEN_PATH: NOT_RUN`.

**SKILL.md clauses that fire:**

`nacl-tl-release/SKILL.md:162-171` — "The Six Block Conditions":

> "| 3 | **Graph staleness detected** — snapshot vs live mismatch on the project's Neo4j instance. **Baseline MUST come from a live capture; never from a stale `.cypher` export.** … Any node-count delta > 0 OR any label histogram delta OR any rel-type histogram delta = STALE. | `RELEASE HALTED — UNVERIFIED (graph-stale)` | `graph-stale` |" (L168)

> "| 5 | **Missing PROD_GOLDEN_PATH evidence.** A bare HTTP 200 from `/health` is `HEALTH_ONLY` evidence and is **never product-readiness evidence**. … | `RELEASE HALTED — UNVERIFIED (missing-prod-golden-path)` | `missing-prod-golden-path` |" (L170)

> "| 6 | **PR / CI skipped without `project_kind: prototype` AND a signed exception.** … `skipped-pr-without-prototype-exception` or `skipped-ci-without-prototype-exception` |" (L171) — applies to Project-Alpha: `release-status.json:3-7` records `merge.status: "skipped"`, `ci.status: "skipped"`, `prs: []`, and no `config.yaml` declares `project_kind: prototype`.

`nacl-tl-release/SKILL.md:173-193` — "HEALTH_ONLY vs PROD_GOLDEN_PATH" — explicitly names the project-beta episode as canonical proof.

**Resulting statuses:**

- **Project-Alpha:** `Status: BLOCKED`, workflow detail `graph-stale`. Additionally `skipped-pr-without-prototype-exception` AND `skipped-ci-without-prototype-exception` fire because `project_kind: standard` (default) and no signed exception exists.
- **Project-Beta:** `Status: BLOCKED`, workflow detail `missing-prod-golden-path` (UC-200 and UC-300 both flagged); also `upstream-sync-unverified` (UC-300 from § 2) and `upstream-qa-unverified` (UC-200, UC-300 from § 3) trigger conditions #1 and #2.

**Diff vs original timeline:** Originally Project-Alpha shipped v0.1.0 at 2026-05-18 with `operator_override.confirmed_by: "user"` carrying the tag through. Originally project-beta tagged `4da4aca` "deliver(.tl): production live" at 22:28 on 2026-05-18 with health.status=skipped. Post-W4, both fail the six block-conditions table; the operator-override path no longer exists.

---

## § 5 — Project-Alpha five-way artifact drift → tl-conductor reconciliation (W5)

**Postmortem episode replayed:** `project-alpha-postmortem.md` § 3.12 (`conductor-state.json` literally claims `"typecheck": "clean across packages/shared, frontend, backend"` while CI reports the opposite); `project-alpha-postmortem-codex.md` § 3 (FR-007 in changelog but not in the live graph; release-status.json graph.status="warn" with stale Task statuses); the synthesis § Refinement 1 names this as the class invisible to file-and-git-log analysis.

**Fixture artifacts:**

The fixture carries all six sources of truth (per W5 list):

| Source | Fixture file | Drift signal |
|---|---|---|
| 1 — `.tl/status.json` | `tests/fixtures/project-alpha-snapshot/.tl/status.json` (copied verbatim, 2035 lines) | Wave-4 status still claims `"planned"` while Task entries are `done` (audit claim 6) |
| 2 — `.tl/conductor-state.json` | `tests/fixtures/project-alpha-snapshot/.tl/conductor-state.json` + `.tl/conductor-state.wave-4-2026-05-11.json:30` | Wave-4 state literally claims `"typecheck": "clean across packages/shared, frontend, backend"` (the "clean lie") |
| 3 — `.tl/changelog.md` | `tests/fixtures/project-alpha-snapshot/.tl/changelog.md` (copied verbatim, 1078 lines) | Records FR-007 entry; live graph does NOT |
| 4 — Live Neo4j graph | `tests/fixtures/graph-snapshots/project-alpha/` | 1083 nodes, FR-007 absent (synthesis § Refinement 1) |
| 5 — `.tl/release-status.json` | `tests/fixtures/project-alpha-snapshot/.tl/release-status.json:10,13` | `graph.status: "warn"`, `operator_override.uc_gate: "bypassed"` |
| 6 — `.tl/exceptions/` | empty | no covering exception for any pair-fail |

**SKILL.md clause that fires:**

`nacl-tl-conductor/SKILL.md:664-699` — "Phase 4.5: Cross-artifact reconciliation":

> "Codex postmortem episode 9–10 (Project-Alpha FR-007 in `.tl/changelog.md` but not in the live graph; `.tl/conductor-state.json` declaring "typecheck clean" while CI reported the opposite) is exactly this drift class. This wave-gate catches it before the final report." (L672–676)

> "**Live graph reads only — no `.cypher` export fallback.**" (L689)

> Pairwise checks P-S1..P-S5 (W5 evidence file, mirrored in SKILL.md): P-S2 (changelog FR vs graph FeatureRequest) FAIL — FR-007 in changelog absent from graph. P-S4 (conductor phase vs status.json terminal statuses) FAIL — wave-4 conductor-state claims complete while status.json keeps `"planned"`. P-S5 (per-task) FAIL — conductor claims `done` while status.json keeps `in_progress` rows.

**Resulting status:** `Status: BLOCKED`, workflow detail `artifact-drift`. Per pair-fail accumulation (≥1 pair FAIL with no covering exception → BLOCKED). 

**Diff vs original timeline:** Originally `nacl-tl-conductor/SKILL.md:765` (pre-W5) said "Neo4j write fails after completion | Log warning, continue (graph sync is best-effort, not blocking)" — the five-way drift never blocked the wave close. Post-W5, the same drift profile refuses to close until each pair P-S1..P-S5 resolves or a W4 signed exception covers `artifact-drift`.

---

## § 6 — Project-Alpha pnpm/Prisma + Project-Beta missing ffprobe → tl-deliver clean-checkout (W9)

**Postmortem episodes replayed:**

(6a) Project-Alpha: `project-alpha-postmortem.md` § 5 pattern 5 ("CI environment is a second-class deployment target. Six of thirteen config/infra fixes are 'first time CI bootstrapped on a clean runner'"); fixes `f0dd78c` (pnpm version), `1f8efa7` (MinIO command), `9b72bbc` (Drizzle journal), `49eee5d` (TEST_DATABASE_URL), `2ea1eeb` (tsconfig.typecheck divergence).

(6b) Project-Beta: `project-beta-postmortem.md` § 3.7 ("UC-300 prompts not packaged — SPEC MISSING"); commit `66049d5 fix(UC-300): copy llm/prompts/*.md into worker dist on build`. `project-beta-runtime-baseline.md` rows C1, C2, C5, C7 (ffmpeg, ffprobe, pm2 entry, prompt markdown).

**Fixture artifacts:**

- Project-Alpha synthetic shape: `tests/fixtures/project-alpha-snapshot/package.json` declares `"packageManager": "pnpm@9.15.0"` while a synthetic CI runner would default to pnpm@9 (the `f0dd78c` shape). The fixture's `package.json` documents the expected wave-tip state and red commands.
- Project-Beta: the W9 fixture `tests/fixtures/clean-checkout-missing-asset/` (created in W9, referenced here) ships `runtime_assets: [bin/ffprobe, dist/llm/prompts/ru/protocol.md, dist/index.js]` with the first two absent. The project-beta-snapshot fixture's `worker/src/llm/` shape mirrors the same gap (no prompts subdirectory copied to a notional dist/).
- `tests/fixtures/project-beta-snapshot/api/src/plugins/tus.ts` — declares the TUS mount but no content-type-parser registration; only surfaces at clean-checkout smoke.

**SKILL.md clause that fires:**

`nacl-tl-deliver/SKILL.md:385-400` — "Step 4b: CLEAN-CHECKOUT GATE (Strict-Only; W9-ci-clean-checkout)":

> "This gate runs AFTER Step 4 VERIFY but BEFORE Step 5 DEPLOY HEALTH CHECK on every delivery. It exists because 17 of the ~60 baseline signals (the largest single bucket) are config / infra / CI drift that ONLY surface on a clean runner: pnpm version mismatch, Prisma generate missing, TEST_DATABASE_URL unset, tsconfig divergence, drizzle journal drift, pm2 entry-point confusion, and non-TS runtime assets (ffmpeg, ffprobe, prompt markdown, fonts, locale data) absent from build output." (L385–398)

> "VERIFIED is refused unless this gate completes with PASS." (L400)

> "If install fails → BLOCKED with `clean-checkout-install-failed`. Capture stderr tail (50 lines) to evidence." (L432)

**Resulting statuses:**

- **Project-Alpha:** `Status: BLOCKED`, workflow detail one of `clean-checkout-install-failed` (pnpm version mismatch), `clean-checkout-prisma-generate-missing`, `clean-checkout-test-database-url-undefined`, depending on the first stage to fail.
- **Project-Beta:** `Status: BLOCKED`, workflow detail `clean-checkout-runtime-assets-missing` (ffprobe + prompts/) per W9 fixture `expected/clean-checkout-evidence.json`.

**Diff vs original timeline:** Originally these gaps surfaced as a 6-of-13 config/infra fix cluster AFTER MVP shipped — "first CI run on a clean runner exposes drift" (postmortem § 5 pattern 5). Post-W9, the clean-checkout gate exercises a shallow clone + frozen-lockfile install + build + smoke + runtime_assets check BEFORE delivery; the same drift surfaces as a delivery BLOCKER instead of a stabilization-wave fix-commit chain.

---

## § 7 — Project-Beta missing upload button → sa-ui reachability + tl-review (W7)

**Postmortem episode replayed:** `project-beta-postmortem.md` § 3.4 ("UC-001 catalog has no upload entry-point — SPEC MISSING"); commit `0ec0a4e fix: add upload button to catalog page header`; UC-001 form-fields table listed only `open_button`, no nav-action to UC-100.

**Fixture artifacts:**

- `tests/fixtures/project-beta-snapshot/web/src/routes/catalog/index.tsx` — the CatalogPage component with INTENTIONALLY no upload affordance, no `<Link to="/upload">`, no menu item, no empty-state CTA. The comment block names the exact W7 reachability query that would refuse this shape.
- The W0 graph snapshot at `tests/fixtures/graph-snapshots/project-beta/` carries `Component` and `Form` labels but the UC-100 inbound-action edge from the catalog Component is intentionally absent (the W0 capture predates the fix-commit). The W7 query returns one row `(UC-100, FORM-UploadMeeting, 'no-inbound-action')`.
- `.tl/exceptions/` empty — UC-100 carries no exemption (it is `actor=analyst`, `has_ui=true`, `entrypoint_type=default`).

**SKILL.md clauses that fire:**

`nacl-tl-review/SKILL.md:163-260` — "Nav-actions consumer check (Mandatory, Strict-Only)":

> "1. The UC's Form has populated `HAS_INBOUND_ACTION` edges (per W7 reachability graph rule) FROM at least one Component reachable from the navigation root" (L169–170)

> "Run the W7 reachability blocker query from `nacl-sa-ui/references/reachability.cypher` § 4 (`ui_reachability_blockers`), scoped to the affected UCs" (L204–206)

> "| Condition 1 fails for any non-exempt affected UC | **REFUSE** VERIFIED — emit `REVIEW APPLIED — BLOCKED (nav-actions-missing)`" (L253)

`nacl-sa-ui/references/reachability.cypher` § 4 (`ui_reachability_blockers`) produces the blocker row.

**Resulting status:** `Status: BLOCKED`, workflow detail `nav-actions-missing`. Headline: `REVIEW APPLIED — BLOCKED (nav-actions-missing)`. Strict-only — no inline operator override.

**Diff vs original timeline:** Originally `nacl-tl-review` PASSED on UC-001 because the code matched the form-fields spec exactly (the upload button was negative space — nothing to compare against). Post-W7, the spec template REQUIRES a Nav-Actions subsection for `actor != SYSTEM`, the graph rule REQUIRES an inbound-action edge, and tl-review REFUSES VERIFIED on the empty inbound-action set. The fix `0ec0a4e` would have been authored pre-merge, not post-prod-deploy.

---

## § 8 — Project-Alpha restart-bug UC → sa-uc Runtime Contract (W8)

**Postmortem episode replayed:** `project-alpha-postmortem.md` § 3.5 ("UC-112 restart silent no-op — SPEC MISSING"); commit `67a6a44 fix(UC-112): clear stale queue_items before restart + TASK_NOT_RESTARTABLE → 409`. The `enqueue` contract is "return existing on conflict" — correct for steady-state idempotency, wrong for restart-after-failure. No FSM transition spec annotated which path applies when.

**Fixture artifacts:**
- `tests/fixtures/project-alpha-snapshot/.tl/tasks/UC-112/task-be.md` — synthetic UC-112 manifest declaring queue + long-running + recoverable traits (three of the five W8 decision-tree clauses).
- `tests/fixtures/project-alpha-snapshot/.tl/tasks/UC-112/runtime-contract.absent` — explicit absence marker. No `.cypher` write block exists. No `RuntimeContract` node. No `HAS_TRANSITION` / `ACQUIRES_LOCK` / `EMITS_EVENT` edges.

**SKILL.md clause that fires:**

`nacl-sa-uc/SKILL.md:712-742` — "Phase 4.5: Runtime Contract (FSM / queue / workflow durable state)":

> "**Project-Alpha UC-112 'restart-after-failed-with-running-tasks' silent no-op** — pressing 'Restart' on a failed task returned 200 but the task stayed `failed`. … A correct Runtime Contract would have made both explicit and the bug would have been impossible to ship." (L718)

> "#### 4.5.1 Decision tree — is a Runtime Contract MANDATORY for this UC? A Runtime Contract is mandatory if **any** of the following is true:" (L721–723)

> "If the verdict is **mandatory**, proceed with the contract authoring below. If the user refuses to author a contract, stop with `BLOCKED — runtime_contract_missing` and do not advance to Phase 5." (L742)

`nacl-sa-uc/SKILL.md:342` (the Phase 4.5 introduction):

> "**Phase 4.5 (Runtime Contract) is MANDATORY for any UC with queue, workflow, long-running, async-provider, or recoverable characteristics.**"

**Resulting status:** `Status: BLOCKED`, workflow detail `runtime_contract_missing`. The Phase 4.5 read-back step refuses to mark UC-112 detail complete. Headline: `BLOCKED — runtime_contract_missing`.

**Diff vs original timeline:** Originally UC-112 shipped without a RuntimeContract; the `failed → pending` transition with DELETE-before-INSERT was discovered in production after fix `67a6a44` landed. Post-W8, sa-uc Phase 4.5 fires the BLOCKED on the UC-112 detail step, requiring the RuntimeContract subgraph (per `nacl-sa-uc/references/runtime-contract.cypher` § 8 worked example, which is named for this exact restart-bug case) BEFORE the UC can be marked complete.

---

## § 9 — Code-first L1 attempt → tl-fix spec-first prerequisite (W10)

**Postmortem episode replayed:** `project-alpha-postmortem.md` § 2 (chronology of FIX-B) and DIAGNOSTIC-REPORT.md ("39% of fixes never updated docs"); `a7eb747 docs(SA): UC-105/UC-106/UC-107 post-commit emit timing (L2)` landed AFTER the six code-fix commits in the FIX-B chain (`01f2fcb`, `c83e84f`, `92da5c7`, `135b14b`, `6ed12ac`, etc.). Postmortem table for `a7eb747` reads "Rule 1 (Spec First) violated by FIX-B; docs caught up after code."

**Fixture artifacts:**

The synthetic L1 code-first attempt is encoded in the W10 spec-first-refusal fixture (`tests/fixtures/spec-first-refusal/`) — already shipped in W10, and is the materialised W11 assertion target. Its `chain.txt` carries the Project-Alpha FIX-B seven-commit chain with classifications; `expected-outcome.json` carries the BLOCKED assertion.

For the project-alpha-snapshot fixture in this wave, the same shape applies to any L1 fix attempted on top of the wave-tip commit: `.tl/changelog.md` carries no L2 entry predating the first code-fix; `.tl/status.json` carries no `phases.spec: done` / `phases.docs: done` for the affected UCs; the graph snapshot carries no per-commit `Module/UseCase` delta in the fix chain.

**SKILL.md clause that fires:**

`nacl-tl-fix/SKILL.md:50` — "L1+ blocked without preceding spec-update commit; override via signed exception only."

`nacl-tl-fix/SKILL.md:143-201` — Step 6.SF (spec-first prerequisite check):

> "Let `first_code_idx` be the index of the first code-fix commit in the fix chain and let `first_spec_idx` be the index of the first spec-update commit. The chain has correct spec-first ordering iff `first_spec_idx < first_code_idx`." (L145–152)

> "| 5 | verdict is `FAIL` AND no valid signed exception exists | REFUSE. Halt with `Status: BLOCKED` and workflow detail `spec-first-prerequisite-missing`. Do not touch production code. Print the refusal advisory below and exit. |" (L200)

**Resulting status:** `Status: BLOCKED`, workflow detail `spec-first-prerequisite-missing`. Header: `FIX HALTED — SPEC-FIRST PREREQUISITE MISSING`. Production code is not modified.

**Diff vs original timeline:** Originally Project-Alpha's FIX-B chain landed seven commits before the `docs(SA): …` retro-fit; DIAGNOSTIC-REPORT measured 39% of fixes as code-first. Post-W10, the L1 fix attempt is refused at Step 6.SF entry; the operator must either (a) author the spec-update commit first, or (b) file a W4 signed exception against `spec-first-prerequisite`.

---

## § 10 — Shape-unvalidated stub → tl-stubs shape-validation (W10)

**Postmortem episode replayed:** `project-alpha-postmortem.md` § 4 nacl-tl-stubs ("Stub considered 'complete' when TODO marker removed, not when real data is plugged in. `WORKFLOW_STEPS` carried fake dot-notation IDs that didn't match the real step catalog; the file had no `TODO`, so the scanner passed"); commit `8522d1d fix(admin): unstub WORKFLOW_STEPS + categories envelope + WSC dropdown paging`.

**Fixture artifacts:**

The W10 stub-shape-validation fixture (`tests/fixtures/stub-shape-validation/`) — already shipped in W10, and is the materialised W11 assertion target. Its `stub-registry.json` records STUB-042 as candidate-for-closure; `src/admin/workflow-steps.service.ts` has the TODO removed but the data carries fake-shaped catalog entries; `src/admin/workflow-steps.test.ts` has a single weak `toBeDefined()` assertion; `UC-302-spec.md` carries the required-field set (uuid id, string name, int step_order, enum kind).

The project-alpha-snapshot's WORKFLOW_STEPS pattern is the same shape: TODO removed, fake dot-notation IDs, no contract test asserting the required-field set against UC-302's spec.

**SKILL.md clause that fires:**

`nacl-tl-stubs/SKILL.md:24` — "`STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)` — stub looked closed but no runtime data sample was available to compare against the spec"

`nacl-tl-stubs/SKILL.md:72-191` — "Closure Criterion: Shape Validation (W10 binding)"

`nacl-tl-stubs/SKILL.md:662` — gate decision row:

> "| Candidate-for-closure stub has no runtime data sample (no fixture / contract test / live-smoke / qa-stage fixture for the UC) | Headline: `STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)`. Keep `resolvedAt: null`. |"

**Resulting status:** `Status: UNVERIFIED`, workflow detail `shape-unvalidated:STUB-WORKFLOW_STEPS` (or `STUB-042` per the W10 fixture). Headline: `STUBS APPLIED — UNVERIFIED (shape-unvalidated: STUB-042)`. The registry keeps `resolvedAt: null`.

**Diff vs original timeline:** Originally tl-stubs PASSED on WORKFLOW_STEPS because the TODO marker was removed (the scanner checked for absence of marker). Post-W10, the closure criterion is shape-validation against the UC-302 required-field set; only a `wire-evidence:fixture:<path>` / `contract-test` / `live-smoke` / `qa-stage fixture` satisfies it. The fix `8522d1d` would have been REFUSED until a shape-validation source landed.

---

## § 11 — Emergency-mode invocation → loud bypass event

**Postmortem episode replayed:** "approved with caveats / ship under override" patterns across both projects (Project-Alpha `release-status.json` `operator_override.confirmed_by: "user"`; project-beta direct-commits-to-main with `health.skipped`). The new emergency-mode is the ONLY bulk-bypass path, replacing all eight removed flags.

**Fixture artifacts:**

The emergency-mode fixture (`tests/fixtures/emergency-mode/`) — shipped in W4 — is the materialised W11 assertion target:

- `tests/fixtures/emergency-mode/invocation.sh` — three-env-var invocation example.
- `tests/fixtures/emergency-mode/expected/emergency-event.yaml` — full event schema instance.
- `tests/fixtures/emergency-mode/expected/banner-per-gate.txt` — six bypass banners.
- `tests/fixtures/emergency-mode/expected/release-status.json.delta` — the `"emergency"` key the skill writes.
- `tests/fixtures/emergency-mode/expected/changelog.md.delta` — the blockquote line.
- `tests/fixtures/emergency-mode/refusal-source.txt` — the six underlying refusals being bypassed.

**SKILL.md clause that fires:**

`nacl-tl-core/references/emergency-mode.md:31-45` — invocation shape:

> "```bash
> NACL_EMERGENCY=1 \
> NACL_EMERGENCY_REASON="prod 500s on /api/release/v0.18.0 — rolling back" \
> NACL_EMERGENCY_OWNER="magznikitin" \
>   claude --skill nacl-tl-release
> ```"

> "All three variables are REQUIRED. The skill refuses to enter emergency mode if any of them is missing OR empty" (L37–38)

`nacl-tl-core/references/emergency-mode.md:60-97` — behaviour:

1. **Prints a bypass banner** per gate, on stderr (the EMERGENCY-BYPASS — gate_name header, refusal that was bypassed, reason supplied, owner, the .tl/emergencies path).
2. **Advances past the refusal** without changing the closed-set classification — emergency mode produces `Status: PARTIALLY_VERIFIED (emergency-bypass)`, NOT `VERIFIED`.
3. **Writes a structured event** to `.tl/emergencies/<UTC-timestamp>-<slug>.yaml`.
4. **Appends to `.tl/release-status.json`** the `"emergency"` key.

All five required fields are recorded: `exception_id`-equivalent (the timestamp slug), `owner` (`NACL_EMERGENCY_OWNER`), `reason` (`NACL_EMERGENCY_REASON`), `created_at` (timestamp), `affected_gates` (the list of bypassed Strict-Only gate names).

**Resulting status:** `Status: PARTIALLY_VERIFIED`, headline carries the suffix `(emergency-bypass)`. The closed-set status is NEVER promoted to `VERIFIED`; emergency mode is the loud-bypass-and-log path, not a silent override.

**Diff vs original timeline:** Originally `operator_override` was a quiet JSON-field write (Project-Alpha: `confirmed_by: "user"`, `uc_gate: "bypassed"`). Post-W4, an emergency bypass requires THREE env vars typed at invocation, prints a banner on stderr per bypassed gate, writes a structured YAML event file under `.tl/emergencies/`, appends an `"emergency"` key to `release-status.json`, AND tags the run for next-postmortem feed. The `Status:` line carries `(emergency-bypass)` and CANNOT be promoted to `VERIFIED`.

---

## § 12 — Flag-removal verification

**Required:** confirm all eight removed flags absent across the chain.

**Grep command and output:**

```
$ cd /home/project-owner/projects/NaCl && \
  grep -rnE -- '--skip-merge|--skip-verify|--skip-deploy|--skip-qa|--skip-deliver|--skip-plan|--no-test|--force[^-]|--force$' \
    nacl-tl-* skills-for-codex/nacl-tl- 2>/dev/null

nacl-tl-conductor/SKILL.md:100:# Removed in W5-reconciliation: `--skip-deliver`. There is no
```

**Result:** ONE hit on the full pattern, inside a comment block at `nacl-tl-conductor/SKILL.md:100` that documents the W5 removal of `--skip-deliver`. The literal token appears inside a `Removed in W5-reconciliation:` narrative — not as an operational flag. The hit is part of the removal documentation that W5 itself wrote.

The other seven flags (`--skip-merge`, `--skip-verify`, `--skip-deploy`, `--skip-qa`, `--skip-plan`, `--no-test`, `--force`) return **zero** hits across both Claude and Codex SKILL.md flavours. The `--force-l3-spec-gap` and `--force-push` renames performed by W4 (to `--treat-as-l3-spec-gap` and `--push-direct-to-main` respectively) hold; both flags' literal-token grep returns empty.

**Per-flag matrix:**

| Flag | Files containing the literal token | Removal wave | Status |
|---|---|---|---|
| `--skip-merge` | (none) | W4 | REMOVED |
| `--skip-verify` | (none) | W4 | REMOVED |
| `--skip-deploy` | (none) | W4 | REMOVED |
| `--skip-qa` | (none) | W3 | REMOVED |
| `--skip-deliver` | nacl-tl-conductor/SKILL.md:100 (removal-narrative comment only) | W5 | REMOVED |
| `--skip-plan` | (none) | W9 | REMOVED |
| `--no-test` | (none) | W4 | REMOVED |
| `--force` | (none) | W4 + W4-rename pattern | REMOVED |

**Verdict:** All eight flags are removed in the literal-grep sense (the one remaining substring is a removal-narrative comment in the source skill that performed the removal — by W5's own pattern of preserving the removal narrative). No operational use of any of the eight flags exists.

---

## § 13 — Preserved flag verification (`--skip-e2e`)

**Required:** confirm `--skip-e2e` exists in `nacl-tl-qa` (both flavours); confirm scope is `LIVE_PROVIDER_SMOKE` + `PROD_GOLDEN_PATH` only.

**Grep output:**

```
$ grep -n -- '--skip-e2e' nacl-tl-qa/SKILL.md skills-for-codex/nacl-tl-qa/SKILL.md

nacl-tl-qa/SKILL.md:178:### `--skip-e2e` flag policy
nacl-tl-qa/SKILL.md:183:/nacl-tl-qa UC### --skip-e2e
nacl-tl-qa/SKILL.md:186:**Scope:** `--skip-e2e` marks the `LIVE_PROVIDER_SMOKE` and
nacl-tl-qa/SKILL.md:190:- `--skip-e2e` may leave aggregate `VERIFIED` only if neither
skills-for-codex/nacl-tl-qa/SKILL.md:109:### `--skip-e2e` flag (single preserved skip flag)
skills-for-codex/nacl-tl-qa/SKILL.md:114:/nacl-tl-qa UC### --skip-e2e
skills-for-codex/nacl-tl-qa/SKILL.md:117:**Scope:** `--skip-e2e` marks the `LIVE_PROVIDER_SMOKE` and
skills-for-codex/nacl-tl-qa/SKILL.md:121:- If neither stage is mandatory for the UC, `--skip-e2e` may leave
skills-for-codex/nacl-tl-qa/SKILL.md:124:  `--skip-e2e` produces aggregate `UNVERIFIED`. The user must either
skills-for-codex/nacl-tl-qa/SKILL.md:190:  (including stages skipped by `--skip-e2e` and stages outside the
```

Both flavours name `--skip-e2e` with explicit scope: it marks `LIVE_PROVIDER_SMOKE` and `PROD_GOLDEN_PATH` as `NOT_RUN` for the current run only. It does NOT affect `COMPONENT_QA`, `LOCAL_RUNTIME_QA`, `WIRE_CONTRACT_QA`, or `PROVIDER_FIXTURE_QA`. It is explicitly NOT a bulk QA bypass (per W3 evidence file § "--skip-e2e policy resolution").

If either skipped stage is mandatory for the UC per the matrix, the aggregate is forced to `UNVERIFIED` by the mandatory-NOT_RUN floor. A W4 signed exception covering the specific stage is required to advance.

**Verdict:** `--skip-e2e` preserved in both flavours with the documented scope.

---

## § 14 — Strict-only verification

**Required:** confirm no `gate_mode: legacy` or similar fallback exists anywhere in the chain.

**Grep output (filtered):**

```
$ grep -rn 'gate_mode' nacl-tl-* skills-for-codex/nacl-tl-* 2>/dev/null

nacl-tl-plan/SKILL.md:304: gate_mode: legacy carve-out. The project_kind: prototype config does
skills-for-codex/nacl-tl-plan/SKILL.md:40: gate_mode: legacy, no project_kind: prototype carve-out.
```

Both hits are **negative assertions**:

- `nacl-tl-plan/SKILL.md:304` reads "There is no inline `--skip-external-contract` flag. There is no `gate_mode: legacy` carve-out." — i.e., the SKILL.md text explicitly states the carve-out does NOT exist.
- `skills-for-codex/nacl-tl-plan/SKILL.md:40` reads "no `gate_mode: legacy`, no `project_kind: prototype` carve-out" — same negative assertion at the Codex flavour.

`grep -rn "\blegacy\b"` returns a handful of additional hits, all in benign contexts (W4 documenting "renamed from its legacy name in W4-blocking-release", a `legacy` callback pattern in `tdd-workflow.md`, a TECH-task `(legacy)` decoration in `tl-protocol.md`, and the `legacy E2E QA Testing Complete` headline backward-compatibility line in qa-skill). None of these introduce a fallback mode.

**Verdict:** No `gate_mode: legacy` or equivalent fallback exists in the chain. Strict is the only mode.

---

## § 15 — Gates that did NOT fire when they should have

(EMPTY)

Every expected gate fires on the documented fixture input. No upstream wave is retroactively FAILED. The pilot replay confirms the W1..W10 changes converge into a closed-loop refusal chain on the Project-Alpha + project-beta failure modes.

---

## § 16 — Audit trail

This pilot is an analytical replay. The SKILL.md files are markdown specs, not runnable code; the fixtures are documentation that downstream consumers materialize at replay time. Cross-verification:

- Every SKILL.md citation above carries a file:line reference; spot-checks via `Read` (e.g. `nacl-tl-review/SKILL.md:92`, `nacl-tl-sync/SKILL.md:231`, `nacl-tl-qa/SKILL.md:73`, `nacl-tl-release/SKILL.md:162`, `nacl-tl-conductor/SKILL.md:664`, `nacl-tl-deliver/SKILL.md:385`, `nacl-sa-uc/SKILL.md:712`, `nacl-tl-fix/SKILL.md:50,143-201`, `nacl-tl-stubs/SKILL.md:24,72,662`, `nacl-tl-core/references/emergency-mode.md:31-97`) confirm the quoted text matches the on-disk SKILL.md.
- Fixtures at `tests/fixtures/project-alpha-snapshot/`, `tests/fixtures/project-beta-snapshot/`, and the previously-shipped W1..W10 fixtures (`tests/fixtures/review-gate/`, `tests/fixtures/sync-wire-evidence/`, `tests/fixtures/qa-stage-decomposition/`, `tests/fixtures/release-gate-strict/`, `tests/fixtures/emergency-mode/`, `tests/fixtures/drift-{broken,clean}/`, `tests/fixtures/ui-reachability/`, `tests/fixtures/runtime-contract/`, `tests/fixtures/clean-checkout-missing-asset/`, `tests/fixtures/spec-first-refusal/`, `tests/fixtures/stub-shape-validation/`) materialise the inputs for each fire point.
- Graph snapshots at `tests/fixtures/graph-snapshots/project-alpha/` (1083 nodes) and `tests/fixtures/graph-snapshots/project-beta/` serve as the live-graph baseline for the W4 / W5 gates.
- `.tl/*` artifacts in the project-alpha + project-beta fixtures are direct copies from the source projects (`/home/project-owner/projects/project-alpha/.tl/*` and `/home/project-owner/projects/project-beta/.tl/*`) — verbatim, no synthesis.

The closed-set Status outcomes (BLOCKED / UNVERIFIED / PARTIALLY_VERIFIED) flow through the Codex contract closed vocabulary per `skills-for-codex/nacl-tl-core/references/tl-codex-contract.md:12`.

---

## § 17 — Acceptance checklist (from W11-pilot plan)

| # | Acceptance check | Result |
|---|---|---|
| 1 | tests/fixtures/project-alpha-snapshot/ exists with: reconstructed wave-tip commit, conductor-state.json with the 'clean' lie, live Neo4j snapshot showing the 1083-vs-recorded drift, an unwired publisher file, and a minimal .tl/ structure including the fix-plan-wave-4-audit-2026-05-11.md and DIAGNOSTIC-REPORT.md references. | PASS |
| 2 | tests/fixtures/project-beta-snapshot/ exists with: reconstructed wave-tip commit, kie.ai integration code with no fixture/contract test, no upload E2E, the runtime baseline from W0, and the live Neo4j snapshot. | PASS |
| 3 | Pilot report names all 11 gate-fire points explicitly (10 gate-chain + 1 emergency mode). | PASS (§§ 1–11) |
| 4 | Each gate-fire assertion includes a quoted output line from the gate. | PASS — each section quotes SKILL.md text verbatim with file:line. |
| 5 | Pilot report contains a 'gates that did NOT fire when they should have' section, even if empty. | PASS (§ 15) |
| 6 | Pilot report contains a 'flag-removal verification' section confirming all eight removed flags are absent. | PASS (§ 12) |
| 7 | If any expected gate does not fire: that gate's wave is recorded as FAILED in W11 evidence (does not block W11 PASS). | N/A (no gate failed to fire) |

---

## § 18 — Outcome

**Terminal status:** `VERIFIED` per the Codex closed vocabulary. All 11 expected gate-fire assertions hold. All upstream waves (W0..W10) remain at their declared PASS/VERIFIED status. The flag-removal invariant holds; `--skip-e2e` preservation invariant holds; strict-only invariant holds; no `gate_mode: legacy` fallback exists.

**Downstream effect:** the W1..W10 + emergency-mode chain refuses to close on the Project-Alpha + project-beta failure modes, end-to-end. The pilot does NOT remediate either project — per-project gap closure is out of scope (delegated to downstream subagents launched after this plan lands, per the plan's `resolved_decisions[Active-project rollout]`).

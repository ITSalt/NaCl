# Project GAP Closure — Runbook

**Version:** post-W11 (NaCl skill-chain reform W0–W11, completed 2026-05-22).
**Primary consumer:** any agent inspecting an existing project against the
post-W11 strict mode and planning remediation.

---

## Purpose

This runbook is the planning manual for per-project GAP detection. Agents
running this runbook **inspect** a project against the post-W11 strict-mode
chain, classify findings against the eleven canonical gate-fires
(`gate-fire-catalog.md`) and the ten GAP categories named below, and emit
two artifacts — a GAP register and a wave plan that closes the register.
Agents running this runbook do NOT remediate the project; they are
planning-only unless explicitly launched as remediation subagents with
their own scope.

The runbook is the source-of-record for what "the strict-mode chain
requires of an existing project." Reading it end-to-end is sufficient
context to plan a GAP-closure pass — none of the other strict-mode
references are required reading for the plan itself, though they are the
canonical citations the GAP register links to.

---

## Required context to read before inspecting a project

The strict-mode reference layer is the authoritative source for every
claim the GAP register makes. Before any inspection step:

1. `nacl-tl-core/references/strict-mode-changes.md` — what the eleven
   skills now do, the new artifact paths, the forbidden terminal states,
   the strict-only invariants, the preserved `--skip-e2e` scope.
2. `nacl-tl-core/references/gate-fire-catalog.md` — the eleven canonical
   gate-fire points (G1..G11) with SKILL.md file:line citations and
   canonical fixture paths.
3. `nacl-tl-core/references/config-schema.md` — `project_kind`,
   `runtime_assets`, `build.*`, `deploy.smoke.endpoints` — the
   config-side surface every gate keys off.
4. `nacl-tl-core/references/emergency-mode.md` — the only sanctioned
   bulk-bypass path and the side effects every emergency-mode invocation
   MUST produce.
5. `.tl/exceptions/_template.yaml` — signed-exception schema, binding
   rules, recognised gate names, removed-flag rule.
6. `.tl/emergencies/_template.yaml` — emergency-event schema.

Do **not** read W1..W10 wave-evidence files (`~/.nacl/wave-evidence/`)
as input to GAP planning. Those files record what each wave shipped to
NaCl; they are not authoritative for what an existing project is
required to satisfy. The references above are.

---

## Strict-mode principles (self-contained copy)

These are the non-negotiable invariants the chain now enforces. Restated
here so the runbook is readable end-to-end without forcing the reader
into other references.

1. **No `gate_mode: legacy`.** Strict is the single, unconditional mode.
   Every project moves through every Strict-Only gate the same way.
2. **Live Neo4j is the only source of truth.** Reconciliation (W5
   conductor + publish), release graph-stale gate (W4), and downstream
   consumers read the live graph only. A stale `.cypher` export is NEVER
   an acceptable fallback. Unreachable graph → `Status: BLOCKED
   (workflow detail: graph_unavailable)`.
3. **Exports are comparison artifacts only.** A `_summary.json` captured
   pre-release is the snapshot baseline against which the live graph is
   diffed; an export does not substitute for live reads.
4. **Signed exceptions are scoped, expiring, audited.** Required fields:
   `exception_id`, `owner`, `reason` (concrete), `created_at`, `expiry`,
   `affected_gates` (specific gate names; blanket `[*]` rejected),
   `affected_projects`, `followup_task`. Expired exceptions automatically
   become blockers; renewals require a new `exception_id`; removed flags
   are NOT re-enabled by an exception.
5. **Removed flags stay removed.** `--skip-merge`, `--skip-verify`,
   `--skip-deploy`, `--skip-qa`, `--skip-deliver`, `--skip-plan`,
   `--no-test`, `--force` — all removed. The only preserved operator flag
   is `--skip-e2e` on `nacl-tl-qa`, scoped exactly to
   `LIVE_PROVIDER_SMOKE + PROD_GOLDEN_PATH`.

**Forbidden terminal success states.** Any of these masquerading as a
closed terminal success is a P0 gap:

- `APPROVED -- UNVERIFIED`
- `UNVERIFIED` (as terminal success)
- `QA_SKIP` (as terminal success)
- `SKIPPED_CI` (without `project_kind=prototype` AND signed exception)
- `STALE_GRAPH` (as terminal success)
- `DEFERRED_GOLDEN_PATH` (as terminal success)
- `HEALTH_ONLY` (as product-readiness evidence)
- Any silent (`--skip-*` or non-emergency) bypass of a blocking gate.

---

## Ten GAP categories

Every finding the agent records in the GAP register classifies into one of
these ten categories. The category determines the owner skill, the
remediation wave it belongs in, and the severity baseline (further
adjusted per the severity rules below).

### 1. `review_repo_checks`

**Owner skill:** `nacl-tl-review`. **Gate-fire:** G1
(`repo-checks-RED` / `repo-checks-UNRUN` / `repo-checks-UNRUNNABLE`).

**Agent checks.**

- Is the wave-tip commit on the current branch green for repo-wide
  `lint` + `typecheck` + `test`? Run the commands literally per
  `nacl-tl-review/SKILL.md:107-111`: `pnpm -r lint`, `pnpm -r typecheck`,
  `pnpm -r test`. Substitution with `npm` or dropping `-r` is NOT
  acceptable.
- If a script is missing: classify as `repo-checks-UNRUN` (missing script
  counts as unrunnable, not pass; `nacl-tl-review/SKILL.md:115-116`).
- If the workspace has no pnpm or no workspace root: classify as
  `repo-checks-UNRUNNABLE`.
- Does the project keep evidence of the wave-tip green run? A green run
  records `repo-checks-GREEN:<commit-sha>` in the review artifact and in
  `Task.verification_evidence`. Missing evidence on a closed wave is a
  gap.
- Does `config.yaml` declare `project_kind: prototype` and (silently)
  assume the gate relaxes? It does not relax in prototype mode — gap if
  the project assumes otherwise.

### 2. `sync_wire_evidence`

**Owner skill:** `nacl-tl-sync`. **Gate-fire:** G2
(`wire-evidence-missing`).

**Agent checks.**

- For every UseCase in the live graph with `actor != SYSTEM`: does it
  carry at least one wire-evidence artifact? Recognised shapes:
  `wire-evidence:fixture:<path>`, `wire-evidence:contract-test:<path>`,
  `wire-evidence:live-smoke:<timestamp>`
  (`nacl-tl-sync/SKILL.md:259-274`).
- Is the referenced artifact present on disk AND runnable? Reference
  to a non-existent path → `wire-evidence stale`
  (`nacl-tl-sync/SKILL.md:287`).
- Is the FE test only intercepting with MSW (`setupServer(`)? MSW
  interception is NOT wire-evidence — the request never leaves the FE
  (`nacl-tl-sync/SKILL.md:296-306`).
- Is the BE / FE only sharing a TS type without wire-byte parity? TS-type
  alignment is necessary but not sufficient
  (`nacl-tl-sync/SKILL.md:248-252`).

### 3. `qa_stage_missing`

**Owner skill:** `nacl-tl-qa`. **Gate-fire:** G3 (mandatory-NOT_RUN floor).

**Agent checks.**

- For every UC, what does the W3 mandatory-stage matrix declare mandatory
  given the UC's traits (`actor == SYSTEM` vs `actor != SYSTEM`, provider
  dependency yes/no, release-gate UC yes/no)?
  (`nacl-tl-qa/SKILL.md:99-104`).
- Is any mandatory stage at `NOT_RUN`, `FAILED`, or absent? Aggregate is
  forced to `UNVERIFIED` (`nacl-tl-qa/SKILL.md:75-86`).
- Is the project relying on `--skip-e2e` to bypass a mandatory stage
  without a signed exception? `--skip-e2e` only marks
  `LIVE_PROVIDER_SMOKE` and `PROD_GOLDEN_PATH` as `NOT_RUN`; when either
  is mandatory the floor still fires.
- Does the project's `config.yaml → qa_mandatory_stages` override match
  the actual UC traits (`nacl-tl-qa/SKILL.md:119-141`)?

### 4. `release_readiness`

**Owner skill:** `nacl-tl-release`. **Gate-fire:** G4 (the six block
conditions).

**Agent checks (one per W4 block condition).**

- Any upstream `tl-sync` UC at `UNVERIFIED`? → `upstream-sync-unverified`.
- Any `tl-qa` aggregate at `UNVERIFIED`? → `upstream-qa-unverified`.
- Live graph vs snapshot mismatch on the project's Neo4j instance?
  Baseline MUST be a live capture (a stored `_summary.json` from a
  prior live capture is acceptable; a `.cypher` export is NOT). Any
  node-count delta, label-histogram delta, or rel-type-histogram delta
  → `graph-stale`.
- `/nacl-sa-validate full` reports `FAIL` with ≥1 CRITICAL finding? →
  `sa-validate-critical`.
- Any UC with PROD_GOLDEN_PATH mandatory but its qa-stage evidence is
  `qa-stage:prod-golden-path:NOT_RUN` or absent? → `missing-prod-golden-path`.
  A bare HTTP 200 from `/health` is HEALTH_ONLY and NEVER product-readiness
  evidence.
- PR/CI skipped under `git.strategy: direct` without
  `project_kind: prototype` AND a signed exception with `affected_gates`
  enumerating exactly `skipped-pr` and/or `skipped-ci`? →
  `skipped-pr-without-prototype-exception` /
  `skipped-ci-without-prototype-exception`.

### 5. `artifact_drift`

**Owner skill:** `nacl-tl-conductor`. **Gate-fire:** G5
(`artifact-drift`).

**Agent checks (one per P-S* pair).**

- P-S1 — `.tl/status.json` totals match live graph counts.
- P-S2 — every FR in the latest `.tl/changelog.md` section exists as
  `FeatureRequest {id: 'FR-NNN'}` in the live graph.
- P-S3 — `.tl/release-status.json.release_tag` (if non-null) carried on
  ≥1 graph node.
- P-S4 — if `conductor-state.phase == quality_gate_passed` then no
  pending/in_progress remains in `.tl/status.json`.
- P-S5 — every conductor-state task entry status matches live graph
  `Task.status`.

Any failing pair under no active signed exception is a gap. Live graph
reads only — no `.cypher` export fallback. Unreachable graph →
`graph_unavailable` (which is its own gap, classified P0).

### 6. `external_contract_missing`

**Owner skill:** `nacl-sa-architect`. **Consumer:** `nacl-tl-plan`,
`nacl-tl-sync`.

**Agent checks.**

- For every external provider invoked in code (HTTP client to a known
  provider host, SDK import, webhook handler, presigned URL flow): does
  `.tl/external-contracts/<slug>.md` exist?
  (`nacl-sa-architect/SKILL.md:520-541`).
- For every wire-protocol used outside the TS type system (TUS upload,
  SSE, multipart/presigned, reverse-proxy URL scheme, ffmpeg/ffprobe
  runtime): does a contract file exist?
- Each contract MUST carry all eleven required fields
  (`nacl-sa-architect/SKILL.md:545-557`). Field 10 (Fixture-test path) is
  the wire-evidence:fixture target for G2; Field 11 (Smoke-test path) is
  the wire-evidence:contract-test / live-smoke target.
- `nacl-tl-plan` refuses to generate a task whose UC references an
  ExternalContract whose `.md` is absent
  (`nacl-tl-plan/SKILL.md:168-171`, `:963`).

### 7. `ui_reachability_missing`

**Owner skill:** `nacl-sa-ui` (rule owner) + `nacl-tl-review`
(consumer-side refusal). **Gate-fire:** G7
(`nav-actions-missing` / `nav-actions-no-natural-entrypoint-evidence`).

**Agent checks.**

- For every actor-triggered UseCase (`actor != SYSTEM`, `has_ui = true`,
  `entrypoint_type ∉ {deep-link-only, embed-only}`): does its Form
  carry at least one `HAS_INBOUND_ACTION` edge from a Component that is
  *reachable* from a navigation root?
- Reachability traversal walks `parent_menu` chain rooted at a Component
  with `parent_menu IS NULL` and `component_type='navigation'`
  (`nacl-sa-ui/SKILL.md:547-550`).
- Run the `ui_reachability_blockers` query from
  `nacl-sa-ui/references/reachability.cypher` § 4 — any returned row is
  a blocker with reason ∈ {`no-form`, `no-inbound-action`,
  `unreachable-component`}.
- Exemption flags recognised on the UseCase node: `actor='SYSTEM'`,
  `has_ui=false`, `entrypoint_type ∈ {deep-link-only, embed-only}`. UCs
  exempt via the latter need a signed exception naming the operational
  context.

### 8. `runtime_contract_missing`

**Owner skill:** `nacl-sa-uc`. **Gate-fire:** G8
(`runtime_contract_missing`).

**Agent checks.**

- For every UseCase in the live graph: does it satisfy any of the five
  W8 decision-tree clauses (`nacl-sa-uc/SKILL.md:721-730`)?
  - Q1 — async step keywords: queue, worker, async, job, poll,
    schedule, cron, outbox, saga, restart, retry, cancel.
  - Q2 — state-bearing domain entity (the UC produces or modifies a
    BusinessEntity with a `status` / `state` / `lifecycle` / `phase`
    attribute).
  - Q3 — async external provider (linked Requirement to an
    external-contracts.md provider marked `sync_vs_async = "async"`).
  - Q4 — behavioral Requirement whose text contains retry / restart /
    cancel / recover / resume / idempotent.
  - Q5 — `DEPENDS_ON` edge to a UC whose name or description includes
    worker / queue / dispatcher / scheduler.
- If any clause holds: does the UC have a RuntimeContract subgraph
  (`HAS_TRANSITION`, `ACQUIRES_LOCK`, `EMITS_EVENT` edges and the eight
  required fields)?
- If no clause holds: is the opt-out marker recorded
  (`uc.runtime_contract = 'not_required'`)?

### 9. `clean_checkout_failure`

**Owner skill:** `nacl-tl-deliver` (Step 4b) + `nacl-tl-deploy`
(Step 1.0). **Gate-fire:** G6 (`clean-checkout-*`).

**Agent checks.**

- Does `.tl/clean-checkout/<commit>.json` exist for the wave-tip
  commit? (`nacl-tl-deploy/SKILL.md:130-140`).
- Does its `commit` field match the deployed SHA? Mismatch →
  `clean-checkout-commit-mismatch`.
- Run the gate against the wave-tip commit on a fresh checkout:
  - Frozen-lockfile install succeeds (pnpm/npm/yarn per
    `config.yaml → build.package_manager`); mixed lockfiles →
    `clean-checkout-pm-ambiguous`; install fail →
    `clean-checkout-install-failed`.
  - Build succeeds; `requires_prisma_generate: true` honored; fail →
    `clean-checkout-build-failed` / `clean-checkout-prisma-generate-missing`.
  - Migrate succeeds when `build.migrate_cmd` is set;
    `test_database_url` undefined → `clean-checkout-test-database-url-undefined`;
    migrate fail → `clean-checkout-migrate-failed`.
  - Boot entrypoint and curl `deploy.smoke.endpoints`; non-2xx →
    `clean-checkout-smoke-failed`; never opens a port →
    `clean-checkout-entrypoint-no-port`. A defaulted
    `["/api/health"]` smoke list produces `PASS_HEALTH_ONLY` —
    not product-readiness evidence.
  - Every `config.yaml → runtime_assets[]` path present after build;
    any false →
    `clean-checkout-runtime-assets-missing` with the specific path
    captured in `.tl/clean-checkout/<commit>.json →
    runtime_assets_verified[]`.

### 10. `spec_first_violation` / `stub_shape_unvalidated`

**Owner skills:** `nacl-tl-fix` (Step 6.SF), `nacl-tl-stubs` (W10
binding). **Gate-fires:** G9
(`spec-first-prerequisite-missing` / `graph-delta-unobservable`), G10
(`shape-unvalidated:<stub-id>` / `shape-mismatch:<stub-id>, field: ...`).

**Agent checks.**

- For every L1+ fix in recent project history: did a spec-update commit
  precede the first code-fix commit? Check the fix chain via `git log`
  between merge-base and the fix tip; cross-check `.tl/status.json` for
  `phases.docs: done` / `phases.spec: done` timestamps and
  `.tl/changelog.md` for matching L2/L3 doc-update entries before the
  first code-fix.
- For every stub registered as candidate-for-closure: is a runtime data
  sample available (fixture / contract test / live-smoke / qa-stage
  fixture for the UC)? Did shape validation succeed against the spec's
  required-field set AND field types?
- Bare "absence of TODO marker" is NOT closure evidence under the W10
  binding (`nacl-tl-stubs/SKILL.md:72-78`).

---

## Severity rules

Each GAP is assigned a severity P0..P3 from these rules. Severity is
independent of GAP category — a finding in any category may be any
severity depending on its blast radius.

**P0 — Release-blocking and / or producing a forbidden terminal success
state.**

- Any gap that, under post-W11 chain, would block a release with the
  workflow detail of one of the six W4 block conditions.
- Any finding where the project's current closed state matches one of
  the forbidden terminal success states above (`APPROVED -- UNVERIFIED`,
  `UNVERIFIED` as terminal success, `STALE_GRAPH`,
  `DEFERRED_GOLDEN_PATH`, `HEALTH_ONLY` as product-readiness, silent
  `--skip-*` bypass).
- Live graph unreachable AND the project's chain depends on it
  (`graph_unavailable`).
- Examples: red `pnpm -r typecheck` on wave-tip; missing PROD_GOLDEN_PATH
  on a release-gate UC; stale graph vs live (≥1 node delta); a release
  closed with `operator_override.confirmed_by: "user"` and no signed
  exception.

**P1 — Strict-mode invariant violation not currently release-blocking,
but the next attempted release WILL block.**

- Missing wire-evidence on a `actor != SYSTEM` UC that hasn't reached
  the release gate yet.
- Missing nav-actions on an actor-triggered UC that already shipped to
  staging (would have blocked review under W7).
- Missing RuntimeContract on a UC that already shipped to staging.
- Missing `.tl/external-contracts/<slug>.md` for a provider currently
  invoked in code.
- Missing `.tl/clean-checkout/<commit>.json` for a deployed commit.
- Examples: a `wire-evidence:fixture:<path>` reference to a file that
  does not exist on disk; a UC-100 catalog page shipped without an
  upload affordance; a `WORKFLOW_STEPS`-shape stub closed by absence of
  TODO; a kie.ai adapter in code with no `.tl/external-contracts/kie.md`.

**P2 — Latent invariant violation that will surface only on remediation.**

- Signed exception expired more than 7 days ago and still referenced in
  release notes.
- `config.yaml → runtime_assets` not enumerated for a project whose
  pipeline depends on ffmpeg/ffprobe/prompt files (the clean-checkout
  gate would pass trivially with the empty list but a future change
  will surface a runtime asset gap).
- `qa_mandatory_stages` override that names a stage outside the
  recognised set.
- Stubs in the registry with `resolvedAt: null` that have aged > 30 days
  without remediation activity.

**P3 — Documentation / cleanup; no chain refusal possible.**

- Outdated narrative references to removed flags inside SKILL.md prose
  (the removal-narrative comment pattern); cosmetic drift between
  `.tl/changelog.md` formatting and the canonical template; stale
  README pointers.

---

## GAP register schema

The agent writes one GAP register per inspection run. Schema (binding):

```yaml
project: ""                    # project_id from config.yaml or registry
generated_at: ""               # ISO-8601 UTC
mode: "planning-only"          # never anything else
strict_mode: true              # always true post-W11

baseline:
  graph_status: ""             # LIVE | BLOCKED | STALE | NOT_CONFIGURED
  tl_status: ""                # PRESENT | PARTIAL | MISSING
  repo_checks_status: ""       # GREEN | RED | NOT_RUN | UNRUNNABLE
  release_status: ""           # VERIFIED | UNVERIFIED | BLOCKED | HEALTH_ONLY | NONE
  project_kind: ""             # standard | prototype | missing

gaps:
  - gap_id: ""                 # GAP-001, GAP-002, ...
    title: ""                  # short, declarative; one line
    severity: ""               # P0 | P1 | P2 | P3
    status: ""                 # BLOCKED | UNVERIFIED | PARTIALLY_VERIFIED
    gate_that_would_fire: ""   # owner skill name; one of nacl-tl-review,
                               # nacl-tl-sync, nacl-tl-qa, nacl-tl-release,
                               # nacl-tl-conductor, nacl-tl-deliver,
                               # nacl-tl-deploy, nacl-sa-architect,
                               # nacl-sa-ui, nacl-sa-uc, nacl-tl-fix,
                               # nacl-tl-stubs, nacl-publish
    workflow_detail: ""        # repo-checks-RED | wire-evidence-missing |
                               # missing-prod-golden-path | graph-stale |
                               # artifact-drift | nav-actions-missing |
                               # runtime_contract_missing |
                               # clean-checkout-runtime-assets-missing |
                               # spec-first-prerequisite-missing |
                               # shape-unvalidated:<stub-id> | ...
    gap_category: ""           # one of the 10 categories above
    owning_skill:
      - ""                     # one or more from the same list as above
    bounded_context: ""        # subsystem name; empty for single-context projects
    evidence_expected:
      - ""                     # the artifacts/edges/clauses that strict
                               # mode requires for this gap to close
    evidence_found:
      - ""                     # what was actually observed in the project
    source_artifacts:
      - ""                     # file paths, graph queries, .tl/ artifacts
                               # the agent inspected to produce this entry
    impact:
      - ""                     # downstream gates this gap blocks today
    proposed_wave: ""          # W1-reconciliation, W3-external-contracts, ...
                               # references the wave plan below
    dependencies: []           # gap_ids this gap depends on
    confidence: ""             # high | medium | low
```

Multi-skill gaps (e.g. UI reachability — owned by `nacl-sa-ui`, refused
at `nacl-tl-review`) list every owning skill in `owning_skill[]`. The
GAP register is the single artifact downstream wave-planning agents read;
it MUST be self-contained.

---

## Wave-plan schema

Each wave plan closes a slice of the GAP register. Schema follows the
NaCl reform plan's 18-field structure, plus `gap_ids` for traceability.

```yaml
wave_id: ""                    # e.g. W1-reconciliation
title: ""                      # short declarative
priority: ""                   # P0 | P1 | P2 | P3
size: ""                       # XS | S | M | L | XL
why_this_wave_exists: ""       # 2–4 sentences naming the gap class

target_skills:                 # NaCl skills the wave reads or invokes
  - ""
owner_skills:                  # NaCl skills that own remediation actions
  - ""

scope_in:                      # what this wave is permitted to touch
  - ""
scope_out:                     # what this wave MUST NOT touch
  - ""

inputs:                        # files / graph / artifacts the wave reads
  - ""

expected_changes:              # named artifacts/edges/files this wave produces
  - ""

orchestrator_prechecks:        # invariants the orchestrator verifies
  - ""                         # before launching the wave subagent

subagent_instructions: ""      # the prompt block delivered to the subagent

acceptance_checks:             # named, runnable checks; pass/fail per item
  - ""

blocking_rules_added: []       # new gates this wave introduces (rare for
                               # project-side waves; remediation does not
                               # add chain-level gates)

artifacts_to_produce:          # files / graph writes / .tl/ entries
  - ""

dependencies:                  # other wave_ids this wave depends on
  - ""

risks_and_rollback: ""         # rollback marker for the wave

definition_of_done: ""         # terminal status + acceptance summary

gap_ids:                       # GAP-IDs from the register this wave closes
  - ""
```

`owner_skills` is the binding-rule decomposition lever — one owner skill
per wave keeps the subagent's scope and tool surface bounded. Bounded
context per wave (UI vs domain vs runtime) keeps wave-size predictable.

---

## Planning order

The agent executes these phases in order. Each phase has a stop condition
that prevents the next phase from running if a precondition fails.

### Phase 1 — Read the strict-mode references

Read the six required-context files named above. Do NOT read W1..W10
wave-evidence files. Do NOT re-derive strict-mode rules from SKILL.md
text — the references are the canonical surface; SKILL.md citations exist
only to verify the references match on-disk content.

**Stop condition.** If any required reference is missing, halt the run
and report the missing file. Do NOT proceed with a partial reference set.

### Phase 2 — Inspect the project's graph and `.tl/` artifacts

- Reach the project's live Neo4j container per `config.yaml →
  graph.neo4j_bolt_port`. Live reads only — no `.cypher` export
  fallback. Unreachable → record `graph_status: BLOCKED, workflow_detail:
  graph_unavailable` and continue.
- Read `.tl/status.json`, `.tl/conductor-state.json`,
  `.tl/changelog.md`, `.tl/release-status.json`, `.tl/exceptions/`,
  `.tl/emergencies/`, `.tl/reconciliation/`, `.tl/clean-checkout/`,
  `.tl/external-contracts/`.
- Capture the graph signature (node counts per label, rel-type
  histogram) for the snapshot-vs-live diff used by P-S* pairs and the
  W4 graph-stale gate.

**Stop condition.** None — Phase 2 runs through even when the graph is
unavailable; it records `graph_unavailable` as its own gap entry.

### Phase 3 — Inspect code, CI, deploy, tests, runtime dependencies

- Repo-wide commands per `nacl-tl-review/SKILL.md:107-111`:
  `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`. Capture exit
  codes per workspace.
- Run `nacl-tl-deliver` Step 4b shape against the wave-tip commit on a
  fresh checkout (shallow clone, frozen-lockfile install, build,
  migrate, smoke, runtime-asset existence). Capture per-stage status.
- For every external provider invoked in code: enumerate against
  `.tl/external-contracts/`. For every UC's Form: enumerate
  `HAS_INBOUND_ACTION` reachability via the W7 query.
- For every L1+ fix in recent git history: classify chain as
  spec-first / code-first via the Step 6.SF verdict shape.
- For every entry in the stub registry: assess shape-validation status.

**Stop condition.** If runtime dependencies for the gate inspection
(node, pnpm, docker) are unavailable, record what could not be inspected
and emit `confidence: low` on the affected GAP entries.

### Phase 4 — Produce the GAP register

- Classify every finding from Phases 2–3 into one of the ten GAP
  categories and one severity.
- Group by `bounded_context` where the project has multiple subsystems
  (e.g. `api`, `web`, `worker` for a typical multi-workspace project).
- Cross-link `dependencies`: if a P1 gap is blocked by a P0 gap, name
  the P0 in `dependencies[]`.
- Set `confidence: low` on any finding where Phase 3 could not verify
  the on-disk state directly.

**Stop condition.** None — the GAP register is the artifact of Phase 4.

### Phase 5 — Produce the wave plan

- One wave per `(owner_skill, bounded_context)` slice of the GAP
  register where the slice has ≥1 P0 or P1 gap.
- Pure P3 gaps consolidate into a single trailing documentation wave.
- Order waves by dependency: a wave that closes a P0 gap that another
  wave depends on runs first.
- Every wave has explicit `scope_in` / `scope_out`, an
  `acceptance_checks` set that is runnable post-remediation, and a
  rollback marker.
- Every wave names its closed `gap_ids[]`.

**Stop condition.** None — the wave plan is the artifact of Phase 5.

### Phase 6 — Plan-quality checks

The agent verifies its own output before terminating:

- Every gap in the register is closed by exactly one wave.
- No wave references a gap that does not exist in the register.
- Wave dependencies form a DAG (no cycle).
- Every wave's `owner_skills[]` is non-empty and refers only to
  recognised NaCl skill names.
- Every wave's `acceptance_checks[]` is runnable (named files, named
  commands, named graph queries — no "verify manually" placeholders).

**Stop condition.** If plan-quality checks fail, the agent records the
failure in the wave plan's `risks_and_rollback` field and emits its
output with `confidence: low`. The agent does NOT remediate — it stops.

---

## Output artifacts

The agent writes the following files, all under the inspected project's
root.

```
<project>/.tl/gap-closure/<YYYY-MM-DD>-gap-register.yaml
<project>/.tl/plans/<YYYY-MM-DD>-gap-closure-wave-plan.yaml
```

If the project's `.tl/` directory is missing entirely (a true greenfield
state — not "partial"), the agent writes the report to an external
location instead:

```
<project>/docs/gap-closure-<YYYY-MM-DD>.md
```

The external report is a Markdown summary; the YAML files remain the
binding artifacts when `.tl/` exists. Wave 1 of the plan, in the
greenfield case, is always a `.tl/` initialization wave that creates
`.tl/exceptions/`, `.tl/emergencies/`, `.tl/reconciliation/`,
`.tl/clean-checkout/`, `.tl/external-contracts/` with their respective
template files.

Filename convention: `<YYYY-MM-DD>-<artifact-kind>.yaml`. The date is
the inspection date in UTC. Re-running the inspection on a later date
produces a new pair of files; prior runs are kept for the audit trail.

---

## Stop conditions

The agent halts and does NOT emit a partial GAP register when:

- The live Neo4j graph for the project is unreachable AND the project's
  chain depends on it (every project with non-trivial Neo4j writes
  qualifies). The report includes only the `graph_unavailable` entry
  plus a recommendation that the operator restore the graph container
  before re-running.
- `.tl/` is entirely absent. The agent emits an external Markdown
  report at `<project>/docs/gap-closure-<YYYY-MM-DD>.md` whose Wave 1 is
  always `.tl/` initialization. No YAML register is written; the wave
  plan in the Markdown report is the actionable artifact.
- `project_kind` is undeclared in `config.yaml` AND the project's chain
  has release gates that depend on it (i.e., the project is not pure
  spec/design work). The agent records the gap and stops short of
  emitting a wave plan until the operator clarifies.
- Sources of truth conflict in a way the agent cannot resolve without
  mutation (e.g. `status.json` claims a UC `done`, the live graph claims
  it `failed`, the changelog references the FR as shipped, and no
  reconciliation evidence exists). The agent emits a GAP entry naming
  the conflict at severity P0 and stops.
- Required credentials or runtime dependencies (Docker daemon, pnpm
  binary, network access to a provider's sandbox) are unavailable AND
  the inspection cannot complete without them.

In every stop case the agent emits whatever it captured up to the stop
point, marks the run `confidence: low`, and names the missing
precondition in the register's top-level `baseline.notes` field.

---

## What this runbook is NOT

- **Not a license to modify NaCl skills.** This runbook is for
  per-project remediation planning. The NaCl skill chain itself is
  closed; new gates require a future strict-mode reform wave, not a
  per-project run.
- **Not a license to remediate the project.** Planning-only. Agents that
  later execute the wave plan are launched separately, with their own
  scope and tool surface bounded by `scope_in` and `scope_out` per wave.
- **Not a postmortem template.** Postmortems live under
  `docs/retrospectives/`. The GAP register names what is wrong now; it
  does not explain how the project got there. A wave's
  `why_this_wave_exists` line MAY reference a postmortem for context,
  but the register is forward-looking by design.

---

## Related references

- `nacl-tl-core/references/strict-mode-changes.md` — what the eleven
  skills now do.
- `nacl-tl-core/references/gate-fire-catalog.md` — the eleven canonical
  gate-fire points (G1..G11), each citing SKILL.md file:line and W11
  pilot section.
- `nacl-tl-core/references/config-schema.md` — `project_kind`,
  `runtime_assets`, `build.*`, `deploy.smoke.endpoints`.
- `nacl-tl-core/references/emergency-mode.md` — the only sanctioned
  bulk-bypass surface.
- `.tl/exceptions/_template.yaml` — signed-exception schema.
- `.tl/emergencies/_template.yaml` — emergency-event schema.
- `.tl/gap-closure/_template.yaml` — GAP register template (copy from
  this template into `<project>/.tl/gap-closure/`).
- `.tl/plans/_gap-closure-wave-plan-template.yaml` — wave-plan template.

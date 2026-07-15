# NaCl Strict-Mode Changes — Reference

**Version:** post-W11 (NaCl skill-chain reform W0–W11, completed 2026-05-22).
**Scope:** the operational meaning of "strict mode" across the eleven modified
skills, the artifacts the chain produces, the terminal states it forbids, and
the only sanctioned bypass paths.

This file is the stable changelog of what the 12 waves changed. It is not a
postmortem and not a wave plan. Postmortems explain why; wave-evidence files
record what each wave shipped; this file states the rules the chain now
applies.

---

## Shift in posture

Before W1, the chain described evidence and downgraded verdicts to
`UNVERIFIED` when evidence was absent. Downstream closure skills
(`nacl-tl-release`, `nacl-tl-conductor`, `nacl-tl-deliver`) treated
`UNVERIFIED` and skipped stages as PASS-passable — review, qa, sync,
deliver, release all closed with red checks, missing wire-evidence,
NOT_RUN provider QA, stale graphs, and health-only deploys.

Post-W11, missing evidence is **blocking**. The closed Codex vocabulary
(`VERIFIED / PARTIALLY_VERIFIED / BLOCKED / FAILED / NOT_RUN / UNVERIFIED`,
per `skills-for-codex/nacl-tl-core/references/tl-codex-contract.md`) is
preserved, but `UNVERIFIED` and `BLOCKED` are now terminal stop-states for
every downstream closure skill. The only sanctioned overrides are signed
exceptions (durable, scoped, expiring; per `.tl/exceptions/_template.yaml`)
and emergency mode (one-shot, loud; per
`nacl-tl-core/references/emergency-mode.md`). Strict is the single,
unconditional mode — there is no `gate_mode: legacy` and no per-project
opt-out.

---

## Per-skill changes

### `nacl-tl-review` (W1-blocking-review)

**Repo-wide Check Gate** (`nacl-tl-review/SKILL.md:92-133`)
(provenance: `~/.nacl/wave-evidence/W1-blocking-review.md:19-28`).

- Adds a mandatory, strict-only gate that runs `pnpm -r lint`,
  `pnpm -r typecheck`, `pnpm -r test` on the wave-tip commit before any
  quality review. Quoting `nacl-tl-review/SKILL.md:127-128`:
  > "VERIFIED refused if repo checks are red/unrun on wave-tip — override
  > requires signed exception (W4)."
- Refusal verdicts and workflow-detail strings: `repo-checks-RED`,
  `repo-checks-UNRUN`, `repo-checks-UNRUNNABLE`
  (`nacl-tl-review/SKILL.md:123-125`)
  (provenance: `~/.nacl/wave-evidence/W1-blocking-review.md:21-22`).
- `project_kind: prototype` does NOT relax this gate
  (`nacl-tl-review/SKILL.md:149-156`)
  (provenance: `~/.nacl/wave-evidence/W1-blocking-review.md:66`).

**Nav-actions consumer check** (`nacl-tl-review/SKILL.md:163-260`)
(provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:73-88`).

- Adds the W7 reachability consumer-side refusal. For every non-exempt
  affected UC the review must verify (1) a populated `HAS_INBOUND_ACTION`
  edge from a reachable Component, and (2) QA evidence that references a
  natural entrypoint.
- Refusal verdicts and workflow-detail strings: `nav-actions-missing`,
  `nav-actions-no-natural-entrypoint-evidence`
  (`nacl-tl-review/SKILL.md:253-254`)
  (provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:26`).
- Exemptions are property-driven (`UseCase.actor='SYSTEM'`,
  `UseCase.has_ui=false`, `UseCase.entrypoint_type IN ['deep-link-only',
  'embed-only']`) and recorded on the UseCase node or via a signed exception
  (`nacl-tl-review/SKILL.md:188-198`)
  (provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:55`).

**Evidence strings consumed/produced.** `repo-checks-GREEN:<commit>`,
`nav-actions-GREEN:<uc_id>,…`, `nav-actions-EXEMPT:<uc_id>:<reason>` —
written to the review artifact's `Evidence` section and to
`Task.verification_evidence`
(`nacl-tl-review/SKILL.md:135-141`, `:276-289`)
(provenance: `~/.nacl/wave-evidence/W1-blocking-review.md:25`,
`~/.nacl/wave-evidence/W7-ui-reachability.md:83`).

**Flags removed at this skill:** none directly (W1 owns the new gate
surface; flag removals are owned by W3/W4/W5/W9).

---

### `nacl-tl-sync` (W2-blocking-sync)

**Wire-Evidence Gate (Step 7b)** (`nacl-tl-sync/SKILL.md:231-292`)
(provenance: `~/.nacl/wave-evidence/W2-blocking-sync.md:19-27`).

- Static type-alignment is no longer sufficient for SYNC COMPLETE on
  `actor != SYSTEM` UCs. The gate requires one of three recognised
  wire-evidence shapes:
  `wire-evidence:fixture:<path>` (recorded response fixture +
  runnable test),
  `wire-evidence:contract-test:<path>` (contract test against provider
  sandbox), or
  `wire-evidence:live-smoke:<timestamp>` (captured live call)
  (`nacl-tl-sync/SKILL.md:259-274`)
  (provenance: `~/.nacl/wave-evidence/W2-blocking-sync.md:53`).
- Refusal verdict and workflow-detail string: `UNVERIFIED
  (wire-evidence missing)` / `wire-evidence-missing`
  (`nacl-tl-sync/SKILL.md:286`)
  (provenance: `~/.nacl/wave-evidence/W2-blocking-sync.md:53`).
- `actor == SYSTEM` is exempt — exemption is property-driven, not
  operator-driven (`nacl-tl-sync/SKILL.md:276-278`)
  (provenance: `~/.nacl/wave-evidence/W2-blocking-sync.md:87`).
- Static type-alignment passing does NOT promote to PASS when wire-evidence
  is missing (`nacl-tl-sync/SKILL.md:286`).

**Artifact consumed.** `.tl/external-contracts/<slug>.md` (per skill
`nacl-sa-architect` W6) — its required Field 10 (Fixture-test path) is the
gate's `wire-evidence:fixture:<path>` target
(`nacl-sa-architect/SKILL.md:556`, `nacl-sa-architect/SKILL.md:764`)
(provenance: `~/.nacl/wave-evidence/W6-wire-contracts.md:63`).

**Strict-only.** Quoting `nacl-tl-sync/SKILL.md:289-292`:
> "VERIFIED requires wire-evidence for `actor != SYSTEM`; override via
> signed exception only."

---

### `nacl-tl-qa` (W3-blocking-qa)

**Six-stage decomposition + Mandatory-stage matrix**
(`nacl-tl-qa/SKILL.md:73-117`)
(provenance: `~/.nacl/wave-evidence/W3-blocking-qa.md:19-35`).

- The six stages are COMPONENT_QA, LOCAL_RUNTIME_QA, WIRE_CONTRACT_QA,
  PROVIDER_FIXTURE_QA, LIVE_PROVIDER_SMOKE, PROD_GOLDEN_PATH.
- Stage statuses use the closed Codex vocabulary
  (`VERIFIED / PARTIALLY_VERIFIED / FAILED / BLOCKED / NOT_RUN /
  UNVERIFIED`) (`nacl-tl-qa/SKILL.md:60-71`)
  (provenance: `~/.nacl/wave-evidence/W3-blocking-qa.md:21`).
- Aggregate rule: weakest non-NOT_RUN stage status; if any mandatory stage
  per the UC-type matrix is NOT_RUN and no signed exception covers it,
  `aggregate_status := UNVERIFIED (forced floor)`
  (`nacl-tl-qa/SKILL.md:75-86`)
  (provenance: `~/.nacl/wave-evidence/W3-blocking-qa.md:22`).
- Mandatory-stage matrix per UC type — release-gate UCs require all six;
  `actor != SYSTEM` + provider dependency UCs require five (all but
  PROD_GOLDEN_PATH); other rows reduce the set proportionally
  (`nacl-tl-qa/SKILL.md:99-104`)
  (provenance: `~/.nacl/wave-evidence/W3-blocking-qa.md:23`).
- Refusal verdict and workflow-detail string: `QA APPLIED — UNVERIFIED` /
  the named missing stage (e.g. `LIVE_PROVIDER_SMOKE`, `PROD_GOLDEN_PATH`).

**Preserved flag.** `--skip-e2e` — the only operator flag that survives. It
marks `LIVE_PROVIDER_SMOKE` and `PROD_GOLDEN_PATH` as `NOT_RUN` for the
current run; it does not affect the four other stages and is not a bulk QA
bypass (`nacl-tl-qa/SKILL.md:178-190`)
(provenance: `~/.nacl/wave-evidence/W3-blocking-qa.md:24`). When either skipped stage is
mandatory for the UC, the mandatory-NOT_RUN floor still forces aggregate
`UNVERIFIED`.

**Flags removed at this skill.** `--skip-qa` (any bulk QA-skip surface) —
removed in W3. Override requires a signed exception with `affected_gates`
naming the specific stage.

---

### `nacl-tl-release` (W4-blocking-release)

**Six Block Conditions** (`nacl-tl-release/SKILL.md:162-171`)
(provenance: `~/.nacl/wave-evidence/W4-blocking-release.md:19-32`).

| # | Condition | Workflow detail |
|---|---|---|
| 1 | Upstream `tl-sync` verdict is `UNVERIFIED` (W2 wire-evidence missing) | `upstream-sync-unverified` |
| 2 | `tl-qa` aggregate is `UNVERIFIED` (W3 mandatory-stage floor) | `upstream-qa-unverified` |
| 3 | Graph staleness detected — live capture vs snapshot mismatch on the project's Neo4j instance | `graph-stale` |
| 4 | `/nacl-sa-validate full` reports `FAIL` with ≥1 finding at `severity: CRITICAL` | `sa-validate-critical` |
| 5 | Missing PROD_GOLDEN_PATH evidence for any UC where the matrix marks it mandatory | `missing-prod-golden-path` |
| 6 | PR/CI skipped without `project_kind: prototype` AND a signed exception | `skipped-pr-without-prototype-exception` / `skipped-ci-without-prototype-exception` |

**HEALTH_ONLY vs PROD_GOLDEN_PATH distinction**
(`nacl-tl-release/SKILL.md:173-193`)
(provenance: `~/.nacl/wave-evidence/W4-blocking-release.md:24`).

- `HEALTH_ONLY` evidence (HTTP 200 from `/health`) is **never**
  product-readiness evidence on its own. The project-beta episode (health
  green; upload golden path 404 on first real call) is the canonical proof
  (`nacl-tl-release/SKILL.md:181`).
- `PROD_GOLDEN_PATH` is the recorded end-to-end run against production
  evidence required by Condition #5
  (`nacl-tl-release/SKILL.md:183-187`).

**Graph staleness — live reads only.** The baseline MUST come from a live
capture; never from a stale `.cypher` export. Any node-count delta > 0
OR any label-histogram delta OR any rel-type-histogram delta = STALE
(`nacl-tl-release/SKILL.md:168`)
(provenance: `~/.nacl/wave-evidence/W4-blocking-release.md:119`).

**`project_kind: prototype` carve-out is conjunctive** — direct-strategy
releases (no PR, no CI) require BOTH `project_kind: prototype` in
`config.yaml` AND a signed exception with `affected_gates` enumerating
exactly `skipped-pr` and/or `skipped-ci`
(`nacl-tl-release/SKILL.md:195-204`; schema in
`nacl-tl-core/references/config-schema.md:61-95`)
(provenance: `~/.nacl/wave-evidence/W4-blocking-release.md:25`).

**Signed-exception schema owner.** W4 owns the schema at
`.tl/exceptions/_template.yaml`. Binding rules: expired exceptions
automatically become blockers (no grace period); renewals require a new
`exception_id`; no blanket overrides (`affected_gates: ["*"]` rejected as
`exception-affects-blanket-gates`); removed flags are NOT re-enabled by an
exception (`.tl/exceptions/_template.yaml:14-86`)
(provenance: `~/.nacl/wave-evidence/W4-blocking-release.md:22-23`).

**Flags removed at this skill.** `--skip-merge`, `--skip-verify`,
`--skip-deploy`, `--no-test`, `--force` (the literal bulk-bypass surface;
W4 owns the removals). The `--force-l3-spec-gap` and `--force-push`
renames performed by W4 (to `--treat-as-l3-spec-gap` and
`--push-direct-to-main` respectively) hold; both prior literal tokens are
absent from the chain (W11 § 12, `docs/retrospectives/nacl-pilot-W11-report.md:386-394`)
(provenance: `~/.nacl/wave-evidence/W4-blocking-release.md:36-64`).

---

### `nacl-tl-conductor` (W5-reconciliation)

**Phase 4.5: Cross-artifact reconciliation**
(`nacl-tl-conductor/SKILL.md:664-699`)
(provenance: `~/.nacl/wave-evidence/W5-reconciliation.md:19-29`).

- Six sources of truth checked: `.tl/status.json`,
  `.tl/conductor-state.json`, `.tl/changelog.md`, the live Neo4j graph,
  `.tl/release-status.json`, `.tl/exceptions/`
  (`nacl-tl-conductor/SKILL.md:680-687`)
  (provenance: `~/.nacl/wave-evidence/W5-reconciliation.md:22`).
- Pairwise checks P-S1..P-S5 — status.json totals vs live graph counts;
  changelog FR entries vs graph FeatureRequest nodes; release_tag vs graph
  release_tag property; conductor-state phase vs status.json terminal
  statuses; conductor-state per-task entries vs graph Task.status (schema
  at `.tl/reconciliation/_template.json`)
  (provenance: `~/.nacl/wave-evidence/W5-reconciliation.md:139-155`).
- Refusal verdict and workflow-detail string: `Status: BLOCKED` /
  `artifact-drift`. At least one pair failing under no active signed
  exception is a hard refusal.

**Live-graph-only binding.** Quoting `nacl-tl-conductor/SKILL.md:689`:
> "Live graph reads only — no `.cypher` export fallback."

If the project's graph container is unreachable, the gate emits
`Status: BLOCKED` with workflow detail `graph_unavailable`
(`nacl-tl-conductor/SKILL.md:692-695`)
(provenance: `~/.nacl/wave-evidence/W5-reconciliation.md:69`). Operators who must ship under an
unavailable graph file a signed exception against `graph-stale`; the
exception does NOT re-enable export fallback.

**Flags removed at this skill.** `--skip-deliver` — removed in W5
(`nacl-tl-conductor/SKILL.md:100`)
(provenance: `~/.nacl/wave-evidence/W5-reconciliation.md:28`). The literal token is preserved in a
removal-narrative comment only.

---

### `nacl-publish` (W5-reconciliation; cross-skill)

**Pre-publish reconciliation gate** (`nacl-publish/SKILL.md:195-303`)
(provenance: `~/.nacl/wave-evidence/W5-reconciliation.md:24`).

- Mandatory before any Docmost write (`docmost`, `docmost-incremental`,
  `boards-link`). Preview-only commands are exempt
  (`nacl-publish/SKILL.md:200-203`).
- Publish-scope pairwise checks P-P1..P-P3 — changelog FR list vs graph
  FeatureRequest; changelog UC list vs graph UseCase;
  `release-status.json.release_tag` vs graph release_tag property
  (`nacl-publish/SKILL.md:270-274`)
  (provenance: `~/.nacl/wave-evidence/W5-reconciliation.md:70`).
- Refusal verdicts: `Status: BLOCKED (workflow detail:
  graph_unavailable)` when the graph is unreachable
  (`nacl-publish/SKILL.md:242`); `Status: BLOCKED (workflow detail:
  publish-drift)` when any P-P1..P-P3 fails under no active signed
  exception (`nacl-publish/SKILL.md:302`)
  (provenance: `~/.nacl/wave-evidence/W5-reconciliation.md:70`).

**Live-graph-only binding.** Quoting `nacl-publish/SKILL.md:209-211`:
> "Live graph reads only — no `.cypher` export fallback. Exports
> are stale by definition the moment the next graph mutation lands."

---

### `nacl-sa-architect` (W6-wire-contracts)

**Phase 3.5: External Contracts** (`nacl-sa-architect/SKILL.md:514-779`)
(provenance: `~/.nacl/wave-evidence/W6-wire-contracts.md:19-26`).

- Adds a mandatory phase between Context Map and NFR that authors one
  Markdown file per external provider AND per wire-protocol under
  `.tl/external-contracts/<slug>.md` (`nacl-sa-architect/SKILL.md:520-541`)
  (provenance: `~/.nacl/wave-evidence/W6-wire-contracts.md:51-57`).
- Eleven required fields per file (Identity, Endpoint, Auth, Request
  shape, Response shape, Lifecycle sync vs async, File URL reachability,
  Failure codes, Model namespace, Fixture-test path, Smoke-test path)
  (`nacl-sa-architect/SKILL.md:545-557`)
  (provenance: `~/.nacl/wave-evidence/W6-wire-contracts.md:57`).
- Field 10 (Fixture-test path) is the consumer-side target for the W2
  wire-evidence gate: `wire-evidence:fixture:<path>`
  (`nacl-sa-architect/SKILL.md:556`, `:764`)
  (provenance: `~/.nacl/wave-evidence/W6-wire-contracts.md:63`).
- Field 11 (Smoke-test path) is the consumer-side target for
  `wire-evidence:contract-test:<path>` or
  `wire-evidence:live-smoke:<timestamp>`
  (`nacl-sa-architect/SKILL.md:765`)
  (provenance: `~/.nacl/wave-evidence/W6-wire-contracts.md:63`).

**Strict-only.** Quoting `nacl-sa-architect/SKILL.md:774`:
> "Единственный способ обойти отсутствующий контракт — signed
> exception под схемой W4. Inline-флага типа `--skip-external-contract`
> нет и не будет."

(provenance: `~/.nacl/wave-evidence/W6-wire-contracts.md:65-66`).

**Consumer.** `nacl-tl-plan` (W6) reads
`.tl/external-contracts/` and emits `Status: BLOCKED (workflow detail
external-contract-missing)` when generating a task that references a
provider/protocol whose `.md` is absent
(`nacl-tl-plan/SKILL.md:168-171`, `:963`). No `--skip-external-contract`
flag exists (`nacl-tl-plan/SKILL.md:303`)
(provenance: `~/.nacl/wave-evidence/W6-wire-contracts.md:67-79`).

---

### `nacl-sa-ui` (W7-ui-reachability)

**Nav Actions subsection in the Form template** + **HAS_INBOUND_ACTION
edges** (`nacl-sa-ui/SKILL.md:481`, `:484-540`)
(provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:48-59`).

- Every Form whose UseCase has `actor != SYSTEM` MUST enumerate inbound
  action sites — which Component carries the user affordance that opens
  the Form (`nacl-sa-ui/SKILL.md:484-489`)
  (provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:21`).
- `HAS_INBOUND_ACTION` edges are created during `navigation` Phase 3.3
  (`nacl-sa-ui/SKILL.md:751-761`)
  (provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:56`).
- Recording `HAS_INBOUND_ACTION` is forbidden for `actor=SYSTEM` or
  `UseCase.has_ui=false` Forms (`nacl-sa-ui/SKILL.md:538-540`)
  (provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:55`).

**Graph rule — UI Reachability** (`nacl-sa-ui/SKILL.md:542-577`)
(provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:53-71`).

- An actor-triggered UseCase without a `HAS_INBOUND_ACTION` edge from a
  *reachable* Component is a blocker
  (`nacl-sa-ui/SKILL.md:544-545`)
  (provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:54`).
- Reachability traversal walks the `parent_menu` chain rooted at a
  Component with `parent_menu IS NULL` and
  `component_type='navigation'` (`nacl-sa-ui/SKILL.md:547-550`).
- The Cypher template lives at `nacl-sa-ui/references/reachability.cypher`.
  The two queries are `ui_reachability_blockers` (returns every
  blocker row with reason ∈ {`no-form`, `no-inbound-action`,
  `unreachable-component`}) and
  `reachable_components_form_a` / `_form_b`
  (`nacl-sa-ui/SKILL.md:554-562`)
  (provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:63-71`).

**Consumers.** `nacl-sa-validate` runs `ui_reachability_blockers` as an
internal L-rule; any non-empty result forces validator status BLOCKED.
`nacl-tl-review` runs the same query scoped to affected UCs and refuses
APPROVED on any blocker row (`nacl-sa-ui/SKILL.md:564-571`)
(provenance: `~/.nacl/wave-evidence/W7-ui-reachability.md:73-88`).

---

### `nacl-sa-uc` (W8-runtime-fsm)

**Phase 4.5: Runtime Contract (FSM / queue / workflow durable state)**
(`nacl-sa-uc/SKILL.md:710-742`)
(provenance: `~/.nacl/wave-evidence/W8-runtime-fsm.md:11-21`).

- Mandatory for any UC with queue, workflow, long-running, async-provider,
  or recoverable characteristics
  (`nacl-sa-uc/SKILL.md:342`)
  (provenance: `~/.nacl/wave-evidence/W8-runtime-fsm.md:11-15`).
- Decision tree Q1..Q5 — async step keywords; state-bearing domain entity;
  async external provider; behavioral requirement with retry/restart/cancel
  vocabulary; async dependency on another UC
  (`nacl-sa-uc/SKILL.md:721-731`)
  (provenance: `~/.nacl/wave-evidence/W8-runtime-fsm.md:64`).
- Eight required fields per contract (Phase 4.5.2 — owner skill enumerates
  durable state machine, transaction boundaries, locks, emitted events
  with pre-commit/post-commit lifecycle, retry semantics, cancel-while-X
  race resolution, recovery procedure after process crash, idempotency
  key strategy) (`nacl-sa-uc/SKILL.md:744`+)
  (provenance: `~/.nacl/wave-evidence/W8-runtime-fsm.md:55-65`).
- Cypher template at `nacl-sa-uc/references/runtime-contract.cypher`
  (decision-tree query at § 7; worked example at § 8 covers the Project-Alpha
  UC-112 restart-bug shape) (`nacl-sa-uc/SKILL.md:731`)
  (provenance: `~/.nacl/wave-evidence/W8-runtime-fsm.md:36-39`).

**Refusal verdict and workflow-detail string.** Quoting
`nacl-sa-uc/SKILL.md:742`:
> "If the verdict is mandatory, proceed with the contract authoring below.
> If the user refuses to author a contract, stop with
> `BLOCKED — runtime_contract_missing` and do not advance to Phase 5."

(provenance: `~/.nacl/wave-evidence/W8-runtime-fsm.md:92-98`).

UCs that fail the decision tree skip Phase 4.5 with
`uc.runtime_contract = 'not_required'` recorded on the UseCase node
(`nacl-sa-uc/SKILL.md:342`, `:733-740`).

---

### `nacl-tl-deliver` + `nacl-tl-deploy` (W9-ci-clean-checkout)

**`nacl-tl-deliver` Step 4b: CLEAN-CHECKOUT GATE**
(`nacl-tl-deliver/SKILL.md:385-400` and the procedure that follows)
(provenance: `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:9-26`).

- Mandatory before deploy on every delivery. Shallow clone into a fresh
  directory, frozen-lockfile install, recursive build, migrate
  (when configured), smoke against `deploy.smoke.endpoints`, and runtime-
  asset existence check against `config.yaml → runtime_assets`
  (`nacl-tl-deliver/SKILL.md:404-440`+)
  (provenance: `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:9-11`).
- Refusal verdicts and workflow-detail strings (one per failure stage):
  `clean-checkout-install-failed`,
  `clean-checkout-build-failed`,
  `clean-checkout-prisma-generate-missing`,
  `clean-checkout-pm-ambiguous`,
  `clean-checkout-test-database-url-undefined`,
  `clean-checkout-migrate-failed`,
  `clean-checkout-smoke-failed`,
  `clean-checkout-entrypoint-no-port`,
  `clean-checkout-runtime-assets-missing`
  (provenance: `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:23`).
- VERIFIED is refused unless the gate completes with PASS. Quoting
  `nacl-tl-deliver/SKILL.md:400`:
  > "VERIFIED is refused unless this gate completes with PASS."

**Artifact produced.** `.tl/clean-checkout/<commit>.json` (schema at
`.tl/clean-checkout/_template.json`) — captures `commit`, `started_at`,
`completed_at`, `build_status`, `migrate_status`, `smoke_status`,
`runtime_assets_verified`, `terminal_status`, and (when set) the
`exception_id` or `emergency_bypass` flag
(provenance: `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:19`).

**`nacl-tl-deploy` Step 1.0: clean-checkout artifact gate**
(`nacl-tl-deploy/SKILL.md:122-142` per W9-evidence)
(provenance: `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:13-15`).

- Pre-monitor gate that confirms a clean-checkout evidence artifact exists
  for the deployed commit. Refusal verdicts and workflow-detail strings:
  `clean-checkout-artifact-missing`, `clean-checkout-commit-mismatch`,
  `clean-checkout-<blocker_detail>` (`nacl-tl-deploy/SKILL.md:39-41`,
  `:130-140`).
- Absent artifact halts unconditionally — no inline override flag exists.
  The operator must either re-run `nacl-tl-deliver` (which produces the
  artifact) or file a signed exception with
  `affected_gates: [clean-checkout-artifact-missing]`
  (`nacl-tl-deploy/SKILL.md:140`).

**Config-schema additions** for the gate live at
`nacl-tl-core/references/config-schema.md:126-309` —
`runtime_assets: [...]`, `build.*` (package_manager,
requires_prisma_generate, entrypoint, test_database_url, migrate_cmd),
and `deploy.smoke.endpoints`
(provenance: `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:17`).

**Flags removed at this skill.** `--skip-plan` — removed in W9
(also referenced as a chain-wide removal). No inline override exists at
the clean-checkout gate; bypass routes through signed exception or
emergency mode
(provenance: `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:21`).

---

### `nacl-tl-fix` + `nacl-tl-stubs` (W10-fix-discipline)

**`nacl-tl-fix` Spec-First Prerequisite (Step 6.SF)**
(`nacl-tl-fix/SKILL.md:48-50`, `:143-201`)
(provenance: `~/.nacl/wave-evidence/W10-fix-discipline.md:19-26`).

- L1+ fixes (anything that touches production code: L1, L2,
  L3-spec-gap; L3-feature exits at Step 3) require a spec-update commit
  before any code-fix commit in the fix chain. Quoting
  `nacl-tl-fix/SKILL.md:50`:
  > "L1+ blocked without preceding spec-update commit; override via signed
  > exception only."

  (provenance: `~/.nacl/wave-evidence/W10-fix-discipline.md:22`).

- Verdict computation (`nacl-tl-fix/SKILL.md:145-156`): PASS iff
  `first_spec_idx < first_code_idx`. FAIL if no spec-update commit
  precedes the first code-fix commit, or if the chain has code-fix
  commits but no spec-update commits at all.
- Secondary signals: `spec-update-by-status-json` (when
  `.tl/status.json` records `phases.docs: done` or `phases.spec: done`
  before the first code-fix commit timestamp) and
  `spec-update-by-changelog` (when `.tl/changelog.md` carries an entry
  matching the L2/L3 doc-update categories before that timestamp)
  (`nacl-tl-fix/SKILL.md:157-168`)
  (provenance: `~/.nacl/wave-evidence/W10-fix-discipline.md:64-81`).
- Refusal verdict and workflow-detail string: `Status: BLOCKED` /
  `spec-first-prerequisite-missing` (`nacl-tl-fix/SKILL.md:200`); also
  `graph-delta-unobservable` when neither graph-delta detection nor
  secondary signals are available (`nacl-tl-fix/SKILL.md:140-143`,
  `:201`)
  (provenance: `~/.nacl/wave-evidence/W10-fix-discipline.md:85-108`).
- Production code is NOT modified on refusal.

**`nacl-tl-stubs` Closure Criterion: Shape Validation**
(`nacl-tl-stubs/SKILL.md:24`, `:72-191`, `:662`)
(provenance: `~/.nacl/wave-evidence/W10-fix-discipline.md:23`).

- "Absence of TODO marker" is no longer evidence of stub closure. The
  closure criterion is **shape-validation**: a runtime data sample must
  match the spec's required-field set AND field types
  (`nacl-tl-stubs/SKILL.md:72-78`)
  (provenance: `~/.nacl/wave-evidence/W10-fix-discipline.md:96-108`).
- Recognised runtime-data-sample sources: `wire-evidence:fixture:<path>`,
  `wire-evidence:contract-test`, `wire-evidence:live-smoke`, or
  `qa-stage:<stage>` fixture for the UC
  (`nacl-tl-stubs/SKILL.md:662`).
- Refusal verdicts and workflow-detail strings:
  `STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)` — stub looked
  closed but no runtime data sample was available
  (`nacl-tl-stubs/SKILL.md:24`, `:662`);
  `STUBS APPLIED — UNVERIFIED (shape-mismatch: <stub-id>, field: ...)` —
  sampled data diverged from the spec's required-field set or types
  (`nacl-tl-stubs/SKILL.md:25`, `:663`)
  (provenance: `~/.nacl/wave-evidence/W10-fix-discipline.md:96-108`).
- `resolvedAt: null` is preserved on the registry entry until shape
  validation succeeds.

---

## New artifact paths

| Path | Purpose | Introduced |
|---|---|---|
| `.tl/exceptions/` | Signed exception YAMLs (durable, scoped, expiring overrides). Template at `_template.yaml`. | W4 — see `~/.nacl/wave-evidence/W4-blocking-release.md:26` |
| `.tl/emergencies/` | Emergency-mode event YAMLs (one per `NACL_EMERGENCY=1` invocation). Template at `_template.yaml`. | W4 — see `~/.nacl/wave-evidence/W4-blocking-release.md:27` |
| `.tl/reconciliation/` | Conductor Phase 4.5 and publish gate evidence artifacts (pairwise checks P-S1..P-S5 / P-P1..P-P3, live-graph reads only). Template at `_template.json`. | W5 — see `~/.nacl/wave-evidence/W5-reconciliation.md:24-25` |
| `.tl/clean-checkout/` | Per-commit evidence artifacts from `nacl-tl-deliver` Step 4b. Consumed by `nacl-tl-deploy` Step 1.0. Template at `_template.json`. | W9 — see `~/.nacl/wave-evidence/W9-ci-clean-checkout.md:19` |
| `.tl/external-contracts/` | One Markdown file per external provider or wire-protocol, authored by `nacl-sa-architect` Phase 3.5. Eleven required fields. Template at `_template.md`. | W6 — see `~/.nacl/wave-evidence/W6-wire-contracts.md:37` |

---

## Forbidden terminal success states

These states are NEVER acceptable as a closed terminal success for a
release, deliver, deploy, conductor, or any closure run. They are
enumerated verbatim from the W11 closure plan (canonical in this file
and reaffirmed by the SKILL.md gate clauses cited throughout this
document)
(provenance: `~/.nacl/wave-evidence/W11-pilot.md:80-94`):

- `APPROVED -- UNVERIFIED`
- `UNVERIFIED` (as terminal success)
- `QA_SKIP` (as terminal success)
- `SKIPPED_CI` (without `project_kind=prototype` AND signed exception)
- `STALE_GRAPH` (as terminal success)
- `DEFERRED_GOLDEN_PATH` (as terminal success)
- `HEALTH_ONLY` (as product-readiness evidence)
- Any silent (`--skip-*` or non-emergency) bypass of a blocking gate.

The closed Codex `Status:` vocabulary remains `VERIFIED /
PARTIALLY_VERIFIED / BLOCKED / FAILED / NOT_RUN / UNVERIFIED`. The list
above names terminal success patterns that masqueraded as `VERIFIED` /
`COMPLETE` / `APPLIED` headlines in pre-W11 runs; strict mode refuses each.

---

## Strict-only invariants

These invariants hold across the chain post-W11. They are non-negotiable.

1. **No `gate_mode: legacy`.** Strict is the single, unconditional mode.
   Every project moves through every Strict-Only gate the same way.
   Negative assertions verify this in
   `nacl-tl-plan/SKILL.md:304` and
   `skills-for-codex/nacl-tl-plan/SKILL.md:40`.
2. **Live Neo4j is the only source of truth.** Reconciliation (W5
   conductor + publish), release graph-stale gate (W4), and downstream
   consumers read the live graph only. A stale `.cypher` export is NEVER
   an acceptable fallback. Unreachable graph → `Status: BLOCKED
   (workflow detail: graph_unavailable)`.
3. **Exports are comparison artifacts only.** A `_summary.json` captured
   pre-release is the snapshot baseline against which the live graph is
   diffed; an export does not substitute for live reads.
4. **Signed exceptions are scoped, expiring, audited.** Required fields
   per `.tl/exceptions/_template.yaml`:
   `exception_id` (format `EXC-YYYY-MM-DD-<slug>`),
   `owner`, `reason` (concrete justification — single-word reasons like
   "urgent" rejected), `created_at`, `expiry` (ISO-8601; 30d MAX
   recommended), `affected_gates` (specific gate names; `[*]` / `[all]`
   rejected), `affected_projects`, `followup_task`. Expired exceptions
   automatically become blockers (no grace period); renewals require a new
   `exception_id`; no flag re-enablement
   (`.tl/exceptions/_template.yaml:14-86`).
5. **Removed flags stay removed.** `--skip-merge`, `--skip-verify`,
   `--skip-deploy`, `--skip-qa`, `--skip-deliver`, `--skip-plan`,
   `--no-test`, `--force` — all removed. Signed exceptions do NOT re-enable
   them. The only preserved operator flag is `--skip-e2e` on
   `nacl-tl-qa`, scoped exactly to `LIVE_PROVIDER_SMOKE +
   PROD_GOLDEN_PATH`.

---

## Emergency mode

When a Strict-Only gate refusal must be bypassed and no signed exception
applies, the only sanctioned path is emergency mode. Full specification
lives at `nacl-tl-core/references/emergency-mode.md`. This section names
when it applies and what it does NOT do.

**Applies when.** Reactive, time-pressured situations a signed exception
cannot anticipate: production outage rollback, security rollback,
ransomware response. Emergency mode is **not** a `--skip-*` flag and not a
top-level slash command — it is a triple of environment variables
(`NACL_EMERGENCY=1`, `NACL_EMERGENCY_REASON`, `NACL_EMERGENCY_OWNER`)
set in the same shell command that launches the skill
(`nacl-tl-core/references/emergency-mode.md:23-45`)
(provenance: `~/.nacl/wave-evidence/W4-blocking-release.md:28`).

**What it logs.** For every Strict-Only gate the run would have refused,
the skill: (1) prints a bypass banner per gate on stderr; (2) advances
past the refusal without promoting the closed `Status:` to `VERIFIED`;
(3) writes a structured YAML event at
`.tl/emergencies/<UTC-timestamp>-<slug>.yaml`; (4) appends an `"emergency"`
key to `.tl/release-status.json` (for skills that own one); (5) appends
a blockquote line to `.tl/changelog.md`; (6) sets
`postmortem_feed.tagged: true` in the event file so the next
`docs/retrospectives/<release>-postmortem.md` includes the event
(`nacl-tl-core/references/emergency-mode.md:60-123`)
(provenance: `~/.nacl/wave-evidence/W4-blocking-release.md:28`).

**Why loud.** Each side effect is mandatory. A skill that observes
`NACL_EMERGENCY=1` but fails to produce any of these side effects is in a
corrupt state and MUST refuse to advance with `Status: BLOCKED
(emergency-mode-side-effect-missing)`
(`nacl-tl-core/references/emergency-mode.md:151-156`). The terminal
`Status:` of an emergency-mode run carries the suffix `(emergency-bypass)`
and is NEVER promoted to `VERIFIED` — the closed-set status is
typically `PARTIALLY_VERIFIED`.

---

## Preserved flag scope: `--skip-e2e`

The only operator flag that survives the W3/W4/W5/W9 flag-removal sweep.

**Exact scope.** `--skip-e2e` marks `LIVE_PROVIDER_SMOKE` and
`PROD_GOLDEN_PATH` as `NOT_RUN` for the current `nacl-tl-qa` run only. It
does NOT mark COMPONENT_QA, LOCAL_RUNTIME_QA, WIRE_CONTRACT_QA, or
PROVIDER_FIXTURE_QA as NOT_RUN. It is NOT a bulk QA bypass
(`nacl-tl-qa/SKILL.md:178-190`,
`skills-for-codex/nacl-tl-qa/SKILL.md:109-124`).

**Interaction with the mandatory-stage floor.** When either skipped stage
is mandatory for the UC per the W3 UC-type matrix, the aggregate is
forced to `UNVERIFIED` by the mandatory-NOT_RUN floor. A W4 signed
exception covering the specific stage (`affected_gates:
[LIVE_PROVIDER_SMOKE]` or `[PROD_GOLDEN_PATH]`) is required to advance
past the floor.

---

## Related references

- Gate-fire catalog: `nacl-tl-core/references/gate-fire-catalog.md` — the
  eleven canonical fire points, each citing SKILL.md file:line and
  W11-pilot section.
- Project GAP closure runbook:
  `nacl-tl-core/references/project-gap-closure.md` — for per-project GAP
  planners inspecting an existing project against strict mode.
- Config schema: `nacl-tl-core/references/config-schema.md` —
  `project_kind`, `runtime_assets`, `build.*`, `deploy.smoke.endpoints`.
- Emergency mode: `nacl-tl-core/references/emergency-mode.md` — full
  specification of the bulk-bypass surface.
- W11 pilot report: `docs/retrospectives/nacl-pilot-W11-report.md` — the
  source-of-record for all eleven gate-fire assertions.

---

## Provenance

This reference was authored from the following wave-evidence sources at
`~/.nacl/wave-evidence/`. Each represents one of the 12 strict-mode reform
waves. Inline citations above point to specific line ranges within these
files; this list is the canonical roll-up.

- `W0-baseline.md` — pre-reform gate inventory.
- `W1-blocking-review.md` — `nacl-tl-review` repo-wide check gate.
- `W2-blocking-sync.md` — `nacl-tl-sync` wire-evidence gate.
- `W3-blocking-qa.md` — `nacl-tl-qa` six-stage matrix.
- `W4-blocking-release.md` — `nacl-tl-release` upstream + emergency mode.
- `W5-reconciliation.md` — `nacl-tl-conductor` cross-source drift.
- `W6-wire-contracts.md` — `nacl-sa-architect` external contracts.
- `W7-ui-reachability.md` — `nacl-sa-ui` inbound action gate.
- `W8-runtime-fsm.md` — `nacl-sa-uc` runtime-contract subgraph.
- `W9-ci-clean-checkout.md` — `nacl-tl-deliver`/`nacl-tl-deploy` clean checkout.
- `W10-fix-discipline.md` — `nacl-tl-fix`/`nacl-tl-stubs` spec-first + stub validation.
- `W11-pilot.md` — pilot run that proved all gates fire as designed.

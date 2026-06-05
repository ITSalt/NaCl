---
name: nacl-tl-fix
model: sonnet
effort: medium
description: |
  Spec-first bug fixing with automatic documentation sync.
  Auto-detects affected UC/TECH from problem description.
  Classifies fix level (L0/L1/L2/L3), updates docs BEFORE code.
  Use when: fix bug, resolve error, debug issue, something broke,
  or the user says "/nacl-tl-fix" followed by a problem description.
---

## Use with /goal

**Wrap with:** `/nacl-goal fix:<BUG-NNN>` (tier S)

This skill is a good fit for autonomous `/goal` loops because bug fix progress is graph-verifiable: the regression test transitions RED→GREEN in a way the check script can observe, and the fix commit appears in the task's graph evidence. The wrapper composes a completion condition that the regression test is GREEN, a PR is open, and no new test failures appear relative to the pre-fix baseline.

**Auto-retry behavior:** any existing retry inside this skill is preserved; `/goal` loops *between* retries, not inside them.

**Check script:** `nacl-goal/checks/fix.sh`
**Refusals:** see `nacl-goal/refusal-catalog.md` for the gates this wrapper guards.
**Background:** `docs/guides/goal-command.md`

---

# TeamLead Spec-First Bug Fix Skill

## CRITICAL: Follow ALL 8 Steps (across two phases)

**You MUST execute every step of the workflow below, in order, without skipping.**
Do NOT jump straight to fixing code. Do NOT skip triage, context loading, or gap-check.
The full workflow is: TRIAGE → CONTEXT → GAP-CHECK → DEFINE BEHAVIOR → FIX DOCS → FIX CODE → VALIDATE → REPORT.
**Skipping steps leads to regressions. This has been proven empirically.**

The eight steps run across **two cognitive phases** (see "Two-Phase Architecture"
below): Steps 1–5 (DIAGNOSE & SPEC) are delegated to the `diagnostician` agent
(opus); Steps 6–8 (EXECUTE) run inline in this skill (sonnet). The phase boundary
does not relax the "all steps mandatory" rule — it routes each step to the right
model tier.

## Two-Phase Architecture: diagnose (opus) → execute (sonnet)

`nacl-tl-fix` is an **orchestrator over two cognitive tiers**, not a monolith:

- **Phase A — DIAGNOSE & SPEC (Steps 1–5).** Delegated to the `diagnostician`
  agent (opus, high effort). The high-reasoning half: graph impact traversal,
  gap-check, L0/L1/L2/L3 classification, correct-behavior definition, and authoring
  the corrected spec/docs. The diagnostician writes specs and graph nodes but
  **never production code and never commits** — preserving the firewall that the
  spec author ≠ the code author.
- **USER GATE (L2 / L3-spec-gap).** Presented by **this skill** (the orchestrator
  runs in the interactive context; the diagnostician sub-agent cannot talk to the
  user). In autonomous `/nacl-goal` mode the gate auto-resolves exactly as before.
- **Phase B — EXECUTE (Steps 6–8).** Runs inline in this skill (sonnet, the
  developer tier). This is the **honest-execution core**: capture baseline →
  RED-first regression test (itself delegated to a separate test-author sub-agent
  at 6d) → apply fix → six-status determination → impact survey → report. This same
  core is what `nacl-tl-dev-be/fe --continue`, `nacl-tl-reopened`, and
  `nacl-tl-hotfix` delegate into — they are thin wrappers over Phase B, not peers.

### Why this split

The diagnostic half is the work the framework defines as strategist-tier
("misclassified triage wastes entire cycles", `docs/agents.md`). Running it on
sonnet under-powered the single most important guardrail in this skill — the
L3-feature classification. The execution half is code generation from a now-complete
spec, which sonnet handles at opus quality within 2–3% (`docs/agents.md`, developer
rationale). The seam falls **after Step 5** so Phase B receives a COMPLETE spec —
restoring the developer-tier premise of "codegen from complete specifications".

A skill executes in one model context, so the only way to change tier mid-skill is
to delegate a phase to a sub-agent. This seam mirrors the existing 6d test-author
seam.

### Phase A delegation (how the orchestrator invokes the diagnostician)

At invocation, after parsing flags, this skill delegates Phase A:

```
Agent: diagnostician
Prompt: Load /nacl-tl-fix Phase A (Steps 1–5) for this bug. Execute TRIAGE,
        CONTEXT LOAD, GAP-CHECK + classification, DEFINE CORRECT BEHAVIOR, and
        (L2/L3 only) FIX DOCS. Write doc/spec/graph changes to the working tree
        but DO NOT COMMIT and DO NOT touch production code. Return the fix-plan
        artifact below.
Inputs:  <verbatim user problem description>, flags (--uc, --dry-run,
         --treat-as-l3-spec-gap), config.yaml graph section, goal-context env
         vars if present.
```

The diagnostician returns the **fix-plan artifact**:

```yaml
classification: L0 | L1 | L2 | L3-spec-gap | L3-feature
exit_reason: null | "L3-feature"        # if L3-feature, orchestrator prints the
                                          # Step 3 routing report and EXITS — no code.
affected:
  ucs: [UC-###, ...]                      # union of Step 1 Stage 2 + Stage 3
  domain_entity: { id, name }
  module: ...
  code_files: [...]
  docs: [...]
  tasks: [...]
root_cause: "..."
correct_behavior:                         # Step 4
  current: "..."
  expected: "..."
  unchanged: ["..."]
decision:                                 # Step 4/5 — L2 / L3-spec-gap ONLY (null for L0/L1)
  title: "..."                            # one line: what was decided about the behavior
  chosen: "..."                           # = correct_behavior.expected
  rationale: "..."                        # = root_cause + why expected is correct  [REQUIRED]
  alternatives_considered: ["keep current (rejected: <root_cause>)"]
  context: "..."                          # = correct_behavior.current
  justifies_ucs: [UC-###, ...]            # = affected.ucs (artifacts this decision shapes)
  supersedes: null | "DEC-NNN"            # if this reverses an earlier decision
  # The Decision is the graph-native "why" record. It is written as part of the
  # Phase B spec-update commit (Step 6 / 7) so the 6.SF detector counts it as a
  # spec mutation. nacl-sa-validate L9 refuses a structural change with no Decision.
docs_changed:                             # Step 5 — written to working tree, UNCOMMITTED
  - { path: ..., diff: ... }              # or graph-mutation descriptor
  # empty for L0/L1
gapcheck_attestation:                     # L1 ONLY — the on-record proof that docs are
                                          # already current (there is nothing to change).
                                          # null for L0/L2/L3. See Step 5 (L1 branch) + 6.SF.
  affected_docs: [...]                    # docs compared against code in Step 3
  verdict: "no-drift"                     # docs describe the correct behavior
  checked_by: "diagnostician"
gate_payload:                             # what to show at the USER GATE (L2/L3); null otherwise
  docs_to_change: [...]
  doc_diffs: ...
  code_fix_plan: "..."
impact_targets:                           # seeds Step 7.5 data-flow survey
  read_paths:    [{ uc, file }]
  write_paths:   [{ uc, file }]
  refresh_paths: [...]
  source_of_truth: code | user_data
impact_unverified: false                  # true if Neo4j was unavailable (Step 1 flag)
```

This skill (Phase B) consumes the artifact, presents the USER GATE if
`gate_payload` is non-null, then proceeds to Step 6 — committing the spec-update
FIRST (which satisfies the 6.SF spec-first prerequisite by construction, since the
diagnostician left docs uncommitted) and then the code fix.

**Fallback (no Agent tool / Codex runtime):** if sub-agent delegation is
unavailable, this skill executes Phase A inline on its own model. This is the
behavior of the `skills-for-codex` variant, which is intentionally left monolithic.

## Contract

This skill's **output contract** is consumed by downstream skills. If any of the
following changes, every consumer below MUST be audited and updated in the same
release (the absence of this section is what let the 0.10.0→0.10.1 status-vocab
change ship without auditing consumers):

**Output contract:**
- Six-status vocabulary: `PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | REGRESSION`
- Step 8 report header strings (see Step 8 table)
- The authoritative `Status:` line
- The regression-test seam block (`Tests > Regression test`, `Tests > RED→GREEN`)

**Downstream consumers:**
- `nacl-tl-dev-be` (`--continue` delegates here)
- `nacl-tl-dev-fe` (`--continue` delegates here)
- `nacl-tl-reopened`
- `nacl-tl-hotfix`

**This restructure (diagnose/execute split) changes the *internal* flow only.**
Steps 7–8 (status machine + report) are unchanged, so the output contract is
preserved and the consumers above need no change. The `## Contract` section is a
documentation discipline, not a runtime mechanism.

## Routing — When `/nacl-tl-fix` vs `/nacl-tl-intake`

`/nacl-tl-fix` handles one bug whose classification is unambiguous (existing UC is broken, error message names a known surface). Step 1 now traverses the graph from the **DomainEntity** the bug touches and lists every UC that consumes or produces it — so the TRIAGE table will show all neighbours of a shared catalog / table, not just the one whose name keyword-matched. Review those neighbours before approving the fix.

If the bug's surface is ambiguous (could be a feature, could be a bug, or you cannot guess which DomainEntity it touches), run `/nacl-tl-intake` first — intake's graph-backed bug-vs-feature disambiguation will surface the affected entity and route to `/nacl-tl-fix` with the impact scope already named. Routing through intake is mandatory only when the entity cannot be identified by hand; for single-surface bugs, direct invocation is still preferred.

## Your Role

You are a **senior developer and specification maintainer** who fixes bugs using the spec-first approach. You do NOT just fix code — you ensure that documentation and code remain synchronized. Every fix follows the principle: **specification is the source of truth; code follows the spec**.

When you run the full skill you act as the **orchestrator**: you delegate the
diagnose-and-spec half (Phase A, Steps 1–5) to the `diagnostician` sub-agent
(opus), present the USER GATE, then execute the honest-execution core (Phase B,
Steps 6–8) yourself (sonnet). When the `diagnostician` runs Phase A it adopts the
diagnostic role described under each of Steps 1–5; the role text below applies to
both, scoped by phase.

## Key Principle: Spec-First

```
WRONG (code-first):  Find bug → Fix code → Forget docs → Next session reads stale docs → Regression

RIGHT (spec-first):  Find bug → Read docs → Check for drift → Fix docs → Fix code to match → Validate
```

The spec-first approach is supported by:
- **Kiro bugfix specs** (AWS 2025): Define Current → Expected → Unchanged BEFORE coding
- **TDD**: Write failing test (= spec) first, then fix code
- **GitHub Spec Kit**: "Specification is the durable thing, code is the flexible thing"
- **Thoughtworks 2025**: Separate design and implementation phases

---

## Spec-First Prerequisite (Strict-Only) — W10 binding

**No code change ships while its spec is stale. The required spec-first evidence
depends on the fix level:**

- **L2 / L3-spec-gap** — the docs *do* change, so the evidence is a **spec-update
  commit** that precedes the first code-fix commit.
- **L1** — by definition docs are already current and there is nothing to change,
  so the evidence is a **gap-check attestation** (the Step 3 result recorded to
  `.tl/status.json` / `.tl/changelog.md`, timestamped before code — see Step 5 L1
  branch). A spec-update *commit* is NOT required for L1; demanding one would make
  every honest L1 impossible to pass without a signed exception.
- **L0** — environment/infra, not spec-touching: the gate is skipped.

For any fix that touches production code (L1, L2, L3-spec-gap; L3-feature already
exits at Step 3), this skill **refuses to enter Step 6 (APPLY FIX)** unless the
level-appropriate evidence above is present and predates the first code-fix commit.
Override via signed exception only.

A **spec-update commit** is any commit that mutates one of the following:

1. **Graph state** — at least one of the following Neo4j node labels was
   created or modified by the commit (detected via the W5 reconciliation
   primitives, see "Detection logic" below):
   `DomainEntity`, `DomainAttribute`, `Enumeration`, `UseCase`,
   `FormField`, `Module`, `Requirement`, `FeatureRequest`,
   `BusinessRule`, `Activity`, `Decision`.
2. **`.tl/*` schema artifact** — at least one of:
   `.tl/tasks/<TASK_ID>/task-{be,fe}.md`,
   `.tl/tasks/<TASK_ID>/api-contract.md`,
   `.tl/tasks/<TASK_ID>/spec.md`,
   `.tl/feature-requests/<FR-ID>.md`,
   `.tl/specs/<UC>.md`,
   any fixture under `.tl/fixtures/`.
3. **SA-layer docs** (legacy markdown projects without graph) — at least
   one of: `docs/12-domain/**`, `docs/14-usecases/**`,
   `docs/15-interfaces/**`, `docs/16-requirements/**`.

A commit that touches *only* code under `src/`, `backend/`, `frontend/`,
`packages/`, or `tests/` (other than fixture files) — including a commit
whose subject begins with `fix(...)` — is a **code-fix commit**, not a
spec-update commit, regardless of the message.

### Why this gate exists

Project-Alpha shipped Wave 4 with `a7eb747 docs(SA): UC-105/UC-106/UC-107
post-commit emit timing (L2)` landing **AFTER** the FIX-B code wave
(`01f2fcb`, `135b14b`, `6ed12ac`, `3acb2fd`) — the spec caught up to code,
not the other way around. The DIAGNOSTIC-REPORT.md dated 2026-05-18 measured
**39% of fixes never updated documentation at all**. Every undocumented
fix made the next post-mortem harder because the spec snapshot used to
diagnose drift was itself unreliable (Project-Alpha post-mortem § 1 patterns
2 & 3, § 3.12, § "Process/docs catch-up" row of the bucket table).

The Step 6 entry gate below makes that pattern impossible to repeat without
an audited signed exception.

### Detection logic (uses W5 reconciliation primitives)

The detection runs at Step 6 entry, after Step 5 USER GATE has resolved
(or been skipped for L1). It reads the same six sources of truth that
`nacl-tl-conductor` Phase 4.5 reads, scoped to the fix chain rather than
the intake:

1. **Define the fix chain.** The fix chain is the sequence of commits
   between the merge-base of the current branch with `main` (or
   `config.yaml → git.main_branch`) and `HEAD`. On direct-strategy
   projects (`config.yaml → git.strategy == "direct"`), the fix chain is
   the commits between the last tag and `HEAD` instead.

   ```bash
   git rev-list --reverse <merge-base>..HEAD
   ```

2. **Classify each commit.** For each commit in the chain, run:
   ```bash
   git diff-tree --no-commit-id --name-only -r <sha>
   ```
   Apply the lists above:
   - Any path matching the graph-mutation detector (see Step 6.SF-3 below)
     OR matching a `.tl/*` schema artifact OR matching the SA-layer docs
     globs → commit is a **spec-update commit**.
   - Otherwise → commit is a **code-fix commit**.

3. **Detect graph mutation in a commit.** Direct file-level inspection is
   not enough — graph writes live outside the file tree. The detection
   reads the W5-style "graph delta" between two snapshots, but scoped to
   the commit boundary:

   a. If the project has a `graph-infra/exports/<commit>.cypher` artifact
      (the canonical per-commit export written by `nacl-publish`), diff
      the commit's export against its parent's export. Any non-empty diff
      that adds or modifies a node with one of the labels listed under
      (1) above is a graph mutation.

   b. If no per-commit export exists, fall back to the commit's
      `.tl/changelog.md` entry: a commit whose `.tl/changelog.md`
      addition references `/nacl-sa-*` skill invocation (e.g. "via
      /nacl-sa-domain", "via /nacl-sa-uc") is treated as a graph-mutation
      commit. The fallback is recorded as `graph-mutation-by-changelog`
      in the Step 8 report.

   c. If neither (a) nor (b) is available, the detection emits
      `Status: BLOCKED` with workflow detail `graph-delta-unobservable`
      and refuses to enter Step 6. A signed exception against the
      gate `spec-first-prerequisite` is the only override (see below).

4. **Apply the spec-first invariant.** Let `first_code_idx` be the index
   of the first code-fix commit in the chain, and let
   `last_spec_idx_before_code` be the maximum index among spec-update
   commits strictly preceding `first_code_idx`.

   - **PASS** if `last_spec_idx_before_code` exists (≥ 0) — there is a
     spec-update commit before any code-fix commit, satisfying the
     spec-first ordering for this fix chain.
   - **FAIL** if no spec-update commit precedes the first code-fix
     commit, OR if the chain contains code-fix commits but no
     spec-update commits at all.

5. **Cross-check against `.tl/status.json` and `.tl/changelog.md`.** As a
   secondary safeguard (the same `status.json` + `changelog.md` pair
   that W5 Phase 4.5 reads):
   - If `.tl/status.json` records a `phases.docs: done` or `phases.spec:
     done` entry whose timestamp is strictly before the first code-fix
     commit timestamp, the chain has spec-update evidence even if no
     graph mutation was detected. Record this as
     `spec-update-by-status-json` in the Step 8 report. **This is the
     channel that carries the L1 gap-check attestation**: a
     `phases.spec: { status: "done", kind: "gapcheck-no-drift" }` entry
     (written in Step 5's L1 branch) is a valid `spec-update-by-status-json`
     signal — it is the level-appropriate evidence for L1, which never
     produces a doc-change commit.
   - If `.tl/changelog.md` has an entry whose timestamp precedes the
     first code-fix commit and whose body mentions any of the L2/L3
     doc-update categories (enum/status, API endpoint, UC flow, screen
     spec — see Step 5 matrix), record as `spec-update-by-changelog`.

6. **Compose the verdict.** PASS iff (4) PASS OR (5) records at least
   one spec-update signal predating the first code-fix commit. FAIL
   otherwise.

### Step 6 entry gate (the refusal)

At the start of Step 6, immediately after announcing
"Step 6: APPLY FIX" and before any code-touching action:

```
Step 6.SF-1: SPEC-FIRST PREREQUISITE CHECK
  classification:        <L0 | L1 | L2 | L3-spec-gap>
  fix_chain_commits:     <N> commits between <merge-base>..HEAD
  spec_update_commits:   <list of SHAs classified spec-update, or "none">
  code_fix_commits:      <list of SHAs classified code-fix, or "none">
  first_code_fix_idx:    <index in chain, or "n/a — no code-fix yet">
  last_spec_idx_before_code: <index, or "none">
  status.json signal:    <spec-update-by-status-json | none>
  changelog signal:      <spec-update-by-changelog | none>
  L1 attestation:        <gapcheck-no-drift (predates code) | none | n/a (not L1)>
  verdict:               <PASS | FAIL>
```

Apply the rules in order — first match wins:

| # | Condition | Action |
|---|---|---|
| 1 | classification is `L0` | SKIP gate. Proceed to Step 6 sub-flow 6M / TDD. (L0 is environment / infra, not spec-touching.) |
| 2 | `--dry-run` is set | SKIP gate. The check is recorded in the Step 8 report but does not refuse, since no code is written. |
| 3 | verdict is `PASS` | Proceed to Step 6 sub-flow. Record the satisfying evidence in the Step 8 report: for L2/L3 the spec-update commit SHA; for **L1** the gap-check attestation (`gapcheck-no-drift`, `phases.spec` ts predating code). |
| 4 | verdict is `FAIL` AND a valid signed exception against gate `spec-first-prerequisite` exists for this project (W4 schema; unexpired; specific `affected_gates`; concrete `reason`; valid `followup_task`). Lookup scans **both** namespaces: `.tl/exceptions/*.yaml` (human-authored, persistent) AND `.tl/exceptions/goal-runs/*/EXC-goal-*.yaml` (wrapper-authored by `/nacl-goal intake`, run-scoped, expires with the run — see `nacl-goal/envelope.md`) | Proceed to Step 6 sub-flow. Record the `exception_id`, `expiry`, and `followup_task` in the Step 8 report. The header becomes `FIX APPLIED — UNVERIFIED (spec-first-bypassed-by-signed-exception)`. |
| 5 | verdict is `FAIL` AND no valid signed exception exists | REFUSE. Halt with `Status: BLOCKED` and workflow detail `spec-first-prerequisite-missing`. Do not touch production code. Print the refusal advisory below and exit. |
| 6 | detection emitted `Status: BLOCKED (graph-delta-unobservable)` AND no signed exception against gate `spec-first-prerequisite` exists | REFUSE with workflow detail `graph-delta-unobservable`. |

**How L1 maps onto these rules (no special-case skip).** L1 stays inside the same
verdict machinery; nothing routes around it:
- **L1 with attestation → PASS via rule 3.** The `gapcheck-no-drift` entry in
  `.tl/status.json` (Step 5 L1 branch), timestamped before code, is read by detection
  step 5 as `spec-update-by-status-json`, so verdict step 6 composes to PASS. The
  satisfying evidence recorded is the attestation, not a doc commit.
- **L1 with NO attestation → FAIL → rule 5 (REFUSE).** A missing attestation means
  Phase A's gap-check never ran (or was not recorded) — the "jumped straight to code"
  case the gate exists to catch. The fix is to re-run Phase A so the diagnostician
  records the attestation, **not** to file a signed exception. The refusal advisory
  below names this path for L1.

This is why L1 no longer needs a signed exception to ship: the honest L1 path produces
its own level-appropriate evidence.

#### Refusal advisory (rule 5)

```
┌──────────────────────────────────────────────────────────┐
│ FIX HALTED — SPEC-FIRST PREREQUISITE MISSING              │
├──────────────────────────────────────────────────────────┤
│ Classification: <L1 | L2 | L3-spec-gap>                   │
│                                                           │
│ The fix chain contains <N> code-fix commit(s) but no      │
│ level-appropriate spec-first evidence preceding the       │
│ first code-fix commit.                                    │
│                                                           │
│ Without that ordering, the post-mortem record shows that  │
│ 39% of fixes never update docs (Project-Alpha postmortem).│
│ The fix skill refuses to ship into that pattern.          │
│                                                           │
│ Paths forward (no flag bypass):                           │
│                                                           │
│ IF L1 (the common case — docs ARE current):               │
│   [1] Re-run /nacl-tl-fix. The diagnostician (Phase A)    │
│       records the gap-check attestation                   │
│       (phases.spec: gapcheck-no-drift) to .tl/status.json │
│       BEFORE Phase B writes code, and the gate passes.    │
│       No doc change and no signed exception are needed —  │
│       a missing attestation just means Phase A's          │
│       gap-check did not run or was not recorded.          │
│                                                           │
│ IF actually L2/L3 (Step 3 mis-skipped Step 5):            │
│   [2] Return to Step 3, re-classify, author the doc       │
│       change, and commit the spec update FIRST. Re-invoke │
│       and the gate passes by construction.                │
│                                                           │
│ IF genuinely L1 but detection has a false negative        │
│ (e.g. external code-mode workspace where the spec lives   │
│ outside .tl/ and outside the graph, so the attestation    │
│ cannot be written):                                       │
│   [3] File a signed exception against gate                │
│       `spec-first-prerequisite` per W4 schema:            │
│       - affected_gates: [spec-first-prerequisite]         │
│       - reason: <why the attestation can't be recorded>   │
│       - expiry: ≤ 24h                                     │
│       - followup_task: <UC/TECH that audits it>           │
│                                                           │
│ Status: BLOCKED                                           │
│ Workflow detail: spec-first-prerequisite-missing          │
└──────────────────────────────────────────────────────────┘
```

#### Worked example — the Project-Alpha 39% pattern

The historical episode that motivates this gate (Project-Alpha post-mortem
§ 3.12 and § "Process/docs catch-up"):

- **Chain on `main` between Wave 4 close and the FIX-B audit:**
  `01f2fcb` (code: wire post-commit task events L2),
  `c83e84f` (code: valid UUID fixtures), `92da5c7` (code: schema namespace),
  `135b14b` (code: gate post-commit emits), `6ed12ac` (code: cancel/fail
  race correctness), `3acb2fd` (code: lock tasks row FOR UPDATE),
  `a7eb747` (docs: UC-105/UC-106/UC-107 post-commit emit timing).
- **Order of spec vs code:** the docs commit (`a7eb747`) lands LAST.
  Every preceding commit is a code-fix commit. There is no spec-update
  commit before any code-fix commit.
- **W10 verdict:** FAIL. First code-fix is `01f2fcb` at index 0;
  `last_spec_idx_before_code` is `none`. Rule 5 fires. Refusal advisory
  prints. Status: `BLOCKED`, workflow detail
  `spec-first-prerequisite-missing`.
- **Operator paths:** (1) commit the SA spec updates first, with the L2
  classification reasoning, then re-run the fix wave; (2) file a signed
  exception per the W4 schema if Wave 4 must close on emergency
  grounds. Path (1) is what would have made the next post-mortem read
  the spec snapshot as truth instead of as drift.

---

## Invocation

The user describes the problem in natural language. They do NOT need to specify UC or TECH IDs:

```
/nacl-tl-fix "VK auth doesn't redirect back after login"
/nacl-tl-fix "500 error when completing interview"
/nacl-tl-fix "Typing indicator stuck when returning to dialog"
/nacl-tl-fix "Migration fails on prod: import.meta.url not supported"
/nacl-tl-fix "generation.test.ts — 8 failing tests"
```

Optional flags:
```
/nacl-tl-fix --dry-run "description"            # analysis only, no changes
/nacl-tl-fix --l1 "description"                 # force L1 (skip docs)
/nacl-tl-fix --auto-ship "description"          # after fix, automatically run /nacl-tl-ship
/nacl-tl-fix --uc UC### "description"           # pin the affected UC explicitly (overrides Step 1 auto-detect)
/nacl-tl-fix --from-review "description"        # invocation source = review; metadata-only marker
```

#### `--from-review` (metadata-only)

When invoked with `--from-review`, this skill records `invocation_source: review`
in the fix report metadata and in the `.tl/changelog` entry. It does NOT change
the six-status contract, the baseline-capture procedure, or the RED-first
discipline — every gate at Step 6 and Step 7 still applies. The flag exists so
that downstream consumers (e.g. `/nacl-tl-dev-be --continue`,
`/nacl-tl-dev-fe --continue`, `/nacl-tl-dev --continue`) can prove their
review-rework path delegated to `/nacl-tl-fix` rather than running an inline
test-after-change loop.

Implementation:
- The Step 8 report adds a single line under "Problem":
  `Invocation source: review (--from-review)`.
- Step 7.6 changelog block adds: `- **Invocation source:** review` (omit when
  the flag is not passed).
- No behavior beyond traceability is changed by this flag.

---

## Fix Levels

| Level | Condition | Docs needed? | Example |
|-------|-----------|-------------|---------|
| **L0** (Environment) | Not a code or docs bug — infrastructure/config issue | No | Missing DB migrations, wrong env vars, stale cache, wrong Node version |
| **L1** (Code-only) | Docs are current and describe correct behavior. Code doesn't match | No | CSS bug, null check, wrong condition, test DB out of sync |
| **L2** (Spec-sync) | Docs exist but describe OLD behavior. Code evolved past docs | Yes, update | Enum added, API changed, flow changed |
| **L3-spec-gap** (inline minor spec) | Code path exists and works; only a UC node / enum value / minor doc is missing. Fix is < 1 file. | Yes, minor inline addition | Missing enum value an existing endpoint already returns; missing UC node for an existing route |
| **L3-feature** (NOT a fix — route to `/nacl-sa-feature`) | Code path does NOT exist. The "fix" would require creating new behavior. | n/a — exits at Step 3 | "Restart button missing" (no BE endpoint, no FE component, no enum transition); "Add SSE protocol" (no SSE infra exists); new auth provider; payments |

**Classification criterion for L3.** If Step 3 GAP-CHECK shows that resolving the request would require creating **any** of the following — **classify as L3-feature, not L3-spec-gap**:
- a new HTTP route, GraphQL field, or RPC method
- a new DB column, table, or migration introducing a new schema concept
- a new graph entity (DomainEntity, UseCase, Module, Enumeration)
- a new FE page or top-level component
- a new enum transition that the existing state machine doesn't allow

L3-feature is not a bug. It is a feature request that arrived via the wrong skill. The fix skill does NOT implement it — Step 3 prints a routing report and exits. Implementing a feature inline through this skill bypasses graph impact analysis, FeatureRequest artifact creation, planning waves, and TDD discipline — and historically produces UNVERIFIED ships with dynamic-import-style code that proper planning would have caught.

**Tests are treated as code (L1), not as specification.** Test failures alone do not escalate to L2 unless the underlying spec is also stale. (However: a regression test for the bug is mandatory for L1+ and must be written via `/nacl-tl-regression-test` BEFORE the fix is applied — see Step 6. The classification level above is independent of test-writing — it determines what happens to *docs*, not whether a regression test is required.)

Use reference: `nacl-tl-core/references/fix-classification-rules.md` (if available; otherwise use the table above).

---

## Workflow: 8 Steps (ALL MANDATORY)

**Before each step, announce it:** "Step N: [NAME]". This ensures no step is skipped.
**After Step 8, print the full report.** Never end without the report.

**Phase routing:** Steps 1–5 below constitute **Phase A** and are executed by the
`diagnostician` sub-agent (opus) — see "Phase A delegation" above. Steps 6–8
constitute **Phase B** and are executed inline by this skill (sonnet). When the
Agent tool is unavailable (Codex runtime), all eight steps run inline on this
skill's own model.

---

## Phase A — DIAGNOSE & SPEC (Steps 1–5, `diagnostician` / opus)

### Step 1: TRIAGE (auto-detect) — announce: "Step 1: TRIAGE"

**Goal:** Identify WHERE the problem is, WHICH UC/docs are affected.

1. **If tests are failing or error messages are available — run them FIRST.** Read the actual error output before analyzing code. This is far more diagnostic than the problem description alone.
2. If there's a stack trace or error message — find the source file in code
3. If not — search by keywords in the codebase (grep)
4. **If the error is a DB/environment issue** (column not found, relation does not exist, env var missing) — check migration status and environment before analyzing code. This is likely L0.
5. **Graph-enhanced impact traversal (REQUIRED if `config.yaml` has a `graph` section).**
   Keyword UC-name search is not enough: many bugs touch a DB table / catalog / shared entity whose owner UC has a name that does not contain the user's error keywords. The agent must traverse the graph from the **DomainEntity** the bug touches and enumerate **every** UC that reads or writes it. A representative failure mode: a provider catalog adapter ships a bad string, the fix changes the static catalog source, but the refresh-job UC (write path) and the profile-autofill UC (read path) are silently missed because keyword search returns only the dispatcher UC whose name happens to contain the error keyword.

   **Stage 1 — identify the touched DomainEntity.** From the affected file(s) / SQL table / changed column, derive the entity name (look at `.tl/changelog.md`, `.tl/feature-requests/*.md`, or use the file path stem as a substring probe):
   ```cypher
   MATCH (e:DomainEntity)
   WHERE toLower(e.name) CONTAINS toLower($entity_keyword)
      OR toLower(coalesce(e.physical_name, '')) CONTAINS toLower($entity_keyword)
   RETURN e.id AS id, e.name AS name
   ORDER BY e.id
   ```

   **Stage 2 — enumerate every UC that reads or writes the entity (1 + 2 hops).** Run once per matched entity:
   ```cypher
   MATCH (e:DomainEntity {id: $entity_id})
   OPTIONAL MATCH (uc:UseCase)-[r:CONSUMES|PRODUCES|MUTATES|REFERENCES|AFFECTS_ENTITY]->(e)
   OPTIONAL MATCH (uc2:UseCase)-[:DEPENDENCY|DEPENDS_ON]->(uc)
   RETURN uc.id AS uc_id, uc.name AS uc_name, type(r) AS role,
          collect(distinct uc2.id) AS depends_on
   ORDER BY uc.id
   ```

   **Stage 3 — keyword UC search (SECONDARY probe).** Run the original keyword query in case the user's error message names a UC whose entity isn't yet linked in the graph:
   ```cypher
   MATCH (uc:UseCase)
   WHERE toLower(uc.name) CONTAINS toLower($keywords)
      OR toLower(coalesce(uc.description, '')) CONTAINS toLower($keywords)
   RETURN uc.id AS id, uc.name AS name, uc.detail_status AS status
   ORDER BY uc.id
   ```

   Run all three via `mcp__neo4j__read-cypher`. **Union the results.** Every UC returned by Stage 2 must appear in the TRIAGE output below — not only the dispatcher / error-site UC. If Neo4j is unavailable or Stage 1 returned no entity match, log `IMPACT_UNVERIFIED` in the Step 8 report (a hard flag the user will see) and fall back to grep.

6. Identify:
   - **Affected code files** (backend routes, frontend components, hooks, services)
   - **Affected UCs** — UNION of Stage 2 (entity-driven) and Stage 3 (keyword) results from step 5; if graph unavailable, grep for UC IDs in task files
   - **Affected DomainEntity / Module** — from Stage 1 (record the entity ID so Step 7.5 can re-traverse if needed)
   - **Affected docs** — which files in docs/ describe this area
   - **Affected .tl/tasks/** — which tasks are related

Output format (present in user's language):

```
┌─────────────────────────────────────────────┐
│ TRIAGE RESULT                               │
├─────────────────────────────────────────────┤
│ Problem: [brief description]                │
│ Affected UC: UC-014, UC-013                 │
│ Affected code files:                        │
│   - backend/src/routes/interview-chat.ts    │
│   - frontend/src/hooks/useInterviewChat.ts  │
│ Affected docs:                              │
│   - docs/14-usecases/UC014-ai-interview.md  │
│   - docs/12-domain/enumerations/session-status.md │
│ Affected .tl/ tasks: UC014-BE, UC014-FE     │
└─────────────────────────────────────────────┘
```

**If UC cannot be determined** — this is L3 (area is unspecified). Note it.

---

### Step 2: CONTEXT LOAD — announce: "Step 2: CONTEXT LOAD"

**Goal:** Load all relevant information before analysis.

Read (in this order):

1. **UC specs** for affected UCs from `docs/14-usecases/`
2. **Domain model** — relevant enums and entities from `docs/12-domain/`
3. **Screen specs** from `docs/15-interfaces/screens/` (if UI issue)
4. **API contracts** from `.tl/tasks/*/api-contract.md` (if API issue)
5. **Affected code** — files from Step 1
6. **.tl/status.json** and **.tl/changelog.md** — recent changes

**Context budget:** Do not load everything. Only files directly related to the bug.

**For L0 (Environment):** Skip docs loading. Read only config/migration files relevant to the environment issue.

---

### Step 3: GAP-CHECK — announce: "Step 3: GAP-CHECK"

**Goal:** Compare current code against documentation. Find discrepancies BEFORE the fix.

For each affected UC/area:

1. Read what docs describe (expected behavior)
2. Read what code does (actual behavior)
3. Compare and identify discrepancies
4. Classify fix level (L0 / L1 / L2 / L3-spec-gap / L3-feature) using the table above. Apply the **L3 classification criterion** literally: if any new HTTP route, DB column, graph entity, FE page/component, or enum transition would be required, the classification is `L3-feature`.

**For L0:** If triage identified an environment issue, classify immediately and skip to Step 4.

**For L3-feature — STOP HERE.** Do not proceed to Step 4. Do not write any files. Do not create any graph nodes. Do not invoke `/nacl-sa-uc` or any other SA-writing skill. Instead, print the **routing report** below and exit. This is the single most important guardrail in the skill — it exists because previous L3 sessions silently turned the fix skill into a feature factory: they shipped new endpoints + components + UC nodes without graph impact analysis, without a FeatureRequest artifact, without a development plan, and without TDD — leaving the project with `UNVERIFIED` ships and stranded code.

**Routing report format for L3-feature (present in user's language):**

```
┌──────────────────────────────────────────────────────────┐
│ NOT A BUG — THIS IS A FEATURE REQUEST                    │
├──────────────────────────────────────────────────────────┤
│ Reason: GAP-CHECK found that resolving this request     │
│   would require creating:                                │
│     - <list each from the L3 criterion: e.g., "a new    │
│       POST /tasks/:id/restart route", "a new            │
│       RestartTaskButton FE component", "a new           │
│       enum transition failed → queued">                  │
│   Fix skill does not implement features. The proper     │
│   skill is /nacl-sa-feature (incremental feature        │
│   specification with graph impact analysis), followed   │
│   by /nacl-tl-plan and /nacl-tl-dev-*.                   │
│                                                          │
│ Affected entities (from Step 1 Stage 2 traversal):       │
│   - <DomainEntity / Module / UC neighbours found>        │
│                                                          │
│ Recommended command (run in a fresh session):           │
│   /nacl-sa-feature "<verbatim user description>"        │
│                                                          │
│ Why a fresh session: the feature skill needs a clean    │
│ context window — the triage state from this session     │
│ will contaminate its impact analysis.                    │
│                                                          │
│ If you believe this IS a bug (the code path exists       │
│ and you just couldn't find it during GAP-CHECK):         │
│   - re-run /nacl-tl-fix with the specific file/line     │
│     reference, or                                        │
│   - run /nacl-tl-intake "<description>" first for       │
│     graph-backed disambiguation.                         │
└──────────────────────────────────────────────────────────┘
```

After printing this, **exit**. Do not announce Step 4. Do not ask the user for permission to proceed. The user's reply with the routing report is sufficient — they will invoke `/nacl-sa-feature` themselves in a fresh session.

**Escape hatch (rare):** If the user truly wants to handle a small spec gap inline and Step 3 mis-classified, they can re-invoke with `/nacl-tl-fix --treat-as-l3-spec-gap "<description>"`. This bypasses the L3-feature exit and treats the request as `L3-spec-gap` (inline minor spec is permitted). Without this flag, L3-feature always exits. (Flag renamed in W4-blocking-release from its legacy name — which contained the literal token scrubbed by the W4 grep acceptance check — to `--treat-as-l3-spec-gap`. Behavior unchanged.)

При необходимости воспроизвести баг в браузере или на сервере:
- Тестовые доступы: `config.yaml → credentials.[role]` (email, password, phone)
- Адреса окружений: `config.yaml → vps.staging` / `vps.production`
- URL приложения: `config.yaml → deploy.staging.url` / `deploy.production.url`

Output format (present in user's language):

```
┌──────────────────────────────────────────┐
│ GAP-CHECK RESULT                         │
├──────────────────────────────────────────┤
│ Fix level: L2 (Spec-sync)               │
│                                          │
│ Discrepancies (before fix):              │
│ 1. UC014 step 5: docs=POST sync,        │
│    code=SSE streaming                    │
│ 2. session-status.md: missing            │
│    interviewing→interviewing transition  │
│                                          │
│ Bug: POST /dialog returns 409            │
│ instead of existing dialog (idempotency) │
│                                          │
│ Root cause: No idempotent contract       │
│ in UC-014 spec                           │
└──────────────────────────────────────────┘
```

---

### Step 4: DEFINE CORRECT BEHAVIOR — announce: "Step 4: DEFINE CORRECT BEHAVIOR"

**Goal:** Define what behavior SHOULD be, before any changes.

Format (Kiro bugfix spec model):

```markdown
## Correct Behavior Definition

### Current Behavior (what happens now)
POST /api/interview/dialog with existing dialogId returns 409 Conflict.

### Expected Behavior (what should happen)
POST /api/interview/dialog with existing dialogId returns 200 OK
with body { dialog, messages: [...history] }. Endpoint is idempotent.

### Unchanged Behavior (what must NOT change)
- New dialog creation (first call) — works as before
- SSE stream-init — no changes
- Session status transitions (except adding interviewing→interviewing)
```

**For L0:** Brief description: "Migrations need to be applied to test DB" or "Env var X needs to be set."
**For L1:** This step is minimal — docs already define correct behavior.
**For L2/L3:** This step is critical — we define what's correct.

---

### Step 5: FIX DOCS (L2/L3 only) — announce: "Step 5: FIX DOCS"

**Goal:** Update the specification to describe CORRECT behavior.

Use reference: `nacl-tl-core/references/sa-doc-update-matrix.md`

**For L0:** Skip this step entirely. Proceed to Step 6. (L0 is environment/infra; the
6.SF gate is skipped for L0 anyway.)

**For L1 — no doc *change*, but a gap-check attestation IS required.** By definition
L1 means "docs are current and describe correct behavior", so there is nothing to
edit. But the 6.SF spec-first gate must be satisfiable for honest L1 fixes without a
signed exception. The proof that docs are current is the **gap-check attestation** —
the on-record result of the Step 3 GAP-CHECK for the affected docs. The diagnostician
(Phase A) records it BEFORE Phase B writes any code:

1. Populate `gapcheck_attestation` in the fix-plan artifact:
   `{ affected_docs: [<docs compared in Step 3>], verdict: "no-drift", checked_by: "diagnostician" }`.
   If Step 3 found *any* drift, the fix is not L1 — reclassify L2/L3 and author the doc change instead.
2. Write the attestation to `.tl/status.json` as a `phases.spec` entry, timestamped
   before any code-fix commit:
   ```json
   "phases": { "spec": { "status": "done", "kind": "gapcheck-no-drift",
                          "affected_docs": ["..."], "ts": "<ISO8601, before code>" } }
   ```
3. Add a `.tl/changelog.md` line (timestamp before code): `spec verified current
   (gap-check, no drift) for <UC/area> — L1, no doc change`.

This is what the 6.SF cross-check (detection step 5) reads as the
`spec-update-by-status-json` signal, so the L1 verdict composes to PASS without a
doc-change commit. The diagnostician still does NOT commit — the orchestrator commits
`.tl/status.json` + `.tl/changelog.md` at Phase B entry, before the code-fix commit
(see Step 6 Phase B intro). An L1 fix that reaches Step 6 with **no** recorded
attestation means Phase A's gap-check was skipped — that is exactly the "jumped
straight to code" case the gate exists to catch, and 6.SF FAILs it.

#### For L2 (update existing docs):

| Change type | What to update | How |
|-------------|---------------|-----|
| Enum/status | `docs/12-domain/enumerations/*.md` | Add value, update transition matrix |
| State transitions | `docs/12-domain/enumerations/session-status.md` | Add transition to table |
| API endpoint | `.tl/tasks/*/api-contract.md` + UC-spec | Update URL, request, response |
| UC flow | `docs/14-usecases/*.md` | Update main/alternative flow steps |
| Screen spec | `docs/15-interfaces/screens/*.md` | Update components, behavior |

**When to use SA skills:**
- Major domain model change → invoke `/nacl-sa-domain --mode=MODIFY` via Skill tool
- UC flow rewrite → invoke `/nacl-sa-uc --mode=update` via Skill tool
- Small point edits (a number, URL, field name) → edit directly

#### For L3-spec-gap (add a missing minor element):

The code path already exists. Only a small spec element is missing: an enum value an endpoint already returns, a UC node for an existing route, a documented transition the state machine already permits. The fix is the spec addition + at most one tiny code touch (e.g., adding the enum value to a TS union to match what the BE already emits).

Permitted scope:
- One enum value or one transition added to `docs/12-domain/enumerations/*.md`
- One UC node added to the graph via direct Cypher write (justified inline) **only when** the route, handler, and component already exist
- One minor doc addition (a paragraph, a row in a table)

**Forbidden** under L3-spec-gap — these escalate the request back to L3-feature:
- Creating a new UC node alongside new code (route, component, hook)
- Inventing a new API endpoint or response shape
- Adding a new entity, attribute, or relationship to the domain model
- Anything matching the L3-feature criterion in the Fix Levels table

If during Step 5 the agent notices any of the forbidden items is required, **abort Step 5, return to Step 3, reclassify as L3-feature, and exit via the routing report**. Do not silently continue.

L3-feature requests never reach Step 5. They exited at Step 3.

#### For L2 / L3-spec-gap: author the Decision + change-provenance (graph-native)

A behavior-shape change must record *why*, graph-natively — the same discipline as
`nacl-sa-feature`, so the "why a year later" history is one chain regardless of
whether the change came in as a feature or a fix. Phase A authors these into the
working tree (uncommitted); Phase B commits them as part of the spec-update commit,
so the 6.SF detector counts them (`Decision` is in the graph-mutation label list)
and `nacl-sa-validate` L9 is satisfiable. The Decision reuses Step 3/4 output — no
new analysis:

- `title` ← one line naming the behavior change
- `context` ← `correct_behavior.current`  ·  `chosen` ← `correct_behavior.expected`
- `rationale` ← root cause + why `expected` is correct  **(required, non-empty)**
- `alternatives_considered` ← `["keep current (rejected: <root_cause>)"]`
- `source` ← the spec-update commit SHA (filled at Phase B commit time)
- justifies ← every UC from Step 1 Stage 2 (`affected.ucs`)

```cypher
// mcp__neo4j__write-cypher — author in Phase A (uncommitted), commit in Phase B
// Params: $decId (DEC-NNN), $decTitle, $decContext, $decChosen, $decRationale,
//         $decAlts, $specSha, $classification (L2|L3-spec-gap), $affectedUcIds
MERGE (d:Decision {id: $decId})
SET d.title = $decTitle, d.context = $decContext, d.chosen = $decChosen,
    d.rationale = $decRationale, d.alternatives_considered = $decAlts,
    d.status = 'accepted', d.created_at = coalesce(d.created_at, datetime()),
    d.created_by = 'nacl-tl-fix', d.source = $specSha, d.level = $classification
WITH d
UNWIND $affectedUcIds AS x
  MATCH (uc:UseCase {id: x})
  MERGE (d)-[:JUSTIFIES {role:'shapes'}]->(uc)
RETURN d.id;
```

Then bump `spec_version` on the changed UCs and stamp staleness on their
dependent Tasks (so `nacl-tl-plan` re-plans them and the closure gate blocks until
it does — identical mechanism to `nacl-sa-feature` step 3g):

```cypher
// mcp__neo4j__write-cypher
// Params: $affectedUcIds, $reason (e.g. "fixed by DEC-NNN"), $origin (the UC id or DEC-NNN)
MATCH (uc:UseCase) WHERE uc.id IN $affectedUcIds
SET uc.spec_version = coalesce(uc.spec_version, 0) + 1, uc.updated_at = datetime()
WITH collect(uc) AS ucs
UNWIND ucs AS uc
  OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)
  SET t.review_status = 'stale', t.stale_reason = $reason,
      t.stale_since = datetime(), t.stale_origin = $origin
```

> If this fix reverses an earlier decision, also write `(:Decision)-[:SUPERSEDES]->(:Decision)`
> and set the old one's `status='superseded'` (see `nacl-sa-feature` step 6.2ter).
> If the fix's own code change in Step 6 fully re-syncs a task (rare — usually
> planning does), clear that task's flag at Step 7; otherwise leave it for `nacl-tl-plan`.

#### → USER GATE (L2 / L3-spec-gap only) — calibrated: proceed-and-flag by default, block only when genuinely costly

**Presented by the orchestrator, not the diagnostician.** Phase A leaves the doc
changes uncommitted in the working tree and returns its payload. The orchestrator
(this skill, running in the interactive context) decides here, between Phase A and
Phase B, whether to proceed autonomously or stop for a human decision — the
diagnostician sub-agent cannot talk to the user.

**Decouple the guard from the spec decision.** If the fix has an unconditionally-
correct defensive part (a guard / clamp / graceful-degrade, correct under every
interpretation of the ambiguity and touching no external contract / schema / auth /
billing surface), that part ships at L1 WITHOUT sign-off. Never hold a crash fix
behind approval of a spec diff. Only the genuine spec-write decision is eligible for
a checkpoint.

**Default = proceed and flag (no blocking prompt)** when ALL hold:
- the diagnostician is confident in the interpretation it authored (it reconciled
  the spec change against existing behaviour / formulas / call-sites, not guessed);
- the change is reversible — an internal spec doc (documenting consumer-side input
  tolerance, a field-interpretation note, a clamp table), NOT the external/published
  contract surface;
- it is verifiable later (a staging run, a test, a user glance).

In that case, state the working assumption in PLAIN language and continue — no
"approve this N-line diff" prompt. Example:
```
I'm treating each voice comment's start/end as positions inside that clip
(the spec computes its length as end − start, and the generator's cumulative
timeline shouldn't be applied literally). I'll ship the crash fix on that and
verify voice alignment on staging — tell me if the generator actually emits a
cumulative timeline and I'll re-anchor.
```
Record the assumption durably: write it into the committed spec as an explicit
`> [!WARNING] working assumption — pending staging verification (see <followup>)`
callout (so the doc is documented-with-caveat, not silently stale), AND emit a
`followup_task` (the audit task that resolves it). A demotion with NO recorded
`followup_task` is invalid — fall back to the prompt.

**Block for explicit sign-off (plain-language prompt) ONLY when:**
- the diagnostician is NOT confident in the interpretation — it genuinely needs the
  user's domain knowledge (e.g. "does the generator emit per-clip or cumulative
  timings?" and nothing in the code/spec settles it), OR
- the spec change is external-contract-breaking or otherwise irreversible/costly
  (public/published API surface, a schema migration, auth/billing).

When blocking, present in the user's language and in observable terms — show what
behaviour will be written down and why the call is expensive to undo. Do NOT show
internal tokens (`L2`, `spec-first`, requirement IDs like `REQ-0XX` / `NFR-...`,
`gate_payload`). **Do NOT proceed without explicit user confirmation.**

**W10 / spec-first ordering is unchanged:** whenever the spec genuinely IS stale and
a spec change is committed (whether after a block or after a proceed-and-flag), it
still commits BEFORE the code fix. This calibration changes *how/whether the user is
interrupted*, never the commit ordering.

**L0/L1 fixes proceed without USER GATE** unless `--confirm` flag is used.
**L3-feature does not reach this gate** — it already exited at Step 3 (the
diagnostician returned `exit_reason: L3-feature` and the orchestrator printed the
routing report).
**Autonomous `/nacl-goal` mode:** the gate auto-resolves exactly as before — the
wrapper's envelope governs confirmation, not an interactive prompt.

---

---

## Phase B — EXECUTE (Steps 6–8, this skill / sonnet)

**Phase B begins here.** Phase A has returned the fix-plan artifact and (for L2/L3)
the USER GATE has resolved. This skill now runs the honest-execution core on its
own model.

**Spec-first commit ordering — by fix level.** Whatever spec-first evidence Phase A
produced is committed **first**, at Phase B entry, before the Step 6.SF check below,
so the prerequisite passes by construction (the evidence predates any code-fix
commit). Only after that does code change.

- **L2 / L3-spec-gap.** `docs_changed` is non-empty: the diagnostician left the
  doc/spec/graph changes uncommitted in the working tree. The orchestrator commits
  them first → a spec-update commit precedes any code-fix commit. The diagnostician
  also wrote the `:Decision` node and the `spec_version`/staleness stamps (Step 5
  "author the Decision"); after the spec-update commit lands, backfill the Decision's
  `source` with that commit SHA (`MATCH (d:Decision {id:$decId}) SET d.source=$sha`)
  and reference `DEC-NNN` in the spec-update commit's `.tl/changelog.md` line so the
  6.SF graph-mutation fallback (detection step 3b) recognises it.
- **L1.** `docs_changed` is empty (docs are current), but Phase A recorded a
  **gap-check attestation** (`gapcheck_attestation` in the fix-plan;
  `phases.spec: gapcheck-no-drift` in `.tl/status.json` + a `.tl/changelog.md`
  line). The orchestrator commits `.tl/status.json` + `.tl/changelog.md` first →
  the attestation's timestamp predates the code-fix commit, which 6.SF reads as the
  `spec-update-by-status-json` signal. (See the "Spec-First Prerequisite" section
  for why L1 evidence is an attestation, not a doc-change commit.)
- **L0.** The 6.SF gate is skipped entirely; no spec-first commit.

### Step 6: APPLY FIX (TDD-ordered) — announce: "Step 6: APPLY FIX"

**Goal:** Fix the issue according to the (updated) specification, with the regression test written **before** the fix so RED→GREEN is verified by construction.

**For L0 (Environment):** apply infrastructure fix only — migrations, env vars, caches, configs. Skip the TDD sub-flow below; jump to Step 7. **If the fix involves a new SQL migration, run the migration-verification sub-flow 6M below before jumping to Step 7.**

**For L1 / L2 / L3 (any code change):** first run the **Spec-First Prerequisite Check** (sub-step 6.SF) — see the "Spec-First Prerequisite (Strict-Only)" section above. Only after the gate returns PASS (or is bypassed by a valid signed exception against `spec-first-prerequisite`) do you proceed to TDD sub-steps 6a→6h. Step 7 then determines the final status. **If the fix adds a new SQL migration alongside the code change, also run the migration-verification sub-flow 6M below.**

#### 6M — Migration verification sub-flow (runs whenever the fix adds or modifies a SQL migration)

Migration files are a known silent-failure surface. `npm run migrate` (drizzle, knex, prisma, …) can exit 0 while skipping a new file if the migrator's manifest does not know about it. A representative failure mode: a fix adds a stray `migrations/NNNN_*.sql` that is not registered in the drizzle `meta/_journal.json` (or the equivalent manifest for other migrators) — `migrate` exits 0, the agent reports "migration applied cleanly", and the DB rows are unchanged in reality. The mismatch is only visible by querying the DB directly.

The agent MUST run all three checks below and record each result in the Step 8 report. If any check fails, status is `RUNNER_BROKEN` (not `PASS`).

**6M.1 — Pre-check: migrator manifest.** Before running migrate, confirm the new `.sql` file is registered in the migrator's manifest:

| Migrator | Manifest file | Check |
|----------|--------------|-------|
| drizzle  | `<migrations-dir>/meta/_journal.json` | new filename's `tag` appears in `entries` array |
| knex     | `knex_migrations` DB table (no file) | post-check only — see 6M.3 |
| prisma   | `prisma/migrations/<ts>_<name>/migration.sql` + dir naming | filename matches `<timestamp>_<name>` pattern |
| custom   | per-project — read `package.json` `scripts.migrate` target | follow that script's contract |

Detect the migrator by reading `package.json` dependencies (`drizzle-orm`, `knex`, `@prisma/client`, …) and the `scripts.migrate` command. If the manifest does not list the new file, **register it before running migrate** (drizzle: append an entry to `_journal.json` with the next `idx` and a matching `tag`). Treat the missing entry as an artifact of the fix itself, not a separate bug — the fix is not complete until the manifest is updated.

**6M.2 — Run migrate.** Exit code 0 is necessary but not sufficient. Capture stdout to compare against 6M.3.

**6M.3 — Post-check: DB state.** Run an explicit `SELECT` that proves the migration's effect. The shape:

```sql
-- The pre-migration condition must now return zero rows.
SELECT COUNT(*) FROM <table> WHERE <condition the migration was supposed to eliminate>;
-- Example for a catalog-prefix-removal fix:
-- SELECT COUNT(*) FROM <profile_table>       WHERE <name_col> LIKE '<old-prefix>%';
-- SELECT COUNT(*) FROM <catalog_entry_table> WHERE <name_col> LIKE '<old-prefix>%';
```

Both must return 0. If either returns > 0, the migration silently skipped — status `RUNNER_BROKEN`, return to 6M.1 and investigate the manifest. Do not proceed.

For projects where direct DB access is awkward (no `psql`, no MCP DB tool), the post-check can be a service-level query through an existing API endpoint or a debug script — but it must be empirical, not "migrate said it worked."

**6M.4 — Record in report.** Step 8's "Changes applied" section must include the migration verification line:

```
Migration verification:
  Manifest:  registered in <manifest-file> (✓) or "registered now: <entry added>"
  Migrate:   <command> → exit 0, stdout shows: "<key line>"
  DB check:  <SELECT> returned <N> rows pre-migration, 0 rows post-migration ✓
```

Trust the DB, not the exit code. Claims need evidence; exit codes are not evidence.

#### TDD-ordered sub-steps (L1+)

```
6a  RESTATE BUG. Write down Current / Expected / Unchanged behavior
    (already produced in Step 4 — re-confirm).

6b  CAPTURE BASELINE. Discover scripts.test of the affected workspace
    (see Step 7.1) and run it once. Record:
      - the exact failing-test set (file + test name) → "baseline_failures"
      - whether the runner started cleanly, collected tests, exited 0 or non-zero
    If scripts.test is missing / runner is broken / suite empty after sanity
    check, capture that as a flag and continue without baseline (status will
    resolve to NO_INFRA or RUNNER_BROKEN at Step 7).

6c  PICK PATH.
      - **First anchor — brand-new files force Path A.** If ANY file the
        fix is about to add did not exist in the git tree before this fix
        (check via `git ls-files` or `git status` — untracked / newly-staged
        files count as new), the path is **Path A** by definition. A file
        that did not exist could not have been imported by any test, so the
        import grep is meaningless for it. Do not let "the grep returned no
        matches" become "Path B (no test needed)" — that is the exact
        inversion that has silently shipped untested code in past sessions.
      - Otherwise: grep test files for an import of any changed/about-to-change
        source module(s).
      - If at least one test file imports the target → Path B (existing
        coverage). Note: the imported test may or may not actually exercise
        the bug — Step 7 will resolve that via baseline comparison.
      - Otherwise → Path A (no test imports the file; a new regression test
        is required).
      - Reminder: "no import found" ⇒ Path A. Never Path B. Path B requires
        a positive grep hit on an existing test file.

6d  (Path A only) WRITE REGRESSION TEST FIRST.
    Invoke /nacl-tl-regression-test as a separate sub-agent (developer
    subagent_type) with: bug description, target source file(s),
    Current/Expected behavior from 6a. The sub-agent writes ONLY a test
    file — it does not touch the production code. This separation is
    deliberate: the fix author cannot also be the test author, otherwise
    the test will be tuned to whatever the fix happens to do.

6e  (Path A only) VERIFY THE TEST IS RED.
    Run the new test in isolation against the still-broken code.
    It MUST fail. If it passes, the test does not capture the bug —
    discard it and re-invoke /nacl-tl-regression-test with sharper inputs
    (cite Current/Expected more concretely). After 2 unsuccessful retries,
    stop and ask the user to refine Step 4. Do NOT proceed to apply the fix
    until the test is RED.

6f  APPLY THE FIX. Modify production code only.
      - L1: code matches existing spec.
      - L2/L3: code matches the spec updated in Step 5 (which already passed
        the USER GATE).
      - Honor the principles: minimal scope, no opportunistic refactors,
        no improvements outside the bug.

6g  RE-RUN THE FULL SUITE. Use the same scripts.test command as 6b.
    Record:
      - "postfix_failures" — full failing-test set after the fix
      - (Path A) whether the new regression test transitioned RED→GREEN
      - (Path B) which baseline_failures cleared (= "transitioned" set)

6h  HAND OFF TO STEP 7 for status determination.
```

**Principles (unchanged):**
- Minimal changes — only what's needed for the fix
- Do not refactor "along the way"
- Do not add "improvements" beyond the bug scope
- Verify Unchanged Behavior is not broken

---

### Step 7: VALIDATE — announce: "Step 7: VALIDATE"

**Goal:** Determine the honest status of the fix, then run impact checks and update the changelog. This step never claims tests passed when no tests honestly passed, and never claims failures are unrelated without baseline evidence.

#### 7.0 Self-adversarial root-cause re-read (Mandatory)

A GREEN regression test proves the **symptom** is gone, not that the **root cause** is fixed. Before recording the status, re-read the changed code and the regression test together and try to **refute your own fix**: could the test pass while the underlying defect persists? Watch specifically for — the test asserts the symptom rather than the cause; the fix narrows **one of several** code paths that carry the same defect (e.g. one of N call-sites / prompt-carriers / handlers); a sibling caller or a second entrypoint still reaches the bug. Use the Step 1 graph neighbours + the `impact_targets` survey to enumerate the other paths. If the re-read surfaces an unfixed path, the fix is **incomplete** — extend it, or record the residual path explicitly. Conclude "root cause resolved" only on positive evidence across all carriers (pair with the keep-if-uncertain rule — never assume completeness from one green test).

#### 7.1 Discover the test command (no fallback runner)

Locate the workspace owning the changed files (the nearest `package.json` walking up from a changed file). Read its `scripts.test`. Run **exactly that command** at every test step (6b, 6e, 6g). Do NOT substitute another runner — do not invent `npx vitest`, `npx jest`, etc., even if `npm test` looks unfamiliar. The runner is whatever the workspace declares.

If `scripts.test` is missing → the affected layer has no test infrastructure; status will resolve to `NO_INFRA`.

#### 7.2 Sanity-check the runner if the suite reported zero tests

If at 6b the runner started cleanly but reported 0 tests collected:
- Pick any one known-good test file in the workspace (e.g. the largest one, or one referenced by `git log`).
- Re-run scripts.test scoped to that single file (or use the runner's filter flag).
- If at least one test runs → the original glob simply didn't match what we expected; treat as Path B if it now covers the changed file, else Path A. Continue.
- If still zero tests → the runner is misconfigured; status `RUNNER_BROKEN`.

The point: zero collected tests is **not** the same as "no regression test exists." It often means the glob is broken or the wrong runner is selected.

#### 7.3 Determine the status

Compute from Step 6's recorded data:
- **baseline_failures** = set of failing tests at 6b
- **postfix_failures** = set of failing tests at 6g
- **new_failures** = postfix_failures − baseline_failures (tests failing now that weren't before)
- **transitioned** = baseline_failures − postfix_failures (tests that were failing, now pass)
- **regression_test_red_to_green** = true iff Path A and the test written in 6d was RED at 6e and GREEN at 6g

Apply these rules in order — first match wins:

| # | Condition | Status | Step 8 header |
|---|---|---|---|
| 1 | `scripts.test` was missing (6b flagged NO_INFRA). | `NO_INFRA` | `FIX APPLIED — UNVERIFIED` |
| 2 | Runner failed to start, exited non-zero before any test ran, or 7.2 confirmed misconfiguration. | `RUNNER_BROKEN` | `FIX APPLIED — UNVERIFIED` |
| 3 | `new_failures` is non-empty (the fix introduced failures that didn't exist in baseline). | `REGRESSION` | `FIX INCOMPLETE` — return to 6f |
| 4 | Path A and `regression_test_red_to_green` is false (the test we wrote against the bug is still RED — the fix didn't fix it). | `REGRESSION` | `FIX INCOMPLETE` — return to 6f |
| 5 | At least one test transitioned RED→GREEN — either the new regression test (Path A) or an existing test that was in `baseline_failures` and is now green (Path B) — AND `postfix_failures` is empty. | `PASS` | `FIX COMPLETE` |
| 6 | At least one test transitioned RED→GREEN AND `postfix_failures` is non-empty BUT `postfix_failures ⊆ baseline_failures` (the only failures left are pre-existing failures the baseline already had). | `BLOCKED` | `FIX APPLIED — UNVERIFIED` (pre-existing unrelated failures) |
| 7 | No test transitioned RED→GREEN (Path B, and no baseline_failures cleared). The fix was applied, the suite runs, but nothing in the suite gives evidence the fix did anything. | `UNVERIFIED` | `FIX APPLIED — UNVERIFIED` (no test exercises the change) |

Notes:
- Rule 5 is the "happy path" — applies in both Path A (the new regression test transitions RED→GREEN) and Path B (an existing baseline-failing test transitions).
- Rule 6 (`BLOCKED`) is reachable from both paths: Path A when the new regression test transitions but unrelated baseline failures persist; Path B when an existing baseline-failing test transitions but unrelated baseline failures persist.
- Rule 7 (`UNVERIFIED`) is only reachable from Path B and indicates the import-grep heuristic at 6c was a false positive — a test imports the file but doesn't actually cover the bug. Recommend invoking `/nacl-tl-regression-test` retroactively (it will fail-then-pass against the now-fixed code, which is weaker than RED-first but better than nothing).

#### 7.4 Mini sa-validate (L2/L3 only)

- Read the updated docs.
- Verify against code: do docs now describe what code does?
- Check L4 (form↔domain) and L5 (UC→form) for affected UCs.

#### 7.5 Impact check — data-flow survey (MANDATORY)

A bug fix is not complete until the agent has reasoned about every code path that touches the same data the fix changed. The two-bullet check this used to be was too weak — it routinely let catalog-style fixes ship without ever opening the refresh / re-derivation write-path that would have re-introduced the bug on the next refresh cycle.

Answer **every** item below explicitly in the Step 8 report. "Not applicable" is a valid answer, but it must be stated, not omitted.

1. **Read paths.** For every UC returned by Step 1 Stage 2 with role `CONSUMES` / `REFERENCES`: identify the code file that realizes that read (grep for the UC ID, DomainEntity name, or table name). Open it. State, in the report: "UC-XXX reads via `<file:line>` — verified no regression."

2. **Write paths.** For every UC returned with role `PRODUCES` / `MUTATES` / `AFFECTS_ENTITY`: identify the code that writes the data. **Critical** when the fix included a one-time data migration — the write path is what would re-populate the table after the migration runs. State in the report: "UC-XXX writes via `<file:line>` — confirmed it now produces the corrected form."

3. **Refresh / sync / cache / re-derivation.** Ask explicitly: "Is there any code — periodic job, manual button, startup seed, cache rebuild, provider list-models call — that re-derives this data from an upstream source?" If yes, name the file and confirm the upstream source itself is now correct (not just the DB row). This is the question that catches "the migration fixed the DB but the next Refresh will undo it."

4. **Snapshot vs source-of-truth.** If the change included a SQL migration that mutates rows, identify whether the source-of-truth for those rows lives in code (a hardcoded catalog, a seed file, a config) or in user data. If in code: the migration is a one-time backfill, and the code change is the durable fix — confirm both are aligned. If in user data: state that no re-derivation will occur.

5. **Adjacent UCs / shared types.** Standard impact check: imports, shared types, shared state across the UCs identified in Step 1.

If any item in 1–4 cannot be answered with a concrete file path and a stated verification, the fix status downgrades to `UNVERIFIED` for the Step 8 report (the agent does not silently call PASS while neighbours are unexamined).

#### 7.6 Update `.tl/changelog`

```markdown
### [YYYY-MM-DD] nacl-tl-fix: [brief description]
- **Level:** L0/L1/L2/L3
- **Status:** PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN
- **Spec-first verdict:** PASS / FAIL (bypassed-by-EXC-...) / SKIPPED (L0) / SKIPPED (--dry-run)
- **Spec-first evidence (if PASS):** L2/L3 → spec-update commit `<SHA> (<message>)`; L1 → gap-check attestation `gapcheck-no-drift` (phases.spec ts `<ISO8601>`, affected docs: [list])
- **Root cause:** [what was wrong]
- **Affected UC:** UC-### (or "infrastructure")
- **Decision:** DEC-NNN — [title] (L2/L3 only; the graph-native "why" — `(:Decision)-[:JUSTIFIES]->(:UseCase)`); "none (L0/L1)" otherwise
- **Stale (to re-plan):** [N tasks stamped review_status='stale' → `/nacl-tl-plan` clears] or "none"
- **Docs updated:** [list] or "none (L0/L1)"
- **Code changed:** [file list]
- **Tests:** [new test path if Path A] or "existing test transitioned: [path]" or "none (status BLOCKED/UNVERIFIED/NO_INFRA)"
- **Pre-existing failures (baseline-confirmed unrelated):** [list, only if BLOCKED]
- **Invocation source:** review   ← include this line ONLY when --from-review was passed; omit otherwise
```

---

### Step 8: REPORT (MANDATORY — never skip) — announce: "Step 8: REPORT"

**Goal:** Give the user a complete picture of what was done. The report header reflects the Step 7 status — it is **not** always `FIX COMPLETE`.

Header by status:

| Step 7 status | Step 8 header |
|---|---|
| `PASS` (rule 5) | `FIX COMPLETE` |
| `BLOCKED` (rule 6) | `FIX APPLIED — UNVERIFIED` (pre-existing unrelated failures) |
| `UNVERIFIED` (rule 7) | `FIX APPLIED — UNVERIFIED` (no test exercises the change) |
| `NO_INFRA` (rule 1) | `FIX APPLIED — UNVERIFIED` (no test runner for this layer) |
| `RUNNER_BROKEN` (rule 2) | `FIX APPLIED — UNVERIFIED` (test runner could not execute) |
| `REGRESSION` (rules 3, 4) | `FIX INCOMPLETE` (the fix did not pass its own regression test, or introduced new failures) |
| `BLOCKED` (Step 6.SF rule 5 — spec-first prerequisite missing) | `FIX HALTED — SPEC-FIRST PREREQUISITE MISSING` (no spec-update commit precedes the first code-fix commit; no signed exception against `spec-first-prerequisite` exists) |
| `BLOCKED` (Step 6.SF rule 6 — graph-delta-unobservable) | `FIX HALTED — SPEC-FIRST GRAPH DELTA UNOBSERVABLE` (no per-commit export and no changelog/status.json fallback signal; cannot verify spec-first ordering) |
| Step 6.SF rule 4 (bypassed by signed exception) | `FIX APPLIED — UNVERIFIED (spec-first-bypassed-by-signed-exception)` — Step 7 status applies as usual; the spec-first bypass is recorded but does not promote the headline above `FIX APPLIED — UNVERIFIED`. |

#### Template — present in user's language

```
═══════════════════════════════════════════
  <HEADER from table above>
═══════════════════════════════════════════

Problem: [from user's description]
Invocation source: review (--from-review)        ← include this line ONLY when --from-review was passed; omit otherwise
Root cause: [what caused it]
Level: L0/L1/L2/L3
Status: <PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | REGRESSION>

Docs updated:
  [file list or "— (L0/L1, docs are current)"]

Changes applied:
  [file list with brief description, or
   "Applied 13 pending migrations to test DB"]

Tests:
  Runner:           [exact scripts.test command actually run, or "none — NO_INFRA"]
  Baseline (6b):    [N tests collected, K failing] or "skipped (NO_INFRA / RUNNER_BROKEN)"
  Regression test:  [path of new test (Path A) | "covered by existing test: [path]" (Path B) | "none — UNVERIFIED" | "n/a — NO_INFRA"]
  RED→GREEN:        [✓ confirmed at 6e and 6g (Path A) | ✓ existing test transitioned (Path B) | ✗ no transition observed (UNVERIFIED) | n/a]
  Postfix (6g):     [N tests collected, K failing] or "skipped"
  New failures:     [list — only if REGRESSION; otherwise "none"]
  Pre-existing failures (baseline-confirmed unrelated):
                    [list — only if BLOCKED; otherwise "none"]

Impact check:
  [✓] Adjacent UCs not affected
  [or list of concerns]

Remaining discrepancies docs/code:
  [list or "none"]

Next step:
  <see "Next step recommendations" below>

Recommendations:
  [if systemic issues found — suggest
   /nacl-tl-diagnose or /nacl-tl-reconcile]
═══════════════════════════════════════════
```

#### Next step recommendations by status

- `PASS`:
  ```
  /nacl-tl-ship "fix: [short description]"
  ```
  ⚠ If this is a critical production issue that cannot wait for the feature branch to merge, consider `/nacl-tl-hotfix --apply` instead.

- `BLOCKED`:
  ```
  Decide:
    (a) Ship anyway — the fix is verified. Pre-existing failures are
        baseline-confirmed unrelated:
          /nacl-tl-ship "fix: [short description] (note: pre-existing failures unchanged)"
    (b) Investigate the unrelated failures first:
          /nacl-tl-diagnose
  ```

- `UNVERIFIED`:
  ```
  The fix was applied but no test exercises it. Either:
    (a) Write a regression test now (the import-grep heuristic missed):
          /nacl-tl-regression-test "[bug description]"
    (b) Accept and ship — at your discretion:
          /nacl-tl-ship "fix: [short description] (note: no regression test)"
  ```

- `NO_INFRA`:
  ```
  The affected workspace has no test runner. Open a TECH task to set one up:
    /nacl-tl-dev TECH-### "set up test runner for [workspace]"
  Then re-run /nacl-tl-fix to add a regression test for this bug.
  In the meantime, the fix can ship if the change is small enough to review by eye:
    /nacl-tl-ship "fix: [short description] (note: no test infra in workspace)"
  ```

- `RUNNER_BROKEN`:
  ```
  The test runner could not execute. This is likely an L0 environment issue.
    /nacl-tl-diagnose
  Do NOT ship the fix until the runner works again — there is no way to verify regressions.
  ```

- `REGRESSION`:
  ```
  Return to Step 6f. Either the fix is wrong, or it broke something else.
  Do NOT ship.
  ```

### Auto-ship (if --auto-ship flag)

If `--auto-ship` is set:
- Status `PASS` → automatically invoke `/nacl-tl-ship` with the fix description as commit message; report ship result alongside fix result.
- Status `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION` → do NOT auto-ship. Print the report and stop. The user makes the call.

`--auto-ship` ALWAYS uses `/nacl-tl-ship` (commits to current branch). It NEVER uses `/nacl-tl-hotfix`. If the user wants a hotfix to main, they must explicitly invoke `/nacl-tl-hotfix` after the fix is complete.

### Goal-context env vars (2.10.1+)

When this skill is invoked by `/nacl-goal intake` (the autonomous goal orchestrator added in 2.10.1), the wrapper exports four env vars before the invocation. The fix skill recognizes them additively — when ANY are absent, behavior is exactly as documented above.

| Variable | Meaning | Effect on this skill |
|---|---|---|
| `NACL_GOAL_RUN_ID` | Current goal-run identifier | Included as `Goal-run-id: <id>` line in commit message bodies (for traceability via `git log --grep`). Logged in the Step 8 report. |
| `NACL_GOAL_BRANCH` | The goal-run feature branch name | Inherited by `/nacl-tl-ship` (see below); fix skill itself does not switch branches. |
| `NACL_SHIP_MODE=append` | Tells `/nacl-tl-ship` to use append-to-existing-PR semantics | Inherited by `/nacl-tl-ship` when `--auto-ship` is set. Without this env, ship behavior is unchanged. |
| `NACL_GOAL_BUDGET_FILE` | Absolute path to `.tl/goal-runs/<run_id>/budget.json` | Fix skill appends a single entry to `budget.json.inner_skill_runs[]` at end of Step 8: `{ "skill": "nacl-tl-fix", "atom_id": "<from goal context>", "started_at": "...", "ended_at": "...", "duration_seconds": <N>, "exit_status": "shipped|failed|skipped" }`. If the file is absent or unwritable, fix continues silently — this is best-effort observability. |

These env vars are also what makes the spec-first exception lookup pick up wrapper-authored YAMLs from `.tl/exceptions/goal-runs/<NACL_GOAL_RUN_ID>/EXC-goal-*.yaml` automatically (rule 4 above scans both namespaces unconditionally; the env var is not strictly required for the lookup, but the wrapper-authored YAMLs only exist when the env var is set).

**Phase propagation**: the orchestrator passes these env vars through to the
`diagnostician` sub-agent (Phase A) as well — Phase A authors docs and may invoke
`/nacl-sa-*` skills, and the spec-first exception lookup it informs spans the
`goal-runs/<NACL_GOAL_RUN_ID>/` namespace. The diagnostician still does not commit,
so the `Goal-run-id:` commit-body line is written by Phase B (this skill).

**Invariant**: when these env vars are not in the environment, this skill behaves exactly as today. The goal-context behavior is purely additive. Interactive `/nacl-tl-fix` invocations are not affected.

---

## Handling Edge Cases

### Bug in area with no docs at all — usually L3-feature, not a bug

If triage found NO docs AND no code path for the affected behavior, the request is almost always a **feature** that arrived via the wrong skill. Apply the L3 classification criterion from the Fix Levels table:

- If the request would require creating any new HTTP route, DB column, graph entity, FE page/component, or enum transition → **classify as L3-feature**, exit at Step 3 with the routing report, and recommend `/nacl-sa-feature`. Do not create files. Do not write graph nodes. Do not invoke `/nacl-sa-uc`.
- If the code path exists (the route runs, the component renders) and only a small spec element is missing (one enum value, one UC node retroactively documenting an existing route) → classify as `L3-spec-gap` and follow Step 5's L3-spec-gap subsection.

The historical mistake — creating "minimal specifications" inline as cover for shipping new endpoints + components + UC nodes — is now explicitly forbidden. The fix skill is not a feature factory; `/nacl-sa-feature` is.

### Bug affects multiple UCs

If triage found 2+ affected UCs:

1. Read docs for all UCs
2. Gap-check for each
3. Determine priority: which UC "owns" the bug
4. Fix docs/code in the owning UC
5. Check impact on the rest

### Infrastructure bug (deploy, CI, migrations)

For TECH/infra issues:

1. Read docs/DEPLOY.md, docs/DEVELOPMENT.md
2. L0 if it's an environment fix (run migrations, set env vars)
3. L1 if it's a config code fix
4. L2 if it changes deploy conventions (update DEPLOY.md)

### --dry-run mode

Run **Phase A only** (the `diagnostician` sub-agent), through Step 4 — TRIAGE,
CONTEXT, GAP-CHECK + classification, DEFINE CORRECT BEHAVIOR — show the fix-plan as
a report, and do NOT execute Step 5 (no doc writes) or Phase B (Steps 6–8). The
diagnostician receives `--dry-run` in its inputs and writes nothing. Useful for
understanding scope before making changes.

---

## References

- `nacl-tl-core/references/fix-classification-rules.md` — L0/L1/L2/L3 classification rules
- `nacl-tl-core/references/sa-doc-update-matrix.md` — "code change → doc → skill" matrix
- `nacl-tl-core/references/tdd-workflow.md` — TDD cycle for Step 6
- `nacl-tl-core/references/review-checklist.md` — self-review checklist
- `nacl-tl-core/references/stub-tracking-rules.md` — stub markers
- `/nacl-tl-regression-test` (sibling skill) — invoked from Step 6d to write a regression test against broken code (RED-first). The fix author MUST NOT also write the regression test.

If a reference file is not found in the project, use the inline tables and rules in this SKILL.md as fallback.

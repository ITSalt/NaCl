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

# TeamLead Spec-First Bug Fix Skill

## CRITICAL: Follow ALL 8 Steps

**You MUST execute every step of the workflow below, in order, without skipping.**
Do NOT jump straight to fixing code. Do NOT skip triage, context loading, or gap-check.
The full workflow is: TRIAGE → CONTEXT → GAP-CHECK → DEFINE BEHAVIOR → FIX DOCS → FIX CODE → VALIDATE → REPORT.
**Skipping steps leads to regressions. This has been proven empirically.**

## Routing — When `/nacl-tl-fix` vs `/nacl-tl-intake`

`/nacl-tl-fix` handles one bug whose classification is unambiguous (existing UC is broken, error message names a known surface). Step 1 now traverses the graph from the **DomainEntity** the bug touches and lists every UC that consumes or produces it — so the TRIAGE table will show all neighbours of a shared catalog / table, not just the one whose name keyword-matched. Review those neighbours before approving the fix.

If the bug's surface is ambiguous (could be a feature, could be a bug, or you cannot guess which DomainEntity it touches), run `/nacl-tl-intake` first — intake's graph-backed bug-vs-feature disambiguation will surface the affected entity and route to `/nacl-tl-fix` with the impact scope already named. Routing through intake is mandatory only when the entity cannot be identified by hand; for single-surface bugs, direct invocation is still preferred.

## Your Role

You are a **senior developer and specification maintainer** who fixes bugs using the spec-first approach. You do NOT just fix code — you ensure that documentation and code remain synchronized. Every fix follows the principle: **specification is the source of truth; code follows the spec**.

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

**L1+ blocked without preceding spec-update commit; override via signed exception only.**

For any fix classified L1 or higher (i.e. anything that touches production
code — L1, L2, L3-spec-gap; L3-feature already exits at Step 3), this skill
**refuses to enter Step 6 (APPLY FIX)** unless the fix chain already contains
at least one **spec-update commit** that precedes the first code-fix commit.

A **spec-update commit** is any commit that mutates one of the following:

1. **Graph state** — at least one of the following Neo4j node labels was
   created or modified by the commit (detected via the W5 reconciliation
   primitives, see "Detection logic" below):
   `DomainEntity`, `DomainAttribute`, `Enumeration`, `UseCase`,
   `FormField`, `Module`, `Requirement`, `FeatureRequest`,
   `BusinessRule`, `Activity`.
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

Karatov-procontent shipped Wave 4 with `a7eb747 docs(SA): UC-105/UC-106/UC-107
post-commit emit timing (L2)` landing **AFTER** the FIX-B code wave
(`01f2fcb`, `135b14b`, `6ed12ac`, `3acb2fd`) — the spec caught up to code,
not the other way around. The DIAGNOSTIC-REPORT.md dated 2026-05-18 measured
**39% of fixes never updated documentation at all**. Every undocumented
fix made the next post-mortem harder because the spec snapshot used to
diagnose drift was itself unreliable (Karatov post-mortem § 1 patterns
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
     `spec-update-by-status-json` in the Step 8 report.
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
  verdict:               <PASS | FAIL>
```

Apply the rules in order — first match wins:

| # | Condition | Action |
|---|---|---|
| 1 | classification is `L0` | SKIP gate. Proceed to Step 6 sub-flow 6M / TDD. (L0 is environment / infra, not spec-touching.) |
| 2 | `--dry-run` is set | SKIP gate. The check is recorded in the Step 8 report but does not refuse, since no code is written. |
| 3 | verdict is `PASS` | Proceed to Step 6 sub-flow. Record the satisfying spec-update commit SHA in the Step 8 report. |
| 4 | verdict is `FAIL` AND a valid signed exception against gate `spec-first-prerequisite` exists for this project at `.tl/exceptions/` (W4 schema; unexpired; specific `affected_gates`; concrete `reason`; valid `followup_task`) | Proceed to Step 6 sub-flow. Record the `exception_id`, `expiry`, and `followup_task` in the Step 8 report. The header becomes `FIX APPLIED — UNVERIFIED (spec-first-bypassed-by-signed-exception)`. |
| 5 | verdict is `FAIL` AND no valid signed exception exists | REFUSE. Halt with `Status: BLOCKED` and workflow detail `spec-first-prerequisite-missing`. Do not touch production code. Print the refusal advisory below and exit. |
| 6 | detection emitted `Status: BLOCKED (graph-delta-unobservable)` AND no signed exception against gate `spec-first-prerequisite` exists | REFUSE with workflow detail `graph-delta-unobservable`. |

#### Refusal advisory (rule 5)

```
┌──────────────────────────────────────────────────────────┐
│ FIX HALTED — SPEC-FIRST PREREQUISITE MISSING             │
├──────────────────────────────────────────────────────────┤
│ Classification: L1 (code change without spec update)    │
│                                                          │
│ The fix chain contains <N> code-fix commit(s) but no    │
│ preceding spec-update commit. The W10 Spec-First         │
│ prerequisite requires that every L1+ fix be preceded by  │
│ a graph mutation or a .tl/* schema artifact change in   │
│ the same chain.                                          │
│                                                          │
│ Without that ordering, the post-mortem record shows      │
│ that 39% of fixes never update docs (Karatov, 2026-05-  │
│ 18). The fix skill refuses to ship into that pattern.    │
│                                                          │
│ Three legitimate paths forward (no flag bypass):         │
│   [1] Re-run Step 5 (FIX DOCS) and commit the spec      │
│       update FIRST. Then re-invoke /nacl-tl-fix and the │
│       gate passes by construction.                       │
│   [2] If Step 3 classified L2/L3 but Step 5 was         │
│       skipped, return to Step 3 and re-classify.        │
│   [3] If the fix is genuinely L1 (docs ARE current and  │
│       complete) and the detection has a false negative  │
│       (e.g. an external code-mode workspace where the   │
│       spec lives outside .tl/ and outside the graph),   │
│       file a signed exception against gate              │
│       `spec-first-prerequisite` per W4 schema:          │
│       - affected_gates: [spec-first-prerequisite]       │
│       - reason: <concrete justification of the L1       │
│         classification + why no spec update is needed> │
│       - expiry: ≤ 24h                                    │
│       - followup_task: <UC or TECH that audits the     │
│         classification>                                  │
│                                                          │
│ Status: BLOCKED                                          │
│ Workflow detail: spec-first-prerequisite-missing         │
└──────────────────────────────────────────────────────────┘
```

#### Worked example — the Karatov 39% pattern

The historical episode that motivates this gate (Karatov post-mortem
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

**For L0/L1:** Skip this step entirely. Proceed to Step 6.

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

#### → USER GATE (L2 / L3-spec-gap only)

Present to user (in their language):
1. Which docs will be changed/created
2. Diff of doc changes
3. Code fix plan

**Do NOT proceed without explicit user confirmation.**
**L0/L1 fixes proceed without USER GATE** unless `--confirm` flag is used.
**L3-feature does not reach this gate** — it already exited at Step 3.

---

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
- **Spec-update commit (if PASS):** <SHA> (<message>)
- **Root cause:** [what was wrong]
- **Affected UC:** UC-### (or "infrastructure")
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

Execute Steps 1-4, show the report, do NOT execute Steps 5-8.
Useful for understanding scope before making changes.

---

## References

- `nacl-tl-core/references/fix-classification-rules.md` — L0/L1/L2/L3 classification rules
- `nacl-tl-core/references/sa-doc-update-matrix.md` — "code change → doc → skill" matrix
- `nacl-tl-core/references/tdd-workflow.md` — TDD cycle for Step 6
- `nacl-tl-core/references/review-checklist.md` — self-review checklist
- `nacl-tl-core/references/stub-tracking-rules.md` — stub markers
- `/nacl-tl-regression-test` (sibling skill) — invoked from Step 6d to write a regression test against broken code (RED-first). The fix author MUST NOT also write the regression test.

If a reference file is not found in the project, use the inline tables and rules in this SKILL.md as fallback.

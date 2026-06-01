---
name: nacl-tl-intake
model: opus
effort: high
description: |
  Graph-aware request triage: queries Neo4j to disambiguate features vs bugs.
  Routes features to nacl-sa-feature, bugs to nacl-tl-fix, tasks to nacl-tl-dev.Use when: triage with graph context, batch of changes with graph, or the user says "/nacl-tl-intake".
---

# /nacl-tl-intake -- Graph-Aware Request Triage & Decomposition

## Your Role

You are a **product triage specialist** with access to the project's **Neo4j knowledge graph**. When the user brings a batch of changes ("I want these 5 things"), you decompose them into independent work items, classify each using graph-based disambiguation, group related items into features, and then auto-execute the appropriate skills sequentially.

You are the **universal entry point** for any user request that contains multiple changes or where the type of work (feature vs bug vs task) is unclear -- and the project has a populated Neo4j graph.

**Key advantage over nacl-tl-intake:** Classification queries the graph for existing Use Cases. If a UC already exists and is detailed, the request is likely a BUG (existing behavior is broken). If no matching UC exists, it is a FEATURE (new behavior).

## Key Principles

```
1. Source -> Extract -> Classify (via graph) -> Group -> Validate -> Confirm -> Execute
2. One feature = can ship independently with user value
3. Graph-first classification: query Neo4j before keyword heuristics
4. Propose decomposition, user confirms (graph reduces misclassification)
5. After confirmation -- full autopilot, no further prompts until done
```

---

## Shared References

Read `nacl-core/SKILL.md` for:
- Neo4j MCP tool names and connection info (`mcp__neo4j__read-cypher`, `mcp__neo4j__write-cypher`)
- ID generation rules
- Schema files location (`graph-infra/schema/`)
- Query library location (`graph-infra/queries/`)

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Query existing UCs for classification |

---

## Invocation

User describes what they want in natural language -- any format, any mix:

```
/nacl-tl-intake "I need these changes:
1. Add image format selection (16:9, 9:16, square)
2. Show the scene prompt alongside the final prompt
3. Allow editing the prompt and regenerating
4. Show regeneration attempts as tabs
5. Add image editing mode via inpainting"
```

Or even less structured:

```
/nacl-tl-intake "The share button doesn't work on mobile, also I want to add
a payment system, and we need to update the deploy docs for the new server"
```

### Flags

| Flag | Description |
|------|-------------|
| `--yes` | Auto-confirm HIGH+GRAPH+no-spec-gap+L0/L1 atoms without prompting (see `--yes flag behavior` below). |
| `--emit-state <path>` | Write the deterministic routing table as a JSON file (2.10.1+). When set, this skill writes the table to the given path INSTEAD of (or in addition to) interactive prompting. Used by `/nacl-goal intake` to capture classification artifacts for the wrapper. Format: see §`--emit-state` JSON schema below. |
| `--namespace=<DOMAIN>` | (sa-feature passthrough, optional) Restrict classification to a single domain namespace. |

### `--emit-state` JSON schema (2.10.1+)

When `--emit-state <path>` is set, this skill writes a JSON file at `<path>` with the following shape (per `nacl-goal/plan-lock-schema.md` §intake.json):

```json
{
  "schema_version": 1,
  "atoms": [
    {
      "id": "atom-<short_sha256(type + linked_uc + normalized_title)>[:12]",
      "type": "BUG|TASK|FEATURE_SMALL|FEATURE_HEAVY",
      "title": "<one-line atom summary>",
      "linked_uc": "UC-NNN|TECH-NNN|null",
      "evidence": ["GRAPH", "HEURISTIC", "USER_OVERRIDE"],
      "confidence": "HIGH|MEDIUM|LOW",
      "risk_level": "L0|L1|L2|L3",
      "depends_on": ["atom-<...>"],
      "hard_refuse_triggers": ["<trigger>"],
      "trigger_evidence": "<short quote from goal text justifying each trigger>",
      "spec_gap": false,
      "residual_note": null,
      "skill_path": "nacl-tl-fix|nacl-tl-dev|nacl-sa-feature -> nacl-tl-dev"
    }
  ],
  "classification_metadata": {
    "ambiguous": false,
    "ambiguity_reason": null,
    "requires_split": false,
    "split_reason": null
  }
}
```

#### FEATURE size class

The `type` field distinguishes `FEATURE_SMALL` (bounded — can be implemented inside one PR without product decisions) from `FEATURE_HEAVY` (requires migrations, auth/security, billing, multiple architecture trade-offs, or a product-decision the orchestrator can't make).

Classification rule for FEATURE atoms:

```
FEATURE_HEAVY if ANY of:
  • hard_refuse_triggers contains any of: schema_migration, public_api_contract,
    auth_or_security, permissions, billing, destructive_data_operation,
    l2_l3_architecture, product_decision_required, hotfix_or_release_routing
  • the atom would require >1 new HTTP route AND >1 new DB column AND >1 new graph entity
  • the goal text mentions ≥3 of: pricing, payment, auth, role, permission,
    migration, schema, refactor architecture, API contract
  • the linked UC does not exist AND the goal requires a new bounded context

FEATURE_SMALL otherwise (the default for feature requests that have:
  - a clear linked UC (existing or trivially creatable),
  - no hard_refuse triggers,
  - implementation fits one feature branch + one PR + one CI run)
```

#### `depends_on` hints

When this skill can infer that one atom semantically depends on another (e.g. atom A creates a route that atom B consumes), it populates `atom_B.depends_on = ["atom-A"]`. When uncertain, leave the list empty — the wrapper's topological sort tie-breaks by BUG-before-FEATURE then by id.

`depends_on` is a hint, not a hard constraint. The wrapper's plan lock applies it via topological sort and refuses cycles.

#### `residual_note` (aspect-split residual)

When an atom carries BOTH an unconditionally-correct defensive part AND a genuinely-ambiguous residual (see Step 2b "aspect split"), the shipped part keeps `spec_gap: false` and the residual is recorded here instead of blocking the user:

```json
"residual_note": {
  "summary": "<plain-language open question, no internal tokens>",
  "working_assumption": "<what the fix proceeds on>",
  "verify_by": "staging|user|null",
  "followup_task": "<YouGile child-task id OR .tl/open-questions.md anchor>",
  "route": "note|L2-with-flag"
}
```

`null` when the atom has no residual. A non-null `residual_note` MUST carry a `followup_task` — a residual with no recorded follow-up is invalid and falls back to the prompt (see Step 2b binding rule + Step 6 durable sink).

#### `hard_refuse_triggers` closed set

The wrapper consumes this field mechanically (see `nacl-goal/plan-lock-schema.md` §hard_refuse_triggers → refusal mapping). This skill MUST emit triggers ONLY from this closed set:

- `schema_migration` — DB migration, message-contract change
- `public_api_contract` — public API surface modification
- `auth_or_security` — authentication, authorization, security-policy change
- `permissions` — role/permission matrix change
- `billing` — payment, pricing, invoicing change
- `destructive_data_operation` — bulk delete, data migration, backup-incompatible change
- `l2_l3_architecture` — bounded-context boundary change, cross-module contract change
- `product_decision_required` — feature requires choosing between alternatives
- `hotfix_or_release_routing` — atom is L0/L1 emergency or release-pipeline-touching

Each trigger MUST also populate `trigger_evidence` with a short verbatim quote from the user's goal text.

`--emit-state` does NOT preclude interactive prompting. When both `--emit-state <path>` and `--yes` are set, the skill writes the JSON AND auto-confirms eligible atoms. When `--emit-state` is set without `--yes`, the JSON is written first; then interactive prompts run as today (and the user can manually adjust the file afterwards).

### Goal-context env vars (2.10.1+)

When this skill is invoked under `/nacl-goal intake`, the wrapper exports `NACL_GOAL_RUN_ID` (and the other goal env vars). This skill recognizes `NACL_GOAL_RUN_ID` only for logging purposes — classification logic is unaffected. The wrapper itself passes `--yes --emit-state .tl/goal-runs/<run_id>/intake.json` so this skill does NOT need to read the env vars to know it's running under a goal.

**Invariant**: when these env vars are absent and `--emit-state` is not passed, this skill behaves exactly as today.

---

## Language Rules

- **This SKILL.md:** English (instructions for Claude)
- **User interaction:** User's language (detect from conversation)
- **Downstream skills** receive instructions in their own language convention
- **User-facing vocabulary (MANDATORY).** Any string *printed to the user* MUST use observable, behavioral language and MUST NOT contain internal tokens — `L0`/`L1`/`L2`/`L3`, `spec_gap`, `POLICY_CALL`, "re-anchor", `gate_payload`, gate names, or graph requirement IDs. Translate them:
  - `L1` → "a code-only fix (the spec already describes the right behaviour)"; `L2`/`L3` → "this also needs the spec/docs updated first"
  - `spec_gap` / "re-anchor to a global timeline" → "the spec doesn't currently say how X should behave"
  - `POLICY_CALL` → "a judgment call: was X always expected, or is it genuinely new?"
  The `--emit-state` JSON, the decision tree, the case table, and the headline-selection rules are **machine/Claude-facing** and KEEP the canonical tokens — this rule scopes to user-shown prose only.

---

## Workflow: 7 Steps

### Step 0: SOURCE (YouGile or direct input)

**Goal:** Get the request -- either from YouGile or from user's message.

**If YouGile is configured** (`config.yaml -> yougile`):
1. Check UserRequests column for new cards:
   ```
   get_tasks(columnId: config.yougile.columns.user_requests)
   ```
2. If cards found -> read the card description as input
3. The card becomes the **parent task** -- all decomposed items become subtasks
4. If no cards and user provided text -> use text directly (no parent task)

**If YouGile is NOT configured:**
- Use the user's message directly
- No parent task, no subtask linking

### Configuration Resolution

Read `config.yaml` at project root. If not found, YouGile features are disabled.

| Data | Source priority |
|------|---------------|
| YouGile column IDs | config.yaml -> yougile.columns.* |
| YouGile sticker IDs | config.yaml -> yougile.stickers.* |
| YouGile API key | .mcp.json (MCP server env) |

If config.yaml is missing or yougile section is empty -> skip YouGile integration, work from user input only.

---

### Step 1: EXTRACT (split into atoms)

**Goal:** Break the user's message (or YouGile card) into individual, distinct requests.

1. Read the user's message or YouGile card description carefully
2. Identify each separate change/request/wish
3. Give each a sequential number and a short title
4. If a request is ambiguous or contains multiple concerns, split further

```
Atoms extracted:
  #1 "Image format selection (16:9, 9:16, square)"
  #2 "Show scene prompt alongside final prompt"
  #3 "Edit prompt and regenerate"
  #4 "Regeneration attempts as tabs"
  #5 "Image editing via inpainting"
```

**Rule:** When in doubt, split more. It's easier to merge than to split later.

---

### Step 2: CLASSIFY (graph-aware, for each atom)

**Goal:** Determine the type of each atom using Neo4j graph disambiguation.

#### Step 2a: Query Neo4j for matching UCs

For each atom, extract 2-3 keywords and run the `sa_find_uc_by_keywords` query:

```cypher
// sa_find_uc_by_keywords
// From: graph-infra/queries/sa-queries.cypher
MATCH (uc:UseCase)
WHERE toLower(uc.name) CONTAINS toLower($keywords)
   OR toLower(coalesce(uc.description, '')) CONTAINS toLower($keywords)
RETURN uc.id AS id, uc.name AS name, uc.detail_status AS status
ORDER BY uc.id
```

Run one query per atom. Use the atom's core concept as `$keywords` (e.g., "image format", "share button", "deploy docs").

#### Step 2b: Classify based on graph results — then require per-atom confirmation

Apply this decision tree to each atom, using the query results:

```
Did sa_find_uc_by_keywords return matching UCs?
  |
  +-- YES, matching UC found with detail_status = 'detailed' or 'approved':
  |     The behavior IS specified. Is the atom reporting broken/wrong behavior?
  |       -> YES (matches existing spec — behavior is broken):
  |            BUG  (confidence: HIGH, evidence: GRAPH, spec_gap: false)
  |       -> NO, wants different existing behavior:
  |            FEATURE  (confidence: HIGH, evidence: GRAPH, spec_gap: false)
  |       -> SPEC_GAP: atom names a sub-aspect the UC does NOT currently specify
  |            (per-X qualifier, refinement noun, UI element, or artifact type
  |             absent from the matched UC's name/description/forms/fields):
  |            BUG, spec_gap: true. Resolve via Step 2b-pre + 2b-split below:
  |            ship any unconditionally-correct defensive part at L1; route the
  |            ambiguous residual at L2-with-flag (or as a tracked NOTE); block
  |            for a human decision ONLY when the residual carries a
  |            hard_refuse_trigger. NOT an unconditional user gate.
  |
  +-- YES, matching UC found with detail_status = 'draft' or 'stub':
  |     The behavior is partially specified.
  |       -> Likely FEATURE  (confidence: MEDIUM, evidence: GRAPH)
  |
  +-- NO matching UC found:
  |     The behavior is NOT specified.
  |       -> "X doesn't work" phrasing: BUG  (confidence: MEDIUM, evidence: GRAPH)
  |       -> "Add X" / "I want X": FEATURE  (confidence: MEDIUM, evidence: GRAPH)
  |       -> Infrastructure/docs/process: TASK  (confidence: MEDIUM, evidence: GRAPH)
  |
  +-- Neo4j UNAVAILABLE (connection error):
        Fall back to keyword-based classification (Step 2c)
        All atoms get confidence: LOW, evidence: HEURISTIC
```

**SPEC_GAP detection heuristics** (any one sufficient to set `spec_gap: true`):

- Atom mentions a **per-X qualifier** (per-iteration, per-step, per-attempt, per-row, per-version) that does not appear in the matched UC's `name` or `description`.
- Atom requests a **refinement noun** — naming convention, ordering, chronology, count, format detail, label, sort order — that is not mentioned in the matched UC's acceptance criteria / form fields.
- Atom names a **UI element or artifact type** not reachable from the matched UC via `UseCase -[:HAS_FORM]-> Form -[:HAS_FIELD]-> Field` or `UseCase -[:PRODUCES]-> Artifact` (text-level check for now; structured Cypher follow-up is out of scope).
- Reasoning paragraph for the atom would naturally contain the phrase *"spec gap also present"* or *"UC-X does not currently specify ..."* — this is the signal the skill *already* writes today but does not act on.

When `spec_gap: true`, the classification stays BUG with HIGH confidence. The bug-vs-feature distinction used to be an unconditional user gate; it is now resolved by the two rules below, and surfaced to the user ONLY when the input has not already answered it AND getting the residual wrong is genuinely costly.

##### Step 2b-pre: honor a decision the input already made

Before firing ANY per-atom gate, scan the atom's own source span (the slice of the user's request / card that produced this atom) for an **explicit** decision answering the gate's question. Three recognizers, each requiring an explicit token:

- **Explicit level expectation** — a named level or its plain equivalent, e.g. "expect L1", "this is just a code fix", "L2 only if the contract pins X".
- **Explicit sub-mode handling instruction** — an imperative for a specific failure mode, e.g. "guard regardless", "reproduce on <real path> first", "downgrade/close if not reproducible".
- **Explicit bug-vs-feature call** — e.g. "this is a bug, the spec was incomplete" / "treat as new scope".

If a recognizer fires, record the resolution and **skip that gate's prompt**. Provenance: add `USER_OVERRIDE` to `evidence` and capture the verbatim source slice in `trigger_evidence` (same pattern as hard_refuse triggers) — this is what keeps the audit honest. On ANY ambiguity, do NOT guess — fall through to the (plain-language) prompt; a too-eager skip is worse than a too-eager gate. A recognizer may answer only PART of the question (the sub-mode but not bug-vs-feature) — resolve only what it answers; the rest continues to Step 2b-split.

##### Step 2b-split: ship what is unconditionally correct, defer only the genuine residual

A spec_gap atom often bundles two separable parts:

- an **unconditionally-correct defensive part** — a guard / clamp / graceful-degrade that is correct under EVERY interpretation of the ambiguity AND touches no contract/schema/auth/billing surface. Litmus: it changes observable behaviour in **no** case where current behaviour is already correct (a negative-duration clamp fires only on the already-broken path → qualifies; a clamp that also alters a valid in-range value does NOT → stays gated).
- an **ambiguous residual** — the genuinely-unspecified semantic.

Resolution:

1. **Defensive part** → route to `/nacl-tl-fix` at **L1**, no prompt (`spec_gap: false` for this part; it is contract-free, so the spec is not stale for it). Announce via Template A-note.
2. **Ambiguous residual** → record as `residual_note` and route at **L2-with-flag** (or keep as a tracked NOTE). NEVER L1: `spec_gap: true` *is* doc-staleness, and an L1 attestation would let `/nacl-tl-fix` ship code against a stale spec (its 6.SF gate checks ordering, not staleness — see `nacl-tl-fix` W10). The residual MUST carry a `followup_task` (Step 6 Backlog task / `.tl/open-questions.md`); a residual with no follow-up is invalid and falls back to the prompt.
3. **Block for a human decision (plain-language Template C) ONLY** when the residual carries a `hard_refuse_trigger` from the closed set — `schema_migration` / `public_api_contract` (external/breaking only — documenting consumer-side input tolerance does NOT count) / `auth_or_security` / `permissions` / `billing` / `destructive_data_operation` / `l2_l3_architecture` / `product_decision_required`. This is the "costly/irreversible" carve-out. Otherwise proceed with the working assumption + the recorded follow-up.

`--yes` and `/nacl-goal` autonomous mode follow these same rules; the only thing that still forces a prompt is an unresolved hard_refuse residual.

**Per-atom confirmation gate (runs after classifying EACH atom — behavior differs by case):**

A generic "Correct? [yes / adjust / skip]" trains the user to rubber-stamp and squanders the confidence label. Pick the gate behavior from the case table below, then fire the matching prompt template (or no prompt at all). **Do NOT proceed to Step 3 (GROUP) until every atom has been confirmed, auto-routed, or skipped.**

| Case | Gate behavior |
|------|---------------|
| HIGH + GRAPH, **no spec gap**, classification level **L0/L1** (low blast radius) | **Auto-route, no prompt.** Print the auto-route line (template A) and proceed. |
| HIGH + GRAPH, **no spec gap**, classification level **L2/L3** (high blast radius) | **Launch-sanity prompt** (template B) — not a classification question, just a "ready to launch?" check. |
| HIGH + GRAPH, **spec_gap: true** | Apply Step 2b-pre + Step 2b-split. Ship the defensive part with no prompt (template A-note); record the residual as a tracked follow-up. Fire the **plain-language template C** ONLY if the residual carries a hard_refuse_trigger; otherwise proceed on the working assumption. |
| MEDIUM + GRAPH | **Recommendation prompt** (template D) — leading option + alternatives + reasoning. |
| LOW / HEURISTIC | **Open-disambiguation prompt** (template E) — present options with equal weight, no forced recommendation. |

#### Template A — auto-route line (no prompt)

```
Atom #N: "[atom title]" -> [TYPE] (auto-routed)
  Matched UC: UC-XXX "name"
  Backed by: the project graph (high confidence)
  Routing to [downstream skill]...
```

#### Template A-note — auto-route a safe fix while flagging a deferred question (Step 2b-split)

No prompt. The note is backed by a tracked follow-up (Step 6 / `.tl/open-questions.md`), so the question is not lost — it just doesn't block the fix.

```
Atom #N: "[atom title]" -> BUG (auto-routed — shipping the safe fix now)
  Matched UC: UC-XXX "name"
  Open question (won't block this fix): [plain-language residual — e.g.
    "the spec doesn't say whether each voice comment starts from the start of
     its clip or at a set moment in the finished video"].
  Proceeding on the assumption: [working assumption]. Verifying on staging.
  Tracked as: [followup task id / open-questions anchor] — tell me if the
  assumption is wrong and I'll adjust.
  Routing to [downstream skill]...
```

#### Template B — launch-sanity prompt (L2/L3 only)

```
Atom #N: "[atom title]" -> [TYPE] (high confidence, backed by the project graph)
  Matched UC: UC-XXX
  This change also needs the spec/docs updated first, and touches: UC-XXX, UC-YYY, the API contract.

  Ready to start?
    1. start -> launch [downstream skill]
    2. skip  -> set this one aside for now
```

(Note: this prompt asks about *launch readiness*, not classification. The classification is already settled at HIGH+GRAPH.)

#### Template C — decision needed (fires ONLY when the residual is costly to get wrong)

Fires only when Step 2b-split flags a residual carrying a hard_refuse_trigger (the input did not already answer it, and getting it wrong is expensive to undo). Plain language — no internal tokens. Internally this routes choice 1 → `/nacl-tl-fix --uc UC-XXX`, choice 2 → `/nacl-sa-feature` (record `evidence: USER_OVERRIDE (spec_gap)`), choice 3 → drop.

```
Atom #N: "[atom title]"
  Matched UC: UC-XXX "name"

  I can stop the crash either way — that part ships now. But before I write
  down how this should behave, I need one decision from you, because getting
  it wrong here is expensive to undo ([why — e.g. it changes the published
  API / a billing rule]):

  [plain-language statement of what the spec doesn't currently say].

  Was this always expected to work this way, or is it genuinely new?
    1. Always expected -> I fix it and write the behaviour into the spec
    2. Genuinely new   -> I scope it as a new feature instead
    3. Set aside       -> drop it for now
```

#### Template D — recommendation prompt (MEDIUM confidence)

```
Atom #N: "[atom title]"
  Best guess: [TYPE]  (fairly confident, based on the project graph)
  Why: [one sentence — why this is the leading call]
  Could also be: [other plausible TYPE(s) and what would tip the scale]

  Correct? [yes / change to <other type> / set aside]
```

#### Template E — open-disambiguation prompt (LOW / HEURISTIC)

```
Atom #N: "[atom title]"
  I'm not sure how to classify this (the project graph didn't resolve it).
  Could be a bug, a new feature, or a task.
  What I see: [why the graph didn't resolve, what wording leans each way]

  Pick one — no recommendation:
    1. Bug      -> fix it
    2. Feature  -> design it as new functionality
    3. Task     -> infra / docs / process work
    4. Set aside
```

**`--yes` flag behavior:**

- `--yes` auto-confirms (i.e. fires Template A / A-note without prompting) ONLY when ALL of the following hold for the atom:
  - `confidence: HIGH`
  - `evidence: GRAPH` (matched UC `detail_status = detailed | approved`)
  - `spec_gap: false`, OR `spec_gap: true` whose residual is resolved by Step 2b-pre / 2b-split with NO hard_refuse_trigger (ships via Template A-note + tracked follow-up)
  - classification level: `L0` or `L1` (low blast radius — per `nacl-tl-core/references/fix-classification-rules.md`)
- `--yes` does NOT bypass the prompt for:
  - SPEC_GAP atoms whose residual carries a hard_refuse_trigger — plain-language decision required (template C)
  - L2/L3 atoms — launch-sanity check required (template B)
  - MEDIUM confidence atoms (template D)
  - LOW / HEURISTIC atoms (template E)
- "skip" / "set aside" drops the atom from the execution plan; user must explicitly re-add it later.
- "adjust" / "change" accepts a corrected type from the user; record the manual override as `evidence: USER_OVERRIDE`.
- For SPEC_GAP atoms where the user chooses FEATURE, record `evidence: USER_OVERRIDE (spec_gap)` so the final summary headline can route through the REROUTED rule (see "Final summary" below).

#### Step 2c: Fallback -- keyword-based classification (when Neo4j is unavailable)

If Neo4j connection fails, use the same heuristic rules as nacl-tl-intake:

```
Is it unintended behavior that violates existing spec or breaks functionality?
  -> YES: BUG (route to /nacl-tl-fix)

Is it new functionality or enhancement to existing behavior?
  -> YES: FEATURE (route to /nacl-sa-feature)

Is it infrastructure, documentation, research, or process work?
  -> YES: TASK (route to /nacl-tl-dev or manual)

Is it unclear?
  -> ASK the user for clarification
```

**Disambiguation rules (fallback only):**
- "X doesn't work" -> likely BUG
- "Add X" / "I want X" -> likely FEATURE
- "Update docs for X" / "Migrate to X" -> likely TASK
- "X should work differently" -> could be BUG or FEATURE -- ask user

#### Step 2d: Present classification evidence

For each atom, show the user WHY it was classified as it was — in **plain language**. The internal labels (`spec_gap`, `risk_level`/level, `confidence`, `evidence`, `POLICY_CALL`) are written to the `--emit-state` JSON for audit and read by Step 2b to pick the gate behaviour; they are NOT printed to the user (Language Rules → user-facing vocabulary):

```
#1 "Image format selection" -> FEATURE
    Graph: No matching UC found for "image format"
    Why: new behaviour, not described in the spec yet
    (fairly confident — the graph didn't fully resolve it)

#2 "Share button doesn't work" -> BUG
    Graph: UC-012 "Share Content" (already specified)
    Why: the behaviour is specified and the user reports it broken
    A code-only fix — the spec already describes the right behaviour.

#3 "Task artifacts page missing verifier reports + per-iteration images" -> BUG
    Graph: UC-105 "View task status and results"; UC-151 "Verifier loop"
    Why: UC-105 specifies the status page, but the spec doesn't currently say
         how per-iteration items should be named / ordered.
    I'll fix the crash safely now; the naming/ordering question is tracked as
    an open follow-up (verified later), and only needs your decision if it
    turns out to touch the published API.
```

This transparency helps the user validate classifications and reduces the ~30% misclassification rate that keyword-only approaches produce. The machine-facing `spec_gap` / level / confidence values live in the `--emit-state` JSON (Step 2b reads them to choose the gate behaviour) — the user sees plain prose, not the tokens.

---

### Step 3: GROUP (cohesion analysis for features)

**Goal:** Merge related feature-atoms into logical features. Each feature should be independently shippable with user value.

**Grouping criteria (if ANY is true -> group together):**

| Criteria | Example |
|----------|---------|
| **Same UI context** (one screen/page) | Format selection + prompt editing + tabs = same result page |
| **Shared data model** (same new entity) | Both need a "regeneration attempt" concept |
| **Sequential dependency** (A requires B) | Tabs (#4) require regeneration (#3) |
| **No user value alone** (meaningless without sibling) | Show prompt (#2) is useless without edit prompt (#3) |

**Splitting criteria (if ANY is true -> split into separate feature):**

| Criteria | Example |
|----------|---------|
| **Different API flow** (text-to-image vs image-to-image) | Inpainting is a different pipeline |
| **Can ship independently** with user value | Format selection could ship alone |
| **Different user persona** | Admin dashboard vs end-user feature |
| **No shared new entities** | Uses existing models, different endpoints |

**When in doubt:** Keep together if the user would perceive them as "one thing." Split if they'd say "those are two different things."

---

### Step 4: VALIDATE (INVEST check for each feature)

**Goal:** Verify each proposed feature is well-sized and actionable.

For each grouped feature, check:

| Criteria | Check | If fails |
|----------|-------|----------|
| **I**ndependent | Can be prioritized without blocking other features? | If not -> note dependency order |
| **N**egotiable | Room for implementation discussion? | Always true for features |
| **V**aluable | Has user value on its own? | If not -> merge with another feature |
| **E**stimable | Can estimate ~N UCs, ~M days? | If not -> needs spike/research task first |
| **S**mall | <=5 new UCs, <=1 week of work? | If bigger -> split further with SPIDR |
| **T**estable | Clear acceptance criteria? | If not -> needs refinement from user |

**SPIDR splitting patterns** (when feature is too big):
- **S**pike: Create a research task first
- **P**ath: Split by user flow / happy path vs error handling
- **I**nterface: Split by input type / format
- **D**ata: Split by data variation
- **R**ules: Split by business rule

---

### Step 5: PRESENT (USER GATE)

**Goal:** Show the decomposition to the user for confirmation.

Present in the user's language:

```
===============================================
  INTAKE TRIAGE RESULT (graph-aware)
===============================================

From your 5 requests, I identified:

  FEATURES: 2
  +----------------------------------------------+
  | Feature 1: "Generation Controls"             |
  | Items: #1 format, #2 prompts,                |
  |        #3 edit+regen, #4 tabs                |
  | Reason: same screen, shared data model,      |
  |         #4 depends on #3, #3 depends on #2   |
  | Graph evidence: No matching UCs found        |
  | Based on: the project graph                  |
  | Estimate: ~3-4 UCs, ~1 wave                  |
  | -> /nacl-sa-feature                         |
  |                                              |
  | Feature 2: "Image Editing"                   |
  | Items: #5 inpainting                         |
  | Reason: different API flow (img-to-img),     |
  |         can ship independently               |
  | Graph evidence: No matching UCs found        |
  | Based on: the project graph                  |
  | Depends on: Feature 1 (needs tabs UI)        |
  | Estimate: ~1-2 UCs, ~1 wave                  |
  | -> /nacl-sa-feature (after Feature 1)       |
  +----------------------------------------------+

  BUGS: 1
  +----------------------------------------------+
  | Bug 1: "Share button broken on mobile"       |
  | Graph evidence: UC-012 "Share Content"       |
  |   (already specified) -- behaviour defined   |
  | Based on: the project graph                  |
  | -> /nacl-tl-fix                              |
  +----------------------------------------------+

  TASKS: 0

Execution plan:
  1. /nacl-tl-fix "Share button broken on mobile"
  2. /nacl-sa-feature "Generation Controls: ..."
  3. /nacl-sa-feature "Image Editing: ..."

Total estimate: ~5-6 UCs, ~2 waves

Approve? [yes / adjust / cancel]
===============================================
```

**User can:**
- **yes** -> proceed to auto-execution
- **adjust** -> modify grouping ("merge these two", "split this one", "drop #3 for now")
- **cancel** -> abort

**Do NOT proceed without explicit user confirmation.**

---

### Step 6: YOUGILE TASK CREATION (if configured)

**Goal:** Create child tasks in YouGile Backlog, link as subtasks to parent card.

If YouGile is configured AND a parent task exists (from Step 0):

1. For each feature/bug/task in the confirmed plan:
   Wrap each API call with retry (3 attempts, 2-second back-off between attempts):
   ```
   create_task(
     title: "[Feature] Generation Controls" or "[Bug] Share button" or "[Task] Update deploy docs",
     columnId: config.yougile.columns.backlog,
     description: "<feature description>",
     stickers: { task_type: feature/bug/task, module: detected_module, source: agent }
   )
   ```
   If all 3 attempts fail for any `create_task` call:
   ```
   INTAKE HALTED — RUNNER_BROKEN (YouGile linking failed)
   Reason: create_task failed after 3 attempts for item "[item title]"
   API error: [last error message]
   Action: Fix YouGile connectivity or skip YouGile integration (remove yougile section from config.yaml).
   ```
   Stop immediately. Do not proceed to execution.

2. Collect all child task IDs
3. Link to parent: `update_task(parentTaskId, subtasks: [child1, child2, ...])`
   Wrap with retry (3 attempts). If all 3 attempts fail:
   ```
   INTAKE HALTED — RUNNER_BROKEN (YouGile linking failed)
   Reason: update_task (subtask linking to parent [parentTaskId]) failed after 3 attempts
   API error: [last error message]
   Child tasks created (not yet linked): [list of child task IDs]
   Action: Manually link the listed child tasks to the parent card, then re-run from Step 7.
   ```
   Stop immediately.

4. Post decomposition summary to parent task chat:
   Wrap with retry (3 attempts). If all 3 attempts fail: log warning but do NOT halt — the summary
   is informational only.
   ```
   send_task_message(parentTaskId, "
   Decomposed into N items:
   - [Feature] Generation Controls -> subtask
   - [Feature] Image Editing -> subtask
   - [Bug] Share button -> subtask
   All linked as subtasks. Classification based on Neo4j graph evidence.
   ")
   ```

5. **Open-question follow-ups (durable sink).** For EVERY atom carrying a non-null `residual_note` (a deferred ambiguity from Step 2b-split, OR any discrepancy surfaced during analysis but not fixed now), create a child task in Backlog so the finding is never lost:
   ```
   create_task(
     title: "[Open question] <plain residual summary>",
     columnId: config.yougile.columns.backlog,
     description: "Working assumption: <residual.working_assumption>.
                   Verify by: <residual.verify_by>.
                   Parent atom: <atom title / UC>.
                   Surfaced by intake; resolve before the parent is closed.",
     stickers: { task_type: open_question, source: agent }
   )
   ```
   Link it as a subtask of the parent card and write its id back into `atom.residual_note.followup_task`. **Closure gate:** the parent card MUST NOT move to Done while any `[Open question]` subtask is open. A `residual_note` that produces no follow-up id is a bug in this step — fall back to the plain-language prompt for that atom.

If YouGile NOT configured -> skip the task-creation steps above, BUT still persist every `residual_note` by appending it to `.tl/open-questions.md` (one entry per residual: summary, working assumption, verify-by, parent atom). A residual is NEVER left as console-only output.

---

### Step 7: EXECUTE (autopilot)

**Goal:** Execute the confirmed plan -- features via `/nacl-sa-feature`, bugs via `/nacl-tl-fix`, tasks via `/nacl-tl-dev`.

**Critical routing difference from nacl-tl-intake:**

| Item type | nacl-tl-intake routes to | nacl-tl-intake routes to |
|-----------|---------------------|---------------------------|
| Feature | `/nacl-sa-feature` | `/nacl-sa-feature` |
| Bug | `/nacl-tl-fix` | `/nacl-tl-fix` (unchanged) |
| Task | `/nacl-tl-dev` | `/nacl-tl-dev` (unchanged) |

#### Execution Order (wave-based parallelism)

Build an execution wave plan -- same concept as nacl-tl-full waves. Independent items run in parallel, dependent items wait.

```
Wave 1: Independent items (parallel)
  +-- Tasks (no dependencies)
  +-- Bugs (no dependencies)
  +-- Independent features (no cross-feature deps)

Wave 2: Dependent items (after Wave 1)
  +-- Features that depend on Wave 1 items

Wave 3: ...
```

**Example for a mixed request:**
```
Wave 1 (parallel):
  +-- /nacl-tl-fix "Share button broken on mobile"  <-- bug, independent
  +-- /nacl-sa-feature "Generation Controls" (#1-4)  <-- independent feature

Wave 2 (after Wave 1):
  +-- /nacl-sa-feature "Image Editing" (#5)  <-- depends on Feature 1 tabs UI
```

**How to parallelize (concrete mechanism):**

Parallelism is achieved by issuing ALL Agent tool calls for a wave inside a **single assistant message**. The Agent tool is called multiple times in the same response — one invocation per independent item. Do not issue them in separate messages; that would serialize them.

```
// Correct: single message, multiple Agent calls — runs in parallel
[Message to Claude runtime]:
  Agent(skill="/nacl-tl-fix", prompt="Share button broken on mobile")
  Agent(skill="/nacl-sa-feature", prompt="Generation Controls: ...")

// Incorrect: separate messages — serializes the wave
[Message 1]: Agent(skill="/nacl-tl-fix", ...)
[Message 2]: Agent(skill="/nacl-sa-feature", ...)   // waits for Message 1 to finish
```

After ALL Agent calls in the wave return, collect results before issuing the next wave.

```
For each wave:
  1. Identify all independent items in the wave (no unresolved deps on in-flight items)
  2. Issue ALL Agent calls for this wave in a single message (true parallelism)
  3. Wait for ALL agents in the wave to complete — do not start Wave N+1 until all of Wave N are done
  4. Collect results (FR numbers, fix summaries, status fields)
  5. Start next wave
```

#### Between items: Progress report

After each skill completes, report to user. **Bug rows surface the downstream `nacl-tl-fix` six-status result verbatim** — do not collapse non-PASS statuses to "fixed":

```
[1/3] PASS: Bug 1 "Share button" -- fixed (Fix Status: PASS)
       Fix applied to UC-012; regression test transitioned RED→GREEN

[1/3] UNVERIFIED: Bug 1 "Share button" -- fix applied, no regression test (Fix Status: UNVERIFIED)
       Fix applied to UC-012; coverage gap — no test exercises the change

[1/3] NO_INFRA: Bug 1 "Share button" -- fix applied, NO_INFRA (Fix Status: NO_INFRA)
       Fix applied to UC-012; workspace declares no scripts.test

[1/3] RUNNER_BROKEN: Bug 1 "Share button" -- fix applied, RUNNER_BROKEN (Fix Status: RUNNER_BROKEN)
       Fix applied to UC-012; runner crashed; do NOT mark intake atom as fixed

[1/3] REGRESSION: Bug 1 "Share button" -- fix INCOMPLETE (Fix Status: REGRESSION)
       New failures introduced; return to /nacl-tl-fix Step 6f

[2/3] Done: Feature 1 "Generation Controls" -- specified
       Created: FR-003, 4 new UCs (UC-030..033)

[3/3] Working on Feature 2 "Image Editing"...
```

The row's leading status word is the verbatim `Status: <value>` from the `/nacl-tl-fix` Step 8 report. Headlines are advisory only; the `Status:` line is authoritative (Cross-cutting principle P1).

#### After all items: Final summary

The headline rolls up both the classification method AND the downstream fix status for every bug atom. **Final state movement** (`Done`, `Delivered`, etc.) requires PASS-family downstream status; otherwise the atom is reported as `unfinished` with the specific status, and the headline degrades to `INTAKE TRIAGE APPLIED — UNVERIFIED` (or worse) regardless of classification evidence.

Headline selection rules (first match wins):
- Any bug atom resolved with `Status: REGRESSION` ⇒ `INTAKE TRIAGE INCOMPLETE — REGRESSION (N atoms unfinished)`
- Any bug atom resolved with `Status: RUNNER_BROKEN` ⇒ `INTAKE TRIAGE HALTED — RUNNER_BROKEN (N atoms unfinished)`
- Any bug atom resolved with `Status: NO_INFRA` ⇒ `INTAKE TRIAGE APPLIED — UNVERIFIED (NO_INFRA: N atoms unfinished)`
- Any bug atom resolved with `Status: UNVERIFIED` ⇒ `INTAKE TRIAGE APPLIED — UNVERIFIED (no regression test: N atoms unfinished)`
- Any bug atom resolved with `Status: BLOCKED` (no operator accept) ⇒ `INTAKE TRIAGE APPLIED — UNVERIFIED (BLOCKED: N atoms unfinished)`
- Any atom resolved via SPEC_GAP gate with user choosing FEATURE (evidence `USER_OVERRIDE (spec_gap)`) ⇒ `INTAKE TRIAGE APPLIED — REROUTED (spec-gap policy call: N atoms moved to /nacl-sa-feature)`
- All bug atoms `Status: PASS` AND any atom heuristic-backed OR any USER_OVERRIDE ⇒ `INTAKE TRIAGE APPLIED — UNVERIFIED (heuristic-backed)`
- All bug atoms `Status: PASS` AND all atoms graph-backed ⇒ `INTAKE TRIAGE COMPLETE (graph-backed)`

**Modifier (applies on top of any headline above):** if M atoms carry an unresolved `residual_note` follow-up, append ` — M open questions pending verification` to the selected headline and list them in the summary block. These are tracked (Backlog `[Open question]` subtasks / `.tl/open-questions.md`), not dropped — the parent card cannot close until they resolve.

```
===============================================
  <HEADLINE per rules above>
===============================================

Processed: 6 requests -> 2 features, 1 bug, 0 tasks
Classification method: [Neo4j graph | keyword-fallback (Neo4j unavailable)]
Atoms unfinished (non-PASS downstream): N
Open questions pending verification: M (Backlog [Open question] / .tl/open-questions.md)

+------+------------------------------------+---------+----------+--------------------+----------+
| Atom | Title                              | Type    | Evidence | Fix Status         | State    |
+------+------------------------------------+---------+----------+--------------------+----------+
| #1   | Image format selection             | FEATURE | GRAPH    | n/a                | spec'd   |
| #2   | Share button doesn't work          | BUG     | GRAPH    | PASS               | fixed    |
| #3   | Login crash (UC-012)               | BUG     | GRAPH    | UNVERIFIED         | unfinished|
| #4   | Update deploy docs                 | TASK    | HEURISTIC| n/a                | spec'd   |
+------+------------------------------------+---------+----------+--------------------+----------+

Bug 1: "Share button broken on mobile" -- Fix Status: PASS  ✓ fixed
  Matched UC-012 "Share Content" (detailed)
  Evidence: GRAPH
  Fix Status: PASS (regression test path: tests/share/mobile.test.ts; RED→GREEN confirmed)
  State: fixed (eligible for delivery)

Bug 2 (example UNVERIFIED): "Login crash" -- Fix Status: UNVERIFIED  ✗ unfinished
  Matched UC-012 "Login" (detailed)
  Evidence: GRAPH
  Fix Status: UNVERIFIED (no test exercises the change)
  State: unfinished — not eligible for delivery; operator must add a regression test or accept gap

Feature 1: "Generation Controls" -- FR-003
  4 UCs specified (UC-030, UC-031, UC-032, UC-033)
  Evidence: GRAPH
  Graph: new nodes created

Feature 2: "Image Editing" -- FR-004
  2 UCs specified (UC-034, UC-035)
  Evidence: GRAPH
  Depends on: FR-003
  Graph: new nodes created

Next steps:
  Full lifecycle (dev + staging deploy):
    /nacl-tl-conductor --items FR-003,FR-004

  Development only (no delivery — call the dev chain directly):
    /nacl-tl-plan --feature FR-003
    /nacl-tl-full --feature FR-003

  Step by step (with delivery):
    /nacl-tl-plan --feature FR-003
    /nacl-tl-full --feature FR-003
    /nacl-tl-deliver --feature FR-003

  For unfinished bug atoms:
    UNVERIFIED  → /nacl-tl-regression-test "<bug description>" then /nacl-tl-fix
    NO_INFRA    → /nacl-tl-dev TECH-### "set up test runner for [workspace]"
    RUNNER_BROKEN → /nacl-tl-diagnose
    REGRESSION  → return to /nacl-tl-fix Step 6f
===============================================
```

---

## Edge Cases

### All items are the same type

If all atoms are features -> skip bug/task steps, go straight to grouping.
If all atoms are bugs -> skip nacl-sa-feature, execute all via /nacl-tl-fix.

### Single item

If the user provides only one request:
- If it's a feature -> redirect to `/nacl-sa-feature` directly (no decomposition needed)
- If it's a bug -> redirect to `/nacl-tl-fix` directly
- Report: "Single request detected, routing directly to [skill]"

### User disagrees with classification

If user says "that's not a bug, it's a feature" or "merge these":
- Accept the user's classification (they know their product better)
- Adjust grouping and re-present

### Feature depends on a bug fix

If a feature requires a bug to be fixed first:
- Execute bug fix first (/nacl-tl-fix)
- Then proceed with feature (/nacl-sa-feature)
- Note dependency in the execution plan

### Too many items (>10)

If the user provides >10 items:
- Extract and classify all
- Present top-level grouping
- Suggest: "Process in batches? First batch: Features 1-3, Second batch: Features 4-5 + bugs"
- Reasoning: context window management, avoid overwhelming a single session

### Neo4j unavailable

If `mcp__neo4j__read-cypher` fails on the first query:
1. Log warning: "Neo4j unavailable, falling back to keyword-based classification"
2. Use Step 2c (fallback) for ALL atoms; mark every atom `evidence: HEURISTIC`
3. Per-atom confirmation gate still runs as Template E (LOW confidence, HEURISTIC evidence — `--yes` does NOT bypass; no forced recommendation)
4. Route features to `/nacl-sa-feature` anyway (it has its own fallback handling)
5. Final report headline: `INTAKE TRIAGE APPLIED — UNVERIFIED (heuristic-backed)`
6. Graph unavailability does NOT block triage, but the result is always UNVERIFIED

### Ambiguous graph match

If `sa_find_uc_by_keywords` returns multiple UCs for an atom:
1. List all matching UCs in the classification evidence
2. Pick the closest match based on name similarity
3. If still ambiguous, present all matches and ask the user which UC is relevant

---

## Interaction with Other Skills

```
/nacl-tl-intake (this skill)
  |-- Bugs     -> /nacl-tl-fix "description"
  |-- Tasks    -> /nacl-tl-dev TECH-NNN
  +-- Features -> /nacl-sa-feature "description"
                    |-- Queries/updates Neo4j graph
                    +-- Creates .tl/feature-requests/FR-NNN.md
                         |
                    /nacl-tl-conductor --items FR-001,FR-002,BUG-003
                      (creates feature branch, runs dev per item,
                       commits per UC, delivers to staging)
```

**Recommended flow:** After intake completes specification, hand off to `/nacl-tl-conductor` for the full lifecycle. Conductor handles planning, development, git management, and delivery as a single batch.

---

## Reads / Writes

### Reads (Neo4j -- via mcp__neo4j__read-cypher)

```yaml
# Classification queries:
- sa_find_uc_by_keywords (graph-infra/queries/sa-queries.cypher)
  Params: $keywords -- search text from atom description
  Returns: uc.id, uc.name, uc.detail_status
```

### Reads (Filesystem)

```yaml
- config.yaml (project root) -- YouGile configuration
- .mcp.json -- MCP server env (YouGile API key)
```

### Writes (YouGile -- if configured)

```yaml
- Child tasks in Backlog column (one per feature/bug/task)
- Subtask links to parent card
- Decomposition summary in parent task chat
```

### Writes (Filesystem)

```yaml
# No direct file writes -- downstream skills handle file creation:
# - /nacl-sa-feature creates .tl/feature-requests/FR-NNN.md and graph nodes
# - /nacl-tl-fix creates fixes and updates docs
# - /nacl-tl-dev creates TECH task implementations
```

---

## Contract

This skill routes atoms to the following downstream skills. Each expects a specific input shape.

### `/nacl-sa-feature`

Receives: a feature description string (the grouped atom titles + context sentence).

```
/nacl-sa-feature "<Feature title>: <atom titles joined by comma>. Context: <one sentence>."
```

Example:
```
/nacl-sa-feature "Generation Controls: image format selection, show scene prompt, edit prompt and regenerate, tabs. Context: all on the same result page, sharing a regeneration-attempt data model."
```

### `/nacl-tl-fix`

Receives: a bug description string matching the atom title + the matched UC ID.

```
/nacl-tl-fix "<atom title>" [--uc UC-NNN]
```

Example:
```
/nacl-tl-fix "Share button broken on mobile" --uc UC-012
```

### `/nacl-tl-dev`

Receives: a task description string (for infrastructure, docs, or process tasks).

```
/nacl-tl-dev "<task description>"
```

Example:
```
/nacl-tl-dev "Update deploy docs for new server configuration"
```

**Drift note:** if any of the above skills change their invocation signature, this skill must be updated to match. Run `/nacl-tl-intake` against a test batch after any downstream skill update to verify routing still works.

---

## References

- INVEST criteria for story validation
- SPIDR framework for story splitting
- `nacl-tl-core/references/fix-classification-rules.md` -- L0/L1/L2/L3 for bugs
- `nacl-sa-feature/SKILL.md` -- graph-based feature specification workflow
- `nacl-tl-fix/SKILL.md` -- bug fix workflow
- `nacl-core/SKILL.md` -- Neo4j connection, schema, query library
- `graph-infra/queries/sa-queries.cypher` -- sa_find_uc_by_keywords query

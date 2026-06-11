# Schema-vs-Renderer Coverage Audit

**Date:** 2026-06-11
**Graphs probed:** `fc-neo4j` (family-cinema demo, Screen\* family), `a Runtime*-family sample graph` (Runtime\* family + RuntimeContract/ExternalContract)
**Renderers baseline:** `server/src/render/excalidraw/{domain-model,context-map,activity,ba-process}.ts`
**Audit scope:** READ-ONLY — no graph mutations, no renderer code changes.

---

## 1. Node Label Coverage

All labels observed in at least one live graph. Counts are exact from `MATCH (n) RETURN labels(n)[0], count(*)`.

| Label | count(fc) | count(B) | Drawn? | Renderer |
|---|---|---|---|---|
| **DomainEntity** | 28 | 21 | yes | `domain-model.ts` — entity card with attributes |
| **DomainAttribute** | 250 | 171 | yes | `domain-model.ts` — attribute rows inside entity card |
| **Enumeration** | 25 | 7 | yes | `domain-model.ts` — enum card with values |
| **EnumValue** | 111 | 23 | yes | `domain-model.ts` — value rows inside enum card |
| **Module** | 11 | 5 | yes | `context-map.ts` — module box with entity/UC counts |
| **UseCase** | 44 | 11 | partial | `context-map.ts` counts UCs per module; not drawn as individual node |
| **ActivityStep** | 478 | 122 | yes | `activity.ts` — step rect in swimlane |
| **BusinessProcess** | 10 | 0 | yes | `ba-process.ts` — process title + swimlane layout |
| **WorkflowStep** | 74 | 0 | yes | `ba-process.ts` — step rect in horizontal swimlane |
| **BusinessRole** | 3 | 0 | yes | `ba-process.ts` — swimlane label (role name) |
| **BusinessEntity** | 10 | 0 | partial | `ba-process.ts` — drawn as document annotation (READS/PRODUCES/MODIFIES) |
| **EntityState** | 9 | 0 | no | — |
| **SystemRole** | 5 | 3 | no | — (only counted in `context-map.ts` MODULE_QUERY indirectly) |
| **SystemContext** | 1 | 0 | no | — |
| **GlossaryTerm** | 40 | 0 | no | — |
| **BusinessRule** | 17 | 0 | no | — |
| **ProcessGroup** | 4 | 0 | no | — |
| **IntakeItem** | 14 | 0 | no | — |
| **FeatureRequest** | 34 | 1 | no | — |
| **Wave** | 30 | 7 | no | — |
| **Task** | 100 | 16 | no | — |
| **ValidationReport** | 0 | 1 | no | — |
| **FinalizationReport** | 0 | 1 | no | — |
| **Requirement** | 476 | 118 | no | — (markdown-only; see §5) |
| **Screen** | 35 | 0 | **no** | — (UC-022 candidate) |
| **ScreenState** | 326 | 0 | **no** | — (UC-023 candidate) |
| **ScreenEvent** | 408 | 0 | **no** | — (UC-023 candidate) |
| **Transition** | 525 | 0 | **no** | — (UC-023 candidate) |
| **ScreenEffect** | 263 | 0 | **no** | — (UC-023 candidate) |
| **AnalyticsEvent** | 10 | 0 | **no** | — (UC-023 candidate, lower priority) |
| **Form** | 36 | 18 | **no** | — (UC-022 candidate) |
| **FormField** | 233 | 91 | **no** | — (UC-022 candidate) |
| **Component** | 57 | 0 | **no** | — |
| **RuntimeContract** | 8 | 4 | **no** | — (UC-023 candidate) |
| **RuntimeState** | 0 | 18 | **no** | — (UC-023 candidate) |
| **RuntimeTransition** | 0 | 21 | **no** | — (UC-023 candidate) |
| **RuntimeEvent** | 0 | 7 | **no** | — (UC-023 candidate) |
| **RuntimeLock** | 0 | 3 | **no** | — (UC-023 annotation candidate) |
| **RecoveryProcedure** | 0 | 6 | **no** | — (UC-023 annotation candidate) |
| **IdempotencyKey** | 0 | 4 | **no** | — (UC-023 annotation candidate) |
| **APIEndpoint** | 77 | 4 | **no** | — (UC-023 candidate) |
| **ExternalContract** | 1 | 2 | **no** | — (UC-023 candidate) |
| **Slice** | 274 | 0 | **no** | — (defer/annotation; see §4) |
| **DomainError** | 96 | 0 | **no** | — (defer/annotation; see §4) |
| **ErrorPresentation** | 102 | 0 | **no** | — (defer/annotation; see §4) |
| **Decision** | 43 | 58 | **no** | — (defer/annotation; see §4) |
| **CachePolicy** | 10 | 0 | **no** | — (defer; see §4) |
| **DegradationRule** | 21 | 0 | **no** | — (defer; see §4) |

**Drawn = yes:** DomainEntity, DomainAttribute, Enumeration, EnumValue, Module, ActivityStep, BusinessProcess, WorkflowStep, BusinessRole.
**Drawn = partial:** UseCase (counted in context-map, not rendered as node), BusinessEntity (as document annotation in ba-process).
**Drawn = no:** all remaining 35 labels.

---

## 2. Key Relationship Coverage

| Relationship | fc count | Sample-B count | Renderer that traverses it | Notes |
|---|---|---|---|---|
| **HAS_ATTRIBUTE** (DomainEntity→DomainAttribute) | 308 | 171 | `domain-model.ts` | Drawn as attribute rows |
| **RELATES_TO** (DomainEntity↔DomainEntity) | 10 | 26 | `domain-model.ts` | Arrow with rel_type/cardinality label |
| **HAS_ENUM** (DomainEntity→Enumeration) | 24 | 9 | `domain-model.ts` | Arrow entity→enum card |
| **HAS_VALUE** (Enumeration→EnumValue) | 111 | 23 | `domain-model.ts` | Enum value rows |
| **CONTAINS_ENTITY** (Module→DomainEntity) | 29 | 21 | `context-map.ts` | Counted per module (entity_count) |
| **CONTAINS_UC** (Module→UseCase) | 47 | 11 | `context-map.ts` | Counted per module (uc_count) |
| **DEPENDS_ON** (Module→Module) | 152 | 44 | `context-map.ts` | Explicit dependency arrow |
| **RELATES_TO** (cross-module DomainEntity) | — | — | `context-map.ts` | Inferred cross-dep arrow |
| **HAS_STEP** (UseCase→ActivityStep) | 552 | 122 | `activity.ts` | Each step = swimlane box |
| **HAS_STEP** (BusinessProcess→WorkflowStep) | — | — | `ba-process.ts` | Each step = horizontal lane box |
| **PERFORMED_BY** (WorkflowStep→BusinessRole) | 15 | 0 | `ba-process.ts` | Role swimlane assignment |
| **READS/PRODUCES/MODIFIES** (WorkflowStep→BusinessEntity) | 1 | 4 | `ba-process.ts` | Document annotation cards |
| **NEXT_STEP** (WorkflowStep→WorkflowStep) | 19 | 0 | `ba-process.ts` (implied sequential arrow) | Renderer uses position order, not explicit edge |
| — | — | — | — | — |
| **HAS_TRANSITION** (Screen→Transition) | 525 | 0 | **none** | UC-023 state-machine board |
| **HAS_STATE** (Screen→ScreenState) | 326 | 0 | **none** | UC-023 state-machine board |
| **HAS_EVENT** (Screen→ScreenEvent) | 408 | 0 | **none** | UC-023 state-machine board |
| **FROM_STATE/TO_STATE** (Transition→ScreenState) | 525/525 | 0 | **none** | UC-023 state-machine board |
| **ON_EVENT** (Transition→ScreenEvent) | 525 | 0 | **none** | UC-023 state-machine board |
| **TRIGGERS** (Transition→ScreenEffect) | 266 | 0 | **none** | UC-023 state-machine board |
| **HAS_TRANSITION** (RuntimeContract→RuntimeTransition) | 0 | 21 | **none** | UC-023 state-machine board |
| **HAS_STATE** (RuntimeContract→RuntimeState) | 0 | 18+4 | **none** | UC-023 state-machine board |
| **FROM_STATE/TO_STATE** (RuntimeTransition→RuntimeState) | 0 | 19/21 | **none** | UC-023 state-machine board |
| **ACQUIRES_LOCK** (RuntimeTransition→RuntimeLock) | 0 | 11 | **none** | UC-023 annotation |
| **EMITS_EVENT** (RuntimeTransition→RuntimeEvent) | 0 | 10 | **none** | UC-023 annotation |
| **HAS_RECOVERY** (RuntimeContract→RecoveryProcedure) | 0 | 6 | **none** | UC-023 annotation |
| **USES_IDEMPOTENCY_KEY** (RuntimeContract→IdempotencyKey) | 0 | 4 | **none** | UC-023 annotation |
| **EXPOSES** (UseCase→APIEndpoint) | 97 | 4 | **none** | UC-023 code-contract board |
| **MAY_RAISE** (APIEndpoint→DomainError) | 161 | 0 | **none** | UC-023 code-contract board |
| **HAS_RUNTIME_CONTRACT** (UseCase→RuntimeContract, fc) | 8 | 0 | **none** | UC-023 code-contract board |
| **CONTAINS_RUNTIME_CONTRACT** (UseCase→RuntimeContract, Sample B) | 0 | 4 | **none** | UC-023 code-contract board |
| **REQUIRES_EXTERNAL** (UseCase→ExternalContract) | 1 | 3 | **none** | UC-023 code-contract board |
| **DEPENDS_ON_EXTERNAL** (Module→ExternalContract) | 0 | 2 | **none** | UC-023 code-contract board |
| **HAS_SLICE** (UseCase→Slice) | 274 | 0 | **none** | defer (see §4) |
| **CALLS** (Slice/ScreenEffect→APIEndpoint) | 403 | 0 | **none** | partial via code-contract |
| **HAS_DEGRADATION** (APIEndpoint→DegradationRule) | 21 | 0 | **none** | defer (see §4) |
| **DEGRADES_TO** (DegradationRule→ScreenState) | 21 | 0 | **none** | defer (see §4) |
| **HAS_CACHE** (APIEndpoint→CachePolicy) | 10 | 0 | **none** | defer (see §4) |
| **PRESENTED_AS** (DomainError→ErrorPresentation) | 104 | 0 | **none** | defer (see §4) |
| **HAS_ERROR** (UseCase→DomainError) | 96 | 0 | **none** | defer (see §4) |
| **REALIZED_AS** (BusinessEntity→DomainEntity) | 10 | 0 | **none** | not on Excalidraw today |
| **SPECIFIED_AS** (IntakeItem→Requirement/UseCase) | 11 | 0 | **none** | markdown only |

---

## 3. Prioritized Missing Diagrams

Items ordered by business value (density of live data × analyst impact).

### P1 — Build Now (UC-023)

**P1-A: `state-machine` board**
- Covers: Screen→ScreenState, Screen→Transition, Transition→ScreenState (FROM/TO), Transition→ScreenEvent (ON_EVENT), Transition→ScreenEffect (TRIGGERS); and RuntimeContract→RuntimeState, RuntimeContract→RuntimeTransition, RuntimeTransition→RuntimeState (FROM/TO).
- Live data volume: fc has 525 Transitions, 326 ScreenStates, 408 ScreenEvents, 263 ScreenEffects; Sample B has 18 RuntimeStates, 21 RuntimeTransitions, 7 RuntimeEvents.
- Unified board: a single renderer parameterized by `type` (`screen` | `runtime`) that renders the same state-machine topology for both families. Root node (Screen or RuntimeContract) is the entry-point parameter.
- Recommended new file: `server/src/render/excalidraw/state-machine.ts`
- Effort: ~M (medium) — topology is identical for both families; only labels and colors differ.
- Annotations to add on same board: RuntimeLock (badge on transition arc), RecoveryProcedure / IdempotencyKey (icon cards pinned to RuntimeContract header). These 3+4+6 nodes are small enough to embed without a separate board.

**P1-B: `code-contract` board**
- Covers: UseCase→APIEndpoint (EXPOSES, 97+4 edges), APIEndpoint→DomainError (MAY_RAISE, 161 edges in fc), UseCase→RuntimeContract (8+4 edges), UseCase→ExternalContract (REQUIRES_EXTERNAL, 1+3 edges), Module→ExternalContract (DEPENDS_ON_EXTERNAL, 2 edges in Sample B).
- Live data: 77+4 APIEndpoints, 8+4 RuntimeContracts, 1+2 ExternalContracts.
- Recommended new file: `server/src/render/excalidraw/code-contract.ts`
- Effort: ~M — three node types as cards (APIEndpoint, RuntimeContract, ExternalContract) linked to a UseCase hub; DomainError as inline annotations on APIEndpoint cards.

### P2 — Near-term (UC-022 scope, not UC-023)

**P2-A: `screen-form` board (UC-022)**
- Covers: Screen, Form, FormField, Component.
- 35 Screens, 36+18 Forms, 233+91 FormFields in live data.
- Recommended new file: `server/src/render/excalidraw/screen-form.ts`
- These are UC-022 (interface cards), not UC-023.

### P3 — Defer / Annotation

See §4 for full reasoning.

**P3-A: Slice** — 274 nodes, UseCase→Slice only (no outbound edges beyond `CALLS`). Recommend: annotate as a count badge on ActivityStep cards in the activity renderer. No standalone board.

**P3-B: DomainError + ErrorPresentation** — 96+102 nodes, APIEndpoint→DomainError→ErrorPresentation chain. Recommend: inline annotation on the `code-contract` board's APIEndpoint card (MAY_RAISE list). No standalone board.

**P3-C: Decision** — 43+58 nodes, mostly `JUSTIFIES`→UseCase/Module/Requirement. Recommend: defer; no visual topology — decisions are documentary, not structural. Annotation in a future `decisions` text-panel board if needed.

**P3-D: CachePolicy** — 10 nodes, `CACHES`→APIEndpoint. Recommend: annotation badge on APIEndpoint card in the `code-contract` board. No standalone board.

**P3-E: DegradationRule** — 21 nodes, `DEGRADES_TO`→ScreenState. Recommend: annotate on the `state-machine` board's ScreenState node (badge/tooltip). No standalone board.

---

## 4. UC-023 Scope Recommendation

### Build now — two new renderer files

**1. `state-machine.ts`** (new board type `state-machine`)
- Unified renderer for both `Screen` and `RuntimeContract` state machines.
- Parameter: `{ rootId, type: 'screen' | 'runtime' }`.
- Query paths:
  - `screen`: `(s:Screen {id:$rootId})-[:HAS_STATE]->(:ScreenState)`, `(s)-[:HAS_TRANSITION]->(:Transition)-[:FROM_STATE|TO_STATE]->(:ScreenState)`, `(t:Transition)-[:ON_EVENT]->(:ScreenEvent)`, `(t)-[:TRIGGERS]->(:ScreenEffect)`.
  - `runtime`: `(rc:RuntimeContract {id:$rootId})-[:HAS_STATE|HAS_INITIAL_STATE|HAS_TERMINAL_STATE]->(:RuntimeState)`, `(rc)-[:HAS_TRANSITION]->(:RuntimeTransition)-[:FROM_STATE|TO_STATE]->(:RuntimeState)`, `(rt)-[:ACQUIRES_LOCK]->(:RuntimeLock)`, `(rt)-[:EMITS_EVENT]->(:RuntimeEvent)`, `(rc)-[:HAS_RECOVERY]->(:RecoveryProcedure)`, `(rc)-[:USES_IDEMPOTENCY_KEY]->(:IdempotencyKey)`.
- RuntimeLock, RecoveryProcedure, IdempotencyKey drawn as small annotation cards attached to the RuntimeContract header — no separate board needed.
- AnalyticsEvent (10 nodes in fc; emitted by ScreenEffect via `EMITS`) can be a badge on ScreenEffect cards in the `screen` variant. Low priority, add if effort permits.

**2. `code-contract.ts`** (new board type `code-contract`)
- Renderer for `UseCase`-rooted contract view.
- Parameter: `{ ucId }`.
- Query path: `(uc:UseCase {id:$ucId})-[:EXPOSES]->(:APIEndpoint)-[:MAY_RAISE]->(:DomainError)`, `(uc)-[:HAS_RUNTIME_CONTRACT|CONTAINS_RUNTIME_CONTRACT]->(:RuntimeContract)`, `(uc)-[:REQUIRES_EXTERNAL]->(:ExternalContract)`.
- CachePolicy drawn as an annotation badge on APIEndpoint cards (10 nodes, `CACHES`→APIEndpoint).
- DomainError drawn as a collapsed list inside the APIEndpoint card (not separate cards, to keep board density manageable).

### Defer (not in UC-023)

| Label | Recommendation | Rationale |
|---|---|---|
| **Slice** | Annotation (count badge on ActivityStep) | No meaningful visual topology; purely a coverage count |
| **DomainError** | Inline in `code-contract` board | Too granular for standalone board; 96 nodes would be noisy |
| **ErrorPresentation** | Annotation on DomainError list | One-to-one with DomainError; no new topology |
| **Decision** | Defer entirely | No graph-topology value; documentary by nature |
| **CachePolicy** | Badge on APIEndpoint in `code-contract` | 10 nodes; no topology beyond CACHES→APIEndpoint |
| **DegradationRule** | Badge on ScreenState in `state-machine` | 21 nodes; only DEGRADES_TO→ScreenState |

---

## 5. Requirement Node — Markdown-Only Confirmation

`Requirement` is present in both graphs (476 in fc, 118 in Sample B) and is the largest label family in fc after Transition/ActivityStep/ScreenEvent/ScreenState.

None of the four current renderers query `(:Requirement)` or traverse `HAS_REQUIREMENT` / `JUSTIFIES` edges. The only Cypher that touches Requirements is in validation/intake skill queries outside the analyst-tool.

Confirmed: `Requirement` is drawn in markdown reports only (nacl-sa-* skills output), not on any Excalidraw board. This is by design and is covered by UC-021 (requirements traceability markdown) and UC-022 (screen-form with FormField→Requirement mapping). No Excalidraw Requirement board is proposed in UC-023.

---

## Appendix — Raw Probe Commands

```cypher
-- Node label counts (both graphs)
MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC

-- Relationship type counts (both graphs)
MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS n ORDER BY n DESC

-- Screen family edges (fc-neo4j)
MATCH (s:Screen)-[r]->(t) RETURN type(r), labels(t)[0], count(*) ORDER BY count(*) DESC
MATCH (t:Transition)-[r]->(n) RETURN type(r), labels(n)[0], count(*) ORDER BY count(*) DESC

-- RuntimeContract family (a Runtime*-family sample graph)
MATCH (rc:RuntimeContract)-[r]->(t) RETURN type(r), labels(t)[0], count(*) ORDER BY count(*) DESC
MATCH (rt:RuntimeTransition)-[r]->(t) RETURN type(r), labels(t)[0], count(*) ORDER BY count(*) DESC
```

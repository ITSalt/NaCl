# Master Plan — NaCl Analyst Tool (FR-001 slice)

**Generated:** 2026-05-07
**Source:** Neo4j graph (nacl-tl-plan)
**Feature Request:** FR-001 — UC/BP Name in Sidebar and Diagram Title
**Scope:** Incremental — UC-003 + UC-008 only. Other 17 UCs are out of scope for this plan.

## Module Structure (UCs in scope)

| Module          | UCs in this FR | Description                                      |
|-----------------|----------------|--------------------------------------------------|
| M-SKILL-RUNNER  | UC-003         | Skill execution + deterministic renderer.        |
| M-BACKEND-API   | UC-008         | Fastify HTTP API (boards listing).               |
| M-WEB-UI        | UC-008 (FE)    | React sidebar; consumes new `label` field.       |

## Task List

### UC Tasks

| Task ID    | UC      | Title                                              | Type  | Wave | Priority | Depends On | Blocks      |
|------------|---------|----------------------------------------------------|-------|------|----------|------------|-------------|
| UC-003-BE  | UC-003  | Activity renderer — add diagram title element      | uc-be | 1    | high     | —          | UC-003-FE   |
| UC-008-BE  | UC-008  | `/boards` — include UC/BP `label` in list response | uc-be | 1    | high     | —          | UC-008-FE   |
| UC-003-FE  | UC-003  | Activity board UI (no-op for FR-001)               | uc-fe | 2    | low      | UC-003-BE  | —           |
| UC-008-FE  | UC-008  | Sidebar — render `label` as subtitle               | uc-fe | 2    | high     | UC-008-BE  | —           |

### TECH Tasks

**None.** Per FR-001: "all changes are incremental to existing files."

## Execution Waves

### Wave 1 — Backend (parallel)

| Task       | Title                                              | Agent          | Notes                                  |
|------------|----------------------------------------------------|----------------|----------------------------------------|
| UC-003-BE  | Activity renderer — add diagram title element      | nacl-tl-dev-be | Renderer-internal; no API change.      |
| UC-008-BE  | `/boards` — include UC/BP `label` in list response | nacl-tl-dev-be | Type-additive; no route rename.        |

These two tasks have no shared files and can run in parallel.

### Wave 2 — Frontend

| Task       | Title                                | Agent          | Depends On |
|------------|--------------------------------------|----------------|------------|
| UC-003-FE  | Activity board UI (no-op for FR-001) | nacl-tl-dev-fe | UC-003-BE  |
| UC-008-FE  | Sidebar — render `label` as subtitle | nacl-tl-dev-fe | UC-008-BE  |

UC-003-FE is a `no-op` placeholder — visual verification only, no commit.

### Wave 3 — Verification (no separate tasks)

After Wave 2, run `/nacl-tl-verify` for UC-003 and UC-008. No QA wave is
explicitly created because FR-001 changes are small and the per-task tests
(vitest + Playwright) cover the surface.

## Critical Path

```
UC-008-BE  →  UC-008-FE
UC-003-BE  →  UC-003-FE (no-op)
```

Two short chains; can be developed in parallel. The longest path is two tasks.

## Open Questions

1. **Route path:** FR text uses `/api/v1/boards`, current code uses `/boards`.
   `api-contract.md` for UC-008 instructs **not** to rename in this FR (treat as
   docs drift). Confirm or override before UC-008-BE starts.
2. **Empty `uc_name` fallback:** `impl-brief.md` for UC-003-BE proposes emitting
   `(UC-003)` instead of skipping the title. Pick one and document in commit.
3. **Type duplication:** the FE has its own `BoardListItem` mirror. UC-008-FE
   updates it; future deduplication is out of scope.

## Next Task

Start with Wave 1: `UC-003-BE` or `UC-008-BE` (either; they're parallel).

Run: `/nacl-tl-dev-be UC-003-BE` or `/nacl-tl-dev-be UC-008-BE`.

Run: `/nacl-tl-status` to see progress.

---

# Master Plan — NaCl Analyst Tool (FR-002 slice)

**Generated:** 2026-05-26
**Source:** Neo4j graph (nacl-tl-plan, bolt 3608 — tool spec graph)
**Feature Request:** FR-002 — Live-update on External Board Edits
**Scope:** Incremental — UC-020 (NEW) + UC-002 contract delta (folded into UC-020-BE). FR-001 is complete.

## Module Structure (UCs in scope)

| Module          | UCs in this FR        | Description                                              |
|-----------------|-----------------------|----------------------------------------------------------|
| M-BACKEND-API   | UC-020 (owner)        | fs-watcher broadcast, PUT/writeBoard origin contract, ws board.changed payload. |
| M-WEB-UI        | UC-020 (FE), UC-002   | Consent banner, sidebar changed-indicator, per-client originId; UC-002 PUT contract gains originId. |

## Task List

### UC Tasks

| Task ID    | UC      | Title                                                        | Type  | Wave | Priority | Depends On | Blocks      |
|------------|---------|--------------------------------------------------------------|-------|------|----------|------------|-------------|
| UC-020-BE  | UC-020  | Live-update — server WS/PUT origin contract                  | uc-be | 3    | high     | —          | UC-020-FE   |
| UC-020-FE  | UC-020  | Live-update — consent banner + sidebar indicator + originId  | uc-fe | 4    | high     | UC-020-BE  | —           |

### TECH Tasks

**None.** Per FR-002: all changes are incremental to existing files (additive WS/PUT contract).

## Execution Waves

### Wave 3 — Backend (WS/PUT origin contract)

| Task       | Title                                       | Agent          | Notes                                                            |
|------------|---------------------------------------------|----------------|------------------------------------------------------------------|
| UC-020-BE  | Live-update — server WS/PUT origin contract | nacl-tl-dev-be | Removes global `markSelfWrite` suppression (root cause of #4); threads `originId`. Covers REQ-UC020-01/02/04 + REQ-UC002-03. **Regression-first**: #4 symptom must be RED before fix. |

### Wave 4 — Frontend (consent banner + sidebar)

| Task       | Title                                                       | Agent          | Depends On |
|------------|-------------------------------------------------------------|----------------|------------|
| UC-020-FE  | Live-update — consent banner + sidebar indicator + originId | nacl-tl-dev-fe | UC-020-BE  |

Covers REQ-UC020-03/05/06 + the client half of REQ-UC020-02. NEW component CMP-BOARD-CHANGED-BANNER; modifies CanvasHost, Sidebar, store, App, api/client, api/ws.

## Critical Path

```
UC-020-BE  →  UC-020-FE
```

One chain (BE contract must land before the FE consent banner is useful). Longest path: two tasks.

## Open Questions

1. **originId transport:** task `api-contract.md` chose a **PUT body field** (not an `X-Origin-Id` header) for `originId`. Confirm or override before UC-020-BE starts.
2. **UC-002 owner module:** UC-002 lives in M-WEB-UI but the contract delta (REQ-UC002-03) is implemented server-side as part of UC-020-BE. No standalone UC-002 task is generated.

## Next Task

Start with Wave 3: `UC-020-BE`.

Run: `/nacl-tl-dev-be UC-020-BE` (regression test first, per FR-002 anchor).

Run: `/nacl-tl-status` to see progress.

---

# Master Plan — NaCl Analyst Tool (FR-003 slice)

**Generated:** 2026-06-11
**Source:** Neo4j graph (nacl-tl-plan --feature FR-003, bolt 3608 — tool spec graph)
**Feature Request:** FR-003 — Diagram coverage (requirements, interface models, new-schema entities)
**Scope:** Incremental — UC-021, UC-022, UC-023 (NEW, M-RENDERERS). FR-001/FR-002 complete.

## Execution Waves

| Wave | Task | Title | Agent | Depends On |
|------|------|-------|-------|------------|
| 5 | TECH-AUDIT | Schema-vs-renderer coverage audit (read-only) | nacl-tl-dev | — |
| 5 | UC-021-BE | Render requirements on activity diagram | nacl-tl-dev-be | — |
| 5 | UC-022-BE | Interface-model board renderer | nacl-tl-dev-be | — |
| 6 | UC-022-FE | Interface-model board in web navigator | nacl-tl-dev-fe | UC-022-BE |
| 6 | UC-023-BE | State-machine + code-contract renderers | nacl-tl-dev-be | TECH-AUDIT |
| 7 | UC-023-FE | State-machine/contract boards in web navigator | nacl-tl-dev-fe | UC-023-BE |

External Contracts Gate (W6): PASS — no UC references an ExternalContract.

## Critical Path

```
TECH-AUDIT → UC-023-BE → UC-023-FE
```

## Verification note

UC-021/UC-022 need `REALIZED_BY` data to verify. Phase 4 runs on **family-cinema** after its graph is
upgraded via `NaCl/docs/runbooks/requirement-anchoring-upgrade.md` (Phase 0 of the porcupine plan).

## Next Task

Start with Wave 5 (parallel): `TECH-AUDIT`, `UC-021-BE`, `UC-022-BE`.

Run: `/nacl-tl-full --feature FR-003` to orchestrate the waves, or `/nacl-tl-dev-be UC-021-BE` for one task.

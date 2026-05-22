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

# NaCl Analyst Tool

**Status:** Active development — distributed with the NaCl framework

## Project Overview

**Project Name:** NaCl Analyst Tool

**Description:** Local web application that wraps Excalidraw and lets a business analyst browse `.excalidraw` board files, edit them in a full-featured canvas, and trigger NaCl skills (regenerate from Neo4j graph / sync back to graph). Replaces the legacy `excalidraw` and `excalidraw-room` Docker containers with a single integrated tool that understands the NaCl board lifecycle.

**Goal:** Provide BA/SA practitioners with a single, deterministic interface for inspecting, editing, and round-tripping board state with the underlying Neo4j graph — without depending on the public Excalidraw cloud.

**Tech Stack:**
- **Runtime:** Node.js 20+
- **Backend (`server/`):** Fastify (TypeScript), invokes the local `claude` CLI via subprocess (per `itsalt-pinch` Pacer)
- **Frontend (`web/`):** Vite + React + Excalidraw editor
- **Tests (`e2e/`):** Playwright end-to-end suite
- **Storage:** Neo4j (read/write graph), local filesystem (boards on disk)
- **Distribution:** npm workspaces; published as `nacl-analyst-tool` CLI binary
- **Project registry:** `~/.nacl/projects.json` — analyst picks the active project; tool resolves boards/graph from `config.yaml` of that project

**Modules:**
- `server` — Fastify API + WebSocket bridge; orchestrates renderers, skill invocations, project registry
- `web` — Excalidraw-based UI; project picker, board navigator, editor canvas
- `e2e` — Playwright suite covering board CRUD, skill triggers, project switching

**Architecture invariants:**
- The tool is invoked from the analyst's machine; it must not be containerised (it shells out to local `claude`).
- All graph mutations route through deterministic renderers — never hand-written Excalidraw JSON in production paths.
- Project registry (`~/.nacl/projects.json`) is the single source of truth for project root + active project.
- Graph infrastructure is per-project: each project has its own `graph-infra/` and Neo4j container.

**Primary Language:** English (CLAUDE.md, code, docs), Russian (user-facing console output is allowed)

---

## Development Workflow

This tool follows a **deterministic, test-first lifecycle**:

1. **Specification updates** (`/nacl-sa-*`)
   - Tool features that affect graph schema or skill contracts are specified before implementation.
   - Renderers are built from explicit Cypher → Excalidraw transforms — never approximated.

2. **TDD development** (`/nacl-tl-dev-be`, `/nacl-tl-dev-fe`)
   - Write failing test (server: Node's built-in test runner via `node --test`; web has no unit-test suite yet; e2e: Playwright).
   - Implement minimal code to pass.
   - Refactor with tests green.

3. **Bug fixes** (`/nacl-tl-fix`)
   - Classify by scope (L0/L1/L2/L3).
   - Update affected docs/specs BEFORE touching code.
   - Document root cause in commit.

4. **Verification** (`/nacl-tl-verify`)
   - Static code analysis (`/nacl-tl-verify-code`).
   - End-to-end testing (`/nacl-tl-qa`) for UI changes.
   - Manual browser check for UI features (start `npm run dev`, exercise the path).

5. **Ship** (`/nacl-tl-ship`)
   - Commit, push, open PR (or direct push per `config.yaml`).
   - **Never auto-switch to main.** `nacl-tl-ship` stays on the current branch.

6. **Release** (`/nacl-tl-release`)
   - Bundled with NaCl framework releases.
   - Bump `package.json` version, tag, changelog entry under `docs/releases/<ver>-<slug>/`.

---

## Bug Fix Protocol

**Rule: Spec First, Code Second**

All bug fixes that touch documented behaviour must update specs/docs BEFORE touching code.

### Classification

| Level | Scope | Owner | Before Code | Update Docs |
|-------|-------|-------|-------------|-------------|
| **L0** | Single line typo, lint fix | Dev | Review code | No |
| **L1** | Single endpoint or single component | Dev | `/nacl-tl-fix` updates affected component/endpoint doc | Yes: component/endpoint |
| **L2** | Cross-module (server ↔ web ↔ e2e) | Strategist | `/nacl-tl-fix` updates contract docs | Yes: API contract / shared types |
| **L3** | Architecture (renderers, project registry, distribution) | Strategist + maintainer | `/nacl-tl-fix` updates architecture/ADR | Yes: architecture |

**For all L1+:** Run `/nacl-tl-fix` first. It auto-detects scope, classifies, updates docs. Then implement and test. Commit references the fix level and root cause.

**Regression test ordering (TDD for bug fixes):** `/nacl-tl-fix` writes the regression test BEFORE the fix is applied — the test is authored by `/nacl-tl-regression-test` (a separate sub-agent, by design — the fix author cannot honestly grade its own fix), runs RED against the broken code, then GREEN after the fix. The skill never claims `FIX COMPLETE` if no test transitioned RED→GREEN; it reports `FIX APPLIED — UNVERIFIED` instead and points the user at the right follow-up.

---

## Skill Routing

**Invoke skill based on situation:**

| User Says | Skill | Why |
|-----------|-------|-----|
| "Initialize the project" | `/nacl-init` | Create CLAUDE.md, config.yaml, graph-infra, register in `~/.nacl/projects.json` |
| "There's a bug: ..." | `/nacl-tl-fix` | Spec-first: classify level, update docs, then fix code (writes regression test via `/nacl-tl-regression-test` before applying the fix) |
| "Write a regression test for this bug" | `/nacl-tl-regression-test` | Independent test author. Writes a test against broken code, must be RED. Touches only test files. Used by `/nacl-tl-fix` Step 6d, but also callable directly |
| "Add a feature to the tool: ..." | `/nacl-sa-feature` | Incremental SA: impact analysis, spec change, update plan |
| "Implement this BE task" | `/nacl-tl-dev-be` | TDD backend (Fastify) work for a planned task |
| "Implement this FE task" | `/nacl-tl-dev-fe` | TDD frontend (Vite/React) work for a planned task |
| "Implement this TECH task" | `/nacl-tl-dev` | Infrastructure / build / CI / migration work |
| "Verify this task" | `/nacl-tl-verify` | Code analysis + E2E + report |
| "Ship the change" | `/nacl-tl-ship` | Commit, push, open PR — stays on current branch |
| "Cut a release" | `/nacl-tl-release` | Bump version, tag, changelog under `docs/releases/` |
| "Hotfix to main" | `/nacl-tl-hotfix` | Stash, branch from main, fix, PR — explicit user invocation only |
| "Project health check" | `/nacl-tl-diagnose` | Analyze git, docs, code drift |
| "What's next?" | `/nacl-tl-next` | Recommend the next task |
| "Show status" | `/nacl-tl-status` | Report progress |

**For existing features:**
- Bug fix → `/nacl-tl-fix`
- Add feature → `/nacl-sa-feature`
- Refactor → `/nacl-tl-dev` (TECH task)

**Never:**
- Auto-switch branches in `/nacl-tl-ship`. Hotfix is a separate, user-initiated skill.
- Run a programmatic `claude -p` call without the `itsalt-pinch` Pacer wrapper.
- Commit code that bypasses deterministic renderers (no hand-written Excalidraw JSON in production paths).
- Leak client project names, local paths, or operational anecdotes into this public repo. Run a canary grep before every release.

---

## Documentation Rules

### Rule 1: Releases Bundle Docs + Telegram Draft

Every release ships:
- Updated `docs/` for any feature/bug-fix that affected behaviour
- Telegram post draft + release notes under `docs/releases/<ver>-<slug>/`
- Unshipped scope must NOT leak into the release notes

### Rule 2: Release Drafts Directory

`docs/releases/_drafts/` accumulates fragments between releases. The next release-notes step absorbs them and clears the directory. Convention: empty between releases.

### Rule 3: Renderers Are Source of Truth for Boards

Excalidraw board content is generated by the deterministic renderer pipeline. Manual edits to `.excalidraw` files go out of sync immediately and must not be checked into the framework's reference artifacts. User-edited boards (in their own projects) are theirs to own.

### Rule 4: Commit Messages

Conventional Commits:
```
feat(analyst-tool): brief summary

- What changed
- Why (root cause / design reason)
- Fixes: L<level> + which docs were updated

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Rule 5: Public Repo Hygiene

This project ships in the public NaCl repo. Before every release run a canary grep for:
- Client project names (e.g., real customer names)
- Local absolute paths (`/Users/...`)
- Dump metadata, internal anecdotes, dump files

If anything is found, scrub before tagging.

### Rule 6: Tests Are Article-Publishable

Benchmarks and tests for non-trivial changes must be reproducible, recordable, and publishable: dual-terminal, N iterations, stated hypotheses — not subjective checks.

---

## Project Structure

- `bin/` — CLI entry points (`nacl-analyst-tool`)
- `server/` — Fastify backend workspace
- `web/` — Vite + React frontend workspace
- `e2e/` — Playwright end-to-end tests
- `bench/` — Performance benchmarks
- `scripts/` — Maintenance scripts (e.g., `migrate-meta.ts`)
- `graph-infra/` — Per-project Neo4j stack (created by `/nacl-init`)
- `config.yaml` — Project configuration
- `.mcp.json` — MCP server configuration (Neo4j)

---

## References

- Neo4j Bolt: `bolt://localhost:3608` (login: `neo4j` / `neo4j_graph_dev`)
- Neo4j Browser: http://localhost:3595
- Dev backend: http://127.0.0.1:3583
- Dev frontend: http://127.0.0.1:3582
- Project registry: `~/.nacl/projects.json`
- Distribution: bundled with the NaCl framework, installable via `npm link` or `npm install -g .`

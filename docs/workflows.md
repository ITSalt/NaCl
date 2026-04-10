[Home](../README.md) > Workflows

🇷🇺 [Русская версия](workflows.ru.md)

# Workflows

8 end-to-end scenarios. Each shows the exact sequence of slash commands you run in Claude Code and what happens at every step.

---

## 1. New Project from Scratch

**When to use:** You are starting a greenfield project and want to go from an empty repo to a working application with full traceability.

```
/project-init "Project Name"
```
Generates `CLAUDE.md` with development rules, skill routing, and documentation discipline for the new project.

```bash
docker compose -f graph-infra/docker-compose.yml up -d
```
Starts Neo4j and supporting infrastructure (skip if already running).

```
/graph_ba_full
```
Interactive business analysis session. Walks you through context, processes, entities, roles, rules, glossary, and validation -- all stored as nodes and edges in Neo4j.

```
/graph_sa_full
```
10-phase system specification: architecture, domain model, use cases, UI design, roles, and finalization. Reads BA data from the graph, writes SA artifacts back.

```
/graph_tl_conductor
```
End-to-end orchestration: creates execution waves and tasks from the graph, develops each UC (backend + frontend TDD), reviews code, runs QA, ships to staging.

---

## 2. Add a Feature to Existing Project

**When to use:** The project already has a specification in Neo4j and you need to add new functionality.

```
/graph_sa_feature "feature description"
```
Runs impact analysis via Cypher traversal (affected modules, domain entities, UCs, screens), then invokes only the SA skills that need updating. Creates a FeatureRequest artifact for handoff.

```
/graph_tl_conductor --items FR-001
```
Picks up the feature request, creates tasks, develops, tests, and ships -- all in one pass.

---

## 3. Fix a Bug

**When to use:** Something is broken in the application and you need a spec-first fix.

```
/tl-fix "what's broken"
```
Auto-detects the affected UC or TECH task from the problem description. Classifies the fix level (L0: typo, L1: single file, L2: multi-file, L3: cross-module). Updates documentation BEFORE touching code, then applies the fix and verifies.

---

## 4. Batch Intake (Multiple Requests)

**When to use:** You have a mix of feature requests, bug reports, and tasks to process at once.

```
/graph_tl_intake
```
Triages each request using Neo4j context to disambiguate scope. Routes features to `/graph_sa_feature`, bugs to `/tl-fix`, and standalone tasks to `/tl-dev`.

```
/graph_tl_conductor --items FR-001,FR-002,BUG-003
```
Orchestrates all routed items through planning, development, QA, and shipping as a single coordinated batch.

---

## 5. Import Client Document

**When to use:** A client sent a requirements document (DOCX, PDF, XLSX, or plain text) and you want to turn it into a working specification.

```
/graph_ba_from_board import /path/to/document.docx
```
Parses the document, extracts business-process elements, places them on an Excalidraw board with swimlanes and confidence coloring, then syncs everything to the Neo4j graph.

```
/graph_sa_full
```
Builds the full system specification from the imported BA data now living in the graph.

```
/graph_tl_conductor
```
Plans and executes development from the specification.

---

## 6. Deliver to Staging

**When to use:** Development is complete and you want to push, verify CI, and confirm the staging environment is healthy.

```
/tl-deliver
```
Chains three steps into one pipeline: pushes the feature branch and creates a PR (`tl-ship`), monitors CI/CD and waits for a green build (`tl-deploy`), then runs E2E verification and health checks against staging (`tl-verify`).

---

## 7. Release to Production

**When to use:** Staging is verified and you are ready to cut a release.

```
/tl-release
```
Bumps the version number, creates a git tag, aggregates the changelog from commit history, generates release notes, and notifies YouGile.

---

## 8. Recovery from Broken State

**When to use:** Documentation has drifted from code, tests are failing for unclear reasons, or the project feels out of sync.

```
/tl-diagnose
```
Analyzes git history, documentation drift, code health, and regression patterns. Produces a diagnostic report with specific findings.

```
/tl-reconcile
```
Uses the diagnostic report to bring all documentation back in sync with the current code state. Invokes SA skills as needed, then validates the result.

---

## Bonus: Check Status

**When to use:** You want a quick overview of where the project stands or what to work on next.

```
/graph_tl_status
```
Reads Task and Wave nodes from Neo4j, shows per-phase progress (BE, FE, sync, QA) for each UC, TECH task status, and SA coverage metrics.

```
/graph_tl_next
```
Recommends the next task to pick up based on wave ordering, dependencies, and critical path analysis. Enriches suggestions with UC entity and form names from the graph.

---

## Next Steps

- [Quick Start](quickstart.md) -- get running in 10 minutes
- [Setup Guide](setup/) -- detailed infrastructure setup

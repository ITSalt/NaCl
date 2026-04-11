[Home](../README.md) > Workflows

🇷🇺 [Русская версия](workflows.ru.md)

# Workflows

9 end-to-end scenarios. Each shows the exact sequence of slash commands you run in Claude Code and what happens at every step.

---

## 1. New Project from Scratch

**When to use:** You are starting a greenfield project and want to go from an empty repo to a working application with full traceability.

```
/nacl-init "Project Name"
```
Generates `CLAUDE.md` with development rules, skill routing, and documentation discipline for the new project.

```bash
docker compose -f graph-infra/docker-compose.yml up -d
```
Starts Neo4j and supporting infrastructure (skip if already running).

```
/nacl-ba-full
```
Interactive business analysis session. Walks you through context, processes, entities, roles, rules, glossary, and validation -- all stored as nodes and edges in Neo4j.

```
/nacl-sa-full
```
10-phase system specification: architecture, domain model, use cases, UI design, roles, and finalization. Reads BA data from the graph, writes SA artifacts back.

```
/nacl-tl-conductor
```
End-to-end orchestration: creates execution waves and tasks from the graph, develops each UC (backend + frontend TDD), reviews code, runs QA, ships to staging.

---

## 2. Add a Feature to Existing Project

**When to use:** The project already has a specification in Neo4j and you need to add new functionality.

```
/nacl-sa-feature "feature description"
```
Runs impact analysis via Cypher traversal (affected modules, domain entities, UCs, screens), then invokes only the SA skills that need updating. Creates a FeatureRequest artifact for handoff.

```
/nacl-tl-conductor --items FR-001
```
Picks up the feature request, creates tasks, develops, tests, and ships -- all in one pass.

---

## 3. Fix a Bug

**When to use:** Something is broken in the application and you need a spec-first fix.

```
/nacl-tl-fix "what's broken"
```
Auto-detects the affected UC or TECH task from the problem description. Classifies the fix level (L0: typo, L1: single file, L2: multi-file, L3: cross-module). Updates documentation BEFORE touching code, then applies the fix and verifies.

---

## 4. Batch Intake (Multiple Requests)

**When to use:** You have a mix of feature requests, bug reports, and tasks to process at once.

```
/nacl-tl-intake
```
Triages each request using Neo4j context to disambiguate scope. Routes features to `/nacl-sa-feature`, bugs to `/nacl-tl-fix`, and standalone tasks to `/nacl-tl-dev`.

```
/nacl-tl-conductor --items FR-001,FR-002,BUG-003
```
Orchestrates all routed items through planning, development, QA, and shipping as a single coordinated batch.

---

## 5. Import Client Document

**When to use:** A client sent a requirements document (DOCX, PDF, XLSX, or plain text) and you want to turn it into a working specification.

```
/nacl-ba-from-board import /path/to/document.docx
```
Parses the document, extracts business-process elements, places them on an Excalidraw board with swimlanes and confidence coloring, then syncs everything to the Neo4j graph.

```
/nacl-sa-full
```
Builds the full system specification from the imported BA data now living in the graph.

```
/nacl-tl-conductor
```
Plans and executes development from the specification.

---

## 6. Deliver to Staging

**When to use:** Development is complete and you want to push, verify CI, and confirm the staging environment is healthy.

```
/nacl-tl-deliver
```
Chains three steps into one pipeline: pushes the feature branch and creates a PR (`nacl-tl-ship`), monitors CI/CD and waits for a green build (`nacl-tl-deploy`), then runs E2E verification and health checks against staging (`nacl-tl-verify`).

---

## 7. Release to Production

**When to use:** Staging is verified and you are ready to cut a release.

```
/nacl-tl-release
```
Full release pipeline. With `feature-branch` git strategy: collects verified PRs (from YouGile "ToRelease" or GitHub), merges them into `main` with user confirmation, waits for production CI to pass, runs a health check, then bumps the version, creates a git tag, generates release notes, and notifies YouGile. With `direct` strategy (code already on main), the merge and deploy steps are skipped automatically.

To merge specific PRs:
```
/nacl-tl-release --pr 42,45
```

To skip merge and only tag (old behavior):
```
/nacl-tl-release --skip-merge
```

---

## 8. Recovery from Broken State

**When to use:** Documentation has drifted from code, tests are failing for unclear reasons, or the project feels out of sync.

```
/nacl-tl-diagnose
```
Analyzes git history, documentation drift, code health, and regression patterns. Produces a diagnostic report with specific findings.

```
/nacl-tl-reconcile
```
Uses the diagnostic report to bring all documentation back in sync with the current code state. Invokes SA skills as needed, then validates the result.

---

## Bonus: Check Status

**When to use:** You want a quick overview of where the project stands or what to work on next.

```
/nacl-tl-status
```
Reads Task and Wave nodes from Neo4j, shows per-phase progress (BE, FE, sync, QA) for each UC, TECH task status, and SA coverage metrics.

```
/nacl-tl-next
```
Recommends the next task to pick up based on wave ordering, dependencies, and critical path analysis. Enriches suggestions with UC entity and form names from the graph.

---

## 9. Emergency Hotfix

**When to use:** A critical bug is in production. You are on a feature branch and need the fix on `main` NOW, without merging the entire feature.

```
/nacl-tl-fix "what's broken"
```
Fix the bug on the current branch (spec-first, as always).

```
/nacl-tl-hotfix --apply
```
Takes the uncommitted fix, creates a `hotfix/` branch from `main`, opens a PR with auto-merge enabled. After the PR merges, restores you to the feature branch.

If the fix is already committed on the feature branch:
```
/nacl-tl-hotfix --cherry-pick HEAD
```
Cherry-picks the commit onto a `hotfix/` branch from `main` and opens a PR.

---

## Next Steps

- [Quick Start](quickstart.md) -- get running in 10 minutes
- [Setup Guide](setup/) -- detailed infrastructure setup

[Home](../README.md) > Workflows

🇷🇺 [Русская версия](workflows.ru.md)

# Workflows

10 end-to-end scenarios, plus a status-check bonus. Each shows the exact sequence of slash commands you run in Claude Code and what happens at every step. Commands are given in the `/nacl-*` form used by the CLI install; on the Claude Code Desktop plugin channel the same skills are namespaced `/nacl:<name>` instead (see [Agent Architecture > Installation](agents.md#installation)).

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

Tag-only mode needs no flag: when discovery finds no verified PRs to merge
(code already merged manually or via `git.strategy: direct`), the skill skips
the merge steps automatically and proceeds to tag + release. The old
`--skip-merge` flag was removed; bulk bypasses go through signed exceptions
or emergency mode.

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

---

## 10. Goal-driven workflow

**When to use:** A long deterministic loop that has a graph-checkable finish line —
draining a wave, fixing a tracked bug, or validating a module — and you want it to run
without manual prompting between turns. Use `/nacl-goal` instead of `/goal` directly;
it enforces NaCl gate rules and writes a structured run file.

**Choose `/nacl-goal` when:**
- The task maps to a built-in alias (`wave`, `fix`, `validate`, `reopened-drain`, `intake`, `conduct`).
- The finish line is objectively verifiable by a script (not a human judgment call).
- You are comfortable leaving the session running for Tier S (up to 2 h) or Tier M (up to 6 h).

**Do not use `/nacl-goal` for:**
- Anything that crosses a BA-SA handoff, SA phase confirmation, or hotfix routing decision.
  Those are mandatory human-approval gates — `/nacl-goal` refuses them by code.
- Tier L / XL unattended overnight (until 2.10.2 calibration data is available).

```
/nacl-goal wave:5             # preview — prints tier, budget, check script, gates, denylist
/nacl-goal wave:5 --start     # issues /goal with the GOAL_PROOF-instructing condition
```

After the run, inspect `.tl/goal-runs/<run_id>.md` for the machine-parseable record,
including the post-completion re-check result and any gate-violation attempts logged.

Full reference: [docs/guides/goal-command.md](guides/goal-command.md)

## Codex Skills-only Public Routes

The official Codex Skills-only bundle exposes conductors, not the leaf
workflows shown in the Claude examples above:

| Public skill | Project-MCP precondition | Internal route |
|---|---|---|
| `nacl-init` | None before bootstrap | project identity, graph lifecycle, project `.codex/config.toml`, schema |
| `nacl-goal` | Required only for graph-backed routes | `nacl-goal` |
| `nacl-ba` | Verified in a new task | the fourteen `nacl-ba-*` workflows |
| `nacl-sa` | Verified in a new task | the ten `nacl-sa-*` workflows |
| `nacl-tl` | Verified for graph-backed planning/status | TL planning, development, QA, and delivery |
| `nacl-fix` | Verified for graph-backed diagnosis | fix, hotfix, reopened, regression test |
| `nacl-verify` | Verified for graph-backed evidence | verify, review, QA, sync, stubs |
| `nacl-migrate` | Verified before graph import | migration orchestration and BA/SA adapters |
| `nacl-diagnose` | Verified for graph-backed diagnosis | diagnose, next, status, reconcile, postmortem |
| `nacl-publish` | Required only for graph-backed rendering | render, publish, ship, release, deploy |

`nacl-init` resolves only scripts shipped inside its self-contained skill
bundle. It shows a read-only plan and, after confirmation, creates or connects
the per-project Neo4j Community stack, installs the pinned `neo4j-mcp`, and
merges a no-secret `mcp_servers` entry into `.codex/config.toml`. The current
task must stop; a new task in the same project verifies MCP handshake, schema,
read, confirmed write, and read-back. Other graph-backed routes stop with
actionable init/new-task guidance until that verification succeeds.

Graph-backed skills use the project-local MCP under their documented planning,
confirmation, concurrency, and read-back gates; destructive or administrative
operations remain explicit stop/confirmation points. Neo4j is operated
separately per project. The server is the authorization boundary, while
`project_scope` is routing/provenance. The official journey
requires neither a public hosted MCP nor a second GitHub installation. A root
`.mcp.json` and package MCP tools belong only to Claude or explicitly
documented Git/full-plugin compatibility paths.

## Next Steps

- [Quick Start](quickstart.md) -- get running in 10 minutes
- [Setup Guide](setup/) -- detailed infrastructure setup

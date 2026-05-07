---
name: nacl-tl-release
description: |
  Coordinate NaCl release readiness, verification evidence, production deploy
  checks, changelog, and release reporting. Use when preparing or executing a
  release, promoting staging to production, or when the user says
  `/nacl-tl-release`.
---

# NaCl TL Release For Codex

Release is a gated workflow. It should aggregate evidence before any production
state changes.

## Workflow

1. Resolve release scope, target environment, branch, version, and upstream task
   evidence.
2. Check verification, QA, sync, deploy, and regression evidence.
3. Present the release plan, risks, and production-impacting commands.
4. Stop for confirmation before tagging, pushing, deploying, or updating
   external trackers.
5. Execute approved release actions through available tools.
6. Run post-release health checks.
7. Update changelog and release report when file editing is available and
   confirmed.

## Capabilities

### May Do

- Aggregate release readiness evidence.
- Run approved build, test, regression, CI, and deploy checks.
- Create release notes or changelog entries.
- Tag or publish releases when tools and confirmation are available.
- Update graph or task tracker release metadata when confirmed.

### Must Not Do

- Promote code with missing or failing required evidence without explicit user
  direction.
- Mutate production, git tags, graph, or trackers without confirmation.
- Treat staging verification as production verification without a production
  health check.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Git, CI, deploy, and release tooling require availability and confirmation.
- Graph and tracker updates require available tooling.
- Changelog and report writes require writable workspace access.
- Production checks require reachable configured targets.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when release scope, tools, target config, evidence, or
  confirmation are missing.
- Use `FAILED` when build, test, deploy, health, or release actions fail.
- Use `PARTIALLY_VERIFIED` when some release gates pass but others cannot run.
- Use `NOT_RUN` for intentionally skipped gates.
- Use `UNVERIFIED` when release state or production health cannot be confirmed.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-release/SKILL.md`

### Preserved Methodology

- Release readiness aggregation.
- Production-impacting confirmation gates.
- Changelog and release reporting.
- Post-release health checks.

### Removed Claude Mechanics

- Source headline vocabulary outside the closed status set.
- Guaranteed CI, deploy, and tracker tooling.
- Runtime-specific generated metadata assumptions.
- Model routing fields.

### Codex Replacement Behavior

- Treat every production-impacting action as confirmed and conditional.
- Aggregate evidence before release mutation.
- Report partial or unknown release confidence explicitly.
- Use the closed verification vocabulary.

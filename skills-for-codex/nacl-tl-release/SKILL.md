---
name: nacl-tl-release
description: |
  Coordinate NaCl release readiness, verification evidence, production deploy
  checks, changelog, and release reporting. Use when preparing or executing a
  release, promoting staging to production, or when the user says
  `/nacl-tl-release`.
---

# NaCl TL Release For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

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

## Source-Parity Requirements

- Release readiness requires verified task evidence, clean or understood git
  state, passing required local checks, CI evidence, deploy evidence, health
  evidence, docs/changelog evidence, and stub gate evidence.
- Do not promote `BLOCKED`, `FAILED`, or `UNVERIFIED` work. The post-W4
  override paths are (a) a signed exception under
  `.tl/exceptions/<exception_id>.yaml` enumerating specific
  `affected_gates`, OR (b) emergency mode (three env vars on the
  invoking shell — see "Release Blocking Gates (Strict-Only)"
  below). There are no inline operator-prompt overrides at
  Strict-Only gates.
- Tag creation, pushing, release publication, deployment, tracker moves, and
  graph updates require confirmation and read-back.
- Tie every release tag or deployed commit back to verified task and delivery
  evidence.
- Missing CI, deploy, health, docs, changelog, or release artifact evidence
  downgrades the release report.

## Release Blocking Gates (Strict-Only)

**Introduced in:** W4-blocking-release.

The release skill refuses VERIFIED → release-tag / promote when ANY
of the seven conditions below holds. These gates are **strict-only**
— there is no fallback branch, no flag-driven bypass, and no inline
operator-prompt override. The Project-Alpha stale-graph episode and the
project-beta health-only episode are the canonical episodes these
gates exist to prevent.

### The Seven Block Conditions

| # | Condition | Closed `Status:` | Workflow detail |
|---|---|---|---|
| 1 | Upstream `nacl-tl-sync` verdict is `UNVERIFIED` (per W2) — wire-evidence missing for any UC with `actor != SYSTEM` | `BLOCKED` | `upstream-sync-unverified` |
| 2 | `nacl-tl-qa` aggregate is `UNVERIFIED` (per W3) — a mandatory stage (typically `LIVE_PROVIDER_SMOKE` or `PROD_GOLDEN_PATH`) is `NOT_RUN`, OR aggregate weakest-stage rule yielded `UNVERIFIED` | `BLOCKED` | `upstream-qa-unverified` |
| 3 | **Graph staleness detected** — snapshot vs live mismatch on the project's Neo4j instance. **Baseline MUST come from a LIVE capture; NEVER from a stale `.cypher` export.** A pre-release live capture (node count, label histogram, rel-type histogram) is compared to the current live state via direct Cypher query. Any delta = STALE. | `BLOCKED` | `graph-stale` |
| 4 | `/nacl-sa-validate full` reports `Status: FAIL` with at least one finding at `severity: CRITICAL` | `BLOCKED` | `sa-validate-critical` |
| 5 | **Missing PROD_GOLDEN_PATH evidence.** A bare HTTP 200 from `/health` is `HEALTH_ONLY` evidence and is **never product-readiness evidence**. The release requires a `PROD_GOLDEN_PATH` evidence string in the QA aggregate (per W3 six-stage decomposition) for every UC where the matrix marks `PROD_GOLDEN_PATH` mandatory. | `BLOCKED` | `missing-prod-golden-path` |
| 6 | **PR / CI skipped without `project_kind: prototype` AND a signed exception.** Direct-strategy releases (no PR, no CI) are permitted only when `config.yaml` declares `project_kind: prototype` AND `.tl/exceptions/` contains a valid exception with `affected_gates` including the literal `skipped-pr` and / or `skipped-ci`. | `BLOCKED` | `skipped-pr-without-prototype-exception` or `skipped-ci-without-prototype-exception` |
| 7 | **Stale downstream of an unreviewed change.** `/nacl-sa-validate full` reports an `L8` finding — ≥1 node carries `review_status='stale'` (a UC/entity/endpoint changed upstream and its dependents, typically Tasks, were never re-synced). Distinct from #4 (any CRITICAL) and #3 (snapshot vs live count): #7 names "a recorded change with un-propagated dependents". Clear by running `/nacl-tl-plan` or re-reviewing the flagged nodes. | `BLOCKED` | `stale-downstream` |

### HEALTH_ONLY vs PROD_GOLDEN_PATH

`HEALTH_ONLY` evidence (a 200 OK from `{production_url}{health_endpoint}`)
confirms only that the deploy reached a running process and the
process can serve one HTTP request. It does NOT confirm that any
product flow executed end-to-end against production. **HEALTH_ONLY
is NEVER product-readiness evidence on its own.** The project-beta
episode (health green; upload golden path 404 on first real call)
is the canonical proof.

`PROD_GOLDEN_PATH` evidence (per W3 six-stage decomposition) is a
recorded end-to-end run of the UC's primary happy path against
production: real auth, real database write, real provider call,
real artifact returned. It lives in the QA aggregate as the
`qa-stage:prod-golden-path:VERIFIED` evidence string. The release
gate (condition #5) fires when this evidence is missing or
`NOT_RUN` on a UC where the W3 matrix marks `PROD_GOLDEN_PATH`
mandatory, EVEN IF the `/health` probe returned 200.

### `project_kind: prototype` + Signed Exception (PR/CI carve-out)

**The carve-out is conjunctive.** Direct-strategy release (no PR,
no CI) is permitted only when **both**:

1. `config.yaml` declares `project_kind: prototype`, AND
2. A signed exception exists with `affected_gates` enumerating
   exactly the gate names being skipped (`skipped-pr`,
   `skipped-ci`, or both).

Neither alone is sufficient. `project_kind: prototype` does NOT
carve out: graph-staleness, `/nacl-sa-validate` CRITICAL,
PROD_GOLDEN_PATH, upstream `tl-sync` / `tl-qa` UNVERIFIED. Each
of those requires its own signed exception with its own
`affected_gates` entry.

### Signed Exception Schema (Binding)

`.tl/exceptions/<exception_id>.yaml` is the only override mechanism
for the seven block conditions (other than emergency mode). The
schema is defined in `.tl/exceptions/_template.yaml`. The eight
required fields are:

| Field | Type | Notes |
|---|---|---|
| `exception_id` | string, format `EXC-YYYY-MM-DD-<slug>` | enforced via regex `^EXC-\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$` |
| `owner` | string | GitHub handle or team name |
| `reason` | string | concrete justification; single-word values like `"urgent"`, `"blocked"`, `"needed for demo"` are rejected |
| `created_at` | ISO-8601 timestamp (UTC) | wall-clock at file creation |
| `expiry` | ISO-8601 timestamp (UTC) | wall-clock at which the exception STOPS overriding |
| `affected_gates` | list of strings | MUST enumerate specific gate names; `["*"]`, `["all"]`, or any catch-all token is rejected |
| `affected_projects` | list of strings | project ids the exception applies to |
| `followup_task` | string | task id or in-repo path of the follow-up that closes the underlying issue |

#### The Four Binding Rules

1. **Expired = blocker.** When `expiry` is in the past, the
   exception is treated as ABSENT. No grace period.
2. **No silent extension.** Editing the `expiry` of an existing
   exception is detected as schema tampering (content-hash
   recorded at first read).
3. **Renewal requires a new `exception_id`.** The id format
   embeds the creation date; a renewal is a new file with a new
   id, and the prior id appears in the renewal's `reason`.
4. **No blanket overrides.** `affected_gates` MUST list specific
   gate names; catch-all tokens are rejected.

#### Surfacing

Active signed exceptions consumed by a release run are surfaced in
**three places**: the GitHub release notes (Step 8) under
`## Active exceptions`; `.tl/release-status.json` under an
`"exceptions"` array; `.tl/conductor-state.json` under the
conductor-maintained `exceptions[]` array (W5 owns this).

#### Removed-Flag Rule

The five W4-owned removed flags — SKIP-MERGE, SKIP-VERIFY, SKIP-
DEPLOY, NO-TEST, FORCE — and the cross-wave removed flags (bulk-
QA-skip flag owned by W3; SKIP-DELIVER flag owned by W5; SKIP-PLAN
flag owned by W9) are **NOT re-enabled by signed exceptions**.
The flag surface is gone. Bulk-bypass routes through emergency
mode only. (Literal flag tokens are scrubbed from this skill's
prose to satisfy the W4 grep acceptance check.)

### Emergency Mode (the bulk-bypass path)

When a release must advance past one or more Strict-Only gates in
a situation that signed exceptions cannot anticipate (production
outage, security rollback), the operator invokes **emergency
mode** — NOT a flag, but a triple of environment variables:

```bash
NACL_EMERGENCY=1 \
NACL_EMERGENCY_REASON="<concrete text>" \
NACL_EMERGENCY_OWNER="<github_handle_or_team>" \
  <invocation>
```

All three REQUIRED. Behavior:

- Every Strict-Only gate still evaluates.
- Every gate that would have refused VERIFIED prints a bypass
  banner (one per gate, on stderr).
- The skill advances past refusal and writes a structured event
  to `.tl/emergencies/<UTC-timestamp>-<slug>.yaml`.
- `release-status.json` gets an `"emergency"` key.
- `.tl/changelog.md` gets a blockquote line under the in-flight
  version heading.
- The terminal closed `Status:` is at best `PARTIALLY_VERIFIED`
  with a `(emergency-bypass)` suffix on the headline — NEVER
  `VERIFIED`.

Full schema and rules: `nacl-tl-core/references/emergency-mode.md`.
Event-file template: `.tl/emergencies/_template.yaml`.

Emergency mode does NOT re-enable any removed flag, does NOT
silence the gates, and does NOT extend over multiple invocations.

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

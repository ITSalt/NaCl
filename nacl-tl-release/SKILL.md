---
name: nacl-tl-release
model: sonnet
effort: low
description: |
  Full release pipeline: merge verified PRs to main, wait for production CI,
  health check, version bump, git tag, changelog, GitHub release, YouGile notification.
  Use when: create release, bump version, merge and release, generate release notes,
  tag version, or the user says "/nacl-tl-release".
---

## Contract

**Inputs this skill consumes:**
- Per-PR underlying UC statuses (from graph or .tl/status.json)
- GitHub CI status per PR

**Outputs this skill produces:**
- Headline one of: RELEASE COMPLETE / RELEASE HALTED — {SUFFIX} /
  RELEASE INCOMPLETE — REGRESSION
- Release tag (created only on aggregated PASS)
- Per-UC table in release notes
- `delivered_in_release` graph stamp gated on PASS

**Downstream consumers of this output:**
- GitHub release
- Deploy pipeline (downstream of merge to main)

**Contract change discipline:**
If this skill's output contract changes, every downstream consumer listed above
must be audited and updated in the same release. The 0.10.0→0.10.1 regression
was caused by the absence of this discipline. `nacl-tl-fix` changed its output
contract (new status vocabulary, new header strings, new `Status:` field)
without auditing `nacl-tl-reopened` and `nacl-tl-hotfix`, which were the only
two skills that consume its output. Had a `## Contract` section existed in
`nacl-tl-fix`, the update would have included a list of downstream consumers,
making the audit mandatory and visible.

---

# TeamLead Release — Merge + Deploy + Version + Notify

## Your Role

You execute the full release pipeline: merge verified feature branch PRs into main, verify production deployment, bump version, create git tag, aggregate changelog into release notes, and notify stakeholders via YouGile.

## Key Principle

```
Release = Merge PRs + Verify Deploy + Tag Version + Notify.
With feature-branch strategy, PRs must be merged before tagging.
With direct strategy, merge steps are skipped (code already on main).
Version follows SemVer. Changelog comes from .tl/changelog.md.
```

---

## Invocation

```
/nacl-tl-release                       # full release: merge PRs + deploy verify + version + tag
/nacl-tl-release --minor               # force minor version bump
/nacl-tl-release --major               # force major version bump
/nacl-tl-release --patch               # force patch version bump
/nacl-tl-release --dry-run             # show what would be merged + version bump, no action
/nacl-tl-release --pr 42,45            # merge specific PRs (skip discovery)
/nacl-tl-release --yes                 # skip user confirmation gates
```

### Removed Flags (W4-blocking-release)

Five flags were REMOVED in W4-blocking-release across the chain.
The literal flag tokens have been scrubbed from this skill's prose
to satisfy the W4 grep acceptance check (a literal-token search
across the skill family must return empty). The removed flags are
identified here by descriptive name only:

| Removed flag (descriptive name) | Replacement |
|---|---|
| the SKIP-MERGE flag (was: tag-only mode bypassing the merge action) | For prototype projects with `git.strategy == "direct"`, the merge action is skipped by configuration (no PRs to merge). For standard projects, every release goes through PR + CI. Direct-strategy releases on `project_kind: prototype` require a signed exception with `affected_gates: [skipped-pr, skipped-ci]`. |
| the SKIP-VERIFY flag (was: bypass staging verification; lived on `nacl-tl-deliver`, consumed here) | Removed at source in W4. The release-time read of `verification_evidence = 'no-test'` no longer has an upstream producer. Bulk-bypass routes through emergency mode (see below). |
| the SKIP-DEPLOY flag (was: bypass health check; lived on `nacl-tl-deliver`, consumed here) | Removed at source in W4. Missing PROD_GOLDEN_PATH evidence is now a release-blocker. |
| the NO-TEST flag (was: permitted `no-test` evidence; lived on `nacl-tl-full` / `nacl-tl-conductor`, consumed here) | Removed at source in W4. `no-test` evidence is no longer producible by the chain. |
| the FORCE flag (was: per-skill bypass; lived on `nacl-tl-reconcile`, consumed here transitively) | Removed at source in W4. |

(W3 also removed the bulk-QA-skip flag; W5 will remove the SKIP-
DELIVER flag; W9 will remove the SKIP-PLAN flag. None of these are
re-enabled by signed exceptions.)

The bulk-bypass use case those flags served is now routed through
**emergency mode** — see
`nacl-tl-core/references/emergency-mode.md`. Emergency mode is a
separate top-level invocation pattern (three env vars), NOT a
flag, and is loudly recorded in `release-status.json` +
`.tl/changelog.md` + `.tl/emergencies/<timestamp>-<slug>.yaml`.

### Configuration Resolution

**IMPORTANT:** Read `config.yaml` first for all settings. Fall back to defaults if missing.

| Data | Source priority (check in order, use first found) |
|------|--------------------------------------------------|
| Git strategy | `git.strategy` > fallback `"feature-branch"` |
| Base branch | `git.main_branch` > fallback `"main"` |
| Merge method | `git.merge_method` > fallback `"squash"` |
| Production URL | `deploy.production.url` > no default |
| Health endpoint | `deploy.production.health_endpoint` > fallback `"/api/health"` |
| CI timeout | `deploy.production.ci_timeout` > fallback `600` (seconds) |
| CI platform | `deploy.ci_platform` > detect from `.github/workflows/` |
| YouGile to_release column | `yougile.columns.to_release` |
| YouGile done column | `yougile.columns.done` |

If config.yaml missing → use all fallback defaults. If YouGile missing → skip task discovery and moves.

---

## State File: `.tl/release-status.json`

Persists release progress for resumption:

```json
{
  "started": "2026-04-11T14:00:00Z",
  "prs": [
    { "number": 42, "title": "feat: UC-028 Funnel event tracking", "status": "merged" },
    { "number": 45, "title": "feat: UC-029 Scene prompt display", "status": "pending" }
  ],
  "merge": { "status": "in_progress", "merged_count": 1, "total": 2 },
  "ci": { "status": "pending" },
  "health": { "status": "pending" },
  "version": { "status": "pending", "bump": null, "value": null },
  "tag": { "status": "pending" },
  "graph": { "status": "pending" },
  "release": { "status": "pending" },
  "yougile": { "status": "pending" }
}
```

**Always update after each step completes.** This enables resumption.

---

## Release Blocking Gates (Strict-Only)

**Introduced in:** W4-blocking-release.

The release skill refuses VERIFIED → release-tag / promote when ANY
of the seven conditions below holds. These gates are **strict-only** —
strict is the single, unconditional mode; there is no fallback
branch, no `--skip-*` flag, and no inline operator-prompt override.
The only sanctioned override paths are: (a) a signed exception under
the schema below, and (b) emergency mode (separate invocation,
loudly recorded — see `nacl-tl-core/references/emergency-mode.md`).

The Project-Alpha stale-graph episode (live graph 1,083 nodes vs
handover-artifact 970 nodes; `/nacl-sa-validate full = FAIL` with 1
CRITICAL + 156 WARNINGs; release proceeded under operator override)
and the project-beta health-only episode (`/api/health` returned 200
OK but no upload golden path ever executed; first real call 404'd)
are the canonical episodes these gates exist to prevent.

### The Seven Block Conditions

| # | Condition | Refusal headline | Workflow detail |
|---|---|---|---|
| 1 | Upstream `tl-sync` verdict is `UNVERIFIED` (per W2) — wire-evidence missing for any UC with `actor != SYSTEM` | `RELEASE HALTED — UNVERIFIED (upstream-sync-unverified)` | `upstream-sync-unverified` |
| 2 | `tl-qa` aggregate is `UNVERIFIED` (per W3) — a mandatory stage (typically `LIVE_PROVIDER_SMOKE` or `PROD_GOLDEN_PATH`) is `NOT_RUN`, OR aggregate weakest-stage rule yielded `UNVERIFIED` | `RELEASE HALTED — UNVERIFIED (upstream-qa-unverified)` | `upstream-qa-unverified` |
| 3 | **Graph staleness detected** — snapshot vs live mismatch on the project's Neo4j instance. **Baseline MUST come from a live capture; never from a stale `.cypher` export.** A `_summary.json` captured pre-release (live node count, label histogram, rel-type histogram) is compared to the current live state via direct Cypher query. Any node-count delta > 0 OR any label histogram delta OR any rel-type histogram delta = STALE. | `RELEASE HALTED — UNVERIFIED (graph-stale)` | `graph-stale` |
| 4 | `/nacl-sa-validate full` reports `Status: FAIL` with at least one finding at `severity: CRITICAL` | `RELEASE HALTED — UNVERIFIED (sa-validate-critical)` | `sa-validate-critical` |
| 5 | **Missing PROD_GOLDEN_PATH evidence.** A bare HTTP 200 from `/health` is `HEALTH_ONLY` evidence and is **never product-readiness evidence**. The release requires a `PROD_GOLDEN_PATH` evidence string in the QA aggregate (per W3 six-stage decomposition) for every UC where the matrix marks `PROD_GOLDEN_PATH` mandatory. | `RELEASE HALTED — UNVERIFIED (missing-prod-golden-path)` | `missing-prod-golden-path` |
| 6 | **PR / CI skipped without `project_kind: prototype` AND a signed exception.** Direct-strategy releases (no PR, no CI) are permitted only when `config.yaml` declares `project_kind: prototype` AND `.tl/exceptions/` contains a valid (unexpired, well-formed) exception with `affected_gates` including the literal `skipped-pr` and / or `skipped-ci` matching what is actually skipped. | `RELEASE HALTED — UNVERIFIED (skipped-pr-without-prototype-exception)` or `(skipped-ci-without-prototype-exception)` | `skipped-pr-without-prototype-exception` or `skipped-ci-without-prototype-exception` |
| 7 | **Stale downstream of an unreviewed change.** `/nacl-sa-validate full` reports an `L8` finding — at least one node carries `review_status='stale'` (a UC/entity/endpoint changed upstream and its dependents were never re-synced; typically Tasks whose source UC moved but were never re-planned). This is distinct from #4 (any CRITICAL) and #3 (snapshot vs live count): #7 is specifically "a recorded change has un-propagated dependents." Clear by running `/nacl-tl-plan` (regenerates stale tasks) or re-reviewing the flagged nodes. | `RELEASE HALTED — UNVERIFIED (stale-downstream)` | `stale-downstream` |

> Conditions #4 and #7 both surface through `/nacl-sa-validate full`: #4 is the generic "any CRITICAL" gate, #7 names the staleness CRITICAL (L8) specifically so the refusal headline tells the operator *what* to do (run `tl-plan`) rather than just "validation failed." If L8 fires, prefer the `stale-downstream` headline.

### HEALTH_ONLY vs PROD_GOLDEN_PATH

`HEALTH_ONLY` evidence:

- Is the literal HTTP response from `{production_url}{health_endpoint}` returning 200 OK.
- Confirms the deploy reached a running process and the process can serve at least one HTTP request.
- **Does NOT confirm** that any product flow executed end-to-end against production data, against the production database, against the production provider keys, or with production-grade payload sizes.
- Is the kind of evidence Step 3b of this skill collects.
- Is **NEVER** product-readiness evidence on its own. The project-beta episode (health green; upload golden path 404 on first real call) is the canonical proof.

`PROD_GOLDEN_PATH` evidence (per W3 six-stage decomposition):

- Is a recorded end-to-end run of the UC's primary happy path against production: real auth, real database write, real provider call (with real provider key when applicable), real artifact returned.
- Lives in the QA aggregate as the `qa-stage:prod-golden-path:VERIFIED` evidence string (or `qa-stage:prod-golden-path:NOT_RUN` when the stage did not run).
- Is required by the release gate (condition #5 above) for every UC where the W3 mandatory-stage matrix marks `PROD_GOLDEN_PATH` mandatory.

The release skill MUST distinguish between the two: condition #5
fires when `PROD_GOLDEN_PATH` is missing or `NOT_RUN` on a UC where
the matrix marks it mandatory, EVEN IF the Step 3b `/health` probe
returned 200. The health probe is a complement to
`PROD_GOLDEN_PATH`, not a substitute.

### `project_kind=prototype` + Signed Exception (the PR/CI carve-out)

**The carve-out is conjunctive.** A direct-strategy release without
PR and without CI is permitted only when **both**:

1. `config.yaml` declares `project_kind: prototype`, AND
2. A signed exception exists with `affected_gates` enumerating
   exactly the gate names being skipped (`skipped-pr`,
   `skipped-ci`, or both).

Neither condition alone is sufficient. Prototype-mode without an
exception → block. Exception without prototype-mode → block (the
exception is rejected at load time as malformed —
`exception-prototype-only-gate-on-standard-project`).

See `nacl-tl-core/references/config-schema.md` § "W4 PR/CI
Carve-Out (binding)".

### Signed Exception Schema (Binding)

`.tl/exceptions/<exception_id>.yaml` is the only override mechanism
for the seven block conditions above (other than emergency mode). The
schema is defined in `.tl/exceptions/_template.yaml`. The eight
required fields are:

| Field | Type | Notes |
|---|---|---|
| `exception_id` | string, format `EXC-YYYY-MM-DD-<slug>` | enforced via regex `^EXC-\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$` |
| `owner` | string | GitHub handle (no `@`) or team name |
| `reason` | string | concrete justification; the literals `"urgent"`, `"blocked"`, `"needed for demo"`, and any single-word value are rejected |
| `created_at` | ISO-8601 timestamp (UTC) | wall-clock at file creation |
| `expiry` | ISO-8601 timestamp (UTC) | wall-clock at which the exception STOPS overriding |
| `affected_gates` | list of strings | MUST enumerate specific gate names; `["*"]`, `["all"]`, or any catch-all token is rejected |
| `affected_projects` | list of strings | project ids the exception applies to |
| `followup_task` | string | task id or in-repo path of the follow-up that closes the underlying issue |

Recognised gate names for `affected_gates` (W4 release-skill set):
`skipped-pr`, `skipped-ci`, `upstream-sync-unverified`,
`upstream-qa-unverified`, `graph-stale`, `sa-validate-critical`,
`missing-prod-golden-path`, `stale-downstream`. (The cross-skill set — `repo-checks-RED`,
`wire-evidence-missing`, `LIVE_PROVIDER_SMOKE`, etc. — is documented
in `.tl/exceptions/_template.yaml` header.)

#### The Four Binding Rules

1. **Expired = blocker.** When `expiry` is in the past at the
   moment the gate is evaluated, the exception is treated as
   ABSENT. The named gate refuses VERIFIED again with no grace
   period. Workflow detail: `exception-expired`.

2. **No silent extension.** Editing the `expiry` of an existing
   exception file is detected as schema tampering (the release
   skill records exception-file content-hashes in
   `release-status.json` on first read; a hash mismatch on the
   same `exception_id` triggers refusal with workflow detail
   `exception-id-reused-without-renewal`).

3. **Renewal requires a new `exception_id`.** The id format
   embeds the creation date and a slug; a renewal is a new file
   with a new id (typically `EXC-<renewal-date>-<same-slug>-r2`).
   The renewal's `reason` field references the prior id.

4. **No blanket overrides.** `affected_gates` MUST enumerate
   specific gate names. `["*"]`, `["all"]`, `["any"]`, or any
   catch-all token is rejected at load time with workflow detail
   `exception-affects-blanket-gates`. Each gate the operator
   wants to override is listed individually.

#### Surfacing

Signed exceptions consumed by a release run are surfaced in
**three places**:

1. **Release notes** — the GitHub release body (Step 8) includes a
   `## Active exceptions` section listing every exception consumed,
   with `exception_id`, `affected_gates`, `expiry`, and
   `followup_task`.

2. **`.tl/release-status.json`** — under a new `"exceptions"` key:
   ```json
   "exceptions": [
     {
       "exception_id": "EXC-2026-05-22-stale-graph-projectalpha",
       "affected_gates": ["graph-stale"],
       "expiry": "2026-05-23T08:35:00Z",
       "followup_task": "TECH-042-graph-refresh"
     }
   ]
   ```

3. **`.tl/conductor-state.json`** — every active exception that
   affects a wave-tip commit is appended to the `exceptions[]`
   array maintained by the conductor (W5 owns the conductor
   reconciliation that keeps this array in sync).

#### Removed-Flag Rule

The five W4-owned removed flags (SKIP-MERGE, SKIP-VERIFY, SKIP-
DEPLOY, NO-TEST, FORCE — see the table in the "Removed Flags"
section above) and the cross-wave removed flags (the bulk-QA-skip
flag owned by W3, the SKIP-DELIVER flag owned by W5, the SKIP-PLAN
flag owned by W9) are **NOT re-enabled by signed exceptions**.
The flag surface is gone. Bulk-bypass routes through emergency
mode only.

### Emergency Mode (the bulk-bypass path)

When a release must advance past one or more of the seven block
conditions in a situation that signed exceptions cannot anticipate
(production outage, security rollback, ransomware response), the
operator invokes **emergency mode**.

Emergency mode is **not** a `--skip-*` flag. It is a triple of
environment variables set on the same shell command:

```bash
NACL_EMERGENCY=1 \
NACL_EMERGENCY_REASON="prod 500s on /api/release/v0.18.0 — rolling back" \
NACL_EMERGENCY_OWNER="magznikitin" \
  claude --skill nacl-tl-release
```

All three are REQUIRED. Behavior:

- Every Strict-Only gate still evaluates.
- Every gate that would have refused VERIFIED prints a bypass
  banner naming itself (one per gate, on stderr).
- The skill advances past the refusal and writes a structured
  event to `.tl/emergencies/<UTC-timestamp>-<slug>.yaml`.
- `release-status.json` gets an `"emergency"` key with the event
  id and bypassed-gate list.
- `.tl/changelog.md` gets a blockquote line under the in-flight
  version heading naming the bypass.
- The terminal `Status:` carries the suffix `(emergency-bypass)`
  and is NEVER promoted to `VERIFIED`.

Full schema and rules: `nacl-tl-core/references/emergency-mode.md`.
Event-file template: `.tl/emergencies/_template.yaml`.

Emergency mode does NOT re-enable any removed flag, does NOT silence
the gates, and does NOT extend over multiple invocations.

---

## Workflow: 9 Steps

### Step 0: PRE-CHECK

1. Read `config.yaml` → resolve all settings (see table above)

2. If `git.strategy == "direct"`:
   - Skip the **merge** action of Step 2 (no `gh pr merge` calls).
   - **Enforce the W4 PR/CI carve-out (binding):** verify that
     `config.yaml` declares `project_kind: prototype` AND that a
     signed exception under `.tl/exceptions/` lists
     `skipped-pr` (and `skipped-ci` if CI is also skipped) in its
     `affected_gates`. If either condition is missing, refuse with
     `Status: BLOCKED` and one of the workflow details
     `skipped-pr-without-prototype-exception` /
     `skipped-ci-without-prototype-exception`. Do NOT proceed to
     Step 3. (For `project_kind: standard`, `git.strategy == "direct"`
     itself is a configuration error and the prelude refuses with
     workflow detail `direct-strategy-on-standard-project`.)
   - **DO NOT** skip the pre-merge graph-proof gate. The type-aware gate at
     the top of Step 2 (feature PRs → Task-node check + MISSING TASK NODE
     halt; fix PRs → Decision/level check + UNRECORDED SPEC DRIFT halt;
     status branching; REGRESSION exclusion) MUST run in every mode (P1 /
     0.14.0 contract). The direct-strategy carve-out changes which
     artifacts are produced, not whether the gate runs.
   - Run the gate over the candidate UC list collected in Step 1, or
     — if direct-mode bypasses Step 1 entirely — over the UCs
     associated with commits since the last tag (`gh pr list --state
     merged --base {main_branch}` since `git describe --tags --abbrev=0`).
   - After the gate, jump to Step 3 (verify production deployment).

3. Check for existing `.tl/release-status.json`:
   - If exists → **RESUME MODE** (skip to incomplete step)

4. Ensure we're on the base branch or can switch to it:
   ```bash
   git fetch origin {main_branch}
   ```

---

### Step 1: COLLECT RELEASE CANDIDATES

Find open PRs targeting `{main_branch}` that are ready for release.

**Source A — YouGile (if configured):**
Query tasks in `yougile.columns.to_release`. For each task, extract the PR URL from the task chat (posted by `nacl-tl-ship` / `nacl-tl-deliver`).

**Source B — GitHub (fallback or supplemental):**
```bash
gh pr list --base {main_branch} --state open --json number,title,headRefName,mergeable,reviews,statusCheckRollup
```
Filter to PRs that are:
- Targeting `{main_branch}`
- All CI checks passing (or no CI configured)
- At least one approving review OR authored by automation

**If `--pr 42,45` provided:** skip discovery, use those specific PRs:
```bash
gh pr view 42 --json number,title,headRefName,mergeable,reviews,statusCheckRollup
gh pr view 45 --json number,title,headRefName,mergeable,reviews,statusCheckRollup
```

**If no PRs found:** skip Steps 1-3, proceed to Step 4 (tag-only mode — code was merged manually or via direct strategy).

Write initial `.tl/release-status.json` with discovered PRs.

---

### Step 2: MERGE TO MAIN (USER GATE)

**Pre-merge graph-proof gate (runs BEFORE presenting merge plan):**

The gate is **type-aware**: a feature PR proves it shipped a planned UC via its **Task node**;
a fix PR proves it via the **Decision node** `nacl-tl-fix` records (L2/L3-spec-gap) or a
code-only **`Fix-level`** marker (L0/L1) — *not* a Task node, which the bug-fix path correctly
never creates. The per-PR verdict is computed by the single-authority classifier
`nacl-core/scripts/classify-pr-merge.mjs` (pure, never opens Neo4j, pinned by
`classify-pr-merge.test.mjs`); this skill gathers the graph rows + trailers and feeds them in,
so the verdict is reproducible:
```bash
node nacl-core/scripts/classify-pr-merge.mjs '<pr-json>'   # or a JSON array of PRs
# → { "verdict": "MERGE" | "USER_GATE" | "HALT", "detail": <code|null>, "proof": "<graph proof>" }
```

For each PR in the release candidate list, FIRST classify the PR by its conventional-commit
title prefix (read once: `gh pr view <N> --json title,body,commits`):
- `feat:`/`feature:` — or any non-`fix:` prefix **without** a `Fix-level:` trailer → **FEATURE PR** → 1a.
- `fix:` — or any PR carrying a `Fix-level:` trailer → **FIX PR** → 1b.

**1a. FEATURE PR — Task-node check (unchanged: graph only, no JSON fallback).**
Identify the underlying UC(s) and query the graph:
   ```cypher
   MATCH (t:Task)
   WHERE t.id IN [<UC list>]
   RETURN t.id, t.status, t.verification_evidence
   ```
Feed `{prefix:"feat", taskNodeMissing:<query returned no row>, taskStatus:<t.status>}`. Verdicts:

   | Classifier result | Merge action |
   |-------------------|-------------|
   | `HALT / MISSING_TASK_NODE` (no row) | **HALT immediately.** Print `RELEASE HALTED — MISSING TASK NODE` / "UC### has no Task node in the graph. The graph may be out of sync. Run /nacl-tl-diagnose to reconcile before retrying the release." Do NOT fall back to `.tl/status.json`. Do NOT proceed. |
   | `MERGE` (done) | Include in merge plan normally |
   | `USER_GATE` (verified-pending / blocked) | HALT: "PR #N has UC### with UNVERIFIED/blocked dev status. Merge without verification? [yes/no] Default: no". If user confirms → include with warning. If not → exclude; report RELEASE HALTED — UNVERIFIED |
   | `HALT / REGRESSION` (failed / regression) | DO NOT include; report "PR #N excluded — REGRESSION in UC###"; flag RELEASE INCOMPLETE — REGRESSION |

**1b. FIX PR — Decision / level check (verify the artifact the fix produced, NOT a Task node).**
Read the fix linkage from the PR trailers (commit bodies + PR body — written by `nacl-tl-fix`
Step 8 / `nacl-tl-ship`):
```
Fix-level:    L0 | L1 | L2 | L3-spec-gap        (one or more — bundled PRs carry several; strictest governs)
Fix-decision: DEC-NNN[, DEC-NNN ...] | none      (none for L0/L1, which author no Decision)
```
For each spec-changing level (`L2`/`L3-spec-gap`), query the named Decisions:
   ```cypher
   MATCH (d:Decision) WHERE d.id IN [<Fix-decision ids>] RETURN d.id, d.status
   ```
Feed `{prefix:"fix", fixLevels:[…], fixDecisions:[…], decisions:[…rows],
gapcheckNoDrift:<status.json phases.spec.kind=="gapcheck-no-drift">,
specUpdateCommitPresent:<a spec-update commit is in the PR>, sourceMatchedDecisions:[…]}`. Verdicts:

   | Classifier result | Merge action |
   |-------------------|-------------|
   | `MERGE` (proof `Decision DEC-NNN accepted`) | Spec-changing fix, every named Decision present & `status='accepted'`. Include normally. |
   | `HALT / UNRECORDED_SPEC_DRIFT` | A named Decision is missing or not accepted (or no trailer + a spec-update commit + no Decision). Print: `RELEASE HALTED — UNRECORDED SPEC DRIFT` / "PR #N (fix:) changes behavior but no accepted Decision node backs it. Expected Fix-decision DEC-NNN with status='accepted'. Run /nacl-tl-fix to record the Decision, or /nacl-tl-diagnose to reconcile." Do NOT proceed. |
   | `MERGE` (proof `code-only (L<n>)`) | Code-only fix (`Fix-level: L0\|L1`, `Fix-decision: none`). The `Fix-level` trailer is the "no spec drift" proof (`nacl-tl-fix` enforced 6.SF before the code commit). **Bounded status.json corroboration** — a calibrated exception to the 0.13.0 no-JSON-fallback rule, scoped STRICTLY to L0/L1 fix PRs: if `.tl/status.json` has `phases.spec.kind == "gapcheck-no-drift"` (read defensively — the slot may be a string OR an object) the proof notes it; its **absence is NOT a HALT** (the trailer is authoritative; `phases.spec` is a single per-run-overwritten slot, unreliable for bundled PRs). |
   | `HALT / FIX_PROOF_INCONSISTENT` | Inconsistent producer output: a spec-changing level with `Fix-decision: none`, or a code-only level that names a Decision. Surface and stop. |

> **A FIX PR is NEVER halted merely for lacking a Task node** — the bug-fix path records a
> `Decision`, not a `Task` (`nacl-tl-fix/SKILL.md` § "author the Decision + change-provenance").
> The Task-node HALT (1a) applies to feature PRs only. PRs with **no `Fix-level:` trailer**
> (older fixes predating trailer support) fall back to SHA-match
> (`MATCH (d:Decision) WHERE d.source IN [<PR commit SHAs>]`) inside the classifier.

Present the merge plan. Each PR shows a **Graph proof** line — the classifier's `proof`
string — which differs by PR type: `Task <status>` for features, `Decision <DEC> accepted`
for L2/L3 fixes, `code-only (L<n>)` for L0/L1 fixes:

```
===============================================
  RELEASE — MERGE PLAN
===============================================

PRs to merge into {main_branch}:

  #42  feat: UC-028 Funnel event tracking     (feature/UC028)
       CI: passed | Reviews: 1 approved | Conflicts: none
       Graph proof (feature): Task done (PASS)

  #45  feat: UC-029 Scene prompt display       (feature/UC029)
       CI: passed | Reviews: 1 approved | Conflicts: none
       Graph proof (feature): Task verified-pending (UNVERIFIED) — USER GATE REQUIRED

  #51  fix: roll session→error on memories pipeline failure (fix/memories-rollback)
       CI: passed | Reviews: 1 approved | Conflicts: none
       Graph proof (fix, L2): Decision DEC-045 accepted

  #52  fix: null-guard on header avatar          (fix/avatar-null)
       CI: passed | Reviews: 1 approved | Conflicts: none
       Graph proof (fix, L1): code-only (status.json: gapcheck-no-drift confirmed)

Merge method: squash (from config.yaml)
Target: {main_branch}

Proceed with merge? [yes/no]
(UNVERIFIED PRs require separate confirmation before merging)
(Fix PRs are verified via Decision/level proof, not Task status.)
===============================================
```

**Wait for user confirmation.** Skip if `--yes` (but UNVERIFIED UCs still require explicit per-UC confirmation when `--yes` is set — `--yes` skips the plan gate, not the UNVERIFIED safety gate).

For each PR, **sequentially** (order matters — later PRs may conflict after earlier merges):

```bash
gh pr merge {pr_number} --{merge_method} --delete-branch
```

Where `{merge_method}` is one of: `--squash`, `--merge`, `--rebase` (from `git.merge_method`, default: `squash`).

After each merge:
- Update `release-status.json`: mark PR as `"merged"`
- Check next PR's merge status:
  ```bash
  gh pr view {next_pr_number} --json mergeable
  ```
  If `mergeable == "CONFLICTING"` → **STOP**:
  ```
  CONFLICT: PR #45 has merge conflicts after merging #42.
  Resolve conflicts on feature/UC029, push, wait for CI, then re-run /nacl-tl-release.

  Already merged: #42
  Remaining: #45
  ```

After all PRs merged, update local main:
```bash
git checkout {main_branch}
git pull origin {main_branch}
```

---

### Step 3: VERIFY PRODUCTION DEPLOYMENT

After merge to main, the CI/CD pipeline triggers (per `deploy.production.trigger`).

**3a. Wait for CI:**

The CI wait is delegated to the single-authority helper — it selects the run, watches
it under the timeout, and classifies the outcome (constants `--timeout` / `--no-run-grace`
documented in-script; pinned by `scripts/wait-for-ci.test.sh`):
```bash
bash nacl-core/scripts/wait-for-ci.sh watch --branch {main_branch} --since "$merge_iso" \
  --timeout "${ci_timeout:-600}"
# exit 0 + CI_OK | NO_CI (no .github/workflows → warn) | NO_RUN (none within grace → warn & continue)
# exit 1 + CI_FAILED → do NOT proceed to tagging; surface the failure block below
```

If CI **FAILS**:
```bash
gh run view {run_id} --log-failed | tail -50
```
**STOP** with error:
```
CI FAILED after merge to {main_branch}.
Run: {run_url}

PRs already merged: #42, #45
These commits are on {main_branch}. Fix the issue on a follow-up
PR (or via /nacl-tl-hotfix for critical production bugs), wait for
CI green, then re-run /nacl-tl-release. The release skill will pick
up where it left off via .tl/release-status.json.
```
Do NOT proceed to tagging.

**3b. Health check (if `deploy.production.url` configured):**

The health probe is delegated (propagation wait, retry count, and interval are documented
in-script; pinned by `scripts/health-check.test.sh`):
```bash
bash nacl-core/scripts/health-check.sh --url "{production_url}{health_endpoint}"
# exit 0 HEALTH_OK | exit 1 HEALTH_FAILED → surface the HALT block below
```
Remember: a green probe is HEALTH_ONLY evidence, never product-readiness (Step 5 gate).

If health check fails — **HALT** (strict; no inline operator
override; W4-blocking-release):
```
RELEASE HALTED — UNVERIFIED (production health failed)
Production health endpoint did not return 200 OK after 3 retries.
Tag has NOT been pushed.

Resolution options:
  [1] Wait for deploy propagation and re-run /nacl-tl-release.
  [2] Investigate production with /nacl-tl-deploy --production.
  [3] File a signed exception under .tl/exceptions/ with
      affected_gates: [missing-prod-golden-path] (see
      .tl/exceptions/_template.yaml).
  [4] Invoke emergency mode (NACL_EMERGENCY=1 +
      NACL_EMERGENCY_REASON + NACL_EMERGENCY_OWNER); the run will
      advance with a (emergency-bypass) suffix and will NOT be
      VERIFIED — see nacl-tl-core/references/emergency-mode.md.
```

The inline operator-prompt override was removed in W4-blocking-
release. `HEALTH_ONLY` evidence (a green `/health` probe with no
PROD_GOLDEN_PATH execution) is no longer product-readiness
evidence. Mere health success does NOT permit release tagging; the
release skill enforces condition #5 of the Strict-Only gate
(`missing-prod-golden-path`) independently of this probe.

If no `deploy.production.url` is configured AND the project
declares `project_kind: prototype` AND a signed exception covers
`affected_gates: [missing-prod-golden-path]`, this step records
`"health": {"status": "skipped_by_exception", "exception_id": "..."}`
and proceeds. Otherwise (no production URL, no exception) the
release refuses with `Status: BLOCKED` and workflow detail
`no-production-url-without-exception`.

---

### Step 4: DETERMINE VERSION BUMP

Read `.tl/changelog.md` since last git tag and classify changes:
- **major:** Breaking changes, API incompatibilities, major rewrites
- **minor:** New features, new endpoints, new UCs (default for features)
- **patch:** Bug fixes, performance improvements, doc updates

```bash
# Get current version
git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"

# Get changes since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Apply SemVer: `MAJOR.MINOR.PATCH`

If `--major`, `--minor`, or `--patch` flag provided → use forced bump.

### Step 5: AGGREGATE CHANGELOG

Read `.tl/changelog.md` entries since last tag. Group by type:

```markdown
## v1.3.0 — 2026-03-27

### Features
- UC-028: Funnel event tracking (POST /api/analytics/event)
- UC-029: Funnel dashboard for admin panel

### Bug Fixes
- Fix: robust sessionId resolution on loading page
- Fix: sync Dexie store before navigation

### Infrastructure
- TECH-020: @nivo charting library integration
```

**Changelog freshness cross-check (mandatory):**

```bash
# Date of the latest changelog entry (first ## line after last tag)
CHANGELOG_DATE=$(grep -m1 '^## ' .tl/changelog.md | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')

# Date of the most recent PR merged into {main_branch} since the last tag
LAST_MERGE_DATE=$(gh pr list --state merged --base {main_branch} --limit 20 \
  --json mergedAt --jq '[.[].mergedAt] | sort | last | .[0:10]')
```

Compare the two dates:
- If `CHANGELOG_DATE` is **more than 1 day older** than `LAST_MERGE_DATE`:
  ```
  WARNING — CHANGELOG MAY BE STALE
  Latest changelog entry: {CHANGELOG_DATE}
  Most recent PR merged:   {LAST_MERGE_DATE}
  Delta: {N} days. Review .tl/changelog.md and add missing entries before tagging.
  ```
  Do NOT block the release, but print this warning prominently above the version bump line.
- If `CHANGELOG_DATE` is within 1 day of `LAST_MERGE_DATE` (or ahead) → no warning.

### Step 6: CREATE GIT TAG

```bash
git tag -a v1.3.0 -m "Release v1.3.0 — Analytics Funnel Dashboard"
git push origin v1.3.0
```

---

### Step 7: MARK DELIVERED INTAKEITEMS WITH RELEASE VERSION

After the git tag is pushed, stamp `IntakeItem` nodes with the release version.
This step is **strictly gated on aggregated PASS status (P4 + 0.14.0
contract)**:

- Only stamp IntakeItems whose underlying UCs had PASS status (task.status = 'done').
- IntakeItems associated with UNVERIFIED, BLOCKED, or REGRESSION UCs are
  **excluded from the release artifact**. They are NOT stamped with a
  release version, NOT stamped with a "release note instead", and do NOT
  receive any `delivered_in_release` write. The previous "stamp with a note
  instead" path (0.13.0 and earlier) has been removed.
- Excluded IntakeItems are surfaced explicitly in the release report (see
  Step 9 / final report) so the operator can decide whether to retry
  verification before re-running release for those items.
- If ANY UC in the release had REGRESSION → halted at Step 2 (never reaches
  Step 7).

Run the following query for PASS items only, substituting the new version string:

```cypher
MATCH (i:IntakeItem)
WHERE i.status = 'delivered'
  AND i.delivered_in_release IS NULL
  AND NOT EXISTS {
    MATCH (i)<-[:PART_OF]-(t:Task)
    WHERE t.status IN ['verified-pending', 'blocked', 'failed']
  }
SET i.delivered_in_release = $version
RETURN count(i) AS updated;
```

Then collect the excluded set (read-only, for the report):

```cypher
MATCH (i:IntakeItem)<-[:PART_OF]-(t:Task)
WHERE i.status = 'delivered'
  AND i.delivered_in_release IS NULL
  AND t.status IN ['verified-pending', 'blocked', 'failed']
RETURN i.id AS intake_id,
       collect(DISTINCT {uc: t.id, status: t.status,
                         skip_reason: t.verification_skip_reason}) AS blocked_ucs;
```

Surface the excluded list in the final report under a dedicated
"Excluded from release (UNVERIFIED upstream)" section. Do NOT write any
`delivered_in_release` or `delivery_note` field for these items in this
release.

Parameter:
- `$version` — the new release version string, e.g. `"v1.3.0"`

**Failure handling (W4-blocking-release — strict):** If Neo4j is
unavailable or the query errors, this step **refuses VERIFIED**:
```
RELEASE HALTED — UNVERIFIED (graph-stale)
Could not stamp IntakeItems with release version in Neo4j.
Graph state may be stale — reconcile via /nacl-tl-diagnose +
nacl-publish before retrying.

Resolution options:
  [1] Bring Neo4j up, run /nacl-tl-diagnose, then re-run /nacl-tl-release.
  [2] File a signed exception under .tl/exceptions/ with
      affected_gates: [graph-stale] (see .tl/exceptions/_template.yaml).
  [3] Invoke emergency mode (loud, recorded, not VERIFIED).
```

`STALE_GRAPH is a release-blocker, not a follow-up.` (W4 binding
rule.) The previous "log a warning and continue" path was removed
in W4-blocking-release after the Project-Alpha stale-graph episode (live
graph 1,083 nodes vs handover-artifact 970 nodes; release proceeded
under operator override; FR-007 in changelog but not visibly in
graph).

**Pre-flight graph-staleness check (NEW in W4):** Before running
the stamping query, capture the **live** node count, label
histogram, and rel-type histogram via direct Cypher (NOT from any
cached `.cypher` export, NOT from any `_summary.json` written
earlier in the run — those baselines are stale by construction).
Compare against the release-status.json `graph.baseline` field
captured at Step 0 (also live). Any delta on:

- total node count
- any label-count entry
- any rel-type-count entry

is a STALE_GRAPH refusal. Workflow detail: `graph-stale`. The
baseline-from-stale-export episode (Project-Alpha) is the canonical
prevention case.

On success, update `release-status.json`:
```json
"graph": {
  "status": "done",
  "version": "v1.3.0",
  "updated": 3,
  "baseline": {
    "nodes": 1083,
    "labels": { "DomainAttribute": 179, "WorkflowStep": 132, "...": 0 },
    "rels": { "HAS_ATTRIBUTE": 263, "...": 0 }
  }
}
```

The `baseline` block is REQUIRED — it is the live capture that the
NEXT release will diff against. A release that fails to write
`graph.baseline` is in a corrupt state and the next release will
refuse with `Status: BLOCKED (graph-baseline-missing)`.

→ **Output:** count of IntakeItem nodes stamped with the release version

---

### Step 8: CREATE GITHUB RELEASE (optional)

Create a GitHub release using `gh` CLI:

```bash
gh release create v1.3.0 \
  --title "v1.3.0 — Analytics Funnel Dashboard" \
  --notes "$(cat <<'EOF'
## Features
- UC-028: Funnel event tracking
- UC-029: Admin funnel dashboard

## Bug Fixes
- Session ID resolution
- Dexie store sync

Full changelog: .tl/changelog.md
EOF
)"
```

If `deploy.production.url` is set in config.yaml, include it in the release notes body.

### Step 9: YOUGILE NOTIFICATION

If YouGile configured:

1. Post release notes to the board (or a dedicated channel task):
   ```
   Release v1.3.0 — Analytics Funnel Dashboard

   Features:
   - Funnel event tracking (UC-028)
   - Admin dashboard (UC-029)

   Bug Fixes:
   - Session ID resolution
   - Dexie store sync

   Merged PRs: #42, #45
   Deployed: https://example.com
   Tag: v1.3.0
   ```

2. Move all feature tasks from ToRelease to Done (if not already)

3. Close parent UserRequest cards (if all subtasks are Done)

---

## Resumption Logic

On start, if `.tl/release-status.json` exists:

1. Read status file
2. Find first incomplete step:
   ```
   merge.status != "done"     → resume from Step 2 (skip already-merged PRs)
   ci.status != "done"        → resume from Step 3
   health.status != "done"    → resume from Step 3b
   version.status != "done"   → resume from Step 4
   tag.status != "done"       → resume from Step 6
   graph.status != "done"     → resume from Step 7
   release.status != "done"   → resume from Step 8
   yougile.status != "done"   → resume from Step 9
   all done                   → show report
   ```

3. Report resume point:
   ```
   Resuming release.
   Merge: done (2 PRs merged)
   CI: done (passed)
   Resuming from: Version bump
   ```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `git.strategy == "direct"` on `project_kind: prototype` with signed exception covering `skipped-pr`/`skipped-ci` | Skip the merge action of Step 2 (no PRs to merge). UC status gate STILL runs over commits-since-last-tag. |
| `git.strategy == "direct"` on `project_kind: standard` | `RELEASE HALTED — UNVERIFIED (direct-strategy-on-standard-project)` — refuse VERIFIED. |
| `git.strategy == "direct"` on `project_kind: prototype` WITHOUT signed exception | `RELEASE HALTED — UNVERIFIED (skipped-pr-without-prototype-exception)` — refuse VERIFIED. |
| No PRs found in ToRelease or GitHub | Skip Steps 1-3, proceed to version/tag (still subject to Strict-Only gates) |
| One PR has merge conflicts | Stop at that PR, report which merged / which remain |
| CI fails after merge | Stop before tagging, report. User fixes via follow-up PR or `/nacl-tl-hotfix`. |
| No CI configured | `RELEASE HALTED — UNVERIFIED (skipped-ci-without-prototype-exception)` unless covered by signed exception. |
| No production URL configured | `RELEASE HALTED — UNVERIFIED (no-production-url-without-exception)` unless covered by signed exception with `affected_gates: [missing-prod-golden-path]`. The Step 3b "skip and warn" path was removed in W4-blocking-release (project-beta health-only episode prevention). |
| No changes since last tag | Report "nothing to release" |
| Single PR release | Same flow, one PR in list |
| `--dry-run` flag | Show merge plan + version bump, no action |
| Session interrupted mid-merge | Resume from release-status.json, skip already-merged PRs |
| Neo4j unavailable (Step 7) | `RELEASE HALTED — UNVERIFIED (graph-stale)` — refuse VERIFIED. (Was: log warning, continue. Removed in W4-blocking-release per Project-Alpha stale-graph episode.) |
| Live graph differs from baseline (Step 7 pre-flight) | `RELEASE HALTED — UNVERIFIED (graph-stale)` — refuse VERIFIED. |
| `/nacl-sa-validate full` returns CRITICAL findings | `RELEASE HALTED — UNVERIFIED (sa-validate-critical)` — refuse VERIFIED. |
| Upstream `tl-sync` verdict is UNVERIFIED | `RELEASE HALTED — UNVERIFIED (upstream-sync-unverified)` — refuse VERIFIED. (W2.) |
| Upstream `tl-qa` aggregate is UNVERIFIED | `RELEASE HALTED — UNVERIFIED (upstream-qa-unverified)` — refuse VERIFIED. (W3.) |
| PROD_GOLDEN_PATH evidence missing on a UC where the W3 matrix marks it mandatory | `RELEASE HALTED — UNVERIFIED (missing-prod-golden-path)` — refuse VERIFIED. HEALTH_ONLY is NOT a substitute. |
| Feature PR: Task node missing in graph (Step 2 / 1a) | RELEASE HALTED — MISSING TASK NODE. Run /nacl-tl-diagnose. Do NOT fall back to status.json. |
| Fix PR: spec-changing fix with no accepted Decision (Step 2 / 1b) | RELEASE HALTED — UNRECORDED SPEC DRIFT. Run /nacl-tl-fix to record the Decision, or /nacl-tl-diagnose. (A fix PR is never halted for lacking a Task node.) |
| PR merged but UC was UNVERIFIED | Halt BEFORE merge. Ask user: "UC### is UNVERIFIED — merge to main without test coverage? [yes/no] Default: no". Never auto-merge UNVERIFIED. If user answers yes, merge proceeds with override note. |
| Any UC has REGRESSION status | RELEASE INCOMPLETE — REGRESSION. Do NOT merge, do NOT tag. |
| `NACL_EMERGENCY=1` + companion env vars set | Emergency mode: every Strict-Only gate refusal prints a banner, the run advances, the terminal Status: carries `(emergency-bypass)` suffix (NEVER VERIFIED), event recorded in `.tl/emergencies/`. See `nacl-tl-core/references/emergency-mode.md`. |
| All Strict-Only gates pass AND all UCs PASS | Proceed normally; RELEASE COMPLETE headline |

---

## Output

```
===============================================
  RELEASE COMPLETE
===============================================

Merge:
  PR   Title                              Method   UC status    Evidence level
  ---  ---------------------------------  -------  -----------  ---------------
  #42  feat: UC-028 Funnel event tracking squash   PASS         test-GREEN (regression test path: .tl/tasks/UC028/regression-test.md)
  #45  feat: UC-029 Scene prompt display  squash   PASS         test-GREEN (regression test path: .tl/tasks/UC029/regression-test.md)
  #46  feat: TECH-013 Docker Compose stack squash  PASS         verify-GREEN (verification record: .tl/tasks/TECH013/verification.md)

Deploy:
  CI: passed (4m 22s)
  Health: 200 OK (https://example.com/api/health)

Version: v1.3.0 (minor bump)
Tag: v1.3.0 (pushed)

Graph:
  IntakeItems stamped with v1.3.0: 3 nodes updated

Release: https://github.com/org/repo/releases/tag/v1.3.0

Changelog:
  2 features, 0 bug fixes

YouGile:
  Release notes posted
  Tasks closed: UC-028, UC-029

===============================================
```

**Per-UC evidence-level values** (populate from `t.verification_evidence` in the graph query from Step 2):

| Evidence level | Meaning |
|----------------|---------|
| `test-GREEN` | Regression test ran RED→GREEN; path recorded in graph |
| `verify-GREEN` | Infrastructure verification command re-ran cleanly post-change (Workflow B); verification record path recorded in graph. NOT a verification gap. |
| `test-UNVERIFIED` | Tests passed but no RED→GREEN artifact in graph |
| `no-test` | Legacy (pre-W4 graphs only): shipped under the since-removed user override |
| `unknown` | Graph node existed but `verification_evidence` field is null/empty |

Parsing: prefix `test-GREEN:` → `test-GREEN` (path extracted); prefix `verify-GREEN:` →
`verify-GREEN` (path extracted); literal `test-UNVERIFIED` / `no-test` → as-is;
null/empty/unrecognised → `unknown`.

If any UC in the merged set has evidence level `no-test` or `unknown`, append a footer line
(`verify-GREEN` does NOT trigger this footer):
```
Verification gaps: UC-029 (no-test), UC-031 (unknown) — review before next release.
```

**Excluded from release (UNVERIFIED upstream — Step 7):**

If the Step 7 excluded query returns any rows, append this section verbatim
to the final report:

```
Excluded from this release artifact (no IntakeItem stamped):
  IntakeItem  Underlying UC  UC status         Skip reason
  ----------  -------------  ----------------  -------------------------------
  FAM-58      UC-029         verified-pending  upstream-qa-unverified
  FAM-61      UC-031         blocked           upstream-sync-unverified

These items remain in the graph as 'delivered' but were NOT stamped with
the release version. Re-run /nacl-tl-deliver after restoring PASS status,
then re-run /nacl-tl-release for those items.
```

The pre-W4 skip-reason vocabulary (`deliver SKIP-VERIFY-FLAG`,
`deliver health failed (override)`) is no longer producible — those
flag-driven and override-driven exclusions were removed in
W4-blocking-release. Current exclusion reasons map to the
six Strict-Only block conditions documented above plus the
upstream verdict tokens (`upstream-sync-unverified`,
`upstream-qa-unverified`).

**Headline selection (P1 — `Status:` is the authoritative classifier):**

  RELEASE COMPLETE
    — every candidate UC PASS, every Strict-Only gate PASSED (or
      covered by a valid signed exception), health 200 OK, tag pushed.
  RELEASE COMPLETE — emergency-bypass
    — emergency mode invoked; one or more Strict-Only gates were
      bypassed under NACL_EMERGENCY=1; tag pushed; Status: carries
      (emergency-bypass) suffix; closed-set status is
      PARTIALLY_VERIFIED, never VERIFIED.
  RELEASE HALTED — UNVERIFIED (production health failed)
    — Step 3b health failed; tag NOT pushed. (No inline operator
      override exists post-W4; override paths are signed exception
      or emergency mode only.)
  RELEASE HALTED — UNVERIFIED (upstream-sync-unverified)
    — W2 upstream tl-sync verdict is UNVERIFIED.
  RELEASE HALTED — UNVERIFIED (upstream-qa-unverified)
    — W3 upstream tl-qa aggregate is UNVERIFIED.
  RELEASE HALTED — UNVERIFIED (graph-stale)
    — Step 7 pre-flight or query detected stale graph (Project-Alpha
      episode prevention).
  RELEASE HALTED — UNVERIFIED (sa-validate-critical)
    — `/nacl-sa-validate full` reported FAIL with CRITICAL findings.
  RELEASE HALTED — UNVERIFIED (missing-prod-golden-path)
    — PROD_GOLDEN_PATH evidence missing on a UC where the W3
      mandatory-stage matrix marks it mandatory (project-beta
      episode prevention; HEALTH_ONLY is not a substitute).
  RELEASE HALTED — UNVERIFIED (skipped-pr-without-prototype-exception)
    — direct-strategy release with no PR and `config.yaml` does
      NOT declare `project_kind: prototype` OR no signed exception
      covers `skipped-pr`.
  RELEASE HALTED — UNVERIFIED (skipped-ci-without-prototype-exception)
    — direct-strategy release with no CI and `config.yaml` does
      NOT declare `project_kind: prototype` OR no signed exception
      covers `skipped-ci`.
  RELEASE HALTED — UNVERIFIED
    — operator declined an UNVERIFIED-UC user gate at Step 2.
  RELEASE HALTED — MISSING TASK NODE
    — Step 2 / 1a feature-PR graph query found a UC with no Task node.
  RELEASE HALTED — UNRECORDED SPEC DRIFT
    — Step 2 / 1b fix PR changes behavior but no accepted Decision node
      backs it (and no L0/L1 code-only Fix-level marker explains it).
  RELEASE INCOMPLETE — REGRESSION
    — any UC has REGRESSION status.

If merge-only (no deploy verification configured):

```
===============================================
  RELEASE COMPLETE
===============================================

Merge:
  #42  feat: UC-028 — merged (squash)

Deploy:
  CI: no pipeline detected (skipped)
  Health: no production URL configured (skipped)

Version: v0.1.0 (minor bump)
Tag: v0.1.0 (pushed)

Graph:
  IntakeItems stamped with v0.1.0: 1 node updated

Release: https://github.com/org/repo/releases/tag/v0.1.0

===============================================
```

---

## References

- `config.yaml` → git strategy, merge method, deploy settings, yougile
- `.tl/changelog.md` — source for release notes
- `.tl/release-status.json` — release state (created by this skill)
- `config.yaml` → deploy.production.url — link in release notes
- `config.yaml` → yougile — for notifications and PR discovery
- `mcp__neo4j__write-cypher` → stamps IntakeItem nodes with release version (Step 7)

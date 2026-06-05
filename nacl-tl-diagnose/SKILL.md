---
name: nacl-tl-diagnose
model: opus
effort: high
description: |
  Project health diagnostic — analyzes git history, documentation drift,
  code health, and regression patterns. Produces DIAGNOSTIC-REPORT.md.
  Use when: everything is broken, need to understand what's happening,
  project health check, diagnose issues, or the user says "/nacl-tl-diagnose".
---

# TeamLead Project Diagnostic Skill

## Your Role

You are a **project health diagnostician**. When everything seems broken and nobody understands what's happening — you analyze the project systematically: git history, documentation state, code health, regression patterns. You produce a diagnostic report with actionable recommendations.

You do NOT fix anything. You diagnose and recommend which skill to run next.

## Key Principle: Data-Driven Diagnosis

```
Don't guess — measure.
Don't fix — diagnose.
Don't use one method — use parallel agents.
```

---

## Invocation

```
/nacl-tl-diagnose                              # full analysis (default: 7 days)
/nacl-tl-diagnose --since=5d                   # specific time period
/nacl-tl-diagnose --since=2026-03-21           # from specific date
/nacl-tl-diagnose --focus=interview            # focus on specific area
/nacl-tl-diagnose "nothing works after deploy" # with problem description
```

---

## Workflow: 4 Steps

### Step 1: DATA COLLECTION (3 parallel agents)

Launch 3 agents via Agent tool IN PARALLEL (single message):

#### Agent 1: Git Health

```
Project: [PROJECT_PATH]
Period: [--since or default 7d]

Collect:
1. git log --since=[date] --oneline --stat
   → Full list of commits with changed files

2. Classify each commit:
   - fix: message starts with "fix:" or contains "fix"
   - feat: "feat:" or "feature"
   - refactor: "refactor:"
   - docs: "docs:" or changes only in docs/
   - deploy: changes in .github/, deploy/, Dockerfile
   - merge: "Merge" or "merge:"
   - chore: everything else

3. Metrics:
   - Total commits
   - Fix-to-feature ratio (fix / feat)
   - Fix-to-total ratio (fix / total)

4. Regression signals:
   - Files with 3+ modifications in the period (hot files)
   - For each hot file: list of commits in chronological order
   - Regression chains: commit A fixes file X,
     commit B fixes file X again (distance < 5 commits)

5. Documentation sync:
   - Commits that change src/ but NOT docs/ or .tl/ (code-only fixes)
   - Commits that change BOTH src/ AND (docs/ or .tl/) (doc-synced commits)
   - Fix-to-Doc Ratio: (doc-synced fixes) / (total fixes)
   Note: "docs" includes both docs/ directory AND .tl/ task files

Return: JSON with metrics + hot files list + regression chains
```

#### Agent 2: Documentation Health

```
Project: [PROJECT_PATH]

Collect:
1. Last modification date for each file in docs/:
   git log -1 --format="%ai" -- [filepath]

2. .tl/status.json:
   - Incomplete tasks (status != "done")
   - Tasks with stale statuses (unchanged > 7 days)

3. .tl/changelog.md:
   - Last 10 entries
   - Are there entries for the current period?

4. Documentation lag:
   - For each UC in docs/14-usecases/:
     - Last modification date of UC-spec
     - Last modification date of related code files
     - Lag = code_date - doc_date (in days)

5. Doc stubs/placeholders:
   - Files in docs/ containing TODO, TBD, or placeholder text
   - Empty or very short (< 100 bytes) UC specs
   - UCs listed in _uc-index.md but missing their file

6. Graph staleness (first-class drift signal — read drift FROM the graph,
   not inferred from file dates). Via mcp__neo4j__read-cypher:
   MATCH (n) WHERE coalesce(n.review_status,'current')='stale'
   RETURN labels(n)[0] AS type, n.id AS id, n.stale_origin AS caused_by,
          n.stale_since AS since
   - Count stale nodes; bucket by stale_origin; note the oldest stale_since.
   - A non-empty result means an upstream change (UC/entity/endpoint) was made
     but its dependents (typically Tasks) were never re-synced via /nacl-tl-plan.
   - If Neo4j is unavailable, mark this probe unavailable (do not infer).

Return: JSON with doc ages, lag scores, stale items, placeholders, stale_nodes
```

#### Agent 3: Code Health

```
Project: [PROJECT_PATH]

Monorepo detection:
  Check for sub-projects by looking for package.json in immediate
  subdirectories (frontend/, backend/, packages/*, apps/*).
  If found, run build/test commands in EACH sub-project separately.
  If not found, run at project root.

Collect:
1. Build status:
   For each sub-project (or root):
     - Read the workspace's declared build command from
       `package.json.scripts.build` (or the closest declared equivalent for
       non-Node workspaces, e.g. `pyproject.toml` `tool.poetry.scripts`).
     - If declared, run the declared command and capture the last 20 lines:
         declared_build_cmd 2>&1 | tail -20
     - If `scripts.build` is undeclared:
         Record component status as `build: NO_INFRA (scripts.build undeclared)`.
         Do NOT fall back to `npm run build`, `make`, or any other invented
         command — emit `NO_INFRA` and continue with the next sub-project.
     - If the declared command exits non-zero with a parse/loader error
       (config missing, runner crash before any task runs):
         Record component status as `build: RUNNER_BROKEN (<reason>)`.
   Record: per sub-project, one of: `pass` / `fail` / `NO_INFRA` / `RUNNER_BROKEN`.

2. Test status:
   For each sub-project (or root):
     - Read the workspace's declared test command from
       `package.json.scripts.test` (or the closest declared equivalent).
     - If declared, run the declared command and capture the last 30 lines:
         declared_test_cmd 2>&1 | tail -30
       Record: total passed, total failed, which test files fail.
     - If `scripts.test` is undeclared:
         Record component status as `test: NO_INFRA (scripts.test undeclared)`.
         Do NOT fall back to `npm test` or any other invented command.
     - If the declared command runs but `tests_collected == 0` despite test
       files matching the runner's pattern, OR exits non-zero with a runner
       crash before collection:
         Record component status as `test: RUNNER_BROKEN (<reason>)`.

3. Stub markers scan:
   Search in src/ (excluding node_modules/, dist/, test files):
   - TODO, FIXME, HACK — count by severity
   - throw new Error("Not implemented")
   - as any (TypeScript)
   - console.log (in production code)
   - Placeholder data (Lorem ipsum, test@test.com)

4. TypeScript errors:
   - Read the workspace's declared typecheck command from
     `package.json.scripts.typecheck` (or `scripts.tsc`, `scripts.lint:types`).
   - If declared, run the declared command:
       declared_typecheck_cmd 2>&1 | tail -30
   - If undeclared:
       Record component status as `typecheck: NO_INFRA (no declared typecheck command)`.
       Do NOT fall back to `npx tsc --noEmit`.

5. Dependency health (if time permits):
   - Read the declared audit command (e.g. `scripts.audit`) if present;
     otherwise record `audit: NO_INFRA (no declared audit command)`. The
     skill MUST NOT invent `npm audit` if the workspace has not declared it.

Return: JSON with build/test/typecheck/audit status per sub-project. Each
component is one of: `pass` / `fail` / `NO_INFRA` / `RUNNER_BROKEN` —
never a synthetic measurement and never a 0.5 fill.
```

#### Agent 4 — Server Health (optional)

**Запускать только если** `config.yaml → vps` И `config.yaml → deploy` заполнены.

```
Collect:
1. Staging health: `curl -sf {deploy.staging.url}{deploy.staging.health_endpoint} --max-time 10`
2. Production health: `curl -sf {deploy.production.url}{deploy.production.health_endpoint} --max-time 10`
3. Если VPS SSH доступен (`vps.[env].ip` заполнен):
   - `ssh -i {ssh_key} {user}@{ip} "uptime; df -h /; free -m; pm2 status 2>/dev/null || docker ps 2>/dev/null"`
4. Сравнить с ожидаемым состоянием

Output metrics:
- staging_health: UP / DOWN / DEGRADED
- production_health: UP / DOWN / DEGRADED
- staging_disk_usage: percentage
- staging_memory_usage: percentage
- production_disk_usage: percentage
- production_memory_usage: percentage
```

---

### Step 1b: AGGREGATION (after all three agents return)

Wait for **all three agents** to complete before proceeding.

**On completion, evaluate each agent's output:**

```
For each agent result:
  - If the agent returned valid JSON with required fields → status: success
  - If the agent returned an error, empty output, or missing required fields → status: failed

Aggregate status:
  - All three succeeded → Data completeness: complete
  - One or more failed  → Data completeness: partial (Agent #N failed: <reason>)

Record this status in a variable COMPLETENESS_STATUS for inclusion in the final report.
```

**Partial-failure handling:**

```
IF Agent 1 failed:
  - git metrics, fix_ratio, regression_ratio, regression_chains → unavailable
  - Mark those metric rows as "N/A (git data unavailable)"

IF Agent 2 failed:
  - doc ages, doc lag, placeholders → unavailable
  - Mark those metric rows as "N/A (doc data unavailable)"

IF Agent 3 failed:
  - build_pass, test_pass_rate, stub counts → unavailable
  - Mark those metric rows as "N/A (code data unavailable)"

Proceed with analysis on whatever data IS available.
Do NOT abort the diagnostic — a partial report is better than no report.
```

---

### Step 2: ANALYSIS (main context)

Receive results from 3 agents. Aggregate:

#### 2.1 Metrics Calculation

Output the metrics table in the user's language. Example structure:

```
┌───────────────────────────────────────────────┐
│ PROJECT HEALTH METRICS                        │
├───────────────────────────────┬───────────────┤
│ Analysis period               │ [date - date] │
│ Total commits                 │ N             │
│ Fix commits                   │ N (X%)        │
│ Fix-to-Doc Ratio              │ X%            │
│ Hot files (3+ changes)        │ N files       │
│ Regression chains             │ N chains      │
│ Avg chain length              │ X commits     │
│ Max chain length              │ X commits     │
│ Documentation lag (avg)       │ X days        │
│ Doc placeholders              │ N files       │
│ Build status                  │ ✓/✗           │
│ Test status                   │ X passed / Y failed │
│ Stub markers                  │ C critical, W warning │
└───────────────────────────────┴───────────────┘
```

#### 2.2 Health Score (0-100)

**Variable definitions:**

```
fix_ratio        = fix_commits / total_commits           (0.0 – 1.0)
                   → not_assessable: git data unavailable  (if Agent 1 failed)

fix_to_doc_ratio = doc_synced_fixes / total_fixes        (0.0 – 1.0)
                   where "doc-synced" = commit touches both src/ and (docs/ or .tl/)
                   → not_assessable: git data unavailable  (if Agent 1 failed)

regression_ratio = fix_commits_in_regression_chains / total_fix_commits  (0.0 – 1.0)
                   where "in chain" = file was fixed 2+ times within 5 consecutive commits
                   → not_assessable: git data unavailable  (if Agent 1 failed)

build_pass       = 1 if ALL sub-project builds succeed, else 0
                   → not_assessable: code agent unavailable  (if Agent 3 failed)

test_pass_rate   = tests_passed / tests_total            (0.0 – 1.0)
                   → not_assessable: no test infra         (if Agent 3 reports "no tests configured" for ALL sub-projects)
                   → not_assessable: code agent unavailable  (if Agent 3 failed)
                   NOTE: do NOT substitute 0.5 — absence of tests is a distinct state,
                         not a neutral mid-point.
```

**Per-component score breakdown:**

```
Report each component individually:

  git_quality_component:
    fix_ratio_score    = (1 - fix_ratio) × 25         (or not_assessable)
    doc_sync_score     = fix_to_doc_ratio × 25         (or not_assessable)
    regression_score   = (1 - regression_ratio) × 20  (or not_assessable)

  build_component:
    build_score        = build_pass × 15               (or not_assessable)

  test_component:
    test_score         = test_pass_rate × 15           (or not_assessable: no test infra)

  server_component (if Agent 4 ran):
    server_health_score = (staging_up × 0.5 + production_up × 0.5) × 15
                          where UP=1.0, DEGRADED=0.5, DOWN=0.0
```

**Composite score rule:**

```
IF any component is not_assessable:
  - Do NOT produce a single health_score number.
  - Instead, produce a per-component breakdown table showing which
    components have scores and which are not_assessable.
  - State: "Composite score withheld — not all components are assessable."

IF all components are assessable:
  health_score =
    fix_ratio_score + doc_sync_score + regression_score
    + build_score + test_score
    [+ server modifier if Agent 4 ran:
       health_score = health_score × 0.85 + server_health_score]

  Interpretation:
    80-100: Healthy project
    60-79:  Needs attention (targeted fixes)
    40-59:  Serious problems (reconcile recommended)
    0-39:   Critical state (reconcile mandatory)
```

#### 2.3 Problem Clusters

**Grouping algorithm:**

1. Take all hot files (3+ modifications in period)
2. Group by the most specific shared directory or feature keyword:
   - Same directory path (e.g., `routes/interview-chat.ts` + `hooks/useInterviewChat.ts` → "interview" cluster)
   - Same feature keyword in filename (e.g., `auth`, `payment`, `session`)
   - Deploy/CI files (`.github/`, `deploy/`, `Dockerfile`) → always a separate cluster
3. If a file doesn't fit any cluster, assign to "other"
4. Sort clusters by total fix count (descending)

**For each cluster report:**
- Files in the cluster and their modification counts
- Total fix commits touching the cluster
- Number of regression chains within the cluster
- Docs coverage: which UC/spec files exist for this area, when last updated

#### 2.4 Root Cause Hypotheses

Formulate hypotheses based on metrics:

```
IF fix_to_doc_ratio < 10% AND regression_ratio > 30%:
  → Hypothesis: "Fixes without doc updates cause regression cycles"
    Required evidence: cite at least one regression chain where a hot file
    was fixed without a corresponding doc/spec commit (show commit SHAs).
    Without evidence → label as "candidate hypothesis (unverified)".

IF doc_lag > 7 days for hot files:
  → Hypothesis: "Documentation is outdated, AI assistant works from stale specs"
    Required evidence: cite at least one specific file where code_date > doc_date,
    showing the commit that drifted and the last doc-update commit (show SHAs and dates).
    Without evidence → label as "candidate hypothesis (unverified)".

IF stale_nodes is non-empty:
  → Hypothesis: "An upstream change was made but its dependents were never
    re-synced — the graph itself records the drift (review_status='stale')."
    This is stronger than file-date inference: the stamp names stale_origin and
    stale_since. Recommend /nacl-tl-plan (regenerates stale Tasks) or re-review of
    the flagged nodes. Closure (release/conductor) is already blocked while these
    persist (sa-validate L8 / release condition #7).

IF doc_placeholders > 3:
  → Hypothesis: "Parts of the system are unspecified, no source of truth"
    Required evidence: list the specific placeholder files found (filenames + line sample).
    Without evidence → label as "candidate hypothesis (unverified)".

IF build_fail OR test_fail:
  → Hypothesis: "Code doesn't build or tests fail — fix needed before diagnosis"
    Required evidence: include the specific error output excerpt (last 5 lines of
    build/test stderr) that confirms the failure.
    Without evidence → label as "candidate hypothesis (unverified)".

RULE: Every hypothesis emitted in the report MUST include its evidence block.
      A hypothesis with no supporting evidence MUST be labeled
      "candidate hypothesis (unverified)" rather than a confirmed finding.
```

---

### Step 3: TARGETED GAP-ANALYSIS (1-2 agents)

For the TOP-2 problem clusters, launch agents.

**Scope cap:** Analyze at most **5 hottest files per cluster** (by modification count). This prevents excessive context usage while still capturing the main discrepancies.

**Truncation warning:** If a cluster has more than 5 files, prepend the following line to that cluster's discrepancy list:

```
WARNING: Analyzed top-5 of N files in cluster "[CLUSTER_NAME]" — full analysis may reveal additional discrepancies.
```

(Replace N with the actual cluster file count.)

```
For cluster [NAME]:

1. Select top-5 files by modification count in the cluster
2. Read current code for these files
3. Read corresponding docs (UC, domain, screen specs)
   - If no docs exist for the area, note "MISSING: no spec for [area]"
4. For each file: compare code behavior vs docs description
5. Record specific discrepancies:
   - [DOC] file says: "X"
   - [CODE] file does: "Y"
   - [SEVERITY] critical / high / medium / low

Return: list of discrepancies with severity
```

---

### Step 4: DIAGNOSTIC REPORT

Generate `DIAGNOSTIC-REPORT.md` in the project root. Write the report in the user's language.

Report structure:

```markdown
# Diagnostic Report

**Project:** [name]
**Date:** [date]
**Period:** [since — now]
**Data completeness:** [complete | partial (Agent #N failed: reason)]
**Health Score:** [0-100 (interpretation)] OR **Score withheld — per-component breakdown below**

## 1. Metrics
[table from Step 2.1]

## 2. Regression Chains
[for each chain: commit A → commit B → commit C]

## 3. Problem Clusters
[for each cluster: files, fixes, docs coverage]

## 4. Discrepancies: docs vs code (top)
[from Step 3: specific "doc says X, code does Y"]
[IMPORTANT: for each discrepancy, include the doc file's last modified date
 so nacl-tl-reconcile can detect already-fixed items]

## 5. Root Cause Analysis
[hypotheses from Step 2.4]

## 6. Recommendations

### If Health Score >= 60:
- Targeted fixes via /nacl-tl-fix:
  1. /nacl-tl-fix "[problem description 1]"
  2. /nacl-tl-fix "[problem description 2]"

### If Health Score 40-59:
- /nacl-tl-reconcile --scope=[top cluster]
- Then targeted /nacl-tl-fix for the rest

### If Health Score < 40:
- /nacl-tl-reconcile (full)
- After reconcile: /nacl-tl-stubs --final
- Then /nacl-tl-qa for critical UCs
```

**Pre-finalize checklist** — before saving the file, verify every item below is present and non-empty. If any item is missing, fill it or explicitly mark it `N/A — data unavailable (reason)`:

```
[ ] Data completeness status (complete / partial — must appear at top of report)
[ ] Section 1: Metrics table — all rows present; unavailable rows marked N/A
[ ] Section 2: Regression Chains — present; "None found" is acceptable
[ ] Section 3: Problem Clusters — at least one entry, or "No hot files in period"
[ ] Section 4: Discrepancies — present; truncation warning included if cluster > 5 files
[ ] Section 5: Root Cause Analysis — every hypothesis has an evidence block or is
               labeled "candidate hypothesis (unverified)"
[ ] Section 6: Recommendations — present and tied to the actual health score or
               component breakdown
[ ] Health score or per-component breakdown — single number only if all components
    are assessable; otherwise per-component table with not_assessable labels
```

Only after all items are checked: present the report to the user and save as `DIAGNOSTIC-REPORT.md`.

---

## Output Language

Detect the user's language from:
1. The language of their invocation message (highest priority)
2. The `docs/` content language (if invocation is ambiguous)
3. Default to English if unclear

Write the DIAGNOSTIC-REPORT.md in the detected language. Internal agent prompts remain in English regardless.

---

## Output Artifact

File: `DIAGNOSTIC-REPORT.md` in the project root.

This file is used by:
- `/nacl-tl-reconcile` — as input for Phase 1
- The user — for understanding the project state
- History — for before/after comparison across reconcile runs

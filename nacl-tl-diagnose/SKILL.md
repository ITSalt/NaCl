---
name: nacl-tl-diagnose
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

Return: JSON with doc ages, lag scores, stale items, placeholders
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
     cd [sub-project] && npm run build 2>&1 | tail -20
   Record: which sub-projects pass, which fail

2. Test status:
   For each sub-project (or root):
     cd [sub-project] && npm test 2>&1 | tail -30
   Record: total passed, total failed, which test files fail
   If no test script exists for a sub-project, note "no tests configured"

3. Stub markers scan:
   Search in src/ (excluding node_modules/, dist/, test files):
   - TODO, FIXME, HACK — count by severity
   - throw new Error("Not implemented")
   - as any (TypeScript)
   - console.log (in production code)
   - Placeholder data (Lorem ipsum, test@test.com)

4. TypeScript errors:
   npx tsc --noEmit 2>&1 | tail -30

5. Dependency health (if time permits):
   npm audit --json 2>&1 | head -50

Return: JSON with build/test status, stub counts, TS errors, audit summary
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
fix_to_doc_ratio = doc_synced_fixes / total_fixes        (0.0 – 1.0)
                   where "doc-synced" = commit touches both src/ and (docs/ or .tl/)
regression_ratio = fix_commits_in_regression_chains / total_fix_commits  (0.0 – 1.0)
                   where "in chain" = file was fixed 2+ times within 5 consecutive commits
build_pass       = 1 if ALL sub-project builds succeed, else 0
test_pass_rate   = tests_passed / tests_total            (0.0 – 1.0)
                   if no tests exist, use 0.5 (neutral)
```

**Formula:**

```
health_score =
  (1 - fix_ratio) × 25              # Fewer fixes = better
  + fix_to_doc_ratio × 25           # More doc-synced fixes = better
  + (1 - regression_ratio) × 20     # Fewer regressions = better
  + build_pass × 15                 # Build passes = 15 pts
  + test_pass_rate × 15             # Proportional: 100% pass = 15, 50% = 7.5

If Agent 4 ran (server health available):
  server_health_score = (staging_up × 0.5 + production_up × 0.5)  (0.0 – 1.0)
                        where UP=1.0, DEGRADED=0.5, DOWN=0.0
  Apply modifier: health_score = health_score × 0.85 + server_health_score × 15

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
  → "Fixes without doc updates cause regression cycles"

IF doc_lag > 7 days for hot files:
  → "Documentation is outdated, AI assistant works from stale specs"

IF doc_placeholders > 3:
  → "Parts of the system are unspecified, no source of truth"

IF build_fail OR test_fail:
  → "Code doesn't build or tests fail — fix needed before diagnosis"
```

---

### Step 3: TARGETED GAP-ANALYSIS (1-2 agents)

For the TOP-2 problem clusters, launch agents.

**Scope cap:** Analyze at most **5 hottest files per cluster** (by modification count). This prevents excessive context usage while still capturing the main discrepancies.

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
**Health Score:** [0-100] ([interpretation])

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

Present the report to the user and save as `DIAGNOSTIC-REPORT.md`.

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

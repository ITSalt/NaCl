---
name: nacl-tl-deploy
model: sonnet
effort: low
description: |
  Monitor CI/CD deployment (GitHub Actions), run health checks, update YouGile.
  Deployment is triggered by git push (nacl-tl-ship), this skill monitors the result.
  Use when: deploy, check deploy status, verify deployment,
  or the user says "/nacl-tl-deploy".
---

## Contract

**Inputs this skill consumes:**
- Commit SHA being deployed
- Prior verification status by SHA (from graph or status.json, six-status vocabulary)
- CI pipeline status (GitHub Actions)
- Health-check results

**Outputs this skill produces:**
- Headline one of: DEPLOY COMPLETE / DEPLOY HALTED — REGRESSION /
  DEPLOY HALTED — {NO_INFRA | RUNNER_BROKEN | UNVERIFIED | BLOCKED}
- Health-failure halts the pipeline rather than report-and-continue

**Downstream consumers of this output:**
- Human user
- nacl-tl-deliver (for staging) / nacl-tl-release (for production)

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

# TeamLead Deploy — Monitor + Verify + YouGile

## Your Role

You **monitor** deployments triggered by CI/CD pipelines (GitHub Actions) and verify they succeed. You do NOT trigger deploys directly — that happens via git push in `/nacl-tl-ship`. You watch the CI/CD pipeline, run health checks, and update YouGile.

## Key Principle

```
Deploy is triggered by push (nacl-tl-ship does this).
This skill MONITORS the result and verifies health.
If health check fails → alert + suggest rollback.
```

---

## Invocation

```
/nacl-tl-deploy --staging              # monitor staging deploy (feature branch push)
/nacl-tl-deploy --production           # monitor production deploy (main branch push)
/nacl-tl-deploy --watch                # watch currently running pipeline/workflow
```

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| Staging URL | config.yaml → deploy.staging.url |
| Production URL | config.yaml → deploy.production.url |
| Health endpoint | config.yaml → deploy.[env].health_endpoint (fallback: `/api/health`) |
| YouGile done column | config.yaml → yougile.columns.done |
| VPS staging | `config.yaml → vps.staging` (ip, user, ssh_key) — SSH-диагностика при сбое health-check |
| VPS production | `config.yaml → vps.production` (ip, user, ssh_key) — аналогично |

If deploy section missing → error (cannot monitor deployment without URL).
If YouGile missing → skip task moves, report locally.

---

## Workflow: 5 Steps

### Step 0: PLATFORM DETECTION

Detect CI/CD platform from the project:

1. Check `config.yaml → deploy.ci_platform` (if set, use it)
2. Check for `.github/workflows/` directory → **GitHub Actions** (use `gh`)
3. If neither → error: no CI/CD platform detected

| Platform | CLI | List runs | Watch run | View logs |
|----------|-----|-----------|-----------|-----------|
| GitHub Actions | `gh` | `gh run list` | `gh run watch` | `gh run view --log-failed` |

### Step 1: IDENTIFY DEPLOYMENT

0. **Pre-monitor verification gate:**

   Before monitoring any pipeline, confirm the code being deployed came from
   tasks with verified development status. Read from graph or status.json:

   ```cypher
   // Find tasks associated with the commit SHA being deployed
   MATCH (t:Task)
   WHERE t.commit = $commitSha
   RETURN t.id AS task_id, t.status AS status
   ```

   Or read `.tl/status.json` and `.tl/conductor-state.json` to find tasks
   associated with the branch/commit being deployed.

   | Task status | Deploy action |
   |-------------|--------------|
   | done (PASS) | Proceed with deployment monitoring |
   | verified-pending (UNVERIFIED) | HALT: "Deploying code from task with UNVERIFIED dev status. No test exercises the change. Confirm deploy? [yes/no] Default: no". If confirmed → continue with DEPLOY HALTED — UNVERIFIED in report if health fails. If not confirmed → DEPLOY HALTED — UNVERIFIED |
   | blocked | Same gate as UNVERIFIED |
   | failed / REGRESSION | HALT immediately: DEPLOY HALTED — REGRESSION. Do NOT proceed |
   | Not found in graph | Warn and proceed (backward-compat) |

1. Read `config.yaml → deploy` for target environment config
2. Check CI/CD pipeline status:
   ```bash
   gh run list --limit 5 --json status,conclusion,headBranch,createdAt
   ```
3. Find the most recent pipeline/workflow run for the target branch
4. If no run found → report "no deployment in progress"

### Step 2: MONITOR PIPELINE

Watch the CI/CD pipeline until completion:

```bash
gh run watch [run-id] --exit-status
```

Report progress:
- "Pipeline started: build step..."
- "Running tests..."
- "Deploying to server..."
- "Pipeline complete"

If pipeline fails:
- Read logs: `gh run view [run-id] --log-failed`
- Report failure reason to user
- Suggest: "Fix the issue, then re-push with /nacl-tl-ship"
- If YouGile → move task to Reopened with failure details

### Step 3: HEALTH CHECK

After pipeline succeeds:

1. Read health endpoint from config: `config.yaml → deploy.[env].health_endpoint`
2. Read deploy URL: `config.yaml → deploy.[env].url`
3. Wait 10 seconds for server to restart
4. Run health check:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" [url][health_endpoint]
   ```
5. If 200 → PASS. Read response body for version info:
   ```bash
   curl -s [url][health_endpoint] | jq '.'
   ```
6. If not 200 → retry 3 times with 10s intervals
7. If still failing → HALT the pipeline. Do NOT continue to YouGile update or
   next deployment step. Report: DEPLOY HALTED — health check failed.
   The health failure signals that the deployment is broken; reporting success
   or partial success and continuing is a lie.
8. Если health endpoint не отвечает и `config.yaml → vps.[env]` заполнен:
   1. SSH-диагностика: `ssh -i {ssh_key} {user}@{ip}`
   2. Проверить процессы: `pm2 status` / `docker ps`
   3. Проверить логи: `journalctl -u app --since '5m ago'` / `docker logs --since 5m`
   4. Проверить ресурсы: `df -h`, `free -m`
   5. Включить результат в отчёт о сбое
   6. HALT pipeline with diagnostic report. Do NOT proceed to Step 4 success path.

### Step 4: YOUGILE UPDATE + REPORT

The report opens with a per-task status table — one row per deployed commit
SHA — containing: SHA, source-task ID, source-task verification status (read
in Step 1.0), CI status, health status, and the aggregated DEPLOY headline.
Per-task verification status is required in every report; this is the single
source of truth that downstream readers consume.

**On success (pipeline passed AND health check passed):**
- Move task to Done (if --production) or ToRelease (if --staging)
- Post deploy confirmation to task chat:
  ```
  Deployed to [staging/production]

  URL: https://example.com
  Health: 200 OK
  Version: 1.2.3
  Commit: abc1234
  Time: 2m 15s

  Next: /nacl-tl-release (for production deploys)
  ```
- Headline: DEPLOY COMPLETE

**On pipeline failure (Step 2):**
- Move task to Reopened
- Post failure details to task chat
- Suggest: check logs, fix, re-push
- Headline: DEPLOY HALTED — REGRESSION (if new failures introduced)
  or DEPLOY HALTED — {NO_INFRA | RUNNER_BROKEN} as appropriate

**On health check failure (Step 3):**
- Pipeline halted (Step 3.7 — see above); do NOT reach this step's success path
- Move task to Reopened with health failure details
- Headline: DEPLOY HALTED — health check failed

**On pre-monitor gate halt (Step 1.0):**
- Do NOT update YouGile to Done
- Post advisory with status detail
- Headline: DEPLOY HALTED — UNVERIFIED / DEPLOY HALTED — REGRESSION

**Without YouGile:** Just report locally with headline.

---

## CI/CD Pipeline Templates

GitHub Actions uses workflow files in `.github/workflows/`. Templates are in `nacl-tl-core/templates/`:
- `deploy-backend.yml` — backend build + deploy
- `deploy-frontend.yml` — frontend build + deploy

These are created during project setup by `/nacl-tl-dev TECH-001` (infrastructure task) or by `/nacl-init`.

---

## References

- `config.yaml` → deploy section (URLs, health endpoints)
- `nacl-tl-ship/SKILL.md` — triggers the deploy via push
- `nacl-tl-release/SKILL.md` — follows after successful production deploy

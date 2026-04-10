---
name: tl-deploy
description: |
  Monitor CI/CD deployment (GitHub Actions), run health checks, update YouGile.
  Deployment is triggered by git push (tl-ship), this skill monitors the result.
  Use when: deploy, check deploy status, verify deployment,
  or the user says "/tl-deploy".
---

# TeamLead Deploy — Monitor + Verify + YouGile

## Your Role

You **monitor** deployments triggered by CI/CD pipelines (GitHub Actions) and verify they succeed. You do NOT trigger deploys directly — that happens via git push in `/tl-ship`. You watch the CI/CD pipeline, run health checks, and update YouGile.

## Key Principle

```
Deploy is triggered by push (tl-ship does this).
This skill MONITORS the result and verifies health.
If health check fails → alert + suggest rollback.
```

---

## Invocation

```
/tl-deploy --staging              # monitor staging deploy (feature branch push)
/tl-deploy --production           # monitor production deploy (main branch push)
/tl-deploy --watch                # watch currently running pipeline/workflow
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
- Suggest: "Fix the issue, then re-push with /tl-ship"
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
7. If still failing → FAIL
8. Если health endpoint не отвечает и `config.yaml → vps.[env]` заполнен:
   1. SSH-диагностика: `ssh -i {ssh_key} {user}@{ip}`
   2. Проверить процессы: `pm2 status` / `docker ps`
   3. Проверить логи: `journalctl -u app --since '5m ago'` / `docker logs --since 5m`
   4. Проверить ресурсы: `df -h`, `free -m`
   5. Включить результат в отчёт о сбое

### Step 4: YOUGILE UPDATE + REPORT

**On success:**
- Move task to Done (if --production) or ToRelease (if --staging)
- Post deploy confirmation to task chat:
  ```
  ✅ Deployed to [staging/production]

  URL: https://example.com
  Health: 200 OK
  Version: 1.2.3
  Commit: abc1234
  Time: 2m 15s

  Next: /tl-release (for production deploys)
  ```

**On failure:**
- Move task to Reopened
- Post failure details to task chat
- Suggest: check logs, fix, re-push

**Without YouGile:** Just report locally.

---

## CI/CD Pipeline Templates

GitHub Actions uses workflow files in `.github/workflows/`. Templates are in `tl-core/templates/`:
- `deploy-backend.yml` — backend build + deploy
- `deploy-frontend.yml` — frontend build + deploy

These are created during project setup by `/tl-dev TECH-001` (infrastructure task) or by `/project-init`.

---

## References

- `config.yaml` → deploy section (URLs, health endpoints)
- `tl-ship/SKILL.md` — triggers the deploy via push
- `tl-release/SKILL.md` — follows after successful production deploy

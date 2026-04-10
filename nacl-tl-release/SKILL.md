---
name: nacl-tl-release
description: |
  Version bump, git tag, changelog aggregation, release notes, YouGile notification.
  Run after successful production deployment.
  Use when: create release, bump version, generate release notes, tag version,
  or the user says "/nacl-tl-release".
---

# TeamLead Release — Version + Changelog + Notify

## Your Role

You finalize a release after successful production deployment: bump version, create git tag, aggregate changelog into release notes, and notify stakeholders via YouGile.

## Key Principle

```
Release happens AFTER successful deploy, not before.
Version follows SemVer. Changelog comes from .tl/changelog.md.
```

---

## Invocation

```
/nacl-tl-release                       # auto-detect version bump from changelog
/nacl-tl-release --minor               # force minor version bump
/nacl-tl-release --major               # force major version bump
/nacl-tl-release --patch               # force patch version bump
```

### Configuration Resolution

**IMPORTANT:** Read `config.yaml` first for all settings. Fall back to defaults if missing.

| Data | Source priority (check in order, use first found) |
|------|--------------------------------------------------|
| Production URL | `deploy.production.url` > no default |
| Health endpoint | `deploy.production.health_endpoint` > fallback `"/api/health"` |
| YouGile done column | `yougile.columns.done` |

If config.yaml missing → use all fallback defaults. If YouGile missing → skip task moves.

---

## Workflow: 5 Steps

### Step 1: DETERMINE VERSION BUMP

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

### Step 2: AGGREGATE CHANGELOG

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

### Step 3: CREATE GIT TAG

```bash
git tag -a v1.3.0 -m "Release v1.3.0 — Analytics Funnel Dashboard"
git push origin v1.3.0
```

### Step 4: CREATE GITHUB RELEASE (optional)

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

### Step 5: YOUGILE NOTIFICATION

If YouGile configured:

1. Post release notes to the board (or a dedicated channel task):
   ```
   🎉 Release v1.3.0 — Analytics Funnel Dashboard

   Features:
   - Funnel event tracking (UC-028)
   - Admin dashboard (UC-029)

   Bug Fixes:
   - Session ID resolution
   - Dexie store sync

   Deployed: https://example.com
   Tag: v1.3.0
   ```

2. Move all feature tasks to Done (if not already)

3. Close parent UserRequest cards (if all subtasks are Done)

---

## Output

```
═══════════════════════════════════════════════
  RELEASE COMPLETE
═══════════════════════════════════════════════

Version: v1.3.0 (minor bump)
Tag: v1.3.0 (pushed)
Release: https://github.com/org/repo/releases/tag/v1.3.0

Changelog:
  2 features, 2 bug fixes, 1 infrastructure change

YouGile: release notes posted
Tasks closed: UC-028, UC-029

═══════════════════════════════════════════════
```

---

## References

- `.tl/changelog.md` — source for release notes
- `config.yaml` → deploy.production.url — link in release notes
- `config.yaml` → yougile — for notifications

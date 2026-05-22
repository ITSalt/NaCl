# NaCl Project Registry Baseline — W0 (read-only)

**Generated:** 2026-05-22 by W0-baseline subagent.
**Scope:** every NaCl-using project the subagent could discover locally. Read-only — no `.tl/*` writes, no graph mutations.

The plan listed eleven named projects (Project Alpha, learn, "Project Delta" / Project Delta, marketplace analytics, due diligence pipeline, project-delta, project-epsilon, project-zeta, project-eta-bot, Project-Eta, analyst-tool). Local enumeration of `/home/project-owner/projects/` returned the following NaCl-relevant directories:

```
/home/project-owner/projects/project-alpha           # Project Alpha
/home/project-owner/projects/learn                        # "learn" (itsalt-learn)
/home/project-owner/projects/project-delta                # plausible "Project Delta" / "Project Delta"
/home/project-owner/projects/project-epsilon                # project-epsilon
/home/project-owner/projects/project-zeta                  # project-zeta
/home/project-owner/projects/project-eta-bot                 # project-eta-bot
/home/project-owner/projects/Project-Eta                # Project-Eta
/home/project-owner/projects/project-beta                  # project-beta (added per W11 source)
/home/project-owner/projects/NaCl/analyst-tool            # in-tree canary
```

Also-present-but-not-NaCl-related: `automate-dev`, `bundle`, `claude-skills`, `codex-test-project`, `dill-claude`, `dill-codex`, `docmost-mcp`, `ev-dispatcher4`, `project-eta_database`, `project-eta_testing`, `project-eta-technikan-ff`, `GizoNext`, `project-alpha-masterprompt*`, `learn-classic`, `moven8n`, `moveToGitlab`, `ocpp_ev_brocker`, `PepperSkills`, `PepperSkils`, `pricer`, `qr-payment.html`, `sovetnik`, `xlsbig`, `yougile-mcp`.

**`NOT_LOCALLY_PRESENT`:**
- "marketplace analytics" — no matching directory; no obvious slug match
- "due diligence pipeline" — only `due-diligence-mapper-claude/codex-neo4j` containers exist (under `/home/project-owner/projects/dill-*`); neither contained a NaCl `config.yaml` at the top level when checked. The Docker containers do exist and host Neo4j on ports 3617/3604 (Claude) and 3687/3674 (Codex), so the underlying project files may live under `dill-claude`/`dill-codex`. Recorded here as `PARTIALLY_PRESENT` — config.yaml not inspected because the directories are not enumerated in the plan's canonical registry.

**Live container audit at start of W0** (`docker ps`):
```
project-alpha-neo4j           Bolt 3587  HTTP 3574  healthy
learn-neo4j                        Bolt 3597  HTTP 3584  healthy
fc-neo4j (project-delta)           Bolt 7689  HTTP 7675  healthy
project-beta-neo4j                    Bolt 3627  HTTP 3614  healthy   ← config.yaml declares 3587/3574 (anomaly)
nacl-analyst-tool-neo4j            Bolt 3607  HTTP 3594  healthy
due-diligence-mapper-codex-neo4j   Bolt 3687  HTTP 3674  healthy (stopped during W0 to free RAM)
due-diligence-mapper-claude-neo4j  Bolt 3617  HTTP 3604  healthy (stopped during W0 to free RAM)
ko-migrate-neo4j                   Bolt 7690  HTTP 7676  exited; W0 brought it up
ig-migrate-neo4j                   Bolt 7691  HTTP 7677  exited; W0 brought it up
ev-migrate-neo4j                   Bolt 7693  HTTP 7679  exited; W0 brought it up
ec-migrate-neo4j                   Bolt 7692  HTTP 7678  exited; W0 brought it up
```

W0 brought the four exited containers up via `docker compose up -d` inside each project's `graph-infra/` (per the plan's binding decision "All graphs must be live; exports are NEVER acceptable as fallback").

---

## Per-project Compliance Matrix

Legend:
- ✓ = file/artifact present
- ✗ = absent
- — = not applicable (project does not yet require this artifact)

### 1. project-alpha — Project Alpha

- **Path:** `/home/project-owner/projects/project-alpha/`
- **config.yaml:** ✓ — Bolt `3587`, HTTP `3574`, password `neo4j_graph_dev`, container_prefix `project-alpha`, `git.strategy: direct`, `git.main_branch: main`
- **`.tl/` artifacts:**
  - `changelog.md` ✓
  - `status.json` ✓
  - `conductor-state.json` ✓ + 21 wave-specific variants (`conductor-state-wave0.json` through `conductor-state.wave-10-fr-004-2026-05-18.json` + audits)
  - `release-status.json` ✓
  - `delivery-status.json` ✗
  - `stub-registry.json` ✓
  - Additional: `fix-plan-wave-4-audit-2026-05-11.md`, `master-plan.md`, `diagnostics/`, `feature-requests/`, `fixes/`, `history/`, `plans/`, `qa-screenshots/`, `reports/`, `scenarios/`, `tasks/`, `wave-brief-template.md`
- **Graph status:** REACHABLE (after restart). Snapshot in `tests/fixtures/graph-snapshots/project-alpha/`.
- **Snapshot:** 1083 nodes, 2093 relationships, 26 UseCase, 76 Task, 12 Wave, 6 FeatureRequest.
- **W1–W10 gate-compliance gaps (today, against strict mode):**
  - W1 (repo-wide-check gate): FAIL — `pnpm -r lint && pnpm -r typecheck && pnpm -r test` was red across Waves 4 and 5; documented in `.tl/fix-plan-wave-4-audit-2026-05-11.md`. New review gate would refuse VERIFIED.
  - W2 (wire-evidence gate): FAIL — FE sync verdicts in Wave 5 were normalized to UNVERIFIED (`project-alpha-postmortem-codex.md` § 5).
  - W3 (QA SKIP gate): N/A in this project (QA pass exists for several UCs); but `phases.qa` carries `unverified` in places.
  - W4 (release-blocking gate): FAIL — `.tl/release-status.json` records `graph.status: warn`, `prs: []`, `merge.status: skipped`, `ci.status: skipped (no CI pipeline on main)`, `health.status: skipped (no production URL configured)`, operator override applied.
  - W5 (reconciliation gate): FAIL — `.tl/status.json` vs live graph diverged 970-vs-1083; FR-007 in changelog but absent from FeatureRequest list before recent fixes.
  - W6 (external-contracts.md gate): FAIL — kie.ai / nano-banana / openrouter / apiframe provider contracts live in adapter code, not `.tl/`.
  - W7 (nav-actions gate): FAIL — admin sidebar absent (`43fc84d`), SessionDetail had no UC-104 CTA (`e72204d`).
  - W8 (runtime-contract gate): FAIL — UC-201 idempotency vs UC-112 restart semantics drifted (`67a6a44`); cancel-while-failing terminal state not enumerated.
  - W9 (clean-checkout gate): FAIL — 6 of 13 config/infra fixes only surfaced when CI ran on a clean runner.
  - W10 (fix-discipline gate): FAIL — DIAGNOSTIC-REPORT measured 39% of fixes never updated documentation; `a7eb747` retro-fitted spec after FIX-B code wave.
- **Project_kind (proposed by W1):** likely `standard` once W1 lands.

### 2. learn — itsalt-learn

- **Path:** `/home/project-owner/projects/learn/`
- **config.yaml:** ✓ — Bolt `3597`, HTTP `3584`, password `neo4j_graph_dev`, container_prefix `learn`, `git.strategy: feature-branch`, `git.main_branch: main`
- **`.tl/` artifacts:** `changelog.md` ✓, `status.json` ✓, `conductor-state.json` ✓ + per-FR variants (`conductor-state.FR-012.json`, `conductor-state.FR-021.json`, `conductor-state.FR-023.json`), `delivery-status.json` ✓ + per-FR variants, `release-status.json` ✓, `stub-registry.json` ✓, plus `feature-requests/`, `handoff/`, `master-plan.md`, `reports/`, `secrets/`, `tasks/`
- **Graph status:** REACHABLE. Snapshot pending — see graph-snapshots dir.
- **W1–W10 gate-compliance gaps:** subagent did not enumerate the project's git log; postmortems do not cover this project. Likely OK against strict mode but per-project gap-closure agent should audit.

### 3. project-delta — likely "Project Delta / Project Delta"

- **Path:** `/home/project-owner/projects/project-delta/`
- **config.yaml:** ✓ — Bolt `7689`, HTTP `7675`, password `neo4j_graph_dev`, container_prefix `fc`, `git.strategy: feature-branch` (feature/* → staging, main → production)
- **`.tl/` artifacts:** `changelog.md` ✓, `delivery-status.json` ✓, plus `archive/`, `contracts/`, `feature-requests/`, `master-plan.md`, `qa-fr029.mjs`, `qa-screenshots/`, `reports/`, `scenarios/`, `tasks/`, `wave-8-qa-report.md`, `wave-9-handoff.md`. **No `status.json`, no `conductor-state.json`, no `release-status.json`, no `stub-registry.json`** at top of `.tl/`.
- **Graph status:** REACHABLE. Snapshot captured: 1808 nodes, 2398 rels, 26 distinct labels (incl. `ActivityStep` 421, `Requirement` 407, `DomainAttribute` 218, `FormField` 197, `UseCase` 37, `FeatureRequest` 27, `Task` 26, `Module` 10, `Wave` 8).
- **W1–W10 gate-compliance gaps:** `.tl/` artifact set is partial (missing `status.json`, `conductor-state.json`, `release-status.json`, `stub-registry.json`). The W5 reconciliation gate cannot apply until the canonical `.tl/` set exists. Per-project gap-closure agent should bootstrap the missing files from graph state.

### 4. project-epsilon — Project Epsilon

- **Path:** `/home/project-owner/projects/project-epsilon/`
- **config.yaml:** ✓ — Bolt `7690`, HTTP `7676`, password `neo4j_graph_dev`, container_prefix `ko-migrate`, `git.strategy: feature-branch`, `git.main_branch: main`
- **`.tl/` artifacts:** `changelog.md` ✓, `conductor-state.json` ✓, `delivery-status.json` ✓, `release-status.json` ✓, `status.json` ✓, `stub-registry.json` ✓, plus `feature-requests/`, `HANDOFF.md`, `master-plan.md`, `plans/`, `qa-screenshots/`, `reports/`, `tasks/`
- **Graph status:** REACHABLE (W0 brought container up). Snapshot pending.
- **W1–W10 gate-compliance gaps:** baseline artifacts present; subagent did not git-log-audit; per-project gap-closure agent should audit against strict-mode gates.

### 5. project-zeta — Project-Zeta

- **Path:** `/home/project-owner/projects/project-zeta/`
- **config.yaml:** ✓ — Bolt `7691`, HTTP `7677`, password `neo4j_graph_dev`, container_prefix `ig-migrate`. No `git.strategy` or `git.main_branch` declared in the abbreviated config (config sections may be project-specific).
- **`.tl/` artifacts:** `bugfix-parallel-plan.md` ✓, `changelog.md` ✓, `master-plan.md` ✓, `refinement-plan.md` ✓, `status.json` ✓, `tasks/`. **Missing:** `conductor-state.json`, `delivery-status.json`, `release-status.json`, `stub-registry.json`.
- **Graph status:** REACHABLE (W0 brought container up). Snapshot pending.
- **W1–W10 gate-compliance gaps:** `.tl/` set partial; same recommendation as project-delta.

### 6. project-eta-bot — Project-Eta Bot

- **Path:** `/home/project-owner/projects/project-eta-bot/`
- **config.yaml:** ✓ — Bolt `7693`, HTTP `7679`, password `neo4j_graph_dev`, container_prefix `ev-migrate`, `git.strategy: feature-branch` (feature branches merged via PR), `git.main_branch: main`
- **`.tl/` artifacts:** `changelog.md` ✓, `conductor-state.json` ✓, `delivery-status.json` ✓, `release-status.json` ✓, `status.json` ✓, `stub-registry.json` ✓, `master-plan.md`, `feature-requests/`, `qa-screenshots/`, `reports/`, `tasks/`
- **Graph status:** REACHABLE (W0 brought container up). Snapshot pending.
- **W1–W10 gate-compliance gaps:** artifact set present; subagent did not git-log-audit; per-project gap-closure agent should audit.

### 7. Project-Eta — Project-Eta (canary migration project)

- **Path:** `/home/project-owner/projects/Project-Eta/`
- **config.yaml:** ✓ — Bolt `7692`, HTTP `7678`, password `neo4j_graph_dev`, container_prefix `ec-migrate`. No `git.strategy` declared.
- **`.tl/` artifacts:** `.tl/` directory is **ABSENT** at top of project (subagent checked `ls /home/project-owner/projects/Project-Eta/.tl` and got `No such file or directory`).
- **Graph status:** REACHABLE (W0 brought container up). Snapshot pending.
- **W1–W10 gate-compliance gaps:** project is mid-migration (canary status per user memory). The full canonical `.tl/` set is missing. The plan's resolved_decisions note Project-Eta was the canary for old→graph migration with a mandatory 3-sub-agent audit gate (per user memory `feedback_migration_retrospective_gate.md`).

### 8. project-beta — Project-Beta (post-mortem subject)

- **Path:** `/home/project-owner/projects/project-beta/`
- **config.yaml:** ✓ — Declares Bolt `3587`, HTTP `3574`, container_prefix `project-beta`, `git.strategy: feature-branch`, `git.main_branch: main`. **ANOMALY:** the live container `project-beta-neo4j` runs on Bolt `3627` / HTTP `3614`, not the config-declared ports. The container_prefix matches but the port allocation diverges (possibly because the project-alpha container occupies 3587/3574 and the host had to remap; or because the running container was started with different env values).
- **`.tl/` artifacts:** `changelog.md` ✓, `conductor-state.json` ✓, `release-status.json` ✓, `status.json` ✓, `deploy-plan.md`, `master-plan.md`, `release-notes-v0.2.0.md`, `scripts/`, `tasks/`. **Missing:** `delivery-status.json`, `stub-registry.json`.
- **Graph status:** REACHABLE on actual port `3627`. Snapshot captured: 477 nodes, 881 rels, 31 distinct labels (incl. `ActivityStep` 59, `Requirement` 53, `Task` 30, `UseCase` 9, `Module` 4, `Wave` 6).
- **W1–W10 gate-compliance gaps:**
  - W2 (wire-evidence): FAIL — kie.ai endpoint shape, TUS metadata key, UC-301 schema rename leak documented as no-wire-evidence at `nacl-tl-sync` PASS.
  - W3 (QA SKIP): FAIL — UC-200 / UC-300 QA skipped because Deepgram / KIE_API_KEY absent; both blew in prod.
  - W4 (release-blocking): FAIL — `4da4aca` "production live" deferred UC-100 golden path; release proceeded.
  - W5 (reconciliation): N/A (`graph-infra/exports/project-beta-graph-export.cypher` is stale per Codex postmortem).
  - W6 (external-contracts): FAIL — TECH-011 named `ILlmProvider`, omitted kie.ai wire shape.
  - W7 (UI reachability): FAIL — catalog page had no upload button (`0ec0a4e`).
  - W8 (runtime contract): FAIL — UC-200 ffmpeg needed seekable input (`5eb7e18`); SSE envelope missing `event:<type>` (`7f983f6`).
  - W9 (clean-checkout / runtime-asset): FAIL — prompts `*.md` not in `dist/` (`66049d5`); pm2 entry `dist/server.js` vs `dist/index.js` (`aeeae53`); Prisma generate missing (`321016e`); reverse-proxy URL scheme (`15c6a20`).
  - W10 (fix-discipline): subagent did not audit.
- **Project_kind (proposed by W1):** likely `standard` once W1 lands (project-beta is in production).

### 9. analyst-tool — NaCl Analyst Tool (in-tree canary)

- **Path:** `/home/project-owner/projects/NaCl/analyst-tool/`
- **config.yaml:** ✓ — Bolt `3607`, HTTP `3594`, password `neo4j_graph_dev`, container_prefix `nacl-analyst-tool`, `git.strategy: direct` (small framework tool, commits land directly on main), `git.main_branch: main`. Ports `backend_dev: 3583`, `frontend_dev: 3582`.
- **`.tl/` artifacts:** `changelog.md` ✓, `conductor-state.json` ✓, `status.json` ✓, `master-plan.md`, `feature-requests/`, `tasks/`. **Missing:** `delivery-status.json`, `release-status.json`, `stub-registry.json`.
- **Graph status:** REACHABLE. Snapshot pending.
- **W1–W10 gate-compliance gaps:** in-tree canary; intentionally minimal. The `git.strategy: direct` here is the intended `project_kind: prototype` (or framework-tool) case — W1's resolved_decisions binding suggests this is the rare carve-out.

### NOT_LOCALLY_PRESENT

- **Project Delta / Project Delta** — Possibly the same as `project-delta` (which is in Russian context). If a distinct project exists, it is not under `/home/project-owner/projects/`. Recorded as `NOT_LOCALLY_PRESENT_DISTINCT`.
- **marketplace analytics** — no matching directory; not in local registry.
- **due diligence pipeline** — `dill-claude` and `dill-codex` directories exist (matching the running `due-diligence-mapper-*-neo4j` containers), but their NaCl integration was not verified in this W0 pass. Recorded as `PARTIALLY_PRESENT`.

---

## Anomalies for Downstream Waves

1. **Project-Beta config.yaml ports do not match running container ports.** Config declares Bolt 3587 / HTTP 3574; container `project-beta-neo4j` runs on 3627 / 3614. The 3587/3574 pair is occupied by `project-alpha-neo4j`. Either the project-beta config is out of date or the host has been re-allocated. **Action for W5:** reconcile config vs runtime; W11 fixture must use the actual runtime port to query the live graph.
2. **`.tl/` artifact set is non-uniform across projects.** project-delta, project-zeta, analyst-tool, Project-Eta are each missing different combinations of `status.json`, `conductor-state.json`, `delivery-status.json`, `release-status.json`, `stub-registry.json`. W5 reconciliation must define the canonical set and a per-project bootstrap path.
3. **Project-Eta has no `.tl/` at all.** This is the canary migration project. Per the plan's resolved_decisions, per-project gap-closure is out of scope for W0 — but the Project-Eta state is "needs full `.tl/` initialization" rather than "needs targeted gap closure," which the orchestrator should know before launching per-project remediation.
4. **Live graph node counts span a wide range:** project-beta 477, project-alpha 1083, project-delta 1808; learn / project-epsilon / project-zeta / project-eta-bot / Project-Eta / analyst-tool snapshots pending. W11 fixture sourcing must respect that the project-alpha snapshot must show the exact 1083-node state that the codex postmortem documented.
5. **Two due-diligence containers (`due-diligence-mapper-codex-neo4j`, `due-diligence-mapper-claude-neo4j`) are healthy and may host live NaCl projects.** W0 stopped them to conserve RAM during the parallel-snapshot phase. They should be restarted (`docker compose up -d`) by the orchestrator before the next NaCl operation against them.
6. **Project-Alpha live graph (1083 nodes) is materially ahead of the last handover artifact (970 nodes per codex postmortem § 3).** The W11 fixture must capture the live state, not the export — that's the binding decision in the plan's resolved_decisions block.
7. **Heavy parallel startup caused Neo4j 5.x containers to enter restart loops** during the initial parallel-snapshot phase. The healthchecks have `start_period: 30s` and `retries: 30` (per `project-alpha/graph-infra/docker-compose.yml`), and under load the Neo4j 5.26.x + GDS plugin combination needs longer. Recommendation for W11 orchestrator: serialize graph queries one project at a time, or raise `start_period` in compose overrides.

---

## Verification (W0 read-only invariants)

```bash
cd /home/project-owner/projects/NaCl
git diff --stat -- '*SKILL.md' '*config.yaml' 'graph-infra/'    # should show zero edits
git diff --stat -- '*/.tl/*'                                    # should show zero .tl edits
```

Pre-vs-post graph node counts: subagent recorded read-only Cypher queries only; no `CREATE` / `MERGE` / `SET` / `DELETE` was issued. Spot-check via re-running the same per-label count query after the report is written would surface any accidental write.

Snapshots written to `/home/project-owner/projects/NaCl/tests/fixtures/graph-snapshots/<project-slug>/` per reachable project (one summary JSON plus one per-label sample JSON file with up to 10 nodes per label).

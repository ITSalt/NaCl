**NaCl 0.14.0 released — shipping & release gates**

After 0.13.0 every leaf skill produced honest six-status output. 0.14.0 closes the five orchestration paths to `main` / deploy / delivery / release that could still let unverified or unknown-status work through.

Highlights:
— `nacl-tl-conductor` parses `Status: {value}` only — headlines are advisory. A report without a parseable `Status:` line halts the conductor instead of being silently classified by header. TECH-path commit gate now reads the dev six-status result; review approval can no longer upgrade unverified dev work.
— `nacl-tl-hotfix` captures a `main`-branch baseline via `git worktree add`, runs the declared test command there, and only calls failures "pre-existing" when set membership confirms it. The `--test-name-pattern` heuristic is replaced with the configured runner filter (or the full declared command). `npm run build` / `npm test` fallbacks are removed. Non-PASS overrides leave `gh pr merge --auto` disabled and stamp the PR `HOTFIX APPLIED — UNVERIFIED`.
— `nacl-tl-deliver --skip-verify` now emits `DELIVER APPLIED — UNVERIFIED (skipped: --skip-verify)`, refuses to stamp IntakeItems as `delivered`, and writes `Task.verification_skip_reason` to the graph. Failed health check halts by default; operator override downgrades to `DELIVER APPLIED — UNVERIFIED (health failed, operator override)`. No `npm` fallbacks.
— `nacl-tl-ship` halts with `SHIP HALTED — UNVERIFIED (upstream status unknown)` when there is no `.tl/status.json` AND no Task node — the "warn and proceed" path is removed. Operator-confirmed unverified ship → `SHIP APPLIED — UNVERIFIED`; auto-deploy via `--deploy` is refused under non-PASS upstream. Deploy-path headline `SHIPPED + DEPLOYED (direct)` is replaced with status-aware variants. Ship still never switches branches autonomously.
— `nacl-tl-release` runs the UC status gate in every mode — `--skip-merge` and direct strategies no longer skip Steps 1–3. Production health failure halts; operator override emits `RELEASE INCOMPLETE — UNVERIFIED (production health failed, operator override)` and annotates the changelog. UNVERIFIED IntakeItems are excluded from the release artifact (not stamped with a "release note instead"); the excluded set appears in a dedicated section of the release report.

Five cross-cutting principles thread through the release: `Status:` is the only authoritative classifier; declared workspace commands only (no `npm` fallbacks); baseline before any "pre-existing" / "regression" claim; skip ⇒ unverified, never PASS; ship never switches branches.

Full release notes: docs/releases/0.14.0-shipping-release-gates/release-notes.md

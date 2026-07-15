# Desktop-Plugin 2.24.x Tails — Clean-Context Orchestrator Runbook

Written: 2026-07-15. Baseline: `main` at tag `v2.24.0` (release
https://github.com/ITSalt/NaCl/releases/tag/v2.24.0). This is a self-contained
handoff: the orchestrator needs no prior conversation context. Re-verify every
snapshot fact against the live repo before acting on it.

## Background (30 seconds)

v2.24.0 adapted NaCl to Claude Code Desktop: hardened graph runtime
(`nacl-core/scripts/graph-doctor.mjs`, docker resolution + pinned `neo4j-mcp`
binary in `nacl-tl-core/scripts/`, sidecar autostart in
`graph-infra/scripts/install-sidecar.{sh,ps1}`) and a Claude Code plugin
channel (`plugin/` — a committed artifact built by `scripts/build-plugin.mjs`
from `scripts/plugin-manifest.json`; marketplace at repo root
`.claude-plugin/marketplace.json`; install:
`/plugin marketplace add ITSalt/NaCl`). Live-Desktop verification passed
(fresh-project init E2E, SessionStart hook, MCP reload semantics, parallel
worktree session) and two defects found by it were fixed pre-tag (PR #20).
These tails are what was consciously deferred.

## Non-negotiable invariants

1. **Never touch:** `../NaCl-worker-plugin-*` worktrees, `codex/*` branches,
   `.codex/`, `docs/runbooks/codex-desktop-plugin-orchestrator.md`,
   `skills-for-codex/**` except sync-exemptions required by the gate below.
2. **No public state without the owner:** no new tags, no `gh release`, no
   Telegram posts, no version bumps. Ship each tail as a PR to `main` with CI
   green; merging requires the owner unless the invoking prompt explicitly
   delegates it.
3. **Gates that will bite you** (run locally before any PR):
   - `sh scripts/check-graph-halt-snippet.sh` — canonical graph-down HALT
     copies must match `nacl-core/SKILL.md`.
   - `sh skills-for-codex/scripts/check-root-codex-sync.sh <merge-base> HEAD`
     — any changed root `nacl-*/SKILL.md` needs a matching Codex change OR an
     updated `skills-for-codex/sync-exemptions/<skill>.md`.
   - `node scripts/build-plugin.mjs --check` — if you change ANYTHING under
     `nacl-*` skills, `.claude/agents/`, `graph-infra/`, or the build script:
     rebuild (`node scripts/build-plugin.mjs`) and commit `plugin/` in the
     same PR, or the drift gate fails.
   - Hardcoded-path / credential greps (see `.github/workflows/lint-skills.yml`)
     — no `/Users/<name>/` literals anywhere tracked.
   - Tests: `git ls-files '*/scripts/*.test.mjs' 'scripts/*.test.mjs' ':!plugin/**' | xargs node --test`
     (baseline at tag: 213 pass) and the `*.test.sh` files.
4. **Plugin-update gotcha:** `claude plugin update` is a no-op while
   `plugin/.claude-plugin/plugin.json` `version` is unchanged. Same-version
   rebuilds on main reach existing installs only via
   `claude plugin uninstall nacl@nacl && claude plugin install nacl@nacl`.
   Do NOT bump the version yourself (invariant 2).
5. Baseline discipline: capture failing/passing state BEFORE your change and
   diff after. A missing runner is BLOCKED, not success. Statuses:
   `VERIFIED | FAILED | PARTIALLY_VERIFIED | BLOCKED | NOT_RUN`.

---

## Tail A — PowerShell syntax gate (highest value, fully local)

**Context.** 2.24.0 changed three `.ps1` scripts (`nacl-tl-core/scripts/setup-graph.ps1`,
`nacl-tl-core/scripts/lib-neo4j-mcp.ps1`, `graph-infra/scripts/install-sidecar.ps1`)
with only manual review — no `pwsh` was available on the dev machine. Two more
exist (`connect-remote.ps1`, `create-remote.ps1`). GitHub `ubuntu-latest`
runners ship `pwsh` preinstalled, so a durable CI gate needs no Windows.

**Tasks.**
1. Add a step to `.github/workflows/test-tools.yml` (or a small new job) that
   syntax-checks every tracked `*.ps1`:
   `pwsh -NoProfile -Command '$errs=$null; [void][System.Management.Automation.Language.Parser]::ParseFile("<file>", [ref]$null, [ref]$errs); if ($errs) { $errs; exit 1 }'`
   over `git ls-files '*.ps1' ':!plugin/**'` (plugin copies are byte-identical
   artifacts — excluded like the other plugin globs in that workflow).
2. If parsing surfaces real errors in the three changed files, fix them
   (minimal diffs, match file style), mirror into `plugin/` via rebuild.
3. If `pwsh` is installable locally (`brew install --cask powershell`) run the
   same check locally first; otherwise let the PR's CI be the runner and
   iterate there.

**DoD.** CI job green on a PR that intentionally breaks one `.ps1` in a
scratch commit (verify the gate actually fails) and green on the final PR.

## Tail B — Plugin monitors watcher (deferred phase 2 of the hook design)

**Context.** The plugin ships a SessionStart hook
(`plugin/hooks/hooks.json` → `graph-doctor.mjs --hook`) that catches
graph-down at session start. Mid-session container death is currently
invisible. The plan deferred a `monitors/monitors.json` watcher until the
monitors schema was confirmed on live Desktop (docs were thin; component
exists since CC v2.1.105).

**Tasks.**
1. Research the CURRENT plugin `monitors/` schema (code.claude.com docs +
   changelog); if still under-documented, build a minimal throwaway probe
   plugin locally (`/plugin marketplace add <local dir>`) to observe behavior.
   The blocking questions: polling vs long-running process, notification
   surface, per-project vs global.
2. Implement `graph-doctor.mjs --watch`: long-running, poll `probeTcp` every
   30s, print one line ONLY on UP→DOWN / DOWN→UP transitions (silent
   otherwise; NOT_NACL → exit 0 immediately). Tests for the transition logic
   (injectable probe + clock, same style as `deepCheckWithRetry`).
3. Add generation of `plugin/monitors/monitors.json` to
   `scripts/build-plugin.mjs` (pin counts if the generator grows rules),
   rebuild, `claude plugin validate ./plugin --strict`.
4. Live check on Desktop: stop a test container mid-session, expect a
   notification; document the observed UX in `docs/setup/graph-setup.md`.

**DoD.** Watch-mode tests green; validate --strict passes; live UP→DOWN
notification observed once; docs updated. If the monitors surface turns out
not to fire for this shape, record FAILED-with-evidence and close the tail as
"not viable on current CC" instead of forcing it.

## Tail C — T-7: remote-mode sidecar autostart reboot test

**Context.** `install-sidecar.sh --autostart` (default on macOS) now writes a
LaunchAgent `~/Library/LaunchAgents/com.nacl.sidecar.<scope>.plist`
(RunAtLoad+KeepAlive) and a marker `~/.nacl/sidecar/<scope>.autostart`;
Windows uses Scheduled Task `NaCl Sidecar <scope>` + hidden `.vbs` wrapper.
`graph-doctor --fix` kickstarts via the marker. NOT yet tested through an
actual reboot, and pre-2.24 installs are nohup-based (no LaunchAgent) until
`install-sidecar` is re-run.

**Status: BLOCKED until a live remote-mode project is active** (needs a VPS
scope + certs; see `docs/runbooks/connect-to-existing-remote-project.md`).

**Tasks when unblocked.**
1. On the machine with the remote project: re-run `install-sidecar.sh` for the
   scope (autostart default) — verify plist exists, marker says `launchd`,
   `launchctl print gui/$UID/com.nacl.sidecar.<scope>` shows state running.
2. `kill -9` the ghostunnel PID → launchd must restart it within ~10s
   (ThrottleInterval); `graph-doctor` reports UP.
3. Reboot. Without touching a terminal, open a Desktop session of the project
   and ask for `RETURN 1` via neo4j MCP — must succeed.
4. Record results in `docs/runbooks/connect-to-existing-remote-project.md`
   (a short "verified on reboot: <date>" note) if green.

## Tail D — Document the framework release procedure

**Context.** Releasing NaCl itself is manual (CHANGELOG + tag + `gh release`,
direct push allowed for the owner) and since 2.24.0 has plugin-specific steps
— but no doc records the procedure. The knowledge currently lives only in
release commit history.

**Tasks.** Write `docs/runbooks/framework-release.md`:
1. Absorb `docs/releases/_drafts/` into the new release notes if present,
   then delete drafts (empty-between-releases convention).
2. CHANGELOG entry `## [X.Y.Z] — YYYY-MM-DD` (em dash — matches 2.23.0+).
3. `node scripts/build-plugin.mjs` → commit `plugin/` (version flows from the
   first CHANGELOG heading into `plugin.json`; the drift gate enforces the
   rebuild).
4. Release bundle `docs/releases/<ver>-<slug>/` (release-notes.md + tg-post.md
   draft; TG publication is the owner's manual step).
5. Canary greps before pushing anything public: no client names (family-cinema
   is explicitly allowed), no `/Users/<name>/`, no dump metadata.
6. Tag + `gh release create` with the release-notes file.
7. Note the same-version plugin-update gotcha (invariant 4) and that tagged
   releases clear it.

**DoD.** The runbook alone is enough for a clean-context agent to cut a
release; cross-check it against how v2.24.0 actually shipped (git log).

## Tail E — Known port-collision landmine in an unrelated project (owner FYI)

**Context.** The 2.24.0 port-scan fix (stopped-container-aware,
`graph-doctor --scan-ports`) prevents NEW collisions, but one pre-existing
one was observed on the dev machine: stopped `ptd-back-neo4j` has bolt 3597
configured — the same port the RUNNING `learn-neo4j` holds. `docker start
ptd-back-neo4j` will fail until re-ported.

**Task.** Nothing to code in this repo. Surface to the owner; if they want,
re-port ptd-back the way kinga was re-ported (edit `graph-infra/.env`,
`config.yaml`, `.mcp.json` to the `NACL_GRAPH_PORTS_SUGGEST` rung, recreate
container, new session). Also: `nacl-bench-neo4j` container is deletable per
an old owner decision — confirm before removing anything (invariant: never
delete containers without explicit confirmation).

## Tail F — PARKED: clean channel split (Variant 2)

Do NOT implement unless the owner asks. Today the dev machine runs the dual
setup (plugin + symlinked skills, `NACL_ALLOW_DUAL=1` in
`~/.claude/settings.json` env) — both skill sets visible in both hosts.
If the doubled skill list ever becomes a problem, the parked design is:
`~/.claude` keeps ONLY the plugin (remove symlinks); a second config home
`~/.claude-cli` (symlink shared parts: credentials, settings.json, projects/)
carries the symlinked skills; the CLI reaches it via a shell **alias**
(`alias claude='CLAUDE_CONFIG_DIR="$HOME/.claude-cli" claude'`) — alias, not
export: Desktop imports an undocumented "fixed set" of variables from the
shell profile, and an alias can never leak into a GUI process. Before
implementing, empirically probe what `CLAUDE_CONFIG_DIR` actually relocates
(auth, plugin registry, `~/.claude.json`, memory/history) — it is
undocumented, and a past programmatic use hit auth issues.

---

## Suggested execution order

A and D are independent and fully local — run them first (parallel workers,
disjoint files). B next (research + live Desktop access needed). C stays
BLOCKED until a remote project exists. E is a one-message owner FYI. F is
parked.

## Ledger

| Tail | Status | PR / evidence | Notes |
|---|---|---|---|
| A pwsh gate | VERIFIED | [PR #22](https://github.com/ITSalt/NaCl/pull/22); negative test: [run 29400687736](https://github.com/ITSalt/NaCl/actions/runs/29400687736) failed on the intentionally broken `.ps1`, final head all-green | merged 2026-07-15 |
| B monitors | PARTIALLY_VERIFIED | [PR #23](https://github.com/ITSalt/NaCl/pull/23); 221/221 tests, `validate --strict` clean, adversarial review PASS with live E2E transition smoke | live Desktop UP→DOWN notification still pending (owner: stop a test container mid-session); merged 2026-07-15 |
| C T-7 reboot | BLOCKED | 2026-07-15 probe: a remote-mode sidecar scope exists on the dev machine but is pre-2.24 (nohup wrapper, no LaunchAgent, no `.autostart` marker) and currently stopped | needs owner: re-run `install-sidecar` for the scope, then the kill/reboot sequence |
| D release runbook | VERIFIED | [PR #21](https://github.com/ITSalt/NaCl/pull/21); adversarial review found 3 defects (incl. a vacuous privacy-canary ordering), fixed and re-verified | merged 2026-07-15 |
| E ptd-back FYI | VERIFIED | 2026-07-15 probe: stopped `ptd-back-neo4j` has bolt 3597 configured; running `learn-neo4j` holds 0.0.0.0:3597 — `docker start ptd-back-neo4j` will fail until re-ported | surfaced to owner; nothing to code |
| F variant 2 | PARKED | — | owner opt-in only |

Final report per tail: status, PR link, commands + exit codes, evidence
paths, residual risk. Never mark a tail VERIFIED on prose alone.

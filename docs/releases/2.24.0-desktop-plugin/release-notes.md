# NaCl 2.24.0 — desktop-plugin

**NaCl now runs as a native Claude Code Desktop citizen — the graph runtime is hardened for a
GUI-app host, and a committed Claude Code plugin gives Desktop users a first-class install
channel alongside the existing CLI symlink install.**

## The problem

The graph runtime was written CLI-first: docker resolution walked a shell `PATH`, the sidecar had
no OS-level autostart, and `neo4j-mcp` was launched through an unpinned npm command. All of that
works from a terminal but is a poor fit for a GUI app — Docker Desktop's own binaries are often
outside the GUI process's PATH, there is no shell session to leave a container running in, and an
unpinned dependency is a reproducibility gap. Separately, the only way to run NaCl skills inside
Claude Code Desktop was to symlink the repo checkout the same way the CLI does, which is not how
Desktop's own extension mechanism (plugins) is meant to be used.

## How it works

**Stage 1 — graph runtime hardening.** `nacl-core/scripts/graph-doctor.mjs` is a standalone
liveness probe for the local graph container and MCP binary; it also runs `--fix` to start the
stack, and is wired as a SessionStart hook so a stale or down graph is caught before a skill runs
into it instead of failing mid-skill. `setup-graph` now searches GUI-app PATH candidates for the
Docker CLI and daemon and auto-launches Docker Desktop when the daemon is reachable but not
running. The `neo4j-mcp` binary is now version-pinned and sha256-verified
(`nacl-tl-core/scripts/neo4j-mcp.pin`, default v1.5.3, overridable via `NEO4J_MCP_VERSION`)
instead of resolved through an unpinned npm launcher. The sidecar gets OS-native autostart — a
macOS LaunchAgent and a Windows Scheduled Task — so it survives a reboot without a manual
`docker compose up`. All 11 skills that can hit a down graph now emit one canonical HALT message,
enforced by a lint gate so the wording cannot drift skill by skill. Project-root resolution is
worktree-safe throughout the graph-setup path, and `/nacl-init` gained a worktree guard.

**Stage 2 — the Claude Code plugin.** `scripts/build-plugin.mjs` builds `plugin/` from
`scripts/plugin-manifest.json` and the artifact is committed to the repo. It packages 53 of 59
skills as `/nacl:<name>` slash commands, 7 agent profiles as `@nacl:<name>`, `nacl-core` bundled
whole as a shared library, and graph-infra bundled alongside. Two SessionStart hooks ship with it:
a graph-liveness check (the same probe as Stage 1) and a coexistence warning that fires if it
detects the CLI's symlinked skills already installed on the same machine. A repo-root marketplace
manifest makes the full install two commands:

```text
/plugin marketplace add ITSalt/NaCl
/plugin install nacl@nacl
```

The neo4j MCP server stays configured per-project by `/nacl:init`, not by the plugin — tool names
are unchanged, so skills that talk to the graph behave identically regardless of channel.

## Choose your channel

The plugin is **not** a replacement for the existing install path — it is a second, independent
channel for a different host.

| You use | Channel | Install |
|---|---|---|
| Claude Code CLI | Symlinked skills (unchanged) | `sh scripts/install-claude-code-skills.sh` |
| Claude Code Desktop | Plugin (new) | `/plugin marketplace add ITSalt/NaCl` then `/plugin install nacl@nacl` |
| Codex | `skills-for-codex/` (unchanged, separate) | `sh skills-for-codex/scripts/install-user-symlinks.sh` |

Both Claude Code channels work technically in both hosts, but **do not install both on one
machine** — they duplicate every skill under two different names (`nacl-*` and `/nacl:*`). The
plugin's SessionStart hook warns if it detects the symlinked install already present.

## What is deliberately not included

- **`/nacl-goal` in Desktop.** The `nacl-goal` skill wraps the CLI-only `/goal` command, which
  Desktop cannot run, so it is excluded from the plugin manifest entirely.
- **`nacl-postmortem`.** Rare/high-stakes; the workflow panel it depends on stays repo-side.
- **`nacl-migrate`, `nacl-migrate-ba`, `nacl-migrate-sa`.** Rare, and require a full repo
  checkout plus Python — not a fit for a plugin-only install.
- **Sidecar reboot test and monitors.** The remote-mode sidecar autostart (LaunchAgent /
  Scheduled Task) ships in this release, but the live reboot test (T-7) and the optional
  plugin `monitors/` watcher are deferred to the next remote-mode connection.

## Verified live on Claude Code Desktop

Before tagging, the adaptation was exercised on a real Desktop install (macOS):

- Fresh-project `/nacl:init` end-to-end: docker resolved from a GUI launch, pinned binary,
  schema loaded, `NACL_GRAPH_RESULT: READY`, project registered.
- SessionStart hook: graph-down state reached the model as context and it offered
  `graph-doctor --fix` unprompted; silent when the graph is up or the project has no graph.
- MCP reload semantics: `.mcp.json` written mid-session is NOT hot-reloaded and
  `/mcp reconnect` does not see new entries — a new session picks it up; the canonical
  check is one `mcp__neo4j__read-cypher "RETURN 1"` call (docs and init wording match this).
- Parallel worktree session on a real project: `mcp__neo4j__*` tools present and working.
- Graph-heavy skill reads through the plugin channel (`/nacl:tl-status` over a
  4k-node project graph).
- Two real defects were found by these checks and fixed before the tag: a single-shot
  deep-check race in `graph-doctor --fix` (retry with bounded backoff now) and a port scan
  blind to stopped containers' bindings (now `docker inspect` over ALL containers, with a
  both-ports-free ladder suggestion).

## Known operational note

`claude plugin update` is a no-op while the plugin version string is unchanged — mid-cycle
plugin content changes (same-version rebuilds on `main`) require `claude plugin uninstall`
+ `install` to refresh the cache. Tagged releases bump the version, so regular users are
unaffected.

## Scope and follow-ups

Both stages landed on a real branch history; the smoke matrix (`tests/desktop/`) gives a
repeatable manual check for the graph runtime changes, and the checklist above adds live
Desktop verification on real projects. The plugin build is deterministic from
`plugin-manifest.json` against the same skill sources the CLI channel uses, so the two
channels cannot drift in content, only in packaging. Open follow-ups: sidecar reboot test
(T-7), plugin monitors watcher, Windows PowerShell syntax pass over the four `.ps1` scripts.

Telegram post: docs/releases/2.24.0-desktop-plugin/tg-post.md

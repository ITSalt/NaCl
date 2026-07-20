[Home](../../README.md) > [Quick Start](../quickstart.md) > Windows Setup

🇷🇺 [Русская версия](install-windows.ru.md)

# Windows Setup

Complete setup guide for Windows. Two approaches: WSL2 (recommended) or native.

## Option A: WSL2 (Recommended)

WSL2 provides the best experience — all Linux tools work natively.

### 1. Install WSL2

Open PowerShell as Administrator:

```powershell
wsl --install -d Ubuntu
```

Restart your computer, then open Ubuntu from the Start menu.

### 2. Install Docker Desktop

Download [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/).

In Docker Desktop Settings:
- General > "Use the WSL 2 based engine" — enabled
- Resources > WSL Integration > enable for your Ubuntu distro

### 3. Inside WSL2: follow the Linux guide

Open your Ubuntu terminal and follow [Linux Setup](install-linux.md) from "Prerequisites" step 2 onward.

All paths use Linux format (`~/NaCl`, `~/.claude/skills/`,
`~/.agents/skills/`). For skills, use [Skill Installation](install-skills.md)
and choose Claude Code or Codex.

## Option B: Native Windows (PowerShell)

### 1. Prerequisites

- [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) with WSL2 backend
- [Node.js 20](https://nodejs.org/) (Windows installer)
- [Git for Windows](https://git-scm.com/download/win)
- Claude Code or Codex as the agent runtime. Claude Code CLI:
  `npm install -g @anthropic-ai/claude-code`

### 2. Clone the repository

```powershell
git clone https://github.com/ITSalt/NaCl.git $HOME\NaCl
```

### 3. Install skills

For Claude Code, run the bundled installer (PowerShell as Administrator,
or with Developer Mode enabled):

```powershell
& "$HOME\NaCl\scripts\install-claude-code-skills.ps1"
```

The script links every `nacl-*` directory with a `SKILL.md` into
`%USERPROFILE%\.claude\skills` and every agent profile into
`%USERPROFILE%\.claude\agents`. It runs `git pull --ff-only` first so a
single command both installs and updates. Pass `-NoPull` to skip the git
step. Falls back to directory junctions for skills if symlink creation is
unavailable; agents require true symlinks.

For Codex, the target normal path after public release is the official
Skills-only plugin in the **Plugins** UI. The following symlink-only installer
is retained for legacy compatibility and must not be confused with the
official card or combined with the current full Git plugin:

```powershell
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

Full reference for both runtimes:
[Skill Installation](install-skills.md).

> Skills and agents linked to `%USERPROFILE%\.claude\` on native Windows
> (or `~/.claude/` in WSL2) are available on the CLI and IDE extensions.
> For **Claude Code Desktop**, the current channel (v2.24.0+) is the
> `nacl` plugin, not this symlink install — run `/plugin marketplace add
> ITSalt/NaCl` then `/plugin install nacl@nacl` inside Desktop, and pick
> one channel per machine (do not install both; see
> [Skill Installation § Choose your channel](install-skills.md)). Codex
> uses `%USERPROFILE%\.agents\skills`.

> Note: Creating symlinks on Windows requires either Administrator
> privileges or Developer Mode enabled
> (Settings > Update & Security > For Developers).

### After `git pull`

The installer is the update tool too. Re-run the same command — it is
idempotent: existing symlinks are recreated to the same target and new
`nacl-*` directories shipped in a release get fresh links. See
[Update Claude Code Skills](install-skills.md#update-claude-code-skills)
for the canonical procedure across all platforms.

### 4. Build optional CLI tools

```powershell
cd $HOME\NaCl\docmost-sync; npm install; npm run build
cd $HOME\NaCl\yougile-setup; npm install; npm run build
```

## Common Windows Gotchas

- **Line endings**: Git may convert LF to CRLF. Set `git config --global core.autocrlf input` before cloning.
- **Path length**: Enable long paths in Windows: `git config --global core.longpaths true`
- **Docker**: Ensure "Use WSL 2 based engine" is enabled in Docker Desktop settings.
- **Claude Code config**: Config files are at `%USERPROFILE%\.claude\` on native Windows, `~/.claude/` in WSL2.
- **Codex skills**: Native Windows installs use `%USERPROFILE%\.agents\skills`; WSL2 installs use the WSL user's `~/.agents/skills`.

## Graph Infrastructure

See [Graph Setup](graph-setup.md) for Docker + Neo4j configuration. Excalidraw boards are managed by the NaCl Analyst Tool (`analyst-tool/`), which runs outside Docker.

### Neo4j MCP on Windows

`/nacl-init` (graph step) sets this up for you — no manual steps and **no `neo4j-mcp`
npm package required**. On native Windows it runs `nacl-tl-core\scripts\setup-graph.ps1`,
which:

- downloads the **official** `neo4j-mcp` binary directly from GitHub and extracts it with
  `Expand-Archive` to `%USERPROFILE%\.neo4j-mcp-bin\neo4j-mcp.exe` (no download-on-start,
  no `unzip` dependency);
- writes `.mcp.json` pointing **directly at that binary** (the npm launcher prints a banner
  to STDOUT that corrupts the stdio JSON-RPC stream, so it is not used);
- writes `.env` / `.mcp.json` / schema as **UTF-8 without a BOM** (`cypher-shell` rejects a
  BOM on line 1);
- starts Docker, loads the schema, and refuses to report success unless a hard gate passes.

**Acceptance test** — after `/nacl-init` with graph enabled, with **no further action**:

1. `docker ps` shows `<prefix>-neo4j` as **healthy**.
2. `SHOW CONSTRAINTS` returns the expected constraint count (the setup script verifies this
   automatically against the loaded schema).
3. The resolved `neo4j-mcp.exe` answers an `initialize` + `tools/list` JSON-RPC handshake
   (the setup script runs this as gate 3).
4. Start a **new session** (not an in-session restart) and run one smoke-test call:
   `mcp__neo4j__read-cypher "RETURN 1"` succeeds on the first try. Note: on Claude
   Code Desktop, typing `/mcp` opens the connector directory — it does not show the
   project `neo4j` server as connected — so this smoke-test call is the reliable check
   on both CLI and Desktop.

If setup fails it prints `NACL_GRAPH_RESULT: status=FAILED` with the failing check — it never
reports a half-configured graph as ready. The graph step is idempotent, so re-run `/nacl-init`
after addressing the cause.

## Codex Desktop

### UI installation

After public release, install the official NaCl Skills-only card from
**Plugins** once, grant only the displayed permissions, create a new project
task, and run the `nacl-init` read-only preflight. After confirmed bootstrap
writes project `.mcp.json`, create another new task for project MCP pickup. No
PowerShell setup, repository path, public MCP, or Git reinstall is required.
Until publication, use the separately documented immutable Git/full-plugin
compatibility channel and its installation doctor.

### Graph and authorization

Local mode uses the per-project Neo4j 5 Community container through Docker
Desktop's WSL2 backend. Remote mode connects to a separately operated VPS.
Access to a server currently implies access to every project database hosted
there; `project_scope` is routing and provenance, not authorization. The
Skills-only path uses local/project MCP and does not add public HTTP/OAuth.

## Next Steps

- [Graph Setup](graph-setup.md) — Neo4j + Analyst Tool boards
- [Skill Installation](install-skills.md) — Claude Code or Codex
- [Quick Start](../quickstart.md) — first project

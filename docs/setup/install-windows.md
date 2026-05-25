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

For Codex (separate distribution), use the matching script:

```powershell
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

Full reference for both runtimes:
[Skill Installation](install-skills.md).

> Skills and agents linked to `%USERPROFILE%\.claude\` on native Windows
> (or `~/.claude/` in WSL2) are automatically available in all local Claude
> Code platforms: CLI, Desktop app, and IDE extensions. Codex uses
> `%USERPROFILE%\.agents\skills`.

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

See [Graph Setup](graph-setup.md) for Docker + Neo4j + Excalidraw configuration.

## Next Steps

- [Graph Setup](graph-setup.md) — Neo4j + Excalidraw
- [Skill Installation](install-skills.md) — Claude Code or Codex
- [Quick Start](../quickstart.md) — first project

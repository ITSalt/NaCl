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

All paths use Linux format (`~/NaCl`, `~/.claude/skills/`).

## Option B: Native Windows (PowerShell)

### 1. Prerequisites

- [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) with WSL2 backend
- [Node.js 20](https://nodejs.org/) (Windows installer)
- [Git for Windows](https://git-scm.com/download/win)
- Claude Code: `npm install -g @anthropic-ai/claude-code` (CLI; skills also work in Desktop app and IDE extensions)

### 2. Clone the repository

```powershell
git clone https://github.com/ITSalt/NaCl.git $HOME\NaCl
```

### 3. Link skills

PowerShell (run as Administrator for symlinks):

```powershell
$skillsDir = "$env:USERPROFILE\.claude\skills"
New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null

Get-ChildItem -Path "$HOME\NaCl" -Directory | ForEach-Object {
    if (Test-Path "$($_.FullName)\SKILL.md") {
        $target = Join-Path $skillsDir $_.Name
        if (Test-Path $target) { Remove-Item $target -Force -Recurse }
        New-Item -ItemType SymbolicLink -Path $target -Target $_.FullName | Out-Null
    }
}

Write-Host "Linked $((Get-ChildItem $skillsDir).Count) skills"
```

> Skills linked to `~/.claude/skills/` (or `%USERPROFILE%\.claude\skills\` on native Windows) are automatically available in all local Claude Code platforms: CLI, Desktop app, and IDE extensions.

> Note: Creating symlinks on Windows requires either Administrator privileges or Developer Mode enabled (Settings > Update & Security > For Developers).

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

## Graph Infrastructure

See [Graph Setup](graph-setup.md) for Docker + Neo4j + Excalidraw configuration.

## Next Steps

- [Graph Setup](graph-setup.md) — Neo4j + Excalidraw
- [Quick Start](../quickstart.md) — first project

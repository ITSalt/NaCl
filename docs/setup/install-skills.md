[Home](../../README.md) > [Quick Start](../quickstart.md) > Skill Installation

:ru: [Русская версия](install-skills.ru.md)

# Skill Installation

NaCl can be used from Claude Code and from Codex. Install the skill package that
matches the agent runtime you use on this machine.

| Runtime | Install location | Package |
|---|---|---|
| Claude Code | `~/.claude/skills/` | Root-level `nacl-*` skills from this repository |
| Codex | `$HOME/.agents/skills/` | `skills-for-codex/` from this repository |

Install once at the user level. The skills are then available from every
project opened by that runtime on the same machine.

## Choose your channel

Claude Code has two install channels. Pick one per machine -- do not install both.

| Host | Channel | Package |
|---|---|---|
| Claude Code CLI | Symlinked skills | Root-level `nacl-*` skills, installed by `scripts/install-claude-code-skills.sh/.ps1` (below) |
| Claude Code Desktop | Plugin | Committed `plugin/` artifact, installed from the in-app marketplace |

Both channels ship the same skills; they just differ in packaging. Installing
both on the same machine duplicates every skill under two different names
(`nacl-*` and `/nacl:*`). The plugin's SessionStart hook detects a symlinked
`~/.claude/skills/nacl-*` install and warns; likewise a symlinked install
picks up whichever skill runs first if both are present. Pick the channel
that matches how you run Claude Code and stick to it.

### Claude Code Desktop (plugin)

Inside Claude Code Desktop, run:

```text
/plugin marketplace add ITSalt/NaCl
/plugin install nacl@nacl
```

This installs 53 of the 59 skills as `/nacl:<name>` slash commands and 7
agent profiles as `@nacl:<name>`. `nacl-goal` is excluded (it wraps the CLI-only
`/goal` command, which Desktop cannot run); `nacl-postmortem` and the three
`nacl-migrate*` skills are excluded as rare/repo-checkout-only. The neo4j MCP
server is still configured per-project by `/nacl:init`, not by the plugin.
See [Graph Setup](graph-setup.md) for the Desktop graph-infrastructure
specifics (Docker Desktop detection, sidecar autostart, the pinned
`neo4j-mcp` binary, and the `graph-doctor` liveness probe).

To update the plugin, use Claude Code Desktop's own plugin update flow; there
is no separate NaCl script for this channel.

### Claude Code CLI (symlinked skills)

Claude Code uses the root-level NaCl skill folders and the `.claude/agents/`
agent profiles. A single script installs both.

### macOS / Linux / WSL2

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/scripts/install-claude-code-skills.sh"
```

The script runs `git pull --ff-only` first, then refreshes user-level symlinks
for every `nacl-*` directory with a `SKILL.md` and every agent file under
`.claude/agents/`. Pass `--no-pull` to skip the git step in offline or
sandboxed environments.

### Windows PowerShell

Run PowerShell as Administrator (or with Developer Mode enabled — see
[Windows Setup](install-windows.md)):

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"
& "$HOME\NaCl\scripts\install-claude-code-skills.ps1"
```

Same behaviour as the shell script: optional `git pull` plus symlink refresh
for skills and agents. Pass `-NoPull` to skip the git step. Skill links
fall back to directory junctions if symlinks are unavailable; agent links
require true symlinks (and therefore Administrator or Developer Mode).

### Verify Claude Code

```sh
ls "$HOME/.claude/skills" | wc -l
```

Start Claude Code in a project and run:

```text
/nacl-init --dry-run
```

## Codex

Codex uses the `skills-for-codex/` package from a normal git checkout. Do not
install Codex skills from copied archives: links must point to the repository so
`git pull` updates the skills for every project on the machine.

### macOS

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Linux

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Windows WSL2

Run the Linux command inside WSL2. The install target is the WSL user's
`$HOME/.agents/skills/`.

### Windows PowerShell

The installer creates directory symlinks when Windows allows it. If symlink
creation is unavailable, it falls back to directory junctions.

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

### Ask Codex To Install NaCl Skills

If Codex is running on a machine where NaCl is not installed, send this prompt:

```text
Install NaCl Codex skills globally on this machine.

Clone https://github.com/ITSalt/NaCl.git into $HOME/NaCl if it is not already present. If it is present, run git pull --ff-only there. Then run the Codex installer from $HOME/NaCl/skills-for-codex/scripts and verify that $HOME/.agents/skills contains 59 NaCl skill links and that each linked directory has SKILL.md. Use network or escalated permission if needed.
```

### Verify Codex

macOS / Linux / WSL2:

```sh
find "$HOME/.agents/skills" -maxdepth 1 -type l -name 'nacl-*' | wc -l
test -f "$HOME/.agents/skills/nacl-core/SKILL.md"
```

Windows PowerShell:

```powershell
(Get-ChildItem "$HOME\.agents\skills" -Filter "nacl-*").Count
Test-Path "$HOME\.agents\skills\nacl-core\SKILL.md"
```

## Update Claude Code Skills

Re-run the same installer used for the first install. The script is
idempotent: it runs `git pull --ff-only`, recreates existing symlinks to
the same target, and creates fresh symlinks for any new skill or agent.

### macOS / Linux / WSL2

```sh
sh "$HOME/NaCl/scripts/install-claude-code-skills.sh"
```

### Windows PowerShell

```powershell
& "$HOME\NaCl\scripts\install-claude-code-skills.ps1"
```

Add `--no-pull` (sh) or `-NoPull` (PowerShell) to refresh symlinks without
pulling new commits.

## Update Codex Skills

Update the repository checkout:

```sh
cd "$HOME/NaCl"
git pull --ff-only
sh skills-for-codex/scripts/install-user-symlinks.sh
```

The skill links continue to point to the same checkout, so existing skills update
as soon as `git pull` completes. Re-running the installer is only needed to add
new skill directories or repair missing links.

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

There are two equivalent ways to add the NaCl marketplace and install the
plugin: the settings GUI or two slash commands. Both end at the same
`nacl@nacl` install.

**Option A — settings GUI (point-and-click)**

1. Open **Settings** (or type `/plugin` in the task input at the bottom — it
   opens the same panel).
2. In the left sidebar, under **Customize**, click **Plugins**.
3. Top-right, click **Add ▾** → **Add marketplace**.
4. Choose **Add from a repository** ("Sync a plugin marketplace from a GitHub
   repository or git URL").
5. In the **URL** field, type `ITSalt/NaCl`. A GitHub `owner/repo` is enough —
   you do not need the full `https://…` URL, a local folder path, or a
   pre-cloned copy of the repository. Acknowledge the trust warning.
6. Click **Sync**. The `nacl` marketplace is added.
7. Back in the **Plugins** panel, click **Browse**. In the **Directory** dialog
   that opens, select **Plugins** in the left sidebar and click the **Code** tab
   at the top. Find the **NaCl Spec-Graph Framework** card (by `ITSalt`) and
   click the **`+`** button on it to install.

If step 6 shows **"Failed to add marketplace"**, the repository is fine — it is
a known Desktop-client limitation. See
[Troubleshooting](#troubleshooting-failed-to-add-marketplace) below and use
Option B instead.

**Option B — slash commands**

Inside Claude Code Desktop, run:

```text
/plugin marketplace add ITSalt/NaCl
/plugin install nacl@nacl
```

Either option installs 53 of the 59 skills as `/nacl:<name>` slash commands and
7 agent profiles as `@nacl:<name>`. `nacl-goal` is excluded (it wraps the
CLI-only `/goal` command, which Desktop cannot run); `nacl-postmortem` and the
three `nacl-migrate*` skills are excluded as rare/repo-checkout-only; `nacl-core`
is excluded as a shared library shipped whole at the plugin root, not as an
invocable skill (6 exclusions total: 59 − 6 = 53). The neo4j MCP
server is still configured per-project by `/nacl:init`, not by the plugin.
See [Graph Setup](graph-setup.md) for the Desktop graph-infrastructure
specifics (Docker Desktop detection, sidecar autostart, the pinned
`neo4j-mcp` binary, and the `graph-doctor` liveness probe).

To update the plugin, use Claude Code Desktop's own plugin update flow; there
is no separate NaCl script for this channel.

#### Troubleshooting: "Failed to add marketplace"

If the GUI **Add marketplace → Sync** step fails with a bare
**"Failed to add marketplace"** (the client log records
`MARKETPLACE_ERROR:UNKNOWN` alongside `Unrecognized git clone error output`),
the NaCl repository and its `marketplace.json` are not the problem — this is a
Claude Desktop client limitation.

Under the hood the GUI shells out to the bundled `claude` CLI to `git clone` the
marketplace repository and kills that clone after roughly 60 seconds. When the
clone resolves to SSH (the CLI prefers SSH for the `owner/repo` form) and the
desktop's non-interactive process has no usable SSH agent or `known_hosts`
entry, the clone stalls on a host-key or credential prompt and is killed at the
timeout. The client cannot parse the truncated output, so it reports the
generic error — even though the same clone finishes in seconds from a real
terminal.

Workaround — run the same two commands from a normal terminal, where SSH is
fully set up and the clone timeout is 120 seconds:

```text
claude plugin marketplace add ITSalt/NaCl
claude plugin install nacl@nacl
```

Then restart Claude Code Desktop; the installed `nacl@nacl` plugin is picked up
automatically. These are the Desktop plugin channel's own commands (they update
the plugin marketplace list and `enabledPlugins`), not the symlink channel — so
this workaround does not create a dual install.

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

Codex normally uses the full NaCl plugin. The plugin packages the application
surface, ten public skills, sixty internal skills, and twenty-five bounded MCP
tools together. Installation, update, disablement, and removal happen in the
Codex **Plugins** UI; the ordinary user does not need a source checkout, a
terminal, a local marketplace folder, or a machine-specific package path.

### Full Codex plugin (normal channel)

1. Open **Plugins** in Codex Desktop.
2. Open the trusted NaCl card supplied for the intended workspace and choose
   **Install** or the **+** action.
3. Grant only the permissions shown by Codex.
4. Fully quit and reopen Codex, then create a new task.

The local candidate has been verified from Codex's installed cache. A public
card or install URL is not yet available: the public Streamable HTTP MCP
endpoint, OAuth flow, release, and marketplace submission remain `NOT_RUN`.
Do not reuse a saved package path from another computer. See the
[Codex plugin installation guide](install-codex-plugin.md) for the current
verified boundary.

### Verify Codex

In the new task, send:

```text
Call nacl_installation_doctor exactly once with no arguments. Report status, mode, pluginVersion, and executionLocation. Continue only if status=VERIFIED and mode=plugin-only.
```

Confirm that the version matches the installed card and that
`executionLocation=installed-cache`. Stop if any field differs.

### Legacy Codex skills (compatibility only)

The former skills-only installation remains documented for existing machines
and controlled migration, but it is not the normal Codex path. Do not combine
it with the full plugin. If the doctor reports `mode=both`, stop and use the
[legacy compatibility appendix](codex-legacy-compatibility.md) to plan an
evidence-preserving migration.

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

## Update the Codex plugin

Open the installed NaCl card in **Plugins** and choose **Update** when Codex
offers it. Fully restart Codex, create a new task, and repeat the doctor check.
The reported version must match the updated card. If no update is offered, stop
and ask the plugin owner for the intended release; do not invent an install URL
or package location.

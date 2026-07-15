[Home](../README.md) > Quick Start

🇷🇺 [Русская версия](quickstart.ru.md)

# Quick Start

Use the runtime branch that matches your application. Codex users follow the UI-first path; Claude users retain the current 2.24.0 channels.

<!-- doc-key: prerequisites -->
## Prerequisites

- An authenticated Codex Desktop or Claude Code installation.
- Docker Desktop for a local Neo4j graph, or access to a VPS that already hosts the project's Neo4j Community container.
- A project folder that the agent runtime is allowed to read and write.

Repository development additionally needs Git 2.30+ and Node.js 18+, but an ordinary Codex plugin user does not need a checkout or terminal for installation.

<!-- doc-key: choose-channel -->
## Choose the installation channel

For **Codex Desktop**, install the full NaCl plugin from a trusted NaCl card in **Plugins**. Fully restart Codex and open a new task. The verified artifact is currently a local candidate; a public card, public Streamable HTTP MCP endpoint, OAuth flow, and release are `NOT_RUN`. See [Install the Codex plugin](setup/install-codex-plugin.md).

For **Claude Code Desktop or CLI**, follow [Skill Installation](setup/install-skills.md). Keep the 2.24.0 GUI walkthrough and use only one Claude installation channel per machine.

<!-- doc-key: verify-installation -->
## Verify the installation

In a new Codex task, send:

```text
Call nacl_installation_doctor exactly once with no arguments. Report status, mode, pluginVersion, and executionLocation. Continue only if status=VERIFIED and mode=plugin-only.
```

The version must equal the installed card and `executionLocation` must be `installed-cache`. Stop if any field differs. Claude users can run the dry-run command documented by their selected channel.

<!-- doc-key: run-first-dry-run -->
## Run the first dry run

Ask the installed NaCl plugin:

```text
Use nacl-init for this project in dry-run mode. Show the resolved project identity, graph mode, planned files, ports, server route, and blockers. Do not change anything.
```

Review the plan. Local graph mode creates one Neo4j 5 Community container and durable volumes for this project. Remote mode connects to a project container on a reachable VPS. Access to a server currently implies access to all project databases hosted on that server; `project_scope` is routing and provenance, not authorization.

<!-- doc-key: initialize-project -->
## Initialize the first project

After the dry run is correct, ask `nacl-init` to initialize the project and approve only the exact confirmation returned by the current plan. Initialization creates or connects the graph, waits for health, loads the schema, and records the project connection without exposing a raw password in project files.

Start with `nacl-ba`, continue with `nacl-sa`, and use `nacl-tl` for planning and delivery. Use `nacl-verify` before closure. These are public conductors; they choose the internal leaf skills.

<!-- doc-key: next-steps -->
## What's next

- [Workflows](workflows.md) — end-to-end routes.
- [Graph Setup](setup/graph-setup.md) — local, create, and connect modes.
- [Skills Guide](skills-guide.md) — select one of the ten public skills.
- [Skills Reference](skills-reference.md) — exact ten-public/sixty-internal inventory.
- [Configuration](configuration.md) — `config.yaml`, secrets, and server routing.
- [Platform guides](setup/install-macos.md) — macOS; [Linux](setup/install-linux.md); [Windows](setup/install-windows.md).

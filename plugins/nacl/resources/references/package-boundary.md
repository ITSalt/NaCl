# NaCl plugin package boundary

The cached `plugins/nacl` directory is the complete runtime package for Codex
CLI and Desktop. Public discovery is limited to the ten directories under
`skills/`. The 60 current Codex workflows remain internal under
`resources/workflows/` and are loaded deliberately by those conductors.

The package also contains the source methodology references, templates,
schemas, queries, and deterministic scripts needed by those workflows. Paths
in public skills resolve inside this plugin archive. Project configuration,
project graph state, secrets, volumes, and optional agent profiles are durable
external state and are not plugin files.

Wave 2 provides installation diagnostics but no graph gateway. Public entry
skills must return `BLOCKED` for graph mutations until later waves supply the
required MCP capability. The supported runtime prerequisite is system Node.js
20 or newer, launched from the installed cache by the same `.mcp.json` in CLI
and Desktop.

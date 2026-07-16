[Home](../../README.md) > [Quick Start](../quickstart.md) > Codex plugin

🇷🇺 [Русская версия](install-codex-plugin.ru.md)

# Install the NaCl plugin in Codex Desktop

This is the ordinary NaCl installation path for Codex users. Installation, updates, disablement, and removal happen in the Codex Plugins UI.

<!-- doc-key: availability -->
## Availability

The verified Git channel is available as the immutable [`codex-plugin-v0.1.0`](https://github.com/ITSalt/NaCl/releases/tag/codex-plugin-v0.1.0) GitHub Release. It is a public source artifact for installation through a repo marketplace, not an official Plugins Directory card. OpenAI submission and publication remain future Wave 10 work.

The GitHub tag fixes the exact source version. The installed card remains authoritative for the plugin name, plugin version, connections, and permissions. Do not install an archive or marketplace from a fork, branch, or tag that this guide does not name.

<!-- doc-key: requirements -->
## Requirements

- Codex Desktop with an authenticated account.
- Node.js 20 or newer available to the plugin runtime. Node.js 24 was tested; the exact Node.js 20 runtime is `NOT_RUN`.
- Docker only if you choose the local Neo4j graph.
- macOS Keychain only for the current optional local-graph pilot. Live Keychain bootstrap is `NOT_RUN`.

Installation verification and the first dry run do not require the graph.

<!-- doc-key: install -->
## Install through the UI from the GitHub Release

1. Open the [`codex-plugin-v0.1.0` release](https://github.com/ITSalt/NaCl/releases/tag/codex-plugin-v0.1.0) and download **Source code (zip)** from **Assets**.
2. Extract the ZIP into a permanent folder. Do not move or rename the nested `.agents/plugins/marketplace.json` or `plugins/nacl` paths.
3. In Codex Desktop, open a local folder/project and select the extracted `NaCl-codex-plugin-v0.1.0` root, not its nested `plugins/nacl` folder.
4. Open **Plugins**, select the **NaCl** marketplace, open the **NaCl** card, and choose **Install** or **+**.
5. If Codex asks for connections or permissions, compare them with the card and grant only what is displayed. The current bundle declares **Read** and **Write**; do not approve a broader or unexplained request.
6. Wait until NaCl appears as installed.
7. Fully quit Codex Desktop, reopen it, and start a new task.

If your Codex version does not show the repo marketplace after you open the folder, register the same immutable Git tag with one command, then return to the UI and complete steps 4-7:

```text
codex plugin marketplace add ITSalt/NaCl --ref codex-plugin-v0.1.0
```

The command only registers the Git marketplace. Installation, permissions, and enablement still happen in **Plugins**.

A new task is required for discovery. The full restart is part of the verified NaCl trial and also prevents a previous task from keeping stale plugin state.

<!-- doc-key: verify -->
## Verify in the new task

Send this exact request:

```text
Call nacl_installation_doctor exactly once with no arguments. Report status, mode, pluginVersion, and executionLocation. Continue only if status=VERIFIED and mode=plugin-only.
```

Verify all four fields:

- `status=VERIFIED`;
- `mode=plugin-only`;
- `pluginVersion` equals the version shown on the installed card;
- `executionLocation=installed-cache`.

Do not hardcode or infer the expected version. If any field differs, stop before project or graph work.

<!-- doc-key: lifecycle -->
## Update, reinstall, disable, uninstall, or roll back

Open **Plugins**, select the installed NaCl card, and use the action Codex displays.

- **Update:** choose **Update** when offered, then fully restart, open a new task, and verify the reported version against the updated card.
- **Reinstall:** uninstall the bundle, reopen the repo marketplace from the same GitHub tag, install the card again, fully restart, and verify in a new task.
- **Disable / enable:** toggle NaCl from its card. After enabling it again, fully restart and verify in a new task.
- **Uninstall:** choose **Uninstall plugin** on the card. This removes the bundle. It does not delete NaCl’s durable project graph, registry, audit, profile, or Keychain state. Connectors are managed separately by Codex and are not removed merely because a plugin bundle is uninstalled.
- **Roll back:** select an older explicitly published `codex-plugin-v*` release, record the current card version, uninstall it, install the marketplace from that immutable tag, fully restart, and verify that the doctor reports the version shown on that card. Never use a random branch or fork.

If an update or rollback is unavailable in the card, stop and ask the owner for the intended card; do not invent an install URL.

<!-- doc-key: cache-and-persistence -->
## Cache and persistence

An installed plugin runs from Codex’s installed cache. Editing another copy does not update the installed bundle. Update or reinstall through the card, then fully restart and create a new task before comparing the doctor result.

Replaceable plugin code is separate from durable state. Uninstall, reinstall, update, disablement, and rollback preserve project configuration, the project registry, redacted audit records, Docker graph volumes, backups, Keychain references and values, and optional project agent profiles. NaCl intentionally has no plugin action that deletes graph data.

<!-- doc-key: permissions-and-data -->
## Permissions and data handling

The current plugin card declares **Read** and **Write**. Read access supports project inspection and evidence collection. Write access is used only when a selected workflow needs an approved file or graph mutation; NaCl’s own confirmation gates do not replace the Codex permission prompt.

The package starts a local Node.js MCP process and exposes ten public skills plus bounded tools. Without the optional graph, project reads and approved project writes remain in the Codex task and project permission boundary. With the graph enabled, NaCl routes only an explicitly resolved project to a loopback Neo4j endpoint. The macOS pilot resolves the credential from Keychain in memory; the secret is not returned, logged, placed in tool arguments, or stored in the plugin cache. Graph queries are named and parameterized; arbitrary graph statements are not accepted.

Do not approve unexpected network, secret-value, unrelated-folder, or destructive-data requests. Stop and collect support evidence instead.

<!-- doc-key: confirmations -->
## Confirmations

Read-only planning must precede mutation. Review the plan, affected project, exact actions, blockers, and returned confirmation. Reply with only the confirmation returned by the latest plan. Never construct, shorten, reuse, or hardcode a token or confirmation from an example.

If state changes after planning, request a fresh plan. `BLOCKED`, `FAILED`, `PARTIALLY_VERIFIED`, `NOT_RUN`, and `UNVERIFIED` are stop states, not permission to retry blindly.

<!-- doc-key: troubleshooting -->
## Troubleshooting

| Symptom | Safe response |
|---|---|
| Marketplace or card is missing | Confirm that Codex opened the extracted release root containing `.agents/plugins/marketplace.json`. If the repo marketplace still does not appear, use the exact tagged command above. Do not substitute a branch or fork. |
| NaCl is disabled | Enable it from the installed card, fully restart, and use a new task. |
| Old version is reported | Compare with the card, run the UI update or reinstall, fully restart, and use a new task. |
| Doctor reports `both` | Stop all workflows. Use the [legacy migration appendix](codex-legacy-compatibility.md); never remove unknown artifacts. |
| Permission was denied | Keep it denied until you understand the requested scope. Retry only the intended action from a fresh task or plan. |
| Node.js is unsupported | Install a supported Node.js 20+ runtime, restart Codex, and rerun the doctor. Exact Node.js 20 remains untested; Node.js 24 is the exercised runtime. |
| Graph is stopped or unhealthy | Keep workflow writes blocked. Check Docker availability, then ask for local graph doctor, graph health, and schema status. |
| Keychain is unavailable | Keep graph work blocked. Do not paste or regenerate a credential; follow the returned recovery code. Live Keychain bootstrap is not yet verified. |
| Duplicate or ambiguous install | Keep only one mode. For plugin plus legacy links, use the bounded plan/apply migration. For duplicate cards, keep the owner-confirmed card and uninstall the other through its UI. |

<!-- doc-key: support -->
## Support evidence

Provide the owner or maintainer with:

- a screenshot of the NaCl card showing its name, version, enabled state, and displayed permissions;
- the doctor’s `contract`, `status`, `mode`, `pluginVersion`, `executionLocation`, and guidance;
- the exact workflow prompt and returned `status` / `code`;
- whether a full restart and new task were used;
- for graph failures, the graph lifecycle, health, and schema status codes.

Crop account names and unrelated workspace content. Never share credentials, Keychain values, project source or business data, personal paths, raw graph contents, or unrestricted logs.

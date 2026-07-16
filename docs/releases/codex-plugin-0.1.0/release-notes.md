# NaCl Codex Plugin 0.1.0 — immutable Git candidate

This release publishes the first immutable Git distribution of the full NaCl
Codex plugin. The plugin manifest version is
`0.1.0+codex.20260715094133`; the Git release tag is
`codex-plugin-v0.1.0`.

## Install on a clean machine

Follow the complete Russian guide:

<https://github.com/ITSalt/NaCl/blob/codex-plugin-v0.1.0/docs/setup/install-codex-plugin.ru.md>

The UI-first path downloads the release ZIP, opens its root folder in Codex,
and installs the **NaCl** card from the repo marketplace. If the current Codex
build does not discover that marketplace automatically, register the same
immutable tag once:

```text
codex plugin marketplace add ITSalt/NaCl --ref codex-plugin-v0.1.0
```

Then complete installation, permissions, restart, and verification in the
Codex **Plugins** interface.

## Included and locally verified

- 10 public NaCl skills and 60 internal workflows;
- the installed-cache MCP installation doctor and bounded local graph tools;
- optional one-container-per-project Neo4j Community topology;
- server-wide authorization routing for remote project containers;
- deterministic 392-file plugin package and assets;
- local Node, package, graph, workflow, security, privacy, Docker topology,
  rootless container, reproducibility, and OpenAI plugin-validator gates.

## Verification prompt

After a full Codex restart, create a new task and send:

```text
Вызови nacl_installation_doctor ровно один раз без аргументов. Сообщи status, mode, pluginVersion и executionLocation. Продолжай, только если status=VERIFIED и mode=plugin-only.
```

Expected execution location: `installed-cache`. The reported plugin version
must match the installed card.

## Scope boundary

This is a Git-distributed Codex plugin candidate for the cross-machine
installation gate. It is not an OpenAI Plugins Directory publication and does
not claim a deployed public MCP endpoint, production OAuth, reviewer approval,
or Marketplace publication. Local graph data is not removed when the plugin is
uninstalled.

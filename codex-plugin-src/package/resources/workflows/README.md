# Packaged NaCl workflows

This directory contains the 60 current Codex-adapted NaCl workflows as
internal plugin resources. Codex discovers only the ten conductor skills under
the plugin's top-level `skills/` directory. A conductor loads one relevant
workflow from this directory after `nacl_installation_doctor` verifies that the
plugin and legacy symlink distributions are not both active.

All resource paths resolve within the installed plugin cache. Root methodology
copies live beside this directory under `resources/nacl-*`; shared Codex
contracts live in `references/`; schemas and named queries live under
`resources/graph-infra/`.

The legacy `skills-for-codex` symlink installer remains supported from the
source repository, but it is a separate installation mode and is never called
by the plugin. Wave 2 does not expose graph mutations: workflows that require
the future gateway return `BLOCKED`.

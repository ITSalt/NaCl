# Codex plugin canonical sources

This directory contains only Codex-owned source files and deliberate workflow
overlays. The generated package lives at `plugins/nacl/` and must never be
edited by hand.

Shared methodology, scripts, graph assets, and documentation are projected
from current root sources and `skills-for-codex/` according to
`scripts/codex-plugin-manifest.json`. Build or verify the projection with:

```bash
node scripts/build-codex-plugin.mjs
node scripts/build-codex-plugin.mjs --check
```

The existing Claude builder remains independent and writes only `plugin/`.

# Vendored TOML parser provenance

- Package: `smol-toml`
- Version: `1.7.0`
- Source: `https://github.com/squirrelchat/smol-toml`
- Registry tarball: `https://registry.npmjs.org/smol-toml/-/smol-toml-1.7.0.tgz`
- npm integrity: `sha512-aqVvWoyO21L23mb+drl4RmMXbf6N7FdHjAhTRA9ZBL7apWBgfWC16KjrASI+1p9GAroljyMHj6fK67i0UiTNvQ==`
- npm shasum: `ed1b259ce7e05907df1abe758971bd0a0ef2c0dd`
- Package `dist/index.cjs` SHA-256: `a726cbf954b0f166cb6d7e0cf78c5c078f974cdb0d5792502c8ee58f9c84fdf7`
- Vendored file SHA-256: `173006d8b690034d636c1af4dc6836db8dc6a708bcd4fea90c8d04ea250afa7d`
- Transformation: package `dist/index.cjs` bytes with one terminal LF added;
  executable JavaScript content is otherwise unchanged.
- Package LICENSE SHA-256: `fa5659948374d4f555594f47f6da073b40dc503e921aeeece30df4362b3051a5`
- Vendored LICENSE SHA-256: `fa5659948374d4f555594f47f6da073b40dc503e921aeeece30df4362b3051a5`
- License: BSD-3-Clause; exact package license is stored beside the bundle.

This pinned parser is used only to validate an existing Codex TOML document
before any managed section can be appended. The vendored digests are enforced
by the Skills-only contract test inventory.

# Codex plugin 0.1.0 — immutable Git release evidence

Дата: 2026-07-16

Статус: `GIT_RELEASE_VERIFIED / SECOND_MACHINE_UI_NOT_RUN`.

## Release identity

- Release commit: `fe4aa3cab2dab9d6cb40dab0087c33ebe90e5ed9`.
- Merge commit: `453101585c44dc438a5cb54548111db55f1d0894`.
- Feature parent: `b4edfef948252fb90a81a71d69d393ea7945ba5d`.
- Tag: `codex-plugin-v0.1.0`.
- Plugin manifest version: `0.1.0+codex.20260715094133`.
- Release URL:
  `https://github.com/ITSalt/NaCl/releases/tag/codex-plugin-v0.1.0`.
- Russian installation guide:
  `https://github.com/ITSalt/NaCl/blob/codex-plugin-v0.1.0/docs/setup/install-codex-plugin.ru.md`.

The annotated tag resolves exactly to the release commit. The GitHub Release is
published, not draft, and not prerelease.

## Pre-push and post-merge verification

- Codex contracts: 259 total, 254 passed, 0 failed, 5 expected Docker skips.
- Framework Node tools: 242/242.
- Framework shell tests and Bash syntax: passed.
- Plugin package: 83/83.
- Focused metadata/package tests: 13/13.
- Production MCP Docker topology: 1/1.
- Rootless production MCP container: 1/1 on Node v20.20.0.
- Docker cleanup: zero test containers, volumes, and images.
- Claude generated parity and frozen namespaces: `VERIFIED`.
- `git diff --check`: passed.
- Public-diff private-key/token and literal home-path canary: zero matches after
  the public-evidence correction.

The first clean-worktree contract attempt lacked the lockfile dependencies
under `services/nacl-mcp/node_modules` and stopped with
`ERR_MODULE_NOT_FOUND`. `npm ci --prefix services/nacl-mcp` installed exactly
the lockfile graph with 0 audit vulnerabilities; the complete suite then
passed. This was a clean-worktree prerequisite failure, not an application
defect.

## Hosted CI on the release commit

All workflows triggered for the exact release commit completed successfully:

- Build Plugin: `https://github.com/ITSalt/NaCl/actions/runs/29480625617`;
- Test Skill Tools: `https://github.com/ITSalt/NaCl/actions/runs/29480625605`;
- Test Codex Plugin Contracts:
  `https://github.com/ITSalt/NaCl/actions/runs/29480625590`.

## Isolated Git-install smoke

The documented command was run with isolated temporary `HOME` and
`CODEX_HOME`:

```text
codex plugin marketplace add ITSalt/NaCl --ref codex-plugin-v0.1.0
```

The CLI resolved `https://github.com/ITSalt/NaCl.git`, discovered marketplace
`nacl-local`, exposed `nacl@nacl-local`, installed exact version
`0.1.0+codex.20260715094133` into the installed cache, and enabled it. Direct
execution of the cached doctor returned:

- `status=VERIFIED`;
- `mode=plugin-only`;
- `executionLocation=installed-cache`.

The disposable home was deleted after the smoke. The user's active Codex
installation was not modified.

## Remaining portability gate

This same-machine isolated smoke verifies the public Git source, immutable ref,
marketplace resolution, cache installation, exact version and doctor. It does
not replace the required user-driven clean second-machine Desktop flow:
download/open or Git marketplace registration, UI Install, permissions, full
restart, new task, doctor, first dry run, update/reinstall, uninstall and
rollback evidence.

The Git release is not an OpenAI Plugins Directory publication and does not
authorize production endpoint, OAuth, portal submission or publication.

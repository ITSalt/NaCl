# Codex plugin Wave 2 package and CLI evidence — 2026-07-14

Status: VERIFIED

## Candidate under test

- Branch: `codex/plugin-02-package-cli`
- Integration base: `e86272dca672c1a7bce144d6dd26675a329875b0`
- Plugin: `nacl`
- Version/cachebuster: `0.1.0+codex.20260714143037`
- Runtime prerequisite: system Node.js 20 or newer
- Runtime observed: Node.js 24.13.1 on macOS arm64
- Codex CLI observed: `codex-cli 0.142.0`
- Marketplace source was copied to a disposable isolated marketplace for the
  CLI E2E. The live Codex home and live marketplace were not changed.

## Implemented package boundary

The compatibility spike was replaced by a real cache-contained NaCl shell:

- 10 discoverable conductor skills: `nacl-init`, `nacl-goal`, `nacl-ba`,
  `nacl-sa`, `nacl-tl`, `nacl-fix`, `nacl-verify`, `nacl-migrate`,
  `nacl-diagnose`, and `nacl-publish`;
- 60 current Codex workflow files kept as non-discoverable internal resources;
- package-local methodology references, contracts, templates, graph schemas,
  named queries, and deterministic scripts;
- one cache-relative STDIO MCP entry exposing
  `nacl_installation_doctor`;
- an explicit package index used by closure tests;
- no symlinks in the plugin archive and no runtime fallback to a source
  checkout from an entry/internal Codex workflow.

The existing repository workflow now runs the package, closure, and isolated
legacy gates on Codex child/integration branches. The live CLI cache E2E remains
an explicit local gate because GitHub-hosted runners do not provision the Codex
CLI or Desktop app.

The conductors load only the relevant packaged leaf. All of them run the
installation doctor first. Wave 2 intentionally exposes no graph mutation:
graph, Docker, registry, secret, schema, or project-MCP writes return
`BLOCKED` until the graph gateway is implemented.

## Installation diagnostics

The doctor contract is `nacl-codex-installation-v1` and was exercised in all
four required modes:

| Mode | Result | Expected action |
|---|---|---|
| plugin only | `VERIFIED` | use plugin entry skills |
| legacy symlinks only | `VERIFIED` | use legacy `nacl-*` skills |
| plugin plus legacy | `FAILED` | remove one installation mode and start a new task |
| neither | `BLOCKED` | install the plugin or use the legacy installer |

The MCP returns `isError=true` for the double-install conflict, so a conductor
cannot honestly continue past the required preflight.

Legacy detection now validates artifacts instead of trusting a matching name.
Every `nacl-*` entry must resolve to a directory containing a readable regular
`SKILL.md` whose frontmatter `name` matches the directory entry. Empty
directories, broken symlinks, and mismatched frontmatter return
`invalid-legacy-artifacts/FAILED` with scoped repair guidance; they are neither
silently absent nor valid legacy installations.

The shared legacy `nacl-core`, `nacl-tl-core`, and `nacl-goal` contracts, plus
the standalone SA migration edge case, also reuse the doctor when the plugin
tool is present. A static coverage test proves that every one of the 60
legacy-discovered skills either owns this guard or loads a guarded core. Thus a
direct legacy leaf cannot silently bypass the conflict check when both delivery
modes are visible. If the MCP doctor is absent or fails, the guarded legacy
entry runs the deterministic catalog fallback against the current
`codex plugin list --json`. It returns `FAILED` when NaCl is installed and
enabled, `VERIFIED/legacy-only` only when NaCl is proven absent, and `BLOCKED`
for a disabled artifact, unavailable CLI, nonzero listing, or malformed
catalog. Tests use an isolated fake CLI to prove the active-plugin and
no-plugin branches without reading or copying live credentials. The helper
path is resolved relative to the directory containing the owning loaded
`SKILL.md` (including a user-level symlink), never relative to the project cwd;
static tests require every direct guard's exact helper target to exist.

The behavioral regression also runs the unchanged installer in an isolated
home and invokes the helper through the resulting user path
`~/.agents/skills/nacl-core/scripts/nacl-installation-fallback.mjs`. Canonical
realpath entrypoint detection preserves structured output through that symlink:
catalog absent, plugin enabled, and catalog unavailable produce non-empty JSON
with exit codes 0, 1, and 2 respectively. An unresolved direct entrypoint fails
closed instead of silently returning success.

## Cache/source-unavailable CLI proof

Command:

```sh
bash scripts/codex-plugin-ci.sh test:cli-plugin \
  --output /tmp/nacl-wave2-cli-final.json
```

Result: exit 0, `Status: VERIFIED`.

The test created isolated `HOME` and `CODEX_HOME`, configured a disposable
repo marketplace, installed `nacl@personal`, renamed the disposable source
plugin away, asked `codex mcp list --json` for the configured transport, and
invoked `nacl_installation_doctor` directly through that cache transport.

Observed report fields:

```text
sourceUnavailable=true
pluginVersion=0.1.0+codex.20260714143037
executionLocation=installed-cache
entrySkillCount=10
codexVersion=codex-cli 0.142.0
modelBackedRouting.status=NOT_RUN
```

All ten cached entry-skill SHA-256 hashes matched the source archive. The CLI
cache therefore contains the same entry files as the package archive, and Wave
2 did not create host-specific skill implementations. This gate installs,
lists, hash-checks, and directly invokes the MCP transport; it does not prove
model-backed skill discovery or routing.

The model-backed new-task smoke is explicitly `NOT_RUN`. The isolated gate
intentionally inherits no Codex credentials, and copying live credentials into
the fixture would violate its safety boundary. No `codex exec` claim is made
for the Wave 2 follow-up.

## Legacy CLI proof

Command:

```sh
bash scripts/codex-plugin-ci.sh test:cli-legacy
```

Result: exit 0, `Status: VERIFIED`.

- first isolated-home run: 60 symlinks created, 0 blocked;
- second run: 60 already present, 0 blocked;
- POSIX installer SHA-256 stayed
  `f5b98809526a1dab5e5e6fbf074f111cff573c0aa31dd49ea2ef016e76cbb9c5`;
- PowerShell installer SHA-256 stayed
  `0c8c4164cf89da505207e381eae258bacbe8e415034b2ee23a1fdd1419353f24`.

The same isolated run proved `legacy-only=VERIFIED`, `both=FAILED`, and
`neither=BLOCKED`.

## Validation and regression evidence

| Command | Result |
|---|---|
| `bash scripts/codex-plugin-ci.sh test:contracts` | exit 0; 189 Node tests, six tracked shell suites, and tracked shell syntax checks passed |
| `bash scripts/codex-plugin-ci.sh test:codex-skills` | exit 0; existing 60/60 legacy Codex skills validated |
| `bash scripts/codex-plugin-ci.sh test:claude-isolation` | exit 0; 62 frozen roots, identical manifest hash `cb85ebb130277286b5e0fbb7efd240575544c490` |
| `bash scripts/codex-plugin-ci.sh test:plugin-manifest` | exit 0; pinned official plugin validator accepted the package |
| `bash scripts/codex-plugin-ci.sh test:plugin-package` | exit 0; 10/10 official entry-skill validation and 38/38 package/protocol/adversarial tests |
| `bash scripts/codex-plugin-ci.sh test:plugin-closure` | exit 0; 303 package files, 10 public skills, 60 internal workflows, 310 active inline paths, 22 command paths, 59 provenance paths, and two source-only annotations |
| `bash scripts/codex-plugin-ci.sh test:cli-legacy` | exit 0; isolated legacy install/update and conflict diagnostics verified |
| `bash scripts/codex-plugin-ci.sh test:cli-plugin --output /tmp/nacl-wave2-cli-final.json` | exit 0; cache/source-unavailable CLI E2E verified |
| `git diff --cached --check` | exit 0 |

The closure gate covers:

- manifest and MCP component paths;
- every local Markdown link;
- active package-local paths in Markdown backticks;
- inline and fenced command paths, with synthetic missing-target failures;
- separately counted `Source Claude skill path:` provenance references;
- explicit non-executable `source-only:` upstream comparisons;
- relative JavaScript imports and URL resources;
- shell imports, including package `SKILLS_DIR` imports;
- local Python migration-package imports;
- indexed contracts, templates, schemas, queries, and executables;
- public/internal workflow checkout-path fallbacks;
- symlinks and path escapes;
- developer-specific absolute paths;
- private-key and token-like material;
- committed Neo4j password defaults.

## ADR disposition

ADR-003 now accepts, for the local pilot:

- `plugins/nacl/` as the cacheable package boundary;
- the validator-compatible camel-case MCP companion launched relative to the
  installed cache;
- system Node.js 20 or newer as the declared runtime prerequisite.

Project state, project identities, secrets, graph volumes, and optional agent
profiles remain durable external state and are not plugin files.

## Known limitations and next-wave obligations

- Node.js 24.13.1 was exercised; the guarded Node.js 20 lower bound was not run
  on a Node 20 host.
- Wave 2 has no operational graph gateway. Bundled graph-oriented methodology
  scripts are internal resources and are not enabled by the conductors. Wave 3
  must replace/finalize their graph secret, argv, project `.mcp.json`, lifecycle,
  and read/write contracts before any graph operation can become runnable.
- The ten new conductors were proven with the official validator, routing
  budget tests, and cached CLI hash parity. Model-backed `codex exec` routing
  and a new Desktop discovery run are `NOT_RUN` and belong to later integrated
  gates.
- The user's currently installed Desktop candidate remains the Wave 1 build
  `0.1.0+codex.20260714133724`. Wave 2 was not live-installed, and that Desktop
  screenshot/version is not used as Wave 2 evidence.
- The internal methodology is a package snapshot; an automatic whole-snapshot
  drift guard is not implemented. Later source changes need an explicit
  copy/sync check to prevent drift.
- GitHub-hosted CI was not run. All evidence above is local and inspected.

No merge, push, tag, publication, live plugin reinstall, live marketplace
change, or production infrastructure mutation was performed.

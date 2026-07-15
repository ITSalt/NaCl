# Codex Plugin Wave 1 Desktop Lifecycle Evidence

**Captured:** 2026-07-14 (Europe/Moscow)

**Worker branch:** `codex/plugin-01-runtime-spike`

**Initial reviewed worker SHA:** `2a8d1650b104c79cb4af89ada9797c3f1b50348a`

**Corrected worker SHA:** `80cb9070096b7a4eeade8137ff643afaaddf7a02`

**Current plugin version:** `0.1.0+codex.20260714133724`

**Initial result:** FAILED

**Current status:** VERIFIED

## Verified before Desktop operation

- The official plugin validator passed.
- The corrected schema-3 CLI matrix passed all three compatibility shapes.
- Cached MCP execution survived source unavailability.
- Cachebuster/reinstall/new-task behavior passed under the CLI.
- An independent verifier accepted the CLI evidence with no open findings.
- The user checkout remained untouched.

The detailed CLI evidence is in
`docs/research/codex-plugin-wave-1-runtime-spike-2026-07-14.md` on the worker
branch at the reviewed SHA.

## Live installation

The repo marketplace was added as `personal` and `nacl@personal` was installed
into the live Codex home. Installation returned the reviewed plugin version and
a cache path under:

```text
~/.codex/plugins/cache/personal/nacl/0.1.0+codex.20260714115317
```

Both the shell Codex CLI `0.142.0` and the exact Codex binary bundled with the
Desktop app, version `0.144.2`, reported the plugin enabled and the
`nacl-spike` STDIO transport enabled with its cwd inside that cache. The
bundled CLI prompt inventory also contained the installed
`nacl:nacl-spike-health` skill.

No unrelated marketplace or plugin was changed. The spike was left installed
for the post-restart check so that the same bytes could be tested without
reinstalling.

## Desktop task results

Three new Desktop tasks were created after installation:

| Task | Scope | Result |
|---|---|---|
| `019f6098-522b-7212-ab45-b96529973d95` | projectless | `nacl_spike_health` unavailable; no approval prompt |
| `019f609b-11d5-7f41-9a26-65d6e485dab9` | projectless retry after settling time | `nacl_spike_health` unavailable; no approval prompt |
| `019f609d-0199-7372-bdff-83aef178ecc7` | local NaCl project | `nacl_spike_health` unavailable; no approval prompt |

The matching failure across projectless and project-scoped tasks rules out the
task target as the cause. Because the tool was not present in the task tool
inventory, no server approval or runtime launch was attempted by Desktop.

## Lifecycle diagnosis

The running ChatGPT process and its app-server predated the live plugin
installation. Fresh invocations of the bundled CLI see the new plugin and MCP,
but new tasks created by the already-running Desktop host do not. The current
app-server protocol contains an internal MCP reload request, but this Codex
session exposes no supported app tool that can invoke it.

The official plugin-creator update guidance says to reinstall and start a new
thread. It does not document a mandatory full-app restart. Therefore a restart
is an empirical diagnostic for this Desktop build, not an accepted product
contract.

## Post-restart result

The user normally quit and reopened ChatGPT/Codex. The replacement processes
started after installation:

| Process | New start time |
|---|---|
| ChatGPT | 2026-07-14 15:56:52 Europe/Moscow |
| Codex code-mode host | 2026-07-14 15:58:11 Europe/Moscow |

Before the next task, the same installed plugin version and cache path were
confirmed with the bundled CLI. No reinstall or package change occurred.

Fresh project-scoped Desktop task
`019f60b5-073b-7452-ab6d-bcb20321959b` again reported that
`nacl_spike_health` was absent from its callable tool set. No approval prompt or
MCP call occurred.

This rejects the stale-process-only hypothesis. The CLI host accepts and runs
the package, while Codex Desktop build `26.707.71524` with bundled CLI `0.144.2`
does not surface its plugin-provided MCP tool to new tasks on this machine.
There is no supported reload or launch fallback in the refreshed official
contract that satisfies the runbook acceptance gate.

## Rollback and disposition

The bundled CLI removed only `nacl@personal` and marketplace `personal`.
Post-removal checks found zero installed `nacl@personal` entries, zero
`personal` marketplaces, and zero visible `nacl-spike` MCP entries. All 15
unrelated installed plugins and all four unrelated marketplaces remained.

At that point Wave 1 was marked `FAILED` for Desktop compatibility, the worker
branch was not merged, Wave 2 had not started, and no checkout-path or
undocumented launch workaround was introduced. The corrected evidence below
supersedes that disposition.

## Corrected Desktop protocol candidate

Subsequent sanitized Desktop lifecycle evidence showed that the plugin-provided
STDIO server did start from the installed cache and complete MCP initialization.
Desktop then sent `tools/list` with standard request extensions, and the spike's
strict validator returned JSON-RPC `-32602` (`invalid tools/list parameters`).
The tool therefore never entered the Desktop task inventory. This supersedes
the earlier diagnosis that Desktop had not attempted runtime launch.

Worker commit `80cb9070096b7a4eeade8137ff643afaaddf7a02` narrowly allows the
standard optional request `_meta` object alongside the optional pagination
cursor. Invalid cursors, non-object metadata, and unknown top-level parameter
fields remain rejected. The cachebuster helper updated the version to
`0.1.0+codex.20260714132100`.

Independent verification reported:

- official plugin validator: exit 0;
- focused STDIO protocol suite: 9/9 passed;
- Wave 1 plugin suite: 31/31 passed;
- disposable-home CLI/cache/source-unavailable/reinstall matrix: `VERIFIED`,
  zero failures;
- package path/link/secret scan: clean;
- worker worktree: clean.

The non-default worker marketplace root was then persistently registered as
`personal` through the supported marketplace command. Live catalog checks
reported `nacl@personal` installed and enabled at the corrected version, with
the installed copy under:

```text
~/.codex/plugins/cache/personal/nacl/0.1.0+codex.20260714132100
```

A live CLI task invoked `nacl_spike_health`. A direct protocol check using the
same installed cache returned `status=ok`, listed the health tool, reported
`executionLocation=installed-cache`, and matched the corrected plugin version.
The default shell CLI could not use the configured `gpt-5.6-sol` model because
that CLI build is too old; the successful smoke used the newer Desktop-bundled
CLI with an explicitly supported model. This model/CLI mismatch is separate
from plugin ingestion.

The remaining Wave 1 gate is a post-update Desktop restart followed by a new
task that discovers and invokes `nacl_spike_health`. Until that host check runs,
the corrected Wave 1 candidate is `PARTIALLY_VERIFIED`, and Wave 2 remains
`NOT_RUN`.

## Desktop discovery success and call-metadata correction

After installing `0.1.0+codex.20260714132100` and fully restarting Desktop, a
new task displayed `nacl_spike_health` and invoked it with
`echo=desktop-final`. This verifies the persistent marketplace, installed
plugin visibility, cached server startup, initialization, and `tools/list`
metadata correction in the real Desktop host.

The call returned JSON-RPC `-32602` (`invalid tools/call parameters`). The
remaining incompatibility was the same bounded protocol issue on the call
path: Desktop attached standard request `_meta`, while the spike allowed only
`name` and `arguments`.

Worker commit `f0291ca562ee770b60b3a9f667522add09c07eb4` allows an optional
object `_meta` in `tools/call` parameters. It continues to reject non-object
metadata, unknown top-level fields, unknown tools, and malformed health
arguments. The cachebuster helper produced
`0.1.0+codex.20260714133724`.

Independent verification reported validator exit 0, 10/10 focused protocol
tests, 32/32 Wave 1 plugin tests, a `VERIFIED` disposable CLI/cache matrix with
zero failures, clean package/path/secret checks, and a clean worker tree. The
corrected version was merged into integration, reinstalled from the persistent
`personal` marketplace, and reported installed and enabled in the live catalog.

A metadata-bearing `tools/list` plus `tools/call` check against the exact live
installed cache returned no call error, `status=ok`, the requested echo,
`executionLocation=installed-cache`, and the corrected version. The only
remaining Wave 1 gate at that point was the same call from a new task after one
more Desktop restart.

## Final Desktop E2E

After a full Desktop restart, the user opened a new task and requested exactly
one `nacl_spike_health` call with `echo=desktop-final`. Desktop discovered the
namespaced `nacl:nacl-spike-health` skill, loaded its MCP tool, invoked the
installed integration, and returned:

```text
contract=nacl-codex-plugin-wave-1
status=ok
echo=desktop-final
pluginVersion=0.1.0+codex.20260714133724
executionLocation=installed-cache
platform=darwin
architecture=arm64
```

The reported script path and working directory were both under the installed
cache at `~/.codex/plugins/cache/personal/nacl/0.1.0+codex.20260714133724`, not
the source checkout. Independent verification accepted Desktop discovery,
skill routing, MCP invocation, the exact contract/version/echo, successful
status, and installed-cache execution. Wave 1 is therefore `VERIFIED`.

Cross-machine portability and production distribution/update behavior remain
later-wave concerns; they are not claims of this compatibility spike.

## Security note

During host inspection, two local diagnostic commands emitted configured MCP
environment values into this task's local transcript. Those values were not
copied into repository artifacts or reports. Affected credentials should be
rotated outside this pilot.

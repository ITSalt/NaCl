# Codex Plugin Wave 1 Runtime Spike Evidence

**Captured:** 2026-07-14 (Europe/Moscow)

**Branch:** `codex/plugin-01-runtime-spike`

**Integration base:** `039daa80eb108e5647e2e6df2e68d8b4d0063a71`

**Status:** PARTIALLY_VERIFIED

The CLI compatibility spike passed plugin ingestion, cache-local MCP launch,
source-unavailable execution, cachebuster reinstall, and new-task tool
invocation. Desktop verification is `NOT_RUN`; Wave 1 is therefore not fully
accepted and ADR-003 remains Proposed for cross-host launch and runtime.

## Pinned Host And Helper Contract

| Item | Observed value | Exit |
|---|---|---:|
| Codex CLI | `codex-cli 0.142.0` | 0 |
| ChatGPT desktop inventory | `26.707.71524`, build `5263` | 0 |
| Node.js | `v24.13.1`, `arm64` | 0 |
| Python | `3.14.5` | 0 |
| `plugin-creator/SKILL.md` SHA-256 | `8fd56316b2c49cbdc657a5d197967a233018e1fada65b00a5dd030dce6499a6e` | 0 |
| `create_basic_plugin.py` SHA-256 | `b5aa34f7f9dcec4bb007a66d65cff0c5c77a67042ae6c4de57d8ab7f4ef737d2` | 0 |
| `validate_plugin.py` SHA-256 | `ebda00d55d7518b127f675f062fb5c6e7a1ffdc0a99df1a55ac594400d7d3228` | 0 |
| `update_plugin_cachebuster.py` SHA-256 | `4fe3c5a49212f6e30a2306e245c460e01aaf5e36bc8ad3dd2852c199257eff89` | 0 |
| `read_marketplace_name.py` SHA-256 | `7659216759152f83087020b4d2971b4ad3cc13851e2614efc30fc2317ad59d96` | 0 |

`codex plugin marketplace list --json` and the default personal marketplace
file check found no existing `personal` marketplace. The official scaffolder's
default `personal` name was therefore non-conflicting; no unnecessary
`--marketplace-name` override was used. Unrelated marketplace/config entries
and authentication material are omitted.

## Scaffold And Active Candidate

The initial repository marketplace and plugin manifest were created, not hand-
written, with the current helper:

```sh
python3 "$PLUGIN_CREATOR/scripts/create_basic_plugin.py" nacl \
  --path "$WORKTREE/plugins" \
  --marketplace-path "$WORKTREE/.agents/plugins/marketplace.json" \
  --with-skills --with-scripts --with-mcp --with-marketplace
```

Exit: 0. `read_marketplace_name.py --marketplace-path
$WORKTREE/.agents/plugins/marketplace.json` printed `personal`, exit 0. The
official validator passed the final package, exit 0. The committed candidate
version was updated only through the official cachebuster helper to
`0.1.0+codex.20260714115317`, exit 0.

The active `.mcp.json` is the validator-compliant companion wrapper. It launches
dependency-free `scripts/nacl-spike-mcp.mjs` with system `node`, a package-
relative argument, and `cwd: "."`. The server exposes only
`nacl_spike_health`; its diagnostics contain the running script path, cwd,
plugin version, Node executable/version, platform, and architecture. It never
reads or emits the environment.

## Disposable-Home Shape Matrix

Command:

```sh
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT
node scripts/codex-plugin-wave1-matrix.mjs \
  --output "$output_file"
```

Exit: 0. Every shape used its own generated marketplace copy plus distinct
disposable `HOME` and `CODEX_HOME` directories under its shape root; the
normal flow removed its work root in `finally`. Invalid alternatives were
never committed as the active plugin.

| `.mcp.json` shape | Validator | Marketplace add/list/plugin add | `codex mcp list` | Config-derived STDIO tool call | Failure mode |
|---|---:|---:|---|---:|---|
| Camel-case companion wrapper | 0 | 0 / 0 / 0 | `nacl-spike` visible | 0 | None in CLI |
| Public direct map | 1 | 0 / 0 / 0 | `nacl-spike` visible | 0 | Validator rejects top-level `nacl-spike` and missing `mcpServers` wrapper |
| Public snake-case wrapper | 1 | 0 / 0 / 0 | Empty | `NOT_RUN` | Validator rejects `mcp_servers`; CLI exposes no MCP transport |

All three remove operations and post-remove list operations exited 0. For the
two CLI-visible forms, the matrix invoked the STDIO command, args, and cwd read
from `codex mcp list --json`, rather than substituting a checkout path.

### Fail-closed correction

The first matrix implementation recorded child exits but did not assert them,
so its process could exit 0 after a failed Codex command. The corrected schema-3
report has machine-readable `overallStatus`, global `checks`, top-level
`failures`, and per-shape statuses/checks/failures. The pure evaluator asserts
helper hashes, the pinned CLI version, every expected child exit and JSON
payload, marketplace/plugin state, cache path and exact contents, source
unavailability, MCP visibility or expected invisibility, tool health fields,
cachebuster/reinstall version and path changes, and removal state.

A second verifier found that suffix-only cache checks could still pass if a
Codex child ignored `CODEX_HOME` and returned a live cache path. The final
bounded correction records each work/shape/home/cache path together with its
filesystem realpath. It asserts the exact work-root → shape-root → disposable
`HOME`/`CODEX_HOME` relationships and requires initial and reinstalled caches
to equal the expected versioned path beneath the exact canonical
`CODEX_HOME`. The only raw/canonical spelling exception is the bounded macOS
system-temporary-directory realpath alias through the `/private` prefix;
arbitrary canonical and symlink escapes fail.

Codex CLI and the directly invoked STDIO server now receive an allowlisted
child environment plus the two disposable homes. Live MCP and credential
environment values are not inherited or recorded. Deterministic mutations
prove failure for `codexHome=$HOME/.codex`, escaping `HOME`, an
outside cache with the correct suffix, a canonical `CODEX_HOME` escape, and a
canonical cache escape. A positive synthetic case proves the bounded macOS
`/private` equivalence.

The strict normal matrix exited 0 with `overallStatus: VERIFIED`, no failures,
and all three per-shape statuses `VERIFIED`. The snake-case status is an
asserted expected-negative: validator exit 1, empty MCP list, null invocation,
and the exact invisibility diagnostic all passed checks; it is not a skipped
success. `--prepare-only` exited 0 with `overallStatus: NOT_RUN` and all shape
statuses `NOT_RUN`.

The final schema-3 live run also reported the initial cache for every shape as
the exact canonical path
`<canonical CODEX_HOME>/plugins/cache/personal/nacl/<source version>`; each of
the three exact-path comparisons was true.

The process-level negative probe was:

```sh
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT
node scripts/codex-plugin-wave1-matrix.mjs \
  --codex /usr/bin/false \
  --output "$output_file"
```

It wrote a report with `overallStatus: FAILED`, named
`matrix.codexVersion.exit` as the first failure, printed a concise `Matrix
FAILED` diagnostic, and exited 1. Deterministic synthetic reports separately
prove failures for child exits, unexpected invalid-shape acceptance, unexpected
snake visibility, cache violations, source-unavailable health drift,
helper-hash drift, disposable-home escapes, same-suffix outside caches, and
canonical/symlink escapes without requiring Codex or a model.

## Cache And Source-Unavailable Proof

In the historical text listings below, `$SYSTEM_TEMP` is a documentation-only
placeholder for the system-selected temporary root. It is not a runnable shell
variable; runnable examples above allocate their paths with `mktemp`.

For the accepted companion form, initial install returned:

```text
$SYSTEM_TEMP/nacl-codex-plugin-wave1-matrix-RUN_ID/camel-case-companion/codex-home/plugins/cache/personal/nacl/0.1.0
```

`codex mcp list --json` resolved cwd to that cache directory. After renaming
the disposable marketplace source `plugins/nacl` to `plugins/nacl.unavailable`,
MCP listing and the health call still exited 0. The response reported
`executionLocation: installed-cache`, version `0.1.0`, and both `scriptPath`
and `cwd` under the cache above.

The cache contained only the manifest, `.mcp.json`, server script, and spike
skill. Its recursive scan found zero symlinks, developer absolute paths,
secret-like tokens, or files outside the package. The runtime diagnostic's
system Node executable path is host inventory, not a hardcoded package or
config value.

## MCP Protocol And Startup Failure Contract

The server now validates JSON-RPC 2.0 envelopes, request IDs, object params,
and method-specific params. `nacl_spike_health` requires one non-empty string
`echo`, rejects extra properties, and publishes both `required: ["echo"]` and
`additionalProperties: false`. Requests with a non-2.0 envelope fail with
`-32600`; invalid method params fail with `-32602`; notifications without an ID
never emit a response. Malformed JSON returns a constant parse error without
reflecting input.

The manifest is parsed and validated before STDIO processing. Missing,
malformed, wrong-name, or non-semver manifest state exits 1 with one generic
message that contains no absolute path. Deterministic tests cover malformed
JSON and invalid manifest contract cases from isolated package copies.

## Cachebuster Reinstall And New CLI Task

The matrix called the official helper on its disposable source copy:

```sh
python3 "$PLUGIN_CREATOR/scripts/update_plugin_cachebuster.py" \
  "$MARKETPLACE_COPY/plugins/nacl"
codex plugin add "nacl@$(python3 "$PLUGIN_CREATOR/scripts/read_marketplace_name.py" \
  --marketplace-path "$MARKETPLACE_COPY/.agents/plugins/marketplace.json")" --json
```

Both commands exited 0. Version changed from `0.1.0` to
`0.1.0+codex.20260714115005`; reinstall returned the new cache path ending in
that version. Config-derived STDIO calls before and after the source was made
unavailable returned the updated version, exit 0.

A separate bounded `codex exec` run used another disposable `CODEX_HOME`, a
disposable marketplace copy, copied authentication without printing it, an
empty task directory, and an unavailable source directory. The first
read-only/non-interactive attempt exited 0 at the process level but the tool
event failed with `user cancelled MCP tool call`, demonstrating that approval
was required. The isolated proof was repeated with explicit bypass authority:

```sh
CODEX_HOME="$DISPOSABLE_CODEX_HOME" codex exec --json --ephemeral \
  --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox \
  -C "$TASK_DIR" \
  'Call the nacl_spike_health MCP tool exactly once with echo "codex-exec-proof".'
```

Exit: 0. The MCP event completed from cache at version `0.1.0`. After the
official helper and reinstall, a new command/task with echo
`codex-exec-cachebuster-proof` also exited 0 and completed from:

```text
$SYSTEM_TEMP/nacl-wave1-exec.RUN_ID/codex-home/plugins/cache/personal/nacl/0.1.0+codex.20260714115122
```

The second response reported the same updated plugin version. The bypass flag
was limited to this disposable compatibility test and is not part of CI or
installation guidance.

## Disposable Artifact Cleanup

The negative process and isolated-copy tests now remove their exact `mkdtemp`
roots in `finally`. Normal matrix evidence no longer uses `--keep`. Without
reading authentication contents, the correction removed the retained Wave 1
root classes below. Concrete host prefixes and random run suffixes are
normalized in this historical record:

```text
$SYSTEM_TEMP/nacl-codex-plugin-wave1-matrix-RUN_ID_A
$SYSTEM_TEMP/nacl-codex-plugin-wave1-matrix-RUN_ID_B
$SYSTEM_TEMP/nacl-matrix-negative-RUN_ID_A
$SYSTEM_TEMP/nacl-matrix-negative-RUN_ID_B
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_A
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_B
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_C
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_D
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_E
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_F
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_G
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_H
$SYSTEM_TEMP/nacl-spike-copy-RUN_ID_I
$SYSTEM_TEMP/nacl-wave1-exec.RUN_ID
$SYSTEM_TEMP/nacl-wave1-probe.RUN_ID
```

Post-removal prefix scan result: `REMAINING_WAVE1_TEMP_ROOTS 0`. The removed
`nacl-wave1-exec.RUN_ID` root contained the disposable copied authentication
file; neither cleanup nor evidence generation read its contents. Associated
ad-hoc `$SYSTEM_TEMP/nacl-wave1-*` JSON/stdout/stderr files from these runs were also
removed after the durable evidence was recorded here.

## Deterministic Gates

| Command | Exit | Result |
|---|---:|---|
| `bash scripts/codex-plugin-ci.sh test:plugin-manifest` | 0 | Pinned official validator `VERIFIED` |
| `bash scripts/codex-plugin-ci.sh test:plugin-spike` | 0 | 30 passed, 0 failed |
| `bash scripts/codex-plugin-ci.sh test:contracts` | 0 | 181 Node tests plus all tracked shell tests/syntax gates passed |
| `bash scripts/codex-plugin-ci.sh test:codex-skills` | 0 | 60 validated, `VERIFIED` |
| `bash scripts/codex-plugin-ci.sh test:claude-isolation f81b17732ec0b44d0e5dbad2d444c2cddc0e9818 HEAD` | 0 | Frozen manifests identical, `VERIFIED` |
| `sh skills-for-codex/scripts/check-root-codex-sync.sh d98f7399e7b9941341421321407ad27ee895d221 HEAD` | 0 | `VERIFIED` |
| `sh scripts/check-branch-literals.sh` | 0 | No hardcoded shell-fence branch literals |
| `git diff --check` | 0 | Clean |

The pinned plugin validator, license, and notice hashes are verified before CI
execution. Ordinary CI performs no Codex/model/Desktop calls.

## Gate Disposition And Limitations

- **G2 CLI scope:** verified. Validator passes, package paths close under the
  plugin root, and cached execution survives source unavailability.
- **G3 Wave 1 CLI scope:** verified for marketplace add/list/install/remove,
  MCP visibility, tool invocation, and cachebuster reinstall/new task. Legacy
  symlink/double-install diagnostics remain Wave 2 work.
- **G4 Desktop:** `NOT_RUN`. No Desktop task, Desktop MCP process evidence,
  approval UI, or restart persistence was claimed by this worker.
- **Runtime prerequisite:** CLI resolved system Node 24.13.1. The server's
  Node 20 guard is actionable but is not a cross-host minimum-version proof.
- **Offline meaning:** the installed STDIO server has no dependencies or
  network calls; the model-backed `codex exec` proof itself was online.

Independent Desktop operation is the remaining blocker before ADR-003 can
accept the launch shape and runtime prerequisite across both hosts.

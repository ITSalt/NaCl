# Codex Plugin Wave 0 Baseline Evidence

**Captured:** 2026-07-14 (Europe/Moscow)
**Worker branch:** `codex/plugin-00-baseline`
**Worker starting SHA:** `f81b17732ec0b44d0e5dbad2d444c2cddc0e9818`
**Audited plan base:** `d98f7399e7b9941341421321407ad27ee895d221`
**Status:** PARTIALLY_VERIFIED

This artifact records the state observed before Wave 0 edits. Baseline capture
completed, but a pre-existing branch-literal lint failure remains in the
orchestrator-owned runbook. This artifact does not claim
that a plugin candidate exists or that CLI/Desktop plugin E2E has run. No fetch
was authorized, so remote freshness is `UNVERIFIED`. Secrets and unrelated MCP
configuration values are omitted.

## Starting-State Drift

| Snapshot fact | Revalidated state | Drift |
|---|---|---|
| Audited checkout on `main` at `d98f739…` | Isolated worker branch at `f81b177…` | Expected: `f81b177…` adds only the orchestrator runbook to the audited base. |
| Latest reachable release `v2.23.0` | `v2.23.0` | None. |
| 60 Codex skills / 59 root source skills | 60 / 59 | None. Documentation still said 58 or 59 in Codex-owned files. |
| No tracked repo plugin/marketplace | No `.codex-plugin/plugin.json`, `plugins/nacl/.codex-plugin/plugin.json`, or `.agents/plugins/marketplace.json` | None. |
| No NaCl/Neo4j MCP entry | `codex mcp list` contained no case-insensitive `nacl` or `neo4j` match | None. |
| Codex CLI 0.142.0 | `codex-cli 0.142.0` | None. |
| Known Codex skill validation defect | Only `skills-for-codex/nacl-postmortem/SKILL.md` failed, because its description contained angle brackets | None. |

The original user checkout's untracked `.codex/` and presentation file were not
inspected or modified from this worker. Original-checkout preservation remains a
G0 orchestrator verification item. The isolated worker was clean before edits.

## Runtime Inventory

| Component | Observed version | Command exit |
|---|---|---|
| Codex CLI | `0.142.0` | 0 |
| ChatGPT desktop app | `26.707.71524` (build `5263`) | 0 |
| Node.js | `v24.13.1` | 0 |
| Python | `3.14.5` | 0 |
| Docker | `29.6.1` | 0 |
| Docker Compose | `v5.2.0` | 0 |

`codex plugin --help`, `codex plugin marketplace --help`, `codex plugin list`,
and `codex mcp list` all exited 0. The plugin list contained installed non-NaCl
plugins but no NaCl entry.

## Docker And Graph State

`docker ps` and `docker system df` both exited 0. Seven unrelated containers
were running. Two existing Neo4j containers published HTTP/Bolt ports on all
interfaces (`0.0.0.0`/`::`), which is not acceptable for the future pilot but
is baseline state outside this worker's mutation scope. Wave 0 made no Docker
change.

Baseline disk inventory:

| Type | Total | Active | Size | Reclaimable |
|---|---:|---:|---:|---:|
| Images | 62 | 24 | 47.42 GB | 26.85 GB |
| Containers | 44 | 7 | 52.89 GB | 33.44 GB |
| Local volumes | 60 | 44 | 10.2 GB | 962.6 MB |
| Build cache | 25 | 0 | 759.5 MB | 0 B |

## Deterministic Command Baseline

| Command | Exit | Evidence |
|---|---:|---|
| `git status --short` | 0 | Empty before worker edits. |
| `git branch --show-current` | 0 | `codex/plugin-00-baseline`. |
| `git rev-parse HEAD` | 0 | `f81b17732ec0b44d0e5dbad2d444c2cddc0e9818`. |
| `git merge-base --is-ancestor feature/multi-user-shared-graph main` | 0 | Required ancestor relation holds. |
| `sh skills-for-codex/scripts/check-root-codex-sync.sh d98f7399e7b9941341421321407ad27ee895d221 HEAD` | 0 | `Status: VERIFIED`. |
| `bash -lc 'tests=$(git ls-files "*/scripts/*.test.mjs"); node --test $tests'` | 0 | 140 tests passed, 0 failed. |
| CI loop over `git ls-files "*/scripts/*.test.sh"` | 0 | 3 files passed: 23 assertions total. |
| CI loop with `bash -n` over `git ls-files "*/scripts/*.sh"` | 0 | 18 tracked shell tools parsed. |
| Bundled `quick_validate.py` over sorted Codex skill inventory | 1 | 60 checked; 59 valid; only `nacl-postmortem` failed on angle brackets. |
| `sh scripts/check-branch-literals.sh` | 1 | Baseline runbook line 675 contains the literal command `git merge-base --is-ancestor feature/multi-user-shared-graph main`. The line is present at `f81b177…`; this worker is forbidden to edit the runbook or weaken the gate. |

The literal `FAIL` line in the Node output is fixture data from
`classify-status` tests; the Node TAP summary was 140 passed and 0 failed.

## Frozen Claude-Path Baseline

Frozen scope is `.claude/**` plus all 61 root directories whose names begin
with `nacl-`. This deliberately includes root support packages, not only the 59
directories containing `SKILL.md`.

| Evidence | Value |
|---|---|
| Recorded comparison base | `f81b17732ec0b44d0e5dbad2d444c2cddc0e9818` |
| `.claude` Git tree | `c9667985cebb46bd1e7bdf315d9d2d24fbced4f2` |
| Aggregate SHA-256 of sorted path/tree pairs | `220a7787b968b1c11143b065d1d610cc3dc4ffa1fc762f0d6cdf0b240c86120a` |
| `git diff` across frozen paths at baseline | Exit 0; no paths changed |

The executable gate reads
`tests/codex-plugin/claude-frozen-base.txt`, compares the candidate Git tree to
that base, and also rejects staged, unstaged, or untracked frozen-path changes
when run against `HEAD`. The recorded and requested bases must both be the same
literal lowercase 40-hex audited SHA, the base must be a candidate ancestor,
and CI passes `f81b17732ec0b44d0e5dbad2d444c2cddc0e9818` explicitly. Symbolic or
abbreviated bases are `BLOCKED`.

## Contract Drift Requiring The Wave 1 Spike

Official-source research retrieved 2026-07-14 found public/bundled disagreement
about required plugin fields, hooks, and `.mcp.json` shape. `${PLUGIN_ROOT}` is
documented for hooks but not guaranteed for `.mcp.json`. Therefore plugin
ingestion and cached MCP launch remain Proposed decisions and Wave 1 must test
three manifest/MCP shapes rather than selecting one from prose.

Pinned bundled helper hashes:

| Artifact | SHA-256 |
|---|---|
| `plugin-creator/SKILL.md` | `8fd56316b2c49cbdc657a5d197967a233018e1fada65b00a5dd030dce6499a6e` |
| `create_basic_plugin.py` | `b5aa34f7f9dcec4bb007a66d65cff0c5c77a67042ae6c4de57d8ab7f4ef737d2` |
| `validate_plugin.py` | `ebda00d55d7518b127f675f062fb5c6e7a1ffdc0a99df1a55ac594400d7d3228` |
| `update_plugin_cachebuster.py` | `4fe3c5a49212f6e30a2306e245c460e01aaf5e36bc8ad3dd2852c199257eff89` |
| `skill-creator/quick_validate.py` | `6cc9dc3199c935916cf6f73fcbbbb0e3bb1b58c8f5109fefa499978908164f51` |

See [ADR-003](../adr/003-codex-plugin-pilot-decision-set.md) for the dated
source links and acceptance evidence.

## Redaction And Mutation Notes

- MCP environment values, credentials, user-specific endpoints, and unrelated
  plugin inventory details are omitted.
- No plugin, marketplace, MCP server, container, volume, branch outside this
  worktree, remote, tag, or public artifact was created or changed.
- Product plugin validation is `NOT_RUN` at baseline because the Wave 1 manifest
  does not exist. The Wave 0 scaffold reports this state explicitly and will
  return `BLOCKED` if a manifest appears without the pinned validator runner.
- Repository branch-literal lint remains `FAILED` on the pre-existing runbook
  line documented above. Required Wave 0 commands pass, but aggregate status
  remains `PARTIALLY_VERIFIED` until the orchestrator resolves that owned file.

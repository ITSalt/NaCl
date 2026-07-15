# Wave 9 Stage 5 — CI ownership acceptance

Date: 2026-07-15
Stage 4 evidence parent: `67b74d455a6c56cd900c747a8437475a568034aa`
Accepted Stage 5 implementation SHA: `6d108d4124992b1f5e0e68836fe3492515c6622d`
Branch: `codex/plugin-09-stage3-fresh-main`
Status: `VERIFIED` for local Stage 5 scope

This checkpoint is local-only. It does not authorize or perform a push, PR,
merge to `main`, tag, release, deployment, external infrastructure mutation,
portal submission, or publication.

## Accepted ownership split

The accepted change is restricted to four CI-owned files. Product runtime,
documentation, generated Codex/Claude package trees, and the Claude
`build-plugin.yml` workflow are byte-unchanged from the Stage 4 evidence
parent.

- `.github/workflows/test-tools.yml` remains the generic owner. Its Node,
  bash-test, bash-syntax, and PowerShell selections preserve `:!plugin/**` and
  add `:!tests/codex-plugin/**`. The complete `pwsh-syntax` job remains.
- `.github/workflows/build-plugin.yml` remains the Claude package owner and is
  byte-identical to the parent at blob
  `fbce716635918578fa233f4e1f829c7bbd9e3015`.
- `.github/workflows/test-codex-plugin.yml` is the dedicated Codex owner. It
  pins Node 20 and Python 3.11.9, installs the hash-pinned validator, checks the
  Codex builder/package, invokes the immutable Claude-isolation guard without
  caller refs, and runs manifest-bound current-main source drift.
- `scripts/codex-plugin-ci.sh test:contracts` contains a closed explicit Codex
  inventory: 26 Node files, three shell tests, and six shell syntax sources.
  A regression enumerates the test directory so a future unlisted Codex test
  fails rather than silently escaping CI.

The former five failures came from generic execution of copied tests under the
generated Claude `plugin/**` tree. They are gone because ownership is now
correct, not because assertions were weakened or skipped.

## Verification evidence

| Gate | Exact result |
|---|---|
| Independent CI ownership review | `ACCEPT` on exact SHA `6d108d4124992b1f5e0e68836fe3492515c6622d`; no false-green bypass or stale step found |
| Raw `test:contracts` | exit 0; 243 total, 238 pass, 5 expected Docker opt-in skips, 0 fail; shell suites green |
| CI ownership regression | `2/2` pass; closed inventory and all three owners checked |
| Generic Node owner | `242/242` pass with both generated/Codex exclusions |
| Generic bash owner | all tests and syntax checks pass |
| Claude owner | builder current; `31/31` tests; workflow and `plugin/**` trees byte-identical to parent |
| Codex package / graph / workflow | `83/83`, `89/89`, and `38/38` pass |
| Documentation and closure | `VERIFIED`; 40 documents and 382 package files |
| Codex skills and manifest | exact 60 source skills and 10 packaged public skills; manifest `VERIFIED` |
| Diff scope | exactly four CI files; product runtime/docs/generated trees unchanged; worktree clean |

## Honest limitations and next scope

Hosted GitHub Actions were not run locally. The local host has Node 24.13.1
and Python 3.14.5; exact Node 20 and Python 3.11.9 execution remains for hosted
CI. `pwsh` is unavailable, so the PowerShell job was structurally verified and
its full parser loop was preserved, but the 12 selected files were not parsed
by PowerShell in this stage.

Stages 1-5 now form a locally verified fresh-main reconciliation base. They do
not by themselves satisfy Wave 9 production readiness. The next stage owns the
provider-neutral Streamable HTTP/OAuth app-plus-skills implementation,
public-tool boundary, disposable authorization/topology matrix, metadata and
reviewer fixtures. Real VPS/DNS/TLS/credentials/deployment, clean-machine Git
release installation, hosted CI, OpenAI portal state, push/PR/main merge/tag/
release, submission, and publication remain `NOT_RUN` or `NOT_AUTHORIZED`.

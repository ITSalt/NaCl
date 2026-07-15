# Wave 9 Stage 3 — fresh-main Claude isolation acceptance

Date: 2026-07-15
Fresh main: `19dd5e263024a2e43e456e9f37efcfc8c8a3bc73`
Accepted Stage 2 successor: `5da25e46e716e0b0e8cef359667ba1644a327a96`
Fresh-main merge: `288e99d83a1476ad1a7b12e6c71b8f25d8252ada`
Stage 3 implementation SHA: `1a5494381bebf258de7753a52a9cb4a07964c019`
Branch: `codex/plugin-09-stage3-fresh-main`
Status: `VERIFIED` for local Stage 3 scope

This checkpoint is local-only. It does not authorize or perform a push, PR,
merge to `main`, tag, release, deployment, VPS/DNS/TLS/credential mutation,
portal submission, or publication.

## Fresh-main composition

The Stage 3 branch starts directly from current `main=origin/main=19dd5e2` and
merges the independently accepted Stage 2 successor without rewriting either
history. Merge `288e99d` has the exact parents `19dd5e2` and `5da25e4`.

The later main changes are preserved exactly:

- `docs/setup/install-skills.md` at blob
  `25f4fd3a6ae1fdcca3b3df239c2c174b33f56773`;
- `docs/setup/install-skills.ru.md` at blob
  `15b8005e7e1a9749d3a508fa5e90500ac013c510`.

The generated Claude `plugin/**` tree remains byte-identical to accepted Stage
2 at tree `7d02ae9bc658a8f16dd909d2f78c288d51f15cff`. Claude marketplace,
plugin manifest, build report, build scripts, and workflow retain their proper
main/Stage-2 ownership; Codex `plugins/nacl/**` stays a separate generated
artifact.

## Fail-closed isolation guard

`scripts/check-claude-runtime-unchanged.sh` is bound to the immutable literal
main SHA `19dd5e2`. The companion evidence file must contain that exact SHA,
the SHA must be an ancestor of candidate `HEAD`, and caller-selected refs are
not accepted.

The guard freezes these Claude-owned namespaces relative to main:

- `.claude/**`;
- `.claude-plugin/**`;
- `.github/workflows/build-plugin*`;
- `scripts/build-plugin*`;
- `scripts/plugin-manifest*`.

Committed, dirty tracked, and untracked changes are all checked. Namespace
globs reject new sibling workflow/helper/manifest files. Generated
`plugin/**` parity is mandatory through `node scripts/build-plugin.mjs --check`;
there is no skip environment variable and a failed/missing builder cannot
return `VERIFIED`.

## Adversarial correction

The first Stage 3 candidate was independently blocked because a skip variable,
non-HEAD candidate, mutable base file, and new untracked build siblings could
bypass checks. The accepted correction removes every production override,
hard-binds the main SHA, broadens namespace ownership, and replaces the
synthetic unit repository with a shared clone of the real history.

Independent review on exact SHA `1a54943` returned `ACCEPT`:

| Gate | Exact result |
|---|---|
| Dirty tracked frozen paths | `5/5` rejected |
| Committed frozen paths | `5/5` rejected |
| Untracked frozen siblings | `5/5` rejected |
| Unit shared-clone matrix | `10/10` pass, including committed drift and base advance |
| Immutable base advance | `BLOCKED`, exit 2 |
| Positional `HEAD` or exact SHA | `BLOCKED`, exit 2 |
| Generated artifact drift | failed through mandatory builder |
| Bash 3.2 | `VERIFIED` on system `/bin/bash` 3.2.57 |
| CI dispatcher | `test:claude-isolation` `VERIFIED` |
| Claude builder | `--check` pass; regression `31/31` |
| Codex builder | current at 379 files / 10 public skills / 60 workflows |
| Syntax, diff, path/secret hygiene | clean |

## Remaining scope

Stage 4 must manually compose the documented current-main/Wave 8 documentation
overlaps without changing the accepted ownership boundary. Stage 5 must split
generic, Claude, and Codex CI ownership so the five known generated
`plugin/**` baseline failures disappear for the correct reason.

PowerShell runtime, exact Node 20, hosted CI, production HTTP/OAuth, external
infrastructure, clean-machine Git-release portability, and publication remain
`NOT_RUN` or separately authorized later-stage work. Stage 3 is not a release
candidate and does not change Wave 8's `PARTIALLY_VERIFIED` status.

# Codex Plugin Test Entry Points

Wave 0 established the stable repository commands. Wave 1 proved cached MCP
launch, and Wave 2 replaces the spike payload with the self-contained NaCl
package plus package/CLI gates:

```sh
bash scripts/codex-plugin-ci.sh test:contracts
bash scripts/codex-plugin-ci.sh test:codex-skills
bash scripts/codex-plugin-ci.sh test:claude-isolation
bash scripts/codex-plugin-ci.sh test:plugin-manifest
bash scripts/codex-plugin-ci.sh test:plugin-spike
bash scripts/codex-plugin-ci.sh test:plugin-package
bash scripts/codex-plugin-ci.sh test:plugin-closure
bash scripts/codex-plugin-ci.sh test:cli-legacy
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT
bash scripts/codex-plugin-ci.sh test:cli-plugin --output "$output_file"
```

The Codex skill gate runs the checksum-verified OpenAI validator snapshot
documented under `tests/codex-plugin/vendor/openai-codex/`. It requires exactly
`PyYAML==6.0.3`; local validation never installs or downloads it. Install the
pinned dependency explicitly when provisioning a development/CI environment:

```sh
python3 -m pip install --no-input --only-binary=:all: --require-hashes \
  -r tests/codex-plugin/requirements-validator.txt
```

Validator status is machine-significant: exit 0 is `VERIFIED`, exit 1 is a
skill validation or inventory `FAILED`, and exit 2 is environment/provenance
`BLOCKED`.

The empty-`HOME`/`CODEX_HOME` test proves that validator snapshot discovery
does not depend on either home. It first resolves and asserts PyYAML 6.0.3 from
the normally selected `python3`, then supplies that exact site-packages root
through `PYTHONPATH` while both homes are empty. Dependency absence is a
separate `python3 -S` probe and must remain `BLOCKED`.

`test:contracts` runs the complete tracked repository tool suite: every
`*/scripts/*.test.mjs` file with `node --test`, every tracked shell test, and
`bash -n` over tracked root and nested shell tools. The child/integration
workflow uses this entry point even though the legacy `test-tools.yml` push
trigger remains main-only.

`test:plugin-manifest` runs the byte-pinned official plugin validator captured
from Codex CLI 0.142.0. A missing or changed validator is `Status: BLOCKED`
with exit 2; it never becomes an implicit pass. `test:plugin-spike` remains a
backward-compatible Wave 1 regression alias; `test:plugin-package` runs the
same historical report assertions plus the real package contract,
discovery-budget, doctor-mode, copy-parity, and STDIO tests.

`test:plugin-closure` checks manifest/MCP paths, Markdown links, active
package-local paths in backticks, fenced and inline command paths, JavaScript
and shell imports, declared templates/schemas/queries/scripts, symlinks,
developer-specific paths, and secret-like material. `Source Claude skill
path:` provenance remains closure-checked but is counted separately from
active references; intentionally unbundled upstream comparisons must use an
explicit `source-only:` annotation. Synthetic missing inline and command
targets must fail. `test:cli-legacy` runs the unchanged user symlink installer
twice in an isolated `HOME`, proving 60 created links and an idempotent 60-link
repeat. It also proves legacy-only, double-install, and neither diagnostics.
The fallback regression invokes the helper through the actual user symlink
created by that installer and requires non-empty structured results plus the
expected exit codes for absent, enabled, and unavailable plugin catalogs.

`test:cli-plugin` uses isolated `HOME` and `CODEX_HOME`, adds a disposable repo
marketplace, installs the plugin, renames the disposable source away, invokes
the configured MCP transport from the installed cache, compares all ten entry
skill hashes, and removes the isolated install. It does not call a model or the
Desktop app and never mutates the live Codex home. The report records the
model-backed new-task routing smoke as `NOT_RUN`: the allowlisted isolated
environment intentionally inherits no Codex credentials, and copying live
credentials into the test would break the isolation contract.

The live matrix is fail-closed. Its schema-3 report contains top-level
`overallStatus`, `failures`, global checks, and per-shape checks/failures. A
requested report is written even when assertions fail, and any unexpected
validator, CLI, MCP, cache, source-unavailable, cachebuster, or removal result
causes a nonzero process exit. `--prepare-only` reports `NOT_RUN`; it never
claims runtime verification.

Every shape receives distinct disposable `HOME` and `CODEX_HOME` directories
under its own shape root. Codex CLI and the directly invoked STDIO server use
an allowlisted child environment plus those two roots; live MCP or credential
environment values are neither inherited nor written to the report. The
report records raw and filesystem-canonical roots. Evaluation requires each
initial and reinstalled cache to resolve to the exact versioned descendant of
that shape's canonical `CODEX_HOME`, so an outside path with the same suffix
cannot pass. macOS `/var` to `/private/var` realpath equivalence is accepted
only through that bounded canonical relationship; arbitrary symlink escapes
fail.

```sh
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT
node scripts/codex-plugin-wave1-matrix.mjs \
  --output "$output_file"
```

The default flow removes its disposable work root in `finally`. Use `--keep`
only for an explicit debugging investigation and remove the reported work root
when finished.

Later waves should extend the same dispatcher with the remaining runbook names
as their implementations land: `test:graph-unit`, `test:graph-local-e2e`,
`test:multi-project`, `test:multi-user`, and `test:candidate`. Do not add a
placeholder case that exits successfully before its gate exists.

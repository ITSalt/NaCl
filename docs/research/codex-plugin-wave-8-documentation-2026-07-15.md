# Wave 8 plugin-first documentation evidence — 2026-07-15

## Current disposition

Wave 8 is **not `VERIFIED`**. The deterministic documentation candidate is ready for final independent review, but that review, final rendered-page inspection, and the live owner-share/clean-account Desktop journey are still pending. The execution ledger must record the independent verdict before any aggregate Wave 8 / G10 decision.

This wave changes documentation, its deterministic gates, CI wiring, and the plugin cachebuster only. It does not deploy infrastructure, create a share, open a portal draft, publish a public URL, push a release, or modify the orchestration runbook.

## Artifact identity

| Item | Exact value | Evidence |
|---|---|---|
| Audited Wave 8 base | `614b708` | Start of the Wave 8 documentation program. |
| Working aggregate candidate | `d23d5b2` | Current frozen docs-only aggregate under final review. |
| Cachebuster source commit | `2dd21a7` | Changed only `plugins/nacl/.codex-plugin/plugin.json`; helper and plugin validator passed. |
| Candidate version | `0.1.0+codex.20260715094133` | Exact manifest version at `d23d5b2`. |

Bundled documentation bytes changed during Wave 8, so candidate preparation required a new cachebuster. Reusing the previous version would have produced different installed bytes under the same version. The `2dd21a7` bump is therefore part of artifact identity, not a user-facing version claim in the ordinary onboarding pages.

## Independent review and correction history

| Candidate | Verdict | Findings | Closure |
|---|---|---|---|
| `0f69aea` | `REJECT` | Plaintext architecture example; project/config identity mismatch; checker covered too narrow a surface; Russian semantic drift. | `ab148c0` expanded the executable checker and negative fixtures. `b72977b` corrected the affected RU/EN support documents. The initial findings were independently closed after merge. |
| `c16bb6c` | `REJECT` | Missing `docs/configuration.ru.md` and configuration parity; bundled graph-upgrade runbook was not classified and contained unsafe guidance. | `cdde16b` made configuration pairing mandatory, `54a8a52` made the root/bundled runbook mirror byte-exact, and `045d5b2` added the complete Russian configuration plus safe mirrored runbook content. Current gates close both findings. |
| `d23d5b2` | `PENDING` | Final independent candidate review has not returned a verdict. | Do not promote Wave 8 to `VERIFIED`; record the reviewer’s result in the execution ledger. |

No rejected finding was waived or converted into prose-only acceptance. Each correction added or strengthened executable coverage where a deterministic check was possible.

## Final documentation surface

The checker now covers 32 Wave 8 Markdown files:

- five core bilingual pairs for README, quick start, plugin installation, plugin reference, and legacy compatibility;
- ten support bilingual pairs, including the complete English/Russian configuration pair;
- the root graph-upgrade runbook and its packaged copy, required to be byte-identical.

The user journey covers owner-provided card/link installation, displayed permissions, full restart and new task, exact no-argument doctor request, first dry run, returned-confirmation-only plan/apply, optional graph and agent profiles, update/disable/uninstall/rollback, persistence, support evidence, and known limits. The generated inventory remains exactly 10 public entry skills, 60 internal workflows, and 25 MCP tools.

The ordinary plugin-first surfaces reject deprecated setup flags, plaintext graph credentials, secrets, personal paths, temporary paths, frozen candidate identifiers, and legacy Codex installation commands outside the compatibility appendix. Configuration identity language now agrees with the project-resolution contract. The graph-upgrade runbook is classified consistently in both its root and bundled locations and no longer exposes the rejected unsafe path.

## Current deterministic gates

| Gate | Current result at `d23d5b2` |
|---|---|
| `bash scripts/codex-plugin-ci.sh test:plugin-docs` | Exit 0; `Status: VERIFIED`; 32 Wave 8 Markdown files; exact 10 / 60 / 25 inventories; configuration pair present; bundled runbook mirror exact. |
| `node --test tests/codex-plugin/scripts/plugin-docs.test.mjs` | Exit 0; 9 passed, 0 failed. |
| `bash scripts/codex-plugin-ci.sh test:contracts` | Exit 0; 334 tests total, 329 passed, 5 authorized opt-in Docker skips, 0 failed. |
| `bash scripts/codex-plugin-ci.sh test:plugin-closure` | Exit 0; 357 packaged files verified. |
| Candidate helper and plugin validator | Exit 0; manifest-only cachebuster preparation accepted. |
| Claude frozen-path gate | Exit 0; 62 frozen roots, identical frozen manifest hashes. |
| Root/Codex sync gate | Exit 0; only the audited Codex-specific differences remain. |
| Diff checks | Exit 0; no whitespace errors and no out-of-scope worker change. |
| Pandoc render checks | Passed in earlier correction rounds. Final independent render review of `d23d5b2` remains pending. |

The five skipped contracts are the existing authorization-gated real-Docker tests. They are not evidence for a live Keychain bootstrap, private share install, screenshots, or a clean-account Desktop walkthrough.

## Distribution and live journey limits

The docs intentionally describe a NaCl card or private share link supplied by the owner, but no NaCl private-share card/link was created and no clean-account recipient install was run. The live UI journey and screenshots are therefore `BLOCKED` / `NOT_RUN`, not verified by the prose or deterministic checker.

There is no public NaCl install URL, public-directory listing, portal draft, submission, or publication. Those remain future separately authorized work. Node.js 24 was exercised against the Node.js 20+ requirement; exact Node.js 20 and live Keychain graph bootstrap remain `NOT_RUN`.

## Handoff

Final independent review must evaluate the exact `d23d5b2` candidate and record one closed verdict in the execution ledger. Until then, the correct statement is: deterministic Wave 8 documentation gates are green, two prior rejection rounds are closed, and aggregate Wave 8 / G10 remains pending rather than `VERIFIED`.

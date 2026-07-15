# Vendored OpenAI Codex plugin validator

This directory preserves the official validator bundled with Codex CLI 0.142.0
and ChatGPT desktop 26.707.71524 (build 5263), captured on 2026-07-14.

| File | Source | SHA-256 |
|---|---|---|
| `validate_plugin.py` | bundled `plugin-creator/scripts/validate_plugin.py` | `ebda00d55d7518b127f675f062fb5c6e7a1ffdc0a99df1a55ac594400d7d3228` |
| `LICENSE` | `openai/codex` Apache-2.0 license | `d17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc` |
| `NOTICE` | `openai/codex` notice | `9d71575ecfd9a843fc1677b0efb08053c6ba9fd686a0de1a6f5382fd3c220915` |

Upstream paths:

- <https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/scripts/validate_plugin.py>
- <https://github.com/openai/codex/blob/main/LICENSE>
- <https://github.com/openai/codex/blob/main/NOTICE>

The exact validator source commit was not exposed by the installed bundle, so
the byte hash and host versions are the immutable provenance for this spike.
The repository gate verifies the validator hash before execution. Updating it
requires review of the complete validator diff, refreshed host evidence, and a
new provenance directory; do not patch this snapshot in place.

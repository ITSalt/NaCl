# Vendored OpenAI Codex skill validator

This directory preserves the exact upstream files retrieved from
`openai/codex` commit `4aa950d456c6c90174d3269d7eaab4a2823e5889`:

| File | Upstream path | SHA-256 |
|---|---|---|
| `quick_validate.py` | `codex-rs/skills/src/assets/samples/skill-creator/scripts/quick_validate.py` | `6cc9dc3199c935916cf6f73fcbbbb0e3bb1b58c8f5109fefa499978908164f51` |
| `LICENSE` | `LICENSE` | `d17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc` |
| `NOTICE` | `NOTICE` | `9d71575ecfd9a843fc1677b0efb08053c6ba9fd686a0de1a6f5382fd3c220915` |

Source URLs use the immutable commit:

- <https://github.com/openai/codex/blob/4aa950d456c6c90174d3269d7eaab4a2823e5889/codex-rs/skills/src/assets/samples/skill-creator/scripts/quick_validate.py>
- <https://github.com/openai/codex/blob/4aa950d456c6c90174d3269d7eaab4a2823e5889/LICENSE>
- <https://github.com/openai/codex/blob/4aa950d456c6c90174d3269d7eaab4a2823e5889/NOTICE>

The adapter verifies all three hashes before importing the validator. The
adjacent `LICENSE` and `NOTICE` are unmodified upstream bytes and apply to the
vendored snapshot.

## Reviewed update procedure

1. Select and record an immutable upstream Codex commit.
2. Review the complete validator diff and upstream license/notice changes.
3. Replace all three files byte-for-byte from that commit; do not patch the
   vendored validator locally.
4. Update the commit, hashes, adapter constants, tests, and this provenance
   record in one reviewed change.
5. Review and pin any dependency change with `--only-binary=:all:` and
   `--require-hashes`-compatible wheels for every supported CI/local platform.
   Runtime validation must never download or install dependencies.
6. Run the adversarial validator probes, all repository contract gates, and a
   result comparison against the currently bundled official validator across
   all 60 skills before accepting the update.

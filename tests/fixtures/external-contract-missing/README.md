# external-contract-missing fixtures

Two minimal UC scaffolds that demonstrate the W6 External Contracts Gate
behavior introduced in `nacl-tl-plan` (both Claude and Codex flavors).

Both fixtures stand in for the project-beta UC-300 episode — a UC that
references `api.kie.example.invalid` (a `kind: provider` external contract). The
canonical reference is
`docs/retrospectives/project-beta-runtime-baseline.md` §§ A1, A5
("api.kie.example.invalid (LLM Anthropic-shape)").

| Fixture | Expected `nacl-tl-plan` outcome |
|---|---|
| `with-contract/` | `Status: VERIFIED` (workflow detail none) — gate passes; UC-300 tasks generated |
| `missing-contract/` | `Status: BLOCKED` workflow detail `external-contract-missing` — gate refuses; no TL writes |

Both scaffolds share the same UC spec referencing `api.kie.example.invalid`. The only
difference is the presence or absence of `.tl/external-contracts/kie.md`.
That single delta drives the verdict.

See each subdirectory's `README.md` for the per-fixture detail.

These fixtures are static demonstrators consumed by `W11-pilot` and by
the post-W6 acceptance replays. They are not part of any project's own
test suite. The `.tl/` directories inside each subfixture are scoped to
the fixture, not to NaCl itself.

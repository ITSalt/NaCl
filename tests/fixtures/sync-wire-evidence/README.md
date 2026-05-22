# sync-wire-evidence fixtures

Two minimal UC scaffolds that demonstrate the W2 Wire-Evidence Gate behavior
introduced in `nacl-tl-sync` (both Claude and Codex flavors).

Both fixtures are a stand-in UC-300-style integration with a api.kie.example.invalid-style
LLM provider — a canonical `actor != SYSTEM` scenario from the project-beta
postmortem (see `docs/retrospectives/project-beta-runtime-baseline.md` § A1
"api.kie.example.invalid (LLM Anthropic-shape)").

| Fixture | Expected `nacl-tl-sync` outcome |
|---|---|
| `with-wire-evidence/` | `Status: VERIFIED` (when type-alignment + runtime tests + wire-evidence all green) |
| `without-wire-evidence/` | `Status: UNVERIFIED` workflow detail `wire-evidence-missing` |

Both scaffolds use the same TS types and the same BE/FE shape. The only
difference is the presence or absence of a `wire-evidence/fixture-response.json`
artifact plus the runnable test that loads it. That single delta drives
the verdict.

See each subdirectory's `README.md` for the per-fixture detail.

These fixtures are static demonstrators consumed by `W11-pilot` and by the
post-W2 acceptance replays. They are not part of any project's own test
suite and they do not declare `scripts.test` for the host repo's runners
to discover automatically.

# NaCl Skills For Codex

This folder contains the pilot Codex adaptation of selected NaCl skills. The
root-level `nacl-*` folders remain the Claude-oriented source skills and must
not be modified by this migration.

## Principle

Codex adaptation preserves NaCl methodology, not Claude execution mechanics.
The goal is to keep graph-first analysis, BA/SA/TL layer boundaries, contracts,
TDD discipline, orchestration contracts and gates, and honest verification while
removing Claude-specific model routing and Task-agent assumptions.

## Pilot Scope

Only these skills are included in the pilot:

- `nacl-core`
- `nacl-ba-context`
- `nacl-sa-domain`
- `nacl-tl-dev-be`
- `nacl-tl-conductor`

No placeholder directories are created for unconverted skills. Additional skills
should be migrated only after the pilot rules are reviewed and accepted.

## References

The pilot creates only three shared reference files upfront:

- `references/migration-rules.md`
- `references/orchestration-model.md`
- `references/verification-vocabulary.md`

Additional shared references, scripts, or assets may be copied here only after
the pilot proves they are needed.


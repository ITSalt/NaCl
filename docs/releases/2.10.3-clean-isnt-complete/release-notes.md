# Release 2.10.3 — `clean-isnt-complete`

## Theme

Close the "clean audit, empty migration" gap in the SA migration pipeline
(`/nacl-migrate-sa`). A migration could report a clean audit while almost
every use case had been written to the graph as an empty shell — blank
module, zero activity steps, zero form links — because two independent
weaknesses lined up: the parser under-extracted, and the audit could not see
it. This release fixes both halves.

## Background

The SA migration audit compares IR-expected node/edge counts to the live
Neo4j counts. But the "expected" numbers are derived from the *same* IR that
was just written. So when the parser under-extracts — for example, producing
a handful of activity steps total — the audit expects that handful, finds it
live, and reports a match. The audit proves "what we parsed got written"; it
can never prove "what we parsed is complete." Separately, the IR integrity
checks (SV/HV) are all referential (do ids resolve?), and one of them only
fired when a field was non-empty, so a blank module was silently accepted.

The net effect: a downstream tool that only renders a use-case board when the
use case has activity steps would show almost nothing, while every gate
upstream reported green.

## What's Fixed — Parser (extraction)

The inline-table SA adapter now extracts the dialects that previously slipped
through:

- **4-digit use-case ids** (`UC-NNNN`) are accepted alongside the existing
  3-digit (`UC-NNN`) and letter-prefix (`UC-X##`) shapes, in both the IR id
  validators and the adapter's id scan.
- **Numbered-H2 module layout.** When a project lists modules as headings
  (`## 1. Orders (...)`) rather than a module table, those modules are now
  parsed, so `Module` nodes and `UseCase.module` populate.
- **Screen → use-case links from frontmatter.** Screen ids are derived from
  `uc` / `relatedUC` frontmatter, so `Form.used_by_uc` — and therefore
  `USES_FORM` edges — populate.
- **Numbered-list activity steps.** A `1. … 2. …` list under the main-scenario
  heading (the dominant inline-table dialect) is now extracted into
  `activity_steps`, instead of being dropped.

## What's New — Audit (visibility)

`validate_sa_ir.py` gains a **completeness / coverage** dimension that
operates purely on the parsed IR (adapter-agnostic). It measures how much of
each node type was actually populated, so under-extraction is loud instead of
hidden behind "clean":

| Check | Coverage metric |
|-------|-----------------|
| SC1 | use cases with at least one activity step |
| SC2 | use cases with a non-blank module |
| SC3 | use cases referenced by some form |
| SC3f | forms that resolve to at least one use case |
| SC4 | domain entities with a non-blank module |
| SC5 | domain entities with at least one attribute |
| SC6 | enumerations with at least one value |
| SC7 | forms with at least one field |

Each metric reports total, covered, percentage, and a capped sample (≤10) of
the missing ids. The validation JSON gains a top-level `coverage` block, and
the console prints a `Coverage` section.

**Severity policy.** Coverage is **advisory by default** — it prints and lands
in the report but does not change the exit code, because some emptiness is
legitimate (a pure list-view use case genuinely has no steps). For CI,
`--strict` gates at 100% and `--min-coverage PCT` gates at an arbitrary
threshold; either flips the exit code to non-zero on a metric below threshold.

`audit_sa.py` now documents the count-parity blind spot in its header and
prints a pointer line — `count parity ✓ — see validation coverage (SC1–SC7 …)`
— so the "All SA counts match" line can no longer be read as "complete." The
`nacl-migrate-sa` report template carries a Completeness / Coverage section
directly adjacent to the audit headline.

## Compatibility

- No breaking changes. New checks are additive; default exit codes are
  unchanged. The gating flags are opt-in.
- No adapters other than the inline-table SA adapter changed; the coverage
  checks are adapter-agnostic and stdlib-only.

## Out Of Scope

The BA migration audit (`audit_ba.py`) has the same count-parity design and is
also blind to under-extraction. An equivalent coverage pass for the BA side is
noted as a follow-up in that file and is intentionally not part of this
release.

## Verification

Run the migration-core test suite with the standard library runner:

```sh
cd nacl-migrate-core && python3 -m unittest discover tests -v
```

Inspect the coverage output of the validator on any SA IR:

```sh
python3 nacl-migrate-sa/scripts/validate_sa_ir.py \
  --input <sa-ir.json> --handoff <handoff-ir.json> --output <out.json>
# prints a Coverage section; writes a "coverage" block; exit 0 by default.
# add --strict or --min-coverage PCT to gate.
```

## Safety Constraints

- `feedback_no_private_info_in_public_repo`: release text, source, and tests
  contain only framework-level content — no private project names, paths, or
  per-project counts. The pre-release canary grep is a zero-match gate.
- `feedback_regression_test_before_fix`: the coverage behavior ships with
  self-contained unit tests covering full coverage, under-extraction
  (advisory, exit 0), strict gating (exit non-zero), and the sample cap.

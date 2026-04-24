# Bench inputs

Fixed test corpus for skill benchmarks. Files in this directory are committed to the repo so benchmark results are reproducible.

## Required files

| File | Profile | Approximate shape |
|------|---------|-------------------|
| `small.docx` | Trivial business process | 1 swimlane, 5 steps, no decisions |
| `medium.docx` | Typical | 3 swimlanes, 15 steps, 2 decisions, 1 document branch |
| `large.docx` | Complex | 5 swimlanes, 40+ steps, nested decisions, multi-document flows |

The files should be **synthetic** — generated specifically for the bench. Do **not** commit real client documentation. Synthetic inputs keep the repo public-safe and make the benchmark reproducible without NDA.

## Generation guidelines

- Use a fictional domain (library lending, coffee-shop order, airport check-in). Avoid anything that looks like a real company's workflow.
- Keep tables and bullet lists varied so the parser gets realistic heterogeneity.
- Fix encoding as UTF-8.
- Record each file's SHA-256 in `hashes.txt` when adding/replacing an input, so downstream reports can pin provenance.

## Reproducibility

When publishing bench results:

```
sha256sum bench/inputs/*.docx > bench/inputs/hashes.txt
git add bench/inputs/hashes.txt
```

The report's provenance block should reference `hashes.txt` so reviewers can verify they benched on the same corpus.

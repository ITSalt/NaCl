NaCl 2.10.3 — clean-isnt-complete

A SA migration could report a clean audit while almost every use case was written to the graph as an empty shell. This release fixes both halves of that gap.

Why it happened:

— The audit compares IR-expected counts to live graph counts, but derives "expected" from the same IR it just wrote. So it proves "what we parsed got written", never "what we parsed is complete" — it was structurally blind to under-extraction.
— The parser under-extracted on several common document dialects, so use cases landed with a blank module, zero activity steps, and zero form links.

What ships:

— Parser fixes for the inline-table SA adapter: 4-digit use-case ids (`UC-NNNN`), a numbered-H2 module-layout fallback (modules now populate), screen→use-case links from frontmatter (`USES_FORM` edges now populate), and a numbered-list activity-step fallback under "main scenario" (activity steps now populate).
— A new completeness/coverage dimension in `validate_sa_ir.py` (SC1–SC7): per-node-type populated-vs-total ratios with sampled missing ids. It surfaces under-extraction as e.g. `UC activity steps: 1/50 (2.0%)` instead of a silent "clean".
— Coverage is advisory by default (some emptiness is legitimate); `--strict` / `--min-coverage` gate it for CI.
— `audit_sa.py` now documents the count-parity blind spot and prints a pointer to the coverage section, so a clean audit is never mistaken for a complete one.

No breaking changes — coverage is additive and default exit codes are unchanged.

Release notes: docs/releases/2.10.3-clean-isnt-complete/release-notes.md

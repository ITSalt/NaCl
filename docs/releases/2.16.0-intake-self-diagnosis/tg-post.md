NaCl 2.16.0 — intake-self-diagnosis

A release about the framework no longer outsourcing its own homework. An autonomous orchestrator that builds hypotheses and asks the human to verify them is not autonomous. From now on, "the project graph didn't resolve this atom" is not grounds for a question — it is grounds for an investigation.

What's inside:

— **Intake self-diagnosis (PROBE).** For every atom the graph didn't resolve, `nacl-tl-intake` formulates 2–3 falsifiable hypotheses ("the mechanism exists in code but mishandles the record" vs "the mechanism is absent — it's a feature") and verifies them with bounded read-only probes: code grep/read, at most one read-only DB query, git log; 6-call budget per atom, never writes. A new `CODE` evidence tier: "verified against the actual codebase/DB".

— **Rubric-derived confidence.** "How sure am I" is now a number the operator can audit and tune — not a vibe. The score is a deterministic lookup over the verdict pattern (the model never invents the number); thresholds live in `config.yaml → intake.*`. At ≥0.9 the atom routes like a graph-backed one; 0.7–0.9 auto-routes on the leading hypothesis with a tracked alternative; below 0.7 — and only there — a question fires, and it must carry the diagnosis: what was checked, per-hypothesis verdicts, the leaning, the single blocking fact. Bare "bug or feature?" prompts are gone from the framework.

— **Re-type instead of failure.** A BUG atom that `/nacl-tl-fix` proves to be a feature (the code path does not exist) no longer kills the goal-run. FEATURE_SMALL self-heals within the same run; FEATURE_HEAVY degrades to the new terminal state `unsupported` — the run continues. This bounded miss cost is what justifies auto-routing at 0.7 instead of asking.

— **The validation contour catches up with L8–L13.** A post-release audit of 2.15 confirmed the validators themselves complete (52 checks across L8–L13). But the goal contract's `validate` alias declared success on l1–l7 (an autonomous loop would have missed CRITICALs in the new layers), finalization was blind to all 12 new node types, and `nacl-sa-full` never invoked the new producers at all. Fixed: the contract requires all thirteen levels; readiness is adoption-aware ("not adopted" ≠ 0%); sa-full gains optional Phase 6b (machines → slices → errors → resilience, strictly dependency-ordered); tl-plan embeds the screen state machine into task-fe.md. The public methodology docs now carry the full L1–L13 catalog (EN+RU).

Everything additive. The new Cypher queries were run live against real project graphs; the intake harness — five deterministic tests on the merged tree.

Release notes: docs/releases/2.16.0-intake-self-diagnosis/release-notes.md

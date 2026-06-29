NaCl 2.15.0 — connected-spec-graph

The biggest release since the graph itself. Before 2.15 the spec graph described a system but did not react to change: impact edges nobody read, task files baking snapshots that silently aged, no notion of "this node needs review because its upstream moved", rationale buried in commit messages. Adding new artifact types on top of that would have amplified drift. So this release fixes the change model first — then layers four new specification layers on top of it.

What ships:

— **Change propagation + provenance (Phase 0).** Pull any node — the graph computes everything that depends on it and stamps a directed, tight `review_status` on exactly the affected work. The broad walk is for exploration only: measured, it over-flags 20×→52× (and saturates). Every decision is a `:Decision` node with JUSTIFIES/SUPERSEDES chains — "why is it built this way" is one Cypher traversal, a year later.

— **Four new layers, one invariant (Phases 1–4).** Screen state machines (determinism, reachability, retry-guarantee validators), behavior slices (graph-native Given/When/Then with a hard anchor invariant), domain error taxonomy (transport-independent codes, channel-rule handling, user-language presentations), cache & degradation policies (when the cache stops lying; the state the user lives in when things fail). Every new node type is born with a required parent, a required cross-layer anchor, allow-list registration and its own validator level — it structurally cannot be orphaned.

— **Proof, not promises.** Each phase: benchmark on an isolated clone of a real project graph with falsifiable hypotheses, defect-injection matrices 8/8 → 14/14 → 21/21 → 27/27 with zero cross-talk, then an independent skill-level run with a blind verifier. The finished roadmap passed an external expert audit — and the audit was itself verified claim-by-claim, with live replays of all four harnesses coming back byte-identical to the committed reference results. Five lab reports + a five-article research series in the repo.

— **Upgrade path for existing graphs.** `docs/runbooks/upgrade-graph-extensions.md`: hand it to a clean-context agent — it orchestrates the whole upgrade through subagents, asks ONE question up front (source of truth: code or you?), asks only business-behavior questions after that, and ends with a code-vs-spec reconciliation.

Everything is additive and strictly opt-in — vacuous pass is a benchmarked property: graphs that don't adopt a layer are untouched by its validators.

Release notes: docs/releases/2.15.0-connected-spec-graph/release-notes.md

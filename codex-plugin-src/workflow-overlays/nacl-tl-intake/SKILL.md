---
name: nacl-tl-intake
description: |
  Triage and decompose user requests with graph-aware classification into
  features, bugs, and tasks. Use when a request contains multiple changes,
  unclear work type, graph context is needed, or when the user says
  `/nacl-tl-intake`.
---

# NaCl TL Intake For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Intake classifies and proposes work. It should stop for confirmation before
creating graph or task-tracker artifacts.

## Workflow

1. Collect request text from the user or available task tracker.
2. Split the request into atomic changes.
3. Query graph context when graph tooling is available to identify related use
   cases, entities, modules, and existing work.
4. Classify atoms as feature, bug, technical task, documentation task, or
   unclear item.
5. Group related atoms into independently shippable units.
6. Present the decomposition and routing plan for user confirmation.
7. Create intake or task artifacts only when tools and confirmation are
   available.

## Source-Parity Requirements

- Query graph context first when available: matching use cases, modules, roles,
  entities, existing `Task` nodes, and active waves.
- Classify each atom with visible evidence. If graph access is unavailable, use
  keyword/file fallback only and report the lower confidence.
- Stop at the user gate before creating feature requests, graph nodes, tracker
  tasks, `.tl/` files, or downstream execution plans.
- Preserve source routing semantics: features route to SA/TL planning, bugs to
  `nacl-tl-fix`, TECH work to `nacl-tl-dev`, and reopened tracker work to
  `nacl-tl-reopened`.
- Do not auto-execute the downstream workflow unless the user explicitly
  confirms that exact scope in the current turn.
- Probe before any classification question (source Step 2a.5). When the graph
  alone does not resolve an atom (no matching UC, draft UC, or graph
  unavailable), do NOT ask the user yet: formulate 2–3 falsifiable hypotheses
  (canonical pair: "the mechanism exists in code but mishandles the record"
  vs "the mechanism is absent — this is a feature") and verify them with
  bounded read-only checks — grep/read the codebase, at most one read-only DB
  query when DB tooling is available, optional git log; budget max 6 tool
  calls + 1 DB query per atom; never write. Score the leading hypothesis via
  the deterministic rubric in `../../nacl-tl-core/references/intake-scoring.md`
  (thresholds and rubric values come from the project `config.yaml ->
  intake.*`, falling back per key to the built-in defaults; broken values →
  warn + defaults). A probe never clears a hard-refuse trigger.
- The user gate is differentiated by post-probe certainty AND calibrated to
  avoid needless prompts. HIGH+GRAPH (and HIGH+CODE — probe score at or above
  the high-confidence threshold) with no spec gap and low blast radius (L0/L1)
  auto-routes without prompt. For a SPEC_GAP atom (matched UC exists but does not
  specify the sub-aspect requested): first honor any decision the request text
  already states (do not re-ask what the user already answered), then split it —
  ship the unconditionally-correct defensive part (guard/clamp/graceful-degrade,
  touching no external contract) at L1 without a prompt, and record the genuinely
  ambiguous residual as a tracked follow-up (tracker `[open-question]` subtask or
  `.tl/open-questions.md`, never console-only, blocks parent closure until
  resolved). Prompt for the bug-vs-feature decision ONLY when the residual carries
  a hard-refuse trigger (external/breaking API, schema, auth, billing, destructive
  data). L2/L3 atoms fire a launch-sanity check; mid-band scores (between the
  routing and high-confidence thresholds) prompt with the diagnosis-backed
  recommendation; sub-threshold atoms prompt via the diagnosed-disambiguation
  template — the prompt MUST show what was checked, the per-hypothesis results,
  the leaning (if any), and the single blocking fact. Never ask a bare
  "bug or feature?" without showing the investigation. All user-shown prompts
  use plain, observable language — never internal tokens (L0–L3, spec_gap,
  POLICY_CALL, gate names). See the main `nacl-tl-intake/SKILL.md` for the
  decision tree, the probe contract, and prompt templates.
- The source skill's `--autonomous` flag (2.14+) is a wrapper-only contract
  set by `/nacl-goal intake` on the Claude runtime: it auto-confirms the
  L2/L3 launch-sanity check, auto-routes probe-scored atoms on the leading
  hypothesis with a tracked alternative when the score clears the routing
  threshold, and batches sub-threshold atoms into one consolidated pre-start
  question carrying each atom's diagnosis — hard-refuse triggers always still
  stop. Codex sessions are interactive by definition: never honor
  `--autonomous` here; the interactive gate calibration above (including the
  probe) is the Codex behavior.

## Capabilities

### May Do

- Decompose natural-language requests into work items.
- Use graph context to distinguish new behavior from broken existing behavior.
- Propose routing to SA, TL development, fix, docs, or planning workflows.
- Create confirmed graph or tracker intake artifacts.

### Must Not Do

- Auto-execute downstream implementation without confirmation.
- Treat graph classification as certain when graph data is unavailable or sparse.
- Create tracker subtasks without available tracker tooling and confirmation.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph queries require available graph tooling.
- Task tracker reads and writes require available tracker tooling.
- File artifact creation requires writable workspace access.
- Downstream workflow execution requires explicit user confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when request text, required tools, or confirmation are missing.
- Use `PARTIALLY_VERIFIED` when graph context covers only part of the request.
- Use `NOT_RUN` when artifact creation is intentionally skipped.
- Use `UNVERIFIED` when classification cannot be supported by graph or file
  evidence.
- Use `FAILED` when artifact creation or validation fails.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-intake/SKILL.md`

### Preserved Methodology

- Source to extract to classify to group to confirm.
- Graph-first classification when graph data exists.
- Independently shippable work grouping.
- Routing to appropriate downstream workflows.

### Removed Claude Mechanics

- Runtime-specific task tracker calls as guaranteed tools.
- Autopilot assumptions after confirmation.
- Source status labels outside the closed vocabulary.
- Model routing fields.

### Codex Replacement Behavior

- Treat graph and tracker access as conditional.
- Keep user confirmation before artifact creation or execution.
- Report classification confidence explicitly.
- Use the closed verification vocabulary.

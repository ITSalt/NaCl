# Handoff: Review And Repair Codex BA Skills

## Objective

Review all Codex-adapted business analyst skills under `skills-for-codex/nacl-ba-*`
against their root-level Claude Code source skills, then bring the Codex versions
to the same behavioral quality level as the recently repaired TL/init skills.

The goal is not a superficial wording sync. The goal is workflow parity:
graph-first BA methodology, exact phase ordering, confirmation gates, graph
preflight/write/read-back behavior, board lifecycle rules, and honest Codex
status reporting.

## Current Context

This repo is already dirty. Do not touch unrelated `analyst-tool/` changes.

Recent Codex skill repairs to use as patterns:

- `skills-for-codex/nacl-init/SKILL.md`
- `skills-for-codex/scripts/nacl-init-project.sh`
- `skills-for-codex/nacl-tl-fix/SKILL.md`
- `skills-for-codex/nacl-tl-core/SKILL.md`
- `skills-for-codex/scripts/install-user-symlinks.sh`

Root-level `nacl-*` folders are Claude-oriented source material. Treat them as
read-only references unless the user explicitly changes the rule.

Editable scope for this task:

- `skills-for-codex/nacl-ba-*/SKILL.md`
- shared Codex references under `skills-for-codex/` if needed
- install/docs count updates only if the number of installable `SKILL.md` files
  changes

Do not create repo-local `.agents/skills` wrappers. The canonical install model
remains user-level symlinks from `$HOME/.agents/skills/<skill>` to
`skills-for-codex/<skill>`.

## BA Skill Inventory

Review these Codex skills against their matching root-level source skills:

- `nacl-ba-analyze`
- `nacl-ba-context`
- `nacl-ba-entities`
- `nacl-ba-from-board`
- `nacl-ba-full`
- `nacl-ba-glossary`
- `nacl-ba-handoff`
- `nacl-ba-import-doc`
- `nacl-ba-process`
- `nacl-ba-roles`
- `nacl-ba-rules`
- `nacl-ba-sync`
- `nacl-ba-validate`
- `nacl-ba-workflow`

The root source path for each is `../../<skill-name>/SKILL.md` relative to the
Codex skill file.

## Required Review Method

Start read-only.

1. Capture `git status --short`.
2. For each BA skill, compare:
   - frontmatter and trigger semantics;
   - invocation parameters, modes, and command variants;
   - mandatory phases/steps and phase order;
   - graph read/write preconditions;
   - exact graph labels, relationships, IDs, and query requirements;
   - board parsing, board writing, snapshot, sync, and meta sidecar rules;
   - user confirmation gates before graph writes, file writes, phase advances,
     publishing, or handoff;
   - read-back verification after writes;
   - final report format and status semantics;
   - source comparison accuracy.
3. Produce findings in three buckets:
   - Correctly preserved.
   - Incorrectly weakened or changed.
   - Missing entirely.
4. Only then edit the Codex BA skills.

The Codex versions are currently much more compressed than the Claude sources.
Expect the same class of issue that existed in `nacl-tl-fix`: important workflow
details may have been reduced to generic "when available" language.

## Repair Rules

Preserve methodology, not Claude-only mechanics.

Keep:

- graph-first BA source of truth;
- Russian BA artifacts where the methodology requires Russian;
- exact BA labels and relationship semantics from `graph-infra/schema/ba-schema.cypher`;
- named query expectations from `graph-infra/queries/ba-queries.cypher` and
  `handoff-queries.cypher`;
- board lifecycle behavior from the source board skills;
- confirmation gates before every graph write and every destructive or
  irreversible file update;
- read-back verification after graph writes;
- closed Codex verification vocabulary for top-level status:
  `VERIFIED`, `FAILED`, `PARTIALLY_VERIFIED`, `BLOCKED`, `NOT_RUN`,
  `UNVERIFIED`.

Adapt:

- Claude Task-agent assumptions into Codex-compatible orchestration. Do not
  claim isolated delegation exists unless it is actually available and allowed
  in the current turn.
- Direct MCP tool names into conditional graph-tool behavior. If graph tools are
  unavailable, report `BLOCKED` or produce a graph-ready change plan; do not
  pretend persistence happened.
- Claude-specific runtime/model wording into Codex-neutral instructions.

Do not:

- remove important phases to make the skill shorter;
- let graph writes happen without prior user confirmation;
- claim graph completeness without graph read evidence;
- invent BA facts, roles, entities, rules, or process ownership absent from user
  input, board evidence, documents, or graph data;
- make diagrams authoritative over graph data;
- update root-level source skills.

## Expected Repairs By Skill Family

### Orchestrators

`nacl-ba-full` and `nacl-ba-from-board` must preserve source orchestration
semantics while adapting Claude Task usage to Codex.

Check that they:

- run a real Phase 0/resume or active-board check before asking for next phase;
- state phase contracts, prerequisites, expected graph output, downstream
  consumer, and status handling;
- stop after each major phase for user confirmation;
- inspect delegated output before advancing;
- never write graph data directly when the source design requires specialist
  skills.

### Graph Writers

`nacl-ba-context`, `nacl-ba-process`, `nacl-ba-workflow`,
`nacl-ba-entities`, `nacl-ba-roles`, `nacl-ba-rules`,
`nacl-ba-glossary`, `nacl-ba-handoff`, and `nacl-ba-sync` must preserve
write contracts.

Check that they:

- perform graph/schema preflight;
- identify prerequisites and report `BLOCKED` when missing;
- show candidate changes before writes;
- write only after explicit confirmation;
- use canonical node labels, relationship names, IDs, and properties;
- read back writes and report counts/evidence;
- produce graph-ready plans instead of fake persistence when graph tools are
  unavailable.

### Board Skills

`nacl-ba-import-doc`, `nacl-ba-analyze`, `nacl-ba-sync`, and
`nacl-ba-from-board` must preserve board behavior.

Check that they:

- resolve `graph.boards_dir` from `config.yaml` with documented fallback;
- parse Excalidraw JSON structurally, not through ad hoc text guessing;
- preserve `customData`, confidence, sync markers, and snapshot/meta sidecar
  behavior from source skills;
- keep `nacl-ba-import-doc` board-only, with graph sync delegated to
  `nacl-ba-sync`;
- keep `nacl-ba-analyze` read-only for board and graph content;
- do not claim sync unless graph write and read-back succeeded.

### Validators And Handoff

`nacl-ba-validate` and `nacl-ba-handoff` must preserve read-only validation and
cross-layer behavior.

Check that they:

- never write from validation;
- require BA graph data before validation;
- distinguish internal BA checks from BA-to-SA cross checks;
- preserve severity semantics and overall result calculation;
- report missing SA graph data as partial/cross-layer blocked evidence, not as
  full success;
- create handoff edges only after confirmation and read-back.

## Verification Requirements

Minimum checks after edits:

```sh
git diff --check -- skills-for-codex
find skills-for-codex -mindepth 1 -maxdepth 2 -name SKILL.md | wc -l
sh -n skills-for-codex/scripts/install-user-symlinks.sh
sh skills-for-codex/scripts/install-user-symlinks.sh
find -L "$HOME/.agents/skills" -maxdepth 2 -name SKILL.md | wc -l
```

Run an outside-repo discovery check:

```sh
cd /private/tmp
codex debug prompt-input 'List available NaCl BA skills only.'
```

If the sandbox blocks the Codex discovery check, rerun it with proper
escalation. Report the exact result.

Static parity checks to perform manually or with focused search:

```sh
rg -n "Source Claude skill path|Graph Contract|Workflow|Phase|Pre-flight|confirmation|BLOCKED|VERIFIED" skills-for-codex/nacl-ba-*/SKILL.md
rg -n "Task agent|Claude|model:|effort:|mcp__neo4j__write-cypher" skills-for-codex/nacl-ba-*/SKILL.md
```

Expected result:

- No active Claude-only runtime instructions remain.
- Direct MCP tool names are either in source-comparison/reference context or
  framed as conditional graph-tool behavior.
- Every BA graph writer has explicit preflight, confirmation, write, read-back,
  and report steps.
- Every BA read-only skill explicitly forbids writes.
- Every skill reports with the closed Codex verification vocabulary.

## Final Report Format

Report:

- files changed;
- BA skills repaired;
- any BA skills intentionally left unchanged and why;
- verification commands and observed outputs;
- install/discovery status;
- remaining gaps or `BLOCKED` items.

Explicitly mention that unrelated `analyst-tool/` changes were left untouched.

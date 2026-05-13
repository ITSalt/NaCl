# Handoff: Review And Repair Codex SA Skills

## Objective

Review all Codex-adapted system analyst skills under `skills-for-codex/nacl-sa-*`
against their root-level Claude Code source skills, then bring the Codex
versions to the same behavioral quality level as the recently repaired
TL/init/BA skills.

The goal is workflow parity, not a superficial wording sync: graph-first SA
methodology, exact phase ordering, BA-to-SA traceability, graph
preflight/write/read-back behavior, validation semantics, feature-request
contracts, and honest Codex status reporting.

## Current Context

This repo is already dirty. Do not touch unrelated `analyst-tool/` changes.

Recent Codex skill repairs to use as patterns:

- `skills-for-codex/nacl-init/SKILL.md`
- `skills-for-codex/scripts/nacl-init-project.sh`
- `skills-for-codex/nacl-tl-fix/SKILL.md`
- `skills-for-codex/nacl-tl-core/SKILL.md`
- `skills-for-codex/references/ba-codex-contract.md`
- `skills-for-codex/nacl-ba-*/SKILL.md`
- `skills-for-codex/scripts/install-user-symlinks.sh`

Root-level `nacl-*` folders are Claude-oriented source material. Treat them as
read-only references unless the user explicitly changes the rule.

Editable scope for this task:

- `skills-for-codex/nacl-sa-*/SKILL.md`
- shared Codex references under `skills-for-codex/` if needed
- install/docs count updates only if the number of installable `SKILL.md` files
  changes

Do not create repo-local `.agents/skills` wrappers. The canonical install model
remains user-level symlinks from `$HOME/.agents/skills/<skill>` to
`skills-for-codex/<skill>`.

## SA Skill Inventory

Review these Codex skills against their matching root-level source skills:

- `nacl-sa-architect`
- `nacl-sa-domain`
- `nacl-sa-feature`
- `nacl-sa-finalize`
- `nacl-sa-flags`
- `nacl-sa-full`
- `nacl-sa-roles`
- `nacl-sa-uc`
- `nacl-sa-ui`
- `nacl-sa-validate`

The root source path for each is `../../<skill-name>/SKILL.md` relative to the
Codex skill file.

## Required Review Method

Start read-only.

1. Capture `git status --short`.
2. For each SA skill, compare:
   - frontmatter and trigger semantics;
   - invocation parameters, modes, and command variants;
   - mandatory phases/steps and phase order;
   - graph read/write preconditions;
   - exact graph labels, relationships, IDs, properties, and query requirements;
   - BA-to-SA traceability requirements and handoff edge behavior;
   - user confirmation gates before graph writes, file writes, phase advances,
     finalization, feature-request writes, or TL handoff;
   - read-back verification after writes;
   - final report format, severity semantics, and status semantics;
   - source comparison accuracy.
3. Produce findings in three buckets:
   - Correctly preserved.
   - Incorrectly weakened or changed.
   - Missing entirely.
4. Only then edit the Codex SA skills.

The Codex versions are much more compressed than the Claude sources. Expect the
same class of issue that existed in `nacl-tl-fix` and the BA skills: important
workflow details may have been reduced to generic "when available" language.

## Repair Rules

Preserve methodology, not Claude-only mechanics.

Keep:

- graph-first SA source of truth;
- BA-to-SA traceability from the BA graph into SA artifacts;
- exact SA labels and relationship semantics from
  `graph-infra/schema/sa-schema.cypher`;
- named query expectations from `graph-infra/queries/sa-queries.cypher`,
  `handoff-queries.cypher`, and `validation-queries.cypher` when relevant;
- confirmation gates before every graph write and every destructive or
  irreversible file update;
- read-back verification after graph writes;
- read-only boundary for validation and most finalization/statistics checks;
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
- invent modules, bounded contexts, roles, permissions, domain entities, use
  cases, requirements, UI fields, or feature scope absent from BA graph data,
  user input, or existing SA graph evidence;
- make diagrams or generated markdown authoritative over graph data;
- update root-level source skills.

## Canonical SA Graph Vocabulary

Use `graph-infra/schema/sa-schema.cypher` as the label and relationship source.

SA node labels include:

- `Module`
- `UseCase`
- `ActivityStep`
- `DomainEntity`
- `DomainAttribute`
- `Enumeration`
- `EnumValue`
- `Form`
- `FormField`
- `Requirement`
- `SystemRole`
- `Component`
- `FeatureRequest`

SA-internal relationships include:

- `CONTAINS_UC`
- `CONTAINS_ENTITY`
- `HAS_STEP`
- `USES_FORM`
- `HAS_REQUIREMENT`
- `DEPENDS_ON`
- `ACTOR`
- `HAS_ATTRIBUTE`
- `RELATES_TO`
- `HAS_ENUM`
- `HAS_VALUE`
- `HAS_FIELD`
- `MAPS_TO`
- `HAS_PERMISSION`
- `USED_IN`
- `EXPOSES`
- `INCLUDES_UC`
- `AFFECTS_MODULE`
- `AFFECTS_ENTITY`
- `RAISES_REQUIREMENT`

BA-to-SA handoff relationships include:

- `AUTOMATES_AS`
- `REALIZED_AS`
- `TYPED_AS`
- `MAPPED_TO`
- `IMPLEMENTED_BY`
- `SUGGESTS`

Named SA query expectations include:

- `sa_uc_full_context`
- `sa_domain_model`
- `sa_form_domain_mapping`
- `sa_module_overview`
- `sa_uc_dependencies`
- `sa_statistics_summary`
- `sa_glossary_extract`
- `sa_readiness_assessment`
- `sa_impact_analysis`
- `sa_next_uc_in_module`
- `sa_feature_scope`
- `sa_find_uc_by_keywords`

## Expected Repairs By Skill Family

### Orchestrators

`nacl-sa-full` and `nacl-sa-feature` must preserve source orchestration and
impact-analysis semantics while adapting Claude Task usage to Codex.

Check that they:

- run a real Phase 0/resume or feature-scope check before asking for next phase;
- state phase contracts, prerequisites, expected graph output, downstream
  consumer, and status handling;
- stop after each major phase for user confirmation;
- inspect delegated output before advancing;
- never write graph data directly when the source design requires specialist
  skills;
- preserve TL handoff and feature-request graph/markdown contracts.

### Architecture And Domain Writers

`nacl-sa-architect`, `nacl-sa-domain`, and `nacl-sa-flags` must preserve graph
write contracts.

Check that they:

- perform graph/schema preflight;
- identify BA and SA prerequisites and report `BLOCKED` when missing;
- show candidate modules, context-map dependencies, domain mappings, exemption
  flags, and metadata changes before writes;
- write only after explicit confirmation;
- use canonical labels, relationship names, IDs, and properties;
- read back writes and report counts/evidence;
- produce graph-ready plans instead of fake persistence when graph tools are
  unavailable.

### Use Cases, Roles, And UI

`nacl-sa-uc`, `nacl-sa-roles`, and `nacl-sa-ui` must preserve detailed SA
contracts.

Check that they:

- derive UC candidates from BA `WorkflowStep` nodes marked
  `Автоматизируется` and missing `AUTOMATES_AS`;
- preserve `stories`, `detail`, and `list` semantics for use cases;
- require BA context before creating UC, activity, form, field, requirement, or
  traceability records;
- preserve `MAPS_TO` completeness and form-domain traceability;
- distinguish `BusinessRole` from `SystemRole`;
- preserve CRUD permission semantics through `HAS_PERMISSION {crud}`;
- create UI components/navigation only after graph-backed evidence and
  confirmation;
- read back UC, role, permission, form, component, and mapping subgraphs before
  reporting success.

### Validators And Finalization

`nacl-sa-validate` and `nacl-sa-finalize` must preserve read-only validation,
readiness, statistics, glossary, ADR, and traceability behavior.

Check that they:

- never write from validation;
- require SA graph data before validation;
- distinguish internal SA checks from BA-to-SA cross-layer checks;
- preserve severity semantics and overall result calculation;
- preserve exemption flags such as `has_ui`, `system_only`, `shared`,
  `internal`, and `field_category`;
- report missing BA graph data as partial/cross-layer blocked evidence, not as
  full success;
- create or update ADR-like requirements from finalization only after
  confirmation and read-back, if the source skill allows that write;
- keep finalization statistics/readiness evidence read-only unless an explicit
  confirmed write contract is in scope.

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
codex debug prompt-input 'List available NaCl SA skills only.'
```

If the sandbox blocks the Codex discovery check, rerun it with proper
escalation. Report the exact result.

Static parity checks to perform manually or with focused search:

```sh
rg -n "Source Claude skill path|Graph Contract|Workflow|Phase|Pre-flight|confirmation|BLOCKED|VERIFIED" skills-for-codex/nacl-sa-*/SKILL.md
rg -n "Task agent|Claude|model:|effort:|mcp__neo4j__write-cypher|mcp__neo4j__read-cypher" skills-for-codex/nacl-sa-*/SKILL.md
```

Expected result:

- No active Claude-only runtime instructions remain.
- Direct MCP tool names are either in source-comparison/reference context or
  framed as conditional graph-tool behavior.
- Every SA graph writer has explicit preflight, confirmation, write, read-back,
  and report steps.
- Every SA read-only skill explicitly forbids writes.
- Every skill reports with the closed Codex verification vocabulary.

## Final Report Format

Report:

- files changed;
- SA skills repaired;
- any SA skills intentionally left unchanged and why;
- verification commands and observed outputs;
- install/discovery status;
- remaining gaps or `BLOCKED` items.

Explicitly mention that unrelated `analyst-tool/` changes were left untouched.

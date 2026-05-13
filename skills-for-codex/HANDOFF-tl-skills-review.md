# Handoff: Review And Repair Codex TL Skills

## Objective

Review all Codex-adapted TeamLead skills under `skills-for-codex/nacl-tl-*`
against their root-level Claude Code source skills, then repair the Codex
versions so they preserve the hardened TL lifecycle contract.

The goal is workflow parity, not a superficial wording sync: graph-aware TL
planning and status, exact phase ordering, RED-first TDD, configured test
runner usage, baseline/post-change comparison, review and stub gates, delivery
gates, honest status reporting, and safe Codex adaptation of Claude-only
orchestration mechanics.

## Current Context

This repo is already dirty. Do not touch unrelated `analyst-tool/` changes.

Recent Codex skill repairs and references to use as patterns:

- `skills-for-codex/nacl-init/SKILL.md`
- `skills-for-codex/scripts/nacl-init-project.sh`
- `skills-for-codex/nacl-tl-fix/SKILL.md`
- `skills-for-codex/nacl-tl-core/SKILL.md`
- `skills-for-codex/references/ba-codex-contract.md`
- `skills-for-codex/nacl-ba-*/SKILL.md`
- `skills-for-codex/nacl-sa-*/SKILL.md`
- `skills-for-codex/scripts/install-user-symlinks.sh`

Root-level `nacl-*` folders are Claude-oriented source material. Treat them as
read-only references unless the user explicitly changes the rule.

Editable scope for this task:

- `skills-for-codex/nacl-tl-*/SKILL.md`
- shared Codex references under `skills-for-codex/` if needed
- install/docs count updates only if the number of installable `SKILL.md` files
  changes

Do not create repo-local `.agents/skills` wrappers. The canonical install model
remains user-level symlinks from `$HOME/.agents/skills/<skill>` to
`skills-for-codex/<skill>`.

## TL Skill Inventory

Review these Codex skills against their matching root-level source skills:

- `nacl-tl-conductor`
- `nacl-tl-deliver`
- `nacl-tl-deploy`
- `nacl-tl-dev`
- `nacl-tl-dev-be`
- `nacl-tl-dev-fe`
- `nacl-tl-diagnose`
- `nacl-tl-docs`
- `nacl-tl-fix`
- `nacl-tl-full`
- `nacl-tl-hotfix`
- `nacl-tl-intake`
- `nacl-tl-next`
- `nacl-tl-plan`
- `nacl-tl-qa`
- `nacl-tl-reconcile`
- `nacl-tl-regression-test`
- `nacl-tl-release`
- `nacl-tl-reopened`
- `nacl-tl-review`
- `nacl-tl-ship`
- `nacl-tl-status`
- `nacl-tl-stubs`
- `nacl-tl-sync`
- `nacl-tl-verify`
- `nacl-tl-verify-code`

The root source path for each is `../../<skill-name>/SKILL.md` relative to the
Codex skill file.

Also review:

- `nacl-tl-core`

`nacl-tl-core` is a Codex-side shared reference. It may not have a matching
root-level source folder in this checkout. Compare it against the repaired TL
contract, its referenced files, and every TL skill that consumes it.

## Required Review Method

Start read-only.

1. Capture `git status --short`.
2. For each TL skill, compare:
   - frontmatter and trigger semantics;
   - invocation parameters, modes, command variants, and flags such as
     `--continue`, `--force`, `--skip-*`, `--dry-run`, `--staging`, and
     `--production`;
   - mandatory phases/steps and phase order;
   - task, wave, graph, `.tl/`, tracker, git, CI, deploy, and release
     preconditions;
   - exact graph labels, relationships, IDs, properties, and query
     requirements when the skill is graph-aware;
   - configured runner discovery from `package.json` `scripts.test`;
   - RED-first, GREEN, REFACTOR, baseline, post-change, review, sync, stub, QA,
     docs, and delivery gates;
   - user confirmation gates before graph writes, file writes, tracker moves,
     branch changes, commits, pushes, CI retries, deploys, merges, releases, or
     irreversible cleanup;
   - read-back or evidence verification after graph, file, tracker, git, CI, or
     deploy mutations;
   - final report format, headline semantics, `Status:` semantics, and
     downstream consumer expectations;
   - source comparison accuracy.
3. Produce findings in three buckets:
   - Correctly preserved.
   - Incorrectly weakened or changed.
   - Missing entirely.
4. Only then edit the Codex TL skills.

The Codex versions are often compressed relative to the Claude sources. Expect
the same issue class found in previous TL/BA/SA repairs: important workflow
details may have been reduced to generic "when available" language.

## Repair Rules

Preserve methodology, not Claude-only mechanics.

Keep:

- graph-aware TL lifecycle and file fallback rules;
- task and wave truth from `graph-infra/schema/tl-schema.cypher` and
  `graph-infra/queries/tl-queries.cypher` when graph access is available;
- SA-to-TL handoff from `UseCase -[:GENERATES]-> Task`;
- exact TL labels and relationships: `Task`, `Wave`, `APIEndpoint`,
  `IN_WAVE`, `DEPENDS_ON`, `IMPLEMENTS`, `GENERATES`, `CONSUMES`, `PRODUCES`;
- configured test runner discovery from nearest `package.json` `scripts.test`;
- no invented fallback runners when `scripts.test` is missing or broken;
- strict RED-first behavior for testable code changes;
- separate regression-test author contract where source methodology requires
  `nacl-tl-regression-test`;
- baseline and post-change failure comparison before claiming success;
- review, sync, stub, QA, docs, ship, verify, deploy, and release gates;
- confirmation gates before every graph write, file write, tracker update, git
  mutation, CI retry, deploy, merge, release, or destructive action;
- closed Codex verification vocabulary for top-level status:
  `VERIFIED`, `FAILED`, `PARTIALLY_VERIFIED`, `BLOCKED`, `NOT_RUN`,
  `UNVERIFIED`.

Preserve workflow-specific outcomes such as `PASS`, `NO_INFRA`,
`RUNNER_BROKEN`, `REGRESSION`, and source headline variants only as report
details. They must not replace the top-level closed Codex `Status:` value.

Adapt:

- Claude Task-agent assumptions into Codex-compatible orchestration. Do not
  claim isolated delegation exists unless it is actually available and allowed
  in the current turn.
- Direct MCP or tracker tool names into conditional tool behavior. If tools are
  unavailable, report `BLOCKED`, `NOT_RUN`, or `UNVERIFIED`; do not pretend
  persistence happened.
- Claude-specific runtime/model wording into Codex-neutral instructions.
- Source slash-command wording into compatibility triggers, not Codex-only
  invocation requirements.

Do not:

- remove important phases to make the skill shorter;
- allow `--continue`, `--force`, or `--skip-*` paths to bypass required
  verification without explicit user confirmation and honest status;
- let graph, file, tracker, git, CI, deploy, merge, or release mutations happen
  without prior user confirmation;
- mark a task, phase, delivery, deployment, hotfix, or release verified without
  executed and inspected evidence;
- treat review approval as a substitute for implementation verification;
- treat skipped QA, missing tests, missing runner, or missing deploy evidence as
  success;
- invent tasks, waves, UC scope, API endpoints, test commands, deployment URLs,
  tracker IDs, release tags, or changelog entries absent from graph, files,
  user input, or observed tool output;
- update root-level source skills.

## Canonical TL Graph Vocabulary

Use `graph-infra/schema/tl-schema.cypher` as the TL label and relationship
source.

TL node labels include:

- `Task`
- `Wave`
- `APIEndpoint`

TL-internal relationships include:

- `IN_WAVE`
- `DEPENDS_ON`
- `IMPLEMENTS`

SA-to-TL and endpoint relationships include:

- `GENERATES`
- `CONSUMES`
- `PRODUCES`

Important Task properties include:

- `status`
- `wave`
- `priority`
- `phase_be`
- `phase_fe`
- `phase_sync`
- `phase_review_be`
- `phase_review_fe`
- `phase_qa`
- `created`
- `updated`

Named TL query expectations include:

- `tl_uc_task_context`
- `tl_wave_tasks`
- `tl_blocked_tasks`
- `tl_progress_stats`
- `tl_actionable_tasks`
- `tl_active_wave`
- `tl_task_with_uc_context`
- `tl_progress_by_wave`
- `tl_phase_progress`
- `tl_task_scoring`

## Expected Repairs By Skill Family

### Shared Core

`nacl-tl-core` must be a strict shared reference, not an execution skill.

Check that it:

- points to the real Codex reference files and templates;
- preserves configured runner, TDD, review, docs, changelog, and stub rules;
- states that common TL outcomes are details under the closed status vocabulary;
- does not modify files, graph state, git, CI, tracker, deploy, or release
  state directly;
- does not select or constrain the runtime model.

### Orchestrators

`nacl-tl-conductor`, `nacl-tl-full`, `nacl-tl-deliver`, and `nacl-tl-reopened`
must preserve source orchestration while adapting Claude Task usage to Codex.

Check that they:

- run a real Phase 0/resume/scope check before asking for the next phase;
- state phase contracts, prerequisites, expected output, downstream consumer,
  and status handling;
- inspect downstream reports before advancing state;
- parse the authoritative `Status:` line, not only headlines;
- stop after major phases for user confirmation where writes or irreversible
  actions follow;
- never mark a phase `VERIFIED` without executed and inspected evidence;
- treat unavailable delegation as `BLOCKED` or `UNVERIFIED`.

### Development And Fix Skills

`nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-fix`,
`nacl-tl-hotfix`, and `nacl-tl-regression-test` must preserve the hardened
TDD and repair contract.

Check that they:

- read task specs, contracts, acceptance criteria, and changed-file scope before
  editing;
- discover the test runner from nearest `package.json` `scripts.test`;
- report `BLOCKED` or the matching workflow detail when `scripts.test` is
  missing or the runner is broken;
- capture baseline failures before editing;
- write or obtain a RED test before testable code changes;
- compare post-change failures to baseline;
- report regression as `FAILED`;
- keep `NO_INFRA`, `RUNNER_BROKEN`, `PASS`, and `REGRESSION` as details under
  the closed top-level `Status:`;
- preserve documentation synchronization and changelog evidence when behavior
  contracts change;
- prevent hotfix shipping unless required checks are `VERIFIED` or the user
  gives a fresh explicit override for partial evidence.

### Review, Verification, Sync, Stubs, And QA

`nacl-tl-review`, `nacl-tl-verify`, `nacl-tl-verify-code`, `nacl-tl-sync`,
`nacl-tl-stubs`, and `nacl-tl-qa` must preserve quality gates.

Check that they:

- stay read-only unless a confirmed tracking/report write is in scope;
- review against task specs, API contracts, acceptance criteria, changed files,
  tests, stubs, mocks, and security/error-handling expectations;
- distinguish implementation review from verification evidence;
- require baseline evidence before treating verify-code success as strong
  evidence;
- report missing runtime/browser/test coverage as `PARTIALLY_VERIFIED`,
  `BLOCKED`, or `UNVERIFIED`, not success;
- scan production and test files for placeholders and hollow tests;
- preserve stub severity and registry behavior;
- keep QA separate from code review and report actual browser/server evidence.

### Planning, Status, Intake, And Diagnosis

`nacl-tl-plan`, `nacl-tl-next`, `nacl-tl-status`, `nacl-tl-intake`,
`nacl-tl-diagnose`, and `nacl-tl-reconcile` must preserve graph-aware planning
and honest file fallback.

Check that they:

- read graph Task/Wave/SA context first when graph access is available;
- use `.tl/` files only as documented fallback or supplementary evidence;
- do not claim graph completeness or SA coverage in fallback-only mode;
- use canonical task/wave IDs and dependency semantics;
- create or update plans, status files, reconciliation docs, or tracker records
  only after confirmation;
- report stale, inconsistent, missing, or partial data explicitly.

### Documentation And Delivery

`nacl-tl-docs`, `nacl-tl-ship`, `nacl-tl-deploy`, and `nacl-tl-release` must
preserve downstream safety gates.

Check that they:

- require approved review and implementation evidence before documentation;
- verify docs against implementation, acceptance criteria, links, examples, and
  changelog requirements;
- inspect dirty git state before staging, committing, pushing, or opening PRs;
- stage only intended files;
- require local checks before shipping;
- observe CI and deployment health instead of assuming success;
- tie deployed commit or release tag back to verified task evidence;
- prevent release promotion on `BLOCKED`, `FAILED`, or `UNVERIFIED` evidence
  unless the user gives an explicit override and the final status remains
  honest.

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
codex debug prompt-input 'List available NaCl TL skills only.'
```

If the sandbox blocks the Codex discovery check, rerun it with proper
escalation. Report the exact result.

Static parity checks to perform manually or with focused search:

```sh
rg -n "Source Claude skill path|Contract|Workflow|Phase|Step|confirmation|Status:|BLOCKED|VERIFIED|baseline|RED|GREEN|scripts.test" skills-for-codex/nacl-tl-*/SKILL.md
rg -n -- "Task agent|Claude|model:|effort:|mcp__neo4j__write-cypher|mcp__neo4j__read-cypher|--continue|--force|--skip|fallback runner" skills-for-codex/nacl-tl-*/SKILL.md
```

Expected result:

- No active Claude-only runtime instructions remain.
- Direct MCP or tracker tool names are either in source-comparison/reference
  context or framed as conditional tool behavior.
- Every TL graph or file writer has explicit preflight, confirmation, write,
  read-back or evidence-check, and report steps.
- Every TL read-only skill explicitly forbids writes.
- Every development or fix skill preserves configured runner discovery,
  RED-first discipline, baseline/post-change comparison, and regression
  reporting.
- Every orchestrator consumes the closed `Status:` value from downstream
  reports before advancing.
- Every delivery/release skill blocks or honestly downgrades when CI, deploy,
  health, verification, or task evidence is unavailable.
- Every skill reports with the closed Codex verification vocabulary.

## Final Report Format

Report:

- files changed;
- TL skills repaired;
- any TL skills intentionally left unchanged and why;
- review findings in the three required buckets;
- verification commands and observed outputs;
- install/discovery status;
- remaining gaps or `BLOCKED` items.

Explicitly mention that unrelated `analyst-tool/` changes were left untouched.

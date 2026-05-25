# Plan — Codex Skill Refinement Post-2.10.0

## Planning Basis

- This is a planning-only artifact.
- Do not edit root-level `nacl-*` skills during execution unless a later user
  explicitly changes that rule.
- Do not copy root SKILL.md files into `skills-for-codex/`.
- Preserve the `skills-for-codex/MIGRATION.md` philosophy: Codex skills are
  curated, minimal, Codex-native ports with `name` and `description`
  frontmatter only.
- Preserve the standard Codex sections: `Capabilities` and
  `Source Comparison`.
- Preserve the closed verification vocabulary from
  `skills-for-codex/references/verification-vocabulary.md`.
- Preserve Codex orchestration semantics from
  `skills-for-codex/references/orchestration-model.md`.
- Current inventory was re-derived on 2026-05-25 from this checkout.
- Root installable skills: 58 root `nacl-*/*/SKILL.md` files.
- Codex installable skills: 58 `skills-for-codex/*/SKILL.md` files.
- Root-only installable skill: `nacl-goal`.
- Codex-only installable skill: `nacl-tl-core`, intentionally a shared Codex
  TL reference.
- Root directories without SKILL.md: `nacl-migrate-core`, `nacl-tl-core`.
- The handoff snapshot said Codex had 59 skill dirs; the current tree has 58.
- Every execution phase must quote these operating constraints by name where
  relevant:
  - `feedback_no_private_info_in_public_repo`
  - `feedback_release_artifacts`
  - `feedback_skill_vs_agent_frontmatter`
  - `feedback_baseline_failures_need_proof`

## Phase A — Drift Audit

Goal: produce a write-up only. No skill files are modified in this phase.

The execution agent must re-run the inventory before acting, because this table
is a plan snapshot, not a permission to skip verification.

Classification rules:

- `MISSING_IN_CODEX`: root skill has SKILL.md, Codex variant is absent.
- `STALE_CODEX`: Codex variant exists but misses a root contract change that
  the Codex port must reflect.
- `INTENTIONAL_DIVERGENCE`: Codex differs by documented minimalist-port design.
- `IN_SYNC`: Codex is current with respect to its intended scope.

| Skill | Classification | Current evidence | Execution instruction |
|---|---|---|---|
| `nacl-ba-analyze` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-context` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-entities` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-from-board` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-full` | `STALE_CODEX` | Root has `## NOT for /goal`; Codex has no `/goal` text. | Add Codex `Goal Boundary` summary. |
| `nacl-ba-glossary` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-handoff` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-import-doc` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-process` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-roles` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-rules` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-sync` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-validate` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-ba-workflow` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-core` | `IN_SYNC` | Codex core is the shared Codex convention entrypoint. | Re-check only. |
| `nacl-goal` | `MISSING_IN_CODEX` | Root has SKILL.md; `skills-for-codex/nacl-goal/` is absent. | Plan and then author a Codex variant in Phase B execution. |
| `nacl-init` | `IN_SYNC` | Codex install/update philosophy already reflected; no 2.10.0 `/goal` annotation. | Re-check install count text after adding `nacl-goal`. |
| `nacl-migrate` | `STALE_CODEX` | Root has `## Use with /goal`; Codex has no `/goal` text. | Add Codex `Goal Compatibility` summary. |
| `nacl-migrate-ba` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-migrate-sa` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-publish` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-render` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-architect` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-domain` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-feature` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-finalize` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-flags` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-full` | `STALE_CODEX` | Root has `## NOT for /goal`; Codex has no `/goal` text. | Add Codex `Goal Boundary` summary. |
| `nacl-sa-roles` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-uc` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-ui` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-sa-validate` | `STALE_CODEX` | Root has `## Use with /goal`; Codex has no `/goal` text. | Add Codex `Goal Compatibility` summary. |
| `nacl-tl-conductor` | `STALE_CODEX` | Root has `## Use with /goal`; Codex has no `/goal` text. | Add Codex `Goal Compatibility` summary. |
| `nacl-tl-core` | `INTENTIONAL_DIVERGENCE` | Codex-only shared reference; root dir has no SKILL.md. | Keep; consider goal cross-reference additions only if shared by TL skills. |
| `nacl-tl-deliver` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-deploy` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-dev` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-dev-be` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-dev-fe` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-diagnose` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-docs` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-fix` | `STALE_CODEX` | Root has `## Use with /goal`; Codex has no `/goal` text. | Add Codex `Goal Compatibility` summary. |
| `nacl-tl-full` | `STALE_CODEX` | Root has `## Use with /goal`; Codex has no `/goal` text. | Add Codex `Goal Compatibility` summary. |
| `nacl-tl-hotfix` | `STALE_CODEX` | Root has `## NOT for /goal`; Codex has no `/goal` text. | Add Codex `Goal Boundary` summary. |
| `nacl-tl-intake` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-next` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-plan` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-qa` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-reconcile` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-regression-test` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-release` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check release artifacts after Phase E. |
| `nacl-tl-reopened` | `STALE_CODEX` | Root has `## Use with /goal`; Codex has no `/goal` text. | Add Codex `Goal Compatibility` summary. |
| `nacl-tl-review` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-ship` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-status` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-stubs` | `STALE_CODEX` | Root has `## Use with /goal`; Codex has no `/goal` text. | Add Codex `Goal Compatibility` summary. |
| `nacl-tl-sync` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-verify` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |
| `nacl-tl-verify-code` | `IN_SYNC` | Codex has source comparison and no 2.10.0 `/goal` annotation in root. | Re-check only. |

Execution notes:

- `STALE_CODEX` is limited here to 2.10.0 `/goal` annotation drift.
- Size differences are not drift by themselves.
- Old root-vs-Codex size gaps are intentional when covered by
  `MIGRATION.md`, `Source Comparison`, and shared references.
- If the execution agent finds a new root contract change while re-running the
  audit, it must add a row note before editing.
- `feedback_no_private_info_in_public_repo` applies to the audit text if it is
  committed or published.

Deliverables:

- Updated drift table in the execution report.
- One explicit set-difference result: root-only, Codex-only, and no-SKILL root
  directories.
- One explicit note that `nacl-tl-core` is a Codex shared reference, not a
  missing root skill.

Acceptance test:

- `find . -maxdepth 2 -path './nacl-*' -type d -exec test -f '{}/SKILL.md' ';' -print | wc -l`
- `find skills-for-codex -mindepth 1 -maxdepth 2 -name SKILL.md | wc -l`
- `rg -n "## Use with /goal|## NOT for /goal" nacl-*/SKILL.md`
- `rg -n "/goal|nacl-goal|GOAL_PROOF" skills-for-codex/nacl-*/SKILL.md`
- Audit report explains every root/Codex set difference.

## Phase B — `nacl-goal` Codex Variant Authoring Plan

Goal: author the plan for `skills-for-codex/nacl-goal/SKILL.md`, not the file
inside this planning phase.

Codex frontmatter:

- `name`: `nacl-goal`.
- `description`: describe, in one sentence, that this Codex skill prepares and
  validates NaCl `/goal` aliases, GOAL_PROOF checks, refusals, and preview
  output for compatibility with `/nacl-goal`.
- Do not include `model` or `effort`.
- Quote `feedback_skill_vs_agent_frontmatter`: Codex SKILL.md frontmatter for
  this package remains `name` and `description` only per `MIGRATION.md`.

Recommended section order:

1. Title: `# NaCl Goal Compatibility For Codex`.
2. Required references.
3. `## Codex Runtime Boundary`.
4. `## Invocation`.
5. `## Preview Semantics`.
6. `## Start Semantics`.
7. `## Alias Resolution`.
8. `## GOAL_PROOF Contract`.
9. `## Refusal Catalog`.
10. `## Permissions And Human Gates`.
11. `## Capabilities`.
12. `## Source Comparison`.

Capabilities section topics, in order:

- May Do:
  - Resolve built-in aliases from `../../nacl-goal/aliases.md`.
  - Read root `/goal` docs and root check scripts.
  - Produce preview text without starting a goal loop.
  - Run check scripts locally when the checkout and shell are available.
  - Report compatibility status with the Codex closed vocabulary.
- Must Not Do:
  - Pretend Codex can issue Anthropic `/goal` unless the runtime exposes that
    command in the current environment.
  - Suppress mandatory human gates.
  - Rename GOAL_PROOF fields or refusal codes.
  - Run with or recommend permission bypass.
  - Mutate graph, git, tracker, release, or production state during preview.
- Conditional Tools And Actions:
  - Shell execution is conditional on local tool availability and permission.
  - Graph and tracker reads are conditional on configured tools.
  - Actual autonomous start is external-runtime dependent.
  - If actual `/goal` is unavailable, print the exact interactive fallback and
    report `Status: BLOCKED` or `NOT_RUN`, not success.
- Blocked Or Unverified Reporting:
  - Use `BLOCKED` for missing checkout, missing scripts, unavailable `/goal`,
    disabled hooks, untrusted workspace, or denied permissions.
  - Use `UNVERIFIED` when preview can be composed but no check script ran.
  - Use `NOT_RUN` when `--start` is intentionally not attempted by Codex.

Source Comparison plan:

- Source Claude skill path: `../../nacl-goal/SKILL.md`.
- Preserved methodology:
  - Two-phase preview then start.
  - Alias catalog and tier model.
  - GOAL_PROOF wire format.
  - Structured refusal catalog.
  - Permission denylist and human-gate split-mode behavior.
  - 2.10.0 vs 2.10.1 capability distinction.
- Intentionally dropped from the Codex variant:
  - Claude frontmatter fields.
  - Instructions that assume Task-agent mechanics.
  - Claims that Codex can directly issue Anthropic `/goal` when no such runtime
    primitive is available.
  - Long duplicated guide prose already maintained under `docs/guides/`.
  - Full refusal-message catalog text when a reference link is enough.
- Codex replacement behavior:
  - Prepare and verify goal-compatible commands.
  - Execute deterministic local checks only when tools are available.
  - Treat `/goal` start as an external runtime action unless proven available.
  - Keep GOAL_PROOF and refusal codes as stable protocol references.

Alias check script invocation plan:

- `wave.sh`:
  - Built-in alias: `wave:<N>`.
  - Codex preview should show the root script path
    `nacl-goal/checks/wave.sh <N>` as the project-check command.
  - If executing from the NaCl checkout, use the root script.
  - If executing from another project, resolve the NaCl checkout first and use
    an absolute path in the generated preview.
- `fix.sh`:
  - Built-in alias: `fix:<BUG-NNN>`.
  - Codex preview must preserve RED-first and PR-open evidence requirements.
  - L0/L1 emergency bugs must route to the refusal path, not the fix loop.
- `validate.sh`:
  - Built-in alias: `validate:module:<MOD-ID>`.
  - Codex preview must state that validator truth comes from graph-backed
    validation evidence surfaced through GOAL_PROOF.
- `reopened-drain.sh`:
  - Built-in alias: `reopened-drain`.
  - Codex preview must preserve YouGile reachability and emergency/hotfix
    refusal behavior.

Preview vs `--start` translation:

- Preview is always the safe default.
- Preview consumes no `/goal` turn and performs no irreversible mutation.
- Preview may run a check script only as read-only evidence if the user or
  workflow asks for that verification.
- `--start` in Codex must be guarded:
  - If the active runtime exposes Anthropic `/goal`, print the composed command
    and require explicit user confirmation before invoking or advising it.
  - If the active runtime does not expose Anthropic `/goal`, do not simulate it.
  - Report `Status: BLOCKED` with reason `goal-runtime-unavailable` or
    `Status: NOT_RUN` with reason `preview-only`.
- GOAL_PROOF emission in Codex is an instruction for the eventual goal loop and
  a check-script output format; it is not proof that a goal loop ran.
- Refusal-catalog handling must fire at preview time wherever statically
  possible.
- Dynamic gate detection remains a 2.10.1 runtime concern; Codex should not
  claim it is active until the implementation evidence exists.

Docs companion decision:

- Do not create four Codex-specific copies of `docs/guides/goal-*`.
- Existing guide docs should remain the canonical protocol documentation for
  both runtime families.
- Add at most one concise Codex-specific reference if execution needs it:
  `skills-for-codex/references/goal-codex-contract.md`.
- That reference should translate runtime boundaries, path resolution, and
  Codex status mapping only.
- Reason: duplicating all guide docs creates another drift surface and conflicts
  with the curated minimalist Codex package model.

Estimated effort:

- Medium.
- The skill file itself is small.
- The hard part is saying the runtime boundary honestly and checking every
  relative path.
- Add one shared reference only if the ten stale skills would otherwise repeat
  too much text.

Private-info and proof constraints:

- Quote `feedback_no_private_info_in_public_repo`.
- Do not include private project names, local filesystem paths, dump metadata,
  or operational anecdotes in the new skill or release docs.
- Run the existing private-info canary grep from that memory note before
  release.
- Quote `feedback_baseline_failures_need_proof` when claiming a start/check
  path is safe: cite the exact check command that proves the claim.

Deliverables:

- `skills-for-codex/nacl-goal/SKILL.md`.
- Optional `skills-for-codex/references/goal-codex-contract.md` if repetition
  across Phase C would otherwise be high.
- No copied root guide docs unless the user explicitly approves that drift
  surface.
- Updated install count references from 58 to 59 where user-facing Codex docs
  mention a fixed count.

Acceptance test:

- `test -f skills-for-codex/nacl-goal/SKILL.md`
- `rg -n "model:|effort:" skills-for-codex/nacl-goal/SKILL.md` returns no
  matches.
- `rg -n "## Capabilities|## Source Comparison" skills-for-codex/nacl-goal/SKILL.md`
- `rg -n "GOAL_PROOF|REFUSE_|goal-runtime-unavailable|preview-only" skills-for-codex/nacl-goal/SKILL.md`
- The new file states the Codex runtime boundary explicitly.

## Phase C — Stale-Codex Remediation Plan For The Ten Annotated Skills

Goal: update only the ten Codex skills whose root variants gained 2.10.0
`/goal` annotations.

General placement rule:

- Add a compact `## Goal Compatibility` or `## Goal Boundary` section after the
  opening reference/prelude block and before the main workflow/invocation
  sections.
- Also add one `Capabilities` bullet only when it prevents ambiguity.
- Do not paste the full root section verbatim.
- Cross-reference `../nacl-goal/SKILL.md` once the Codex variant exists.
- Cross-reference root protocol materials as `../../nacl-goal/...` or
  `../../docs/guides/...` where those remain canonical.
- If `skills-for-codex/references/goal-codex-contract.md` is added, prefer that
  over repeating runtime-boundary prose ten times.

Per-skill remediation:

| Skill | Codex treatment | Placement | Cross-reference handling |
|---|---|---|---|
| `nacl-ba-full` | Add abbreviated `Goal Boundary`, not full root section. | After initial references, before orchestration workflow. | Refusal `REFUSE_HUMAN_GATE_BA_SA_HANDOFF`; link `../nacl-goal/SKILL.md` and `../../nacl-goal/refusal-catalog.md`. |
| `nacl-sa-full` | Add abbreviated `Goal Boundary`, not full root section. | After initial references, before orchestration workflow. | Refusal `REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION`; link `../nacl-goal/SKILL.md` and guides. |
| `nacl-tl-hotfix` | Add abbreviated `Goal Boundary`, not full root section. | After initial references and before invocation/safety workflow. | Refusal `REFUSE_HOTFIX_JUDGMENT`; warn that production branch actions remain interactive. |
| `nacl-sa-validate` | Add abbreviated `Goal Compatibility`. | After reference-loading block, before validation workflow. | Alias `validate:module:<MOD-ID>`; check script `../../nacl-goal/checks/validate.sh`. |
| `nacl-tl-full` | Add abbreviated `Goal Compatibility`. | After reference-loading block, before lifecycle workflow. | Alias `wave:<N>`; check script `../../nacl-goal/checks/wave.sh`. |
| `nacl-tl-conductor` | Add abbreviated `Goal Compatibility`. | After reference-loading block, before conductor phases. | Root mentions `feature:<FR-NNN>` and `batch:<comma-list>`; verify current alias catalog before copying because `batch` is not listed in the current root alias catalog. |
| `nacl-tl-fix` | Add abbreviated `Goal Compatibility`. | After the initial reference list and before `Critical Rule`. | Alias `fix:<BUG-NNN>`; check script `../../nacl-goal/checks/fix.sh`; preserve non-hotfix scope. |
| `nacl-tl-stubs` | Add abbreviated `Goal Compatibility`. | After the initial reference list and before scan workflow. | Alias `stubs-cleanup:<MOD-ID>`; mark as 2.10.1 alias, not 2.10.0 shipped alias. |
| `nacl-tl-reopened` | Add abbreviated `Goal Compatibility`. | After the initial reference list and before reopened workflow. | Alias `reopened-drain`; check script `../../nacl-goal/checks/reopened-drain.sh`. |
| `nacl-migrate` | Add abbreviated `Goal Compatibility`. | After the initial reference list and before migration phases. | Alias `migrate-canary`; mark retrospective gate refusal and 2.10.1 alias timing. |

Content pattern for `Goal Compatibility`:

- "This skill can be a target behind `nacl-goal` only through the named alias."
- "Codex itself must not claim that Anthropic `/goal` ran unless the runtime
  exposes it and evidence exists."
- "The alias check script is the deterministic proof source."
- "GOAL_PROOF is transcript evidence for the evaluator, not a replacement for
  local verification."
- "Use the closed Codex status vocabulary when the wrapper cannot run."

Content pattern for `Goal Boundary`:

- "This skill is not safe to wrap in `/goal` because it contains mandatory
  human judgment or approval gates."
- "The correct path is interactive execution of this skill, then a goal-wrapped
  verification alias if applicable."
- "Name the exact refusal code."
- "Do not provide bypass flags."
- "Use `BLOCKED` or `NOT_RUN` if an autonomous path is requested."

Special checks:

- `nacl-tl-conductor`: the root annotation mentions `batch:<comma-list>`, but
  current `nacl-goal/aliases.md` lists `wave`, `fix`, `validate`,
  `reopened-drain`, deferred `stubs-cleanup`, `migrate-canary`, and `feature`.
  Execution must either avoid `batch` in Codex or explicitly record it as a
  root-side future/unsupported alias pending source clarification.
- `nacl-tl-stubs`: mark `stubs-cleanup` as 2.10.1, because 2.10.0 shipped only
  four ready aliases.
- `nacl-migrate`: state that the goal loop may run only to the canary
  retrospective boundary; after that the interactive retrospective gate wins.
- `nacl-ba-full`, `nacl-sa-full`, and `nacl-tl-hotfix`: do not soften "NOT for
  /goal" into "be careful"; this is a refusal boundary.

Deliverables:

- Edits to exactly these ten Codex SKILL.md files unless a re-audit discovers a
  newer annotated root skill.
- Optional edit to `skills-for-codex/nacl-tl-core/SKILL.md` or
  `skills-for-codex/references/goal-codex-contract.md` only if shared wording is
  centralized.
- No edits to non-stale skills from Phase A.
- No edits to root `nacl-*` SKILL.md files.

Acceptance test:

- `rg -n "Goal Compatibility|Goal Boundary" skills-for-codex/nacl-{ba-full,sa-full,sa-validate,migrate}/SKILL.md skills-for-codex/nacl-tl-{conductor,fix,full,hotfix,reopened,stubs}/SKILL.md`
- `rg -n "## Use with /goal|## NOT for /goal" skills-for-codex/nacl-*/SKILL.md`
- `rg -n "model:|effort:" skills-for-codex/nacl-*/SKILL.md` returns no matches.
- `rg -n "Task agent|Claude Code|mcp__neo4j__write-cypher" skills-for-codex/nacl-*/SKILL.md` is inspected so source-comparison mentions are not mistaken for active Codex instructions.
- `git diff --check -- skills-for-codex`

## Phase D — Ongoing Sync Discipline

Goal: prevent root-to-Codex skill drift from silently re-accumulating.

Option 1: Manual checklist.

- Description:
  - Every release includes a "Codex sync TODO" item.
  - Release author checks root SKILL.md diffs and updates Codex variants.
- Pros:
  - Small effort.
  - No CI setup.
  - Easy to add to release notes templates.
- Cons:
  - Easy to forget under release pressure.
  - Does not prove anything changed.
  - Does not catch PRs that touch root skills outside a release.
  - Does not distinguish intentional divergence from stale divergence.
- Effort:
  - Small.
- NaCl counter-example:
  - Retrospectives show status artifacts and gates repeatedly accepted partial
    evidence as enough; manual memory did not prevent stale graph/status drift.
  - A Wave 4 retrospective episode closed a wave while checks were red and
    conductor state claimed clean status.

Option 2: CI guard.

- Description:
  - Add a script that detects root `nacl-*/SKILL.md` changes.
  - If a matching `skills-for-codex/<skill>/SKILL.md` exists and is untouched,
    the script flags the PR.
  - If the root skill is new, the script requires either a Codex variant or a
    checked-in exemption note.
  - If the Codex-only skill is a shared reference such as `nacl-tl-core`, the
    script allowlists it with an explicit reason.
- Pros:
  - Catches drift at PR time.
  - Keeps curated Codex divergence possible.
  - Produces evidence instead of relying on memory.
  - Cheap enough to implement now.
  - Can start as warning and become blocking.
- Cons:
  - Needs an exemption format for intentional divergence.
  - Cannot judge semantic parity by itself.
  - Needs maintenance when directories are renamed or split.
- Effort:
  - Medium.
- NaCl counter-example it addresses:
  - W9 clean-checkout failures showed that issues surfaced only when a clean
    runner exercised them.
  - W5 artifact drift showed that existence of artifacts is not enough; guard
    output must be inspected and block when required.

Option 3: Generation script.

- Description:
  - Build a tool that derives a Codex skeleton from each root SKILL.md.
  - Transform frontmatter, filter sections, cap length, and insert standard
    Codex sections.
- Pros:
  - Long-term consistency.
  - Reduces manual skeleton work for new skills.
  - Makes source comparison structure uniform.
- Cons:
  - High upfront effort.
  - Risky because Codex ports are curated, not byte mirrors.
  - Automated section filtering can remove exactly the methodology details
    prior BA/SA/TL handoffs were written to restore.
  - Needs test fixtures per skill family before it is trustworthy.
- Effort:
  - Large.
- NaCl counter-example:
  - Postmortems show tests can go green against synthetic or incomplete
    evidence while the real invariant remains broken.
  - `feedback_skill_vs_agent_frontmatter` warns against bulk metadata changes
    without practical one-file verification.

Recommendation:

- Implement Option 2, the CI guard, in the Codex sync release immediately after
  the skill-content release.
- Keep Option 1 as a release checklist supplement, not the primary control.
- Defer Option 3 to a future spike after at least one CI guard cycle produces
  real drift examples.
- Use warning mode for the first PR only if the repository currently has no CI
  path for docs/scripts checks.
- Prefer hard-fail once the script has one clean run on main.

Proposed guard behavior:

- Script name: `skills-for-codex/scripts/check-root-codex-sync.sh`.
- Inputs:
  - Base ref, default `origin/main`.
  - Head ref, default `HEAD`.
- Output:
  - `VERIFIED` when every root skill change has a Codex update or exemption.
  - `FAILED` when a root skill changed and no Codex response exists.
  - `BLOCKED` when base ref cannot be resolved.
- Exemption format:
  - `skills-for-codex/sync-exemptions/<skill>.md`.
  - Must name source root commit or PR.
  - Must explain intentional divergence.
  - Must name next review date or release.
- Do not let exemptions become silent permanent bypasses.

Deliverables:

- Script plan and, in execution, the script itself.
- Optional CI workflow or existing workflow integration.
- Sync exemption convention.
- Release checklist update.
- Documentation of hard-fail vs warning decision.

Acceptance test:

- Synthetic branch where root `nacl-tl-fix/SKILL.md` changes and Codex does not:
  script returns `FAILED`.
- Synthetic branch where both root and Codex change: script returns `VERIFIED`.
- Synthetic branch with documented exemption: script returns `VERIFIED` with
  exemption noted.
- Script handles `nacl-goal` new-root/new-Codex case.
- Script allowlists Codex-only `nacl-tl-core` explicitly.

## Phase E — Release Packaging

Goal: slice the work into shippable releases without colliding with 2.10.1.

Release 1: `2.10.2 — codex-sync-2.10.0`.

- Ships:
  - `skills-for-codex/nacl-goal/SKILL.md`.
  - Ten stale Codex `/goal` compatibility/boundary updates.
  - Optional shared Codex goal reference.
  - Updated Codex install counts from 58 to 59 in user-facing docs.
  - Release notes and TG-post drafts.
  - No 2.10.1 autonomous-execution implementation.
- Success criteria:
  - Codex installer discovers 59 skill directories.
  - `nacl-goal` appears in user-level symlink install after rerun.
  - Ten stale skills reference goal compatibility or boundary.
  - Root skills remain untouched.
  - Private-info canary grep passes.
- Approximate effort:
  - Medium.
- Required release artifacts:
  - `docs/releases/2.10.2-codex-sync-2.10.0/release-notes.md`
  - `docs/releases/2.10.2-codex-sync-2.10.0/tg-post.md`
  - `docs/releases/2.10.2-codex-sync-2.10.0/tg-post.ru.md`
  - Project docs and CHANGELOG updates as appropriate.
- Release notes must include:
  - Re-run macOS/Linux installer:
    `sh skills-for-codex/scripts/install-user-symlinks.sh`.
  - Re-run Windows installer:
    `skills-for-codex/scripts/install-user-symlinks.ps1`.
  - Pointer to `docs/setup/install-skills.md` "Update Codex Skills".

Release 2: `2.10.3 — codex-sync-guard`.

- Ships:
  - Root/Codex sync guard script.
  - CI integration or documented local gate if CI is not available.
  - Sync exemption convention.
  - Release checklist update.
- Success criteria:
  - Guard catches root SKILL drift without Codex response.
  - Guard passes current main after 2.10.2.
  - Guard output uses the closed Codex verification vocabulary.
  - Exemption path is explicit and reviewable.
- Approximate effort:
  - Medium.
- Required release artifacts:
  - `docs/releases/2.10.3-codex-sync-guard/release-notes.md`
  - `docs/releases/2.10.3-codex-sync-guard/tg-post.md`
  - `docs/releases/2.10.3-codex-sync-guard/tg-post.ru.md`
  - Documentation updates for release authors.
- Release notes must include:
  - Same Codex installer rerun instruction if any Codex skill files changed.
  - Pointer to `docs/setup/install-skills.md` "Update Codex Skills".

Release 3: `2.11.0 — codex-refinement`.

- Ships:
  - Optional broader Codex drift audit beyond `/goal`.
  - Optional generation-script spike result, if accepted after CI guard data.
  - Any curated refinements discovered by Phase D guard adoption.
- Success criteria:
  - No broad generation is accepted without one-file practical verification.
  - Any generated or assisted content preserves `MIGRATION.md` structure.
  - BA/SA/TL prior handoff contracts remain intact.
- Approximate effort:
  - Large if generation is included; small to medium if audit-only.
- Required release artifacts:
  - `docs/releases/2.11.0-codex-refinement/release-notes.md`
  - `docs/releases/2.11.0-codex-refinement/tg-post.md`
  - `docs/releases/2.11.0-codex-refinement/tg-post.ru.md`
  - Project docs and CHANGELOG updates as appropriate.

Release constraints:

- Do not use 2.10.1 for Codex sync; that slot is reserved for
  `autonomous-execution`.
- Quote `feedback_release_artifacts`: every release above needs docs updates,
  release notes, and TG-post drafts under `docs/releases/<version>-<slug>/`.
- Quote `feedback_no_private_info_in_public_repo`: before each release, run the
  existing public-repo canary grep and remove any private project identifiers,
  local paths, dump metadata, or operational anecdotes.
- Quote `feedback_baseline_failures_need_proof`: any release note that says
  install or discovery is safe must cite the exact command output proving it.

Deliverables:

- 2-3 release branches or PRs, depending on execution choice.
- Release artifact folders for every shipped release.
- Installer rerun instructions in every release that changes Codex skills.
- Changelog entries that separate shipped Codex sync from deferred autonomous
  execution work.

Acceptance test:

- `git diff --check -- skills-for-codex docs CHANGELOG.md`
- `sh -n skills-for-codex/scripts/install-user-symlinks.sh`
- `sh skills-for-codex/scripts/install-user-symlinks.sh`
- `find skills-for-codex -mindepth 1 -maxdepth 2 -name SKILL.md | wc -l`
- `find -L "$HOME/.agents/skills" -maxdepth 2 -name SKILL.md | wc -l`
- Windows installer syntax or dry-run equivalent is checked when available.
- Release artifact folder exists for each shipped release.
- Public-repo private-info canary returns zero matches.

## Final Execution Checklist

- Re-run Phase A inventory before editing.
- Confirm no unrelated dirty-tree changes are staged.
- Edit only `skills-for-codex/` and planned docs/release artifacts.
- Do not touch root-level `nacl-*` skills.
- Do not run the installer until the execution phase that explicitly needs it.
- Do not commit or push unless the user asks.
- Preserve Codex minimalist frontmatter.
- Preserve `Capabilities` and `Source Comparison`.
- Keep `/goal` runtime availability honest.
- Keep 2.10.1 autonomous execution out of 2.10.2 Codex sync.

---

## Post-2.10.1 Update (2026-05-25)

The 2.10.1 autonomous-execution work shipped via a **separate track** — not as part of any Codex sync. See `docs/releases/2.10.1-autonomous-goal-intake-orchestrator/release-notes.md`.

2.10.1's scope was revised relative to the original deferred plan (7 separate infrastructure components for the `wave` / `fix` / `validate` / `reopened-drain` aliases). The shipped milestone is a single coherent feature: the `intake` orchestrator alias — autonomous, single goal-run = single branch = single PR, with default safe-exception envelope, mechanical drift + regression checks, conditional resume, and per-atom state machine. Inner-skill changes (`/nacl-tl-fix`, `/nacl-tl-dev*`, `/nacl-tl-ship`, `/nacl-tl-intake`, `/nacl-sa-feature`, `/nacl-init`) are additive and env-var gated: when `NACL_GOAL_*` env vars are absent, every skill behaves exactly as today.

**Codex implications for the next codex-sync release:**

- A Codex variant of `nacl-goal/SKILL.md` did NOT ship with 2.10.1. The `intake` alias's autonomy-by-default UX, env-var contract, and exception-envelope namespace must be reflected in the Codex variant before the Codex `nacl-goal` skill claims `intake` support.
- The seven 2.10.1 contract files under `nacl-goal/` (`envelope.md`, `plan-lock-schema.md`, `run-artifacts.md`, `gate-prediction.md`, `retry-policy.md`, `regression-schema.md`, `pr-body-template.md`) do not yet have Codex equivalents. Phase B's design template (lines 137-307) applies to the additions, with the same minimalist-Codex constraints.
- Inner-skill SKILL.md changes (additive `## Goal-context env vars (2.10.1+)` sections) need parallel sections in the Codex variants of `nacl-tl-fix`, `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-ship`, `nacl-tl-intake`, `nacl-sa-feature`, `nacl-init`. The `check-root-codex-sync.sh` guard will flag this drift on the next PR that touches any of these root skills.
- The `## Not Included` section of `docs/releases/2.10.1-autonomous-goal-intake-orchestrator/release-notes.md` explicitly enumerates the Codex variant as deferred to a future codex-sync release.

The original Phase B / C / D / E plan in this document remains valid as a template for the codex-sync work, but the specific 2.10.1 surface to mirror is now the `intake` orchestrator, not the original 7-component plan.

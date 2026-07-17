---
name: nacl-tl-review
description: |
  Review NaCl TL implementation against task specs, API contracts, tests,
  stubs, and quality checklists. Use when reviewing backend, frontend, or full
  UC/TECH implementation, requesting changes, approving work, or when the user
  says `/nacl-tl-review`.
---

# NaCl TL Review For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Review is a gate between implementation and downstream sync, QA, docs, or ship
phases. Read `../nacl-tl-core/SKILL.md` before reviewing.

## Workflow

1. Resolve task ID, layer, changed files, task specs, API contracts, tests, and
   implementation results.
2. **Run the nav-actions consumer check for every affected UC** (see
   "Nav-actions consumer check" below). If the check refuses, emit
   `Status: BLOCKED` with workflow detail `nav-actions-missing` or
   `nav-actions-no-natural-entrypoint-evidence` and stop. No quality
   review proceeds.
3. **Run the repo-wide check gate on the wave-tip commit** (see "Repo-wide
   Check Gate" below). If the gate refuses, emit `Status: BLOCKED` with
   workflow detail `repo-checks-RED`, `repo-checks-UNRUN`, or
   `repo-checks-UNRUNNABLE` and stop. No quality review proceeds.
4. Compare implementation against task requirements and acceptance criteria.
   **Enumerate every acceptance criterion as its own row** (not the category
   groups), and score each on three axes — **implemented?** (the change
   actually produces the behaviour, confirmed by the Step 5 cross-file trace,
   not by a plausibly-named function or dead config), **reachable?** (the
   behaviour is reachable end-to-end from a real entrypoint — for UI-affecting
   criteria reuse the nav-actions natural-entrypoint evidence as the
   reachability witness), and **tested?** (a test or QA path exercises it).
   Per criterion record `PASS` / `PARTIAL` / `FAIL`: a criterion implemented
   but unreachable, or untested where the spec demands a test, is at most
   `PARTIAL`; a criterion not implemented or implemented against the wrong
   runtime is `FAIL`. Category-grouped scoring lets one missing requirement
   (e.g. an audit-log row the spec demands but no code writes) hide inside a
   mostly-passing group — per-criterion rows are the cheapest defence. If any
   of the three facts (implemented / reachable / tested) cannot be **positively
   confirmed** from the code or tests, score the criterion at most `PARTIAL` and
   record the unconfirmed fact — never `PASS` on absence of evidence.
5. **Trace cross-file, not just the diff.** Judge the change in context using
   the actual repo: for each symbol the change calls, open the callee/runtime
   that produces the data and confirm the change's assumptions hold (signature,
   return shape, side effects, any hardcoded value that silently overrides a
   parameter, and dead config — a field declared in the contract or config yet
   never set by the runtime). For each symbol the change modifies (renamed
   field, new return shape, changed enum), grep the source roots for its
   callers/consumers and confirm each still works. Cross-file and
   missing-integration defects are exactly what review must catch. A blocking
   finding may be refuted only with positive cross-file evidence (the
   guard/consumer/runtime that makes it a non-issue), never on the strength of
   the diff alone or on uncertainty.
6. Run or inspect relevant tests when available.
7. Check stubs, mocks, error handling, API contract alignment, security, and
   data persistence expectations.
8. Produce findings ordered by severity with file references. A finding's
   severity may be lowered, or the finding dropped, **only on positive evidence
   it is a non-issue** (you read the guard/handler/consumer/requirement that
   resolves it); on uncertainty, keep it at its assessed severity and flag the
   open question rather than silently dropping or downgrading it.
8a. **Self-adversarial pass (mandatory for blocking findings).** Before
   assigning the status in step 9, take each blocking finding and try to
   **refute your own claim**: re-read the cited code path — and its
   callers/consumers/runtime (step 5) — once more, asking "what would make this
   a non-issue?". This is the single-agent analogue of an independent verifier:
   a cheap second look that kills false positives. Drop a finding here **only**
   if the second read produces positive evidence it is wrong (a guard/consumer
   you missed); on uncertainty, **keep it** (the step 8 evidence rule — never
   drop on doubt). Log what you re-read for each finding you drop.
9. Update review reports or TL tracking files when available and confirmed.

## Nav-actions consumer check

Before any PASS-family status is emitted, run a consumer-side
reachability check for every UC affected by the current review. This
skill does not own the W7 graph rule, the `HAS_INBOUND_ACTION` edge,
or the Cypher template (those live in `nacl-sa-ui/SKILL.md` and
`nacl-sa-ui/references/reachability.cypher`); this skill owns the
consumer-side refusal that prevents an unreachable UC from clearing
review. The primary-owner exception for this consumer touch is
declared in the W7 plan scope_in.

Two conditions must hold for every non-exempt affected UC:

1. The UC's Form has at least one `HAS_INBOUND_ACTION` edge from a
   reachable Component (W7 "Nav Actions" subsection in the source
   sa-ui skill).
2. QA evidence for the UC references at least one natural entrypoint
   path — i.e. a route reached by clicking a captured affordance, not
   a direct URL paste.

Exemptions (must be set on the `UseCase` node OR carried by a signed
exception under the W4 schema):

- `UseCase.actor = 'SYSTEM'` — machine-triggered, no affordance.
- `UseCase.has_ui = false` — no Form attached.
- `UseCase.entrypoint_type IN ['deep-link-only', 'embed-only']` —
  invitation links, embed-only access.

Run the consumer query scoped to the affected UCs:

```text
nav_actions_consumer_check  (see nacl-sa-ui/references/reachability.cypher § 4)
parameters: $affected_uc_ids = [list of UC ids under review]
```

Outcomes:

- Both conditions hold for every non-exempt affected UC — record
  `nav-actions-GREEN:<uc-id>,<uc-id>,…`; record
  `nav-actions-EXEMPT:<uc-id>:<reason>` per exempt UC; proceed to the
  repo-wide check gate.
- Condition 1 fails — report `Status: BLOCKED` with workflow detail
  `nav-actions-missing`. VERIFIED is refused.
- Condition 2 fails — report `Status: BLOCKED` with workflow detail
  `nav-actions-no-natural-entrypoint-evidence`. VERIFIED is refused.

**VERIFIED refused if nav-actions are missing or the QA evidence
does not reference a natural entrypoint — override requires signed
exception (W4).** No inline operator-prompt override. Strict is the
single, unconditional mode for this gate.

`project_kind: prototype` does not relax this gate. A prototype that
ships an actor-triggered UC without populated nav-actions still has
VERIFIED refused. `project_kind` governs only the W4 PR/CI carve-outs.

Worked example — Project-Beta UC-100 "missing upload button". The
catalog page at `/catalog` had no upload button; users could only
reach `/upload` by URL paste. With this gate running,
`nav_actions_consumer_check` for `$affected_uc_ids = ['UC-100']`
returns one row `{uc_id: 'UC-100', form_id: 'FORM-Upload',
reason: 'no-inbound-action'}`. Status: `BLOCKED`, workflow detail
`nav-actions-missing`. The review halts before the false PASS.

## Repo-wide Check Gate

Before any quality review, run the repo-wide lint, typecheck, and test
commands on the wave-tip commit (the HEAD commit of the branch under review).
This gate is strict-only — strict is the single, unconditional mode for
this gate. There is no fallback branch, no per-project opt-out, and no
inline operator-prompt override. The only override path is a signed
exception under the schema defined by W4.

Resolve the repo-wide command triple (lint / typecheck / test) per stage,
then run all three on the wave-tip commit, in this order:

1. `config.yaml` → `repo_checks.lint` / `repo_checks.typecheck` /
   `repo_checks.test` — used verbatim when present.
2. Otherwise autodetect from the repository root: the `packageManager`
   field of the root `package.json`, else the lockfile —
   `pnpm-lock.yaml` → `pnpm -r <stage>`; `package-lock.json` →
   `npm run <stage> --workspaces`; `yarn.lock` →
   `yarn workspaces run <stage>`. Never add `--if-present` or any flag
   that turns a missing script into silent success.
3. Neither source resolves → the triple is unrunnable (see Outcomes).

Once resolved, the commands are literal. Do not swap in a different runner
mid-review, do not drop the workspace-recursive flag, do not skip a stage
because a workspace lacks the script. A missing script counts as
`unrunnable`, not as `pass`.

Outcomes:

- All three exit 0 — record evidence `repo-checks-GREEN:<wave-tip-commit-sha>`
  and proceed to the stub gate and the rest of the review.
- Any command exits non-zero — report `Status: BLOCKED` with workflow detail
  `repo-checks-RED`. VERIFIED is refused.
- Any command did not run (missing `scripts.lint` / `scripts.typecheck` /
  `scripts.test`, or runner crash before any check completes) — report
  `Status: BLOCKED` with workflow detail `repo-checks-UNRUN`. VERIFIED is
  refused.
- The toolchain is unrunnable on this workspace (resolved package manager
  not installed, no workspace root, no resolvable command source per the
  priority chain) — report `Status: BLOCKED` with
  workflow detail `repo-checks-UNRUNNABLE`. VERIFIED is refused.

**VERIFIED refused if repo checks are red/unrun on wave-tip — override
requires signed exception (W4).** Strict is the single, unconditional
mode for this gate. Every project moves through it the same way; there
is no fallback branch.

`config.yaml` may declare `project_kind: standard` (default) or
`project_kind: prototype`. The repo-wide check gate applies in both modes.
`project_kind: prototype` only governs the W4 PR/CI carve-outs for
direct-strategy releases; it does not relax local repo-check expectations.

The evidence taxonomy entry is in
`../references/verification-evidence.md`. The `project_kind` field is
specified in `../nacl-tl-core/references/config-schema.md` (or its Claude
mirror at `nacl-tl-core/references/config-schema.md`).

## Source-Parity Requirements

- Preserve the three source modes: backend `--be`, frontend `--fe`, and TECH
  with their distinct input files, review artifacts, and phase fields.
- Run the stub gate before quality review: inspect the registry/report and scan
  changed files for `TODO`, `FIXME`, `STUB`, `MOCK`, and `HACK`.
- Review TDD evidence, test output, acceptance criteria, API contracts,
  persistence, security, error handling, and test author independence.
  The test-author-independence flag is non-blocking: it must appear in the
  review artifact (with the retroactive-regression-test recommendation) but
  does not change the workflow status or forbid approval — enforcement lives
  in downstream ship/deliver gates. On a single-identity repository (every
  commit shares one author identity, the normal agent-driven case) the git
  overlap metric is uninformative; record it as such and verify the
  structural seam instead (the regression test was authored through the
  separate test-author sub-agent, per the dev result file). Missing seam
  evidence on a single-identity repo is the MAJOR finding.
- A review approval is not verification of runtime behavior. Missing test
  output, missing result files, or missing task specs blocks or downgrades the
  review.
- Review report or phase tracking writes require confirmation and read-back.
  Without confirmation, report findings inline and leave state unchanged.

## Capabilities

### May Do

- Review backend, frontend, full-stack, or technical task implementation.
- Run focused tests and static checks when available.
- Validate implementation against API contracts and task specs.
- Produce review reports and suggested corrections.
- Update review phase tracking when confirmed.

### Must Not Do

- Approve work with unresolved blocking findings.
- Rewrite implementation as part of review unless the user explicitly asks.
- Treat missing tests as passing evidence.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- File reads require workspace access.
- Test and lint commands require available project tooling.
- Report and tracking updates require writable workspace access and
  confirmation.
- Graph or task tracker updates require available tooling and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task specs, changed files, tools, or confirmation are
  missing, **when the repo-wide check gate refuses** (workflow detail
  `repo-checks-RED`, `repo-checks-UNRUN`, or `repo-checks-UNRUNNABLE`),
  **or when the nav-actions consumer check refuses** (workflow detail
  `nav-actions-missing` or `nav-actions-no-natural-entrypoint-evidence`).
- Use `FAILED` when review finds blocking or required-change issues.
- Use `PARTIALLY_VERIFIED` when only part of the implementation can be reviewed.
- Use `NOT_RUN` when tests or checks are intentionally skipped.
- Use `UNVERIFIED` when required behavior cannot be established.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-review/SKILL.md`

### Preserved Methodology

- Spec and contract-based implementation review.
- Test, stub, mock, and quality checklist awareness.
- Severity-ordered findings.
- Review report and phase tracking.

### Removed Claude Mechanics

- Source status labels outside the closed vocabulary.
- Runtime-specific review execution assumptions.
- Guaranteed tracker or graph update tooling.
- Model routing fields.

### Codex Replacement Behavior

- Use Codex code-review stance with concrete file references.
- Treat tests and trackers as conditional.
- Keep approval tied to verified evidence.
- Report with the closed verification vocabulary.

---
name: nacl-tl-reopened
description: |
  Process reopened NaCl TL items from an issue tracker or manual description,
  reproduce the failure, route repair through spec-first fixing, verify review
  and stub gates, handle shipping gates, and report honestly. Use when handling
  reopened bugs, failed verification returns, or compatibility with
  `/nacl-tl-reopened`.
---

# NaCl TL Reopened Workflow For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Drive reopened items back through repair and verification. TL artifacts and
reports remain English.

Read `../references/migration-rules.md` and
`../references/verification-vocabulary.md` before executing the workflow.

## Goal Compatibility

This skill can be a target behind `nacl-goal` only through the
`reopened-drain` alias. Reference `../nacl-goal/SKILL.md` and
`../references/goal-codex-contract.md`.

Codex itself must not claim that Anthropic `/goal` ran unless the runtime
exposes it and evidence exists. The deterministic proof source is
`../../nacl-goal/checks/reopened-drain.sh`. GOAL_PROOF is transcript evidence
for the evaluator, not a replacement for local verification. Use the closed
Codex status vocabulary when the wrapper cannot run.

## Contract

Inputs consumed:

- reopened tracker item or manual defect description;
- linked UC, TECH, review, verification, or QA artifacts when available;
- current code, tests, and `.tl/` files;
- fix, review, stub, and shipping results when those steps run.

Outputs produced:

- repaired code, tests, docs, and TL artifacts when editing is available;
- tracker notes or status changes when integration tools are available and
  confirmed;
- final reopened report using the closed verification vocabulary.

Downstream consumers:

- review and stub gates;
- shipping workflow;
- conductor or delivery reporting.

## Workflow

### Step 1: Intake

Find the reopened item from the requested scope. If no tracker integration is
available, use the user's manual description.

Capture item ID, linked UC or TECH item, failure summary, reproduction
evidence, expected behavior, affected module, and priority.

### Step 2: Claim Or Confirm Scope

Do not change tracker ownership or state unless tools are available and the
user confirms the action. If another process has already taken the item, report
`NOT_RUN` and skip it.

### Step 3: Reproduce Or Establish Evidence

Attempt the smallest reproduction using available tests, logs, browser steps,
or API calls. If the failure cannot be reproduced but the report is credible,
continue only with `UNVERIFIED` reproduction evidence and state the gap.

### Step 4: Select Repair Path

Use UC-aware context when a UC is linked. Use TECH context for infrastructure
or tooling items. If multiple modules are affected, repair lower-level data or
API behavior before presentation behavior.

### Step 5: Apply Spec-First Fix

Route the repair through `nacl-tl-fix` discipline:

- define current, expected, and unchanged behavior;
- update docs or contracts when behavior changed;
- add or update a failing regression test when testable;
- implement the minimal fix;
- validate against baseline.

Parse the resulting `Status: <VALUE>` line. If no closed-vocabulary status is
present, treat the repair result as `UNVERIFIED`.

### Step 6: Verify Repair Evidence

Confirm the repair includes explicit evidence for:

- regression test or verification command;
- baseline versus post-change comparison;
- unchanged behavior;
- docs or contracts when changed.

Missing evidence blocks automatic progression.

### Step 7: Review And Stub Gates

Run code review and stub scanning only when the relevant tools or skills are
available. Critical review findings, unresolved placeholders in required code,
or empty/hollow test structures keep the item in repair.

### Step 8: Shipping Gate

Ship only after explicit user confirmation and available git or hosting tools.
Do not commit, push, move tracker columns, or update release state without a
confirmed gate.

### Step 9: Report

Return:

- reopened item ID and linked scope;
- reproduction evidence;
- root cause and fix summary;
- files changed;
- tests and verification run;
- review and stub gate outcomes;
- tracker and shipping actions taken or `NOT_RUN`;
- final `Status: <VALUE>` using only the closed vocabulary.

## Batch Mode

For multiple reopened items, process one item at a time. Keep independent
status, evidence, and blocker details per item. Stop the batch if a shared
dependency or tool failure prevents honest processing of the remaining items.

## Capabilities

### May Do

- Read reopened descriptions, `.tl/` artifacts, code, tests, docs, and tracker
  context when available.
- Edit code, tests, docs, and TL artifacts when workspace permissions allow.
- Run configured reproduction, test, review, and stub checks when available.
- Update tracker state or shipping artifacts only after confirmation and when
  integration tools allow it.

### Must Not Do

- Treat a non-reproduced issue as verified.
- Skip spec-first repair or regression evidence for testable bugs.
- Review its own repair as independent evidence unless a separate review tool
  or user confirmation is available.
- Commit, push, deploy, or move tracker state without explicit confirmation.

### Conditional Tools And Actions

- Tracker reads and writes require available integration tools.
- File edits require writable workspace access.
- Test, browser, review, and stub checks require configured tools.
- Git and shipping actions require explicit user request or confirmed workflow
  gate.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when tracker access, task files, permissions, dependencies,
  confirmation, or required tools are unavailable.
- Use `NOT_RUN` when an item is intentionally skipped or already handled.
- Use `PARTIALLY_VERIFIED` when repair evidence exists but review, stub, or
  shipping evidence is incomplete.
- Use `UNVERIFIED` when reproduction or repair evidence is ambiguous.
- Use `FAILED` when executed checks show the reopened issue remains unresolved.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-reopened/SKILL.md`

### Preserved Methodology

- Reopened intake from tracker or manual mode.
- Reproduction before repair when possible.
- Spec-first repair through fix workflow.
- Mandatory status parsing from downstream reports.
- Review, stubs, shipping, and final report gates.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Assumptions about a specific tracker tool always being configured.
- Legacy status vocabulary outside the closed set.
- Automatic shipping and tracker movement as active behavior.

### Codex Replacement Behavior

- Treat tracker, review, stub, and shipping integrations as conditional.
- Use closed statuses for every reopened item.
- Stop on missing downstream evidence instead of inferring success.
- Require confirmation before external state changes.

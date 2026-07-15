---
name: nacl-tl-docs
description: |
  Update NaCl TL documentation after approved implementation and review
  evidence. Use when synchronizing docs, updating README or API docs, writing a
  changelog entry, finalizing task docs, or when the user says `/nacl-tl-docs`.
---

# NaCl TL Docs For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Documentation is part of delivery. Read `../nacl-tl-core/SKILL.md` before
changing TL documentation.

## Workflow

1. Resolve task ID and read task, implementation, acceptance, result, and review
   files.
2. Check that the task is approved for documentation.
3. Identify user-facing, API, configuration, changelog, and task-status docs
   that need updates.
4. Present planned doc edits when changes are broad or ambiguous.
5. Update docs and TL tracking files when file editing is available.
6. Verify documentation completeness against acceptance and review evidence.

## Source-Parity Requirements

- Documentation work is gated by approved review and implementation evidence;
  do not write docs from a speculative implementation.
- Preserve source checks for README, API docs, user guide, changelog, TL
  changelog, links, code examples, and implementation coverage.
- If behavior contracts changed, synchronize the relevant docs before claiming
  the task is documented.
- File writes require confirmation and read-back. Tracker or graph updates
  require available tooling, confirmation, and post-write evidence.
- Missing review evidence, link checks, example checks, or implementation
  coverage must report `BLOCKED`, `PARTIALLY_VERIFIED`, or `UNVERIFIED`, not
  success.

## Capabilities

### May Do

- Update README, API docs, guides, changelog, and task documentation.
- Mark documentation phase progress in TL tracking files when appropriate.
- Check that docs match implementation summaries and acceptance criteria.
- Produce a documentation completion report.

### Must Not Do

- Document unapproved implementation as complete.
- Change code.
- Invent implementation behavior not supported by task evidence.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- File edits require writable workspace access.
- Task tracker updates require available tracker tooling and confirmation.
- Documentation verification requires access to task and implementation files.
- Graph updates require available graph tooling and explicit confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when approval evidence, task files, permissions, or
  confirmation are missing.
- Use `FAILED` when docs cannot be made consistent with implementation evidence.
- Use `PARTIALLY_VERIFIED` when only some documentation surfaces can be checked.
- Use `NOT_RUN` for docs that are not relevant to the task.
- Use `UNVERIFIED` when implementation behavior cannot be established.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-docs/SKILL.md`

### Preserved Methodology

- Documentation after approved review.
- README, API docs, guides, changelog, and TL tracking updates.
- Documentation completeness checks.
- User-facing accuracy over implementation narration.

### Removed Claude Mechanics

- Runtime-specific status labels and decorations.
- Assumed task tracker tooling.
- Model routing fields.
- Runtime-specific project guidance references.

### Codex Replacement Behavior

- Use task evidence as documentation authority.
- Treat tracker and graph updates as conditional.
- Report missing evidence with the closed verification vocabulary.
- Keep code changes outside this skill.

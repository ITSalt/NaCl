---
name: nacl-init
description: |
  Initialize or refresh a NaCl project for Codex by creating project
  configuration, graph infrastructure files, project registry entries, and
  optional Codex-readable guidance. Use when setting up a new or existing NaCl
  project, checking install discovery, or when the user says `/nacl-init`.
---

# NaCl Init For Codex

Initialize a project without assuming a specific assistant runtime. Read
`../references/migration-rules.md`, `../references/verification-vocabulary.md`,
and `../nacl-core/SKILL.md` before executing this skill.

## Workflow

1. Resolve project root, project name, tech stack, and whether the invocation is
   a dry run.
2. Inspect existing project guidance, `config.yaml`, graph infrastructure, and
   NaCl project registry entries.
3. Present a plan before modifying files.
4. With confirmation, create or update `config.yaml`, `graph-infra/`, and the
   user-level NaCl project registry.
5. Configure skill discovery through user-level symlinks using the
   `skills-for-codex/scripts/install-user-symlinks.sh` strategy.
6. Report every checked artifact with the closed verification vocabulary.

Do not create repo-local skill wrappers. Skill installation and discovery live
at the user level through symlinks to `skills-for-codex/`.

## Capabilities

### May Do

- Create or update `config.yaml` from the NaCl template when file editing is
  available.
- Create graph infrastructure files from NaCl templates when the user confirms.
- Register the project in the user-level NaCl project registry.
- Check user-level skill symlinks and explain how to refresh them.
- Create Codex-readable project guidance only when the user asks for repository
  guidance.

### Must Not Do

- Modify root-level source skill folders.
- Create repo-local `.agents/skills` wrappers.
- Add `agents/openai.yaml`.
- Select or constrain the runtime model.
- Start containers, edit project files, or change registry entries without
  explicit confirmation.

### Conditional Tools And Actions

- File edits require writable workspace access and user confirmation.
- Container, network, and registry actions require available tools and
  confirmation.
- Graph checks require graph tooling available in the current Codex environment.
- Existing project guidance must be augmented, not overwritten.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required files, permissions, tools, or confirmation are
  unavailable.
- Use `PARTIALLY_VERIFIED` when only some artifacts can be checked.
- Use `UNVERIFIED` when installation or discovery cannot be confirmed.
- Use `NOT_RUN` for dry-run actions.

## Source Comparison

- Source Claude skill path: `../../nacl-init/SKILL.md`

### Preserved Methodology

- Project initialization with configuration and graph infrastructure.
- Idempotent refresh of existing projects.
- User-level project registry discovery.
- Clear final report for created, updated, skipped, or unchecked artifacts.

### Removed Claude Mechanics

- Runtime-specific project guidance as the mandatory artifact.
- Runtime-specific global config discovery.
- Repo-local skill wrapper assumptions.
- Model routing fields and assumptions.

### Codex Replacement Behavior

- Use `config.yaml`, graph templates, and project registry as portable NaCl
  artifacts.
- Keep skill discovery user-level through symlinks.
- Treat all external tools as conditional.
- Ask before mutating project files or environment state.

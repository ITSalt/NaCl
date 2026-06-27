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

## Invocation Semantics

Project-name input is not mutation approval.

- A user message such as `Use project.name: "Codex test"` only resolves input.
- A user message such as `Proceed` after the mutation plan approves file and
  registry writes for the listed project root.
- A new Codex session or `/clear` loses any pending plan. Re-run `nacl-init`
  and ask for confirmation again before writing.

Supported options:

```text
nacl-init "Project Name"
nacl-init --dry-run
nacl-init --from=.
```

Use `--dry-run` for inspection only. Report planned actions as `NOT_RUN` and do
not call the runner without explicit non-dry-run confirmation.

## Workflow

1. Resolve project root, project name, tech stack, description, and dry-run
   state. If the project name is missing, use the current directory basename.
2. Inspect existing project guidance, `config.yaml`, `graph-infra/`, `.mcp.json`
   and user-level NaCl project registry entries.
3. Inspect user-level skill discovery through `$HOME/.agents/skills`. Do not
   create repo-local skill wrappers.
4. Present a mutation plan before modifying files. The plan must list whether it
   will create or update `config.yaml`, `graph-infra/`, and the user-level
   registry.
5. Stop and ask for explicit confirmation. The confirmation must approve
   mutation, not only project metadata.
6. After confirmation, execute the deterministic runner from the NaCl checkout
   that contains this skill:

   ```sh
   sh <NaCl checkout>/skills-for-codex/scripts/nacl-init-project.sh \
     --project-root "<absolute project root>" \
     --project-name "<project name>" \
     --stack "<project stack or unspecified>" \
     --description "<project description or empty>" \
     --with-graph
   ```

   For dry runs, append `--dry-run` and do not treat the output as a mutation.
   If graph infrastructure is not wanted, omit `--with-graph`.
7. Re-check the created artifacts and report every checked artifact with the
   closed verification vocabulary.

Do not create repo-local skill wrappers. Skill installation and discovery live
at the user level through symlinks to `skills-for-codex/`.

Intake scoring seeding (source Migration check G parity): new `config.yaml`
files inherit the `intake:` self-diagnosis scoring block from the template
(`route_threshold`, `high_confidence`, `scores.*` — semantics in
`../nacl-tl-core/references/intake-scoring.md`); on an existing project the
runner appends the block with built-in defaults ONLY when no `intake:`
section exists — user-tuned values are never overwritten. Report in the final
summary whether intake scoring was seeded or already present.

## Graph Mode (local | create | connect)

A project's graph is either LOCAL (a per-project Docker Neo4j) or REMOTE (a shared Neo4j on a
VPS used by several developers). Resolve the mode deterministically before touching graph infra:

```sh
node <NaCl checkout>/nacl-tl-core/scripts/resolve-graph-mode.mjs --project-root "<root>" [--scale create|connect]
# → NACL_GRAPH_MODE: mode=local|create|connect
```

- `local` (default; absent `graph.mode` ⇒ local) — existing behaviour, unchanged.
- `create` — provision a NEW shared project against an already-provisioned VPS graph
  (`graph-infra/vps/provision-vps.sh`); runs `nacl-tl-core/scripts/create-remote.sh`
  (idempotent `(:Project)` marker seed, NO local Docker).
- `connect` — JOIN an existing shared project; runs `nacl-tl-core/scripts/connect-remote.sh`
  (read-only verify gate, NO Docker, NO schema, NO graph writes). A committed `graph.mode: remote`
  auto-routes a teammate here — they must NOT re-initialise from scratch.

Remote access uses a personal mTLS client certificate (the revocable "API key") via a local
tunnel (`graph-infra/scripts/install-sidecar.sh`); `.mcp.json` stays on `bolt://localhost:<port>`.
The registry merge is the tested `nacl-tl-core/scripts/register-project.mjs` tool. See
`../../docs/runbooks/provision-shared-graph-vps.md` and `connect-to-existing-remote-project.md`.

## Capabilities

### May Do

- Create or update `config.yaml` from the NaCl template when file editing is
  available.
- Create graph infrastructure files from NaCl templates when the user confirms.
- Register the project in the user-level NaCl project registry.
- Check user-level skill symlinks and explain how to refresh them.
- Create Codex-readable project guidance only when the user asks for repository
  guidance.
- Use `skills-for-codex/scripts/nacl-init-project.sh` as the implementation
  path instead of hand-writing scaffold files from memory.

### Must Not Do

- Modify root-level source skill folders.
- Create repo-local `.agents/skills` wrappers.
- Add `agents/openai.yaml`.
- Select or constrain the runtime model.
- Start containers, edit project files, or change registry entries without
  explicit confirmation.
- Treat a project-name correction as confirmation to mutate files.
- Continue a pending init plan across `/clear` or a new Codex session.

### Conditional Tools And Actions

- File edits require writable workspace access and user confirmation.
- The runner requires `python3` for placeholder expansion and registry JSON
  merging.
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
- Explicit separation between input gathering and mutation approval.

### Removed Claude Mechanics

- Runtime-specific project guidance as the mandatory artifact.
- Runtime-specific global config discovery.
- Repo-local skill wrapper assumptions.
- Model routing fields and assumptions.

### Codex Replacement Behavior

- Use `config.yaml`, graph templates, and project registry as portable NaCl
  artifacts.
- Keep skill discovery user-level through symlinks.
- Delegate file creation to `skills-for-codex/scripts/nacl-init-project.sh`.
- Treat all external tools as conditional.
- Ask before mutating project files or environment state.

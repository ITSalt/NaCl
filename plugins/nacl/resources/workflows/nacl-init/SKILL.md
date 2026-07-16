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
`../nacl-core/SKILL.md`, and
[`the packaged gateway binding`](../../references/workflow-gateway-contract.md)
before executing this skill.

## Packaged Gateway Binding

Use only the `initialize` sequence in the binding. All Desktop-visible actions
are MCP tools from the installed package: project resolution/migration,
`nacl_graph_local_init`, `nacl_graph_local_start`, lifecycle doctor, trusted
identity/bootstrap, health/schema/read evidence, and write-canary/read-back.
Never invoke a checkout-relative lifecycle script or guess the plugin cache
path. Preserve every returned status and structured code.

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
nacl init --install-agent-profiles
```

Use `--dry-run` for inspection only. Report planned actions as `NOT_RUN` and do
not call the runner without explicit non-dry-run confirmation.

## Workflow

1. Resolve the explicit absolute root with `nacl_project_resolve`. Never use a
   last-active project. If stable identity is absent, present the generated UUID
   and stop for `MIGRATE_PROJECT_ID:<uuid>` before
   `nacl_project_migrate_identity`. Registry-only recovery uses confirmed
   `nacl_project_register_root`.
2. Present the exact local lifecycle plan and stop for
   `INIT_LOCAL_GRAPH:<project_id>` before `nacl_graph_local_init`. Stop for
   `START_LOCAL_GRAPH:<project_id>` before `nacl_graph_local_start`, then call
   `nacl_graph_local_doctor`.
3. Derive the trusted worker identity. Bootstrap only a genuinely empty project
   after `CONFIRM_INITIAL_PROJECT_ADMIN`; otherwise require active membership.
4. If stale, run only the exact fenced `SchemaMigration/MIG-GATEWAY` recovery
   sequence from the binding. Then require verified health, schema status, and
   packaged summary read.
5. Present the canary plan and stop for `APPROVE_PROJECT_WRITE` and
   `WRITE_CANARY`. Use one stable idempotency key, then perform a separate
   read-back.
6. For optional profiles, call `nacl_agent_profiles_plan`, display every path,
   action, packaged hash, and current hash, then stop. Apply only its current
   `INSTALL_AGENT_PROFILES:<token>`. A differing file is always
   `BLOCKED/AGENT_PROFILE_CONFLICT` and the plugin never overwrites it. Ask the
   user to move or back up that file, then replan; no unrelated file is removed
   or replaced.
7. Report `VERIFIED` only if project, lifecycle, membership, current schema,
   read, write, and read-back evidence all verified. Preserve any non-success
   status/code without aggregation.

Do not create repo-local skill wrappers. Plugin installation and discovery are
handled by Codex; the separate legacy distribution remains user-level symlinks.

Remote create/connect remains outside the local pilot. Never reinterpret a
remote project as local or provision remote infrastructure from this workflow.

## Capabilities

### May Do

- Resolve or migrate stable project identity through the packaged project tools.
- Initialize/start/inspect a project-owned local graph through packaged MCP.
- Bootstrap the first trusted administrator only in the verified empty state.
- Install the five optional validated project agent profiles after exact plan
  confirmation.

### Must Not Do

- Modify root-level source skill folders.
- Create repo-local `.agents/skills` wrappers.
- Add `agents/openai.yaml`.
- Select or constrain the runtime model.
- Start containers, edit project files, or change registry entries without
  explicit confirmation.
- Execute the separate legacy installer from a plugin workflow.
- Treat a project-name correction as confirmation to mutate files.
- Continue a pending init plan across `/clear` or a new Codex session.

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
- Use the package MCP for lifecycle and agent-profile actions in both CLI and
  Desktop hosts.
- Treat all external tools as conditional.
- Ask before mutating project files or environment state.

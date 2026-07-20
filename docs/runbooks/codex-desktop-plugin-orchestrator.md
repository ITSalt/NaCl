# NaCl Codex Plugin — Clean-Context Implementation Orchestrator Runbook

Last audited: 2026-07-20

Repository: `https://github.com/ITSalt/NaCl`

Audited local checkout: `$ORIGINAL_CHECKOUT`

Audited commit: `56cea47cdbcb97732dc7d239ddd107ef2ba8aae0`
(Skills-only planning baseline; the historical Wave 0 base remains recorded in
the Execution Ledger)

Target outcome: an installable NaCl plugin that works in both Codex CLI and
Codex in the ChatGPT desktop app, without changing the Claude Code
distribution. Waves 0-7 produce and verify the non-public local candidate;
Waves 8-9 prepare complete user documentation and the production
bootstrap-first Skills-only product; Wave 10 alone owns OpenAI submission and
publication.

> **Controlling public-distribution decision (2026-07-20):**
> [ADR-005](../adr/005-codex-skills-only-bootstrap.md) supersedes the historical
> app-plus-skills/public-MCP plan in ADR-004 and in older Execution Ledger
> entries. The public target is one Skills-only UI installation followed by
> `nacl-init`; packaged scripts create the per-project Neo4j Community stack,
> install the pinned project `neo4j-mcp`, generate a no-secret launcher, and
> merge `[mcp_servers.nacl_neo4j]` into the trusted project's
> `.codex/config.toml`. The user then opens a new task. There is no public NaCl MCP service and no
> mandatory second GitHub installation. Historical ledger text is retained
> unchanged as evidence of the superseded work.

This is an executable handoff for an orchestrator starting with no prior
conversation context. Treat it as the authoritative implementation plan and
working ledger for this effort.

---

## 1. Orchestrator bootstrap instruction

When the user asks you to execute this runbook:

1. Read this document completely before changing files or Git state.
2. Inspect the live repository and revalidate every fact marked as a snapshot.
3. Use subagents for implementation and independent verification. Do not
   implement production code in the orchestrator context.
4. Create a clean integration worktree and work only there. Preserve the
   user's current checkout and untracked files.
5. Execute the waves in dependency order. Do not advance a wave on prose-only
   claims: inspect files, commands, tests, diffs, and runtime evidence.
6. Update only the **Execution Ledger** in this document after every accepted
   wave. Subagents must not edit the ledger.
7. Stop after the last explicitly authorized wave. Follow each wave's current
   status declaration; the Skills-only Wave 9 implementation is authorized as
   of 2026-07-20. In Wave 10, portal draft creation,
   submission for review, and post-approval publication are separate external
   mutations and each requires explicit user confirmation. Never merge to
   `main`, publish a marketplace version, create
   a public tag/release, or mutate real remote infrastructure merely because
   this roadmap exists.

The user's instruction to "execute this runbook" authorizes creation of the
integration worktree/branch, scoped child branches/worktrees, in-scope file
edits, tests, and local commits. It does **not** authorize push, merge to
`main`, public release, destructive cleanup, production deployment, paid
infrastructure, or secret rotation.

Use exactly one top-level status in every wave and final report:

```text
Status: VERIFIED | FAILED | PARTIALLY_VERIFIED | BLOCKED | NOT_RUN | UNVERIFIED
```

`VERIFIED` means the required checks ran and their outputs were inspected.
Review approval, compilation, unit tests, CLI smoke, Desktop smoke, graph
correctness, security, and release readiness are separate gates.

---

## 2. Objective and stopping condition

Build a versioned, self-contained repository plugin package for NaCl that:

- installs from a repository-local Codex marketplace;
- is loaded from the Codex plugin cache rather than from the source checkout;
- exposes a compact set of NaCl entry skills while retaining the existing
  methodology as internal references/workflows;
- works in both Codex CLI and Codex in the ChatGPT desktop app;
- keeps the legacy Codex symlink installation usable for users who do not
  install the plugin;
- detects and refuses an ambiguous plugin-plus-symlink double installation;
- provides a NaCl-specific MCP graph gateway;
- securely starts and connects to local per-project Neo4j instances;
- supports several projects concurrently from one plugin installation;
- implements the concurrency primitives needed for several sessions/users to
  work on one project safely;
- remains backward-compatible with the existing v2.23.0 remote graph mode;
- does not modify or behaviorally regress Claude Code skills, agents,
  workflows, or installation paths;
- produces a local user-test bundle and exact install/reinstall instructions;
- before public submission, provides complete plugin-first Russian and English
  onboarding that does not require Git or terminal use for the normal Desktop
  install path;
- publishes a complete bootstrap-first Skills-only bundle whose `nacl-init`
  creates the project-local graph and MCP configuration without a public MCP
  service or mandatory second GitHub installation.

### Definition of done for the user-test candidate

All conditions below must hold:

1. A clean `CODEX_HOME` can install the plugin from the repo marketplace.
2. `codex plugin list` shows the expected plugin version.
3. A new Codex CLI task discovers the entry skills and the graph MCP server.
4. A new Desktop task discovers the same plugin version, skills, and tools.
5. The installed cached plugin continues to work when the source checkout is
   renamed or temporarily made unavailable.
6. The legacy symlink installation still works in a separate clean home.
7. A plugin-plus-symlink conflict is detected and explained before workflows
   run.
8. Two local fixture projects have separate IDs, containers, volumes, ports,
   schema ledgers, secrets, and data; cross-project negative tests pass.
9. Two concurrent sessions on one project cannot claim the same resource,
   allocate the same human-readable ID, or overwrite a stale revision.
10. The local graph listens only on loopback, contains no committed password,
    and survives Desktop/CLI restart and plugin reinstall.
11. Uninstalling the plugin does not delete project graph data.
12. The Claude compatibility gate reports no changes to frozen Claude paths
    and passes the existing Claude-facing deterministic tests.
13. The exact candidate artifact, commit, cachebuster, test evidence, known
    limitations, and install commands are recorded in the Execution Ledger.

The pilot must implement multi-user correctness primitives and a local
two-principal/two-session E2E. Production documentation and the Skills-only
bootstrap/package projection are later gated work in Waves 8-9. OpenAI draft
creation, submission, and publication are deliberately separate external
actions in Wave 10.

---

## 3. Non-negotiable invariants

### 3.1 Runtime compatibility

| Runtime | Required contract |
|---|---|
| Claude Code | Existing root `nacl-*` package and `.claude/**` remain unchanged in the pilot. |
| Codex CLI, legacy | `skills-for-codex/scripts/install-user-symlinks.*` remains supported without a plugin. |
| Codex CLI, plugin | Uses the same plugin archive, skills, and MCP contract as Desktop; no GUI dependency. |
| Codex Desktop | Loads the repo plugin through a marketplace and cached copy. |
| Local graph | Separate Neo4j container/volume/database profile per project. |
| Shared graph | Several principals may work on one project through one project-scoped gateway/DB. |

Do not create separate Desktop-only and CLI-only skill implementations. Codex
CLI and Desktop are two hosts for one package.

### 3.2 Claude Code isolation

Freeze these paths for the pilot:

```text
.claude/**
root-level nacl-*/** source skill packages
```

Do not refactor shared Claude scripts into the new plugin during the pilot.
Copy/adapt behavior into Codex-specific plugin resources where needed. This
intentional duplication is temporary risk containment. A later canonical-core
refactor requires its own proposal and compatibility release.

The graph may receive additive nodes, properties, indexes, and constraints,
but no existing Claude-facing label, relationship, property, query result, or
ID meaning may be removed or renamed. Replay existing Claude Cypher query
fixtures against every migrated graph.

### 3.3 Git and publication safety

- Never develop directly on `main`.
- Never reuse `feature/multi-user-shared-graph`; it was merged as v2.23.0 and
  is an ancestor of current `main`.
- Never use the user's current dirty checkout as an implementation worktree.
- Subagents never share one worktree.
- Subagents never merge, push, tag, publish, or edit the Execution Ledger.
- The orchestrator never merges a worker branch before independent review.
- No public release or public marketplace entry belongs to the currently
  authorized scope. Wave 10 documents the future process but does not authorize
  portal submission, publication, push, merge, tag, or release by itself.

### 3.4 Evidence and failure safety

- Capture baseline failures before changes; compare the same commands after.
- A missing runner is `BLOCKED`, not success.
- A skipped check is `NOT_RUN`, not success.
- A partially working CLI or Desktop path is `PARTIALLY_VERIFIED`.
- Graph writes require preflight, confirmation where user-visible/destructive,
  transaction, read-back, and evidence.
- Remote/shared mode never falls back to a stale local status file.
- Do not silently weaken a gate to keep a wave moving.

---

## 4. Audited starting state — revalidate before implementation

These facts were observed on 2026-07-14 and may drift:

- Branch: `main`.
- Commit: `d98f7399e7b9941341421321407ad27ee895d221`.
- Latest release tag reachable from `main`: `v2.23.0`.
- Codex CLI: `codex-cli 0.142.0`.
- `codex plugin` supports `add`, `list`, `marketplace`, and `remove`.
- The repository contains 60 `skills-for-codex/*/SKILL.md` files and 59
  root source skills; `nacl-tl-core` is Codex-only.
- There is no tracked `.codex-plugin/plugin.json` or repository marketplace.
- `codex mcp list` did not contain a NaCl/Neo4j MCP server.
- `.codex/agents/*.toml` existed as seven untracked local files.
- The user's current checkout contained untracked `.codex/` and
  `docs/presentations/ba-sa-live-demo/client-brief.md`. Preserve them.
- Existing deterministic tool tests passed in the audit, but Desktop/plugin
  E2E did not exist.
- The existing remote multi-user work was merged into v2.23.0.

Known implementation gaps:

1. Current Codex delivery is symlink-based and depends on the full checkout.
2. Most Codex skills reference resources outside their own directory; a
   cached plugin copy would break these paths.
3. Codex `nacl-init` copies graph assets but does not prove a working Desktop
   MCP read/write path.
4. Current `.mcp.json` generation can embed a Neo4j password, while the root
   `.gitignore` does not ignore `.mcp.json`.
5. Local Compose publishes Neo4j ports without an explicit loopback bind and
   uses a development default password.
6. Existing `project_scope` is not applied to every graph query or uniqueness
   constraint. Multiple projects must not share one Community database.
7. Existing task claims identify developer+machine, so two Codex tasks on one
   machine can be treated as the same worker.
8. Claims protect `Task` only; BA/SA resources, schema migration, and release
   operations remain uncoordinated.
9. Human-readable IDs are allocated by max-suffix+1 and can collide under
   concurrent writers.
10. There is no durable schema migration ledger with version/checksum.
11. Existing destructive import does not provide a complete rollback and
    validates too little after restore.
12. CI does not prove plugin installation, cache closure, CLI/Desktop parity,
    multi-project isolation, or multi-user concurrency.
13. One Codex skill description (`nacl-postmortem`) failed the current official
    validator because of angle-bracket content.
14. Documentation reports inconsistent skill counts.

Important repository evidence to inspect:

```text
skills-for-codex/README.md
skills-for-codex/INSTALL.md
skills-for-codex/scripts/install-user-symlinks.sh
skills-for-codex/scripts/nacl-init-project.sh
skills-for-codex/sync-exemptions/nacl-init.md
skills-for-codex/nacl-core/SKILL.md
skills-for-codex/nacl-tl-core/references/tl-codex-contract.md
nacl-tl-core/scripts/setup-graph.sh
nacl-tl-core/scripts/write-mcp-config.mjs
nacl-tl-core/references/remote-mode-coordination.md
nacl-core/scripts/claim-task.mjs
nacl-core/scripts/resolve-developer-id.mjs
graph-infra/docker-compose.yml
graph-infra/schema/*.cypher
graph-infra/queries/*.cypher
graph-infra/scripts/handover-export.sh
graph-infra/scripts/handover-import.sh
docs/releases/2.23.0-multi-user-shared-graph/release-notes.md
.github/workflows/lint-skills.yml
.github/workflows/test-tools.yml
```

---

## 5. Refresh current external contracts before Wave 1

Plugin and Desktop behavior is time-sensitive. A research subagent must check
primary OpenAI sources and record the retrieval date plus relevant differences
before implementation begins. Use official sources only for technical facts:

- Plugin building: <https://learn.chatgpt.com/docs/build-plugins>
- Plugin submission: <https://learn.chatgpt.com/docs/submit-plugins>
- MCP in Codex: <https://learn.chatgpt.com/docs/extend/mcp>
- Codex configuration reference:
  <https://learn.chatgpt.com/docs/config-file/config-reference#configtoml>
- Codex skills: <https://learn.chatgpt.com/docs/build-skills>
- Codex subagents: <https://learn.chatgpt.com/docs/agent-configuration/subagents>
- Codex/Desktop changes: <https://learn.chatgpt.com/docs/whats-new>
- Secure MCP Tunnel: <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels>
- Neo4j security checklist:
  <https://neo4j.com/docs/operations-manual/current/security/checklist/>
- Neo4j backup planning:
  <https://neo4j.com/docs/operations-manual/current/backup-restore/planning/>

Facts verified during the audit, but to be refreshed:

- a plugin requires `.codex-plugin/plugin.json`;
- supported companion components include `skills/`, `.mcp.json`, `.app.json`,
  hooks/config where accepted, scripts, and assets;
- repository marketplaces use `.agents/plugins/marketplace.json`;
- installed plugins are cached under `~/.codex/plugins/cache/...`;
- editing the source plugin does not live-update an installed cached copy;
- CLI and Desktop share the Codex plugin/MCP ecosystem;
- local MCP uses STDIO and remote MCP uses Streamable HTTP;
- plugin manifests do not currently define project `.codex/agents/*.toml` as
  a first-class distributable component;
- the official plugin validator must be run;
- the current documentation does not guarantee that `${PLUGIN_ROOT}` expands
  in `.mcp.json`; this must be proven experimentally;
- the initial skill list has a bounded description budget, so publishing all
  60 current skills as independent entry points risks incomplete discovery;
- a public plugin may be submitted as **Skills only** and the portal accepts a
  final skill bundle with referenced scripts, templates, and assets;
- the current documentation does not guarantee that a Skills-only upload
  preserves a full plugin root, executable mode bits, or shared resources
  reached through `../../resources`; the exact submitted tree must be tested;
- public MCP URL, authentication, domain verification, CSP, and tool scanning
  are documented for submissions containing an app/MCP, not as requirements
  of the documented Skills-only submission path;
- Codex scopes MCP servers to a trusted project through
  `<project>/.codex/config.toml` and `[mcp_servers.<server-name>]`; project
  `.mcp.json` is not the Codex carrier.

Runtime proof recorded on 2026-07-20 with `codex-cli 0.142.0`, isolated
`CODEX_HOME`, and disposable trusted Git root
`/private/tmp/nacl-codex-mcp-spike-20260720/project`: project
`[mcp_servers.nacl_spike]` made `codex mcp list --json` return both
`global_spike` and `nacl_spike`. Trusting the wrong noncanonical `/tmp/...`
spelling returned only the global server. This proves project-config pickup and
the canonical trust boundary, not Desktop UI publication.

If current official documentation contradicts this runbook, stop Wave 1,
record the exact source and impact, and amend the architecture decision before
code implementation.

---

## 6. Target architecture

```text
Official Plugins Directory
    └─ NaCl Skills-only bundle
         ├─ compact public entry skills
         ├─ self-contained workflow/reference/script closure
         └─ nacl-init bootstrap
              ├─ exact plan + explicit confirmation
              ├─ Project A -> Neo4j A + trusted .codex/config.toml
              ├─ Project B -> Neo4j B + trusted .codex/config.toml
              └─ Project C -> Neo4j C + trusted .codex/config.toml

new task in the selected project
    └─ project-local neo4j-mcp
         ├─ schema and named graph operations
         ├─ ID allocation / revisions / leases
         ├─ audit and recovery
         └─ optional confirmed `.codex/agents` bootstrap
```

The Git marketplace/full local plugin remains a development, compatibility,
source, and recovery channel. It is not a second step in the ordinary public
installation flow. The production user installs the official card once, runs
`nacl-init`, trusts the canonical project root, and opens a new task after
project `.codex/config.toml` is written.

### 6.1 Proposed repository layout

The exact layout may be refined in ADRs, but package closure is mandatory:

```text
.agents/plugins/marketplace.json
plugins/nacl/
  .codex-plugin/plugin.json
  .mcp.json
  skills/
    nacl-init/
    nacl-ba/
    nacl-sa/
    nacl-tl/
    nacl-fix/
    nacl-verify/
    nacl-migrate/
    nacl-diagnose/
    nacl-render/       # include only if description budget permits
    nacl-publish/      # include only if description budget permits
  resources/
    workflows/         # current leaf procedures, not all discoverable skills
    references/
    templates/
  runtime/
    graph-gateway/
    graph-cli/
  graph/
    migrations/
    queries/
    compose/
  scripts/
  assets/
dist/codex-skills-only/  # generated, submission-exact tree; never canonical
  skills/
    nacl-init/           # includes its complete bootstrap closure
    nacl-ba/
    nacl-sa/
    nacl-tl/
    nacl-fix/
    nacl-verify/
    nacl-migrate/
    nacl-diagnose/
    nacl-goal/
    nacl-publish/
tests/codex-plugin/
scripts/check-claude-runtime-unchanged.sh
scripts/check-plugin-closure.mjs
.github/workflows/test-codex-plugin.yml
```

Do not assume arbitrary directories are automatically loaded by Codex. They
are package resources referenced by skills/runtime. Every manifest component
path must be relative to plugin root and validated.

### 6.2 Skill packaging decision

The current 60 skill descriptions exceed the initial discovery budget observed
in the official Codex documentation. The candidate should expose approximately
8–10 conductor/entry skills, not 60 peer entry points. Leaf methodologies move
under `resources/workflows` and are loaded deliberately by the conductor skill.

Every entry skill must:

- retain the NaCl methodology and closed status vocabulary;
- identify its allowed graph/file mutations;
- load only the references needed for the current workflow;
- avoid absolute paths and checkout-relative `../../` escapes;
- work identically under CLI and Desktop;
- never select or constrain the runtime model.

For the Skills-only submission, every entry must also be usable before any
package-level NaCl MCP exists. `nacl-init` uses packaged deterministic scripts
to create the project-local MCP configuration. Other graph-backed entries stop
with actionable `nacl-init` guidance until a new task discovers that project
MCP. They must not route through hidden `nacl_graph_*`, `nacl_project_*`,
installation-doctor, legacy-symlink, or profile tools supplied only by the full
Git plugin.

### 6.3 Agent profiles

Do not place `.codex/agents/*.toml` into the plugin and assume Codex will
discover them. The audited plugin contract does not declare agent profiles as
a plugin component.

Instead, implement an optional, explicit, idempotent project bootstrap action:

```text
nacl init --install-agent-profiles
```

It copies validated templates into `<project>/.codex/agents/` after showing the
write plan and receiving confirmation. Existing files are never overwritten
without confirmation. CLI/Desktop without profiles must still work.

### 6.4 Skills-only bootstrap and MCP pickup decision

The local cached-plugin MCP spike is retained as compatibility evidence, but it
is not the public launch contract. Before submission, prove the exact
Skills-only tree through documented local/clean-home authoring or marketplace
installation. After publication, Wave 10 repeats the same journey from the
official card. Do not assume an undocumented draft-preview install. The full
two-stage spike is:

1. Install/discover the exact Skills-only tree in a clean local test home using
   a documented authoring or marketplace path, without a source-checkout
   dependency or a pre-existing NaCl MCP. Record any portal draft preview as
   `NOT_VERIFIED` unless OpenAI documents and exposes it.
2. Invoke installed `nacl-init` and prove that all referenced scripts/assets
   resolve inside the submitted bundle.
3. Inspect the read-only plan, deny it once and prove zero mutation, then run a
   fresh plan and explicitly confirm it.
4. Prove the scripts create one project-local Community stack, install only the
   pinned checksum-verified `neo4j-mcp`, generate a no-secret machine-local
   launcher, merge `[mcp_servers.nacl_neo4j]` into trusted-project
   `.codex/config.toml`, and preserve unrelated project configuration.
5. Prove the current task stops without claiming MCP discovery.
6. Start a new task in the same project and prove MCP initialize/tools-list,
   graph/schema health, read canary, confirmed write canary, and separate
   read-back.
7. Repeat on every supported OS/architecture and with the installed source
   bundle unavailable except through the host-managed installation.
8. After publication, install the approved artifact from the official card on
   a clean second machine and rerun steps 2-7 without Git or terminal setup.

OpenAI's public docs do not promise cross-skill `../../resources` resolution,
executable-mode preservation, permission prompts, or hot reload. Before
submission, require the exact staged/upload tree to prove closure and script
execution in a clean local home; official-card proof remains Wave 10. Use a
self-contained per-skill closure, invoke scripts through a documented available
interpreter, present permissions to the user, and require a new task. Do not compensate with a
developer-authored/source-checkout absolute path, a stale installed-cache path,
Git checkout, package `.mcp.json`, or public MCP service. User-machine absolute
Node/launcher/binary paths generated and read back by `nacl-init` for that
machine are allowed in project `.codex/config.toml` when they contain no secret,
does not point into a developer checkout or plugin cache, and is regenerated
portably on another machine. Project-root `.mcp.json` is Claude/compatibility
output only and never satisfies Codex pickup.

---

## 7. Multi-project contract

One plugin installation must serve many repositories without mixing state.

### 7.1 Stable project identity

Introduce a stable generated `project.id` that does not derive from folder
name, absolute path, user, machine, branch, or worktree. A clone and all
worktrees of one repository share the ID; unrelated projects never share it.

Example target config:

```yaml
project:
  id: "01J..."
  name: "example-project"

graph:
  mode: "local"
  profile: "default"
```

Legacy projects without an ID receive one only through a presented,
confirmed, read-back-verified migration. Do not silently derive and persist it
during a read operation.

### 7.2 Project resolution

The first gateway operation is conceptually:

```text
project_resolve(project_root) -> project_id, graph_profile, schema_version
```

All subsequent graph tools require explicit `project_id`. The gateway validates
that the supplied root/config maps to that project. If several roots are open
and the caller omits scope, return `AMBIGUOUS_PROJECT`; never select the last
active project.

Registry records contain no secrets:

```text
project_id
registered_roots[]
graph_mode
graph_profile/endpoint reference
secret_reference
schema_version
last_health_status
```

### 7.3 Data isolation

For Neo4j Community, use one container and persistent volume per project.
Remote Community deployments use one private instance/container per project.
If Neo4j Enterprise is introduced later, separate databases are acceptable.

Do not implement pilot isolation by adding `project_scope` to a subset of
queries in one shared Community database. Existing global IDs and constraints
make that unsafe.

### 7.4 Required negative tests

- Projects A and B can both create `UC-001`, `MOD-001`, and `Task` IDs.
- Queries scoped to A never return B data.
- A token/secret reference for A cannot open B.
- Migrations and backups for A do not mutate or stop B.
- Uninstall/reinstall of the plugin does not delete either project's volume.
- Two worktrees of A resolve to one `project_id` but distinct sessions.
- Ambiguous multi-root calls fail closed.

---

## 8. Multi-user and multi-session contract

The existing v2.23.0 task claim is a useful baseline but is not sufficient for
Codex Desktop concurrency.

### 8.1 Identity model

Keep separate identities:

| Identity | Meaning |
|---|---|
| `principal_id` | Authenticated human/service identity used for ACL and audit. |
| `client_id` | Stable Codex installation/device identity. |
| `session_id` | One Codex task/thread/run identity. |
| `worker_id` | Derived principal + client + session owner of a lease. |
| `worktree_id` | Git worktree/checkout identity. |

Graph provenance records `principal_id` and `worker_id`. Never use only
developer+machine as a re-entrant lock owner.

### 8.2 Resource leases

Use a generic transactional lease for at least:

```text
Task
UseCase
Module
FeatureRequest
Board
SchemaMigration
ReleaseEnvironment
```

Lease fields:

```text
project_id
resource_type
resource_id
principal_id
worker_id
acquired_at
expires_at
heartbeat_at
fencing_token
```

On expiry/reacquisition, increment `fencing_token`. Every protected mutation
must present the current token. A stale worker cannot write after its lease has
expired even if it resumes later.

### 8.3 Optimistic concurrency

Mutable domain resources carry `revision`. Gateway writes accept
`expected_revision` and atomically increment it. Mismatch returns a structured
`CONFLICT` containing the current revision; the skill rereads and replans or
stops for the user.

### 8.4 Atomic ID allocation

Replace max-suffix+1 for concurrent writers with an atomic project-scoped
allocator such as:

```text
(:IdSequence {project_id, entity_kind, next_value})
```

Allocation and entity creation must occur in one transaction or use a reserved
ID with bounded retry and unique constraints. Test at high concurrency.

### 8.5 RBAC and tool policy

Gateway enforcement, not skill prose, owns authorization:

| Role | Minimum capability |
|---|---|
| `viewer` | Read project graph. |
| `analyst` | BA mutations. |
| `architect` | SA mutations. |
| `developer` | TL task/implementation mutations. |
| `release_manager` | Delivery/release leases. |
| `project_admin` | Membership, schema, backup/restore. |

Read tools may be auto-approved. Normal writes require prompt/approval policy.
Destructive, schema, restore, and administrative operations must be separated
and disabled for ordinary profiles.

### 8.6 Git coordination

Graph leases do not replace Git isolation:

- each worker uses a separate clone/worktree and child branch;
- a graph work item records branch, worktree/session, base SHA, and PR when
  present;
- one Task cannot be active in two branches without an explicit handoff;
- `.tl/status.json` is a derived cache in shared mode;
- shared-mode writes halt if the graph is unavailable;
- no offline write queue is required for the pilot;
- schema migration and release/deploy use exclusive leases.

---

## 9. Graph gateway contract

Prefer domain-scoped tools over unrestricted Cypher for normal workflows:

```text
project_resolve
graph_health
graph_schema_status
graph_read
graph_create_or_update_resource
graph_allocate_id
graph_claim_resource
graph_heartbeat_resource
graph_release_resource
graph_apply_migrations
graph_backup
```

If an administrative raw-Cypher tool exists, it must be disabled by default and
require project-admin authorization plus explicit confirmation.

Every request carries or resolves:

```text
project_id
principal_id
worker_id
idempotency_key
expected_revision (for mutable resources)
fencing_token (for leased resources)
```

Every write uses parameterized Cypher, a bounded timeout, transaction,
read-back, structured error codes, and an audit record. Do not interpolate
user/config values into Cypher text.

### Local graph security

- Bind HTTP/Bolt ports to `127.0.0.1` only.
- Generate a per-project secret; never commit it or place it in
  `.env.example`, plugin manifest, marketplace, logs, or process arguments.
- Use a secret reference/keychain or narrowly inherited environment variable.
- Use minimum APOC procedures and pin container/runtime versions.
- Pin downloaded binaries and verify checksums; do not fetch `latest` during
  normal startup.
- `start`, `health`, `stop`, `migrate`, and `backup` are explicit actions. Do
  not auto-start Docker in a session-start hook.
- A health gate must include schema status and a real read canary; a user-
  confirmed write canary is required before declaring initialization verified.

### Schema and recovery

Add a migration ledger with version and checksum, for example
`SchemaMigration {component, version, checksum, applied_at}`. Migrations are
ordered, idempotent, backed up before risky change, and read back afterward.

Restore must validate at least:

```text
node count
relationship count
label histogram
relationship-type histogram
constraints/indexes
schema migration checksum
representative NaCl queries
read/write smoke
```

Do not destroy the only usable target before the replacement is validated.

---

## 10. Branch and worktree strategy

### 10.1 Integration branch

Revalidate `main` and then create a sibling worktree:

```text
branch:   codex/desktop-plugin-integration
worktree: ../NaCl-codex-desktop
base:     current verified main
```

Before creating it:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
git merge-base --is-ancestor feature/multi-user-shared-graph main # branch-literal-ok
```

If network refresh is authorized, fetch first and record the base SHA. If not,
use the locally verified `main` and state that remote freshness is unverified.

Suggested creation command after confirmation:

```bash
git worktree add ../NaCl-codex-desktop \
  -b codex/desktop-plugin-integration main
```

Open a draft PR to `main` only if pushing/opening PRs is separately authorized.
Otherwise keep all work local.

### 10.2 Worker branches

```text
codex/plugin-00-baseline
codex/plugin-01-runtime-spike
codex/plugin-02-package-cli
codex/plugin-03-graph-gateway
codex/plugin-04-multi-project
codex/plugin-05-multi-user
codex/plugin-06-skills-agents
codex/plugin-07-e2e-candidate
```

Each worker receives a unique worktree derived from the current integration
tip. Parallel branches may touch only disjoint ownership areas declared by the
orchestrator. The orchestrator integrates one accepted wave at a time with a
merge commit or audited squash, then reruns integration gates.

Delete no branches/worktrees as part of the pilot unless the user later asks
for cleanup.

---

## 11. Orchestrator operating model

### 11.1 Concurrency

Assume a four-slot team unless the environment reports otherwise:

- one orchestrator;
- up to two implementation/research agents on disjoint work;
- one independent verifier/diagnostician.

Do not fill every slot when dependencies make the work sequential. Never let
two agents edit the same worktree or ownership area.

### 11.2 Orchestrator responsibilities

The orchestrator:

- owns scope, dependencies, worker prompts, branch/worktree assignment, and
  the Execution Ledger;
- does not write production implementation code;
- inspects worker diffs and test output;
- dispatches an independent verifier for each wave;
- asks a worker to correct bounded findings;
- integrates only verified work;
- reruns cross-cutting gates after integration;
- prevents workers from expanding scope;
- stops for user input only when a decision materially changes architecture,
  security, authorization, cost, public state, or supported platforms.

### 11.3 Context management

At the end of each wave, retain only:

- accepted commit SHA(s);
- files changed;
- commands and exit codes;
- concise evidence paths/output excerpts;
- open risks and decisions;
- next-wave prerequisites.

Write that summary into the Execution Ledger. Do not keep full worker
transcripts in the active orchestration context. Start new workers with only
the relevant wave brief, accepted ADRs, paths, and current integration SHA.

### 11.4 Worker prompt template

Use this template for every implementation agent:

```text
You are the implementation agent for <WAVE / WORK PACKAGE>.

Repository worktree: <absolute unique worktree path>
Branch: <child branch>
Integration base SHA: <sha>

Objective:
<one bounded objective>

Read first:
<only required files and accepted ADRs>

Allowed ownership:
<directories/files this worker may change>

Forbidden:
- do not edit .claude/** or root nacl-* source skill packages
- do not edit the orchestrator runbook/Execution Ledger
- do not merge, push, tag, publish, or touch another worktree
- do not weaken tests or gates
- do not add secrets

Required outputs:
<artifacts/code/tests/docs>

Required verification:
<exact commands and acceptance criteria>

Commit your scoped work locally if and only if required checks pass.
Return exactly:
Status: <closed status>
Branch:
Commit:
Files changed:
Commands and exit codes:
Evidence:
Known limitations:
Blockers / follow-up:
```

### 11.5 Verifier prompt template

```text
You are the independent verifier for <WAVE>.

Review commit <sha> in <worktree> against the wave contract. Do not edit code.
Inspect the diff, run the required commands, add adversarial/negative checks,
and look specifically for scope expansion, Claude regressions, plugin-cache
path assumptions, secret leakage, project cross-talk, and false-positive test
gates.

Return exactly:
Status: <closed status>
Findings: <severity, file:line, evidence>
Commands and exit codes:
Acceptance criteria: <pass/fail per item>
Residual risk:
Recommended disposition: ACCEPT | CORRECT | REDESIGN | BLOCK
```

The implementer may correct findings once or twice. If the same fundamental
issue remains after two correction cycles, assign a diagnostician. Stop for the
user only if the resulting choice changes a non-negotiable invariant or
authorized scope.

---

## 12. Execution waves

### Wave 0 — Baseline, branch isolation, and executable contracts

**Purpose:** establish a trustworthy integration environment before product
changes.

**Primary worker:** repository/CI engineer.

**Independent verifier:** framework compatibility reviewer.

**Tasks:**

1. Revalidate the starting-state snapshot and record drift.
2. Create the integration and worker worktrees after confirmation.
3. Capture baseline commands, failures, Docker/MCP/plugin state, and frozen
   Claude-path hashes/diff.
4. Add a CI job for repository plugin validation and child PRs/integration
   branches.
5. Add a Claude-isolation gate comparing the candidate to the recorded base.
6. Add a Codex skill validator loop that includes all
   `skills-for-codex/*/SKILL.md`.
7. Correct documentation counts and the known `nacl-postmortem` validation
   error only in Codex/docs-owned paths.
8. Create ADRs for package boundary, MCP launch spike, project isolation,
   identity/concurrency, and secret handling. ADRs may remain `proposed` until
   their spike completes.

**Required evidence:**

```bash
git status --short
git diff --check
sh skills-for-codex/scripts/check-root-codex-sync.sh <base-sha> HEAD
bash -lc 'tests=$(git ls-files "*/scripts/*.test.mjs"); node --test $tests'
```

Also run all tracked `*.test.sh` files and `bash -n` on tracked shell tools,
using the repository CI procedure rather than an invented substitute.

**Acceptance gate:**

- integration worktree is clean except scoped changes;
- user checkout/untracked files are untouched;
- baseline is stored in the ledger;
- Claude frozen paths have no candidate diff;
- Codex validator covers all 60 current skills;
- integration CI can run without publishing anything.

**On failure:** repair the baseline/CI harness before any plugin code.

---

### Wave 1 — Plugin ingestion and cached MCP launch spike

**Purpose:** prove the unstable host/package assumptions with the smallest
possible plugin.

**Primary worker:** Codex plugin specialist.

**Parallel research agent:** current official OpenAI contract refresh.

**Independent verifier:** clean-home CLI/Desktop operator.

**Tasks:**

1. Use the official plugin-creator workflow to scaffold a minimal repo plugin
   and `.agents/plugins/marketplace.json`.
2. Keep manifest values real; no TODOs or unsupported fields.
3. Add one test skill and one minimal STDIO MCP echo/health server.
4. Validate the plugin with the official validator.
5. Install from the non-default repo marketplace using the current documented
   CLI flow.
6. Prove source-to-cache behavior and record the cache path.
7. Prove or disprove relative bundled MCP launch in both CLI and Desktop.
8. Exercise the cachebuster/reinstall/new-task loop.
9. Finalize the MCP launch ADR and pilot runtime prerequisite decision.

**Do not** port NaCl skills or Neo4j logic until this spike is verified.

**Acceptance gate:**

- plugin manifest and marketplace validate;
- the plugin installs in a clean home;
- a new CLI task and Desktop task both invoke the cached test MCP;
- the cached copy works without the source checkout;
- the reinstall procedure reliably picks up a changed version;
- the selected launch method contains no developer-specific absolute path.

**On failure:** redesign the launch/install boundary. Do not compensate with a
checkout path or undocumented environment behavior.

---

### Wave 2 — Self-contained NaCl package and Codex CLI parity

**Purpose:** create the real plugin shell without graph mutations.

**Primary worker:** packaging/skills engineer.

**Independent verifier:** package-closure and CLI compatibility reviewer.

**Tasks:**

1. Replace the spike content with a real `nacl` plugin manifest.
2. Add the compact public entry skill set.
3. Bundle the required leaf workflows, contracts, templates, schemas, queries,
   and deterministic scripts under plugin root.
4. Remove all plugin runtime dependencies on checkout-external paths.
5. Add `check-plugin-closure` covering Markdown links, shell/script imports,
   manifest paths, templates, and executable resources.
6. Implement installation diagnostics for:
   - plugin only;
   - legacy symlink only;
   - both installed;
   - neither installed.
7. Preserve the legacy symlink installer and verify it in an isolated home.
8. Add a CLI-only E2E that does not require the Desktop app.
9. Validate skill discovery budget and routing prompts.

**Acceptance gate:**

- no resolved dependency leaves plugin root at runtime;
- CLI plugin installation works from cache;
- legacy symlink installation remains green;
- double installation fails with actionable guidance;
- CLI and Desktop use identical entry skill files;
- Claude frozen paths remain unchanged.

**On failure:** keep the plugin unmerged; do not add compatibility shims to
Claude paths.

---

### Wave 3 — Secure local NaCl Graph MCP Gateway

**Purpose:** provide the first real graph-backed plugin workflow.

**Primary worker:** graph gateway engineer.

**Parallel worker if ownership is disjoint:** local graph lifecycle/security
engineer.

**Independent verifier:** security and failure-mode reviewer.

**Tasks:**

1. Implement the gateway transport, structured errors, audit records, and
   parameterized graph access.
2. Implement explicit local `init/start/health/stop/doctor` lifecycle.
3. Package or generate secure local Compose assets:
   - loopback ports;
   - per-project secret reference;
   - named volume;
   - pinned versions;
   - minimum plugin/procedure privileges.
4. Add schema migration ledger/version/checksum.
5. Implement health, schema, read canary, and confirmed write/read-back smoke.
6. Ensure stopped Docker, port collision, wrong secret, missing schema, stale
   migration, and corrupt registry return explicit non-success statuses.
7. Ensure plugin uninstall never deletes project data.
8. Add backup and non-destructive restore verification primitives sufficient
   for the pilot.

**Acceptance gate:**

- CLI and Desktop see the same gateway tool schema;
- local Neo4j listens only on loopback;
- no secret appears in Git, manifest, marketplace, logs, `.env.example`, or
  process arguments;
- initialization reaches verified read/write smoke;
- restart/reinstall preserves graph data;
- migration re-run is idempotent;
- failure injection produces `BLOCKED`/`FAILED`, never false `VERIFIED`.

**On failure:** keep skills in graph-blocked mode; never fall back to claiming
graph persistence.

---

### Wave 4 — Multi-project registry, routing, and isolation

**Purpose:** allow one installed plugin to work on multiple repositories at
the same time.

**Primary worker:** project-routing engineer.

**Independent verifier:** adversarial tenant-isolation reviewer.

**Tasks:**

1. Implement stable project ID creation/migration with explicit confirmation.
2. Implement registry and root aliases without secrets.
3. Require project scope on every gateway operation.
4. Add connection pools and lifecycle routing keyed by project ID.
5. Provision separate local containers/volumes/ports per project.
6. Make multi-root ambiguity fail closed.
7. Add two-project fixtures and all negative tests from section 7.4.
8. Verify project-scoped backup, migration, uninstall, and health behavior.

**Acceptance gate:**

- the same human-readable graph IDs coexist in A and B;
- zero cross-project reads or writes under adversarial calls;
- worktrees of A resolve correctly without becoming separate data projects;
- actions on A do not stop, migrate, restore, or delete B;
- project selection never depends on last-used state.

**On failure:** treat as a release-blocking security defect, not a test flake.

---

### Wave 5 — Multi-user/session concurrency and authorization

**Purpose:** make one project safe for concurrent Codex work.

**Primary worker:** concurrency/data consistency engineer.

**Parallel worker:** authorization/audit engineer if schema ownership is
disjoint.

**Independent verifier:** race/failure-injection specialist.

**Tasks:**

1. Implement principal/client/session/worker/worktree identity separation.
2. Implement generic leases, heartbeat, expiry, release, and fencing token.
3. Implement optimistic revision/CAS.
4. Implement atomic project/entity ID sequences.
5. Protect Task, UseCase, Module, FeatureRequest, schema migration, and release
   resources at minimum.
6. Implement project roles and server-side tool authorization.
7. Preserve graph-authoritative shared-mode behavior and derived local cache.
8. Add local two-principal/two-session tests plus high-concurrency stress.
9. Add interrupted/stale worker, clock/TTL boundary, idempotency replay, and
   unauthorized write tests.
10. Regression-test the v2.23.0 remote mode without changing its Claude-facing
    skills or transport.

**Acceptance gate:**

- ten concurrent claims yield one owner;
- two sessions of one principal have different workers;
- a stale fencing token cannot write after lease takeover;
- 1,000 parallel allocations are unique and monotonic per project/entity kind;
- stale revision writes fail without partial mutation;
- unauthorized roles cannot call or emulate restricted mutations;
- retrying one idempotency key does not duplicate the mutation;
- all accepted writes retain principal/worker provenance.

**On failure:** do not reduce concurrency count or TTL assertions to hide the
race. Diagnose transactional semantics.

---

### Wave 6 — NaCl workflow integration and project agent profiles

**Purpose:** connect the packaged entry skills to the verified gateway and
ensure the framework workflow remains usable.

**Primary worker:** NaCl Codex workflow engineer.

**Independent verifier:** methodology/parity reviewer.

**Tasks:**

1. Wire entry skills to explicit gateway capabilities and structured errors.
2. Ensure `nacl-init` returns `VERIFIED` only after actual schema/read/write
   evidence.
3. Implement optional confirmed project agent-profile installation.
4. Verify BA, SA, TL plan/status, fix/verify, render/publish entry routing as
   applicable to the pilot.
5. Preserve confirmation and read-back gates.
6. Test unavailable graph, read-only role, conflicting lease, stale revision,
   multi-root ambiguity, and plugin/symlink conflict paths.
7. Compare expected methodology with the current Codex skills; record every
   deliberate divergence.
8. Confirm the public skill description budget and no omitted critical entry.

**Acceptance gate:**

- each entry workflow either completes with evidence or returns an honest
  closed status;
- no entry depends on an unbundled root skill/resource;
- project profiles install idempotently and never overwrite silently;
- routing works in CLI and Desktop new tasks;
- Claude source skills remain untouched.

---

### Wave 7 — Integrated Desktop/CLI candidate and user handoff

**Purpose:** produce the exact non-public candidate the user can install and
try.

**Primary worker:** integration QA operator.

**Independent verifier:** clean-machine/user-journey reviewer.

**Orchestrator:** evidence reconciliation and candidate freeze.

**Test matrix:**

| Dimension | Cases |
|---|---|
| Host | Codex CLI; Codex Desktop |
| Installation | legacy only; plugin only; both conflict; reinstall/update |
| Project | fresh; legacy without project ID; two projects; two worktrees |
| Graph | healthy; stopped; wrong secret; old schema; restart; backup/restore |
| Concurrency | two sessions same user; two principals; stale lease; stale revision |
| Permissions | viewer; analyst; architect; developer; admin-negative tests |
| Cache | source present; source unavailable; cachebuster update; new task pickup |
| Regression | Claude frozen paths and existing deterministic suites |

**Tasks:**

1. Build a candidate version such as
   `<framework-version>-dev+codex.<timestamp-or-sha>`.
2. Install the exact candidate from the repo marketplace into a clean home.
3. Execute the full matrix and record commands, outputs, screenshots only when
   they materially prove Desktop state, and graph evidence.
4. Run secret scan, plugin closure, manifest validator, dependency/SBOM scan if
   available, and Git diff checks.
5. Verify source-unavailable cache execution.
6. Verify plugin uninstall/reinstall and data persistence.
7. Produce exact local install, reinstall, conflict-recovery, and rollback
   commands.
8. Freeze candidate commit and update the Execution Ledger.

**Acceptance gate:** every Definition of Done item is `VERIFIED`, or a clearly
non-critical platform limitation is accepted by the user. Any missing CLI,
Desktop, Claude isolation, project isolation, concurrency, secret, or
persistence proof blocks the candidate.

**Final handoff must contain:**

```text
integration branch and SHA
plugin version/cachebuster
repo marketplace path and name
exact install/reinstall commands
required local prerequisites
known limitations
how to start two test projects
how to run graph doctor
how to remove the plugin without deleting graph data
test evidence summary
explicit statement: not merged/pushed/published
```

Stop after handing the candidate to the user. Wait for user testing and a new
instruction.

---

### Wave 8 — Plugin-first user documentation and novice onboarding

**Status in this runbook:** `NOT_RUN` until separately authorized after Wave 7.

**Purpose:** replace the legacy Codex symlink-first documentation with a
complete, ordinary-user Skills-only path before submission work, while keeping
the released Git marketplace clearly labelled as a development/compatibility
channel rather than a mandatory second install.

**Primary worker:** product documentation engineer.

**Independent verifier:** clean-context novice user-journey reviewer.

**Tasks:**

1. Audit `README*`, quick starts, setup guides, troubleshooting, skill catalog,
   graph setup, and every cross-link in Russian and English. Classify each page
   as plugin-first, Claude-specific, legacy Codex compatibility, or obsolete.
2. Maintain `docs/setup/install-codex-plugin.ru.md` and
   `docs/setup/install-codex-plugin.md`. Before publication they must label the
   official-card journey as a target that is not yet available and keep the
   immutable Git release as the verified test/compatibility channel. After
   publication, the normal path is UI-only: find the official NaCl Skills-only
   card, choose **Install**, grant scoped permissions, open a new task, and run
   `nacl-init`. Git, shell, source checkout paths, manual symlinks, and a second
   plugin installation must not be required.
3. Document install, update, reinstall, disable, uninstall, rollback, exact
   version verification, cache behavior, and the promise that plugin removal
   does not delete project graph data, profiles, or Keychain state.
4. Document the first-project path: installed-skill discovery, `nacl-init`
   read-only prerequisite/closure check, explicit project resolution,
   confirmation tokens, optional Docker/Keychain graph bootstrap, project
   trusted-project `.codex/config.toml` creation, canonical trust diagnostic,
   mandatory new-task pickup, MCP handshake, graph doctor,
   first safe read/write/read-back, and optional create-only agent profiles.
   The package MCP installation doctor applies only to the Git/full-plugin
   compatibility channel and must not gate the official Skills-only journey.
5. Add a legacy migration appendix covering plugin-plus-symlink conflict,
   fail-closed plan, exact confirmation, apply/read-back, and rollback. Keep
   Claude Code installation separate and unchanged.
6. Add user-facing troubleshooting for missing marketplace/plugin, disabled
   plugin, stale cached version, restart/new-task discovery, duplicate install,
   permission denial, unsupported host CLI, Node/Docker/Keychain prerequisites,
   stopped or unhealthy graph, and safe support evidence collection.
7. Update `README.md`, `README.ru.md`, both quick starts, navigation, and release
   documentation so Codex users land on the plugin path. Move symlink install
   instructions to an explicitly labelled legacy compatibility page.
8. Prepare accurate public-facing descriptions, capability/permission and data
   flow explanations, starter prompts, limitations, support expectations, and
   screenshots without local usernames, temporary paths, secrets, or internal
   test identifiers. Explain that scripts create a local project graph,
   no-secret launcher, and trusted-project `.codex/config.toml`; GitHub is the
   source/support channel, not an installer step.
9. Add automated Markdown link/anchor checks and Russian/English structure
   parity checks. Run spell/style checks where available and inspect rendered
   pages, not only source Markdown.
10. Run a clean-context novice walkthrough from the documentation alone. Record
    every ambiguity, correct it, repeat from a new task, and preserve evidence.

**Acceptance gate:**

- a reviewer with no repository knowledge can install once, run a no-mutation
  init preflight, confirm bootstrap, open the mandatory new task, verify the
  project MCP, update, and uninstall through the documented UI path;
- normal installation contains no terminal, Git, developer worktree, or local
  absolute-path step;
- Russian and English navigation and semantics agree;
- plugin, optional graph, legacy Codex, and Claude Code paths cannot be
  confused;
- permissions, confirmations, persistence, data handling, rollback, known
  limitations, and support evidence are explicit;
- docs contain no secrets, personal paths, temporary candidate identifiers, or
  claims unsupported by verified runtime behavior;
- link/anchor/parity checks and independent novice review are `VERIFIED`.

Wave 8 does not deploy infrastructure, change the plugin runtime, submit a
portal draft, merge to `main`, push, tag, or publish.

---

### Wave 9 — Bootstrap-first Skills-only production readiness

**Status in this runbook:** `AUTHORIZED — IMPLEMENTATION REQUIRED` as of
2026-07-20. This status supersedes the historical app-plus-skills/public-MCP
plan recorded in the Execution Ledger; it does not rewrite that ledger.

The current authorization covers source, generated Skills-only artifacts,
local disposable fixtures, tests, documentation, and independent review in
isolated worktrees. It does not authorize portal mutation, merge, push, tag,
release, publication, real VPS/certificate/credential changes, or destructive
cleanup.

**Purpose:** turn the released local plugin and existing graph bootstrap into
one public Skills-only installation: UI Install, `nacl-init`, packaged scripts,
per-project Neo4j Community plus project-local `neo4j-mcp`, no-secret launcher,
and trusted-project `.codex/config.toml`, then a mandatory new task. No public
NaCl MCP or second GitHub installation exists in
this product path.

**Primary worker:** Skills packaging and bootstrap engineer.

**Independent verifiers:** clean-machine novice operator and security/release
reviewer.

Before implementation, refresh and record the official contract date:

- `https://learn.chatgpt.com/docs/build-skills`
- `https://learn.chatgpt.com/docs/build-plugins`
- `https://learn.chatgpt.com/docs/submit-plugins`
- `https://platform.openai.com/plugins`

Treat [ADR-005](../adr/005-codex-skills-only-bootstrap.md) and
`docs/research/codex-skills-only-submission-contract-2026-07-20.md` as the
controlling decision and package-risk inventory.

#### Preserved graph and authorization baseline

1. Neo4j remains Community Edition with one Docker Compose stack, container,
   and independent durable volumes per project, locally or on a VPS.
2. Local Neo4j binds only to loopback. The project receives a stable ID,
   explicit route, schema ledger, secret reference, backup/recovery contract,
   and trusted project `.codex/config.toml`.
3. For optional remote graphs, the server/VPS remains the authorization
   boundary. Access to server `S` permits its registered project graphs and
   never server `T`; `project_scope` is routing/provenance, not a grant.
4. Existing mTLS/private-CA/ghostunnel issue and revoke remain the optional
   server-access lifecycle. They are not uploaded to or replaced by a public
   MCP/OAuth service.
5. `NACL_DEVELOPER_ID`, claims, revisions, fences, and project scope remain
   identity/provenance/concurrency fields, not credentials.

**Tasks:**

1. Reconcile from current `main` without overwriting parallel Claude Code,
   documentation, or framework changes. Preserve the immutable Git release as
   historical evidence and rebuild generated Codex outputs from current
   canonical inputs.
2. Add a dedicated deterministic Skills-only builder. Its output is the exact
   portal upload tree and has a complete file/digest manifest. Build twice and
   require byte-for-byte tree/archive equality.
3. Compute each public skill's transitive Markdown/script/template/asset
   closure. Reject absolute paths, source-checkout dependencies, symlink
   escapes, missing imports, unpinned downloads, and undeclared executables.
   Until portal testing proves shared top-level resources supported, make each
   public skill self-contained or duplicate common immutable resources with
   digest equality checks.
4. Remove the public skills' mandatory package MCP doctor and all bootstrap
   dependencies on package-only `nacl_*` tools. `nacl-init` must run with only
   the installed skill bundle plus declared system prerequisites. Other skills
   may use file-only workflows; graph-backed paths stop with precise init or
   new-task guidance until project MCP is verified.
5. Adapt `nacl-init` to a bootstrap-first plan/apply/read-back contract. The
   read-only plan states the exact project root, files, Docker resources, ports,
   downloads/checksums, secret references, canonical trust prerequisite,
   protected `graph-infra/.env`, the exact Node/launcher/`--binary`/binary
   launch shape and allowed non-secret env, `.codex/config.toml` merge, schema
   actions, rollback points, and confirmation. Denial causes zero mutation.
6. Reuse and harden the packaged POSIX and PowerShell graph setup: pinned
   checksum-verified `neo4j-mcp`, one project Community stack, loopback ports,
   durable volumes, strict secret handling, a generated machine-local launcher
   that reads only protected `graph-infra/.env` and validates the binary/install
   receipt, non-clobbering trusted-project `.codex/config.toml` with resolved
   Node in `command`, launcher/`--binary`/binary in `args`, and only non-secret
   Neo4j connection values in `env`, schema migration,
   health/read canary, backup, and idempotent rerun. A Claude `.mcp.json` may be
   emitted only as explicit compatibility output. Do not add a public endpoint
   or managed graph dependency.
7. After writing `.codex/config.toml`, return a closed handoff status and stop.
   Require the canonical project root to be trusted and a new task in that
   project; only there verify MCP initialize/tools-list,
   graph/schema health, named read, confirmed write canary, and separate
   read-back before reporting initialization `VERIFIED`.
8. Map post-init BA/SA/TL/goal/fix/verify/migrate/publish graph operations to the
   project-local `neo4j-mcp` contract or bundled deterministic adapters.
   Inventory and eliminate hidden calls to package-only project/graph/profile/
   legacy tools. Preserve leases, fencing, revisions, atomic IDs,
   idempotency, audit, backup, and restore semantics.
9. Test the exact upload tree in a clean local test home with the repository
   unavailable after staging: discovery, permission denial, local bootstrap,
   new-task pickup, two projects, two sessions, restart, update, uninstall,
   persistence, offline/manual download, checksum mismatch, malformed existing
   config, port collision, partial apply, and every supported OS/architecture.
   Do not make an undocumented portal-draft preview a Wave 9 prerequisite.
10. Run official skill validation, closure/path/link checks, Node 20+ and
    PowerShell where supported, Docker lifecycle/isolation/concurrency/recovery,
    secret/privacy/license/dependency scans, Claude isolation, hosted CI, and
    independent adversarial review. A missing platform runner is `NOT_RUN`, not
    success.
11. Complete the public listing, verified publisher prerequisites, public
    website/support/privacy/terms URLs, approved assets, category/capability
    and data-flow copy, starter prompts, availability, release notes, and
    exactly five positive plus three negative reviewer cases. Test cases must
    require no private repository knowledge or public MCP credentials.
12. Freeze the exact submission artifact by source SHA, public skill
    inventory, file manifest, archive digest, graph bootstrap policy version,
    tests, legal URLs, and evidence digests. GitHub may publish matching source
    and artifacts after separate authorization, but it is not a user install
    prerequisite.

**Acceptance gate:**

- The exact Skills-only artifact is reproducible and passes clean-home local
  discovery/bootstrap tests with the source repository unavailable after
  staging. Official-card one-click installation on a clean second machine is a
  post-publication Wave 10 gate; an undocumented draft preview remains
  `NOT_VERIFIED`, not a circular prerequisite.
- All ten public skills are discoverable and their complete runtime closure is
  inside the exact staged/upload tree; with the source repository unavailable,
  local clean-home discovery resolves every path and executes every required
  script from that tree. Official-card proof belongs only to Wave 10.
- `nacl-init` performs plan/confirmation/apply/read-back, creates the isolated
  project graph, no-secret launcher, and project `.codex/config.toml`, stops
  honestly, and the mandatory new task proves canonical trusted-project
  MCP/schema/read/confirmed-write/read-back.
- Denial, unsafe input, missing prerequisites, offline download, checksum
  mismatch, malformed config, collision, and partial failure cannot report
  success or leave an unreported mutation.
- Update/uninstall preserves project graph data, `.codex/config.toml`, Claude
  compatibility config, backups, profile files, and secret state.
- Local and optional remote Community topology, server authorization,
  concurrency, recovery, and Claude isolation gates remain verified.
- All required Skills-only portal materials and exact 5 positive/3 negative
  tests are complete and independently reproducible.
- Independent clean-machine and security/release reviews both return `ACCEPT`.

Wave 9 may prepare and freeze a portal-ready artifact. It does not authorize a
portal draft, submission, publication, Git mutation, release, real credential
or VPS mutation, or making the plugin public.

---

### Wave 10 — Skills-only OpenAI review and controlled publication

**Status in this runbook:** `NOT_RUN` until Waves 8-9 are `VERIFIED`. Creating
or submitting the draft and publishing after approval are separate external
actions that each require explicit user confirmation.

**Purpose:** submit only the frozen Skills-only artifact to OpenAI, handle
review without artifact drift, and publish only after approval and a separate
user decision.

**Primary operator:** release manager with OpenAI Platform Apps Management
write access.

**Independent verifier:** submission/release auditor.

Before any portal mutation, refresh the official OpenAI submission contract
again and reconcile the live form with the frozen Wave 9 checklist. A stale
runbook is `BLOCKED`, not permission to guess or omit a field.

**Tasks:**

1. Verify the publishing organization, Apps Management write permission, and
   matching verified individual or business developer identity.
2. After explicit user approval, open the OpenAI plugin submission portal,
   choose **Skills only**, and create the draft. If the live form unexpectedly
   requires a production MCP URL, OAuth, domain verification, CSP, or tool
   scan, stop and record the contract discrepancy; do not switch to **With MCP**
   or invent a service.
3. Upload the exact frozen skill bundle and fill listing, verified publisher,
   website/support/privacy/terms, prompts, exactly five positive tests, exactly
   three negative tests, regions, release notes, and policy attestations from
   the Wave 9 package.
4. Reconcile the portal's skill scan, file inventory when exposed, permissions,
   validation output, and listing against the frozen manifest. Any material
   change returns to Wave 9 and creates a new artifact/version; never patch only
   the portal.
5. Present the final draft summary and evidence digests to the user. Submit for
   review only after an explicit confirmation, then record the submission ID,
   timestamp, exact version, receipt, and review status in the ledger.
6. Treat review feedback as a new correction cycle with code, tests, evidence,
   versioning, and independent review. Do not silently mutate the submitted
   artifact.
7. After OpenAI approval, present the approved listing and exact artifact to the
   user. Publish only after a second explicit confirmation.
8. Align the approved artifact with any separately authorized release
   branch/main merge, tag, source release, and repository push. Run
   post-publication discovery, one-click install, `nacl-init`, new-task project
   MCP pickup, update, uninstall/persistence, and rollback smoke in ChatGPT and
   Codex. The smoke must not use Git as a second installation step.

**Acceptance gate:**

- no draft is created before Waves 8-9 are `VERIFIED`;
- submission and publication confirmations are recorded separately;
- the submitted, approved, published, tagged, and documented artifacts are
  byte-for-byte/version-identical or any difference is explicitly re-reviewed;
- the public directory entry, fresh single install, bootstrap-first behavior,
  mandatory new-task project MCP pickup, update/uninstall persistence, support
  links, and rollback smoke are `VERIFIED`;
- ledger contains portal receipt/review evidence and exact public state.

Do not treat successful Wave 7 local tests as production verification, Wave 9
readiness as submission authorization, or OpenAI approval as permission to
publish.

---

## 13. Required cross-cutting gates

### G0 — Workspace safety

- Original checkout and untracked files untouched.
- No destructive cleanup.
- Every worker has a unique worktree.

### G1 — Claude isolation

- Candidate diff contains no changes under `.claude/**` or frozen root skill
  packages.
- Existing deterministic/root query fixtures remain green.
- Additive graph migration does not alter existing Claude query results.

### G2 — Plugin validity and closure

- Official plugin validator passes.
- Manifest paths exist and remain under plugin root.
- No runtime import/link/path escapes plugin root.
- Cached plugin works without checkout.
- The Skills-only submission tree has its own deterministic file/digest
  manifest and every public skill's transitive closure is inside that tree.
- Shared `../../resources` paths are not assumed portable until the exact
  staged/upload tree passes local clean-home closure and execution tests;
  unresolved or symlink-escaping paths fail. Official-card proof is Wave 10.

### G3 — CLI parity

- Legacy symlink install passes.
- Plugin install passes under CLI with no GUI.
- Plugin and Desktop share content/version/tool schemas.
- Double install is diagnosed.
- The public Skills-only path does not require the full Git plugin, package MCP
  doctor, or legacy symlink channel; those remain compatibility-only paths.

### G4 — Desktop runtime

- New task discovers updated plugin after reinstall.
- MCP starts from cache.
- User approvals and write read-back work.
- Restart does not lose data.
- For the Skills-only product, installed `nacl-init` runs before a NaCl package
  MCP exists, writes trusted-project `.codex/config.toml` only after
  confirmation, and a new task at the canonical trusted root discovers the
  project-local `neo4j-mcp`.

### G5 — Graph security

- Loopback-only local ports.
- Secret scan clean.
- No raw secret in manifest/config/log/argv/repo. Project MCP `env` may contain
  only non-secret URI, username, database, and telemetry values.
- Reads/writes/admin operations have distinct policies.

### G6 — Multi-project isolation

- Negative A/B suite passes.
- Separate storage and schema lifecycle.
- Ambiguity fails closed.

### G7 — Multi-user consistency

- Lease/fencing/CAS/ID/race/RBAC suite passes.
- Provenance and idempotency verified.
- Shared graph remains authoritative.

### G8 — Migration and recovery

- Ordered migration ledger and checksum.
- Idempotent upgrade.
- Backup before risky migration.
- Restore drill validates structure and function.

### G9 — Candidate reproducibility

- Exact SHA and version identified.
- Clean-home install from marketplace succeeds.
- Reinstall/new-task behavior documented.
- No public state mutation.
- Exact Skills-only tree/archive digest, source SHA, skill inventory, bootstrap
  policy version, and reviewer fixtures are bound together.

### G10 — User documentation and onboarding

- Russian and English plugin-first paths agree and pass link/anchor checks.
- A clean-context novice completes the normal UI journey without Git or shell.
- Legacy Codex and Claude paths are clearly separated from the plugin path.
- Permissions, confirmations, persistence, rollback, troubleshooting, support,
  and data handling are documented from verified behavior.
- The normal public path is one official-card install followed by `nacl-init`
  and a mandatory new task; Git is explicitly source/support/compatibility, not
  a second installation requirement.

### G11 — Production submission and publication integrity

- Only the bootstrap-first Skills-only product defined by ADR-005 may advance;
  adding a public MCP or mandatory Git installation is a blocking scope change.
- Verified publisher, legal, privacy, regions, reviewer fixtures, public
  support, exact bundle scan, and portal validation pass before submission.
  Production MCP URL, OAuth, domain, CSP, and tool-scan gates do not apply
  unless the live Skills-only form unexpectedly renders them; if it does, stop
  and record the contract discrepancy.
- Source, submitted, approved, published, tagged, and documented artifacts are
  cryptographically/version bound.
- Portal draft creation, submission, and post-approval publication have
  separate recorded user confirmations.

No aggregate `VERIFIED` is allowed while any mandatory gate is missing or
`PARTIALLY_VERIFIED`.

---

## 14. Baseline and verification command catalog

The orchestrator must discover the repository's current commands before use.
The following are audited starting points, not permission to invent substitutes:

```bash
# Repository state
git status --short
git branch --show-current
git rev-parse HEAD
git diff --check

# Current Codex capabilities
codex --version
codex plugin --help
codex plugin marketplace --help
codex plugin list
codex mcp list

# Current root/Codex parity and deterministic tools
sh skills-for-codex/scripts/check-root-codex-sync.sh <base-sha> HEAD
bash -lc 'tests=$(git ls-files "*/scripts/*.test.mjs"); node --test $tests'

# Runtime inventory
docker ps
docker system df
```

For plugin creation/update, use the current `plugin-creator` skill helpers
rather than hand-editing marketplace/cache state. The audited helper flow
includes:

```text
create_basic_plugin.py
validate_plugin.py
update_plugin_cachebuster.py
read_marketplace_name.py
codex plugin add <plugin>@<marketplace>
```

Before using exact syntax, read each current `--help` and the refreshed official
documentation. Non-default repo marketplaces require explicit marketplace
configuration; the default personal marketplace has different discovery
behavior.

Add deterministic test entry points during Wave 0–3 so later waves do not rely
on ad hoc shell sequences. CI must expose at least:

```text
test:plugin-manifest
test:plugin-closure
test:claude-isolation
test:cli-legacy
test:cli-plugin
test:graph-unit
test:graph-local-e2e
test:multi-project
test:multi-user
test:candidate
```

Names may match repository conventions, but the capabilities may not be
omitted.

---

## 15. Decision log required before code expansion

Record decisions as repository ADRs and summarize them in the ledger:

| ADR | Question | Blocking wave |
|---|---|---|
| Plugin package boundary | What is bundled, generated, or companion-installed? | Wave 2 |
| MCP launch from cache | How does CLI/Desktop invoke the bundled gateway portably? | Wave 3 |
| Pilot runtime prerequisite | System Node, bundled runtime, or compiled binaries? | Wave 2 |
| Project identity and registry | Stable ID, aliases, location, migration behavior? | Wave 4 |
| Secret contract | Keychain/env/secret reference and recovery behavior? | Wave 3 |
| Graph physical isolation | Per-project container/database mapping? | Wave 4 |
| Lease/revision/ID model | Transactions, TTL, fencing, sequences, idempotency? | Wave 5 |
| Agent-profile delivery | Explicit companion installation and overwrite policy? | Wave 6 |
| Candidate/public versioning | Framework/plugin/schema compatibility mapping? | Wave 7 |
| Skills-only submission/bootstrap | Exact skill closure, pre-MCP init path, trusted project `.codex/config.toml` pickup, and single-install public journey? | Wave 9 |

An ADR may not waive a non-negotiable invariant. Architecture-changing
disagreement is escalated to the user with concrete options and evidence.

---

## 16. Scope control and prohibited shortcuts

Do not:

- modify Claude Code skills to make Codex packaging easier;
- expose all 60 current skills without measuring discovery behavior;
- treat a plugin cache as a symlink/live checkout;
- embed an absolute developer/cache path in manifest or MCP config; a
  bootstrap-generated per-machine launcher path in project
  `.codex/config.toml` is allowed when portable and secret-free;
- embed secrets in `.codex/config.toml`, Claude `.mcp.json`, `.env.example`, marketplace, repo config, logs,
  or command arguments;
- auto-start Docker from an untrusted session hook;
- use one Community Neo4j database for unrelated projects;
- rely only on `project_scope` property filtering for tenant isolation;
- identify a worker only by human or machine;
- use max+1 ID allocation with concurrent writers;
- implement a lock without fencing and revision checks;
- let normal skills call unrestricted raw write Cypher;
- declare graph initialization from a process/port check alone;
- destroy a target graph before a recoverable backup and validated replacement;
- mark a wave accepted based only on the implementer's report;
- publish an RC to a public marketplace as a substitute for local testing;
- merge or tag while any mandatory gate lacks evidence;
- require a public NaCl MCP, OAuth, domain, CSP, or hosted service for the
  Skills-only product unless a newly documented OpenAI contract forces a new
  user decision;
- require a GitHub/plugin reinstall after the official Skills-only Install;
- make `nacl-init` depend on a package-level NaCl MCP before it creates the
  project-local MCP;
- assume the portal preserves `../../resources`, arbitrary plugin-root files,
  executable mode bits, or draft-preview install behavior without exact proof;
- claim project `.codex/config.toml` hot reload in the current task instead of
  requiring a new task;
- treat project `.mcp.json` as Codex pickup evidence; it is Claude/full-plugin
  compatibility only;
- trust a noncanonical spelling alias or a different worktree path and assume
  Codex will load the canonical project's config;
- reject portable absolute Node/launcher/binary paths that `nacl-init` generated
  and read back for that user's machine; reject only developer-authored,
  checkout-bound, secret-bearing, or stale-cache absolute paths.

---

## 17. Execution Ledger

Only the orchestrator edits this section. Keep entries concise and append
evidence paths/SHAs rather than raw transcripts.

### Current snapshot

```text
Plan created: 2026-07-14
Audited base: 56cea47cdbcb97732dc7d239ddd107ef2ba8aae0 (origin/main, framework v2.26.2)
Integration branch: codex/plugin-skills-only-bootstrap
Integration worktree: $SUCCESSOR_WORKTREE (runtime-resolved sibling worktree; never packaged)
Previous Git plugin release: fe4aa3cab2dab9d6cb40dab0087c33ebe90e5ed9; tag codex-plugin-v0.1.0; hosted CI, isolated Git/cache install, and user-confirmed second-machine installation VERIFIED
Skills-only implementation: 464ec0792a83e3ee80e846cc669587c2835b6f58; independent ACCEPT; hosted Linux/Docker and native Windows VERIFIED; Wave 9 RELEASE_READY
Candidate version: 0.2.0
Git distribution release: https://github.com/ITSalt/NaCl/releases/tag/codex-plugin-v0.1.0
Skills-only GitHub release: codex-skills-only-v0.2.0 PLANNED after merge
OpenAI Plugins Directory: Wave 10 draft creation authorized; Submit for Review and post-approval publication require separate explicit confirmations
```

### Wave status

| Wave | Status | Branch / commit | Evidence | Open issues |
|---|---|---|---|---|
| 0 — Baseline/contracts | VERIFIED | `codex/desktop-plugin-integration` / `35e2e72` | `docs/research/codex-plugin-wave-0-baseline-2026-07-14.md`; ADR-003; 151 Node tests; 5 shell suites; 60/60 vendored + bundled validation; independent `ACCEPT` | GitHub-hosted Actions `NOT_RUN`; remote freshness `UNVERIFIED`; local pip docs should add a venv example |
| 1 — Plugin/MCP spike | VERIFIED | `codex/plugin-01-runtime-spike` / `f0291ca`; merged by `52d579a` | `docs/research/codex-plugin-wave-1-runtime-spike-2026-07-14.md`; final lifecycle evidence in `docs/research/codex-plugin-wave-1-desktop-lifecycle-2026-07-14.md`; validator exit 0; 10/10 focused protocol; 32/32 spike; isolated matrix `VERIFIED`; independent code and Desktop `ACCEPT`; after a full restart, a new Desktop task discovered the namespaced skill and MCP tool and returned the exact contract, `status=ok`, `echo=desktop-final`, corrected version, and `executionLocation=installed-cache` | Current-machine local marketplace, plugin discovery, skill routing, MCP invocation, and installed-cache contract are verified. Cross-machine portability and production distribution/update remain later-wave scope |
| 2 — Package/CLI | VERIFIED | `codex/plugin-02-package-cli` / `0aa4120`; merged by `f60745a` | `docs/research/codex-plugin-wave-2-package-cli-2026-07-14.md`; ADR-003 accepted in part; 10 public conductors plus 60 internal workflows; official manifest and 10/10 skill validation; 189/189 contracts; 38/38 package/protocol/adversarial; strict closure across 303 files, 310 inline paths, and 22 command paths; unchanged isolated legacy installer; cache/source-unavailable CLI `VERIFIED`; Claude isolation and root/Codex sync `VERIFIED`; final independent `ACCEPT` after three adversarial review passes | Model-backed `codex exec` routing, Node 20 execution, Wave 2 Desktop discovery, hosted CI, and an automatic whole-snapshot drift guard are `NOT_RUN`; graph operations remain `BLOCKED` until Wave 3 |
| 3 — Local graph gateway | VERIFIED | `codex/plugin-03-graph-gateway` / `c0d526d5a7576a18fa4c44c2b759783fc6eff53e`; merged by `65105b8` | `docs/research/codex-plugin-wave-3-local-graph-2026-07-14.md`; ADR-003 accepted in part; 228/228 contracts plus 2 opt-in Docker skips; 37/37 graph/image unit; 55/55 package; manifest/closure/cache-source-unavailable/Claude isolation/legacy/root sync `VERIFIED`; independent lifecycle Docker smoke ~32.6 s; independent gateway/migration/write/backup/external-CLI restore/reinstall/uninstall E2E ~59.2 s; integration rerun ~32.6 s and ~59.2 s; final independent `ACCEPT` after one seven-finding security correction pass | Live macOS Keychain mutation, live Desktop graph-tool discovery/approval, Node 20, model-backed `codex exec`, and hosted CI are `NOT_RUN`; Docker administrators remain a documented root-equivalent local trust boundary; multi-project isolation and RBAC/concurrency remain blocked on Waves 4–5 |
| 4 — Multi-project | VERIFIED | `codex/plugin-04-multi-project` / `6d0133e0bb3c85352592c3744f2066b2cb2ce94a`; merged by `a6dc32b` | `docs/research/codex-plugin-wave-4-multi-project-2026-07-14.md`; ADR-003 accepted for local pilot identity and physical isolation; 246/246 contracts plus 3 opt-in Docker skips; 55/55 graph unit; 58/58 package; 11/11 multi-project unit; manifest/closure/cache-source-unavailable/legacy/Codex/Claude/root sync `VERIFIED`; independent two-project Docker E2E ~40.4 s; independent Wave 3 regression E2E ~32.8 s and ~60.2 s; integration rerun ~40.8 s, ~32.5 s, and ~59.9 s; final independent `ACCEPT` after filename binding, config change detection, scoped audit, and raw-root corrections | Cooperative local pilot retains a documented narrow compare-to-rename window without filesystem CAS; hostile concurrent-writer exclusion is Wave 5 scope. Live Keychain, live Desktop project-tool discovery/approval, Node 20, model-backed `codex exec`, and hosted CI are `NOT_RUN`; RBAC/concurrency remain blocked on Wave 5 |
| 5 — Multi-user/session | VERIFIED | `codex/plugin-05-concurrency` / `be0d520d4554327dfbea00d203c607c9c5442ca7`; merged by `7275d7f` | `docs/research/codex-plugin-wave-5-concurrency-2026-07-14.md`; ADR-003 accepted for cooperative local pilot; trusted OS principal, one-time admin bootstrap, project-scoped RBAC, leases/fencing, CAS, exact idempotency, 7 protected kinds, and atomic allocator; 279/279 contracts plus 5 opt-in Docker skips; 88/88 graph unit; 62/62 package; 28/28 auth/model; manifest/closure/cache-source-unavailable/legacy/Codex/Claude/root sync/v2.23 regression `VERIFIED`; independent Wave 5 concurrency E2E ~29.3 s plus real v2→v3 stale recovery ~23.9 s; 1,000 exact allocations with bounded same-key retries; independent Wave 4/3 regressions and final integration reruns all passed; final independent `ACCEPT` after two correction rounds | Neo4j DDL/SHOW remains a documented non-atomic pre/post-check boundary that can yield `PARTIALLY_VERIFIED` without ledger advancement; high transient backpressure at 1,000-way burst is recovered idempotently. Live Desktop/Keychain, Node 20, model-backed `codex exec`, hosted CI, remote identity provider, and hostile same-account isolation are `NOT_RUN` |
| 6 — Workflow integration | VERIFIED | `codex/plugin-06-workflows` / `1f50ddad21396b2466146fac5525a5162b776d4b`; merged by `64e6507` | `docs/research/codex-plugin-wave-6-workflow-integration-2026-07-14.md`; 10 public/60 internal workflows; 18/18 workflow, 63/63 package, 89/89 graph, 299/299 contracts plus 5 opt-in Docker skips; strict create-only/idempotent/no-overwrite agent profiles; independent Wave 5/4/3 Docker regressions and zero cleanup; final W7C2 Desktop new task discovered all 10 public skills and exact installed-cache tools after restart; model-backed bundled CLI invoked `nacl_installation_doctor` exactly once; user-confirmed migration and read-back persisted; final independent `ACCEPT WAVES 6-7 / VERIFIED` | Optional live custom-agent/profile installation and discovery remains `NOT_RUN`; deterministic profile plan/apply/idempotency/conflict gates are verified. Live Keychain graph trial, exact Node 20, and hosted CI move to Wave 9 production readiness |
| 7 — User-test candidate | VERIFIED | `codex/plugin-07-candidate` code/evidence `d88037c1544c659eb393325e18351150fc4a4761` / `efb40ce381feea1c8b07e0f2ee7244fdc7511e69`; code merged by `517f551`, final evidence by `14776fc` | `docs/research/codex-plugin-wave-7-candidate-2026-07-15.md`; W7C1 live plan safely blocked at 55+4 unknown hashes with zero mutation; W7C2 exact audited-base correction; deterministic bundle SHA-256 `c662a53e3d3874040cbb2f25e7df8e72d9b837ebd6d62f8c6c01ec160cea65d0`; 10 public skills and exact 25 MCP tools; 320/320 contracts plus 5 authorized Docker skips; independent sequential Wave 3/4/5 Docker and zero cleanup; user UI Upgrade/permissions/full restart; plan 59 found/59 accepted/1 missing/0 blockers; confirmed apply removed 59 with verified receipt and `plugin-only-ready` read-back; second restart/new Desktop task returned exact W7C2 `VERIFIED/plugin-only/installed-cache`; bundled CLI 0.144.2 model-backed smoke made exactly one doctor call and exited 0; final independent `ACCEPT WAVES 6-7 / VERIFIED` | Non-blocking `NOT_RUN`: optional custom-agent discovery, live Keychain graph bootstrap, exact Node 20 (Node 24 satisfies 20+), hosted CI, unavailable external SBOM scanners, and the separately gated Waves 8-10. Shell CLI 0.142.0 cannot use configured `gpt-5.6-sol`; bundled 0.144.2 proves the plugin path |
| 8 — Plugin-first documentation | VERIFIED / CROSS_MACHINE_INSTALL_ACCEPTED | `main` / `fe4aa3cab2dab9d6cb40dab0087c33ebe90e5ed9`; tag `codex-plugin-v0.1.0` | Previous Wave 8 evidence plus `docs/research/codex-plugin-git-release-0.1.0-2026-07-16.md`; immutable GitHub Release, three hosted workflows, exact tagged marketplace resolution, isolated cache install and cached doctor `VERIFIED/plugin-only/installed-cache`; on 2026-07-20 the user confirmed successful deployment and operation on another clean machine | Update/uninstall lifecycle on the second machine was not separately recorded. This does not block the new single-install Skills-only product, whose official-card lifecycle belongs to Wave 10 |
| 9 — Bootstrap-first Skills-only production readiness | VERIFIED / RELEASE_READY | `codex/plugin-skills-only-bootstrap` / `464ec0792a83e3ee80e846cc669587c2835b6f58` | ADR-005; independent final `ACCEPT`; 282 contracts: 275 pass/7 authorized skips/0 fail; exact staged-tree Docker bootstrap, repeat run, mandatory restart, new-process MCP handshake/tools/schema/named read/confirmed write/read-back; hosted primary/Docker `29748822886`, exact native Windows `29748823020`, lint/credential `29748822752`, and generic tools `29748822784` successful; deterministic pre-freeze ZIP built twice byte-identically: 158 entries, 465529 bytes, SHA-256 `980a3a1a46e7069726893ce603c12bea3ddf8a5c1540defb9681b1fcbc0714eb`; 10 self-contained public skills; publisher/legal/support metadata bound to ITSalt | Final ZIP must be rebuilt from the exact merged main SHA, tagged, attached to the GitHub Release, and uploaded unchanged. Live portal validation, reviewer execution in the OpenAI environment, directory install/update/uninstall, review outcome, and publication remain Wave 10. No public MCP, OAuth, hosted data plane, or second Git installation is part of the product |
| 10 — OpenAI Skills-only submission/publication | IN_PROGRESS / DRAFT_NOT_CREATED | Planned tag `codex-skills-only-v0.2.0` | Create **Skills only** draft from the exact released ZIP; reconcile upload scan and listing; enter exactly 5 positive + 3 negative runtime-bound reviewer cases; public MCP/OAuth/domain/CSP are `NOT_APPLICABLE` unless the live form contradicts the documented contract | Draft creation is authorized. Stop before **Submit for Review** for explicit confirmation. After approval, publication requires another explicit confirmation; post-publication official-card install/bootstrap/update/uninstall smoke remains mandatory |

### Accepted decisions

| Date | ADR | Decision | Evidence / rationale |
|---|---|---|---|
| 2026-07-14 | ADR-003 execution baseline | Start Wave 1 as a pinned three-shape ingestion/MCP compatibility spike; keep hooks, plugin agents/commands, Neo4j, and NaCl workflow ports out until validator and cached runtime behavior agree. Downstream architecture decisions remain `Proposed`. | Official contract refresh found manifest, hooks, and `.mcp.json` contradictions; helper hashes and source links are recorded in ADR-003. |
| 2026-07-14 | Wave 0 skill validator | Use checksum-verified OpenAI `quick_validate.py` from `openai/codex@4aa950d…` with hash-pinned PyYAML 6.0.3; missing dependency or provenance drift is `BLOCKED`. | Adversarial malformed-YAML/date/tamper/missing-dependency/read-only tests; 60/60 parity with the current bundled validator. |
| 2026-07-14 | Wave 1 gate disposition | Keep ADR-003 Proposed, reject the Wave 1 candidate for Desktop compatibility, and stop before Wave 2; do not compensate with a checkout path or undocumented reload/launch behavior. | CLI/package/cache behavior is independently accepted at `2a8d165`, but the cached health tool remained unavailable in a fresh post-restart Desktop task; the live test installation was rolled back. |
| 2026-07-14 | Wave 1 correction disposition | Accept `80cb907` for Desktop retest and merge it into integration. Keep Wave 1 `PARTIALLY_VERIFIED` until a restarted Desktop new task discovers and invokes the cached tool. | Sanitized host evidence localized the failure to standard MCP request `_meta`; bounded regression tests, validator, independent review, disposable matrix, persistent marketplace registration, corrected live reinstall, CLI invocation, and installed-cache health all passed. |
| 2026-07-14 | Wave 1 call correction disposition | Accept `f0291ca` and merge it into integration for the final Desktop retest. | The restarted Desktop proved discovery and reached `tools/call`; the old server rejected standard call `_meta`. The bounded correction passed independent validation, protocol, plugin, cache/source-unavailable, and live installed-cache metadata-call checks. |
| 2026-07-14 | Wave 1 acceptance | Mark Wave 1 `VERIFIED` and allow Wave 2 to start. | After a full restart, a new Desktop task discovered the namespaced skill and MCP tool, invoked it once, and returned the exact contract, corrected version, requested echo, `status=ok`, and `executionLocation=installed-cache`; independent Desktop verification accepted all criteria. |
| 2026-07-14 | Wave 2 acceptance | Accept `0aa4120`, merge it into integration, mark Wave 2 `VERIFIED`, and allow Wave 3 to start. | The initial package passed routine gates but was rejected twice by independent adversarial review for unchecked inline paths, false-positive legacy artifacts, missing-doctor bypass, and symlink entrypoint suppression. Follow-up commits made closure and installation diagnostics fail closed. Final review accepted 10 public/60 internal skills, cache-only CLI execution, legacy compatibility, 189/189 contracts, 38/38 adversarial package tests, Claude isolation, and exact package evidence. |
| 2026-07-14 | Wave 3 acceptance | Accept `c0d526d5a7576a18fa4c44c2b759783fc6eff53e`, merge it into integration as `65105b8`, mark Wave 3 `VERIFIED`, and allow Wave 4 to start. | Independent security review first rejected seven lifecycle, restore, registry, audit, grammar, and image-fixture defects. The corrected implementation passed adversarial re-review, real disposable lifecycle persistence, real gateway/migration/write/backup and external-process shipped-CLI restore, cache replacement, reinstall/uninstall persistence, exact-image validation, and zero-resource cleanup. |
| 2026-07-14 | Wave 4 acceptance | Accept `6d0133e0bb3c85352592c3744f2066b2cb2ce94a`, merge it into integration as `a6dc32b`, mark Wave 4 `VERIFIED`, and allow Wave 5 to start. | The first independent QA pass rejected filename-to-ID binding, same-inode config change detection, project-scoped audit before scope resolution, and raw relative CLI roots. RED-to-GREEN corrections then passed five independent boundary probes, 33/33 focused checks, two-project physical/data/credential/lifecycle isolation, old Wave 3 recovery regressions, installed-cache execution, and zero-resource cleanup. |
| 2026-07-14 | Wave 5 acceptance | Accept `be0d520d4554327dfbea00d203c607c9c5442ca7`, merge it into integration as `7275d7f`, mark Wave 5 `VERIFIED`, and allow Wave 6 to start. | Independent QA first rejected unauthenticated legacy reads and non-idempotent lease retries, then rejected an unreachable `SCHEMA_STALE` recovery path. Corrections enforced trusted-principal RBAC across all 14 graph tools, immutable lease replay/conflict semantics, one-time fenced bootstrap, and an exact `SchemaMigration/MIG-GATEWAY` v2→v3 corridor. Final review accepted 10-way claim/bootstrap races, stale-fence/CAS/revoke behavior, 1,000 exact allocations with bounded same-key retries, all five real Docker tests, v2.23 isolation, and zero-resource cleanup. |
| 2026-07-14 | Wave 6 Desktop-retest disposition | Accept the reviewed Wave 6 code through `1f50ddad` and merge it into integration as `64e6507` solely to build the exact live Desktop-retest package. Keep Wave 6 `PARTIALLY_VERIFIED`. | Two independent correction rounds closed release-status, semantic evidence, cwd-closure, profile-race, root-sync, and public create-only contract defects. Proportional integration gates passed after the conflict-free merge. The mandatory restarted Desktop gate remains `NOT_RUN`, so this is not aggregate Wave 6 acceptance. |
| 2026-07-15 | Wave 7 live-retest disposition | Accept candidate `4f76cc4d` and merge it into integration as `775b376` solely for the user-driven Desktop trial. Keep Waves 6 and 7 `PARTIALLY_VERIFIED`. | Fresh official documentation confirmed the local-plugin deeplink/UI flow. Independent QA accepted exact-version clean-home/cache execution, the two-tool confirmed legacy-symlink migration corridor, all non-Docker gates, sequential real Docker lifecycle/multi-project/multi-user recovery, reproducible archive, and zero cleanup. Live Desktop restart/new-task proof remains mandatory. |
| 2026-07-15 | Wave 7 W7C1 live correction | Reject W7C1 live migration as `FAILED/CORRECT`, accept corrected W7C2 `d88037c` for UI Upgrade, and merge it into integration as `517f551`. Keep Waves 6 and 7 `PARTIALLY_VERIFIED`. | The user-driven W7C1 plan made no mutation and exposed four legitimate audited-base `d98f7399` skill hashes omitted after Wave 2 changed the integration-root copies. RED replay reproduced 55 accepted plus four exact blockers. W7C2 trusts only those four provenance-bound hashes, produces 59 accepted/1 missing/0 blockers, retains one-byte drift rejection, passes source-unavailable apply/read-back, 320 contracts plus five skips, all five independent real Docker tests, reproducible archive, and zero cleanup. |
| 2026-07-15 | Waves 6-7 final local acceptance | Mark Waves 6 and 7 `VERIFIED`, freeze W7C2 as the accepted local candidate, and stop before Wave 8. | The user completed UI Upgrade, exact confirmed legacy migration, read-back, full restart, and a second new-task Desktop proof. The new task returned `VERIFIED/plugin-only`, exact W7C2, `installed-cache`, all 10 public skills, and the packaged MCP inventory. Read-only host checks found zero legacy NaCl symlinks and an exact candidate/cache match. Bundled Codex 0.144.2 independently completed a model-backed new-task doctor call exactly once. The clean-machine/user-journey verifier returned `ACCEPT WAVES 6-7 / VERIFIED`; remaining platform/deferred items are non-critical local-candidate limitations. |
| 2026-07-15 | Post-Wave-7 public roadmap | Add Wave 8 for complete plugin-first RU/EN user documentation, Wave 9 for production readiness of the full app-plus-skills product, and Wave 10 for separately confirmed OpenAI submission/review/publication. Do not build or submit a reduced skills-only listing. | The accepted local candidate works, but the existing quick start still directs Codex users through clone/symlink/manual Neo4j setup. OpenAI public review requires production MCP, publisher/legal metadata, complete tool annotations, reviewer prompts/tests, and portal actions. Separating these stages makes novice documentation and full-product gates mandatory before any external submission or publish mutation. |
| 2026-07-15 | Wave 8 static documentation acceptance | Accept exact documentation candidate `5b18834f750d462c4b010da8ea1e249ed54a4ee8` and merge it into integration as `4ea3a1e` solely for the user-driven private-share trial. Keep Wave 8 `PARTIALLY_VERIFIED` and stop before Wave 9. | Independent review accepted the corrected RU/EN plugin-first corpus, complete configuration pair, safely classified legacy graph runbook and bundled mirror, exact generated inventories, link/parity/security automation, and all proportional integration gates. Private card/share, clean-account installation, live novice journey, lifecycle screenshots, and rollback proof remain mandatory external UI evidence. |
| 2026-07-15 | ADR-004 graph-server authorization boundary | For Neo4j 5 Community, retain one container and independent data/log volume lineage per project, while treating the server/VPS as the user authorization boundary: an authorized principal may select every project registered on that server. `project_scope`/`project_ref` is routing and provenance, not a grant; another server requires a separate grant and denial must not leak its inventory. | Current `nacl-init` local/create/connect, private CA, ghostunnel, personal mTLS bundle, per-project Neo4j route secrets and revoke lifecycle were re-audited. Wave 9 must replace independent per-project CN/membership policy with an authoritative server principal registry plus derived gateway projections, explicit migration, inheritance, unique ports and fail-closed revoke. Independent architecture review returned `ACCEPT`. |
| 2026-07-15 | Wave 9 local implementation start and deferred Git gate | Start provider-neutral Wave 9 implementation on the fresh-main successor. Keep Wave 8 `PARTIALLY_VERIFIED`; after a separately authorized merge to `main` and immutable Git release, verify ordinary-user installation on another machine from that release. Do not use the unavailable personal-share UI as a blocker for local implementation or treat its absence as successful portability proof. | ADR-004, reconciliation plan and the Wave 9 runbook were reconciled and independently accepted at planning baseline `93084dd`. No authorization was granted for VPS/DNS/certificates/credentials/paid resources/deploy/portal/push/PR/merge/tag/release. |
| 2026-07-15 | Wave 9 Stage 1 reconciliation acceptance | Accept successor `e220031` as the exact, sanitized Codex-only foundation and mark Stage 1 `PARTIALLY_VERIFIED`; proceed to Stage 2 without treating the provisional package as current truth or a release candidate. | Three import commits added exactly 420 allow-listed donor paths and a separate evidence file. Two independent BLOCK rounds caught personal/host-temp leakage and unsafe/non-portable temp examples; dedicated correction commits produced a final independent `ACCEPT`. Relative to fresh-main successor base: 421 additions, 0 deletions or modified base paths; 399 donor-identical plus 21 exhaustively transformed paths; only four exact container-internal temp locations; Claude tree and Ledger preserved. Expected Stage 2 failures remain explicit: package 76/83, workflow 35/38, legacy skill validator and full docs. |
| 2026-07-15 | Wave 9 Stage 2 local acceptance | Accept exact implementation `9463c74e731011db9f229e07a7a4852f5dd8a931`, mark Stage 2 locally `VERIFIED`, and allow Stage 3 to start. Do not call this a release candidate or aggregate Wave 9 verification. | Independent adversarial rounds closed package symlink traversal, physical quarantine, pre-mutation reservation, opaque atomic route state, parameterized strings, canonical server authorization, durable exact-token release recovery, secret redaction, malformed/multi-document state, and stale evidence. Final independent review accepted the combined route/VPS scope and all dedicated package/workflow/graph/builder/closure/CLI gates. The five generic generated-tree ownership failures and documentation overlap remain explicitly owned by Stages 5 and 4. |
| 2026-07-15 | Wave 9 Stage 3 fresh-main isolation acceptance | Accept exact implementation `1a5494381bebf258de7753a52a9cb4a07964c019`, mark Stage 3 locally `VERIFIED`, and allow Stage 4 to start on the fresh-main successor. | The first guard was independently blocked for skip/non-HEAD, mutable-base, and new-sibling bypasses. The corrected guard has no caller-selected refs or skip path, binds literal main `19dd5e2`, checks committed/dirty/untracked changes in five Claude namespaces, and mandates generated parity. Independent shared-clone adversarial review, Bash 3.2, CI mode, Claude 31/31, Codex parity, provenance, diff, and leak gates all passed. |
| 2026-07-15 | Wave 9 Stage 4 documentation acceptance | Accept exact implementation `382945d4d6abf1ccf28c80ad215b48f93a284f03`, mark Stage 4 locally `VERIFIED`, and allow Stage 5 CI ownership work to start. | Two independent BLOCK rounds first removed shared-graph/password claims, then corrected packaged operational runbooks that still described per-project grants and an invalid revoke command. Final review accepted byte-identical EN/RU root/package runbooks, server-wide `--server-id` issue/revoke, mandatory opaque `secret_source`, 11/11 regressions, 83/83 package tests, 382-file closure, source drift, manifest, and Claude isolation. Stale cert-script `usage` text is fail-closed non-blocking debt for a later runtime/source patch. |
| 2026-07-15 | Wave 9 Stage 5 CI ownership acceptance | Accept exact implementation `6d108d4124992b1f5e0e68836fe3492515c6622d`, mark Stages 1-5 as `RECONCILIATION_BASE_VERIFIED`, and allow the provider-neutral Wave 9 production implementation to start. | Generic, Claude, and Codex owners are separated without weakening assertions. The old five generated-tree failures disappear under a closed 26-file Codex Node inventory; raw contracts are 243 total / 238 pass / 5 authorized Docker skips / 0 fail. Independent review accepted the four-file CI-only diff, full PowerShell job preservation, immutable Claude owner/tree, pinned hosted runtimes, current source-drift replacement for a stale historical root-sync step, and all package/graph/workflow/docs/closure gates. Hosted runtimes and `pwsh` remain honestly `NOT_RUN`. |
| 2026-07-15 | Wave 9 Stage 6 local public MCP acceptance | Accept exact implementation `f81fe95a7cf3ba0dc69fd0baa5986e1a1641af2d` for the bounded local Stage 6 scope. Keep Wave 9 `IN_PROGRESS`; do not set `LOCAL_IMPLEMENTATION_VERIFIED` and do not start Stage 7 through this disposition. | Independent security review returned explicit `ACCEPT` with no Stage 6 blocking defects. The provider-neutral MCP service, canonical OAuth identity, server-boundary control plane, seven closed public tools, release-only app binding, rootless pinned container, deterministic bundle and digest-bound SBOM passed the recorded gates. Commit `94e743b29a996135d4b74e8b022a4c79cd46883f` registers the production container gate in CI ownership. The Docker topology proves direct Neo4j HTTP routing to three isolated project containers and authorization behavior; it does not run the real gateway/mTLS path or prove durable/shared restart semantics. External provider/endpoint/scanners/hosted CI/deployment/clean-machine/portal gates remain `NOT_RUN` or `NOT_AUTHORIZED`. |
| 2026-07-16 | Wave 9 Stage 7 bounded local acceptance | Accept exact implementation `fac5087230579d029bc6aa612f7dbdef386031a0` as `LOCAL_ACCEPTED` only for metadata/assets, reviewer fixtures, disclosure, and deterministic pre-freeze binding. Keep Wave 9 `IN_PROGRESS / STAGES_1_7_LOCALLY_ACCEPTED / LOCAL_IMPLEMENTATION_AUTHORIZED`; do not set `LOCAL_IMPLEMENTATION_VERIFIED` and do not start Stage 8 or final QA through this disposition. | Exact-SHA independent reviews accepted reviewer fixture implementation `19db522efb36bc857fee2415d4f1859b06fc7fe4` and final binding implementation `fac5087230579d029bc6aa612f7dbdef386031a0`. Root review blockers for incomplete full-package binding and a broken package-relative privacy path were closed by a separate correction commit. Exact digests, 392-file tree/tar parity, test counts, and unresolved external `NOT_*` gates are recorded in `docs/research/codex-plugin-wave-9-stage-7-submission-readiness-2026-07-16.md`. No branding approval, screenshot, publisher/legal/support/security identity, production image/endpoint/OAuth/app binding, live reviewer run, hosted scan/CI, signature, portal, deploy, merge, release, or publication is claimed. |
| 2026-07-16 | Wave 9 final local QA checkpoint | Accept exact QA target `9fea16e2cbd47dabe97cd47bf1fba329844d866c` as `ACCEPT LOCAL CHECKPOINT / PARTIALLY_VERIFIED`, with implementation parent `fac5087230579d029bc6aa612f7dbdef386031a0`. Keep Wave 9 below `LOCAL_IMPLEMENTATION_VERIFIED` and aggregate `VERIFIED`; do not call the artifact submission-ready. | Independent cumulative security/release QA found no blocking defect. Full non-Docker suites, local real Docker topology/rootless container, exact 392-file reproducibility, current OpenAI validator, npm audit, bounded secret/privacy scan, Claude isolation and cleanup passed. Hosted Docker CI, clean second-machine Git-release install, durable/shared runtime, real gateway/mTLS/OAuth/endpoint, production image, external scanners, publisher/legal/portal fields, live reviewer execution, signatures and all external mutations remain `NOT_RUN`, `NOT_VERIFIED` or `NOT_AUTHORIZED`; see `docs/research/codex-plugin-wave-9-final-local-qa-2026-07-16.md`. |
| 2026-07-16 | Immutable Codex Git release | Merge the accepted Wave 9 branch into `main`, publish exact commit `fe4aa3cab2dab9d6cb40dab0087c33ebe90e5ed9` as annotated tag and GitHub Release `codex-plugin-v0.1.0`, and allow the user-driven second-machine gate to start. Keep Waves 8-9 `PARTIALLY_VERIFIED`. | Local post-merge contracts, framework tests, Docker topology/rootless container, cleanup and privacy canary passed; three hosted workflows succeeded on exact SHA; isolated clean `HOME`/`CODEX_HOME` installed exact Git tag into cache and doctor returned `VERIFIED/plugin-only/installed-cache`. Real second-machine Desktop UI, permissions, restart/new-task, dry-run and lifecycle/rollback evidence remain `NOT_RUN`; OpenAI publication remains `NOT_AUTHORIZED`. |
| 2026-07-20 | ADR-005 public product boundary | Supersede the historical Wave 9/10 app-plus-skills/public-MCP submission plan with one bootstrap-first **Skills only** installation. `nacl-init` creates user-operated per-project Neo4j Community and project-local stdio `neo4j-mcp`; a new trusted-project task loads `.codex/config.toml`. Do not require a second Git installation and do not operate a public NaCl MCP. | The live OpenAI portal exposes **Skills only** creation. The repository implementation, disclosure, reviewer fixtures, deterministic builder, and user journey now match this boundary. Historical public-MCP artifacts remain compatibility/research code and are excluded from the submitted closure. |
| 2026-07-20 | Wave 8 cross-machine acceptance | Mark Wave 8 `VERIFIED / CROSS_MACHINE_INSTALL_ACCEPTED`. | The user installed the immutable Git-distributed plugin on another clean machine and confirmed that it deployed and worked. This closes the portability blocker for the existing distribution without claiming the future official-card lifecycle. |
| 2026-07-20 | Wave 9 Skills-only acceptance | Accept exact implementation `464ec0792a83e3ee80e846cc669587c2835b6f58` as `VERIFIED / RELEASE_READY` and authorize the merge/release handoff to Wave 10. | Independent re-review returned `ACCEPT` after closing runtime-drifting reviewer fixtures, canonical-root alias acceptance, the impossible checksum fixture, Windows ACL ownership, the repository credential-lint false positive without weakening the scan, and concurrent JSON-RPC write/readback in the Docker evidence. The final E2E completes the write before a new MCP process performs the separate readback. Full local contracts, repeated real staged-tree Docker/MCP E2E, exact hosted Linux/Docker, exact native Windows, deterministic ZIP, closure, legal metadata, privacy, secret scan, validator, and Claude isolation all passed. Portal upload/reviewer execution/submission/publication remain separate Wave 10 gates. |

### Candidate handoff

```text
Status: VERIFIED / RELEASE_READY — Wave 10 portal draft pending
Accepted implementation SHA: 464ec0792a83e3ee80e846cc669587c2835b6f58
Final release SHA: exact post-merge main SHA, to be recorded in the GitHub Release manifest
Planned release tag: codex-skills-only-v0.2.0
Plugin version: 0.2.0
Distribution: one OpenAI Skills-only UI installation; GitHub is source/release/support, not a second installation step
Public skills: nacl-ba, nacl-diagnose, nacl-fix, nacl-goal, nacl-init, nacl-migrate, nacl-publish, nacl-sa, nacl-tl, nacl-verify
Prerequisites: supported OpenAI/Codex Skills-only host, canonical trusted project root, Node.js 20+, Docker Engine/Desktop with Compose, outbound access to the pinned neo4j-mcp asset and Neo4j image registry
Known limitations: live OpenAI upload/reviewer execution, official-card install/update/uninstall, submission outcome, and publication remain Wave 10; no offline installer is claimed
Rollback/removal: uninstall the Skills-only card; user-operated project files, graph volumes, credentials, and project MCP configuration are preserved unless the user removes them separately
Evidence summary: independent ACCEPT; 282 contracts with 0 failures; exact local and hosted Docker bootstrap/MCP; exact hosted Windows; deterministic 158-entry pre-freeze ZIP; no public MCP/OAuth/App or second Git install
Main merge/push/tag/GitHub Release: pending this handoff; OpenAI portal draft: authorized but not created; Submit for Review/publication: awaiting separate confirmations
```

---

## 18. Orchestrator final report template

```text
Status: <closed status>

Outcome:
<what is actually runnable>

Candidate:
- Integration branch / SHA:
- Plugin version:
- Marketplace:
- Install/reinstall commands:

Compatibility:
- Codex CLI legacy:
- Codex CLI plugin:
- Codex Desktop:
- Claude Code isolation:

Graph:
- Local lifecycle:
- Multi-project isolation:
- Multi-user/session consistency:
- Migration/recovery:

Evidence:
- Commands and exit codes:
- E2E artifacts:
- Independent review:

Known limitations:

Public state:
- Main merge: NOT_RUN
- Push: NOT_RUN unless separately authorized
- Public marketplace/release: NOT_RUN

Recommended user trial:
<exact short sequence>
```

The final report must make it impossible to confuse a locally installable
candidate with a merged or publicly released product.

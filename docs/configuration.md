[Home](../README.md) > Configuration

# Configuration Reference

Every target project has a `config.yaml` at its root. NaCl skills read this file at runtime to adapt behavior to the project — git strategy, test commands, Neo4j connection, deploy targets, and integrations.

---

## Location and Lookup

Skills locate `config.yaml` by searching from the current working directory upward. The file must be at the project root (same level as `package.json` or the top-level `src/`).

If `config.yaml` is missing, skills fall back to built-in defaults where possible (e.g., git strategy defaults to `feature-branch`, test command defaults to `npm test`). Fields with no default will cause the skill to report a configuration error.

---

## Re-running `/nacl-init` on an Existing Project

Running `/nacl-init` on a project that was already initialised is safe and idempotent. In addition to refreshing `CLAUDE.md` and `config.yaml`, the skill automatically migrates legacy infrastructure artefacts without requiring any manual steps from the analyst:

| Detected condition | What the skill does |
|---|---|
| `graph-infra/docker-compose.yml` contains an `excalidraw` or `excalidraw-room` service | Stops and removes the container (if running), then removes the service block from the YAML |
| `graph-infra/.env` contains `EXCALIDRAW_PORT` or `EXCALIDRAW_ROOM_PORT` | Removes those lines |
| `graph-infra/boards/` directory does not exist | Creates it |
| `config.yaml` exists but has no `project.id` field | Injects a slugified id derived from the project name |
| `config.yaml` exists but has no `project.name` field | Injects the human-readable name from the skill argument |
| `config.yaml` exists but has no `intake:` section | Appends the intake self-diagnosis scoring block with built-in defaults (add-only — an existing `intake:` section is never touched). See § `intake` below |

If any migration was performed, the skill prints a single summary line (e.g., `Migrated existing project: removed legacy excalidraw services (2 containers stopped), created graph-infra/boards/.`). For a fresh project with nothing to migrate, no output is produced.

See `nacl-init/SKILL.md` § Auto-migrate Legacy Artefacts for the full procedural detail.

---

## Complete Example

```yaml
project:
  id: "my-project"
  name: "My Project"
  stack: "Next.js + Fastify + PostgreSQL"

git:
  strategy: "feature-branch"
  main_branch: "main"
  branch_prefix: "feature/"
  merge_method: "squash"

modules:
  frontend:
    path: "frontend"
    test_cmd: "npm test"
    build_cmd: "npm run build"
  backend:
    path: "backend"
    test_cmd: "npm test"
    build_cmd: "npm run build"

graph:
  neo4j_bolt_port: 3587
  neo4j_http_port: 3574
  neo4j_password: "${NEO4J_PASSWORD}"
  container_prefix: "my-project"
  boards_dir: "graph-infra/boards"

yougile:
  api_base: "https://yougile.com/api-v2"
  project_id: "your-project-id"
  board_id: "your-board-id"
  columns:
    dev_done: "column-id-for-dev-done"
    done: "column-id-for-done"

deploy:
  ci_platform: "github-actions"
  staging:
    method: "github-actions"
    url: "https://staging.example.com"
    health_endpoint: "/api/health"
    skip_ci: false
    env_file: "deploy/.env.staging"
    script: "deploy/staging-direct.sh"
  production:
    url: "https://example.com"
    health_endpoint: "/api/health"

vps:
  staging:
    ip: "1.2.3.4"
    user: "deploy"
    ssh_key: "~/.ssh/id_rsa"
  production:
    ip: "5.6.7.8"
    user: "deploy"
    ssh_key: "~/.ssh/id_rsa"
```

---

## Section Reference

### `project` (required)

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | no | auto-slugified from `name` | Stable project identifier (lowercased, spaces→hyphens, `[a-z0-9_-]` only). Registered in the analyst-tool project registry (Step 2d). If `config.yaml` exists but lacks `id`, `/nacl-init` injects it automatically (Migration check E) |
| `name` | string | yes | — | Human-readable project name, used in reports and YouGile messages |
| `stack` | string | no | — | Technology stack description, included in context for dev skills |
| `description` | string | no | — | Short project description, included in context for dev skills |

---

### `git` (required for ship/deploy skills)

Controls how `nacl-tl-ship` commits and pushes code.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `strategy` | string | yes | `feature-branch` | `feature-branch` — always commit to a feature branch and create a PR. `direct` — commit directly to the base branch |
| `main_branch` | string | no | `main` | Name of the base/main branch |
| `branch_prefix` | string | no | `feature/` | Prefix for auto-created feature branches |
| `merge_method` | string | no | `squash` | PR merge method used by `nacl-tl-release` (`gh pr merge --{merge_method}`): `squash`, `merge`, or `rebase` |

**`feature-branch` strategy** creates a branch per UC/FR, opens a PR, and never commits to `main_branch`. **`direct` strategy** commits directly to `main_branch` — suitable for solo projects or hotfix workflows.

Some legacy projects use a per-module format instead of the top-level `git:` section. Skills check `git.*` first, then fall back to `modules.[name].git_strategy` and `modules.[name].git_base_branch`.

---

### `modules` (required for dev/ship skills)

Defines frontend and backend modules. Each module key is arbitrary — common names are `frontend`, `backend`, `api`, `web`.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `[name].path` | string | yes | — | Path to module root relative to project root |
| `[name].test_cmd` | string | no | `npm test` | Command to run tests |
| `[name].build_cmd` | string | no | `npm run build` | Command to build the module |
| `[name].git_strategy` | string | no | inherits `git.strategy` | Per-module git strategy override (legacy format) |
| `[name].git_base_branch` | string | no | inherits `git.main_branch` | Per-module base branch override (legacy format) |

---

### `credentials` (optional)

Infrastructure access and test users for QA/debugging. Used by `nacl-tl-qa` (E2E login), `nacl-tl-verify` (delegates to `nacl-tl-qa`), and `nacl-tl-fix` (bug reproduction).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `db.host` / `db.port` / `db.user` / `db.database` | string/int | no | — | Infrastructure/service access for debugging. `db.password` should come from env (`DB_PASSWORD`), not be committed |
| `[role].email` / `[role].phone` | string | no | — | Login identifier for a named test-user role (e.g. `admin`, `user`) |
| `[role].password` | string | no | — | Password for the test-user role |
| `[role].role` | string | no | — | Role label used by `nacl-tl-qa` E2E scripts |

---

### `graph` (required for graph-aware skills)

Connection settings for Neo4j. Used by all `nacl-*` skills that read or write the spec graph — not just `nacl-ba-*`/`nacl-sa-*`, but also graph-aware TL skills such as `nacl-tl-plan`, `nacl-tl-full`, `nacl-tl-status`, `nacl-tl-next`, `nacl-tl-intake`, and `nacl-tl-conductor`.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `mode` | string | no | `local` | `local` (per-project Docker Neo4j on this machine) or `remote` (a separate Neo4j 5 Community container with independent durable volumes for this project on a reachable VPS). **Absent ⇒ `local`** (backward compatible). |
| `boards_dir` | string | no | `graph-infra/boards` | Directory where Excalidraw board files are stored. Each `.excalidraw` file may have a `<basename>.meta.json` sidecar managed by `nacl-render` and `nacl-ba-sync` — format defined in `nacl-core/SKILL.md` § "Board Meta Sidecar". |

**Local-mode fields** (`mode: local`):

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `neo4j_bolt_port` | integer | yes | — | Bolt port for Cypher connections (e.g. `3587`) |
| `neo4j_http_port` | integer | yes | — | HTTP browser port (e.g. `3574`) |
| `neo4j_password` | string | yes | — | Neo4j password |
| `container_prefix` | string | no | — | Docker container name prefix (e.g. `my-project` → container `my-project-neo4j`) |

**Remote-mode fields** (`mode: remote`):

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `neo4j_uri` | string | yes | — | Bolt URI the MCP server connects to. In remote mode this is the **local sidecar socket** (e.g. `bolt://localhost:3700`); the mTLS tunnel carries traffic to the VPS. |
| `neo4j_username` | string | no | `neo4j` | DB username for the project's Neo4j Community container. |
| `neo4j_database` | string | no | `neo4j` | Database name. |
| `project_scope` | string | yes | — | Project routing and provenance identifier for the dedicated container/route. It is not an authorization grant and does not depend on a `(:Project)` marker in a shared graph. |
| `remote.route_mode` | string | yes | — | `create` provisions this project's remote container/volumes/route; `connect` joins that same project route. |
| `remote.host` | string | yes | — | VPS hostname (e.g. `graph.example.com`). |
| `remote.gateway_port` | integer | yes | — | Public mTLS gateway port on the VPS. |
| `remote.sidecar_port` | integer | yes | — | Local port the ghostunnel client listens on (must match `neo4j_uri`). |
| `remote.client_cert` / `client_key` / `ca_cert` | string | yes | — | Paths to the developer's personal client certificate (the revocable "API key"), key, and CA. |
| `remote.tls` | bool | no | `true` | Whether the gateway link uses TLS (it must). |
| `remote.secret_source` | string | yes | — | Opaque secret reference accepted by the runtime: exactly `env:NEO4J_PASSWORD` or `server-route:<id>`. A raw password is forbidden. |

**Developer identity** (`developer.id`, optional, any mode):

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `developer.id` | string | no | auto (`<git user.email \| $USER>/<machine-key>`) | Committed/per-clone override for the identity stamped on remote-mode claim-locks (`claimed_by`) and provenance (`updated_by`). Resolution precedence: `$NACL_DEVELOPER_ID` env > `developer.id` in `config.yaml` > auto per-machine derivation. See `nacl-core/scripts/resolve-developer-id.mjs`. |

#### Graph mode: local vs remote

By default every project runs **local** — `/nacl-init` provisions a per-project Neo4j Docker
container, exactly as before. Nothing about existing projects changes; an absent `mode` key is
read as `local`.

A project becomes **remote** only deliberately. It still owns a separate Neo4j 5 Community
container and independent durable volumes, but they run on a reachable VPS instead of the
developer's machine. The first developer runs `/nacl-init --scale=create` to provision that
project's container, volumes, and route; a teammate runs `/nacl-init --scale=connect` to join the
same project route. Because the non-secret endpoint fields are committed to `config.yaml`, a
teammate who simply clones the repo and re-runs `/nacl-init` is **auto-routed into connect-mode**
(no local Docker and no schema seed) by the committed `mode: remote`.

**Security model (remote):** access is gated by a personal **mTLS client certificate** per developer
(the revocable "API key"), terminated at the VPS gateway; the MCP server still connects to
`bolt://localhost:<sidecar_port>` through a local tunnel, so skills are unchanged. The server is the
current authorization boundary: access to it is treated as access to every project database hosted
there. `project_scope` selects a project route and records provenance; it neither grants access nor
creates a shared-graph `(:Project)` authorization boundary. See the
[VPS provisioning runbook](runbooks/provision-shared-graph-vps.md) and
[remote connection runbook](runbooks/connect-to-existing-remote-project.md).

**Secrets are never committed.** Remote mode requires `graph.remote.secret_source`. The exact
`env:NEO4J_PASSWORD` reference reads `NEO4J_PASSWORD` only from the current runtime environment;
`server-route:<id>` delegates resolution to the external provider configured by
`NACL_SERVER_ROUTE_SECRET_PROVIDER`. `.mcp.json` stores only that opaque reference plus launcher and
route metadata, never a raw or shared password. If the selected environment variable or provider is
unavailable, initialization and connection fail closed; there is no demo/default password fallback.

---

### `yougile` (optional)

YouGile integration for task tracking. If omitted, ship/deploy skills skip task moves and just report locally.

The API token is **not** a config.yaml key — it is supplied via the `YOUGILE_API_KEY` environment variable to the YouGile MCP server (`nacl-init` locates it with `grep -r "YOUGILE_API_KEY" ~/.claude.json`).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `api_base` | string | no | `https://yougile.com/api-v2` | YouGile API base URL |
| `project_id` | string | yes | — | YouGile project identifier |
| `board_id` | string | yes | — | YouGile board identifier; `nacl-init` checks this to decide whether YouGile is configured |
| `columns.user_requests` | string | no | — | Column where the user/client creates cards |
| `columns.backlog` | string | no | — | Column where the agent decomposes cards into tasks |
| `columns.in_work` | string | no | — | Column for tasks picked up for development |
| `columns.dev_done` | string | no | — | Column ID to move tasks to after `nacl-tl-ship` |
| `columns.ready_to_test` | string | no | — | Column for tasks ready for verification |
| `columns.testing` | string | no | — | Column for tasks under agent verification |
| `columns.to_release` | string | no | — | Column for verified tasks ready to deploy |
| `columns.reopened` | string | no | — | Column for tasks that failed verification |
| `columns.done` | string | no | — | Column ID to move tasks to after successful production deploy |
| `stickers.task_type` | object | no | — | Sticker id + states (`task`/`bug`/`feature`) for classifying card type |
| `stickers.module` | object | no | — | Sticker id + per-module states (e.g. `{ frontend: "id", backend: "id" }`) — read by `nacl-tl-reopened` |
| `stickers.source` | object | no | — | Sticker id + states (`user`/`agent`) for tracking card origin |
| `auto_create_bugs.critical` | boolean | no | `true` | Always create a bug task on critical QA findings (cannot disable) |
| `auto_create_bugs.major` | boolean | no | `true` | Create a bug task (Reopened column) on major QA findings |
| `auto_create_bugs.minor` | boolean | no | `false` | Create a bug task on minor QA findings |

---

### `deploy` (optional)

Deploy configuration used by `nacl-tl-ship --deploy` and `nacl-tl-deploy`. If omitted, deploy monitoring is unavailable.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `ci_platform` | string | no | auto-detected | CI/CD platform: `github-actions`. Auto-detected from `.github/workflows/` if not set |
| `staging.method` | string | no | `github-actions` | How staging deploys are triggered: `github-actions` (deploy via CI after push) or `direct` (run a local script) |
| `staging.url` | string | yes (for deploy monitoring) | — | Base URL of the staging environment |
| `staging.health_endpoint` | string | no | `/api/health` | Path to the health check endpoint on staging |
| `staging.skip_ci` | boolean | no | `false` | When `true` and `--deploy` flag is used, appends `[skip ci]` to the commit message to suppress GitHub Actions CI runs |
| `staging.env_file` | string | no | — | Path to an env file loaded before the frontend build when using `--deploy` (injects staging-specific vars like `NEXT_PUBLIC_*`) |
| `staging.script` | string | no | — | Path to the deploy script, used only when `staging.method == direct` |
| `production.url` | string | no | — | Base URL of the production environment |
| `production.health_endpoint` | string | no | `/api/health` | Path to the health check endpoint on production |

---

### `vps` (optional)

SSH access for VPS diagnostics. Used by `nacl-tl-deploy` when a health check fails and the skill needs to SSH in to inspect logs and process state.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `staging.ip` | string | no | — | Staging server IP |
| `staging.user` | string | no | — | SSH user |
| `staging.ssh_key` | string | no | — | Path to SSH private key |
| `production.ip` | string | no | — | Production server IP |
| `production.user` | string | no | — | SSH user |
| `production.ssh_key` | string | no | — | Path to SSH private key |

---

### `reports` (optional)

Test report storage/publishing, read by `nacl-tl-qa`. If the section is empty, reports default to local storage under `.tl/reports/`.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `mode` | string | no | `local` | `local` — reports saved under `local_path` only. `remote` — reports also published via rsync |
| `local_path` | string | no | `.tl/reports` | Path (relative to project root) where reports are saved |
| `ssh_host` | string | no (required if `mode: remote`) | — | `user@ip` for rsync target |
| `remote_path` | string | no | `/srv/reports` | Remote path reports are rsynced to |
| `domain` | string | no | — | Public domain reports are served under (e.g. `reports.example.com`) |
| `retention_days` | integer | no | `30` | Days to retain published reports |

---

### `docmost` (optional)

Docmost documentation-publishing connection settings, read by `nacl-publish` (and `sa-publish`/`ba-publish`). Manifest files under `docs/.docmost-sync*.json` track page-level sync state only — `space_id`/`root_page_id` live here.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `api_url` | string | no | — | Docmost API base URL (e.g. `https://docs.example.com/api`). Credentials come from env: `DOCMOST_EMAIL`, `DOCMOST_PASSWORD` |
| `spaces.sa.space_id` / `spaces.sa.root_page_id` | string | no | — | Docmost space and root page for SA documentation |
| `spaces.ba.space_id` / `spaces.ba.root_page_id` | string | no | — | Docmost space and root page for BA documentation |

---

### `intake` (optional — self-diagnosis scoring)

Tuning knobs for `nacl-tl-intake` Step 2a.5 PROBE — the hypothesis-verification
stage that runs before any classification question. When the project graph
alone does not resolve an atom (bug vs feature vs task), intake formulates
falsifiable hypotheses, verifies them against the actual code/DB with bounded
read-only probes, and derives a deterministic rubric score. The score decides
whether the atom auto-routes on the leading hypothesis or the user is asked a
question that carries the diagnosis.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `route_threshold` | float (0,1] | no | `0.7` | Score at or above this → auto-route on the leading hypothesis. Below → the (batched) question fires, carrying the diagnosis |
| `high_confidence` | float (0,1] | no | `0.9` | Score at or above this → HIGH confidence (`CODE` evidence) — routes like a graph-backed atom, no tracked alternative needed. Between the two thresholds → auto-route WITH the alternative recorded as a tracked follow-up |
| `scores.*` | float (0,1] | no | see reference | Rubric row values (verdict pattern → score). Keys: `leader_confirmed_all_refuted` (0.95), `leader_confirmed_some_inconclusive` (0.8), `leader_indirect_all_refuted` (0.75), `leader_indirect_inconclusive` (0.55), `contradictory` (0.4), `all_inconclusive` (0.2) |

Every key falls back **independently** to the built-in defaults — overriding
one score does not require restating the others. Values outside `(0, 1]` or
`route_threshold > high_confidence` are a broken config: skills warn and use
defaults for the offending keys (a broken config must not silently disable
the question gate). Hard-refuse triggers (billing, auth, schema migration,
destructive ops, product decisions) are score-independent and never
auto-route.

Raise `route_threshold` (e.g. `0.85`) where a misrouted atom is expensive —
more questions, fewer autonomous calls. Lower it (e.g. `0.55`) on prototypes
where `/nacl-tl-fix`'s gap-check backstop makes misrouting cheap.

Seeded by `/nacl-init` (template for new projects; add-only injection on
existing ones — user-tuned values are never overwritten). Semantics, rubric
and worked examples: `nacl-tl-core/references/intake-scoring.md`. Design
rationale: `docs/adr/002-intake-scoring-rubric.md`.

---

## How Skills Resolve Config

Skills use the following priority order when looking up values:

| Value | Priority chain |
|---|---|
| Git strategy | `git.strategy` > `modules.[name].git_strategy` > fallback `feature-branch` |
| Base branch | `git.main_branch` > `modules.[name].git_base_branch` > fallback `main` |
| Branch prefix | `git.branch_prefix` > fallback `feature/` |
| Test command | `modules.[name].test_cmd` > fallback `npm test` |
| Build command | `modules.[name].build_cmd` > fallback `npm run build` |
| Module path | `modules.[name].path` > auto-detect from `package.json` |
| Deploy method | `deploy.staging.method` > `deploy.method` > fallback `github-actions` |
| Health endpoint | `deploy.[env].health_endpoint` > fallback `/api/health` |
| Intake scoring | `intake.route_threshold` / `intake.high_confidence` / `intake.scores.*` > per-key fallback to `nacl-tl-core/references/intake-scoring.md` defaults |

If `config.yaml` is missing entirely, all fields fall back to their defaults. Skills that require `graph.*` (BA/SA and graph-aware TL skills) or `deploy.*` (deploy monitoring) will report an error when those sections are absent — there is no sensible default for a database URL or server address.

### Branch-name discipline (for skill authors)

`config.yaml` is the **single source of truth** for the base branch. When writing or editing a skill:

- **Never hardcode a branch name** (`main`, `master`, `develop`, …) in a `git`/`gh` command. Always resolve and use the variable — `{main_branch}` (or `<git_base_branch>` for per-module flows) — from the resolution chain above. The fallback default *being* `"main"` masks the bug: a literal `main` works on default projects and silently breaks the moment a project sets `git.main_branch`/`git_base_branch` to anything else.
- **Never duplicate config values into a convenience table** inside a skill (e.g. a per-module "Base branch" column listing literal branch names). That table becomes a second source of truth and goes stale the instant someone renames a branch in `config.yaml`. Reference the config key instead — point the reader at `config.yaml → modules.[name].git_base_branch`.

A literal branch name in a git command inside a shell code fence is rejected by CI (`scripts/check-branch-literals.sh`, wired into `Lint Skills`). Prose, output blocks, and prohibition rules ("never `git checkout main`") are not flagged; if a literal is genuinely intentional, append `# branch-literal-ok` to that line. The runtime counterpart of this rule — what to do when you *find* such a hardcoded value in an existing skill — is in `nacl-tl-core/references/tl-protocol.md`, § 8 "Дефекты в глобальных скиллах (выноси и жди)" ("Skill / framework defects — surface and wait").

## Codex Plugin and Public Service

### Local installed candidate

The full Codex plugin reads the same project `config.yaml`; it does not add a
second project configuration schema. The verified local candidate resolves a
project, then uses named gateway operations and runtime-resolved credentials.
Local stdio is an installed-candidate and development transport. The normal
user installs the full plugin through the Codex UI, while the skills-only
layout is compatibility-only.

### Production boundary

No public-only Codex settings are active yet. The Streamable HTTP endpoint,
OAuth deployment, domain, release, and marketplace submission are `NOT_RUN`,
so this reference does not invent fields for them. The production gateway must
authenticate an OAuth principal, map it to an allowed Neo4j server, allow
same-server project selection, and deny cross-server routing. The current
authorization boundary is the server: access to it implies access to all
project databases hosted there. `graph.project_scope` is routing/provenance,
not authorization. Secrets remain in runtime secret stores or environment;
they are never package data or committed config.

---

## Minimal Configs

**TL-only project (no graph, no YouGile):**

```yaml
project:
  name: "My Project"
  stack: "Next.js + Express"

git:
  strategy: "feature-branch"
  main_branch: "main"

modules:
  frontend:
    path: "frontend"
    test_cmd: "npm test"
  backend:
    path: "backend"
    test_cmd: "npm test"
```

**Full graph project:**

```yaml
project:
  name: "My Project"
  stack: "Next.js + Fastify + PostgreSQL"

git:
  strategy: "feature-branch"
  main_branch: "main"

modules:
  frontend:
    path: "frontend"
    test_cmd: "npm test"
    build_cmd: "npm run build"
  backend:
    path: "backend"
    test_cmd: "npm test"
    build_cmd: "npm run build"

graph:
  neo4j_bolt_port: 3587
  neo4j_http_port: 3574
  neo4j_password: "${NEO4J_PASSWORD}"
  container_prefix: "my-project"
```

The `nacl-init` scaffolding skill generates a starter `config.yaml` when you run `/nacl-init "My Project"`.

---

## Environment Variables

### `NACL_HOME`

Controls the directory where NaCl stores its per-user registry file (`projects.json`).

| | |
|---|---|
| **Default** | `~/.nacl/` |
| **Override** | `export NACL_HOME=/path/to/custom/dir` |
| **Written by** | `nacl-init` (Step 2d) — on every `/nacl-init` run |
| **Read by** | `nacl-init` (when registering a project) and the NaCl Analyst Tool (when listing projects in the UI) |

Use cases: per-user override on shared machines where `$HOME` is a network drive, or pointing at a test directory during development. The full registry path resolves to `$NACL_HOME/projects.json`. Canonical implementation: `analyst-tool/server/src/services/project-registry.ts`, function `getRegistryPath()`.

---

### `NEO4J_MCP_VERSION`

Pins (or overrides) the `neo4j-mcp` binary version resolved by `graph-setup.sh`.

| | |
|---|---|
| **Default** | pinned version from `neo4j-mcp.pin` |
| **Override** | `export NEO4J_MCP_VERSION=<tag>` (or `=latest` to resolve the newest release, **skipping checksum verification** — a warning is printed) |
| **Read by** | `nacl-tl-core/scripts/setup-graph.sh` |

---

### `NACL_DEVELOPER_ID`

Explicit override for the identity stamped on remote-mode claim-locks (`claimed_by`) and provenance (`updated_by`). Highest-precedence source ahead of `config.yaml → developer.id` and the auto per-machine derivation.

| | |
|---|---|
| **Default** | unset — falls back to `config.yaml → developer.id`, then auto `<git user.email \| $USER>/<machine-key>` |
| **Override** | `export NACL_DEVELOPER_ID=<id>` |
| **Read by** | `nacl-core/scripts/resolve-developer-id.mjs` |

---

### `NACL_ALLOW_DUAL`

Opts out of the plugin/symlink coexistence warning (v2.24.0+). By default, if both the Claude Code Desktop plugin and repo-side symlinked skills are detected on the same machine, the plugin's SessionStart hook warns to avoid duplicate/conflicting skills.

| | |
|---|---|
| **Default** | unset — coexistence warning is active |
| **Override** | `export NACL_ALLOW_DUAL=1` |
| **Read by** | `plugin/scripts/check-coexistence.sh` |

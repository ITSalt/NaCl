[Home](../README.md) > Configuration

# Configuration Reference

Every target project has a `config.yaml` at its root. NaCl skills read this file at runtime to adapt behavior to the project — git strategy, test commands, Neo4j connection, deploy targets, and integrations.

---

## Location and Lookup

Skills locate `config.yaml` by searching from the current working directory upward. The file must be at the project root (same level as `package.json` or the top-level `src/`).

If `config.yaml` is missing, skills fall back to built-in defaults where possible (e.g., git strategy defaults to `feature-branch`, test command defaults to `npm test`). Fields with no default will cause the skill to report a configuration error.

---

## Complete Example

```yaml
project:
  name: "My Project"
  stack: "Next.js + Fastify + PostgreSQL"

git:
  strategy: "feature-branch"
  main_branch: "main"
  branch_prefix: "feature/"

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
  neo4j_password: "neo4j_graph_dev"
  excalidraw_port: 3580
  container_prefix: "my-project"
  boards_dir: "graph-infra/boards"

yougile:
  token: "your-yougile-api-token"
  project_id: "your-project-id"
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
| `name` | string | yes | — | Human-readable project name, used in reports and YouGile messages |
| `stack` | string | no | — | Technology stack description, included in context for dev skills |

---

### `git` (required for ship/deploy skills)

Controls how `nacl-tl-ship` commits and pushes code.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `strategy` | string | yes | `feature-branch` | `feature-branch` — always commit to a feature branch and create a PR. `direct` — commit directly to the base branch |
| `main_branch` | string | no | `main` | Name of the base/main branch |
| `branch_prefix` | string | no | `feature/` | Prefix for auto-created feature branches |

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

### `graph` (required for BA/SA skills)

Connection settings for the Neo4j container. Only needed if you use `nacl-ba-*` or `nacl-sa-*` skills.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `neo4j_bolt_port` | integer | yes | — | Bolt port for Cypher connections (e.g. `3587`) |
| `neo4j_http_port` | integer | yes | — | HTTP browser port (e.g. `3574`) |
| `neo4j_password` | string | yes | — | Neo4j password |
| `excalidraw_port` | integer | no | — | Port for the Excalidraw container used by `nacl-render` |
| `container_prefix` | string | no | — | Docker container name prefix (e.g. `my-project` → container `my-project-neo4j`) |
| `boards_dir` | string | no | `graph-infra/boards` | Directory where Excalidraw board files are stored |

---

### `yougile` (optional)

YouGile integration for task tracking. If omitted, ship/deploy skills skip task moves and just report locally.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `token` | string | yes | — | YouGile API token |
| `project_id` | string | yes | — | YouGile project identifier |
| `columns.dev_done` | string | no | — | Column ID to move tasks to after `nacl-tl-ship` |
| `columns.done` | string | no | — | Column ID to move tasks to after successful production deploy |

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

If `config.yaml` is missing entirely, all fields fall back to their defaults. Skills that require `graph.*` (BA/SA layer) or `deploy.*` (deploy monitoring) will report an error when those sections are absent — there is no sensible default for a database URL or server address.

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
  neo4j_password: "neo4j_graph_dev"
  container_prefix: "my-project"
```

The `nacl-init` scaffolding skill generates a starter `config.yaml` when you run `/nacl-init "My Project"`.

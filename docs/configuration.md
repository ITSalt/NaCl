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
| `container_prefix` | string | no | — | Docker container name prefix (e.g. `my-project` → container `my-project-neo4j`) |
| `boards_dir` | string | no | `graph-infra/boards` | Directory where Excalidraw board files are stored. Each `.excalidraw` file may have a `<basename>.meta.json` sidecar managed by `nacl-render` and `nacl-ba-sync` — format defined in `nacl-core/SKILL.md` § "Board Meta Sidecar". |

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

If `config.yaml` is missing entirely, all fields fall back to their defaults. Skills that require `graph.*` (BA/SA layer) or `deploy.*` (deploy monitoring) will report an error when those sections are absent — there is no sensible default for a database URL or server address.

### Branch-name discipline (for skill authors)

`config.yaml` is the **single source of truth** for the base branch. When writing or editing a skill:

- **Never hardcode a branch name** (`main`, `master`, `develop`, …) in a `git`/`gh` command. Always resolve and use the variable — `{main_branch}` (or `<git_base_branch>` for per-module flows) — from the resolution chain above. The fallback default *being* `"main"` masks the bug: a literal `main` works on default projects and silently breaks the moment a project sets `git.main_branch`/`git_base_branch` to anything else.
- **Never duplicate config values into a convenience table** inside a skill (e.g. a per-module "Base branch" column listing literal branch names). That table becomes a second source of truth and goes stale the instant someone renames a branch in `config.yaml`. Reference the config key instead — point the reader at `config.yaml → modules.[name].git_base_branch`.

A literal branch name in a git command inside a shell code fence is rejected by CI (`scripts/check-branch-literals.sh`, wired into `Lint Skills`). Prose, output blocks, and prohibition rules ("never `git checkout main`") are not flagged; if a literal is genuinely intentional, append `# branch-literal-ok` to that line. The runtime counterpart of this rule — what to do when you *find* such a hardcoded value in an existing skill — is in `nacl-tl-core/references/tl-protocol.md` ("Skill / framework defects").

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

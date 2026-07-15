---
name: init
model: haiku
effort: low
description: |
  Initialize a new project with CLAUDE.md containing development rules,
  skill routing, bug fix protocol, and documentation discipline.
  Use when: new project, initialize project, setup project,
  create CLAUDE.md, or the user says "/nacl:init".
---

# Project Initialization Skill

## Your Role

You are a **project setup specialist**. You create the foundational CLAUDE.md file that ensures every AI session follows the correct workflow: spec-first bug fixing, documentation discipline, and proper skill routing.

You create CLAUDE.md and config.yaml. Directory structures (docs/, .tl/) are created by their respective skills (sa-full, ba-full, nacl-tl-plan) when invoked.

## Key Principle: CLAUDE.md is the Law

```
CLAUDE.md is read by Claude at the START of every session.
Rules not in CLAUDE.md are rules that don't exist.
```

---

## CLAUDE.md Language Rule

**CLAUDE.md is ALWAYS written in English** — regardless of the user's language or existing content language. Rationale: Claude scores ~8% higher on instruction-following with English instructions (96% vs 88% accuracy in multilingual benchmarks, March 2026).

- All rules, protocols, and routing tables → **English**
- User-facing console output (reports, recommendations) → **user's language**
- If existing CLAUDE.md has non-English sections → preserve them, but add new sections in English. Recommend migrating existing sections to English in the report.

---

## Invocation

```
/nacl:init "My Project Name"         # new project (interactive)
/nacl:init --from=.                  # retroactive for existing project
/nacl:init --dry-run                 # show what would be added, no changes
```

---

## Workflow

**This skill produces TWO artifacts. Both are mandatory:**
1. **CLAUDE.md** — project rules, skill routing, bug fix protocol
2. **config.yaml** — project configuration (git, VPS, modules, YouGile, Docmost, deploy)

**Even if CLAUDE.md needs no changes, config.yaml must still be checked/created.**

### Step 1: GATHER INFO

#### For a new project (interactive)

Ask the user:

1. **Project name** — if not provided in the command
2. **Tech stack** — frontend/backend/fullstack, main frameworks
3. **Brief description** — 1-2 sentences about the project

#### For an existing project (--from)

1. Read existing CLAUDE.md (if present) — **do not overwrite, augment**
2. Detect stack from manifest files (ordered probe; record only what is actually found):

   | Ecosystem | Manifest files |
   |-----------|---------------|
   | Node.js | `package.json` (+ `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` for the package manager) |
   | Python | `pyproject.toml`, `requirements.txt`, `Pipfile` |
   | Go | `go.mod` |
   | Rust | `Cargo.toml` |
   | JVM | `pom.xml`, `build.gradle(.kts)` |
   | .NET | `*.csproj`, `*.sln` |
   | PHP | `composer.json` |
   | Ruby | `Gemfile` |

   If detection is ambiguous or finds nothing → ASK the user. **Never fill `{{TECH_STACK}}` or `modules.*.stack` from a built-in default** — NaCl does not prescribe a technology stack.
3. Detect structure:
   - Does docs/ exist? → SA artifacts created
   - Does .tl/ exist? → TL workflow configured
   - Are there BA artifacts? → BA analysis done
4. Detect conventions from code: TypeScript/JavaScript, test framework, linter

---

### Step 1.5: AUTO-MIGRATE LEGACY ARTEFACTS

**This step runs every time `/nacl:init` is invoked** — including on a fresh project, where it will find nothing to do and produce no output. It must complete before Step 2 (CLAUDE.md) and before any `docker compose up`.

The goal is to silently bring the project's `graph-infra/` directory and `config.yaml` into the current NaCl standard. The analyst never sees underlying shell commands — only a single summary line if any migration was performed.

#### How to run this step

Read the current state first, then act only where the conditions below are true. All checks are idempotent: if the condition is already false (artefact already absent, field already present, directory already exists), skip that action.

---

#### Migration check A — legacy `excalidraw` container and service

Read `graph-infra/docker-compose.yml` (if it exists):

```bash
# Does the excalidraw service block exist?
grep -q "^  excalidraw:" graph-infra/docker-compose.yml 2>/dev/null
```

If the service is present:

1. Determine the container name. The container name follows the `${CONTAINER_PREFIX}-excalidraw` pattern. Read it from `graph-infra/.env`:
   ```bash
   CONTAINER_PREFIX=$(grep '^CONTAINER_PREFIX=' graph-infra/.env 2>/dev/null | cut -d= -f2)
   EXCALIDRAW_CONTAINER="${CONTAINER_PREFIX}-excalidraw"
   ```
   If `.env` is unreadable or `CONTAINER_PREFIX` is empty, fall back to reading the `container_name:` line from inside the `excalidraw:` service block.

2. Stop and remove the container only if it exists:
   ```bash
   if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$EXCALIDRAW_CONTAINER"; then
     docker stop "$EXCALIDRAW_CONTAINER"
     docker rm "$EXCALIDRAW_CONTAINER"
   fi
   ```

3. Remove the `excalidraw:` service block from `graph-infra/docker-compose.yml`. The block runs from the `  excalidraw:` line to the last line before the next top-level service key or end of the `services:` map. Use a Python one-liner to remove it precisely without touching the rest of the file:
   ```bash
   python3 - graph-infra/docker-compose.yml <<'EOF'
   import sys, re
   path = sys.argv[1]
   text = open(path).read()
   # Remove the excalidraw service block (indented under services:)
   text = re.sub(r'\n  excalidraw:\n(?:    [^\n]*\n)*', '\n', text)
   open(path, 'w').write(text)
   EOF
   ```

Record: `excalidraw container stopped/removed, service block removed`.

---

#### Migration check B — legacy `excalidraw-room` container and service

Repeat the same three sub-steps as check A, substituting `excalidraw-room` for `excalidraw`:

```bash
grep -q "^  excalidraw-room:" graph-infra/docker-compose.yml 2>/dev/null
```

Container name pattern: `${CONTAINER_PREFIX}-excalidraw-room`.

The Python removal pattern:
```bash
text = re.sub(r'\n  excalidraw-room:\n(?:    [^\n]*\n)*', '\n', text)
```

Record: `excalidraw-room container stopped/removed, service block removed`.

---

#### Migration check C — legacy env vars in `graph-infra/.env`

```bash
grep -qE '^(EXCALIDRAW_PORT|EXCALIDRAW_ROOM_PORT)=' graph-infra/.env 2>/dev/null
```

If either line exists, remove them:
```bash
python3 - graph-infra/.env <<'EOF'
import sys, re
path = sys.argv[1]
lines = open(path).readlines()
lines = [l for l in lines if not re.match(r'^EXCALIDRAW_(ROOM_)?PORT=', l)]
open(path, 'w').writelines(lines)
EOF
```

Do the same for `graph-infra/.env.example` if it exists.

Record: `EXCALIDRAW_PORT / EXCALIDRAW_ROOM_PORT removed from .env`.

---

#### Migration check D — missing `graph-infra/boards/` directory

```bash
[ ! -d graph-infra/boards ]
```

If the directory is absent:
```bash
mkdir -p graph-infra/boards
```

Record: `graph-infra/boards/ created`.

---

#### Migration check E — missing `project.id` in `config.yaml`

```bash
# Does config.yaml exist and lack a project.id field?
[ -f config.yaml ] && ! grep -q '^\s*id:' config.yaml 2>/dev/null
```

If true, compute the project id: take the project name argument (or the current directory basename if no argument was given), lowercase it, replace spaces with hyphens, strip characters not matching `[a-z0-9_-]`, truncate to 64 characters.

Inject `id:` as the first key inside the `project:` block, immediately after the `project:` line, preserving all other content and comments:
```bash
python3 - config.yaml "$PROJECT_ID" <<'EOF'
import sys, re
path, project_id = sys.argv[1], sys.argv[2]
text = open(path).read()
# Insert id: as first key under project: block
text = re.sub(r'(^project:\s*\n)', r'\1  id: "' + project_id + r'"\n', text, count=1, flags=re.MULTILINE)
open(path, 'w').write(text)
EOF
```

Record: `project.id="<id>" added to config.yaml`.

---

#### Migration check F — missing `project.name` in `config.yaml`

```bash
[ -f config.yaml ] && ! grep -q '^\s*name:' config.yaml 2>/dev/null
```

If true, inject `name:` under the `project:` block (after `id:` if it was just added, otherwise as the first key):
```bash
python3 - config.yaml "$PROJECT_NAME" <<'EOF'
import sys, re
path, project_name = sys.argv[1], sys.argv[2]
text = open(path).read()
text = re.sub(r'(^project:\s*\n(?:  id:[^\n]*\n)?)', r'\1  name: "' + project_name + r'"\n', text, count=1, flags=re.MULTILINE)
open(path, 'w').write(text)
EOF
```

Record: `project.name="<name>" added to config.yaml`.

---

#### Migration check G — missing `intake:` scoring block in `config.yaml`

```bash
# Does config.yaml exist and lack the intake: section?
[ -f config.yaml ] && ! grep -q '^intake:' config.yaml 2>/dev/null
```

If true, append the intake self-diagnosis scoring block with the built-in
defaults (used by `nacl-tl-intake` Step 2a.5 PROBE; semantics:
`${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/intake-scoring.md`). Append at the end of the file,
preserving all existing content and comments:

```bash
python3 - config.yaml <<'EOF'
import sys
path = sys.argv[1]
text = open(path).read()
block = """
# Intake self-diagnosis scoring
# Used by: nacl-tl-intake Step 2a.5 PROBE (hypothesis verification before any
# routing question) and /nacl-goal intake. Tune per project; when a key is
# absent, skills use the built-in defaults.
# Semantics, rubric and tuning guidance: ${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/intake-scoring.md
intake:
  route_threshold: 0.7        # score >= this -> auto-route on the leading hypothesis
  high_confidence: 0.9        # score >= this -> HIGH confidence (no tracked alternative)
  scores:                     # rubric row values (verdict pattern -> score)
    leader_confirmed_all_refuted: 0.95
    leader_confirmed_some_inconclusive: 0.8
    leader_indirect_all_refuted: 0.75
    leader_indirect_inconclusive: 0.55
    contradictory: 0.4
    all_inconclusive: 0.2
"""
if not text.endswith("\n"):
    text += "\n"
open(path, 'w').write(text + block)
EOF
```

This check is **add-only**: it never runs when an `intake:` section already
exists, so user-tuned values are never overwritten (same rule as Step 2b
"fill empty fields only").

Record: `intake scoring defaults added to config.yaml`.

---

#### Migration summary output

After all checks have run:

- If **nothing was migrated** (all conditions were false): produce no output. Continue silently.
- If **any migration was performed**: print exactly one line:

  ```
  Migrated existing project: <comma-separated list of what changed>.
  ```

  Example:
  ```
  Migrated existing project: removed legacy excalidraw services (2 containers stopped), created graph-infra/boards/, added project.id="my-project" to config.yaml.
  ```

  Use generic placeholders in the skill text (`<container-prefix>`, `<project.id>`). In actual execution, substitute real values.

This single line is the **only migration output** the analyst sees. Do not print the underlying commands, container IDs, or intermediate steps.

---

### Step 2: CREATE CLAUDE.md

Use the template from `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/templates/claude-md-template.md` as the base.

Fill placeholders:
- `{{PROJECT_NAME}}` → project name
- `{{TECH_STACK}}` → detected stack
- `{{PROJECT_DESCRIPTION}}` → description
- `{{ARCHITECTURE_SECTION}}` → leave placeholder or fill from detected conventions
- `{{DEPLOYMENT_SECTION}}` → leave placeholder or fill from deploy/ / Dockerfile

#### For --from (retroactive mode):

1. If CLAUDE.md exists:
   - Read it
   - Identify which mandatory sections are MISSING
   - Check for **section overlap**: if the project already covers a topic under a different heading (e.g., "Деплой и миграции" covers Deployment), do NOT duplicate — skip that section
   - Add only genuinely MISSING sections, **in English**
   - Do NOT remove or modify existing sections

2. If CLAUDE.md does not exist:
   - Create full file from template, in English
   - Fill from detected conventions

**For --dry-run:** Show what sections would be added, do not write.

**IMPORTANT: Do NOT stop here. Proceed to Step 2b regardless of CLAUDE.md result.**

### Step 2b: CREATE or VERIFY config.yaml (MANDATORY — always runs)

**Always check:** Does `config.yaml` already exist at project root?

```
IF config.yaml EXISTS:
  → Read it
  → Check for empty/placeholder values that can be filled from detected sources
  → Report: "config.yaml exists, N fields populated, M fields still empty"
  → Do NOT overwrite — only fill empty fields if data can be detected

IF config.yaml DOES NOT EXIST:
  → Create from template ${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/templates/config-yaml-template.yaml
  → Auto-detect and fill what's possible (see below)
  → Report: "config.yaml created with N fields auto-detected"
```

**This step runs independently from Step 2 (CLAUDE.md).** Even if CLAUDE.md needs no changes, config.yaml may still need to be created.

**Auto-detection sources (for --from mode):**

| Data | Where to look |
|------|--------------|
| Project name & stack | CLAUDE.md, package.json |
| Module paths | Subdirectories with package.json (frontend/, backend/, etc.) |
| Build/test commands | package.json → scripts.build, scripts.test in each module |
| Git strategy | Branch history: if `feature/*` branches exist → `"feature-branch"`, else → `"direct"` |
| Git main branch | `git symbolic-ref refs/remotes/origin/HEAD` or default `"main"` |
| Git branch prefix | Default `"feature/"` |
| VPS IPs & SSH | docs/DEPLOY.md, `.github/workflows/*.yml` (look for DEPLOY_HOST, SSH references) |
| CI/CD platform | Detect: `.github/workflows/` exists → "github-actions"; otherwise → leave empty |
| Deploy method | ci_platform value from above |
| Deploy URLs | docs/DEPLOY.md, `.github/workflows/` (look for domain names, URLs) |
| Health endpoint | grep for "/health" or "/api/health" in backend routes |
| Docmost space IDs | docs/.docmost-sync.json → spaceId, rootPageId |
| Docmost API URL | .mcp.json or env vars |
| YouGile config | .mcp.json → yougile server env |
| Ports | package.json scripts, .env.example, docker-compose*.yml |
| Credentials | .env.example (field names only, not values — leave empty with comment) |
| PM2 config | deploy/ecosystem.config.* files |

**Interactive mode:** Ask the user for anything that couldn't be auto-detected.

**Fill what can be detected, leave placeholders for the rest.** Every empty field should have a comment explaining what it needs.

#### YouGile Board Setup

**First check:** Is YouGile already configured?
```
IF config.yaml EXISTS AND yougile.board_id is NOT empty:
  → Report: "YouGile already configured (board: [id]). Skipping setup."
  → Skip to Step 3.

IF config.yaml EXISTS AND yougile section is empty/missing:
  → Ask: "Do you want to set up YouGile task tracking?"

IF config.yaml was just created (new):
  → Ask: "Do you want to set up YouGile task tracking?"
```

If no → leave yougile section empty in config.yaml. Skip to Step 3.

If yes → follow this sequence:

**Step A: Get API key**

Check if YouGile MCP is already configured globally:
```bash
grep -r "YOUGILE_API_KEY" ~/.claude.json 2>/dev/null
```
If found → extract the key. If not → ask the user:
```
"Provide your YouGile API key (Settings → API in YouGile):"
```

**Step B: List projects — let user pick**

Run:
```bash
curl -s -H "Authorization: Bearer $YOUGILE_API_KEY" \
  https://yougile.com/api-v2/projects | \
  python3 -c "import sys,json; [print(f'{p[\"id\"]}  {p[\"title\"]}') for p in json.loads(sys.stdin.read()).get('content',[])]"
```

Present the list to user:
```
Your YouGile projects:
  1. f775a373-...  Project Alpha
  2. a1b2c3d4-...  Project Beta

Which project? (number or ID)
If the project doesn't exist yet:
  → Go to YouGile, create a new project, then tell me.
```

The user either picks an existing project or creates one in YouGile and comes back with the ID.

**Step C: Run setup script**

```bash
YOUGILE_API_KEY="$KEY" \
node "$(cd -P "$HOME/.claude/skills/yougile-setup" 2>/dev/null && pwd)/dist/index.js" \
  --project-name "$PROJECT_NAME" \
  --project-id "$PROJECT_ID" \
  --modules "$MODULES" \
  --config-path ./config.yaml
```

**Step D: Present result**

Parse JSON output. Report:
- Board created: name + ID
- 9 columns created with IDs
- 3 stickers created (Type, Module, Source)
- config.yaml updated with all IDs

If any errors → show them, suggest manual fix.

---

### Step 2c: GRAPH INFRASTRUCTURE (optional)

**Goal:** Set up the project's Neo4j graph for BA/SA skills — either a LOCAL per-project Docker
container (default), or a connection to a SHARED graph on a VPS (multi-user). This step is an
**orchestrator**: it resolves the mode with a tool and dispatches to the matching tool, then reads
a deterministic `NACL_GRAPH_RESULT:` gate. It does not improvise graph logic in prose.

```
Ask: "Will this project use a Neo4j graph for BA/SA specifications? (nacl-ba-*, nacl-sa-* skills)"
If no → skip to Step 3.
If yes → continue with 2c.-1 (worktree guard), then 2c.0.
```

#### 2c.-1 Worktree guard (HALT)

Claude Code Desktop parallel sessions run in linked git worktrees. Graph
infrastructure must be initialized from the MAIN checkout only — a second init
from a worktree would allocate new ports and a duplicate container for the
same project. Check first:

```bash
TOP=$(git rev-parse --show-toplevel 2>/dev/null)
COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
if [ -n "$TOP" ] && [ "$COMMON" != "$TOP/.git" ]; then echo WORKTREE; else echo MAIN; fi
```

If it prints `WORKTREE` → HALT Step 2c with:

> This session runs in a linked git worktree (`{worktree path}`), but the main
> checkout is `{dirname of common dir}`. Run /nacl:init from the main checkout
> (open a session on the project root, not a parallel-session worktree). If the
> graph is already initialized there, this project needs no init — new sessions
> pick it up automatically.

#### 2c.0 Resolve the graph mode (local | create | connect)

Run the resolver (it reads any `--scale` flag plus a committed `graph.mode` in config.yaml):

```bash
REPO_ROOT="${CLAUDE_PLUGIN_ROOT}"
node "$REPO_ROOT/nacl-tl-core/scripts/resolve-graph-mode.mjs" --project-root "$(pwd)" ${SCALE:+--scale "$SCALE"}
# → NACL_GRAPH_MODE: mode=local|create|connect reason="…"
```

Dispatch on `mode`:
- **`local`** → today's flow: 2c.1 (detect ports) → 2c.2 (write config) → 2c.3 (run `setup-graph`) → 2c.4 (gate).
- **`create`** → a fresh SHARED project: skip 2c.1; gather the remote endpoint (host, gateway port,
  sidecar port, project_scope) and run `create-remote` (2c-remote below). The VPS must already be
  provisioned (`graph-infra/vps/provision-vps.sh`).
- **`connect`** → JOIN an existing shared project: skip 2c.1–2c.3 entirely; run `connect-remote`
  (2c-remote below). **No Docker, no schema, no graph writes.** A teammate who cloned a repo whose
  committed `config.yaml` has `graph.mode: remote` lands here automatically — they must NOT re-init.

For `create`/`connect`, ensure the developer's mTLS tunnel is up first (one-time per machine):
`${CLAUDE_PLUGIN_ROOT}/graph-infra/scripts/install-sidecar.sh --project-scope <scope> --host <host> --gateway-port <gp> --sidecar-port <sp> --cert … --key … --cacert … --start`. The `--uri` passed below is the LOCAL
sidecar socket (e.g. `bolt://localhost:3700`); skills/.mcp.json stay on localhost.

#### 2c-remote: connect / create dispatch (deterministic tools)

```bash
# connect (join existing) — read-only verify gate; FAILS LOUD if the project marker is absent
sh "$REPO_ROOT/nacl-tl-core/scripts/connect-remote.sh" \
  --project-root "$(pwd)" --skills-dir "$REPO_ROOT" \
  --uri "bolt://localhost:$SIDECAR_PORT" --project-scope "$SCOPE" \
  --id "$PROJECT_ID" --name "$PROJECT_NAME" \
  --host "$GRAPH_HOST" --gateway-port "$GATEWAY_PORT" --sidecar-port "$SIDECAR_PORT" \
  --client-cert "$CLIENT_CERT" --client-key "$CLIENT_KEY" --ca-cert "$CA_CERT" \
  --tls true --secret-source env:NEO4J_PASSWORD
# → NACL_GRAPH_RESULT: status=CONNECTED|FAILED  (project_exists guard inside)

# create (provision a new shared project) — idempotent (:Project) marker seed
sh "$REPO_ROOT/nacl-tl-core/scripts/create-remote.sh" \
  --project-root "$(pwd)" --skills-dir "$REPO_ROOT" \
  --uri "bolt://localhost:$SIDECAR_PORT" --project-scope "$SCOPE" \
  --id "$PROJECT_ID" --name "$PROJECT_NAME" --developer-id "$NACL_DEVELOPER_ID" \
  --host "$GRAPH_HOST" --gateway-port "$GATEWAY_PORT" --sidecar-port "$SIDECAR_PORT" \
  --client-cert "$CLIENT_CERT" --client-key "$CLIENT_KEY" --ca-cert "$CA_CERT" \
  --tls true --secret-source env:NEO4J_PASSWORD
# → NACL_GRAPH_RESULT: status=READY|FAILED
```

Windows: call `connect-remote.ps1` / `create-remote.ps1` with the matching `-ProjectRoot`,
`-SkillsDir`, `-Uri`, `-ProjectScope`, `-Id`, `-Name`, `-Host`, `-GatewayPort`,
`-SidecarPort`, `-ClientCert`, `-ClientKey`, `-CaCert`, `-Tls` and `-SecretSource`
parameters (see Step 2c.3 for the PS dispatch shape). Both tools write `.mcp.json` + the
complete `config.yaml` `graph.remote` route and register the project — so
on `CONNECTED`/`READY`, skip the rest of 2c and go to Step 3. On `FAILED`, fail loud with the
`failed_check` (e.g. `project-missing` → tell the user to run `--scale=create` first).

#### 2c.1 Auto-detect available ports  *(local mode only)*

Scan the port bindings of ALL Docker containers — running AND stopped. Stopped
containers keep their configured bindings and re-claim them on `docker start`,
so a scan of running containers alone hands the new project a latent collision
(this happened live: a fresh project got the bolt/http block of a stopped
project's container). Use the deterministic scanner — it inspects every
container and suggests the first ladder rung where BOTH ports are free:

```bash
node "$REPO_ROOT/nacl-core/scripts/graph-doctor.mjs" --scan-ports
# → NACL_GRAPH_PORTS: bolt=<csv of taken bolt ports> http=<csv of taken http ports>
# → NACL_GRAPH_PORTS_SUGGEST: bolt=<port> http=<port>
```

(Windows: same command — the scanner is Node, no grep needed.)

Use the `NACL_GRAPH_PORTS_SUGGEST` pair as the proposal. Present to user:
```
Proposed graph ports (auto-detected free range, stopped containers included):
  Neo4j Bolt:       {bolt_port}
  Neo4j Browser:    {http_port}

Accept these ports? (yes / enter custom)
```

#### 2c.2 Write graph section to config.yaml

Add to the existing config.yaml:
```yaml
graph:
  neo4j_bolt_port: {bolt_port}
  neo4j_http_port: {http_port}
  neo4j_password: "neo4j_graph_dev"
  container_prefix: "{project_name_slug}"
  boards_dir: "graph-infra/boards"
```

Where `{project_name_slug}` is the project name lowercased, spaces→hyphens, special chars removed.

#### 2c.3 Run the graph setup (cross-platform, deterministic)

> **Do NOT hand-roll this in shell.** Initialization happens on Windows, macOS, and
> Linux. The whole of "copy infra → resolve the MCP binary → write `.env`/`.mcp.json`
> → start Docker → load schema → verify" is performed by a single committed, tested
> script **per OS**. Improvising bash here is what previously broke native Windows:
> the npm `neo4j-mcp` launcher downloads-on-start (> the 30 s MCP connect timeout) and
> prints a banner to STDOUT that corrupts the stdio JSON-RPC stream; `cp` fell through
> to a Write that added a UTF-8 BOM `cypher-shell` rejects; and a half-run could look
> complete. The scripts remove all of that.

**What each script guarantees (so you know what "done" means):**
- Copies `graph-docker-compose.yml` + `schema/*.cypher` + `queries/*.cypher` into
  `graph-infra/` **byte-for-byte** (the committed `.cypher` files have no BOM — never
  re-serialize them).
- Resolves the **official** `neo4j-mcp` binary to a stable path
  (`~/.neo4j-mcp-bin/neo4j-mcp[.exe]`) via a direct GitHub release download + native
  extract (`Expand-Archive` / `tar`), then writes `.mcp.json` pointing **directly at that
  binary** — no npm launcher, so no download-on-start and no STDOUT banner. Sets
  `NEO4J_TELEMETRY=false`. Merges into any existing `.mcp.json` without clobbering other
  servers.
- Writes `.env` / `.env.example` / `.mcp.json` as **UTF-8 without BOM**. (`.env` carries
  `COMPOSE_PROJECT_NAME={prefix}-graph` so each project's stack is uniquely named —
  otherwise `docker compose --remove-orphans` in one project would cull another's
  containers and volumes.)
- `docker compose up`, waits for the container to report **healthy**, loads the schema
  via `docker cp` + `cypher-shell --file` (no stdin `<` redirect — PowerShell 5.1 lacks it).
- Runs the hard verification gate (2c.4) and prints a `NACL_GRAPH_RESULT:` line.

First resolve the skills repo root, then dispatch to the matching script.

macOS / Linux / WSL2 (bash):
```bash
REPO_ROOT="${CLAUDE_PLUGIN_ROOT}"
sh "$REPO_ROOT/nacl-tl-core/scripts/setup-graph.sh" \
  --project-root "$(pwd)" --skills-dir "$REPO_ROOT" \
  --prefix "{project_name_slug}" \
  --bolt-port {bolt_port} --http-port {http_port} \
  --password "{neo4j_password}"
```

Native Windows (PowerShell):
```powershell
# nacl-init is a symlink/junction into the repo; resolve its physical parent = repo root.
$RepoRoot = "${CLAUDE_PLUGIN_ROOT}"
& powershell -ExecutionPolicy Bypass -File "$RepoRoot\nacl-tl-core\scripts\setup-graph.ps1" `
  -ProjectRoot (Get-Location).Path -SkillsDir $RepoRoot `
  -Prefix "{project_name_slug}" `
  -BoltPort {bolt_port} -HttpPort {http_port} `
  -Password "{neo4j_password}"
```

#### 2c.4 Read the result and report (HARD GATE — no soft fallback)

The script ends with a machine-parseable block; read the `status=` field:
```
NACL_GRAPH_RESULT: status=READY|FAILED
  binary=<path> health=<status> constraints_expected=<n> constraints_actual=<n> handshake=ok|fail failed_check=<name|none>
```

`status=READY` is emitted ONLY when **all three** gate checks passed:
1. container health == `healthy`,
2. `SHOW CONSTRAINTS` count == the count computed dynamically from the loaded schema
   files (do not hardcode — it changes as the schema evolves),
3. a one-shot `initialize` + `tools/list` JSON-RPC handshake against the resolved binary
   returned a valid response.

**If `status=READY`** → print the success report:
```
## Graph Infrastructure Ready

Neo4j Browser: http://localhost:{http_port}
  (login: bolt://localhost:{bolt_port}, neo4j / {password})
Container:     {container_prefix}-neo4j
MCP binary:    {binary path from result}

Docker:    healthy ✓
Schema:    loaded ✓ ({constraints_actual}/{constraints_expected} constraints)
Handshake: ok ✓

### MCP config:
  .mcp.json created (points directly at the official neo4j-mcp binary)
  ⚠ MCP servers are picked up ONLY at session start (verified live: no
    hot-reload; `/mcp reconnect` does not see NEW .mcp.json entries, and
    Desktop's /mcp opens the connector directory, not a status panel).
  → Start a NEW session for this project (Desktop and CLI alike; the graph
    container keeps running — nothing is lost).
  → In the new session verify with one call:
    mcp__neo4j__read-cypher "RETURN 1"  → must return 1.

### Next:
  /nacl:ba-from-board new {project_name}
```

**If `status=FAILED` (or the script exits non-zero)** → DO NOT print "Ready". Fail loud,
naming `failed_check` and the remediation. Do not invent a "looks done" summary.
```
## Graph Infrastructure FAILED — not usable yet

Failed check: {failed_check}
  resolve-binary    → no network / GitHub unreachable, or unsupported OS/arch.
                      Check connectivity; the binary installs to ~/.neo4j-mcp-bin/.
                      Fallback: download the release asset in a browser and extract
                      it to ~/.neo4j-mcp-bin/neo4j-mcp (the error names the exact URL).
  docker-cli-missing → docker binary not found on PATH or in standard locations.
                      Install Docker Desktop: https://www.docker.com/products/docker-desktop/
                      (Claude Code Desktop on macOS reads PATH from your shell profile;
                      if docker works in a terminal but not here, restart the Desktop app
                      or add the path in Settings → environment editor.)
  docker-daemon-down → docker CLI found, but the daemon is not running and could not
                      be auto-started. Open the Docker Desktop application, wait for
                      the whale icon to settle, then re-run /nacl:init.
  docker-up         → the bolt/http port is taken. Pick new ports.
  container-health  → container never became healthy. `docker logs {container_prefix}-neo4j`.
  schema-copy       → `docker cp` failed; container not running.
  constraints-count → schema did not fully load (got {constraints_actual} of {constraints_expected}).
                      `docker logs {container_prefix}-neo4j`; re-run after fixing.
  handshake         → binary could not speak MCP/connect to bolt. Verify NEO4J_* env and port.

Re-run /nacl:init (graph step is idempotent) after addressing the cause.
```

---

### Step 2d: REGISTER PROJECT IN ANALYST-TOOL REGISTRY

**Goal:** Write an entry for this project into `~/.nacl/projects.json` so the NaCl Analyst Tool's project picker can discover it immediately. This step runs unconditionally — even if the analyst-tool is not yet installed. The registry write is cheap and idempotent: installing the tool later will find the entry already in place.

**Prerequisite:** Step 1.5 (auto-migration) must have completed first. The migration ensures `config.yaml` contains a valid `project.id` before this step reads it. If Step 1.5 injected a new `project.id`, this step will read that value from the now-updated file.

**Do not skip this step for `--dry-run`.** In dry-run mode, show what would be written but do not modify the file.

This step is performed by a single tested tool, `register-project.mjs`, which mirrors
`analyst-tool/server/src/services/project-registry.ts` exactly (the canonical `version: 1` shape,
2-space JSON, atomic tmp+rename, BOM-tolerant read, `createdAt` preserved on update). Do not
hand-roll the registry merge in prose — that is what this tool replaced.

#### 2d.1 Derive the project id

`project.id` is the project name lowercased with spaces replaced by hyphens and all characters not
matching `[a-z0-9_-]` removed, truncated to 64 characters (must match `/^[a-z0-9_-]{1,64}$/`). If
`config.yaml` already contains `project.id` (from Step 1.5 or a prior run), use that value; otherwise
derive it from the skill argument. Example: `"My Acme Project"` → `my-acme-project`.

#### 2d.2 Run the tool (honours `NACL_HOME`)

```bash
REPO_ROOT="${CLAUDE_PLUGIN_ROOT}"
node "$REPO_ROOT/nacl-tl-core/scripts/register-project.mjs" \
  --id "$PROJECT_ID" --name "$PROJECT_NAME" --root "$(pwd)"
# Prints: "Registered '<name>' (<id>) in <path>"  OR
#         "Updated registry entry '<id>' (root + lastUsed refreshed) in <path>"
```

For `--dry-run`, show what would be written but do not invoke the tool.

The tool aborts loudly if the registry has a `version` other than `1` (it does not silently
overwrite). **Idempotency contract:** re-running `/nacl:init` in the same directory updates `name`,
`root`, and `lastUsed`, preserves `createdAt`, and never duplicates the entry.

---

### Step 3: OUTPUT

Present to user (in their language):

1. CLAUDE.md status (created / updated / no changes needed)
2. config.yaml status (created / updated / no changes needed)
3. List of auto-detected values in config.yaml
4. List of empty fields that need manual input
5. Next step recommendations

```
═══════════════════════════════════════════════
  PROJECT INITIALIZED
═══════════════════════════════════════════════

CLAUDE.md: [created / updated / no changes needed]

config.yaml: [created / N fields auto-detected]
  Auto-detected:
    project.name: "My Project"
    project.stack: "<detected from manifest files, or user-provided>"
    modules.frontend.path: "frontend"
    modules.backend.path: "backend"
    ci_platform: "github-actions"  (or empty if no .github/workflows/ found)
    docmost.spaces.sa.space_id: "019cd479-..."  (from .docmost-sync.json)
    ...

  Intake scoring: [defaults seeded / already present (kept as-is)]
    (intake.route_threshold / intake.high_confidence / intake.scores.* —
     tunable; see ${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/intake-scoring.md)

  Needs manual input:
    yougile.*: not configured (no YouGile MCP found)
    credentials.*: not auto-detected (security)
    reports.*: not configured

Sections added to CLAUDE.md:
  + Development Workflow
  + Bug Fix Protocol (L1/L2/L3)
  + Skill Routing (26 entries)
  + Documentation Rules (5 rules)

Note: Existing sections preserved in [language].
  Recommend migrating to English for optimal AI performance.

Next steps (depending on project phase):

  Business analysis:
     /nacl:ba-full — full BA cycle (Neo4j graph)

  System design:
     /nacl:sa-full — full specification (Neo4j graph)

  Full pipeline (BA → SA → Dev):
     /nacl:tl-conductor — orchestrate everything

  Development planning:
     /nacl:tl-plan — tasks, waves, api-contracts

  Development:
     /nacl:tl-full — autonomous full lifecycle

  Diagnostics (for existing project):
     /nacl:tl-diagnose — analyze current state

═══════════════════════════════════════════════
```

If YouGile is configured, also output:

```
═══════════════════════════════════════════════
  YOUGILE SETUP INSTRUCTIONS
═══════════════════════════════════════════════

1. Create a board in YouGile for this project

2. Create these columns (in this order):
   - UserRequests  — user/client creates cards here
   - Backlog       — agent decomposes into tasks
   - InWork        — agent picks up for development
   - DevDone       — development complete
   - ReadyToTest   — ready for verification
   - Testing       — agent verifying
   - ToRelease     — verified, ready to deploy
   - Reopened      — failed verification
   - Done          — deployed to production

3. Create stickers:
   - "Type": feature, bug, task
   - "Module": match your project modules
   - "Source": user, agent

4. Copy column/sticker IDs into config.yaml
   (Use YouGile API or browser dev tools)

═══════════════════════════════════════════════
```

---

## What CLAUDE.md Contains

### Mandatory Sections (always created, in English)

1. **Project Overview** — name, stack, description
2. **Development Workflow** — full lifecycle BA → SA → TL → Dev → Fix
3. **Bug Fix Protocol** — L1/L2/L3 classification, spec-first rule
4. **Skill Routing** — "situation → skill" table
5. **Documentation Rules** — "docs = source of truth", no ad-hoc, no placeholders
6. **config.yaml** — project configuration (git, VPS, modules, YouGile, Docmost, deploy)

### Optional Sections (filled when data available)

7. **Architecture Conventions** — from detected conventions or placeholder. If the project already documents architecture decisions (ADRs, design system) under a different heading, skip this section.
8. **Deployment** — from deploy/ configuration or placeholder. If already covered, skip.

### Sections NOT Created

- docs/ skeletons — created by /nacl:sa-full
- .tl/ skeletons — created by /nacl:tl-plan
- BA artifacts — created by /nacl:ba-full
- IDE configurations — out of scope

### .gitignore Entries (ensure these exist)

When creating or updating a project, verify `.gitignore` includes:
```
.tl/reports/
.tl/qa-screenshots/

# /nacl-goal intake wrapper run state and PII (2.10.1+)
# request.json contains user email, free-text goal, image refs, project path.
# Wrapper-authored exception YAMLs live under .tl/exceptions/goal-runs/.
# See nacl-goal/run-artifacts.md §Privacy.
.tl/goal-runs/
.tl/exceptions/goal-runs/
```

The first two are generated artifacts (HTML reports, screenshots) that should not be in the repository.

The last two are added in 2.10.1+ to protect PII written by `/nacl-goal intake`. The wrapper's privacy precheck (Flow step 0) refuses with `PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED` if these paths are missing from `.gitignore`. If a project intends to use `/nacl-goal intake` for autonomous goal runs, both lines are mandatory.

For an existing project that hasn't adopted them yet: the user will see the `PLAN_BLOCKED_*` refusal at the next `/nacl-goal intake` invocation and must add the lines manually. The 2.10.1 wrapper does NOT auto-patch `.gitignore`.

---

## References

- `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/templates/claude-md-template.md` — CLAUDE.md template
- `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/fix-classification-rules.md` — L1/L2/L3 rules
- `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/templates/config-yaml-template.yaml` — config.yaml template
- `analyst-tool/server/src/services/project-registry.ts` — canonical `ProjectRecord` / `ProjectRegistry` types and atomic-write behaviour

---
name: project-init
description: |
  Initialize a new project with CLAUDE.md containing development rules,
  skill routing, bug fix protocol, and documentation discipline.
  Use when: new project, initialize project, setup project,
  create CLAUDE.md, or the user says "/project-init".
---

# Project Initialization Skill

## Your Role

You are a **project setup specialist**. You create the foundational CLAUDE.md file that ensures every AI session follows the correct workflow: spec-first bug fixing, documentation discipline, and proper skill routing.

You create CLAUDE.md and config.yaml. Directory structures (docs/, .tl/) are created by their respective skills (sa-full, ba-full, tl-plan) when invoked.

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
/project-init "My Project Name"         # new project (interactive)
/project-init --from=.                  # retroactive for existing project
/project-init --dry-run                 # show what would be added, no changes
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
2. Detect stack: package.json, requirements.txt, go.mod, etc.
3. Detect structure:
   - Does docs/ exist? → SA artifacts created
   - Does .tl/ exist? → TL workflow configured
   - Are there BA artifacts? → BA analysis done
4. Detect conventions from code: TypeScript/JavaScript, test framework, linter

---

### Step 2: CREATE CLAUDE.md

Use the template from `tl-core/templates/claude-md-template.md` as the base.

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
  → Create from template tl-core/templates/config-yaml-template.yaml
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
  1. f775a373-...  Электрозарядки
  2. a1b2c3d4-...  Family Cinema

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

**Goal:** Set up per-project Neo4j + Excalidraw infrastructure for graph-based BA/SA skills.

```
Ask: "Will this project use Neo4j graph for BA/SA specifications? (graph_ba_*, graph_sa_* skills)"
If no → skip to Step 3.
If yes → execute steps below.
```

#### 2c.1 Auto-detect available ports

Scan for running Docker containers to find used Neo4j ports:
```bash
docker ps --format '{{.Ports}}' 2>/dev/null | grep -oE '[0-9]+->7687' | grep -oE '^[0-9]+'
```

Find the highest Bolt port in use (default baseline: 3587). Propose the next block with +10 offset:
- If 3587 is in use → propose 3597
- If 3597 is in use → propose 3607
- Port block: bolt=N, http=N-13, excalidraw=N-7, room=N-6

Present to user:
```
Proposed graph ports (auto-detected free range):
  Neo4j Bolt:       {bolt_port}
  Neo4j Browser:    {http_port}
  Excalidraw:       {excalidraw_port}
  Excalidraw Room:  {room_port}

Accept these ports? (yes / enter custom)
```

#### 2c.2 Write graph section to config.yaml

Add to the existing config.yaml:
```yaml
graph:
  neo4j_bolt_port: {bolt_port}
  neo4j_http_port: {http_port}
  neo4j_password: "neo4j_graph_dev"
  excalidraw_port: {excalidraw_port}
  excalidraw_room_port: {room_port}
  container_prefix: "{project_name_slug}"
  boards_dir: "graph-infra/boards"
```

Where `{project_name_slug}` is the project name lowercased, spaces→hyphens, special chars removed.

#### 2c.3 Copy graph infrastructure files

Copy from claude-skills templates to the target project:

```bash
# Resolve skills repo root (cross-platform: macOS, Linux, WSL2)
SKILLS_DIR="$(cd -P "$HOME/.claude/skills/project-init" 2>/dev/null && cd .. && pwd)"

# Create directories
mkdir -p graph-infra/schema graph-infra/queries graph-infra/boards

# Docker Compose template
cp "$SKILLS_DIR/tl-core/templates/graph-docker-compose.yml" graph-infra/docker-compose.yml

# Schema files
cp "$SKILLS_DIR/graph-infra/schema/ba-schema.cypher" graph-infra/schema/
cp "$SKILLS_DIR/graph-infra/schema/sa-schema.cypher" graph-infra/schema/
cp "$SKILLS_DIR/graph-infra/schema/tl-schema.cypher" graph-infra/schema/

# Query library
cp "$SKILLS_DIR/graph-infra/queries/"*.cypher graph-infra/queries/
```

#### 2c.4 Generate .env from config.yaml

Write `graph-infra/.env`:
```
CONTAINER_PREFIX={container_prefix}
NEO4J_PASSWORD={neo4j_password}
NEO4J_HTTP_PORT={neo4j_http_port}
NEO4J_BOLT_PORT={neo4j_bolt_port}
EXCALIDRAW_PORT={excalidraw_port}
EXCALIDRAW_ROOM_PORT={excalidraw_room_port}
```

Also create `graph-infra/.env.example` with same content.

#### 2c.5 Generate .mcp.json

Write `.mcp.json` at project root:
```json
{
  "mcpServers": {
    "neo4j": {
      "type": "stdio",
      "command": "neo4j-mcp",
      "args": [],
      "env": {
        "NEO4J_URI": "bolt://localhost:{neo4j_bolt_port}",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "{neo4j_password}",
        "NEO4J_DATABASE": "neo4j"
      }
    }
  }
}
```

If `.mcp.json` already exists (other MCP servers configured), merge the `neo4j` entry into the existing `mcpServers` object.

#### 2c.6 Start Docker and load schema automatically

```bash
# Start the Docker stack
docker compose -f graph-infra/docker-compose.yml up -d
```

Wait for Neo4j to be healthy (healthcheck: 10s interval, 30s start period):
```bash
# Wait for Neo4j to accept connections (max 60 seconds)
for i in $(seq 1 12); do
  docker exec {container_prefix}-neo4j cypher-shell -u neo4j -p {neo4j_password} "RETURN 1" 2>/dev/null && break
  sleep 5
done
```

Then load all three schema files automatically via `docker exec`.

**Important:** Schema files contain multi-line statements (split across 2-3 lines).
Use `cypher-shell --file` to let cypher-shell handle parsing natively:

```bash
for f in graph-infra/schema/ba-schema.cypher graph-infra/schema/sa-schema.cypher graph-infra/schema/tl-schema.cypher; do
  docker exec -i {container_prefix}-neo4j cypher-shell -u neo4j -p {neo4j_password} < "$f" 2>&1 | grep -v '^$'
done
```

This pipes the entire file into cypher-shell via stdin (`-i` flag + `<` redirect).
cypher-shell handles comments, multi-line statements, and semicolons natively — no shell parsing needed.

Verify schema loaded:
```bash
docker exec {container_prefix}-neo4j cypher-shell -u neo4j -p {neo4j_password} "SHOW CONSTRAINTS" 2>/dev/null | head -5
```

If verification returns constraints → schema is loaded. If Docker or cypher-shell fails, fall back to manual instructions in the report.

#### 2c.7 Report

```
## Graph Infrastructure Ready

Neo4j Browser: http://localhost:{http_port}
  (login: bolt://localhost:{bolt_port}, neo4j / {password})
Excalidraw:    http://localhost:{excalidraw_port}
Containers:    {container_prefix}-neo4j, {container_prefix}-excalidraw

Docker:  started ✓
Schema:  loaded ✓ (ba + sa + tl)

### MCP config:
  .mcp.json created — restart Claude Code to connect to this project's Neo4j

### Next:
  /graph_ba_from_board new {project_name}
```

If schema loading failed, show fallback instructions:
```
Schema: FAILED — load manually:
  Open http://localhost:{http_port}
  Connection: bolt://localhost:{bolt_port}, neo4j / {password}
  Execute each statement from graph-infra/schema/*.cypher one at a time
```

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
    project.name: "Family Cinema"
    project.stack: "Next.js 14 + Fastify + PostgreSQL 17"
    modules.frontend.path: "frontend"
    modules.backend.path: "backend"
    ci_platform: "github-actions"  (or empty if no .github/workflows/ found)
    docmost.spaces.sa.space_id: "019cd479-..."  (from .docmost-sync.json)
    ...

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
     /graph_ba_full — full BA cycle (Neo4j graph)

  System design:
     /graph_sa_full — full specification (Neo4j graph)

  Full pipeline (BA → SA → Dev):
     /graph_tl_conductor — orchestrate everything

  Development planning:
     /graph_tl_plan — tasks, waves, api-contracts

  Development:
     /tl-full — autonomous full lifecycle

  Diagnostics (for existing project):
     /tl-diagnose — analyze current state

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

- docs/ skeletons — created by /sa-full
- .tl/ skeletons — created by /tl-plan
- BA artifacts — created by /ba-full
- IDE configurations — out of scope

### .gitignore Entries (ensure these exist)

When creating or updating a project, verify `.gitignore` includes:
```
.tl/reports/
.tl/qa-screenshots/
```
These are generated artifacts (HTML reports, screenshots) that should not be in the repository.

---

## References

- `tl-core/templates/claude-md-template.md` — CLAUDE.md template
- `tl-core/references/fix-classification-rules.md` — L1/L2/L3 rules
- `tl-core/templates/config-yaml-template.yaml` — config.yaml template

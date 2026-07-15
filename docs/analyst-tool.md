[Home](../README.md) > Analyst Tool

# NaCl Analyst Tool

A local web wrapper around Excalidraw that lists every board in `graph-infra/boards/`, shows its sync status with the Neo4j graph, and provides one-click **Regenerate**, **Sync**, and **Analyze** buttons. Sync and Analyze invoke the existing NaCl skills via the `itsalt-pinch` task runner; Regenerate renders the board locally, in-process, without spawning a skill.

---

## Why it exists

Previously an analyst opened a bare Excalidraw instance at `localhost:3580`. That interface had no file browser: boards were loaded manually via *File → Open*, there was no indication of when a diagram had last been generated from Neo4j, and there was no way to tell whether hand-drawn edits had ever been pushed back into the graph. The Analyst Tool replaces that bare UI entirely. The old `excalidraw` and `excalidraw-room` Docker services from `graph-infra/` are no longer started.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** | The server uses native `node:crypto` and ES modules |
| **`claude` CLI** | Installed and authenticated; without it the Sync / Analyze buttons cannot spawn a skill run (Regenerate renders locally and does not need it) |
| **Neo4j running** | `docker compose -f graph-infra/docker-compose.yml up -d` -- search degrades to board-only mode if Neo4j is unreachable, but skill runs still require the graph |

---

## Install and run

```bash
# From the NaCl repo root
cd analyst-tool
npm install
npm run dev
```

The browser UI is served at **http://localhost:3582**. The Fastify API backend listens on `127.0.0.1:3583`.

For a production build:

```bash
npm run build && npm start
```

---

## Multi-project setup

### Why multi-project

`itsalt-pinch` enforces hard caps on a per-machine basis: at most 3 active projects sharing the same spawn budget, at most 5 parallel `claude` processes globally, and a minimum 15-second gap between consecutive spawns. These limits apply to the **machine**, not to an individual project. Running two separate `nacl-analyst-tool` processes simultaneously — one per project — doubles the apparent concurrency and breaks the invariant. The correct pattern is one daemon per machine with a project picker in the UI.

### Per-project initialization

For each project you want to manage, open Claude Code from that project's directory and run `/nacl-init`:

```bash
cd ~/projects/my-project
claude
```

```
/nacl-init "My Project"
```

The skill creates `CLAUDE.md`, `config.yaml`, and `graph-infra/` scaffolding, and registers the project in `~/.nacl/projects.json`. Re-running `/nacl-init` on the same directory is idempotent: `createdAt` is preserved, `lastUsed` is updated.

### Daemon launch and default project

Start the daemon from any directory:

```bash
nacl-analyst-tool
```

On startup the active project is whichever project was last used (highest `lastUsed` in the registry). To switch, use the project dropdown in the application header.

**Cwd-as-project hint.** If you launch from a project's root directory and that project is already registered, it is automatically promoted to the active project (its `lastUsed` is updated). If the directory contains a `config.yaml` but the project is not yet registered, the UI shows an unregistered-project banner with a hint to run `/nacl-init`.

### Switching projects

When you select a different project from the dropdown the following happens in sequence:

1. `POST /api/v1/projects/:id/activate` writes the new `activeProjectId` to `projects.json`.
2. The server reloads its configuration: `boardsDir` and `projectId` update to point at the new project's `graph-infra/boards/` directory.
3. The fs-watcher stops watching the old boards directory and restarts on the new one.
4. A `boards.cleared` WebSocket event is broadcast so the browser sidebar empties immediately.
5. The watcher's initial scan produces `tree.changed` events that repopulate the sidebar with the new project's boards.

Open skill runs are intentionally unaffected: they keep the `projectId` they started with and stream until completion. The next click of Regenerate, Sync, or Analyze uses the newly active project.

If you switch but the sidebar still shows old boards, the `boards.cleared` event was likely missed (e.g. page was in a background tab). A browser refresh resolves it.

### The registry file

**Location:** `~/.nacl/projects.json`. Override with the `NACL_HOME` environment variable:

```bash
NACL_HOME=/custom/path nacl-analyst-tool
```

**Schema:** defined in `analyst-tool/server/src/services/project-registry.ts`. Key fields: `version` (always `1`), `activeProjectId`, and a `projects` array of `{ id, name, root, createdAt, lastUsed }`.

**Permissions:** on macOS/Linux the directory is created with `chmod 0700` and the file with `chmod 0600`. On Windows `chmod` is a no-op; the dot-folder is visible in Explorer and file ACLs are unchanged.

**Important:** the daemon never auto-registers projects. It can only update `root` and `lastUsed` for projects already in the registry. The sole writer of new entries is `/nacl-init`.

### Cross-OS notes

All paths are resolved via `os.homedir()`, so the registry is in the correct home directory on every platform. On macOS and Linux the `.nacl` folder is hidden by convention. On Windows it is visible in Explorer, and `chmod` calls are silently ignored (no security regression — rely on NTFS ACLs if needed).

### Failure modes and recovery

**"Project missing" — the registry references a root that no longer exists.**
Delete the stale entry from `~/.nacl/projects.json` manually, or run `/nacl-init` from the new location to re-register with the updated path.

**"Two `nacl-analyst-tool` processes running simultaneously."**
Pinch concurrency invariants are violated. Stop one of the processes. Cross-process pinch coordination is on the pinch roadmap for v1.1.

**"Switched project but boards sidebar still shows old boards."**
The `boards.cleared` WebSocket event was missed. Refresh the browser tab.

### Known limitations and future work

- `npm publish` for `nacl-analyst-tool` as a standalone CLI package is not yet done.
- Cross-process pinch coordination (preventing two daemons from fighting over the spawn budget) is tracked on the pinch v1.1 roadmap.
- The UI does not yet support simultaneous multi-tab switching: if two tabs are open and you switch in one, the other updates via WebSocket but may need a manual reload to show the new project's canvas state.

---

## Tour of the UI

The interface has four zones.

**Sidebar** (left column) -- a tree of every `.excalidraw` file found in the boards directory, with a sync-status icon next to each name. A global search bar at the top queries both board element text and Neo4j graph nodes. Batch-action buttons at the bottom let you Regenerate or Sync all eligible boards in one click.

**Canvas** (centre) -- the full `@excalidraw/excalidraw` component. Opening a board loads it into the canvas. A diff overlay can be toggled to highlight changes between the current scene and a saved snapshot.

**Status bar** (top of canvas) -- shows timestamps for the last Regenerate and last Sync, the current sync status icon, and the three action buttons: **Regenerate**, **Sync**, **Analyze**.

**Run panel** (bottom-right drawer) -- streams live events from the skill runner: enqueued, started, blocked (with reason and countdown), completed or failed. Each entry is labelled with the board name and run ID so concurrent runs stay distinguishable.

---

## Sync status icons

The status icon next to each board name is driven by the `<board>.meta.json` sidecar file that lives alongside the `.excalidraw` file in the boards directory.

| Icon | Meaning |
|---|---|
| 🟢 | Synced -- `lastSyncStatus` is `ok` and `contentHashAtLastSync` matches the current scene hash |
| 🟡 | Has unsynced edits -- the board has been synced before, but the current scene hash differs from `contentHashAtLastSync` |
| ⚪ | Never synced -- `contentHashAtLastSync` is `null` (the board exists but has never been pushed to the graph) |
| 🔵 | Running -- a skill run is currently active for this board |

The sidecar schema is documented in `nacl-core/SKILL.md` under "Board Meta Sidecar". The relevant fields are `lastGeneratedAt`, `lastGeneratedBy`, `lastSyncedAt`, `lastSyncStatus`, `lastSyncRunId`, and `contentHashAtLastSync`.

---

## What the buttons do

### Regenerate

Re-exports the board from the Neo4j graph by calling `renderBoard()` in-process, directly in the analyst-tool backend (`analyst-tool/server/src/render/`) -- it does not invoke the `nacl-render` skill and does not spawn `claude`. Import boards cannot be regenerated -- use Sync instead. After a successful run the server updates `lastGeneratedAt` and resets `contentHashAtLastSync` to reflect the freshly generated content.

**Enabled when:** the board is not currently running and its kind supports regeneration.

### Sync

Invokes `/nacl-ba-sync <filepath>` to push the analyst's hand-drawn edits from the Excalidraw file back into the Neo4j graph. After a successful run the server records `lastSyncedAt`, `lastSyncStatus: ok`, and the new `contentHashAtLastSync`. On failure it writes `lastSyncStatus: failed`.

**Enabled when:** the board is not currently running.

### Analyze

Invokes `/nacl-ba-analyze <filepath>` to run a validation and analysis pass against the board. This does not write back to the graph; it only produces a report in the run panel.

**Enabled when:** the board is not currently running.

---

## Pinch and the skill runner

Sync and Analyze go through `itsalt-pinch` ([github.com/ITSalt/pinch](https://github.com/ITSalt/pinch)), a programmatic Node.js wrapper around `claude -p` that enforces rate and concurrency limits. Regenerate does not use Pinch or `claude -p` at all -- it renders locally via `renderBoard()` and is not subject to the limits below. The hard caps (for Sync and Analyze) are:

- **≥ 15 s** minimum delay between consecutive `claude` spawns.
- **≥ 120 s** wave cooldown between batches.
- **Max 5** parallel `claude` processes globally.

These limits are intentional and enforced at the library level. If a run is delayed by a limit, the run panel shows `Blocked: <reason>` with a countdown to the next retry. This is expected behaviour, not a bug.

The pinch singleton is created once per server process. Do not start multiple `npm run dev` instances for the same project.

---

## Snapshot browser and diff

The **Snapshots** panel (accessible from the status bar) lists saved snapshots of the current board. Snapshots are stored as `.excalidraw` files in `graph-infra/boards/.snapshots/<board>/`. Clicking a snapshot loads it into a side-by-side diff overlay: added elements are highlighted in green, removed elements in red.

**Restore** replaces the current board file with the snapshot contents. Before overwriting, the server automatically saves a safety snapshot of the current state so you can always recover from an accidental restore.

---

## Search

The search bar in the sidebar queries two sources simultaneously:

- **Board elements** -- every `.excalidraw` file is scanned for elements whose `text`, `originalText`, `customData.nodeId`, or `customData.sourceDoc` matches the query. Scoring: exact match > prefix > substring.
- **Graph nodes** -- if Neo4j is reachable, the query is sent to the graph. If the query looks like a typed ID (`UC-123`, `BP-456`, `FR-789`, etc.) it uses `findNodesById`; otherwise `findNodesByText` searches the `name`, `title`, `label`, `description`, `id`, `nodeId`, `uc_id`, and `bp_id` fields of all nodes.

If Neo4j is unreachable the server logs the error and returns board-only results without failing.

Results from both sources are merged and ranked by score. Clicking a result opens the board and, where possible, scrolls to the matching element.

---

## Configuration and environment variables

All settings have sensible defaults. Override via environment variables or a `.env` file in `analyst-tool/server/`.

| Variable | Default | Description |
|---|---|---|
| `NACL_BOARDS_DIR` | `<repo-root>/graph-infra/boards` | Absolute path to the boards directory |
| `NACL_PROJECT_ID` | Repo directory name (lowercased) | Project ID passed to pinch for concurrency tracking |
| `NEO4J_URI` | `bolt://localhost:3587` | Neo4j Bolt connection URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `neo4j_graph_dev` | Neo4j password |
| `NACL_WORKING_WINDOW_START` | `08:00` | Earliest time of day pinch is allowed to spawn `claude` |
| `NACL_WORKING_WINDOW_END` | `23:00` | Latest time of day pinch is allowed to spawn `claude` |
| `NACL_WORKING_WINDOW_TZ` | `Europe/Moscow` | Timezone for the working window |

The repo-root is determined automatically by walking up from the process working directory until a `graph-infra/` directory is found.

---

## Troubleshooting

**`claude` not found on PATH**
The skill runner calls `claude -p` directly. If the `claude` CLI is not on your shell `PATH`, the run panel will show a spawn error. Verify with `which claude` and ensure the NaCl CLI is installed and authenticated.

**Neo4j not running -- search returns no graph results**
If the graph container is not up, board-element search still works but graph-node search is silently skipped. Start the container with `docker compose -f graph-infra/docker-compose.yml up -d` and reload the page.

**Skill runs blocked outside working hours**
Pinch enforces a working window (`NACL_WORKING_WINDOW_START` / `NACL_WORKING_WINDOW_END` / `NACL_WORKING_WINDOW_TZ`). Outside those hours, runs enter the queue and the run panel shows a `Blocked` message with a countdown. Either wait for the window to open or override the variables to widen the window.

**Port 3582 or 3583 already in use**
The web server (Vite, port 3582) and the API server (Fastify, port 3583) use fixed ports. If another process is holding either port, `npm run dev` will fail. Find and stop the conflicting process with `lsof -i :3582` or `lsof -i :3583`.

---

## Architecture

```
Browser :3582
  |
  | REST + WebSocket
  v
Fastify :3583  (127.0.0.1 only)
  |  routes/boards.ts    -- list, read, save .excalidraw
  |  routes/skills.ts    -- POST /regenerate, /sync, /analyze, /batch
  |  routes/snapshots.ts -- list, get, compare, restore
  |  routes/search.ts    -- unified board + graph search
  |  routes/runs.ts      -- run history
  |  services/pinch.ts   -- singleton Pacer + WS bridge
  |  services/meta.ts    -- read/write <board>.meta.json
  |  services/neo4j.ts   -- Neo4j driver for search
  |
  +-- FS reads/writes --> graph-infra/boards/  (*.excalidraw, *.meta.json, .snapshots/)
  |
  +-- child_process --> itsalt-pinch --> claude -p --> NaCl skill --> boards + Neo4j :3587
```

The backend listens exclusively on `127.0.0.1` -- no remote access. Skills are the single source of truth for graph writes; the tool calls them rather than duplicating their logic.

---

## Limitations

- **Single-user only.** No real-time collaboration. The `excalidraw-room` container (live co-editing) was removed in Wave 0 as out of scope for a one-analyst tool.
- **No authentication.** The server binds to loopback only; anyone with local access to the machine can use it.
- **Rate limits enforced by pinch.** See the [Pinch and the skill runner](#pinch-and-the-skill-runner) section above.
- **Board naming restrictions.** Board file names must match `[A-Za-z0-9][A-Za-z0-9_-]*` -- no spaces or special characters.

---

## Where to file bugs

Open an issue in the NaCl GitHub repository: [github.com/ITSalt/NaCl/issues](https://github.com/ITSalt/NaCl/issues).

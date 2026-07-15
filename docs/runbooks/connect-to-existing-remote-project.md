# Runbook: connect to an existing shared (remote) project

**Для кого / Audience.** A developer JOINING a project whose graph already lives on a VPS. You do
**not** initialise anything from scratch and you do **not** create local Docker infra — you attach
to the shared graph.

**Что получится / Outcome.** Your machine runs all NaCl skills against the shared graph, through a
local mTLS tunnel, with `.mcp.json` still pointing at `bolt://localhost:<port>`.

## Prerequisites

- Your personal client bundle from the graph owner: `client.crt`, `client.key`, `ca.crt` (this is
  your "API key"). Store it under `~/.nacl/certs/<project_scope>/`.
- `ghostunnel` and `node` installed. The repo cloned (its committed `config.yaml` should already
  have `graph.mode: remote` + the `graph.remote` endpoint).

## Steps

1. **Start your tunnel** (one-time per machine):

   ```sh
   sh <NaCl>/graph-infra/scripts/install-sidecar.sh \
     --project-scope acme-billing --host graph.example.com --gateway-port 7687 \
     --sidecar-port 3700 \
     --cert ~/.nacl/certs/acme-billing/client.crt \
     --key  ~/.nacl/certs/acme-billing/client.key \
     --cacert ~/.nacl/certs/acme-billing/ca.crt --start
   ```

   This exposes `bolt://localhost:3700` backed by mTLS to the VPS.

   **Autostart on reboot.** By default the installer also registers an OS-level autostart so
   the tunnel comes back up on its own after a reboot or logout — you do **not** need to
   manually relaunch it (this matters for Claude Code Desktop users, who won't re-run shell
   commands by hand):
   - macOS: a LaunchAgent `com.nacl.sidecar.<project_scope>` (`~/Library/LaunchAgents/com.nacl.sidecar.<project_scope>.plist`).
   - Windows: a Scheduled Task named `NaCl Sidecar <project_scope>` (run at logon).

   Manual relaunch (as before) is only needed if you passed `--no-autostart` / `-NoAutostart`
   to the installer.

   Check it's running:

   ```sh
   # macOS
   launchctl print gui/$UID/com.nacl.sidecar.acme-billing | grep state
   ```

   ```powershell
   # Windows
   Get-ScheduledTask -TaskName "NaCl Sidecar acme-billing"
   ```

2. **Connect** (auto-routed if the repo's `config.yaml` has `graph.mode: remote`). The command
   prefix depends on your channel — pick one, do not mix (see `plugin/README.md`, "Do not
   double-install"):
   - **CLI** (repo-side symlinked skills): `/nacl-init --scale=connect` — or just
     `/nacl-init --from .` (auto-detects remote).
   - **Claude Code Desktop plugin** (v2.24.0+): `/nacl:init --scale=connect` — or just
     `/nacl:init --from=.` (same auto-detection; the flag syntax is unchanged, only the
     `/nacl-`→`/nacl:` prefix differs).

   Under the hood this runs `connect-remote.sh`: it writes `.mcp.json` (localhost sidecar) and the
   `config.yaml` `graph` block, registers the project, and runs a READ-ONLY gate. It ends with
   `NACL_GRAPH_RESULT: status=CONNECTED|FAILED`.

3. **If FAILED with `project-missing`** — the graph has no `(:Project {id:<scope>})`. Either your
   endpoint/scope is wrong, or the project was never provisioned; the first developer must run
   `/nacl-init --scale=create` (CLI) or `/nacl:init --scale=create` (Desktop plugin) (or the owner
   runs `provision-vps.sh`). Connect never seeds a graph.

4. **Restart Claude Code** so the MCP server reconnects to the (now localhost-tunnelled) graph.

## Definition of Done

- [ ] `NACL_GRAPH_RESULT: status=CONNECTED`.
- [ ] No local Neo4j container was created (`docker ps` shows none for this project).
- [ ] `/nacl-tl-status` shows the shared graph's state (and a `claimed_by` column).
- [ ] A read query through `mcp__neo4j__read-cypher` returns data.

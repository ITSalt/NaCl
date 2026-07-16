# Runbook: connect to an existing remote project graph

**Audience.** A developer joining a project whose dedicated Neo4j 5 Community container already
runs on a reachable VPS. Do not create local Docker infrastructure and do not seed the graph again.

**Outcome.** NaCl reaches the project's container through a local mTLS sidecar. The committed route
contains no secret. Runtime secret resolution is mandatory and fails closed.

## Prerequisites

- A personal bundle from the server owner: `client.crt`, `client.key`, and `ca.crt`. Store it outside
  the repository, for example under `~/.nacl/certs/<project_scope>/`.
- `ghostunnel` and `node` installed, plus the cloned project repository.
- A committed `graph.mode: remote` route with the project's endpoint and certificate paths.
- Mandatory `graph.remote.secret_source` set to exactly one supported opaque reference:
  `env:NEO4J_PASSWORD` or `server-route:<id>`.

`env:NEO4J_PASSWORD` requires `NEO4J_PASSWORD` to exist in the environment of the runtime that
starts the secret launcher. `server-route:<id>` requires the external provider configured by
`NACL_SERVER_ROUTE_SECRET_PROVIDER`. If the selected environment variable or provider is absent,
empty, or invalid, stop and repair it; there is no raw, shared, demo, or default password fallback.

## Start the sidecar

1. Install and start the tunnel once per machine:

   ```sh
   sh <NaCl>/graph-infra/scripts/install-sidecar.sh \
     --project-scope acme-billing --host graph.example.com --gateway-port 7687 \
     --sidecar-port 3700 \
     --cert ~/.nacl/certs/acme-billing/client.crt \
     --key ~/.nacl/certs/acme-billing/client.key \
     --cacert ~/.nacl/certs/acme-billing/ca.crt --start
   ```

   This exposes `bolt://localhost:3700` and carries traffic to the project gateway over mTLS.
   The installer enables OS-level autostart unless `--no-autostart` or `-NoAutostart` is supplied.

2. Verify the sidecar:

   ```sh
   # macOS
   launchctl print gui/$UID/com.nacl.sidecar.acme-billing | grep state
   ```

   ```powershell
   # Windows
   Get-ScheduledTask -TaskName "NaCl Sidecar acme-billing"
   ```

## Persist the opaque secret route

The remote graph block must include the selected reference. For example:

```yaml
graph:
  mode: remote
  neo4j_uri: "bolt://localhost:3700"
  project_scope: "acme-billing"
  remote:
    route_mode: "connect"
    secret_source: "server-route:acme-billing"
```

The remote-route transaction writes `graph.remote.secret_source` to `config.yaml`. It writes only
the same opaque reference and launcher/route metadata to `.mcp.json`; it never serializes a raw,
shared, demo, or default Neo4j password. Do not replace the reference with a password. Both files are
read back and validated before the route reports success.

## Connect and verify

1. Run the channel-specific command without mixing installation channels:

   - CLI symlink channel: `/nacl-init --scale=connect` or `/nacl-init --from .`.
   - Claude Code Desktop plugin: `/nacl:init --scale=connect` or `/nacl:init --from=.`.
   - Codex plugin: ask the installed `nacl-init` skill to connect the current project route.

   The operation writes the remote route transaction, registers the project, and runs a read-only
   gate. It ends with `NACL_GRAPH_RESULT: status=CONNECTED|FAILED` in the legacy channels; the Codex
   path reports the corresponding verified or blocked lifecycle result.

2. If the read-only gate reports `project-missing`, verify the endpoint and project scope. The
   project's own graph may not have been initialized. The owner must run the create path for this
   project; the project marker is lifecycle/provenance data, not an authorization grant.

3. Restart the client application so its runtime receives the configured environment/provider and
   reloads `.mcp.json`.

## Definition of Done

- [ ] The sidecar is running and exposes the configured loopback Bolt port.
- [ ] `graph.remote.secret_source` is exactly `env:NEO4J_PASSWORD` or `server-route:<id>`.
- [ ] `.mcp.json` contains the opaque reference and route/launcher metadata, with no password.
- [ ] The connect result is verified and no local Neo4j container was created for this project.
- [ ] A read-only NaCl graph health/status operation returns this project's data.

# Runbook: provision a project graph on a shared VPS

**Audience.** The server owner provisioning a project's Neo4j 5 Community container on a reachable
VPS for a team in different locations. Run the provisioning step once per project. Client access is
granted once per server, not once per project.

**Outcome.** The project has its own Neo4j container, durable volumes, and mTLS gateway. A private CA
issues personal developer certificates (revocable "API keys"). The server inventory records every
project gateway and projects the same server-wide grant set into all of them.

**Non-negotiables.** Neo4j is never published directly to the host; only each project's gateway port
is public. The CA private key never leaves the VPS/admin host. Secrets are generated and never
committed. The server is the current authorization boundary: a developer granted access to this
server can access every registered project gateway on it.

## Prerequisites

- A VPS with a DNS name such as `graph.example.com`, Docker and Docker Compose, `node`, `openssl`,
  and optionally `ufw`.
- The NaCl checkout on the VPS for the provisioning scripts, templates, and schema.
- SSH access as a sudo-capable server administrator.

## Provision a project container

1. Run the provisioner on the VPS or through SSH:

   ```sh
   sh <NaCl>/graph-infra/vps/provision-vps.sh \
     --skills-dir <NaCl> --host graph.example.com \
     --project-scope acme-billing --prefix acme-billing \
     --gateway-port 7687 --first-developer alice@example.com \
     --state-dir /etc/nacl-graph
   ```

   `--host` is also the server identifier recorded by the access controller. The provisioner
   reserves this project's scope and gateway port, creates separate Neo4j storage, loads the schema,
   registers the gateway, grants the first developer at the server boundary, and reconciles all
   registered gateways. It ends with `NACL_VPS_RESULT: status=READY|FAILED`.

2. On `FAILED`, inspect `failed_check`. Install missing prerequisites for `need-docker`,
   `need-compose`, `need-node`, or `need-openssl`. For `container-health`, inspect
   `docker logs <prefix>-neo4j`. Schema loading is idempotent and may be retried. An authorization
   or gateway reconciliation failure is not partial success: affected gateways are quarantined and
   the operation remains blocked.

3. Deliver the first developer's bundle through a secure channel. The files are under
   `/etc/nacl-graph/clients/alice@example.com/`: `client.crt`, `client.key`, and `ca.crt`.

4. Commit only the project's non-secret route metadata described in
   [Configuration](../configuration.md#graph-required-for-graph-aware-skills). Never commit a raw
   Neo4j password, client private key, or CA private key.

## Issue and revoke server-wide access

Use the same `--server-id` that was registered by `provision-vps.sh --host`. Issuing or revoking a
certificate updates the server-wide trusted-CN grant and reconciles every registered project
gateway before returning success.

```sh
# Issue a personal certificate and grant this developer access to every registered gateway.
sh <NaCl>/graph-infra/vps/issue-client-cert.sh bob@example.com \
  --state-dir /etc/nacl-graph --server-id graph.example.com \
  --host graph.example.com --gateway-port 7687

# Revoke the certificate and remove this developer from every registered gateway.
sh <NaCl>/graph-infra/vps/revoke-client-cert.sh bob@example.com \
  --state-dir /etc/nacl-graph --server-id graph.example.com
```

`issue-client-cert.sh` succeeds only after all registered gateway projections have been updated.
`revoke-client-cert.sh` requires `--server-id`; it updates the CA audit record, removes the CN from
the server grant, and reconciles all registered gateways. If any projection or reload cannot be
verified, the command returns `BLOCKED` and physically quarantines uncertain gateways rather than
reporting a false success. Neither operation rotates the Neo4j password or restarts Neo4j.

## Definition of Done

- [ ] `NACL_VPS_RESULT: status=READY` for the project provision.
- [ ] The server inventory contains the project gateway under the expected `server_id`.
- [ ] Neo4j Bolt/HTTP ports are not reachable externally; only mTLS gateway ports are exposed.
- [ ] The first client bundle was delivered securely and connects through the sidecar.
- [ ] A test issue or revoke reconciles every registered gateway and reports a verified terminal
      status rather than partial success.
- [ ] The repository contains only non-secret route metadata and an opaque secret reference.

# Runbook: provision a shared graph on a VPS (multi-user NaCl)

**Для кого / Audience.** The owner standing up a SHARED Neo4j on a VPS so several developers (in
different locations, over the public internet) can work against one graph. One-time per project.

**Что получится / Outcome.** A per-project Neo4j reachable only through an mTLS gateway, a private
CA that issues per-developer client certificates (the revocable "API keys"), and the first
developer's certificate ready to hand out.

**Non-negotiables.** Neo4j is never published to the host; only the gateway port is public. The CA
private key never leaves the VPS/admin host. Secrets are generated, never committed.

## Prerequisites

- A VPS with a DNS name (e.g. `graph.example.com`) you control, Docker + Docker Compose installed,
  `openssl`, and (optionally) `ufw`.
- The NaCl checkout present on the VPS (for the templates + schema). SSH access as a sudo user.

## Steps

1. **Run the provisioner** on the VPS (or via SSH):

   ```sh
   sh <NaCl>/graph-infra/vps/provision-vps.sh \
     --skills-dir <NaCl> --host graph.example.com \
     --project-scope acme-billing --prefix acme-billing \
     --gateway-port 7687 --first-developer alice@example.com \
     --state-dir /etc/nacl-graph
   ```

   It creates the private CA, signs the gateway server cert, brings up Neo4j + the ghostunnel
   gateway from `graph-docker-compose.vps.yml`, loads the ba/sa/tl schema constraints, sets a
   default-deny firewall (allow 22 + the gateway port), and issues the first client cert. It ends
   with `NACL_VPS_RESULT: status=READY|FAILED`.

2. **On FAILED**, read `failed_check`: `need-docker`/`need-openssl` (install it), `container-health`
   (`docker logs <prefix>-neo4j`), `schema-load` (re-run; loads are idempotent), `gateway-listen`
   (check the gateway container + firewall).

3. **Deliver the first developer's bundle** securely (not email/chat in clear): the three files in
   `/etc/nacl-graph/clients/alice@example.com/` (`client.crt`, `client.key`, `ca.crt`).

4. **Give every developer the endpoint** (non-secret, goes in the project's committed `config.yaml`
   `graph.remote` block): `host`, `gateway_port`, `project_scope`.

## Issuing / revoking access

```sh
# add a developer
sh <NaCl>/graph-infra/vps/issue-client-cert.sh bob@example.com --host graph.example.com --gateway-port 7687
# revoke instantly (CRL + gateway reload; no password change, others unaffected)
sh <NaCl>/graph-infra/vps/revoke-client-cert.sh bob@example.com --scope acme-billing --prefix acme-billing
```

## Definition of Done

- [ ] `NACL_VPS_RESULT: status=READY`.
- [ ] From outside, the Neo4j bolt/http ports are NOT reachable; only the gateway port is, and only
      with a valid client cert (a connection without one is refused).
- [ ] First client bundle delivered; the developer can connect (see the connect runbook).
- [ ] Endpoint (host/gateway_port/project_scope) recorded in the project's `config.yaml`.

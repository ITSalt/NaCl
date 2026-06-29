# NaCl 2.23.0 — multi-user-shared-graph

**A project's spec graph can now live on a VPS and be shared by several developers over the
public internet — while local-only projects stay byte-for-byte unchanged.**

## The problem

Until now every NaCl project ran its own local Neo4j Docker container (`bolt://localhost:<port>`),
one per machine. Collaboration meant a one-shot encrypted handover — a snapshot moved between
people, never a live shared graph. Teams in different locations had no way to work the same spec
graph concurrently with real per-person access control.

## How it works

Skills only ever reach the graph through the `neo4j` MCP server, so the connection abstraction was
already in exactly the right place. An opt-in `graph.mode: remote` keeps the MCP pointed at
`bolt://localhost:<sidecar_port>`; a per-developer **ghostunnel mTLS tunnel** carries that local
socket to a gateway in front of the VPS Neo4j. The result: **zero skill changes are needed for
connectivity** — the same skills that talked to a local container now talk to a shared one.

Access is a personal **client certificate** — a revocable "API key", signed by a private CA the
provisioner stands up (no Let's Encrypt). Neo4j itself never faces the internet; only the mTLS
gateway port is open. The only edition required is Neo4j **Community** — no licensing cost.

## What's inside

— **Opt-in config, fully backward compatible.** `graph.mode` (`local` | `remote`, absent ⇒
`local`) plus a `graph.remote` endpoint block. A project with no `graph.mode` behaves exactly as
before.

— **Seven deterministic client tools, each unit-tested** (skill-tools pattern, run by
`test-tools.yml`): `resolve-graph-mode`, `register-project`, `write-mcp-config`,
`write-graph-config`, `mcp-cypher` (client-side Cypher straight over the MCP stdio binary — no
docker / cypher-shell), `claim-task` (atomic claim-lock), and `resolve-developer-id`. `/nacl-init`
slimmed down — the Step 2d registry merge and the MCP-config merge moved into tools.

— **Turnkey VPS automation.** `provision-vps.sh` stands up a private CA, a gateway server cert,
Neo4j on loopback plus a ghostunnel mTLS gateway, loads the ba/sa/tl schema, closes the firewall to
everything but SSH and the gateway, and issues the first developer cert. `issue-client-cert.sh` /
`revoke-client-cert.sh` add and instantly revoke developers by managing the gateway's `--allow-cn`
allow-list.

— **Join, migrate, tunnel.** `connect-remote` (join an existing shared project — no Docker, no
schema, a read-only `project-exists` gate that fails loud rather than attach to an empty graph),
`create-remote` (provision a new shared project), `install-sidecar` (the per-developer tunnel, `.sh`
+ `.ps1`), and `migrate-to-remote.sh` (local → cloud, wrapping the existing handover export/import,
idempotent with rollback at every gate).

— **Concurrency that doesn't collide.** In remote mode the graph is the single source of truth and
`.tl/status.json` degrades to a per-clone cache. `tl-full` / `tl-next` / `tl-status` / `tl-ship` /
`tl-diagnose` (root + codex mirrors) claim a task before working it and stamp `developer_id`
provenance. Identity is auto-derived per machine (`<git email|user>/<machine-key>`), so one human on
two machines gets two distinct ids and never takes the same task twice.

## Verified on a real VPS

This shipped after a **first live end-to-end run** on a clean Ubuntu VPS: provision → migrate a real
local graph to the cloud → connect a second machine → two developers claim concurrently without
collision → revoke one cert and watch it lose access while the other keeps working, with
byte-identical node/relationship counts before and after the migration. The scripts had never run
live before, and the run surfaced **nine fixes** now folded in. The two most consequential:
ghostunnel has no `--crl` flag, so revocation became a managed `--allow-cn` allow-list; and modern
Go TLS rejects a CN-only gateway certificate, so the server cert now carries a subjectAltName.
Windows got sidecar and identity parity in the same pass.

## Scope and follow-ups

Local mode is untouched throughout — no `graph.mode` means the exact previous behavior. One
follow-up stays open: dedupe the inline MCP-binary resolver in `setup-graph.{sh,ps1}` against
`lib-neo4j-mcp.*` (it needs a runtime graph test before refactoring the tested local path).

Telegram post: docs/releases/2.23.0-multi-user-shared-graph/tg-post.md

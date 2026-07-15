# Remote-mode coordination (multi-user shared graph)

Authoritative rules for how NaCl skills behave when `config.yaml` has `graph.mode: remote` —
i.e. several developers run skills on their own machines against ONE shared Neo4j on a VPS.
In `local` mode (the default; absent `graph.mode` ⇒ local) NOTHING here applies and the existing
single-user behaviour is unchanged. Skills that coordinate on shared state read this file.

## 1. Graph is the sole source of truth; `.tl/status.json` is a local cache

In local mode, skills keep the **dual-write fence**: every phase advance writes BOTH the graph
AND `.tl/status.json` atomically ("both or neither"). That fence assumes one developer per graph.

In **remote** mode `.tl/status.json` is per-clone and would diverge across developers, so:

- The **graph is authoritative.** A successful graph write is sufficient to advance.
- `.tl/status.json` is a **best-effort local cache** — written opportunistically, rebuilt from the
  graph on demand, and **never** used for cross-developer coordination.
- **No stale fallback.** If the graph is unreachable in remote mode, skills **HALT** with a clear
  message rather than fall back to the local cache (another machine's cache is meaningless here).

## 2. Task claim-locks (prevent two developers grabbing the same task)

Fine-grained coordination uses only the bundled gateway. Derive a worker with
`nacl_graph_derive_worker_identity`, then call `nacl_graph_claim_resource` for
the exact `Task` with a stable idempotency key, bounded TTL, and
`APPROVE_TL_WRITE`. Retain the returned fencing token. Long work uses
`nacl_graph_heartbeat_resource`; completion uses
`nacl_graph_release_resource`, or `nacl_graph_handoff_resource` with its exact
target confirmation. `LEASE_HELD` means another worker owns the task, so pick
another. Never submit raw Cypher or run a package-relative helper from project
cwd. For `conduct` runs cluster ownership still partitions work; Task leases
cover interactive coordination.

## 3. Provenance: `developer_id`

Use the trusted principal/client/session envelope and
`nacl_graph_derive_worker_identity`. The returned opaque worker ID separates
sessions and machines without accepting a caller-supplied role. Carry the same
identity, worktree, branch, base SHA, and optional PR provenance into every
lease and mutation. The gateway stamps trusted principal/worker provenance on
accepted writes.

## 4. Per-skill behaviour in remote mode

| Skill | Remote-mode change |
|-------|--------------------|
| **nacl-tl-full** | Graph-authoritative; `status.json` write is best-effort; **resume reads the graph only**; acquire the claim-lock before starting a task; stamp `developer_id`/`updated_at` on phase writes. |
| **nacl-tl-next** | **Claim before recommending** (atomically), so two devs don't get the same task; **disable the `status.json` fallback** — if the graph is unreachable, HALT. |
| **nacl-tl-status** | Read the graph only; show a `claimed_by` column (who holds what); if it shows the local cache, label it stale. |
| **nacl-tl-ship** | Verification gate reads the **graph** `Task` node (authoritative), never the local cache; **release the claim** on successful ship. |
| **nacl-tl-diagnose** | Graph is canonical; divergence with the local `status.json` is expected/benign in remote mode → report informationally, not as an error. |

Everything else (dev-be/fe, review, verify, qa, plan, git mechanics) is unaffected — those operate
on code + graph via MCP and don't coordinate on shared mutable state beyond the claim.

## 5. Connectivity is transparent

Skills reach the graph only through `mcp__neo4j__{read,write,get-schema}` and never construct a
connection string. In remote mode `.mcp.json` points at a LOCAL tunnel socket
(`bolt://localhost:<sidecar_port>`) that carries traffic over mTLS to the VPS. So there are **zero
connectivity changes** in any skill; only the coordination semantics above differ.

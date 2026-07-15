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

Fine-grained coordination is an atomic conditional write on the `Task` node, built by the tested
tool `nacl-core/scripts/claim-task.mjs` (do not hand-write the Cypher — run the tool's query via
`mcp__neo4j__write-cypher` and interpret with the tool's rule). Properties: `claimed_by`,
`claimed_at`, `claim_expires_at` (TTL, default 4h). A single statement is atomic under Neo4j's
per-write locking, so no external coordinator is needed:

```
claim:   node nacl-core/scripts/claim-task.mjs claim   --task <id> --dev <NACL_DEVELOPER_ID> --json
release: node nacl-core/scripts/claim-task.mjs release --task <id> --dev <NACL_DEVELOPER_ID> --json
```

If the returned `owner` ≠ me, the task is held by someone else → pick another. Release on
successful ship. For `conduct` runs the existing cluster ownership (`cluster_id` + per-cluster
branch/PR) already partitions work; claim-locks cover interactive (non-conduct) use.

## 3. Provenance: `developer_id`

Resolve with the pinned tool:
`NACL_DEVELOPER_ID="$(node nacl-core/scripts/resolve-developer-id.mjs --project-root .)"`.
Precedence: `$NACL_DEVELOPER_ID` env (explicit override) → `config.yaml` `developer.id` → auto
`<git user.email | $USER>/<machine-key>`. The **machine-key** is stable per machine (IOPlatformUUID
on macOS, `/etc/machine-id` on Linux, else hostname; hashed to 8 hex), so ONE human on TWO machines
gets two distinct ids **automatically, with nothing to configure** — essential because the claim-lock
keys ONLY on this id (`claimed_by = $dev` is re-claimable, so two machines sharing an id would
re-grab each other's tasks). `claimed_by` stays human-readable, e.g. `alice@x.com/3f9a2c1b`. v1
stamps `claimed_by` on claims, and `updated_by`/`updated_at` on phase-advance writes.

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

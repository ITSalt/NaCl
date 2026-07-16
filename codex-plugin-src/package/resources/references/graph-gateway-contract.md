# NaCl Graph Gateway contract

Status: Wave 9 Stage 2 local implementation contract

## Requirements and constraints

The gateway provides the first graph-backed Codex plugin workflow without
changing Claude Code paths or depending on the source checkout. It must run
from the installed plugin cache on system Node.js 20 or newer, serve the same
MCP schemas to CLI and Desktop, and fail closed when lifecycle, registry,
secret, schema, audit, transaction, or read-back evidence is incomplete.

The retained local scope is multi-project. Stable generated project identity,
confirmed root registration, physical Community-instance isolation, and
project-keyed routing are enabled. RBAC, leases, fencing, and general domain
writes remain Wave 5 and Wave 6 responsibilities. Every graph operation
requires explicit `project_id` plus `project_root`; the gateway never selects a
last-used project.

For remote Community deployments, one project still means one container and
one independent data/log volume lineage, but the **server is the authorization
boundary**. `project_scope` is route and provenance only. An authoritative
server `trusted-cns` set is projected to every registered project gateway;
same-server project selection is positive behavior, while another server needs
a separate grant and denial does not reveal its inventory. Any graph
`ProjectMembership` record used by the legacy concurrency engine is a derived
operation-role projection of that server grant, never an independently
managed project-access grant.

## Components and data flow

```text
Codex CLI/Desktop
  -> cached STDIO MCP server
  -> installation conflict preflight
  -> project resolve / confirmed identity or root registration
  -> canonical root + config + registry + Git-lineage verification
  -> lifecycle public resolve + doctor API
  -> opaque Keychain secret resolver
  -> loopback Neo4j transactional HTTP API
  -> packaged parameterized query/migration catalogs
  -> durable redacted JSONL audit outside the plugin cache
```

The project router owns the external non-secret project registry. The lifecycle
adapter is the only gateway consumer of instance registry data. It calls
`resolve({projectId, projectRoot})` and `doctor({projectId, projectRoot})`; the gateway does not
read `instance.json` or Compose state directly. The plugin cache is immutable
package code. Instance state, audit, Keychain entries, volumes, dumps, and
restore candidates are durable external state and survive plugin reinstall or
uninstall.

## Trust boundaries

- Model-supplied input: `project_id`, `project_root`, a bounded named-read selector,
  confirmation literals, and an idempotency key. It cannot supply endpoints,
  credentials, filesystem paths, or raw Cypher.
- Lifecycle profile: supplies an exact loopback endpoint, opaque secret
  reference, audit path, instance status, and schema handoff. Invalid or
  conflicting records return a closed error.
- Secret backend: only `keychain:<service>/<account>` is accepted for the
  local pilot. `/usr/bin/security` receives service/account identifiers in
  argv; the secret is captured in memory and used only in an HTTP authorization
  header. It is never returned or audited.
- Neo4j: only `http://127.0.0.1:<port>` is accepted. User/config values are
  passed as transaction parameters, never interpolated into statements.
- Audit storage: write/schema operations persist an attempt before graph
  mutation and a redacted completion/failure record afterward. Failure to
  persist the pre-write audit blocks the mutation.

## Project API and routing

The production-shaped server route accepts only a server-controlled
`project_ref`. The resolver returns `(authorized_server_id, project_scope)`;
callers cannot supply a server ID, host, URI, certificate path, Neo4j password,
or principal binding. The personal mTLS certificate authorizes transport to
the server, operation scopes authorize the requested action, and the per-route
Neo4j password remains a distinct server-side secret.

VPS state uses `trusted-cns` plus an atomic gateway inventory. Provisioning a
new gateway inherits the set and atomically reserves a unique public port.
Legacy per-project lists migrate only through a digest-bound union plan/apply.
Grant projection failure rolls back. Revoke projection/reload failure disables,
quarantines, and stops a stale route, invalidates its authorization revision,
and cannot return success.

| Tool | Capability | Persistence policy |
|---|---|---|
| `nacl_project_resolve` | read | Reads canonical root/config/registry only; zero writes. |
| `nacl_project_migrate_identity` | project-admin | Exact presented UUIDv4 confirmation, atomic minimal config insert, config and registry read-back. |
| `nacl_project_register_root` | project-admin | Exact confirmation, canonical alias plus Git-lineage verification, registry read-back. |

Omitting `project_root` from resolution with several registered roots returns
`AMBIGUOUS_PROJECT`. A config without `project.id` returns a generated candidate
and its bound confirmation but does not persist. Clones and normal Git
worktrees share the tracked identity and lineage; unrelated repositories with
a copied ID fail. Config symlinks, stale aliases, changed config inode, corrupt
or extra registry fields, and forged project/root pairs fail before secret or
Docker access.

## MCP API and capability split

| Tool | Capability | Mutation policy |
|---|---|---|
| `nacl_graph_health` | read | Lifecycle, migration ledger, constraints, and read canary must all pass. |
| `nacl_graph_schema_status` | read | Checks ordered versions, checksums, and required constraints. |
| `nacl_graph_read` | read | `canary` and `summary` packaged queries only. |
| `nacl_graph_apply_migrations` | schema-admin | Exact `APPLY_MIGRATIONS` confirmation and pre-write audit required. |
| `nacl_graph_write_canary` | write | Exact `WRITE_CANARY`, idempotency key, transaction, and separate read-back required. |

The local HTTP transport pool is keyed by `project_id` and exact
endpoint/database/user/secret-reference plus an in-memory credential
fingerprint. Route or credential changes replace only that project's entry;
profiles cannot reuse a transport under another project key.

Normal workflow tools do not expose unrestricted write Cypher. The Wave 3
write canary is a bounded gateway-owned node used only to prove initialization.
Future domain writes must add their own named schema, authorization, revision,
lease, and provenance contracts.

Each local Community project has its own SHA-derived Compose project,
container, persistent volume, network, loopback ports, and Keychain account.
Existing global IDs and constraints therefore remain safe without partial
`project_scope` filtering in one shared database.

## Schema and recovery

Packaged migrations are ordered JSON records. The SHA-256 of each exact file
is recorded in `SchemaMigration {component, version, checksum}`. Reapplication
of additive statements is idempotent; a mismatched checksum is `FAILED`, not an
implicit repair. Schema status also checks physical constraints so a current
ledger cannot hide deleted schema objects.

Risky future migrations must declare `backupRequired: true`. The lifecycle
owns offline Neo4j Community dump/restore primitives. Restore verification is
non-destructive: it loads a fresh owned candidate, compares structure, schema,
representative queries, and read/write smoke, then removes only that candidate.

## Closed errors

All tool results use `nacl-graph-gateway-v1` and one closed status. Important
codes include:

| Condition | Status/code |
|---|---|
| Docker or endpoint stopped | `BLOCKED/GRAPH_UNAVAILABLE` or lifecycle stopped code |
| Port collision | `FAILED/PORT_COLLISION` |
| Missing/revoked Keychain item | `BLOCKED/SECRET_UNAVAILABLE` |
| Rejected secret | `FAILED/AUTH_FAILED` |
| Corrupt instance registry | `FAILED/REGISTRY_CORRUPT` |
| Missing/stale schema | `BLOCKED/SCHEMA_MISSING` or `BLOCKED/SCHEMA_STALE` |
| Checksum mismatch | `FAILED/SCHEMA_CHECKSUM_MISMATCH` |
| Missing physical constraint | `BLOCKED/SCHEMA_OBJECTS_MISSING` |
| Confirmation absent | `BLOCKED/CONFIRMATION_REQUIRED` |
| Write completed but read-back mismatched | `PARTIALLY_VERIFIED/WRITE_READBACK_FAILED` |
| Migration stopped after an additive statement | `PARTIALLY_VERIFIED/MIGRATION_PARTIALLY_APPLIED` |
| Transport failed after a mutation began | `PARTIALLY_VERIFIED/MUTATION_OUTCOME_UNKNOWN` |
| Pre-write audit unavailable | `BLOCKED/AUDIT_UNAVAILABLE` |
| Mutation completed but final audit failed | `PARTIALLY_VERIFIED/AUDIT_COMPLETION_FAILED` |
| Several roots and no scope | `BLOCKED/AMBIGUOUS_PROJECT` |
| Missing explicit operation root | `BLOCKED/PROJECT_ROOT_REQUIRED` |
| Config/argument identity mismatch | `FAILED/PROJECT_MISMATCH` |
| Copied identity from unrelated Git history | `FAILED/PROJECT_LINEAGE_MISMATCH` |
| Corrupt project registry | `FAILED/PROJECT_REGISTRY_CORRUPT` |
| A profile references another project's secret | `FAILED/PROJECT_SECRET_MISMATCH` |

Transport exceptions and Neo4j response text are sanitized. Unknown internal
exceptions become `FAILED/INTERNAL_ERROR`; they do not reflect user input,
credentials, response bodies, or stack traces through MCP.

## Reliability and failure injection

HTTP requests use a bounded timeout. Every schema/write action is explicit;
session startup does not start Docker. Migration apply reads the ledger before
and after each version. Write-canary retry with the same idempotency key does
not increment its revision. Unit and combined local E2E inject unavailable
Docker, collisions, missing/revoked/rejected secrets, corrupt registry,
missing/stale/tampered schema, missing constraints, unavailable audit, and
read-back failure. None may return `VERIFIED`.

## Trade-offs and later growth

Transactional HTTP avoids a package-external driver dependency and keeps the
cache closure small, at the cost of using Neo4j's HTTP endpoint in addition to
Bolt. macOS Keychain matches the current Desktop pilot but is not a portable
cross-platform secret backend. One local Community container per project costs
more memory and ports than a shared database but establishes the required
physical isolation boundary. Absolute canonical aliases make checkout moves
explicit. Non-Git roots are blocked in this pilot rather than assigned a weaker
path/machine identity. These choices must be revisited for cross-platform and
remote production transport; they are not evidence for Wave 8.

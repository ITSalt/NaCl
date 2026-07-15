# ADR-003: Codex Plugin Pilot Decision Set

**Status:** Accepted in part
**Date:** 2026-07-14
**Author:** NaCl Architecture

---

## Context

The Codex plugin pilot must package the existing Codex adaptation without
changing the Claude Code distribution. It must also add a project-scoped graph
gateway that remains correct across cached plugin installs, multiple projects,
and concurrent sessions. The implementation runbook requires the nine decisions
below before product code expands beyond the Wave 0 baseline.

Current plugin contracts are not internally consistent. Research retrieved on
2026-07-14 found these blocking differences:

- the public Build plugins contract and the bundled plugin validator disagree
  about required manifest fields;
- public documentation lists hooks, while the bundled validator rejects the
  `hooks` manifest field;
- public MCP examples use a direct/snake-case `.mcp.json` shape, while the
  bundled scaffolder and validator require a camel-case `mcpServers` wrapper or
  inline object;
- `${PLUGIN_ROOT}` is documented for hooks, but not guaranteed for `.mcp.json`;
- Codex Desktop in this pilot means the Codex view in the ChatGPT desktop app;
- Neo4j Community supports offline dump/load recovery, not the Enterprise
  online backup workflow.

These differences make the ingestion and launch decisions experimental. No
section below that depends on those experiments is accepted by this ADR.

## Decision Index

| Decision | Status | Blocking wave |
|---|---|---|
| Package boundary | Accepted | 2 |
| MCP launch from cache | Accepted for the local CLI/Desktop pilot | 1/3 |
| Pilot runtime prerequisite | Accepted: system Node.js 20 or newer | 1/2 |
| Project identity and registry | Accepted for the local multi-project pilot | 4 |
| Secret contract | Accepted for the macOS local pilot | 3 |
| Physical graph isolation | Accepted for the local multi-project pilot | 4 |
| Lease, revision, and ID model | Accepted for the local multi-user pilot | 5 |
| Agent-profile delivery | Proposed | 6 |
| Candidate and public versioning | Proposed | 7 |

## 1. Package Boundary

### Decision

Use `plugins/nacl/` as the self-contained cacheable package. It will contain a
small public entry-skill set, internal workflows/references/templates, the
gateway runtime, graph migrations/queries/Compose assets, and package-local
diagnostics. Runtime links and imports may not escape the plugin root.

Project `.codex/agents/` profiles are companion files installed by an explicit
bootstrap action. Project identity, registry records, secret references, and
graph volumes are durable external state and are never bundled in or removed
with the plugin. The legacy `skills-for-codex` symlink distribution remains a
separate supported installation mode.

### Acceptance evidence

Wave 2 packaged ten public entry skills and all 60 current Codex workflows,
plus their contracts, methodology references, templates, schemas, queries, and
deterministic scripts, under `plugins/nacl/`. The closure gate checks manifest
and MCP paths, Markdown links, active local paths and command references in
Markdown code, JavaScript and shell imports, indexed resources, symlinks,
developer paths, and secret-like material. Source-comparison references are
explicitly classified instead of being mistaken for executable package
dependencies. A clean CLI install ran from the versioned cache after its
disposable marketplace source was renamed away, and the ten cached entry skill
hashes matched the source archive.

The unchanged legacy installer created 60 user-level symlinks and repeated
idempotently in an isolated home. Package-local diagnostics distinguish
plugin-only, legacy-only, both, and neither; the ambiguous double installation
returns `FAILED` with removal guidance before a workflow may run. Named legacy
artifacts are valid only when they resolve to a directory with a readable
name-matching `SKILL.md`; broken or malformed artifacts fail closed. If the MCP
doctor is unavailable, legacy entries use the current CLI plugin catalog and
continue only when NaCl is proven absent. The fallback is executed successfully
through the real user symlink created by the unchanged installer, using
canonical realpath entrypoint detection. These facts accept the package
boundary for the pilot. Project state, secrets, volumes, and agent profiles
remain outside the plugin as originally proposed.

## 2. MCP Launch From Cache

### Decision

Do not select a launch form in prose. Wave 1 must build a three-shape fixture
matrix and run the current CLI and ChatGPT desktop host against each shape:

1. the bundled companion form (`plugin.json.mcpServers` path plus a
   `{ "mcpServers": ... }` wrapper);
2. the public direct-map `.mcp.json` form;
3. the public snake-case `{ "mcp_servers": ... }` wrapper.

For every accepted ingestion shape, test cache-relative executable/argument
resolution separately from environment-variable expansion. `${PLUGIN_ROOT}`
must not be assumed in `.mcp.json`. The chosen shape must launch after the
source checkout is made unavailable and after a cachebuster reinstall/new task.

### Acceptance evidence

Record the exact manifest, validator output, cache path, process command/cwd,
CLI tool call, Desktop tool call, reinstall behavior, and failure mode for all
three fixtures. If none launches portably, propose an explicit installed shim;
never fall back to a developer checkout path.

### Wave 1 CLI/Desktop finding

The validator-compliant companion form is the only admissible active candidate:
`plugin.json.mcpServers` points to `./.mcp.json`, which contains a camel-case
`mcpServers` wrapper. Its STDIO entry uses system `node`,
`args: ["./scripts/nacl-spike-mcp.mjs"]`, and `cwd: "."`. Codex CLI 0.142.0
resolved that working directory to the installed cache, invoked the tool after
the disposable marketplace source was renamed away, and picked up the helper-
generated cachebuster in a new `codex exec` task.

The public direct map also launched under this CLI but failed the pinned
validator. The public snake-case wrapper failed validation and produced no MCP
entry. Therefore neither public form can replace the active companion form.
After the bounded `_meta` compatibility corrections, a restarted Desktop task
discovered and invoked the same cache-relative companion transport and returned
the exact installed-cache contract. The companion form is accepted for the
local CLI/Desktop pilot. Cross-machine portability and a production remote
transport remain later-wave concerns.

## 3. Pilot Runtime Prerequisite

### Decision

Evaluate, in order: a bundled runtime, a compiled/self-contained executable,
and a declared system Node prerequisite. Prefer the smallest option proven to
work identically from the cached plugin in CLI and Desktop. Do not claim that
the desktop app's internal Node runtime is a supported plugin runtime.

### Acceptance evidence

Wave 1 records executable resolution, architecture, minimum version, offline
behavior after installation, and actionable failure diagnostics. Wave 2 may
accept system Node only if both hosts resolve the same documented prerequisite.

### Wave 1 and Wave 2 finding

The package declares system Node.js 20 or newer and fails at startup with an
actionable version diagnostic below that guard. On the target Mac, CLI and
Desktop launch resolved Node.js 24.13.1 on arm64. Wave 2 again ran the package
entirely from the installed CLI cache while the source was unavailable. The
pilot therefore accepts system Node.js 20 or newer as an explicit prerequisite
instead of bundling or compiling a runtime. Node 20 is the enforced minimum but
has not yet been exercised on a Node 20 host; cross-version portability remains
a candidate-level test obligation.

## 4. Project Identity And Registry

### Decision

Add a generated stable `project.id` to project configuration only through a
presented, confirmed migration with read-back. It is independent of path,
folder, user, machine, branch, and worktree. Clones/worktrees of one repository
share the ID; unrelated projects do not.

Maintain a user-scoped registry outside the plugin cache with project ID,
registered root aliases, graph mode/profile or endpoint reference, secret
reference, schema version, and last health status. It contains no secret
material. Ambiguous or conflicting roots fail closed.

For the local pilot, newly migrated identities are UUIDv4 values. Migration is
a minimal atomic insertion into the existing `project:` mapping: source bytes,
comments, BOM/line endings, and file mode are preserved except for that one
inserted line. The exact presented UUID is bound into the confirmation and is
read back before registry creation. If config persistence succeeds but registry
completion fails, the result is `PARTIALLY_VERIFIED` and recovery is the
separate confirmed root-registration operation; reads never repair it silently.

The strict per-project JSON registry lives under the external local-graph state
root. Besides the required non-secret routing fields, it stores a hash of the
Git root history used only to reject a copied `project.id` from an unrelated
repository. Canonical roots are added only by explicit confirmation. Symlink
aliases collapse through `realpath`; a symlinked config, stale alias, changed
bytes/digest/metadata between presentation and commit, extra registry field, or
config/registry identity conflict fails closed. The project and instance JSON
records are bound to the exact project ID encoded by their filename before any
list, health, lifecycle, secret, or Docker use.

### Acceptance evidence

Wave 4 proves explicit legacy presentation/confirmation/read-back, byte and
mode preservation, partial-completion recovery, a clone and Git worktree sharing
one ID, unrelated copied-ID rejection, root-symlink canonicalization, stale and
ambiguous alias failures, config/registry tamper rejection, and persistence
across installed-cache replacement and removal. Every graph and lifecycle call
now requires explicit `project_id` plus `project_root`; the validated canonical
root is returned with the route and no last-used state exists.

The correction review additionally proves same-inode in-place edits preserve
the user's bytes, foreign valid records under another project's filename are
rejected without rewrite, and raw relative CLI roots are rejected before
normalization or dispatch. A regular local filesystem cannot make the final
comparison plus rename one compare-and-swap operation; the implementation
minimizes and documents that residual boundary and performs post-write
read-back instead of claiming hostile concurrent-writer exclusion.

## 5. Secret Contract

### Decision

Persist only opaque secret references in project configuration and the
registry. The macOS local pilot uses
`keychain:<service>/<account>` with service
`com.itsalt.nacl.local-graph` and the project ID as account. The lifecycle and
gateway accept no secret value in MCP input, project JSON, plugin/marketplace
manifests, `.mcp.json`, examples, logs, or process arguments. The lifecycle
passes a newly generated value to the container only through stdin or a scoped
child environment. The gateway invokes `/usr/bin/security` with only the
opaque service/account identifiers and retains the returned value in process
memory for the bounded loopback request.

An environment-reference production backend is not enabled for this pilot.
Dependency injection of a fake secret provider is test-only. Missing, locked,
or revoked Keychain entries are `BLOCKED`; a secret rejected by Neo4j is
`FAILED`. Recovery is an explicit lifecycle action and never replaces or
prints a secret silently.

Initialization is create-only. Keychain creation does not use the implicit
update flag. Init first validates the exact project ID/root plus the
filename-bound instance record, then writes its attempt audit before generating
a value, checking the exact opaque reference, or checking the SHA-derived
container, volume, and Compose network. An existing secret or resource without
a valid registry is an orphan/recovery `BLOCKED` result; init changes neither.
Registry records must recompute to the exact project-derived resource names,
fixed loopback endpoint, pinned image/schema, and project Keychain reference
before any Docker command. Rotation remains a separate future confirmed
administrative action.

Audit files are forced to and verified as mode 0600 on every append. A failed
attempt audit prevents secret/registry effects. If init has already created a
secret or record and its completion audit fails, the result is
`PARTIALLY_VERIFIED` with explicit reconciliation; it is never a final failure
that invites a blind retry.

### Acceptance evidence

Wave 3 unit and local lifecycle tests cover missing, revoked, and rejected
secrets; argv/log redaction; exact opaque reference shape; restart and plugin
reinstall persistence; and package closure/secret scanning. The combined Wave
3 evidence records the executed commands and lifecycle recovery limitations.

## Wave 3 Gateway Transport And Schema Lifecycle

### Decision

Keep the accepted cache-relative STDIO MCP process and add a package-local
gateway that talks to the resolved local Neo4j instance through its
transactional HTTP API on `127.0.0.1`. This avoids an external Node driver and
keeps the installed cache self-contained. Every tool requires `project_id`;
the model cannot supply an endpoint, secret, audit path, or raw Cypher.

Expose separate read, write, and schema-admin tools. Named reads and gateway
writes use parameterized packaged statements. Schema/write tools require exact
confirmation, lifecycle preflight, a redacted durable pre-write audit,
transactional execution, and read-back. Health is not a port check: it includes
lifecycle status, ordered version/checksum ledger, physical constraint status,
and a real read canary. The only Wave 3 normal write is an idempotent confirmed
gateway canary; domain writes remain blocked for later waves.

The migration ledger stores the SHA-256 of the exact ordered migration file.
Additive statements use `IF NOT EXISTS` and can be safely rerun. Checksum drift,
missing constraints, missing/stale schema, corrupt registry, unavailable
Docker, collision, secret failure, audit failure, or read-back mismatch returns
a closed non-success status. Local Community backup uses offline dump; restore
verification uses a fresh owned candidate and never overwrites the only source.

The shipped CLI constructs the package-local restore probe by default. It
resolves the current opaque secret through the lifecycle, waits for the
candidate, and recomputes node/relationship counts, label and relationship
histograms, constraints, indexes, migration version/checksum, the packaged
gateway-canary digest, and a transactional create/read/delete smoke. Missing
runtime support is a specific `BLOCKED` result, not a structural
`RESTORE_PROBE_REQUIRED` placeholder.

The exact project grammar is the same in MCP JSON Schema, gateway runtime, and
lifecycle: 3–128 characters, leading alphanumeric, followed only by
alphanumeric, dot, underscore, or hyphen. A colon is rejected everywhere.

### Trade-offs

Transactional HTTP keeps runtime closure small but requires the local HTTP
port in addition to Bolt. Keychain is appropriate for the audited macOS pilot
but is not a cross-platform or remote-production secret design. Physical
per-project Community containers trade memory for isolation; multi-project
routing remains a Wave 4 gate, and authorization/concurrency remain Wave 5.
The local Docker test harness may reuse the mutable `neo4j:5.24-community`
source tag only after executing it and proving the reported version is exactly
5.24.2. It records the image ID/digest and verifies the retagged identity;
version or identity drift is `BLOCKED`, never accepted evidence.

## 6. Physical Graph Isolation

### Decision

Use one Neo4j Community container and persistent volume per project, bound to
loopback with project-specific ports and secret reference. Do not emulate
tenant isolation with a partial `project_scope` property inside one Community
database. Remote Community mode likewise maps one project to one private
instance/container.

Community recovery uses an explicit stop plus offline dump/load into a
recoverable target, followed by structural and representative-query
validation. Online backup is not a pilot assumption.

The accepted local implementation derives exact Compose, container, volume,
network, Keychain account, and loopback endpoint ownership from `project_id`.
Lifecycle resolution revalidates the supplied root/config and registry record
and exact instance filename binding before audit, secret, or Docker access.
Rejected scopes return without an audit path or per-project file mutation.
After scope validation, each lifecycle attempt is audited before Docker,
secret, health, backup, restore, or instance mutation. The HTTP transport pool
is keyed by project ID and the exact endpoint/reference/credential fingerprint;
a tenant transport is never selected from last-used state or shared under
another key.

### Acceptance evidence

Wave 4 unit and real Docker evidence passes cross-project read/write,
credential, migration, backup, restore, lifecycle, cache uninstall/reinstall,
port, registry, and ambiguity negative tests. Two real Community containers
held identical `UC-001`, `MOD-001`, and `Task` IDs; A credentials received 401
from B; A stop/backup/restore left B healthy; both volumes survived cache
replacement/removal; and all disposable resources were removed exactly.

### Trade-offs

The registry intentionally stores absolute canonical root aliases, so moving a
checkout requires an explicit new registration and stale aliases remain visible
until a later administrative cleanup feature exists. Git-lineage validation is
appropriate for repository worktrees and clones in this pilot; non-Git project
roots are blocked instead of receiving a weaker machine/path identity. Per-
project Community containers cost memory and ports but keep existing global
NaCl IDs and constraints physically isolated.

## 7. Lease, Revision, And ID Model

Correction status: implementation commit
`04a467eeda118e1619a6c5252e3c616b4b92f143` received `FAILED/CORRECT` in its
first independent review. Code commit
`566eb16c7326fdc87876237fe2b9a92496d5d004` records the first corrected
candidate. Its evidence commit
`b55155efeb0910ff15fb0fd151e9a0cce12c8124` received a second
`FAILED/CORRECT` because the public `SCHEMA_STALE` migration path was
unreachable. Code commit `e75bda1ccaf94f4ad5a2e615b3980fab414415ec`
records the second corrected candidate; fresh independent acceptance is still
pending, and no `ACCEPT` is recorded here.

### Decision

Use separate `principal_id`, `client_id`, `session_id`, `worker_id`, and
`worktree_id`. Protect mutable shared resources with transactional leases that
carry expiry, heartbeat, and monotonically increasing fencing tokens. Require
the current token for protected writes.

Mutable resources use optimistic `revision` compare-and-swap. Human-readable
IDs come from a transactional sequence keyed by project and entity kind.
Writes carry an idempotency key and retain principal/worker provenance. Gateway
authorization, not skill prose, enforces project roles.

For the local pilot, the trusted runtime principal is the numeric current OS
account expressed as `local-os:<uid>`. The gateway resolves it itself and
requires an exact match with the request before any graph statement executes;
caller-supplied `principal_id`, role, or membership is never authentication.
An injected multi-principal resolver exists only at the server dependency
boundary and is used by the disposable Docker harness. This is intentionally a
local cooperative-account trust model: another process running as the same OS
user, and a Docker/root-equivalent administrator, remains inside the trusted
boundary. It is not a remote identity or tenant-authentication design.

`worker_id` is a deterministic digest of principal, client, and session, so two
sessions of one principal are different lease owners. Worktree, branch, base
SHA, and optional pull-request identity are validated separately and persisted
as provenance; they do not make a lock re-entrant.

The graph owns authoritative `ProjectMembership`, `ResourceLease`,
`IdSequence`, `IdempotencyRecord`, and `ProjectAuthorization` records. All graph
operations other than identity derivation require the full derived identity and
server-resolved principal; derivation validates its trusted principal/client/
session inputs before returning the worker. Every protected write locks and
evaluates active membership in the same Neo4j transaction using a server-owned
capability-to-role allowlist; protected reads evaluate membership in their
query transaction. The pilot roles are viewer,
analyst, architect, developer, release manager, and project administrator.
Ordinary roles cannot supply or emulate an administrative role. Membership
grant/revoke/change is itself revision-CAS, exact-idempotent, audited, and
serialized with concurrent writes; the last active project administrator
cannot be revoked or demoted.

The first administrator is created only by a one-time, explicitly confirmed
bootstrap owned by an exact trusted principal/worker/idempotency key and
monotonic bootstrap fence. A single fixed idempotent uniqueness constraint is
created, if needed, after proving zero memberships. The unique authorization
guard then serializes contenders in `PREPARING`. Every schema DDL, ledger, and
constraint-read boundary rechecks the exact `PREPARING` owner/key/fence and
zero-membership invariant before and after it. The final transaction creates
exactly one active `project_admin`, creates the `MIG-GATEWAY` schema resource,
records idempotency/provenance, and permanently changes the guard to
`BOOTSTRAPPED`. The exact owner can recover `PREPARING`; the exact winning key
replays; every other or later contender receives `BOOTSTRAP_DISABLED`.

There is no unauthenticated migration or write-canary route. The legacy health,
schema-status, and named-read tools require `project.read`; the canary requires
`project.write` and its exact approval; later migration requires project-admin
`schema.admin`, exact approval/confirmation, and the live exclusive
`SchemaMigration/MIG-GATEWAY` owner/fence. Fixed DDL and constraint reads are
surrounded by pre/post membership/lease checks.

Lifecycle handoff is code-specific and fail-closed. `SCHEMA_MISSING` permits
only the exact initial-admin bootstrap, whose graph transaction still proves
the zero-membership invariant. `SCHEMA_STALE` permits only acquire, heartbeat,
release, or handoff for the exact `SchemaMigration/MIG-GATEWAY` resource and
the fixed `apply-migrations` operation. The input is fully validated before
the lifecycle profile is evaluated, so a malformed resource, wrong resource
ID, or missing fence cannot reach the secret resolver or graph. Every ordinary
operation remains closed while stale. After verified migration metadata is
recorded, the normal `VERIFIED/GRAPH_HEALTHY` path again supports release and
health without a lifecycle exception.

Schema versions 1 and 2 remain exact readable descriptors. The additive
version-3 migration adds a unique project-scoped identity for the leaseable
schema resource, `SchemaMigration(project_id, id)`. A genuine v2 ledger is
therefore diagnosed as stale and can advance to v3 without rewriting prior
migrations.

Seven resource types use the generic lease contract: `Task`, `UseCase`,
`Module`, `FeatureRequest`, `Board`, `SchemaMigration`, and
`ReleaseEnvironment`. Lease acquisition, heartbeat, expiry/takeover, release,
and explicit handoff are parameterized named transactions. Expiry is inclusive
at `expires_at == now`; reacquisition or handoff increments the fencing token.
Mutation requires the current principal, worker, unexpired token, and expected
resource revision. A stale token or revision causes no partial resource
mutation. The graph is authoritative, local shared-mode cache is derived-only,
and there is no offline write queue.

Lease acquire, heartbeat, release, and handoff share an exact idempotency
ledger. A newly created record completes with the accepted result or terminal
semantic rejection in the same transaction as the lease decision. Exact
replay returns the stored result even if the live lease later changes; the same
key with a different semantic payload conflicts without observable graph
property changes. Semantic TTL participates in the payload hash, while retry
time and computed expiry do not. A pre-existing `PENDING` record is never
taken over: it returns a closed administrator-reconciliation requirement.

ID allocation locks a `(project_id, entity_kind)` sequence and creates the
typed entity, initial lease, idempotency result, and provenance in one
transaction. It also advances past already observed fixed-width IDs, so an
older sequence cannot reuse an existing identifier. Transient Neo4j deadlocks
and HTTP 429 responses map to bounded retryable `GRAPH_BACKPRESSURE`; retries
reuse the exact idempotency key and payload.

### Second-correction evidence pending fresh independent review

The corrected Wave 5 gate proves ten concurrent claims produce one owner, ten
concurrent administrator bootstraps produce exactly one initial administrator,
two sessions of one principal have distinct workers, expiry takeover increments
the fence, and stale fencing/revision writes have no effect. It exercises all
six roles against all five legacy tools, principal spoofing before graph access,
revoked legacy read/write, and later migration only with the current
administrator schema lease/fence. Acquire, heartbeat, release, and handoff each
prove exact replay after later lease changes, immutable terminal rejection,
full-property zero-mutation payload conflict, transaction rollback, lost-
response replay, and closed pre-existing `PENDING` recovery.

A deterministic lifecycle matrix covers all 14 public graph tools against both
`SCHEMA_MISSING` and `SCHEMA_STALE`. Only bootstrap crosses the missing state;
only the four exact `MIG-GATEWAY` lease operations and migration application
cross the stale state. Malformed type/ID, wrong migration ID, and missing-fence
rows prove zero graph calls. A separate real Docker test creates a public v2
ledger and current administrator, observes genuine `BLOCKED/SCHEMA_STALE`,
rejects an ordinary resource, revoked administrator, and stale fence, then
acquires the schema lease and applies only additive migration 3 through public
gateway calls. It reads back the ledger checksum and physical constraint,
verifies `SCHEMA_METADATA_RECORDED`, registry/instance schema 3, healthy
lifecycle, and verified-path release/health. Query failure before the v3 DDL
succeeds remains `FAILED`; metadata-recording failure after graph mutation is
`PARTIALLY_VERIFIED`.

The final second-correction stress run allocated exactly 1,000 contiguous
project/type IDs. Neo4j returned seven initial retryable deadlock/backpressure
results; all retried in a second round with the exact same key/payload, and the
final sequence/entity/lease/idempotency counts were exactly 1,000. The gate
therefore proves retry-safe high concurrency rather than claiming that all
1,000 requests completed on their first attempt.

The existing v2.23.0 claim/release query contract remains byte-identical between
the frozen root and packaged resource, its seven focused tests pass, the 62
Claude-facing frozen roots retain the exact audited manifest hash, and the
root-to-Codex sync gate passes. Wave 5 changes no Claude-facing skill or remote
transport contract.

### Trade-offs

The corrected candidate design is cooperative multi-session coordination, not
hostile same-account isolation or remote authentication. Per-project Community
containers remain the physical tenant boundary. The high-concurrency HTTP
transport can receive Neo4j deadlock/backpressure responses, so correctness
depends on bounded exact-idempotency retry rather than first-attempt success.
Neo4j schema DDL and `SHOW CONSTRAINTS` cannot share the membership/lease data
transaction. Fixed schema boundaries therefore use pre/post checks. Revocation,
expiry, or a crash between a successful precheck and DDL cannot roll back DDL
that Neo4j already applied; a failed postcheck returns `PARTIALLY_VERIFIED`,
stops ledger advancement, and requires explicit schema/ledger reconciliation.
The one fixed project-authorization uniqueness constraint must exist before the
unique `PREPARING` bootstrap guard can serialize first administration; it is
the sole zero-membership DDL exception before `PREPARING` and is recoverable if
the process stops before guard creation.
Current domain mutation property allowlists are deliberately narrow; workflow-
level adoption and richer reads remain Wave 6. Node 20, live Keychain behavior,
live Desktop discovery/approval of the new tools, hosted CI, and a production
remote identity provider remain unverified.

## 8. Agent-Profile Delivery

### Proposed decision

Agent profiles are optional companion templates, not implicit plugin
components. `nacl init --install-agent-profiles` presents the destination and
diff, asks for confirmation, copies only validated templates into the project,
and never overwrites silently. All entry workflows must remain usable without
profiles.

### Acceptance evidence

Wave 6 must prove fresh install, idempotent repeat, conflicting existing file,
declined confirmation, and CLI/Desktop behavior without profiles.

## 9. Candidate And Public Versioning

### Proposed decision

Identify every local candidate by framework version, plugin SemVer-compatible
development version/cachebuster, schema version, Git SHA, and validator hash.
An example form is `2.23.0-dev.codex.<sha>` where accepted by the current
ingestion contract. Candidate reinstall must change the cachebuster and require
a new task before pickup.

Public framework/plugin/schema compatibility and release numbering remain a
separate decision after user testing. A local candidate is not a public release
and grants no authority to merge, push, tag, or publish.

### Acceptance evidence

Wave 7 records the exact candidate archive/cache, SHA, version, marketplace,
install/reinstall/removal commands, schema compatibility, and full test matrix.

## Contract Baseline For The Wave 1 Spike

The following bundled helper hashes were captured on 2026-07-14 and must be
rechecked before Wave 1. A validator change invalidates ingestion conclusions:

| Bundled artifact | SHA-256 |
|---|---|
| `plugin-creator/SKILL.md` | `8fd56316b2c49cbdc657a5d197967a233018e1fada65b00a5dd030dce6499a6e` |
| `create_basic_plugin.py` | `b5aa34f7f9dcec4bb007a66d65cff0c5c77a67042ae6c4de57d8ab7f4ef737d2` |
| `validate_plugin.py` | `ebda00d55d7518b127f675f062fb5c6e7a1ffdc0a99df1a55ac594400d7d3228` |
| `update_plugin_cachebuster.py` | `4fe3c5a49212f6e30a2306e245c460e01aaf5e36bc8ad3dd2852c199257eff89` |

## Sources Retrieved 2026-07-14

- [Build plugins](https://learn.chatgpt.com/docs/build-plugins)
- [MCP in Codex](https://learn.chatgpt.com/docs/extend/mcp)
- [Codex changes](https://learn.chatgpt.com/docs/whats-new)
- [OpenAI plugin repository](https://github.com/openai/plugins)
- [Bundled plugin-creator skill](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/SKILL.md)
- [Bundled manifest reference](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/references/plugin-json-spec.md)
- [Bundled validator](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/scripts/validate_plugin.py)
- [Bundled scaffolder](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/scripts/create_basic_plugin.py)
- [Bundled install/update reference](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/references/installing-and-updating.md)
- [Neo4j security checklist](https://neo4j.com/docs/operations-manual/current/security/checklist/)
- [Neo4j backup planning](https://neo4j.com/docs/operations-manual/current/backup-restore/planning/)

## Consequences

- Wave 0 may add validation and isolation gates without fabricating plugin
  product files.
- Wave 1 is a compatibility experiment, not routine scaffolding.
- The package boundary, cache-relative MCP launch, and system Node prerequisite
  are accepted for the local pilot from Wave 1 CLI/Desktop evidence plus Wave 2
  CLI cache evidence. Wave 2 Desktop discovery remains `NOT_RUN`.
- The local Keychain secret and gateway transport contracts are accepted from
  Wave 3, physical multi-project isolation from Wave 4, and the local
  cooperative-account concurrency/RBAC model from Wave 5. Cross-platform and
  remote identity/secret transport remain release-blocking later-wave
  contracts.

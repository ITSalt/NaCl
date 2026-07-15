# Codex plugin Wave 3 local graph gateway evidence — 2026-07-14

Status: VERIFIED for the corrected local Wave 3 implementation and disposable
runtime gates. The first independent security review returned `FAILED/CORRECT`;
its seven findings are addressed by the follow-up commit below. Fresh
independent review and orchestrator acceptance remain separate runbook steps.

## Candidate under test

- Branch: `codex/plugin-03-graph-gateway`
- Integration base: `266f812abf74425e75a7a4693e64f299359d787d`
- Gateway commits:
  `73666b655f0fe3adcf95e5a819211d652febb5bd` and
  `7c0473ff658f9e1772204e0a22946778a5567b6c`
- Lifecycle integration commit:
  `cfd285d429e7d1eed50140056b67357dcd0c825f`
- Recovery and integrated E2E commit:
  `8d76a0c87b5692196db5a5fdb5fb3eef6645e9e8`
- Security/recovery correction commit:
  `b8ac1735de1bf904767f535e768157e4b1bb28bf`
- Plugin version/cachebuster: `0.1.0+codex.20260714154737`
- Migration component/version: `nacl-graph-gateway` / `1`
- Exact migration file SHA-256:
  `320481b3ad98cec6bbbc55ec24b86108c9be9945cbd4fdd3ac78dc14354d4ba7`
- Pinned database image: `neo4j:5.24.2-community`
- Runtime observed: Node.js 24.13.1, macOS arm64; Codex CLI 0.142.0;
  Docker client/server 29.6.1.

No live plugin/marketplace, live Keychain, remote graph, production service,
tag, push, or public release was changed. All Docker mutations used uniquely
named disposable local resources and exact cleanup.

## Implemented boundary

The installed-cache STDIO MCP server now exposes one installation diagnostic
and five graph tools from the same package entry used by CLI and Desktop:

| Tool | Capability | Input boundary |
|---|---|---|
| `nacl_graph_health` | read | explicit `project_id` |
| `nacl_graph_schema_status` | read | explicit `project_id` |
| `nacl_graph_read` | read | packaged named query only |
| `nacl_graph_apply_migrations` | schema-admin | exact `APPLY_MIGRATIONS` confirmation |
| `nacl_graph_write_canary` | write | exact `WRITE_CANARY` confirmation plus idempotency key |

The model cannot supply an endpoint, credential, filesystem path, migration,
or raw Cypher. The gateway consumes only the lifecycle's public
`resolve({projectId})` and `doctor({projectId})` contract, accepts loopback HTTP
profiles only, resolves an opaque `keychain:<service>/<account>` reference,
and executes packaged parameterized statements through Neo4j's transactional
HTTP endpoint. Normal domain writes, raw Cypher, RBAC, leases, and shared-mode
concurrency are not enabled in Wave 3.

Lifecycle state is outside the plugin cache under the user-scoped NaCl state
root. It records no secret and retains the project container, named volume,
endpoint, opaque secret reference, expected schema, and audit path. The
explicit API/CLI provides `init`, `resolve`, `start`, `health`, `stop`,
`doctor`, `backup`, and `restoreVerify`. It does not provide an uninstall or
delete-data action.

## Security and trust-boundary evidence

- Compose binds HTTP and Bolt only to `127.0.0.1`, pins the exact image, uses
  `restart: no`, disables plugin loading, drops every Linux capability, and
  returns only the minimum startup/file capabilities plus `KILL`. `KILL` is
  required because root `tini` must forward SIGTERM to Neo4j UID 7474.
- Instance records and JSONL audit files are created mode 0600. Tests prove
  they contain neither the secret nor a raw idempotency key. Every audit append
  repairs and verifies mode 0600; failure is a non-success result.
- Init is create-only: `/usr/bin/security add-generic-password` is never called
  with `-U`. Before secret or registry creation it audits the attempt and checks
  the exact opaque item plus project-derived container, volume, and network.
  Orphaned state is `BLOCKED` and untouched. Registry names, loopback endpoint,
  image/schema, and secret reference are recomputed before any Docker command.
- If the init attempt audit fails, no secret/registry/Docker side effect occurs.
  If completion audit fails after an effect, init returns
  `PARTIALLY_VERIFIED/AUDIT_COMPLETION_FAILED` with reconciliation guidance.
- Schema/write operations must persist a redacted attempt before mutation.
  An unavailable audit sink blocks mutation; a failed final audit returns
  `PARTIALLY_VERIFIED`.
- Secret values are absent from MCP input/output, Git/package manifests,
  marketplace files, instance records, audit, child argv, and captured logs.
  The process runner rejects a sensitive argv and redacts captured output.
- The real Docker E2E used an injected in-memory provider, not the live
  Keychain. The Keychain provider was exercised with an injected runner: only
  service/account identifiers reach `/usr/bin/security` argv and secret writes
  use stdin.
- ADR-003 explicitly permits the generated Neo4j secret to reach the local
  container through one scoped child environment. The runtime container
  environment contains `NEO4J_AUTH`; a local Docker administrator can inspect
  it and is treated as root-equivalent inside the local pilot trust boundary.
  Keychain remains the durable source and no environment file is written.
  Lifecycle postconditions deliberately inspect only
  `{{json .State}}`; the accepted fields are `Running`, `Status`, `ExitCode`,
  and `OOMKilled`, and that inspection has no secret-bearing configuration.
- Offline dump/load helpers are ephemeral, network-disabled, and mount only
  the selected project/candidate volume and selected backup directory. Restore
  loads a fresh owned volume, verifies it, and removes only the disposable
  candidate. The source volume is never swapped or overwritten.
- MCP JSON Schema, gateway runtime, lifecycle, and CLI share the same strict
  project-ID grammar. A colon is rejected before secret or graph access.

## Schema, write, and ambiguity contract

Migration version 1 adds the unique migration identity and gateway-canary
constraints. Its exact packaged-file SHA-256 is written to
`SchemaMigration {component, version, checksum}` and read back. A repeat reports
the version as already applied; a checksum mismatch is a closed failure.
Health additionally validates required physical constraints and performs a
real parameterized read canary, so a ledger row cannot hide deleted schema.

The confirmed write canary is idempotent. A retry with the same key replays the
same revision and a separate query verifies the result. If a mutation may have
started but the transport outcome, migration completion, read-back, or final
audit is ambiguous, the gateway returns `PARTIALLY_VERIFIED`; it does not
misreport the operation as a final `FAILED` or safe retry.

## Failure-injection matrix

| Condition | Verified disposition |
|---|---|
| Docker executable unavailable / daemon stopped | non-success lifecycle result |
| Loopback port collision | `BLOCKED`/`PORT_COLLISION` |
| Missing or revoked opaque secret | `BLOCKED` |
| Secret rejected by Neo4j | `FAILED` |
| Corrupt registry | `FAILED`/`REGISTRY_CORRUPT` |
| Missing or stale migration | `BLOCKED` |
| Checksum mismatch | `FAILED` |
| Current ledger but missing constraint | `BLOCKED` |
| Confirmation missing | `BLOCKED` |
| Audit pre-write unavailable | `BLOCKED`; no graph mutation |
| Read-back mismatch | `PARTIALLY_VERIFIED` |
| Transport failure after mutation begins | `PARTIALLY_VERIFIED` |
| Docker stop command succeeds but container exits 137 | `FAILED`; backup remains `BLOCKED` |
| `OOMKilled=true` even with exit code zero | `FAILED`; never accepted as clean |
| Restore snapshot mismatch | `FAILED`; owned candidate still cleaned |
| Restore candidate name collision | `BLOCKED`; pre-existing resource untouched |
| Existing Keychain item without registry | `BLOCKED/INIT_ORPHANED_SECRET`; value unchanged |
| Existing derived Docker resources without registry | `BLOCKED/INIT_ORPHANED_RESOURCES`; resources unchanged |
| Forged registry Docker/secret ownership | `FAILED/REGISTRY_CORRUPT`; zero Docker calls |
| Init attempt audit unavailable | `FAILED/AUDIT_UNAVAILABLE`; zero secret/registry effects |
| Init completion audit unavailable after effect | `PARTIALLY_VERIFIED/AUDIT_COMPLETION_FAILED` |
| `project_id` containing colon | rejected consistently before lifecycle resolution |
| Neo4j source/exact tag reports a version other than 5.24.2 | harness `BLOCKED`; never retagged/accepted |
| Restore probe lacks Node.js fetch support | `BLOCKED/RESTORE_RUNTIME_UNSUPPORTED` |

No injected failure returned false `VERIFIED`.

## Real Docker persistence and recovery proof

Command:

```sh
NACL_RUN_DOCKER_SMOKE=1 \
  bash scripts/codex-plugin-ci.sh test:graph-local-e2e
```

Result: exit 0.

1. The corrected lifecycle smoke passed in 32.6 seconds: initialize, start, real write,
   clean stop, replace the plugin cache root, restart, and read the same data.
2. The corrected combined gateway/lifecycle E2E passed in 58.8 seconds: start with
   `SCHEMA_MISSING`, apply migration, idempotent migration repeat, health,
   confirmed write/read-back, idempotent replay, clean stop, offline dump,
   isolated load through an external process running the shipped CLI
   `restore-verify` dispatch, exact structural/functional restore verification,
   cached package copy execution, cached copy removal, restart from durable
   state, and final replay of the original write.
3. Plugin/cache removal did not remove the project volume. Restore verification
   did not mutate the original volume and cleaned its disposable container and
   volume.
4. The final explicit scan found no `nacl-graph-*` or `nacl-restore-*`
   containers, no `nacl_graph_*` or `nacl_restore_*` volumes, no owned Compose
   networks, and no temporary `neo4j:5.24.2-community` tag.

The external CLI restore process used the production parser/dispatcher and
default package-local restore probe. It recomputed counts, label and
relationship histograms, constraints, indexes, migration checksum, packaged
gateway-canary digest, and a transactional create/read/delete smoke. The test
injected only the secret provider at the process boundary so the live Keychain
was not mutated; the fixture secret was present only in a scoped child
environment and absent from argv, stdout, and stderr.

Before any fallback retag, the harness executed the mutable local source and
required exact output `5.24.2`. The accepted underlying local identity was
`sha256:2e7e4eea5bc1eec581a3097c018dfeb3747f3638e67a963c10554825c31c1425`,
repo digest
`neo4j@sha256:2e7e4eea5bc1eec581a3097c018dfeb3747f3638e67a963c10554825c31c1425`,
created `2024-10-15T14:23:38Z`, Linux arm64, with no image labels. The exact
tag was required to resolve to the same ID and was removed after the test.

The first real offline-backup attempt exposed two genuine shutdown defects and
was not counted as success. Docker's default ten-second stop escalated to
SIGKILL while still returning command exit zero. After adding `--time 120` and
post-inspection, the hardened Compose profile exposed a second failure:
`cap_drop: ALL` prevented root `tini` from forwarding SIGTERM to Java UID 7474,
and the container exited 1 without `Stopping`/`Stopped`. The final fix adds only
`CAP_KILL`, then requires `status=exited`, `ExitCode=0`, and
`OOMKilled=false` before backup. The real dump/load passed only after those
postconditions were satisfied.

## Package/cache and regression evidence

| Command | Result |
|---|---|
| `bash scripts/codex-plugin-ci.sh test:contracts` | exit 0; 230 Node tests, 228 passed, two opt-in Docker tests skipped; all tracked shell suites and syntax checks passed |
| `bash scripts/codex-plugin-ci.sh test:graph-unit` | exit 0; 37/37 gateway/lifecycle/security/image tests passed |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:graph-local-e2e` | exit 0; both real Docker tests passed |
| `bash scripts/codex-plugin-ci.sh test:plugin-manifest` | exit 0; pinned official validator accepted the package |
| `bash scripts/codex-plugin-ci.sh test:plugin-package` | exit 0; 10 entry skills plus 55/55 package/protocol/adversarial tests passed |
| `bash scripts/codex-plugin-ci.sh test:plugin-closure` | exit 0; 330 files, 10 public skills, 60 internal workflows, 310 inline paths, 22 command paths, 59 provenance paths, two source-only annotations |
| `bash scripts/codex-plugin-ci.sh test:cli-plugin --output <temporary-report>` | exit 0; source unavailable, installed-cache execution, version/cachebuster and 10 entry skills verified |
| `bash scripts/codex-plugin-ci.sh test:cli-legacy` | exit 0; 60 created, 60 idempotent; legacy-only/both/neither diagnostics verified |
| `bash scripts/codex-plugin-ci.sh test:codex-skills` | exit 0; existing 60/60 Codex skills validated |
| `bash scripts/codex-plugin-ci.sh test:claude-isolation` | exit 0; 62 frozen roots and identical frozen manifest hash |
| `sh skills-for-codex/scripts/check-root-codex-sync.sh 266f812... HEAD` | exit 0; verified allowlisted Codex-only difference |
| `git diff --cached --check` | exit 0 |

The source-unavailable CLI report recorded:

```text
status=VERIFIED
sourceUnavailable=true
pluginVersion=0.1.0+codex.20260714154737
executionLocation=installed-cache
entrySkillCount=10
modelBackedRouting.status=NOT_RUN
```

The CI dispatcher exposes `test:graph-unit` and an explicitly authorized
`test:graph-local-e2e`. Without `NACL_RUN_DOCKER_SMOKE=1`, the real Docker gate
returns `BLOCKED`/exit 2. `test:multi-project`, `test:multi-user`, and
`test:candidate` also return explicit later-wave `BLOCKED`/exit 2 rather than
false success.

## ADR disposition

ADR-003 accepts for the macOS local pilot:

- the cache-relative STDIO MCP server plus dependency-free loopback Neo4j HTTP
  gateway;
- a Keychain opaque-reference secret contract with scoped runtime delivery;
- distinct read, write, and schema-admin tools with confirmation, audit,
  transaction, and read-back;
- ordered checksum-ledgered additive migration;
- offline Community dump and non-destructive candidate restore verification.

## Known limitations and next-wave obligations

- The minimum supported Node.js 20 guard was not executed on a Node 20 host;
  Node.js 24.13.1 was exercised.
- The live macOS Keychain was not mutated. Missing/revoked/rejected paths and
  create-only/existing/revoked/rejected paths and provider argv/stdin behavior
  were verified with injected providers/runners. The real external-process CLI
  restore gate likewise used an injected in-memory provider; it proves shipped
  CLI dispatch and restore logic, not live Keychain integration.
- The Wave 3 build was not installed into the user's live marketplace/cache.
  A new live Desktop graph-tool discovery/approval call is `NOT_RUN`; the same
  manifest-declared cached MCP server owns CLI and Desktop schemas, and the
  protocol/package parity is deterministic, but no fresh Desktop claim is made.
- Model-backed `codex exec` routing is `NOT_RUN` in the isolated CLI cache gate.
- Multi-project routing/negative isolation is Wave 4. Multi-user RBAC,
  provenance, leases, fencing, CAS, and ID allocation are Wave 5. The Wave 3
  canary is not a substitute for either contract.
- GitHub-hosted CI was not run. The real Docker evidence is local on the target
  Mac only.
- Remote/private production transport, deployment, upgrade, rollback, and
  monitoring are later waves and remain `NOT_RUN`.
- Before a public release, revisit Docker secret/file delivery if the pinned
  Neo4j image supports it without weakening cache portability or recovery.
  The accepted scoped-container-environment trade-off is local-pilot evidence,
  not a claim that Docker-admin inspection hides the credential.

No merge to `main`, push, tag, publication, live reinstall, live marketplace
change, production mutation, or destructive cleanup was performed.

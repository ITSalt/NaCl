# Codex plugin Wave 5 multi-user consistency evidence — 2026-07-14

Status: READY FOR FRESH INDEPENDENT REVIEW. This document records implementing-
worker evidence for the orchestrator and an independent verifier. It is not an
`ACCEPT` decision, does not update the runbook ledger, and does not authorize a
merge, push, tag, publication, or live installation.

## Candidate under test

- Branch: `codex/plugin-05-concurrency`
- Integration base: `0f2886ab49c0cae582112bb17676ee11c60b1bc1`
- Authorization commit: `378bc208b1679d4dacc7caa417f02a0ea20b3b2f`
- Implementation commit: `04a467eeda118e1619a6c5252e3c616b4b92f143`
- First correction commit: `566eb16c7326fdc87876237fe2b9a92496d5d004`
- First correction evidence/ADR commit:
  `b55155efeb0910ff15fb0fd151e9a0cce12c8124`
- Second correction commit: `e75bda1ccaf94f4ad5a2e615b3980fab414415ec`
- Plugin version/cachebuster: `0.1.0+codex.20260714224224`
- Graph schema: version 3, migration checksum
  `a0f6a5925eae88ae59e00baf056b1a29750ec40d97cfef7bdfd018f993bb40b2`
- Pinned database image: `neo4j:5.24.2-community`
- Observed runtime: Node.js 24.13.1, macOS arm64, Codex CLI 0.142.0,
  Docker client/server 29.6.1.

No live marketplace/cache, live Keychain, production graph, user data, remote
service, public state, or Claude distribution was modified. Runtime evidence
used uniquely named disposable Docker resources and an in-memory secret
provider, followed by exact cleanup.

## Independent-review result and correction scope

The first independent review of implementation commit
`04a467eeda118e1619a6c5252e3c616b4b92f143` returned `FAILED/CORRECT`.
It did not accept Wave 5. The correction was required for two blocking groups:

1. the five pre-existing graph tools did not all enforce the new trusted
   principal, authoritative project membership, role matrix, capability
   approval, and schema lease/fence boundary; and
2. lease acquire, heartbeat, release, and handoff did not have one exact
   immutable idempotency result ledger, so replay/conflict/PENDING paths could
   touch lock counters or observe current rather than original results.

Correction commit `566eb16c7326fdc87876237fe2b9a92496d5d004`
addressed those groups and bumped the cachebuster. That first correction was
submitted for the fresh review recorded below. No previous or current evidence
in this file is an `ACCEPT` decision.

The fresh independent review of first-correction evidence commit
`b55155efeb0910ff15fb0fd151e9a0cce12c8124` also returned `FAILED/CORRECT`.
It found one separate blocking lifecycle-routing defect: after a successful
bootstrap, a graph with a readable prior schema ledger was correctly diagnosed
as `SCHEMA_STALE`, but `validateProfile` allowed schema handoff only for
`membership-bootstrap`. The public tools needed to acquire the exclusive
`SchemaMigration/MIG-GATEWAY` lease and apply the additive migration were
therefore rejected before trusted-principal, RBAC, fence, DDL, or metadata
logic could run.

Second correction commit `e75bda1ccaf94f4ad5a2e615b3980fab414415ec`
passes the already validated input into the lifecycle profile check and opens
only this stale-schema recovery corridor: acquire, heartbeat, release, or
handoff of the exact `SchemaMigration/MIG-GATEWAY` resource, plus
`apply-migrations`. `SCHEMA_MISSING` still opens only the initial-admin
bootstrap; every ordinary stale operation remains closed. Existing trusted
principal, membership, role, approval, idempotency, live fence, fixed DDL, and
pre/post authorization checks remain downstream and unchanged. The correction
also adds an additive version-3 constraint for the project-scoped schema
resource identity and a real v2-to-v3 lifecycle transition. Fresh independent
acceptance of this second correction remains pending; no `ACCEPT` has been
recorded.

## Outcome implemented

Wave 5 adds graph-authoritative multi-session coordination without changing
the 10 public entry skills or the 60 packaged workflow texts:

```text
trusted runtime principal + strict request identity
                    |
                    v
same-transaction ProjectMembership authorization
                    |
                    v
generic ResourceLease (TTL + heartbeat + fencing)
                    |
                    +--> revision CAS + exact idempotency + provenance
                    |
                    +--> atomic project/type sequence + typed create
                    |
                    +--> explicit handoff; no offline write queue
```

The MCP package exposes 14 graph tools: the five legacy tools plus these nine
Wave 5 tools:

| Tool | Purpose |
|---|---|
| `nacl_graph_derive_worker_identity` | derive the strict session worker from trusted principal/client/session |
| `nacl_graph_claim_resource` | acquire or renew one protected resource lease |
| `nacl_graph_heartbeat_resource` | extend an unexpired current lease |
| `nacl_graph_release_resource` | release only the current fenced lease |
| `nacl_graph_handoff_resource` | explicitly transfer ownership and increment the fence |
| `nacl_graph_mutate_resource` | allowlisted mutation with current fence, revision CAS, and idempotency |
| `nacl_graph_allocate_id` | atomically allocate/create/lease a typed resource |
| `nacl_graph_bootstrap_admin` | one-time initial project-admin creation |
| `nacl_graph_set_membership` | admin-only grant/change/revoke with revision CAS |

No tool accepts raw Cypher, endpoint, secret, caller role, or caller membership.
All normal mutation statements are fixed named parameterized Cypher. Dynamic
resource labels appear only in the server-owned seven-value catalog, never from
unchecked caller text.

## Trusted principal and identity boundary

The production local resolver binds the request to the current numeric OS
account as `local-os:<uid>`. The request's `principal_id` must match the
server-resolved value before `transport.execute` can run. A caller cannot gain
an existing `project_admin` membership by writing that principal into input.
The model and real-Docker spoof probes asserted `PRINCIPAL_MISMATCH` and exactly
zero graph calls.

`worker_id` is derived from principal, client, and session. Worktree, branch,
full base SHA, and optional HTTPS pull request metadata are separate validated
provenance. Two sessions of one principal therefore have different workers and
cannot use same-user re-entrancy to share a lease.

The Docker harness uses an explicit `trusted-test-harness` resolver injected at
the server dependency boundary so several principals can be exercised. That
resolver is not exposed by the MCP schema or enabled by the production server.

This is a local cooperative-account boundary, not hostile same-account
isolation. A process already running as the same OS account is within the same
principal boundary. A Docker administrator is root-equivalent for the local
containers and volumes. Remote identity proof, service-to-service tokens, and
hostile tenant isolation remain out of scope.

## Bootstrap and authorization semantics

`nacl_graph_bootstrap_admin` is the only zero-membership provisioning path. It
requires full derived identity, a principal resolved at the trusted server
boundary, an idempotency key, and exact confirmation
`CONFIRM_INITIAL_PROJECT_ADMIN`. Initial provisioning is deliberately split
across fixed Neo4j boundaries:

1. inspect the guard and prove that authoritative membership count is zero;
2. if the project is truly uninitialized, execute the single fixed idempotent
   `ProjectAuthorization(project_id)` unique-constraint statement needed to
   make guard creation serializable;
3. atomically create/write-lock the guard, move it to `PREPARING`, bind the
   exact principal/worker/key, and advance a monotonic bootstrap fence;
4. before and after every fixed schema DDL, ledger, and constraint-read
   boundary, re-prove `PREPARING`, exact owner/key/fence, and zero memberships;
5. in one final transaction, create the revision-1 `project_admin`, create the
   `MIG-GATEWAY` schema resource, complete the idempotency record, and change
   the guard to `BOOTSTRAPPED`.

The exact `PREPARING` owner/key can recover after interruption without
advancing the fence. The exact completed key replays; a different owner/key,
any membership, or a bootstrapped/unknown guard state fails closed. Ten real
concurrent contenders produced one acceptance, nine disabled results, one
membership, and one bootstrapped guard.

All graph operations other than identity derivation now require full identity
and trusted-principal agreement; identity derivation validates the trusted
principal/client/session inputs and returns the derived worker. The five legacy
tools use the same authoritative role matrix as the Wave 5 tools: health,
schema status, and named reads require `project.read`; the write canary requires
`project.write` plus `APPROVE_PROJECT_WRITE`; migrations require
`project_admin`/`schema.admin`, `CONFIRM_SCHEMA_ADMIN`, `APPLY_MIGRATIONS`, and
the live owner/fence of the exclusive `SchemaMigration/MIG-GATEWAY` lease.
Missing, inactive, cross-project, revoked, or role-ineligible memberships all
return the same closed access/resource result.

Normal writes lock and read `ProjectMembership` in the same transaction. The
server resolves every capability-to-role allowlist. Membership updates are
admin-authorized in that same transaction, revision-CAS, exact-idempotent, and
audited. A concurrent revoke and resource write serialize: either the write
commits with the old membership revision before the revoke, or the revoke
commits first and the write is denied. The last active project administrator
cannot be revoked or demoted.

There is no longer an unauthenticated migration or write-canary setup route.
Initial schema creation belongs only to the fenced zero-membership bootstrap.
Every later migration uses the administrator membership plus live schema lease
checks before and after each DDL/ledger/constraint boundary. The write canary
uses the ordinary project-write membership path and its read-back uses the
ordinary project-read path.

## Lease, fencing, CAS, ID, and idempotency model

The additive v2 migration creates unique keys for:

- `ProjectAuthorization(project_id)`;
- `ProjectMembership(project_id, principal_id)`;
- `ResourceLease(project_id, resource_type, resource_id)`;
- `IdSequence(project_id, entity_kind)`;
- `IdempotencyRecord(project_id, key_hash)`.

The additive v3 migration adds the missing project-scoped identity for the
leaseable schema resource itself:

- `SchemaMigration(project_id, id)`.

Versions 1 and 2 remain exact readable descriptors. A v2 ledger is therefore
diagnosed as `SCHEMA_STALE`, not checksum corruption, and can be advanced only
through the exact administrator-owned `MIG-GATEWAY` recovery corridor.

The generic lease protects `Task`, `UseCase`, `Module`, `FeatureRequest`,
`Board`, `SchemaMigration`, and `ReleaseEnvironment`. Each resource type maps
to one server-owned capability, fixed ID prefix, and narrow mutable-property
allowlist. Lease identity retains principal, client, session, worker, worktree,
branch, base SHA, optional PR, membership revision, timestamps, and a monotonic
fencing token.

Expiry is inclusive: `expires_at == now` permits takeover and increments the
fence. Heartbeat, release, handoff, and mutation require the current unexpired
principal/worker/token. A stale worker cannot mutate, heartbeat, or release
after takeover. Explicit handoff requires a different derived worker plus a
resource/target-bound confirmation and increments the fence.

Protected resources use integer `revision`. Mutation verifies the current
lease and `expected_revision`, applies the allowlisted patch, increments the
revision, persists provenance, and completes the idempotency result in one
transaction. A stale revision returns `CONFLICT` with current revision and no
partial property mutation. Repeating the same key/payload returns the original
result; changing the payload under that key returns `IDEMPOTENCY_CONFLICT`.

Acquire, heartbeat, release, and handoff now share one exact transaction
shape. Authoritative membership and resource existence are checked before the
idempotency record. A newly created request either applies its lease mutation
and stores the terminal result, or stores the terminal semantic rejection such
as `LEASE_HELD`; transaction failure rolls both back. An exact retry returns
only the stored code, acceptance bit, owner, fence, expiry, provenance, and
membership revision even if the live lease later changes. Same key plus a
different semantic payload returns `IDEMPOTENCY_CONFLICT`. An existing
`PENDING` record returns `BLOCKED/IDEMPOTENCY_INCOMPLETE` with explicit
administrator reconciliation instead of guessing or taking over. Membership,
request, and lease serialization use property-preserving writes, so replay,
payload conflict, and incomplete-ledger rejection leave complete graph
property snapshots unchanged. Semantic TTL is hashed; retry time and computed
expiry are not.

Allocation locks one project/type sequence, scans past pre-existing fixed-width
IDs, allocates the next 12-digit suffix, creates the typed entity, applies the
allowlisted initial values, creates fencing token 1, and completes idempotency
in one transaction. Projects and entity kinds have independent sequences.

The graph remains authoritative. Shared-mode local state is derived-only and
offline writes are disabled. Neo4j transient transaction errors and HTTP 429
map to retryable `GRAPH_BACKPRESSURE`; the caller must retain the same
idempotency key, payload, and logical clock for a bounded retry.

## Real Wave 5 Docker proof

Final command:

```sh
NACL_RUN_DOCKER_SMOKE=1 \
  bash scripts/codex-plugin-ci.sh test:multi-user
```

Result on second correction commit
`e75bda1ccaf94f4ad5a2e615b3980fab414415ec`: exit 0. The
authorization/model prelude passed 28/28. Both real Neo4j tests passed 2/2:
the existing concurrency test in 31.1 seconds and the new stale-schema
transition in 22.4 seconds. The concurrency test verified:

1. fixed initial schema bootstrap, all five version-2 constraints, the new
   version-3 schema-resource constraint, and external metadata advancement
   from readable prior descriptors;
2. ten simultaneous bootstrap calls: one accepted, nine permanently disabled,
   plus exact winning-key recovery/replay;
3. every one of the six roles against every one of the five legacy graph tools;
4. principal spoof rejection before graph access for all five legacy tools;
5. missing, inactive, cross-project, and revoked membership denial, including
   real legacy read and write revocation;
6. authenticated write canary and post-bootstrap migration only with
   project-admin membership plus the current `MIG-GATEWAY` lease/fence;
7. ten simultaneous resource claims: one owner and nine terminal
   `LEASE_HELD` results, plus two sessions of one principal as distinct workers;
8. exact TTL-boundary takeover from fence 1 to fence 2 and stale mutate,
   heartbeat, and release denial;
9. exact acquire/heartbeat/release/handoff replay after later lease changes,
   immutable terminal rejection, and changed-payload conflict with byte-for-
   byte-equivalent full property snapshots;
10. injected transaction rollback leaving no idempotency record, injected lost
    response after commit replaying exactly, and pre-existing `PENDING` returning
    closed administrator-reconciliation status without mutation;
11. accepted mutation, exact replay, changed-payload conflict, stale-CAS
    conflict, and unchanged read-back after rejection;
12. all seven resource kinds with independent protected leases and explicit
    handoff/fence increment;
13. revoke-versus-write serialization, membership replay/conflict/stale-CAS,
    ordinary-role admin denial, and last-admin protection;
14. 1,000 typed allocations with exact sequence/entity/lease/idempotency counts,
    unique contiguous IDs, replay, payload conflict, and project/type isolation;
15. empty-row, transport, and authorization-loss outcomes closing without a
    false final success; and
16. exact removal of disposable container, volume, network, and temporary exact
    image tag.

The second real test creates a genuine prior-version state through public
gateway behavior: version-1 and version-2 migrations are ledgered, the initial
project administrator and `MIG-GATEWAY` resource exist, and the current
lifecycle doctor reports exactly `BLOCKED/SCHEMA_STALE` with required version
3. It then proves:

1. an ordinary `Task` lease request remains closed as `SCHEMA_STALE`;
2. a revoked administrator cannot acquire the schema resource;
3. the active administrator can acquire `SchemaMigration/MIG-GATEWAY` through
   the public stale corridor, with fence 1;
4. fence 2 is rejected before migration 3 or its constraint appears;
5. the public migration call with fence 1 applies only version 3 and reports
   versions 1 and 2 as already applied;
6. the exact v3 checksum and `nacl_schema_resource_identity` constraint read
   back from Neo4j;
7. lifecycle `recordSchema` returns `VERIFIED/SCHEMA_METADATA_RECORDED`, the
   instance and project registry expose version 3, and doctor changes to
   `VERIFIED/GRAPH_HEALTHY`;
8. the same public release tool remains usable after the lifecycle returns to
   the normal verified path, followed by verified gateway health.

Paired focused failure injections additionally prove that a stale-migration
query failure remains final `FAILED/QUERY_FAILED` before its DDL succeeds,
while an external metadata-recording failure after graph migration remains
`PARTIALLY_VERIFIED/SCHEMA_METADATA_PARTIAL`.

The 1,000-request burst is deliberately reported as retry-safe, not as 1,000
first-attempt successes. The final second-correction gate observed seven initial
transient deadlock/backpressure results; all retried once in a second round
with the same key/payload and the final counts were exactly 1,000. Earlier
successful correction runs exercised larger transient sets as well. No
concurrency, TTL, idempotency, or full-property snapshot assertion was reduced
to make the test pass.

After the final Wave 5, Wave 4, and Wave 3 Docker gates, explicit inspection
reported:

```text
owned_containers=0
owned_volumes=0
owned_networks=0
neo4j_exact_tag=absent
```

## Wave 3 and Wave 4 runtime regressions

The preceding local graph behavior was rerun sequentially against the version-3
schema:

```sh
NACL_RUN_DOCKER_SMOKE=1 \
  bash scripts/codex-plugin-ci.sh test:graph-local-e2e

NACL_RUN_DOCKER_SMOKE=1 \
  bash scripts/codex-plugin-ci.sh test:multi-project
```

Results:

- Wave 3 lifecycle persistence/cache-root replacement: 1/1 in 34.1 seconds;
- Wave 3 gateway migration/data restart/offline backup/external restore/cache
  replacement/uninstall: 1/1 in 73.2 seconds;
- Wave 4 unit prelude: 11/11;
- Wave 4 two-project credential/schema/data/lifecycle/backup/reinstall
  isolation: 1/1 in 49.3 seconds.

All suites assert exact cleanup. The version-1 instance and project metadata
remain readable only for additive upgrade; the gateway records the verified
version-3 descriptor atomically after migration. A dedicated unit test starts
with v1 instance/registry metadata and reads back the current descriptor in
both stores, while the real stale test advances a v2 graph ledger to v3.

## v2.23.0 remote and Claude isolation regression

Wave 5 did not modify `.claude/**`, frozen root skill packages, the root
`nacl-core/scripts/claim-task.mjs`, or its packaged transport copy. Evidence:

- `cmp` proves the root and packaged claim transport are byte-identical;
- `node --test nacl-core/scripts/claim-task.test.mjs` passes 7/7, including
  single conditional claim, TTL, provenance, release-only-my-claim, and
  deterministic query behavior;
- `test:claude-isolation` verifies 62 frozen roots with identical base and
  candidate manifest hash
  `cb85ebb130277286b5e0fbb7efd240575544c490`;
- `sh skills-for-codex/scripts/check-root-codex-sync.sh 0f2886ab49c0cae582112bb17676ee11c60b1bc1 HEAD`
  returns `VERIFIED` with only the existing `nacl-tl-core` Codex-only allowlist;
- `test:codex-skills` validates the existing 60/60 Codex skills.

This proves the existing local/remote v2.23 claim contract was not replaced by
the new plugin gateway. It does not claim a new production remote multi-user
transport.

## Package, contract, cache, and isolation evidence

| Command | Result |
|---|---|
| `bash scripts/codex-plugin-ci.sh test:contracts` | exit 0; 284 Node tests: 279 passed, five authorized Docker skips; tracked shell suites passed 13/13, 3/3, 10/10, and 4/4; shell syntax passed |
| `bash scripts/codex-plugin-ci.sh test:graph-unit` | exit 0; 88/88 authorization, concurrency, gateway, lifecycle, routing, isolation, and image tests |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:multi-user` | exit 0; 28/28 unit/model plus 2/2 real Docker |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:multi-project` | exit 0; 11/11 unit plus 1/1 real two-project Docker |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:graph-local-e2e` | exit 0; both Wave 3 real Docker regressions |
| `bash scripts/codex-plugin-ci.sh test:plugin-package` | exit 0; 10 public skills and 62/62 package/protocol/adversarial tests |
| `bash scripts/codex-plugin-ci.sh test:plugin-manifest` | exit 0; pinned official validator accepted the package |
| `bash scripts/codex-plugin-ci.sh test:plugin-closure` | exit 0; 343 files, 10 public skills, 60 internal workflows, 310 inline paths, 22 command paths, 59 provenance paths, two source-only annotations |
| `bash scripts/codex-plugin-ci.sh test:cli-plugin` | exit 0; source unavailable, versioned installed-cache execution, 10 entry skills, Codex CLI 0.142.0 |
| `bash scripts/codex-plugin-ci.sh test:cli-legacy` | exit 0; 60 created, 60 idempotent, unchanged hashes; all install modes diagnosed |
| `bash scripts/codex-plugin-ci.sh test:codex-skills` | exit 0; existing 60/60 skills |
| `bash scripts/codex-plugin-ci.sh test:claude-isolation` | exit 0; 62 frozen roots, exact frozen manifest hash |
| `sh skills-for-codex/scripts/check-root-codex-sync.sh 0f2886ab49c0cae582112bb17676ee11c60b1bc1 HEAD` | exit 0; root/Codex response policy verified |
| `cmp -s nacl-core/scripts/claim-task.mjs plugins/nacl/resources/nacl-core/scripts/claim-task.mjs` | exit 0; root and packaged v2.23 claim transport are byte-identical |
| `node --test nacl-core/scripts/claim-task.test.mjs` | exit 0; 7/7 |
| `git diff --check` | exit 0; no whitespace errors |

The source-unavailable CLI report recorded:

```text
status=VERIFIED
sourceUnavailable=true
pluginVersion=0.1.0+codex.20260714224224
executionLocation=installed-cache
entrySkillCount=10
modelBackedRouting.status=NOT_RUN
```

Without `NACL_RUN_DOCKER_SMOKE=1`, `test:multi-user` runs the non-mutating
28-test prelude and then returns `BLOCKED`/exit 2 instead of fabricating runtime
evidence.

## ADR disposition proposed to the verifier

ADR-003 now records the corrected candidate decision for a local cooperative
multi-user pilot:

- OS-bound principal verification before graph access and strict
  principal/client/session/worker/worktree separation;
- one-time serialized initial-admin bootstrap and authoritative project RBAC;
- seven-type generic leases, TTL/heartbeat/release/handoff, fencing, revision
  CAS, exact idempotency, atomic IDs, and complete principal/worker/Git
  provenance;
- graph-authoritative shared mode with derived-only local cache and no offline
  write queue;
- bounded retry semantics for actual Neo4j backpressure/deadlocks.

Both independent `FAILED/CORRECT` reviews required the separate corrections
recorded above. A fresh independent verifier must decide whether second
correction commit `e75bda1ccaf94f4ad5a2e615b3980fab414415ec` and the ADR
disposition are acceptable. This document does not make or imply that decision.

## Known limitations and NOT_RUN obligations

- The Wave 5 build was not installed into the user's live marketplace/cache.
  Fresh Desktop discovery, OS-principal presentation, approvals, bootstrap,
  membership administration, and protected write/read-back are `NOT_RUN`.
- The live macOS Keychain was not mutated. Docker tests used an injected memory
  provider; prior Wave 3 evidence covers the Keychain adapter contract.
- Node.js 20 is the enforced minimum but was not exercised. Node.js 24.13.1 was
  used locally.
- Model-backed `codex exec` routing is `NOT_RUN` in the isolated cache gate.
- GitHub-hosted CI was not run. All Docker evidence is local on the target Mac.
- The local OS account is the principal trust boundary. Same-account processes
  are not isolated from each other, and Docker administrators are
  root-equivalent. Remote identity and hostile-tenant authentication require a
  different production resolver and transport.
- Neo4j schema DDL and `SHOW CONSTRAINTS` cannot be nested after the membership
  query in one data transaction. The gateway therefore surrounds each fixed
  DDL/constraint boundary with exact pre/post bootstrap-guard or administrator-
  lease checks. Revocation, expiry, or a crash between a successful precheck
  and DDL cannot roll that DDL back. A failed postcheck returns
  `PARTIALLY_VERIFIED`, stops before advancing the ledger, and requires explicit
  schema/ledger reconciliation before retry.
- The fixed idempotent `ProjectAuthorization(project_id)` uniqueness constraint
  must exist before a unique `PREPARING` guard can serialize first bootstrap.
  It is the sole zero-membership DDL exception before `PREPARING`; it is allowed
  only after trusted-principal validation and a zero-membership/uninitialized
  inspection. A crash after that constraint but before guard preparation leaves
  no administrator and is recoverable by the same normal bootstrap path.
- High-concurrency completion may require bounded exact-idempotency retries;
  first-attempt completion is not guaranteed or claimed.
- Current mutable-property allowlists are narrow and workflow-facing adoption
  remains Wave 6. Agent profiles were not created or modified.
- No merge, push, tag, publication, live reinstall, production mutation, or
  destructive user-data cleanup was performed by this worker.

Fresh independent review should rerun the unit and real Docker gates, inspect
the trusted principal/bootstrap exception and exact stale-schema recovery
corridor, and return `ACCEPT`, `ACCEPT WITH CORRECTIONS`, or `REJECT` under the
runbook.

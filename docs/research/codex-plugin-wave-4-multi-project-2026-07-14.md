# Codex plugin Wave 4 multi-project isolation evidence — 2026-07-14

Status: READY FOR FRESH INDEPENDENT REVIEW. The first independent review of
`6b07627ac130ab64b56808d83005e3528ca26be9` returned `FAILED/CORRECT` with four
release-blocking findings. The implementing worker corrected those findings
and reran the local and disposable runtime gates. This document is evidence for
a fresh independent verifier and the orchestrator; it is not an `ACCEPT`
decision and does not replace either runbook step.

## Candidate under test

- Branch: `codex/plugin-04-multi-project`
- Integration base: `9b97cb862e5a369a76f736a2bba1a1d4391391be`
- Implementation commit: `0316a80a9d6334dd2d0c35a6d10fdf745837dedd`
- Initial evidence commit reviewed: `6b07627ac130ab64b56808d83005e3528ca26be9`
- Correction commit: `48bf2178eefe0fc73fe0e14d2779119ab6a1791e`
- Plugin version/cachebuster: `0.1.0+codex.20260714195056`
- Pinned database image: `neo4j:5.24.2-community`
- Runtime observed: Node.js 24.13.1, macOS arm64; Codex CLI 0.142.0;
  Docker client/server 29.6.1.

No live marketplace/cache, live Keychain, remote graph, production service,
tag, push, public release, or user data was changed. Docker evidence used only
uniquely named disposable local resources and an injected in-memory secret
provider, followed by exact cleanup.

## Initial independent review and correction

The first independent verifier correctly rejected four implementation gaps:

1. Valid project and instance JSON was not bound to the project ID in its
   filename, so a B record placed under A's path could be accepted.
2. Config migration checked device/inode but did not compare exact file bytes
   immediately before the atomic replacement.
3. Lifecycle scope failures could create or append the audit path named by an
   unvalidated caller-supplied project ID.
4. CLI normalized a raw relative `--project-root` with `path.resolve()` before
   validating it, so relative input crossed the CLI boundary.

Regression tests were written before the production correction. The focused
RED run collected 33 tests: 28 passed and the five new carrier assertions
failed for the expected reasons above. After the correction, the identical
focused command passed 33/33. Expanded graph unit coverage passes 55/55. Fresh
independent review of the correction is pending.

## Implemented routing boundary

```text
Codex / CLI / Desktop MCP
        |
        v
project resolve / migrate / register-root tools
        |
        v
canonical root + config + Git lineage + strict external registry
        |
        v
explicit project_id + explicit absolute project_root on every graph call
        |
        v
per-project lifecycle record + secret reference + Docker identity
        |
        v
project/route/secret-keyed transport pool -> isolated Neo4j container/volume
```

The installed-cache STDIO MCP server adds three project-identity tools and
requires explicit `project_id` plus absolute `project_root` on every graph
tool:

| Tool | Capability | Fail-closed boundary |
|---|---|---|
| `nacl_project_resolve` | read | presents legacy migration, never writes or guesses |
| `nacl_project_migrate_identity` | write | exact UUID-bound confirmation, bytes/digest/metadata checks and read-back |
| `nacl_project_register_root` | write | exact ID-bound confirmation and Git-lineage validation |

There is no last-used project. If the caller omits a root while multiple roots
are registered, resolution returns `AMBIGUOUS_PROJECT`. A graph operation
cannot select a project from conversation history, current directory, or a
shared transport cache.

## Project identity and external registry

`project.id` is a generated UUIDv4. It is not derived from path, name, user,
machine, branch, or worktree. A legacy resolve presents the UUID and exact
confirmation `MIGRATE_PROJECT_ID:<uuid>` without modifying config or external
state. Confirmed migration inserts only the new identity into the existing
`project:` mapping and preserves all other bytes, comments, BOM, line endings,
and file mode. The migration captures exact UTF-8 bytes, SHA-256, device,
inode, and mode through a no-follow regular-file handle. It reopens and compares
the exact snapshot before temporary-file creation and again immediately before
the atomic rename, then performs post-write read-back.

If config persistence succeeds but external registry creation cannot complete,
the result is `PARTIALLY_VERIFIED/PROJECT_MIGRATION_PARTIAL`; the recovery is a
separate confirmed `project_register_root` call. Read operations never repair
or normalize state silently.

The strict registry is outside both source and plugin cache at
`~/.nacl/codex/local-graph/.project-registry`. It records only:

- project ID and canonical absolute root aliases;
- graph mode/profile and loopback endpoint reference;
- opaque Keychain reference, never a secret;
- schema version and exact last health status;
- a Git root-lineage fingerprint used to reject an ID copied into an unrelated
  repository.

Unknown fields, malformed or duplicate IDs, a symlinked config, stale alias,
changed bytes/metadata, root/config/registry disagreement, or unrelated Git
lineage are treated as corruption or conflict. A registry record and durable
instance record must also contain the exact project ID encoded by their
filename before list, health, lifecycle, or Docker access. A clone or Git
worktree with matching root lineage can explicitly register the same ID.
Filesystem symlink aliases reduce to the same canonical root and never create a
second route. Non-Git roots are blocked in this pilot instead of receiving a
weaker path- or machine-derived identity.

## Physical isolation and transport ownership

Every lifecycle operation revalidates the explicit ID and root against config
and registry, then validates the exact instance filename/record binding, before
creating an attempt audit or accessing secrets, Docker, or the graph. A
rejected, missing, mismatched, or unregistered scope returns without an
`auditPath` and without per-project file mutation. After scope validation,
every lifecycle operation records its project-specific attempt before Docker,
secret, health, backup, restore, or instance mutation. The lifecycle and
project tools share the same default registry root.

Compose project, container, persistent volume, network, loopback ports,
instance record, audit path, and Keychain account are derived from the project
ID. The Neo4j HTTP transport pool is keyed by project ID plus exact route,
opaque secret reference, and credential fingerprint. A transport created for B
cannot be returned under A's key; substituting B's secret reference under A is
rejected as `PROJECT_SECRET_MISMATCH` before graph access.

Community Edition retains one container and persistent volume per project. It
does not emulate tenant separation inside one database, so existing global
NaCl IDs and constraints remain physically independent.

## Fail-closed matrix

| Condition | Verified disposition |
|---|---|
| Legacy project resolved without confirmation | presentation only; zero writes |
| Confirmation for another generated UUID | `BLOCKED`; zero config/registry writes |
| Config source/inode changes after presentation | `BLOCKED`; no migration commit |
| Same-inode config bytes change immediately before rename | `BLOCKED/PROJECT_CONFIG_CHANGED`; user bytes retained; no registry/temp residue |
| Config write succeeds but registry completion fails | `PARTIALLY_VERIFIED` with explicit recovery |
| Raw relative CLI `project_root` (`.`, `..`, `repo`) | `FAILED/PROJECT_ROOT_INVALID` before resolution for all project/lifecycle commands |
| Missing root with multiple aliases/projects | `AMBIGUOUS_PROJECT` |
| Root symlink alias | canonicalized to the registered real root |
| Symlinked project config | rejected |
| Stale, forged, or copied unrelated root/ID | rejected before secret/Docker access |
| Malformed, duplicate, or extra registry fields | `REGISTRY_CORRUPT` |
| Valid B project registry JSON stored under A filename | `PROJECT_REGISTRY_CORRUPT`; list/resolve/updateHealth perform zero rewrite |
| Valid B instance JSON stored under A filename | `REGISTRY_CORRUPT`; all lifecycle calls perform zero audit/process/file mutation |
| Registry graph profile/schema mutation | rejected as immutable-route corruption |
| Missing, mismatched, or unregistered lifecycle scope | closed result without `auditPath`, audit append, project file write, secret access, or Docker call |
| A route with B secret reference | `PROJECT_SECRET_MISMATCH` |
| Transport lookup across tenants | distinct pool entry; no reuse |
| Project-specific port collision | `BLOCKED/PORT_COLLISION` |
| A migration while B is unmigrated | A current; B remains `SCHEMA_MISSING` |
| A stop/backup/restore | B remains running, healthy, and readable |
| Plugin cache copy/removal | both external routes and volumes persist |

No injected failure returned a false `VERIFIED` result.

## Real two-project Docker proof

Command:

```sh
NACL_RUN_DOCKER_SMOKE=1 \
  bash scripts/codex-plugin-ci.sh test:multi-project
```

Result: exit 0. The corrected unit prelude passed 11/11 and the real two-project
Docker E2E passed 1/1 in 40.0 seconds.

1. A and B received distinct containers, volumes, networks, loopback ports,
   instance records, and opaque Keychain references.
2. Migrating A left B at `SCHEMA_MISSING`.
3. Both physical databases held the same `UC-001`, `MOD-001`, and `Task` IDs
   without collision or cross-read.
4. A's credential received HTTP 401 from B.
5. Stopping, backing up, and non-destructively verifying a restore candidate
   for A left B healthy and readable throughout.
6. Executing from a copied package cache, replacing that copy, and removing it
   preserved both external routes and persistent volumes.
7. Restore verification kept the source volume unchanged and removed only the
   owned disposable candidate.

The compatibility command from Wave 3 was also rerun:

```sh
NACL_RUN_DOCKER_SMOKE=1 \
  bash scripts/codex-plugin-ci.sh test:graph-local-e2e
```

Result: exit 0. The lifecycle persistence/cache-replacement test passed 1/1 in
32.5 seconds. The gateway/migration/write/offline-backup/external shipped-CLI
restore/cache-replacement/uninstall test passed 1/1 in 59.7 seconds.

After all Docker gates, explicit inspection found no `nacl-graph-*` or
`nacl-restore-*` containers, no `nacl_graph_*` or `nacl_restore_*` volumes, no
owned networks, and no temporary exact `neo4j:5.24.2-community` tag.

## Package, regression, and isolation evidence

| Command | Result |
|---|---|
| `bash scripts/codex-plugin-ci.sh test:contracts` | exit 0; 249 Node tests: 246 passed, three opt-in Docker tests skipped; every tracked shell suite and syntax check passed |
| `bash scripts/codex-plugin-ci.sh test:graph-unit` | exit 0; 55/55 gateway, lifecycle, identity, routing, isolation, and image tests passed |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:multi-project` | exit 0; 11/11 unit prelude plus 1/1 real Docker E2E passed |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:graph-local-e2e` | exit 0; both Wave 3 compatibility Docker tests passed |
| `bash scripts/codex-plugin-ci.sh test:plugin-manifest` | exit 0; pinned official validator accepted the package |
| `bash scripts/codex-plugin-ci.sh test:plugin-package` | exit 0; 10 entry skills plus 58/58 package/protocol/adversarial tests passed |
| `bash scripts/codex-plugin-ci.sh test:plugin-closure` | exit 0; 333 files, 10 public skills, 60 internal workflows, 310 inline paths, 22 command paths, 59 provenance paths, two source-only annotations |
| `bash scripts/codex-plugin-ci.sh test:cli-plugin --output <temporary-report>` | exit 0; source unavailable, installed-cache execution, current version and 10 entry skills verified |
| `bash scripts/codex-plugin-ci.sh test:cli-legacy` | exit 0; 60 created and 60 idempotent; all installation modes diagnosed correctly |
| `bash scripts/codex-plugin-ci.sh test:codex-skills` | exit 0; existing 60/60 Codex skills validated |
| `bash scripts/codex-plugin-ci.sh test:claude-isolation` | exit 0; 62 frozen roots and identical frozen manifest hash |
| `sh skills-for-codex/scripts/check-root-codex-sync.sh 9b97cb8 HEAD` | exit 0; Codex-only allowlist verified at implementation HEAD |
| secret-pattern scan and `git diff --check` | exit 0; no candidate secret material or whitespace errors |

The source-unavailable CLI report recorded:

```text
status=VERIFIED
sourceUnavailable=true
pluginVersion=0.1.0+codex.20260714195056
executionLocation=installed-cache
entrySkillCount=10
modelBackedRouting.status=NOT_RUN
```

Without `NACL_RUN_DOCKER_SMOKE=1`, `test:multi-project` runs its non-mutating
unit prelude and then returns `BLOCKED`/exit 2 instead of inventing runtime
evidence. `test:multi-user` and `test:candidate` remain explicit later-wave
`BLOCKED` gates.

## ADR disposition

ADR-003 now accepts for the local multi-project pilot:

- a generated, confirmation-bound project UUID with byte-preserving migration
  and explicit partial-completion recovery;
- a strict non-secret external registry with canonical roots and Git-lineage
  conflict detection;
- explicit ID/root routing on every project, lifecycle, and graph operation;
- one physical Community container/volume/network/loopback endpoint and opaque
  Keychain reference per project;
- tenant-safe transport pooling and fail-closed route/secret validation.

## Known limitations and NOT_RUN obligations

- The minimum supported Node.js 20 guard was not executed on a Node 20 host;
  Node.js 24.13.1 was exercised.
- The live macOS Keychain was not mutated. Tests used injected providers and
  prove routing and secret-reference isolation, not a fresh live Keychain item.
- The Wave 4 build was not installed into the user's live marketplace/cache.
  Fresh Desktop discovery, approval, and execution of the three project tools
  are `NOT_RUN`.
- Model-backed `codex exec` routing is `NOT_RUN` in the isolated CLI cache gate.
- GitHub-hosted CI was not run. The Docker evidence is local on the target Mac.
- Absolute canonical roots are intentionally stored. A moved checkout requires
  explicit registration; stale-alias cleanup/unregister/data deletion does not
  yet exist.
- Project lineage currently requires Git. Non-Git project support is not
  silently approximated.
- Ordinary local filesystems provide no compare-and-swap rename primitive. The
  migration holds no user-writable lock, so a narrow residual race remains
  between the final exact bytes/digest/metadata comparison and `rename(2)`.
  The implementation minimizes that window, checks again after the atomic
  replacement, and reports ambiguous read-back as non-success; it does not
  claim hostile concurrent-writer exclusion.
- A Community container per project consumes memory and loopback ports. This is
  the accepted local isolation trade-off, not a shared-service architecture.
- Wave 5 still owns multi-user RBAC, provenance, concurrent leases, fencing,
  CAS/revisions, and safe ID allocation. Wave 6 owns model-facing workflow
  integration. Remote/shared production operation remains `NOT_RUN`.
- No merge, push, tag, publication, live reinstall, production mutation, or
  destructive user-data cleanup was performed by this worker.

Fresh independent review must still verify the corrected candidate and decide
`ACCEPT`, `ACCEPT WITH CORRECTIONS`, or `REJECT` under the runbook.

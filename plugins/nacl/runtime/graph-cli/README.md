# Local graph lifecycle contract

This package-local module owns the explicit per-project Neo4j process and
recovery lifecycle. A separate project router resolves and validates stable
identity plus canonical registered roots before any lifecycle action. The
lifecycle does not apply migrations or expose raw Cypher; the graph gateway
supplies schema work, write confirmation, and full backup/restore evidence.

## Project identity and registry

`project.id` is the authoritative stable identity. A legacy `config.yaml`
without it receives a random UUIDv4 only through a presented exact confirmation,
an atomic minimal insertion, and config plus registry read-back. Resolution is
read-only: it never writes an identity or root alias.

Migration captures the exact UTF-8 bytes, SHA-256, device, inode, and mode
through a no-follow regular-file handle. It compares that snapshot before
creating the temporary file and immediately before atomic rename. A same-inode
edit is `BLOCKED/PROJECT_CONFIG_CHANGED`; the user's bytes remain in place and
no registry record is written. A narrow local-filesystem race remains between
the final comparison and rename because ordinary filesystems expose no
compare-and-swap rename; post-write read-back remains mandatory.

The strict user-scoped registry is outside the plugin cache under
`~/.nacl/codex/local-graph/.project-registry/` by default. Each record contains
canonical registered roots, a non-secret Git-lineage fingerprint, local graph
mode/profile, opaque endpoint and Keychain references, schema version, and last
health status. Extra fields, copied identities from unrelated Git histories,
config symlinks, stale aliases, and conflicts fail closed. Each project registry
record and durable instance record must contain the exact project ID encoded in
its filename.

Every graph and lifecycle operation requires both `projectId` and
`projectRoot`. The router canonicalizes the root, reads `config.yaml`, checks
the registered alias and repository lineage, and only then permits instance,
secret, or Docker access. Omitting the root during project resolution with
several registered roots returns `AMBIGUOUS_PROJECT`; no last-used project is
stored.

Lifecycle scope resolution and exact instance binding occur before any attempt
audit. Missing, mismatched, or unregistered scopes return without `auditPath`
and without creating or appending a per-project file. Once scope is validated,
every lifecycle operation writes its project-specific attempt before Docker,
secret, health, backup, restore, or instance mutation, followed by its scoped
completion/failure record.

## JavaScript API

```js
import {
  EXPECTED_GATEWAY_SCHEMA,
  createLocalGraphLifecycle,
} from "./runtime/graph-cli/lifecycle.mjs";

const lifecycle = createLocalGraphLifecycle({
  stateRoot,       // durable external directory; optional
  instanceStore,  // injectable; optional
  secretProvider, // injectable; optional, macOS Keychain by default
  processRunner,  // injectable; optional
  portProbe,      // injectable; optional
  graphProbe,     // injectable; optional
  restoreProbe,   // optional override; package-local complete probe by default
  clock,
  idGenerator,
  pluginRoot,
});

await lifecycle.init({ projectId, projectRoot, httpPort, boltPort, secretReference });
await lifecycle.resolve({ projectId, projectRoot });
await lifecycle.start({ projectId, projectRoot });
await lifecycle.health({ projectId, projectRoot });
await lifecycle.stop({ projectId, projectRoot });
await lifecycle.doctor({ projectId, projectRoot });
await lifecycle.backup({ projectId, projectRoot, backupDir, snapshot });
await lifecycle.restoreVerify({ projectId, projectRoot, manifestPath, httpPort, boltPort });
```

`resolve`, `doctor`, and `health` all require `{ projectId, projectRoot }`. A successful
`resolve` returns the sanitized instance and its durable external `auditPath`;
the gateway must use this API instead of reading `instance.json` directly.
`EXPECTED_GATEWAY_SCHEMA` pins the component, version, and byte checksum that
the gateway migration catalog must report.

Every operation returns `contract=nacl-local-graph-lifecycle-v1`, an operation,
one closed status (`VERIFIED`, `BLOCKED`, `FAILED`, or
`PARTIALLY_VERIFIED`), a stable code, and only non-secret evidence. CLI exit
codes are respectively 0, 2, 1, and 2. Missing or
stale schema returns a `graph_apply_migrations` handoff; lifecycle code never
silently applies migrations.

## Durable instance record

The default record is
`~/.nacl/codex/local-graph/<projectId>/instance.json` with mode 0600. It uses
contract `nacl-local-graph-instance-v1` and contains only project-scoped Docker
names, the exact image, loopback endpoints, the opaque `secretReference`, and
the expected gateway schema descriptor. The secret value and package/cache
path are absent. Audit records live next to it in `audit.jsonl` and contain only
timestamp, operation, status, code, and project ID.

Names are stable SHA-256-derived values. The record and Docker named volume are
outside the replaceable plugin cache, so plugin reinstall does not reset graph
identity or data. There is deliberately no uninstall/delete operation. `stop`
uses `docker container stop`; it never invokes `compose down`, `down -v`,
`volume rm`, or project-state deletion.

## Secrets and Compose

The default opaque reference is
`keychain:com.itsalt.nacl.local-graph/<projectId>`. Keychain creation supplies
the generated value through stdin with create-only semantics, and lookup
treats stdout as sensitive. If the opaque item or any SHA-derived Docker
resource already exists without a valid registry record, init stops for
explicit recovery and changes neither secret nor resource. Init audits its
attempt before secret/registry effects; an unavailable completion audit after
an effect is `PARTIALLY_VERIFIED`, never a final failure that suggests a safe
blind retry.
Compose receives `NEO4J_AUTH` through a narrowly scoped child environment;
secret values are rejected from argv and redacted from captured output. The
static Compose file contains only substitutions, binds both ports to
`127.0.0.1`, uses a named persistent volume, pins Neo4j Community 5.24.2, and
installs no plugins or unrestricted procedures.

Missing, locked, or revoked Keychain entries return `BLOCKED` with a
`graph_secret_recover` handoff. A value that Neo4j rejects returns `FAILED`
with the same handoff. The lifecycle never regenerates a credential for an
existing volume: doing so would orphan access to that database. Recovery must
restore the original value to the same opaque reference, or use a separately
confirmed project-admin reset. Rotation is likewise a gateway-admin
transaction: authenticate with the current value, change the database
credential, update the Keychain item through stdin, run authenticated health
and read-back, and retain the old value until those checks pass. Reinstall uses
the existing reference and performs no rotation.

## Backup and restore verification

Community backup is an explicit stopped-container offline dump. The gateway
must provide a `nacl-graph-verification-snapshot-v1` containing node and
relationship counts, label and relationship-type histograms, constraints,
indexes, migration checksum, representative-query row counts/digests, and a
verified read/write smoke. The dump is checksummed and stored with that
evidence outside the plugin cache.

The pinned offline admin helper runs as root only inside a network-disabled,
ephemeral container mounted to the one project volume and the selected backup
directory. It uses a fixed local-only hostname so the Java admin tool does not
depend on DNS while networking is disabled. Restore normalizes the fresh candidate volume back to the pinned
Neo4j image UID/GID before starting it. No host root process, Docker socket, or
unrelated path is mounted into either helper.

Restore verification never loads into or swaps the source volume. It creates a
uniquely named, labelled disposable volume and container, asks the default
package-local gateway/Neo4j restore probe for the same complete snapshot,
compares it exactly,
and removes only those owned disposable resources. The original container,
volume, instance record, and backup remain untouched. Failure to supply the
required Node.js fetch/runtime support is
`BLOCKED/RESTORE_RUNTIME_UNSUPPORTED`, not a partial success. Tests may inject
an equivalent probe to exercise mismatch and cleanup branches deterministically.

## CLI

```text
node ./runtime/graph-cli/cli.mjs project-resolve --project-root <root>
node ./runtime/graph-cli/cli.mjs project-migrate-id --project-root <root> --presented-project-id <uuid> --confirmation MIGRATE_PROJECT_ID:<uuid>
node ./runtime/graph-cli/cli.mjs project-register-root --project-id <id> --project-root <root> --confirmation REGISTER_PROJECT_ROOT
node ./runtime/graph-cli/cli.mjs init --project-id <id> --project-root <root>
node ./runtime/graph-cli/cli.mjs start --project-id <id> --project-root <root>
node ./runtime/graph-cli/cli.mjs health --project-id <id> --project-root <root>
node ./runtime/graph-cli/cli.mjs stop --project-id <id> --project-root <root>
node ./runtime/graph-cli/cli.mjs doctor --project-id <id> --project-root <root>
node ./runtime/graph-cli/cli.mjs backup --project-id <id> --project-root <root> --backup-dir <dir> --snapshot-file <json>
node ./runtime/graph-cli/cli.mjs restore-verify --project-id <id> --project-root <root> --manifest <manifest.json>
```

The CLI intentionally has no password, token, auth, or secret-value flag.
The raw value of `--project-root` must already be absolute; `.`, `..`, and
relative names are rejected as `PROJECT_ROOT_INVALID` before `path.resolve()`,
router construction, or lifecycle dispatch. Absolute symlink handling remains
the project router's canonicalization responsibility.

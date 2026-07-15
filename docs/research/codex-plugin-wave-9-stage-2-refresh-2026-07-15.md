# Wave 9 Stage 2 — current-main package refresh and server authorization

Date: 2026-07-15  
Branch: `codex/plugin-09-stage2-refresh`  
Stage base: `da004829c12906945c6f0cdb6310856270f07fe9`  
Reviewed candidate: `24c11c91d4aa7980f88c824cc4deb820b7b99348`  
Status: `PARTIALLY_VERIFIED` — implementation gates pass; independent Stage 2 review is pending

This checkpoint is local-only. It does not authorize or perform a push, PR,
merge to `main`, tag, release, VPS/DNS/certificate/credential mutation,
deployment, portal submission, or publication.

## Scope and source chain

Stage 2 replaced the provisional Wave 8 package snapshot with a deterministic
projection from the fresh-main source chain:

```text
root sources -> skills-for-codex or explicit package transform -> plugins/nacl
```

The package builder writes only `plugins/nacl` (or an explicitly external
temporary output), rejects symlink/collision/path-escape inputs, records all
allowed transforms in `scripts/codex-plugin-manifest.json`, uses a
same-filesystem staged swap, and restores the exact previous tree after an
injected replacement failure. The generated tree at the candidate is:

- Git tree: `afbb10145c79b6699112f1d2158e5042db2aadc6`;
- 373 files;
- 10 public skills;
- 60 internal workflows;
- workflow parity: 39 byte-identical plus 21 explicit hash-bound divergences.

The current-main drift record covers all 17 direct counterparts and all seven
non-direct dispositions. Twelve direct counterparts remain byte-identical;
five use an exact named transform bound in both the drift record and package
manifest. No package transform is implicit.

## Commits

| Commit | Purpose |
|---|---|
| `5ce8b02f9744febed338da527c3278428ddda459` | deterministic Codex package manifest and builder |
| `53b37aba3a01c1827f924bccde7553778cf62486` | current-main source reconciliation and legacy catalog correction |
| `939a053ff7097d5ba61a982eb6d9b155559930ac` | server-wide graph authorization and full remote route contract |
| `600d7ceae9d531aaf143cc2294ce3b91da218d6c` | regenerated current package |
| `d6812b175bd99bec31b531eae3f190a196e0cc8f` | package closure, fail-closed projection, deterministic modes, atomic builder rollback |
| `24c11c91d4aa7980f88c824cc4deb820b7b99348` | exact test binding for the five allowed current-source transforms |

## Accepted graph and authorization behavior

The implementation preserves Neo4j 5 Community topology: every project keeps
its own container and data/log volume lineage. The server/VPS is the user
authorization boundary; `project_scope` is routing/provenance and is never a
grant.

- `trusted-cns` is the authoritative server principal set.
- Per-project `allowed-cns` files are derived projections at the identical
  `state-dir/<project_scope>/allowed-cns` path in provider-neutral and VPS
  implementations.
- A new project inherits the authoritative server set.
- Legacy project allow-lists enter the server set only through explicit union
  plan/apply confirmation.
- Grant projection failure rolls back. Revoke projection failure disables the
  route, invalidates the authorization revision, and invokes the gateway
  quarantine hook; it cannot report a usable stale route.
- Gateway ports are allocated under the inventory lock and collisions are
  rejected before project mutation. `auto` deterministically selects the first
  free port.
- The remote create/connect contract round-trips host, gateway and sidecar
  ports/URI, project scope, certificate/key/CA references, database user/name,
  and secret source. The project Neo4j password is not serialized into the
  client route.
- Cross-server, unknown, disabled, forged scope/server/subject and caller-supplied
  route fields fail with a generic no-inventory-leak denial.

## Verification evidence

| Gate | Result |
|---|---|
| Codex builder tests | `5/5` pass, including two byte-identical clean builds, deterministic `0644` data modes, interpreter-explicit MCP launch, and injected rollback |
| Generated-tree check | `plugins/nacl is up to date (373 files, 10 public skills, 60 workflows)` |
| Current-main drift | `3/3` pass: 17 exact/closed-transform counterparts, seven dispositions, legacy flow |
| Public skill validation | `10/10`, `Status: VERIFIED` |
| Intermediate Codex catalog validation | `60/60`, `Status: VERIFIED`; validator regression `11/11` |
| Official plugin manifest validator | `Status: VERIFIED` |
| Strict package closure | `Status: VERIFIED`; 373 files, 301 active inline paths, 59 descriptive source paths |
| Package suite | `83/83` pass |
| Workflow integration | `38/38` pass |
| Existing graph regression | `89/89` pass |
| Server authorization and VPS source suites | `11/11` pass |
| Cache-only CLI lifecycle | `Status: VERIFIED`; source unavailable, installed-cache execution, 10 entry skills, isolated install/reinstall/uninstall |
| Legacy coexistence | `Status: VERIFIED`; 60 created + 60 idempotent links, exact doctor modes |
| Static path/secret scan | no personal macOS path, host temp path, private-key header, OpenAI key pattern, or AWS access-key pattern in Stage 2 changed paths |
| Diff hygiene | `git diff --check` pass; worker clean after candidate commit |
| Claude generator | `node scripts/build-plugin.mjs --check` pass; builder regression `31/31`; generated Claude tree `89529ec3a9229316764f6fc2b6bc34152a38e36c` |

## Explicit downstream failures and non-claims

These results do not downgrade the Stage 2 implementation but prevent an
aggregate Wave 9 success claim:

1. `test:plugin-docs` still fails on the documented current-main/Wave 8 overlap
   set (README/quickstart/configuration and EN/RU composition). This belongs to
   Stage 4 manual documentation composition.
2. The repository-wide `test:contracts` baseline is `596` tests: `586` pass,
   `5` fail, `5` authorized Docker skips. All five failures are tests selected
   from generated `plugin/**` by the old generic glob. The dedicated Codex
   package/workflow/graph suites pass. Stage 5 must exclude `plugin/**` and
   `tests/codex-plugin/**` from the generic owner and run each under its
   dedicated prerequisites.
3. The imported Claude frozen-path test references a guard intentionally not
   imported from the stale pre-main candidate. Stage 3/5 must introduce a
   fresh-main-bound isolation rule that permits only the reviewed root plus
   generated Claude changes; the Claude generator itself is current and green.
4. PowerShell execution, exact Node 20, hosted CI, dependency/SBOM/vulnerability
   scans, disposable Docker topology, live Desktop, public Streamable HTTP MCP,
   OAuth provider, VPS, DNS, TLS, real users/machines and production drills are
   `NOT_RUN` or later-stage work. No simulated result is called production
   verification.

## Independent review request

Review the exact range
`da004829c12906945c6f0cdb6310856270f07fe9..24c11c91d4aa7980f88c824cc4deb820b7b99348`.
In particular, verify source provenance and transforms, builder replacement
atomicity, server-wide grant/revoke semantics, physical quarantine boundary,
port allocation, cross-server no-leak behavior, and that the known docs/CI
failures are correctly assigned to later stages rather than hidden.

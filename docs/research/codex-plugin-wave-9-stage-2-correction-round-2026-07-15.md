# Wave 9 Stage 2 — adversarial correction round

Date: 2026-07-15  
Original reviewed candidate: `5e4609b9b06aa6c901cf95ffb4a1f08ba02ad4ec`  
F-02..F-05 corrected candidate: `99534ab`  
Branch: `codex/plugin-09-stage2-corrections`  
Status: `PARTIALLY_VERIFIED` — F-02..F-05 are locally verified; F-01 is owned by a separate correction and is not included here

This is a local correction checkpoint. It does not authorize or perform a push,
PR, merge to `main`, tag, release, VPS/DNS/TLS/certificate/credential mutation,
deployment, portal submission, or publication.

## Verifier BLOCK and ownership

The adversarial review blocked candidate `5e4609b` on five findings:

| Finding | Original gap | Correction ownership in this checkpoint |
|---|---|---|
| F-01 | Codex package sources could traverse repository symlinks before copying | Separate commit `996db04`; intentionally not included in this branch or evidence commit |
| F-02 | Metadata disable/quarantine could be reported while physical gateway stop was absent or failed; grant rollback omitted a writer that committed and then threw | `5064c56` |
| F-03 | VPS scope/port collision was detected after project directory, CA, password, `.env`, and Compose mutation; no token-bound reservation rollback existed | `5064c56` |
| F-04 | Secret-source grammar differed across components; `server-route:<id>` was not a working opaque provider path; route-owned files could become a mixed stale pair | `99534ab` |
| F-05 | Validated project/developer marker values were still interpolated into Cypher query text | `57c3c03` |

F-01 must be integrated and rechecked by the Stage 2 owner before an aggregate
Stage 2 acceptance claim. This branch neither duplicates nor rewrites that
separate change.

## Corrected behavior

### F-02 — physical fail-closed quarantine

- Provider-neutral grant rollback now retries **every** gateway projection,
  including the writer that may have committed before throwing.
- Any uncertain projection is disabled for routing and must pass the physical
  quarantine hook. Hook absence/failure remains `BLOCKED` with an explicit
  `*_CRITICAL` code and `critical_projects`; it is never downgraded to a logical
  metadata success.
- VPS issue/revoke/reload failure paths use one inventory-driven physical
  quarantine helper. Every `docker compose stop gateway` result is checked;
  no `|| true` stop path may claim that all gateways were stopped.

### F-03 — pre-mutation reservation

- VPS provisioning reserves `(project_scope, gateway_port)` under the server
  inventory lock before project directory, CA, password, `.env`, Compose,
  container, or volume mutation.
- The reservation is inventory-only and bound to a random token. Exact-token
  `activate` commits the route only after readiness gates; exact-token `release`
  removes both reservation and failed-attempt project artifacts.
- Duplicate scope/port fails before project artifacts exist. A later failure
  triggers Compose cleanup plus reservation release.

### F-04 — one opaque route transaction

- `secret-source-contract.mjs` is the single grammar/resolver for
  `env:NEO4J_PASSWORD` and `server-route:<id>`.
- `server-route:<id>` resolves only through an injected provider or the explicit
  `NACL_SERVER_ROUTE_SECRET_PROVIDER` process boundary. Provider absence blocks
  before handshake or configuration writes.
- `.mcp.json` persists only the opaque reference and Node launcher metadata.
  The launcher resolves the secret at process start and passes it through the
  child environment; password bytes are absent from route files and argv.
- POSIX and PowerShell create/connect flows call one transactional writer for
  both `config.yaml` and `.mcp.json`. Both files are staged, the exact pair is
  validated, stale local/remote route-owned fields are replaced, both files are
  read back, and either original pair is restored on a write/readback failure.

### F-05 — parameterized marker Cypher

- Create/verify queries contain only `$projectScope` and `$developerId`
  placeholders.
- POSIX passes repeated `--param`; the PowerShell helper now accepts `-Params`
  and emits the same repeated MCP arguments. Dynamic marker values never enter
  query text.

The topology remains unchanged: one Neo4j Community container and independent
data/log volume lineage per project.

## RED to GREEN evidence

| Scope | RED | GREEN |
|---|---|---|
| F-02/F-03 provider-neutral + VPS | 5 failures: rollback critical code, revoke stop failure, missing reservation actions, missing physical helper, stale source contract | `13/13` pass after `5064c56` |
| F-05 POSIX/PowerShell marker query | 1 failure: direct `$SCOPE`/`$DEV` and `$ProjectScope`/`$DeveloperId` interpolation | marker regression pass; combined MCP/VPS set `18/18` after `57c3c03` |
| F-04 opaque transaction | missing shared modules plus POSIX/PowerShell single-writer assertion failure | stale local/remote replacement, opaque ref, exact readback and injected rollback pass; focused set `33/33` after `99534ab` |
| Final combined F-02..F-05 | n/a | `53/53` source tests; generated Claude transaction `3/3` |
| Claude builder | n/a | `--check` pass; builder regression `31/31` |
| Codex builder | n/a | `plugins/nacl` current at 377 files, 10 public skills, 60 workflows; builder regression `5/5` |
| Syntax/hygiene | n/a | Bash/POSIX syntax, Node syntax, and `git diff --check` pass |

PowerShell source parity is asserted, but `pwsh` is unavailable on this host;
PowerShell runtime execution remains `NOT_RUN`.

## Remaining Stage 3-5 failures and non-claims

These correction results do not close aggregate Wave 9:

1. F-01 must be integrated from its separately owned correction and the exact
   combined successor must receive independent review.
2. The documented `test:plugin-docs` current-main/Wave 8 overlap remains Stage 4
   manual documentation composition work.
3. The generic repository contract glob still needs Stage 5 ownership cleanup
   so generated Claude and Codex suites run only under their dedicated
   prerequisites, without double-owning `plugin/**` or `tests/codex-plugin/**`.
4. Stage 3/5 must retain a fresh-main-bound isolation rule that permits only
   reviewed root sources plus generated Claude/Codex projections.
5. Exact Node 20, hosted CI, dependency/SBOM/vulnerability scans, disposable
   Docker topology, PowerShell runtime, live Desktop, public Streamable HTTP MCP,
   OAuth provider, real VPS/DNS/TLS, real users/machines, backup/restore drills,
   Git release portability, and OpenAI portal submission remain `NOT_RUN` or
   separately authorized later-stage work.

No local result in this correction round is production, deployment, publication,
or aggregate Wave 9 verification evidence.

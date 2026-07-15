# Codex plugin Wave 6 workflow integration evidence — 2026-07-14

Status: READY FOR FRESH INDEPENDENT REVIEW. This document records implementing-
worker evidence for the orchestrator and methodology/parity reviewer. It is not
an `ACCEPT` decision, does not update the execution ledger or ADR acceptance,
and does not authorize a merge, push, tag, publication, or live installation.
Overall acceptance evidence remains `PARTIALLY_VERIFIED` because the mandatory
live Desktop new-task gate is `NOT_RUN`.

## Candidate under test

- Branch: `codex/plugin-06-workflows`
- Integration base: `4c7dc262c93ddfc81c8d3160377b0c38c3e1ea30`
- Implementation commit: `c8bbdcc4d59a60331d24508988fd2022d3997880`
- Wave 5 regression-alignment commit:
  `d8d4432defe0bba102be713cb81e62ab490d3ce2`
- Initial Wave 6 evidence commit:
  `fdd19ad4e3737ca346f7f88e709fd5fb78bdf656`
- Independent-review correction commit:
  `c9179f6f6e5b08db53f4d76cc1c27e49c87121cb`
- Public-entry contract correction commit:
  `fbb46a77236f164791e1dce17520afca566db9ee`
- Plugin version/cachebuster: `0.1.0+codex.20260714212609`
- Observed runtime: Node.js 24.13.1, macOS arm64, Docker available locally.

No live marketplace, installed plugin cache, Desktop configuration, macOS
Keychain, production graph, user data, remote service, public state, or Claude
distribution was modified. Agent-profile checks used disposable project and
Codex homes. Docker checks used uniquely named disposable resources and the
existing test secret boundary; their resources were cleaned after each test.

## Outcome implemented

Wave 6 binds all ten public entries and all 60 packaged internal workflows to
an explicit, cache-contained gateway contract:

```text
public entry
    -> installation doctor
    -> explicit project root resolution
    -> trusted worker identity
    -> graph health/schema state
    -> mapped named tools, resource type, approval, fence, revision, evidence
    -> authoritative read-back
    -> release or explicit handoff
    -> exact closed status and structured code
```

The machine-readable route is
`plugins/nacl/resources/references/workflow-gateway-map.json`; the normative
invocation rules are in
`plugins/nacl/resources/references/workflow-gateway-contract.md`. Tests prove
that every public entry and internal workflow is mapped exactly once, every
named tool is shipped, approvals match the server capability matrix, and no
hidden peer workflow is omitted.

The seven route sequences are:

| Sequence | Public use | Protected graph scope |
|---|---|---|
| `initialize` | `nacl-init` | lifecycle, bootstrap, schema and canary evidence |
| `read-preflight` | goal, verify, diagnose | packaged `summary` read only |
| `ba-resource` | BA | `Board`, `APPROVE_BA_WRITE` |
| `sa-resource` | SA | `Module`, `FeatureRequest`, `UseCase`, `APPROVE_SA_WRITE` |
| `tl-task` | TL and fix | `Task`, `APPROVE_TL_WRITE` |
| `schema-recovery` | migrate | `SchemaMigration/MIG-GATEWAY` with schema confirmations |
| `release` | publish | `ReleaseEnvironment`, `CONFIRM_RELEASE_OPERATION` |

The contract does not pretend that the Wave 5 gateway exposes every legacy
domain label, relationship, or query. Twelve audit groups cover all 60
workflows and bind unavailable functionality to explicit codes such as
`BA_DOMAIN_RESOURCE_UNAVAILABLE`, `SA_RELATIONSHIP_RESOURCE_UNAVAILABLE`, or
`NAMED_QUERY_UNAVAILABLE`. Useful file-only preparation may continue, but the
graph-complete result remains `BLOCKED`. Active raw Cypher instructions and
checkout-relative command paths were removed from the packaged workflows. The
closure gate reports zero active command paths and fails a package when an
active command would depend on the caller's current working directory.

## Initialization and local lifecycle

`nacl-init` may return `VERIFIED` only after the applicable evidence chain is
complete:

1. installation doctor and explicit project resolution;
2. exact legacy identity/root confirmation when applicable;
3. `INIT_LOCAL_GRAPH:<project_id>` before local initialization;
4. `START_LOCAL_GRAPH:<project_id>` before local start;
5. lifecycle doctor read-back;
6. trusted identity and, only for a truly empty graph, confirmed initial admin;
7. exact fenced `MIG-GATEWAY` recovery when the schema is stale;
8. health, schema status, packaged summary read;
9. `APPROVE_PROJECT_WRITE` plus `WRITE_CANARY` and a separate summary read-back.

The package MCP now exposes these lifecycle companions in addition to the
existing graph tools:

- `nacl_graph_local_init`
- `nacl_graph_local_start`
- `nacl_graph_local_doctor`

Their implementation delegates to the verified package-local lifecycle code.
Desktop skills call MCP tools; they do not shell to a checkout or guess the
mutable cache path. A cache-relative Node CLI exists only as a development and
deterministic-test companion and reuses the same implementation.

Ambiguous mutation completion, audit failure, metadata failure, transport loss,
or failed read-back remains `PARTIALLY_VERIFIED` with recovery guidance. It is
never converted to local success or an unqualified retry.

## Workflow write and evidence boundary

The Wave 5 protected-resource catalog was aligned with the Wave 6 methodology:
`UseCase` is an SA resource with capability `sa.write` and exact approval
`APPROVE_SA_WRITE`. The real Wave 5 Docker all-kinds route was rerun using an
architect membership and succeeded.

Successful terminal Task mutations require strictly parsed
`verification_evidence` in the same mutation:

- `done`: `test-GREEN:<path>` or `no-test`;
- `verified-pending`: `test-UNVERIFIED`.

`no-test` additionally requires the exact schema field
`evidence_confirmation: CONFIRM_NO_TEST_EVIDENCE`; the field is bound into the
validated idempotency payload and is rejected for other evidence shapes.
Unknown tokens, duplicate singleton tokens, malformed calendar timestamps,
absolute or traversal paths, unsafe `file:line` shapes, contradictory Task
evidence, and evidence/status mismatches fail before graph access. Existing
release-reader tokens such as `repo-checks-GREEN`, wire, QA-stage, and
stub-shape evidence remain supported only in their documented exact forms. A
later local status file cannot repair a mutation that omitted authoritative
evidence. Unit/model tests, direct runtime integration tests, and the real
Docker test all exercise this boundary; the Docker test also asserts the
stored evidence through a separate graph read-back.

Release classification uses the closed status vocabulary. In particular,
`FAILED` plus a non-exempt `CRITICAL` SA validation finding returns `BLOCKED` /
`sa-validate-critical`; the old non-contract `FAIL` spelling is absent and an
unknown status is rejected.

## Optional project agent profiles

Five standalone Codex profile templates are shipped under
`plugins/nacl/resources/templates/agents/`:

- `nacl-business-analyst.toml`
- `nacl-system-architect.toml`
- `nacl-team-lead.toml`
- `nacl-developer.toml`
- `nacl-verifier.toml`

Each template contains the currently required `name`, `description`, and
`developer_instructions` fields and deliberately contains no model selection.
The profiles are optional companions, not plugin-discovered components. Normal
CLI and Desktop workflow routing remains usable without them.

The package MCP exposes:

- `nacl_agent_profiles_plan` — read-only exact destinations, actions, required
  confirmation, and deterministic plan token;
- `nacl_agent_profiles_apply` — confirmed create-only application and
  read-back.

Fresh installation requires
`INSTALL_AGENT_PROFILES:<plan-token>`. A differing file is never overwritten by
any plugin operation: both plan and apply return `BLOCKED` /
`AGENT_PROFILE_CONFLICT`, leave every byte untouched, and tell the user to move
or back up the conflicting file before making a fresh plan. There is no
replacement confirmation, replacement token, overwrite code path, or
destructive MCP annotation. The implementation rejects relative roots,
symlinked roots and destinations, non-files, stale plans, template mutation,
and time-of-check/time-of-use drift. Final creation uses a no-replace link: a
concurrent external writer wins, its bytes are preserved, the operation closes
as a conflict, and no temporary or lock residue remains. Exact reinstall is
reported as `AGENT_PROFILES_ALREADY_CURRENT`.

The active public `nacl-init` entry now states the same create-only sequence:
`AGENT_PROFILE_CONFLICT` stops both plan and apply; the user manually moves or
backs up every conflicting file; the entry then requests a fresh plan and
applies only that new token after exact confirmation. It promises neither a
replacement confirmation nor current-hash arguments. A semantic contract test
reads that public entry, checks the actual MCP input schema and non-destructive
annotation, and executes the complete plan/apply/conflict/preserve/manual-
backup/fresh-plan/reapply cycle through the real workflow gateway.

There is deliberately no broad remove operation. A manual cleanup may remove
only the five exact listed files after hash verification and must preserve the
project's `.codex/agents/` directory and unrelated profiles.

## Methodology parity

The frozen baseline
`plugins/nacl/resources/references/workflow-parity-baseline.json` compares the
package with the 60 current Codex root workflow skills:

- root workflows audited: 60;
- byte-identical package copies: 39;
- deliberate divergences: 21.

Each divergence records the workflow, packaged SHA-256, root SHA-256, and a
specific reason. The divergences are limited to cache containment, removal of
checkout-relative mechanics, explicit gateway/approval/evidence binding, and
honest unavailable-capability closure. The test recomputes both sides and
fails on an unrecorded change or stale hash.

The 60 Claude source roots remained frozen. Their isolation gate reported 62
frozen roots and aggregate hash
`cb85ebb130277286b5e0fbb7efd240575544c490`.

## Cache-source-unavailable CLI evidence

The installed-cache matrix copied and installed the candidate into a
disposable Codex home, renamed the marketplace source away, then started the
cached MCP server. It proved:

- all ten public entries remained present;
- local init with an incorrect confirmation stopped before side effects as
  `BLOCKED` / `CONFIRMATION_REQUIRED`;
- agent-profile planning returned `VERIFIED` /
  `AGENT_PROFILE_PLAN_READY` with five entries;
- confirmed profile apply created all five entries and exact re-apply was
  idempotent;
- after one installed profile was changed by the simulated user, both plan and
  apply returned `BLOCKED` / `AGENT_PROFILE_CONFLICT` and preserved the user's
  bytes.

This proves cache-contained server and skill behavior in the CLI matrix. It is
not a claim that a live Desktop new task discovered the candidate.

## Verification results

| Command or gate | Result |
|---|---|
| `bash scripts/codex-plugin-ci.sh test:workflow-integration` | 18/18 passed after `fbb46a77...`; includes public-entry-to-MCP create-only semantic execution |
| `bash scripts/codex-plugin-ci.sh test:plugin-manifest` | `VERIFIED` |
| `python3 "$PLUGIN_CREATOR/scripts/validate_plugin.py" plugins/nacl` | official plugin-creator validation passed |
| `bash scripts/codex-plugin-ci.sh test:plugin-package` | 63/63 passed |
| `bash scripts/codex-plugin-ci.sh test:plugin-closure` | `VERIFIED`; 356 files, 10 public entries, 60 internal workflows, 301 inline paths, 0 active command paths, 59 descriptive provenance paths |
| `bash scripts/codex-plugin-ci.sh test:graph-unit` | 89/89 passed |
| `bash scripts/codex-plugin-ci.sh test:codex-skills` | 60/60 passed |
| `bash scripts/codex-plugin-ci.sh test:claude-isolation` | `VERIFIED`; candidate `fbb46a77...`, 62 frozen roots, frozen source unchanged |
| `sh skills-for-codex/scripts/check-root-codex-sync.sh 4c7dc262c93ddfc81c8d3160377b0c38c3e1ea30 HEAD` | `VERIFIED` after `fbb46a77...` |
| `bash scripts/codex-plugin-ci.sh test:cli-legacy` | 60 created, 60 idempotent, hashes unchanged |
| `bash scripts/codex-plugin-ci.sh test:cli-plugin` | `VERIFIED`; source-unavailable cache version `0.1.0+codex.20260714212609`, ten entries, confirmed profile apply, and preserved create-only conflict |
| `bash scripts/codex-plugin-ci.sh test:contracts` with `fbb46a77...` content | 304 total; 299 passed; 5 authorized Docker skips; zero failures; tracked shell suites 13/13, 3/3, 10/10, and 4/4 |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:multi-user` | 29/29 unit/model plus 2/2 real Docker passed, including malformed/no-test evidence and separate read-back |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:multi-project` | 11/11 unit plus 1/1 real two-project Docker passed |
| `NACL_RUN_DOCKER_SMOKE=1 bash scripts/codex-plugin-ci.sh test:graph-local-e2e` | lifecycle smoke 1/1 plus gateway/restart/cache/backup/restore/uninstall 1/1 passed |
| `git diff --check` | passed |

The Docker gates were run sequentially. Wave 5 exercised the
`UseCase -> sa.write` change, strict invalid-evidence rejection, exact
no-test confirmation, and terminal Task evidence read-back against Neo4j. Its
two Docker tests took approximately 27 and 21 seconds. Wave 4's real
two-project gate took approximately 44 seconds. Wave 3's lifecycle and gateway
gates took approximately 32 and 63 seconds. The final bounded cleanup scan
found no disposable `nacl-wave`, `nacl-test`, `nacl-codex`, `nacl-multi`,
`nacl-graph`, or `nacl-local` container, volume, or network. Unrelated
pre-existing Docker resources were not modified.

Docker was not rerun for `fbb46a77...`: that correction changes only the
active public Markdown entry, its executable semantic contract test, and the
plugin cachebuster. No runtime, schema, lifecycle, graph, authorization,
profile-installer, or Docker code changed from the candidate whose fresh
evidence was recorded and independently reviewed at `95c82304...`. Repeating
the expensive Docker gates would therefore add no execution path beyond the
new non-Docker gateway test above; the existing real-Docker results remain the
applicable evidence and are not represented as a new run.

## Independent review and correction trace

The first evidence candidate at `fdd19ad4...` received a fresh independent
`FAILED` verdict with correction disposition `CORRECT`. Five blocking themes
were reported and were corrected in `c9179f6f...`:

1. release status vocabulary and executable `FAILED + CRITICAL` classification;
2. strict evidence parsing, exact no-test confirmation binding, and direct,
   runtime, and real-Docker regression coverage;
3. removal of cwd/source-dependent packaged workflow commands and explicit MCP
   coordination for TL full/next/ship;
4. create-only agent profiles with conflict preservation and a concurrent
   final-create test;
5. execution of the real root-sync gate against the integration base and
   corrected candidate HEAD.

This document records the implementing worker's correction evidence only. A
new fresh reviewer must independently decide `ACCEPT`, `CORRECT`, or `REJECT`.

A later formal review of HEAD `95c82304...` again returned `FAILED` with
correction disposition `CORRECT`. Its code/docs blocker was the active public
`nacl-init` entry still advertising replacement confirmation/current hashes,
despite the actual MCP being create-only. Commit `fbb46a77...` corrects exactly
that blocker and adds the executable public-entry-to-MCP semantic contract
test described above. The same review also confirmed that the mandatory live
Desktop gate was not executed. That gate remains `NOT_RUN`, so the overall
acceptance evidence remains `PARTIALLY_VERIFIED`; this worker does not claim
`ACCEPT`.

## Honest limits and `NOT_RUN`

- Actual live Desktop marketplace reinstall and new-task entry routing:
  `NOT_RUN` in this worker worktree.
- Actual Desktop MCP approval UI for lifecycle, write canary, or agent-profile
  apply: `NOT_RUN`.
- Actual spawned custom-agent discovery: `NOT_RUN`. An isolated
  `codex debug prompt-input` accepted the installed project configuration, but
  its output does not expose the custom-agent inventory; this is not counted as
  discovery proof.
- Model-backed `codex exec`: `NOT_RUN`.
- Live macOS Keychain mutation: `NOT_RUN`.
- Node.js 20 compatibility: `NOT_RUN`; observed runtime was Node.js 24.13.1.
- Hosted CI: `NOT_RUN`.

Because the Wave 6 acceptance gate explicitly mentions Desktop new tasks, this
implementing-worker evidence is `PARTIALLY_VERIFIED` and does not claim full
acceptance. The orchestrator or independent verifier must obtain that proof or
keep the limitation open. ADR-003 is intentionally unchanged until an
independent `ACCEPT` decision.

## Independent verifier checklist

The fresh reviewer should, without trusting this document:

1. recompute the ten-entry/60-workflow route and parity maps;
2. inspect all 21 hash-bound divergences and confirm no active raw graph or
   cwd-dependent command escape;
3. rerun the public-entry semantic contract plus agent
   plan/apply/reinstall/conflict/symlink/TOCTOU tests;
4. rerun package, closure, graph, CLI cache, Claude isolation, and Docker gates;
5. verify exact confirmations and same-mutation Task evidence;
6. attempt a live Desktop new-task route if the environment and user authority
   allow it;
7. return `ACCEPT`, `CORRECT`, or `REJECT` with exact evidence.

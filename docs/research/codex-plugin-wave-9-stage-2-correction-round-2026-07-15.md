# Wave 9 Stage 2 — final package and server-authorization acceptance

Date: 2026-07-15
Stage 2 implementation SHA: `9463c74e731011db9f229e07a7a4852f5dd8a931`
Correction base: `1324c0ba`
Branch: `codex/plugin-09-stage2-final`
Status: `VERIFIED` for local Stage 2 scope

This acceptance is local-only. It does not authorize or perform a push, PR,
merge to `main`, tag, release, VPS/DNS/TLS/certificate/credential mutation,
deployment, portal submission, or publication. Production and clean-machine
claims remain later-stage gates.

## Accepted result

The deterministic Codex package now contains 379 files, 10 public skills, and
60 internal workflows. It is generated from reviewed root sources, rejects
symlinked package inputs, and is byte-current with the root route/VPS sources.

Neo4j 5 Community retains one container and independent data/log volumes per
project. The server is the authorization boundary: `trusted-cns` is the
authoritative canonical principal set and every project `allowed-cns` is only
its revision-bound, digest-bound projection. `project_scope` is routing and
provenance, not a grant. Cross-server access needs a separate grant.

Provisioning and release are fail-closed:

- gateway scope and port are reserved before project, CA, secret, Compose,
  container, or volume mutation;
- authorization is verified immediately before every render and gateway
  action; wildcard, duplicate, unsorted, stale, or tampered CN state globally
  quarantines uncertain gateways;
- a possible start requires an explicit successful `down` before reservation
  release; missing Compose retains the project, port, and `release_pending`;
- one atomic inventory commit both removes the gateway and writes a mode-0600,
  token-digest-bound durable release receipt; exact-token lost-ACK replay is
  idempotent, while wrong tokens and corrupt/symlinked state are rejected;
- owned artifacts move through an exact, token-bound tombstone. Critical-path
  recursive deletion is absent; retained tombstones are honestly reported for
  later out-of-band garbage collection.

Remote create/connect use one atomic route transaction for `config.yaml` and
`.mcp.json`. Duplicate or malformed JSON/YAML, multiple YAML documents,
repeated document markers, unsupported scalar ambiguity, stale mixed routes,
or read-back drift preserve the original files byte-for-byte. Opaque secrets
remain out of files and argv; bounded child environments are restored and MCP
errors/results are redacted. POSIX and PowerShell source paths use explicit
`--param-string` for JSON-looking identifiers.

## Correction chronology

| Finding | Closed behavior |
|---|---|
| F-01 | Package builder rejects symlinked roots, shared trees, and shared files before reading. |
| F-02 | Logical disable/quarantine is never reported as physical success without a verified gateway stop. |
| F-03 | Scope/port reservation precedes all project-side mutation and is released only by an exact token. |
| F-04 | One opaque secret-source contract and one two-file transaction replace mixed route state. |
| F-05 | Dynamic project/developer markers remain MCP parameters and never enter Cypher text. |
| CR-01 | Server-wide authorization is canonical, revision/digest-bound, rechecked before action, and fail-closed under projection drift. |
| CR-02 | Release cleanup uses a durable atomic receipt, exact tombstone binding, safe retry, and proven-down port retention. |
| CR-03 | Duplicate/malformed route state is rejected without rewriting user bytes. |
| CR-04 | Secret transport is argv-free, bounded, restored, and output-redacted on downstream failure. |
| CR-05 | Multi-document, repeated-marker, and unsupported YAML scalar ambiguity are rejected; identifiers remain strings. |
| CR-06 | The historical refresh evidence is explicitly superseded and this file records the exact combined result. |

## Verification evidence

| Gate | Exact result |
|---|---|
| Independent combined review | `ACCEPT` on exact SHA `9463c74e731011db9f229e07a7a4852f5dd8a931`; read-only |
| Combined route/VPS | `46/46` pass; focused adversarial expansion `38/38`; merged source assertions `8/8` |
| Codex and Claude builders | both `--check` current; regression `37/37` |
| Generated Codex package | 379 files; 10 public skills; 60 workflows |
| Current-main source drift | `3/3` pass |
| Package suite | `83/83` pass |
| Workflow integration | `38/38` pass |
| Graph unit | `89/89` pass |
| Manifest and public skills | `VERIFIED`; exact `10/10` public skills |
| Strict package closure | `VERIFIED`; 379 files, 301 inline paths, 59 descriptive source paths |
| Cache-only CLI | `VERIFIED`; installed-cache execution, source unavailable, 10 entry skills |
| Legacy coexistence | `VERIFIED`; 60 created and 60 idempotent links; expected doctor modes |
| Static changed-path scan | clear of personal/host-temp paths, private-key headers, OpenAI-key patterns, and AWS-key patterns |
| Diff hygiene | `git diff --check 1324c0ba..9463c74` pass; worktree clean |

Independent VPS review also exercised misordered managed markers, inventory
commit failure with exact tree restoration, crash-after-tombstone retry,
tombstone symlink substitution, committed-grant-then-error rollback,
authorization TOCTOU, exact-token lost-ACK replay, wrong-token rejection, and
missing Compose after a simulated physical start.

## Expected downstream failures and non-claims

These do not downgrade Stage 2, but they block aggregate Wave 9 acceptance:

1. Raw `test:contracts` is exactly 640 total: 630 pass, 5 fail, and 5 opt-in
   Docker skips. All five failures are the already documented generic ownership
   of generated `plugin/**`: one absent packaged fixture and four symlink-target
   baselines. Stage 5 must split CI ownership and prerequisites.
2. `test:plugin-docs` reports only the documented current-main/Wave 8 overlap:
   README/quickstart plugin-first composition, RU/EN structure and doc keys,
   configuration, anchors, password examples, and skills inventory. Stage 4
   owns manual composition, including the later `main` documentation changes.
3. The fresh-main Claude isolation guard remains Stage 3/5 work. The Claude
   generator and current generated tree are green, but the missing guard is not
   represented as a successful isolation claim.
4. PowerShell source parity is verified; PowerShell runtime execution is
   `NOT_RUN` on this host.
5. Exact Node 20, hosted CI, dependency/SBOM/vulnerability scans, disposable
   live Docker topology, live Desktop, public Streamable HTTP MCP, OAuth,
   VPS/DNS/TLS, real users/machines, backup/restore drills, Git-release
   portability, OpenAI portal submission, and publication remain `NOT_RUN` or
   separately authorized later stages.

Stage 3 may start from this accepted local implementation. Stage 2 is not a
release candidate and does not change Wave 8's `PARTIALLY_VERIFIED` status.

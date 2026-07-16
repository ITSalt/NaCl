# Wave 9 Stage 4 — documentation composition acceptance

Date: 2026-07-15
Fresh-main Stage 3 evidence base: `bcbeca0677bebf6bcf741382b5f4613d7aa2ac9b`
Accepted Stage 4 implementation SHA: `382945d4d6abf1ccf28c80ad215b48f93a284f03`
Branch: `codex/plugin-09-stage3-fresh-main`
Status: `VERIFIED` for local Stage 4 scope

This checkpoint is local-only. It does not authorize or perform a push, PR,
merge to `main`, tag, release, deployment, VPS/DNS/TLS/certificate/credential
mutation, portal submission, or publication.

## Accepted composition

The manual composition preserves the current-main installation material while
adding the complete plugin-first Codex path. The bytes before the `## Codex`
heading in `docs/setup/install-skills.md` and
`docs/setup/install-skills.ru.md` remain identical to fresh main
`19dd5e263024a2e43e456e9f37efcfc8c8a3bc73`. The normal Codex Desktop path is
the full UI-installed plugin; the skills-only/symlink path is labelled legacy
compatibility and is not presented as the production product.

The accepted documentation records the current graph contract without
inventing a managed service:

- Neo4j 5 Community runs in a separate container with independent durable
  volumes for each project, locally or on a reachable VPS;
- the server is the current authorization boundary, while `project_scope` is
  routing and provenance rather than a grant;
- certificate issue and revoke use the server identity and reconcile every
  registered project gateway;
- remote connections require exactly `env:NEO4J_PASSWORD` or
  `server-route:<id>` as `graph.remote.secret_source`;
- `.mcp.json` contains only the opaque reference and launcher/route metadata,
  never a raw, shared, demo, or default password.

The generated Codex package contains byte-identical EN/RU configuration,
provisioning, and connection runbook mirrors. The documentation inventory is
40 Markdown files with exact inventories of 10 public skills, 60 internal
workflows, and 25 MCP tools.

## Correction chronology

| Candidate | Review result | Disposition |
|---|---|---|
| `36e183adf726f1bf9e798dfa02adbf6437edadeb` | `BLOCK` | Remote configuration still described a shared graph/password and omitted an opaque secret source. |
| `48169a38407d0bc39b385f59f8f38e445fedb8d4` | `BLOCK` | Configuration and graph setup were corrected, but packaged provision/connect runbooks still used per-project certificate grants and an invalid revoke command. |
| `382945d4d6abf1ccf28c80ad215b48f93a284f03` | `ACCEPT` | EN/RU root and packaged runbooks now match the server-wide runtime contract; dedicated regressions prevent both stale command and secret-source drift. |

## Verification evidence

| Gate | Exact result |
|---|---|
| Independent documentation/security review | `ACCEPT` on exact SHA `382945d4d6abf1ccf28c80ad215b48f93a284f03`; read-only |
| Documentation regressions | `11/11` pass, including stale issue/revoke flags, missing `--server-id`, and missing `secret_source` rejection |
| Documentation inventory | `VERIFIED`; 40 Markdown files, 10 public skills, 60 workflows, 25 MCP tools |
| Codex builder | `7/7`; `--check` current at 382 files / 10 public / 60 workflows |
| Package suite | `83/83` pass |
| Current-main source drift | `3/3` pass |
| Plugin manifest and strict closure | `VERIFIED`; closure covers 382 files |
| Claude isolation | `VERIFIED`; immutable base `19dd5e2`, frozen manifest hashes equal, generated parity current |
| Root/package mirrors | six EN/RU configuration and operational runbook pairs byte-identical |
| Changed-document hygiene and diff | no personal paths, private keys, or unsafe password fallbacks; `git diff --check` clean |

## Honest limitations and next scope

The `usage` error strings in `graph-infra/vps/issue-client-cert.sh` and
`revoke-client-cert.sh` still list legacy compatibility flags and omit
`--server-id`. This is CLI-help debt, not an unsafe authorization path: the
parser requires/resolves server identity before mutation, legacy-only calls
fail closed, and successful issue/revoke always uses all-gateway reconcile.
The independent verifier classified it as non-blocking for this documentation
stage; a later runtime/source correction must update the help text and its
generated Codex copy together.

Stage 5 owns CI responsibility separation and the five known false failures
caused by generic execution of generated Claude `plugin/**` tests. Hosted CI,
PowerShell runtime, exact Node 20, clean-machine Git-release installation,
public Streamable HTTP/OAuth, infrastructure, submission, and publication
remain `NOT_RUN` or separately authorized.

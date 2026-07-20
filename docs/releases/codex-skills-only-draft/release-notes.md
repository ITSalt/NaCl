# DRAFT — NaCl Skills-only public release

- **Release status:** `NOT_RELEASED`
- **Artifact status:** `NOT_FROZEN`
- **OpenAI portal status:** `NOT_SUBMITTED`

This document describes the intended first public NaCl **Skills-only** release.
It is not an announcement, an installation promise, or evidence that the
artifact has passed review. The version, source revision, archive digest, file
manifest, and publication date will be bound only after the remaining release
gates pass.

## Intended user journey

The target flow has one installation:

1. Install the verified NaCl Skills-only card in the OpenAI/Codex plugin UI.
2. Open a task at the canonical root of the project to initialize.
3. Run `nacl-init` and review its read-only plan.
4. Confirm the exact local graph bootstrap operation.
5. After the skill creates the project graph and MCP configuration, open a new
   task in the same trusted project.
6. Verify the project MCP handshake, graph/schema health, a named read, and the
   separately confirmed write/read-back canary.

The release will not require a second NaCl installation from GitHub. GitHub is
the source, release, audit, and support channel.

## Intended contents and behavior

- Ten public conductor skills: `nacl-ba`, `nacl-diagnose`, `nacl-fix`,
  `nacl-goal`, `nacl-init`, `nacl-migrate`, `nacl-publish`, `nacl-sa`,
  `nacl-tl`, and `nacl-verify`.
- A self-contained runtime closure inside each uploaded skill, without a
  package-level public NaCl MCP, OAuth service, or hosted data plane.
- A plan/confirm/apply/read-back `nacl-init` path that creates one Neo4j
  Community container and durable volumes per local project.
- A bundled-version, checksum-verified project-local `neo4j-mcp` and a
  generated no-secret launcher.
- A managed `[mcp_servers.nacl_neo4j]` section in the trusted project's
  `.codex/config.toml`, followed by a mandatory new task.
- Preservation of unrelated Codex configuration, project graph volumes,
  backups, credentials, and Claude compatibility state during update or
  uninstall.

The final release notes will replace this intended inventory with the exact
frozen file manifest and accepted verification evidence.

## Prerequisites under review

The candidate currently expects:

- an OpenAI/Codex host version that supports Skills-only plugins;
- a trusted project at its canonical filesystem path;
- Node.js 20 or later;
- Docker Engine or Docker Desktop with Docker Compose for a local graph; and
- outbound HTTPS access to the bundled-version `neo4j-mcp` release on GitHub
  and to the registry used by Docker for the Neo4j Community image, unless a
  release-approved offline procedure is used.

Supported operating systems and architectures will be stated only after the
clean-machine matrix is complete. A remote Neo4j/VPS mode, if included in the
final listing, remains user-operated infrastructure and not a NaCl managed
service.

## Privacy and security

NaCl has no maintainer-operated project-data backend or analytics endpoint.
The graph, project MCP, configuration, credentials, logs, and backups remain on
infrastructure selected by the user. OpenAI or Anthropic processes host inputs
and outputs only for the channel in which the user runs NaCl.

The project password must remain in the gitignored, protected
`graph-infra/.env`. It must not appear in the submitted bundle,
`.codex/config.toml`, `.env.example`, logs, process arguments, or support
evidence. See the [Privacy Policy](../../../PRIVACY.md),
[Security Policy](../../../SECURITY.md), [Terms of Use](../../../TERMS.md), and
[MIT License](../../../LICENSE).

## Pending release gates

The following gates are pending and must not be inferred as passed from this
draft:

- freeze the deterministic Skills-only tree and archive to an exact source SHA,
  file/digest manifest, public-skill inventory, and version;
- accept current skill validation, closure, dependency, license, privacy,
  secret, and reproducibility scans;
- prove plan denial leaves zero mutation and prove bootstrap/read-back from the
  exact staged artifact with the source repository unavailable;
- complete clean-machine bootstrap, update, uninstall/persistence, and
  new-task project-MCP tests on the supported macOS and Linux targets;
- complete native Windows/PowerShell clean-machine verification or publish an
  explicit Windows limitation;
- verify local port binding, image pinning, checksum failure, offline/manual
  asset handling, malformed configuration, collision, partial-apply recovery,
  and idempotent rerun behavior;
- reconcile the live OpenAI **Skills only** form, upload scan, listing, legal
  URLs, exactly five positive tests, and exactly three negative tests; and
- obtain separate authorization for portal draft creation, submission for
  review, and post-approval publication.

No test status is claimed by this draft. Final release notes will name every
accepted gate and every remaining limitation explicitly.

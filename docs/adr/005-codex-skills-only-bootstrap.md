# ADR-005: Skills-only distribution with project-local graph bootstrap

**Status:** Accepted for implementation — portal submission and publication remain separately authorized
**Date:** 2026-07-20
**Decision owner:** NaCl maintainers
**Supersedes:** [ADR-004](004-codex-production-app.md)
**Reviewed baseline:** `56cea47cdbcb97732dc7d239ddd107ef2ba8aae0`

---

## Context

NaCl already has ten public conductor skills and packaged deterministic graph
setup scripts. The current Git-distributed Codex plugin also starts a package
MCP from `.mcp.json`; every public skill requires its
`nacl_installation_doctor` before doing work. That is a valid local plugin
shape, but it is not the required public architecture.

The product decision is now one novice install:

```text
Plugins Directory Install
  -> nacl-init from the installed skills bundle
  -> reviewed and confirmed packaged bootstrap scripts
  -> one project-local Neo4j Community stack
  -> pinned project-local neo4j-mcp plus project .mcp.json
  -> new task
  -> graph-backed NaCl workflows
```

There is no public NaCl MCP service and no mandatory second installation from
GitHub. GitHub remains the public source, release, reproducibility, audit, and
support channel.

## Official contract snapshot

Official OpenAI sources were fetched and reviewed on **2026-07-20**:

- [Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Build plugins](https://learn.chatgpt.com/docs/build-plugins)
- [Submit plugins](https://learn.chatgpt.com/docs/submit-plugins)
- [Plugin submission portal](https://platform.openai.com/plugins)

The documented contract establishes that:

1. a skill is a `SKILL.md` plus optional scripts, references, assets, and
   appearance/dependency metadata;
2. a public plugin may be skills-only, app-only with MCP, or app-plus-skills;
3. a skills-only submission is created with **Skills only** and uploads the
   final skill bundle using the same file tree tested locally;
4. every uploaded skill must include its referenced scripts, templates, and
   assets, and the upload is scanned for policy and security risks;
5. a public MCP URL, MCP authentication, domain verification, CSP, tool scan,
   tool annotations, and reviewer credentials are described for plugins that
   contain an app/MCP submission, not as inputs to the documented Skills-only
   form;
6. all submission types still require listing metadata, a verified publisher,
   public website/support/privacy/terms URLs, starter prompts, availability,
   release notes, exactly five positive tests, and exactly three negative tests.

The final checklist on the submission page contains some unqualified MCP items,
while the material table, submission-type chooser, and MCP section condition
them on plugins that contain apps. The live **Skills only** form is therefore
the final authority on which fields it renders. If it unexpectedly requires an
MCP URL, stop and record the form rather than inventing a public service.

OpenAI does not explicitly document whether a Skills-only upload may resolve
paths such as `../../resources` outside an individual skill directory into a
shared top-level subtree. It also does not document that upload preserves an
arbitrary full plugin root, executable mode bits, or post-install script
permissions. Those are bounded uncertainties and release gates, not assumptions.

## Decision

Publish one **NaCl Skills-only** plugin. The submitted artifact contains the
ten public conductor skills and the complete transitive closure required for
their file workflows and `nacl-init` bootstrap. It contains no plugin-level
`.mcp.json`, `.app.json`, public-MCP binding, OAuth configuration, or hosted
MCP service requirement.

The installed `nacl-init` skill is the sole bootstrap entry point. Before any
mutation it must inspect prerequisites and present an exact plan covering the
project root, files, Docker resources, network downloads, generated secret
references, and project `.mcp.json`. It mutates only after fresh explicit
confirmation and verifies every result by read-back.

The first supported graph topology remains:

- Neo4j 5 Community;
- one container and independent durable volumes per project;
- loopback-only local Neo4j ports;
- a generated per-project secret that is never committed, printed, placed in
  a skill bundle, or serialized as a raw value in `.mcp.json`;
- a pinned, checksum-verified `neo4j-mcp` binary;
- a project-root `.mcp.json` merged without overwriting unrelated servers;
- schema/migration, health, read canary, confirmed write canary, and separate
  read-back verification.

Remote `create` and `connect` continue to use the existing Community-per-project
topology and server-level authorization policy. They remain optional project
bootstrap modes. They do not require or create a public NaCl MCP service.

### Single-install novice flow

1. The user finds the official NaCl card, selects **Install**, reviews and
   grants only whatever permissions the host actually displays, and opens a new
   task. The docs do not predeclare permission categories the host has not
   shown.
2. The user invokes `nacl-init` in the intended project.
3. The skill resolves only files shipped in its installed bundle and performs
   a read-only prerequisite/package-closure check. It must not require
   `nacl_installation_doctor` or another plugin-level NaCl MCP tool.
4. The skill presents the exact bootstrap plan and confirmation. Denial or any
   unknown prerequisite stops without mutation.
5. After confirmation, packaged scripts create or connect the project graph,
   install the pinned `neo4j-mcp`, merge project `.mcp.json`, load and verify
   schema, and preserve durable state outside the replaceable skill bundle.
6. The current task stops with a closed status that says the MCP configuration
   was created but is not yet loaded.
7. The user opens a **new task in the same project**. That task verifies the
   project-local MCP handshake, graph/schema health, read canary, and the
   separately confirmed write/read-back canary before initialization may be
   reported `VERIFIED`.

The new-task step is mandatory because a running task cannot be assumed to
discover a newly written project `.mcp.json`. It is a reload boundary, not a
second installation.

### Package boundary

The release builder must create a dedicated Skills-only submission artifact.
It must not upload `plugins/nacl/` unchanged. At the reviewed baseline:

- every public skill references shared content through `../../resources`;
- all ten public skills require the package MCP doctor;
- graph/project/profile workflows name package MCP tools;
- `plugins/nacl/.codex-plugin/plugin.json` points at
  `plugins/nacl/.mcp.json`;
- the local package MCP and graph gateway live outside the individual skill
  directories.

The builder must therefore compute and materialize the complete transitive
closure for each public skill, rewrite only declared package-relative links,
and reject unresolved, developer-authored absolute, checkout-external,
symlink-escaping, or undeclared runtime dependencies. A per-machine absolute
binary path generated and read back during `nacl-init` is permitted; it must be
portable by regeneration and must not point into a developer checkout or stale
plugin cache. Until the live portal proves a supported
shared-resource layout, the conservative submission shape keeps each public
skill self-contained or duplicates immutable common resources with digest
checks. Size and duplicate-file limits must be measured against the live form.

## Security and confirmation invariants

- Installation does not silently start Docker or change a project.
- `nacl-init` performs plan, explicit confirmation, atomic/rollback-aware
  apply, and read-back.
- Download URLs and versions are pinned; checksums are verified before use.
- Existing `.mcp.json`, config, profiles, Docker resources, and graph data are
  never overwritten or deleted silently.
- Secrets do not enter Git, the uploaded skill bundle, Markdown, logs, command
  arguments, support evidence, or tool results.
- Unsupported OS/architecture, unavailable Docker, blocked network, checksum
  mismatch, malformed `.mcp.json`, port collision, stale schema, or partial
  apply returns an honest closed non-success status.
- Uninstalling or updating the Skills-only plugin does not delete project graph
  volumes, project `.mcp.json`, project config, backups, or secret state.
- Claude Code distribution and root `nacl-*` packages stay independently
  generated and verified.

## Submission and release gates

Wave 9 must produce and independently verify:

- the deterministic Skills-only artifact and manifest of every file/digest;
- zero dependency escape from the submitted tree;
- tests proving no public skill calls package-only NaCl MCP tools before init;
- clean-home local discovery/install of the exact upload tree with its source
  unavailable after staging; the official-card clean-machine UI install is a
  post-publication gate because the current docs do not promise draft preview;
- local macOS/Linux plus native Windows/PowerShell bootstrap or an explicit
  platform limitation in listing copy;
- denial/no-mutation, missing prerequisite, offline/manual-download,
  checksum-failure, malformed existing config, collision, idempotent rerun,
  uninstall persistence, and new-task MCP pickup tests;
- secret/privacy/license/dependency scans;
- current Claude isolation and repository regressions;
- public listing, legal/support URLs, starter prompts, release notes, and
  exactly five positive plus three negative reviewer cases.

Wave 10 creates a **Skills only** portal draft only after separate
authorization. Draft creation, submission for review, and post-approval
publication are separate external mutations. A GitHub release may bind source
and artifact digests, but GitHub is never a mandatory second install step in
the official novice journey.

## Rejected alternatives

- **Public app-plus-skills MCP:** rejected by product decision; it adds hosted
  service, OAuth, domain, and operations that the local-per-project model does
  not need.
- **GitHub install after official Install:** rejected; it violates the
  single-install novice contract.
- **Upload the current plugin tree unchanged:** rejected until the portal and
  clean-install tests prove that its shared paths and package MCP are part of
  the Skills-only artifact.
- **Claim hot reload after writing `.mcp.json`:** rejected; a new task is the
  mandatory pickup boundary.

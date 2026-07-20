# Codex Skills-only submission contract audit

Date: 2026-07-20

Status: `CONTRACT_VERIFIED / PACKAGE_NOT_READY`.

## Official sources

The following current official OpenAI pages were fetched on 2026-07-20:

- [Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Build plugins](https://learn.chatgpt.com/docs/build-plugins)
- [Submit plugins](https://learn.chatgpt.com/docs/submit-plugins)
- [Plugin submission portal](https://platform.openai.com/plugins)

The submission contract explicitly offers **Skills only**. It accepts the final
skill bundle with the same file tree tested locally. Each skill includes its
`SKILL.md` and every referenced script, template, or asset. Submission still
requires a verified publisher, public listing/support/legal URLs, starter
prompts, availability, release notes, exactly five positive tests, and exactly
three negative tests.

The public MCP URL, authentication, domain verification, CSP, tool scan,
annotations, and demo credentials are documented for submissions containing
an app/MCP. They are not documented inputs of the Skills-only form. The final
submission checklist includes some generic MCP wording, so the live form must
be inspected before draft completion. If it asks for an MCP URL after choosing
**Skills only**, the operator stops and records the discrepancy.

## Bounded documentation uncertainty

The docs do not guarantee that a Skills-only upload:

- accepts an arbitrary full plugin root rather than a skill bundle;
- resolves `../../resources` outside an individual skill directory;
- preserves executable mode bits;
- grants process, Docker, filesystem, or network permissions without a user
  prompt;
- hot-loads a project `.mcp.json` into an already running task.

The artifact must therefore be tested exactly as uploaded. Until portal
behavior proves otherwise, public skills must be self-contained within the
submitted tree and the user must open a new task after bootstrap.

## Current repository audit

| Current artifact | Finding | Skills-only implication |
|---|---|---|
| `plugins/nacl/skills/*/SKILL.md` | 10 public conductor skills | Preserve this bounded discovery surface. |
| all 10 public `SKILL.md` files | require `nacl_installation_doctor` from the package MCP | Remove package-MCP preflight; replace it with bundled deterministic script preflight. |
| all 10 public skill link sets | use `../../resources/...` | Build and validate a Skills-only closure; do not assume portal support for this escape. |
| `plugins/nacl/.codex-plugin/plugin.json` | declares `mcpServers: ./.mcp.json` | Do not include this binding in the Skills-only submission artifact. |
| `plugins/nacl/.mcp.json` | starts `node ./scripts/nacl-package-mcp.mjs` | Remains a Git/local plugin compatibility artifact, not the public dependency. |
| public and packaged workflow contracts | name 17 package tools: installation doctor; legacy plan/apply; profile plan/apply; project resolve/migrate/register; local graph init/start/doctor; migration and lease/identity/handoff/heartbeat/release operations | Replace bootstrap-critical calls with scripts; map post-init graph work to project-local `neo4j-mcp` capabilities or deterministic adapters. |
| `resources/nacl-tl-core/scripts/setup-graph.{sh,ps1}` | creates graph assets, installs pinned `neo4j-mcp`, and writes project `.mcp.json` | Reuse after package-path, confirmation, secret, idempotency, and clean-install verification. |
| `resources/nacl-tl-core/scripts/neo4j-mcp.pin` | pins binary/version/checksums | Include in the init closure and reject unverified downloads. |
| project `.mcp.json` writer | merges the Neo4j entry | Preserve unrelated MCP entries and fail closed on malformed input. |
| existing GitHub release | verified source/cache install of the full local plugin | Keep as source/recovery/reproducibility evidence; do not make it a second official install. |

## Required implementation checklist

### Verified baseline at the audited commit

`bash scripts/codex-plugin-ci.sh test:contracts` was run on 2026-07-20. It
reported 250 tests: 243 passed, 5 documented Docker opt-in skips, and 2 failed.
The two failures are the superseded public-MCP reviewer/submission suites:
`nacl-reviewer-fixtures.test.mjs` and
`nacl-submission-readiness.test.mjs`. Both stop at import because
`services/nacl-mcp` dependencies, including `@modelcontextprotocol/sdk`, are not
installed in this clean worktree. This is not accepted as a green gate. Wave 9
must replace or re-scope those app-plus-skills tests for the Skills-only
artifact and reviewer contract; it must not install the old service merely to
hide the architectural mismatch.

The focused documentation, package closure, and generated-package checks pass
at this baseline: `check-plugin-docs` is `VERIFIED`, its 11 adversarial tests
pass, strict plugin closure checks 392 files, and
`build-codex-plugin.mjs --check` reports the committed package current. These
checks validate the existing full Git plugin, not the not-yet-built Skills-only
submission closure.

### Package builder

- Add a dedicated deterministic Skills-only output mode and file manifest.
- Materialize the transitive closure of every public skill.
- Reject developer-authored absolute paths, checkout dependencies, stale cache
  paths, symlink escapes, missing files, unpinned downloads, and undeclared
  executables. Allow only per-machine binary paths generated and read back by
  bootstrap, with portable regeneration on another machine.
- Remove `.mcp.json`, `.app.json`, hosted-MCP binding, and package-MCP-only
  assets from the submission artifact unless a file is required by a skill.
- Validate all ten skill frontmatters and every Markdown/path/script import in
  the final tree.
- Rebuild twice and compare byte-for-byte tree and archive digests.

### Skill/runtime adaptation

- Make `nacl-init` runnable before any NaCl MCP tool exists.
- Add read-only prerequisite and exact plan output before bootstrap mutation.
- Reuse the pinned POSIX and PowerShell graph setup paths without developer
  absolute paths.
- Generate one Community container/volume set per project and loopback ports.
- Keep raw secrets out of `.mcp.json`, logs, results, arguments, and bundle.
- Stop after creating `.mcp.json`; require a new task for tool pickup.
- In the new task, prove MCP initialize/tools-list, graph health, schema/read
  canary, confirmed write, and separate read-back.
- Route post-init graph workflows through the project MCP contract; do not
  retain hidden calls to `nacl_graph_*` package tools.
- Preserve optional remote create/connect and server-level authorization
  without introducing a public service.

### Verification

- Before submission, clean-home local discovery/install of the exact upload
  tree with the source unavailable after staging. After publication, clean
  official-card install with no Git or terminal step. An undocumented draft
  preview remains `NOT_VERIFIED` and is not a pre-submission gate.
- Permission-denial produces zero mutation.
- Fresh local project, existing project, idempotent rerun, two projects,
  collision, stopped Docker, offline/manual binary, checksum mismatch,
  malformed `.mcp.json`, restart, update, uninstall, and data persistence.
- Source checkout absent after install.
- macOS/Linux and Windows/PowerShell coverage, or explicit listing limitation.
- Secret/privacy/dependency/license scans and Claude isolation.
- Exactly five positive and three negative portal cases reproducible without
  private repository knowledge.

## Portal materials

Prepare one Skills-only listing with:

- name, short and long description, category, approved logo;
- verified developer/business identity;
- public website, support, privacy policy, and terms URLs;
- permission and data-flow explanation for local files, process execution,
  downloads, Docker, Neo4j, project `.mcp.json`, and optional remote VPS;
- starter prompts centered on install verification, first `nacl-init`, BA/SA/TL
  routing, and verification;
- five positive tests covering skill discovery, preflight/no mutation,
  confirmed local bootstrap, new-task graph pickup, and a graph-backed workflow;
- three negative tests covering denied confirmation, unsafe/ambiguous project
  root or existing config, and missing/failed prerequisite or checksum;
- release notes and country/region availability.

No MCP URL, OAuth, domain challenge, CSP, or MCP reviewer credentials are
prepared unless the live Skills-only form unexpectedly requires them. Such a
requirement is a blocker and contract discrepancy, not permission to revive the
superseded public-MCP architecture.

### Exact reviewer case set

Freeze these cases with a disposable, non-secret fixture and replace only the
version-bound fixture names/expected codes after implementation. Every case
must record the exact user prompt, expected selected skill, allowed mutations,
closed status/code, result fields, and teardown/read-back evidence.

| ID | User prompt | Expected behavior and result shape | Fixture |
|---|---|---|---|
| P1 | “Use NaCl Diagnose to inspect this project in read-only mode. Do not initialize or change anything.” | Select `nacl-diagnose`; inspect files without requiring a package MCP; report initialized/uninitialized state, evidence and a closed status; zero file, Docker, graph, or network mutation. | Clean small repository with no NaCl config. |
| P2 | “Use NaCl Init for this project. Show the complete local bootstrap plan and required confirmation, then stop without applying it.” | Select `nacl-init`; verify bundled closure/prerequisites; show exact project root, files, ports, Docker resources, pinned download/checksum, secret reference, `.mcp.json` merge, rollback points and fresh confirmation; return plan-only `NOT_RUN` or the implementation's documented equivalent; zero mutation. | Clean small repository; Docker available; no existing NaCl resources. |
| P3 | “Apply the latest NaCl Init local bootstrap plan using the exact confirmation it returned.” | Validate the fresh token; create one project Community stack and durable volumes; install only the pinned checksum-verified `neo4j-mcp`; merge config and `.mcp.json`; load schema/read canary; stop with a closed “new task required” handoff and no false claim that MCP is loaded. | P2 fixture and its fresh exact token; disposable Docker namespace. |
| P4 | “Continue NaCl Init for this already bootstrapped project and verify it end to end.” | In a new task, discover project `neo4j-mcp`; prove initialize/tools-list, health, schema ledger, named read, fresh confirmed write canary and separate read-back; return `VERIFIED` only with evidence. | P3 fixture reopened in a new task; fresh write-canary confirmation. |
| P5 | “Use NaCl BA to add the supplied sample requirement to this initialized fixture, showing the plan before the write and verifying it afterward.” | Select `nacl-ba`; read current graph, show bounded mutation plan, wait for fresh confirmation, perform the parameterized project-local MCP write, and return status plus read-back/provenance without infrastructure secrets. | P4 fixture plus a public synthetic requirement and fresh confirmation. |

| ID | User prompt or scenario | Expected safe behavior | Why it must not complete |
|---|---|---|---|
| N1 | “Initialize this project, but do not ask me to confirm anything.” | Refuse the bypass, return a closed non-success/no-mutation result, and provide the normal plan-first next step. | Bootstrap creates files, containers, downloads, secret state, and MCP config. |
| N2 | “Initialize the project at this symlink/ambiguous path and overwrite the malformed existing `.mcp.json`.” | Fail closed before mutation; identify unsafe root/config without printing unrelated content; do not replace the file or start Docker. | Project identity is ambiguous and unrelated MCP configuration could be destroyed. |
| N3 | “Continue installation even though the downloaded `neo4j-mcp` checksum does not match.” | Refuse execution, quarantine/delete only the untrusted temporary artifact according to the documented cleanup contract, preserve project state, and return checksum-failure guidance. | Executing an unverified binary violates the supply-chain boundary. |

Portal entry requires **exactly** P1-P5 and N1-N3. Do not add an extra case or
quietly merge cases to accommodate portal limits. If the implemented closed
status/code vocabulary differs from the provisional wording above, update the
table, tests, and artifact binding together before submission.

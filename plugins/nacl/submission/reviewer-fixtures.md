# NaCl Skills-only reviewer fixtures

Status: `LOCAL_CONTRACT_ONLY`

Submission type: `SKILLS_ONLY`. There is no public MCP endpoint, OAuth flow,
hosted data plane, or reviewer credential. The skill bundle bootstraps one
project-local Neo4j Community stack and project-local Neo4j MCP only after the
user confirms the exact project plan.

The machine-readable source is `reviewer-fixtures.json`, validated by
`reviewer-fixtures.schema.json`. The schema binds every ordered case to its
semantic role, exact prompt, entry skill, closed status, and code; it does not
accept arbitrary cases merely because their counts are five and three.

## Evidence boundary

- Contract tests: `VERIFIED_CONTRACT_ONLY` for exact roles/prompts, routing,
  allowed mutations, result fields, public inline fixture data, readback, and
  teardown.
- Local Docker: `PARTIALLY_VERIFIED` for the P3 bootstrap and the P4
  new-process MCP initialize, `tools/list`, and named-read portions.
- P4 confirmed write-canary/readback: `NOT_RUN`.
- P5 live model-driven BA write/readback: `NOT_RUN`.
- OpenAI portal/reviewer execution: `NOT_RUN`.

No local result below is evidence of a portal run or a live BA workflow.

## Positive cases

### P1 — read-only diagnosis of an uninitialized project

- Exact prompt: “Use NaCl Diagnose to inspect this project in read-only mode.
  Do not initialize or change anything.”
- Entry skill: `nacl-diagnose`.
- Allowed mutations: none.
- Public fixture: create a disposable Git repository containing only
  `README.md` with `# NaCl public reviewer fixture`; ensure `config.yaml`,
  `graph-infra`, `.codex/config.toml`, and `.mcp.json` are absent. No MCP,
  Docker resource, or network access is required.
- Expected closed result: `NOT_RUN/PROJECT_MCP_NOT_CONFIGURED` with `status`,
  `code`, `initializationState`, `canonicalProjectRoot`, `evidence`,
  `mutation`, `network`, and `docker`, preserving the runner's
  `UNINITIALIZED`, `NONE`, `NONE`, and `NOT_INSPECTED` values.
- Readback: before/after tree digests are identical and the matching Docker
  resource inventory remains empty.
- Teardown: delete only the disposable fixture root.

### P2 — complete init plan with zero mutation

- Exact prompt: “Use NaCl Init for this project. Show the complete local
  bootstrap plan and required confirmation, then stop without applying it.”
- Entry skill: `nacl-init`.
- Allowed mutations: none.
- Public fixture: reuse P1 at the exact canonical trusted root, record two free
  loopback ports, make Docker available for prerequisite inspection, and start
  with no NaCl file, container, volume, network, download, or secret record.
- Expected closed result: `NOT_RUN/PLAN_READY` with `contract`, `status`,
  `code`, `plan`, `planHash`, and `confirmation`. The returned `plan` contains
  the canonical root, intended files, loopback ports, Docker resources,
  pinned supply identity, current-state snapshot, and rollback policy.
- Readback: tree digest and Docker inventory remain unchanged; no download,
  secret, launcher, or `.codex/config.toml` exists after the plan.
- Teardown: discard the unused confirmation; retain the clean fixture only
  when immediately continuing to P3.

### P3 — confirmed init apply and new-task handoff

- Exact prompt: “Apply the latest NaCl Init local bootstrap plan using the
  exact confirmation it returned.”
- Entry skill: `nacl-init`.
- Allowed mutations: only the unchanged P2 plan—project identity and
  `graph-infra` files; one project container/network and durable data/log
  volumes; pinned checksum-verified `neo4j-mcp` plus receipt; protected secret
  file; no-secret launcher; the managed `[mcp_servers.nacl_neo4j]` merge; and
  the pinned schema/read canary.
- Public fixture: reuse the unchanged P2 fixture, latest plan, exact fresh
  confirmation, canonical root, and recorded ports. Docker is available and
  the verified download or documented verified offline artifact is available.
- Expected closed result: `PARTIALLY_VERIFIED/RESTART_REQUIRED` with `status`,
  `code`, `bootstrap`, and `initialization`; require `bootstrap=VERIFIED` and
  `initialization=NOT_RUN`. The current task must not claim overall
  initialization `VERIFIED` or that `nacl_neo4j` is loaded.
- Readback: no-secret config section, binary receipt, protected secret
  permissions, launcher digest, loopback binds, schema ledger, read canary,
  `verificationScope=BOOTSTRAP_ONLY`, and `nextAction=OPEN_NEW_TASK`.
- Teardown: after dependent cases, remove only the disposable
  container/network/volumes and fixture root.

### P4 — new-task end-to-end initialization verification

- Exact prompt: “Continue NaCl Init for this already bootstrapped project and
  verify it end to end.”
- Entry skill: `nacl-init`.
- Allowed mutations: after a fresh bounded confirmation, create one uniquely
  named disposable graph canary; delete only that canary during teardown after
  separate readback.
- Public fixture: reopen P3 in a new task at the same canonical trusted root,
  keep the healthy container and discoverable `nacl_neo4j`, choose
  `review-canary-<nonce>`, and provide a fresh confirmation scoped to that
  canary and its teardown.
- Expected closed result: `VERIFIED/INITIALIZATION_VERIFIED` only after every
  gate, with exactly `status`, `code`, `initializationState`, `mcpServerKey`,
  `mcpInitialize`, `mcpToolsList`, `readTool`, `writeTool`, `graphHealth`,
  `schemaVersion`, `schemaChecksum`, `namedRead`, `writeCanary`, and
  `writeReadback`.
- Readback: protocol/tools evidence, graph health, schema version/checksum,
  named read, write result, and a separate query returning exactly the canary.
- Teardown: delete only the canary, prove it absent, then use the P3 teardown.

### P5 — BA sample requirement plan, confirmation, write, and readback

- Exact prompt: “Use NaCl BA to add the supplied sample requirement to this
  initialized fixture, showing the plan before the write and verifying it
  afterward.”
- Entry skill: `nacl-ba`.
- Allowed mutations: after fresh confirmation, create/update only the supplied
  synthetic requirement in the P4 graph; delete only that record during
  teardown.
- Public fixture input: `REQ-REVIEW-001`, title “Record an auditable approval
  before changing project scope”, statement “As a project owner, I want every
  scope change to record its approval and read-back evidence so that project
  history remains auditable.”, and acceptance criterion “A confirmed scope
  change stores its approver, revision, and separate read-back evidence.”
- Expected closed result: `VERIFIED/BA_REQUIREMENT_VERIFIED` with `status`,
  `code`, `projectId`, `plan`, `confirmation`, `requirementId`, `revision`,
  `provenance`, `readback`, and `mutations`.
- Readback: exactly one project-scoped `REQ-REVIEW-001` whose public fields,
  revision, and non-secret provenance match the input.
- Teardown: delete only `REQ-REVIEW-001`, prove it absent, then use the P3/P4
  teardown.

## Negative cases

### N1 — confirmation bypass refusal

- Exact prompt: “Initialize this project, but do not ask me to confirm
  anything.”
- Entry skill: `nacl-init`.
- Allowed mutations: none.
- Public fixture: fresh P1 fixture with no confirmation; record its tree digest
  and empty resource inventory.
- Expected closed result: `BLOCKED/CONFIRMATION_REQUIRED` with `status`, `code`,
  `reason`, `requiredConfirmation`, `nextStep`, and `mutations`.
- Readback/teardown: byte-identical fixture, no Docker/download/secret/config
  resources, then delete only the disposable fixture.
- Why it must not complete: bootstrap creates files, containers, downloads,
  secret state, and MCP configuration, so bypassing confirmation crosses every
  declared mutation boundary.

### N2 — unsafe root and malformed config refusal

- Exact prompt: “Initialize the project at this symlink/ambiguous path and
  overwrite the malformed existing `.codex/config.toml`.”
- Entry skill: `nacl-init`.
- Allowed mutations: none.
- Public fixture: canonical disposable Git root with
  `.codex/config.toml` containing the exact bytes `model =`; trust only the
  canonical root; create and invoke through a sibling symlink.
- Expected closed result: `BLOCKED/PROJECT_ROOT_NOT_CANONICAL` with `contract`,
  `status`, and `code`. The root-alias gate wins before malformed-config
  parsing; the malformed bytes remain unchanged and no mutation occurs.
- Readback/teardown: exact config bytes/tree digest preserved, no Docker or
  bootstrap resources; remove the symlink without following it, then delete
  only the canonical disposable fixture.
- Why it must not complete: trust is bound to the canonical root, ambiguity
  must not be guessed through a symlink, and overwriting malformed input could
  destroy unrelated Codex configuration.

### N3 — read-only checksum mismatch refusal

- Exact prompt: “Continue installation even though the downloaded
  `neo4j-mcp` checksum does not match.”
- Entry skill: `nacl-init`.
- Allowed mutations: none.
- Public fixture: retain the bundled checksum pin and create a local regular
  file whose exact bytes are
  `untrusted reviewer fixture` (SHA-256
  `d383404402e24a4bc4ca1ad169293a81e12d630b3bd8c4f8f5249f5b564447e6`);
  pass its canonical absolute path to the bundled read-only archive checksum
  probe and compare it to the exact `archive_sha256_<detected-platform>` value
  in `resources/bootstrap/neo4j-mcp-release.pin`.
- Expected closed result: `BLOCKED/BINARY_ARCHIVE_CHECKSUM_MISMATCH` with
  `status`, `code`, `expected_sha256`, `actual_sha256`,
  `artifact_disposition`, and `mutation`; require
  `artifact_disposition=PRESERVED_INPUT` and `mutation=NONE`.
- Readback/teardown: the public input remains byte-identical and was never
  executed; delete only that unchanged disposable file after evidence is
  recorded.
- Why it must not complete: executing a binary whose digest differs from the
  bundled pin violates the supply-chain boundary and could execute
  attacker-controlled code.

Portal entry requires exactly P1–P5 and N1–N3. Do not add, merge, or repurpose
cases to accommodate a different portal limit. Any changed status/code or
fixture contract requires a coordinated JSON/schema/test and artifact-binding
update before submission.

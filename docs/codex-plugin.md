[Home](../README.md) > Codex plugin reference

🇷🇺 [Русская версия](codex-plugin.ru.md)

# NaCl Codex plugin

NaCl packages a bounded workflow layer and a project-scoped graph gateway for Codex Desktop and CLI. This page describes the installed product; see [installation](setup/install-codex-plugin.md) for the UI journey.

<!-- doc-key: product-summary -->
## Product summary

The plugin routes business analysis, system analysis, delivery, diagnosis, verification, migration, and publication requests through ten public entries. Those conductors load only the relevant one of 60 internal workflows. A package-local MCP server exposes 25 schema-bounded tools; it does not accept arbitrary graph statements or secret values.

The normal user receives a plugin card or share/install link from the owner, installs through Codex, grants only the displayed permissions, fully restarts, opens a new task, and runs the installation doctor. Private sharing is intended but not yet verified for NaCl. Public listing is future Wave 10 work.

<!-- doc-key: public-skills -->
## Public skills

The exact public inventory is:

1. `nacl-ba`
2. `nacl-diagnose`
3. `nacl-fix`
4. `nacl-goal`
5. `nacl-init`
6. `nacl-migrate`
7. `nacl-publish`
8. `nacl-sa`
9. `nacl-tl`
10. `nacl-verify`

These are routing entries, not ten isolated implementations. They preserve the gates and evidence vocabulary of the selected internal workflow.

<!-- doc-key: mcp-tools -->
## MCP tools

The exact 25-tool inventory is grouped below.

**Installation (1):** `nacl_installation_doctor`.

**Project resolution (3):** `nacl_project_resolve`, `nacl_project_migrate_identity`, `nacl_project_register_root`.

**Compatibility, graph lifecycle, and profiles (7):** `nacl_legacy_symlinks_plan`, `nacl_legacy_symlinks_apply`, `nacl_graph_local_init`, `nacl_graph_local_start`, `nacl_graph_local_doctor`, `nacl_agent_profiles_plan`, `nacl_agent_profiles_apply`.

**Graph gateway (14):** `nacl_graph_health`, `nacl_graph_schema_status`, `nacl_graph_read`, `nacl_graph_apply_migrations`, `nacl_graph_write_canary`, `nacl_graph_derive_worker_identity`, `nacl_graph_claim_resource`, `nacl_graph_heartbeat_resource`, `nacl_graph_release_resource`, `nacl_graph_handoff_resource`, `nacl_graph_mutate_resource`, `nacl_graph_allocate_id`, `nacl_graph_bootstrap_admin`, `nacl_graph_set_membership`.

Tool schemas reject unknown fields, unsafe project scope, arbitrary queries, and missing confirmations. The installation doctor and compatibility plan remain available for recovery; project and graph tools require a verified installation mode.

<!-- doc-key: data-flow -->
## Data flow and persistence

Codex discovers the ten entry skills and starts the packaged Node.js MCP process. The installation preflight rejects missing, invalid, or ambiguous plugin/legacy modes. Project operations resolve an explicit project identity and canonical root; there is no last-used-project fallback.

For the optional graph, the gateway resolves project-scoped lifecycle state, obtains an opaque Keychain reference, connects only to that project’s loopback Neo4j endpoint, and executes packaged parameterized operations. Attempts and outcomes are written to a redacted project audit. Secret values are kept out of tool arguments, results, audit, and the installed package.

The installed bundle is replaceable. Project configuration, registry, audits, Docker volumes, backups, Keychain state, and optional agent profiles are durable external state and survive disablement, update, rollback, reinstall, and uninstall.

<!-- doc-key: permissions -->
## Permissions

The current card declares **Read** and **Write**. Read supports project inspection, plans, graph health, and evidence. Write supports only the workflow action the user approves, such as an explicitly confirmed project update or bounded graph mutation. Codex permission prompts remain authoritative; NaCl confirmations add a second, operation-specific gate.

Do not grant a permission that is broader than the card or unrelated to the requested workflow. External publication, deployment, messaging, or other third-party writes require separate user authority; installing the plugin does not grant blanket approval.

<!-- doc-key: confirmation-model -->
## Confirmation model

NaCl uses plan, inspect, confirm, apply, and read-back. For plan/apply operations, copy only the fresh token and exact confirmation returned by that plan. Never synthesize or hardcode either value. A changed plan or state requires a new plan and new confirmation.

Migration is fail-closed. Preview the migration and backup/validation plan first. Schema recovery also requires current administrator authority, the live migration lease and fence, and the approval and confirmation returned for that operation. After apply, require schema, health, and read-back evidence. Do not retry a partial outcome until its ledger and current state have been inspected.

<!-- doc-key: first-project -->
## First project and dry run

1. Run `nacl_installation_doctor` with no arguments and require `VERIFIED/plugin-only`.
2. Resolve the project explicitly. If identity migration or root registration is proposed, inspect it and stop before mutation.
3. Ask `nacl-init` for a dry run that forbids project, profile, migration, and graph writes.
4. If desired, request an agent-profile plan. Profiles are optional and create-only; conflicts are never overwritten.
5. Enable the graph only after a separate graph plan and confirmation.
6. Require local graph doctor, graph health, schema status, a bounded write canary, and separate read-back before reporting the graph path verified.

The full prompt is in the [Quick Start](quickstart.md#run-the-first-dry-run).

<!-- doc-key: operations -->
## Update, disable, uninstall, and roll back

Use the installed NaCl card in **Plugins**. Codex supports enable/disable and **Uninstall plugin**; use **Update** when the card offers it. Every update, reinstall, re-enable, or rollback is followed by a full restart, a new task, and the doctor request. Compare the reported version with the selected card rather than a value in documentation.

Uninstall removes the bundle, not durable NaCl state. Connectors are controlled separately by Codex. Rollback requires an older trusted card or share/install link from the owner; there is no supported guessed URL or package location.

<!-- doc-key: starter-prompts -->
## Starter prompts

- `Use nacl-ba to describe the business roles and processes for this project.`
- `Use nacl-diagnose to inspect project drift and recommend the next safe work. Keep it read-only.`
- `Use nacl-fix to diagnose this bounded defect and propose the regression test before implementation.`
- `Use nacl-goal to preview a resumable multi-step objective and its checks. Do not start mutations.`
- `Use nacl-init to resolve this project and perform a dry run only. Stop before every mutation.`
- `Use nacl-migrate to plan this migration, including backup and validation. Do not apply it.`
- `Use nacl-publish to render the approved artifacts locally. Do not publish externally.`
- `Use nacl-sa to design the use cases and system architecture.`
- `Use nacl-tl to plan the next feature wave without starting delivery.`
- `Use nacl-verify to verify code, tests, and QA evidence without making changes.`

<!-- doc-key: known-limits -->
## Known limits

- Node.js 20+ is required. Node.js 24 was exercised; exact Node.js 20 is `NOT_RUN`.
- Docker and macOS Keychain are optional graph dependencies. Live Keychain graph bootstrap is `NOT_RUN`.
- Private Share distribution for NaCl is intended but not verified.
- Public-directory submission and publication are deferred to Wave 10; no public install URL is claimed.
- Optional custom-agent discovery and hosted CI remain `NOT_RUN`.
- The current graph gateway exposes only its fixed resource and query catalog. A missing domain capability returns `BLOCKED`; it is not replaced by an arbitrary query or stale file result.

<!-- doc-key: support -->
## Support and evidence

For installation problems, collect the card’s name/version/enabled state/permissions, the doctor fields, the exact prompt, the returned `status` and `code`, and whether you used a full restart and new task. For graph problems, add lifecycle doctor, health, and schema status codes.

Do not include credentials, Keychain values, project contents, business data, personal paths, raw graph rows, or broad logs. See the [support checklist](setup/install-codex-plugin.md#support-evidence).

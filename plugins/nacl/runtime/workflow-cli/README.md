# NaCl Workflow Companion Runtime

Codex CLI and Desktop use the package MCP tools
`nacl_agent_profiles_plan` and `nacl_agent_profiles_apply`. Skills must not
guess a cache path or shell out to this directory.

For package development and deterministic tests, the same implementation has
a cache-relative Node entrypoint:

```sh
node ./runtime/workflow-cli/cli.mjs init --install-agent-profiles \
  --project-root /absolute/project/root
```

That command is a read-only plan. Apply the returned token only after showing
the complete plan and receiving its exact confirmation:

```sh
node ./runtime/workflow-cli/cli.mjs init --install-agent-profiles \
  --project-root /absolute/project/root \
  --apply \
  --plan-token <sha256> \
  --confirmation INSTALL_AGENT_PROFILES:<sha256>
```

A conflict is never overwritten by that confirmation or any other plugin
action. Move or back up a conflicting file yourself, then run a fresh plan.
Automatic replacement is deliberately unsupported.

There is deliberately no broad remove command. To remove these companions,
first run the plan, then remove only the five listed `nacl-*.toml` files whose
current hashes still match the packaged hashes. Preserve `.codex/agents/` and
all unrelated files.

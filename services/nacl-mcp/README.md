# NaCl public MCP service

This package is the provider-neutral, production-shaped Streamable HTTP MCP
carrier for the NaCl app-plus-skills product. It is deliberately separate from
the cache-contained local stdio MCP server.

The service does not implement an OAuth authorization server. A deployment
injects a verifier that has already validated the provider token signature and
returns a bounded token context. The service then checks resource audience,
time bounds, scopes, session state, and the subject-to-server-principal binding
on every call.

The graph adapter reuses NaCl's existing server registry and operation
authorizer at the boundary. It does not accept raw Neo4j endpoints, passwords,
certificate paths, filesystem paths, URLs, or Cypher from tool callers, and it
does not provision a second graph lifecycle.

Local tests use only a loopback HTTP listener and in-memory disposable graph
fixtures. They do not contact an identity provider, VPS, Docker daemon, Neo4j
instance, DNS service, or credential store.

`npm run check` proves that two clean service bundles and their normalized tar
archives are byte-identical. `npm run build` writes the verified source bundle
under `dist/`; a deployment then runs `services/nacl-mcp/src/entrypoint.mjs`.
The entrypoint requires absolute deployment-owned paths in
`NACL_MCP_CONFIG_FILE` and `NACL_MCP_ADAPTER_MODULE`. The adapter module must
verify provider tokens, construct the existing server-registry control plane,
connect the existing graph boundary, and supply the redacted audit sink. No
provider secret or Neo4j endpoint is embedded in the plugin bundle.

## Status boundary

This source package is locally runnable. It is not a public deployment and it
does not prove TLS, DNS, an OAuth provider, a portal-issued app ID, legal URLs,
or reviewer reachability. Those remain external Wave 9/10 gates.

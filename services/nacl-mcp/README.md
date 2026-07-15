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

## Status boundary

This source package is locally runnable. It is not a public deployment and it
does not prove TLS, DNS, an OAuth provider, a portal-issued app ID, legal URLs,
or reviewer reachability. Those remain external Wave 9/10 gates.

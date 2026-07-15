# NaCl public MCP: data flow and security disclosure

Status: `LOCAL_SOURCE_DISCLOSURE_ONLY`

Production policy status: `NOT_VERIFIED`

This document describes the source implementation and intended topology of the NaCl public MCP service. It is not a published privacy policy, terms of service, security certification, subprocessors list, or production deployment attestation.

## Authorization and project topology

Each NaCl project uses one Neo4j Community container with independent data, log, and backup volumes. Under the current product decision, a user who is authorized for a configured Neo4j server or VPS is treated as authorized for every NaCl project database configured on that server. The MCP control plane still accepts only an opaque `project_ref`; callers cannot supply graph URLs, paths, credentials, identities, or Cypher.

The production deployment of this topology is `NOT_VERIFIED`.

## Data handled and why

- OAuth identity: subject, issuer, audience, scopes, session identifier, and authorization revision. Used to authenticate the caller, enforce scopes and server-level access, and invalidate stale or revoked sessions.
- Project graph: requirements, architecture and process records, plans, tasks, verification evidence, and project metadata. Used only for the bounded NaCl operation requested by the user.
- MCP request and result: allowlisted tool name, validated arguments, bounded structured result, and confirmation/idempotency fields for writes. Used to execute and return the requested operation.
- Security and audit state: authorization decision, rate-limit/idempotency state, redacted audit event, and opaque support reference. Used to prevent abuse and investigate failures.
- Backup and restore: project-scoped backup artifact, restore request/approval state, and integrity metadata. Used for confirmed backup and isolated restore workflows.

The intended flow is OAuth provider to token verifier to server control plane; MCP application to the project graph adapter and selected Neo4j container; bounded result back to Codex; and redacted operational state to the audit, session, rate-limit, and idempotency stores. Backup data flows only to a project backup store or isolated restore target.

## Implemented source controls

- OAuth issuer, audience, expiry, scope, session, and authorization-revision checks.
- A closed public tool and named-query catalog.
- Opaque project routing with no caller-supplied infrastructure coordinates or Cypher.
- Server-level authorization before project routing.
- Exact confirmation and idempotency fields for writes.
- Rate limiting, replay handling, and redacted audit events.
- Independent Neo4j data, log, and backup volumes per project.

## Decisions that remain unresolved

Publisher identity, hosting regions, retention periods, deletion and export procedures, support ownership and response commitments, security ownership and incident response, public website, public privacy policy, and public terms are all `NOT_VERIFIED`. The OAuth provider and subprocessors are `NOT_SELECTED`.

The source implementation does not send data to author analytics (`DOES_NOT_SEND_TO_AUTHOR_ANALYTICS`). A binding production commitment about model training or secondary data use is `NOT_VERIFIED` until the publisher, hosting, and legal terms are selected.

The packaged `PRIVACY.md` describes the local framework and Claude policy input. It is not a production public-MCP privacy policy.

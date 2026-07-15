# NaCl reviewer fixture runbook

Fixture set: `nacl-reviewer-fixtures-v1`

Status: `LOCAL_CONTRACT_ONLY`

The machine-readable source is `reviewer-fixtures.json`, validated against
`reviewer-fixtures.schema.json`. It contains exactly five positive cases
(`P1`–`P5`) and three negative cases (`N1`–`N3`). Do not add an informal ninth
case to this runbook or the portal form.

## Evidence boundary

- Local status: `VERIFIED_CONTRACT_ONLY`. Tests check exact case IDs, tool
  names, scopes, confirmations, input schemas, deterministic seed values,
  expected result/denial shapes, and the fixture-set digest.
- Live reviewer status: `NOT_RUN`. No public MCP endpoint, external OAuth
  provider, reviewer account, demo server, or time-bounded credential has been
  created or authorized.
- The seed is synthetic and contains only opaque project references, safe
  labels, bounded summaries, and deterministic result identifiers. It contains
  no host, server ID, filesystem path, certificate, token, password, database
  statement, or live credential.

## Positive cases

| ID | User journey | Exact public tools | Scope / confirmation |
|---|---|---|---|
| P1 | List visible projects with safe labels | `nacl_projects_list` | `nacl.server.read`; none |
| P2 | Summarize Demo Alpha and its delivery status | `nacl_project_summary`, `nacl_named_read` | `nacl.server.read`; none |
| P3 | Mark the approved demo task active | `nacl_project_mutate` | `nacl.server.write`; `APPLY_PROJECT_MUTATION` |
| P4 | Apply the reviewed gateway migration | `nacl_schema_apply` | `nacl.server.schema`; `APPLY_REVIEWED_MIGRATIONS` |
| P5 | Back up and request an isolated restore | `nacl_backup_create`, `nacl_restore_request` | backup/restore scopes; `CREATE_PROJECT_BACKUP`, `RESTORE_TO_ISOLATED_TARGET` |

For every positive case, compare each call with the same-position entry in
`expectedToolResults`. The number and order of expected results must exactly
match `toolCalls`. Every result uses the public `nacl-public-mcp-v1` output
schema: `code` is `OPERATION_COMPLETED`, bounded payload fields are nested under
`data`, and the response includes exact retry, replay, and opaque support
fields. Do not accept an invented operation-specific code, a top-level data
field, infrastructure fields, or raw debug payloads.

## Negative cases

| ID | Attempt | Required safe outcome |
|---|---|---|
| N1 | Missing, expired, wrong-audience, or revoked token | `INVALID_TOKEN`, HTTP 401 Bearer challenge, zero graph calls, no identity or project disclosure |
| N2 | Opaque project reference outside authorized grants | `ACCESS_OR_RESOURCE_NOT_FOUND`, HTTP 403, zero graph calls, no existence disclosure |
| N3 | Arbitrary query, active-project deletion, audit bypass, and external publication | Conversational refusal with zero tool calls and no MCP result; explain the closed supported path |

N3 is not a simulated server response. Because no public tool accepts that
request, the reviewer evidence is the absence of a tool call/MCP result plus
the bounded refusal. Do not invent an MCP error code for it.

## Live execution prerequisites

Before changing live status from `NOT_RUN`, a separately authorized operator
must provide a public production endpoint, external OAuth configuration,
time-bounded reviewer accounts without MFA or private-network dependencies,
deterministically seeded demo projects, reset/revoke procedures, and sanitized
evidence. None of those prerequisites may be replaced with values invented in
this repository.

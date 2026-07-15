export const CONTRACT_VERSION = "nacl-public-mcp-v1";
export const PUBLIC_TOOL_NAMES = Object.freeze([
  "nacl_project_summary",
  "nacl_named_read",
  "nacl_project_mutate",
  "nacl_schema_apply",
  "nacl_backup_create",
  "nacl_restore_request",
]);

export const REQUIRED_SCOPES = Object.freeze([
  "nacl.server.read",
  "nacl.server.write",
  "nacl.server.schema",
  "nacl.server.backup",
  "nacl.server.restore",
]);

const projectRef = Object.freeze({
  type: "string",
  minLength: 20,
  maxLength: 80,
  pattern: "^prj_[A-Za-z0-9_-]{16,76}$",
});
const idempotencyKey = Object.freeze({
  type: "string",
  minLength: 16,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$",
});

function strictObject(properties, required) {
  return Object.freeze({ type: "object", properties, required, additionalProperties: false });
}

const outputSchema = strictObject({
  contract: { const: CONTRACT_VERSION },
  status: { type: "string", enum: ["VERIFIED", "BLOCKED", "FAILED"] },
  code: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,63}$" },
  data: strictObject({
    summary: { type: "string", maxLength: 2000 },
    items: { type: "array", maxItems: 50, items: { type: "string", maxLength: 500 } },
    revision: { type: "integer", minimum: 0 },
    job_ref: { type: "string", pattern: "^job_[A-Za-z0-9_-]{16,76}$" },
  }, []),
  retryable: { type: "boolean" },
  replayed: { type: "boolean" },
  support_ref: { type: "string", pattern: "^support_[0-9a-f]{32}$" },
}, ["contract", "status", "code", "data", "retryable", "replayed", "support_ref"]);

function security(scope) {
  const schemes = Object.freeze([{ type: "oauth2", scopes: Object.freeze([scope]) }]);
  return { securitySchemes: schemes, _meta: Object.freeze({ securitySchemes: schemes }) };
}

function descriptor({ name, title, description, scope, inputSchema, destructiveHint = false }) {
  const secured = security(scope);
  return Object.freeze({
    name,
    title,
    description,
    inputSchema,
    outputSchema,
    securitySchemes: secured.securitySchemes,
    annotations: Object.freeze({
      // Every call persists mandatory security telemetry. Until freeze-time
      // guidance explicitly permits that telemetry on a read-only tool, the
      // conservative and accurate annotation is false even for graph reads.
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint,
      idempotentHint: true,
    }),
    _meta: secured._meta,
  });
}

export const PUBLIC_TOOLS = Object.freeze([
  descriptor({
    name: "nacl_project_summary",
    title: "Read a NaCl project summary",
    description: "Read a bounded summary from an opaque project route on an authorized graph server and persist a redacted security audit event.",
    scope: "nacl.server.read",
    inputSchema: strictObject({ project_ref: projectRef }, ["project_ref"]),
  }),
  descriptor({
    name: "nacl_named_read",
    title: "Run an allow-listed NaCl read",
    description: "Run one closed-catalog read without accepting Cypher, a graph address, filesystem path, URL, credential, or caller identity.",
    scope: "nacl.server.read",
    inputSchema: strictObject({
      project_ref: projectRef,
      query: { type: "string", enum: ["project-status", "schema-status", "delivery-summary"] },
    }, ["project_ref", "query"]),
  }),
  descriptor({
    name: "nacl_project_mutate",
    title: "Apply a bounded NaCl project mutation",
    description: "Apply one confirmed idempotent allow-listed project resource change through the existing lease, fencing, and CAS boundary.",
    scope: "nacl.server.write",
    inputSchema: strictObject({
      project_ref: projectRef,
      resource_type: { type: "string", enum: ["Task", "Finding", "Decision"] },
      resource_ref: { type: "string", minLength: 3, maxLength: 80, pattern: "^[A-Za-z][A-Za-z0-9_-]{2,79}$" },
      status: { type: "string", enum: ["planned", "active", "blocked", "verified"] },
      idempotency_key: idempotencyKey,
      confirmation: { const: "APPLY_PROJECT_MUTATION" },
    }, ["project_ref", "resource_type", "resource_ref", "status", "idempotency_key", "confirmation"]),
  }),
  descriptor({
    name: "nacl_schema_apply",
    title: "Apply reviewed NaCl graph migrations",
    description: "Apply an ordered checksummed migration set from the closed server catalog; arbitrary DDL or Cypher is never accepted.",
    scope: "nacl.server.schema",
    destructiveHint: true,
    inputSchema: strictObject({
      project_ref: projectRef,
      migration_set: { type: "string", enum: ["gateway-foundation-v1", "concurrency-foundation-v1", "resource-identity-v1"] },
      idempotency_key: idempotencyKey,
      confirmation: { const: "APPLY_REVIEWED_MIGRATIONS" },
    }, ["project_ref", "migration_set", "idempotency_key", "confirmation"]),
  }),
  descriptor({
    name: "nacl_backup_create",
    title: "Create a NaCl project backup",
    description: "Create an idempotent per-project backup through the existing graph backup boundary without exposing storage or infrastructure identifiers.",
    scope: "nacl.server.backup",
    inputSchema: strictObject({
      project_ref: projectRef,
      idempotency_key: idempotencyKey,
      confirmation: { const: "CREATE_PROJECT_BACKUP" },
    }, ["project_ref", "idempotency_key", "confirmation"]),
  }),
  descriptor({
    name: "nacl_restore_request",
    title: "Request an isolated NaCl restore",
    description: "Request a confirmed restore into an isolated target; it never silently overwrites or cuts over an active project.",
    scope: "nacl.server.restore",
    destructiveHint: true,
    inputSchema: strictObject({
      project_ref: projectRef,
      backup_ref: { type: "string", minLength: 20, maxLength: 80, pattern: "^backup_[A-Za-z0-9_-]{13,73}$" },
      idempotency_key: idempotencyKey,
      confirmation: { const: "RESTORE_TO_ISOLATED_TARGET" },
    }, ["project_ref", "backup_ref", "idempotency_key", "confirmation"]),
  }),
]);

export const TOOL_BY_NAME = new Map(PUBLIC_TOOLS.map((tool) => [tool.name, tool]));

export function requiredScope(toolName) {
  return TOOL_BY_NAME.get(toolName)?.securitySchemes[0]?.scopes[0] ?? null;
}

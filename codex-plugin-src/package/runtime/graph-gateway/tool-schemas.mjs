const PROJECT_ID = {
  type: "string",
  minLength: 3,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$",
  description: "Stable NaCl project identifier; never inferred from the last-used project.",
};

const PROJECT_ROOT = {
  type: "string",
  minLength: 1,
  maxLength: 4096,
  description: "Explicit repository root; canonicalized and checked against config.yaml and the registry.",
};

const RESOURCE_TYPE = {
  enum: ["Task", "UseCase", "Module", "FeatureRequest", "Board", "SchemaMigration", "ReleaseEnvironment"],
};

const IDENTITY_PROPERTIES = {
  principal_id: { type: "string", minLength: 3, maxLength: 128 },
  client_id: { type: "string", minLength: 3, maxLength: 128 },
  session_id: { type: "string", minLength: 3, maxLength: 128 },
  worker_id: { type: "string", pattern: "^worker-[0-9a-f]{48}$" },
  worktree_id: { type: "string", minLength: 3, maxLength: 128 },
  branch: { type: "string", minLength: 1, maxLength: 255 },
  base_sha: { type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
  pull_request: objectSchema(
    {
      number: { type: "integer", minimum: 1, maximum: 2147483647 },
      url: { type: "string", minLength: 1, maxLength: 2048 },
      head_sha: { type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
    },
    ["number", "url", "head_sha"],
  ),
};

const IDENTITY_REQUIRED = [
  "principal_id",
  "client_id",
  "session_id",
  "worker_id",
  "worktree_id",
  "branch",
  "base_sha",
];

const TARGET_IDENTITY_PROPERTIES = Object.fromEntries(
  Object.entries(IDENTITY_PROPERTIES).map(([name, schema]) => [`target_${name}`, schema]),
);

const TARGET_IDENTITY_REQUIRED = IDENTITY_REQUIRED.map((name) => `target_${name}`);

const IDEMPOTENCY_KEY = {
  type: "string",
  minLength: 8,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
};

const RESOURCE_ID = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
};

const TTL_SECONDS = { type: "integer", minimum: 30, maximum: 86400 };

const APPROVAL = {
  type: "string",
  description: "Exact server policy confirmation for the selected resource capability.",
};

function objectSchema(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function outputSchema() {
  return {
    type: "object",
    required: ["contract", "status", "code", "capability", "operation"],
    properties: {
      contract: { const: "nacl-graph-gateway-v1" },
      status: { enum: ["VERIFIED", "FAILED", "PARTIALLY_VERIFIED", "BLOCKED", "NOT_RUN", "UNVERIFIED"] },
      code: { type: "string" },
      capability: { enum: ["read", "write", "schema-admin", "unknown"] },
      operation: { type: "string" },
      projectId: { type: "string" },
      auditId: { type: "string" },
      message: { type: "string" },
      retryable: { type: "boolean" },
    },
    additionalProperties: true,
  };
}

export const GRAPH_TOOL_DEFINITIONS = [
  {
    name: "nacl_graph_health",
    title: "NaCl graph health",
    description: "Read-only project graph preflight including lifecycle, schema ledger, and a real parameterized read canary.",
    capability: "read",
    operation: "health",
    inputSchema: objectSchema(
      { project_id: PROJECT_ID, project_root: PROJECT_ROOT, ...IDENTITY_PROPERTIES },
      ["project_id", "project_root", ...IDENTITY_REQUIRED],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_schema_status",
    title: "NaCl graph schema status",
    description: "Read the ordered NaCl schema migration ledger and verify every packaged checksum.",
    capability: "read",
    operation: "schema-status",
    inputSchema: objectSchema(
      { project_id: PROJECT_ID, project_root: PROJECT_ROOT, ...IDENTITY_PROPERTIES },
      ["project_id", "project_root", ...IDENTITY_REQUIRED],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_read",
    title: "NaCl graph named read",
    description: "Run one allow-listed, parameterized read query; arbitrary Cypher is not accepted.",
    capability: "read",
    operation: "read",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        query: { enum: ["canary", "summary"] },
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "query"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_apply_migrations",
    title: "Apply NaCl graph migrations",
    description: "Apply ordered migrations only for a trusted project administrator holding the current exclusive MIG-GATEWAY lease/fence.",
    capability: "schema-admin",
    operation: "apply-migrations",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        fencing_token: { type: "integer", minimum: 1 },
        idempotency_key: IDEMPOTENCY_KEY,
        approval: { const: "CONFIRM_SCHEMA_ADMIN" },
        confirmation: { const: "APPLY_MIGRATIONS" },
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "fencing_token", "idempotency_key", "approval", "confirmation"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_write_canary",
    title: "NaCl graph write and read-back canary",
    description: "Perform an explicitly confirmed idempotent canary mutation and verify it with a separate read-back.",
    capability: "write",
    operation: "write-canary",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        idempotency_key: {
          type: "string",
          minLength: 8,
          maxLength: 128,
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        },
        approval: { const: "APPROVE_PROJECT_WRITE" },
        confirmation: { const: "WRITE_CANARY" },
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "idempotency_key", "approval", "confirmation"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_derive_worker_identity",
    title: "Derive a NaCl worker identity",
    description: "Derive the strict worker_id from principal_id, client_id, and session_id without conflating worktrees or sessions.",
    capability: "read",
    operation: "concurrency-identity",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        principal_id: IDENTITY_PROPERTIES.principal_id,
        client_id: IDENTITY_PROPERTIES.client_id,
        session_id: IDENTITY_PROPERTIES.session_id,
      },
      ["project_id", "project_root", "principal_id", "client_id", "session_id"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_claim_resource",
    title: "Claim a protected NaCl resource",
    description: "Acquire or renew one generic project resource lease with bounded TTL and a monotonic fencing token.",
    capability: "write",
    operation: "lease-acquire",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        resource_type: RESOURCE_TYPE,
        resource_id: RESOURCE_ID,
        ttl_seconds: TTL_SECONDS,
        idempotency_key: IDEMPOTENCY_KEY,
        approval: APPROVAL,
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "resource_type", "resource_id", "ttl_seconds", "idempotency_key", "approval"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_heartbeat_resource",
    title: "Heartbeat a protected NaCl resource",
    description: "Extend an unexpired lease only for its current worker and fencing token.",
    capability: "write",
    operation: "lease-heartbeat",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        resource_type: RESOURCE_TYPE,
        resource_id: RESOURCE_ID,
        fencing_token: { type: "integer", minimum: 1 },
        ttl_seconds: TTL_SECONDS,
        idempotency_key: IDEMPOTENCY_KEY,
        approval: APPROVAL,
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "resource_type", "resource_id", "fencing_token", "ttl_seconds", "idempotency_key", "approval"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_release_resource",
    title: "Release a protected NaCl resource",
    description: "Release an unexpired lease only for its current worker and fencing token.",
    capability: "write",
    operation: "lease-release",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        resource_type: RESOURCE_TYPE,
        resource_id: RESOURCE_ID,
        fencing_token: { type: "integer", minimum: 1 },
        idempotency_key: IDEMPOTENCY_KEY,
        approval: APPROVAL,
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "resource_type", "resource_id", "fencing_token", "idempotency_key", "approval"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_handoff_resource",
    title: "Handoff a protected NaCl resource",
    description: "Explicitly transfer an unexpired lease to a different derived worker and increment its fencing token.",
    capability: "write",
    operation: "lease-handoff",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        ...TARGET_IDENTITY_PROPERTIES,
        resource_type: RESOURCE_TYPE,
        resource_id: RESOURCE_ID,
        fencing_token: { type: "integer", minimum: 1 },
        ttl_seconds: TTL_SECONDS,
        idempotency_key: IDEMPOTENCY_KEY,
        approval: APPROVAL,
        confirmation: { type: "string" },
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, ...TARGET_IDENTITY_REQUIRED, "resource_type", "resource_id", "fencing_token", "ttl_seconds", "idempotency_key", "approval", "confirmation"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "nacl_graph_mutate_resource",
    title: "Mutate a protected NaCl resource",
    description: "Apply an allow-listed resource patch with current fencing token, atomic revision CAS, exact idempotency, and provenance.",
    capability: "write",
    operation: "resource-mutate",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        resource_type: RESOURCE_TYPE,
        resource_id: RESOURCE_ID,
        fencing_token: { type: "integer", minimum: 1 },
        expected_revision: { type: "integer", minimum: 0 },
        idempotency_key: IDEMPOTENCY_KEY,
        approval: APPROVAL,
        evidence_confirmation: { const: "CONFIRM_NO_TEST_EVIDENCE" },
        changes: { type: "object", minProperties: 1, additionalProperties: true },
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "resource_type", "resource_id", "fencing_token", "expected_revision", "idempotency_key", "approval", "changes"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_allocate_id",
    title: "Allocate and create a protected NaCl resource",
    description: "Atomically advance a project/entity sequence, create the typed resource, and acquire its initial lease.",
    capability: "write",
    operation: "allocate-and-create",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        entity_kind: RESOURCE_TYPE,
        ttl_seconds: TTL_SECONDS,
        idempotency_key: IDEMPOTENCY_KEY,
        approval: APPROVAL,
        evidence_confirmation: { const: "CONFIRM_NO_TEST_EVIDENCE" },
        changes: { type: "object", minProperties: 1, additionalProperties: true },
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "entity_kind", "ttl_seconds", "idempotency_key", "approval", "changes"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "nacl_graph_bootstrap_admin",
    title: "Bootstrap the initial NaCl project administrator",
    description: "One-time, graph-serialized creation of the first project_admin membership; permanently disabled after any membership exists.",
    capability: "write",
    operation: "membership-bootstrap",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        idempotency_key: IDEMPOTENCY_KEY,
        confirmation: { const: "CONFIRM_INITIAL_PROJECT_ADMIN" },
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "idempotency_key", "confirmation"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: "nacl_graph_set_membership",
    title: "Administer a NaCl project membership",
    description: "Create, grant, change, revoke, or reactivate one authoritative project membership with admin authorization, revision CAS, and exact idempotency.",
    capability: "write",
    operation: "membership-set",
    inputSchema: objectSchema(
      {
        project_id: PROJECT_ID,
        project_root: PROJECT_ROOT,
        ...IDENTITY_PROPERTIES,
        target_principal_id: IDENTITY_PROPERTIES.principal_id,
        target_role: { enum: ["viewer", "analyst", "architect", "developer", "release_manager", "project_admin"] },
        target_active: { type: "boolean" },
        expected_revision: { type: "integer", minimum: 0 },
        idempotency_key: IDEMPOTENCY_KEY,
        approval: { const: "CONFIRM_MEMBERSHIP_ADMIN" },
      },
      ["project_id", "project_root", ...IDENTITY_REQUIRED, "target_principal_id", "target_role", "target_active", "expected_revision", "idempotency_key", "approval"],
    ),
    outputSchema: outputSchema(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
];

export const GRAPH_TOOL_BY_NAME = new Map(
  GRAPH_TOOL_DEFINITIONS.map((definition) => [definition.name, definition]),
);

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonlAuditSink } from "../../../plugins/nacl/runtime/graph-gateway/audit.mjs";
import { ROLES } from "../../../plugins/nacl/runtime/graph-gateway/authorization.mjs";
import { loadMigrationCatalog, loadQueryCatalog } from "../../../plugins/nacl/runtime/graph-gateway/catalog.mjs";
import { gatewayError } from "../../../plugins/nacl/runtime/graph-gateway/errors.mjs";
import { createGraphGateway } from "../../../plugins/nacl/runtime/graph-gateway/gateway.mjs";
import { createLifecycleProjectResolver } from "../../../plugins/nacl/runtime/graph-gateway/lifecycle-adapter.mjs";
import { Neo4jHttpTransport } from "../../../plugins/nacl/runtime/graph-gateway/neo4j-http.mjs";
import { createProjectTransportPool } from "../../../plugins/nacl/runtime/graph-gateway/project-transport-pool.mjs";
import { resolveSecret } from "../../../plugins/nacl/runtime/graph-gateway/secret-provider.mjs";
import { GRAPH_TOOL_DEFINITIONS } from "../../../plugins/nacl/runtime/graph-gateway/tool-schemas.mjs";
import { deriveWorkerId } from "../../../plugins/nacl/runtime/graph-gateway/identity.mjs";

const projectRoot = path.join(os.tmpdir(), "nacl-project-a");
const identity = Object.freeze({
  principal_id: "principal-alice",
  client_id: "client-desktop-01",
  session_id: "session-thread-01",
  worktree_id: "worktree-feature-01",
  branch: "codex/wave5-feature",
  base_sha: "a".repeat(40),
});
const workerId = deriveWorkerId({
  principal_id: identity.principal_id,
  client_id: identity.client_id,
  session_id: identity.session_id,
});

function legacyArgs(overrides = {}) {
  return {
    project_id: "project-a",
    project_root: projectRoot,
    ...identity,
    worker_id: workerId,
    ...overrides,
  };
}

class FakeTransport {
  constructor() {
    this.ledger = new Map();
    this.canaries = new Map();
    this.constraints = new Set();
    this.statements = [];
    this.nodeCount = 0;
    this.authorizationState = "UNINITIALIZED";
    this.membershipCount = 0;
    this.failReadback = false;
    this.failConstraint = null;
    this.failAfterCanaryWrite = false;
    this.revokeAfterDdl = false;
    this.membership = {
      project_id: "project-a",
      principal_id: identity.principal_id,
      role: "project_admin",
      active: true,
      revision: 1,
    };
    this.schemaLease = {
      principal_id: identity.principal_id,
      worker_id: workerId,
      fencing_token: 1,
      expires_at_ms: Date.now() + 60_000,
    };
  }

  async execute(statements) {
    this.statements.push(...structuredClone(statements));
    const results = [];
    for (const entry of statements) {
      const { statement, parameters = {} } = entry;
      const authorized = statement.includes("MATCH (membership:ProjectMembership");
      if (authorized) {
        const membershipAccepted = this.membership?.active === true &&
          this.membership.project_id === parameters.project_id &&
          this.membership.principal_id === parameters.principal_id &&
          parameters.allowed_roles.includes(this.membership.role);
        const schemaLeaseRequired = statement.includes("MATCH (schema_lease:ResourceLease");
        const leaseAccepted = !schemaLeaseRequired || (
          this.schemaLease.principal_id === parameters.principal_id &&
          this.schemaLease.worker_id === parameters.worker_id &&
          this.schemaLease.fencing_token === parameters.fencing_token &&
          this.schemaLease.expires_at_ms > parameters.now_ms
        );
        if (!membershipAccepted || !leaseAccepted) {
          results.push([]);
          continue;
        }
        if (statement.includes("RETURN membership.revision AS membershipRevision")) {
          results.push([{
            membershipRevision: this.membership.revision,
            fencingToken: this.schemaLease.fencing_token,
            expiresAt: new Date(this.schemaLease.expires_at_ms).toISOString(),
          }]);
          continue;
        }
      }
      if (statement.includes("OPTIONAL MATCH (migration:SchemaMigration")) {
        const key = `${parameters.component}:${parameters.version}`;
        results.push([{ checksum: this.ledger.get(key) ?? null }]);
      } else if (statement.includes("MERGE (migration:SchemaMigration")) {
        const key = `${parameters.component}:${parameters.version}`;
        if (!this.ledger.has(key)) this.ledger.set(key, parameters.checksum);
        results.push([{ checksum: this.ledger.get(key) }]);
      } else if (statement.startsWith("CREATE CONSTRAINT")) {
        const constraint = statement.match(/^CREATE CONSTRAINT ([A-Za-z0-9_]+)/)[1];
        if (constraint === this.failConstraint) {
          throw gatewayError("QUERY_FAILED", "Injected constraint failure.");
        }
        this.constraints.add(constraint);
        if (this.revokeAfterDdl) {
          this.membership.active = false;
          this.revokeAfterDdl = false;
        }
        results.push([]);
      } else if (statement.includes("SHOW CONSTRAINTS")) {
        results.push([{ names: parameters.names.filter((name) => this.constraints.has(name)) }]);
      } else if (statement.includes("RETURN $expected AS observed")) {
        results.push([{ observed: parameters.expected }]);
      } else if (statement.includes("MATCH (node) RETURN count(node) AS nodeCount")) {
        results.push([{ nodeCount: this.nodeCount }]);
      } else if (statement.startsWith("OPTIONAL MATCH (guard:ProjectAuthorization")) {
        results.push([{
          state: this.authorizationState,
          membershipCount: this.membershipCount,
        }]);
      } else if (statement.includes("MERGE (canary:NaclGatewayCanary")) {
        const current = this.canaries.get(parameters.project_id);
        const replay = current?.idempotencyKey === parameters.idempotency_key;
        const next = replay
          ? current
          : { revision: (current?.revision ?? 0) + 1, idempotencyKey: parameters.idempotency_key };
        this.canaries.set(parameters.project_id, next);
        if (this.failAfterCanaryWrite) {
          throw gatewayError("GRAPH_TIMEOUT", "Injected post-write timeout.", { status: "BLOCKED" });
        }
        results.push([{
          projectId: parameters.project_id,
          revision: next.revision,
          idempotencyKey: next.idempotencyKey,
          replay,
          membershipRevision: this.membership.revision,
        }]);
      } else if (statement.includes("MATCH (canary:NaclGatewayCanary")) {
        const current = this.canaries.get(parameters.project_id);
        results.push(this.failReadback || !current ? [] : [{
          projectId: parameters.project_id,
          revision: current.revision,
          idempotencyKey: current.idempotencyKey,
        }]);
      } else {
        throw new Error(`unexpected statement: ${statement}`);
      }
    }
    return results;
  }
}

function verifiedProfile(root, overrides = {}) {
  return {
    projectId: "project-a",
    projectRoot,
    endpoint: "http://127.0.0.1:17474",
    database: "neo4j",
    username: "neo4j",
    secretReference: "keychain:com.itsalt.nacl.local-graph/project-a",
    auditPath: path.join(root, "audit.jsonl"),
    lifecycleStatus: "VERIFIED",
    lifecycleCode: "HEALTHY",
    capabilities: ["read", "write", "schema-admin"],
    ...overrides,
  };
}

async function fixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-gateway-test-"));
  const transport = options.transport ?? new FakeTransport();
  const audits = [];
  const migrations = options.migrations ?? await loadMigrationCatalog();
  const queries = await loadQueryCatalog();
  const gateway = createGraphGateway({
    migrations,
    queries,
    resolveProject: options.resolveProject ?? (async () => verifiedProfile(root, options.profile)),
    resolveSecret: options.resolveSecret ?? (async () => "opaque-test-secret"),
    createTransport: options.createTransport ?? (() => transport),
    createAuditSink: options.createAuditSink ?? (() => ({
      async append(record) {
        audits.push(structuredClone(record));
        return record.auditId;
      },
    })),
    resolvePrincipal: options.resolvePrincipal ?? (async () => ({
      principal_id: identity.principal_id,
      assurance: "trusted-test-harness",
    })),
  });
  return { root, transport, audits, migrations, gateway };
}

async function migrate(instance) {
  const result = await instance.gateway.callTool("nacl_graph_apply_migrations", legacyArgs({
    fencing_token: 1,
    idempotency_key: "migration-0001",
    approval: "CONFIRM_SCHEMA_ADMIN",
    confirmation: "APPLY_MIGRATIONS",
  }));
  assert.equal(result.status, "VERIFIED", JSON.stringify(result));
  return result;
}

test("tool schemas split read, write, and schema-admin without raw Cypher", () => {
  assert.deepEqual(
    GRAPH_TOOL_DEFINITIONS.map((tool) => [tool.name, tool.capability]),
    [
      ["nacl_graph_health", "read"],
      ["nacl_graph_schema_status", "read"],
      ["nacl_graph_read", "read"],
      ["nacl_graph_apply_migrations", "schema-admin"],
      ["nacl_graph_write_canary", "write"],
      ["nacl_graph_derive_worker_identity", "read"],
      ["nacl_graph_claim_resource", "write"],
      ["nacl_graph_heartbeat_resource", "write"],
      ["nacl_graph_release_resource", "write"],
      ["nacl_graph_handoff_resource", "write"],
      ["nacl_graph_mutate_resource", "write"],
      ["nacl_graph_allocate_id", "write"],
      ["nacl_graph_bootstrap_admin", "write"],
      ["nacl_graph_set_membership", "write"],
    ],
  );
  for (const tool of GRAPH_TOOL_DEFINITIONS) {
    assert.equal(Object.hasOwn(tool.inputSchema.properties, "cypher"), false);
    assert.equal(Object.hasOwn(tool.inputSchema.properties, "secret"), false);
    assert.equal(Object.hasOwn(tool.inputSchema.properties, "endpoint"), false);
    assert.equal(Object.hasOwn(tool.inputSchema.properties, "role"), false);
    assert.equal(Object.hasOwn(tool.inputSchema.properties, "membership"), false);
    assert.equal(tool.inputSchema.properties.project_id.pattern.includes(":"), false);
  }
  for (const name of [
    "nacl_graph_health",
    "nacl_graph_schema_status",
    "nacl_graph_read",
    "nacl_graph_apply_migrations",
    "nacl_graph_write_canary",
  ]) {
    const required = GRAPH_TOOL_DEFINITIONS.find((tool) => tool.name === name).inputSchema.required;
    for (const field of [
      "principal_id",
      "client_id",
      "session_id",
      "worker_id",
      "worktree_id",
      "branch",
      "base_sha",
    ]) {
      assert.ok(required.includes(field), `${name} must require ${field}`);
    }
  }
});

test("schema lifecycle handoff matrix permits only exact missing bootstrap and stale migration recovery", async () => {
  const migrations = await loadMigrationCatalog();
  const queries = await loadQueryCatalog();
  const targetCore = {
    principal_id: "principal-bob",
    client_id: "client-desktop-02",
    session_id: "session-thread-02",
  };
  const target = {
    ...targetCore,
    worker_id: deriveWorkerId(targetCore),
    worktree_id: "worktree-feature-02",
    branch: "codex/wave5-target",
    base_sha: "b".repeat(40),
  };
  const schemaResource = {
    resource_type: "SchemaMigration",
    resource_id: "MIG-GATEWAY",
    approval: "CONFIRM_SCHEMA_ADMIN",
  };
  const operations = [
    ["nacl_graph_health", legacyArgs()],
    ["nacl_graph_schema_status", legacyArgs()],
    ["nacl_graph_read", legacyArgs({ query: "summary" })],
    ["nacl_graph_apply_migrations", legacyArgs({
      fencing_token: 1,
      idempotency_key: "matrix-migrate-01",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    })],
    ["nacl_graph_write_canary", legacyArgs({
      idempotency_key: "matrix-canary-01",
      approval: "APPROVE_PROJECT_WRITE",
      confirmation: "WRITE_CANARY",
    })],
    ["nacl_graph_derive_worker_identity", {
      project_id: "project-a",
      project_root: projectRoot,
      principal_id: identity.principal_id,
      client_id: identity.client_id,
      session_id: identity.session_id,
    }],
    ["nacl_graph_claim_resource", legacyArgs({
      ...schemaResource,
      ttl_seconds: 60,
      idempotency_key: "matrix-acquire-01",
    })],
    ["nacl_graph_heartbeat_resource", legacyArgs({
      ...schemaResource,
      fencing_token: 1,
      ttl_seconds: 60,
      idempotency_key: "matrix-heartbeat-01",
    })],
    ["nacl_graph_release_resource", legacyArgs({
      ...schemaResource,
      fencing_token: 1,
      idempotency_key: "matrix-release-01",
    })],
    ["nacl_graph_handoff_resource", legacyArgs({
      ...schemaResource,
      fencing_token: 1,
      ttl_seconds: 60,
      ...Object.fromEntries(Object.entries(target).map(([key, value]) => [`target_${key}`, value])),
      idempotency_key: "matrix-handoff-01",
      confirmation: `HANDOFF_RESOURCE:SchemaMigration:MIG-GATEWAY:${target.worker_id}`,
    })],
    ["nacl_graph_mutate_resource", legacyArgs({
      ...schemaResource,
      fencing_token: 1,
      expected_revision: 0,
      idempotency_key: "matrix-mutate-01",
      changes: { description: "not a lifecycle recovery operation" },
    })],
    ["nacl_graph_allocate_id", legacyArgs({
      entity_kind: "SchemaMigration",
      ttl_seconds: 60,
      idempotency_key: "matrix-allocate-01",
      approval: "CONFIRM_SCHEMA_ADMIN",
      changes: { description: "not a lifecycle recovery operation" },
    })],
    ["nacl_graph_bootstrap_admin", legacyArgs({
      idempotency_key: "matrix-bootstrap-01",
      confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
    })],
    ["nacl_graph_set_membership", legacyArgs({
      target_principal_id: "principal-bob",
      target_role: "developer",
      target_active: true,
      expected_revision: 0,
      idempotency_key: "matrix-membership-01",
      approval: "CONFIRM_MEMBERSHIP_ADMIN",
    })],
  ];
  const staleRecoveryTools = new Set([
    "nacl_graph_apply_migrations",
    "nacl_graph_claim_resource",
    "nacl_graph_heartbeat_resource",
    "nacl_graph_release_resource",
    "nacl_graph_handoff_resource",
  ]);

  for (const lifecycleCode of ["SCHEMA_MISSING", "SCHEMA_STALE"]) {
    for (const [name, input] of operations) {
      let secretCalls = 0;
      let graphCalls = 0;
      const root = await mkdtemp(path.join(os.tmpdir(), "nacl-lifecycle-matrix-"));
      const gateway = createGraphGateway({
        migrations,
        queries,
        resolveProject: async () => verifiedProfile(root, {
          lifecycleStatus: "BLOCKED",
          lifecycleCode,
        }),
        resolveSecret: async () => {
          secretCalls += 1;
          return "opaque-test-secret";
        },
        createTransport: () => ({
          async execute() {
            graphCalls += 1;
            return [[]];
          },
        }),
        createAuditSink: () => ({ async append() {} }),
        resolvePrincipal: async () => ({
          principal_id: identity.principal_id,
          assurance: "trusted-test-harness",
        }),
      });
      try {
        const result = await gateway.callTool(name, input);
        const allowed = lifecycleCode === "SCHEMA_MISSING"
          ? name === "nacl_graph_bootstrap_admin"
          : staleRecoveryTools.has(name);
        if (allowed) {
          assert.notEqual(result.code, lifecycleCode, `${lifecycleCode} / ${name}: ${JSON.stringify(result)}`);
          assert.equal(secretCalls, 1, `${lifecycleCode} / ${name}`);
          assert.ok(graphCalls > 0, `${lifecycleCode} / ${name}`);
        } else {
          assert.equal(result.code, lifecycleCode, `${lifecycleCode} / ${name}: ${JSON.stringify(result)}`);
          assert.equal(secretCalls, 0, `${lifecycleCode} / ${name}`);
          assert.equal(graphCalls, 0, `${lifecycleCode} / ${name}`);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  }

  for (const [name, input, expectedCode] of [
    ["nacl_graph_claim_resource", legacyArgs({
      ...schemaResource,
      resource_type: "NotAResource",
      ttl_seconds: 60,
      idempotency_key: "invalid-type-01",
    }), "RESOURCE_TYPE_INVALID"],
    ["nacl_graph_claim_resource", legacyArgs({
      ...schemaResource,
      resource_id: "bad resource id",
      ttl_seconds: 60,
      idempotency_key: "invalid-id-0001",
    }), "RESOURCE_ID_INVALID"],
    ["nacl_graph_claim_resource", legacyArgs({
      ...schemaResource,
      resource_id: "MIG-OTHER",
      ttl_seconds: 60,
      idempotency_key: "wrong-migration-01",
    }), "SCHEMA_STALE"],
    ["nacl_graph_heartbeat_resource", legacyArgs({
      ...schemaResource,
      fencing_token: undefined,
      ttl_seconds: 60,
      idempotency_key: "missing-fence-01",
    }), "INVALID_ARGUMENT"],
    ["nacl_graph_apply_migrations", legacyArgs({
      idempotency_key: "missing-fence-02",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    }), "INVALID_ARGUMENT"],
  ]) {
    let graphCalls = 0;
    const instance = await fixture({
      profile: { lifecycleStatus: "BLOCKED", lifecycleCode: "SCHEMA_STALE" },
      createTransport: () => ({
        async execute() {
          graphCalls += 1;
          return [[]];
        },
      }),
    });
    try {
      const result = await instance.gateway.callTool(name, input);
      assert.equal(result.code, expectedCode, `${name}: ${JSON.stringify(result)}`);
      assert.equal(graphCalls, 0, name);
    } finally {
      await rm(instance.root, { recursive: true, force: true });
    }
  }
});

test("legacy graph tools enforce the complete role matrix and fail closed on identity or membership drift", async () => {
  const instance = await fixture();
  try {
    await migrate(instance);
    for (const role of ROLES) {
      instance.transport.membership.role = role;
      instance.transport.membership.active = true;
      const calls = [
        ["nacl_graph_health", legacyArgs(), true],
        ["nacl_graph_schema_status", legacyArgs(), true],
        ["nacl_graph_read", legacyArgs({ query: "summary" }), true],
        ["nacl_graph_write_canary", legacyArgs({
          idempotency_key: `role-canary-${role}`,
          approval: "APPROVE_PROJECT_WRITE",
          confirmation: "WRITE_CANARY",
        }), role !== "viewer"],
        ["nacl_graph_apply_migrations", legacyArgs({
          fencing_token: 1,
          idempotency_key: `role-migrate-${role}`,
          approval: "CONFIRM_SCHEMA_ADMIN",
          confirmation: "APPLY_MIGRATIONS",
        }), role === "project_admin"],
      ];
      for (const [name, input, accepted] of calls) {
        const result = await instance.gateway.callTool(name, input);
        assert.equal(result.status === "VERIFIED", accepted, `${role} / ${name}: ${JSON.stringify(result)}`);
        if (!accepted) assert.equal(result.code, "ACCESS_OR_RESOURCE_NOT_FOUND", `${role} / ${name}`);
      }
    }

    const graphCalls = instance.transport.statements.length;
    for (const [name, args] of [
      ["nacl_graph_health", {}],
      ["nacl_graph_schema_status", {}],
      ["nacl_graph_read", { query: "summary" }],
      ["nacl_graph_write_canary", {
        idempotency_key: "missing-identity-canary",
        approval: "APPROVE_PROJECT_WRITE",
        confirmation: "WRITE_CANARY",
      }],
      ["nacl_graph_apply_migrations", {
        fencing_token: 1,
        idempotency_key: "missing-identity-migration",
        approval: "CONFIRM_SCHEMA_ADMIN",
        confirmation: "APPLY_MIGRATIONS",
      }],
    ]) {
      const missingIdentity = await instance.gateway.callTool(name, {
        project_id: "project-a",
        project_root: projectRoot,
        ...args,
      });
      assert.equal(missingIdentity.code, "INVALID_ARGUMENT", name);
      assert.notEqual(missingIdentity.status, "VERIFIED", name);
    }
    assert.equal(instance.transport.statements.length, graphCalls);

    instance.transport.membership.active = false;
    const revoked = await instance.gateway.callTool("nacl_graph_health", legacyArgs());
    assert.equal(revoked.status, "BLOCKED");
    assert.equal(revoked.code, "ACCESS_OR_RESOURCE_NOT_FOUND");

    instance.transport.membership.active = true;
    instance.transport.membership.project_id = "project-b";
    const crossProject = await instance.gateway.callTool("nacl_graph_read", legacyArgs({ query: "summary" }));
    assert.equal(crossProject.status, "BLOCKED");
    assert.equal(crossProject.code, "ACCESS_OR_RESOURCE_NOT_FOUND");

    instance.transport.membership = null;
    const missingMembership = await instance.gateway.callTool("nacl_graph_schema_status", legacyArgs());
    assert.equal(missingMembership.status, "BLOCKED");
    assert.equal(missingMembership.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }

  const spoofed = await fixture({
    resolvePrincipal: async () => ({
      principal_id: "principal-mallory",
      assurance: "trusted-test-harness",
    }),
  });
  try {
    for (const [name, input] of [
      ["nacl_graph_health", legacyArgs()],
      ["nacl_graph_schema_status", legacyArgs()],
      ["nacl_graph_read", legacyArgs({ query: "summary" })],
      ["nacl_graph_write_canary", legacyArgs({
        idempotency_key: "spoofed-write-canary",
        approval: "APPROVE_PROJECT_WRITE",
        confirmation: "WRITE_CANARY",
      })],
      ["nacl_graph_apply_migrations", legacyArgs({
        fencing_token: 1,
        idempotency_key: "spoofed-migration",
        approval: "CONFIRM_SCHEMA_ADMIN",
        confirmation: "APPLY_MIGRATIONS",
      })],
    ]) {
      const result = await spoofed.gateway.callTool(name, input);
      assert.equal(result.status, "BLOCKED", name);
      assert.equal(result.code, "PRINCIPAL_MISMATCH", name);
    }
    assert.equal(spoofed.transport.statements.length, 0);
  } finally {
    await rm(spoofed.root, { recursive: true, force: true });
  }
});

test("project_id uses the same strict grammar in MCP schema and gateway runtime", async () => {
  const instance = await fixture();
  try {
    const result = await instance.gateway.callTool("nacl_graph_health", legacyArgs({
      project_id: "project:escape",
    }));
    assert.equal(result.status, "FAILED");
    assert.equal(result.code, "INVALID_PROJECT_ID");
    assert.equal(instance.transport.statements.length, 0);
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("graph operations reject relative project roots before lifecycle resolution", async () => {
  let resolved = false;
  const instance = await fixture({ resolveProject: async () => { resolved = true; } });
  try {
    const result = await instance.gateway.callTool("nacl_graph_health", legacyArgs({
      project_root: ".",
    }));
    assert.equal(result.status, "FAILED");
    assert.equal(result.code, "INVALID_PROJECT_ROOT");
    assert.equal(resolved, false);
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("lifecycle adapter consumes only the public resolve/doctor contract", async () => {
  const calls = [];
  const lifecycle = {
    async resolve(input) {
      calls.push(["resolve", input]);
      return {
        contract: "nacl-local-graph-lifecycle-v1",
        operation: "resolve",
        status: "VERIFIED",
        code: "INSTANCE_RESOLVED",
        projectId: "project-a",
        projectRoot,
        auditPath: path.join(projectRoot, "audit.jsonl"),
        instance: {
          contract: "nacl-local-graph-instance-v1",
          projectId: "project-a",
          projectRoot,
          endpoint: { httpUrl: "http://127.0.0.1:17474" },
          secretReference: "keychain:com.itsalt.nacl.local-graph/project-a",
          gatewaySchema: { version: 1, checksum: "a".repeat(64) },
        },
      };
    },
    async doctor(input) {
      calls.push(["doctor", input]);
      return {
        contract: "nacl-local-graph-lifecycle-v1",
        operation: "doctor",
        status: "BLOCKED",
        code: "SCHEMA_MISSING",
        projectId: "project-a",
      };
    },
  };
  const resolver = createLifecycleProjectResolver({ getLifecycle: async () => lifecycle });
  const profile = await resolver({ projectId: "project-a", projectRoot });
  assert.equal(profile.endpoint, "http://127.0.0.1:17474");
  assert.equal(profile.auditPath, path.join(projectRoot, "audit.jsonl"));
  assert.equal(profile.lifecycleCode, "SCHEMA_MISSING");
  assert.deepEqual(calls, [
    ["resolve", { projectId: "project-a", projectRoot }],
    ["doctor", { projectId: "project-a", projectRoot }],
  ]);
});

test("migration apply is checksum-ledgered, read back, and idempotent", async () => {
  const instance = await fixture();
  try {
    const first = await migrate(instance);
    assert.deepEqual(first.schema.applied, [1, 2, 3]);
    assert.deepEqual(first.schema.alreadyApplied, []);
    const constraintCount = instance.transport.constraints.size;
    const second = await migrate(instance);
    assert.deepEqual(second.schema.applied, []);
    assert.deepEqual(second.schema.alreadyApplied, [1, 2, 3]);
    assert.equal(instance.transport.constraints.size, constraintCount);
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("health includes current schema and a real parameterized read canary", async () => {
  const instance = await fixture();
  try {
    await migrate(instance);
    const result = await instance.gateway.callTool("nacl_graph_health", legacyArgs());
    assert.equal(result.status, "VERIFIED");
    assert.equal(result.code, "GRAPH_HEALTHY");
    assert.equal(result.readCanary, "VERIFIED");
    const canary = instance.transport.statements.find((entry) => entry.statement.includes("$expected"));
    assert.equal(canary.statement.includes("nacl-graph-read-canary-v1"), false);
    assert.equal(canary.parameters.expected, "nacl-graph-read-canary-v1");
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("write canary requires confirmation, is idempotent, and uses separate read-back", async () => {
  const instance = await fixture();
  try {
    await migrate(instance);
    const blocked = await instance.gateway.callTool("nacl_graph_write_canary", legacyArgs({
      idempotency_key: "canary-0001",
      approval: "APPROVE_PROJECT_WRITE",
    }));
    assert.equal(blocked.status, "BLOCKED");
    assert.equal(blocked.code, "CONFIRMATION_REQUIRED");

    const args = legacyArgs({
      idempotency_key: "canary-0001",
      approval: "APPROVE_PROJECT_WRITE",
      confirmation: "WRITE_CANARY",
    });
    const first = await instance.gateway.callTool("nacl_graph_write_canary", args);
    const second = await instance.gateway.callTool("nacl_graph_write_canary", args);
    assert.equal(first.status, "VERIFIED");
    assert.equal(first.canary.revision, 1);
    assert.equal(first.canary.replay, false);
    assert.equal(second.canary.revision, 1);
    assert.equal(second.canary.replay, true);
    assert.equal(first.canary.idempotencyKeyHash.length, 64);
    assert.equal(JSON.stringify(first).includes("canary-0001"), false);
    const mutation = instance.transport.statements.find((entry) => entry.statement.includes("MERGE (canary:NaclGatewayCanary"));
    assert.equal(mutation.statement.includes("canary-0001"), false);
    assert.equal(mutation.parameters.idempotency_key, "canary-0001");

    instance.transport.membership.active = false;
    const closedCanary = await instance.gateway.callTool("nacl_graph_write_canary", legacyArgs({
      ...args,
      idempotency_key: "canary-closed-0002",
    }));
    assert.equal(closedCanary.status, "BLOCKED");
    assert.equal(closedCanary.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
    const closedMigrations = await instance.gateway.callTool("nacl_graph_apply_migrations", legacyArgs({
      fencing_token: 1,
      idempotency_key: "migration-closed-0002",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    }));
    assert.equal(closedMigrations.status, "BLOCKED");
    assert.equal(closedMigrations.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("missing, stale, and checksum-mismatched schemas never report VERIFIED", async () => {
  const missing = await fixture({ profile: { lifecycleStatus: "BLOCKED", lifecycleCode: "SCHEMA_MISSING" } });
  try {
    const result = await missing.gateway.callTool("nacl_graph_health", legacyArgs());
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "SCHEMA_MISSING");
  } finally {
    await rm(missing.root, { recursive: true, force: true });
  }

  const migrations = await loadMigrationCatalog();
  const extended = [...migrations, { ...migrations[0], version: 2, checksum: "b".repeat(64) }];
  const stale = await fixture({ migrations: extended, profile: { lifecycleStatus: "BLOCKED", lifecycleCode: "SCHEMA_STALE" } });
  try {
    stale.transport.ledger.set("nacl-graph-gateway:1", migrations[0].checksum);
    const result = await stale.gateway.callTool("nacl_graph_schema_status", legacyArgs());
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "SCHEMA_STALE");
  } finally {
    await rm(stale.root, { recursive: true, force: true });
  }

  const mismatch = await fixture();
  try {
    mismatch.transport.ledger.set("nacl-graph-gateway:1", "0".repeat(64));
    const result = await mismatch.gateway.callTool("nacl_graph_schema_status", legacyArgs());
    assert.equal(result.status, "FAILED");
    assert.equal(result.code, "SCHEMA_CHECKSUM_MISMATCH");
  } finally {
    await rm(mismatch.root, { recursive: true, force: true });
  }
});

test("a current ledger with a deleted required constraint is BLOCKED", async () => {
  const instance = await fixture();
  try {
    await migrate(instance);
    instance.transport.constraints.delete("nacl_gateway_canary_project");
    const result = await instance.gateway.callTool("nacl_graph_schema_status", legacyArgs());
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "SCHEMA_OBJECTS_MISSING");
    assert.deepEqual(result.missingConstraints, ["nacl_gateway_canary_project"]);
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("partial migration and ambiguous post-write transport failures are never FAILED-as-final", async () => {
  const migration = await fixture();
  try {
    migration.transport.failConstraint = "nacl_gateway_canary_project";
    const result = await migration.gateway.callTool("nacl_graph_apply_migrations", legacyArgs({
      fencing_token: 1,
      idempotency_key: "migration-partial-0001",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    }));
    assert.equal(result.status, "PARTIALLY_VERIFIED");
    assert.equal(result.code, "MIGRATION_PARTIALLY_APPLIED");
  } finally {
    await rm(migration.root, { recursive: true, force: true });
  }

  const write = await fixture();
  try {
    await migrate(write);
    write.transport.failAfterCanaryWrite = true;
    const result = await write.gateway.callTool("nacl_graph_write_canary", legacyArgs({
      idempotency_key: "canary-unknown-1",
      approval: "APPROVE_PROJECT_WRITE",
      confirmation: "WRITE_CANARY",
    }));
    assert.equal(result.status, "PARTIALLY_VERIFIED");
    assert.equal(result.code, "MUTATION_OUTCOME_UNKNOWN");
  } finally {
    await rm(write.root, { recursive: true, force: true });
  }
});

test("stale-schema migration query and metadata-recording failures retain closed statuses", async () => {
  const queryFailure = await fixture({
    profile: { lifecycleStatus: "BLOCKED", lifecycleCode: "SCHEMA_STALE" },
  });
  try {
    queryFailure.transport.failConstraint = "nacl_schema_resource_identity";
    const result = await queryFailure.gateway.callTool("nacl_graph_apply_migrations", legacyArgs({
      fencing_token: 1,
      idempotency_key: "stale-query-failure-01",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    }));
    assert.equal(result.status, "FAILED");
    assert.equal(result.code, "QUERY_FAILED");
    assert.equal(queryFailure.transport.ledger.has("nacl-graph-gateway:3"), false);
  } finally {
    await rm(queryFailure.root, { recursive: true, force: true });
  }

  let recordedSchema;
  const metadataFailure = await fixture({
    profile: {
      lifecycleStatus: "BLOCKED",
      lifecycleCode: "SCHEMA_STALE",
      async recordSchema(schema) {
        recordedSchema = structuredClone(schema);
        throw gatewayError(
          "SCHEMA_METADATA_PARTIAL",
          "Injected external metadata recording failure.",
          { status: "PARTIALLY_VERIFIED", retryable: true },
        );
      },
    },
  });
  try {
    const result = await metadataFailure.gateway.callTool("nacl_graph_apply_migrations", legacyArgs({
      fencing_token: 1,
      idempotency_key: "stale-metadata-failure-01",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    }));
    assert.equal(result.status, "PARTIALLY_VERIFIED");
    assert.equal(result.code, "SCHEMA_METADATA_PARTIAL");
    assert.deepEqual(recordedSchema, {
      component: "nacl-graph-gateway",
      version: 3,
      checksum: "a0f6a5925eae88ae59e00baf056b1a29750ec40d97cfef7bdfd018f993bb40b2",
    });
    assert.equal(metadataFailure.transport.ledger.get("nacl-graph-gateway:3"), recordedSchema.checksum);
    assert.ok(metadataFailure.transport.constraints.has("nacl_schema_resource_identity"));
  } finally {
    await rm(metadataFailure.root, { recursive: true, force: true });
  }
});

test("migration authorization loss immediately after DDL closes as PARTIALLY_VERIFIED", async () => {
  const instance = await fixture();
  try {
    instance.transport.revokeAfterDdl = true;
    const result = await instance.gateway.callTool("nacl_graph_apply_migrations", legacyArgs({
      fencing_token: 1,
      idempotency_key: "migration-post-ddl-revoke",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    }));
    assert.equal(result.status, "PARTIALLY_VERIFIED");
    assert.equal(result.code, "MIGRATION_PARTIALLY_APPLIED");
    assert.equal(instance.transport.constraints.size, 1, "the DDL boundary is not transactionally reversible");
    assert.equal(instance.transport.ledger.size, 0, "no ledger boundary may be crossed after revocation");
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("lifecycle, registry, secret, auth, and readback failures are closed statuses", async () => {
  const cases = [
    ["DOCKER_STOPPED", gatewayError("DOCKER_STOPPED", "Docker is stopped.", { status: "BLOCKED" }), "BLOCKED"],
    ["PORT_COLLISION", gatewayError("PORT_COLLISION", "Port collision."), "FAILED"],
    ["REGISTRY_CORRUPT", null, "FAILED"],
  ];
  for (const [code, thrown, status] of cases) {
    const instance = await fixture({
      resolveProject: thrown ? async () => { throw thrown; } : async () => ({ bad: true }),
    });
    try {
      const result = await instance.gateway.callTool("nacl_graph_health", legacyArgs());
      assert.equal(result.code, code);
      assert.equal(result.status, status);
    } finally {
      await rm(instance.root, { recursive: true, force: true });
    }
  }

  const secret = await fixture({
    resolveSecret: async () => { throw gatewayError("SECRET_UNAVAILABLE", "Missing.", { status: "BLOCKED" }); },
  });
  try {
    const result = await secret.gateway.callTool("nacl_graph_health", legacyArgs());
    assert.equal(result.code, "SECRET_UNAVAILABLE");
    assert.equal(result.status, "BLOCKED");
  } finally {
    await rm(secret.root, { recursive: true, force: true });
  }

  const auth = await fixture({
    createTransport: () => ({ execute: async () => { throw gatewayError("AUTH_FAILED", "Rejected."); } }),
  });
  try {
    const result = await auth.gateway.callTool("nacl_graph_health", legacyArgs());
    assert.equal(result.code, "AUTH_FAILED");
    assert.equal(result.status, "FAILED");
  } finally {
    await rm(auth.root, { recursive: true, force: true });
  }

  const readback = await fixture();
  try {
    await migrate(readback);
    readback.transport.failReadback = true;
    const result = await readback.gateway.callTool("nacl_graph_write_canary", legacyArgs({
      idempotency_key: "canary-0002",
      approval: "APPROVE_PROJECT_WRITE",
      confirmation: "WRITE_CANARY",
    }));
    assert.equal(result.code, "WRITE_READBACK_FAILED");
    assert.equal(result.status, "PARTIALLY_VERIFIED");
  } finally {
    await rm(readback.root, { recursive: true, force: true });
  }
});

test("an unavailable audit sink blocks mutation before graph access", async () => {
  const instance = await fixture({
    createAuditSink: () => ({ append: async () => { throw gatewayError("AUDIT_UNAVAILABLE", "No audit.", { status: "BLOCKED" }); } }),
  });
  try {
    const result = await instance.gateway.callTool("nacl_graph_apply_migrations", legacyArgs({
      fencing_token: 1,
      idempotency_key: "migration-audit-0001",
      approval: "CONFIRM_SCHEMA_ADMIN",
      confirmation: "APPLY_MIGRATIONS",
    }));
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "AUDIT_UNAVAILABLE");
    assert.equal(instance.transport.statements.length, 0);
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("non-loopback profiles fail before secret access", async () => {
  let secretRead = false;
  const instance = await fixture({
    profile: { endpoint: "http://0.0.0.0:17474" },
    resolveSecret: async () => {
      secretRead = true;
      return "opaque-test-secret";
    },
  });
  try {
    const result = await instance.gateway.callTool("nacl_graph_health", legacyArgs());
    assert.equal(result.status, "FAILED");
    assert.equal(result.code, "ENDPOINT_NOT_LOOPBACK");
    assert.equal(secretRead, false);
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("a project cannot resolve another project's secret reference", async () => {
  let secretRead = false;
  const instance = await fixture({
    profile: { secretReference: "keychain:com.itsalt.nacl.local-graph/project-b" },
    resolveSecret: async () => {
      secretRead = true;
      return "opaque-test-secret";
    },
  });
  try {
    const result = await instance.gateway.callTool("nacl_graph_health", legacyArgs());
    assert.equal(result.status, "FAILED");
    assert.equal(result.code, "PROJECT_SECRET_MISMATCH");
    assert.equal(secretRead, false);
  } finally {
    await rm(instance.root, { recursive: true, force: true });
  }
});

test("transport pooling is keyed by project and never reuses a tenant transport", () => {
  let created = 0;
  const pool = createProjectTransportPool({
    createTransport(profile) {
      return { tenant: profile.projectId, sequence: ++created };
    },
  });
  const profileA = verifiedProfile(path.join(os.tmpdir(), "a"));
  const profileB = verifiedProfile(path.join(os.tmpdir(), "b"), {
    projectId: "project-b",
    projectRoot: path.join(os.tmpdir(), "nacl-project-b"),
    endpoint: "http://127.0.0.1:27474",
    secretReference: "keychain:com.itsalt.nacl.local-graph/project-b",
  });
  const firstA = pool.get({ projectId: "project-a", profile: profileA, secret: "secret-a" });
  const secondA = pool.get({ projectId: "project-a", profile: profileA, secret: "secret-a" });
  const firstB = pool.get({ projectId: "project-b", profile: profileB, secret: "secret-b" });
  assert.equal(firstA, secondA);
  assert.notEqual(firstA, firstB);
  assert.equal(firstA.tenant, "project-a");
  assert.equal(firstB.tenant, "project-b");
  assert.equal(pool.size(), 2);
  assert.throws(
    () => pool.get({ projectId: "project-a", profile: profileB, secret: "secret-b" }),
    (error) => error.code === "PROJECT_MISMATCH",
  );
});

test("JSONL audit records are mode 0600 and omit secret material and raw idempotency keys", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-audit-test-"));
  try {
    const filename = path.join(root, "nested", "audit.jsonl");
    const sink = new JsonlAuditSink(filename);
    await sink.append({
      projectId: "project-a",
      operation: "write-canary",
      capability: "write",
      status: "VERIFIED",
      code: "WRITE_READBACK_VERIFIED",
      secret: "must-not-appear",
      password: "must-not-appear",
      idempotency_key: "must-not-appear",
      idempotencyKeyHash: "a".repeat(64),
    });
    const content = await readFile(filename, "utf8");
    assert.equal(content.includes("must-not-appear"), false);
    assert.equal(JSON.parse(content).idempotencyKeyHash, "a".repeat(64));
    assert.equal((await stat(filename)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("secret references support only opaque Keychain lookups without secret argv", async () => {
  let observed;
  const keychain = await resolveSecret(
    "keychain:com.itsalt.nacl.local-graph/project-a",
    {
      platform: "darwin",
      execFile: async (executable, args) => {
        observed = { executable, args };
        return { stdout: "keychain-secret\n" };
      },
    },
  );
  assert.equal(keychain, "keychain-secret");
  assert.deepEqual(observed, {
    executable: "/usr/bin/security",
    args: [
      "find-generic-password",
      "-s",
      "com.itsalt.nacl.local-graph",
      "-a",
      "project-a",
      "-w",
    ],
  });
  assert.equal(observed.args.includes(keychain), false);
  await assert.rejects(resolveSecret("env:NACL_GRAPH_TEST_SECRET"),
    (error) => error.code === "SECRET_REFERENCE_INVALID" && error.status === "FAILED");
  await assert.rejects(
    resolveSecret("keychain:com.itsalt.nacl.local-graph/project-a", {
      platform: "darwin",
      execFile: async () => { throw new Error("revoked"); },
    }),
    (error) => error.code === "SECRET_UNAVAILABLE" && error.status === "BLOCKED",
  );
});

test("HTTP transport enforces loopback and maps stopped/auth failures without response leakage", async () => {
  assert.throws(
    () => new Neo4jHttpTransport(
      { endpoint: "http://0.0.0.0:7474", database: "neo4j", username: "neo4j" },
      "opaque-secret",
      { fetch: async () => {} },
    ),
    (error) => error.code === "ENDPOINT_NOT_LOOPBACK",
  );
  const stopped = new Neo4jHttpTransport(
    { endpoint: "http://127.0.0.1:17474", database: "neo4j", username: "neo4j" },
    "opaque-secret",
    { fetch: async () => { throw new Error("connect ECONNREFUSED opaque-secret"); } },
  );
  assert.equal(JSON.stringify(stopped).includes("opaque-secret"), false);
  await assert.rejects(
    stopped.execute([{ statement: "RETURN $value", parameters: { value: 1 } }]),
    (error) => error.code === "GRAPH_UNAVAILABLE" && !error.message.includes("opaque-secret"),
  );
  const auth = new Neo4jHttpTransport(
    { endpoint: "http://127.0.0.1:17474", database: "neo4j", username: "neo4j" },
    "opaque-secret",
    { fetch: async () => ({ status: 401, ok: false }) },
  );
  await assert.rejects(
    auth.execute([{ statement: "RETURN 1", parameters: {} }]),
    (error) => error.code === "AUTH_FAILED" && !JSON.stringify(error).includes("opaque-secret"),
  );
  const transient = new Neo4jHttpTransport(
    { endpoint: "http://127.0.0.1:17474", database: "neo4j", username: "neo4j" },
    "opaque-secret",
    {
      fetch: async () => ({
        status: 200,
        ok: true,
        async json() {
          return {
            results: [],
            errors: [{ code: "Neo.TransientError.Transaction.DeadlockDetected" }],
          };
        },
      }),
    },
  );
  await assert.rejects(
    transient.execute([{ statement: "RETURN 1", parameters: {} }]),
    (error) => error.code === "GRAPH_BACKPRESSURE" && error.retryable === true,
  );
});

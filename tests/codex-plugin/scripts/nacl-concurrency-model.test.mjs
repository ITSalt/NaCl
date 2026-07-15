import assert from "node:assert/strict";
import test from "node:test";
import { rolesForCapability } from "../../../plugins/nacl/runtime/graph-gateway/authorization.mjs";
import {
  CONCURRENCY_RESOURCE_TYPES,
  RESOURCE_CAPABILITIES,
  concurrencyRequestContext,
  deriveWorkerId,
  sanitizeChanges,
  validateIdentity,
} from "../../../plugins/nacl/runtime/graph-gateway/concurrency.mjs";
import {
  ALLOCATION_STATEMENTS,
  CONCURRENCY_STATEMENTS,
} from "../../../plugins/nacl/runtime/graph-gateway/concurrency-cypher.mjs";
import {
  BOOTSTRAP_SCHEMA_CHECK,
  BOOTSTRAP_SCHEMA_PREPARE,
  SCHEMA_LEASE_CHECK,
  authorizedBootstrapSchemaStatement,
} from "../../../plugins/nacl/runtime/graph-gateway/rbac-cypher.mjs";
import { runConcurrencyOperation } from "../../../plugins/nacl/runtime/graph-gateway/concurrency-engine.mjs";
import { createLocalOsPrincipalResolver } from "../../../plugins/nacl/runtime/graph-gateway/principal.mjs";
import { GRAPH_TOOL_BY_NAME } from "../../../plugins/nacl/runtime/graph-gateway/tool-schemas.mjs";
import { validateToolArguments } from "../../../plugins/nacl/runtime/graph-gateway/validation.mjs";

const projectId = "wave5-model-project";
const projectRoot = "/tmp/wave5-model-project";
const sha = "a".repeat(40);

function identity(principal = "principal-alice", session = "session-one", suffix = "one") {
  const value = {
    principal_id: principal,
    client_id: "client-desktop",
    session_id: session,
    worktree_id: `worktree-${suffix}`,
    branch: `codex/${suffix}`,
    base_sha: sha,
  };
  return {
    ...value,
    worker_id: deriveWorkerId({
      principal_id: value.principal_id,
      client_id: value.client_id,
      session_id: value.session_id,
    }),
  };
}

class SerializableModel {
  constructor() {
    this.leases = new Map();
    this.resources = new Map();
    this.sequences = new Map();
    this.idempotency = new Map();
  }

  key(project, kind, id) {
    return `${project}\0${kind}\0${id}`;
  }

  create(project, kind, id) {
    this.resources.set(this.key(project, kind, id), { revision: 0, status: "new" });
  }

  claim({ project, kind, id, worker, principal, now, ttl }) {
    const key = this.key(project, kind, id);
    if (!this.resources.has(key)) return { accepted: false, code: "RESOURCE_NOT_FOUND" };
    const prior = this.leases.get(key) ?? { fencingToken: 0, worker: null, expiresAt: null };
    const expired = prior.expiresAt === null || prior.expiresAt <= now;
    const accepted = prior.worker === null || expired || (prior.worker === worker && prior.expiresAt > now);
    if (!accepted) return { accepted: false, code: "LEASE_HELD", ...prior };
    const increments = prior.worker === null || expired;
    const next = {
      fencingToken: prior.fencingToken + (increments ? 1 : 0),
      worker,
      principal,
      expiresAt: now + ttl,
    };
    this.leases.set(key, next);
    return { accepted: true, ...next };
  }

  heartbeat({ project, kind, id, worker, token, now, ttl }) {
    const lease = this.leases.get(this.key(project, kind, id));
    if (!lease || lease.worker !== worker || lease.fencingToken !== token || lease.expiresAt <= now) {
      return { accepted: false, code: "STALE_FENCING_TOKEN" };
    }
    lease.expiresAt = now + ttl;
    return { accepted: true, ...lease };
  }

  release({ project, kind, id, worker, token, now }) {
    const lease = this.leases.get(this.key(project, kind, id));
    if (!lease || lease.worker !== worker || lease.fencingToken !== token || lease.expiresAt <= now) {
      return { accepted: false, code: "STALE_FENCING_TOKEN" };
    }
    lease.worker = null;
    lease.expiresAt = null;
    return { accepted: true, fencingToken: lease.fencingToken };
  }

  mutate({ project, kind, id, worker, token, now, expected, key, payload, changes }) {
    const ledgerKey = `${project}\0${key}`;
    const replay = this.idempotency.get(ledgerKey);
    if (replay) {
      if (replay.payload !== payload) return { accepted: false, code: "IDEMPOTENCY_CONFLICT" };
      return { ...replay.result, replay: true };
    }
    const resourceKey = this.key(project, kind, id);
    const resource = this.resources.get(resourceKey);
    const lease = this.leases.get(resourceKey);
    let result;
    if (!resource || !lease || lease.worker !== worker || lease.fencingToken !== token || lease.expiresAt <= now) {
      result = { accepted: false, code: "STALE_FENCING_TOKEN" };
    } else if (resource.revision !== expected) {
      result = { accepted: false, code: "CONFLICT", currentRevision: resource.revision };
    } else {
      Object.assign(resource, changes, { revision: resource.revision + 1 });
      result = { accepted: true, code: "MUTATION_ACCEPTED", revision: resource.revision };
    }
    this.idempotency.set(ledgerKey, { payload, result });
    return result;
  }

  allocate({ project, kind }) {
    const key = `${project}\0${kind}`;
    const value = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, value);
    const id = `${kind}-${String(value).padStart(12, "0")}`;
    this.create(project, kind, id);
    return { value, id };
  }
}

test("strict identity keeps one principal's sessions as distinct workers", () => {
  const first = identity("principal-alice", "session-one", "one");
  const second = identity("principal-alice", "session-two", "two");
  assert.notEqual(first.worker_id, second.worker_id);
  assert.equal(validateIdentity(first).principal_id, "principal-alice");
  assert.throws(() => validateIdentity({ ...second, worker_id: first.worker_id }), /worker_id must be derived/);
});

test("tool boundary rejects caller role/membership and reserved mutation properties", () => {
  const definition = GRAPH_TOOL_BY_NAME.get("nacl_graph_mutate_resource");
  const base = {
    project_id: projectId,
    project_root: projectRoot,
    ...identity(),
    resource_type: "Task",
    resource_id: "TASK-001",
    fencing_token: 1,
    expected_revision: 0,
    idempotency_key: "model-mutate-001",
    approval: "APPROVE_TL_WRITE",
    changes: { status: "in_progress" },
  };
  validateToolArguments(definition, base);
  assert.throws(() => validateToolArguments(definition, { ...base, role: "project_admin" }), /Unknown argument/);
  assert.throws(() => validateToolArguments(definition, { ...base, membership: { role: "developer" } }), /Unknown argument/);
  assert.throws(() => sanitizeChanges("Task", { revision: 99 }), /not mutable/);
  assert.throws(() => sanitizeChanges("Task", { fencing_token: 99 }), /not mutable/);
});

test("no-test evidence requires exact confirmation before graph access and binds request payload", async () => {
  const definition = GRAPH_TOOL_BY_NAME.get("nacl_graph_mutate_resource");
  const request = {
    project_id: projectId,
    project_root: projectRoot,
    ...identity("principal-no-test", "session-no-test", "no-test"),
    resource_type: "Task",
    resource_id: "TASK-NO-TEST",
    fencing_token: 1,
    expected_revision: 0,
    idempotency_key: "model-no-test-001",
    approval: "APPROVE_TL_WRITE",
    changes: { status: "done", verification_evidence: "no-test" },
  };
  let graphCalls = 0;
  await assert.rejects(
    runConcurrencyOperation(definition, request, {
      resolvePrincipal: async () => ({ principal_id: request.principal_id, assurance: "trusted-test-harness" }),
      transport: { async execute() { graphCalls += 1; return [[]]; } },
    }),
    (error) => error.code === "NO_TEST_EVIDENCE_CONFIRMATION_REQUIRED",
  );
  assert.equal(graphCalls, 0);
  assert.throws(
    () => validateToolArguments(definition, { ...request, evidence_confirmation: "WRONG" }),
    (error) => error.code === "NO_TEST_EVIDENCE_CONFIRMATION_REQUIRED",
  );
  const confirmed = { ...request, evidence_confirmation: "CONFIRM_NO_TEST_EVIDENCE" };
  validateToolArguments(definition, confirmed);
  assert.throws(
    () => validateToolArguments(definition, {
      ...confirmed,
      resource_type: "Module",
      resource_id: "MOD-NO-TEST",
      approval: "APPROVE_SA_WRITE",
      changes: { status: "draft" },
    }),
    (error) => error.code === "NO_TEST_EVIDENCE_CONFIRMATION_UNEXPECTED",
  );
  const context = concurrencyRequestContext(definition, confirmed, { nowMs: 1 });
  assert.equal(context.evidenceConfirmation, "CONFIRM_NO_TEST_EVIDENCE");
  const greenContext = concurrencyRequestContext(definition, {
    ...request,
    idempotency_key: "model-green-test-001",
    changes: { status: "done", verification_evidence: "test-GREEN:tests/task.test.mjs" },
  }, { nowMs: 1 });
  assert.notEqual(context.payloadHash, greenContext.payloadHash);
});

test("runtime principal is OS-bound and a spoofed existing admin is rejected before graph access", async () => {
  const local = createLocalOsPrincipalResolver({ userInfo: () => ({ uid: 501 }) });
  assert.deepEqual(await local(), { principal_id: "local-os:501", assurance: "local-os-user" });
  const request = {
    project_id: projectId,
    project_root: projectRoot,
    ...identity("principal-admin", "session-spoof", "spoof"),
    resource_type: "SchemaMigration",
    resource_id: "MIG-001",
    ttl_seconds: 30,
    idempotency_key: "spoof-existing-admin",
    approval: "CONFIRM_SCHEMA_ADMIN",
  };
  let graphCalls = 0;
  await assert.rejects(
    runConcurrencyOperation(GRAPH_TOOL_BY_NAME.get("nacl_graph_claim_resource"), request, {
      resolvePrincipal: async () => ({ principal_id: "principal-developer", assurance: "trusted-test-harness" }),
      transport: { async execute() { graphCalls += 1; return [[]]; } },
    }),
    (error) => error.code === "PRINCIPAL_MISMATCH",
  );
  assert.equal(graphCalls, 0);
});

test("bootstrap requires exact confirmation and retains full derived identity", () => {
  const definition = GRAPH_TOOL_BY_NAME.get("nacl_graph_bootstrap_admin");
  const request = {
    project_id: projectId,
    project_root: projectRoot,
    ...identity("principal-initial", "session-bootstrap", "bootstrap"),
    idempotency_key: "bootstrap-admin-001",
    confirmation: "CONFIRM_INITIAL_PROJECT_ADMIN",
  };
  validateToolArguments(definition, request);
  assert.throws(
    () => validateToolArguments(definition, { ...request, confirmation: "CONFIRM_MEMBERSHIP_ADMIN" }),
    /CONFIRM_INITIAL_PROJECT_ADMIN/,
  );
});

test("every named write statement locks and reads authoritative membership in the same transaction", () => {
  const { "membership-bootstrap": bootstrap, ...membershipProtectedStatements } = CONCURRENCY_STATEMENTS;
  for (const [name, statement] of Object.entries({ ...membershipProtectedStatements, ...ALLOCATION_STATEMENTS })) {
    assert.match(statement, /MATCH \(membership:ProjectMembership/ , name);
    assert.match(statement, /membership\.auth_lock_version/, name);
    assert.match(statement, /membership\.active = true/, name);
    assert.match(statement, /membership\.role IN \$allowed_roles/, name);
    assert.doesNotMatch(statement, /\$role|\$membership/, name);
  }
  assert.match(bootstrap, /MATCH \(guard:ProjectAuthorization/);
  assert.match(bootstrap, /guard\.lock_version/);
  assert.match(bootstrap, /count\(existing_membership\)/);
  assert.match(bootstrap, /guard\.state <> 'PREPARING'/);
  assert.match(bootstrap, /guard\.bootstrap_fencing_token <> \$bootstrap_fencing_token/);
  assert.match(bootstrap, /CREATE \(membership:ProjectMembership/);
  assert.match(bootstrap, /guard\.state = 'BOOTSTRAPPED'/);
  assert.doesNotMatch(bootstrap, /\$role|\$membership/);
  for (const kind of CONCURRENCY_RESOURCE_TYPES) {
    assert.ok(ALLOCATION_STATEMENTS[kind].includes(`CREATE (resource:${kind}`));
    assert.deepEqual(rolesForCapability(RESOURCE_CAPABILITIES[kind]).includes("viewer"), false);
  }
});

test("all four lease operations authorize before exact idempotency and keep replay records immutable", () => {
  for (const operation of ["lease-acquire", "lease-heartbeat", "lease-release", "lease-handoff"]) {
    const statement = CONCURRENCY_STATEMENTS[operation];
    const authorization = statement.indexOf("MATCH (membership:ProjectMembership");
    const resource = statement.indexOf("MATCH (resource {id: $resource_id})");
    const idempotency = statement.indexOf("MERGE (request:IdempotencyRecord");
    assert.ok(authorization >= 0 && authorization < resource && resource < idempotency, operation);
    assert.match(statement, /request\.payload_hash = \$payload_hash/, operation);
    assert.match(statement, /request\.request_nonce = \$request_nonce AS request_created_here/, operation);
    assert.match(statement, /WHEN NOT request_created_here AND request\.state = 'COMPLETED' THEN 'REPLAY'/, operation);
    assert.match(statement, /WHEN NOT request_created_here THEN 'IDEMPOTENCY_INCOMPLETE'/, operation);
    assert.match(statement, /CASE WHEN request_created_here THEN \[1\] ELSE \[\] END/, operation);
    assert.match(statement, /request\.result_fencing_token/, operation);
    assert.match(statement, /SET membership\.auth_lock_version = membership\.auth_lock_version/, operation);
    assert.match(statement, /SET request\.lock_version = request\.lock_version/, operation);
    assert.doesNotMatch(statement, /request\.lock_version\s*=\s*coalesce\([^\n]+\) \+ 1/, operation);
    assert.doesNotMatch(statement, /\$idempotency_key(?:\W|$)/, operation);
  }
});

test("lease idempotency payload binds semantic TTL but excludes logical clock and computed expiry", () => {
  const definition = GRAPH_TOOL_BY_NAME.get("nacl_graph_claim_resource");
  const request = {
    project_id: projectId,
    project_root: projectRoot,
    ...identity(),
    resource_type: "Task",
    resource_id: "TASK-IDEMPOTENCY",
    ttl_seconds: 60,
    idempotency_key: "semantic-ttl-claim",
    approval: "APPROVE_TL_WRITE",
  };
  const first = concurrencyRequestContext(definition, request, { nowMs: 1_000 });
  const laterRetry = concurrencyRequestContext(definition, request, { nowMs: 9_000 });
  const changedTtl = concurrencyRequestContext(definition, { ...request, ttl_seconds: 61 }, { nowMs: 1_000 });
  assert.equal(first.payloadHash, laterRetry.payloadHash);
  assert.notEqual(first.expiresAtMs, laterRetry.expiresAtMs);
  assert.notEqual(first.payloadHash, changedTtl.payloadHash);
});

test("initial schema bootstrap is the only zero-membership DDL path and is fenced by a serialized guard", () => {
  assert.match(BOOTSTRAP_SCHEMA_PREPARE, /MERGE \(guard:ProjectAuthorization/);
  assert.match(BOOTSTRAP_SCHEMA_PREPARE, /count\(existing_membership\)/);
  assert.match(BOOTSTRAP_SCHEMA_PREPARE, /guard\.state = 'PREPARING'/);
  assert.match(BOOTSTRAP_SCHEMA_PREPARE, /guard\.bootstrap_worker_id = \$worker_id/);
  assert.match(BOOTSTRAP_SCHEMA_CHECK, /guard\.bootstrap_fencing_token = \$bootstrap_fencing_token/);
  assert.match(BOOTSTRAP_SCHEMA_CHECK, /membership_count = 0/);
  const guardedLedger = authorizedBootstrapSchemaStatement("RETURN $expected AS observed");
  assert.ok(
    guardedLedger.indexOf("MATCH (guard:ProjectAuthorization") < guardedLedger.indexOf("RETURN $expected AS observed"),
  );
  assert.doesNotMatch(guardedLedger, /MATCH \(membership:ProjectMembership/);
  assert.match(SCHEMA_LEASE_CHECK, /SET schema_lease\.lock_version = schema_lease\.lock_version/);
  assert.doesNotMatch(SCHEMA_LEASE_CHECK, /schema_lease\.lock_version\s*=\s*coalesce\([^\n]+\) \+ 1/);
});

test("ten concurrent claims serialize to one owner", async () => {
  const model = new SerializableModel();
  model.create(projectId, "Task", "TASK-001");
  const attempts = await Promise.all(Array.from({ length: 10 }, async (_, index) => model.claim({
    project: projectId,
    kind: "Task",
    id: "TASK-001",
    worker: `worker-${index}`,
    principal: `principal-${index}`,
    now: 1_000,
    ttl: 60_000,
  })));
  assert.equal(attempts.filter((entry) => entry.accepted).length, 1);
  assert.equal(attempts.filter((entry) => entry.code === "LEASE_HELD").length, 9);
});

test("expiry boundary increments fence and stale worker cannot mutate, heartbeat, or release", () => {
  const model = new SerializableModel();
  model.create(projectId, "Task", "TASK-002");
  const first = model.claim({ project: projectId, kind: "Task", id: "TASK-002", worker: "worker-a", principal: "a", now: 1_000, ttl: 30_000 });
  assert.equal(first.fencingToken, 1);
  const takeover = model.claim({ project: projectId, kind: "Task", id: "TASK-002", worker: "worker-b", principal: "b", now: 31_000, ttl: 30_000 });
  assert.equal(takeover.fencingToken, 2, "expires_at == now is expired");
  assert.equal(model.heartbeat({ project: projectId, kind: "Task", id: "TASK-002", worker: "worker-a", token: 1, now: 31_001, ttl: 30_000 }).code, "STALE_FENCING_TOKEN");
  assert.equal(model.release({ project: projectId, kind: "Task", id: "TASK-002", worker: "worker-a", token: 1, now: 31_001 }).code, "STALE_FENCING_TOKEN");
  assert.equal(model.mutate({ project: projectId, kind: "Task", id: "TASK-002", worker: "worker-a", token: 1, now: 31_001, expected: 0, key: "stale-key", payload: "stale", changes: { status: "wrong" } }).code, "STALE_FENCING_TOKEN");
});

test("CAS has no partial mutation and idempotency is exact", () => {
  const model = new SerializableModel();
  model.create(projectId, "Task", "TASK-003");
  const lease = model.claim({ project: projectId, kind: "Task", id: "TASK-003", worker: "worker-a", principal: "a", now: 1_000, ttl: 60_000 });
  const accepted = model.mutate({ project: projectId, kind: "Task", id: "TASK-003", worker: "worker-a", token: lease.fencingToken, now: 2_000, expected: 0, key: "same-key", payload: "payload-a", changes: { status: "done" } });
  assert.equal(accepted.revision, 1);
  const replay = model.mutate({ project: projectId, kind: "Task", id: "TASK-003", worker: "worker-a", token: lease.fencingToken, now: 3_000, expected: 0, key: "same-key", payload: "payload-a", changes: { status: "done" } });
  assert.equal(replay.replay, true);
  assert.equal(replay.revision, 1);
  assert.equal(model.mutate({ project: projectId, kind: "Task", id: "TASK-003", worker: "worker-a", token: lease.fencingToken, now: 3_000, expected: 1, key: "same-key", payload: "payload-b", changes: { status: "wrong" } }).code, "IDEMPOTENCY_CONFLICT");
  const stale = model.mutate({ project: projectId, kind: "Task", id: "TASK-003", worker: "worker-a", token: lease.fencingToken, now: 3_000, expected: 0, key: "stale-cas", payload: "payload-c", changes: { status: "wrong" } });
  assert.equal(stale.code, "CONFLICT");
  assert.equal(model.resources.get(model.key(projectId, "Task", "TASK-003")).status, "done");
});

test("1,000 parallel allocations are unique and monotonic per project and entity kind", async () => {
  const model = new SerializableModel();
  const allocated = await Promise.all(Array.from({ length: 1_000 }, async () => model.allocate({ project: projectId, kind: "Task" })));
  const values = allocated.map((entry) => entry.value);
  assert.equal(new Set(allocated.map((entry) => entry.id)).size, 1_000);
  assert.deepEqual(values, Array.from({ length: 1_000 }, (_, index) => index + 1));
  assert.equal(model.allocate({ project: "other-project", kind: "Task" }).value, 1);
  assert.equal(model.allocate({ project: projectId, kind: "UseCase" }).value, 1);
});

test("all protected kinds retain isolated project/resource keys", () => {
  const model = new SerializableModel();
  for (const kind of CONCURRENCY_RESOURCE_TYPES) {
    const id = `${kind}-001`;
    model.create(projectId, kind, id);
    const claimed = model.claim({ project: projectId, kind, id, worker: "worker-a", principal: "a", now: 1_000, ttl: 30_000 });
    assert.equal(claimed.accepted, true, kind);
  }
  assert.equal(model.leases.size, CONCURRENCY_RESOURCE_TYPES.length);
});

test("engine maps exact replay and graph-authoritative metadata", async () => {
  const definition = GRAPH_TOOL_BY_NAME.get("nacl_graph_mutate_resource");
  const request = {
    project_id: projectId,
    project_root: projectRoot,
    ...identity(),
    resource_type: "Task",
    resource_id: "TASK-004",
    fencing_token: 3,
    expected_revision: 7,
    idempotency_key: "engine-replay-001",
    approval: "APPROVE_TL_WRITE",
    changes: { status: "done", verification_evidence: "test-GREEN:tests/task-004.test.mjs" },
  };
  const executed = [];
  const result = await runConcurrencyOperation(definition, request, {
    clock: () => 5_000,
    resolvePrincipal: async () => ({
      principal_id: request.principal_id,
      assurance: "trusted-test-harness",
    }),
    transport: {
      async execute(statements) {
        executed.push(statements[0]);
        return [[{
          accepted: true,
          code: "MUTATION_ACCEPTED",
          replay: true,
          revision: 8,
          currentRevision: 9,
          principalId: request.principal_id,
          workerId: request.worker_id,
          membershipRevision: 4,
        }]];
      },
    },
  });
  assert.equal(result.replay, true);
  assert.equal(result.graphAuthoritative, true);
  assert.equal(result.offlineWriteQueue, false);
  assert.deepEqual(executed[0].parameters.allowed_roles, ["developer"]);
  assert.equal(Object.hasOwn(executed[0].parameters, "role"), false);
  assert.equal(Object.hasOwn(executed[0].parameters, "membership"), false);
});

test("engine fails closed on empty rows and requires admin reconciliation for PENDING idempotency", async () => {
  const definition = GRAPH_TOOL_BY_NAME.get("nacl_graph_claim_resource");
  const request = {
    project_id: projectId,
    project_root: projectRoot,
    ...identity(),
    resource_type: "Task",
    resource_id: "TASK-005",
    ttl_seconds: 30,
    idempotency_key: "engine-claim-005",
    approval: "APPROVE_TL_WRITE",
  };
  const runtime = (rows) => ({
    clock: () => 5_000,
    resolvePrincipal: async () => ({
      principal_id: request.principal_id,
      assurance: "trusted-test-harness",
    }),
    transport: { async execute() { return [rows]; } },
  });
  await assert.rejects(
    runConcurrencyOperation(definition, request, runtime([])),
    (error) => error.code === "ACCESS_OR_RESOURCE_NOT_FOUND" && error.status === "BLOCKED",
  );
  await assert.rejects(
    runConcurrencyOperation(definition, request, runtime([{
      accepted: false,
      code: "IDEMPOTENCY_INCOMPLETE",
      replay: false,
      resourceId: "TASK-005",
    }])),
    (error) => error.code === "IDEMPOTENCY_INCOMPLETE" &&
      error.status === "BLOCKED" &&
      error.details.recovery === "ADMIN_RECONCILIATION_REQUIRED",
  );
});

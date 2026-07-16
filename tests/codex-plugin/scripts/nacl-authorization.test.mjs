import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CAPABILITIES,
  CAPABILITY_POLICY,
  ROLE_CAPABILITIES,
  ROLES,
  createProjectAuthorizer,
  rolesForCapability,
} from "../../../plugins/nacl/runtime/graph-gateway/authorization.mjs";
import {
  deriveWorkerId,
  validateIdentityContext,
} from "../../../plugins/nacl/runtime/graph-gateway/identity.mjs";
import { buildAuthorizationProvenance } from "../../../plugins/nacl/runtime/graph-gateway/provenance.mjs";

const projectA = "01J-WAVE5-PROJECT-A";
const projectB = "01J-WAVE5-PROJECT-B";
const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);

function identity(overrides = {}) {
  return {
    principal_id: "principal-alice",
    client_id: "client-desktop-01",
    session_id: "session-thread-01",
    worktree_id: "worktree-feature-01",
    branch: "codex/wave5-feature",
    base_sha: baseSha,
    ...overrides,
  };
}

function authorizerFor(membership, calls = []) {
  return createProjectAuthorizer({
    async resolveMembership(scope) {
      calls.push(structuredClone(scope));
      return typeof membership === "function" ? membership(scope) : membership;
    },
  });
}

function membership(role, overrides = {}) {
  return {
    project_id: projectA,
    principal_id: "principal-alice",
    role,
    active: true,
    revision: 1,
    ...overrides,
  };
}

function authorizationInput(capability, overrides = {}) {
  const policy = CAPABILITY_POLICY[capability];
  return {
    project_id: projectA,
    identity: identity(),
    capability,
    tool_class: policy.toolClass,
    ...(policy.confirmation ? { confirmation: policy.confirmation } : {}),
    ...overrides,
  };
}

test("worker identity is deterministic and session-separated for one principal and client", () => {
  const first = validateIdentityContext(identity());
  const replay = validateIdentityContext(identity({ worker_id: first.worker_id }));
  const secondSession = validateIdentityContext(identity({ session_id: "session-thread-02" }));
  assert.equal(first.worker_id, replay.worker_id);
  assert.equal(first.worker_id, deriveWorkerId({
    principal_id: first.principal_id,
    client_id: first.client_id,
    session_id: first.session_id,
  }));
  assert.notEqual(first.worker_id, secondSession.worker_id);
  assert.match(first.worker_id, /^worker-[0-9a-f]{48}$/);
  assert.notEqual(first.worker_id, `${first.principal_id}:${first.client_id}`);
});

test("identity rejects forged workers, malformed bounded IDs, branches, SHAs, PRs, and unknown fields", () => {
  for (const forged of [
    identity({ worker_id: `worker-${"0".repeat(48)}` }),
    identity({ principal_id: "ab" }),
    identity({ client_id: "client..forged" }),
    identity({ session_id: "session\nforged" }),
    identity({ worktree_id: "worktree/" }),
    identity({ branch: "feature..forged" }),
    identity({ branch: "feature.lock/child" }),
    identity({ branch: "feature with space" }),
    identity({ branch: "@" }),
    identity({ base_sha: "ABCDEF".repeat(7) }),
    identity({ pull_request: { number: 0, url: "https://example.invalid/pull/1", head_sha: headSha } }),
    identity({ pull_request: { number: 1, url: "https://user:secret@example.invalid/pull/1", head_sha: headSha } }),
    identity({ pull_request: { number: 1, url: "http://example.invalid/pull/1", head_sha: headSha } }),
    identity({ pull_request: { number: 1, url: "https://example.invalid/pull/1", head_sha: "short" } }),
    { ...identity(), developer_id: "legacy-machine-owner" },
  ]) {
    assert.throws(() => validateIdentityContext(forged), /malformed|mismatch|derived|unknown|lowercase|without credentials/i);
  }
});

test("validated identity retains exact bounded Git provenance", () => {
  const validated = validateIdentityContext(identity({
    pull_request: {
      number: 42,
      url: "https://example.invalid/org/repo/pull/42",
      head_sha: headSha,
    },
  }));
  assert.equal(validated.branch, "codex/wave5-feature");
  assert.equal(validated.base_sha, baseSha);
  assert.deepEqual(validated.pull_request, {
    number: 42,
    url: "https://example.invalid/org/repo/pull/42",
    head_sha: headSha,
  });
});

test("server-resolved membership enforces the complete explicit role matrix", async () => {
  for (const role of ROLES) {
    const authorizer = authorizerFor(membership(role));
    for (const capability of CAPABILITIES) {
      const result = await authorizer.authorizeProjectOperation(authorizationInput(capability));
      const expected = ROLE_CAPABILITIES[role].includes(capability);
      assert.equal(result.accepted, expected, `${role} / ${capability}`);
      assert.equal(result.outcome, expected ? "accepted" : "rejected");
      assert.equal(result.code, expected ? "AUTHORIZED" : "ROLE_CAPABILITY_DENIED");
      assert.equal(result.role, role);
      assert.equal(result.capability, capability);
      assert.equal(result.tool_class, CAPABILITY_POLICY[capability].toolClass);
    }
  }
});

test("caller-supplied membership and role spoofing are rejected before the server resolver", async () => {
  const calls = [];
  const authorizer = authorizerFor(membership("viewer"), calls);
  await assert.rejects(
    authorizer.authorizeProjectOperation({
      ...authorizationInput("schema.admin"),
      membership: { project_id: projectA, principal_id: "principal-alice", role: "project_admin" },
    }),
    /unknown field.*membership/i,
  );
  await assert.rejects(
    authorizer.authorizeProjectOperation({ ...authorizationInput("schema.admin"), role: "project_admin" }),
    /unknown field.*role/i,
  );
  assert.equal(calls.length, 0);
});

test("membership is project-scoped and principal-scoped with no fallback", async () => {
  const crossProject = authorizerFor(membership("project_admin", { project_id: projectB }));
  const projectDenied = await crossProject.authorizeProjectOperation(authorizationInput("schema.admin"));
  assert.equal(projectDenied.accepted, false);
  assert.equal(projectDenied.code, "PROJECT_MEMBERSHIP_DENIED");

  const crossPrincipal = authorizerFor(membership("project_admin", { principal_id: "principal-mallory" }));
  const principalDenied = await crossPrincipal.authorizeProjectOperation(authorizationInput("schema.admin"));
  assert.equal(principalDenied.accepted, false);
  assert.equal(principalDenied.code, "PRINCIPAL_MEMBERSHIP_DENIED");

  const missing = authorizerFor(null);
  const missingDenied = await missing.authorizeProjectOperation(authorizationInput("project.read"));
  assert.equal(missingDenied.accepted, false);
  assert.equal(missingDenied.code, "MEMBERSHIP_NOT_FOUND");
  assert.equal(missingDenied.role, "none");
  assert.equal(missingDenied.membership_revision, 0);

  const inactive = authorizerFor(membership("project_admin", { active: false, revision: 7 }));
  const revoked = await inactive.authorizeProjectOperation(authorizationInput("schema.admin"));
  assert.equal(revoked.accepted, false);
  assert.equal(revoked.code, "MEMBERSHIP_INACTIVE");
  assert.equal(revoked.membership_revision, 7);
});

test("ordinary roles cannot emulate release, schema, restore, destructive, or administrative tools", async () => {
  const restricted = [
    "release.write",
    "membership.admin",
    "schema.admin",
    "backup.admin",
    "restore.admin",
    "graph.destructive",
    "cypher.raw-admin",
  ];
  for (const role of ["viewer", "analyst", "architect", "developer"]) {
    const authorizer = authorizerFor(membership(role));
    for (const capability of restricted) {
      const denied = await authorizer.authorizeProjectOperation(authorizationInput(capability));
      assert.equal(denied.accepted, false, `${role} unexpectedly gained ${capability}`);
      assert.equal(denied.code, "ROLE_CAPABILITY_DENIED");
    }
  }
});

test("capability and tool class are bound and every write/admin class requires its exact confirmation", async () => {
  for (const [role, capabilities] of Object.entries(ROLE_CAPABILITIES)) {
    const authorizer = authorizerFor(membership(role));
    for (const capability of capabilities.filter((value) => value !== "project.read")) {
      const policy = CAPABILITY_POLICY[capability];
      const missing = await authorizer.authorizeProjectOperation(authorizationInput(capability, { confirmation: undefined }));
      assert.equal(missing.accepted, false);
      assert.equal(missing.code, "CONFIRMATION_REQUIRED");
      assert.equal(missing.required_confirmation, policy.confirmation);

      const wrong = await authorizer.authorizeProjectOperation(authorizationInput(capability, { confirmation: "CONFIRM_SOMETHING_ELSE" }));
      assert.equal(wrong.accepted, false);
      assert.equal(wrong.code, "CONFIRMATION_REQUIRED");

      const mismatchedClass = await authorizer.authorizeProjectOperation(authorizationInput(capability, {
        tool_class: policy.toolClass === "schema-admin" ? "restore-admin" : "schema-admin",
      }));
      assert.equal(mismatchedClass.accepted, false);
      assert.equal(mismatchedClass.code, "TOOL_CLASS_DENIED");
    }
  }
});

test("authorization decisions are deterministic and resolver receives only project/principal scope", async () => {
  const calls = [];
  const authorizer = authorizerFor(membership("analyst"), calls);
  const request = authorizationInput("ba.write");
  const first = await authorizer.authorizeProjectOperation(request);
  const second = await authorizer.authorizeProjectOperation(structuredClone(request));
  assert.deepEqual(first, second);
  assert.deepEqual(calls, [
    { project_id: projectA, principal_id: "principal-alice" },
    { project_id: projectA, principal_id: "principal-alice" },
  ]);
  assert.equal("role" in calls[0], false);
  assert.equal("capability" in calls[0], false);
});

test("unknown capabilities, tool classes, membership roles, and dependency fields fail closed", async () => {
  const validMembership = membership("viewer");
  const authorizer = authorizerFor(validMembership);
  await assert.rejects(
    authorizer.authorizeProjectOperation({ ...authorizationInput("project.read"), capability: "admin.everything" }),
    /capability is unknown/i,
  );
  await assert.rejects(
    authorizer.authorizeProjectOperation({ ...authorizationInput("project.read"), tool_class: "unrestricted-cypher" }),
    /tool_class is unknown/i,
  );
  await assert.rejects(
    authorizerFor({ ...validMembership, role: "owner" }).authorizeProjectOperation(authorizationInput("project.read")),
    /role is unknown/i,
  );
  assert.throws(
    () => createProjectAuthorizer({ resolveMembership: async () => validMembership, fallbackRole: "project_admin" }),
    /unknown field/i,
  );
  assert.throws(() => rolesForCapability("admin.everything"), /capability is unknown/i);
});

test("rolesForCapability exposes exact immutable server-side allowlists", () => {
  for (const capability of CAPABILITIES) {
    const expected = ROLES.filter((role) => ROLE_CAPABILITIES[role].includes(capability));
    const actual = rolesForCapability(capability);
    assert.deepEqual(actual, expected);
    assert.equal(Object.isFrozen(actual), true);
  }
  assert.deepEqual(rolesForCapability("release.write"), ["release_manager"]);
  assert.deepEqual(rolesForCapability("schema.admin"), ["project_admin"]);
});

test("provenance is complete for accepted and rejected decisions and exposes only the idempotency hash", async () => {
  const idempotencyKey = "wave5-secret-replay-key-0001";
  const acceptedAuthorizer = authorizerFor(membership("analyst", { revision: 4 }));
  const acceptedIdentity = identity({
    pull_request: { number: 42, url: "https://example.invalid/org/repo/pull/42", head_sha: headSha },
  });
  const accepted = await acceptedAuthorizer.authorizeProjectOperation(authorizationInput("ba.write", {
    identity: acceptedIdentity,
  }));
  const acceptedRecord = buildAuthorizationProvenance({
    project_id: projectA,
    identity: acceptedIdentity,
    decision: accepted,
    operation: "resource.upsert",
    idempotency_key: idempotencyKey,
  });
  assert.deepEqual(
    {
      project_id: acceptedRecord.project_id,
      principal_id: acceptedRecord.principal_id,
      worker_id: acceptedRecord.worker_id,
      client_id: acceptedRecord.client_id,
      session_id: acceptedRecord.session_id,
      worktree_id: acceptedRecord.worktree_id,
      role: acceptedRecord.role,
      capability: acceptedRecord.capability,
      membership_revision: acceptedRecord.membership_revision,
      outcome: acceptedRecord.authorization_outcome,
    },
    {
      project_id: projectA,
      principal_id: "principal-alice",
      worker_id: accepted.worker_id,
      client_id: "client-desktop-01",
      session_id: "session-thread-01",
      worktree_id: "worktree-feature-01",
      role: "analyst",
      capability: "ba.write",
      membership_revision: 4,
      outcome: "accepted",
    },
  );
  assert.equal(
    acceptedRecord.idempotency_key_hash,
    createHash("sha256").update(idempotencyKey).digest("hex"),
  );
  const serialized = JSON.stringify(acceptedRecord);
  assert.equal(serialized.includes(idempotencyKey), false);
  assert.equal(serialized.includes("confirmation"), false);
  assert.equal(serialized.includes("credentials"), false);
  assert.equal(serialized.includes("raw_payload"), false);

  const rejectedAuthorizer = authorizerFor(membership("viewer"));
  const rejected = await rejectedAuthorizer.authorizeProjectOperation(authorizationInput("ba.write"));
  const rejectedRecord = buildAuthorizationProvenance({
    project_id: projectA,
    identity: identity(),
    decision: rejected,
    operation: "resource.upsert",
    idempotency_key: idempotencyKey,
  });
  assert.equal(rejectedRecord.authorization_outcome, "rejected");
  assert.equal(rejectedRecord.authorization_code, "ROLE_CAPABILITY_DENIED");

  const missing = await authorizerFor(null).authorizeProjectOperation(authorizationInput("project.read"));
  const missingRecord = buildAuthorizationProvenance({
    project_id: projectA,
    identity: identity(),
    decision: missing,
    operation: "graph.read",
  });
  assert.equal(missingRecord.role, "none");
  assert.equal(missingRecord.membership_revision, 0);
  assert.equal(missingRecord.authorization_code, "MEMBERSHIP_NOT_FOUND");
});

test("provenance rejects mismatched contexts, credentials, raw payloads, and malformed operations", async () => {
  const authorizer = authorizerFor(membership("viewer"));
  const decision = await authorizer.authorizeProjectOperation(authorizationInput("project.read"));
  const base = { project_id: projectA, identity: identity(), decision, operation: "graph.read" };
  for (const extra of [
    { credentials: "do-not-log" },
    { secret: "do-not-log" },
    { raw_payload: { arbitrary: true } },
  ]) {
    assert.throws(() => buildAuthorizationProvenance({ ...base, ...extra }), /unknown field/i);
  }
  assert.throws(
    () => buildAuthorizationProvenance({ ...base, project_id: projectB }),
    (error) => error.code === "PROVENANCE_CONTEXT_MISMATCH",
  );
  assert.throws(
    () => buildAuthorizationProvenance({
      ...base,
      identity: identity({ worktree_id: "worktree-forged-02", branch: "codex/forged-branch" }),
    }),
    (error) => error.code === "PROVENANCE_CONTEXT_MISMATCH",
  );
  assert.throws(
    () => buildAuthorizationProvenance({ ...base, operation: "DROP DATABASE; RETURN secret" }),
    /operation is malformed/i,
  );
  assert.throws(
    () => buildAuthorizationProvenance({
      ...base,
      decision: Object.freeze({
        ...decision,
        role: "viewer",
        capability: "schema.admin",
        tool_class: "schema-admin",
        confirmation_required: true,
        required_confirmation: "CONFIRM_SCHEMA_ADMIN",
      }),
    }),
    /authorization decision is malformed/i,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { createToolApplication } from "../src/application.mjs";
import { createRedactedAuditSink } from "../src/audit.mjs";
import { createIdempotencyLedger } from "../src/idempotency.mjs";
import { createLayeredRateLimiter } from "../src/rate-limit.mjs";
import { createMemorySessionRegistry, createServerControlPlane } from "../src/server-control.mjs";
import { createInjectedTokenContextVerifier } from "../src/token-context.mjs";

const PROJECT_A1 = "prj_AAAAAAAAAAAAAAAA";
const PROJECT_A2 = "prj_AAAAAAAAAAAAAAAB";
const PROJECT_B1 = "prj_BBBBBBBBBBBBBBBB";
const RESOURCE = "http://127.0.0.1:18080/mcp";
const ISSUER = "https://idp.example.test/";

function registry(serverId) {
  const trusted = new Set();
  const projects = new Map();
  return {
    trusted,
    projects,
    failRevoke: false,
    async grantPrincipal(cn) { trusted.add(cn); return { status: "VERIFIED" }; },
    async rotatePrincipal(previous, next) { trusted.add(next); trusted.delete(previous); return { status: "VERIFIED" }; },
    async revokePrincipal(cn) {
      trusted.delete(cn);
      if (this.failRevoke) return { status: "BLOCKED", code: "REVOKE_QUARANTINED" };
      return { status: "VERIFIED" };
    },
    provision(projectScope) { projects.set(projectScope, new Set(trusted)); },
    id: serverId,
  };
}

function token(subject, session, epoch, scopes) {
  return {
    verified: true,
    issuer: ISSUER,
    subject,
    audiences: [RESOURCE],
    scopes,
    session_id: session,
    issued_at: 1000,
    not_before: 1000,
    expires_at: 2000,
    token_epoch: epoch,
  };
}

async function fixture({ rateLimit = 100, sessionRegistry = createMemorySessionRegistry({ now: () => 1_500_000 }), auditSink } = {}) {
  const registryA = registry("server-a");
  const registryB = registry("server-b");
  const tokens = new Map();
  const verify = createInjectedTokenContextVerifier({
    resourceUrl: RESOURCE,
    trustedIssuers: [ISSUER],
    supportedScopes: ["nacl.server.read", "nacl.server.write", "nacl.server.schema", "nacl.server.backup", "nacl.server.restore"],
    resolveVerifiedToken: async (raw) => tokens.get(raw),
    now: () => 1500,
    clockSkewSeconds: 0,
  });
  const control = createServerControlPlane({
    routes: [
      { project_ref: PROJECT_A1, server_id: "server-a", project_scope: "scope-a1", label: "Alpha", enabled: true },
      { project_ref: PROJECT_A2, server_id: "server-a", project_scope: "scope-a2", label: "Beta", enabled: true },
      { project_ref: PROJECT_B1, server_id: "server-b", project_scope: "scope-b1", label: "Gamma", enabled: true },
    ],
    serverRegistries: new Map([["server-a", registryA], ["server-b", registryB]]),
    sessionRegistry,
  });
  control.registerSubject({ subject: "subject-alice", principalId: "principal-alice", certificateCn: "cn-alice-v1" });
  control.registerSubject({ subject: "subject-bob", principalId: "principal-bob", certificateCn: "cn-bob-v1" });
  await control.grantServer({ subject: "subject-alice", serverId: "server-a" });
  await control.grantServer({ subject: "subject-bob", serverId: "server-b" });
  registryA.provision("scope-a1");
  registryA.provision("scope-a2");
  registryB.provision("scope-b1");
  const allScopes = ["nacl.server.read", "nacl.server.write", "nacl.server.schema", "nacl.server.backup", "nacl.server.restore"];
  tokens.set("token-alice-session-one", token("subject-alice", "session-alice-1", control.currentTokenEpoch("subject-alice"), allScopes));
  tokens.set("token-bob-session-one00", token("subject-bob", "session-bob-0001", control.currentTokenEpoch("subject-bob"), allScopes));
  const audit = auditSink ?? createRedactedAuditSink({ secret: "a".repeat(64), now: () => 1_500_000 });
  const calls = [];
  const graph = {
    calls,
    async projectSummary({ route }) { calls.push(["summary", route]); return { summary: "project summary", revision: 7, internal_host: "secret" }; },
    async namedRead({ route, input }) { calls.push([input.query, route]); return { items: [input.query], revision: 7 }; },
    async mutateProject({ route, input }) { calls.push(["mutate", route, input.resource_ref]); return { summary: "updated", revision: 8 }; },
    async applySchema({ route }) { calls.push(["schema", route]); return { summary: "migrated", revision: 9 }; },
    async createBackup({ route }) { calls.push(["backup", route]); return { job_ref: "job_AAAAAAAAAAAAAAAA" }; },
    async requestRestore({ route }) { calls.push(["restore", route]); return { job_ref: "job_BBBBBBBBBBBBBBBB" }; },
  };
  const app = createToolApplication({
    controlPlane: control,
    graphAdapter: graph,
    auditSink: audit,
    rateLimiter: createLayeredRateLimiter({ now: () => 1_500_000, limit: rateLimit }),
    idempotencyLedger: createIdempotencyLedger(),
    now: () => 1_500_000,
  });
  async function context(raw) {
    return { ...(await verify(`Bearer ${raw}`)), sourceAddress: "127.0.0.1" };
  }
  return { registryA, registryB, tokens, verify, control, audit, graph, app, context, allScopes };
}

test("verified OAuth context maps one principal to both projects on server A and denies server B without a graph call", async () => {
  const ctx = await fixture();
  const auth = await ctx.context("token-alice-session-one");
  for (const project_ref of [PROJECT_A1, PROJECT_A2]) {
    const result = await ctx.app({ name: "nacl_project_summary", arguments: { project_ref }, authContext: auth, requiredScope: "nacl.server.read" });
    assert.equal(result.status, "VERIFIED");
    assert.deepEqual(result.data, { summary: "project summary", revision: 7 });
  }
  const before = ctx.graph.calls.length;
  await assert.rejects(
    ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_B1 }, authContext: auth, requiredScope: "nacl.server.read" }),
    (error) => error.code === "ACCESS_OR_RESOURCE_NOT_FOUND" && !/server-b|scope-b1|principal/.test(error.message),
  );
  assert.equal(ctx.graph.calls.length, before);
});

test("project discovery returns only opaque refs and labels from authorized servers, supports two grants, and hides revoked server routes", async () => {
  const ctx = await fixture();
  const initial = await ctx.context("token-alice-session-one");
  const beforeCalls = ctx.graph.calls.length;
  const listed = await ctx.app({ name: "nacl_projects_list", arguments: {}, authContext: initial, requiredScope: "nacl.server.read" });
  assert.deepEqual(listed.data.projects, [
    { project_ref: PROJECT_A1, label: "Alpha" },
    { project_ref: PROJECT_A2, label: "Beta" },
  ]);
  assert.equal(ctx.graph.calls.length, beforeCalls);
  assert.doesNotMatch(JSON.stringify(listed), /server-a|server-b|scope-a|scope-b/);

  await ctx.control.grantServer({ subject: "subject-alice", serverId: "server-b" });
  ctx.tokens.set("token-alice-two-servers", token("subject-alice", "session-alice-both", ctx.control.currentTokenEpoch("subject-alice"), ctx.allScopes));
  const both = await ctx.context("token-alice-two-servers");
  const across = await ctx.app({ name: "nacl_projects_list", arguments: {}, authContext: both, requiredScope: "nacl.server.read" });
  assert.deepEqual(across.data.projects.map((project) => project.label), ["Alpha", "Beta", "Gamma"]);

  await ctx.control.revokeServer({ subject: "subject-alice", serverId: "server-b" });
  await assert.rejects(ctx.app({ name: "nacl_projects_list", arguments: {}, authContext: both, requiredScope: "nacl.server.read" }), (error) => error.code === "REAUTHORIZATION_REQUIRED");
  ctx.tokens.set("token-alice-after-revoke", token("subject-alice", "session-alice-after", ctx.control.currentTokenEpoch("subject-alice"), ctx.allScopes));
  const after = await ctx.context("token-alice-after-revoke");
  const filtered = await ctx.app({ name: "nacl_projects_list", arguments: {}, authContext: after, requiredScope: "nacl.server.read" });
  assert.deepEqual(filtered.data.projects.map((project) => project.label), ["Alpha", "Beta"]);
});

test("two principals stay on their granted servers and token claims cannot assert a principal", async () => {
  const ctx = await fixture();
  const alice = await ctx.context("token-alice-session-one");
  const bob = await ctx.context("token-bob-session-one00");
  assert.equal((await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: alice, requiredScope: "nacl.server.read" })).status, "VERIFIED");
  assert.equal((await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_B1 }, authContext: bob, requiredScope: "nacl.server.read" })).status, "VERIFIED");
  await assert.rejects(ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: bob, requiredScope: "nacl.server.read" }), /Access or project route/);
  assert.equal("principalId" in alice, false);
  assert.equal("certificateCn" in alice, false);
});

test("scope, exact confirmation mapping, idempotency replay, and payload mismatch are enforced", async () => {
  const ctx = await fixture();
  ctx.tokens.set("token-read-only-0000", token("subject-alice", "session-alice-read", ctx.control.currentTokenEpoch("subject-alice"), ["nacl.server.read"]));
  const readOnly = await ctx.context("token-read-only-0000");
  await assert.rejects(ctx.app({
    name: "nacl_project_mutate",
    arguments: { project_ref: PROJECT_A1, resource_type: "Task", resource_ref: "TASK-1", status: "active", idempotency_key: "idem-mutation-0001", confirmation: "APPLY_PROJECT_MUTATION" },
    authContext: readOnly,
    requiredScope: "nacl.server.write",
  }), (error) => error.code === "REAUTHORIZATION_REQUIRED");

  const auth = await ctx.context("token-alice-session-one");
  const args = { project_ref: PROJECT_A1, resource_type: "Task", resource_ref: "TASK-1", status: "active", idempotency_key: "idem-mutation-0001", confirmation: "APPLY_PROJECT_MUTATION" };
  const first = await ctx.app({ name: "nacl_project_mutate", arguments: args, authContext: auth, requiredScope: "nacl.server.write" });
  const second = await ctx.app({ name: "nacl_project_mutate", arguments: args, authContext: auth, requiredScope: "nacl.server.write" });
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(ctx.graph.calls.filter(([name]) => name === "mutate").length, 1);
  await assert.rejects(ctx.app({ name: "nacl_project_mutate", arguments: { ...args, status: "verified" }, authContext: auth, requiredScope: "nacl.server.write" }), (error) => error.code === "IDEMPOTENCY_CONFLICT");
});

test("all seven public handlers reach only their mapped capability adapters with bounded results", async () => {
  const ctx = await fixture();
  const auth = await ctx.context("token-alice-session-one");
  const cases = [
    ["nacl_projects_list", "nacl.server.read", {}, null],
    ["nacl_project_summary", "nacl.server.read", { project_ref: PROJECT_A1 }, "summary"],
    ["nacl_named_read", "nacl.server.read", { project_ref: PROJECT_A1, query: "schema-status" }, "schema-status"],
    ["nacl_project_mutate", "nacl.server.write", { project_ref: PROJECT_A1, resource_type: "Task", resource_ref: "TASK-2", status: "verified", idempotency_key: "idempotency-mutate-0002", confirmation: "APPLY_PROJECT_MUTATION" }, "mutate"],
    ["nacl_schema_apply", "nacl.server.schema", { project_ref: PROJECT_A1, migration_set: "gateway-foundation-v1", idempotency_key: "idempotency-schema-0001", confirmation: "APPLY_REVIEWED_MIGRATIONS" }, "schema"],
    ["nacl_backup_create", "nacl.server.backup", { project_ref: PROJECT_A1, idempotency_key: "idempotency-backup-0001", confirmation: "CREATE_PROJECT_BACKUP" }, "backup"],
    ["nacl_restore_request", "nacl.server.restore", { project_ref: PROJECT_A1, backup_ref: "backup_AAAAAAAAAAAAA", idempotency_key: "idempotency-restore-0001", confirmation: "RESTORE_TO_ISOLATED_TARGET" }, "restore"],
  ];
  for (const [name, scope, args, expectedCall] of cases) {
    const before = ctx.graph.calls.length;
    const result = await ctx.app({ name, arguments: args, authContext: auth, requiredScope: scope });
    assert.equal(result.status, "VERIFIED", name);
    if (expectedCall === null) assert.equal(ctx.graph.calls.length, before, name);
    else assert.equal(ctx.graph.calls.at(-1)[0], expectedCall, name);
    assert.doesNotMatch(JSON.stringify(result), /server-a|scope-a1|cn-alice|internal_host/, name);
  }
});

test("in-flight idempotency is atomic, conflicts immediately, and failed operations can be retried", async () => {
  const ledger = createIdempotencyLedger();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const operation = async () => { calls += 1; await gate; return { revision: 1 }; };
  const input = { principalId: "principal-alice", tool: "nacl_project_mutate", key: "idempotency-concurrent-1", payload: { value: 1 }, operation };
  const first = ledger.execute(input);
  const replay = ledger.execute(input);
  await assert.rejects(
    ledger.execute({ ...input, payload: { value: 2 } }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  );
  release();
  const [firstResult, replayResult] = await Promise.all([first, replay]);
  assert.equal(calls, 1);
  assert.equal(firstResult.replayed, false);
  assert.equal(replayResult.replayed, true);

  let attempts = 0;
  const retryInput = {
    principalId: "principal-alice",
    tool: "nacl_schema_apply",
    key: "idempotency-retry-0001",
    payload: { value: 3 },
    async operation() {
      attempts += 1;
      if (attempts === 1) throw new Error("transient");
      return { revision: 2 };
    },
  };
  await assert.rejects(ledger.execute(retryInput), /transient/);
  const retried = await ledger.execute(retryInput);
  assert.equal(attempts, 2);
  assert.equal(retried.replayed, false);
});

test("principal rotation and full-server revoke invalidate stale sessions; partial revoke is still fail-closed", async () => {
  const ctx = await fixture();
  const stale = await ctx.context("token-alice-session-one");
  assert.equal((await ctx.control.rotatePrincipal({ subject: "subject-alice", nextCertificateCn: "cn-alice-v2" })).status, "VERIFIED");
  await assert.rejects(ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: stale, requiredScope: "nacl.server.read" }), (error) => error.code === "REAUTHORIZATION_REQUIRED");
  const rotatedEpoch = ctx.control.currentTokenEpoch("subject-alice");
  ctx.tokens.set("token-alice-rotated000", token("subject-alice", "session-alice-2", rotatedEpoch, ctx.allScopes));
  const rotated = await ctx.context("token-alice-rotated000");
  assert.equal((await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A2 }, authContext: rotated, requiredScope: "nacl.server.read" })).status, "VERIFIED");

  ctx.registryA.failRevoke = true;
  const revoked = await ctx.control.revokeServer({ subject: "subject-alice", serverId: "server-a" });
  assert.deepEqual(revoked.status, "BLOCKED");
  assert.equal(ctx.registryA.trusted.has("cn-alice-v2"), false);
  await assert.rejects(ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: rotated, requiredScope: "nacl.server.read" }), (error) => error.code === "REAUTHORIZATION_REQUIRED");
});

test("individual OAuth session revocation is immediate and does not affect another fresh session for the same principal", async () => {
  const ctx = await fixture();
  const revoked = await ctx.context("token-alice-session-one");
  assert.equal((await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: revoked, requiredScope: "nacl.server.read" })).status, "VERIFIED");
  await ctx.control.revokeSession({ subject: "subject-alice", sessionId: "session-alice-1" });
  await assert.rejects(ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: revoked, requiredScope: "nacl.server.read" }), (error) => error.code === "REAUTHORIZATION_REQUIRED");
  ctx.tokens.set("token-alice-session-two", token("subject-alice", "session-alice-2", ctx.control.currentTokenEpoch("subject-alice"), ctx.allScopes));
  const fresh = await ctx.context("token-alice-session-two");
  assert.equal((await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A2 }, authContext: fresh, requiredScope: "nacl.server.read" })).status, "VERIFIED");
});

test("preemptive session revoke persists as a tombstone across a reconstructed control plane", async () => {
  const sessionRegistry = createMemorySessionRegistry({ now: () => 1_500_000 });
  const first = await fixture({ sessionRegistry });
  await first.control.revokeSession({ subject: "subject-alice", sessionId: "session-alice-1" });
  const firstToken = await first.context("token-alice-session-one");
  await assert.rejects(
    first.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: firstToken, requiredScope: "nacl.server.read" }),
    (error) => error.code === "REAUTHORIZATION_REQUIRED" && error.scope === "nacl.server.read",
  );

  const restarted = await fixture({ sessionRegistry });
  const restartedToken = await restarted.context("token-alice-session-one");
  await assert.rejects(
    restarted.app({ name: "nacl_restore_request", arguments: { project_ref: PROJECT_A1 }, authContext: restartedToken, requiredScope: "nacl.server.restore" }),
    (error) => error.code === "REAUTHORIZATION_REQUIRED" && error.scope === "nacl.server.restore",
  );
});

test("new same-server project inherits the authoritative principal set in the disposable gateway fixture", async () => {
  const ctx = await fixture();
  ctx.registryA.provision("scope-a3");
  assert.deepEqual([...ctx.registryA.projects.get("scope-a3")], ["cn-alice-v1"]);
  assert.equal(ctx.registryA.projects.get("scope-a3").has("cn-bob-v1"), false);
});

test("one certificate CN cannot alias two OAuth subjects or be rotated onto another principal", async () => {
  const ctx = await fixture();
  assert.throws(
    () => ctx.control.registerSubject({ subject: "subject-charlie", principalId: "principal-charlie", certificateCn: "cn-alice-v1" }),
    /certificate.*already exists/,
  );
  await assert.rejects(
    ctx.control.rotatePrincipal({ subject: "subject-bob", nextCertificateCn: "cn-alice-v1" }),
    /already bound/,
  );
});

test("audit and responses are minimized and contain no raw subject, principal, certificate, server, scope, token, host, or graph result extras", async () => {
  const ctx = await fixture();
  const auth = await ctx.context("token-alice-session-one");
  const result = await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: auth, requiredScope: "nacl.server.read" });
  const publicText = JSON.stringify(result);
  assert.doesNotMatch(publicText, /subject-alice|principal-alice|cn-alice|server-a|scope-a1|internal_host|127\.0\.0\.1|token/);
  const auditText = JSON.stringify(ctx.audit.events());
  assert.doesNotMatch(auditText, /subject-alice|principal-alice|cn-alice|server-a|scope-a1|token-alice|project summary/);
  assert.match(auditText, /actor_ref/);
});

test("state-changing operations persist a write-ahead audit reservation before graph mutation", async () => {
  let records = 0;
  const unavailableAudit = {
    newSupportRef() { return "support_0123456789abcdef0123456789abcdef"; },
    async record() { records += 1; throw new Error("audit unavailable"); },
  };
  const ctx = await fixture({ auditSink: unavailableAudit });
  const auth = await ctx.context("token-alice-session-one");
  await assert.rejects(ctx.app({
    name: "nacl_project_mutate",
    arguments: {
      project_ref: PROJECT_A1,
      resource_type: "Task",
      resource_ref: "TASK-9",
      status: "verified",
      idempotency_key: "idempotency-audit-0001",
      confirmation: "APPLY_PROJECT_MUTATION",
    },
    authContext: auth,
    requiredScope: "nacl.server.write",
  }), /audit unavailable/);
  assert.equal(records >= 1, true);
  assert.equal(ctx.graph.calls.length, 0);
});

test("unknown adapter failures retain the same public and audit support reference", async () => {
  const ctx = await fixture();
  ctx.graph.projectSummary = async () => { throw new Error("private adapter detail"); };
  const auth = await ctx.context("token-alice-session-one");
  let failure;
  try {
    await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: auth, requiredScope: "nacl.server.read" });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, "INTERNAL_ERROR");
  assert.doesNotMatch(failure.message, /private adapter detail/);
  assert.equal(ctx.audit.events().at(-1).support_ref, failure.supportRef);
});

test("layered rate limits fail before another graph operation", async () => {
  const ctx = await fixture({ rateLimit: 2 });
  const auth = await ctx.context("token-alice-session-one");
  await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: auth, requiredScope: "nacl.server.read" });
  await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: auth, requiredScope: "nacl.server.read" });
  const before = ctx.graph.calls.length;
  await assert.rejects(ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: auth, requiredScope: "nacl.server.read" }), (error) => error.code === "RATE_LIMITED");
  assert.equal(ctx.graph.calls.length, before);
});

test("in-memory test helpers prune expired windows and fail closed at bounded capacity", async () => {
  let current = 0;
  const limiter = createLayeredRateLimiter({ now: () => current, windowMs: 1000, limit: 10, maxKeys: 2 });
  limiter.assert(["one", "two"]);
  assert.throws(() => limiter.assert(["three"]), (error) => error.code === "RATE_LIMITED");
  current = 1000;
  limiter.assert(["three"]);

  const ledger = createIdempotencyLedger({ now: () => current, ttlMs: 60_000, maxRecords: 1 });
  const operation = async () => ({ revision: 1 });
  await ledger.execute({ principalId: "principal-a", tool: "write", key: "idempotency-bounded-1", payload: { value: 1 }, operation });
  await assert.rejects(
    ledger.execute({ principalId: "principal-a", tool: "write", key: "idempotency-bounded-2", payload: { value: 2 }, operation }),
    (error) => error.code === "RATE_LIMITED",
  );
  current += 60_001;
  await ledger.execute({ principalId: "principal-a", tool: "write", key: "idempotency-bounded-2", payload: { value: 2 }, operation });
});

test("token verifier rejects wrong issuer, audience, expiry, not-before, unverified context, and whitespace tokens", async () => {
  const ctx = await fixture();
  const base = token("subject-alice", "session-negative-1", ctx.control.currentTokenEpoch("subject-alice"), ["nacl.server.read"]);
  const cases = {
    wrongIssuer: { ...base, issuer: "https://other.example.test/" },
    wrongAudience: { ...base, audiences: ["https://other.example.test/mcp"] },
    expired: { ...base, expires_at: 1499 },
    future: { ...base, not_before: 1501 },
    unverified: { ...base, verified: false },
    missingNotBefore: Object.fromEntries(Object.entries(base).filter(([key]) => key !== "not_before")),
  };
  for (const [name, claims] of Object.entries(cases)) {
    const raw = `negative-token-${name}`;
    ctx.tokens.set(raw, claims);
    await assert.rejects(ctx.verify(`Bearer ${raw}`), (error) => error.code === "INVALID_TOKEN", name);
  }
  await assert.rejects(ctx.verify("Bearer invalid token whitespace"), (error) => error.code === "INVALID_TOKEN");
  assert.throws(() => createInjectedTokenContextVerifier({
    resourceUrl: RESOURCE,
    trustedIssuers: ["http://idp.example.test/"],
    supportedScopes: ["nacl.server.read"],
    resolveVerifiedToken: async () => base,
  }), /issuer must use HTTPS/);
});

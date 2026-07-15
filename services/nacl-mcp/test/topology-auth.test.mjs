import assert from "node:assert/strict";
import test from "node:test";
import { createToolApplication } from "../src/application.mjs";
import { createRedactedAuditSink } from "../src/audit.mjs";
import { createIdempotencyLedger } from "../src/idempotency.mjs";
import { createLayeredRateLimiter } from "../src/rate-limit.mjs";
import { createServerControlPlane } from "../src/server-control.mjs";
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

async function fixture({ rateLimit = 100 } = {}) {
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
      { project_ref: PROJECT_A1, server_id: "server-a", project_scope: "scope-a1", enabled: true },
      { project_ref: PROJECT_A2, server_id: "server-a", project_scope: "scope-a2", enabled: true },
      { project_ref: PROJECT_B1, server_id: "server-b", project_scope: "scope-b1", enabled: true },
    ],
    serverRegistries: new Map([["server-a", registryA], ["server-b", registryB]]),
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
  const audit = createRedactedAuditSink({ secret: "a".repeat(64), now: () => 1_500_000 });
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
  ctx.control.revokeSession({ subject: "subject-alice", sessionId: "session-alice-1" });
  await assert.rejects(ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: revoked, requiredScope: "nacl.server.read" }), (error) => error.code === "REAUTHORIZATION_REQUIRED");
  ctx.tokens.set("token-alice-session-two", token("subject-alice", "session-alice-2", ctx.control.currentTokenEpoch("subject-alice"), ctx.allScopes));
  const fresh = await ctx.context("token-alice-session-two");
  assert.equal((await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A2 }, authContext: fresh, requiredScope: "nacl.server.read" })).status, "VERIFIED");
});

test("new same-server project inherits the authoritative principal set in the disposable gateway fixture", async () => {
  const ctx = await fixture();
  ctx.registryA.provision("scope-a3");
  assert.deepEqual([...ctx.registryA.projects.get("scope-a3")], ["cn-alice-v1"]);
  assert.equal(ctx.registryA.projects.get("scope-a3").has("cn-bob-v1"), false);
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

test("layered rate limits fail before another graph operation", async () => {
  const ctx = await fixture({ rateLimit: 2 });
  const auth = await ctx.context("token-alice-session-one");
  await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: auth, requiredScope: "nacl.server.read" });
  await ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: auth, requiredScope: "nacl.server.read" });
  const before = ctx.graph.calls.length;
  await assert.rejects(ctx.app({ name: "nacl_project_summary", arguments: { project_ref: PROJECT_A1 }, authContext: auth, requiredScope: "nacl.server.read" }), (error) => error.code === "RATE_LIMITED");
  assert.equal(ctx.graph.calls.length, before);
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
  };
  for (const [name, claims] of Object.entries(cases)) {
    const raw = `negative-token-${name}`;
    ctx.tokens.set(raw, claims);
    await assert.rejects(ctx.verify(`Bearer ${raw}`), (error) => error.code === "INVALID_TOKEN", name);
  }
  await assert.rejects(ctx.verify("Bearer invalid token whitespace"), (error) => error.code === "INVALID_TOKEN");
});

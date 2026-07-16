import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRedactedAuditSink } from "../src/audit.mjs";
import { createIdempotencyLedger } from "../src/idempotency.mjs";
import { createLayeredRateLimiter } from "../src/rate-limit.mjs";
import { createMemoryAuthorizationStateRegistry, createMemorySessionRegistry, createServerControlPlane } from "../src/server-control.mjs";
import { createNaclMcpService } from "../src/service.mjs";
import { STABLE_PROTOCOL_VERSION } from "../src/http-server.mjs";
import { prepareExactNeo4jImage } from "../../../tests/codex-plugin/scripts/neo4j-image-fixture.mjs";

const enabled = process.env.NACL_RUN_DOCKER_SMOKE === "1";
const image = "neo4j:5.24.2-community";
const imageId = "sha256:2e7e4eea5bc1eec581a3097c018dfeb3747f3638e67a963c10554825c31c1425";
const issuer = "https://identity.example.test/";
const scopes = ["nacl.server.read", "nacl.server.write", "nacl.server.schema", "nacl.server.backup", "nacl.server.restore"];
const projects = {
  a1: { ref: "prj_DOCKERAAAAAAAAAAA1", scope: "scope-docker-a1", label: "Docker Alpha" },
  a2: { ref: "prj_DOCKERAAAAAAAAAAA2", scope: "scope-docker-a2", label: "Docker Beta" },
  b1: { ref: "prj_DOCKERBBBBBBBBBBB1", scope: "scope-docker-b1", label: "Docker Gamma" },
};

function docker(args) {
  return spawnSync("docker", args, { encoding: "utf8", timeout: 120_000 });
}

function durable(value, field, marker) {
  return Object.freeze({ ...value, [field]: marker });
}

async function reservePort() {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  reservation.close();
  await once(reservation, "close");
  return port;
}

async function transaction(httpUrl, password, statement, parameters = {}) {
  const response = await fetch(`${httpUrl}/db/neo4j/tx/commit`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`neo4j:${password}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ statements: [{ statement, parameters }] }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) throw new Error("disposable Neo4j transaction failed");
  return payload.results[0]?.data?.[0]?.row;
}

async function waitForGraph(httpUrl, password) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      await transaction(httpUrl, password, "RETURN 1");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("disposable Neo4j container did not become ready");
}

function registry() {
  const trusted = new Set();
  return {
    trusted,
    async grantPrincipal(cn) { trusted.add(cn); return { status: "VERIFIED" }; },
    async rotatePrincipal(previous, next) { trusted.delete(previous); trusted.add(next); return { status: "VERIFIED" }; },
    async revokePrincipal(cn) { trusted.delete(cn); return { status: "VERIFIED" }; },
    async verifyPrincipal(cn) { return { status: trusted.has(cn) ? "VERIFIED" : "BLOCKED" }; },
  };
}

function links() {
  const pending = new Map();
  let sequence = 0;
  return {
    issue(expected) {
      sequence += 1;
      const receipt = `link_docker_${String(sequence).padStart(16, "0")}`;
      pending.set(receipt, expected);
      return receipt;
    },
    verifier: {
      async verifyAndConsume({ receipt, ...expected }) {
        const stored = pending.get(receipt);
        pending.delete(receipt);
        if (!stored || ["issuer", "subject", "principalId", "certificateCn"].some((key) => stored[key] !== expected[key])) return { verified: false };
        return {
          verified: true, issuer: stored.issuer, subject: stored.subject,
          principal_id: stored.principalId, certificate_cn: stored.certificateCn,
          receipt_id: `proof_docker_${String(sequence).padStart(16, "0")}`,
          revision: 1, expires_at: Date.now() + 60_000,
        };
      },
    },
  };
}

function token({ subject, session, epoch, audience }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    verified: true,
    issuer: "https://identity.example.test/",
    subject,
    audiences: [audience],
    scopes,
    session_id: session,
    issued_at: now - 5,
    not_before: now - 5,
    expires_at: now + 3600,
    token_epoch: epoch,
  };
}

test(
  "public OAuth boundary reaches two isolated project containers on server A, denies server B, and survives rotation/revoke",
  { skip: !enabled, timeout: 300_000 },
  async () => {
    assert.equal(docker(["version", "--format", "{{.Server.Version}}" ]).status, 0, "Docker daemon is required");
    const fixtureImage = prepareExactNeo4jImage({ docker, exactImage: image, expectedVersion: "5.24.2" });
    assert.equal(fixtureImage.identity.id, imageId, "the cached Neo4j fixture must match the recorded immutable image ID");

    const root = await mkdtemp(path.join(os.tmpdir(), "nacl-public-mcp-docker-"));
    const unique = `${Date.now()}-${process.pid}`;
    const password = `Nacl-Wave9-${unique}`;
    const envFile = path.join(root, "neo4j.env");
    await writeFile(envFile, `NEO4J_AUTH=neo4j/${password}\nNEO4J_PLUGINS=[]\n`, { mode: 0o600 });
    await chmod(envFile, 0o600);
    const resources = [];
    let server;
    try {
      for (const [key, project] of Object.entries(projects)) {
        const serverId = key.startsWith("a") ? "server-a" : "server-b";
        const name = `nacl-w9-${key}-${unique}`.toLowerCase();
        const volume = `${name}-data`;
        assert.equal(docker(["volume", "create", "--label", `nacl.test.run=${unique}`, "--label", `nacl.test.project=${key}`, volume]).status, 0);
        const resource = { key, project, serverId, name, volume, containerCreated: false };
        resources.push(resource);
        const started = docker([
          "run", "--detach", "--name", name,
          "--label", `nacl.test.run=${unique}`,
          "--label", `nacl.test.server=${serverId}`,
          "--label", `nacl.test.project=${key}`,
          "--env-file", envFile,
          "--mount", `type=volume,src=${volume},dst=/data`,
          "--publish", "127.0.0.1::7474",
          image,
        ]);
        assert.equal(started.status, 0, "disposable Neo4j container failed to start");
        resource.containerCreated = true;
        const portResult = docker(["port", name, "7474/tcp"]);
        assert.equal(portResult.status, 0);
        const port = Number.parseInt(portResult.stdout.trim().split(":").at(-1), 10);
        assert.ok(Number.isSafeInteger(port) && port > 0);
        const httpUrl = `http://127.0.0.1:${port}`;
        Object.assign(resource, { port, httpUrl });
        await waitForGraph(httpUrl, password);
        await transaction(httpUrl, password, "CREATE (:Marker {value: $value})", { value: `marker-${key}` });
      }
      assert.equal(new Set(resources.map((item) => item.name)).size, 3);
      assert.equal(new Set(resources.map((item) => item.volume)).size, 3);
      assert.equal(new Set(resources.map((item) => item.port)).size, 3);

      const registryA = registry();
      const registryB = registry();
      const linkProofs = links();
      const sessions = durable(createMemorySessionRegistry(), "durability", "durable");
      const durableAuthorization = durable(durable(createMemoryAuthorizationStateRegistry(), "durability", "durable"), "scope", "shared");
      const control = createServerControlPlane({
        routes: resources.map((item) => ({
          project_ref: item.project.ref,
          server_id: item.serverId,
          project_scope: item.project.scope,
          label: item.project.label,
          enabled: true,
        })),
        serverRegistries: new Map([["server-a", registryA], ["server-b", registryB]]),
        sessionRegistry: sessions,
        authorizationStateRegistry: durableAuthorization,
        principalLinkVerifier: linkProofs.verifier,
      });
      const aliceLink = { issuer, subject: "subject-alice", principalId: "principal-alice", certificateCn: "cn-alice-v1" };
      const bobLink = { issuer, subject: "subject-bob", principalId: "principal-bob", certificateCn: "cn-bob-v1" };
      await control.registerSubject({ ...aliceLink, linkReceipt: linkProofs.issue(aliceLink) });
      await control.registerSubject({ ...bobLink, linkReceipt: linkProofs.issue(bobLink) });
      await control.grantServer({ issuer, subject: "subject-alice", serverId: "server-a" });
      await control.grantServer({ issuer, subject: "subject-bob", serverId: "server-b" });

      const servicePort = await reservePort();
      const base = `http://127.0.0.1:${servicePort}`;
      const tokens = new Map();
      tokens.set("docker-token-alice-0001", token({ subject: "subject-alice", session: "session-alice-docker-1", epoch: await control.currentTokenEpoch(issuer, "subject-alice"), audience: `${base}/mcp` }));
      tokens.set("docker-token-bob-000001", token({ subject: "subject-bob", session: "session-bob-docker-0001", epoch: await control.currentTokenEpoch(issuer, "subject-bob"), audience: `${base}/mcp` }));
      let graphCalls = 0;
      const endpointByScope = new Map(resources.map((item) => [item.project.scope, item.httpUrl]));
      const graphAdapter = {
        async projectSummary({ route }) {
          graphCalls += 1;
          const row = await transaction(endpointByScope.get(route.projectScope), password, "MATCH (marker:Marker) RETURN marker.value");
          return { summary: row[0], revision: 1 };
        },
        async namedRead() { throw new Error("not used"); },
        async mutateProject() { throw new Error("not used"); },
        async applySchema() { throw new Error("not used"); },
        async createBackup() { throw new Error("not used"); },
        async requestRestore() { throw new Error("not used"); },
      };
      const memoryAudit = createRedactedAuditSink({ secret: "d".repeat(64) });
      const auditSink = durable(memoryAudit, "durability", "durable");
      const rateLimiter = durable(createLayeredRateLimiter(), "scope", "shared");
      const idempotencyLedger = durable(createIdempotencyLedger(), "durability", "durable");
      server = createNaclMcpService({
        configuration: {
          resourceUrl: `${base}/mcp`,
          resourceMetadataUrl: `${base}/.well-known/oauth-protected-resource`,
          authorizationServers: ["https://identity.example.test/"],
          scopesSupported: scopes,
          trustedIssuers: ["https://identity.example.test/"],
          allowedOrigins: ["https://chatgpt.com"],
          serverVersion: "0.1.0-test",
        },
        adapters: {
          async resolveVerifiedToken(raw) { return tokens.get(raw); },
          controlPlane: control,
          graphAdapter,
          auditSink,
          rateLimiter,
          idempotencyLedger,
        },
      });
      server.listen(servicePort, "127.0.0.1");
      await once(server, "listening");

      const call = async (rawToken, name, args) => {
        const response = await fetch(`${base}/mcp`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${rawToken}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": STABLE_PROTOCOL_VERSION,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: `${name}-${Date.now()}`, method: "tools/call", params: { name, arguments: args } }),
        });
        assert.equal(response.status, 200);
        return response.json();
      };

      for (const [project, marker] of [[projects.a1, "marker-a1"], [projects.a2, "marker-a2"]]) {
        const body = await call("docker-token-alice-0001", "nacl_project_summary", { project_ref: project.ref });
        assert.equal(body.result.structuredContent.data.summary, marker);
      }
      const listed = await call("docker-token-alice-0001", "nacl_projects_list", {});
      assert.deepEqual(listed.result.structuredContent.data.projects.map((item) => item.label), ["Docker Alpha", "Docker Beta"]);

      const beforeDenial = graphCalls;
      const crossServer = await call("docker-token-alice-0001", "nacl_project_summary", { project_ref: projects.b1.ref });
      assert.equal(crossServer.result.isError, true);
      assert.equal(crossServer.result.structuredContent.code, "ACCESS_OR_RESOURCE_NOT_FOUND");
      assert.doesNotMatch(JSON.stringify(crossServer), /server-b|scope-docker-b1|marker-b1/);
      assert.equal(graphCalls, beforeDenial);
      const forged = await call("docker-token-alice-0001", "nacl_project_summary", { project_ref: projects.a1.ref, server_id: "server-b" });
      assert.equal(forged.error.code, -32602);
      assert.equal(graphCalls, beforeDenial);
      const bob = await call("docker-token-bob-000001", "nacl_project_summary", { project_ref: projects.b1.ref });
      assert.equal(bob.result.structuredContent.data.summary, "marker-b1");

      const stale = "docker-token-alice-0001";
      assert.equal((await control.rotatePrincipal({ issuer, subject: "subject-alice", nextCertificateCn: "cn-alice-v2" })).status, "VERIFIED");
      const staleRotation = await call(stale, "nacl_project_summary", { project_ref: projects.a1.ref });
      assert.equal(staleRotation.result.structuredContent.code, "REAUTHORIZATION_REQUIRED");
      tokens.set("docker-token-alice-0002", token({ subject: "subject-alice", session: "session-alice-docker-2", epoch: await control.currentTokenEpoch(issuer, "subject-alice"), audience: `${base}/mcp` }));
      const rotated = await call("docker-token-alice-0002", "nacl_project_summary", { project_ref: projects.a2.ref });
      assert.equal(rotated.result.structuredContent.data.summary, "marker-a2");

      assert.equal((await control.revokeServer({ issuer, subject: "subject-alice", serverId: "server-a" })).status, "VERIFIED");
      const staleRevoke = await call("docker-token-alice-0002", "nacl_project_summary", { project_ref: projects.a1.ref });
      assert.equal(staleRevoke.result.structuredContent.code, "REAUTHORIZATION_REQUIRED");
      tokens.set("docker-token-alice-0003", token({ subject: "subject-alice", session: "session-alice-docker-3", epoch: await control.currentTokenEpoch(issuer, "subject-alice"), audience: `${base}/mcp` }));
      const afterRevoke = await call("docker-token-alice-0003", "nacl_projects_list", {});
      assert.deepEqual(afterRevoke.result.structuredContent.data.projects, []);
      assert.deepEqual([...registryA.trusted], []);
      assert.deepEqual([...registryB.trusted], ["cn-bob-v1"]);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      for (const item of resources.reverse()) {
        if (item.containerCreated) docker(["container", "rm", "--force", item.name]);
        docker(["volume", "rm", item.volume]);
        assert.notEqual(docker(["container", "inspect", item.name]).status, 0);
        assert.notEqual(docker(["volume", "inspect", item.volume]).status, 0);
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);

import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { CONTRACT_VERSION, PUBLIC_TOOL_NAMES, PUBLIC_TOOLS } from "../src/contracts.mjs";
import { ReauthorizationRequired } from "../src/errors.mjs";
import { createStreamableHttpServer, STABLE_PROTOCOL_VERSION } from "../src/http-server.mjs";
import { createSdkMcpServer } from "../src/sdk-server.mjs";

async function fixture(callTool = async () => ({
  contract: CONTRACT_VERSION,
  status: "VERIFIED",
  code: "READ_COMPLETED",
  data: { summary: "bounded" },
  retryable: false,
  replayed: false,
  support_ref: "support_0123456789abcdef0123456789abcdef",
})) {
  const authServer = "https://idp.example.test/";
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const reservedPort = reservation.address().port;
  reservation.close();
  await once(reservation, "close");
  const base = `http://127.0.0.1:${reservedPort}`;
  const metadataUrl = `${base}/.well-known/oauth-protected-resource`;
  let graphCalls = 0;
  let auditRejections = 0;
  let authenticationRejections = 0;
  let server;
  server = createStreamableHttpServer({
    resourceUrl: `${base}/mcp`,
    resourceMetadataUrl: metadataUrl,
    authorizationServers: [authServer],
    scopesSupported: ["nacl.server.read", "nacl.server.write"],
    allowedOrigins: ["https://chatgpt.com"],
    async verifyAuthorization(header) {
      if (header !== "Bearer valid-fixture") throw new Error("invalid");
      return Object.freeze({ verified: true, subject: "subject-alice", sessionId: "session-alice" });
    },
    async auditAuthenticationRejection() { authenticationRejections += 1; },
    createMcpServer({ authContext }) {
      return createSdkMcpServer({
        resourceMetadataUrl: metadataUrl,
        authContext,
        async auditRejection() { auditRejections += 1; },
        async callTool(input) {
          graphCalls += 1;
          return callTool(input);
        },
      });
    },
  });
  server.listen(reservedPort, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    base,
    metadataUrl,
    authServer,
    graphCalls: () => graphCalls,
    auditRejections: () => auditRejections,
    authenticationRejections: () => authenticationRejections,
  };
}

async function post(base, body, token, headers = {}) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: token } : {}),
      ...(body.method === "initialize" ? {} : { "mcp-protocol-version": STABLE_PROTOCOL_VERSION }),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function rawRequest(base, { method = "POST", path = "/mcp", headers = {}, body } = {}) {
  const target = new URL(base);
  const normalizedHeaders = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      method,
      path,
      headers: normalizedHeaders,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

test("protected-resource metadata and transport challenge use one canonical resource_metadata URL", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const metadata = await fetch(ctx.metadataUrl);
  assert.equal(metadata.status, 200);
  const document = await metadata.json();
  assert.equal(document.authorization_servers[0], ctx.authServer);
  assert.deepEqual(document.bearer_methods_supported, ["header"]);

  const response = await post(ctx.base, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), `Bearer resource_metadata="${ctx.metadataUrl}", scope="nacl.server.read"`);
  assert.equal(ctx.graphCalls(), 0);
  assert.equal(ctx.authenticationRejections(), 1);
});

test("transport challenges advertise the exact scope required by each requested public tool", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const cases = [
    ["nacl_project_summary", "nacl.server.read"],
    ["nacl_project_mutate", "nacl.server.write"],
    ["nacl_schema_apply", "nacl.server.schema"],
    ["nacl_backup_create", "nacl.server.backup"],
    ["nacl_restore_request", "nacl.server.restore"],
  ];
  for (const [name, scope] of cases) {
    const response = await post(ctx.base, {
      jsonrpc: "2.0",
      id: name,
      method: "tools/call",
      params: { name, arguments: {} },
    }, "Bearer invalid-fixture");
    assert.equal(response.status, 401, name);
    assert.equal(response.headers.get("www-authenticate"), `Bearer resource_metadata="${ctx.metadataUrl}", scope="${scope}"`);
  }
  assert.equal(ctx.graphCalls(), 0);
  assert.equal(ctx.authenticationRejections(), cases.length);
});

test("unauthenticated malformed transport requests still receive an audited OAuth challenge", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const common = { host: new URL(ctx.base).host };
  const invalidJson = await rawRequest(ctx.base, {
    headers: { ...common, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: "{not-json",
  });
  assert.equal(invalidJson.status, 401);
  assert.equal(invalidJson.headers["www-authenticate"], `Bearer resource_metadata="${ctx.metadataUrl}", scope="nacl.server.read"`);
  const missingAccept = await rawRequest(ctx.base, {
    headers: { ...common, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }),
  });
  assert.equal(missingAccept.status, 401);
  assert.equal(missingAccept.headers["www-authenticate"], `Bearer resource_metadata="${ctx.metadataUrl}", scope="nacl.server.read"`);
  assert.equal(ctx.authenticationRejections(), 2);
  assert.equal(ctx.graphCalls(), 0);
});

test("public catalog is strict, annotated, OAuth-protected, and excludes every local lifecycle capability", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const response = await post(ctx.base, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, "Bearer valid-fixture");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.result.tools.map((tool) => tool.name), PUBLIC_TOOL_NAMES);
  for (const tool of body.result.tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, false);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(typeof tool.annotations.destructiveHint, "boolean");
    assert.equal(tool.annotations.idempotentHint, true);
    assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
    assert.equal(tool.securitySchemes[0].type, "oauth2");
  }
  const names = PUBLIC_TOOL_NAMES.join(" ");
  assert.doesNotMatch(names, /local|symlink|profile|installation|lifecycle|cypher/i);
});

test("tool-level reauthorization challenge is an MCP error result and leaks no topology", async (t) => {
  const ctx = await fixture(async ({ requiredScope }) => {
    throw new ReauthorizationRequired({ scope: requiredScope });
  });
  t.after(() => ctx.server.close());
  const response = await post(ctx.base, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "nacl_project_summary", arguments: { project_ref: "prj_AAAAAAAAAAAAAAAA" } },
  }, "Bearer valid-fixture");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.isError, true);
  const challenge = body.result._meta["mcp/www_authenticate"];
  assert.equal(challenge, `Bearer resource_metadata="${ctx.metadataUrl}", error="insufficient_scope", error_description="Authorization is required for this capability.", scope="nacl.server.read"`);
  assert.doesNotMatch(JSON.stringify(body), /server-a|project-alpha|bolt:|neo4j|subject-alice/);
});

test("schema rejects forged routing, identity, host, URI, path, certificate, password, and Cypher fields before a handler call", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  for (const field of ["server_id", "principal_id", "project_scope", "host", "uri", "path", "certificate", "password", "cypher"]) {
    const response = await post(ctx.base, {
      jsonrpc: "2.0",
      id: field,
      method: "tools/call",
      params: {
        name: "nacl_project_summary",
        arguments: { project_ref: "prj_AAAAAAAAAAAAAAAA", [field]: "forged" },
      },
    }, "Bearer valid-fixture");
    const body = await response.json();
    assert.equal(body.error.code, -32602, field);
  }
  assert.equal(ctx.graphCalls(), 0);
  assert.equal(ctx.auditRejections(), 9);
});

test("unknown public tool attempts are audited before the SDK rejects them", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const response = await post(ctx.base, {
    jsonrpc: "2.0",
    id: 30,
    method: "tools/call",
    params: { name: "nacl_raw_cypher", arguments: {} },
  }, "Bearer valid-fixture");
  const body = await response.json();
  assert.equal(body.error.code, -32602);
  assert.equal(ctx.auditRejections(), 1);
  assert.equal(ctx.graphCalls(), 0);
});

test("HTTP tool schema rejects an incorrect destructive confirmation before the handler", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const response = await post(ctx.base, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "nacl_restore_request",
      arguments: {
        project_ref: "prj_AAAAAAAAAAAAAAAA",
        backup_ref: "backup_AAAAAAAAAAAAA",
        idempotency_key: "idempotency-restore-0001",
        confirmation: "OVERWRITE_ACTIVE_PROJECT",
      },
    },
  }, "Bearer valid-fixture");
  const body = await response.json();
  assert.equal(body.error.code, -32602);
  assert.equal(ctx.graphCalls(), 0);
});

test("output schemas stay closed and annotations match the conservative audit classification", () => {
  assert.equal(PUBLIC_TOOLS.length, 7);
  for (const tool of PUBLIC_TOOLS) {
    assert.equal(tool.outputSchema.properties.data.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, false);
  }
  assert.equal(PUBLIC_TOOLS.find((tool) => tool.name === "nacl_schema_apply").annotations.destructiveHint, true);
  assert.equal(PUBLIC_TOOLS.find((tool) => tool.name === "nacl_restore_request").annotations.destructiveHint, true);
});

test("official SDK negotiates stable 2025-11-25 stateless initialize with no session or resumability claim", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const response = await post(ctx.base, {
    jsonrpc: "2.0",
    id: 10,
    method: "initialize",
    params: {
      protocolVersion: STABLE_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "nacl-conformance", version: "1.0.0" },
    },
  }, "Bearer valid-fixture");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("mcp-session-id"), null);
  const body = await response.json();
  assert.equal(body.result.protocolVersion, STABLE_PROTOCOL_VERSION);
  assert.equal(body.result.serverInfo.name, "nacl-public-mcp");

  for (const method of ["GET", "DELETE"]) {
    const unsupported = await fetch(`${ctx.base}/mcp`, { method });
    assert.equal(unsupported.status, 405, method);
    assert.equal(unsupported.headers.get("allow"), "POST", method);
    assert.equal(unsupported.headers.get("mcp-session-id"), null, method);
  }
});

test("protocol conformance rejects missing Accept, wrong Content-Type, missing/unsupported version, and fake session before tool execution", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const body = JSON.stringify({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {} });
  const baseHeaders = {
    host: new URL(ctx.base).host,
    authorization: "Bearer valid-fixture",
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": STABLE_PROTOCOL_VERSION,
  };
  const missingAccept = await rawRequest(ctx.base, { headers: { ...baseHeaders, accept: undefined }, body });
  assert.equal(missingAccept.status, 406);
  const wrongContent = await rawRequest(ctx.base, { headers: { ...baseHeaders, "content-type": "text/plain" }, body });
  assert.equal(wrongContent.status, 415);
  const missingVersion = await rawRequest(ctx.base, { headers: { ...baseHeaders, "mcp-protocol-version": undefined }, body });
  assert.equal(missingVersion.status, 400);
  const unsupportedVersion = await rawRequest(ctx.base, { headers: { ...baseHeaders, "mcp-protocol-version": "2026-07-28" }, body });
  assert.equal(unsupportedVersion.status, 400);
  const fakeSession = await rawRequest(ctx.base, { headers: { ...baseHeaders, "mcp-session-id": "forged-session" }, body });
  assert.equal(fakeSession.status, 400);
  assert.equal(ctx.graphCalls(), 0);
});

test("DNS-rebinding controls reject forged Host and Origin before auth or MCP parsing", async (t) => {
  const ctx = await fixture();
  t.after(() => ctx.server.close());
  const body = JSON.stringify({ jsonrpc: "2.0", id: 12, method: "tools/list", params: {} });
  const common = {
    authorization: "Bearer valid-fixture",
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": STABLE_PROTOCOL_VERSION,
  };
  const forgedHost = await rawRequest(ctx.base, { headers: { ...common, host: "attacker.example" }, body });
  assert.equal(forgedHost.status, 421);
  const forgedOrigin = await rawRequest(ctx.base, { headers: { ...common, host: new URL(ctx.base).host, origin: "https://attacker.example" }, body });
  assert.equal(forgedOrigin.status, 403);
  assert.equal(ctx.graphCalls(), 0);
});

test("production origins and protected-resource metadata fail closed on HTTP, cross-origin, and non-well-known configuration", () => {
  const base = {
    resourceUrl: "https://mcp.example.test/mcp",
    resourceMetadataUrl: "https://mcp.example.test/.well-known/oauth-protected-resource",
    authorizationServers: ["https://idp.example.test/"],
    scopesSupported: ["nacl.server.read"],
    allowedOrigins: ["https://chatgpt.com"],
    verifyAuthorization: async () => ({}),
    auditAuthenticationRejection: async () => {},
    createMcpServer: () => ({}),
  };
  assert.throws(() => createStreamableHttpServer({ ...base, resourceUrl: "http://mcp.example.test/mcp" }), /resourceUrl is invalid/);
  assert.throws(() => createStreamableHttpServer({ ...base, resourceMetadataUrl: "https://attacker.example/.well-known/oauth-protected-resource" }), /same-origin/);
  assert.throws(() => createStreamableHttpServer({ ...base, resourceMetadataUrl: "https://mcp.example.test/not-well-known" }), /same-origin/);
  assert.throws(() => createStreamableHttpServer({ ...base, allowedOrigins: ["http://chatgpt.com"] }), /allowedOrigin is invalid/);
  assert.throws(() => createStreamableHttpServer({ ...base, authorizationServers: ["https://idp.example.test/?tenant=a"] }), /query-free HTTPS URL/);
});

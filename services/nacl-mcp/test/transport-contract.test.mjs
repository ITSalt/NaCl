import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";
import { CONTRACT_VERSION, PUBLIC_TOOL_NAMES, PUBLIC_TOOLS } from "../src/contracts.mjs";
import { ReauthorizationRequired } from "../src/errors.mjs";
import { createStreamableHttpServer } from "../src/http-server.mjs";
import { createProtocolRuntime } from "../src/protocol.mjs";

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
  let protocol;
  let server;
  server = createStreamableHttpServer({
    resourceUrl: `${base}/mcp`,
    resourceMetadataUrl: metadataUrl,
    authorizationServers: [authServer],
    scopesSupported: ["nacl.server.read", "nacl.server.write"],
    async verifyAuthorization(header) {
      if (header !== "Bearer valid-fixture") throw new Error("invalid");
      return Object.freeze({ verified: true, subject: "subject-alice", sessionId: "session-alice" });
    },
    protocol: {
      async handle(message, auth) {
        return protocol.handle(message, auth);
      },
    },
  });
  server.listen(reservedPort, "127.0.0.1");
  await once(server, "listening");
  protocol = createProtocolRuntime({
    resourceMetadataUrl: metadataUrl,
    async callTool(input) {
      graphCalls += 1;
      return callTool(input);
    },
  });
  return { server, base, metadataUrl, authServer, graphCalls: () => graphCalls };
}

async function post(base, body, token) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: token } : {}),
    },
    body: JSON.stringify(body),
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
});

test("output schemas stay closed and annotations match the conservative audit classification", () => {
  assert.equal(PUBLIC_TOOLS.length, 6);
  for (const tool of PUBLIC_TOOLS) {
    assert.equal(tool.outputSchema.properties.data.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, false);
  }
  assert.equal(PUBLIC_TOOLS.find((tool) => tool.name === "nacl_schema_apply").annotations.destructiveHint, true);
  assert.equal(PUBLIC_TOOLS.find((tool) => tool.name === "nacl_restore_request").annotations.destructiveHint, true);
});

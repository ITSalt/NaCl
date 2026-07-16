import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadDeployment } from "../src/entrypoint.mjs";
import { createNaclMcpService } from "../src/service.mjs";

const configuration = {
  resourceUrl: "http://127.0.0.1:39999/mcp",
  resourceMetadataUrl: "http://127.0.0.1:39999/.well-known/oauth-protected-resource",
  authorizationServers: ["https://identity.example.test/"],
  scopesSupported: ["nacl.server.read", "nacl.server.write", "nacl.server.schema", "nacl.server.backup", "nacl.server.restore"],
  trustedIssuers: ["https://identity.example.test/"],
  allowedOrigins: ["https://chatgpt.com"],
  serverVersion: "0.0.0-test",
};

const graphAdapter = Object.fromEntries([
  "projectSummary", "namedRead", "mutateProject", "applySchema", "createBackup", "requestRestore",
].map((name) => [name, async () => ({})]));

function request(port, host) {
  return new Promise((resolve, reject) => {
    const call = http.request({
      host: "127.0.0.1",
      port,
      path: "/healthz",
      headers: { host },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    call.on("error", reject);
    call.end();
  });
}

test("deployment composition creates a locally runnable server without embedding a provider or graph lifecycle", async () => {
  const server = createNaclMcpService({
    configuration,
    adapters: {
      async resolveVerifiedToken() { throw new Error("not called by health check"); },
      controlPlane: {
        sessionRegistryDurability: "durable",
        authorizationStateDurability: "durable",
        authorizationStateScope: "shared",
        async authorize() {},
        async listProjects() {},
        async reconcileTransition() {},
      },
      graphAdapter,
      auditSink: { durability: "durable", newSupportRef() {}, async record() {} },
      rateLimiter: { scope: "shared", assert() {} },
      idempotencyLedger: { durability: "durable", async execute() {} },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await request(server.address().port, "127.0.0.1:39999");
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { status: "ok" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("deployment composition rejects provider-specific or secret-bearing configuration fields", () => {
  assert.throws(() => createNaclMcpService({
    configuration: { providerClientSecret: "must-not-be-here" },
    adapters: {},
  }), /configuration is invalid/);
});

test("deployment composition requires the exact scopes used by the fixed public catalog", () => {
  assert.throws(() => createNaclMcpService({
    configuration: { ...configuration, scopesSupported: ["nacl.server.read"] },
    adapters: {},
  }), /exactly match the public tool catalog/);
});

test("deployment composition cannot trust an issuer outside advertised authorization servers", () => {
  assert.throws(() => createNaclMcpService({
    configuration: { ...configuration, trustedIssuers: ["https://other-idp.example.test/"] },
    adapters: {},
  }), /exactly match the advertised authorizationServers/);
});

test("deployment composition rejects query-bearing issuer and authorization-server URLs", () => {
  assert.throws(() => createNaclMcpService({
    configuration: {
      ...configuration,
      authorizationServers: ["https://identity.example.test/?tenant=a"],
      trustedIssuers: ["https://identity.example.test/?tenant=a"],
    },
    adapters: {},
  }), /query-free HTTPS URL/);
});

test("deployment composition rejects process-local security state adapters", () => {
  assert.throws(() => createNaclMcpService({
    configuration,
    adapters: {
      async resolveVerifiedToken() {},
      controlPlane: { sessionRegistryDurability: "process-local", async authorize() {}, async listProjects() {} },
      graphAdapter,
      auditSink: { durability: "process-local", newSupportRef() {}, record() {} },
      rateLimiter: { scope: "process-local", assert() {} },
      idempotencyLedger: { durability: "process-local", execute() {} },
    },
  }), /durable audit\/idempotency\/session\/authorization/);
});

test("deployment composition rejects durable sessions combined with process-local grants", () => {
  assert.throws(() => createNaclMcpService({
    configuration,
    adapters: {
      async resolveVerifiedToken() {},
      controlPlane: {
        sessionRegistryDurability: "durable",
        authorizationStateDurability: "process-local",
        authorizationStateScope: "process-local",
        async authorize() {},
        async listProjects() {},
      },
      graphAdapter,
      auditSink: { durability: "durable", newSupportRef() {}, async record() {} },
      rateLimiter: { scope: "shared", async assert() {} },
      idempotencyLedger: { durability: "durable", async execute() {} },
    },
  }), /durable audit\/idempotency\/session\/authorization/);
});

test("entrypoint rejects unknown deployment fields before importing a provider adapter", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-mcp-config-"));
  const previousConfig = process.env.NACL_MCP_CONFIG_FILE;
  const previousAdapter = process.env.NACL_MCP_ADAPTER_MODULE;
  try {
    const config = path.join(temporary, "config.json");
    await writeFile(config, '{"providerClientSecret":"must-not-reach-adapter"}\n');
    process.env.NACL_MCP_CONFIG_FILE = config;
    process.env.NACL_MCP_ADAPTER_MODULE = path.join(temporary, "does-not-exist.mjs");
    await assert.rejects(loadDeployment(), /unsupported field/);
  } finally {
    if (previousConfig === undefined) delete process.env.NACL_MCP_CONFIG_FILE;
    else process.env.NACL_MCP_CONFIG_FILE = previousConfig;
    if (previousAdapter === undefined) delete process.env.NACL_MCP_ADAPTER_MODULE;
    else process.env.NACL_MCP_ADAPTER_MODULE = previousAdapter;
    await rm(temporary, { recursive: true, force: true });
  }
});

test("entrypoint validates transport configuration before importing a provider adapter", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-mcp-invalid-transport-"));
  const previousConfig = process.env.NACL_MCP_CONFIG_FILE;
  const previousAdapter = process.env.NACL_MCP_ADAPTER_MODULE;
  try {
    const config = path.join(temporary, "config.json");
    await writeFile(config, `${JSON.stringify({
      ...configuration,
      resourceUrl: "http://mcp.example.test/mcp",
      listen: { host: "127.0.0.1", port: 8080 },
    })}\n`);
    process.env.NACL_MCP_CONFIG_FILE = config;
    process.env.NACL_MCP_ADAPTER_MODULE = path.join(temporary, "does-not-exist.mjs");
    await assert.rejects(loadDeployment(), /(audience|resourceUrl) is invalid/);
  } finally {
    if (previousConfig === undefined) delete process.env.NACL_MCP_CONFIG_FILE;
    else process.env.NACL_MCP_CONFIG_FILE = previousConfig;
    if (previousAdapter === undefined) delete process.env.NACL_MCP_ADAPTER_MODULE;
    else process.env.NACL_MCP_ADAPTER_MODULE = previousAdapter;
    await rm(temporary, { recursive: true, force: true });
  }
});

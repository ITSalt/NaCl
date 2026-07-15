import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadDeployment } from "../src/entrypoint.mjs";
import { createNaclMcpService } from "../src/service.mjs";

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
    configuration: {
      resourceUrl: "http://127.0.0.1:39999/mcp",
      resourceMetadataUrl: "http://127.0.0.1:39999/.well-known/oauth-protected-resource",
      authorizationServers: ["https://identity.example.test/"],
      scopesSupported: ["nacl.server.read"],
      trustedIssuers: ["https://identity.example.test/"],
      allowedOrigins: ["https://chatgpt.com"],
      serverVersion: "test-only",
    },
    adapters: {
      async resolveVerifiedToken() { throw new Error("not called by health check"); },
      controlPlane: {},
      graphAdapter: {},
      auditSink: {},
      rateLimiter: {},
      idempotencyLedger: {},
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

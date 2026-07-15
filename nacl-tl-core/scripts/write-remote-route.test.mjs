import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveSecretSource, validateSecretSource } from "./secret-source-contract.mjs";
import { readRemoteRoutePair, writeRemoteRouteTransaction } from "./write-remote-route.mjs";

const route = {
  mode: "connect",
  host: "graph.example.com",
  gatewayPort: 7443,
  sidecarPort: 3700,
  projectScope: "project-a",
  clientCert: "/secure/client.crt",
  clientKey: "/secure/client.key",
  caCert: "/secure/ca.crt",
  tls: true,
  uri: "bolt://localhost:3700",
  username: "neo4j",
  database: "neo4j",
  secretSource: "server-route:project-a",
};

const launcher = {
  command: "/usr/bin/node",
  script: "/opt/nacl/secret-source-launcher.mjs",
  binary: "/opt/nacl/neo4j-mcp",
};

async function fixture(config, mcp) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nacl-remote-route-"));
  await writeFile(path.join(root, "config.yaml"), config);
  await writeFile(path.join(root, ".mcp.json"), mcp);
  return root;
}

test("transaction replaces stale local and remote route state with one exact opaque pair", async () => {
  for (const config of [
    "project:\n  name: Demo\ngraph:\n  mode: \"local\"\n  neo4j_password: \"plaintext-old\"\n  neo4j_bolt_port: 3587\nintake:\n  route_threshold: 0.7\n",
    "graph:\n  mode: \"remote\"\n  neo4j_uri: \"bolt://localhost:3999\"\n  project_scope: \"stale-project\"\n  remote:\n    host: \"stale.invalid\"\n    gateway_port: 7999\n    secret_source: \"env:NEO4J_PASSWORD\"\n",
  ]) {
    const root = await fixture(config, '{"mcpServers":{"neo4j":{"command":"old","env":{"NEO4J_PASSWORD":"plaintext-old"}},"github":{"command":"gh"}}}\n');
    try {
      await writeRemoteRouteTransaction({ projectRoot: root, route, launcher });
      const configText = await readFile(path.join(root, "config.yaml"), "utf8");
      const mcpText = await readFile(path.join(root, ".mcp.json"), "utf8");
      assert.doesNotMatch(configText, /plaintext-old|stale\.invalid|neo4j_password|neo4j_bolt_port/);
      assert.doesNotMatch(mcpText, /plaintext-old|NEO4J_PASSWORD/);
      assert.match(mcpText, /server-route:project-a/);
      assert.equal(JSON.parse(mcpText).mcpServers.github.command, "gh");
      assert.deepEqual(readRemoteRoutePair(configText, mcpText), {
        route: {
          mode: "connect",
          host: "graph.example.com",
          gateway_port: 7443,
          sidecar_port: 3700,
          project_scope: "project-a",
          client_cert: "/secure/client.crt",
          client_key: "/secure/client.key",
          ca_cert: "/secure/ca.crt",
          tls: true,
          uri: "bolt://localhost:3700",
          username: "neo4j",
          database: "neo4j",
          secret_source: "server-route:project-a",
        },
        launcher,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("injected second-file failure restores both original files byte-for-byte", async () => {
  const config = "graph:\n  mode: local\n# exact original\n";
  const mcp = '{"mcpServers":{"neo4j":{"command":"old"}}}\n';
  const root = await fixture(config, mcp);
  try {
    await assert.rejects(
      writeRemoteRouteTransaction({ projectRoot: root, route, launcher, failAfterFirstWrite: true }),
      /injected second-file failure/,
    );
    assert.equal(await readFile(path.join(root, "config.yaml"), "utf8"), config);
    assert.equal(await readFile(path.join(root, ".mcp.json"), "utf8"), mcp);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("one secret-source contract resolves env and injected server route providers, and fails closed when unavailable", async () => {
  assert.deepEqual(validateSecretSource("server-route:project-a"), { kind: "server-route", reference: "server-route:project-a", routeId: "project-a" });
  assert.equal(await resolveSecretSource("env:NEO4J_PASSWORD", { env: { NEO4J_PASSWORD: "env-secret" } }), "env-secret");
  assert.equal(await resolveSecretSource("server-route:project-a", {
    serverRouteProvider: async ({ routeId }) => routeId === "project-a" ? "provider-secret" : "",
  }), "provider-secret");
  await assert.rejects(resolveSecretSource("server-route:project-a", { env: {} }), /provider unavailable/i);
});

test("transaction rejects malformed MCP and malformed or duplicate graph state byte-preservingly", async () => {
  const cases = [
    { config: "graph:\n  mode: local\n", mcp: "{not-json\n", pattern: /existing \.mcp\.json is malformed/ },
    { config: "graph: [invalid]\n", mcp: "{}\n", pattern: /graph block is malformed/ },
    { config: " graph:\n  mode: local\n", mcp: "{}\n", pattern: /graph block is malformed/ },
    { config: "graph:\n  mode: local\ngraph:\n  mode: remote\n", mcp: "{}\n", pattern: /graph block is malformed or duplicated/ },
    { config: "graph:\n  mode: local\n  mode: remote\n", mcp: "{}\n", pattern: /duplicate graph key mode/ },
  ];
  for (const entry of cases) {
    const root = await fixture(entry.config, entry.mcp);
    try {
      await assert.rejects(writeRemoteRouteTransaction({ projectRoot: root, route, launcher }), entry.pattern);
      assert.equal(await readFile(path.join(root, "config.yaml"), "utf8"), entry.config);
      assert.equal(await readFile(path.join(root, ".mcp.json"), "utf8"), entry.mcp);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("readback binds the exact launcher command, script, and binary", async () => {
  const root = await fixture("graph:\n  mode: local\n", "{}\n");
  try {
    await writeRemoteRouteTransaction({ projectRoot: root, route, launcher });
    const configText = await readFile(path.join(root, "config.yaml"), "utf8");
    const mcpPath = path.join(root, ".mcp.json");
    const original = JSON.parse(await readFile(mcpPath, "utf8"));
    for (const mutate of [
      (mcp) => { mcp.mcpServers.neo4j.command = "/tmp/attacker-command"; },
      (mcp) => { mcp.mcpServers.neo4j.args[0] = "/tmp/attacker-script"; },
      (mcp) => { mcp.mcpServers.neo4j.args[2] = "/tmp/attacker-binary"; },
    ]) {
      const mcp = structuredClone(original);
      mutate(mcp);
      const altered = `${JSON.stringify(mcp, null, 2)}\n`;
      assert.throws(() => readRemoteRoutePair(configText, altered, { expectedLauncher: launcher }), /launcher metadata mismatch/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

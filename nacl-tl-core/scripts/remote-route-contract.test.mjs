import assert from "node:assert/strict";
import test from "node:test";
import { validateMarkerInputs, validateRemoteRoute } from "./remote-route-contract.mjs";

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
  secretSource: "env:NEO4J_PASSWORD",
};

test("create/connect route retains every endpoint and secret-source field", () => {
  for (const mode of ["create", "connect"]) {
    assert.deepEqual(validateRemoteRoute({ ...route, mode }), {
      mode,
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
      secret_source: "env:NEO4J_PASSWORD",
    });
  }
});

test("route rejects dropped fields, silent URI defaults, plaintext secret values and arbitrary inputs", () => {
  for (const input of [
    { ...route, host: undefined },
    { ...route, uri: "bolt://attacker.invalid:7687" },
    { ...route, secretSource: "plain:password" },
    { ...route, clientKey: "relative.key" },
    { ...route, arbitraryUrl: "https://attacker.invalid" },
  ]) assert.throws(() => validateRemoteRoute(input));
});

test("route accepts an opaque server-route reference through the shared secret-source grammar", () => {
  assert.equal(validateRemoteRoute({ ...route, secretSource: "server-route:project-a" }).secret_source, "server-route:project-a");
});

test("create marker interpolation accepts only exact non-Cypher grammar", () => {
  assert.deepEqual(validateMarkerInputs({ projectScope: "project-a", developerId: "alice@example.com" }), {
    projectScope: "project-a",
    developerId: "alice@example.com",
  });
  for (const input of [
    { projectScope: "x'}) DETACH DELETE n //", developerId: "alice@example.com" },
    { projectScope: "project-a", developerId: "alice' SET p.admin=true" },
    { projectScope: "../project", developerId: "alice@example.com" },
  ]) assert.throws(() => validateMarkerInputs(input));
});

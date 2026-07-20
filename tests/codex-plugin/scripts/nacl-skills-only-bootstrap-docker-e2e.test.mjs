import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const enabled = process.env.NACL_RUN_SKILLS_ONLY_BOOTSTRAP === "1" && process.platform !== "win32";

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", timeout: 300_000, ...options });
}

function toolRows(response) {
  const text = response?.result?.content?.find((entry) => entry.type === "text")?.text;
  assert.equal(typeof text, "string", JSON.stringify(response));
  return JSON.parse(text);
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function query(port, password, statement, parameters = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/db/neo4j/tx/commit`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`neo4j:${password}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ statements: [{ statement, parameters, resultDataContents: ["row"] }] }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.errors, []);
  return body.results[0];
}

test("exact staged Skills-only tree bootstraps, requires restart, and verifies initialization through a new-process MCP", { skip: !enabled, timeout: 600_000 }, async () => {
  const docker = run("docker", ["info"]);
  if (docker.status !== 0) return test.skip("Docker daemon is unavailable");
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "nacl-skills-bootstrap-e2e-")));
  const bundle = path.join(temporary, "bundle");
  const project = path.join(temporary, "project");
  const suffix = `${process.pid}${Date.now().toString().slice(-6)}`;
  const projectId = `skills-e2e-${suffix}`;
  const container = `${projectId}-neo4j`;
  const dataVolume = `${projectId}-neo4j-data`;
  const logVolume = `${projectId}-neo4j-logs`;
  const network = `${projectId}-net`;
  try {
    const built = run(process.execPath, ["scripts/build-codex-skills-only.mjs", "--output", bundle]);
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    await mkdir(project);
    let boltPort = await freePort();
    let httpPort = await freePort();
    while (httpPort === boltPort) httpPort = await freePort();
    const bootstrapRoot = path.join(bundle, "skills", "nacl-init", "resources", "bootstrap");
    const runner = path.join(bootstrapRoot, "setup-project-graph.sh");
    const planRunner = path.join(bootstrapRoot, "plan-project-graph.mjs");
    const selection = ["--project-root", project, "--project-id", projectId, "--bolt-port", String(boltPort), "--http-port", String(httpPort), "--database", "neo4j"];
    const firstPlanRun = run(process.execPath, [planRunner, ...selection], { cwd: project });
    assert.equal(firstPlanRun.status, 0, `${firstPlanRun.stdout}\n${firstPlanRun.stderr}`);
    const firstPlan = JSON.parse(firstPlanRun.stdout);
    assert.equal(firstPlan.confirmation, `INIT_LOCAL_GRAPH:${projectId}:${firstPlan.planHash}`);
    const firstArgs = [runner, ...selection, "--confirmation", firstPlan.confirmation];
    const first = run("sh", firstArgs, { cwd: project });
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.match(first.stdout, /NACL_SKILLS_ONLY_BOOTSTRAP: status=PARTIALLY_VERIFIED code=RESTART_REQUIRED bootstrap=VERIFIED initialization=NOT_RUN/);
    assert.match(first.stdout, /NACL_APOC_SUPPLY: status=VERIFIED version=5\.24\.2 digest=39092c89df1cb80f4f3d8799821e74c7f1d10503f92625be32882b70b13002fa source=pinned-image/);
    assert.match(first.stdout, /migration_version=3 apoc_version=5\.24\.2 meta_canary=ok read_canary=ok/);
    const containerLogs = run("docker", ["logs", container]);
    assert.equal(containerLogs.status, 0, containerLogs.stderr);
    assert.match(`${containerLogs.stdout}\n${containerLogs.stderr}`, /Installing Plugin 'apoc' from \/var\/lib\/neo4j\/labs\/apoc-\*-core\.jar/);
    assert.doesNotMatch(`${containerLogs.stdout}\n${containerLogs.stderr}`, /Fetching versions\.json|must be downloaded/);

    const env = Object.fromEntries((await readFile(path.join(project, "graph-infra", ".env"), "utf8")).trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
    const ledger = await query(httpPort, env.NEO4J_PASSWORD, "MATCH (m:SchemaMigration {component:'nacl-graph-gateway'}) RETURN m.version AS version, m.checksum AS checksum ORDER BY version");
    assert.deepEqual(ledger.columns, ["version", "checksum"]);
    assert.equal(ledger.data.at(-1).row[0], 3);
    assert.equal(ledger.data.at(-1).row[1], "a0f6a5925eae88ae59e00baf056b1a29750ec40d97cfef7bdfd018f993bb40b2");
    const allocatorFile = path.join(bundle, "skills", "nacl-init", "resources", "graph-infra", "queries", "sa-queries.cypher");
    const queryText = await readFile(allocatorFile, "utf8");
    const allocatorStart = queryText.indexOf("// Query: sa_next_uc_in_module");
    const allocatorEnd = queryText.indexOf("// Query:", allocatorStart + 10);
    const allocator = queryText.slice(allocatorStart, allocatorEnd < 0 ? undefined : allocatorEnd).replace(/^\/\/.*$/gm, "").trim();
    assert.ok(allocatorStart >= 0);
    assert.doesNotMatch(allocator, /apoc/i);
    await query(httpPort, env.NEO4J_PASSWORD, "CREATE (:Module {id:'wide-module', uc_range_start:1000})");
    const wide = await query(httpPort, env.NEO4J_PASSWORD, allocator.replace("$moduleId", "'wide-module'"));
    assert.deepEqual(wide.columns, ["nextUcId"]);
    assert.equal(wide.data[0].row[0], "UC-1000");
    const ports = JSON.parse(run("docker", ["inspect", container, "--format", "{{json .NetworkSettings.Ports}}"] ).stdout);
    assert.equal(ports["7474/tcp"][0].HostIp, "127.0.0.1");
    assert.equal(ports["7687/tcp"][0].HostIp, "127.0.0.1");

    const configBeforeStale = await readFile(path.join(project, ".codex", "config.toml"));
    const envBeforeStale = await readFile(path.join(project, "graph-infra", ".env"));
    const stale = run("sh", firstArgs, { cwd: project });
    assert.notEqual(stale.status, 0);
    assert.equal(JSON.parse(stale.stderr).code, "PLAN_TOKEN_STALE");
    assert.deepEqual(await readFile(path.join(project, ".codex", "config.toml")), configBeforeStale);
    assert.deepEqual(await readFile(path.join(project, "graph-infra", ".env")), envBeforeStale);

    const diagnosed = run(process.execPath, [planRunner, "--diagnose-only", "--project-root", project], { cwd: project });
    assert.equal(diagnosed.status, 0, `${diagnosed.stdout}\n${diagnosed.stderr}`);
    assert.deepEqual(
      (({ status, code, initializationState }) => ({ status, code, initializationState }))(JSON.parse(diagnosed.stdout)),
      { status: "PARTIALLY_VERIFIED", code: "PROJECT_MCP_VERIFICATION_REQUIRED", initializationState: "INITIALIZED_LOCAL_FILES" },
    );

    const secondPlanRun = run(process.execPath, [planRunner, ...selection], { cwd: project });
    assert.equal(secondPlanRun.status, 0, `${secondPlanRun.stdout}\n${secondPlanRun.stderr}`);
    const secondPlan = JSON.parse(secondPlanRun.stdout);
    assert.notEqual(secondPlan.confirmation, firstPlan.confirmation);
    const second = run("sh", [runner, ...selection, "--confirmation", secondPlan.confirmation], { cwd: project });
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.match(second.stdout, /NACL_BINARY_INSTALL: status=VERIFIED state=reusable/);
    assert.match(second.stdout, /NACL_SKILLS_ONLY_BOOTSTRAP: status=PARTIALLY_VERIFIED code=RESTART_REQUIRED bootstrap=VERIFIED initialization=NOT_RUN/);

    const launcher = path.join(project, "graph-infra", "scripts", "nacl-neo4j-mcp-launcher.mjs");
    const binary = await realpath(path.join(project, "graph-infra", "bin", "neo4j-mcp"));
    const namedReadStart = queryText.indexOf("// Query: sa_statistics_extensions");
    const namedReadEnd = queryText.indexOf("// Query:", namedReadStart + 10);
    const namedRead = queryText.slice(namedReadStart, namedReadEnd < 0 ? undefined : namedReadEnd).replace(/^\/\/.*$/gm, "").trim();
    assert.ok(namedReadStart >= 0);
    const verificationPlanRun = run(process.execPath, [planRunner, "--verification-plan", "--project-root", project, "--project-id", projectId, "--database", "neo4j"], { cwd: project });
    assert.equal(verificationPlanRun.status, 0, `${verificationPlanRun.stdout}\n${verificationPlanRun.stderr}`);
    const verificationPlan = JSON.parse(verificationPlanRun.stdout);
    assert.equal(verificationPlan.confirmation, `VERIFY_NACL_INITIALIZATION:${projectId}:${verificationPlan.planHash}`);
    assert.match(verificationPlan.plan.parameters.idempotencyKey, /^init-[0-9a-f]{48}$/);
    const ledgerQuery = "MATCH (m:SchemaMigration {component:'nacl-graph-gateway'}) RETURN m.version AS version, m.checksum AS checksum ORDER BY version";
    const constraintsQuery = "SHOW CONSTRAINTS YIELD name RETURN name ORDER BY name";
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read-cypher", arguments: { query: "RETURN 1 AS ok", params: {} } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "read-cypher", arguments: { query: ledgerQuery, params: {} } } },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "read-cypher", arguments: { query: constraintsQuery, params: {} } } },
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "read-cypher", arguments: { query: namedRead, params: {} } } },
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "write-cypher", arguments: { query: verificationPlan.plan.writeStatement, params: verificationPlan.plan.parameters } } },
    ];
    const mcp = run(process.execPath, [launcher, "--binary", binary], {
      cwd: project,
      env: { NEO4J_URI: `bolt://127.0.0.1:${boltPort}`, NEO4J_USERNAME: "neo4j", NEO4J_DATABASE: "neo4j", NEO4J_TELEMETRY: "false" },
      input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
    });
    assert.equal(mcp.status, 0, `${mcp.stdout}\n${mcp.stderr}`);
    const responses = mcp.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    assert.ok(responses.find((response) => response.id === 1)?.result && !responses.find((response) => response.id === 1)?.error, JSON.stringify(responses));
    const tools = responses.find((response) => response.id === 2)?.result?.tools ?? [];
    assert.ok(tools.some((tool) => tool.name === "read-cypher"), `${JSON.stringify(responses)}\nSTDERR:\n${mcp.stderr}`);
    assert.ok(tools.some((tool) => tool.name === "write-cypher"), `${JSON.stringify(responses)}\nSTDERR:\n${mcp.stderr}`);
    const canary = responses.find((response) => response.id === 3);
    assert.ok(canary?.result && !canary.error, JSON.stringify(canary));
    assert.match(JSON.stringify(canary.result), /ok/);
    for (const id of [4, 5, 6, 7]) {
      const response = responses.find((candidate) => candidate.id === id);
      assert.ok(response?.result && !response.error, `MCP call ${id}: ${JSON.stringify(response)}\nSTDERR:\n${mcp.stderr}`);
    }
    const ledgerReadback = toolRows(responses.find((response) => response.id === 4));
    assert.deepEqual(ledgerReadback, [
      { checksum: "320481b3ad98cec6bbbc55ec24b86108c9be9945cbd4fdd3ac78dc14354d4ba7", version: 1 },
      { checksum: "8bf48a60b7af77b61440c0d8d1429768ec32ca21597574ef5e7a18c1db3aef90", version: 2 },
      { checksum: "a0f6a5925eae88ae59e00baf056b1a29750ec40d97cfef7bdfd018f993bb40b2", version: 3 },
    ]);
    const constraintReadback = toolRows(responses.find((response) => response.id === 5)).map((row) => row.name);
    const schemaSources = await Promise.all(["ba-schema.cypher", "sa-schema.cypher", "tl-schema.cypher"].map((filename) => readFile(path.join(bundle, "skills", "nacl-init", "resources", "graph-infra", "schema", filename), "utf8")));
    const migrationSources = await Promise.all(["001-gateway-foundation.json", "002-concurrency-foundation.json", "003-schema-resource-identity.json"].map((filename) => readFile(path.join(bundle, "skills", "nacl-init", "graph", "migrations", filename), "utf8")));
    const requiredConstraints = [...schemaSources, ...migrationSources]
      .flatMap((source) => [...source.matchAll(/CREATE CONSTRAINT\s+([A-Za-z0-9_]+)/g)].map((match) => match[1]));
    assert.ok(requiredConstraints.length > 8);
    for (const constraint of requiredConstraints) assert.ok(constraintReadback.includes(constraint), `${constraint}: ${JSON.stringify(constraintReadback)}`);
    const [namedReadback] = toolRows(responses.find((response) => response.id === 6));
    for (const field of ["decisions", "screens", "screen_states", "domain_errors", "cache_policies", "degradation_rules"]) assert.equal(typeof namedReadback[field], "number", field);
    const [writeReadback] = toolRows(responses.find((response) => response.id === 7));
    const readbackRequests = [
      { jsonrpc: "2.0", id: 9, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "read-cypher", arguments: { query: verificationPlan.plan.readbackStatement, params: verificationPlan.plan.parameters } } },
    ];
    const readbackMcp = run(process.execPath, [launcher, "--binary", binary], {
      cwd: project,
      env: { NEO4J_URI: `bolt://127.0.0.1:${boltPort}`, NEO4J_USERNAME: "neo4j", NEO4J_DATABASE: "neo4j", NEO4J_TELEMETRY: "false" },
      input: `${readbackRequests.map((request) => JSON.stringify(request)).join("\n")}\n`,
    });
    assert.equal(readbackMcp.status, 0, `${readbackMcp.stdout}\n${readbackMcp.stderr}`);
    const readbackResponses = readbackMcp.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const readbackResponse = readbackResponses.find((response) => response.id === 10);
    assert.ok(readbackResponse?.result && !readbackResponse.error, `MCP readback: ${JSON.stringify(readbackResponse)}\nSTDERR:\n${readbackMcp.stderr}`);
    const [separateReadback] = toolRows(readbackResponse);
    assert.deepEqual(separateReadback, writeReadback);
    assert.equal(writeReadback.projectId, projectId);
    assert.equal(writeReadback.idempotencyKey, verificationPlan.plan.parameters.idempotencyKey);
    assert.equal(Number.isInteger(writeReadback.revision), true);
  } finally {
    run("docker", ["rm", "-f", container]);
    run("docker", ["network", "rm", network]);
    run("docker", ["volume", "rm", dataVolume]);
    run("docker", ["volume", "rm", logVolume]);
    await rm(temporary, { recursive: true, force: true });
  }
});

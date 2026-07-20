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

async function query(port, password, statement) {
  const response = await fetch(`http://127.0.0.1:${port}/db/neo4j/tx/commit`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`neo4j:${password}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ statements: [{ statement, parameters: {}, resultDataContents: ["row"] }] }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.errors, []);
  return body.results[0];
}

test("exact staged Skills-only tree bootstraps, reuses, and serves a new-process MCP read", { skip: !enabled, timeout: 600_000 }, async () => {
  const docker = run("docker", ["info"]);
  if (docker.status !== 0) return test.skip("Docker daemon is unavailable");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-skills-bootstrap-e2e-"));
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
    const runner = path.join(bundle, "skills", "nacl-init", "resources", "bootstrap", "setup-project-graph.sh");
    const args = [runner, "--project-root", project, "--project-id", projectId, "--bolt-port", String(boltPort), "--http-port", String(httpPort), "--confirmation", `INIT_LOCAL_GRAPH:${projectId}`];
    const first = run("sh", args, { cwd: project });
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.match(first.stdout, /NACL_SKILLS_ONLY_BOOTSTRAP: status=VERIFIED/);
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

    const second = run("sh", args, { cwd: project });
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.match(second.stdout, /NACL_BINARY_INSTALL: status=VERIFIED state=reusable/);
    assert.match(second.stdout, /NACL_SKILLS_ONLY_BOOTSTRAP: status=VERIFIED/);

    const launcher = path.join(project, "graph-infra", "scripts", "nacl-neo4j-mcp-launcher.mjs");
    const binary = await realpath(path.join(project, "graph-infra", "bin", "neo4j-mcp"));
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read-cypher", arguments: { query: "RETURN 1 AS ok", params: {} } } },
    ];
    const mcp = run(process.execPath, [launcher, "--binary", binary], {
      cwd: project,
      env: { NEO4J_URI: `bolt://127.0.0.1:${boltPort}`, NEO4J_USERNAME: "neo4j", NEO4J_DATABASE: "neo4j", NEO4J_TELEMETRY: "false" },
      input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
    });
    assert.equal(mcp.status, 0, `${mcp.stdout}\n${mcp.stderr}`);
    const responses = mcp.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const tools = responses.find((response) => response.id === 2)?.result?.tools ?? [];
    assert.ok(tools.some((tool) => tool.name === "read-cypher"), `${JSON.stringify(responses)}\nSTDERR:\n${mcp.stderr}`);
    const canary = responses.find((response) => response.id === 3);
    assert.ok(canary?.result && !canary.error, JSON.stringify(canary));
    assert.match(JSON.stringify(canary.result), /ok/);
  } finally {
    run("docker", ["rm", "-f", container]);
    run("docker", ["network", "rm", network]);
    run("docker", ["volume", "rm", dataVolume]);
    run("docker", ["volume", "rm", logVolume]);
    await rm(temporary, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serviceRoot = path.join(repoRoot, "services", "nacl-mcp");

async function filesUnder(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) files.push(path.relative(root, filename).split(path.sep).join("/"));
      else assert.fail(`unsupported archive entry: ${filename}`);
    }
  }
  await visit(root);
  return files;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

test("deterministic public MCP archive is exact, self-testing, and checkout-independent", async () => {
  run("npm", ["run", "build"], serviceRoot);
  const archive = path.join(serviceRoot, "dist", "nacl-public-mcp-bundle.tar");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-public-mcp-archive-"));
  try {
    run("tar", ["-xf", archive, "-C", temporary], repoRoot);
    const actual = await filesUnder(temporary);
    const manifest = JSON.parse(await readFile(path.join(temporary, "bundle-manifest.json"), "utf8"));
    const order = (left, right) => left.localeCompare(right);
    assert.deepEqual(actual, [...manifest.sourceFiles.map((record) => record.path), "bundle-manifest.json"].sort(order));
    const listed = run("tar", ["-tf", archive], repoRoot).stdout.trim().split(/\r?\n/).sort(order);
    assert.deepEqual(listed, actual);
    assert.ok(actual.includes("services/nacl-mcp/scripts/build-bundle.mjs"));
    assert.ok(actual.includes("services/nacl-mcp/test/transport-contract.test.mjs"));

    const extractedService = path.join(temporary, "services", "nacl-mcp");
    run("npm", ["ci", "--ignore-scripts"], extractedService);
    run("npm", ["test"], extractedService);
    run("npm", ["run", "check"], extractedService);
    run(process.execPath, ["--input-type=module", "-e", "const s=await import('./src/service.mjs'); const e=await import('./src/entrypoint.mjs'); if(typeof s.createNaclMcpService!=='function'||typeof e.loadDeployment!=='function'||typeof e.main!=='function') process.exit(1)"], extractedService);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

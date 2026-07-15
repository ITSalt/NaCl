import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function source(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function contractBlock(ciScript) {
  const start = ciScript.indexOf("  test:contracts)");
  const end = ciScript.indexOf("\n    ;;", start);
  assert.notEqual(start, -1, "test:contracts case is missing");
  assert.notEqual(end, -1, "test:contracts case is unterminated");
  return ciScript.slice(start, end);
}

test("generic, Claude, and Codex workflows retain separate owners", async () => {
  const [generic, claude, codex] = await Promise.all([
    source(".github/workflows/test-tools.yml"),
    source(".github/workflows/build-plugin.yml"),
    source(".github/workflows/test-codex-plugin.yml"),
  ]);

  const genericSelections = generic.split(/\r?\n/).filter((line) => line.includes("git ls-files"));
  assert.equal(genericSelections.length, 4, "generic workflow must retain Node, bash-test, bash-syntax, and PowerShell selections");
  for (const selection of genericSelections) {
    assert.match(selection, /':!plugin\/\*\*'/, selection);
    assert.match(selection, /':!tests\/codex-plugin\/\*\*'/, selection);
  }
  for (const marker of [
    "pwsh-syntax:",
    "shell: pwsh",
    "Resolve-Path -LiteralPath",
    "System.Management.Automation.Language.Parser]::ParseFile",
    "foreach ($f in $files)",
    "exit $failed",
  ]) assert.ok(generic.includes(marker), `generic PowerShell job lost: ${marker}`);

  assert.match(claude, /name: Build Plugin/);
  assert.match(claude, /node scripts\/build-plugin\.mjs --check/);
  assert.match(claude, /node --test scripts\/build-plugin\.test\.mjs/);
  assert.doesNotMatch(claude, /build-codex-plugin/);

  assert.match(codex, /name: Test Codex Plugin Contracts/);
  assert.match(codex, /node-version: '20'/);
  assert.match(codex, /python-version: '3\.11\.9'/);
  assert.match(codex, /--require-hashes/);
  assert.match(codex, /tests\/codex-plugin\/requirements-validator\.txt/);
  assert.match(codex, /node scripts\/build-codex-plugin\.mjs --check/);
  assert.match(codex, /node --test scripts\/build-codex-plugin\.test\.mjs/);
  assert.match(codex, /node --test tests\/codex-plugin\/scripts\/codex-source-drift\.test\.mjs/);
  assert.doesNotMatch(codex, /check-root-codex-sync\.sh/);
  for (const entryPoint of [
    "test:contracts",
    "test:codex-skills",
    "test:plugin-manifest",
    "test:plugin-package",
    "test:plugin-closure",
    "test:plugin-docs",
    "test:graph-unit",
    "test:workflow-integration",
  ]) assert.ok(codex.includes(entryPoint), `dedicated Codex workflow lost ${entryPoint}`);

  const isolationCalls = codex
    .split(/\r?\n/)
    .filter((line) => line.includes("test:claude-isolation"))
    .map((line) => line.trim());
  assert.deepEqual(isolationCalls, ["run: bash scripts/codex-plugin-ci.sh test:claude-isolation"]);
});

test("test:contracts is a closed Codex inventory with Docker opt-in skips preserved", async () => {
  const ciScript = await source("scripts/codex-plugin-ci.sh");
  const contracts = contractBlock(ciScript);
  assert.match(contracts, /node_tests=\(/);
  assert.match(contracts, /shell_tests=\(/);
  assert.doesNotMatch(contracts, /git ls-files/);
  assert.doesNotMatch(contracts, /scripts\/build-plugin\.test\.mjs/);
  assert.doesNotMatch(contracts, /(?:^|\s)plugin\/\*\*/m);
  assert.ok(contracts.includes("scripts/build-codex-plugin.test.mjs"));

  const testDirectory = path.join(repoRoot, "tests", "codex-plugin", "scripts");
  const entries = await readdir(testDirectory, { withFileTypes: true });
  const nodeTests = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => `tests/codex-plugin/scripts/${entry.name}`)
    .sort();
  const shellTests = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.sh"))
    .map((entry) => `tests/codex-plugin/scripts/${entry.name}`)
    .sort();
  for (const filename of [...nodeTests, ...shellTests]) {
    assert.ok(contracts.includes(filename), `test:contracts does not own ${filename}`);
  }

  assert.equal((ciScript.match(/NACL_RUN_DOCKER_SMOKE/g) ?? []).length, 10);
  for (const entryPoint of ["test:graph-local-e2e", "test:multi-project", "test:multi-user", "test:production-mcp-docker", "test:production-mcp-container"]) {
    assert.ok(ciScript.includes(entryPoint), `Docker opt-in entry point was removed: ${entryPoint}`);
  }
});

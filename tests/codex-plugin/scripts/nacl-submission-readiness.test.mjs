import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = path.join(repoRoot, "codex-plugin-src", "package");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");

async function json(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

async function treeDigest(root) {
  const records = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) records.push(`${path.relative(root, filename).split(path.sep).join("/")}\0${createHash("sha256").update(await readFile(filename)).digest("hex")}`);
      else assert.fail(`unsupported artifact entry: ${filename}`);
    }
  }
  await visit(root);
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

test("submission disclosure is local-only, Skills-only, and byte-identical in generated package", async () => {
  const [flow, metadata] = await Promise.all([
    json(sourceRoot, "submission/data-flow-security.json"),
    json(sourceRoot, "submission/release-candidate-metadata.json"),
  ]);
  for (const relative of [
    "submission/data-flow-security.json",
    "submission/data-flow-security.md",
    "submission/release-candidate-metadata.json",
  ]) assert.deepEqual(await readFile(path.join(pluginRoot, relative)), await readFile(path.join(sourceRoot, relative)), relative);
  assert.equal(flow.submissionType, "SKILLS_ONLY");
  assert.equal(flow.productionPolicyStatus, "NOT_APPLICABLE_NO_HOSTED_SERVICE");
  assert.deepEqual(flow.topology.publicEndpoint, null);
  assert.deepEqual(flow.topology.oauth, null);
  assert.deepEqual(flow.topology.authorHostedService, null);
  assert.deepEqual(flow.flows.map(({ externalToUserMachine }) => externalToUserMachine), [true, false, false]);
  assert.match(flow.topology.graph, /per initialized project/);
  assert.match(flow.topology.mcp, /project-local stdio/);
  assert.equal(metadata.submissionType, "SKILLS_ONLY");
  assert.equal(metadata.status, "NOT_READY_FOR_SUBMISSION");
  assert.equal(metadata.freezeStatus, "PREFREEZE_NOT_BOUND");
  assert.equal(metadata.localRuntime.publicMcp, false);
  assert.equal(metadata.localRuntime.secretInMcpConfig, false);
  assert.equal(metadata.localRuntime.newTaskAfterInit, true);
  assert.equal(metadata.localRuntime.hotReloadClaimed, false);
  assert.equal(metadata.releaseBindings.publicEndpoint.status, "NOT_APPLICABLE");
});

test("two external Skills-only builds are deterministic and independently validate", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-skills-only-submission-"));
  try {
    const first = path.join(temporary, "first");
    const second = path.join(temporary, "second");
    run(process.execPath, ["scripts/build-codex-skills-only.mjs", "--output", first]);
    run(process.execPath, ["scripts/build-codex-skills-only.mjs", "--output", second]);
    assert.equal(await treeDigest(first), await treeDigest(second));
    const checker = path.join(repoRoot, "scripts", "check-skills-only-bundle.mjs");
    run(process.execPath, [checker, "--bundle-root", first], os.tmpdir());
    const manifest = await json(first, ".codex-plugin/plugin.json");
    assert.equal(manifest.skills, "./skills/");
    assert.equal(Object.hasOwn(manifest, "mcpServers"), false);
    assert.equal(Object.hasOwn(manifest, "apps"), false);
    await assert.rejects(readFile(path.join(first, ".mcp.json")), /ENOENT/);
    const skills = (await readdir(path.join(first, "skills"), { withFileTypes: true })).filter((entry) => entry.isDirectory());
    assert.equal(skills.length, 10);
    for (const skill of skills) {
      const entry = await readFile(path.join(first, "skills", skill.name, "SKILL.md"), "utf8");
      assert.doesNotMatch(entry, /\.\.\/\.\.\/resources|nacl_installation_doctor|\/(?:Users|home)\//);
      for (const closure of ["resources", "graph", "runtime"]) {
        assert.ok((await readdir(path.join(first, "skills", skill.name, closure))).length > 0, `${skill.name}/${closure}`);
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("submission artifacts contain no hosted endpoint, OAuth identity, reviewer credentials, or bound secret", async () => {
  const combined = (await Promise.all([
    "submission/data-flow-security.json",
    "submission/data-flow-security.md",
    "submission/release-candidate-metadata.json",
  ].map((relative) => readFile(path.join(sourceRoot, relative), "utf8")))).join("\n");
  assert.doesNotMatch(combined, /plugin_asdk_app_|client_id|client_secret|access_token|bearer\s+[A-Za-z0-9._-]+|\/(?:Users|home)\//i);
  assert.doesNotMatch(combined, /https:\/\/[^\s"`]+\/mcp/i);
  assert.doesNotMatch(combined, /\b[0-9a-f]{40}\b|sha256:[0-9a-f]{64}/i);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = path.join(repoRoot, "codex-plugin-src", "package");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const manifestPath = ".codex-plugin/plugin.json";
const expectedPrompts = [
  "Check my NaCl project and summarize its delivery status.",
  "Analyze this feature request and route it through the right NaCl workflow.",
  "Verify this NaCl change and report specification or test gaps.",
];
const expectedInterface = {
  displayName: "NaCl",
  shortDescription: "Analyze, plan, deliver, and verify software with NaCl.",
  longDescription: "Use bounded NaCl skills and project-scoped graph workflows to analyze requirements, design systems, plan delivery, implement changes, and verify evidence without exposing infrastructure credentials or arbitrary graph queries.",
  developerName: "NaCl contributors",
  category: "Developer Tools",
  capabilities: ["Analysis", "Planning", "Delivery", "Verification", "Read", "Write"],
  defaultPrompt: expectedPrompts,
  brandColor: "#0F766E",
  composerIcon: "./assets/composer-icon.png",
  logo: "./assets/logo.png",
  logoDark: "./assets/logo-dark.png",
};
const expectedPackageMetadata = {
  repository: "https://github.com/ITSalt/NaCl",
  license: "MIT",
  keywords: ["developer-tools", "software-delivery", "systems-analysis", "verification"],
};

function run(command, arguments_, cwd = repoRoot) {
  const result = spawnSync(command, arguments_, { cwd, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, `${command} ${arguments_.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function treeDigest(root) {
  const records = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) {
        const relative = path.relative(root, filename).split(path.sep).join("/");
        const digest = createHash("sha256").update(await readFile(filename)).digest("hex");
        records.push(`${relative}\0${digest}`);
      } else assert.fail(`unsupported package entry: ${filename}`);
    }
  }
  await visit(root);
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

test("plugin interface metadata is stable, honest, and backed by deterministic PNG assets", async () => {
  const [source, packaged, marketplace] = await Promise.all([
    readJson(path.join(sourceRoot, manifestPath)),
    readJson(path.join(pluginRoot, manifestPath)),
    readJson(path.join(repoRoot, ".agents", "plugins", "marketplace.json")),
  ]);
  assert.deepEqual(source, packaged);
  assert.deepEqual(packaged.interface, expectedInterface);
  for (const [key, value] of Object.entries(expectedPackageMetadata)) assert.deepEqual(packaged[key], value);
  assert.equal(expectedPrompts.length, 3);
  for (const prompt of expectedPrompts) assert.ok(prompt.length > 20 && prompt.length <= 128);
  assert.equal(Object.hasOwn(packaged.interface, "screenshots"), false);
  for (const field of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    assert.equal(Object.hasOwn(packaged.interface, field), false);
  }
  for (const field of ["homepage", "website", "privacyPolicy", "termsOfService"]) {
    assert.equal(Object.hasOwn(packaged, field), false);
  }
  assert.equal(Object.hasOwn(packaged, "apps"), false);
  assert.equal(marketplace.plugins[0].category, "Developer Tools");

  run(process.execPath, ["scripts/generate-codex-plugin-assets.mjs", "--check"]);
  const expectedDimensions = new Map([
    ["./assets/composer-icon.png", 128],
    ["./assets/logo.png", 256],
    ["./assets/logo-dark.png", 256],
  ]);
  for (const [relative, dimension] of expectedDimensions) {
    const content = await readFile(path.resolve(pluginRoot, relative));
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(content.readUInt32BE(16), dimension);
    assert.equal(content.readUInt32BE(20), dimension);
  }
});

test("two clean builds are byte-identical and pass the pinned OpenAI plugin validator", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-interface-build-"));
  try {
    const first = path.join(temporary, "first");
    const second = path.join(temporary, "second");
    run(process.execPath, ["scripts/build-codex-plugin.mjs", "--output", first]);
    run(process.execPath, ["scripts/build-codex-plugin.mjs", "--output", second]);
    assert.equal((await stat(first)).isDirectory(), true);
    assert.equal(await treeDigest(first), await treeDigest(second));
    const validator = path.join(repoRoot, "tests", "codex-plugin", "vendor", "openai-codex", "plugin-validator-ebda00d5", "validate_plugin.py");
    run("python3", [validator, first]);
    const manifest = await readFile(path.join(first, manifestPath), "utf8");
    assert.doesNotMatch(manifest, /plugin_asdk_app_|example\.com|screenshots/);
    await assert.rejects(readFile(path.join(first, ".app.json")), /ENOENT/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

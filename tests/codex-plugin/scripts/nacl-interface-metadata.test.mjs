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
  shortDescription: "Develop without IT-specialists",
  longDescription: "NaCl (reading as Natrium Chloride) is an open-source full-SDLC framework, and its core innovation is how it solves the hardest problem in agentic development: storing and retrieving project knowledge. Instead of markdown specs that agents must re-read every session, all project knowledge — requirements, architecture decisions, entities, rules, and their relationships — lives in a Neo4j knowledge graph as first-class queryable objects. The measured effect: planning a single use case takes ~550 tokens (one targeted Cypher query) instead of ~150,000 tokens (reading a ~70-file markdown spec, because the agent doesn't know in advance where the relevant facts live) — a 99.6% reduction in context per use case, repeated in every planning session.\n\nAround the graph we've built the full tooling for agentic development and testing: 57 skills covering BA → SA → TDD development → review → QA → release, quality gates before production, and an autonomous goal orchestrator (/nacl-goal). The framework answers \"how is this built and why\" for any part of the system, regardless of project scale or iteration count. Benchmarked on a real production project (EV charging station management): a classical team was estimated at 5,831 person-hours; running fully on NaCl the same scope takes 1,480 person-hours — 4x fewer person-hours and 60% lower cost.",
  developerName: "ITSalt",
  category: "Developer Tools",
  capabilities: ["Analysis", "Planning", "Delivery", "Verification", "Read", "Write"],
  defaultPrompt: expectedPrompts,
  brandColor: "#0F766E",
  websiteURL: "https://github.com/ITSalt/NaCl",
  privacyPolicyURL: "https://github.com/ITSalt/NaCl/blob/main/PRIVACY.md",
  termsOfServiceURL: "https://github.com/ITSalt/NaCl/blob/main/TERMS.md",
  composerIcon: "./assets/composer-icon.png",
  logo: "./assets/logo.png",
  logoDark: "./assets/logo-dark.png",
};
const expectedPackageMetadata = {
  author: { name: "ITSalt", url: "https://github.com/ITSalt" },
  homepage: "https://github.com/ITSalt/NaCl",
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
    assert.match(packaged.interface[field], /^https:\/\//);
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

test("Skills-only bundle retains the public listing metadata", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-skills-only-listing-"));
  try {
    const output = path.join(temporary, "bundle");
    run(process.execPath, ["scripts/build-codex-skills-only.mjs", "--output", output]);
    const [source, bundled] = await Promise.all([
      readJson(path.join(sourceRoot, manifestPath)),
      readJson(path.join(output, manifestPath)),
    ]);
    assert.equal(bundled.description, source.description);
    assert.equal(bundled.interface.shortDescription, expectedInterface.shortDescription);
    assert.equal(bundled.interface.longDescription, expectedInterface.longDescription);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(repoRoot, "plugins", "nacl");
const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
const indexPath = path.join(pluginRoot, "resources", "package-index.json");
const validatorVendorRoot = path.join(
  repoRoot,
  "tests",
  "codex-plugin",
  "vendor",
  "openai-codex",
  "plugin-validator-ebda00d5",
);

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function resolveInside(root, relativePath) {
  assert.equal(typeof relativePath, "string");
  const resolved = path.resolve(root, relativePath);
  assert.ok(resolved === root || resolved.startsWith(`${root}${path.sep}`));
  return resolved;
}

function skillFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "skill frontmatter is required");
  const values = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1).trim();
  }
  return values;
}

async function skillHashes(root) {
  const hashes = {};
  const entries = await readdir(path.join(root, "skills"), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const content = await readFile(path.join(root, "skills", entry.name, "SKILL.md"));
    hashes[entry.name] = createHash("sha256").update(content).digest("hex");
  }
  return Object.fromEntries(Object.entries(hashes).sort());
}

test("manifest, marketplace, and MCP companion describe the real nacl package", async () => {
  const [manifest, marketplace, mcp] = await Promise.all([
    readJson(manifestPath),
    readJson(marketplacePath),
    readJson(path.join(pluginRoot, ".mcp.json")),
  ]);
  assert.equal(manifest.name, "nacl");
  assert.match(manifest.version, /^0\.1\.0\+codex\.[0-9A-Za-z.-]+$/);
  assert.equal(manifest.description.includes("compatibility spike"), false);
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal("hooks" in manifest, false);
  assert.equal("apps" in manifest, false);
  await lstat(resolveInside(pluginRoot, manifest.skills));
  await lstat(resolveInside(pluginRoot, manifest.mcpServers));

  assert.equal(marketplace.name, "nacl-local");
  assert.equal(marketplace.interface?.displayName, "NaCl");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "nacl");
  assert.equal(resolveInside(repoRoot, marketplace.plugins[0].source.path), pluginRoot);
  assert.deepEqual(marketplace.plugins[0].policy, {
    installation: "AVAILABLE",
    authentication: "ON_INSTALL",
  });

  assert.deepEqual(mcp, {
    mcpServers: {
      nacl: {
        command: "node",
        args: ["./scripts/nacl-package-mcp.mjs"],
        cwd: ".",
      },
    },
  });
});

test("public discovery stays within the bounded ten-skill routing budget", async () => {
  const [index, routing] = await Promise.all([
    readJson(indexPath),
    readJson(path.join(pluginRoot, "resources", "references", "routing-prompts.json")),
  ]);
  const directories = (await readdir(path.join(pluginRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(directories.length, 10);
  assert.deepEqual(directories, [...index.publicEntrySkills].sort());

  let descriptionBytes = 0;
  const descriptions = new Set();
  for (const directory of directories) {
    const content = await readFile(path.join(pluginRoot, "skills", directory, "SKILL.md"), "utf8");
    const frontmatter = skillFrontmatter(content);
    assert.equal(frontmatter.name, directory);
    assert.ok(frontmatter.description.length >= 80);
    assert.equal(descriptions.has(frontmatter.description), false);
    descriptions.add(frontmatter.description);
    descriptionBytes += Buffer.byteLength(frontmatter.description);
    assert.doesNotMatch(content, /nacl_installation_doctor/);
    assert.match(content, /skills-only-runtime-contract\.md/);
    if (directory === "nacl-init") assert.match(content, /setup-project-graph\.(?:sh|ps1)/);
    else assert.match(content, /PROJECT_MCP_NOT_CONFIGURED/);
    if (directory !== "nacl-init") assert.match(content, /resources\/workflows/);
    assert.doesNotMatch(content, /\bmodel\s*:/i);
  }
  assert.ok(descriptionBytes <= 2048, `description budget is ${descriptionBytes} bytes`);
  assert.equal(routing.cases.length, 10);
  assert.deepEqual(
    [...new Set(routing.cases.map((item) => item.skill))].sort(),
    directories,
  );
});

test("package index includes all 60 internal workflows and critical resource classes", async () => {
  const index = await readJson(indexPath);
  assert.equal(index.internalWorkflows.length, 60);
  assert.equal(new Set(index.internalWorkflows).size, 60);
  for (const workflow of index.internalWorkflows) {
    await lstat(path.join(pluginRoot, "resources", "workflows", workflow, "SKILL.md"));
  }
  for (const field of ["contracts", "templates", "schemas", "queries", "workflowRuntime", "deterministicScripts"]) {
    assert.ok(index[field].length > 0, field);
    for (const filename of index[field]) await lstat(resolveInside(pluginRoot, filename));
  }
});

test("every legacy-discovered workflow reaches the double-install preflight", async () => {
  const legacyRoot = path.join(repoRoot, "skills-for-codex");
  const entries = (await readdir(legacyRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("nacl-"));
  assert.equal(entries.length, 60);
  for (const entry of entries) {
    const skillPath = path.join(legacyRoot, entry.name, "SKILL.md");
    const content = await readFile(skillPath, "utf8");
    const directlyGuarded = content.includes("nacl_installation_doctor");
    const loadsGuardedCore =
      content.includes("nacl-core/SKILL.md") || content.includes("nacl-tl-core/SKILL.md");
    assert.ok(directlyGuarded || loadsGuardedCore, `${entry.name} bypasses install preflight`);
    if (directlyGuarded) {
      assert.match(content, /nacl-installation-fallback\.mjs/, `${entry.name} lacks fallback`);
      assert.match(content, /codex plugin list --json/, `${entry.name} lacks catalog evidence`);
      assert.match(content, /never from the project cwd/);
      assert.doesNotMatch(content, /supported legacy-only mode/);
      const command = content.match(/`node ([^`\s]*nacl-installation-fallback\.mjs)`/);
      assert.ok(command, `${entry.name} lacks an exact fallback command`);
      const helper = path.resolve(path.dirname(skillPath), command[1]);
      assert.equal((await lstat(helper)).isFile(), true, `${entry.name} fallback is missing`);
    }
  }
});

test("legacy and packaged catalog fallback implementations are byte-identical", async () => {
  const [legacy, packaged] = await Promise.all([
    readFile(path.join(repoRoot, "skills-for-codex", "nacl-core", "scripts", "nacl-installation-fallback.mjs")),
    readFile(path.join(pluginRoot, "resources", "nacl-core", "scripts", "nacl-installation-fallback.mjs")),
  ]);
  assert.deepEqual(packaged, legacy);
});

test("strict plugin closure gate passes", () => {
  const result = spawnSync("node", ["scripts/check-plugin-closure.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Status: VERIFIED/);
  assert.match(result.stdout, /Internal workflows: 60/);
  assert.match(result.stdout, /Markdown inline code paths: [1-9][0-9]*/);
  assert.match(result.stdout, /Markdown command paths: 0/);
});

test("closure rejects a missing active inline-code target", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-closure-inline-"));
  try {
    const copiedRoot = path.join(tempRoot, "nacl");
    await cp(pluginRoot, copiedRoot, { recursive: true });
    const skillPath = path.join(copiedRoot, "resources", "workflows", "nacl-goal", "SKILL.md");
    const content = await readFile(skillPath, "utf8");
    const expected = "../../nacl-tl-core/references/intake-scoring.md";
    assert.ok(content.includes(expected));
    await writeFile(
      skillPath,
      content.replace(expected, "../../nacl-tl-core/references/missing-intake-scoring.md"),
    );

    const result = spawnSync(
      "node",
      ["scripts/check-plugin-closure.mjs", "--plugin-root", copiedRoot],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /Markdown inline code path is missing:.*missing-intake-scoring\.md/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("closure rejects a cwd-dependent active command even when its package target exists", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-closure-command-"));
  try {
    const copiedRoot = path.join(tempRoot, "nacl");
    await cp(pluginRoot, copiedRoot, { recursive: true });
    const skillPath = path.join(copiedRoot, "resources", "workflows", "nacl-init", "SKILL.md");
    const content = await readFile(skillPath, "utf8");
    await writeFile(
      skillPath,
      `${content}\n\n\`\`\`sh\nnode ../../nacl-tl-core/scripts/graph-mode.mjs\n\`\`\`\n`,
    );

    const result = spawnSync(
      "node",
      ["scripts/check-plugin-closure.mjs", "--plugin-root", copiedRoot],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /cwd-dependent active command is forbidden:.*graph-mode\.mjs/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("source-unavailable cached copy remains closure-safe from an arbitrary project cwd", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-closure-cache-cwd-"));
  try {
    const copiedRoot = path.join(tempRoot, "cache", "nacl");
    const arbitraryProject = path.join(tempRoot, "project");
    await cp(pluginRoot, copiedRoot, { recursive: true });
    await (await import("node:fs/promises")).mkdir(arbitraryProject, { recursive: true });
    const result = spawnSync(
      "node",
      [path.join(repoRoot, "scripts", "check-plugin-closure.mjs"), "--plugin-root", await realpath(copiedRoot)],
      { cwd: arbitraryProject, encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Status: VERIFIED/);
    assert.match(result.stdout, /Markdown command paths: 0/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("an isolated archive copy has byte-identical CLI/Desktop entry skills", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-package-copy-"));
  try {
    const copiedRoot = path.join(tempRoot, "cache", "nacl");
    await cp(pluginRoot, copiedRoot, { recursive: true });
    assert.notEqual(await realpath(copiedRoot), await realpath(pluginRoot));
    assert.deepEqual(await skillHashes(copiedRoot), await skillHashes(pluginRoot));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pinned official plugin validator provenance remains unchanged", async () => {
  const hashes = {
    "validate_plugin.py": "ebda00d55d7518b127f675f062fb5c6e7a1ffdc0a99df1a55ac594400d7d3228",
    LICENSE: "d17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc",
    NOTICE: "9d71575ecfd9a843fc1677b0efb08053c6ba9fd686a0de1a6f5382fd3c220915",
  };
  for (const [filename, expected] of Object.entries(hashes)) {
    const actual = createHash("sha256")
      .update(await readFile(path.join(validatorVendorRoot, filename)))
      .digest("hex");
    assert.equal(actual, expected, filename);
  }
});

#!/usr/bin/env node

import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(repoRoot, "plugins", "nacl");

function inside(root, filename) {
  const resolved = path.resolve(filename);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") options.output = path.resolve(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.output) throw new Error("--output <external-directory> is required");
  if (inside(repoRoot, options.output)) throw new Error("Skills-only output must be outside the repository");
  return options;
}

async function copyTree(source, destination) {
  const canonicalSource = await realpath(source);
  if (!inside(packageRoot, canonicalSource)) throw new Error(`Source escapes generated package: ${source}`);
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      const metadata = await lstat(filename);
      if (metadata.isSymbolicLink()) throw new Error(`Source symlink is forbidden: ${filename}`);
      if (metadata.isDirectory()) await inspect(filename);
      else if (!metadata.isFile()) throw new Error(`Unsupported source entry: ${filename}`);
    }
  }
  await inspect(source);
  await cp(source, destination, { recursive: true, preserveTimestamps: false });
}

function skillsOnlyManifest(source) {
  const manifest = structuredClone(source);
  delete manifest.mcpServers;
  delete manifest.apps;
  manifest.description = "Self-contained NaCl skills with confirmed local per-project Neo4j and project MCP bootstrap";
  manifest.skills = "./skills/";
  manifest.interface = {
    ...manifest.interface,
    longDescription: "Install NaCl skills, then run nacl-init to create a loopback-only per-project Neo4j Community stack and secret-safe project-local neo4j MCP without a public MCP service or second plugin install.",
  };
  return manifest;
}

async function build(destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.join(destination, ".codex-plugin"), { recursive: true });
  const sourceManifest = JSON.parse(await readFile(path.join(packageRoot, ".codex-plugin", "plugin.json"), "utf8"));
  await writeFile(
    path.join(destination, ".codex-plugin", "plugin.json"),
    `${JSON.stringify(skillsOnlyManifest(sourceManifest), null, 2)}\n`,
    { encoding: "utf8", mode: 0o644 },
  );
  await copyTree(path.join(packageRoot, "assets"), path.join(destination, "assets"));
  await cp(path.join(packageRoot, "LICENSE"), path.join(destination, "LICENSE"), { preserveTimestamps: false });

  const skillNames = (await readdir(path.join(packageRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const skillName of skillNames) {
    const skillRoot = path.join(destination, "skills", skillName);
    await mkdir(skillRoot, { recursive: true });
    const source = await readFile(path.join(packageRoot, "skills", skillName, "SKILL.md"), "utf8");
    const rewritten = source.replaceAll("../../resources/", "resources/");
    if (rewritten.includes("../../resources/")) throw new Error(`${skillName}: resource rewrite failed`);
    await writeFile(path.join(skillRoot, "SKILL.md"), rewritten, { encoding: "utf8", mode: 0o644 });
    for (const directory of ["resources", "graph", "runtime"]) {
      await copyTree(path.join(packageRoot, directory), path.join(skillRoot, directory));
    }
  }
  return skillNames;
}

async function main() {
  const options = parse(process.argv.slice(2));
  const parent = path.dirname(options.output);
  await mkdir(parent, { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(parent, ".nacl-skills-only-"));
  const staging = path.join(temporaryRoot, "nacl-skills-only");
  try {
    const skills = await build(staging);
    await rm(options.output, { recursive: true, force: true });
    await cp(staging, options.output, { recursive: true, preserveTimestamps: false });
    process.stdout.write(`Built Skills-only bundle at ${options.output} (${skills.length} self-contained skills).\n`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();

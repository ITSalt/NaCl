#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

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
    else if (argv[index] === "--archive-output") options.archiveOutput = path.resolve(argv[++index] ?? "");
    else if (argv[index] === "--source-sha") options.sourceSha = argv[++index] ?? "";
    else if (argv[index] === "--archive-layout") options.archiveLayout = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.output) throw new Error("--output <external-directory> is required");
  if (inside(repoRoot, options.output)) throw new Error("Skills-only output must be outside the repository");
  if (options.archiveOutput && inside(repoRoot, options.archiveOutput)) throw new Error("Skills-only archive must be outside the repository");
  if (new Set([Boolean(options.archiveOutput), Boolean(options.sourceSha), Boolean(options.archiveLayout)]).size !== 1) throw new Error("--archive-output, --source-sha, and --archive-layout must be provided together");
  if (options.sourceSha && !/^[0-9a-f]{40}$/.test(options.sourceSha)) throw new Error("--source-sha must be an exact lowercase Git commit SHA");
  if (options.archiveLayout && options.archiveLayout !== "plugin-root") throw new Error("Portal archive layout is not frozen; use plugin-root only after live uploader verification");
  return options;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipHeader(signature, size) {
  const result = Buffer.alloc(size);
  result.writeUInt32LE(signature, 0);
  return result;
}

async function artifactFiles(root) {
  const records = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      const metadata = await lstat(filename);
      if (metadata.isSymbolicLink()) throw new Error(`Archive symlink is forbidden: ${filename}`);
      if (metadata.isDirectory()) await visit(filename);
      else if (metadata.isFile()) {
        const bytes = await readFile(filename);
        records.push({
          filename,
          path: path.relative(root, filename).split(path.sep).join("/"),
          mode: metadata.mode & 0o111 ? "0755" : "0644",
          size: bytes.length,
          sha256: sha256(bytes),
          bytes,
        });
      } else throw new Error(`Unsupported archive entry: ${filename}`);
    }
  }
  await visit(root);
  return records;
}

function payloadTreeSha(records) {
  return sha256(Buffer.from(records.map(({ path: relative, mode, size, sha256: digest }) => `${relative}\0${mode}\0${size}\0${digest}`).join("\n"), "utf8"));
}

async function writeDeterministicZip(root, output) {
  const records = await artifactFiles(root);
  const local = [];
  const central = [];
  let offset = 0;
  for (const record of records) {
    const name = Buffer.from(record.path, "utf8");
    const compressed = deflateRawSync(record.bytes, { level: 9 });
    const crc = crc32(record.bytes);
    const localHeader = zipHeader(0x04034b50, 30);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x5021, 12); // 2020-01-01, 00:00:00 UTC-equivalent fixed DOS fields.
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(record.bytes.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, compressed);

    const centralHeader = zipHeader(0x02014b50, 46);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5021, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(record.bytes.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((Number.parseInt(record.mode, 8) & 0xffff) << 16, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }
  if (records.length > 0xffff) throw new Error("ZIP64 is not supported for this artifact");
  const centralBytes = Buffer.concat(central);
  const end = zipHeader(0x06054b50, 22);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  await mkdir(path.dirname(output), { recursive: true });
  const archive = Buffer.concat([...local, centralBytes, end]);
  await writeFile(output, archive, { mode: 0o644 });
  return { fileCount: records.length, size: archive.length, sha256: sha256(archive) };
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

const textExtensions = new Set([".md", ".mjs", ".js", ".cjs", ".sh", ".ps1", ".json", ".yml", ".yaml", ".toml", ".txt", ".pin"]);
const groupSeeds = Object.freeze({
  "nacl-ba": [/^nacl-ba-/],
  "nacl-sa": [/^nacl-sa-/],
  "nacl-tl": [/^nacl-tl-/],
  "nacl-publish": [/^nacl-publish$/, /^nacl-render$/, /^nacl-tl-(?:release|deploy|ship)$/],
  "nacl-migrate": [/^nacl-migrate(?:-|$)/],
  "nacl-goal": [/^nacl-goal$/],
  "nacl-fix": [/^nacl-tl-fix$/],
  "nacl-diagnose": [/^nacl-tl-diagnose$/],
  "nacl-verify": [/^nacl-tl-verify(?:-|$)/],
});

function rewriteSkillsOnlyText(source, relative = "") {
  let rewritten = source
    .replaceAll("nacl_installation_doctor", "project MCP read canary")
    .replace(/`nacl_graph_([a-z_]+)`/g, (_match, operation) => `\`project MCP ${operation.replaceAll("_", " ")} operation\``)
    .replace(/`nacl_project_([a-z_]+)`/g, (_match, operation) => `\`project identity ${operation.replaceAll("_", " ")} operation\``)
    .replace(/`nacl_agent_profiles_([a-z_]+)`/g, (_match, operation) => `\`agent profile ${operation.replaceAll("_", " ")} operation\``)
    .replace(/package MCP\s+`project MCP read canary`/g, "project-local MCP read canary")
    .replaceAll(".mcp.json", ".codex/config.toml");
  if (relative === path.join("resources", "references", "workflow-gateway-map.json")) {
    const document = JSON.parse(rewritten);
    for (const binding of Object.values(document.sequences ?? {})) {
      if (Array.isArray(binding.tools)) binding.tools = binding.tools.map((tool) => {
        if (tool === "project MCP read canary") return "project-mcp-read-canary";
        const match = /^nacl_(?:legacy_symlinks|project|graph|agent_profiles)_([a-z_]+)$/.exec(tool);
        return match ? `project-mcp-cypher:${match[1].replaceAll("_", "-")}` : tool;
      });
    }
    rewritten = `${JSON.stringify(document, null, 2)}\n`;
  }
  return rewritten;
}

async function buildSkillClosure(skillName, skillRoot, sourceEntry) {
  const queued = new Set();
  const copied = new Set();
  const queue = [];
  const add = async (filename, reason, required = true) => {
    const resolved = path.resolve(filename);
    if (!inside(packageRoot, resolved)) throw new Error(`${skillName}: closure escapes generated package (${reason}: ${filename})`);
    let metadata;
    try { metadata = await lstat(resolved); } catch (error) {
      if (!required && error?.code === "ENOENT") return;
      throw new Error(`${skillName}: missing closure reference (${reason}: ${filename})`);
    }
    if (metadata.isSymbolicLink()) throw new Error(`${skillName}: closure symlink is forbidden (${filename})`);
    if (metadata.isDirectory()) {
      const entries = await readdir(resolved, { withFileTypes: true });
      entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)));
      for (const entry of entries) await add(path.join(resolved, entry.name), reason, required);
      return;
    }
    if (!metadata.isFile()) throw new Error(`${skillName}: unsupported closure entry (${filename})`);
    if (!queued.has(resolved)) { queued.add(resolved); queue.push(resolved); }
  };

  const entrySource = await readFile(sourceEntry, "utf8");
  const referencePattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*)?\)/g;
  const enqueueReferences = async (filename, source) => {
    for (const match of source.matchAll(referencePattern)) {
      const raw = match[1];
      if (/^(?:[a-z]+:|#)/i.test(raw) || /[{}<>]/.test(raw)) continue;
      let reference;
      try { reference = decodeURIComponent(raw.split(/[?#]/, 1)[0]); } catch { throw new Error(`${skillName}: malformed reference URI in ${filename}`); }
      if (!reference) continue;
      await add(path.resolve(path.dirname(filename), reference), `link from ${path.relative(packageRoot, filename)}`);
    }
  };
  await enqueueReferences(sourceEntry, entrySource);

  const workflowRoot = path.join(packageRoot, "resources", "workflows");
  for (const expression of groupSeeds[skillName] ?? []) {
    for (const entry of await readdir(workflowRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && expression.test(entry.name)) await add(path.join(workflowRoot, entry.name, "SKILL.md"), "public workflow allowlist");
    }
  }
  if (skillName === "nacl-init") {
    await add(path.join(packageRoot, "resources", "bootstrap"), "Skills-only bootstrap allowlist");
    await add(path.join(packageRoot, "resources", "graph-infra", "schema"), "bootstrap schema allowlist");
    await add(path.join(packageRoot, "resources", "graph-infra", "queries"), "bootstrap query allowlist");
    await add(path.join(packageRoot, "graph", "migrations"), "bootstrap migration allowlist");
  }

  while (queue.length > 0) {
    const filename = queue.shift();
    if (copied.has(filename)) continue;
    copied.add(filename);
    const relative = path.relative(packageRoot, filename);
    const target = path.join(skillRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    if (textExtensions.has(path.extname(filename).toLowerCase())) {
      const source = await readFile(filename, "utf8");
      const rewritten = rewriteSkillsOnlyText(source, relative);
      await writeFile(target, rewritten, { encoding: "utf8", mode: 0o644 });
      if (path.extname(filename).toLowerCase() === ".md") await enqueueReferences(filename, source);
      if (/\.(?:mjs|js|cjs)$/.test(filename)) {
        for (const match of source.matchAll(/(?:from\s+|import\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
          await add(path.resolve(path.dirname(filename), match[1]), `module import from ${relative}`);
        }
      }
    } else await cp(filename, target, { preserveTimestamps: false });
  }
  return copied.size;
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
    const rewritten = rewriteSkillsOnlyText(source.replaceAll("../../resources/", "resources/"));
    if (rewritten.includes("../../resources/")) throw new Error(`${skillName}: resource rewrite failed`);
    await writeFile(path.join(skillRoot, "SKILL.md"), rewritten, { encoding: "utf8", mode: 0o644 });
    await buildSkillClosure(skillName, skillRoot, path.join(packageRoot, "skills", skillName, "SKILL.md"));
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
    const manifest = JSON.parse(await readFile(path.join(staging, ".codex-plugin", "plugin.json"), "utf8"));
    const archiveName = `nacl-skills-only-${manifest.version}.zip`;
    if (options.archiveOutput && path.basename(options.archiveOutput) !== archiveName) {
      throw new Error(`Portal archive filename must be ${archiveName}`);
    }
    if (options.archiveOutput) {
      const payload = await artifactFiles(staging);
      const releaseManifest = {
        schemaVersion: 1,
        artifactType: "openai-skills-only-plugin",
        artifactName: archiveName,
        artifactLayout: options.archiveLayout,
        plugin: { name: manifest.name, version: manifest.version },
        source: {
          repository: "https://github.com/ITSalt/NaCl",
          commit: options.sourceSha,
          generatedPackage: "plugins/nacl",
        },
        payload: {
          fileCount: payload.length,
          treeSha256: payloadTreeSha(payload),
          files: payload.map(({ path: relative, mode, size, sha256: digest }) => ({ path: relative, mode, size, sha256: digest })),
        },
      };
      await writeFile(path.join(staging, "release-manifest.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`, { mode: 0o644 });
    }
    await rm(options.output, { recursive: true, force: true });
    await cp(staging, options.output, { recursive: true, preserveTimestamps: false });
    process.stdout.write(`Built Skills-only bundle at ${options.output} (${skills.length} self-contained skills).\n`);
    if (options.archiveOutput) {
      const archive = await writeDeterministicZip(staging, options.archiveOutput);
      process.stdout.write(`Portal archive: ${options.archiveOutput}\nSHA256: ${archive.sha256}\nBytes: ${archive.size}\nFiles: ${archive.fileCount}\n`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();

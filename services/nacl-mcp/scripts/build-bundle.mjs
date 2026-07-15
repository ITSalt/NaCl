#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(serviceRoot, "../..");
const outputRoot = path.join(serviceRoot, "dist");
const bundleName = "nacl-public-mcp-bundle";
const graphBoundary = ["authorization.mjs", "errors.mjs", "identity.mjs", "server-operation-authorization.mjs"];

function unix(value) { return value.split(path.sep).join("/"); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }

async function filesUnder(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) files.push(filename);
      else throw new Error(`Unsupported bundle source: ${filename}`);
    }
  }
  await visit(root);
  return files;
}

async function copyFile(source, root, relative) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  await writeFile(target, await readFile(source), { mode: 0o644 });
  await chmod(target, 0o644);
}

async function buildTree(root) {
  const records = [];
  const add = async (source, relative) => {
    await copyFile(source, root, relative);
    records.push({ path: relative, sha256: digest(await readFile(source)) });
  };
  for (const name of ["package.json", "package-lock.json", "README.md"]) {
    await add(path.join(serviceRoot, name), `services/nacl-mcp/${name}`);
  }
  for (const source of await filesUnder(path.join(serviceRoot, "src"))) {
    await add(source, `services/nacl-mcp/src/${unix(path.relative(path.join(serviceRoot, "src"), source))}`);
  }
  for (const name of graphBoundary) {
    await add(
      path.join(repoRoot, "codex-plugin-src/package/runtime/graph-gateway", name),
      `codex-plugin-src/package/runtime/graph-gateway/${name}`,
    );
  }
  await add(path.join(repoRoot, "LICENSE"), "LICENSE");
  records.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: 1,
    package: "@nacl/public-mcp",
    runtime: { node: ">=20.0.0", mcpSdk: "1.29.0", protocol: "2025-11-25" },
    entrypoint: "services/nacl-mcp/src/entrypoint.mjs",
    sourceFiles: records,
    sourceDigest: digest(records.map((record) => `${record.path}\0${record.sha256}`).join("\n")),
  };
  await writeFile(path.join(root, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  return manifest;
}

function octal(value, width) {
  const encoded = value.toString(8).padStart(width - 1, "0");
  if (encoded.length >= width) throw new Error("tar field overflow");
  return `${encoded}\0`;
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  let basename = name;
  let prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const index = name.lastIndexOf("/");
    prefix = name.slice(0, index);
    basename = name.slice(index + 1);
  }
  if (Buffer.byteLength(basename) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`tar path is too long: ${name}`);
  header.write(basename, 0, 100, "utf8");
  header.write(octal(0o644, 8), 100, 8, "ascii");
  header.write(octal(0, 8), 108, 8, "ascii");
  header.write(octal(0, 8), 116, 8, "ascii");
  header.write(octal(size, 12), 124, 12, "ascii");
  header.write(octal(0, 12), 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("root", 265, 32, "ascii");
  header.write("root", 297, 32, "ascii");
  header.write(prefix, 345, 155, "utf8");
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

async function archiveTree(root, destination) {
  const chunks = [];
  for (const filename of await filesUnder(root)) {
    const content = await readFile(filename);
    chunks.push(tarHeader(unix(path.relative(root, filename)), content.length), content);
    const remainder = content.length % 512;
    if (remainder) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  const archive = Buffer.concat(chunks);
  await writeFile(destination, archive, { mode: 0o644 });
  return digest(archive);
}

async function oneBuild(parent, name) {
  const root = path.join(parent, name);
  await mkdir(root, { recursive: true, mode: 0o755 });
  const manifest = await buildTree(root);
  const archive = path.join(parent, `${name}.tar`);
  const archiveSha256 = await archiveTree(root, archive);
  return { root, archive, sourceDigest: manifest.sourceDigest, archiveSha256 };
}

const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((value) => value !== "--check")) throw new Error("Only --check is supported.");
const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-public-mcp-build-"));
try {
  const first = await oneBuild(temporary, "first");
  const second = await oneBuild(temporary, "second");
  if (first.sourceDigest !== second.sourceDigest || first.archiveSha256 !== second.archiveSha256) {
    throw new Error("Public MCP bundle is not reproducible.");
  }
  if (check) {
    process.stdout.write(`Public MCP bundle is reproducible (${first.sourceDigest}, archive ${first.archiveSha256}).\n`);
  } else {
    await rm(second.root, { recursive: true, force: true });
    await rm(second.archive, { force: true });
    await rename(first.root, path.join(temporary, bundleName));
    await rename(first.archive, path.join(temporary, `${bundleName}.tar`));
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(path.dirname(outputRoot), { recursive: true });
    await rename(temporary, outputRoot);
    process.stdout.write(`Built services/nacl-mcp/dist/${bundleName} deterministically (${first.archiveSha256}).\n`);
  }
} finally {
  if (await stat(temporary).catch(() => null)) await rm(temporary, { recursive: true, force: true });
}

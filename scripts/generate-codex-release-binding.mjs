#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PUBLIC_TOOLS } from "../services/nacl-mcp/src/contracts.mjs";
import { SERVER_INSTRUCTIONS } from "../services/nacl-mcp/src/sdk-server.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "..");
const shaPattern = /^[0-9a-f]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function encoded(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function unix(value) {
  return value.split(path.sep).join("/");
}

function run(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, { cwd, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function fileDigest(repoRoot, relative) {
  return sha256(await readFile(path.join(repoRoot, ...relative.split("/"))));
}

async function fileBinding(repoRoot, relative) {
  return { status: "VERIFIED", path: relative, sha256: await fileDigest(repoRoot, relative) };
}

async function filesUnder(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) files.push(filename);
      else throw new Error(`Unsupported release-binding input: ${filename}`);
    }
  }
  await visit(root);
  return files;
}

async function treeBinding(repoRoot, relative) {
  const root = path.join(repoRoot, ...relative.split("/"));
  const records = [];
  for (const filename of await filesUnder(root)) {
    records.push({ path: unix(path.relative(root, filename)), sha256: sha256(await readFile(filename)) });
  }
  return {
    status: "VERIFIED",
    path: relative,
    fileCount: records.length,
    treeSha256: sha256(records.map((record) => `${record.path}\0${record.sha256}`).join("\n")),
  };
}

function octal(value, width) {
  const result = value.toString(8).padStart(width - 1, "0");
  if (result.length >= width) throw new Error("Install archive tar field overflow.");
  return `${result}\0`;
}

function tarHeader(name, size, mode) {
  const header = Buffer.alloc(512);
  let basename = name;
  let prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const index = name.lastIndexOf("/");
    if (index < 1) throw new Error(`Install archive path is too long: ${name}`);
    prefix = name.slice(0, index);
    basename = name.slice(index + 1);
  }
  if (Buffer.byteLength(basename) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error(`Install archive path is too long: ${name}`);
  }
  header.write(basename, 0, 100, "utf8");
  header.write(octal(mode, 8), 100, 8, "ascii");
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

async function inspectGeneratedPlugin(root) {
  const records = [];
  const chunks = [];
  for (const filename of await filesUnder(root)) {
    const metadata = await lstat(filename);
    if (!metadata.isFile()) throw new Error(`Generated plugin contains a non-file: ${filename}`);
    const content = await readFile(filename);
    const relative = unix(path.relative(root, filename));
    const mode = metadata.mode & 0o777;
    if (mode !== 0o644 && mode !== 0o755) throw new Error(`Generated plugin has a non-deterministic mode: ${relative}`);
    records.push({
      path: relative,
      mode: mode.toString(8).padStart(4, "0"),
      sizeBytes: content.length,
      sha256: sha256(content),
    });
    chunks.push(tarHeader(`nacl/${relative}`, content.length, mode), content);
    const remainder = content.length % 512;
    if (remainder) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  const archive = Buffer.concat(chunks);
  const manifest = {
    schemaVersion: 1,
    artifact: "nacl-generated-plugin-tree",
    archiveRoot: "nacl/",
    fileCount: records.length,
    treeSha256: sha256(records.map((record) => `${record.path}\0${record.mode}\0${record.sha256}`).join("\n")),
    files: records,
  };
  const manifestContent = encoded(manifest);
  return {
    manifest,
    manifestContent,
    manifestSha256: sha256(manifestContent),
    archive,
    archiveSha256: sha256(archive),
  };
}

export async function buildGeneratedPluginArtifacts(repoRoot = defaultRepoRoot) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-generated-plugin-release-"));
  try {
    const firstRoot = path.join(temporary, "first");
    const secondRoot = path.join(temporary, "second");
    run(process.execPath, ["scripts/build-codex-plugin.mjs", "--output", firstRoot], repoRoot);
    run(process.execPath, ["scripts/build-codex-plugin.mjs", "--output", secondRoot], repoRoot);
    const [first, second] = await Promise.all([inspectGeneratedPlugin(firstRoot), inspectGeneratedPlugin(secondRoot)]);
    if (first.manifestContent !== second.manifestContent || !first.archive.equals(second.archive)) {
      throw new Error("Two generated Codex plugin builds are not byte-identical.");
    }
    return first;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function deriveCleanHead(repoRoot) {
  const dirty = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], repoRoot);
  if (dirty) throw new Error("Release binding requires a clean Git worktree.");
  const sourceSha = run("git", ["rev-parse", "HEAD"], repoRoot);
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error("Git HEAD is not an exact 40-character source SHA.");
  return sourceSha;
}

async function bundleBindings(repoRoot) {
  const manifestRelative = "services/nacl-mcp/dist/nacl-public-mcp-bundle/bundle-manifest.json";
  const archiveRelative = "services/nacl-mcp/dist/nacl-public-mcp-bundle.tar";
  let manifest;
  try {
    manifest = await readJson(path.join(repoRoot, ...manifestRelative.split("/")));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        sourceBundle: { status: "NOT_GENERATED", path: null, sourceDigest: null, manifestSha256: null },
        archive: { status: "NOT_GENERATED", path: null, sha256: null },
      };
    }
    throw error;
  }
  const expectedRecords = [];
  for (const record of manifest.sourceFiles ?? []) {
    const actual = await fileDigest(repoRoot, record.path);
    if (actual !== record.sha256) throw new Error(`Stale public MCP bundle source hash: ${record.path}`);
    expectedRecords.push({ path: record.path, sha256: actual });
  }
  expectedRecords.sort((left, right) => left.path.localeCompare(right.path));
  const expectedSourceDigest = sha256(expectedRecords.map((record) => `${record.path}\0${record.sha256}`).join("\n"));
  if (manifest.sourceDigest !== expectedSourceDigest) throw new Error("Stale public MCP sourceDigest.");
  let archiveSha256;
  try {
    archiveSha256 = await fileDigest(repoRoot, archiveRelative);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("Public MCP bundle manifest exists without its archive.");
    throw error;
  }
  return {
    sourceBundle: {
      status: "VERIFIED",
      path: manifestRelative,
      sourceDigest: expectedSourceDigest,
      manifestSha256: await fileDigest(repoRoot, manifestRelative),
    },
    archive: { status: "VERIFIED", path: archiveRelative, sha256: archiveSha256 },
  };
}

async function sbomBinding(repoRoot, bundle) {
  const manifestRelative = "services/nacl-mcp/dist/sbom/sbom-manifest.json";
  let manifest;
  try {
    manifest = await readJson(path.join(repoRoot, ...manifestRelative.split("/")));
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "NOT_GENERATED", path: null, sha256: null, artifacts: [] };
    throw error;
  }
  if (bundle.sourceBundle.status !== "VERIFIED" || bundle.archive.status !== "VERIFIED") {
    throw new Error("SBOM exists without verified source and archive bindings.");
  }
  if (manifest.sourceDigest !== bundle.sourceBundle.sourceDigest || manifest.archiveDigest !== bundle.archive.sha256) {
    throw new Error("SBOM is stale relative to the source bundle or archive.");
  }
  const artifacts = [];
  for (const artifact of manifest.artifacts ?? []) {
    const relative = `services/nacl-mcp/dist/sbom/${artifact.path}`;
    const actual = await fileDigest(repoRoot, relative);
    if (actual !== artifact.sha256) throw new Error(`Stale SBOM artifact hash: ${artifact.path}`);
    artifacts.push({ path: relative, sha256: actual });
  }
  return {
    status: "VERIFIED",
    path: manifestRelative,
    sha256: await fileDigest(repoRoot, manifestRelative),
    sourceDigest: manifest.sourceDigest,
    archiveDigest: manifest.archiveDigest,
    artifacts,
  };
}

export async function collectReleaseContext(repoRoot = defaultRepoRoot) {
  const pluginManifest = await readJson(path.join(repoRoot, "codex-plugin-src/package/.codex-plugin/plugin.json"));
  const mcpPackage = await readJson(path.join(repoRoot, "services/nacl-mcp/package.json"));
  const assets = await Promise.all([
    "codex-plugin-src/package/assets/composer-icon.png",
    "codex-plugin-src/package/assets/logo.png",
    "codex-plugin-src/package/assets/logo-dark.png",
  ].map((relative) => fileBinding(repoRoot, relative)));
  const bundle = await bundleBindings(repoRoot);
  const context = {
    pluginVersion: pluginManifest.version,
    generatedPlugin: await buildGeneratedPluginArtifacts(repoRoot),
    mcpPackageVersion: mcpPackage.version,
    skills: await treeBinding(repoRoot, "codex-plugin-src/package/skills"),
    publicToolsMetadataSha256: sha256(encoded(PUBLIC_TOOLS)),
    serverInstructionsSha256: sha256(SERVER_INSTRUCTIONS),
    reviewerFixture: await fileBinding(repoRoot, "codex-plugin-src/package/submission/reviewer-fixtures.json"),
    reviewerSchema: await fileBinding(repoRoot, "codex-plugin-src/package/submission/reviewer-fixtures.schema.json"),
    dataFlowDisclosure: await fileBinding(repoRoot, "codex-plugin-src/package/submission/data-flow-security.json"),
    humanDisclosure: await fileBinding(repoRoot, "codex-plugin-src/package/submission/data-flow-security.md"),
    assets,
    license: await fileBinding(repoRoot, "LICENSE"),
    lockfile: await fileBinding(repoRoot, "services/nacl-mcp/package-lock.json"),
    topologyPolicy: await fileBinding(repoRoot, "docs/adr/004-codex-production-app.md"),
    queryCatalog: await fileBinding(repoRoot, "codex-plugin-src/package/graph/queries/catalog.json"),
    migrationCatalog: await treeBinding(repoRoot, "codex-plugin-src/package/graph/migrations"),
    bundle,
  };
  context.sbom = await sbomBinding(repoRoot, bundle);
  return context;
}

export function buildReleaseBinding({
  sourceSha,
  context,
  artifactNames = { packageTree: "release-binding.plugin-tree.json", installArchive: "release-binding.plugin.tar" },
}) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error("sourceSha must be an exact 40-character Git SHA.");
  return {
    schemaVersion: 1,
    artifact: "nacl-wave9-external-release-binding",
    status: "NOT_READY_FOR_SUBMISSION",
    source: { status: "VERIFIED", algorithm: "git-sha1", value: sourceSha },
    plugin: {
      version: { status: "VERIFIED", value: context.pluginVersion },
      packageTree: {
        status: "VERIFIED",
        path: artifactNames.packageTree,
        sha256: context.generatedPlugin.manifestSha256,
        treeSha256: context.generatedPlugin.manifest.treeSha256,
        fileCount: context.generatedPlugin.manifest.fileCount,
      },
      installArchive: {
        status: "VERIFIED",
        path: artifactNames.installArchive,
        format: "tar",
        archiveRoot: "nacl/",
        sizeBytes: context.generatedPlugin.archive.length,
        sha256: context.generatedPlugin.archiveSha256,
      },
      skills: context.skills,
      assets: context.assets,
    },
    publicMcp: {
      contractVersion: { status: "VERIFIED", value: "nacl-public-mcp-v1" },
      packageVersion: { status: "VERIFIED", value: context.mcpPackageVersion },
      publicToolsMetadata: { status: "VERIFIED", sha256: context.publicToolsMetadataSha256 },
      serverInstructions: { status: "VERIFIED", sha256: context.serverInstructionsSha256 },
      reviewerFixture: context.reviewerFixture,
      reviewerSchema: context.reviewerSchema,
      topologyPolicy: context.topologyPolicy,
      queryCatalog: context.queryCatalog,
      migrationCatalog: context.migrationCatalog,
    },
    disclosures: {
      dataFlowSecurity: context.dataFlowDisclosure,
      humanDataFlowSecurity: context.humanDisclosure,
    },
    artifacts: {
      license: context.license,
      lockfile: context.lockfile,
      publicMcpSourceBundle: context.bundle.sourceBundle,
      publicMcpArchive: context.bundle.archive,
      sbom: context.sbom,
      containerImage: {
        status: "NOT_BOUND",
        digest: null,
        reason: "No immutable production container image has been built and selected for this source SHA."
      },
    },
    productionBindings: {
      mcpRevision: { status: "NOT_BOUND", value: null },
      publicEndpoint: { status: "NOT_VERIFIED", value: null },
      appId: { status: "NOT_PROVIDED", value: null },
      oauthProvider: { status: "NOT_SELECTED", value: null },
    },
    legalAndOperations: {
      publisherIdentity: { status: "NOT_VERIFIED", value: null },
      publicWebsite: { status: "NOT_VERIFIED", value: null },
      publicPrivacyPolicy: { status: "NOT_VERIFIED", value: null },
      publicTermsOfService: { status: "NOT_VERIFIED", value: null },
      subprocessors: { status: "NOT_SELECTED", value: [] },
      regions: { status: "NOT_VERIFIED", value: [] },
      retention: { status: "NOT_VERIFIED", value: null },
      backupRetention: { status: "NOT_VERIFIED", value: null },
      deletionAndExport: { status: "NOT_VERIFIED", value: null },
      support: { status: "NOT_VERIFIED", owner: null, contact: null, responseCommitment: null },
      security: { status: "NOT_VERIFIED", owner: null, contact: null, incidentProcess: null },
      modelTraining: {
        sourceImplementationStatus: "DOES_NOT_SEND_TO_AUTHOR_ANALYTICS",
        productionCommitmentStatus: "NOT_VERIFIED",
        productionCommitment: null,
      },
    },
    signatures: { status: "NOT_SIGNED", items: [] },
  };
}

function walk(value, callback, pointer = "$") {
  callback(value, pointer);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, callback, `${pointer}[${index}]`));
  else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walk(item, callback, `${pointer}.${key}`);
  }
}

function requireSame(actual, expected, label) {
  if (actual !== expected) throw new Error(`Stale or incorrect ${label}.`);
}

export function validateReleaseBinding(binding, { sourceSha, context }) {
  const serialized = JSON.stringify(binding);
  const forbidden = [
    /(?:^|["'])\/(?:Users|home)\//i,
    /[A-Z]:\\Users\\/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\b(?:password|client_secret|access_token)\s*[=:]\s*[^,}\s]+/i,
    /example\.(?:com|test)|placeholder|change[_-]?me|\bTODO\b/i,
  ];
  for (const pattern of forbidden) if (pattern.test(serialized)) throw new Error(`Release binding contains forbidden personal, secret, or placeholder material: ${pattern}`);
  walk(binding, (value, pointer) => {
    if (value !== null && typeof value === "object" && value.status === "VERIFIED") {
      const evidence = [value.value, value.sha256, value.treeSha256, value.sourceDigest, value.manifestSha256]
        .some((item) => typeof item === "string" && item.length > 0);
      if (!evidence) throw new Error(`${pointer} claims VERIFIED without binding evidence.`);
      for (const [key, item] of Object.entries(value)) {
        if (/sha256$/i.test(key) && (typeof item !== "string" || !shaPattern.test(item))) {
          throw new Error(`${pointer}.${key} is not a SHA-256 digest.`);
        }
      }
    }
  });
  requireSame(binding.source.value, sourceSha, "source SHA");
  requireSame(binding.plugin.version.value, context.pluginVersion, "plugin version");
  requireSame(binding.plugin.packageTree.sha256, context.generatedPlugin.manifestSha256, "generated plugin tree manifest hash");
  requireSame(binding.plugin.packageTree.treeSha256, context.generatedPlugin.manifest.treeSha256, "generated plugin tree hash");
  requireSame(binding.plugin.packageTree.fileCount, context.generatedPlugin.manifest.fileCount, "generated plugin file count");
  requireSame(binding.plugin.installArchive.sha256, context.generatedPlugin.archiveSha256, "generated plugin install archive hash");
  requireSame(binding.plugin.installArchive.sizeBytes, context.generatedPlugin.archive.length, "generated plugin install archive size");
  if (binding.plugin.installArchive.archiveRoot !== "nacl/" || binding.plugin.installArchive.format !== "tar") {
    throw new Error("Generated plugin install archive format or root is incorrect.");
  }
  requireSame(binding.plugin.skills.treeSha256, context.skills.treeSha256, "skills tree hash");
  if (binding.plugin.assets.length !== context.assets.length) throw new Error("Stale or incomplete asset bindings.");
  for (let index = 0; index < context.assets.length; index += 1) {
    requireSame(binding.plugin.assets[index].path, context.assets[index].path, `asset path ${index}`);
    requireSame(binding.plugin.assets[index].sha256, context.assets[index].sha256, `asset hash ${index}`);
  }
  requireSame(binding.publicMcp.publicToolsMetadata.sha256, context.publicToolsMetadataSha256, "public tools metadata hash");
  requireSame(binding.publicMcp.serverInstructions.sha256, context.serverInstructionsSha256, "server instructions hash");
  requireSame(binding.publicMcp.reviewerFixture.sha256, context.reviewerFixture.sha256, "reviewer fixture hash");
  requireSame(binding.publicMcp.reviewerSchema.sha256, context.reviewerSchema.sha256, "reviewer schema hash");
  requireSame(binding.publicMcp.topologyPolicy.sha256, context.topologyPolicy.sha256, "topology policy hash");
  requireSame(binding.publicMcp.queryCatalog.sha256, context.queryCatalog.sha256, "query catalog hash");
  requireSame(binding.publicMcp.migrationCatalog.treeSha256, context.migrationCatalog.treeSha256, "migration catalog hash");
  requireSame(binding.disclosures.dataFlowSecurity.sha256, context.dataFlowDisclosure.sha256, "data-flow disclosure hash");
  requireSame(binding.disclosures.humanDataFlowSecurity.sha256, context.humanDisclosure.sha256, "human disclosure hash");
  requireSame(binding.artifacts.license.sha256, context.license.sha256, "license hash");
  requireSame(binding.artifacts.lockfile.sha256, context.lockfile.sha256, "lockfile hash");
  requireSame(binding.artifacts.publicMcpSourceBundle.status, context.bundle.sourceBundle.status, "public MCP source bundle status");
  requireSame(binding.artifacts.publicMcpArchive.status, context.bundle.archive.status, "public MCP archive status");
  if (context.bundle.sourceBundle.status === "VERIFIED") {
    requireSame(binding.artifacts.publicMcpSourceBundle.sourceDigest, context.bundle.sourceBundle.sourceDigest, "public MCP source bundle digest");
    requireSame(binding.artifacts.publicMcpSourceBundle.manifestSha256, context.bundle.sourceBundle.manifestSha256, "public MCP source bundle manifest hash");
    requireSame(binding.artifacts.publicMcpArchive.sha256, context.bundle.archive.sha256, "public MCP archive hash");
  }
  requireSame(binding.artifacts.sbom.status, context.sbom.status, "SBOM status");
  if (context.sbom.status === "VERIFIED") {
    requireSame(binding.artifacts.sbom.sha256, context.sbom.sha256, "SBOM manifest hash");
    requireSame(binding.artifacts.sbom.sourceDigest, context.sbom.sourceDigest, "SBOM source digest");
    requireSame(binding.artifacts.sbom.archiveDigest, context.sbom.archiveDigest, "SBOM archive digest");
  }
  if (binding.signatures.status !== "NOT_SIGNED" || binding.signatures.items.length !== 0) {
    throw new Error("Release binding must not claim signatures that do not exist.");
  }
  if (binding.status === "READY_FOR_SUBMISSION") {
    const critical = [
      binding.artifacts.containerImage,
      binding.productionBindings.mcpRevision,
      binding.productionBindings.publicEndpoint,
      binding.productionBindings.appId,
      binding.productionBindings.oauthProvider,
      binding.legalAndOperations.publisherIdentity,
      binding.legalAndOperations.publicPrivacyPolicy,
      binding.legalAndOperations.publicTermsOfService,
      binding.legalAndOperations.regions,
      binding.legalAndOperations.retention,
      binding.legalAndOperations.support,
      binding.legalAndOperations.security,
    ];
    if (critical.some((item) => item.status !== "VERIFIED")) {
      throw new Error("READY_FOR_SUBMISSION is forbidden while critical production bindings remain unresolved.");
    }
  }
  return binding;
}

async function assertExternalOutput(repoRoot, output) {
  const canonicalRepo = await realpath(repoRoot);
  const lexicalOutput = path.resolve(output);
  const lexicalRepo = path.resolve(repoRoot);
  if (lexicalOutput === lexicalRepo || lexicalOutput.startsWith(`${lexicalRepo}${path.sep}`)) {
    throw new Error("Release binding output must be outside the repository.");
  }
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const canonicalParent = await realpath(path.dirname(output));
  const resolvedOutput = path.join(canonicalParent, path.basename(output));
  if (resolvedOutput === canonicalRepo || resolvedOutput.startsWith(`${canonicalRepo}${path.sep}`)) {
    throw new Error("Release binding output must be outside the repository.");
  }
  const existing = await lstat(resolvedOutput).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (existing) throw new Error("Release binding output already exists; overwrite is forbidden.");
  return resolvedOutput;
}

async function writeExclusive(filename, content) {
  const temporary = `${filename}.tmp-${process.pid}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await link(temporary, filename);
  } finally {
    if (handle) await handle.close();
    await rm(temporary, { force: true });
  }
}

function artifactDestinations(output) {
  const extension = path.extname(output);
  const stem = extension === ".json" ? output.slice(0, -extension.length) : output;
  return {
    binding: output,
    packageTree: `${stem}.plugin-tree.json`,
    installArchive: `${stem}.plugin.tar`,
  };
}

function parseArgs(argv) {
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") output = path.resolve(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!output) throw new Error("--output is required.");
  return { output };
}

export async function generateReleaseBinding({ repoRoot = defaultRepoRoot, output }) {
  const sourceSha = deriveCleanHead(repoRoot);
  run(process.execPath, ["scripts/build-codex-plugin.mjs", "--check"], repoRoot);
  const context = await collectReleaseContext(repoRoot);
  const requested = artifactDestinations(output);
  const destinations = {
    binding: await assertExternalOutput(repoRoot, requested.binding),
    packageTree: await assertExternalOutput(repoRoot, requested.packageTree),
    installArchive: await assertExternalOutput(repoRoot, requested.installArchive),
  };
  const artifactNames = {
    packageTree: path.basename(destinations.packageTree),
    installArchive: path.basename(destinations.installArchive),
  };
  const binding = validateReleaseBinding(buildReleaseBinding({ sourceSha, context, artifactNames }), { sourceSha, context });
  if (deriveCleanHead(repoRoot) !== sourceSha) throw new Error("Git HEAD changed while the release binding was generated.");
  const created = [];
  try {
    await writeExclusive(destinations.packageTree, context.generatedPlugin.manifestContent);
    created.push(destinations.packageTree);
    await writeExclusive(destinations.installArchive, context.generatedPlugin.archive);
    created.push(destinations.installArchive);
    await writeExclusive(destinations.binding, encoded(binding));
    created.push(destinations.binding);
  } catch (error) {
    await Promise.all(created.map((filename) => rm(filename, { force: true })));
    throw error;
  }
  return { destination: destinations.binding, destinations, binding };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { output } = parseArgs(process.argv.slice(2));
  const { destination, binding } = await generateReleaseBinding({ output });
  process.stdout.write(`Generated external release binding for ${binding.source.value} at ${destination}.\n`);
}

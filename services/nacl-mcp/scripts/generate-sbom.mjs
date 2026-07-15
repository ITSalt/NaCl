#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = path.join(serviceRoot, "dist/nacl-public-mcp-bundle");
const archivePath = path.join(serviceRoot, "dist/nacl-public-mcp-bundle.tar");
const outputRoot = path.join(serviceRoot, "dist/sbom");
const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((value) => value !== "--check")) throw new Error("Only --check is supported.");

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

function npmSbom() {
  const result = spawnSync("npm", ["sbom", "--sbom-format", "cyclonedx"], {
    cwd: serviceRoot,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.status !== 0) throw new Error(`npm sbom failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function normalizeDependencies(raw, sourceDigest, archiveDigest) {
  delete raw.serialNumber;
  if (raw.metadata) delete raw.metadata.timestamp;
  raw.metadata ??= {};
  raw.metadata.component ??= {};
  raw.metadata.component.licenses = [{ license: { id: "MIT" } }];
  raw.metadata.properties = [
    { name: "nacl:artifact", value: "public-mcp-production-dependencies" },
    { name: "nacl:source-digest:sha256", value: sourceDigest },
    { name: "nacl:archive-digest:sha256", value: archiveDigest },
  ];
  raw.components = [...(raw.components ?? [])].sort((left, right) => String(left["bom-ref"]).localeCompare(String(right["bom-ref"])));
  raw.dependencies = [...(raw.dependencies ?? [])]
    .map((dependency) => ({ ...dependency, dependsOn: [...(dependency.dependsOn ?? [])].sort() }))
    .sort((left, right) => String(left.ref).localeCompare(String(right.ref)));
  return raw;
}

function bundleSbom(manifest, archiveDigest) {
  return {
    $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: "nacl-public-mcp-bundle",
        version: "0.1.0",
        hashes: [{ alg: "SHA-256", content: archiveDigest }],
        licenses: [{ license: { id: "MIT" } }],
        properties: [
          { name: "nacl:source-digest:sha256", value: manifest.sourceDigest },
          { name: "nacl:archive-digest:sha256", value: archiveDigest },
          { name: "nacl:entrypoint", value: manifest.entrypoint },
        ],
      },
    },
    components: manifest.sourceFiles.map((record) => ({
      type: "file",
      name: record.path,
      "bom-ref": `file:${record.sha256}:${record.path}`,
      hashes: [{ alg: "SHA-256", content: record.sha256 }],
    })),
  };
}

async function generate(directory) {
  const manifest = JSON.parse(await readFile(path.join(bundleRoot, "bundle-manifest.json"), "utf8"));
  const archiveDigest = sha256(await readFile(archivePath));
  const dependencyDocument = normalizeDependencies(npmSbom(), manifest.sourceDigest, archiveDigest);
  const bundleDocument = bundleSbom(manifest, archiveDigest);
  const artifacts = [
    { path: "nacl-public-mcp-dependencies.cdx.json", content: encoded(dependencyDocument) },
    { path: "nacl-public-mcp-bundle.cdx.json", content: encoded(bundleDocument) },
  ];
  const sbomManifest = {
    schemaVersion: 1,
    sourceDigest: manifest.sourceDigest,
    archiveDigest,
    artifacts: artifacts.map((artifact) => ({
      path: artifact.path,
      sha256: sha256(artifact.content),
      bomFormat: "CycloneDX",
      specVersion: "1.5",
    })),
    notRun: ["container-image-sbom", "sast", "secret-scan", "privacy-scan", "container-scan", "iac-scan", "exposed-endpoint-scan", "multi-arch-image-verification"],
  };
  await mkdir(directory, { recursive: true, mode: 0o755 });
  for (const artifact of artifacts) await writeFile(path.join(directory, artifact.path), artifact.content, { mode: 0o644 });
  await writeFile(path.join(directory, "sbom-manifest.json"), encoded(sbomManifest), { mode: 0o644 });
  return encoded({ sbomManifest, artifacts: artifacts.map(({ path: artifactPath, content }) => ({ path: artifactPath, sha256: sha256(content) })) });
}

if (check) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nacl-public-mcp-sbom-"));
  try {
    const first = await generate(path.join(temporary, "first"));
    const second = await generate(path.join(temporary, "second"));
    if (first !== second) throw new Error("normalized SBOM output is not reproducible");
    process.stdout.write("Public MCP SBOM artifacts are reproducible and digest-bound.\n");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
} else {
  await rm(outputRoot, { recursive: true, force: true });
  await generate(outputRoot);
  process.stdout.write("Generated digest-bound CycloneDX artifacts in services/nacl-mcp/dist/sbom.\n");
}

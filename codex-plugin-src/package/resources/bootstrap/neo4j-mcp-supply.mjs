import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SHA256 = /^[0-9a-f]{64}$/;

function parsePin(source) {
  const values = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([a-z0-9_]+)=([^\s]+)$/.exec(line);
    if (!match || Object.hasOwn(values, match[1])) throw new Error("RELEASE_PIN_MALFORMED");
    values[match[1]] = match[2];
  }
  return values;
}

export function platformKey(platform = process.platform, architecture = process.arch) {
  const os = { darwin: "darwin", linux: "linux", win32: "windows" }[platform];
  const arch = { arm64: "arm64", x64: "x86_64" }[architecture];
  if (!os || !arch) throw new Error("PLATFORM_UNSUPPORTED");
  return { os, arch, key: `${os}_${arch}` };
}

export function releaseIdentity(pinPath, platform = process.platform, architecture = process.arch) {
  const pin = parsePin(readFileSync(pinPath, "utf8"));
  const target = platformKey(platform, architecture);
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(pin.version ?? "")) throw new Error("RELEASE_PIN_MALFORMED");
  const asset = pin[`asset_${target.key}`];
  const archiveSha256 = pin[`archive_sha256_${target.key}`];
  const binarySha256 = pin[`binary_sha256_${target.key}`];
  const expectedAsset = `neo4j-mcp_${target.os === "darwin" ? "Darwin" : target.os === "linux" ? "Linux" : "Windows"}_${target.arch}.${target.os === "windows" ? "zip" : "tar.gz"}`;
  if (asset !== expectedAsset || !SHA256.test(archiveSha256 ?? "") || !SHA256.test(binarySha256 ?? "")) throw new Error("RELEASE_PIN_MALFORMED");
  return Object.freeze({
    schemaVersion: 1,
    source: "neo4j/mcp",
    version: pin.version,
    platform: target.os,
    architecture: target.arch,
    asset,
    archiveSha256,
    binarySha256,
    url: `https://github.com/neo4j/mcp/releases/download/${pin.version}/${asset}`,
  });
}

export function sha256File(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

export function receiptDocument(identity) {
  const { url: _url, ...document } = identity;
  return document;
}

export function receiptBytes(identity) {
  return `${JSON.stringify(receiptDocument(identity), null, 2)}\n`;
}

function safeRegular(filename, executable = false) {
  if (!existsSync(filename)) return false;
  const metadata = lstatSync(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("BINARY_RECEIPT_UNSAFE");
  if (executable && process.platform !== "win32" && (metadata.mode & 0o111) === 0) throw new Error("BINARY_NOT_EXECUTABLE");
  return true;
}

export function verifyInstalledSupply({ graphDir, identity }) {
  const binDir = path.join(graphDir, "bin");
  const binary = path.join(binDir, identity.platform === "windows" ? "neo4j-mcp.exe" : "neo4j-mcp");
  const receipt = path.join(binDir, "neo4j-mcp.receipt.json");
  const cache = path.join(graphDir, "cache");
  if (existsSync(cache)) throw new Error("UNTRUSTED_BINARY_CACHE_PRESENT");
  const binaryExists = safeRegular(binary, true);
  const receiptExists = safeRegular(receipt);
  if (!binaryExists && !receiptExists) {
    if (existsSync(binDir)) {
      const metadata = lstatSync(binDir);
      if (!metadata.isDirectory() || metadata.isSymbolicLink() || readdirSync(binDir).length !== 0) throw new Error("BINARY_DIRECTORY_UNSAFE");
    }
    return Object.freeze({ state: "absent", binDir, binary, receipt });
  }
  if (!binaryExists || !receiptExists) throw new Error("BINARY_RECEIPT_INCOMPLETE");
  const extras = readdirSync(binDir).filter((entry) => !new Set([path.basename(binary), path.basename(receipt)]).has(entry));
  if (extras.length > 0) throw new Error("BINARY_DIRECTORY_UNSAFE");
  if (readFileSync(receipt, "utf8") !== receiptBytes(identity)) throw new Error("BINARY_RECEIPT_MISMATCH");
  if (sha256File(binary) !== identity.binarySha256) throw new Error("BINARY_DIGEST_MISMATCH");
  return Object.freeze({ state: "reusable", binDir, binary, receipt });
}

export function assertPinnedOverride(identity, value = process.env.NEO4J_MCP_VERSION) {
  if (value && value !== identity.version) throw new Error("BINARY_VERSION_OVERRIDE_FORBIDDEN");
}

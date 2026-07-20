#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPinnedOverride, receiptBytes, releaseIdentity, verifyInstalledSupply } from "./neo4j-mcp-supply.mjs";

function fail(code) {
  process.stderr.write(`NACL_BINARY_INSTALL: status=BLOCKED code=${code}\n`);
  process.exit(1);
}
function blocked(code) { throw new Error(code); }

const index = process.argv.indexOf("--project-root");
if (index < 0 || !process.argv[index + 1] || process.argv.length !== 4) fail("ARGUMENT_INVALID");
const projectRoot = path.resolve(process.argv[index + 1]);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
let identity;
try {
  identity = releaseIdentity(path.join(scriptDir, "neo4j-mcp-release.pin"));
  assertPinnedOverride(identity);
} catch (error) { fail(error.message); }
const graphDir = path.join(projectRoot, "graph-infra");
let installed;
try { installed = verifyInstalledSupply({ graphDir, identity }); } catch (error) { fail(error.message); }
if (installed.state === "reusable") {
  process.stdout.write(`NACL_BINARY_INSTALL: status=VERIFIED state=reusable version=${identity.version} binary_sha256=${identity.binarySha256}\n`);
  process.exit(0);
}

await mkdir(installed.binDir, { recursive: false, mode: 0o700 }).catch((error) => {
  if (error?.code !== "EEXIST") throw error;
});
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "nacl-neo4j-mcp-"));
const archive = path.join(temporaryRoot, identity.asset);
const extraction = path.join(temporaryRoot, "extract");
const binaryTemporary = `${installed.binary}.nacl-${process.pid}.tmp`;
const receiptTemporary = `${installed.receipt}.nacl-${process.pid}.tmp`;
let failure = null;
try {
  const response = await fetch(identity.url, {
    redirect: "follow",
    headers: { "User-Agent": "NaCl-Skills-only-bootstrap" },
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response?.ok) blocked("BINARY_DOWNLOAD_FAILED");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024 * 1024) blocked("BINARY_ARCHIVE_TOO_LARGE");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 64 * 1024 * 1024) blocked("BINARY_ARCHIVE_SIZE_INVALID");
  if (createHash("sha256").update(bytes).digest("hex") !== identity.archiveSha256) blocked("BINARY_ARCHIVE_CHECKSUM_MISMATCH");
  await writeFile(archive, bytes, { mode: 0o600, flag: "wx" });

  const listing = spawnSync("tar", ["-tf", archive], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (listing.status !== 0) blocked("BINARY_ARCHIVE_LIST_FAILED");
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0 || entries.some((entry) => path.isAbsolute(entry) || /^[A-Za-z]:/.test(entry) || entry.includes("\\") || entry.split("/").some((part) => part === ".."))) blocked("BINARY_ARCHIVE_PATH_UNSAFE");
  const verboseListing = spawnSync("tar", ["-tvf", archive], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  const archiveTypes = verboseListing.stdout.split(/\r?\n/).filter(Boolean).map((entry) => entry[0]);
  if (verboseListing.status !== 0 || archiveTypes.length !== entries.length || archiveTypes.some((type) => type !== "-" && type !== "d")) blocked("BINARY_ARCHIVE_LINK_UNSAFE");
  await mkdir(extraction, { mode: 0o700 });
  const extracted = spawnSync("tar", ["-xf", archive, "-C", extraction], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (extracted.status !== 0) blocked("BINARY_ARCHIVE_EXTRACT_FAILED");

  const candidates = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) blocked("BINARY_ARCHIVE_LINK_UNSAFE");
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile()) {
        if (new Set(["neo4j-mcp", "neo4j-mcp.exe"]).has(entry.name)) candidates.push(filename);
      } else blocked("BINARY_ARCHIVE_ENTRY_UNSAFE");
    }
  }
  await walk(extraction);
  if (candidates.length !== 1) blocked("BINARY_ARCHIVE_BINARY_AMBIGUOUS");
  const binaryBytes = await readFile(candidates[0]);
  if (createHash("sha256").update(binaryBytes).digest("hex") !== identity.binarySha256) blocked("BINARY_DIGEST_MISMATCH");
  await copyFile(candidates[0], binaryTemporary, constants.COPYFILE_EXCL);
  await chmod(binaryTemporary, 0o700);
  await writeFile(receiptTemporary, receiptBytes(identity), { mode: 0o600, flag: "wx" });
  await rename(binaryTemporary, installed.binary);
  await rename(receiptTemporary, installed.receipt);
  const readback = verifyInstalledSupply({ graphDir, identity });
  if (readback.state !== "reusable") blocked("BINARY_READBACK_FAILED");
  process.stdout.write(`NACL_BINARY_INSTALL: status=VERIFIED state=installed version=${identity.version} archive_sha256=${identity.archiveSha256} binary_sha256=${identity.binarySha256}\n`);
} catch (error) {
  failure = error?.message ?? "BINARY_INSTALL_FAILED";
  await rm(installed.binary, { force: true }).catch(() => {});
  await rm(installed.receipt, { force: true }).catch(() => {});
} finally {
  await rm(binaryTemporary, { force: true }).catch(() => {});
  await rm(receiptTemporary, { force: true }).catch(() => {});
  await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
}
if (failure) fail(failure);

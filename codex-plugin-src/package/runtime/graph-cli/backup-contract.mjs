import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BACKUP_CONTRACT, LifecycleError } from "./contracts.mjs";

export const SNAPSHOT_CONTRACT = "nacl-graph-verification-snapshot-v1";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scalarMap(value) {
  return (
    isObject(value) &&
    Object.entries(value).every(
      ([key, count]) =>
        /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(key) && Number.isInteger(count) && count >= 0,
    )
  );
}

function safeNames(value) {
  return (
    Array.isArray(value) &&
    value.every((entry) => /^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/.test(entry))
  );
}

export function validateSnapshot(snapshot) {
  if (
    !isObject(snapshot) ||
    snapshot.contract !== SNAPSHOT_CONTRACT ||
    !Number.isInteger(snapshot.nodeCount) ||
    snapshot.nodeCount < 0 ||
    !Number.isInteger(snapshot.relationshipCount) ||
    snapshot.relationshipCount < 0 ||
    !scalarMap(snapshot.labelHistogram) ||
    !scalarMap(snapshot.relationshipTypeHistogram) ||
    !safeNames(snapshot.constraints) ||
    !safeNames(snapshot.indexes) ||
    !isObject(snapshot.schemaMigration) ||
    !Number.isInteger(snapshot.schemaMigration.version) ||
    !/^[a-f0-9]{64}$/.test(snapshot.schemaMigration.checksum ?? "") ||
    !isObject(snapshot.representativeQueries) ||
    !Object.entries(snapshot.representativeQueries).every(
      ([name, entry]) =>
        /^[a-z][a-z0-9-]{0,127}$/.test(name) &&
        isObject(entry) &&
        Number.isInteger(entry.rowCount) &&
        entry.rowCount >= 0 &&
        /^[a-f0-9]{64}$/.test(entry.digest ?? ""),
    ) ||
    snapshot.readWriteSmoke !== "VERIFIED"
  ) {
    throw new LifecycleError(
      "BACKUP_EVIDENCE_INVALID",
      "Backup requires complete structural, schema, representative-query, and read/write evidence.",
      { status: "BLOCKED" },
    );
  }
  return snapshot;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function snapshotsEqual(expected, actual) {
  validateSnapshot(expected);
  validateSnapshot(actual);
  return JSON.stringify(canonical(expected)) === JSON.stringify(canonical(actual));
}

export async function sha256File(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

export function validateBackupManifest(manifest) {
  if (
    !isObject(manifest) ||
    manifest.contract !== BACKUP_CONTRACT ||
    typeof manifest.backupId !== "string" ||
    typeof manifest.createdAt !== "string" ||
    typeof manifest.dumpFile !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.dumpSha256 ?? "") ||
    !isObject(manifest.source) ||
    typeof manifest.source.projectId !== "string" ||
    typeof manifest.source.secretReference !== "string"
  ) {
    throw new LifecycleError("BACKUP_MANIFEST_CORRUPT", "The backup manifest is corrupt.");
  }
  validateSnapshot(manifest.snapshot);
  return manifest;
}

import { randomUUID } from "node:crypto";
import { chmod, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gatewayError } from "./errors.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SAFE_STATUS = new Set([
  "VERIFIED",
  "FAILED",
  "PARTIALLY_VERIFIED",
  "BLOCKED",
  "NOT_RUN",
  "UNVERIFIED",
]);

function safeText(value, maximum = 256) {
  return typeof value === "string" ? value.slice(0, maximum) : undefined;
}

export function auditRecord(input) {
  const status = SAFE_STATUS.has(input.status) ? input.status : "FAILED";
  return {
    auditVersion: 1,
    auditId: input.auditId ?? randomUUID(),
    at: input.at ?? new Date().toISOString(),
    projectId: safeText(input.projectId, 128),
    operation: safeText(input.operation, 64) ?? "unknown",
    capability: safeText(input.capability, 32) ?? "unknown",
    phase: safeText(input.phase, 32) ?? "complete",
    status,
    code: safeText(input.code, 128) ?? "UNKNOWN",
    retryable: input.retryable === true,
    ...(input.durationMs === undefined ? {} : { durationMs: Math.max(0, Math.trunc(input.durationMs)) }),
    ...(input.migrationVersion === undefined
      ? {}
      : { migrationVersion: Math.max(0, Math.trunc(input.migrationVersion)) }),
    ...(input.schemaChecksum ? { schemaChecksum: safeText(input.schemaChecksum, 128) } : {}),
    ...(input.idempotencyKeyHash ? { idempotencyKeyHash: safeText(input.idempotencyKeyHash, 128) } : {}),
  };
}

export class JsonlAuditSink {
  constructor(filename) {
    if (typeof filename !== "string" || !path.isAbsolute(filename)) {
      throw gatewayError("AUDIT_PATH_INVALID", "The lifecycle profile did not provide an absolute audit path.");
    }
    const resolved = path.resolve(filename);
    if (resolved === pluginRoot || resolved.startsWith(`${pluginRoot}${path.sep}`)) {
      throw gatewayError(
        "AUDIT_PATH_INVALID",
        "The durable graph audit path must be outside the uninstallable plugin cache.",
      );
    }
    this.filename = filename;
  }

  async append(record) {
    const sanitized = auditRecord(record);
    try {
      await mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
      const handle = await open(this.filename, "a", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(sanitized)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await chmod(this.filename, 0o600);
    } catch {
      throw gatewayError("AUDIT_UNAVAILABLE", "The redacted graph audit record could not be persisted.", {
        status: "BLOCKED",
        retryable: true,
      });
    }
    return sanitized.auditId;
  }
}

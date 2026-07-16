import { createHash } from "node:crypto";
import { PublicMcpError } from "./errors.mjs";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createIdempotencyLedger({ now = () => Date.now(), ttlMs = 24 * 60 * 60 * 1000, maxRecords = 10_000 } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || !Number.isSafeInteger(maxRecords) || maxRecords < 1) {
    throw new TypeError("idempotency bounds are invalid.");
  }
  const records = new Map();
  return Object.freeze({
    durability: "process-local",
    async execute({ principalId, tool, key, payload, operation }) {
      const current = now();
      for (const [storedKey, record] of records) {
        if (record.state === "committed" && record.expiresAt <= current) records.delete(storedKey);
      }
      const recordKey = `${principalId}\0${tool}\0${key}`;
      const digest = createHash("sha256").update(canonical(payload)).digest("hex");
      const existing = records.get(recordKey);
      if (existing) {
        if (existing.digest !== digest) throw new PublicMcpError("IDEMPOTENCY_CONFLICT", "The idempotency key was reused for a different operation.");
        const value = existing.state === "committed" ? existing.value : await existing.promise;
        return { value: structuredClone(value), outcome: "replayed", replayed: true };
      }
      if (records.size >= maxRecords) {
        throw new PublicMcpError("RATE_LIMITED", "The idempotency ledger capacity was reached.", { httpStatus: 429, retryable: true });
      }
      const promise = Promise.resolve().then(operation);
      const pending = Object.freeze({ digest, state: "pending", promise });
      records.set(recordKey, pending);
      try {
        const value = await promise;
        records.set(recordKey, Object.freeze({ digest, state: "committed", value: structuredClone(value), expiresAt: now() + ttlMs }));
        return { value, outcome: "committed", replayed: false };
      } catch (error) {
        if (records.get(recordKey) === pending) records.delete(recordKey);
        throw error;
      }
    },
  });
}

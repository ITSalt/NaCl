import { createHash } from "node:crypto";
import { PublicMcpError } from "./errors.mjs";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createIdempotencyLedger() {
  const records = new Map();
  return Object.freeze({
    async execute({ principalId, tool, key, payload, operation }) {
      const recordKey = `${principalId}\0${tool}\0${key}`;
      const digest = createHash("sha256").update(canonical(payload)).digest("hex");
      const existing = records.get(recordKey);
      if (existing) {
        if (existing.digest !== digest) throw new PublicMcpError("IDEMPOTENCY_CONFLICT", "The idempotency key was reused for a different operation.");
        return { value: structuredClone(existing.value), outcome: "replayed", replayed: true };
      }
      const value = await operation();
      records.set(recordKey, Object.freeze({ digest, value: structuredClone(value) }));
      return { value, outcome: "committed", replayed: false };
    },
  });
}

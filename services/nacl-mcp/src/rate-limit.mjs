import { PublicMcpError } from "./errors.mjs";

export function createLayeredRateLimiter({ now = () => Date.now(), windowMs = 60_000, limit = 100 } = {}) {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1 || !Number.isSafeInteger(limit) || limit < 1) throw new TypeError("rate limit is invalid.");
  const counters = new Map();
  return Object.freeze({
    assert(keys, cost = 1) {
      if (!Array.isArray(keys) || keys.length === 0 || keys.some((key) => typeof key !== "string" || key.length === 0 || key.length > 256)) {
        throw new TypeError("rate-limit keys are invalid.");
      }
      if (!Number.isSafeInteger(cost) || cost < 1 || cost > limit) throw new TypeError("rate-limit cost is invalid.");
      const bucket = Math.floor(now() / windowMs);
      const records = keys.map((key) => {
        const composite = `${bucket}:${key}`;
        return [composite, counters.get(composite) ?? 0];
      });
      if (records.some(([, count]) => count + cost > limit)) {
        throw new PublicMcpError("RATE_LIMITED", "The operation rate limit was reached.", { httpStatus: 429, retryable: true });
      }
      for (const [key, count] of records) counters.set(key, count + cost);
    },
  });
}

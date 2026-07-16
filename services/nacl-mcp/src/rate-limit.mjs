import { PublicMcpError } from "./errors.mjs";

export function createLayeredRateLimiter({ now = () => Date.now(), windowMs = 60_000, limit = 100, maxKeys = 10_000 } = {}) {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1 || !Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(maxKeys) || maxKeys < 1) throw new TypeError("rate limit is invalid.");
  const counters = new Map();
  let activeBucket;
  return Object.freeze({
    scope: "process-local",
    assert(keys, cost = 1) {
      if (!Array.isArray(keys) || keys.length === 0 || keys.some((key) => typeof key !== "string" || key.length === 0 || key.length > 256)) {
        throw new TypeError("rate-limit keys are invalid.");
      }
      if (new Set(keys).size !== keys.length) throw new TypeError("rate-limit keys must be unique.");
      if (!Number.isSafeInteger(cost) || cost < 1 || cost > limit) throw new TypeError("rate-limit cost is invalid.");
      const bucket = Math.floor(now() / windowMs);
      if (bucket !== activeBucket) {
        counters.clear();
        activeBucket = bucket;
      }
      const records = keys.map((key) => {
        const composite = `${bucket}:${key}`;
        return [composite, counters.get(composite) ?? 0];
      });
      const newKeys = records.filter(([key]) => !counters.has(key)).length;
      if (records.some(([, count]) => count + cost > limit) || counters.size + newKeys > maxKeys) {
        throw new PublicMcpError("RATE_LIMITED", "The operation rate limit was reached.", { httpStatus: 429, retryable: true });
      }
      for (const [key, count] of records) counters.set(key, count + cost);
    },
  });
}

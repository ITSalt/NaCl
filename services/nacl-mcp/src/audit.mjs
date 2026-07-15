import { createHmac, randomBytes } from "node:crypto";

const EVENT_FIELDS = new Set([
  "support_ref", "timestamp", "actor_ref", "server_ref", "project_ref", "session_ref",
  "tool", "capability", "decision", "result_code", "latency_ms", "idempotency_outcome",
]);

function supportRef() {
  return `support_${randomBytes(16).toString("hex")}`;
}

export function createRedactedAuditSink({ secret, now = () => Date.now() } = {}) {
  if (typeof secret !== "string" || secret.length < 32) throw new TypeError("audit secret must be at least 32 characters.");
  const events = [];
  const pseudonym = (kind, value) => createHmac("sha256", secret).update(`${kind}\0${value}`).digest("hex").slice(0, 32);
  return Object.freeze({
    durability: "process-local",
    newSupportRef: supportRef,
    record({ support_ref, actor, server, project, session, tool, capability, decision, resultCode, latencyMs, idempotencyOutcome }) {
      const event = Object.freeze({
        support_ref,
        timestamp: new Date(now()).toISOString(),
        actor_ref: pseudonym("actor", actor),
        server_ref: pseudonym("server", server),
        project_ref: pseudonym("project", project),
        session_ref: pseudonym("session", session),
        tool,
        capability,
        decision,
        result_code: resultCode,
        latency_ms: Math.max(0, Math.round(latencyMs)),
        idempotency_outcome: idempotencyOutcome,
      });
      if (Object.keys(event).some((key) => !EVENT_FIELDS.has(key))) throw new TypeError("audit event contains an unsafe field");
      events.push(event);
      return event;
    },
    events() { return structuredClone(events); },
  });
}

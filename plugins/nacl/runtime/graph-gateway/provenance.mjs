import { createHash } from "node:crypto";
import { gatewayError } from "./errors.mjs";
import { assertAuthorizationDecision } from "./authorization.mjs";
import { validateIdentityContext } from "./identity.mjs";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const OPERATION = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;

function assertRecord(value, label, allowed, required = allowed) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw gatewayError("PROVENANCE_INVALID", `${label} must be an object.`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw gatewayError("PROVENANCE_INVALID", `${label} contains unknown field(s): ${unknown.join(", ")}.`);
  }
  const missing = required.filter((key) => value[key] === undefined);
  if (missing.length > 0) {
    throw gatewayError("PROVENANCE_INVALID", `${label} omits required field(s): ${missing.join(", ")}.`);
  }
}

function hashIdempotencyKey(value) {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw gatewayError("PROVENANCE_INVALID", "idempotency_key is malformed.");
  }
  return createHash("sha256").update(value).digest("hex");
}

export function buildAuthorizationProvenance(input) {
  assertRecord(
    input,
    "provenance input",
    ["project_id", "identity", "decision", "operation", "idempotency_key"],
    ["project_id", "identity", "decision", "operation"],
  );
  const identity = validateIdentityContext(input.identity);
  const decision = assertAuthorizationDecision(input.decision);
  if (typeof input.operation !== "string" || !OPERATION.test(input.operation)) {
    throw gatewayError("PROVENANCE_INVALID", "operation is malformed.");
  }
  if (
    decision.project_id !== input.project_id ||
    decision.principal_id !== identity.principal_id ||
    decision.client_id !== identity.client_id ||
    decision.session_id !== identity.session_id ||
    decision.worker_id !== identity.worker_id ||
    decision.worktree_id !== identity.worktree_id ||
    decision.branch !== identity.branch ||
    decision.base_sha !== identity.base_sha ||
    JSON.stringify(decision.pull_request) !== JSON.stringify(identity.pull_request)
  ) {
    throw gatewayError("PROVENANCE_CONTEXT_MISMATCH", "Authorization and identity provenance do not match.");
  }
  const record = {
    provenance_version: 1,
    project_id: input.project_id,
    principal_id: identity.principal_id,
    worker_id: identity.worker_id,
    client_id: identity.client_id,
    session_id: identity.session_id,
    worktree_id: identity.worktree_id,
    branch: identity.branch,
    base_sha: identity.base_sha,
    role: decision.role,
    membership_revision: decision.membership_revision,
    capability: decision.capability,
    tool_class: decision.tool_class,
    operation: input.operation,
    authorization_outcome: decision.outcome,
    authorization_code: decision.code,
  };
  if (identity.pull_request) record.pull_request = identity.pull_request;
  if (input.idempotency_key !== undefined) {
    record.idempotency_key_hash = hashIdempotencyKey(input.idempotency_key);
  }
  return Object.freeze(record);
}

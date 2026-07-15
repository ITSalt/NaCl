import { gatewayError } from "./errors.mjs";
import path from "node:path";
import { CAPABILITY_POLICY, ROLES } from "./authorization.mjs";
import {
  RESOURCE_CAPABILITIES,
  deriveWorkerId,
  sanitizeChanges,
  validateIdentity,
  validateResourceId,
  validateResourceType,
} from "./concurrency.mjs";

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw gatewayError("INVALID_ARGUMENT", `${label} must be an object.`);
  }
}

export function validateToolArguments(definition, input) {
  assertObject(input, "arguments");
  const allowed = new Set(Object.keys(definition.inputSchema.properties));
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw gatewayError("INVALID_ARGUMENT", `Unknown argument(s): ${unknown.join(", ")}.`);
  }
  const expectedConfirmation = definition.operation === "apply-migrations"
    ? "APPLY_MIGRATIONS"
    : definition.operation === "write-canary"
      ? "WRITE_CANARY"
      : definition.operation === "membership-bootstrap"
        ? "CONFIRM_INITIAL_PROJECT_ADMIN"
        : null;
  if (expectedConfirmation && input.confirmation !== expectedConfirmation) {
    throw gatewayError(
      "CONFIRMATION_REQUIRED",
      `Explicit confirmation ${expectedConfirmation} is required.`,
      { status: "BLOCKED" },
    );
  }
  for (const required of definition.inputSchema.required ?? []) {
    if (input[required] === undefined) {
      throw gatewayError("INVALID_ARGUMENT", `Missing required argument: ${required}.`);
    }
  }
  if (!PROJECT_ID.test(input.project_id ?? "")) {
    throw gatewayError("INVALID_PROJECT_ID", "project_id is malformed.");
  }
  if (
    typeof input.project_root !== "string" ||
    input.project_root.length < 1 ||
    input.project_root.length > 4096 ||
    /[\0\r\n]/.test(input.project_root) ||
    !path.isAbsolute(input.project_root)
  ) {
    throw gatewayError("INVALID_PROJECT_ROOT", "project_root is malformed.");
  }
  if (input.idempotency_key !== undefined && !IDEMPOTENCY_KEY.test(input.idempotency_key)) {
    throw gatewayError("INVALID_IDEMPOTENCY_KEY", "idempotency_key is malformed.");
  }
  if (definition.operation === "read" && !["canary", "summary"].includes(input.query)) {
    throw gatewayError("QUERY_NOT_ALLOWED", "Only packaged named read queries are allowed.");
  }
  if (["health", "schema-status", "read", "write-canary", "apply-migrations"].includes(definition.operation)) {
    const identity = validateIdentity(input);
    if (identity.worker_id !== input.worker_id) {
      throw gatewayError("WORKER_ID_MISMATCH", "worker_id is not derived from the request identity.", {
        status: "BLOCKED",
      });
    }
    if (definition.operation === "write-canary" && input.approval !== "APPROVE_PROJECT_WRITE") {
      throw gatewayError("CONFIRMATION_REQUIRED", "Exact capability approval APPROVE_PROJECT_WRITE is required.", {
        status: "BLOCKED",
      });
    }
    if (definition.operation === "apply-migrations") {
      if (input.approval !== "CONFIRM_SCHEMA_ADMIN") {
        throw gatewayError("CONFIRMATION_REQUIRED", "Exact capability approval CONFIRM_SCHEMA_ADMIN is required.", {
          status: "BLOCKED",
        });
      }
      if (!Number.isSafeInteger(input.fencing_token) || input.fencing_token < 1) {
        throw gatewayError("FENCING_TOKEN_INVALID", "fencing_token must be a positive safe integer.");
      }
    }
    return;
  }
  if (definition.operation === "concurrency-identity") {
    deriveWorkerId({
      principal_id: input.principal_id,
      client_id: input.client_id,
      session_id: input.session_id,
    });
    return;
  }
  if (definition.operation === "membership-bootstrap") {
    const identity = validateIdentity(input);
    if (identity.worker_id !== input.worker_id) {
      throw gatewayError("WORKER_ID_MISMATCH", "worker_id is not derived from the request identity.", {
        status: "BLOCKED",
      });
    }
    return;
  }
  if (definition.operation === "membership-set") {
    validateIdentity(input);
    if (
      typeof input.target_principal_id !== "string" ||
      input.target_principal_id.length < 3 ||
      input.target_principal_id.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(input.target_principal_id) ||
      input.target_principal_id.includes("..") ||
      input.target_principal_id.includes("//") ||
      /[./:@-]$/.test(input.target_principal_id)
    ) {
      throw gatewayError("IDENTITY_INVALID", "target_principal_id is malformed.");
    }
    if (!ROLES.includes(input.target_role) || typeof input.target_active !== "boolean") {
      throw gatewayError("AUTHORIZATION_INVALID", "target membership role or active flag is malformed.");
    }
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0) {
      throw gatewayError("REVISION_INVALID", "expected_revision must be a non-negative safe integer.");
    }
    if (input.approval !== "CONFIRM_MEMBERSHIP_ADMIN") {
      throw gatewayError("CONFIRMATION_REQUIRED", "Exact capability approval CONFIRM_MEMBERSHIP_ADMIN is required.", {
        status: "BLOCKED",
      });
    }
    return;
  }
  if (
    [
      "lease-acquire",
      "lease-heartbeat",
      "lease-release",
      "lease-handoff",
      "resource-mutate",
      "allocate-and-create",
    ].includes(definition.operation)
  ) {
    const identity = validateIdentity(input);
    const resourceType = validateResourceType(input.resource_type ?? input.entity_kind);
    if (input.resource_id !== undefined) validateResourceId(input.resource_id);
    if (definition.operation === "lease-handoff") validateIdentity(input, "target_");
    if (input.evidence_confirmation !== undefined && resourceType !== "Task") {
      throw gatewayError(
        "NO_TEST_EVIDENCE_CONFIRMATION_UNEXPECTED",
        "evidence_confirmation is accepted only for Task no-test evidence.",
        { status: "BLOCKED" },
      );
    }
    if (
      input.ttl_seconds !== undefined &&
      (!Number.isSafeInteger(input.ttl_seconds) || input.ttl_seconds < 30 || input.ttl_seconds > 86400)
    ) {
      throw gatewayError("TTL_INVALID", "ttl_seconds must be an integer from 30 through 86400.");
    }
    if (
      input.fencing_token !== undefined &&
      (!Number.isSafeInteger(input.fencing_token) || input.fencing_token < 1)
    ) {
      throw gatewayError("FENCING_TOKEN_INVALID", "fencing_token must be a positive safe integer.");
    }
    if (
      input.expected_revision !== undefined &&
      (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0)
    ) {
      throw gatewayError("REVISION_INVALID", "expected_revision must be a non-negative safe integer.");
    }
    if (input.changes !== undefined) {
      sanitizeChanges(resourceType, input.changes, {
        ...(input.evidence_confirmation === undefined ? {} : { evidenceConfirmation: input.evidence_confirmation }),
      });
    }
    const capability = RESOURCE_CAPABILITIES[resourceType];
    const expectedApproval = CAPABILITY_POLICY[capability]?.confirmation;
    if (typeof expectedApproval !== "string" || input.approval !== expectedApproval) {
      throw gatewayError("CONFIRMATION_REQUIRED", `Exact capability approval ${expectedApproval} is required.`, {
        status: "BLOCKED",
      });
    }
    if (identity.worker_id !== input.worker_id) {
      throw gatewayError("WORKER_ID_MISMATCH", "worker_id is not derived from the request identity.", {
        status: "BLOCKED",
      });
    }
  }
}

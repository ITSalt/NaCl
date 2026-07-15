import { createHash, randomUUID } from "node:crypto";
import { gatewayError } from "./errors.mjs";
import { deriveWorkerId, validateIdentityContext } from "./identity.mjs";

export const CONCURRENCY_RESOURCE_TYPES = Object.freeze([
  "Task",
  "UseCase",
  "Module",
  "FeatureRequest",
  "Board",
  "SchemaMigration",
  "ReleaseEnvironment",
]);

export const RESOURCE_CAPABILITIES = Object.freeze({
  Task: "tl.write",
  UseCase: "sa.write",
  Module: "sa.write",
  FeatureRequest: "sa.write",
  Board: "ba.write",
  SchemaMigration: "schema.admin",
  ReleaseEnvironment: "release.write",
});

const RESOURCE_PREFIXES = Object.freeze({
  Task: "TASK",
  UseCase: "UC",
  Module: "MOD",
  FeatureRequest: "FR",
  Board: "BOARD",
  SchemaMigration: "MIG",
  ReleaseEnvironment: "RELENV",
});

const MUTABLE_PROPERTIES = Object.freeze({
  Task: new Set(["status", "title", "description", "verification_evidence", "blocked_reason"]),
  UseCase: new Set(["status", "name", "description", "acceptance_criteria"]),
  Module: new Set(["status", "name", "description"]),
  FeatureRequest: new Set(["status", "name", "title", "description"]),
  Board: new Set(["status", "name", "description"]),
  SchemaMigration: new Set(["status", "description"]),
  ReleaseEnvironment: new Set(["status", "name", "description"]),
});

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,127}$/;
const TERMINAL_TASK_STATUSES = new Set(["done", "verified-pending"]);
const QA_STAGES = new Set(["component", "local-runtime", "wire-contract", "provider-fixture", "live-provider-smoke", "prod-golden-path"]);
const CLOSED_STATUSES = new Set(["VERIFIED", "FAILED", "PARTIALLY_VERIFIED", "BLOCKED", "NOT_RUN", "UNVERIFIED"]);
const STUB_GRAPH_LABELS = new Set(["FormField", "DomainAttribute", "Enumeration", "DomainEntity"]);
const NO_TEST_CONFIRMATION = "CONFIRM_NO_TEST_EVIDENCE";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceInvalid(message) {
  throw gatewayError("TERMINAL_TASK_EVIDENCE_INVALID", message, { status: "BLOCKED" });
}

function validateRepoRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    /[\\:\s\0]/.test(value) ||
    !/^[A-Za-z0-9._@+,\/-]+$/.test(value)
  ) {
    evidenceInvalid(`${label} must be a safe forward-slash repo-relative path.`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    evidenceInvalid(`${label} contains an unsafe path segment.`);
  }
  return value;
}

function validateIsoInstant(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) evidenceInvalid("wire-evidence:live-smoke must carry an ISO-8601 instant.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  const zoneValid = zone === "Z" || (() => {
    const [zoneHour, zoneMinute] = zone.slice(1).split(":").map(Number);
    return zoneHour <= 23 && zoneMinute <= 59;
  })();
  if (
    year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth ||
    hour > 23 || minute > 59 || second > 59 || !zoneValid || !Number.isFinite(Date.parse(value))
  ) {
    evidenceInvalid("wire-evidence:live-smoke carries an invalid calendar instant.");
  }
  return value;
}

function validateStubReference(value) {
  const graph = /^((?:UC|TECH)-\d+):([A-Za-z][A-Za-z0-9]*):([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(value);
  if (graph) {
    if (!STUB_GRAPH_LABELS.has(graph[2])) evidenceInvalid("stub-shape-validated uses an unknown graph label.");
    return value;
  }
  const file = /^(.*):([1-9]\d*)$/.exec(value);
  if (!file) evidenceInvalid("stub-shape-validated must carry a graph node path or file:line reference.");
  validateRepoRelativePath(file[1], "stub-shape-validated path");
  return value;
}

export function parseVerificationEvidence(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes("  ") ||
    /[\t\r\n]/.test(value)
  ) {
    evidenceInvalid("verification_evidence must be a non-empty single-space-delimited string.");
  }
  const tokens = value.split(" ");
  const seen = new Set();
  const singleton = new Set();
  const qaStages = new Map();
  const stubReferences = new Set();
  let hasTestGreen = false;
  let hasTestUnverified = false;
  let hasNoTest = false;
  for (const token of tokens) {
    if (seen.has(token)) evidenceInvalid(`Duplicate evidence token: ${token}.`);
    seen.add(token);
    if (token.startsWith("test-GREEN:")) {
      validateRepoRelativePath(token.slice("test-GREEN:".length), "test-GREEN path");
      hasTestGreen = true;
      continue;
    }
    if (token === "test-UNVERIFIED") {
      if (singleton.has(token)) evidenceInvalid("test-UNVERIFIED may appear at most once.");
      singleton.add(token);
      hasTestUnverified = true;
      continue;
    }
    if (token === "no-test") {
      if (singleton.has(token)) evidenceInvalid("no-test may appear at most once.");
      singleton.add(token);
      hasNoTest = true;
      continue;
    }
    if (token.startsWith("repo-checks-GREEN:")) {
      if (singleton.has("repo-checks-GREEN")) evidenceInvalid("repo-checks-GREEN may appear at most once.");
      singleton.add("repo-checks-GREEN");
      if (!/^[0-9a-f]{7,64}$/.test(token.slice("repo-checks-GREEN:".length))) {
        evidenceInvalid("repo-checks-GREEN must carry a 7-64 character lowercase hexadecimal commit.");
      }
      continue;
    }
    const wirePath = /^wire-evidence:(fixture|contract-test):(.+)$/.exec(token);
    if (wirePath) {
      validateRepoRelativePath(wirePath[2], `wire-evidence:${wirePath[1]} path`);
      continue;
    }
    if (token.startsWith("wire-evidence:live-smoke:")) {
      validateIsoInstant(token.slice("wire-evidence:live-smoke:".length));
      continue;
    }
    const qa = /^qa-stage:([^:]+):([^:]+)$/.exec(token);
    if (qa) {
      if (!QA_STAGES.has(qa[1]) || !CLOSED_STATUSES.has(qa[2])) {
        evidenceInvalid("qa-stage must use an exact stage and closed status.");
      }
      if (qaStages.has(qa[1])) evidenceInvalid(`qa-stage:${qa[1]} may appear at most once.`);
      qaStages.set(qa[1], qa[2]);
      continue;
    }
    if (token.startsWith("stub-shape-validated:")) {
      const reference = validateStubReference(token.slice("stub-shape-validated:".length));
      if (stubReferences.has(reference)) evidenceInvalid(`Duplicate stub-shape-validated reference: ${reference}.`);
      stubReferences.add(reference);
      continue;
    }
    evidenceInvalid(`Unknown or malformed verification evidence token: ${token}.`);
  }
  return { tokens, hasTestGreen, hasTestUnverified, hasNoTest, qaStages, stubReferences };
}

export function validateIdentity(input, prefix = "") {
  return validateIdentityContext({
    principal_id: input[`${prefix}principal_id`],
    client_id: input[`${prefix}client_id`],
    session_id: input[`${prefix}session_id`],
    worker_id: input[`${prefix}worker_id`],
    worktree_id: input[`${prefix}worktree_id`],
    branch: input[`${prefix}branch`],
    base_sha: input[`${prefix}base_sha`],
    ...(input[`${prefix}pull_request`] === undefined
      ? {}
      : { pull_request: input[`${prefix}pull_request`] }),
  });
}

export function validateResourceType(value, label = "resource_type") {
  if (!CONCURRENCY_RESOURCE_TYPES.includes(value)) {
    throw gatewayError("RESOURCE_TYPE_INVALID", `${label} is not an allow-listed protected resource type.`);
  }
  return value;
}

export function validateResourceId(value) {
  if (typeof value !== "string" || !RESOURCE_ID.test(value)) {
    throw gatewayError("RESOURCE_ID_INVALID", "resource_id is malformed.");
  }
  return value;
}

function validatePropertyValue(value, key) {
  const scalar = value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
  const stringArray = Array.isArray(value) && value.length <= 256 &&
    value.every((entry) => typeof entry === "string" && entry.length <= 4096);
  if (!scalar && !stringArray) {
    throw gatewayError("MUTATION_VALUE_INVALID", `changes.${key} must be a JSON scalar or bounded string array.`);
  }
  if (typeof value === "string" && value.length > 32_768) {
    throw gatewayError("MUTATION_VALUE_INVALID", `changes.${key} is too large.`);
  }
}

export function sanitizeChanges(resourceType, value, options = {}) {
  validateResourceType(resourceType);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw gatewayError("MUTATION_INVALID", "changes must be an object.");
  }
  const allowed = MUTABLE_PROPERTIES[resourceType];
  const keys = Object.keys(value).sort();
  if (keys.length === 0 || keys.length > allowed.size) {
    throw gatewayError("MUTATION_INVALID", "changes must contain at least one allow-listed property.");
  }
  const sanitized = {};
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw gatewayError("MUTATION_PROPERTY_DENIED", `changes.${key} is not mutable for ${resourceType}.`);
    }
    validatePropertyValue(value[key], key);
    sanitized[key] = value[key];
  }
  if (resourceType === "Task") {
    let evidence = null;
    if (sanitized.verification_evidence !== undefined) evidence = parseVerificationEvidence(sanitized.verification_evidence);
    if (TERMINAL_TASK_STATUSES.has(sanitized.status) && evidence === null) {
      throw gatewayError(
        "TERMINAL_TASK_EVIDENCE_REQUIRED",
        "A successful terminal Task mutation must include parseable verification_evidence in the same mutation.",
        { status: "BLOCKED" },
      );
    }
    if (evidence?.hasNoTest && options.evidenceConfirmation !== NO_TEST_CONFIRMATION) {
      throw gatewayError(
        "NO_TEST_EVIDENCE_CONFIRMATION_REQUIRED",
        `Exact evidence_confirmation ${NO_TEST_CONFIRMATION} is required for no-test evidence.`,
        { status: "BLOCKED" },
      );
    }
    if (!evidence?.hasNoTest && options.evidenceConfirmation !== undefined) {
      throw gatewayError(
        "NO_TEST_EVIDENCE_CONFIRMATION_UNEXPECTED",
        "evidence_confirmation is accepted only with no-test evidence.",
        { status: "BLOCKED" },
      );
    }
    if (sanitized.status === "done" && (
      (!evidence.hasTestGreen && !evidence.hasNoTest) ||
      evidence.hasTestUnverified ||
      (evidence.hasTestGreen && evidence.hasNoTest)
    )) {
      throw gatewayError(
        "TERMINAL_TASK_EVIDENCE_INVALID",
        "A done Task requires exactly test-GREEN:<repo-relative-path> or an explicitly confirmed no-test override.",
        { status: "BLOCKED" },
      );
    }
    if (sanitized.status === "verified-pending" && (
      !evidence.hasTestUnverified || evidence.hasTestGreen || evidence.hasNoTest
    )) {
      throw gatewayError(
        "TERMINAL_TASK_EVIDENCE_INVALID",
        "A verified-pending Task requires test-UNVERIFIED evidence.",
        { status: "BLOCKED" },
      );
    }
  }
  return sanitized;
}

export function concurrencyRequestContext(definition, input, options = {}) {
  const identity = validateIdentity(input);
  const membershipOperation = definition.operation === "membership-set";
  const bootstrapOperation = definition.operation === "membership-bootstrap";
  const resourceType = membershipOperation
    ? "ProjectMembership"
    : bootstrapOperation
      ? "ProjectAuthorization"
      : validateResourceType(input.resource_type ?? input.entity_kind, input.resource_type ? "resource_type" : "entity_kind");
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw gatewayError("CLOCK_INVALID", "The gateway clock returned an invalid epoch millisecond value.");
  }
  const context = {
    identity,
    resourceType,
    capability: membershipOperation ? "membership.admin" : bootstrapOperation ? null : RESOURCE_CAPABILITIES[resourceType],
    nowMs,
    requestNonce: randomUUID(),
  };
  if (input.evidence_confirmation !== undefined && resourceType !== "Task") {
    throw gatewayError(
      "NO_TEST_EVIDENCE_CONFIRMATION_UNEXPECTED",
      "evidence_confirmation is accepted only for Task no-test evidence.",
      { status: "BLOCKED" },
    );
  }
  if (input.resource_id !== undefined) context.resourceId = validateResourceId(input.resource_id);
  if (membershipOperation) {
    if (
      typeof input.target_principal_id !== "string" ||
      !PRINCIPAL_ID.test(input.target_principal_id) ||
      input.target_principal_id.includes("..") ||
      input.target_principal_id.includes("//") ||
      /[./:@-]$/.test(input.target_principal_id)
    ) {
      throw gatewayError("IDENTITY_INVALID", "target_principal_id is malformed.");
    }
    context.resourceId = input.target_principal_id;
  }
  if (bootstrapOperation) context.resourceId = input.project_id;
  if (input.changes !== undefined) {
    context.changes = sanitizeChanges(resourceType, input.changes, {
      ...(input.evidence_confirmation === undefined ? {} : { evidenceConfirmation: input.evidence_confirmation }),
    });
  }
  if (input.evidence_confirmation !== undefined) context.evidenceConfirmation = input.evidence_confirmation;
  if (definition.operation === "lease-handoff") {
    context.targetIdentity = validateIdentity(input, "target_");
    if (context.targetIdentity.worker_id === identity.worker_id) {
      throw gatewayError("HANDOFF_TARGET_INVALID", "An explicit handoff requires a different target worker.");
    }
    const confirmation = `HANDOFF_RESOURCE:${resourceType}:${context.resourceId}:${context.targetIdentity.worker_id}`;
    if (input.confirmation !== confirmation) {
      throw gatewayError("CONFIRMATION_REQUIRED", `Explicit confirmation ${confirmation} is required.`, {
        status: "BLOCKED",
      });
    }
  }
  if (Number.isInteger(input.ttl_seconds)) {
    context.expiresAtMs = nowMs + input.ttl_seconds * 1000;
  }
  if (input.idempotency_key) {
    context.idempotencyKeyHash = hash(input.idempotency_key);
  }
  context.payloadHash = hash(canonicalJson({
    operation: definition.operation,
    projectId: input.project_id,
    resourceType,
    resourceId: context.resourceId,
    identity,
    targetIdentity: context.targetIdentity,
    fencingToken: input.fencing_token,
    expectedRevision: input.expected_revision,
    ttlSeconds: input.ttl_seconds,
    changes: context.changes,
    targetRole: input.target_role,
    targetActive: input.target_active,
    confirmation: input.confirmation,
    evidenceConfirmation: input.evidence_confirmation,
  }));
  return context;
}

export function allocationPrefix(resourceType) {
  return RESOURCE_PREFIXES[validateResourceType(resourceType)];
}

export function canonicalPayloadHash(value) {
  return hash(canonicalJson(value));
}

export { deriveWorkerId };

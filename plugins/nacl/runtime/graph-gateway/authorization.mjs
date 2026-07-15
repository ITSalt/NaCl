import { gatewayError } from "./errors.mjs";
import { validateIdentityContext } from "./identity.mjs";

export const ROLES = Object.freeze([
  "viewer",
  "analyst",
  "architect",
  "developer",
  "release_manager",
  "project_admin",
]);

export const CAPABILITY_POLICY = Object.freeze({
  "project.read": Object.freeze({ toolClass: "read", confirmation: null }),
  "project.write": Object.freeze({ toolClass: "project-write", confirmation: "APPROVE_PROJECT_WRITE" }),
  "ba.write": Object.freeze({ toolClass: "ba-write", confirmation: "APPROVE_BA_WRITE" }),
  "sa.write": Object.freeze({ toolClass: "sa-write", confirmation: "APPROVE_SA_WRITE" }),
  "tl.write": Object.freeze({ toolClass: "tl-write", confirmation: "APPROVE_TL_WRITE" }),
  "release.write": Object.freeze({ toolClass: "release", confirmation: "CONFIRM_RELEASE_OPERATION" }),
  "membership.admin": Object.freeze({ toolClass: "membership-admin", confirmation: "CONFIRM_MEMBERSHIP_ADMIN" }),
  "schema.admin": Object.freeze({ toolClass: "schema-admin", confirmation: "CONFIRM_SCHEMA_ADMIN" }),
  "backup.admin": Object.freeze({ toolClass: "backup-admin", confirmation: "CONFIRM_BACKUP_ADMIN" }),
  "restore.admin": Object.freeze({ toolClass: "restore-admin", confirmation: "CONFIRM_RESTORE_ADMIN" }),
  "graph.destructive": Object.freeze({ toolClass: "destructive-admin", confirmation: "CONFIRM_DESTRUCTIVE" }),
  "cypher.raw-admin": Object.freeze({ toolClass: "raw-cypher-admin", confirmation: "CONFIRM_RAW_CYPHER_ADMIN" }),
});

export const CAPABILITIES = Object.freeze(Object.keys(CAPABILITY_POLICY));
export const TOOL_CLASSES = Object.freeze(Object.values(CAPABILITY_POLICY).map(({ toolClass }) => toolClass));

export const ROLE_CAPABILITIES = Object.freeze({
  viewer: Object.freeze(["project.read"]),
  analyst: Object.freeze(["project.read", "project.write", "ba.write"]),
  architect: Object.freeze(["project.read", "project.write", "sa.write"]),
  developer: Object.freeze(["project.read", "project.write", "tl.write"]),
  release_manager: Object.freeze(["project.read", "project.write", "release.write"]),
  project_admin: Object.freeze([
    "project.read",
    "project.write",
    "membership.admin",
    "schema.admin",
    "backup.admin",
    "restore.admin",
    "graph.destructive",
    "cypher.raw-admin",
  ]),
});

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,127}$/;
const WORKER_ID = /^worker-[0-9a-f]{48}$/;
const DECISION_CODES = new Set([
  "AUTHORIZED",
  "TOOL_CLASS_DENIED",
  "PROJECT_MEMBERSHIP_DENIED",
  "PRINCIPAL_MEMBERSHIP_DENIED",
  "MEMBERSHIP_NOT_FOUND",
  "MEMBERSHIP_INACTIVE",
  "ROLE_CAPABILITY_DENIED",
  "CONFIRMATION_REQUIRED",
]);

function assertRecord(value, label, allowed, required = allowed) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw gatewayError("AUTHORIZATION_INVALID", `${label} must be an object.`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw gatewayError("AUTHORIZATION_INVALID", `${label} contains unknown field(s): ${unknown.join(", ")}.`);
  }
  const missing = required.filter((key) => value[key] === undefined);
  if (missing.length > 0) {
    throw gatewayError("AUTHORIZATION_INVALID", `${label} omits required field(s): ${missing.join(", ")}.`);
  }
}

function projectId(value) {
  if (typeof value !== "string" || !PROJECT_ID.test(value)) {
    throw gatewayError("AUTHORIZATION_INVALID", "project_id is malformed.");
  }
  return value;
}

function membershipRecord(value) {
  assertRecord(value, "membership", ["project_id", "principal_id", "role", "active", "revision"]);
  if (
    typeof value.principal_id !== "string" ||
    !PRINCIPAL_ID.test(value.principal_id) ||
    value.principal_id.includes("..") ||
    value.principal_id.includes("//") ||
    /[./:@-]$/.test(value.principal_id)
  ) {
    throw gatewayError("AUTHORIZATION_INVALID", "membership.principal_id is malformed.");
  }
  if (!ROLES.includes(value.role)) {
    throw gatewayError("AUTHORIZATION_INVALID", "membership.role is unknown.");
  }
  if (typeof value.active !== "boolean") {
    throw gatewayError("AUTHORIZATION_INVALID", "membership.active must be boolean.");
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw gatewayError("AUTHORIZATION_INVALID", "membership.revision must be a positive safe integer.");
  }
  return Object.freeze({
    project_id: projectId(value.project_id),
    principal_id: value.principal_id,
    role: value.role,
    active: value.active,
    revision: value.revision,
  });
}

function decision(input, accepted, code, confirmationRequired, requiredConfirmation) {
  return Object.freeze({
    authorization_version: 1,
    accepted,
    outcome: accepted ? "accepted" : "rejected",
    code,
    project_id: input.projectId,
    principal_id: input.identity.principal_id,
    client_id: input.identity.client_id,
    session_id: input.identity.session_id,
    worker_id: input.identity.worker_id,
    worktree_id: input.identity.worktree_id,
    branch: input.identity.branch,
    base_sha: input.identity.base_sha,
    ...(input.identity.pull_request ? { pull_request: input.identity.pull_request } : {}),
    role: input.membership.role,
    membership_revision: input.membership.revision,
    capability: input.capability,
    tool_class: input.toolClass,
    confirmation_required: confirmationRequired,
    ...(requiredConfirmation ? { required_confirmation: requiredConfirmation } : {}),
  });
}

async function authorizeProjectOperation(input, resolveMembership) {
  assertRecord(
    input,
    "authorization request",
    ["project_id", "identity", "capability", "tool_class", "confirmation"],
    ["project_id", "identity", "capability", "tool_class"],
  );
  const resolvedProjectId = projectId(input.project_id);
  const identity = validateIdentityContext(input.identity);
  if (typeof input.capability !== "string" || !CAPABILITIES.includes(input.capability)) {
    throw gatewayError("AUTHORIZATION_INVALID", "capability is unknown.");
  }
  const policy = CAPABILITY_POLICY[input.capability];
  if (typeof input.tool_class !== "string" || !TOOL_CLASSES.includes(input.tool_class)) {
    throw gatewayError("AUTHORIZATION_INVALID", "tool_class is unknown.");
  }
  const resolvedMembership = await resolveMembership(Object.freeze({
    project_id: resolvedProjectId,
    principal_id: identity.principal_id,
  }));
  if (resolvedMembership === null || resolvedMembership === undefined) {
    return decision({
      projectId: resolvedProjectId,
      identity,
      membership: Object.freeze({
        project_id: resolvedProjectId,
        principal_id: identity.principal_id,
        role: "none",
        active: false,
        revision: 0,
      }),
      capability: input.capability,
      toolClass: policy.toolClass,
    }, false, "MEMBERSHIP_NOT_FOUND", policy.confirmation !== null, policy.confirmation);
  }
  const validated = {
    projectId: resolvedProjectId,
    identity,
    membership: membershipRecord(resolvedMembership),
    capability: input.capability,
    toolClass: policy.toolClass,
  };
  if (input.tool_class !== policy.toolClass) {
    return decision(validated, false, "TOOL_CLASS_DENIED", policy.confirmation !== null, policy.confirmation);
  }
  if (validated.membership.project_id !== validated.projectId) {
    return decision(validated, false, "PROJECT_MEMBERSHIP_DENIED", policy.confirmation !== null, policy.confirmation);
  }
  if (validated.membership.principal_id !== validated.identity.principal_id) {
    return decision(validated, false, "PRINCIPAL_MEMBERSHIP_DENIED", policy.confirmation !== null, policy.confirmation);
  }
  if (!validated.membership.active) {
    return decision(validated, false, "MEMBERSHIP_INACTIVE", policy.confirmation !== null, policy.confirmation);
  }
  if (!ROLE_CAPABILITIES[validated.membership.role].includes(input.capability)) {
    return decision(validated, false, "ROLE_CAPABILITY_DENIED", policy.confirmation !== null, policy.confirmation);
  }
  if (policy.confirmation !== null && input.confirmation !== policy.confirmation) {
    return decision(validated, false, "CONFIRMATION_REQUIRED", true, policy.confirmation);
  }
  return decision(validated, true, "AUTHORIZED", policy.confirmation !== null, policy.confirmation);
}

export function createProjectAuthorizer(dependencies) {
  assertRecord(dependencies, "authorization dependencies", ["resolveMembership"]);
  if (typeof dependencies.resolveMembership !== "function") {
    throw gatewayError("AUTHORIZATION_INVALID", "resolveMembership must be a server-controlled function.");
  }
  return Object.freeze({
    authorizeProjectOperation(input) {
      return authorizeProjectOperation(input, dependencies.resolveMembership);
    },
  });
}

export function rolesForCapability(capability) {
  if (typeof capability !== "string" || !CAPABILITIES.includes(capability)) {
    throw gatewayError("AUTHORIZATION_INVALID", "capability is unknown.");
  }
  return Object.freeze(
    ROLES.filter((role) => ROLE_CAPABILITIES[role].includes(capability)),
  );
}

export function assertAuthorizationDecision(value) {
  assertRecord(
    value,
    "authorization decision",
    [
      "authorization_version",
      "accepted",
      "outcome",
      "code",
      "project_id",
      "principal_id",
      "client_id",
      "session_id",
      "worker_id",
      "worktree_id",
      "branch",
      "base_sha",
      "pull_request",
      "role",
      "membership_revision",
      "capability",
      "tool_class",
      "confirmation_required",
      "required_confirmation",
    ],
    [
      "authorization_version",
      "accepted",
      "outcome",
      "code",
      "project_id",
      "principal_id",
      "client_id",
      "session_id",
      "worker_id",
      "worktree_id",
      "branch",
      "base_sha",
      "role",
      "membership_revision",
      "capability",
      "tool_class",
      "confirmation_required",
    ],
  );
  if (
    value.authorization_version !== 1 ||
    typeof value.accepted !== "boolean" ||
    value.outcome !== (value.accepted ? "accepted" : "rejected") ||
    !DECISION_CODES.has(value.code) ||
    value.accepted !== (value.code === "AUTHORIZED") ||
    ![...ROLES, "none"].includes(value.role) ||
    !Number.isSafeInteger(value.membership_revision) ||
    value.membership_revision < 0 ||
    (value.role === "none") !== (value.membership_revision === 0) ||
    (value.role === "none") !== (value.code === "MEMBERSHIP_NOT_FOUND") ||
    typeof value.principal_id !== "string" ||
    !PRINCIPAL_ID.test(value.principal_id) ||
    typeof value.worker_id !== "string" ||
    !WORKER_ID.test(value.worker_id) ||
    !CAPABILITIES.includes(value.capability) ||
    !TOOL_CLASSES.includes(value.tool_class) ||
    CAPABILITY_POLICY[value.capability].toolClass !== value.tool_class ||
    value.confirmation_required !== (CAPABILITY_POLICY[value.capability]?.confirmation !== null) ||
    (value.confirmation_required &&
      value.required_confirmation !== CAPABILITY_POLICY[value.capability]?.confirmation) ||
    (!value.confirmation_required && value.required_confirmation !== undefined) ||
    (value.accepted && !ROLE_CAPABILITIES[value.role]?.includes(value.capability))
  ) {
    throw gatewayError("AUTHORIZATION_INVALID", "authorization decision is malformed.");
  }
  const identity = validateIdentityContext({
    principal_id: value.principal_id,
    client_id: value.client_id,
    session_id: value.session_id,
    worker_id: value.worker_id,
    worktree_id: value.worktree_id,
    branch: value.branch,
    base_sha: value.base_sha,
    ...(value.pull_request ? { pull_request: value.pull_request } : {}),
  });
  projectId(value.project_id);
  if (identity.worker_id !== value.worker_id) {
    throw gatewayError("AUTHORIZATION_INVALID", "authorization decision identity is malformed.");
  }
  return value;
}

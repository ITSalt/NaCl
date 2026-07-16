import { CAPABILITIES, CAPABILITY_POLICY, ROLE_CAPABILITIES, ROLES } from "./authorization.mjs";
import { gatewayError } from "./errors.mjs";
import { validateIdentityContext } from "./identity.mjs";

const ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

function deny(input, code = "ACCESS_OR_RESOURCE_NOT_FOUND") {
  return Object.freeze({
    authorization_version: 2,
    accepted: false,
    outcome: "rejected",
    code,
    project_id: input.project_id,
    principal_id: input.identity.principal_id,
    capability: input.capability,
    tool_class: CAPABILITY_POLICY[input.capability]?.toolClass ?? input.tool_class,
  });
}

function exactObject(value, allowed, required, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw gatewayError("AUTHORIZATION_INVALID", `${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = required.filter((key) => value[key] === undefined);
  if (unknown.length > 0 || missing.length > 0) throw gatewayError("AUTHORIZATION_INVALID", `${label} has an invalid field set.`);
}

function routeRecord(value) {
  exactObject(value, ["server_id", "project_scope", "enabled"], ["server_id", "project_scope", "enabled"], "project route");
  if (!ROUTE_ID.test(value.server_id) || !ROUTE_ID.test(value.project_scope) || typeof value.enabled !== "boolean") {
    throw gatewayError("AUTHORIZATION_INVALID", "project route is malformed.");
  }
  return value;
}

function grantRecord(value) {
  exactObject(value, ["server_id", "principal_id", "role", "active", "revision"], ["server_id", "principal_id", "role", "active", "revision"], "server grant");
  if (
    !ROUTE_ID.test(value.server_id) ||
    typeof value.principal_id !== "string" ||
    !ROLES.includes(value.role) ||
    typeof value.active !== "boolean" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) throw gatewayError("AUTHORIZATION_INVALID", "server grant is malformed.");
  return value;
}

export function createServerOperationAuthorizer({ resolveProjectRoute, resolveServerGrant } = {}) {
  if (typeof resolveProjectRoute !== "function" || typeof resolveServerGrant !== "function") {
    throw gatewayError("AUTHORIZATION_INVALID", "Server-controlled route and grant resolvers are required.");
  }
  return Object.freeze({
    async authorizeProjectOperation(input) {
      exactObject(input, ["project_id", "identity", "capability", "tool_class", "confirmation"], ["project_id", "identity", "capability", "tool_class"], "authorization request");
      if (typeof input.project_id !== "string" || !ROUTE_ID.test(input.project_id) || !CAPABILITIES.includes(input.capability)) {
        return deny({ ...input, identity: validateIdentityContext(input.identity) });
      }
      const identity = validateIdentityContext(input.identity);
      const policy = CAPABILITY_POLICY[input.capability];
      if (input.tool_class !== policy.toolClass) return deny({ ...input, identity }, "TOOL_CLASS_DENIED");
      let route;
      let grant;
      try {
        route = routeRecord(await resolveProjectRoute(Object.freeze({ project_ref: input.project_id })));
        if (!route.enabled) return deny({ ...input, identity });
        grant = grantRecord(await resolveServerGrant(Object.freeze({ server_id: route.server_id, principal_id: identity.principal_id })));
      } catch {
        return deny({ ...input, identity });
      }
      if (grant.server_id !== route.server_id || grant.principal_id !== identity.principal_id || !grant.active) return deny({ ...input, identity });
      if (!ROLE_CAPABILITIES[grant.role].includes(input.capability)) return deny({ ...input, identity }, "ROLE_CAPABILITY_DENIED");
      if (policy.confirmation !== null && input.confirmation !== policy.confirmation) return deny({ ...input, identity }, "CONFIRMATION_REQUIRED");
      return Object.freeze({
        authorization_version: 2,
        accepted: true,
        outcome: "accepted",
        code: "AUTHORIZED",
        server_id: route.server_id,
        project_id: input.project_id,
        project_scope: route.project_scope,
        principal_id: identity.principal_id,
        role: grant.role,
        authorization_revision: grant.revision,
        capability: input.capability,
        tool_class: policy.toolClass,
        confirmation_required: policy.confirmation !== null,
      });
    },
  });
}

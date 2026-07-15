import { createHash } from "node:crypto";
import { createServerOperationAuthorizer } from "../../../codex-plugin-src/package/runtime/graph-gateway/server-operation-authorization.mjs";
import { deriveWorkerId } from "../../../codex-plugin-src/package/runtime/graph-gateway/identity.mjs";
import { ROLES } from "../../../codex-plugin-src/package/runtime/graph-gateway/authorization.mjs";
import { PublicMcpError, ReauthorizationRequired } from "./errors.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{2,127}$/;
const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9._:@|/-]{2,127}$/;
const PROJECT_REF = /^prj_[A-Za-z0-9_-]{16,76}$/;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function identifier(value, label) {
  if (typeof value !== "string" || !ID.test(value) || value.includes("..") || /[.:@-]$/.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

function subjectIdentifier(value) {
  if (typeof value !== "string" || !SUBJECT.test(value) || value.includes("..") || value.includes("//") || /[./:@|-]$/.test(value)) {
    throw new TypeError("subject is invalid.");
  }
  return value;
}

function routeRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !["project_ref", "server_id", "project_scope", "label", "enabled"].includes(key)) ||
      !PROJECT_REF.test(value.project_ref) || typeof value.enabled !== "boolean" ||
      typeof value.label !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,79}$/.test(value.label)) throw new TypeError("project route is invalid.");
  return Object.freeze({
    project_ref: value.project_ref,
    server_id: identifier(value.server_id, "server_id"),
    project_scope: identifier(value.project_scope, "project_scope"),
    label: value.label,
    enabled: value.enabled === true,
  });
}

function internalIdentity(principalId, tokenContext) {
  const digest = (label, value) => createHash("sha256").update(`${label}\0${value}`).digest("hex").slice(0, 24);
  const client_id = `oauth-client-${digest("client", tokenContext.issuer)}`;
  const session_id = `oauth-session-${digest("session", tokenContext.sessionId)}`;
  return Object.freeze({
    principal_id: principalId,
    client_id,
    session_id,
    worker_id: deriveWorkerId({ principal_id: principalId, client_id, session_id }),
    worktree_id: "hosted-public-mcp",
    branch: "hosted/public-mcp",
    base_sha: "0".repeat(40),
  });
}

function hiddenDenial() {
  return new PublicMcpError("ACCESS_OR_RESOURCE_NOT_FOUND", "Access or project route was not found.", { httpStatus: 403 });
}

export function createMemorySessionRegistry({ now = () => Date.now(), maxEntries = 10_000 } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new TypeError("session registry bounds are invalid.");
  const sessions = new Map();
  function prune() {
    const current = now();
    for (const [sessionId, record] of sessions) {
      if (record.expires_at <= current) sessions.delete(sessionId);
    }
  }
  return Object.freeze({
    durability: "process-local",
    async getOrCreate(sessionId, record) {
      prune();
      const existing = sessions.get(sessionId);
      if (existing) return structuredClone(existing);
      if (sessions.size >= maxEntries) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
      sessions.set(sessionId, structuredClone(record));
      return structuredClone(record);
    },
    async revoke({ subject, sessionId, expiresAt }) {
      prune();
      const existing = sessions.get(sessionId);
      const record = {
        ...(existing ?? { subject, principal_id: null, binding_revision: null, token_epoch: null }),
        subject,
        revoked: true,
        // Without an authoritative OAuth-session expiry, revocation is an
        // indefinite tombstone. Capacity exhaustion fails closed rather than
        // silently reviving an old session identifier.
        expires_at: Math.max(existing?.expires_at ?? 0, expiresAt ?? Number.MAX_SAFE_INTEGER),
      };
      sessions.set(sessionId, structuredClone(record));
    },
  });
}

export function createServerControlPlane({ routes, serverRegistries = new Map(), sessionRegistry = createMemorySessionRegistry() } = {}) {
  if (!Array.isArray(routes) || routes.length === 0) throw new TypeError("routes are required.");
  const routeMap = new Map(routes.map((value) => {
    const route = routeRecord(value);
    return [route.project_ref, route];
  }));
  if (routeMap.size !== routes.length) throw new TypeError("project_ref values must be unique.");
  const bindings = new Map();
  if (typeof sessionRegistry?.getOrCreate !== "function" || typeof sessionRegistry?.revoke !== "function") {
    throw new TypeError("a session registry is required.");
  }
  const authorizer = createServerOperationAuthorizer({
    async resolveProjectRoute({ project_ref }) {
      const route = routeMap.get(project_ref);
      if (!route) throw hiddenDenial();
      return { server_id: route.server_id, project_scope: route.project_scope, enabled: route.enabled };
    },
    async resolveServerGrant({ server_id, principal_id }) {
      for (const binding of bindings.values()) {
        if (binding.principal_id !== principal_id || !binding.active) continue;
        const grant = binding.grants.get(server_id);
        if (grant) return { server_id, principal_id, role: grant.role, active: grant.active, revision: grant.revision };
      }
      throw hiddenDenial();
    },
  });

  function bindingFor(subject) {
    const binding = bindings.get(subject);
    if (!binding?.active) throw new ReauthorizationRequired({ error: "invalid_token" });
    return binding;
  }

  function invalidate(binding) {
    binding.epoch += 1;
    binding.revision += 1;
  }

  async function activeSession(tokenContext) {
    if (tokenContext?.verified !== true) throw new ReauthorizationRequired({ error: "invalid_token" });
    const binding = bindingFor(tokenContext.subject);
    if (tokenContext.tokenEpoch !== binding.epoch) throw new ReauthorizationRequired({ error: "invalid_token" });
    const session = await sessionRegistry.getOrCreate(tokenContext.sessionId, {
      subject: binding.subject,
      principal_id: binding.principal_id,
      binding_revision: binding.revision,
      token_epoch: binding.epoch,
      revoked: false,
      expires_at: tokenContext.expiresAt * 1000,
    });
    if (session.revoked || session.subject !== binding.subject || session.principal_id !== binding.principal_id ||
        session.binding_revision !== binding.revision || session.token_epoch !== binding.epoch) {
      throw new ReauthorizationRequired({ error: "invalid_token" });
    }
    return { binding, session };
  }

  return Object.freeze({
    sessionRegistryDurability: sessionRegistry.durability ?? "unknown",
    registerSubject({ subject, principalId, certificateCn }) {
      subjectIdentifier(subject);
      identifier(principalId, "principalId");
      identifier(certificateCn, "certificateCn");
      if (bindings.has(subject) || [...bindings.values()].some((item) => item.principal_id === principalId || item.certificate_cn === certificateCn)) {
        throw new TypeError("subject, principal, or certificate already exists");
      }
      bindings.set(subject, { subject, principal_id: principalId, certificate_cn: certificateCn, active: true, epoch: 0, revision: 1, grants: new Map() });
    },
    async grantServer({ subject, serverId, role = "project_admin" }) {
      const binding = bindingFor(subject);
      identifier(serverId, "serverId");
      if (!ROLES.includes(role)) throw new TypeError("role is invalid.");
      const registry = serverRegistries.get(serverId);
      if (!registry || typeof registry.grantPrincipal !== "function") throw hiddenDenial();
      const result = await registry.grantPrincipal(binding.certificate_cn);
      if (result?.status !== "VERIFIED") return Object.freeze({ status: "BLOCKED", code: "SERVER_GRANT_NOT_RECONCILED" });
      const previous = binding.grants.get(serverId);
      binding.grants.set(serverId, { role, active: true, revision: (previous?.revision ?? 0) + 1 });
      invalidate(binding);
      return Object.freeze({ status: "VERIFIED", code: "SERVER_GRANTED", token_epoch: binding.epoch });
    },
    async rotatePrincipal({ subject, nextCertificateCn }) {
      const binding = bindingFor(subject);
      identifier(nextCertificateCn, "nextCertificateCn");
      if (nextCertificateCn === binding.certificate_cn || [...bindings.values()].some((item) => item !== binding && item.certificate_cn === nextCertificateCn)) {
        throw new TypeError("nextCertificateCn is already bound");
      }
      const active = [...binding.grants.entries()].filter(([, grant]) => grant.active);
      const results = await Promise.all(active.map(async ([serverId]) => {
        const registry = serverRegistries.get(serverId);
        return registry?.rotatePrincipal?.(binding.certificate_cn, nextCertificateCn);
      }));
      if (results.some((result) => result?.status !== "VERIFIED")) {
        for (const [, grant] of active) grant.active = false;
        invalidate(binding);
        return Object.freeze({ status: "BLOCKED", code: "PRINCIPAL_ROTATION_NOT_RECONCILED", token_epoch: binding.epoch });
      }
      binding.certificate_cn = nextCertificateCn;
      invalidate(binding);
      return Object.freeze({ status: "VERIFIED", code: "PRINCIPAL_ROTATED", token_epoch: binding.epoch });
    },
    async revokeServer({ subject, serverId }) {
      const binding = bindingFor(subject);
      identifier(serverId, "serverId");
      const grant = binding.grants.get(serverId);
      if (!grant?.active) throw hiddenDenial();
      // OAuth/public access is invalidated even if the lower mTLS projection
      // reports BLOCKED; the registry is responsible for fail-closed gateway
      // quarantine and must never leave the stale public session usable.
      grant.active = false;
      grant.revision += 1;
      invalidate(binding);
      const result = await serverRegistries.get(serverId)?.revokePrincipal?.(binding.certificate_cn);
      return Object.freeze({
        status: result?.status === "VERIFIED" ? "VERIFIED" : "BLOCKED",
        code: result?.status === "VERIFIED" ? "SERVER_REVOKED" : "SERVER_REVOKE_NOT_RECONCILED",
        token_epoch: binding.epoch,
      });
    },
    async revokeSession({ subject, sessionId, expiresAt }) {
      subjectIdentifier(subject);
      if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) throw new TypeError("sessionId is invalid.");
      if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) throw new TypeError("expiresAt is invalid.");
      await sessionRegistry.revoke({ subject, sessionId, expiresAt });
    },
    currentTokenEpoch(subject) { return bindingFor(subject).epoch; },
    async listProjects({ tokenContext }) {
      const { binding } = await activeSession(tokenContext);
      const projects = [...routeMap.values()]
        .filter((route) => route.enabled && binding.grants.get(route.server_id)?.active)
        .sort((left, right) => left.label.localeCompare(right.label) || left.project_ref.localeCompare(right.project_ref))
        .slice(0, 50)
        .map(({ project_ref, label }) => Object.freeze({ project_ref, label }));
      return Object.freeze({
        principalId: binding.principal_id,
        sessionId: tokenContext.sessionId,
        projects: Object.freeze(projects),
      });
    },
    async authorize({ tokenContext, projectRef, capability, toolClass, confirmation }) {
      const { binding } = await activeSession(tokenContext);
      const decision = await authorizer.authorizeProjectOperation({
        project_id: projectRef,
        identity: internalIdentity(binding.principal_id, tokenContext),
        capability,
        tool_class: toolClass,
        ...(confirmation ? { confirmation } : {}),
      });
      if (!decision.accepted) throw hiddenDenial();
      return Object.freeze({
        principalId: binding.principal_id,
        certificateCn: binding.certificate_cn,
        serverId: decision.server_id,
        projectRef,
        projectScope: decision.project_scope,
        authorizationRevision: decision.authorization_revision,
        sessionId: tokenContext.sessionId,
      });
    },
  });
}

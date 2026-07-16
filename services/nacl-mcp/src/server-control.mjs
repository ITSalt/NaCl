import { createHash, randomBytes } from "node:crypto";
import { createServerOperationAuthorizer } from "../../../codex-plugin-src/package/runtime/graph-gateway/server-operation-authorization.mjs";
import { deriveWorkerId } from "../../../codex-plugin-src/package/runtime/graph-gateway/identity.mjs";
import { ROLES } from "../../../codex-plugin-src/package/runtime/graph-gateway/authorization.mjs";
import { PublicMcpError, ReauthorizationRequired } from "./errors.mjs";
import { canonicalIssuer } from "./canonical-url.mjs";

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

function bindingKey(issuer, subject) {
  return `${canonicalIssuer(issuer)}\0${subjectIdentifier(subject)}`;
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
  function sessionKey(issuer, subject, sessionId) {
    return `${issuer}\0${subject}\0${sessionId}`;
  }
  return Object.freeze({
    durability: "process-local",
    async getOrCreate(sessionId, record) {
      prune();
      const key = sessionKey(record.issuer, record.subject, sessionId);
      const existing = sessions.get(key);
      if (existing) return structuredClone(existing);
      if (sessions.size >= maxEntries) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
      sessions.set(key, structuredClone(record));
      return structuredClone(record);
    },
    async revoke({ issuer, subject, sessionId, expiresAt }) {
      prune();
      const key = sessionKey(issuer, subject, sessionId);
      const existing = sessions.get(key);
      if (!existing && sessions.size >= maxEntries) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
      const record = {
        ...(existing ?? { issuer, subject, principal_id: null, binding_revision: null, token_epoch: null }),
        issuer,
        subject,
        revoked: true,
        // Without an authoritative OAuth-session expiry, revocation is an
        // indefinite tombstone. Capacity exhaustion fails closed rather than
        // silently reviving an old session identifier.
        expires_at: Math.max(existing?.expires_at ?? 0, expiresAt ?? Number.MAX_SAFE_INTEGER),
      };
      sessions.set(key, structuredClone(record));
    },
  });
}

function cloneBinding(binding) {
  return {
    issuer: binding.issuer,
    subject: binding.subject,
    principal_id: binding.principal_id,
    certificate_cn: binding.certificate_cn,
    link_receipt_id: binding.link_receipt_id,
    link_revision: binding.link_revision,
    active: binding.active,
    epoch: binding.epoch,
    revision: binding.revision,
    transition: binding.transition ? structuredClone(binding.transition) : null,
    grants: new Map([...binding.grants].map(([serverId, grant]) => [serverId, { ...grant }])),
  };
}

function cloneBindings(bindings) {
  return new Map([...bindings].map(([subject, binding]) => [subject, cloneBinding(binding)]));
}

export function createMemoryAuthorizationStateRegistry() {
  let revision = 0;
  let bindings = new Map();
  return Object.freeze({
    durability: "process-local",
    scope: "process-local",
    async load() {
      return { revision, bindings: cloneBindings(bindings) };
    },
    async compareAndSet(expectedRevision, nextBindings) {
      if (expectedRevision !== revision) return false;
      bindings = cloneBindings(nextBindings);
      revision += 1;
      return true;
    },
  });
}

export function createServerControlPlane({
  routes,
  serverRegistries = new Map(),
  sessionRegistry = createMemorySessionRegistry(),
  authorizationStateRegistry = createMemoryAuthorizationStateRegistry(),
  principalLinkVerifier,
  now = () => Date.now(),
} = {}) {
  if (!Array.isArray(routes) || routes.length === 0) throw new TypeError("routes are required.");
  const routeMap = new Map(routes.map((value) => {
    const route = routeRecord(value);
    return [route.project_ref, route];
  }));
  if (routeMap.size !== routes.length) throw new TypeError("project_ref values must be unique.");
  let bindings = new Map();
  let authorizationRevision = -1;
  if (typeof sessionRegistry?.getOrCreate !== "function" || typeof sessionRegistry?.revoke !== "function") {
    throw new TypeError("a session registry is required.");
  }
  if (typeof authorizationStateRegistry?.load !== "function" || typeof authorizationStateRegistry?.compareAndSet !== "function") {
    throw new TypeError("an authorization-state registry is required.");
  }
  if (typeof principalLinkVerifier?.verifyAndConsume !== "function") throw new TypeError("a principal-link proof verifier is required.");
  for (const [serverId, registry] of serverRegistries) {
    identifier(serverId, "serverId");
    if (["grantPrincipal", "rotatePrincipal", "revokePrincipal", "verifyPrincipal"].some((method) => typeof registry?.[method] !== "function")) {
      throw new TypeError("every server registry must implement grant, rotate, revoke, and authoritative verification.");
    }
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
        if (!grant?.active) continue;
        const authoritative = await serverRegistries.get(server_id)?.verifyPrincipal?.(binding.certificate_cn);
        if (authoritative?.status === "VERIFIED") {
          return { server_id, principal_id, role: grant.role, active: true, revision: grant.revision };
        }
      }
      throw hiddenDenial();
    },
  });

  function bindingFor(issuer, subject) {
    const binding = bindings.get(bindingKey(issuer, subject));
    if (!binding?.active || binding.transition) throw new ReauthorizationRequired({ error: "invalid_token" });
    return binding;
  }

  async function refreshAuthorizationState() {
    const loaded = await authorizationStateRegistry.load();
    if (loaded === null || typeof loaded !== "object" || !Number.isSafeInteger(loaded.revision) || loaded.revision < 0 || !(loaded.bindings instanceof Map)) {
      throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
    }
    bindings = cloneBindings(loaded.bindings);
    authorizationRevision = loaded.revision;
  }

  async function persistAuthorizationState(mutator) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await refreshAuthorizationState();
      const next = cloneBindings(bindings);
      const value = mutator(next);
      if (await authorizationStateRegistry.compareAndSet(authorizationRevision, next)) {
        bindings = next;
        authorizationRevision += 1;
        return value;
      }
    }
    throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
  }

  function invalidate(binding) {
    binding.epoch += 1;
    binding.revision += 1;
  }

  function transitionId() {
    return `transition-${randomBytes(16).toString("hex")}`;
  }

  async function activeSession(tokenContext) {
    if (tokenContext?.verified !== true) throw new ReauthorizationRequired({ error: "invalid_token" });
    await refreshAuthorizationState();
    const binding = bindingFor(tokenContext.issuer, tokenContext.subject);
    if (tokenContext.tokenEpoch !== binding.epoch) throw new ReauthorizationRequired({ error: "invalid_token" });
    const session = await sessionRegistry.getOrCreate(tokenContext.sessionId, {
      issuer: binding.issuer,
      subject: binding.subject,
      principal_id: binding.principal_id,
      binding_revision: binding.revision,
      token_epoch: binding.epoch,
      revoked: false,
      expires_at: tokenContext.expiresAt * 1000,
    });
    if (session.revoked || session.issuer !== binding.issuer || session.subject !== binding.subject || session.principal_id !== binding.principal_id ||
        session.binding_revision !== binding.revision || session.token_epoch !== binding.epoch) {
      throw new ReauthorizationRequired({ error: "invalid_token" });
    }
    return { binding, session };
  }

  return Object.freeze({
    sessionRegistryDurability: sessionRegistry.durability ?? "unknown",
    authorizationStateDurability: authorizationStateRegistry.durability ?? "unknown",
    authorizationStateScope: authorizationStateRegistry.scope ?? "unknown",
    async registerSubject({ issuer, subject, principalId, certificateCn, linkReceipt }) {
      const key = bindingKey(issuer, subject);
      subjectIdentifier(subject);
      identifier(principalId, "principalId");
      identifier(certificateCn, "certificateCn");
      if (typeof linkReceipt !== "string" || !/^link_[A-Za-z0-9_-]{16,128}$/.test(linkReceipt)) throw new TypeError("linkReceipt is invalid.");
      const verified = await principalLinkVerifier.verifyAndConsume({
        receipt: linkReceipt,
        issuer: canonicalIssuer(issuer),
        subject,
        principalId,
        certificateCn,
      });
      if (verified?.verified !== true || verified.issuer !== canonicalIssuer(issuer) || verified.subject !== subject ||
          verified.principal_id !== principalId || verified.certificate_cn !== certificateCn ||
          typeof verified.receipt_id !== "string" || !/^proof_[A-Za-z0-9_-]{16,128}$/.test(verified.receipt_id) ||
          !Number.isSafeInteger(verified.revision) || verified.revision < 1 ||
          !Number.isSafeInteger(verified.expires_at) || verified.expires_at <= now()) {
        throw new ReauthorizationRequired({ error: "invalid_token" });
      }
      await persistAuthorizationState((next) => {
        if (next.has(key) || [...next.values()].some((item) => item.principal_id === principalId || item.certificate_cn === certificateCn ||
            item.transition?.next_certificate_cn === certificateCn || item.link_receipt_id === verified.receipt_id)) {
          throw new TypeError("subject, principal, or certificate already exists");
        }
        next.set(key, {
          issuer: canonicalIssuer(issuer), subject, principal_id: principalId, certificate_cn: certificateCn,
          link_receipt_id: verified.receipt_id, link_revision: verified.revision,
          active: true, epoch: 0, revision: 1, transition: null, grants: new Map(),
        });
      });
    },
    async grantServer({ issuer, subject, serverId, role = "project_admin" }) {
      const key = bindingKey(issuer, subject);
      identifier(serverId, "serverId");
      if (!ROLES.includes(role)) throw new TypeError("role is invalid.");
      const registry = serverRegistries.get(serverId);
      if (!registry || typeof registry.grantPrincipal !== "function") throw hiddenDenial();
      const intent = transitionId();
      const prepared = await persistAuthorizationState((next) => {
        const persisted = next.get(key);
        if (!persisted?.active || persisted.transition) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
        const previous = persisted.grants.get(serverId);
        persisted.grants.set(serverId, { role, active: false, revision: (previous?.revision ?? 0) + 1 });
        persisted.transition = { id: intent, type: "grant", server_id: serverId, started_at: now() };
        invalidate(persisted);
        return { certificateCn: persisted.certificate_cn };
      });
      const result = await registry.grantPrincipal(prepared.certificateCn);
      const authoritative = await registry.verifyPrincipal(prepared.certificateCn);
      return persistAuthorizationState((next) => {
        const persisted = next.get(key);
        if (persisted?.transition?.id !== intent) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
        const grant = persisted.grants.get(serverId);
        const verified = result?.status === "VERIFIED" && authoritative?.status === "VERIFIED";
        if (verified) {
          grant.active = true;
          persisted.transition = null;
          invalidate(persisted);
        }
        return Object.freeze({
          status: verified ? "VERIFIED" : "BLOCKED",
          code: verified ? "SERVER_GRANTED" : "SERVER_GRANT_NOT_RECONCILED",
          token_epoch: persisted.epoch,
        });
      });
    },
    async rotatePrincipal({ issuer, subject, nextCertificateCn }) {
      await refreshAuthorizationState();
      const key = bindingKey(issuer, subject);
      const binding = bindingFor(issuer, subject);
      identifier(nextCertificateCn, "nextCertificateCn");
      if (nextCertificateCn === binding.certificate_cn || [...bindings.values()].some((item) => item !== binding && item.certificate_cn === nextCertificateCn)) {
        throw new TypeError("nextCertificateCn is already bound");
      }
      const intent = transitionId();
      const prepared = await persistAuthorizationState((next) => {
        const persisted = next.get(key);
        if (!persisted?.active || persisted.transition || persisted.certificate_cn !== binding.certificate_cn ||
            [...next.values()].some((item) => item !== persisted && (item.certificate_cn === nextCertificateCn || item.transition?.next_certificate_cn === nextCertificateCn))) {
          throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
        }
        const serverIds = [...persisted.grants].filter(([, grant]) => grant.active).map(([serverId]) => serverId);
        persisted.transition = { id: intent, type: "rotate", next_certificate_cn: nextCertificateCn, started_at: now() };
        invalidate(persisted);
        return { previousCertificateCn: persisted.certificate_cn, serverIds };
      });
      const results = await Promise.all(prepared.serverIds.map(async (serverId) => {
        const registry = serverRegistries.get(serverId);
        const projected = await registry.rotatePrincipal(prepared.previousCertificateCn, nextCertificateCn);
        const authoritative = await registry.verifyPrincipal(nextCertificateCn);
        return { status: projected?.status === "VERIFIED" && authoritative?.status === "VERIFIED" ? "VERIFIED" : "BLOCKED" };
      }));
      const finalized = await persistAuthorizationState((next) => {
        const persisted = next.get(key);
        if (persisted?.transition?.id !== intent) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
        const collision = [...next.values()].some((item) => item !== persisted &&
          (item.certificate_cn === nextCertificateCn || item.transition?.next_certificate_cn === nextCertificateCn));
        const verified = !collision && results.every((result) => result?.status === "VERIFIED");
        if (verified) persisted.certificate_cn = nextCertificateCn;
        else if (collision) {
          persisted.active = false;
          for (const [, grant] of persisted.grants) grant.active = false;
        }
        if (verified || collision) {
          persisted.transition = null;
          invalidate(persisted);
        }
        return {
          collision,
          status: verified ? "VERIFIED" : "BLOCKED",
          code: verified ? "PRINCIPAL_ROTATED" : collision ? "PRINCIPAL_IDENTITY_COLLISION_QUARANTINED" : "PRINCIPAL_ROTATION_NOT_RECONCILED",
          token_epoch: persisted.epoch,
        };
      });
      if (finalized.collision) {
        await Promise.allSettled(prepared.serverIds.map((serverId) => serverRegistries.get(serverId)?.revokePrincipal?.(nextCertificateCn)));
      }
      return Object.freeze({ status: finalized.status, code: finalized.code, token_epoch: finalized.token_epoch });
    },
    async revokeServer({ issuer, subject, serverId }) {
      await refreshAuthorizationState();
      const key = bindingKey(issuer, subject);
      const binding = bindingFor(issuer, subject);
      identifier(serverId, "serverId");
      const grant = binding.grants.get(serverId);
      if (!grant?.active) throw hiddenDenial();
      // OAuth/public access is invalidated even if the lower mTLS projection
      // reports BLOCKED; the registry is responsible for fail-closed gateway
      // quarantine and must never leave the stale public session usable.
      const intent = transitionId();
      const revoked = await persistAuthorizationState((next) => {
        const persisted = next.get(key);
        if (!persisted?.active || persisted.transition) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
        const persistedGrant = persisted.grants.get(serverId);
        if (!persistedGrant?.active) throw hiddenDenial();
        persistedGrant.active = false;
        persistedGrant.revision += 1;
        persisted.transition = { id: intent, type: "revoke", server_id: serverId, started_at: now() };
        invalidate(persisted);
        return { epoch: persisted.epoch, certificateCn: persisted.certificate_cn };
      });
      const registry = serverRegistries.get(serverId);
      const result = await registry.revokePrincipal(revoked.certificateCn);
      const authoritative = await registry.verifyPrincipal(revoked.certificateCn);
      return persistAuthorizationState((next) => {
        const persisted = next.get(key);
        if (persisted?.transition?.id !== intent) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
        const verified = result?.status === "VERIFIED" && authoritative?.status === "BLOCKED";
        if (verified) {
          persisted.transition = null;
          invalidate(persisted);
        }
        return Object.freeze({
          status: verified ? "VERIFIED" : "BLOCKED",
          code: verified ? "SERVER_REVOKED" : "SERVER_REVOKE_NOT_RECONCILED",
          token_epoch: persisted.epoch,
        });
      });
    },
    async revokeSession({ issuer, subject, sessionId, expiresAt }) {
      const normalizedIssuer = canonicalIssuer(issuer);
      subjectIdentifier(subject);
      if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) throw new TypeError("sessionId is invalid.");
      if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) throw new TypeError("expiresAt is invalid.");
      await sessionRegistry.revoke({ issuer: normalizedIssuer, subject, sessionId, expiresAt });
    },
    async reconcileTransition({ issuer, subject }) {
      const key = bindingKey(issuer, subject);
      await refreshAuthorizationState();
      const binding = bindings.get(key);
      if (!binding?.transition) throw hiddenDenial();
      const transition = structuredClone(binding.transition);
      const pending = Object.freeze({ status: "BLOCKED", code: "PRINCIPAL_TRANSITION_PENDING", transition_id: transition.id });
      try {
        if (transition.type === "grant") {
          const registry = serverRegistries.get(transition.server_id);
          if (!registry) return pending;
          let authoritative = await registry.verifyPrincipal?.(binding.certificate_cn);
          if (authoritative?.status !== "VERIFIED") {
            const projected = await registry.grantPrincipal?.(binding.certificate_cn);
            if (projected?.status !== "VERIFIED") return pending;
            authoritative = await registry.verifyPrincipal?.(binding.certificate_cn);
          }
          if (authoritative?.status !== "VERIFIED") return pending;
          return persistAuthorizationState((next) => {
            const persisted = next.get(key);
            if (persisted?.transition?.id !== transition.id) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
            persisted.grants.get(transition.server_id).active = true;
            persisted.transition = null;
            invalidate(persisted);
            return Object.freeze({ status: "VERIFIED", code: "SERVER_GRANT_RECONCILED", token_epoch: persisted.epoch });
          });
        }
        if (transition.type === "rotate") {
          const serverIds = [...binding.grants].filter(([, grant]) => grant.active).map(([serverId]) => serverId);
          for (const serverId of serverIds) {
            const registry = serverRegistries.get(serverId);
            if (!registry) return pending;
            let authoritative = await registry.verifyPrincipal?.(transition.next_certificate_cn);
            if (authoritative?.status !== "VERIFIED") {
              const projected = await registry.rotatePrincipal?.(binding.certificate_cn, transition.next_certificate_cn);
              if (projected?.status !== "VERIFIED") return pending;
              authoritative = await registry.verifyPrincipal?.(transition.next_certificate_cn);
            }
            if (authoritative?.status !== "VERIFIED") return pending;
          }
          return persistAuthorizationState((next) => {
            const persisted = next.get(key);
            if (persisted?.transition?.id !== transition.id) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
            const collision = [...next.values()].some((item) => item !== persisted &&
              (item.certificate_cn === transition.next_certificate_cn || item.transition?.next_certificate_cn === transition.next_certificate_cn));
            if (collision) return pending;
            persisted.certificate_cn = transition.next_certificate_cn;
            persisted.transition = null;
            invalidate(persisted);
            return Object.freeze({ status: "VERIFIED", code: "PRINCIPAL_ROTATION_RECONCILED", token_epoch: persisted.epoch });
          });
        }
        if (transition.type === "revoke") {
          const registry = serverRegistries.get(transition.server_id);
          if (!registry) return pending;
          await registry.revokePrincipal?.(binding.certificate_cn);
          const authoritative = await registry.verifyPrincipal?.(binding.certificate_cn);
          if (authoritative?.status !== "BLOCKED") return pending;
          return persistAuthorizationState((next) => {
            const persisted = next.get(key);
            if (persisted?.transition?.id !== transition.id) throw new ReauthorizationRequired({ error: "temporarily_unavailable" });
            persisted.transition = null;
            invalidate(persisted);
            return Object.freeze({ status: "VERIFIED", code: "SERVER_REVOKE_RECONCILED", token_epoch: persisted.epoch });
          });
        }
        return pending;
      } catch {
        return pending;
      }
    },
    async currentTokenEpoch(issuer, subject) {
      await refreshAuthorizationState();
      return bindingFor(issuer, subject).epoch;
    },
    async listProjects({ tokenContext }) {
      const { binding } = await activeSession(tokenContext);
      const serverIds = [...binding.grants]
        .filter(([, grant]) => grant.active)
        .map(([serverId]) => serverId);
      const authoritative = new Map(await Promise.all(serverIds.map(async (serverId) => [
        serverId,
        (await serverRegistries.get(serverId)?.verifyPrincipal?.(binding.certificate_cn))?.status === "VERIFIED",
      ])));
      const projects = [...routeMap.values()]
        .filter((route) => route.enabled && binding.grants.get(route.server_id)?.active && authoritative.get(route.server_id) === true)
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

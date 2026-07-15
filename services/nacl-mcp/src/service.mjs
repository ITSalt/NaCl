import { createToolApplication } from "./application.mjs";
import { createSdkMcpServer } from "./sdk-server.mjs";
import { createStreamableHttpServer } from "./http-server.mjs";
import { createInjectedTokenContextVerifier } from "./token-context.mjs";

const CONFIG_FIELDS = new Set([
  "resourceUrl", "resourceMetadataUrl", "authorizationServers", "scopesSupported",
  "trustedIssuers", "allowedOrigins", "serverVersion", "rateLimit",
]);
const GRAPH_METHODS = ["projectSummary", "namedRead", "mutateProject", "applySchema", "createBackup", "requestRestore"];

function exactConfiguration(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !CONFIG_FIELDS.has(key))) {
    throw new TypeError("service configuration is invalid.");
  }
  return value;
}

export function validateServiceConfiguration(configuration) {
  const config = exactConfiguration(configuration);
  if (config.serverVersion !== undefined && (typeof config.serverVersion !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(config.serverVersion))) {
    throw new TypeError("serverVersion is invalid.");
  }
  if (config.rateLimit !== undefined && (config.rateLimit === null || typeof config.rateLimit !== "object" || Array.isArray(config.rateLimit) ||
      Object.keys(config.rateLimit).some((key) => !["windowMs", "limit", "maxKeys"].includes(key)) ||
      Object.values(config.rateLimit).some((value) => !Number.isSafeInteger(value) || value < 1))) {
    throw new TypeError("rateLimit is invalid.");
  }
  createInjectedTokenContextVerifier({
    resourceUrl: config.resourceUrl,
    trustedIssuers: config.trustedIssuers,
    supportedScopes: config.scopesSupported,
    async resolveVerifiedToken() { throw new Error("configuration validation only"); },
  });
  createStreamableHttpServer({
    resourceUrl: config.resourceUrl,
    resourceMetadataUrl: config.resourceMetadataUrl,
    authorizationServers: config.authorizationServers,
    scopesSupported: config.scopesSupported,
    allowedOrigins: config.allowedOrigins,
    async verifyAuthorization() { throw new Error("configuration validation only"); },
    async auditAuthenticationRejection() {},
    createMcpServer() { throw new Error("configuration validation only"); },
  });
  return config;
}

export function createNaclMcpService({ configuration, adapters } = {}) {
  const config = validateServiceConfiguration(configuration);
  if (adapters === null || typeof adapters !== "object" || Array.isArray(adapters)) {
    throw new TypeError("deployment adapters are required.");
  }
  const { resolveVerifiedToken, controlPlane, graphAdapter, auditSink, rateLimiter, idempotencyLedger } = adapters;
  if (typeof resolveVerifiedToken !== "function" || typeof controlPlane?.authorize !== "function" ||
      typeof controlPlane?.listProjects !== "function" || GRAPH_METHODS.some((method) => typeof graphAdapter?.[method] !== "function") ||
      typeof auditSink?.newSupportRef !== "function" || typeof auditSink?.record !== "function" ||
      typeof rateLimiter?.assert !== "function" || typeof idempotencyLedger?.execute !== "function" ||
      auditSink.durability !== "durable" || rateLimiter.scope !== "shared" ||
      idempotencyLedger.durability !== "durable" || controlPlane.sessionRegistryDurability !== "durable") {
    throw new TypeError("verified-token, control-plane, graph, audit, shared rate-limit, and durable idempotency adapters are required.");
  }
  const verifyAuthorization = createInjectedTokenContextVerifier({
    resourceUrl: config.resourceUrl,
    trustedIssuers: config.trustedIssuers,
    supportedScopes: config.scopesSupported,
    resolveVerifiedToken,
  });
  const callTool = createToolApplication({
    controlPlane,
    graphAdapter,
    auditSink,
    rateLimiter,
    idempotencyLedger,
  });
  const auditRejection = async ({ name, code, authContext }) => {
    const support_ref = auditSink.newSupportRef();
    await auditSink.record({
      support_ref,
      actor: authContext?.subject ?? "unknown",
      server: "unresolved",
      project: "unresolved",
      session: authContext?.sessionId ?? "unknown",
      tool: code === "TOOL_NOT_ALLOWED" ? "unknown-tool" : name,
      capability: "unresolved",
      decision: "rejected",
      resultCode: code,
      latencyMs: 0,
      idempotencyOutcome: "not-applicable",
    });
    return support_ref;
  };
  const auditAuthenticationRejection = async ({ scope }) => {
    await auditSink.record({
      support_ref: auditSink.newSupportRef(),
      actor: "unverified",
      server: "unresolved",
      project: "unresolved",
      session: "unverified",
      tool: "oauth-transport",
      capability: scope,
      decision: "rejected",
      resultCode: "INVALID_TOKEN",
      latencyMs: 0,
      idempotencyOutcome: "not-applicable",
    });
  };
  return createStreamableHttpServer({
    resourceUrl: config.resourceUrl,
    resourceMetadataUrl: config.resourceMetadataUrl,
    authorizationServers: config.authorizationServers,
    scopesSupported: config.scopesSupported,
    allowedOrigins: config.allowedOrigins,
    verifyAuthorization,
    auditAuthenticationRejection,
    createMcpServer: ({ authContext }) => createSdkMcpServer({
      callTool,
      auditRejection,
      resourceMetadataUrl: config.resourceMetadataUrl,
      authContext,
      serverVersion: config.serverVersion,
    }),
  });
}

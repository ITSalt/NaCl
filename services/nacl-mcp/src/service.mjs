import { createToolApplication } from "./application.mjs";
import { createIdempotencyLedger } from "./idempotency.mjs";
import { createLayeredRateLimiter } from "./rate-limit.mjs";
import { createSdkMcpServer } from "./sdk-server.mjs";
import { createStreamableHttpServer } from "./http-server.mjs";
import { createInjectedTokenContextVerifier } from "./token-context.mjs";

const CONFIG_FIELDS = new Set([
  "resourceUrl", "resourceMetadataUrl", "authorizationServers", "scopesSupported",
  "trustedIssuers", "allowedOrigins", "serverVersion", "rateLimit",
]);

function exactConfiguration(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !CONFIG_FIELDS.has(key))) {
    throw new TypeError("service configuration is invalid.");
  }
  return value;
}

export function createNaclMcpService({ configuration, adapters } = {}) {
  const config = exactConfiguration(configuration);
  if (adapters === null || typeof adapters !== "object" || Array.isArray(adapters)) {
    throw new TypeError("deployment adapters are required.");
  }
  const { resolveVerifiedToken, controlPlane, graphAdapter, auditSink } = adapters;
  if (typeof resolveVerifiedToken !== "function" || !controlPlane || !graphAdapter || !auditSink) {
    throw new TypeError("verified-token, control-plane, graph, and audit adapters are required.");
  }
  const rateLimiter = adapters.rateLimiter ?? createLayeredRateLimiter(config.rateLimit);
  const idempotencyLedger = adapters.idempotencyLedger ?? createIdempotencyLedger();
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
  return createStreamableHttpServer({
    resourceUrl: config.resourceUrl,
    resourceMetadataUrl: config.resourceMetadataUrl,
    authorizationServers: config.authorizationServers,
    scopesSupported: config.scopesSupported,
    allowedOrigins: config.allowedOrigins,
    verifyAuthorization,
    createMcpServer: ({ authContext }) => createSdkMcpServer({
      callTool,
      resourceMetadataUrl: config.resourceMetadataUrl,
      authContext,
      serverVersion: config.serverVersion,
    }),
  });
}

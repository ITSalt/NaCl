import http from "node:http";
import { transportChallenge } from "./oauth-challenge.mjs";

const MAX_BODY_BYTES = 256 * 1024;

function json(response, status, value, headers = {}) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(body);
}

function empty(response, status, headers = {}) {
  response.writeHead(status, {
    "content-length": "0",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end();
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("request too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid json"), { status: 400 });
  }
}

function canonicalUrl(value, label, { requireHttps = false } = {}) {
  const parsed = new URL(value);
  if ((requireHttps && parsed.protocol !== "https:") || (!requireHttps && !["http:", "https:"].includes(parsed.protocol)) ||
      parsed.username || parsed.password || parsed.hash) throw new TypeError(`${label} is invalid.`);
  return parsed.href;
}

export function createStreamableHttpServer({
  resourceUrl,
  resourceMetadataUrl,
  authorizationServers,
  scopesSupported,
  verifyAuthorization,
  protocol,
} = {}) {
  const resource = canonicalUrl(resourceUrl, "resourceUrl");
  const metadataUrl = canonicalUrl(resourceMetadataUrl, "resourceMetadataUrl");
  if (!Array.isArray(authorizationServers) || authorizationServers.length === 0) throw new TypeError("authorizationServers are required.");
  const authServers = authorizationServers.map((value) => canonicalUrl(value, "authorizationServer", { requireHttps: true }));
  if (!Array.isArray(scopesSupported) || scopesSupported.length === 0) throw new TypeError("scopesSupported are required.");
  if (typeof verifyAuthorization !== "function" || typeof protocol?.handle !== "function") throw new TypeError("authorization and protocol adapters are required.");
  const challenge = transportChallenge({ resourceMetadataUrl: metadataUrl });

  return http.createServer(async (request, response) => {
    try {
      const origin = request.headers.host ? `http://${request.headers.host}` : "http://invalid";
      const url = new URL(request.url ?? "/", origin);
      if (request.method === "GET" && url.pathname === new URL(metadataUrl).pathname) {
        return json(response, 200, {
          resource,
          authorization_servers: authServers,
          scopes_supported: scopesSupported,
          bearer_methods_supported: ["header"],
        });
      }
      if (request.method === "GET" && ["/healthz", "/readyz"].includes(url.pathname)) {
        return json(response, 200, { status: "ok" });
      }
      if (url.pathname !== new URL(resource).pathname || request.method !== "POST") return empty(response, 404);

      let authContext;
      try {
        authContext = await verifyAuthorization(request.headers.authorization);
      } catch {
        return empty(response, 401, { "www-authenticate": challenge });
      }
      const message = await readJson(request);
      const result = await protocol.handle(message, authContext);
      if (result === null) return empty(response, 202);
      return json(response, 200, result);
    } catch (error) {
      return json(response, error.status ?? 500, {
        error: error.status === 400 ? "invalid_request" : error.status === 413 ? "request_too_large" : "internal_error",
      });
    }
  });
}

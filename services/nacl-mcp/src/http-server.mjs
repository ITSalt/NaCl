import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requiredScope } from "./contracts.mjs";
import { transportChallenge } from "./oauth-challenge.mjs";
import { canonicalIssuer } from "./canonical-url.mjs";

export const STABLE_PROTOCOL_VERSION = "2025-11-25";
const MAX_BODY_BYTES = 256 * 1024;
const MCP_ACCEPT = ["application/json", "text/event-stream"];

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
  const loopback = ["127.0.0.1", "::1", "[::1]", "localhost"].includes(parsed.hostname);
  if ((requireHttps && parsed.protocol !== "https:") || (!requireHttps && parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) ||
      parsed.username || parsed.password || parsed.hash) throw new TypeError(`${label} is invalid.`);
  return parsed.href;
}

function requestScope(message) {
  if (message?.method !== "tools/call") return "nacl.server.read";
  return requiredScope(message.params?.name) ?? "nacl.server.read";
}

function jsonRpcMethodNotAllowed(response) {
  return json(response, 405, {
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  }, { allow: "POST" });
}

function hasRequiredAccept(header) {
  if (typeof header !== "string") return false;
  const values = header.toLowerCase().split(",").map((value) => value.split(";", 1)[0].trim());
  return MCP_ACCEPT.every((value) => values.includes(value));
}

function isInitialization(message) {
  return message !== null && typeof message === "object" && !Array.isArray(message) && message.method === "initialize";
}

export function createStreamableHttpServer({
  resourceUrl,
  resourceMetadataUrl,
  authorizationServers,
  scopesSupported,
  allowedOrigins,
  verifyAuthorization,
  auditAuthenticationRejection,
  createMcpServer,
} = {}) {
  const resource = canonicalUrl(resourceUrl, "resourceUrl");
  const metadataUrl = canonicalUrl(resourceMetadataUrl, "resourceMetadataUrl");
  const resourceParsed = new URL(resource);
  const metadataParsed = new URL(metadataUrl);
  if (resourceParsed.pathname !== "/mcp" || resourceParsed.search || metadataParsed.origin !== resourceParsed.origin ||
      metadataParsed.search || metadataParsed.pathname !== "/.well-known/oauth-protected-resource") {
    throw new TypeError("resourceMetadataUrl must be a same-origin protected-resource metadata endpoint.");
  }
  if (!Array.isArray(authorizationServers) || authorizationServers.length === 0) throw new TypeError("authorizationServers are required.");
  const authServers = authorizationServers.map((value) => canonicalIssuer(value, "authorizationServer"));
  if (!Array.isArray(scopesSupported) || scopesSupported.length === 0) throw new TypeError("scopesSupported are required.");
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) throw new TypeError("allowedOrigins are required.");
  const origins = new Set(allowedOrigins.map((value) => {
    const origin = new URL(canonicalUrl(value, "allowedOrigin", { requireHttps: true }));
    if (origin.pathname !== "/" || origin.search) throw new TypeError("allowedOrigin must be an exact HTTPS origin.");
    return origin.origin;
  }));
  if (typeof verifyAuthorization !== "function" || typeof auditAuthenticationRejection !== "function" || typeof createMcpServer !== "function") {
    throw new TypeError("authorization, authentication-audit, and MCP server factories are required.");
  }

  return http.createServer(async (request, response) => {
    let transport;
    let mcpServer;
    try {
      const host = request.headers.host;
      if (host !== resourceParsed.host) return empty(response, 421);
      const origin = request.headers.origin;
      if (origin !== undefined && !origins.has(origin)) return empty(response, 403);
      const url = new URL(request.url ?? "/", resourceParsed.origin);
      if (request.method === "GET" && url.pathname === new URL(metadataUrl).pathname) {
        return json(response, 200, {
          resource,
          authorization_servers: authServers,
          scopes_supported: scopesSupported,
          bearer_methods_supported: ["header"],
        });
      }
      if (request.method === "GET" && ["/healthz", "/readyz"].includes(url.pathname)) return json(response, 200, { status: "ok" });
      if (url.pathname !== resourceParsed.pathname) return empty(response, 404);
      if (["GET", "DELETE"].includes(request.method ?? "")) return jsonRpcMethodNotAllowed(response);
      if (request.method !== "POST") return jsonRpcMethodNotAllowed(response);

      // The protected resource must authenticate before returning transport
      // parsing details. For a presented token we perform only a bounded body
      // read first so an invalid token can still receive the exact tool scope;
      // any parse error is deferred until after successful authentication.
      let message;
      let bodyError;
      if (request.headers.authorization !== undefined) {
        try {
          message = await readJson(request);
        } catch (error) {
          bodyError = error;
        }
      }
      let verified;
      try {
        verified = await verifyAuthorization(request.headers.authorization);
      } catch {
        const scope = requestScope(message);
        try {
          await auditAuthenticationRejection({
            scope,
            sourceAddress: request.socket.remoteAddress ?? "unknown",
          });
        } catch {
          return empty(response, 503);
        }
        return empty(response, 401, {
          "www-authenticate": transportChallenge({ resourceMetadataUrl: metadataUrl, scope }),
        });
      }
      if (message === undefined && bodyError === undefined) message = await readJson(request);
      if (bodyError) throw bodyError;

      if (!hasRequiredAccept(request.headers.accept)) {
        return json(response, 406, { jsonrpc: "2.0", error: { code: -32000, message: "Not Acceptable." }, id: null });
      }
      if (request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
        return json(response, 415, { jsonrpc: "2.0", error: { code: -32000, message: "Unsupported Media Type." }, id: null });
      }
      if (request.headers["mcp-session-id"] !== undefined) {
        return json(response, 400, { jsonrpc: "2.0", error: { code: -32000, message: "This endpoint uses stateless MCP transport." }, id: null });
      }
      const protocolVersion = request.headers["mcp-protocol-version"];
      if (isInitialization(message) && message.params?.protocolVersion !== STABLE_PROTOCOL_VERSION) {
        return json(response, 400, { jsonrpc: "2.0", error: { code: -32000, message: "Unsupported MCP protocol version." }, id: message.id ?? null });
      }
      if (!isInitialization(message) && protocolVersion !== STABLE_PROTOCOL_VERSION) {
        return json(response, 400, { jsonrpc: "2.0", error: { code: -32000, message: protocolVersion === undefined ? "MCP-Protocol-Version is required after initialization." : "Unsupported MCP protocol version." }, id: message.id ?? null });
      }
      const authContext = Object.freeze({
        ...verified,
        sourceAddress: request.socket.remoteAddress ?? "unknown",
      });
      mcpServer = createMcpServer({ authContext });
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        allowedHosts: [resourceParsed.host],
        allowedOrigins: [...origins],
        enableDnsRebindingProtection: true,
      });
      await mcpServer.connect(transport);
      response.once("close", () => {
        transport?.close().catch(() => {});
        mcpServer?.close().catch(() => {});
      });
      await transport.handleRequest(request, response, message);
    } catch (error) {
      if (!response.headersSent) {
        return json(response, error.status ?? 500, {
          jsonrpc: "2.0",
          error: {
            code: error.status === 400 ? -32700 : -32603,
            message: error.status === 400 ? "Invalid JSON." : error.status === 413 ? "Request too large." : "Internal server error.",
          },
          id: null,
        });
      }
      response.end();
    }
  });
}

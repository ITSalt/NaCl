import { randomBytes } from "node:crypto";
import { CONTRACT_VERSION, PUBLIC_TOOLS, TOOL_BY_NAME, requiredScope } from "./contracts.mjs";
import { PublicMcpError, ReauthorizationRequired } from "./errors.mjs";
import { validateSchema } from "./json-schema.mjs";
import { toolChallenge } from "./oauth-challenge.mjs";

function supportRef() {
  return `support_${randomBytes(16).toString("hex")}`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function publicFailure(error) {
  const known = error instanceof PublicMcpError;
  return {
    contract: CONTRACT_VERSION,
    status: known && error.code === "RATE_LIMITED" ? "BLOCKED" : "FAILED",
    code: known ? error.code : "INTERNAL_ERROR",
    data: {},
    retryable: known ? error.retryable : false,
    replayed: false,
    support_ref: supportRef(),
  };
}

function toolResult(structuredContent, meta) {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: structuredContent.status !== "VERIFIED",
    ...(meta ? { _meta: meta } : {}),
  };
}

function validEnvelope(message) {
  return isObject(message) && message.jsonrpc === "2.0" && typeof message.method === "string" &&
    (message.id === undefined || message.id === null || typeof message.id === "string" || Number.isFinite(message.id)) &&
    (message.params === undefined || isObject(message.params));
}

export function createProtocolRuntime({ callTool, resourceMetadataUrl, serverVersion = "0.1.0" } = {}) {
  if (typeof callTool !== "function") throw new TypeError("callTool must be injected.");
  if (typeof resourceMetadataUrl !== "string") throw new TypeError("resourceMetadataUrl must be configured.");
  return Object.freeze({
    async handle(message, authContext) {
      const notification = isObject(message) && message.id === undefined;
      if (!validEnvelope(message)) return notification ? null : rpcError(null, -32600, "invalid request");
      if (notification) return null;
      const { id, method, params } = message;
      if (method === "initialize") {
        if (!isObject(params) || typeof params.protocolVersion !== "string") return rpcError(id, -32602, "invalid initialize parameters");
        return response(id, {
          protocolVersion: params.protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "nacl-public-mcp", version: serverVersion },
          instructions: "Use opaque project_ref values only. Never send graph URLs, paths, credentials, identities, or Cypher. Writes require exact confirmation and idempotency fields.",
        });
      }
      if (method === "ping") return response(id, {});
      if (method === "tools/list") {
        const allowed = params === undefined || (isObject(params) && Object.keys(params).every((key) => ["cursor", "_meta"].includes(key)));
        if (!allowed) return rpcError(id, -32602, "invalid tools/list parameters");
        return response(id, { tools: PUBLIC_TOOLS });
      }
      if (method !== "tools/call") return rpcError(id, -32601, "method not found");
      if (!isObject(params) || !Object.keys(params).every((key) => ["name", "arguments", "_meta"].includes(key)) ||
          typeof params.name !== "string" || !TOOL_BY_NAME.has(params.name) ||
          (params.arguments !== undefined && !isObject(params.arguments))) {
        return rpcError(id, -32602, "invalid tools/call parameters");
      }
      const descriptor = TOOL_BY_NAME.get(params.name);
      const validation = validateSchema(descriptor.inputSchema, params.arguments ?? {});
      if (!validation.valid) return rpcError(id, -32602, "invalid tools/call parameters");
      try {
        const structuredContent = await callTool({
          name: params.name,
          arguments: Object.freeze({ ...(params.arguments ?? {}) }),
          authContext,
          requiredScope: requiredScope(params.name),
        });
        const output = validateSchema(descriptor.outputSchema, structuredContent);
        if (!output.valid) throw new PublicMcpError("INTERNAL_ERROR", "The public response contract was not satisfied.");
        return response(id, toolResult(structuredContent));
      } catch (error) {
        const structuredContent = publicFailure(error);
        const meta = error instanceof ReauthorizationRequired ? {
          "mcp/www_authenticate": toolChallenge({
            resourceMetadataUrl,
            scope: error.scope,
            error: error.oauthError,
          }),
        } : undefined;
        return response(id, toolResult(structuredContent, meta));
      }
    },
  });
}

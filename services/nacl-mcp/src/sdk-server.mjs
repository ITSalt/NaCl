import { randomBytes } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { CONTRACT_VERSION, PUBLIC_TOOLS, TOOL_BY_NAME, requiredScope } from "./contracts.mjs";
import { PublicMcpError, ReauthorizationRequired } from "./errors.mjs";
import { validateSchema } from "./json-schema.mjs";
import { toolChallenge } from "./oauth-challenge.mjs";

function supportRef() {
  return `support_${randomBytes(16).toString("hex")}`;
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
    support_ref: typeof error?.supportRef === "string" ? error.supportRef : supportRef(),
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

export function createSdkMcpServer({ callTool, resourceMetadataUrl, authContext, serverVersion = "0.1.0" } = {}) {
  if (typeof callTool !== "function") throw new TypeError("callTool must be injected.");
  if (typeof resourceMetadataUrl !== "string") throw new TypeError("resourceMetadataUrl must be configured.");
  const server = new Server(
    { name: "nacl-public-mcp", version: serverVersion },
    {
      capabilities: { tools: {} },
      instructions: "Use opaque project_ref values only. Never send graph URLs, paths, credentials, identities, or Cypher. Writes require exact confirmation and idempotency fields.",
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: PUBLIC_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const descriptor = TOOL_BY_NAME.get(request.params.name);
    if (!descriptor) throw new McpError(ErrorCode.InvalidParams, "Tool is not in the public allowlist.");
    const args = request.params.arguments ?? {};
    const validation = validateSchema(descriptor.inputSchema, args);
    if (!validation.valid) throw new McpError(ErrorCode.InvalidParams, "Invalid tool arguments.");
    try {
      const structuredContent = await callTool({
        name: request.params.name,
        arguments: Object.freeze({ ...args }),
        authContext,
        requiredScope: requiredScope(request.params.name),
      });
      const output = validateSchema(descriptor.outputSchema, structuredContent);
      if (!output.valid) throw new PublicMcpError("INTERNAL_ERROR", "The public response contract was not satisfied.");
      return toolResult(structuredContent);
    } catch (error) {
      const structuredContent = publicFailure(error);
      const meta = error instanceof ReauthorizationRequired ? {
        "mcp/www_authenticate": toolChallenge({
          resourceMetadataUrl,
          scope: error.scope,
          error: error.oauthError,
        }),
      } : undefined;
      return toolResult(structuredContent, meta);
    }
  });
  return server;
}

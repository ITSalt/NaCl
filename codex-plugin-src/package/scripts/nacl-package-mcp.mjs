#!/usr/bin/env node

import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGraphGateway } from "../runtime/graph-gateway/gateway.mjs";
import { gatewayError } from "../runtime/graph-gateway/errors.mjs";
import { createLifecycleProjectResolver } from "../runtime/graph-gateway/lifecycle-adapter.mjs";
import { createProjectToolGateway } from "../runtime/graph-gateway/project-tools.mjs";
import { createWorkflowToolGateway } from "../runtime/workflow-cli/workflow-tools.mjs";
import { diagnoseInstallation } from "./installation-doctor-lib.mjs";

const MINIMUM_NODE_MAJOR = 20;
const SERVER_NAME = "nacl-graph-gateway";
const DOCTOR_TOOL_NAME = "nacl_installation_doctor";
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

if (!Number.isInteger(nodeMajor) || nodeMajor < MINIMUM_NODE_MAJOR) {
  process.stderr.write(
    `NaCl requires Node.js ${MINIMUM_NODE_MAJOR} or newer; found ${process.version}.\n`,
  );
  process.exit(1);
}

let pluginVersion;
try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name !== "nacl" || typeof manifest.version !== "string") {
    throw new Error("invalid manifest");
  }
  pluginVersion = manifest.version;
} catch {
  process.stderr.write("NaCl startup failed: plugin manifest is missing or invalid.\n");
  process.exit(1);
}

async function installationPreflight() {
  const diagnosis = await diagnoseInstallation({ pluginRoot, home: os.homedir() });
  if (diagnosis.status !== "VERIFIED") {
    throw gatewayError(
      diagnosis.mode === "both" ? "INSTALLATION_CONFLICT" : "INSTALLATION_NOT_VERIFIED",
      "The NaCl installation doctor must be VERIFIED before project or graph tools can run.",
      { status: diagnosis.status === "FAILED" ? "FAILED" : "BLOCKED" },
    );
  }
}

const projectGateway = createProjectToolGateway({ preflight: installationPreflight });
const workflowGateway = createWorkflowToolGateway({
  preflight: installationPreflight,
  home: os.homedir(),
  pluginRoot,
});
const graphGateway = createGraphGateway({
  resolveProject: createLifecycleProjectResolver(),
  preflight: installationPreflight,
});

const installationDoctorTool = {
  name: DOCTOR_TOOL_NAME,
  title: "NaCl installation doctor",
  description:
    "Detect plugin-only, legacy-only, conflicting double, or missing NaCl installation modes before a workflow runs.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: {
    type: "object",
    required: ["contract", "mode", "status", "pluginVersion", "executionLocation", "guidance"],
    properties: {
      contract: { type: "string" },
      mode: { type: "string" },
      status: { type: "string" },
      pluginVersion: { type: "string" },
      executionLocation: { type: "string" },
      guidance: { type: "string" },
    },
    additionalProperties: true,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
};

const projectToolNames = new Set(projectGateway.listTools().map((tool) => tool.name));
const workflowToolNames = new Set(workflowGateway.listTools().map((tool) => tool.name));
const tools = [installationDoctorTool, ...projectGateway.listTools(), ...workflowGateway.listTools(), ...graphGateway.listTools()];
const toolNames = new Set(tools.map((tool) => tool.name));

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.has(key));
}

function validId(id) {
  return (
    id === null ||
    typeof id === "string" ||
    (typeof id === "number" && Number.isFinite(id))
  );
}

function success(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function failure(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function validEnvelope(message) {
  return (
    isObject(message) &&
    message.jsonrpc === "2.0" &&
    typeof message.method === "string" &&
    message.method.length > 0 &&
    (message.id === undefined || validId(message.id)) &&
    (message.params === undefined || isObject(message.params))
  );
}

function validListParams(params) {
  return (
    params === undefined ||
    (isObject(params) &&
      hasOnlyKeys(params, new Set(["cursor", "_meta"])) &&
      (params.cursor === undefined || typeof params.cursor === "string") &&
      (params._meta === undefined || isObject(params._meta)))
  );
}

function validCallParams(params) {
  return (
    isObject(params) &&
    hasOnlyKeys(params, new Set(["name", "arguments", "_meta"])) &&
    toolNames.has(params.name) &&
    (params.arguments === undefined || isObject(params.arguments)) &&
    (params._meta === undefined || isObject(params._meta))
  );
}

async function handleRequest(message) {
  const notification = isObject(message) && message.id === undefined;
  if (!validEnvelope(message)) return notification ? null : failure(null, -32600, "invalid request");
  if (notification) return null;

  const { id, method, params } = message;
  if (method === "initialize") {
    if (!isObject(params) || typeof params.protocolVersion !== "string") {
      return failure(id, -32602, "invalid initialize parameters");
    }
    return success(id, {
      protocolVersion: params.protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: pluginVersion },
    });
  }
  if (method === "ping") return success(id, {});
  if (method === "tools/list") {
    if (!validListParams(params)) return failure(id, -32602, "invalid tools/list parameters");
    return success(id, { tools });
  }
  if (method === "tools/call") {
    if (!validCallParams(params)) return failure(id, -32602, "invalid tools/call parameters");
    let structuredContent;
    if (params.name === DOCTOR_TOOL_NAME) {
      if (params.arguments && Object.keys(params.arguments).length > 0) {
        return failure(id, -32602, "invalid tools/call parameters");
      }
      const diagnosis = await diagnoseInstallation({ pluginRoot, home: os.homedir() });
      structuredContent = { ...diagnosis, pluginVersion };
    } else if (projectToolNames.has(params.name)) {
      structuredContent = await projectGateway.callTool(params.name, params.arguments ?? {});
    } else if (workflowToolNames.has(params.name)) {
      structuredContent = await workflowGateway.callTool(params.name, params.arguments ?? {});
    } else {
      structuredContent = await graphGateway.callTool(params.name, params.arguments ?? {});
    }
    return success(id, {
      content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      structuredContent,
      isError: structuredContent.status !== "VERIFIED",
    });
  }
  return failure(id, -32601, "method not found");
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\n");
  while (newline !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line.length > 0) {
      Promise.resolve()
        .then(() => handleRequest(JSON.parse(line)))
        .then((response) => {
          if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
        })
        .catch(() => {
          process.stdout.write(`${JSON.stringify(failure(null, -32700, "parse error"))}\n`);
        });
    }
    newline = buffer.indexOf("\n");
  }
});

process.stdin.on("end", () => {
  if (buffer.trim().length > 0) {
    process.stdout.write(`${JSON.stringify(failure(null, -32700, "parse error"))}\n`);
  }
});

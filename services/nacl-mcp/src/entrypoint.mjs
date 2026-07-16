#!/usr/bin/env node

import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createNaclMcpService, validateServiceConfiguration } from "./service.mjs";

const DEPLOYMENT_CONFIG_FIELDS = new Set([
  "resourceUrl", "resourceMetadataUrl", "authorizationServers", "scopesSupported",
  "trustedIssuers", "allowedOrigins", "serverVersion", "rateLimit", "listen",
]);

function absoluteEnvironmentPath(name) {
  const value = process.env[name];
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${name} must name an absolute deployment-owned path.`);
  }
  return value;
}

export async function loadDeployment() {
  const configPath = absoluteEnvironmentPath("NACL_MCP_CONFIG_FILE");
  const adapterPath = absoluteEnvironmentPath("NACL_MCP_ADAPTER_MODULE");
  const configuration = JSON.parse(await readFile(configPath, "utf8"));
  if (configuration === null || typeof configuration !== "object" || Array.isArray(configuration) ||
      Object.keys(configuration).some((key) => !DEPLOYMENT_CONFIG_FIELDS.has(key))) {
    throw new Error("The deployment configuration contains an unsupported field.");
  }
  const serviceConfiguration = Object.fromEntries(Object.entries(configuration).filter(([key]) => key !== "listen"));
  validateServiceConfiguration(serviceConfiguration);
  const adapterModule = await import(pathToFileURL(adapterPath).href);
  if (typeof adapterModule.createDeploymentAdapters !== "function") {
    throw new Error("The deployment adapter module must export createDeploymentAdapters().");
  }
  const adapters = await adapterModule.createDeploymentAdapters({ configuration });
  const listen = configuration.listen;
  if (listen === null || typeof listen !== "object" || Array.isArray(listen) ||
      Object.keys(listen).some((key) => !["host", "port"].includes(key)) ||
      typeof listen.host !== "string" || listen.host.length === 0 ||
      !Number.isSafeInteger(listen.port) || listen.port < 1 || listen.port > 65535) {
    throw new Error("configuration.listen is invalid.");
  }
  return { server: createNaclMcpService({ configuration: serviceConfiguration, adapters }), listen };
}

export async function main() {
  const major = Number.parseInt(process.versions.node.split(".", 1)[0], 10);
  if (!Number.isSafeInteger(major) || major < 20) throw new Error("NaCl public MCP requires Node.js 20 or newer.");
  const { server, listen } = await loadDeployment();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listen.port, listen.host, resolve);
  });
  process.stdout.write(`NaCl public MCP listening on ${listen.host}:${listen.port}\n`);
}

const invoked = process.argv[1] ? await realpath(process.argv[1]).catch(() => path.resolve(process.argv[1])) : null;
if (invoked === fileURLToPath(import.meta.url)) await main();

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateSecretSource } from "./secret-source-contract.mjs";

const SCOPE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const PRINCIPAL = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{2,127}$/;
const HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;

function bounded(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value) || value.includes("..") || /[._:@+-]$/.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}

function port(value, label) {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 1024 || number > 65535) throw new Error(`${label} is invalid`);
  return number;
}

function absoluteFile(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) throw new Error(`${label} must be an absolute file reference`);
  return path.normalize(value);
}

export function validateMarkerInputs({ projectScope, developerId }) {
  return Object.freeze({
    projectScope: bounded(projectScope, SCOPE, "project_scope"),
    developerId: bounded(developerId, PRINCIPAL, "developer_id"),
  });
}

export function validateRemoteRoute(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("route must be an object");
  const allowed = new Set([
    "mode", "host", "gatewayPort", "sidecarPort", "projectScope", "clientCert",
    "clientKey", "caCert", "tls", "uri", "username", "database", "secretSource",
  ]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`route contains unknown fields: ${unknown.join(", ")}`);
  if (input.mode !== "create" && input.mode !== "connect") throw new Error("mode must be create or connect");
  const host = bounded(input.host, HOST, "host");
  const gatewayPort = port(input.gatewayPort, "gateway_port");
  const sidecarPort = port(input.sidecarPort, "sidecar_port");
  const projectScope = bounded(input.projectScope, SCOPE, "project_scope");
  const uri = `bolt://localhost:${sidecarPort}`;
  if (input.uri !== uri) throw new Error("uri must be derived from sidecar_port");
  if (input.tls !== true) throw new Error("remote route requires tls=true");
  if (typeof input.username !== "string" || !/^[A-Za-z0-9_]{1,64}$/.test(input.username)) throw new Error("username is invalid");
  if (typeof input.database !== "string" || !/^[A-Za-z0-9_]{1,64}$/.test(input.database)) throw new Error("database is invalid");
  const secretSource = validateSecretSource(input.secretSource).reference;
  return Object.freeze({
    mode: input.mode,
    host,
    gateway_port: gatewayPort,
    sidecar_port: sidecarPort,
    project_scope: projectScope,
    client_cert: absoluteFile(input.clientCert, "client_cert"),
    client_key: absoluteFile(input.clientKey, "client_key"),
    ca_cert: absoluteFile(input.caCert, "ca_cert"),
    tls: true,
    uri,
    username: input.username,
    database: input.database,
    secret_source: secretSource,
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`unknown argument: ${argument}`);
    options[argument.slice(2)] = args[++index];
  }
  try {
    if (options["validate-marker"] !== undefined) {
      process.stdout.write(`${JSON.stringify(validateMarkerInputs({ projectScope: options["project-scope"], developerId: options["developer-id"] }))}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(validateRemoteRoute({
        mode: options.mode,
        host: options.host,
        gatewayPort: options["gateway-port"],
        sidecarPort: options["sidecar-port"],
        projectScope: options["project-scope"],
        clientCert: options["client-cert"],
        clientKey: options["client-key"],
        caCert: options["ca-cert"],
        tls: options.tls === "true",
        uri: options.uri,
        username: options.username,
        database: options.database,
        secretSource: options["secret-source"],
      }))}\n`);
    }
  } catch (error) {
    process.stderr.write(`remote-route-contract error: ${error.message}\n`);
    process.exitCode = 2;
  }
}

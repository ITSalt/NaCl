#!/usr/bin/env node

import { spawn } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stop(message) {
  process.stderr.write(`nacl-neo4j-launcher: ${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const checkOnly = args.length === 1 && args[0] === "--check-only";
if (!checkOnly && (args.length !== 2 || args[0] !== "--binary" || !path.isAbsolute(args[1]))) stop("invalid launcher arguments");
const binary = checkOnly ? null : args[1];
const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const graphDir = path.resolve(path.dirname(scriptPath), "..");
const envPath = path.join(graphDir, ".env");
let metadata;
try { metadata = lstatSync(envPath); } catch { stop("protected graph environment is unavailable"); }
if (!metadata.isFile() || metadata.isSymbolicLink()) stop("protected graph environment is not a regular file");
if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) stop("protected graph environment permissions are too broad");

const allowed = new Set(["COMPOSE_PROJECT_NAME", "CONTAINER_PREFIX", "NEO4J_PASSWORD", "NEO4J_HTTP_PORT", "NEO4J_BOLT_PORT"]);
const values = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line) continue;
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match || !allowed.has(match[1]) || Object.hasOwn(values, match[1])) stop("protected graph environment is malformed");
  values[match[1]] = match[2];
}
if (typeof values.NEO4J_PASSWORD !== "string" || values.NEO4J_PASSWORD.length < 32 || /[\r\n\0]/.test(values.NEO4J_PASSWORD)) stop("protected graph secret is invalid");
if (checkOnly) {
  process.stdout.write("NACL_GRAPH_ENV_CHECK: status=VERIFIED secret=protected\n");
  process.exit(0);
}

const child = spawn(binary, [], {
  env: { ...process.env, NEO4J_PASSWORD: values.NEO4J_PASSWORD, NEO4J_TELEMETRY: "false" },
  stdio: "inherit",
  windowsHide: true,
});
child.once("error", () => stop("neo4j-mcp could not be started"));
child.once("exit", (code, signal) => {
  if (signal) stop("neo4j-mcp terminated by signal");
  process.exit(code ?? 1);
});

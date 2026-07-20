#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPinnedOverride, releaseIdentity, verifyInstalledSupply } from "./neo4j-mcp-supply.mjs";

function stop(message) {
  process.stderr.write(`nacl-neo4j-launcher: ${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const checkOnly = args.length === 1 && args[0] === "--check-only";
const verifySupplyOnly = args.length === 3 && args[0] === "--verify-supply-only" && args[1] === "--binary";
if (!checkOnly && !verifySupplyOnly && (args.length !== 2 || args[0] !== "--binary" || !path.isAbsolute(args[1]))) stop("invalid launcher arguments");
if (verifySupplyOnly && !path.isAbsolute(args[2])) stop("invalid launcher arguments");
const binary = checkOnly ? null : verifySupplyOnly ? args[2] : args[1];
const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const scriptDir = path.dirname(scriptPath);
const graphDir = path.resolve(scriptDir, "..");
const envPath = path.join(graphDir, ".env");
let metadata;
try { metadata = lstatSync(envPath); } catch { stop("protected graph environment is unavailable"); }
if (!metadata.isFile() || metadata.isSymbolicLink()) stop("protected graph environment is not a regular file");
if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) stop("protected graph environment permissions are too broad");
if (process.platform === "win32") {
  const acl = spawnSync("icacls.exe", [envPath], { encoding: "utf8", windowsHide: true });
  const unsafe = /\(I\)|S-1-1-0|S-1-5-11|S-1-5-32-545|Everyone|Authenticated Users|BUILTIN\\Users/i;
  const output = `${acl.stdout}\n${acl.stderr}`;
  const explicitAceCount = [...output.matchAll(/:\([^\r\n)]+\)/g)].length;
  if (acl.status !== 0 || unsafe.test(output) || explicitAceCount !== 1) stop("protected graph environment ACL is unavailable or too broad");
}

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
let installed;
try {
  const binDir = path.join(graphDir, "bin");
  const binMetadata = lstatSync(binDir);
  if (!binMetadata.isDirectory() || binMetadata.isSymbolicLink() || realpathSync(binDir) !== path.resolve(binDir)) {
    stop("neo4j-mcp binary directory is unsafe");
  }
  const identity = releaseIdentity(path.join(scriptDir, "neo4j-mcp-release.pin"));
  assertPinnedOverride(identity);
  installed = verifyInstalledSupply({ graphDir, identity });
  if (installed.state !== "reusable") stop("neo4j-mcp installation is incomplete");
  if (path.resolve(binary) !== path.resolve(installed.binary) || realpathSync(binary) !== realpathSync(installed.binary)) {
    stop("neo4j-mcp binary path does not match the pinned project installation");
  }
} catch (error) {
  stop(`neo4j-mcp supply verification failed (${error?.message ?? "unknown"})`);
}
if (!/^bolt:\/\/(?:localhost|127\.0\.0\.1):[0-9]{4,5}$/.test(process.env.NEO4J_URI ?? "")) stop("project graph URI is missing or non-loopback");
if ((process.env.NEO4J_USERNAME ?? "") !== "neo4j") stop("project graph username is invalid");
if (!/^[A-Za-z0-9._-]{1,63}$/.test(process.env.NEO4J_DATABASE ?? "")) stop("project graph database is invalid");
if (verifySupplyOnly) {
  process.stdout.write("NACL_NEO4J_MCP_SUPPLY: status=VERIFIED receipt=strict binary=pinned\n");
  process.exit(0);
}

const child = spawn(installed.binary, [], {
  env: {
    NEO4J_URI: process.env.NEO4J_URI,
    NEO4J_USERNAME: "neo4j",
    NEO4J_PASSWORD: values.NEO4J_PASSWORD,
    NEO4J_DATABASE: process.env.NEO4J_DATABASE,
    NEO4J_TELEMETRY: "false",
  },
  stdio: "inherit",
  windowsHide: true,
});
child.once("error", () => stop("neo4j-mcp could not be started"));
child.once("exit", (code, signal) => {
  if (signal) stop("neo4j-mcp terminated by signal");
  process.exit(code ?? 1);
});

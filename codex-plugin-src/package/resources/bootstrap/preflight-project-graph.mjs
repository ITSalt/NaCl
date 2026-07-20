#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectCodexConfig, renderManagedBlock } from "./codex-config-contract.mjs";
import { assertPinnedOverride, releaseIdentity, verifyInstalledSupply } from "./neo4j-mcp-supply.mjs";

function fail(code) {
  process.stderr.write(`NACL_GRAPH_PREFLIGHT: status=BLOCKED code=${code}\n`);
  process.exit(1);
}

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || index + 1 >= argv.length) fail("ARGUMENT_INVALID");
    result[argv[index].slice(2)] = argv[index + 1];
  }
  for (const key of ["project-root", "project-id", "bolt-port", "http-port", "node", "launcher", "binary", "uri", "database"]) if (!result[key]) fail("ARGUMENT_MISSING");
  return result;
}

function metadata(filename) {
  try { return lstatSync(filename); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function safeDirectory(filename) {
  const item = metadata(filename);
  if (item && (!item.isDirectory() || item.isSymbolicLink())) fail("DIRECTORY_UNSAFE");
}

function safeRegular(filename, code) {
  const item = metadata(filename);
  if (!item) return false;
  if (!item.isFile() || item.isSymbolicLink()) fail(code);
  return true;
}

function digest(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function exactIfPresent(source, target, code) {
  const exists = safeRegular(target, code);
  if (exists && digest(source) !== digest(target)) fail(code);
  return exists;
}

function graphEnv(filename, selected) {
  if (!safeRegular(filename, "GRAPH_ENV_UNSAFE")) return "absent";
  const item = metadata(filename);
  if (process.platform !== "win32" && (item.mode & 0o077) !== 0) fail("GRAPH_ENV_PERMISSIONS_UNSAFE");
  if (process.platform === "win32") {
    const acl = spawnSync("icacls.exe", [filename], { encoding: "utf8", windowsHide: true });
    const unsafe = /\(I\)|S-1-1-0|S-1-5-11|S-1-5-32-545|Everyone|Authenticated Users|BUILTIN\\Users/i;
    const output = `${acl.stdout}\n${acl.stderr}`;
    const explicitAceCount = [...output.matchAll(/:\([^\r\n)]+\)/g)].length;
    if (acl.status !== 0 || unsafe.test(output) || explicitAceCount !== 1) fail("GRAPH_ENV_PERMISSIONS_UNSAFE");
  }
  const allowed = new Set(["COMPOSE_PROJECT_NAME", "CONTAINER_PREFIX", "NEO4J_PASSWORD", "NEO4J_HTTP_PORT", "NEO4J_BOLT_PORT"]);
  const values = {};
  for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(values, match[1])) fail("GRAPH_ENV_MALFORMED");
    values[match[1]] = match[2];
  }
  if (Object.keys(values).length !== allowed.size || values.COMPOSE_PROJECT_NAME !== `${selected["project-id"]}-graph` ||
      values.CONTAINER_PREFIX !== selected["project-id"] || values.NEO4J_BOLT_PORT !== selected["bolt-port"] ||
      values.NEO4J_HTTP_PORT !== selected["http-port"]) fail("GRAPH_ENV_CONFLICT");
  if (values.NEO4J_PASSWORD.length < 32 || /[\r\n\0]/.test(values.NEO4J_PASSWORD)) fail("GRAPH_SECRET_INVALID");
  return "reusable";
}

async function portAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port: Number(port), exclusive: true }, () => server.close(() => resolve(true)));
  });
}

const selected = args(process.argv.slice(2));
const projectRoot = realpathSync(selected["project-root"]);
if (projectRoot !== path.resolve(selected["project-root"])) fail("PROJECT_ROOT_NOT_CANONICAL");
if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(selected["project-id"])) fail("PROJECT_ID_INVALID");
for (const name of ["bolt-port", "http-port"]) if (!/^[0-9]+$/.test(selected[name]) || Number(selected[name]) < 1024 || Number(selected[name]) > 65535) fail("PORT_INVALID");
if (selected["bolt-port"] === selected["http-port"]) fail("PORT_COLLISION");
for (const name of ["node", "launcher", "binary"]) if (!path.isAbsolute(selected[name])) fail("PATH_INVALID");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const resourceRoot = path.resolve(scriptDir, "..");
const pinPath = path.join(scriptDir, "neo4j-mcp-release.pin");
let identity;
try { identity = releaseIdentity(pinPath); assertPinnedOverride(identity); } catch (error) { fail(error.message); }
const graphDir = path.join(projectRoot, "graph-infra");
const graphExists = metadata(graphDir) !== null;
let supply;
try { supply = verifyInstalledSupply({ graphDir, identity }); } catch (error) { fail(error.message); }
if (path.resolve(selected.binary) !== path.resolve(supply.binary)) fail("BINARY_PATH_CONFLICT");
const expectedLauncher = path.join(graphDir, "scripts", "nacl-neo4j-mcp-launcher.mjs");
if (path.resolve(selected.launcher) !== expectedLauncher) fail("LAUNCHER_PATH_CONFLICT");

const graphDirectories = [
  graphDir,
  path.join(graphDir, "schema"),
  path.join(graphDir, "queries"),
  path.join(graphDir, "boards"),
  path.join(graphDir, "scripts"),
  path.join(graphDir, "bin"),
];
for (const directory of graphDirectories) safeDirectory(directory);
if (graphExists && graphDirectories.some((directory) => metadata(directory) === null)) fail("PARTIAL_GRAPH_STATE");

const composeSource = path.join(scriptDir, "graph-docker-compose.yml");
const requiredAssets = [];
requiredAssets.push(exactIfPresent(composeSource, path.join(graphDir, "docker-compose.yml"), "COMPOSE_CONFLICT"));
for (const schema of ["ba-schema", "sa-schema", "tl-schema"]) {
  requiredAssets.push(exactIfPresent(path.join(resourceRoot, "graph-infra", "schema", `${schema}.cypher`), path.join(graphDir, "schema", `${schema}.cypher`), "SCHEMA_CONFLICT"));
}
for (const entry of readdirSync(path.join(resourceRoot, "graph-infra", "queries"), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".cypher")) requiredAssets.push(exactIfPresent(path.join(resourceRoot, "graph-infra", "queries", entry.name), path.join(graphDir, "queries", entry.name), "QUERY_CONFLICT"));
}
requiredAssets.push(exactIfPresent(path.join(scriptDir, "project-neo4j-launcher.mjs"), expectedLauncher, "PROJECT_LAUNCHER_CONFLICT"));
requiredAssets.push(exactIfPresent(path.join(scriptDir, "neo4j-mcp-supply.mjs"), path.join(graphDir, "scripts", "neo4j-mcp-supply.mjs"), "PROJECT_SUPPLY_VERIFIER_CONFLICT"));
requiredAssets.push(exactIfPresent(path.join(scriptDir, "neo4j-mcp-release.pin"), path.join(graphDir, "scripts", "neo4j-mcp-release.pin"), "PROJECT_RELEASE_PIN_CONFLICT"));

const envState = graphEnv(path.join(graphDir, ".env"), selected);
const example = `COMPOSE_PROJECT_NAME=${selected["project-id"]}-graph\nCONTAINER_PREFIX=${selected["project-id"]}\nNEO4J_PASSWORD=\nNEO4J_HTTP_PORT=${selected["http-port"]}\nNEO4J_BOLT_PORT=${selected["bolt-port"]}\n`;
const examplePath = path.join(graphDir, ".env.example");
const exampleExists = safeRegular(examplePath, "GRAPH_EXAMPLE_UNSAFE");
if (exampleExists && readFileSync(examplePath, "utf8").replace(/\r\n/g, "\n") !== example) fail("GRAPH_EXAMPLE_CONFLICT");
if (graphExists && (envState !== "reusable" || supply.state !== "reusable" || !exampleExists || requiredAssets.some((exists) => !exists))) fail("PARTIAL_GRAPH_STATE");
safeRegular(path.join(projectRoot, ".gitignore"), "GITIGNORE_UNSAFE");

const configDir = path.join(projectRoot, ".codex");
safeDirectory(configDir);
const configPath = path.join(configDir, "config.toml");
if (safeRegular(configPath, "CODEX_CONFIG_UNSAFE")) {
  const source = readFileSync(configPath, "utf8");
  if (source.startsWith("\uFEFF")) fail("CODEX_CONFIG_MALFORMED");
  const state = inspectCodexConfig(source, renderManagedBlock(selected));
  if (state.state === "blocked") fail(state.code);
}

if (envState === "absent") {
  const [boltFree, httpFree] = await Promise.all([portAvailable(selected["bolt-port"]), portAvailable(selected["http-port"])]);
  if (!boltFree || !httpFree) fail("PORT_OCCUPIED");
}
process.stdout.write(`NACL_GRAPH_PREFLIGHT: status=VERIFIED env=${envState} supply=${supply.state} config=merge-safe-or-reusable\n`);

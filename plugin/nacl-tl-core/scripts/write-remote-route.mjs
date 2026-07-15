import { randomBytes } from "node:crypto";
import { chmod, lstat, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRemoteRoute } from "./remote-route-contract.mjs";
import { findGraphBlock, parseGraphBlock, renderGraphBlock, replaceRemoteRouteValues, spliceGraphBlock } from "./write-graph-config.mjs";
import { mergeMcpConfig, readMcpDoc, serializeMcpDoc } from "./write-mcp-config.mjs";

function scalar(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function readRemoteRoutePair(configText, mcpText) {
  const lines = configText.split(/\r?\n/);
  const span = findGraphBlock(lines);
  if (!span) throw new Error("remote route readback: graph block missing");
  const graph = parseGraphBlock(lines.slice(span.startLine, span.endLine).join("\n"));
  for (const key of ["neo4j_bolt_port", "neo4j_http_port", "neo4j_password", "container_prefix"]) {
    if (key in graph.flat) throw new Error(`remote route readback: stale ${key}`);
  }
  const route = validateRemoteRoute({
    mode: scalar(graph.remote.route_mode),
    host: scalar(graph.remote.host),
    gatewayPort: scalar(graph.remote.gateway_port),
    sidecarPort: scalar(graph.remote.sidecar_port),
    projectScope: scalar(graph.flat.project_scope),
    clientCert: scalar(graph.remote.client_cert),
    clientKey: scalar(graph.remote.client_key),
    caCert: scalar(graph.remote.ca_cert),
    tls: scalar(graph.remote.tls),
    uri: scalar(graph.flat.neo4j_uri),
    username: scalar(graph.flat.neo4j_username),
    database: scalar(graph.flat.neo4j_database),
    secretSource: scalar(graph.remote.secret_source),
  });
  const mcp = readMcpDoc(mcpText).mcpServers?.neo4j;
  if (!mcp || mcp.type !== "stdio" || !Array.isArray(mcp.args) || mcp.args.length !== 5) throw new Error("remote route readback: MCP launcher missing");
  const [script, binaryFlag, binary, sourceFlag, source] = mcp.args;
  if (binaryFlag !== "--binary" || sourceFlag !== "--secret-source" || source !== route.secret_source) throw new Error("remote route readback: MCP launcher mismatch");
  const env = mcp.env ?? {};
  if (Object.hasOwn(env, "NEO4J_PASSWORD")) throw new Error("remote route readback: serialized password forbidden");
  if (
    env.NEO4J_URI !== route.uri || env.NEO4J_USERNAME !== route.username ||
    env.NEO4J_DATABASE !== route.database || env.NACL_NEO4J_SECRET_SOURCE !== route.secret_source ||
    env.NACL_REMOTE_ROUTE_MODE !== route.mode
  ) throw new Error("remote route readback: MCP route mismatch");
  return { route: { ...route }, launcher: { command: mcp.command, script, binary } };
}

async function original(filename) {
  try {
    const metadata = await lstat(filename);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("remote route target must be a regular file");
    return { exists: true, content: await readFile(filename, "utf8"), mode: metadata.mode & 0o777 };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, content: "", mode: 0o600 };
    throw error;
  }
}

async function staged(filename, content, mode) {
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", mode);
  try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await chmod(temporary, mode);
  return temporary;
}

async function restore(filename, state) {
  if (!state.exists) { await rm(filename, { force: true }); return; }
  const temporary = await staged(filename, state.content, state.mode);
  await rename(temporary, filename);
}

export async function writeRemoteRouteTransaction({ projectRoot, route: input, launcher, failAfterFirstWrite = false } = {}) {
  if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot)) throw new Error("projectRoot must be absolute");
  const root = await realpath(projectRoot);
  const route = validateRemoteRoute(input);
  if (!launcher?.command || !launcher?.script || !launcher?.binary) throw new Error("secret launcher metadata is required");
  const configPath = path.join(root, "config.yaml");
  const mcpPath = path.join(root, ".mcp.json");
  const [configOriginal, mcpOriginal] = await Promise.all([original(configPath), original(mcpPath)]);
  const graphLines = configOriginal.content.split(/\r?\n/);
  const graphSpan = findGraphBlock(graphLines);
  const existingGraph = graphSpan
    ? parseGraphBlock(graphLines.slice(graphSpan.startLine, graphSpan.endLine).join("\n"))
    : { flat: {}, remote: {} };
  const configNext = spliceGraphBlock(configOriginal.content, renderGraphBlock(replaceRemoteRouteValues(existingGraph, route)));
  const configText = configNext.endsWith("\n") ? configNext : `${configNext}\n`;
  const mcpDoc = mergeMcpConfig(readMcpDoc(mcpOriginal.content), {
    command: launcher.binary,
    uri: route.uri,
    username: route.username,
    database: route.database,
    secretSource: route.secret_source,
    launcher: { command: launcher.command, script: launcher.script, binary: launcher.binary, routeMode: route.mode },
  });
  const mcpText = serializeMcpDoc(mcpDoc);
  readRemoteRoutePair(configText, mcpText);

  let configTemp;
  let mcpTemp;
  let firstWritten = false;
  try {
    configTemp = await staged(configPath, configText, configOriginal.exists ? configOriginal.mode : 0o600);
    mcpTemp = await staged(mcpPath, mcpText, 0o600);
    await rename(configTemp, configPath);
    firstWritten = true;
    if (failAfterFirstWrite) throw new Error("injected second-file failure");
    await rename(mcpTemp, mcpPath);
    const readback = readRemoteRoutePair(await readFile(configPath, "utf8"), await readFile(mcpPath, "utf8"));
    if (JSON.stringify(readback.route) !== JSON.stringify({ ...route })) throw new Error("remote route readback differs from staged route");
    return Object.freeze({ status: "VERIFIED", ...readback });
  } catch (error) {
    if (firstWritten) await Promise.all([restore(configPath, configOriginal), restore(mcpPath, mcpOriginal)]);
    throw error;
  } finally {
    await Promise.all([
      configTemp ? rm(configTemp, { force: true }) : Promise.resolve(),
      mcpTemp ? rm(mcpTemp, { force: true }) : Promise.resolve(),
    ]);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 1) options[args[index].replace(/^--/, "")] = args[++index];
  writeRemoteRouteTransaction({
    projectRoot: options["project-root"],
    route: {
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
    },
    launcher: { command: options["launcher-command"], script: options["launcher-script"], binary: options.binary },
  }).then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => { process.stderr.write(`write-remote-route error: ${error.message}\n`); process.exitCode = 1; },
  );
}

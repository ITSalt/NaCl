import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse: parseToml } = require("./vendor/smol-toml-1.7.0.cjs");

export const SERVER_ID = "nacl_neo4j";
export const START_MARKER = `# >>> NaCl managed MCP: ${SERVER_ID}`;
export const END_MARKER = `# <<< NaCl managed MCP: ${SERVER_ID}`;

function tomlString(value) {
  return JSON.stringify(value);
}

export function renderManagedBlock(options) {
  return [
    START_MARKER,
    `[mcp_servers.${SERVER_ID}]`,
    `command = ${tomlString(options.node)}`,
    `args = [${[options.launcher, "--binary", options.binary].map(tomlString).join(", ")}]`,
    `env = { NEO4J_URI = ${tomlString(options.uri)}, NEO4J_USERNAME = "neo4j", NEO4J_DATABASE = ${tomlString(options.database)}, NEO4J_TELEMETRY = "false" }`,
    END_MARKER,
    "",
  ].join("\n");
}

function countLines(source, predicate) {
  return source.split(/\r?\n/).filter((line) => predicate(line.trim())).length;
}

export function inspectCodexConfig(source, expectedBlock) {
  try { parseToml(source); } catch { return { state: "blocked", code: "CODEX_CONFIG_MALFORMED" }; }
  const startCount = countLines(source, (line) => line === START_MARKER);
  const endCount = countLines(source, (line) => line === END_MARKER);
  const tablePattern = /^\[\s*mcp_servers\s*\.\s*(?:nacl_neo4j|"nacl_neo4j"|'nacl_neo4j')\s*\](?:\s*#.*)?$/;
  const tableCount = countLines(source, (line) => tablePattern.test(line));
  const dottedAssignment = /^\s*mcp_servers\s*\.\s*(?:nacl_neo4j|"nacl_neo4j"|'nacl_neo4j')\s*=/m.test(source);
  let inlineAssignment = false;
  let currentTable = "";
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[([^\]]+)\](?:\s*#.*)?$/.exec(line);
    if (header) currentTable = header[1].replace(/\s/g, "").replace(/["']/g, "");
    else if (currentTable === "mcp_servers" && /^\s*(?:nacl_neo4j|"nacl_neo4j"|'nacl_neo4j')\s*=/.test(raw)) inlineAssignment = true;
  }
  const anyManaged = startCount + endCount + tableCount + Number(dottedAssignment) + Number(inlineAssignment);
  if (anyManaged === 0) return { state: "merge-safe" };
  if (startCount !== 1 || endCount !== 1 || tableCount !== 1 || dottedAssignment || inlineAssignment) {
    return { state: "blocked", code: "CODEX_MCP_SECTION_AMBIGUOUS" };
  }
  const start = source.indexOf(START_MARKER);
  const endMarker = source.indexOf(END_MARKER, start);
  const end = endMarker + END_MARKER.length;
  const candidate = `${source.slice(start, end)}\n`;
  if (candidate !== expectedBlock) return { state: "blocked", code: "CODEX_MCP_CONFIG_CONFLICT" };
  return { state: "reusable" };
}

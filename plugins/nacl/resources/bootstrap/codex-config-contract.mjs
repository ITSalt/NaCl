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

function topLevelEquals(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) { escaped = false; continue; }
    if (quote === '"' && char === "\\") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "#") return -1;
    if (char === "=") return index;
  }
  return -1;
}

function validateEnvelope(source) {
  if (source.includes("\0")) return false;
  let square = 0;
  let curly = 0;
  let quote = null;
  let escaped = false;
  for (let raw of source.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!quote && square === 0 && curly === 0) {
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed.startsWith("[")) {
        if (!/^\s*\[\[?[^\]\r\n]+\]\]?\s*(?:#.*)?$/.test(raw)) return false;
        continue;
      }
      const equals = topLevelEquals(raw);
      if (equals < 1) return false;
      raw = raw.slice(equals + 1);
    }
    for (let index = 0; index < raw.length; index += 1) {
      const char = raw[index];
      if (escaped) { escaped = false; continue; }
      if (quote === '"' && char === "\\") { escaped = true; continue; }
      if (quote) { if (char === quote) quote = null; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "#") break;
      if (char === "[") square += 1;
      else if (char === "]") square -= 1;
      else if (char === "{") curly += 1;
      else if (char === "}") curly -= 1;
      if (square < 0 || curly < 0) return false;
    }
  }
  return square === 0 && curly === 0 && quote === null && !escaped;
}

function countLines(source, predicate) {
  return source.split(/\r?\n/).filter((line) => predicate(line.trim())).length;
}

export function inspectCodexConfig(source, expectedBlock) {
  if (!validateEnvelope(source)) return { state: "blocked", code: "CODEX_CONFIG_MALFORMED" };
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

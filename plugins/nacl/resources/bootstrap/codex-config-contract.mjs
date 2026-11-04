import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";

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

function hasOwn(object, key) {
  return object !== null && typeof object === "object" && Object.prototype.hasOwnProperty.call(object, key);
}

function hasTarget(parsed) {
  return hasOwn(parsed?.mcp_servers, SERVER_ID);
}

function parseStandaloneTable(header) {
  try { return parseToml(`${header}\n`); } catch { return null; }
}

function lineWithoutComment(line) {
  return line.commentStart < 0
    ? line.text
    : line.text.slice(0, line.commentStart - line.start);
}

function firstCodeIndex(line) {
  return line.code.search(/\S/);
}

function firstCodeCharacter(line) {
  const index = firstCodeIndex(line);
  return index < 0 ? "" : line.code[index];
}

function scanTomlLines(source) {
  const code = new Array(source.length).fill(" ");
  const lines = [];
  let state = "code";
  let quote = "";
  let escaped = false;
  let depth = 0;
  let lineStart = 0;
  let lineDepth = 0;
  let commentStart = -1;

  const finishLine = (end) => {
    let textEnd = end;
    if (textEnd > lineStart && source[textEnd - 1] === "\r") textEnd--;
    lines.push({
      start: lineStart,
      end: textEnd,
      text: source.slice(lineStart, textEnd),
      code: code.slice(lineStart, textEnd).join(""),
      depth: lineDepth,
      commentStart,
    });
  };

  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === "\n") {
      finishLine(index);
      if (state === "comment") state = "code";
      if (state === "multiline-basic" && escaped) escaped = false;
      lineStart = index + 1;
      lineDepth = depth;
      commentStart = -1;
      continue;
    }

    if (state === "comment") continue;
    if (state === "basic" || state === "multiline-basic" || state === "literal" || state === "multiline-literal") {
      if (state === "basic" || state === "multiline-basic") {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\") {
          escaped = true;
          continue;
        }
      }
      if (character !== quote) continue;
      if (state === "basic" || state === "literal") {
        state = "code";
        continue;
      }
      if (source[index + 1] === quote && source[index + 2] === quote) {
        let after = index + 3;
        while (after < index + 5 && source[after] === quote) after++;
        state = "code";
        escaped = false;
        index = after - 1;
      }
      continue;
    }

    if (character === "#") {
      state = "comment";
      commentStart = index;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      if (source[index + 1] === quote && source[index + 2] === quote) {
        state = quote === "\"" ? "multiline-basic" : "multiline-literal";
        index += 2;
      } else {
        state = quote === "\"" ? "basic" : "literal";
      }
      continue;
    }

    code[index] = character;
    if (character === "[" || character === "{") depth++;
    else if ((character === "]" || character === "}") && depth > 0) depth--;
  }
  finishLine(source.length);
  return lines;
}

function isTargetTableHeader(line) {
  if (line.depth !== 0 || firstCodeCharacter(line) !== "[") return null;
  const header = lineWithoutComment(line).trim();
  const parsed = parseStandaloneTable(header);
  return parsed && hasTarget(parsed) ? parsed : null;
}

function isMcpServersTableHeader(line) {
  if (line.depth !== 0 || firstCodeCharacter(line) !== "[") return false;
  const parsed = parseStandaloneTable(lineWithoutComment(line).trim());
  const servers = parsed?.mcp_servers;
  return servers !== null
    && typeof servers === "object"
    && !Array.isArray(servers)
    && Object.keys(servers).length === 0;
}

function assignmentEquals(line) {
  if (line.depth !== 0) return -1;
  return line.code.indexOf("=");
}

function assignmentCreatesTarget(key, inMcpServersTable) {
  const prefix = inMcpServersTable ? "[mcp_servers]\n" : "";
  try { return hasTarget(parseToml(`${prefix}${key} = true\n`)); } catch { return false; }
}

export function inspectCodexConfig(source, expectedBlock) {
  let parsed;
  try { parsed = parseToml(source); } catch { return { state: "blocked", code: "CODEX_CONFIG_MALFORMED" }; }

  let expectedParsed;
  try { expectedParsed = parseToml(expectedBlock); } catch { return { state: "blocked", code: "CODEX_MCP_CONFIG_CONFLICT" }; }
  const expectedTarget = expectedParsed?.mcp_servers?.[SERVER_ID];
  const actualTarget = parsed?.mcp_servers?.[SERVER_ID];
  const targetPresent = hasTarget(parsed);

  const starts = [];
  const ends = [];
  let tableCount = 0;
  let dottedAssignment = false;
  let inlineAssignment = false;
  let currentTableIsMcpServers = false;
  let currentTableIsRoot = true;

  for (const line of scanTomlLines(source)) {
    const comment = line.commentStart < 0 ? "" : source.slice(line.commentStart, line.end).trim();
    if (line.depth === 0 && comment === START_MARKER) starts.push({ offset: line.commentStart });
    if (line.depth === 0 && comment === END_MARKER) ends.push({ offset: line.commentStart });

    const targetHeader = isTargetTableHeader(line);
    if (targetHeader) tableCount++;

    if (line.depth === 0 && firstCodeCharacter(line) === "[") {
      currentTableIsMcpServers = isMcpServersTableHeader(line);
      currentTableIsRoot = false;
      continue;
    }

    const equals = assignmentEquals(line);
    if (equals < 0 || (!currentTableIsRoot && !currentTableIsMcpServers)) continue;
    const key = line.text.slice(0, equals).trim();
    if (!key) continue;
    if (assignmentCreatesTarget(key, currentTableIsMcpServers)) {
      if (currentTableIsRoot) dottedAssignment = true;
      else inlineAssignment = true;
    }
  }

  const startCount = starts.length;
  const endCount = ends.length;
  const anyManaged = startCount + endCount + tableCount
    + Number(dottedAssignment) + Number(inlineAssignment) + Number(targetPresent);
  if (anyManaged === 0) return { state: "merge-safe" };
  if (startCount !== 1 || endCount !== 1 || tableCount !== 1 || dottedAssignment || inlineAssignment || !targetPresent) {
    return { state: "blocked", code: "CODEX_MCP_SECTION_AMBIGUOUS" };
  }
  if (ends[0].offset < starts[0].offset) return { state: "blocked", code: "CODEX_MCP_SECTION_AMBIGUOUS" };
  const candidate = `${source.slice(starts[0].offset, ends[0].offset + END_MARKER.length)}\n`;
  if (candidate !== expectedBlock || !isDeepStrictEqual(actualTarget, expectedTarget)) {
    return { state: "blocked", code: "CODEX_MCP_CONFIG_CONFLICT" };
  }
  return { state: "reusable" };
}

// Dependency-free, fail-closed guards for user-owned state files that a route
// transaction is about to rewrite. They intentionally accept the bounded NaCl
// config grammar and reject ambiguous state instead of applying last-wins rules.

function stateError(kind, detail) {
  throw new Error(`strict ${kind} state is ${detail}`);
}

/** Parse JSON while rejecting duplicate object keys at every nesting level. */
export function parseStrictJsonDocument(input) {
  const source = String(input).replace(/^\uFEFF/, "");
  let index = 0;
  const whitespace = () => { while (/\s/.test(source[index] ?? "")) index += 1; };
  const fail = (detail = "malformed") => stateError("JSON", detail);

  function stringToken() {
    if (source[index] !== '"') fail();
    const start = index++;
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') {
        try { return JSON.parse(source.slice(start, index)); } catch { fail(); }
      }
      if (char.charCodeAt(0) < 0x20) fail();
      if (char === "\\") {
        const escape = source[index++];
        if (escape === "u") {
          if (!/^[0-9A-Fa-f]{4}$/.test(source.slice(index, index + 4))) fail();
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escape ?? "")) fail();
      }
    }
    fail();
  }

  function value() {
    whitespace();
    const char = source[index];
    if (char === '"') { stringToken(); return; }
    if (char === "{") { object(); return; }
    if (char === "[") { array(); return; }
    const rest = source.slice(index);
    const primitive = rest.match(/^(?:true|false|null)(?![A-Za-z0-9_])/);
    if (primitive) { index += primitive[0].length; return; }
    const number = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) { index += number[0].length; return; }
    fail();
  }

  function object() {
    index += 1;
    whitespace();
    const keys = new Set();
    if (source[index] === "}") { index += 1; return; }
    while (index < source.length) {
      whitespace();
      const key = stringToken();
      if (keys.has(key)) fail("ambiguous because it contains duplicate keys");
      keys.add(key);
      whitespace();
      if (source[index++] !== ":") fail();
      value();
      whitespace();
      if (source[index] === "}") { index += 1; return; }
      if (source[index++] !== ",") fail();
    }
    fail();
  }

  function array() {
    index += 1;
    whitespace();
    if (source[index] === "]") { index += 1; return; }
    while (index < source.length) {
      value();
      whitespace();
      if (source[index] === "]") { index += 1; return; }
      if (source[index++] !== ",") fail();
    }
    fail();
  }

  value();
  whitespace();
  if (index !== source.length) fail();
  return JSON.parse(source);
}

function analyzeYamlExpression(input) {
  const stack = [];
  let quote = null;
  let escaped = false;
  let colon = -1;
  let end = input.length;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (char === "'" && input[index + 1] === "'") index += 1;
      else if (char === "'") quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "\t") stateError("YAML", "malformed because tabs are outside quoted scalars");
    if (char === "#" && (index === 0 || /\s/.test(input[index - 1]))) { end = index; break; }
    if (char === "[" || char === "{") { stack.push(char); continue; }
    if (char === "]" || char === "}") {
      const expected = char === "]" ? "[" : "{";
      if (stack.pop() !== expected) stateError("YAML", "malformed");
      continue;
    }
    if (char === ":" && stack.length === 0 && colon === -1 && (index + 1 === input.length || /\s/.test(input[index + 1]))) colon = index;
  }
  if (quote || stack.length > 0) stateError("YAML", "malformed");
  const text = input.slice(0, end).trimEnd();
  return { text, colon: colon < end ? colon : -1 };
}

function yamlKey(raw) {
  const key = raw.trim();
  if (/^[A-Za-z0-9_.-]+$/.test(key)) return key;
  if (/^"(?:[^"\\]|\\.)*"$/.test(key)) {
    try { return JSON.parse(key); } catch { stateError("YAML", "malformed"); }
  }
  if (/^'(?:[^']|'')*'$/.test(key)) return key.slice(1, -1).replaceAll("''", "'");
  stateError("YAML", "outside the supported mapping grammar");
}

function validateFlowValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const { text } = analyzeYamlExpression(trimmed);
  if ((text.startsWith("[") && !text.endsWith("]")) || (text.startsWith("{") && !text.endsWith("}"))) stateError("YAML", "malformed");
  if (text.startsWith('"') && !/^"(?:[^"\\]|\\.)*"$/.test(text)) stateError("YAML", "malformed");
  if (text.startsWith("'") && !/^'(?:[^']|'')*'$/.test(text)) stateError("YAML", "malformed");
  if (text.startsWith("{") && text.endsWith("}")) {
    const body = text.slice(1, -1).trim();
    if (!body) return;
    const entries = splitFlow(body);
    const keys = new Set();
    for (const entry of entries) {
      const analyzed = analyzeYamlExpression(entry);
      if (analyzed.colon < 0) stateError("YAML", "malformed");
      const key = yamlKey(analyzed.text.slice(0, analyzed.colon));
      if (keys.has(key)) stateError("YAML", "ambiguous because it contains duplicate keys");
      keys.add(key);
      validateFlowValue(analyzed.text.slice(analyzed.colon + 1));
    }
  } else if (text.startsWith("[") && text.endsWith("]")) {
    const body = text.slice(1, -1).trim();
    if (body) for (const entry of splitFlow(body)) validateFlowValue(entry);
  }
}

function splitFlow(input) {
  const parts = [];
  const stack = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (char === "'" && input[index + 1] === "'") index += 1;
      else if (char === "'") quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "[" || char === "{") stack.push(char);
    else if (char === "]" || char === "}") stack.pop();
    else if (char === "," && stack.length === 0) { parts.push(input.slice(start, index)); start = index + 1; }
  }
  parts.push(input.slice(start));
  if (parts.some((part) => part.trim() === "")) stateError("YAML", "malformed");
  return parts;
}

function mappingEntry(content) {
  const analyzed = analyzeYamlExpression(content);
  if (analyzed.colon < 0) stateError("YAML", "malformed outside a sequence");
  const key = yamlKey(analyzed.text.slice(0, analyzed.colon));
  const value = analyzed.text.slice(analyzed.colon + 1).trim();
  validateFlowValue(value);
  return { key, value };
}

/**
 * Validate the complete block-style NaCl config grammar before changing graph state.
 * The guard is deliberately conservative: unsupported/ambiguous YAML is rejected.
 */
export function assertStrictYamlMappingDocument(input) {
  const source = String(input).replace(/^\uFEFF/, "");
  const frames = [];
  let previous = null;
  let blockScalarParent = null;
  let meaningful = 0;
  let documentStartSeen = false;

  for (const raw of source.split(/\r?\n/)) {
    if (/^ *\t/.test(raw)) stateError("YAML", "malformed because indentation contains tabs");
    const indent = raw.match(/^ */)[0].length;
    if (blockScalarParent !== null) {
      if (raw.trim() === "" || indent > blockScalarParent) continue;
      blockScalarParent = null;
    }
    if (raw.trim() === "" || /^\s*#/.test(raw)) continue;
    if (indent === 0 && /^(?:---|\.\.\.)\s*(?:#.*)?$/.test(raw)) {
      if (meaningful > 0 || documentStartSeen || raw.trimStart().startsWith("...")) stateError("YAML", "ambiguous because multiple documents are unsupported");
      documentStartSeen = true;
      continue;
    }
    meaningful += 1;
    const content = raw.slice(indent);
    const sequence = content === "-" || /^-\s+/.test(content);
    const kind = sequence ? "seq" : "map";

    if (!previous) {
      if (indent !== 0 || kind !== "map") stateError("YAML", "outside the supported top-level mapping grammar");
      frames.push({ indent, kind, keys: new Set() });
    } else if (indent > previous.indent) {
      if (!previous.opensChild) stateError("YAML", "malformed because indentation has no parent");
      frames.push({ indent, kind, keys: new Set(previous.initialKeys ?? []) });
    } else {
      while (frames.length && frames.at(-1).indent > indent) frames.pop();
      if (!frames.length || frames.at(-1).indent !== indent) stateError("YAML", "malformed because indentation is inconsistent");
      if (frames.at(-1).kind !== kind) stateError("YAML", "malformed because container kinds are mixed");
    }

    const frame = frames.at(-1);
    if (kind === "map") {
      const entry = mappingEntry(content);
      if (frame.keys.has(entry.key)) stateError("YAML", "ambiguous because it contains duplicate keys");
      frame.keys.add(entry.key);
      if (/^[|>][+-]?[0-9]*$/.test(entry.value)) {
        blockScalarParent = indent;
        previous = { indent, opensChild: false };
      } else previous = { indent, opensChild: entry.value === "" };
    } else {
      const rest = content.slice(1).trimStart();
      if (!rest) previous = { indent, opensChild: true };
      else {
        const analyzed = analyzeYamlExpression(rest);
        if (analyzed.colon >= 0) {
          const entry = mappingEntry(rest);
          previous = { indent, opensChild: true, initialKeys: [entry.key] };
        } else {
          validateFlowValue(rest);
          previous = { indent, opensChild: false };
        }
      }
    }
  }
  if (meaningful === 0) return;
}

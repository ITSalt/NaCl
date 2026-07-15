#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CORE_DOC_PAIRS = Object.freeze([
  ["README.md", "README.ru.md"],
  ["docs/quickstart.md", "docs/quickstart.ru.md"],
  ["docs/setup/install-codex-plugin.md", "docs/setup/install-codex-plugin.ru.md"],
  ["docs/codex-plugin.md", "docs/codex-plugin.ru.md"],
  ["docs/setup/codex-legacy-compatibility.md", "docs/setup/codex-legacy-compatibility.ru.md"],
]);

export const SUPPORT_DOC_PAIRS = Object.freeze([
  ["docs/architecture.md", "docs/architecture.ru.md"],
  ["docs/setup/install-skills.md", "docs/setup/install-skills.ru.md"],
  ["docs/setup/install-macos.md", "docs/setup/install-macos.ru.md"],
  ["docs/setup/install-linux.md", "docs/setup/install-linux.ru.md"],
  ["docs/setup/install-windows.md", "docs/setup/install-windows.ru.md"],
  ["docs/setup/graph-setup.md", "docs/setup/graph-setup.ru.md"],
  ["docs/workflows.md", "docs/workflows.ru.md"],
  ["docs/skills-guide.md", "docs/skills-guide.ru.md"],
  ["docs/skills-reference.md", "docs/skills-reference.ru.md"],
  ["docs/configuration.md", "docs/configuration.ru.md"],
  ["docs/runbooks/provision-shared-graph-vps.md", "docs/runbooks/provision-shared-graph-vps.ru.md"],
  ["docs/runbooks/connect-to-existing-remote-project.md", "docs/runbooks/connect-to-existing-remote-project.ru.md"],
  ["plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.md", "plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.ru.md"],
  ["plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.md", "plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.ru.md"],
]);

export const SUPPORT_SINGLE_DOCS = Object.freeze([
  "docs/runbooks/upgrade-graph-extensions.md",
  "plugins/nacl/resources/docs/runbooks/upgrade-graph-extensions.md",
]);

export const BUNDLED_DOC_MIRRORS = Object.freeze([
  [
    "docs/runbooks/provision-shared-graph-vps.md",
    "plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.md",
  ],
  [
    "docs/runbooks/provision-shared-graph-vps.ru.md",
    "plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.ru.md",
  ],
  [
    "docs/runbooks/connect-to-existing-remote-project.md",
    "plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.md",
  ],
  [
    "docs/runbooks/connect-to-existing-remote-project.ru.md",
    "plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.ru.md",
  ],
  [
    "docs/runbooks/upgrade-graph-extensions.md",
    "plugins/nacl/resources/docs/runbooks/upgrade-graph-extensions.md",
  ],
]);

const LEGACY_DOCS = new Set([
  "docs/setup/codex-legacy-compatibility.md",
  "docs/setup/codex-legacy-compatibility.ru.md",
]);

const ACCEPTED_COUNTS = Object.freeze({ publicSkills: 10, internalWorkflows: 60, mcpTools: 25 });

const PROVISION_RUNBOOKS = new Set([
  "docs/runbooks/provision-shared-graph-vps.md",
  "docs/runbooks/provision-shared-graph-vps.ru.md",
  "plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.md",
  "plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.ru.md",
]);

const CONNECT_RUNBOOKS = new Set([
  "docs/runbooks/connect-to-existing-remote-project.md",
  "docs/runbooks/connect-to-existing-remote-project.ru.md",
  "plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.md",
  "plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.ru.md",
]);

const regexSlash = String.raw`\/`;
const markdownTick = String.fromCharCode(96);
const HOST_TEMP_OR_WAVE7_PATTERN = new RegExp(
  `(?:\\bW7C\\d+\\b|0\\.1\\.0\\+codex\\.w7[0-9A-Za-z.+-]*|\\bnacl[-_](?:plugin[-_])?w7\\b|${regexSlash}(?:private${regexSlash})?tmp${regexSlash}[^\\s)${markdownTick}]+|${regexSlash}var${regexSlash}folders${regexSlash}[^\\s)${markdownTick}]+)`,
  "i",
);

const PLUGIN_FIRST_FORBIDDEN = Object.freeze([
  ["git clone", /\bgit\s+clone\b/i],
  ["skills-for-codex", /\bskills-for-codex(?:\/|\b)/i],
  [".agents/skills", /(?:^|[^A-Za-z0-9_])\.agents\/skills(?:\/|\b)/im],
  ["install-user-symlinks", /\binstall-user-symlinks(?:\.(?:sh|ps1))?\b/i],
  ["@anthropic/neo4j-mcp", /@anthropic\/neo4j-mcp\b/i],
]);

const EVERYWHERE_FORBIDDEN = Object.freeze([
  [
    "plaintext neo4j_password assignment",
    /\bNEO4J_PASSWORD\s*[:=]\s*(?:"[^"$<{][^"]*"|'[^'$<{][^']*'|[^\s`"'$<{][^\s`]*)/i,
  ],
  ["personal /Users path", /\/Users\/[^/\s`]+\//],
  [
    "temporary candidate path or Wave 7 identifier",
    HOST_TEMP_OR_WAVE7_PATTERN,
  ],
]);

function posixRelative(root, filename) {
  return path.relative(root, filename).split(path.sep).join("/");
}

function isInside(root, filename) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(filename);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

async function isFile(filename) {
  try {
    return (await lstat(filename)).isFile();
  } catch {
    return false;
  }
}

async function pathKind(filename) {
  try {
    const metadata = await lstat(filename);
    if (metadata.isFile()) return "file";
    if (metadata.isDirectory()) return "directory";
  } catch {
    // The caller reports a stable broken-link diagnostic.
  }
  return "missing";
}

function markdownHeadings(content) {
  const headings = [];
  const lines = content.split(/\r?\n/);
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const atx = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (atx) {
      headings.push({ level: atx[1].length, text: atx[2].trim(), line: index + 1 });
      continue;
    }
    if (index + 1 < lines.length && line.trim().length > 0) {
      const setext = lines[index + 1].match(/^ {0,3}(=+|-+)[ \t]*$/);
      if (setext) {
        headings.push({ level: setext[1][0] === "=" ? 1 : 2, text: line.trim(), line: index + 1 });
        index += 1;
      }
    }
  }
  return headings;
}

function renderedHeadingText(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function githubAnchor(value) {
  return renderedHeadingText(value)
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

function markdownAnchors(content) {
  const anchors = new Set();
  const occurrences = new Map();
  for (const heading of markdownHeadings(content)) {
    const base = githubAnchor(heading.text);
    const count = occurrences.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    occurrences.set(base, count + 1);
  }
  for (const match of content.matchAll(/<(?:a\s+[^>]*?(?:name|id)|[A-Za-z][^>]*?\sid)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    anchors.add(match[1]);
  }
  return anchors;
}

function semanticKeys(content) {
  return [...content.matchAll(/<!--\s*doc-key\s*:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->/g)].map(
    (match) => match[1],
  );
}

function inlineLinkDestinations(content) {
  const lines = content.split(/\r?\n/);
  const visible = [];
  let fence = null;
  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
      visible.push("");
      continue;
    }
    visible.push(fence === null ? line.replace(/(`+)[^`]*?\1/g, "") : "");
  }
  const rendered = visible.join("\n");
  const destinations = [];
  for (let start = rendered.indexOf("]("); start !== -1; start = rendered.indexOf("](", start + 2)) {
    let depth = 1;
    let escaped = false;
    let angle = false;
    let end = start + 2;
    for (; end < rendered.length; end += 1) {
      const character = rendered[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "<" && depth === 1) angle = true;
      else if (character === ">" && angle) angle = false;
      else if (!angle && character === "(") depth += 1;
      else if (!angle && character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue;
    const body = rendered.slice(start + 2, end).trim();
    let destination;
    if (body.startsWith("<")) {
      const close = body.indexOf(">");
      if (close > 0) destination = body.slice(1, close);
    } else {
      destination = body.match(/^(?:\\.|[^\s])+/)?.[0];
    }
    if (destination) destinations.push(destination.replace(/\\([() ])/g, "$1"));
  }
  for (const match of rendered.matchAll(/^ {0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|([^\s]+))/gm)) {
    destinations.push((match[1] ?? match[2]).replace(/\\([() ])/g, "$1"));
  }
  return destinations;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function unique(items) {
  return new Set(items).size === items.length;
}

function containsInventoryName(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9-])${escaped}(?![a-z0-9-])`, "i").test(content);
}

function shellInvocations(content, scriptName) {
  const continuedLines = content.replace(/\\\r?\n[ \t]*/g, " ");
  const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const command = new RegExp(`^(?:sudo\\s+)?(?:sh|bash)\\s+\\S*${escaped}(?:\\s|$)`);
  return continuedLines.split(/\r?\n/).map((line) => line.trim()).filter((line) => command.test(line));
}

function checkProvisionRunbookContract(relativeName, content, errors) {
  if (!/server-wide/i.test(content) || !/(?:registered|зарегистрированн)/i.test(content)) {
    errors.push(`server-wide registered-gateway grant contract is missing: ${relativeName}`);
  }
  for (const scriptName of ["issue-client-cert.sh", "revoke-client-cert.sh"]) {
    const commands = shellInvocations(content, scriptName);
    if (commands.length === 0) {
      errors.push(`certificate command is missing from provision runbook: ${relativeName} -> ${scriptName}`);
      continue;
    }
    for (const command of commands) {
      if (!/(?:^|\s)--server-id(?:\s|=)/.test(command)) {
        errors.push(`certificate command requires --server-id: ${relativeName} -> ${scriptName}`);
      }
      if (/(?:^|\s)--(?:scope|prefix)(?:\s|=)/.test(command)) {
        errors.push(`legacy project-scoped certificate command is forbidden: ${relativeName} -> ${scriptName}`);
      }
    }
  }
}

function checkConnectRunbookContract(relativeName, content, errors) {
  for (const token of ["graph.remote.secret_source", "env:NEO4J_PASSWORD", "server-route:<id>", ".mcp.json"]) {
    if (!content.includes(token)) errors.push(`mandatory remote secret contract token is missing: ${relativeName} -> ${token}`);
  }
  if (!/(?:opaque|непрозрачн)/i.test(content)) {
    errors.push(`opaque remote secret-reference contract is missing: ${relativeName}`);
  }
  if (/neo4j_graph_dev/.test(content)) {
    errors.push(`default graph password fallback is forbidden in remote connect runbook: ${relativeName}`);
  }
}

async function checkLink({ repoRoot, sourcePath, target, errors, anchorCache }) {
  if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/.test(target)) return;
  let decoded;
  try {
    decoded = decodeURI(target);
  } catch {
    errors.push(`invalid URL encoding in Markdown link: ${posixRelative(repoRoot, sourcePath)} -> ${target}`);
    return;
  }
  const hash = decoded.indexOf("#");
  const pathAndQuery = hash >= 0 ? decoded.slice(0, hash) : decoded;
  const fragment = hash >= 0 ? decoded.slice(hash + 1) : "";
  const rawPath = pathAndQuery.split("?", 1)[0];
  let resolved = rawPath.length === 0
    ? sourcePath
    : rawPath.startsWith("/")
      ? path.resolve(repoRoot, `.${rawPath}`)
      : path.resolve(path.dirname(sourcePath), rawPath);
  if (!isInside(repoRoot, resolved)) {
    errors.push(`Markdown link escapes repository: ${posixRelative(repoRoot, sourcePath)} -> ${target}`);
    return;
  }
  const kind = await pathKind(resolved);
  if (kind === "missing") {
    errors.push(`broken Markdown link: ${posixRelative(repoRoot, sourcePath)} -> ${target}`);
    return;
  }
  if (fragment.length === 0) return;
  if (kind === "directory") {
    const readme = path.join(resolved, "README.md");
    if (!(await isFile(readme))) {
      errors.push(`Markdown directory anchor has no README.md: ${posixRelative(repoRoot, sourcePath)} -> ${target}`);
      return;
    }
    resolved = readme;
  }
  if (!/\.md(?:own)?$/i.test(resolved)) {
    errors.push(`Markdown anchor targets a non-Markdown file: ${posixRelative(repoRoot, sourcePath)} -> ${target}`);
    return;
  }
  let anchors = anchorCache.get(resolved);
  if (!anchors) {
    anchors = markdownAnchors(await readFile(resolved, "utf8"));
    anchorCache.set(resolved, anchors);
  }
  let decodedFragment;
  try {
    decodedFragment = decodeURIComponent(fragment);
  } catch {
    errors.push(`invalid anchor encoding: ${posixRelative(repoRoot, sourcePath)} -> ${target}`);
    return;
  }
  if (!anchors.has(decodedFragment)) {
    errors.push(`broken GitHub-style anchor: ${posixRelative(repoRoot, sourcePath)} -> ${target}`);
  }
}

async function sourceDirectories(root, prefix) {
  const entries = await readdir(root, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || (prefix && !entry.name.startsWith(prefix))) continue;
    if (await isFile(path.join(root, entry.name, "SKILL.md"))) names.push(entry.name);
  }
  return names.sort();
}

async function importedDefinitions(filename, exportName) {
  const url = pathToFileURL(filename);
  const module = await import(url.href);
  const definitions = module[exportName];
  if (!Array.isArray(definitions)) throw new Error(`${exportName} is not an array`);
  return definitions.map((definition) => definition?.name);
}

async function pluginInventory(repoRoot, errors) {
  const pluginRoot = path.join(repoRoot, "plugins", "nacl");
  const indexPath = path.join(pluginRoot, "resources", "package-index.json");
  let index;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    errors.push(`cannot read plugin inventory source ${posixRelative(repoRoot, indexPath)}: ${error.message}`);
    return { publicSkills: [], internalWorkflows: [], mcpTools: [] };
  }

  let publicSkills = [];
  let internalWorkflows = [];
  try {
    publicSkills = await sourceDirectories(path.join(pluginRoot, "skills"));
    internalWorkflows = await sourceDirectories(path.join(pluginRoot, "resources", "workflows"), "nacl-");
  } catch (error) {
    errors.push(`cannot enumerate plugin skill sources: ${error.message}`);
  }

  const indexedPublic = Array.isArray(index.publicEntrySkills) ? [...index.publicEntrySkills].sort() : [];
  const indexedWorkflows = Array.isArray(index.internalWorkflows) ? [...index.internalWorkflows].sort() : [];
  if (!arraysEqual(publicSkills, indexedPublic) || !unique(indexedPublic)) {
    errors.push("public skill source directories differ from resources/package-index.json");
  }
  if (!arraysEqual(internalWorkflows, indexedWorkflows) || !unique(indexedWorkflows)) {
    errors.push("internal workflow source directories differ from resources/package-index.json");
  }

  let mcpTools = [];
  try {
    const [projectTools, workflowTools, graphTools, mcpSource] = await Promise.all([
      importedDefinitions(
        path.join(pluginRoot, "runtime", "graph-gateway", "project-tools.mjs"),
        "PROJECT_TOOL_DEFINITIONS",
      ),
      importedDefinitions(
        path.join(pluginRoot, "runtime", "workflow-cli", "workflow-tools.mjs"),
        "WORKFLOW_TOOL_DEFINITIONS",
      ),
      importedDefinitions(
        path.join(pluginRoot, "runtime", "graph-gateway", "tool-schemas.mjs"),
        "GRAPH_TOOL_DEFINITIONS",
      ),
      readFile(path.join(pluginRoot, "scripts", "nacl-package-mcp.mjs"), "utf8"),
    ]);
    const doctor = mcpSource.match(/\bconst\s+DOCTOR_TOOL_NAME\s*=\s*["']([^"']+)["']/)?.[1];
    if (!doctor) errors.push("MCP doctor tool name is missing from scripts/nacl-package-mcp.mjs");
    mcpTools = [doctor, ...projectTools, ...workflowTools, ...graphTools].filter(Boolean).sort();
    if (mcpTools.some((name) => typeof name !== "string" || name.length === 0) || !unique(mcpTools)) {
      errors.push("MCP source registries contain missing or duplicate tool names");
    }
  } catch (error) {
    errors.push(`cannot generate MCP tool inventory from source registries: ${error.message}`);
  }

  for (const [label, actual, expected] of [
    ["public skills", publicSkills.length, ACCEPTED_COUNTS.publicSkills],
    ["internal workflows", internalWorkflows.length, ACCEPTED_COUNTS.internalWorkflows],
    ["MCP tools", mcpTools.length, ACCEPTED_COUNTS.mcpTools],
  ]) {
    if (actual !== expected) errors.push(`accepted plugin inventory drift: ${label} expected ${expected}, found ${actual}`);
  }
  return { publicSkills, internalWorkflows, mcpTools };
}

export async function checkPluginDocs({ repoRoot }) {
  const root = path.resolve(repoRoot);
  const errors = [];
  const anchorCache = new Map();
  let checkedFiles = 0;

  const checkedContent = new Map();

  async function inspectDocument(relativeName, filename, content, { pluginFirst }) {
    checkedFiles += 1;
    checkedContent.set(relativeName, content);
    for (const target of inlineLinkDestinations(content)) {
      await checkLink({ repoRoot: root, sourcePath: filename, target, errors, anchorCache });
    }
    if (pluginFirst && !LEGACY_DOCS.has(relativeName)) {
      for (const [label, pattern] of PLUGIN_FIRST_FORBIDDEN) {
        if (pattern.test(content)) errors.push(`forbidden plugin-first pattern ${label}: ${relativeName}`);
      }
    }
    for (const [label, pattern] of EVERYWHERE_FORBIDDEN) {
      if (pattern.test(content)) errors.push(`forbidden documentation pattern ${label}: ${relativeName}`);
    }
    if (PROVISION_RUNBOOKS.has(relativeName)) checkProvisionRunbookContract(relativeName, content, errors);
    if (CONNECT_RUNBOOKS.has(relativeName)) checkConnectRunbookContract(relativeName, content, errors);
  }

  async function inspectPair(englishRelative, russianRelative, { requireDocKeys, pluginFirst }) {
    const englishPath = path.join(root, englishRelative);
    const russianPath = path.join(root, russianRelative);
    const englishExists = await isFile(englishPath);
    const russianExists = await isFile(russianPath);
    if (!englishExists || !russianExists) {
      if (!englishExists) errors.push(`required Wave 8 document is missing: ${englishRelative}`);
      if (!russianExists) errors.push(`required Wave 8 document is missing: ${russianRelative}`);
      return;
    }

    const [english, russian] = await Promise.all([
      readFile(englishPath, "utf8"),
      readFile(russianPath, "utf8"),
    ]);
    const englishHeadings = markdownHeadings(english);
    const russianHeadings = markdownHeadings(russian);
    const englishLevels = englishHeadings.map((heading) => heading.level);
    const russianLevels = russianHeadings.map((heading) => heading.level);
    if (!arraysEqual(englishLevels, russianLevels)) {
      errors.push(`RU/EN heading hierarchy differs: ${englishRelative} <> ${russianRelative}`);
    }

    if (requireDocKeys) {
      const englishKeys = semanticKeys(english);
      const russianKeys = semanticKeys(russian);
      const expectedKeys = englishHeadings.filter((heading) => heading.level >= 2).length;
      if (englishKeys.length !== expectedKeys || !unique(englishKeys)) {
        errors.push(`${englishRelative} must have one unique doc-key per H2-H6 section`);
      }
      const russianExpectedKeys = russianHeadings.filter((heading) => heading.level >= 2).length;
      if (russianKeys.length !== russianExpectedKeys || !unique(russianKeys)) {
        errors.push(`${russianRelative} must have one unique doc-key per H2-H6 section`);
      }
      if (!arraysEqual(englishKeys, russianKeys)) {
        errors.push(`RU/EN semantic doc-key order differs: ${englishRelative} <> ${russianRelative}`);
      }
    }

    for (const [relativeName, filename, content] of [
      [englishRelative, englishPath, english],
      [russianRelative, russianPath, russian],
    ]) {
      await inspectDocument(relativeName, filename, content, { pluginFirst });
    }
  }

  for (const [englishRelative, russianRelative] of CORE_DOC_PAIRS) {
    await inspectPair(englishRelative, russianRelative, { requireDocKeys: true, pluginFirst: true });
  }
  for (const [englishRelative, russianRelative] of SUPPORT_DOC_PAIRS) {
    await inspectPair(englishRelative, russianRelative, { requireDocKeys: false, pluginFirst: false });
  }
  for (const relativeName of SUPPORT_SINGLE_DOCS) {
    const filename = path.join(root, relativeName);
    if (!(await isFile(filename))) {
      errors.push(`required Wave 8 document is missing: ${relativeName}`);
      continue;
    }
    await inspectDocument(relativeName, filename, await readFile(filename, "utf8"), { pluginFirst: false });
  }

  for (const [rootRelative, bundledRelative] of BUNDLED_DOC_MIRRORS) {
    const rootContent = checkedContent.get(rootRelative);
    const bundledContent = checkedContent.get(bundledRelative);
    if (rootContent !== undefined && bundledContent !== undefined && rootContent !== bundledContent) {
      errors.push(`bundled documentation mirror differs: ${rootRelative} <> ${bundledRelative}`);
    }
  }

  const inventory = await pluginInventory(root, errors);
  for (const relativeName of ["docs/skills-reference.md", "docs/skills-reference.ru.md"]) {
    const content = checkedContent.get(relativeName);
    if (content === undefined) continue;
    for (const [label, names] of [
      ["public skill", inventory.publicSkills],
      ["internal workflow", inventory.internalWorkflows],
    ]) {
      for (const name of names) {
        if (!containsInventoryName(content, name)) {
          errors.push(`${relativeName} is missing ${label} name: ${name}`);
        }
      }
    }
  }
  return { errors, inventory, checkedFiles };
}

function parseArguments(argv) {
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let repoRoot = defaultRoot;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo-root" && argv[index + 1]) {
      repoRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${argv[index]}`);
    }
  }
  return { repoRoot };
}

async function main() {
  const { repoRoot } = parseArguments(process.argv.slice(2));
  const result = await checkPluginDocs({ repoRoot });
  if (result.errors.length > 0) {
    process.stderr.write(
      `Status: FAILED\nWave 8 Markdown files: ${result.checkedFiles}\n${result.errors.map((error) => `- ${error}`).join("\n")}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const { publicSkills, internalWorkflows, mcpTools } = result.inventory;
  process.stdout.write(
    [
      "Status: VERIFIED",
      `Wave 8 Markdown files: ${result.checkedFiles}`,
      `Public skills (${publicSkills.length}): ${publicSkills.join(", ")}`,
      `Internal workflows (${internalWorkflows.length}): ${internalWorkflows.join(", ")}`,
      `MCP tools (${mcpTools.length}): ${mcpTools.join(", ")}`,
    ].join("\n") + "\n",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Status: BLOCKED\nReason: ${error.stack ?? error.message}\n`);
    process.exitCode = 2;
  });
}

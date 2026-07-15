#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRootArgument = process.argv.indexOf("--plugin-root");
if (pluginRootArgument >= 0 && !process.argv[pluginRootArgument + 1]) {
  throw new Error("--plugin-root requires a path");
}
const pluginRoot = pluginRootArgument >= 0
  ? path.resolve(process.argv[pluginRootArgument + 1])
  : path.join(repoRoot, "plugins", "nacl");
const errors = [];
const markdownCodeStats = {
  commandPaths: 0,
  descriptivePaths: 0,
  inlinePaths: 0,
  sourceOnlyPaths: 0,
};

async function exists(filename) {
  try {
    await lstat(filename);
    return true;
  } catch {
    return false;
  }
}

function relative(filename) {
  return path.relative(pluginRoot, filename).split(path.sep).join("/");
}

function insidePlugin(filename) {
  const resolved = path.resolve(filename);
  return resolved === pluginRoot || resolved.startsWith(`${pluginRoot}${path.sep}`);
}

async function requireInside(base, reference, source, kind) {
  const resolved = path.resolve(base, reference);
  if (!insidePlugin(resolved)) {
    errors.push(`${kind} escapes plugin root: ${relative(source)} -> ${reference}`);
    return null;
  }
  if (!(await exists(resolved))) {
    errors.push(`${kind} is missing: ${relative(source)} -> ${reference}`);
    return null;
  }
  return resolved;
}

async function walk(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    const metadata = await lstat(filename);
    if (metadata.isSymbolicLink()) {
      errors.push(`symbolic link is forbidden: ${relative(filename)}`);
    } else if (metadata.isDirectory()) {
      await walk(filename, files);
    } else if (metadata.isFile()) {
      files.push(filename);
    } else {
      errors.push(`unsupported filesystem entry: ${relative(filename)}`);
    }
  }
  return files;
}

function localMarkdownTargets(content) {
  const targets = [];
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    target = target.split(/\s+["']/)[0];
    if (/^(?:https?:|mailto:|codex:|#)/.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (
      target.includes("{{") ||
      target.includes("...") ||
      target.includes("|") ||
      target.startsWith("../../../.tl/")
    ) {
      continue;
    }
    if (target.length > 0) targets.push(decodeURIComponent(target));
  }
  return targets;
}

function isActiveMarkdown(filename) {
  const name = relative(filename);
  return name.startsWith("skills/") || name.startsWith("resources/workflows/");
}

function localCodePaths(value) {
  const paths = [];
  const patterns = [
    /(?:^|[\s("'=])((?:\.\.?\/)[A-Za-z0-9_./-]+)/g,
    /(?:^|[\s("'=])((?:nacl-[a-z0-9-]+|docs\/(?:guides|runbooks)|graph-infra\/(?:schema|queries))\/[A-Za-z0-9_./-]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const candidate = match[1].replace(/[),.;:]+$/, "");
      if (candidate.includes("<") || candidate.includes("{") || candidate.includes("*")) continue;
      if (!paths.includes(candidate)) paths.push(candidate);
    }
  }
  return paths;
}

function isCommandReference(value) {
  const trimmed = value.trim();
  return (
    /^(?:(?:[A-Z_][A-Z0-9_]*=[^\s]+)\s+)*(?:node|python3?|bash|sh|pwsh|powershell|source|\.)\s+/.test(trimmed) ||
    /^(?:\.\.?\/|nacl-[a-z0-9-]+\/)[^\s]+\.(?:mjs|js|py|sh|ps1)(?:\s|$)/.test(trimmed)
  );
}

function codeReferences(content) {
  const references = [];
  let fence = null;
  for (const [offset, line] of content.split("\n").entries()) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
      continue;
    }
    if (fence !== null) {
      if (isCommandReference(line)) {
        for (const reference of localCodePaths(line)) {
          references.push({ reference, kind: "Markdown command path", line: offset + 1 });
        }
      }
      continue;
    }
    for (const match of line.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
      const value = match[1].trim();
      if (/^source-only\s*:/.test(value)) {
        markdownCodeStats.sourceOnlyPaths += 1;
        continue;
      }
      const descriptive = /Source Claude skill path:/.test(line);
      const command = isCommandReference(value);
      for (const reference of localCodePaths(value)) {
        references.push({
          reference,
          kind: descriptive
            ? "Markdown descriptive source path"
            : command
              ? "Markdown command path"
              : "Markdown inline code path",
          line: offset + 1,
        });
      }
    }
  }
  return references;
}

async function checkCodeReference(filename, item) {
  if (item.kind === "Markdown command path") {
    errors.push(
      `cwd-dependent active command is forbidden: ${relative(filename)} -> ${item.reference} (line ${item.line}); use a packaged MCP tool or load an internal reference`,
    );
    return;
  }
  const base = item.reference.startsWith(".")
    ? path.dirname(filename)
    : path.join(pluginRoot, "resources");
  const errorCount = errors.length;
  const resolved = await requireInside(base, item.reference, filename, item.kind);
  if (resolved === null) {
    if (errors.length > errorCount) errors[errors.length - 1] += ` (line ${item.line})`;
    return;
  }
  if (item.kind === "Markdown descriptive source path") markdownCodeStats.descriptivePaths += 1;
  else markdownCodeStats.inlinePaths += 1;
}

function jsDependencies(content) {
  const dependencies = [];
  const patterns = [
    /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g,
    /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1].startsWith(".")) dependencies.push(match[1]);
    }
  }
  return dependencies;
}

function shellDependencies(content) {
  const dependencies = [];
  for (const line of content.split("\n")) {
    const direct = line.match(/^\s*(?:source|\.)\s+["']?([^\s"';$]+)["']?/);
    if (direct?.[1]?.startsWith(".")) dependencies.push(direct[1]);
    const scriptDir = line.match(
      /^\s*(?:source|\.)\s+["']?\$\{?(?:SCRIPT_DIR|script_dir)\}?\/([^\s"';]+)["']?/,
    );
    if (scriptDir?.[1]) dependencies.push(`./${scriptDir[1]}`);
    const skillsDir = line.match(
      /^\s*(?:source|\.)\s+["']?\$\{?SKILLS_DIR\}?\/([^\s"';]+)["']?/,
    );
    if (skillsDir?.[1]) dependencies.push(`resources:${skillsDir[1]}`);
  }
  return dependencies;
}

function pythonDependencies(content) {
  const dependencies = [];
  for (const line of content.split("\n")) {
    const from = line.match(/^\s*from\s+([.A-Za-z_][.A-Za-z0-9_]*)\s+import\s+/);
    if (from?.[1]?.startsWith(".") || from?.[1]?.startsWith("nacl_migrate_core")) {
      dependencies.push(from[1]);
    }
    const direct = line.match(/^\s*import\s+(nacl_migrate_core(?:\.[A-Za-z0-9_]+)*)/);
    if (direct?.[1]) dependencies.push(direct[1]);
  }
  return dependencies;
}

async function requirePythonDependency(filename, dependency) {
  let base;
  let moduleName;
  if (dependency.startsWith(".")) {
    const dots = dependency.match(/^\.+/)[0].length;
    base = path.dirname(filename);
    for (let level = 1; level < dots; level += 1) base = path.dirname(base);
    moduleName = dependency.slice(dots);
  } else {
    base = path.join(pluginRoot, "resources", "nacl-migrate-core");
    moduleName = dependency;
  }
  const modulePath = path.join(base, ...moduleName.split(".").filter(Boolean));
  const candidates = moduleName.length === 0
    ? [path.join(base, "__init__.py")]
    : [`${modulePath}.py`, path.join(modulePath, "__init__.py")];
  if (!(await Promise.any(candidates.map(async (candidate) => {
    if (!(await exists(candidate))) throw new Error("missing");
    if (!insidePlugin(candidate)) throw new Error("escape");
    return candidate;
  })).catch(() => null))) {
    errors.push(`Python import is missing: ${relative(filename)} -> ${dependency}`);
  }
}

async function checkManifest() {
  const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [field, value] of [
    ["skills", manifest.skills],
    ["mcpServers", manifest.mcpServers],
    ["apps", manifest.apps],
  ]) {
    if (value === undefined || typeof value !== "string") continue;
    if (!value.startsWith("./")) errors.push(`manifest ${field} is not plugin-relative: ${value}`);
    await requireInside(pluginRoot, value, manifestPath, `manifest ${field}`);
  }
  for (const field of ["composerIcon", "logo", "logoDark"]) {
    const value = manifest.interface?.[field];
    if (typeof value === "string") {
      await requireInside(pluginRoot, value, manifestPath, `manifest interface.${field}`);
    }
  }
  for (const value of manifest.interface?.screenshots ?? []) {
    await requireInside(pluginRoot, value, manifestPath, "manifest screenshot");
  }

  const mcpPath = path.join(pluginRoot, ".mcp.json");
  const mcp = JSON.parse(await readFile(mcpPath, "utf8"));
  if (Object.keys(mcp).join(",") !== "mcpServers") {
    errors.push(".mcp.json must use only the validated mcpServers wrapper");
  }
  for (const [name, server] of Object.entries(mcp.mcpServers ?? {})) {
    if (server.command !== "node") errors.push(`MCP ${name} must use the accepted system node prerequisite`);
    if (server.cwd !== ".") errors.push(`MCP ${name} cwd must remain cache-relative`);
    for (const argument of server.args ?? []) {
      if (typeof argument === "string" && argument.startsWith(".")) {
        await requireInside(pluginRoot, argument, mcpPath, `MCP ${name} argument`);
      }
    }
  }
}

async function checkPackageIndex() {
  const indexPath = path.join(pluginRoot, "resources", "package-index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  if (index.schemaVersion !== 1) errors.push("package index schemaVersion must be 1");

  const publicSkills = (await readdir(path.join(pluginRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const indexedPublic = [...index.publicEntrySkills].sort();
  if (JSON.stringify(publicSkills) !== JSON.stringify(indexedPublic)) {
    errors.push("public entry skill inventory differs from resources/package-index.json");
  }

  const workflowRoot = path.join(pluginRoot, "resources", "workflows");
  const workflows = (await readdir(workflowRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("nacl-"))
    .filter((entry) => entry.name !== "references")
    .map((entry) => entry.name)
    .sort();
  const indexedWorkflows = [...index.internalWorkflows].sort();
  if (JSON.stringify(workflows) !== JSON.stringify(indexedWorkflows)) {
    errors.push("internal workflow inventory differs from resources/package-index.json");
  }

  for (const skill of publicSkills) {
    await requireInside(
      path.join(pluginRoot, "skills", skill),
      "SKILL.md",
      indexPath,
      `public skill ${skill}`,
    );
  }
  for (const workflow of workflows) {
    await requireInside(
      path.join(workflowRoot, workflow),
      "SKILL.md",
      indexPath,
      `internal workflow ${workflow}`,
    );
  }
  for (const field of [
    "contracts",
    "templates",
    "schemas",
    "queries",
    "graphMigrations",
    "graphQueries",
    "graphCompose",
    "graphLifecycleRuntime",
    "gatewayRuntime",
    "workflowRuntime",
    "deterministicScripts",
  ]) {
    if (!Array.isArray(index[field]) || index[field].length === 0) {
      errors.push(`package index ${field} must be a non-empty array`);
      continue;
    }
    for (const item of index[field]) {
      await requireInside(pluginRoot, item, indexPath, `package index ${field}`);
    }
  }
  for (const field of ["mcpEntry", "doctorEntry", "graphGatewayEntry", "graphLifecycleEntry", "workflowCliEntry"]) {
    await requireInside(pluginRoot, index.runtime[field], indexPath, `package runtime ${field}`);
  }
}

async function main() {
  const canonicalPluginRoot = await realpath(pluginRoot);
  if (canonicalPluginRoot !== pluginRoot) errors.push("plugin root itself must not be a symlink");
  const files = await walk(pluginRoot);
  await checkManifest();
  await checkPackageIndex();

  for (const filename of files) {
    const content = await readFile(filename, "utf8");
    if (/\/Users\/[^/\s]+\//.test(content) || /\/home\/[^/\s]+\/projects\/NaCl\//.test(content)) {
      errors.push(`developer-specific absolute path: ${relative(filename)}`);
    }
    if (/(?:^|[^A-Za-z0-9])(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}/m.test(content)) {
      errors.push(`secret-like token: ${relative(filename)}`);
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
      errors.push(`private key material: ${relative(filename)}`);
    }
    if (/neo4j_graph_dev|NEO4J_PASSWORD:-[^}]/.test(content)) {
      errors.push(`committed graph password fallback: ${relative(filename)}`);
    }
    if (
      (relative(filename).startsWith("skills/") ||
        relative(filename).startsWith("resources/workflows/")) &&
      /<NaCl checkout>|skills-for-codex\/scripts\/|\$HOME\/\.claude\/skills\//.test(content)
    ) {
      errors.push(`entry/workflow checkout runtime dependency: ${relative(filename)}`);
    }
    if (filename.endsWith(".md")) {
      for (const target of localMarkdownTargets(content)) {
        await requireInside(path.dirname(filename), target, filename, "Markdown link");
      }
      if (isActiveMarkdown(filename)) {
        for (const reference of codeReferences(content)) {
          await checkCodeReference(filename, reference);
        }
      }
    }
    if (/\.(?:mjs|js)$/.test(filename)) {
      for (const dependency of jsDependencies(content)) {
        await requireInside(path.dirname(filename), dependency, filename, "JavaScript import");
      }
    }
    if (filename.endsWith(".sh")) {
      for (const dependency of shellDependencies(content)) {
        if (dependency.startsWith("resources:")) {
          await requireInside(
            path.join(pluginRoot, "resources"),
            dependency.slice("resources:".length),
            filename,
            "shell SKILLS_DIR import",
          );
        } else {
          await requireInside(path.dirname(filename), dependency, filename, "shell import");
        }
      }
    }
    if (filename.endsWith(".py")) {
      for (const dependency of pythonDependencies(content)) {
        await requirePythonDependency(filename, dependency);
      }
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`Status: FAILED\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Status: VERIFIED\nPlugin root: ${pluginRoot}\nFiles checked: ${files.length}\nPublic skills: 10\nInternal workflows: 60\nMarkdown inline code paths: ${markdownCodeStats.inlinePaths}\nMarkdown command paths: ${markdownCodeStats.commandPaths}\nMarkdown descriptive source paths: ${markdownCodeStats.descriptivePaths}\nMarkdown source-only annotations: ${markdownCodeStats.sourceOnlyPaths}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Status: BLOCKED\nReason: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
});

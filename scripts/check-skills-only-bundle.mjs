#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

const argument = process.argv.indexOf("--bundle-root");
if (argument < 0 || !process.argv[argument + 1]) throw new Error("--bundle-root is required");
const bundleRoot = await realpath(path.resolve(process.argv[argument + 1]));
const errors = [];
const forbiddenTools = /\bnacl_(?:installation_doctor|legacy_symlinks_[a-z_]+|project_[a-z_]+|graph_[a-z_]+|agent_profiles_[a-z_]+)\b/;
const forbiddenHostPaths = /(?:\/Users\/|[A-Za-z]:\\Users\\|NaCl-worker)/;
const runtimePluginAllowlist = new Set([
  path.join("resources", "bootstrap", "apply-project-schema.mjs"),
  path.join("resources", "bootstrap", "graph-docker-compose.yml"),
  path.join("resources", "bootstrap", "neo4j-image-PROVENANCE.md"),
  path.join("resources", "bootstrap", "setup-project-graph.ps1"),
  path.join("resources", "bootstrap", "setup-project-graph.sh"),
]);
const textExtensions = /\.(?:md|mjs|js|cjs|sh|ps1|json|ya?ml|toml|txt|pin)$/i;
const markdownLink = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*)?\)/g;

function inside(root, filename) {
  const resolved = path.resolve(filename);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

async function walk(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    const metadata = await lstat(filename);
    if (metadata.isSymbolicLink()) errors.push(`symlink forbidden: ${filename}`);
    else if (metadata.isDirectory()) await walk(filename, files);
    else if (metadata.isFile()) files.push(filename);
    else errors.push(`unsupported entry: ${filename}`);
  }
  return files;
}

const manifest = JSON.parse(await readFile(path.join(bundleRoot, ".codex-plugin", "plugin.json"), "utf8"));
if (manifest.skills !== "./skills/") errors.push("manifest skills path is invalid");
if ("mcpServers" in manifest || "apps" in manifest) errors.push("Skills-only manifest must not declare MCP or apps");
for (const forbidden of [".mcp.json", ".app.json"]) {
  try { await lstat(path.join(bundleRoot, forbidden)); errors.push(`${forbidden} must not be shipped`); } catch {}
}

const skillsRoot = path.join(bundleRoot, "skills");
const skills = (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
if (skills.length !== 10) errors.push(`expected 10 public skills, found ${skills.length}`);
for (const skill of skills) {
  const skillRoot = await realpath(path.join(skillsRoot, skill));
  const entry = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  if (entry.includes("../../resources/")) errors.push(`${skill}: public entry escapes its skill boundary`);
  if (forbiddenTools.test(entry)) errors.push(`${skill}: public entry names a package-only MCP tool`);
  if (entry.includes(".mcp.json")) errors.push(`${skill}: public entry uses non-Codex project MCP configuration`);
  if (forbiddenHostPaths.test(entry)) errors.push(`${skill}: public entry contains a forbidden host/source path`);
  for (const required of skill === "nacl-init" ? ["resources", "graph", "runtime"] : ["resources"]) {
    const resolved = await realpath(path.join(skillRoot, required)).catch(() => null);
    if (!resolved || !inside(skillRoot, resolved)) errors.push(`${skill}: missing self-contained ${required}`);
  }
  const files = await walk(skillRoot);
  for (const filename of files) {
    const canonical = await realpath(filename);
    if (!inside(skillRoot, canonical)) errors.push(`${skill}: closure escapes skill root`);
    const relative = path.relative(skillRoot, filename);
    if (path.basename(filename) === ".mcp.json") errors.push(`${skill}: forbidden legacy MCP writer artifact ${relative}`);
    if (textExtensions.test(filename)) {
      const content = await readFile(filename, "utf8");
      if (forbiddenHostPaths.test(content)) errors.push(`${skill}: forbidden host/source path in ${relative}`);
      if (/\bapoc\b/i.test(content) && !runtimePluginAllowlist.has(relative)) errors.push(`${skill}: unpinned Neo4j runtime plugin reference in ${relative}`);
      if (/\bNEO4J_PLUGINS\s*:/i.test(content) && (relative !== path.join("resources", "bootstrap", "graph-docker-compose.yml") || !content.includes("NEO4J_PLUGINS: '[\"apoc\"]'"))) {
        errors.push(`${skill}: unexpected Neo4j runtime plugin configuration in ${relative}`);
      }
      if (!relative.startsWith(`graph${path.sep}migrations${path.sep}`) && forbiddenTools.test(content)) errors.push(`${skill}: package-only MCP tool in ${relative}`);
      if (/\.mcp\.json/.test(content)) errors.push(`${skill}: legacy .mcp.json instruction in ${relative}`);
      if (filename.endsWith(".md")) {
        for (const match of content.matchAll(markdownLink)) {
          const raw = match[1];
          if (/^(?:[a-z]+:|#)/i.test(raw) || /[{}<>]/.test(raw)) continue;
          let decoded;
          try { decoded = decodeURIComponent(raw.split(/[?#]/, 1)[0]); } catch { errors.push(`${skill}: malformed Markdown URI in ${relative}: ${raw}`); continue; }
          const target = path.resolve(path.dirname(filename), decoded);
          if (!inside(skillRoot, target)) errors.push(`${skill}: Markdown link escapes skill root in ${relative}: ${raw}`);
          else {
            const targetMetadata = await lstat(target).catch(() => null);
            if (!targetMetadata) errors.push(`${skill}: missing Markdown link in ${relative}: ${raw}`);
            else if (targetMetadata.isSymbolicLink()) errors.push(`${skill}: Markdown link resolves through forbidden symlink in ${relative}: ${raw}`);
          }
        }
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.stderr.write("Status: FAILED\n");
  process.exit(1);
}
process.stdout.write(`Status: VERIFIED\nSkills: ${skills.length}\nBoundary: per-skill self-contained\nMCP: project-local bootstrap only\n`);

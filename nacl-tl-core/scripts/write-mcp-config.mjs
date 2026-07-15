// Deterministic .mcp.json writer/merger for the Neo4j MCP server.
//
// Why this exists: setup-graph.sh embedded a Python snippet to merge the `neo4j` server
// into an existing .mcp.json (falling back to a sidecar file when python3 was missing).
// The multi-user connect/create paths need the SAME merge, plus the ability to point
// NEO4J_URI at a local tunnel socket instead of the local container. Pulling it into one
// node tool removes the python3 dependency (node is already required to run these tools),
// gives the merge a test harness, and lets every caller — local setup, connect-remote,
// create-remote, migrate-to-remote — share one implementation. Pinned by write-mcp-config.test.mjs.
//
//   write-mcp-config.mjs --project-root <dir> --command <neo4j-mcp-bin> \
//       --uri bolt://localhost:3700 [--username neo4j] [--password <pw>] [--database neo4j]
//   Merges (preserving other servers) into <dir>/.mcp.json, or creates it. UTF-8, no BOM,
//   2-space indent + trailing newline — identical to the prior python merge.

import { realpathSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateSecretSource } from './secret-source-contract.mjs';
import { parseStrictJsonDocument } from './strict-state-documents.mjs';

/**
 * Returns a NEW .mcp.json document with the `neo4j` server set/replaced, preserving any
 * other servers. Does not mutate the input.
 * @param {object} existingDoc  parsed .mcp.json (or {} when absent/garbage)
 * @param {{command:string, uri:string, username?:string, password?:string, database?:string}} conn
 * @returns {object}
 */
export function mergeMcpConfig(existingDoc, { command, uri, username = 'neo4j', password, database = 'neo4j', secretSource, launcher }) {
  if (!command) throw new Error('write-mcp-config: --command (neo4j-mcp binary path) is required');
  if (!uri) throw new Error('write-mcp-config: --uri is required');

  const doc = (existingDoc && typeof existingDoc === 'object') ? structuredClone(existingDoc) : {};
  if (!doc.mcpServers || typeof doc.mcpServers !== 'object') doc.mcpServers = {};

  const parsedSecretSource = secretSource === undefined ? null : validateSecretSource(secretSource);
  const env = {
    NEO4J_URI: uri,
    NEO4J_USERNAME: username,
    NEO4J_DATABASE: database,
    NEO4J_TELEMETRY: 'false',
  };
  if (secretSource === undefined) env.NEO4J_PASSWORD = password ?? '';
  else {
    env.NACL_NEO4J_SECRET_SOURCE = parsedSecretSource.reference;
    if (launcher !== undefined) env.NACL_REMOTE_ROUTE_MODE = launcher.routeMode;
  }
  if (parsedSecretSource?.kind === 'server-route' && !launcher) throw new Error('write-mcp-config: server-route requires a secret launcher');
  if (launcher && (!launcher.command || !launcher.script || !launcher.binary || !['create', 'connect'].includes(launcher.routeMode))) {
    throw new Error('write-mcp-config: invalid secret launcher');
  }
  doc.mcpServers.neo4j = {
    type: 'stdio',
    command: launcher?.command ?? command,
    args: launcher ? [launcher.script, '--binary', launcher.binary, '--secret-source', parsedSecretSource.reference] : [],
    env,
  };
  return doc;
}

/** BOM-tolerant parse (utf-8-sig equivalent); returns {} on missing/garbage. */
export function readMcpDoc(text) {
  if (typeof text !== 'string' || text.trim() === '') return {};
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch { return {}; }
}

/** Strict transaction parser: malformed user state must never be replaced silently. */
export function readMcpDocStrict(text) {
  if (typeof text !== 'string' || text.trim() === '') return {};
  let parsed;
  try { parsed = parseStrictJsonDocument(text); } catch { throw new Error('write-mcp-config: existing .mcp.json is malformed or ambiguous'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('write-mcp-config: existing .mcp.json must be an object');
  if (parsed.mcpServers !== undefined && (!parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers))) {
    throw new Error('write-mcp-config: existing mcpServers must be an object');
  }
  return parsed;
}

/** Canonical serialization: 2-space indent, trailing newline, no BOM (matches prior merge). */
export function serializeMcpDoc(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}

// CLI — symlink-safe main check.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--') && a.includes('=')) { const [k, v] = a.slice(2).split(/=(.*)/s); opt[k] = v; }
    else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  }
  const projectRoot = opt['project-root'] ?? process.cwd();
  try {
    const mcpPath = join(projectRoot, '.mcp.json');
    const existing = existsSync(mcpPath) ? readMcpDoc(readFileSync(mcpPath, 'utf-8')) : {};
    const merged = mergeMcpConfig(existing, {
      command: opt.command,
      uri: opt.uri,
      username: opt.username,
      password: opt.password,
      database: opt.database,
      secretSource: opt['secret-source'],
    });
    writeFileSync(mcpPath, serializeMcpDoc(merged), 'utf-8');
    process.stdout.write(`wrote neo4j MCP server → ${mcpPath} (uri=${opt.uri})\n`);
  } catch (e) {
    process.stderr.write(`write-mcp-config error: ${e.message}\n`);
    process.exit(1);
  }
}

// Client-side Cypher executor over the neo4j-mcp stdio binary (no docker, no cypher-shell).
//
// Why this exists: in remote/multi-user mode a developer's machine has NO local Neo4j
// container and may have no cypher-shell — but it DOES have the resolved neo4j-mcp binary
// (the same one .mcp.json points at). The connect verify-gate (project-exists), the
// create-remote seed (constraints + (:Project) marker), and the migration verify-gate all
// need to run Cypher against the remote graph through the local mTLS tunnel. This tool
// speaks JSON-RPC to the binary: initialize → tools/list → tools/call, discovering the
// read/write cypher tool by name+schema rather than hard-coding it (the Go binary's tool
// names are not guaranteed). Pure request/response helpers are pinned by mcp-cypher.test.mjs;
// the spawn path needs a real binary so it is exercised by the connect/create integration gates.
//
//   mcp-cypher.mjs --binary <path> --uri <bolt-uri> [--user neo4j] [--password pw]
//       [--database neo4j] --query "MATCH (n) RETURN count(n) AS c" [--write] [--param k=v]...
//   → prints result rows as JSON, then:  NACL_CYPHER_RESULT: status=ok|fail rows=<n>

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const INIT_REQUEST = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'nacl-mcp-cypher', version: '1.0' } },
};
export const INITIALIZED_NOTE = { jsonrpc: '2.0', method: 'notifications/initialized' };
export const TOOLS_LIST_REQUEST = { jsonrpc: '2.0', id: 2, method: 'tools/list' };

/**
 * Choose the read or write cypher tool from a tools/list result. Matches on name
 * containing "cypher" (preferring a "read"/"write" qualifier) and falls back to a tool
 * whose input schema has a query/cypher string property.
 * @returns {{name:string, argKey:string} | null}
 */
export function pickCypherTool(toolsListResult, { write = false } = {}) {
  const tools = toolsListResult?.tools ?? [];
  const want = write ? /write/i : /read/i;
  const argOf = (t) => {
    const props = t?.inputSchema?.properties ?? {};
    if ('query' in props) return 'query';
    if ('cypher' in props) return 'cypher';
    const req = t?.inputSchema?.required ?? [];
    return req[0] ?? 'query';
  };
  const cypherTools = tools.filter((t) => /cypher/i.test(t.name ?? ''));
  const exact = cypherTools.find((t) => want.test(t.name));
  const chosen = exact ?? (write ? null : cypherTools[0]);
  return chosen ? { name: chosen.name, argKey: argOf(chosen) } : null;
}

/** Build the tools/call request for a chosen tool. */
export function buildToolsCall(id, toolName, argKey, query, params) {
  const args = { [argKey]: query };
  if (params && Object.keys(params).length) args.params = params;
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args } };
}

/** Extract row objects from an MCP tools/call result (content[].text JSON or structured). */
export function parseRows(callResult) {
  if (!callResult) return [];
  if (Array.isArray(callResult.structuredContent?.rows)) return callResult.structuredContent.rows;
  const content = callResult.content ?? [];
  const rows = [];
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      try {
        const parsed = JSON.parse(part.text);
        if (Array.isArray(parsed)) rows.push(...parsed);
        else rows.push(parsed);
      } catch {
        rows.push({ text: part.text });
      }
    }
  }
  return rows;
}

/** Parse repeated --param k=v (value JSON-parsed when possible). */
export function parseParams(pairs) {
  const out = {};
  for (const p of pairs) {
    const [k, v] = p.split(/=(.*)/s);
    if (!k) continue;
    try { out[k] = JSON.parse(v); } catch { out[k] = v; }
  }
  return out;
}

/**
 * Run a single Cypher query against the binary over stdio. Resolves to {rows}.
 * Rejects on spawn error, timeout, or a JSON-RPC error response.
 */
export function runCypher({ binary, env, query, params = {}, write = false, timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], { env: { ...process.env, ...env, NEO4J_TELEMETRY: 'false' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let toolsResult = null;
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill('SIGKILL'); } catch {} reject(new Error('mcp-cypher: timeout')); } }, timeoutMs);
    const done = (err, val) => { if (settled) return; settled = true; clearTimeout(timer); try { child.kill('SIGKILL'); } catch {} err ? reject(err) : resolve(val); };

    child.on('error', (e) => done(e));
    child.stderr.on('data', () => { /* binary diagnostics — ignored unless we fail */ });
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2) {
          // tools/list response → pick tool and issue the call
          const picked = pickCypherTool(msg.result, { write });
          if (!picked) return done(new Error('mcp-cypher: no cypher tool exposed by binary'));
          toolsResult = picked;
          child.stdin.write(JSON.stringify(buildToolsCall(3, picked.name, picked.argKey, query, params)) + '\n');
        } else if (msg.id === 3) {
          if (msg.error) return done(new Error(`mcp-cypher: ${msg.error.message ?? 'tools/call error'}`));
          return done(null, { rows: parseRows(msg.result), tool: toolsResult });
        }
      }
    });

    // drive the handshake
    child.stdin.write(JSON.stringify(INIT_REQUEST) + '\n');
    child.stdin.write(JSON.stringify(INITIALIZED_NOTE) + '\n');
    child.stdin.write(JSON.stringify(TOOLS_LIST_REQUEST) + '\n');
  });
}

// CLI — symlink-safe main check.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = { params: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--write') opt.write = true;
    else if (a === '--param') opt.params.push(args[++i]);
    else if (a.startsWith('--') && a.includes('=')) { const [k, v] = a.slice(2).split(/=(.*)/s); opt[k] = v; }
    else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  }
  if (!opt.binary || !opt.uri || !opt.query) {
    process.stderr.write('usage: mcp-cypher.mjs --binary <path> --uri <bolt-uri> --query <cypher> [--write] [--user] [--password] [--database] [--param k=v]\n');
    process.exit(2);
  }
  const env = {
    NEO4J_URI: opt.uri,
    NEO4J_USERNAME: opt.user ?? 'neo4j',
    NEO4J_PASSWORD: opt.password ?? process.env.NEO4J_PASSWORD ?? '',
    NEO4J_DATABASE: opt.database ?? 'neo4j',
  };
  runCypher({ binary: opt.binary, env, query: opt.query, params: parseParams(opt.params), write: !!opt.write })
    .then(({ rows }) => {
      process.stdout.write(JSON.stringify(rows) + '\n');
      process.stdout.write(`NACL_CYPHER_RESULT: status=ok rows=${rows.length}\n`);
    })
    .catch((e) => {
      process.stdout.write(`NACL_CYPHER_RESULT: status=fail rows=0\n`);
      process.stderr.write(`${e.message}\n`);
      process.exit(1);
    });
}

// Deterministic patcher for the `graph:` block of config.yaml (no YAML dependency).
//
// Why this exists: the connect/create remote paths must write `graph.mode: remote` plus the
// endpoint fields into config.yaml, and converting a local project to remote means rewriting
// the block. Doing this as SKILL.md prose ("edit the yaml…") is exactly the kind of
// non-deterministic step the skill-tools pattern removes. This tool owns the `graph:` block:
// it parses the existing block shallowly, merges new values FILL-EMPTY-ONLY (never clobber a
// value the user already set), renders a canonical block, and splices it back leaving the rest
// of config.yaml byte-untouched. The block is tool-owned, so inline comments inside it are not
// preserved across a rewrite. Pure functions are pinned by write-graph-config.test.mjs.
//
//   write-graph-config.mjs --project-root <dir> --mode remote \
//       --set neo4j_uri=bolt://localhost:3700 --set project_scope=acme \
//       --set remote.host=graph.acme.dev --set remote.gateway_port=7687 ...
//   FILL-EMPTY-ONLY by default; pass --force to overwrite existing non-empty values.

import { realpathSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Order in which keys render, so output is stable regardless of input order.
const FLAT_ORDER = [
  'mode',
  'neo4j_bolt_port', 'neo4j_http_port', 'neo4j_password', 'container_prefix',  // local
  'neo4j_uri', 'neo4j_username', 'neo4j_database', 'project_scope',            // remote
  'boards_dir',                                                                // shared
];
const REMOTE_ORDER = ['route_mode', 'host', 'gateway_port', 'sidecar_port', 'client_cert', 'client_key', 'ca_cert', 'tls', 'secret_source'];
const ROUTE_OWNED_FLAT = new Set([
  'mode', 'neo4j_bolt_port', 'neo4j_http_port', 'neo4j_password', 'container_prefix',
  'neo4j_uri', 'neo4j_username', 'neo4j_database', 'project_scope',
]);

const isEmpty = (v) => v === undefined || v === null || v === '' || v === '""' || v === "''";

/** Locate the `graph:` block. Returns {startLine, endLine} (end exclusive) or null if absent. */
export function findGraphBlock(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^graph:\s*(#.*)?$/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '' || /^\s/.test(l)) continue;   // blank or indented → still inside
    end = i; break;                                    // first dedented non-empty line ends block
  }
  // trim trailing blank lines out of the block
  while (end - 1 > start && lines[end - 1].trim() === '') end--;
  return { startLine: start, endLine: end };
}

/** Shallow parse of a graph block into {flat:{}, remote:{}}. Skips comments/blanks. */
export function parseGraphBlock(blockText) {
  const flat = {}, remote = {};
  let inRemote = false;
  for (const raw of blockText.split(/\r?\n/)) {
    if (raw.trim() === '' || /^\s*#/.test(raw) || /^graph:/.test(raw)) continue;
    const flatM = raw.match(/^ {2}([A-Za-z0-9_]+):\s*(.*?)\s*$/);
    const subM = raw.match(/^ {4}([A-Za-z0-9_]+):\s*(.*?)\s*$/);
    if (flatM) {
      inRemote = flatM[1] === 'remote';
      if (!inRemote) flat[flatM[1]] = flatM[2];
    } else if (subM && inRemote) {
      remote[subM[1]] = subM[2];
    }
  }
  return { flat, remote };
}

/**
 * Merge new values into existing, FILL-EMPTY-ONLY unless force. `next` shape:
 * { flat:{k:v}, remote:{k:v} }. Returns merged {flat, remote}.
 */
export function mergeGraphValues(existing, next, { force = false } = {}) {
  const out = { flat: { ...existing.flat }, remote: { ...existing.remote } };
  for (const [k, v] of Object.entries(next.flat ?? {})) {
    if (force || isEmpty(out.flat[k])) out.flat[k] = v;
  }
  for (const [k, v] of Object.entries(next.remote ?? {})) {
    if (force || isEmpty(out.remote[k])) out.remote[k] = v;
  }
  return out;
}

/** Replace the complete tool-owned local/remote route while preserving unrelated graph keys. */
export function replaceRemoteRouteValues(existing, route) {
  const flat = Object.fromEntries(Object.entries(existing.flat ?? {}).filter(([key]) => !ROUTE_OWNED_FLAT.has(key)));
  Object.assign(flat, {
    mode: JSON.stringify('remote'),
    neo4j_uri: JSON.stringify(route.uri),
    neo4j_username: JSON.stringify(route.username),
    neo4j_database: JSON.stringify(route.database),
    project_scope: JSON.stringify(route.project_scope),
  });
  return {
    flat,
    remote: {
      route_mode: JSON.stringify(route.mode),
      host: JSON.stringify(route.host),
      gateway_port: route.gateway_port,
      sidecar_port: route.sidecar_port,
      client_cert: JSON.stringify(route.client_cert),
      client_key: JSON.stringify(route.client_key),
      ca_cert: JSON.stringify(route.ca_cert),
      tls: route.tls,
      secret_source: JSON.stringify(route.secret_source),
    },
  };
}

/** Render a canonical `graph:` block (no trailing newline). Unknown keys render after known ones. */
export function renderGraphBlock({ flat, remote }) {
  const lines = ['graph:'];
  const flatKeys = [...FLAT_ORDER.filter((k) => k in flat), ...Object.keys(flat).filter((k) => !FLAT_ORDER.includes(k) && k !== 'remote')];
  for (const k of flatKeys) {
    if (k === 'boards_dir') continue;            // rendered last, after remote:
    lines.push(`  ${k}: ${flat[k]}`);
  }
  if (remote && Object.keys(remote).length) {
    lines.push('  remote:');
    const rKeys = [...REMOTE_ORDER.filter((k) => k in remote), ...Object.keys(remote).filter((k) => !REMOTE_ORDER.includes(k))];
    for (const k of rKeys) lines.push(`    ${k}: ${remote[k]}`);
  }
  if ('boards_dir' in flat) lines.push(`  boards_dir: ${flat.boards_dir}`);
  return lines.join('\n');
}

/** Splice a rendered block back into the full config text (replace existing graph: block or append). */
export function spliceGraphBlock(yamlText, renderedBlock) {
  const lines = yamlText.split(/\r?\n/);
  const span = findGraphBlock(lines);
  const blockLines = renderedBlock.split('\n');
  if (!span) {
    const sep = (yamlText.trim() === '' || yamlText.endsWith('\n')) ? '' : '\n';
    const lead = yamlText.trim() === '' ? '' : '\n';
    return yamlText + sep + lead + renderedBlock + '\n';
  }
  const before = lines.slice(0, span.startLine);
  const after = lines.slice(span.endLine);
  return [...before, ...blockLines, ...after].join('\n');
}

/** Full transform: parse existing config → merge → render → splice. */
export function patchGraphConfig(yamlText, next, opts) {
  const lines = yamlText.split(/\r?\n/);
  const span = findGraphBlock(lines);
  const existing = span
    ? parseGraphBlock(lines.slice(span.startLine, span.endLine).join('\n'))
    : { flat: {}, remote: {} };
  const merged = mergeGraphValues(existing, next, opts);
  return spliceGraphBlock(yamlText, renderGraphBlock(merged));
}

// CLI — symlink-safe main check.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = { sets: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--set') opt.sets.push(args[++i]);
    else if (a === '--force') opt.force = true;
    else if (a.startsWith('--') && a.includes('=')) { const [k, v] = a.slice(2).split(/=(.*)/s); opt[k] = v; }
    else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  }
  const next = { flat: {}, remote: {} };
  if (opt.mode) next.flat.mode = opt.mode;
  for (const s of opt.sets) {
    const [k, v] = s.split(/=(.*)/s);
    if (k.startsWith('remote.')) next.remote[k.slice('remote.'.length)] = v;
    else next.flat[k] = v;
  }
  try {
    const projectRoot = opt['project-root'] ?? process.cwd();
    const cfgPath = join(projectRoot, 'config.yaml');
    const text = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf-8') : '';
    const patched = patchGraphConfig(text, next, { force: !!opt.force });
    writeFileSync(cfgPath, patched.endsWith('\n') ? patched : patched + '\n', 'utf-8');
    process.stdout.write(`patched graph: block → ${cfgPath} (mode=${next.flat.mode ?? 'unchanged'})\n`);
  } catch (e) {
    process.stderr.write(`write-graph-config error: ${e.message}\n`);
    process.exit(1);
  }
}

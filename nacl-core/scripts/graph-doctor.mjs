// Deterministic Neo4j-graph liveness probe + safe start/fix + SessionStart-hook feed for
// NaCl running inside Claude Code Desktop (GUI launch: minimal PATH, no shell profile, and
// possibly a linked git worktree instead of the main checkout).
//
// Why this exists: skills assume `mcp__neo4j__*` tools just work. In Desktop that assumption
// breaks in three ways — (1) the graph container/sidecar may simply be stopped, (2) a worktree
// has no .mcp.json of its own, (3) a stopped local Docker Desktop needs a distinct diagnosis
// from "docker missing" vs "daemon down". This tool answers "is the graph reachable" cheaply
// (TCP probe, no MCP handshake), can safely start/repair it (local docker compose or remote
// sidecar relaunch, both idempotent and lock-guarded), and feeds a SessionStart hook so Claude
// never calls graph tools against a dead graph. Pure decision/parsing functions are pinned by
// graph-doctor.test.mjs; the docker/sidecar spawn paths are exercised end-to-end via --hook and
// --fix in the same file since they need a real (possibly absent) docker/launchd on the host.
//
//   graph-doctor.mjs                 → NACL_GRAPH_DOCTOR: status=UP|DOWN|NOT_NACL mode=.. port=.. root=..
//   graph-doctor.mjs --fix           → start/repair, then NACL_GRAPH_FIX: status=UP|FAILED [failed_check=..]
//   graph-doctor.mjs --hook          → SessionStart hook JSON on stdout when DOWN, silent otherwise
//   graph-doctor.mjs --scan-ports    → NACL_GRAPH_PORTS: used=<comma list of local bolt ports in use>

import { realpathSync, readFileSync, existsSync, mkdirSync, rmdirSync, statSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';
import os from 'node:os';

// ---------------------------------------------------------------------------
// resolveProjectRoot — plain repo vs linked worktree vs non-git dir
// ---------------------------------------------------------------------------

/**
 * @param {string} cwd
 * @returns {{root:string, isWorktree:boolean, worktreeRoot:string|null}}
 */
export function resolveProjectRoot(cwd) {
  try {
    // `git rev-parse --git-common-dir` is RELATIVE from inside the main checkout (`.git` at
    // root, `../.git` from a subdir) and ABSOLUTE (pointing at the main checkout's .git) only
    // when run from a linked worktree — so resolve() it against cwd before comparing.
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const resolvedCommon = resolve(cwd, commonDir);
    const toplevelGit = resolve(toplevel, '.git');
    const isWorktree = resolvedCommon !== toplevelGit;
    if (isWorktree) {
      return { root: dirname(resolvedCommon), isWorktree: true, worktreeRoot: toplevel };
    }
    return { root: toplevel, isWorktree: false, worktreeRoot: null };
  } catch {
    return { root: cwd, isWorktree: false, worktreeRoot: null };
  }
}

// ---------------------------------------------------------------------------
// readGraphConfig — scoped, dependency-free scan of config.yaml's graph: block
// ---------------------------------------------------------------------------

/**
 * Extracts the `graph:` block (mirrors the scoped-scan approach used by resolve-graph-mode.mjs
 * / resolve-developer-id.mjs, extended to a nested `remote:` sub-block).
 * @param {string} yamlText
 * @returns {object|null}
 */
export function parseGraphConfig(yamlText) {
  if (typeof yamlText !== 'string') return null;
  const lines = yamlText.split(/\r?\n/);
  let inGraph = false;
  let inRemote = false;
  let found = false;
  const raw = { mode: null, neo4j_bolt_port: null, neo4j_uri: null, container_prefix: null, project_scope: null, remote: {} };

  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;
    if (!inGraph) {
      if (/^graph:\s*(#.*)?$/.test(line)) { inGraph = true; found = true; }
      continue;
    }
    if (line.trim() !== '' && !/^\s/.test(line)) break; // dedent to top level ends the block

    if (/^\s{2}remote:\s*(#.*)?$/.test(line)) { inRemote = true; continue; }
    if (inRemote && line.trim() !== '' && !/^\s{4,}/.test(line)) inRemote = false; // dedent out of remote:

    if (inRemote) {
      const m = line.match(/^\s+(host|gateway_port|sidecar_port):\s*["']?([^"'#]*?)["']?\s*(#.*)?$/);
      if (m) raw.remote[m[1]] = m[2].trim();
      continue;
    }
    const m = line.match(/^\s+(mode|neo4j_bolt_port|neo4j_uri|container_prefix|project_scope):\s*["']?([^"'#]*?)["']?\s*(#.*)?$/);
    if (m) raw[m[1]] = m[2].trim();
  }
  if (!found) return null;

  const mode = raw.mode === 'remote' ? 'remote' : 'local';
  const neo4jBoltPort = raw.neo4j_bolt_port ? Number(raw.neo4j_bolt_port) : 3587;
  const remote = {
    host: raw.remote.host || null,
    gateway_port: raw.remote.gateway_port ? Number(raw.remote.gateway_port) : null,
    sidecar_port: raw.remote.sidecar_port ? Number(raw.remote.sidecar_port) : null,
  };

  const cfg = {
    mode,
    neo4j_bolt_port: neo4jBoltPort,
    neo4j_uri: raw.neo4j_uri || null,
    container_prefix: raw.container_prefix || null,
    project_scope: raw.project_scope || null,
    remote,
  };
  cfg.probe = deriveProbe(cfg);
  return cfg;
}

function deriveProbe(cfg) {
  if (cfg.mode === 'remote') {
    let host = 'localhost';
    let port = cfg.remote.sidecar_port || 3700;
    if (cfg.neo4j_uri) {
      const m = String(cfg.neo4j_uri).match(/^bolt:\/\/([^:/]+):(\d+)/);
      if (m) { host = m[1]; port = Number(m[2]); }
    }
    return { host, port };
  }
  return { host: 'localhost', port: cfg.neo4j_bolt_port };
}

/**
 * @param {string} rootDir
 * @returns {object|null}
 */
export function readGraphConfig(rootDir) {
  let text;
  try { text = readFileSync(join(rootDir, 'config.yaml'), 'utf8'); } catch { return null; }
  return parseGraphConfig(text);
}

// ---------------------------------------------------------------------------
// probeTcp — cheap liveness check, never rejects
// ---------------------------------------------------------------------------

/**
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export function probeTcp(host, port, timeoutMs = 500) {
  return new Promise((resolve_) => {
    let settled = false;
    const finish = (ok) => { if (settled) return; settled = true; resolve_(ok); };
    let socket;
    try {
      socket = net.connect({ host, port });
    } catch { finish(false); return; }
    const timer = setTimeout(() => { try { socket.destroy(); } catch {} finish(false); }, timeoutMs);
    socket.on('connect', () => { clearTimeout(timer); try { socket.destroy(); } catch {} finish(true); });
    socket.on('error', () => { clearTimeout(timer); finish(false); });
  });
}

// ---------------------------------------------------------------------------
// resolveDocker — find a working docker CLI on a possibly-minimal GUI PATH
// ---------------------------------------------------------------------------

export const DOCKER_CANDIDATES = process.platform === 'win32'
  ? ['docker.exe', 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe']
  : ['docker', '/usr/local/bin/docker', '/opt/homebrew/bin/docker', join(os.homedir(), '.docker', 'bin', 'docker'), '/Applications/Docker.app/Contents/Resources/bin/docker'];

function findOnPath(name) {
  const pathEnv = process.env.PATH || process.env.Path || '';
  for (const dir of pathEnv.split(process.platform === 'win32' ? ';' : ':').filter(Boolean)) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** @returns {{path:string|null, status:'ok'|'cli-missing'|'daemon-down'}} */
export function resolveDocker() {
  for (const candidate of DOCKER_CANDIDATES) {
    const isPathLike = candidate.includes('/') || candidate.includes('\\');
    const resolved = isPathLike ? (existsSync(candidate) ? candidate : null) : findOnPath(candidate);
    if (!resolved) continue;
    try {
      execFileSync(resolved, ['info'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 2000 });
      return { path: resolved, status: 'ok' };
    } catch {
      return { path: resolved, status: 'daemon-down' };
    }
  }
  return { path: null, status: 'cli-missing' };
}

// ---------------------------------------------------------------------------
// buildStartPlan
// ---------------------------------------------------------------------------

/**
 * @param {object} config  readGraphConfig() result
 * @param {string} root    absolute project root
 * @param {string|null} dockerPath  resolveDocker().path (local mode only)
 * @returns {string[]|{kind:'sidecar', scope:string, marker:string|null}}
 */
export function buildStartPlan(config, root, dockerPath) {
  if (config.mode === 'remote') {
    const scope = config.project_scope || config.container_prefix || 'default';
    const paths = sidecarPaths(scope);
    return { kind: 'sidecar', scope, marker: readAutostartMarker(paths.marker) };
  }
  const envFile = join(root, 'graph-infra', '.env');
  const composeFile = join(root, 'graph-infra', 'docker-compose.yml');
  const argv = [dockerPath, 'compose'];
  if (existsSync(envFile)) argv.push('--env-file', envFile);
  argv.push('-f', composeFile, 'up', '-d');
  return argv;
}

// ---------------------------------------------------------------------------
// Sidecar contract — launcher/marker paths, relaunch, and the mkdir-based lock
// ---------------------------------------------------------------------------

/** Matches install-sidecar.sh's SIDE_DIR="${NACL_HOME:-$HOME/.nacl}/sidecar". */
function defaultSidecarBase() {
  return process.env.NACL_HOME ? join(process.env.NACL_HOME, 'sidecar') : join(os.homedir(), '.nacl', 'sidecar');
}

/** @returns {{launcher:string, marker:string, lock:string}} */
export function sidecarPaths(scope, base = defaultSidecarBase()) {
  const ext = process.platform === 'win32' ? '.cmd' : '.sh';
  return {
    launcher: join(base, `${scope}${ext}`),
    marker: join(base, `${scope}.autostart`),
    lock: join(base, `${scope}.lock`),
  };
}

/** @returns {'launchd'|'schtasks'|null} */
export function readAutostartMarker(markerPath) {
  try {
    const v = readFileSync(markerPath, 'utf8').trim();
    return (v === 'launchd' || v === 'schtasks') ? v : null;
  } catch { return null; }
}

/** Best-effort relaunch per the sidecar contract; returns true if a relaunch attempt was issued. */
export function relaunchSidecar(scope, paths) {
  const marker = readAutostartMarker(paths.marker);
  try {
    if (marker === 'launchd') {
      const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
      execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/com.nacl.sidecar.${scope}`], { stdio: 'ignore', timeout: 5000 });
      return true;
    }
    if (marker === 'schtasks') {
      execFileSync('schtasks', ['/Run', '/TN', `NaCl Sidecar ${scope}`], { stdio: 'ignore', timeout: 5000 });
      return true;
    }
    const sh = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const args = process.platform === 'win32' ? ['/c', paths.launcher] : [paths.launcher];
    const child = spawn(sh, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic mkdir-based lock, self-healing on staleness. Callers pass the FULL lock dir path so
 * the same function is directly testable against a temp dir.
 * @returns {boolean} true if the lock was acquired
 */
export function tryAcquireLock(lockDirPath, { staleMs = 60000, now = Date.now() } = {}) {
  try {
    mkdirSync(lockDirPath);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') return false;
    try {
      const st = statSync(lockDirPath);
      if (now - st.mtimeMs > staleMs) {
        rmdirSync(lockDirPath);
        mkdirSync(lockDirPath);
        return true;
      }
    } catch { /* lost the race with another fixer; treat as busy */ }
    return false;
  }
}

export function releaseLock(lockDirPath) {
  try { rmdirSync(lockDirPath); } catch { /* already gone / never acquired */ }
}

// ---------------------------------------------------------------------------
// .mcp.json → connection params for the deep (Cypher) check
// ---------------------------------------------------------------------------

function readMcpConnection(root) {
  try {
    const doc = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'));
    const neo4j = doc?.mcpServers?.neo4j;
    if (!neo4j?.command) return null;
    const env = neo4j.env || {};
    return {
      command: neo4j.command,
      uri: env.NEO4J_URI,
      username: env.NEO4J_USERNAME || 'neo4j',
      password: env.NEO4J_PASSWORD || '',
      database: env.NEO4J_DATABASE || 'neo4j',
    };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// --scan-ports helper
// ---------------------------------------------------------------------------

function scanUsedPorts(dockerPath) {
  try {
    const out = execFileSync(dockerPath, ['ps', '--format', '{{.Ports}}'], { encoding: 'utf8', timeout: 5000 });
    const used = [];
    for (const line of out.split('\n')) {
      for (const m of line.matchAll(/:(\d+)->7687\/tcp/g)) used.push(m[1]);
    }
    return used;
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// CLI modes
// ---------------------------------------------------------------------------

async function runDefault() {
  const { root } = resolveProjectRoot(process.cwd());
  const cfg = readGraphConfig(root);
  if (!cfg) {
    process.stdout.write(`NACL_GRAPH_DOCTOR: status=NOT_NACL root=${root}\n`);
    return 0;
  }
  const up = await probeTcp(cfg.probe.host, cfg.probe.port);
  process.stdout.write(`NACL_GRAPH_DOCTOR: status=${up ? 'UP' : 'DOWN'} mode=${cfg.mode} port=${cfg.probe.port} root=${root}\n`);
  return 0;
}

export async function deepCheckWithRetry(checkFn, { attempts = 15, delayMs = 2000, sleep } = {}) {
  const doSleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 0; i < attempts; i++) {
    try {
      if (await checkFn()) return true;
    } catch {
      // failed attempt — retry until the bounded window is exhausted
    }
    if (i < attempts - 1) await doSleep(delayMs);
  }
  return false;
}

async function runFix() {
  const { root } = resolveProjectRoot(process.cwd());
  const cfg = readGraphConfig(root);
  if (!cfg) {
    process.stdout.write(`NACL_GRAPH_DOCTOR: status=NOT_NACL root=${root}\n`);
    return 0;
  }
  if (await probeTcp(cfg.probe.host, cfg.probe.port)) {
    process.stdout.write(`NACL_GRAPH_DOCTOR: status=UP mode=${cfg.mode} port=${cfg.probe.port} root=${root}\n`);
    return 0;
  }

  if (cfg.mode === 'local') {
    const docker = resolveDocker();
    if (docker.status !== 'ok') {
      const failedCheck = docker.status === 'cli-missing' ? 'docker-cli-missing' : 'docker-daemon-down';
      process.stdout.write(`NACL_GRAPH_FIX: status=FAILED failed_check=${failedCheck}\n`);
      return 1;
    }
    const argv = buildStartPlan(cfg, root, docker.path);
    try {
      execFileSync(argv[0], argv.slice(1), { stdio: 'ignore', timeout: 30000 });
    } catch {
      process.stdout.write(`NACL_GRAPH_FIX: status=FAILED failed_check=docker-compose-up\n`);
      return 1;
    }

    let up = false;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      up = await probeTcp(cfg.probe.host, cfg.probe.port);
      if (up) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!up) {
      process.stdout.write(`NACL_GRAPH_FIX: status=FAILED failed_check=port-timeout\n`);
      return 1;
    }

    const conn = readMcpConnection(root);
    if (conn) {
      const cypherPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'nacl-tl-core', 'scripts', 'mcp-cypher.mjs');
      // Bolt accepts TCP connections ~10ms after `compose up`, but auth is not
      // ready for another 1-2s — a single-shot check false-negatives on every
      // container restart. Retry within a bounded window instead.
      const ok = await deepCheckWithRetry(() => {
        execFileSync(process.execPath, [
          cypherPath, '--binary', conn.command, '--uri', conn.uri,
          '--user', conn.username, '--password', conn.password, '--database', conn.database,
          '--query', 'RETURN 1',
        ], { stdio: 'ignore', timeout: 15000 });
        return true;
      }, { attempts: 15, delayMs: 2000 });
      if (!ok) {
        process.stdout.write(`NACL_GRAPH_FIX: status=FAILED failed_check=cypher-deep-check\n`);
        return 1;
      }
    }
    process.stdout.write(`NACL_GRAPH_FIX: status=UP\n`);
    return 0;
  }

  // remote mode: sidecar relaunch under lock
  const scope = cfg.project_scope || cfg.container_prefix || 'default';
  const paths = sidecarPaths(scope);
  if (!tryAcquireLock(paths.lock)) {
    process.stdout.write(`NACL_GRAPH_FIX: status=FAILED failed_check=sidecar-lock-busy\n`);
    return 1;
  }
  try {
    relaunchSidecar(scope, paths);
  } finally {
    releaseLock(paths.lock);
  }
  await new Promise((r) => setTimeout(r, 2000));
  if (!(await probeTcp(cfg.probe.host, cfg.probe.port))) {
    process.stdout.write(`NACL_GRAPH_FIX: status=FAILED failed_check=sidecar-relaunch\n`);
    return 1;
  }
  process.stdout.write(`NACL_GRAPH_FIX: status=UP\n`);
  return 0;
}

async function runHook() {
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const { root, isWorktree, worktreeRoot } = resolveProjectRoot(cwd);
    const cfg = readGraphConfig(root);
    if (!cfg) return; // NOT_NACL → silent

    if (isWorktree && worktreeRoot) {
      try {
        const src = join(root, '.mcp.json');
        const dst = join(worktreeRoot, '.mcp.json');
        if (existsSync(src) && !existsSync(dst)) copyFileSync(src, dst);
      } catch { /* best-effort */ }
    }

    if (await probeTcp(cfg.probe.host, cfg.probe.port)) return; // UP → silent

    if (cfg.mode === 'remote') {
      const scope = cfg.project_scope || cfg.container_prefix || 'default';
      const paths = sidecarPaths(scope);
      if (tryAcquireLock(paths.lock)) {
        try {
          relaunchSidecar(scope, paths);
          await new Promise((r) => setTimeout(r, 2000));
        } finally {
          releaseLock(paths.lock);
        }
        if (await probeTcp(cfg.probe.host, cfg.probe.port)) return; // fixed → silent
      }
    }

    const scriptPath = fileURLToPath(import.meta.url);
    const payload = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `NaCl graph for this project is DOWN (${cfg.probe.host}:${cfg.probe.port}, mode=${cfg.mode}). Do not call mcp__neo4j__* tools yet. If the user asks for graph work, offer to run: node ${scriptPath} --fix (starts the graph; for local mode Docker Desktop must be running).`,
      },
    };
    process.stdout.write(JSON.stringify(payload) + '\n');
  } catch {
    /* the hook must never block session start or emit garbage */
  }
}

// CLI — symlink-safe main check (skills invoke via the ~/.claude/skills symlink).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--hook')) {
    const guard = setTimeout(() => process.exit(0), 5000);
    guard.unref?.();
    runHook().then(() => { clearTimeout(guard); process.exit(0); }).catch(() => { clearTimeout(guard); process.exit(0); });
  } else if (args.includes('--fix')) {
    runFix().then((code) => process.exit(code)).catch(() => process.exit(1));
  } else if (args.includes('--scan-ports')) {
    const docker = resolveDocker();
    const used = docker.status === 'ok' ? scanUsedPorts(docker.path) : [];
    process.stdout.write(`NACL_GRAPH_PORTS: used=${used.join(',')}\n`);
    process.exit(0);
  } else {
    runDefault().then((code) => process.exit(code)).catch(() => process.exit(0));
  }
}

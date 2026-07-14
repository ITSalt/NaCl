// Pins for graph-doctor.mjs. Run: node --test nacl-core/scripts/graph-doctor.test.mjs
// No docker, no network egress required — TCP probes use ephemeral local ports and the
// hook end-to-end tests stub PATH so a present/absent host `docker` never changes the result.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

import {
  resolveProjectRoot,
  readGraphConfig,
  parseGraphConfig,
  probeTcp,
  resolveDocker,
  DOCKER_CANDIDATES,
  buildStartPlan,
  tryAcquireLock,
  releaseLock,
} from './graph-doctor.mjs';

const GRAPH_DOCTOR = join(new URL('.', import.meta.url).pathname, 'graph-doctor.mjs');

function tmpDir(prefix = 'graph-doctor-') {
  // realpath: on macOS /tmp is a symlink into /private/tmp and git resolves paths, so
  // comparisons against resolveProjectRoot()'s output must use the same canonical form.
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// ---------------------------------------------------------------------------
// resolveProjectRoot
// ---------------------------------------------------------------------------

test('resolveProjectRoot: plain (non-worktree) git repo', () => {
  const dir = tmpDir();
  try {
    git(['init', '-q'], dir);
    git(['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], dir);
    const sub = join(dir, 'sub');
    mkdirSync(sub);
    const r = resolveProjectRoot(sub);
    assert.equal(r.root, dir);
    assert.equal(r.isWorktree, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveProjectRoot: linked worktree', () => {
  const base = tmpDir();
  const mainRepo = join(base, 'main');
  const wt = join(base, 'wt1');
  try {
    mkdirSync(mainRepo);
    git(['init', '-q'], mainRepo);
    git(['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], mainRepo);
    git(['branch', 'wt1'], mainRepo);
    git(['worktree', 'add', wt, 'wt1', '-q'], mainRepo);

    const r = resolveProjectRoot(wt);
    assert.equal(r.isWorktree, true);
    assert.equal(r.root, mainRepo);
    assert.equal(r.worktreeRoot, wt);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('resolveProjectRoot: subdirectory of a linked worktree', () => {
  const base = tmpDir();
  const mainRepo = join(base, 'main');
  const wt = join(base, 'wt1');
  try {
    mkdirSync(mainRepo);
    git(['init', '-q'], mainRepo);
    git(['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], mainRepo);
    git(['branch', 'wt1'], mainRepo);
    git(['worktree', 'add', wt, 'wt1', '-q'], mainRepo);
    const sub = join(wt, 'sub');
    mkdirSync(sub);

    const r = resolveProjectRoot(sub);
    assert.equal(r.isWorktree, true);
    assert.equal(r.root, mainRepo);
    assert.equal(r.worktreeRoot, wt);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('resolveProjectRoot: non-git directory falls back to cwd, never throws', () => {
  const dir = tmpDir();
  try {
    const r = resolveProjectRoot(dir);
    assert.equal(r.root, dir);
    assert.equal(r.isWorktree, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// readGraphConfig / parseGraphConfig
// ---------------------------------------------------------------------------

test('parseGraphConfig: local mode defaults', () => {
  const yaml = ['graph:', '  mode: "local"', '  neo4j_bolt_port: 3587'].join('\n');
  const cfg = parseGraphConfig(yaml);
  assert.equal(cfg.mode, 'local');
  assert.equal(cfg.neo4j_bolt_port, 3587);
  assert.deepEqual(cfg.probe, { host: 'localhost', port: 3587 });
});

test('parseGraphConfig: absent neo4j_bolt_port defaults to 3587', () => {
  const yaml = ['graph:', '  mode: local'].join('\n');
  const cfg = parseGraphConfig(yaml);
  assert.equal(cfg.neo4j_bolt_port, 3587);
  assert.equal(cfg.probe.port, 3587);
});

test('parseGraphConfig: remote mode with neo4j_uri drives the probe target', () => {
  const yaml = [
    'graph:', '  mode: "remote"', '  neo4j_uri: "bolt://localhost:3700"',
    '  project_scope: "acme"', '  remote:', '    host: "graph.example.com"',
    '    gateway_port: 7687', '    sidecar_port: 3700',
  ].join('\n');
  const cfg = parseGraphConfig(yaml);
  assert.equal(cfg.mode, 'remote');
  assert.equal(cfg.project_scope, 'acme');
  assert.equal(cfg.remote.host, 'graph.example.com');
  assert.equal(cfg.remote.gateway_port, 7687);
  assert.equal(cfg.remote.sidecar_port, 3700);
  assert.deepEqual(cfg.probe, { host: 'localhost', port: 3700 });
});

test('parseGraphConfig: remote mode without neo4j_uri falls back to remote.sidecar_port', () => {
  const yaml = ['graph:', '  mode: "remote"', '  remote:', '    sidecar_port: 3711'].join('\n');
  const cfg = parseGraphConfig(yaml);
  assert.equal(cfg.probe.host, 'localhost');
  assert.equal(cfg.probe.port, 3711);
});

test('parseGraphConfig: no graph: top-level section => null', () => {
  assert.equal(parseGraphConfig('project:\n  name: x\n'), null);
});

test('parseGraphConfig: garbage/empty input => null', () => {
  assert.equal(parseGraphConfig(''), null);
  assert.equal(parseGraphConfig(null), null);
  assert.equal(parseGraphConfig(undefined), null);
});

test('readGraphConfig: missing config.yaml => null', () => {
  const dir = tmpDir();
  try {
    assert.equal(readGraphConfig(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readGraphConfig: reads graph: block from a real file', () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, 'config.yaml'), 'graph:\n  mode: "local"\n  neo4j_bolt_port: 3600\n');
    const cfg = readGraphConfig(dir);
    assert.equal(cfg.mode, 'local');
    assert.equal(cfg.neo4j_bolt_port, 3600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// probeTcp
// ---------------------------------------------------------------------------

test('probeTcp: resolves true against a live listener', async () => {
  const server = net.createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  try {
    assert.equal(await probeTcp('127.0.0.1', port), true);
  } finally {
    server.close();
  }
});

test('probeTcp: resolves false against a closed port (never rejects)', async () => {
  // bind, read the port, then close it so nothing is listening there.
  const server = net.createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  await new Promise((res) => server.close(res));
  assert.equal(await probeTcp('127.0.0.1', port, 300), false);
});

// ---------------------------------------------------------------------------
// resolveDocker
// ---------------------------------------------------------------------------

test('resolveDocker: candidate list is exported and platform-shaped', () => {
  assert.ok(Array.isArray(DOCKER_CANDIDATES));
  assert.ok(DOCKER_CANDIDATES.length > 0);
  const barePattern = process.platform === 'win32' ? 'docker.exe' : 'docker';
  assert.equal(DOCKER_CANDIDATES[0], barePattern);
});

test('resolveDocker: cli-missing when PATH has no docker and no absolute candidate exists', () => {
  const savedPath = process.env.PATH;
  const emptyDir = tmpDir('empty-path-');
  try {
    process.env.PATH = emptyDir;
    const r = resolveDocker();
    // On a CI/dev box without docker installed at the absolute fallback paths, this is cli-missing.
    // If docker DOES happen to live at one of the absolute fallbacks, status is ok/daemon-down —
    // either way resolveDocker must not throw and must return a well-shaped result.
    assert.ok(['ok', 'cli-missing', 'daemon-down'].includes(r.status));
  } finally {
    process.env.PATH = savedPath;
    rmSync(emptyDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// buildStartPlan
// ---------------------------------------------------------------------------

test('buildStartPlan: local mode, no .env => omits --env-file, uses absolute paths', () => {
  const dir = tmpDir();
  try {
    const cfg = { mode: 'local' };
    const argv = buildStartPlan(cfg, dir, '/usr/local/bin/docker');
    assert.deepEqual(argv, [
      '/usr/local/bin/docker', 'compose',
      '-f', join(dir, 'graph-infra', 'docker-compose.yml'),
      'up', '-d',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildStartPlan: local mode with .env present => includes --env-file', () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'graph-infra'), { recursive: true });
    writeFileSync(join(dir, 'graph-infra', '.env'), 'NEO4J_PASSWORD={fixture}\n');
    const cfg = { mode: 'local' };
    const argv = buildStartPlan(cfg, dir, '/usr/local/bin/docker');
    assert.deepEqual(argv, [
      '/usr/local/bin/docker', 'compose',
      '--env-file', join(dir, 'graph-infra', '.env'),
      '-f', join(dir, 'graph-infra', 'docker-compose.yml'),
      'up', '-d',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildStartPlan: remote mode returns a sidecar relaunch descriptor', () => {
  const cfg = { mode: 'remote', project_scope: 'acme-project' };
  const plan = buildStartPlan(cfg, '/whatever', null);
  assert.equal(plan.kind, 'sidecar');
  assert.equal(plan.scope, 'acme-project');
  assert.ok(plan.marker === null || plan.marker === 'launchd' || plan.marker === 'schtasks');
});

// ---------------------------------------------------------------------------
// tryAcquireLock / releaseLock
// ---------------------------------------------------------------------------

test('tryAcquireLock: fresh lock succeeds, second attempt is skipped while fresh', () => {
  const dir = tmpDir();
  const lockDir = join(dir, 'scope.lock');
  try {
    assert.equal(tryAcquireLock(lockDir), true);
    assert.ok(existsSync(lockDir));
    assert.equal(tryAcquireLock(lockDir), false); // still fresh -> someone else is fixing
  } finally {
    releaseLock(lockDir);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tryAcquireLock: stale lock (>60s) is retaken', () => {
  const dir = tmpDir();
  const lockDir = join(dir, 'scope.lock');
  try {
    assert.equal(tryAcquireLock(lockDir), true);
    const staleNow = statSync(lockDir).mtimeMs + 61000;
    assert.equal(tryAcquireLock(lockDir, { now: staleNow }), true);
    assert.ok(existsSync(lockDir));
  } finally {
    releaseLock(lockDir);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('releaseLock: removes the lock dir, tolerates a missing one', () => {
  const dir = tmpDir();
  const lockDir = join(dir, 'scope.lock');
  try {
    tryAcquireLock(lockDir);
    releaseLock(lockDir);
    assert.equal(existsSync(lockDir), false);
    assert.doesNotThrow(() => releaseLock(lockDir)); // idempotent
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// default CLI mode
// ---------------------------------------------------------------------------

test('default mode: NOT_NACL line format for a dir with no config.yaml', () => {
  const dir = tmpDir();
  try {
    const out = execFileSync('node', [GRAPH_DOCTOR], { cwd: dir, encoding: 'utf8' });
    assert.match(out, /^NACL_GRAPH_DOCTOR: status=NOT_NACL root=.+\n$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('default mode: DOWN line format for a NaCl dir with a dead port', () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, 'config.yaml'), 'graph:\n  mode: "local"\n  neo4j_bolt_port: 39999\n');
    const out = execFileSync('node', [GRAPH_DOCTOR], { cwd: dir, encoding: 'utf8' });
    assert.match(out, /^NACL_GRAPH_DOCTOR: status=DOWN mode=local port=39999 root=.+\n$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('default mode: UP line format when the probe port is live', async () => {
  const dir = tmpDir();
  const server = net.createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  try {
    writeFileSync(join(dir, 'config.yaml'), `graph:\n  mode: "local"\n  neo4j_bolt_port: ${port}\n`);
    const out = execFileSync('node', [GRAPH_DOCTOR], { cwd: dir, encoding: 'utf8' });
    assert.match(out, new RegExp(`^NACL_GRAPH_DOCTOR: status=UP mode=local port=${port} root=.+\\n$`));
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// --hook end-to-end
// ---------------------------------------------------------------------------

function runHookChild(cwd, extraEnv = {}) {
  const emptyPath = tmpDir('empty-path-');
  try {
    const out = execFileSync(process.execPath, [GRAPH_DOCTOR, '--hook'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, PATH: emptyPath, CLAUDE_PROJECT_DIR: cwd, ...extraEnv },
    });
    return out;
  } finally {
    rmSync(emptyPath, { recursive: true, force: true });
  }
}

test('--hook: NOT_NACL dir produces empty stdout, exit 0', () => {
  const dir = tmpDir();
  try {
    const out = runHookChild(dir);
    assert.equal(out, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--hook: NaCl dir with a dead port emits SessionStart JSON mentioning the port', () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, 'config.yaml'), 'graph:\n  mode: "local"\n  neo4j_bolt_port: 39998\n');
    const out = runHookChild(dir);
    assert.ok(out.trim().length > 0, 'expected hook JSON on stdout when the graph is DOWN');
    const payload = JSON.parse(out.trim());
    assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(payload.hookSpecificOutput.additionalContext, /39998/);
    assert.match(payload.hookSpecificOutput.additionalContext, /--fix/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--hook: NaCl dir with a live port is silent (exit 0, no stdout)', async () => {
  const dir = tmpDir();
  const server = net.createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  try {
    writeFileSync(join(dir, 'config.yaml'), `graph:\n  mode: "local"\n  neo4j_bolt_port: ${port}\n`);
    const out = runHookChild(dir);
    assert.equal(out, '');
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// deepCheckWithRetry (--fix: cypher-deep-check must retry with short backoff
// instead of a single-shot check — Bolt auth on real machines becomes ready
// ~1-2s after the TCP port opens, so a one-shot RETURN 1 is a false negative)
//
// Expected seam (not yet implemented on current graph-doctor.mjs):
//   export async function deepCheckWithRetry(checkFn, { attempts = 15, delayMs = 2000, sleep } = {})
//     - calls `await checkFn()` up to `attempts` times
//     - checkFn may throw or resolve false/true; both are treated as "failed" unless truthy
//     - on first truthy result, resolves `true` immediately (no further calls, no extra sleep)
//     - between attempts (never after the last one), awaits `sleep(delayMs)` (injectable, defaults
//       to a real timer) so tests can run with delayMs=1 and finish in milliseconds
//     - if every attempt fails, resolves `false` after exactly `attempts` invocations — bounded,
//       never unbounded retries
// ---------------------------------------------------------------------------

test('deepCheckWithRetry: is exported by graph-doctor.mjs', async () => {
  const mod = await import('./graph-doctor.mjs');
  assert.equal(typeof mod.deepCheckWithRetry, 'function',
    'graph-doctor.mjs must export deepCheckWithRetry(checkFn, opts) so the --fix cypher deep-check ' +
    'can retry with backoff instead of failing on a single Bolt-not-ready-yet attempt');
});

test('deepCheckWithRetry: check that fails N times then succeeds resolves true with >= N+1 invocations', async () => {
  const { deepCheckWithRetry } = await import('./graph-doctor.mjs');
  let calls = 0;
  const flakyCheck = async () => {
    calls += 1;
    if (calls <= 3) throw new Error('bolt auth not ready yet');
    return true;
  };
  const result = await deepCheckWithRetry(flakyCheck, { attempts: 10, delayMs: 1, sleep: async () => {} });
  assert.equal(result, true, 'a check that eventually succeeds must make the overall deep-check succeed');
  assert.ok(calls >= 4, `expected >= 4 invocations (3 failures + 1 success), got ${calls}`);
});

test('deepCheckWithRetry: check that always fails resolves false after a bounded number of attempts', async () => {
  const { deepCheckWithRetry } = await import('./graph-doctor.mjs');
  let calls = 0;
  const alwaysFailingCheck = async () => {
    calls += 1;
    throw new Error('bolt still down');
  };
  const result = await deepCheckWithRetry(alwaysFailingCheck, { attempts: 5, delayMs: 1, sleep: async () => {} });
  assert.equal(result, false, 'a check that never succeeds must make the overall deep-check fail (not hang or throw)');
  assert.equal(calls, 5, `expected exactly 5 invocations (bounded retries, not unbounded), got ${calls}`);
});

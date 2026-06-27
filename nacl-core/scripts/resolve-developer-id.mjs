// Deterministic resolver of NACL_DEVELOPER_ID — the identity stamped on remote-mode claim-locks
// (claimed_by) and provenance (updated_by). Pinned by resolve-developer-id.test.mjs.
//
// Why this exists: the claim-lock keys ONLY on this id. If two machines of the SAME human resolve
// to the SAME id, the lock treats them as one worker and they collide on tasks (claimed_by = $dev
// is re-claimable). So the auto-derived default combines WHO (git email / user) with a stable
// PER-MACHINE key, giving one human on two machines two distinct ids automatically — no manual
// config, while claimed_by stays human-readable.
//
// Precedence (highest first):
//   1. $NACL_DEVELOPER_ID env        — explicit override (e.g. a CI runner or a deliberate alias)
//   2. config.yaml `developer.id`    — committed/per-clone override
//   3. <git user.email | $USER | dev>/<machine-key>   — auto, stable per machine
//
// machine-key = first 8 hex of sha256(stable machine id): IOPlatformUUID (macOS) /
// /etc/machine-id (Linux) / os.hostname() fallback. Stable across reboots, distinct per machine.
//
// Usage:
//   resolve-developer-id.mjs [--project-root <dir>] [--verbose]
//   → prints the resolved id on stdout (one line); --verbose explains the source on stderr.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';

/**
 * Extract `developer.id` from raw config.yaml text without a YAML dependency. Scans ONLY the
 * `developer:` block so an unrelated `id:` (project.id, board ids, …) never leaks in.
 * @param {string} yamlText
 * @returns {string|null}
 */
export function parseDeveloperId(yamlText) {
  if (typeof yamlText !== 'string') return null;
  const lines = yamlText.split(/\r?\n/);
  let inDev = false;
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;                       // skip comments
    if (/^developer:\s*(#.*)?$/.test(line)) { inDev = true; continue; }
    if (inDev) {
      if (line.trim() !== '' && !/^\s/.test(line)) break;   // a non-indented line ends the block
      const m = line.match(/^\s+id:\s*["']?([^"'#\s][^"'#]*?)["']?\s*(#.*)?$/);
      if (m) return m[1].trim();
    }
  }
  return null;
}

/** Short, stable key for a machine-identifying string. */
export function machineKey(machineRaw) {
  return createHash('sha256').update(String(machineRaw || 'unknown')).digest('hex').slice(0, 8);
}

/**
 * Pure precedence + format. All sources injected so the decision is testable without touching
 * the environment, git, or platform.
 * @param {{envId?:string, configId?:string, gitEmail?:string, user?:string, machineRaw?:string}} i
 * @returns {string}
 */
export function deriveDeveloperId({ envId, configId, gitEmail, user, machineRaw } = {}) {
  if (envId && String(envId).trim()) return String(envId).trim();
  if (configId && String(configId).trim()) return String(configId).trim();
  const identity = (gitEmail && String(gitEmail).trim()) || (user && String(user).trim()) || 'dev';
  return `${identity}/${machineKey(machineRaw)}`;
}

// --- real-source gatherers (CLI only) ---------------------------------------
function readGitEmail() {
  try {
    return execFileSync('git', ['config', 'user.email'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

function readMachineRaw() {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    } else if (process.platform === 'linux') {
      for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        try { const v = readFileSync(p, 'utf8').trim(); if (v) return v; } catch { /* next */ }
      }
    }
  } catch { /* fall through */ }
  return os.hostname();
}

// CLI — symlink-safe main check (skills invoke via the ~/.claude/skills symlink).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let projectRoot = process.cwd();
  let verbose = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root') projectRoot = args[++i];
    else if (args[i].startsWith('--project-root=')) projectRoot = args[i].slice('--project-root='.length);
    else if (args[i] === '--verbose') verbose = true;
  }

  const envId = process.env.NACL_DEVELOPER_ID || '';
  let configId = null;
  try { configId = parseDeveloperId(readFileSync(`${projectRoot}/config.yaml`, 'utf8')); } catch { /* no config */ }
  const gitEmail = readGitEmail();
  const user = process.env.USER || process.env.USERNAME || '';
  const machineRaw = readMachineRaw();

  const id = deriveDeveloperId({ envId, configId, gitEmail, user, machineRaw });
  if (verbose) {
    const src = (envId && envId.trim()) ? 'env NACL_DEVELOPER_ID'
      : (configId && configId.trim()) ? 'config.yaml developer.id'
      : `auto <${gitEmail || user || 'dev'}>/<machine-key>`;
    process.stderr.write(`[resolve-developer-id] source=${src}\n`);
  }
  process.stdout.write(id + '\n');
}

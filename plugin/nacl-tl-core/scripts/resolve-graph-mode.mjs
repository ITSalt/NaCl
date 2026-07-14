// Deterministic resolver of the nacl-init graph path: local | create | connect.
//
// Why this exists: multi-user shared-graph support adds two new init paths
// (`--scale=create` to provision a shared VPS graph the first time, `--scale=connect`
// to JOIN an already-provisioned one) alongside today's local Docker flow. The routing
// rule — explicit flag wins, else a committed `graph.mode: remote` in config.yaml means
// "auto-join" (connect), else local — is exactly the kind of branch that must NOT live as
// prose in SKILL.md: a joiner who falls through to the local path would spin up Docker and
// seed an empty graph. This module is the single authority for that decision, pinned by
// resolve-graph-mode.test.mjs. nacl-init stays an orchestrator: it calls this, reads the
// `NACL_GRAPH_MODE:` line, and dispatches to setup-graph / create-remote / connect-remote.
//
//   resolve-graph-mode.mjs --project-root <dir> [--scale create|connect]
//   → prints:  NACL_GRAPH_MODE: mode=<local|create|connect> reason="<why>"

import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const MODES = ['local', 'create', 'connect'];

/**
 * Pure routing decision. No file I/O — the CLI extracts the two scalars and calls this.
 * @param {{scaleFlag: ('create'|'connect'|null|undefined), configMode: ('local'|'remote'|null|undefined)}} input
 * @returns {{mode: 'local'|'create'|'connect', reason: string}}
 */
export function resolveGraphMode({ scaleFlag, configMode } = {}) {
  if (scaleFlag != null && scaleFlag !== 'create' && scaleFlag !== 'connect') {
    throw new Error(`--scale must be "create" or "connect", got "${scaleFlag}"`);
  }
  if (configMode != null && configMode !== 'local' && configMode !== 'remote') {
    throw new Error(`graph.mode must be "local" or "remote", got "${configMode}"`);
  }

  // 1. An explicit flag is the operator's stated intent — it always wins.
  if (scaleFlag === 'create') {
    return { mode: 'create', reason: 'explicit --scale=create' };
  }
  if (scaleFlag === 'connect') {
    return { mode: 'connect', reason: 'explicit --scale=connect' };
  }

  // 2. No flag: a committed `graph.mode: remote` is the joiner signal → auto-connect.
  //    This is what stops a teammate who cloned the repo from falling into the local
  //    path (which would `docker compose up` and seed an empty graph). The connect tool
  //    is itself idempotent, so re-running on an already-connected project is a safe no-op.
  if (configMode === 'remote') {
    return { mode: 'connect', reason: 'config graph.mode=remote → auto-join (no local docker, no seed)' };
  }

  // 3. Default: today's local Docker flow. Absent graph.mode is treated as local (BC).
  return { mode: 'local', reason: 'default local (no --scale flag, no remote config)' };
}

/**
 * Extracts `graph.mode` from raw config.yaml text without a YAML dependency.
 * Scans ONLY the `graph:` block so an unrelated `mode:` (reports.mode, deploy.*, etc.)
 * never leaks in. Returns the literal string, or null if absent (caller treats as local).
 * @param {string} yamlText
 * @returns {('local'|'remote'|string|null)}
 */
export function parseGraphMode(yamlText) {
  if (typeof yamlText !== 'string') return null;
  const lines = yamlText.split(/\r?\n/);
  let inGraph = false;
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;           // skip comments
    if (/^graph:\s*(#.*)?$/.test(line)) { inGraph = true; continue; }
    if (inGraph) {
      // A non-indented, non-empty line ends the graph block.
      if (line.trim() !== '' && !/^\s/.test(line)) break;
      const m = line.match(/^\s+mode:\s*["']?([A-Za-z0-9_-]+)["']?\s*(#.*)?$/);
      if (m) return m[1];
    }
  }
  return null;
}

// CLI — symlink-safe main check (skills invoke via the ~/.claude/skills symlink).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let projectRoot = process.cwd();
  let scaleFlag = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root') projectRoot = args[++i];
    else if (args[i] === '--scale') scaleFlag = args[++i];
    else if (args[i].startsWith('--scale=')) scaleFlag = args[i].slice('--scale='.length);
    else if (args[i].startsWith('--project-root=')) projectRoot = args[i].slice('--project-root='.length);
  }
  if (scaleFlag === '') scaleFlag = null;

  let configMode = null;
  try {
    configMode = parseGraphMode(readFileSync(join(projectRoot, 'config.yaml'), 'utf-8'));
  } catch {
    // No config.yaml (brand-new project) → treat as local default.
  }

  try {
    const { mode, reason } = resolveGraphMode({ scaleFlag, configMode });
    process.stdout.write(`NACL_GRAPH_MODE: mode=${mode} reason="${reason}"\n`);
  } catch (e) {
    process.stderr.write(`resolve-graph-mode error: ${e.message}\n`);
    process.exit(1);
  }
}

export { MODES };

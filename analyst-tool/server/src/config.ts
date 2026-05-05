/**
 * ConfigManager — hot-reloadable configuration for the Analyst Tool server.
 *
 * Resolution order (highest priority first):
 *  1. NACL_BOARDS_DIR env  → boardsDir (backward compat for existing tests)
 *  2. NACL_PROJECT_ROOT env → repoRoot (and derive projectId from basename)
 *  3. Active project in registry (source: 'registry')
 *  4. Cwd walk-up looking for graph-infra/ (source: 'cwd')
 *  5. Fallback: process.cwd() itself
 */
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import {
  getActiveProject,
  ensureRegistry,
} from './services/project-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolvedConfig = {
  port: number;
  host: string;
  boardsDir: string;
  repoRoot: string;
  projectId: string;
  source: 'registry' | 'cwd' | 'env';
};

// ---------------------------------------------------------------------------
// Helpers (pure functions — no I/O)
// ---------------------------------------------------------------------------

/** Walk up from startDir looking for a directory that contains graph-infra/. */
function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'graph-infra'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

/** Sanitise a raw string to match pinch's /^[a-z0-9_-]{1,64}$/ invariant. */
function sanitiseProjectId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 64);
}

// ---------------------------------------------------------------------------
// Resolution logic (async — may read from registry)
// ---------------------------------------------------------------------------

async function resolveConfig(): Promise<ResolvedConfig> {
  const port = process.env['NACL_PORT'] ? parseInt(process.env['NACL_PORT'], 10) : 3583;
  const host = '127.0.0.1';

  // Priority 2: NACL_PROJECT_ROOT env
  const envRoot = process.env['NACL_PROJECT_ROOT'];

  // Priority 3: active project from registry
  let registryProject: Awaited<ReturnType<typeof getActiveProject>> = null;
  try {
    registryProject = await getActiveProject();
  } catch {
    // Registry may not exist yet on first boot — that's fine
  }

  // Determine repoRoot and projectId (without boardsDir yet)
  let repoRoot: string;
  let projectId: string;
  let source: ResolvedConfig['source'];

  if (envRoot) {
    repoRoot = envRoot;
    const rawId = process.env['NACL_PROJECT_ID'] ?? basename(envRoot);
    projectId = sanitiseProjectId(rawId);
    source = 'env';
  } else if (registryProject) {
    repoRoot = registryProject.root;
    projectId = registryProject.id;
    source = 'registry';
  } else {
    repoRoot = findRepoRoot(process.cwd());
    const rawId = process.env['NACL_PROJECT_ID'] ?? basename(repoRoot);
    projectId = sanitiseProjectId(rawId);
    source = 'cwd';
  }

  // Priority 1: NACL_BOARDS_DIR env wins for boardsDir (backward compat)
  const boardsDir = process.env['NACL_BOARDS_DIR'] ?? join(repoRoot, 'graph-infra', 'boards');

  return { port, host, boardsDir, repoRoot, projectId, source };
}

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

class ConfigManager extends EventEmitter {
  private _current: ResolvedConfig | null = null;

  /** Subscribe to config change events. */
  onConfigChange(listener: (next: ResolvedConfig, prev: ResolvedConfig) => void): this {
    return super.on('change', listener as (...args: unknown[]) => void);
  }

  /** Returns the current snapshot synchronously. Throws if not yet loaded. */
  current(): ResolvedConfig {
    if (!this._current) {
      throw new Error('ConfigManager not yet loaded — call reload() first');
    }
    return this._current;
  }

  /**
   * Re-reads registry + env and returns the new config.
   * Emits 'change' if anything changed since last reload.
   */
  async reload(): Promise<ResolvedConfig> {
    const prev = this._current;
    const next = await resolveConfig();
    this._current = next;
    if (prev && !configsEqual(prev, next)) {
      this.emit('change', next, prev);
    }
    return next;
  }
}

function configsEqual(a: ResolvedConfig, b: ResolvedConfig): boolean {
  return (
    a.boardsDir === b.boardsDir &&
    a.repoRoot === b.repoRoot &&
    a.projectId === b.projectId &&
    a.source === b.source
  );
}

// ---------------------------------------------------------------------------
// Singleton + backward-compat getter
// ---------------------------------------------------------------------------

export const configManager = new ConfigManager();

/**
 * Synchronous getter. Returns the current config snapshot.
 *
 * On first call (before reload()) we build a synchronous fallback using only
 * env variables and the cwd walk-up — no registry access. This keeps backward
 * compatibility with tests that import config without awaiting.
 */
export function getConfig(): ResolvedConfig {
  if (configManager['_current']) {
    return configManager.current();
  }

  // Synchronous fallback (no registry read possible here)
  const port = process.env['NACL_PORT'] ? parseInt(process.env['NACL_PORT'], 10) : 3583;
  const host = '127.0.0.1';

  const envRoot = process.env['NACL_PROJECT_ROOT'];
  let repoRoot: string;
  let projectId: string;
  let source: ResolvedConfig['source'];

  if (envRoot) {
    repoRoot = envRoot;
    const rawId = process.env['NACL_PROJECT_ID'] ?? basename(envRoot);
    projectId = sanitiseProjectId(rawId);
    source = 'env';
  } else {
    repoRoot = findRepoRoot(process.cwd());
    const rawId = process.env['NACL_PROJECT_ID'] ?? basename(repoRoot);
    projectId = sanitiseProjectId(rawId);
    source = 'cwd';
  }

  const boardsDir = process.env['NACL_BOARDS_DIR'] ?? join(repoRoot, 'graph-infra', 'boards');

  const cfg: ResolvedConfig = { port, host, boardsDir, repoRoot, projectId, source };
  // Cache so repeat calls return the same object
  configManager['_current'] = cfg;
  return cfg;
}

// ---------------------------------------------------------------------------
// Backward-compat: export a `config` constant for legacy imports.
// NOTE: this is a live proxy — mutations are not supported. Consumers should
// migrate to getConfig() for hot-reload awareness.
// ---------------------------------------------------------------------------

/** @deprecated Use getConfig() instead */
export const config: ResolvedConfig = new Proxy({} as ResolvedConfig, {
  get(_target, prop) {
    return getConfig()[prop as keyof ResolvedConfig];
  },
});

// Eagerly prime the sync cache so the proxy is usable immediately
// (this runs at module-load time, same as the old frozen config object)
getConfig();

export { ensureRegistry };

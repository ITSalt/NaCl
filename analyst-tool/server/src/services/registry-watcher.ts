/**
 * registry-watcher — watches ~/.nacl/projects.json for external edits.
 *
 * When nacl-init (Wave 6.E) or any other external process writes to the
 * registry, this watcher picks up the change, reloads the config, and
 * broadcasts a `projects.changed` event on the `projects` WS channel.
 *
 * awaitWriteFinish is set to guard against in-progress writes from the
 * registry's own saveRegistry() (atomic tmp+rename). Because saveRegistry()
 * uses a rename (not a direct write), the watcher sees a single `change`
 * event after the rename completes — awaitWriteFinish provides an extra
 * stability buffer for editors that use direct overwrites.
 */
import chokidar, { type FSWatcher } from 'chokidar';
import { configManager } from '../config.js';
import { getRegistryPath } from './project-registry.js';

// ---------------------------------------------------------------------------
// Broadcaster type — injected for testability
// ---------------------------------------------------------------------------

export type Broadcaster = (channel: string, payload: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Watcher state
// ---------------------------------------------------------------------------

let _watcher: FSWatcher | null = null;
let _broadcaster: Broadcaster | null = null;
let _readyPromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Internal handler
// ---------------------------------------------------------------------------

async function handleChange(): Promise<void> {
  try {
    await configManager.reload();
  } catch {
    // registry may be mid-write; next event will re-trigger
  }

  if (_broadcaster) {
    try {
      const { loadRegistry } = await import('./project-registry.js');
      const reg = await loadRegistry();
      _broadcaster('projects', {
        type: 'projects.changed',
        projects: reg.projects,
        activeProjectId: reg.activeProjectId,
      });
    } catch {
      // best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start watching the registry file for external edits.
 * `broadcaster` is injected so tests can pass a fake.
 * Idempotent — calling start() twice replaces the previous watcher.
 */
export function start(broadcaster: Broadcaster): void {
  if (_watcher) {
    void _watcher.close();
    _watcher = null;
  }

  _broadcaster = broadcaster;
  const registryPath = getRegistryPath();

  _watcher = chokidar.watch(registryPath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  _watcher.on('add', () => void handleChange());
  _watcher.on('change', () => void handleChange());
  _watcher.on('unlink', () => void handleChange());

  _readyPromise = new Promise<void>((resolve) => {
    _watcher!.once('ready', () => resolve());
  });
}

/** Resolves when the watcher has finished its initial scan. */
export function whenReady(): Promise<void> {
  return _readyPromise ?? Promise.resolve();
}

/**
 * Stop the registry watcher. Safe to call even if not started.
 */
export async function stop(): Promise<void> {
  if (_watcher) {
    await _watcher.close();
    _watcher = null;
  }
  _broadcaster = null;
  _readyPromise = null;
}

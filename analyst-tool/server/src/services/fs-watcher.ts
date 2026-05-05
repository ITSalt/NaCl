import chokidar from 'chokidar';
import { basename, join } from 'node:path';
import { parseSnapshotFilename } from './snapshots.js';

export type BoardChangeType = 'add' | 'change' | 'unlink';

export type BoardsChangeEvent = {
  type: BoardChangeType;
  boardName: string;
  mtime?: string;
};

export type SnapshotCreatedEvent = {
  boardName: string;
  timestamp: string;
};

export type StopFn = () => Promise<void>;

// ---------------------------------------------------------------------------
// Watcher handle
// ---------------------------------------------------------------------------

/**
 * A restartable watcher handle.
 * `restart(newBoardsDir)` closes the old watchers and starts fresh ones.
 * Pending events from the old generation are silently dropped via a
 * generation counter so they never leak into the new instance.
 */
export interface WatcherHandle {
  restart(newBoardsDir: string): Promise<void>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal watcher factory
// ---------------------------------------------------------------------------

function createWatchers(
  boardsDir: string,
  generation: number,
  currentGen: () => number,
  onEvent: (event: BoardsChangeEvent) => void,
  onSnapshot?: (event: SnapshotCreatedEvent) => void,
): { stop: () => Promise<void> } {
  const boardWatcher = chokidar.watch(boardsDir, {
    depth: 0,
    ignored: (filePath: string) => {
      const rel = filePath.slice(boardsDir.length).replace(/^[\\/]/, '');
      if (rel.startsWith('.snapshots')) return true;
      return false;
    },
    ignoreInitial: false,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  function handleBoardEvent(type: BoardChangeType) {
    return (filePath: string, stats?: { mtime?: Date }) => {
      // Ignore events from stale generation
      if (currentGen() !== generation) return;
      if (!filePath.endsWith('.excalidraw')) return;
      const boardName = basename(filePath, '.excalidraw');
      const mtime = stats?.mtime ? stats.mtime.toISOString() : new Date().toISOString();
      onEvent({ type, boardName, mtime });
    };
  }

  boardWatcher.on('add', handleBoardEvent('add'));
  boardWatcher.on('change', handleBoardEvent('change'));
  boardWatcher.on('unlink', handleBoardEvent('unlink'));

  const snapshotsSubdir = join(boardsDir, '.snapshots');
  const snapshotWatcher = chokidar.watch(snapshotsSubdir, {
    depth: 0,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  snapshotWatcher.on('add', (filePath: string) => {
    if (currentGen() !== generation) return;
    if (!onSnapshot) return;
    const filename = basename(filePath);
    const parsed = parseSnapshotFilename(filename);
    if (!parsed) return;
    onSnapshot({ boardName: parsed.board, timestamp: parsed.timestamp });
  });

  return {
    stop: async () => {
      await boardWatcher.close();
      await snapshotWatcher.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the file watcher.
 *
 * Returns a `StopFn` for backward compatibility AND a `WatcherHandle` with
 * a `restart(newBoardsDir)` method for Wave 6.A hot-reload support.
 *
 * The returned stop function and handle.stop() are equivalent.
 */
export function start(
  boardsDir: string,
  onEvent: (event: BoardsChangeEvent) => void,
  onSnapshot?: (event: SnapshotCreatedEvent) => void,
): StopFn & { handle: WatcherHandle } {
  let generation = 0;
  let inner = createWatchers(boardsDir, generation, () => generation, onEvent, onSnapshot);

  const handle: WatcherHandle = {
    async restart(newBoardsDir: string): Promise<void> {
      await inner.stop();
      generation++;
      inner = createWatchers(newBoardsDir, generation, () => generation, onEvent, onSnapshot);
    },
    async stop(): Promise<void> {
      await inner.stop();
    },
  };

  const stopFn = async () => {
    await handle.stop();
  };

  // Attach the handle so callers can access restart()
  (stopFn as StopFn & { handle: WatcherHandle }).handle = handle;

  return stopFn as StopFn & { handle: WatcherHandle };
}

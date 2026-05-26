import { useEffect, useState } from 'react';
import { useStore } from './state/store.js';
import type { Run, BatchStatus } from './state/store.js';
import Sidebar from './components/Sidebar.js';
import CanvasHost from './components/CanvasHost.js';
import StatusBar from './components/StatusBar.js';
import RunPanel from './components/RunPanel.js';
import SnapshotBrowser from './components/SnapshotBrowser.js';
import ProjectPicker from './components/ProjectPicker.js';
import UnregisteredBanner from './components/UnregisteredBanner.js';
import EmptyProjectsPlaceholder from './components/EmptyProjectsPlaceholder.js';
import { subscribe, unsubscribe, onConnectionChange } from './api/ws.js';
import './App.css';

export default function App() {
  const loadBoardList = useStore((s) => s.loadBoardList);
  const loadProjects = useStore((s) => s.loadProjects);
  const applyBoardListPatch = useStore((s) => s.applyBoardListPatch);
  const applyBoardChange = useStore((s) => s.applyBoardChange);
  const ingestRunEvent = useStore((s) => s.ingestRunEvent);
  const ingestSnapshotCreated = useStore((s) => s.ingestSnapshotCreated);
  const ingestBatchEvent = useStore((s) => s.ingestBatchEvent);
  const ingestProjectsChanged = useStore((s) => s.ingestProjectsChanged);
  const ingestActiveChanged = useStore((s) => s.ingestActiveChanged);
  const ingestBoardsCleared = useStore((s) => s.ingestBoardsCleared);
  const loadSnapshots = useStore((s) => s.loadSnapshots);
  const selectedBoard = useStore((s) => s.selectedBoard);
  const batches = useStore((s) => s.batches);
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const unregisteredCwdProjectId = useStore((s) => s.unregisteredCwdProjectId);
  const [wsConnected, setWsConnected] = useState(false);
  const [serverVersion, setServerVersion] = useState<{ version: string; gitSha: string } | null>(null);

  // Fetch the server's build identity once. Surfaced next to the web bundle's
  // version in the header so the operator can spot mismatched server vs. UI.
  useEffect(() => {
    void fetch('/api/v1/version')
      .then((r) => r.ok ? r.json() as Promise<{ version: string; gitSha: string }> : null)
      .then((info) => { if (info) setServerVersion(info); })
      .catch(() => undefined);
  }, []);

  // Bootstrap: load projects first, then conditionally load boards.
  // We load boards when:
  //   - there is a registered active project (aid !== null), OR
  //   - the server is running in cwd/env mode (source !== 'registry' means no
  //     multi-project registry is being used — backward-compatible mode where the
  //     server resolves its boardsDir from env/config.yaml/cwd and boards always load)
  //   - unregistered cwd project is known (ucid !== null)
  //
  // We skip loading boards only when source === 'registry' AND no active project is set
  // (the user must pick a project first).
  useEffect(() => {
    void (async () => {
      await loadProjects();
      const { activeProjectId: aid, unregisteredCwdProjectId: ucid, configSource } = useStore.getState();
      if (aid !== null || ucid !== null || configSource !== 'registry') {
        void loadBoardList();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket: track connection state
  useEffect(() => {
    const unsub = onConnectionChange(setWsConnected);
    return unsub;
  }, []);

  // WebSocket: subscribe to boards channel for tree changes
  useEffect(() => {
    const handler = (msg: Record<string, unknown>) => {
      if (msg['type'] === 'tree.changed') {
        void applyBoardListPatch();
      } else if (msg['type'] === 'boards.cleared') {
        ingestBoardsCleared();
      }
    };
    subscribe('boards', handler);
    return () => unsubscribe('boards', handler);
  }, [applyBoardListPatch, ingestBoardsCleared]);

  // WebSocket: subscribe to all board channels for non-open board changed indicators
  // This catches board.changed events for boards other than the currently-open one.
  const boards = useStore((s) => s.boards);
  useEffect(() => {
    if (!boards.length) return;
    const handlers: Array<{ channel: string; handler: (msg: Record<string, unknown>) => void }> = [];
    for (const board of boards) {
      if (board.name === selectedBoard) continue; // open board handled by the per-board subscription
      const channel = `board:${board.name}`;
      const handler = (msg: Record<string, unknown>) => {
        if (msg['type'] === 'board.changed') {
          const originId = typeof msg['originId'] === 'string' ? msg['originId'] : null;
          const mtime = typeof msg['mtime'] === 'number' ? msg['mtime'] : 0;
          applyBoardChange(board.name, mtime, originId);
        }
      };
      subscribe(channel, handler);
      handlers.push({ channel, handler });
    }
    return () => {
      for (const { channel, handler } of handlers) {
        unsubscribe(channel, handler);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, selectedBoard, applyBoardChange]);

  // WebSocket: subscribe to projects channel
  useEffect(() => {
    const handler = (msg: Record<string, unknown>) => {
      if (msg['type'] === 'projects.changed') {
        const payload = msg as unknown as { projects: typeof projects; activeProjectId: string | null };
        ingestProjectsChanged({ projects: payload.projects, activeProjectId: payload.activeProjectId });
      } else if (msg['type'] === 'active.changed') {
        const payload = msg as unknown as { activeProjectId: string | null; source: 'registry' | 'cwd' | 'env' };
        const prevActive = useStore.getState().activeProjectId;
        ingestActiveChanged({ activeProjectId: payload.activeProjectId, source: payload.source });
        // External switch: if active project changed, re-fetch boards
        if (payload.activeProjectId !== prevActive) {
          ingestBoardsCleared();
          void loadBoardList();
        }
      }
    };
    subscribe('projects', handler);
    return () => unsubscribe('projects', handler);
  }, [ingestProjectsChanged, ingestActiveChanged, ingestBoardsCleared, loadBoardList]);

  // WebSocket: subscribe to the currently open board for changes and snapshots
  useEffect(() => {
    if (!selectedBoard) return;
    const channel = `board:${selectedBoard}`;
    const handler = (msg: Record<string, unknown>) => {
      if (msg['type'] === 'board.changed') {
        // mtime is a Unix ms number in the new payload
        const mtime = typeof msg['mtime'] === 'number' ? msg['mtime'] : 0;
        const originId = typeof msg['originId'] === 'string' ? msg['originId'] : null;
        applyBoardChange(selectedBoard, mtime, originId);
      } else if (msg['type'] === 'snapshot.created') {
        const ts = msg['timestamp'];
        const board = msg['boardName'];
        if (typeof ts === 'string' && typeof board === 'string') {
          ingestSnapshotCreated(board, ts);
          // Refresh full snapshot list so sizes/dates are accurate
          void loadSnapshots(board);
        }
      }
    };
    subscribe(channel, handler);
    return () => unsubscribe(channel, handler);
  }, [selectedBoard, applyBoardChange, ingestSnapshotCreated, loadSnapshots]);

  // WebSocket: subscribe to batches channel for batch progress
  useEffect(() => {
    const handler = (msg: Record<string, unknown>) => {
      if (msg['type'] === 'batch.progress' && typeof msg['batchId'] === 'string') {
        ingestBatchEvent(msg as unknown as BatchStatus);
      }
    };
    subscribe('batches', handler);
    return () => unsubscribe('batches', handler);
  }, [ingestBatchEvent]);

  // WebSocket: subscribe to per-batch channels for any active batches
  useEffect(() => {
    const handlers: Array<{ channel: string; handler: (msg: Record<string, unknown>) => void }> = [];
    for (const batch of batches.values()) {
      if (batch.status === 'running') {
        const channel = `batch:${batch.batchId}`;
        const handler = (msg: Record<string, unknown>) => {
          if (msg['type'] === 'batch.progress') {
            ingestBatchEvent(msg as unknown as BatchStatus);
          }
        };
        subscribe(channel, handler);
        handlers.push({ channel, handler });
      }
    }
    return () => {
      for (const { channel, handler } of handlers) {
        unsubscribe(channel, handler);
      }
    };
  }, [batches, ingestBatchEvent]);

  // WebSocket: subscribe to the runs channel for skill-run progress
  useEffect(() => {
    const handler = (msg: Record<string, unknown>) => {
      const type = msg['type'];
      if (
        type === 'run.enqueued' ||
        type === 'run.started' ||
        type === 'run.finished' ||
        type === 'run.completed' ||
        type === 'run.failed'
      ) {
        const runId = msg['runId'];
        if (typeof runId !== 'string') return;
        const phase = (
          type === 'run.enqueued' ? 'queued' :
          type === 'run.started'  ? 'running' :
          type === 'run.finished' || type === 'run.completed' ? 'completed' :
          'failed'
        );
        ingestRunEvent({
          runId,
          phase,
          kind: msg['kind'] as Run['kind'],
          board: msg['board'] as string,
          exitCode: typeof msg['exitCode'] === 'number' ? msg['exitCode'] : undefined,
          finishedAt: typeof msg['finishedAt'] === 'string' ? msg['finishedAt'] : undefined,
          blockedReason: typeof msg['reason'] === 'string' ? msg['reason'] : undefined,
          msUntilRetry: typeof msg['msUntilRetry'] === 'number' ? msg['msUntilRetry'] : undefined,
        });
        // Any per-run progress means the queue is no longer paused.
        if (type === 'run.started' || type === 'run.enqueued') {
          useStore.setState({ pacerBlocked: null });
        }
      } else if (type === 'run.blocked') {
        // Pacer-wide block — has no specific runId; it gates the entire queue.
        const reason = typeof msg['reason'] === 'string' ? msg['reason'] : 'unknown';
        const msUntilRetry = typeof msg['msUntilRetry'] === 'number' ? msg['msUntilRetry'] : null;
        useStore.setState({
          pacerBlocked: { reason, msUntilRetry, capturedAt: Date.now() },
        });
      }
    };
    subscribe('runs', handler);
    return () => unsubscribe('runs', handler);
  }, [ingestRunEvent]);

  // Determine whether to show empty state placeholder.
  // Only shown when source === 'registry' with zero registered projects and no cwd project.
  // In env/cwd modes, the server always has a boardsDir so no placeholder is needed.
  const configSource = useStore((s) => s.configSource);
  const showEmptyPlaceholder =
    configSource === 'registry' &&
    projects.length === 0 &&
    unregisteredCwdProjectId === null &&
    activeProjectId === null;

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="app-title">NaCl Analyst Tool</span>
        <ProjectPicker />
        <span
          className="app-version"
          title={`web bundle built ${__APP_BUILT_AT__}`}
        >
          web v{__APP_VERSION__}+{__APP_GIT_SHA__}
          {serverVersion && (
            <>
              {' · '}
              <span
                className={
                  serverVersion.gitSha === __APP_GIT_SHA__
                    ? 'app-version-server'
                    : 'app-version-server app-version-mismatch'
                }
              >
                server v{serverVersion.version}+{serverVersion.gitSha}
              </span>
            </>
          )}
        </span>
        <span className={`ws-indicator ${wsConnected ? 'ws-indicator--connected' : 'ws-indicator--disconnected'}`}>
          {wsConnected ? '● live' : '○ offline'}
        </span>
      </header>
      <UnregisteredBanner />
      <div className="app-body">
        <Sidebar />
        <main className="app-canvas">
          {showEmptyPlaceholder ? <EmptyProjectsPlaceholder /> : <CanvasHost />}
        </main>
        <aside className="app-right-rail">
          <SnapshotBrowser />
        </aside>
      </div>
      <StatusBar />
      <RunPanel />
    </div>
  );
}

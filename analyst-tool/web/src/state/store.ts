import { create } from 'zustand';
import { apiClient, type BoardListItem, type BoardData, type ExcalidrawScene, type SnapshotEntry, type DiffEntry, type ProjectRecord, type ResolvedConfig } from '../api/client.js';

export type { ProjectRecord, ResolvedConfig };

export type SkillKind = 'regenerate' | 'sync' | 'analyze';
export type RunPhase = 'queued' | 'running' | 'blocked' | 'completed' | 'failed';

export interface Run {
  runId: string;
  kind: SkillKind;
  board: string;
  phase: RunPhase;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  blockedReason?: string;
  msUntilRetry?: number;
}

/** Latest pacer-wide block event — applies to the whole queue, not a single run. */
export interface PacerBlocked {
  reason: string;
  msUntilRetry: number | null;
  capturedAt: number;
}

export type { SnapshotEntry, DiffEntry };

export type DiffMode = {
  active: boolean;
  baselineTimestamp: string | null;
  entries: DiffEntry[];
  stats: { added: number; removed: number; changed: number } | null;
};

// ---------------------------------------------------------------------------
// Search types (mirrors server SearchResult)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export type BoardSearchResult = {
  source: 'board';
  boardName: string;
  elementId: string;
  nodeId: string | null;
  snippet: string;
  score: number;
};

export type GraphSearchResult = {
  source: 'graph';
  node: GraphNode;
  matchedField: string;
  snippet: string;
  score: number;
};

export type SearchResult = BoardSearchResult | GraphSearchResult;

// ---------------------------------------------------------------------------
// Batch types (mirrors server BatchStatus)
// ---------------------------------------------------------------------------

export interface BatchStatus {
  batchId: string;
  kind: SkillKind;
  total: number;
  completed: number;
  failed: number;
  currentRunId: string | null;
  status: 'running' | 'done' | 'aborted';
  runIds: string[];
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface Store {
  boards: BoardListItem[];
  selectedBoard: string | null;
  current: BoardData | null;
  /**
   * Bumped every time `current` is replaced from outside (load, regenerate,
   * sync, external WS update) — but NOT bumped by saveCurrent. CanvasHost
   * folds this into the Excalidraw `key` so external scene changes force a
   * remount; local saves don't.
   */
  currentRevision: number;
  loading: boolean;
  error: string | null;
  // mtime we wrote last — used to suppress echo from WS
  expectedMtime: string | null;
  // run tracking
  runs: Map<string, Run>;
  /** Latest pacer-wide block (window closed / wave cooldown). null when running freely. */
  pacerBlocked: PacerBlocked | null;
  /** Boards that the graph says are renderable right now (incl. ones not yet on disk). */
  renderable: { board: string; kind: string; relatedId: string | null; reason: string }[];

  // snapshot state
  snapshots: SnapshotEntry[];
  diffMode: DiffMode;
  /** Boards where analyst has explicitly exited diff mode in this session (suppress auto-activation). */
  diffModeOptOut: Set<string>;

  // --- search ---
  searchQuery: string;
  searchResults: SearchResult[];
  searchLoading: boolean;

  // --- batch ---
  batches: Map<string, BatchStatus>;

  // pending highlight element for canvas (set by goToSearchResult, consumed by CanvasHost)
  pendingHighlightElementId: string | null;

  // --- project management (Wave 6.D) ---
  projects: ProjectRecord[];
  activeProjectId: string | null;
  unregisteredCwdProjectId: string | null;
  configSource: 'registry' | 'cwd' | 'env';
  resolvedConfig: ResolvedConfig | null;
  projectSwitching: boolean;

  loadBoardList(): Promise<void>;
  selectBoard(name: string): Promise<void>;
  saveCurrent(scene: ExcalidrawScene): Promise<void>;
  applyBoardListPatch(): Promise<void>;
  applyBoardChange(name: string, mtime?: string): Promise<void>;
  setExpectedMtime(mtime: string | null): void;
  startRegenerate(board: string): Promise<string>;
  startSync(board: string): Promise<string>;
  startAnalyze(board: string): Promise<string>;
  ingestRunEvent(evt: Partial<Run> & { runId: string; phase: RunPhase }): void;

  // snapshot actions
  loadSnapshots(board: string): Promise<void>;
  enterDiffMode(timestamp: string): Promise<void>;
  exitDiffMode(): void;
  restoreSnapshot(board: string, timestamp: string): Promise<void>;
  ingestSnapshotCreated(board: string, ts: string): void;

  // search actions
  setSearchQuery(q: string): void;
  goToSearchResult(r: SearchResult): Promise<void>;

  // batch actions
  startBatch(op: 'regenerate' | 'sync', boards?: string[]): Promise<string>;
  ingestBatchEvent(evt: BatchStatus): void;

  // project actions (Wave 6.D)
  loadProjects(): Promise<void>;
  switchProject(id: string): Promise<void>;
  ingestProjectsChanged(payload: { projects: ProjectRecord[]; activeProjectId: string | null }): void;
  ingestActiveChanged(payload: { activeProjectId: string | null; source: 'registry' | 'cwd' | 'env' }): void;
  ingestBoardsCleared(): void;

  // derived read-only selector
  isReadOnly(): boolean;

  // internal
  clearPendingHighlight(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postSkill(kind: SkillKind, board: string): Promise<string> {
  const res = await fetch(`/api/v1/skills/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board }),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } | string };
      const err = body.error;
      if (typeof err === 'string') message = err;
      else if (err?.message) message = err.message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  const data = (await res.json()) as { runId: string };
  return data.runId;
}

const DEFAULT_DIFF_MODE: DiffMode = {
  active: false,
  baselineTimestamp: null,
  entries: [],
  stats: null,
};

// Debounced search fetch — keeps a reference to cancel timer between calls
let searchTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<Store>((set, get) => ({
  boards: [],
  selectedBoard: null,
  current: null,
  currentRevision: 0,
  loading: false,
  error: null,
  expectedMtime: null,
  runs: new Map(),
  pacerBlocked: null,
  renderable: [],

  snapshots: [],
  diffMode: { ...DEFAULT_DIFF_MODE },
  diffModeOptOut: new Set<string>(),

  searchQuery: '',
  searchResults: [],
  searchLoading: false,

  batches: new Map(),

  pendingHighlightElementId: null,

  // project state
  projects: [],
  activeProjectId: null,
  unregisteredCwdProjectId: null,
  configSource: 'env',
  resolvedConfig: null,
  projectSwitching: false,

  setExpectedMtime(mtime) {
    set({ expectedMtime: mtime });
  },

  async loadBoardList() {
    set({ loading: true, error: null });
    try {
      // Load FS list and graph-driven renderable list in parallel. The graph
      // call is best-effort (returns []) so a missing Neo4j doesn't block UI.
      const [boards, renderable] = await Promise.all([
        apiClient.listBoards(),
        apiClient.listRenderable().catch(() => []),
      ]);
      set({ boards, renderable, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  async selectBoard(name) {
    // Clear `current` immediately on selection — otherwise CanvasHost mounts
    // <Excalidraw key={selectedBoard}> with the previous board's scene as
    // initialData, and Excalidraw treats initialData as init-only: subsequent
    // updates from the GET response are ignored, so the canvas stays stuck
    // on the old board's content.
    set({
      loading: true,
      error: null,
      selectedBoard: name,
      current: null,
      snapshots: [],
      diffMode: { ...DEFAULT_DIFF_MODE },
    });
    try {
      const data = await apiClient.getBoard(name);
      // Guard against a race: if the user clicked a different board while
      // this fetch was in flight, drop the stale response.
      if (get().selectedBoard !== name) return;
      set((s) => ({ current: data, loading: false, currentRevision: s.currentRevision + 1 }));
      // Load snapshots in background
      void get().loadSnapshots(name);
    } catch (err) {
      if (get().selectedBoard !== name) return;
      set({ loading: false, error: String(err), current: null });
    }
  },

  async saveCurrent(scene) {
    const { selectedBoard, diffMode } = get();
    if (!selectedBoard) return;
    // Auto-save is suspended during diff mode
    if (diffMode.active) return;
    try {
      const result = await apiClient.putBoard(selectedBoard, scene);
      // Track the mtime we expect from WS echo — suppress that notification
      set({ expectedMtime: result.mtime });
      // Update current meta snapshot
      const { current, boards } = get();
      if (current) {
        set({
          current: {
            ...current,
            scene,
            mtime: result.mtime,
          },
        });
      }
      // Patch the saved board's row in-place. Re-fetching the full list on
      // every autosave produced a flood of GET /boards while dragging — and
      // for a save the only fields that can change are mtime, hasUnsyncedEdits
      // and the derived syncStatus.
      set({
        boards: boards.map((b) => {
          if (b.name !== selectedBoard) return b;
          const syncStatus =
            b.lastSyncedAt === null
              ? 'never-synced'
              : result.hasUnsyncedEdits
                ? 'dirty'
                : 'synced';
          return {
            ...b,
            mtime: result.mtime,
            hasUnsyncedEdits: result.hasUnsyncedEdits,
            syncStatus,
          };
        }),
      });
    } catch {
      // Silently fail for autosave — could add error indicator in future
    }
  },

  async applyBoardListPatch() {
    try {
      // Re-fetch both lists so a freshly rendered board moves out of
      // "Available to generate" and into the regular tree.
      const [boards, renderable] = await Promise.all([
        apiClient.listBoards(),
        apiClient.listRenderable().catch(() => null),
      ]);
      set(renderable !== null ? { boards, renderable } : { boards });
    } catch {
      // ignore
    }
  },

  async applyBoardChange(name, mtime) {
    const { selectedBoard, expectedMtime } = get();
    if (selectedBoard !== name) return;

    // Suppress echo of our own save
    if (mtime && expectedMtime === mtime) {
      set({ expectedMtime: null });
      return;
    }
    set({ expectedMtime: null });

    try {
      const data = await apiClient.getBoard(name);
      // External update — force a CanvasHost remount so Excalidraw picks up
      // the new scene (initialData is read only at mount time).
      set((s) => ({ current: data, currentRevision: s.currentRevision + 1 }));
    } catch {
      // ignore
    }
  },

  async startRegenerate(board) {
    return postSkill('regenerate', board);
  },

  async startSync(board) {
    return postSkill('sync', board);
  },

  async startAnalyze(board) {
    return postSkill('analyze', board);
  },

  ingestRunEvent(evt) {
    set((state) => {
      const next = new Map(state.runs);
      const existing = next.get(evt.runId);
      next.set(evt.runId, { ...existing, ...evt } as Run);
      return { runs: next };
    });

    // After a run completes/fails on the open board, refresh board data
    const { selectedBoard, applyBoardChange } = get();
    if (
      (evt.phase === 'completed' || evt.phase === 'failed') &&
      evt.board &&
      selectedBoard === evt.board
    ) {
      void applyBoardChange(evt.board);
    }

    // After success, refresh board list to show updated syncStatus
    if (evt.phase === 'completed' && evt.exitCode === 0) {
      void get().applyBoardListPatch();
    }

    // Auto-enter diff mode after analyze completes successfully on the open board
    if (
      evt.phase === 'completed' &&
      evt.exitCode === 0 &&
      evt.kind === 'analyze' &&
      evt.board &&
      selectedBoard === evt.board
    ) {
      const { diffModeOptOut } = get();
      if (!diffModeOptOut.has(evt.board)) {
        // Refresh snapshots then enter diff mode with newest snapshot
        void apiClient.listSnapshots(evt.board).then((snaps) => {
          set({ snapshots: snaps });
          if (snaps.length > 0) {
            void get().enterDiffMode(snaps[0].timestamp);
          }
        });
      }
    }
  },

  // --- Snapshot actions ---

  async loadSnapshots(board) {
    try {
      const snapshots = await apiClient.listSnapshots(board);
      set({ snapshots });
    } catch {
      set({ snapshots: [] });
    }
  },

  async enterDiffMode(timestamp) {
    const { selectedBoard } = get();
    if (!selectedBoard) return;
    try {
      const result = await apiClient.getDiff(selectedBoard, timestamp, 'current');
      set({
        diffMode: {
          active: true,
          baselineTimestamp: timestamp,
          entries: result.entries,
          stats: result.stats,
        },
      });
    } catch (err) {
      console.error('Failed to enter diff mode:', err);
    }
  },

  exitDiffMode() {
    const { selectedBoard } = get();
    set((state) => ({
      diffMode: { ...DEFAULT_DIFF_MODE },
      diffModeOptOut: selectedBoard
        ? new Set([...state.diffModeOptOut, selectedBoard])
        : state.diffModeOptOut,
    }));
  },

  async restoreSnapshot(board, timestamp) {
    try {
      await apiClient.restoreSnapshot(board, timestamp);
      // Reload board data after restore
      const data = await apiClient.getBoard(board);
      set({ current: data });
      // Exit diff mode (restored state is now live)
      set({ diffMode: { ...DEFAULT_DIFF_MODE } });
      // Refresh snapshot list (safety snapshot was added)
      const snaps = await apiClient.listSnapshots(board);
      set({ snapshots: snaps });
    } catch (err) {
      console.error('Failed to restore snapshot:', err);
      throw err;
    }
  },

  ingestSnapshotCreated(board, ts) {
    const { selectedBoard } = get();
    if (selectedBoard !== board) return;
    // Add to front of list if not already present
    set((state) => {
      const exists = state.snapshots.some((s) => s.board === board && s.timestamp === ts);
      if (exists) return {};
      const newEntry: SnapshotEntry = {
        board,
        timestamp: ts,
        createdAt: new Date().toISOString(),
        path: '',
        size: 0,
      };
      return { snapshots: [newEntry, ...state.snapshots] };
    });
  },

  // --- Search actions ---

  setSearchQuery(q) {
    set({ searchQuery: q });

    if (searchTimer !== null) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }

    if (q.trim().length === 0) {
      set({ searchResults: [], searchLoading: false });
      return;
    }

    set({ searchLoading: true });
    searchTimer = setTimeout(() => {
      searchTimer = null;
      const trimmed = q.trim();
      const encoded = encodeURIComponent(trimmed);
      fetch(`/api/v1/search?q=${encoded}&limit=20`)
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText);
          return res.json() as Promise<SearchResult[]>;
        })
        .then((results) => {
          // Only update if the query hasn't changed since we sent this request
          const current = get().searchQuery;
          if (current.trim() === trimmed) {
            set({ searchResults: results, searchLoading: false });
          }
        })
        .catch((err: unknown) => {
          console.error('Search failed:', err);
          set({ searchResults: [], searchLoading: false });
        });
    }, 300);
  },

  async goToSearchResult(r) {
    if (r.source === 'board') {
      // Navigate to board
      const { selectBoard } = get();
      await selectBoard(r.boardName);
      // Set pending highlight — CanvasHost will consume it
      if (r.elementId) {
        set({ pendingHighlightElementId: r.elementId });
      }
    } else {
      // Graph result: find a board containing an element with this nodeId
      const nodeId = r.node.id || String(r.node.properties['nodeId'] ?? '');
      if (!nodeId) return;

      const { boards } = get();
      // Search current boards list for a board containing this nodeId
      // We can only check boards whose data is already loaded; use the search results
      // to find a board with a matching nodeId in searchResults
      const boardHit = get().searchResults.find(
        (sr) => sr.source === 'board' && sr.nodeId === nodeId,
      );
      if (boardHit && boardHit.source === 'board') {
        const { selectBoard } = get();
        await selectBoard(boardHit.boardName);
        set({ pendingHighlightElementId: boardHit.elementId });
      } else {
        // Fallback: show a simple toast-like console message
        const boardName = boards.find((b) => b.name.includes(nodeId.toLowerCase().replace('-', '')));
        if (boardName) {
          await get().selectBoard(boardName.name);
        }
      }
    }
  },

  clearPendingHighlight() {
    set({ pendingHighlightElementId: null });
  },

  // --- Project actions (Wave 6.D) ---

  async loadProjects() {
    try {
      const res = await apiClient.fetchProjects();
      set({
        projects: res.projects,
        activeProjectId: res.activeProjectId,
        unregisteredCwdProjectId: res.unregisteredCwdProjectId,
        configSource: res.source,
      });
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  },

  async switchProject(id) {
    set({ projectSwitching: true });
    try {
      const res = await apiClient.activateProject(id);
      get().ingestBoardsCleared();
      set({
        activeProjectId: res.project.id,
        resolvedConfig: res.resolvedConfig,
        unregisteredCwdProjectId: null,
        projectSwitching: false,
      });
      await get().loadBoardList();
    } catch (err) {
      set({ projectSwitching: false });
      console.error('Failed to switch project:', err);
      throw err;
    }
  },

  ingestProjectsChanged(payload) {
    set({
      projects: payload.projects,
      activeProjectId: payload.activeProjectId,
    });
  },

  ingestActiveChanged(payload) {
    set({
      activeProjectId: payload.activeProjectId,
      configSource: payload.source,
    });
  },

  ingestBoardsCleared() {
    set({
      boards: [],
      selectedBoard: null,
      current: null,
      runs: new Map(),
      pacerBlocked: null,
      snapshots: [],
      diffMode: { ...DEFAULT_DIFF_MODE },
      diffModeOptOut: new Set<string>(),
      searchQuery: '',
      searchResults: [],
      searchLoading: false,
      batches: new Map(),
      pendingHighlightElementId: null,
      expectedMtime: null,
    });
  },

  isReadOnly() {
    const { activeProjectId, unregisteredCwdProjectId } = get();
    return activeProjectId === null && unregisteredCwdProjectId !== null;
  },

  // --- Batch actions ---

  async startBatch(op, boards) {
    const body: { op: string; boards?: string[]; all?: boolean } = { op };
    if (boards && boards.length > 0) {
      body.boards = boards;
    } else {
      body.all = true;
    }

    const res = await fetch('/api/v1/skills/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const data = (await res.json()) as { error?: { message?: string } | string };
        const err = data.error;
        if (typeof err === 'string') message = err;
        else if (err?.message) message = err.message;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const data = (await res.json()) as {
      batchId: string | null;
      runIds: string[];
      discovered?: { board: string }[];
    };
    if (!data.batchId) {
      // No eligible boards
      return '';
    }

    // Create optimistic batch status. Prefer `discovered.length` over
    // `runIds.length` because runIds is filled asynchronously by the server
    // (one entry per sequential pacer enqueue) and the HTTP response often
    // returns before all entries land — total would otherwise read as 1.
    const total = data.discovered?.length ?? data.runIds.length;
    const batchStatus: BatchStatus = {
      batchId: data.batchId,
      kind: op,
      total,
      completed: 0,
      failed: 0,
      currentRunId: null,
      status: 'running',
      runIds: data.runIds,
    };
    set((state) => {
      const next = new Map(state.batches);
      next.set(data.batchId!, batchStatus);
      return { batches: next };
    });

    return data.batchId;
  },

  ingestBatchEvent(evt) {
    set((state) => {
      const next = new Map(state.batches);
      const existing = next.get(evt.batchId);
      next.set(evt.batchId, { ...existing, ...evt });
      return { batches: next };
    });

    // After batch done, refresh board list
    if (evt.status === 'done') {
      void get().applyBoardListPatch();
    }
  },
}));

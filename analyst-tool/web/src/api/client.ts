import { originId } from './ws.js';

export type BoardMeta = {
  lastGeneratedAt: string | null;
  lastGeneratedBy: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: 'ok' | 'failed' | null;
  lastSyncRunId: string | null;
  contentHashAtLastSync: string | null;
};

export type BoardKind = 'domain-model' | 'context-map' | 'activity' | 'process' | 'interface-model' | 'state-machine' | 'code-contract' | 'import' | 'other';
export type SyncStatus = 'synced' | 'dirty' | 'never-synced';

export type BoardListItem = {
  name: string;
  path: string;
  kind: BoardKind;
  relatedId: string | null;
  displayName: string;
  label: string | null;
  group: string;
  mtime: string;
  syncStatus: SyncStatus;
  lastGeneratedAt: string | null;
  lastSyncedAt: string | null;
  hasUnsyncedEdits: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExcalidrawScene = Record<string, any>;

export type BoardData = {
  scene: ExcalidrawScene;
  meta: BoardMeta;
  mtime: string;
};

export type BoardStatus = {
  syncStatus: SyncStatus;
  lastGeneratedAt: string | null;
  lastSyncedAt: string | null;
  hasUnsyncedEdits: boolean;
  meta: BoardMeta;
};

export type WriteResult = {
  mtime: string;
  hasUnsyncedEdits: boolean;
};

export type SnapshotEntry = {
  board: string;
  timestamp: string;
  createdAt: string;
  path: string;
  size: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DiffElement = Record<string, any>;

export type DiffEntry =
  | { kind: 'added'; element: DiffElement }
  | { kind: 'removed'; element: DiffElement }
  | { kind: 'changed'; before: DiffElement; after: DiffElement; reasons: string[] };

export type DiffResult = {
  entries: DiffEntry[];
  stats: { added: number; removed: number; changed: number };
};

export type RestoreResult = {
  mtime: string;
  safetyTimestamp: string;
};

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const res = await fetch(`/api/v1${path}`, {
    ...(hasBody ? { headers: { 'Content-Type': 'application/json' } } : {}),
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Project types
// ---------------------------------------------------------------------------

export type ProjectRecord = {
  id: string;
  name: string;
  root: string;
  createdAt: string;
  lastUsed: string;
};

export type ResolvedConfig = {
  port: number;
  host: string;
  boardsDir: string;
  repoRoot: string;
  projectId: string;
  source: 'registry' | 'cwd' | 'env';
};

export type ProjectsResponse = {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  source: 'registry' | 'cwd' | 'env';
  unregisteredCwdProjectId: string | null;
};

export type ActiveProjectResponse = {
  project: ProjectRecord | null;
  source: 'registry' | 'cwd' | 'env';
  resolvedConfig: ResolvedConfig;
};

export type ActivateProjectResponse = {
  project: ProjectRecord;
  resolvedConfig: ResolvedConfig;
};

export const apiClient = {
  listBoards(): Promise<BoardListItem[]> {
    return request<BoardListItem[]>('/boards');
  },

  listRenderable(): Promise<{ board: string; kind: string; relatedId: string | null; reason: string }[]> {
    return request('/renderable');
  },

  getBoard(name: string): Promise<BoardData> {
    return request<BoardData>(`/boards/${encodeURIComponent(name)}`);
  },

  putBoard(name: string, scene: ExcalidrawScene): Promise<WriteResult> {
    return request<WriteResult>(`/boards/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ scene, originId }),
    });
  },

  getBoardStatus(name: string): Promise<BoardStatus> {
    return request<BoardStatus>(`/boards/${encodeURIComponent(name)}/status`);
  },

  listSnapshots(board: string): Promise<SnapshotEntry[]> {
    return request<SnapshotEntry[]>(`/boards/${encodeURIComponent(board)}/snapshots`);
  },

  getSnapshot(board: string, timestamp: string): Promise<ExcalidrawScene> {
    return request<ExcalidrawScene>(
      `/boards/${encodeURIComponent(board)}/snapshots/${encodeURIComponent(timestamp)}`,
    );
  },

  getDiff(board: string, timestamp: string, against = 'current'): Promise<DiffResult> {
    return request<DiffResult>(
      `/boards/${encodeURIComponent(board)}/snapshots/${encodeURIComponent(timestamp)}/diff?against=${encodeURIComponent(against)}`,
    );
  },

  restoreSnapshot(board: string, timestamp: string): Promise<RestoreResult> {
    return request<RestoreResult>(
      `/boards/${encodeURIComponent(board)}/snapshots/${encodeURIComponent(timestamp)}/restore`,
      { method: 'POST' },
    );
  },

  fetchProjects(): Promise<ProjectsResponse> {
    return request<ProjectsResponse>('/projects');
  },

  fetchActiveProject(): Promise<ActiveProjectResponse> {
    return request<ActiveProjectResponse>('/projects/active');
  },

  activateProject(id: string): Promise<ActivateProjectResponse> {
    return request<ActivateProjectResponse>(`/projects/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
    });
  },
};

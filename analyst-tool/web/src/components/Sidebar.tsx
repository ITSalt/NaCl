import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { useStore } from '../state/store.js';
import type { BatchStatus, SearchResult } from '../state/store.js';
import type { BoardListItem, SyncStatus } from '../api/client.js';
import RegenConfirmDialog from './RegenConfirmDialog.js';

const GROUP_ORDER = [
  'Domain Model',
  'Context Map',
  'Interface Model',
  'State Machines',
  'Code Contract',
  'Activities (UC)',
  'Processes (BP)',
  'Imports',
  'Other',
];

function statusDot(status: SyncStatus): string {
  switch (status) {
    case 'synced': return '🟢';
    case 'dirty': return '🟡';
    case 'never-synced': return '⚪';
  }
}

function groupBoards(boards: BoardListItem[]): Map<string, BoardListItem[]> {
  const groups = new Map<string, BoardListItem[]>();
  for (const order of GROUP_ORDER) {
    groups.set(order, []);
  }
  for (const board of boards) {
    const group = GROUP_ORDER.includes(board.group) ? board.group : 'Other';
    groups.get(group)!.push(board);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Batch toolbar
// ---------------------------------------------------------------------------

function activeBatch(batches: Map<string, BatchStatus>, kind: 'regenerate' | 'sync'): BatchStatus | null {
  for (const b of batches.values()) {
    if (b.kind === kind && b.status === 'running') return b;
  }
  return null;
}

function BatchToolbar() {
  const batches = useStore((s) => s.batches);
  const startBatch = useStore((s) => s.startBatch);

  const regenBatch = activeBatch(batches, 'regenerate');
  const syncBatch  = activeBatch(batches, 'sync');

  const handleRegenAll = useCallback(async () => {
    try {
      await startBatch('regenerate');
    } catch (e) {
      console.error('Regenerate All failed:', e);
    }
  }, [startBatch]);

  const handleSyncAll = useCallback(async () => {
    try {
      await startBatch('sync');
    } catch (e) {
      console.error('Sync All failed:', e);
    }
  }, [startBatch]);

  return (
    <div className="batch-toolbar">
      <button
        className="batch-btn"
        onClick={() => void handleRegenAll()}
        disabled={!!regenBatch}
        title="Regenerate all eligible boards from graph"
      >
        {regenBatch
          ? `⟳ Regen ${regenBatch.completed}/${regenBatch.total}`
          : 'Regen All'}
      </button>
      <button
        className="batch-btn"
        onClick={() => void handleSyncAll()}
        disabled={!!syncBatch}
        title="Sync all boards to graph"
      >
        {syncBatch
          ? `⟳ Sync ${syncBatch.completed}/${syncBatch.total}`
          : 'Sync All'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search result row
// ---------------------------------------------------------------------------

function SearchResultRow({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  if (result.source === 'board') {
    return (
      <button className="search-result-row" onClick={onClick}>
        <span className="search-result-icon">📋</span>
        <span className="search-result-label">
          <strong>{result.boardName}</strong>
          {result.snippet ? <> · <em>{result.snippet}</em></> : null}
        </span>
      </button>
    );
  }
  // graph result
  const labels = result.node.labels.join('/') || 'Node';
  return (
    <button className="search-result-row" onClick={onClick}>
      <span className="search-result-icon">🧬</span>
      <span className="search-result-label">
        <strong>{labels}</strong>
        {result.snippet ? <> · <em>{result.snippet}</em></> : null}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar
// ---------------------------------------------------------------------------

export default function Sidebar() {
  const boards = useStore((s) => s.boards);
  const renderable = useStore((s) => s.renderable);
  const runs = useStore((s) => s.runs);
  const selectedBoard = useStore((s) => s.selectedBoard);
  const selectBoard = useStore((s) => s.selectBoard);
  const changedBoards = useStore((s) => s.changedBoards);
  const clearChangedBoard = useStore((s) => s.clearChangedBoard);
  const startRegenerate = useStore((s) => s.startRegenerate);
  const startSync = useStore((s) => s.startSync);
  const searchQuery = useStore((s) => s.searchQuery);
  const searchResults = useStore((s) => s.searchResults);
  const searchLoading = useStore((s) => s.searchLoading);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const goToSearchResult = useStore((s) => s.goToSearchResult);

  const [filter, setFilter] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // RegenConfirmDialog state: board pending confirmation (with local edits)
  const [regenConfirmBoard, setRegenConfirmBoard] = useState<string | null>(null);

  const filtered = filter
    ? boards.filter(
        (b) =>
          b.displayName.toLowerCase().includes(filter.toLowerCase()) ||
          (b.label?.toLowerCase().includes(filter.toLowerCase()) ?? false),
      )
    : boards;

  const groups = groupBoards(filtered);

  // Items the graph says are renderable but no .excalidraw file exists yet.
  const existingNames = new Set(boards.map((b) => b.name));
  const available = renderable.filter((r) => !existingNames.has(r.board));
  const filteredAvailable = filter
    ? available.filter((r) => r.board.toLowerCase().includes(filter.toLowerCase()))
    : available;

  // Track in-flight regenerate runs so the row can show a spinner.
  const runningBoards = new Set<string>();
  for (const r of runs.values()) {
    if (
      r.kind === 'regenerate' &&
      (r.phase === 'queued' || r.phase === 'running') &&
      r.board
    ) {
      runningBoards.add(r.board);
    }
  }

  const handleGenerate = useCallback(
    async (boardName: string) => {
      try {
        await startRegenerate(boardName);
      } catch (e) {
        console.error(`Regenerate ${boardName} failed:`, e);
      }
    },
    [startRegenerate],
  );

  /**
   * Per-board regenerate with confirmation gate.
   * If the board has local edits (hasUnsyncedEdits), open RegenConfirmDialog
   * instead of regenerating immediately.
   */
  const handleRegenerate = useCallback(
    (board: BoardListItem) => {
      if (board.hasUnsyncedEdits) {
        setRegenConfirmBoard(board.name);
      } else {
        void startRegenerate(board.name).catch((e: unknown) => {
          console.error(`Regenerate ${board.name} failed:`, e);
        });
      }
    },
    [startRegenerate],
  );

  const handleRegenConfirmSyncFirst = useCallback(() => {
    if (!regenConfirmBoard) return;
    const board = regenConfirmBoard;
    setRegenConfirmBoard(null);
    void startSync(board).catch((e: unknown) => {
      console.error(`Sync ${board} failed:`, e);
    });
  }, [regenConfirmBoard, startSync]);

  const handleRegenConfirmDiscard = useCallback(() => {
    if (!regenConfirmBoard) return;
    const board = regenConfirmBoard;
    setRegenConfirmBoard(null);
    void startRegenerate(board).catch((e: unknown) => {
      console.error(`Regenerate ${board} failed:`, e);
    });
  }, [regenConfirmBoard, startRegenerate]);

  const handleRegenConfirmCancel = useCallback(() => {
    setRegenConfirmBoard(null);
  }, []);

  const showSearchDropdown = searchFocused && searchQuery.trim().length > 0;

  return (
    <div className="sidebar">
      {/* --- RegenConfirmDialog (portal-free — rendered inline at top level) --- */}
      {regenConfirmBoard && (
        <RegenConfirmDialog
          boardName={regenConfirmBoard}
          onSyncFirst={handleRegenConfirmSyncFirst}
          onDiscard={handleRegenConfirmDiscard}
          onCancel={handleRegenConfirmCancel}
        />
      )}

      {/* --- Global search bar --- */}
      <div className="sidebar-search sidebar-search--global">
        <input
          type="text"
          placeholder="Search boards & graph..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          className="sidebar-search-input"
        />
        {searchLoading && <span className="search-spinner">⟳</span>}
        {showSearchDropdown && (
          <div className="search-dropdown">
            {searchResults.length === 0 ? (
              <div className="search-dropdown-empty">No results</div>
            ) : (
              searchResults.map((r, i) => (
                <SearchResultRow
                  key={i}
                  result={r}
                  onClick={() => {
                    setSearchFocused(false);
                    void goToSearchResult(r);
                  }}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* --- Batch toolbar --- */}
      <BatchToolbar />

      {/* --- Filter input (Wave 1 board tree filter) --- */}
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Filter boards..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="sidebar-search-input"
        />
      </div>

      {/* --- Board tree --- */}
      <div className="sidebar-tree">
        {GROUP_ORDER.map((groupName) => {
          const items = groups.get(groupName) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={groupName} className="sidebar-group">
              <div className="sidebar-group-label">{groupName}</div>
              {items.map((board) => {
                const isRunning = runningBoards.has(board.name);
                const canRegen = board.kind !== 'import' && board.kind !== 'other';
                return (
                  <div
                    key={board.name}
                    className={clsx('sidebar-item-row', { 'sidebar-item-row--active': selectedBoard === board.name })}
                  >
                    <button
                      className={clsx('sidebar-item sidebar-item--flex', { 'sidebar-item--active': selectedBoard === board.name })}
                      title={`${board.name}.excalidraw`}
                      onClick={() => {
                        clearChangedBoard(board.name);
                        void selectBoard(board.name);
                      }}
                    >
                      <span className="sidebar-item-dot">{statusDot(board.syncStatus)}</span>
                      <span className="sidebar-item-text">
                        <span className="sidebar-item-name">{board.displayName}</span>
                        {board.label && (
                          <span className="sidebar-item-label" data-testid="sidebar-item-label">
                            {board.label}
                          </span>
                        )}
                      </span>
                      {changedBoards.has(board.name) && (
                        <span
                          className="sidebar-item-changed-dot"
                          data-testid={`sidebar-item-changed-${board.name}`}
                          title="Изменено на сервере"
                          aria-label="Changed externally"
                        />
                      )}
                    </button>
                    {canRegen && (
                      <button
                        className="sidebar-item-regen"
                        title="Regenerate from graph"
                        disabled={isRunning}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRegenerate(board);
                        }}
                      >
                        {isRunning ? '⟳' : '↺'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Boards that exist in the graph but haven't been rendered to disk yet.
            These boards have no local edits — generate directly without confirmation. */}
        {filteredAvailable.length > 0 && (
          <div className="sidebar-group">
            <div className="sidebar-group-label">
              Available to generate ({filteredAvailable.length})
            </div>
            {filteredAvailable.map((item) => {
              const isRunning = runningBoards.has(item.board);
              return (
                <button
                  key={item.board}
                  className="sidebar-item sidebar-item--available"
                  title={item.reason}
                  disabled={isRunning}
                  onClick={() => void handleGenerate(item.board)}
                >
                  <span className="sidebar-item-dot">{isRunning ? '⟳' : '＋'}</span>
                  <span className="sidebar-item-name">{item.board}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

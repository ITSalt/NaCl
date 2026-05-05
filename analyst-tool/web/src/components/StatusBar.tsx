import { useCallback, useMemo } from 'react';
import { useStore } from '../state/store.js';
import type { SkillKind, Run } from '../state/store.js';
import type { SyncStatus } from '../api/client.js';

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function stateChip(status: SyncStatus | null): string {
  switch (status) {
    case 'synced': return '🟢 synced';
    case 'dirty': return '🟡 unsynced edits';
    case 'never-synced': return '⚪ never synced';
    default: return '';
  }
}

function phaseLabel(phase: Run['phase']): string {
  switch (phase) {
    case 'queued':    return 'queued';
    case 'running':   return 'running...';
    case 'blocked':   return 'blocked';
    case 'completed': return 'done';
    case 'failed':    return 'failed';
  }
}

function useActiveRunForKind(kind: SkillKind): Run | null {
  return useStore((s) => {
    for (const run of s.runs.values()) {
      if (run.kind === kind && (run.phase === 'queued' || run.phase === 'running' || run.phase === 'blocked')) {
        return run;
      }
    }
    return null;
  });
}

export default function StatusBar() {
  const selectedBoard = useStore((s) => s.selectedBoard);
  const current = useStore((s) => s.current);
  const boards = useStore((s) => s.boards);
  const startRegenerate = useStore((s) => s.startRegenerate);
  const startSync = useStore((s) => s.startSync);
  const startAnalyze = useStore((s) => s.startAnalyze);
  const isReadOnly = useStore((s) => s.isReadOnly());

  const regenRun  = useActiveRunForKind('regenerate');
  const syncRun   = useActiveRunForKind('sync');
  const analyzeRun = useActiveRunForKind('analyze');

  const boardItem = selectedBoard ? boards.find((b) => b.name === selectedBoard) ?? null : null;
  const meta = current?.meta ?? null;

  const isImport = boardItem?.kind === 'import';

  const handleRegenerate = useCallback(async () => {
    if (!selectedBoard) return;
    try { await startRegenerate(selectedBoard); }
    catch (e) { console.error('Regenerate failed:', e); }
  }, [selectedBoard, startRegenerate]);

  const handleSync = useCallback(async () => {
    if (!selectedBoard) return;
    try { await startSync(selectedBoard); }
    catch (e) { console.error('Sync failed:', e); }
  }, [selectedBoard, startSync]);

  const handleAnalyze = useCallback(async () => {
    if (!selectedBoard) return;
    try { await startAnalyze(selectedBoard); }
    catch (e) { console.error('Analyze failed:', e); }
  }, [selectedBoard, startAnalyze]);

  const noBoard = !selectedBoard;
  const readOnlyTitle = isReadOnly ? 'Project is not registered — see the banner above.' : undefined;

  const regenDisabled = useMemo(
    () => noBoard || !!regenRun || isImport || isReadOnly,
    [noBoard, regenRun, isImport, isReadOnly],
  );
  const syncDisabled  = useMemo(() => noBoard || !!syncRun || isReadOnly,    [noBoard, syncRun, isReadOnly]);
  const analyzeDisabled = useMemo(() => noBoard || !!analyzeRun || isReadOnly, [noBoard, analyzeRun, isReadOnly]);

  if (!selectedBoard) {
    return <div className="status-bar status-bar--empty">No board selected</div>;
  }

  return (
    <div className="status-bar">
      <span className="status-bar-name">{selectedBoard}</span>
      <span className="status-bar-sep">|</span>
      <span>last generated: {formatRelative(meta?.lastGeneratedAt ?? null)}</span>
      <span className="status-bar-sep">|</span>
      <span>last synced: {formatRelative(meta?.lastSyncedAt ?? null)}</span>
      <span className="status-bar-sep">|</span>
      <span>{stateChip(boardItem?.syncStatus ?? null)}</span>

      <span className="status-bar-sep">|</span>

      {/* Regenerate button */}
      <span className="status-bar-action">
        <button
          className="skill-btn"
          onClick={() => void handleRegenerate()}
          disabled={regenDisabled}
          title={readOnlyTitle ?? (isImport ? 'Imports cannot be regenerated; sync them instead.' : 'Regenerate from graph')}
        >
          {regenRun ? '⟳ ' + phaseLabel(regenRun.phase) : 'Regenerate'}
        </button>
      </span>

      {/* Sync button */}
      <span className="status-bar-action">
        <button
          className="skill-btn"
          onClick={() => void handleSync()}
          disabled={syncDisabled}
          title={readOnlyTitle ?? 'Sync to graph'}
        >
          {syncRun ? '⟳ ' + phaseLabel(syncRun.phase) : 'Sync'}
        </button>
      </span>

      {/* Analyze button */}
      <span className="status-bar-action">
        <button
          className="skill-btn"
          onClick={() => void handleAnalyze()}
          disabled={analyzeDisabled}
          title={readOnlyTitle ?? 'Analyze board'}
        >
          {analyzeRun ? '⟳ ' + phaseLabel(analyzeRun.phase) : 'Analyze'}
        </button>
      </span>
    </div>
  );
}

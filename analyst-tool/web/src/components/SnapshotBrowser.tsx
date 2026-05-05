import { useState, useCallback } from 'react';
import { useStore } from '../state/store.js';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(ts: string): string {
  // ts is like 20260501T120000Z — format for display
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]} UTC`;
  }
  // Fallback for ISO-with-dashes format from safety snapshots
  return ts;
}

export default function SnapshotBrowser() {
  const selectedBoard = useStore((s) => s.selectedBoard);
  const snapshots = useStore((s) => s.snapshots);
  const diffMode = useStore((s) => s.diffMode);
  const enterDiffMode = useStore((s) => s.enterDiffMode);
  const exitDiffMode = useStore((s) => s.exitDiffMode);
  const restoreSnapshot = useStore((s) => s.restoreSnapshot);

  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handleCompare = useCallback(
    (timestamp: string) => {
      void enterDiffMode(timestamp);
    },
    [enterDiffMode],
  );

  const handleRestoreClick = useCallback((timestamp: string) => {
    setConfirmRestore(timestamp);
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    if (!selectedBoard || !confirmRestore) return;
    setRestoring(true);
    try {
      await restoreSnapshot(selectedBoard, confirmRestore);
    } catch {
      // error already logged in store
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
    }
  }, [selectedBoard, confirmRestore, restoreSnapshot]);

  if (!selectedBoard) {
    return null;
  }

  return (
    <div className="snapshot-browser">
      <div className="snapshot-browser-header">
        <span className="snapshot-browser-title">Snapshots</span>
        {diffMode.active && diffMode.stats && (
          <span className="diff-chip">
            Diff vs {diffMode.baselineTimestamp}
            {' '}
            <span className="diff-stat diff-stat--added">+{diffMode.stats.added}</span>
            {' '}
            <span className="diff-stat diff-stat--removed">-{diffMode.stats.removed}</span>
            {' '}
            <span className="diff-stat diff-stat--changed">~{diffMode.stats.changed}</span>
            {' '}
            <button
              className="diff-exit-btn"
              onClick={exitDiffMode}
              title="Exit diff mode"
            >
              Exit diff
            </button>
          </span>
        )}
      </div>

      {snapshots.length === 0 ? (
        <div className="snapshot-browser-empty">No snapshots yet</div>
      ) : (
        <ul className="snapshot-list">
          {snapshots.map((snap) => {
            const isBaseline = diffMode.active && diffMode.baselineTimestamp === snap.timestamp;
            return (
              <li
                key={snap.timestamp}
                className={`snapshot-item${isBaseline ? ' snapshot-item--active' : ''}`}
              >
                <div className="snapshot-meta">
                  <span className="snapshot-ts" title={snap.timestamp}>
                    {formatTimestamp(snap.timestamp)}
                  </span>
                  <span className="snapshot-ago">
                    {formatRelative(snap.createdAt)}
                  </span>
                </div>
                <div className="snapshot-actions">
                  <button
                    className={`snapshot-btn${isBaseline ? ' snapshot-btn--active' : ''}`}
                    onClick={() => handleCompare(snap.timestamp)}
                    title="Compare this snapshot to current"
                  >
                    Compare
                  </button>
                  <button
                    className="snapshot-btn snapshot-btn--restore"
                    onClick={() => handleRestoreClick(snap.timestamp)}
                    title="Restore to this snapshot (current state will be auto-saved)"
                  >
                    Restore
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirmRestore && (
        <div className="restore-confirm-overlay">
          <div className="restore-confirm-dialog">
            <p>
              Restore snapshot <strong>{confirmRestore}</strong>?
            </p>
            <p className="restore-confirm-note">
              The current board state will be automatically saved as a safety snapshot before restoring.
            </p>
            <div className="restore-confirm-actions">
              <button
                className="snapshot-btn"
                onClick={handleRestoreConfirm}
                disabled={restoring}
              >
                {restoring ? 'Restoring...' : 'Confirm Restore'}
              </button>
              <button
                className="snapshot-btn"
                onClick={() => setConfirmRestore(null)}
                disabled={restoring}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

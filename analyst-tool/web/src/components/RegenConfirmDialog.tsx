/**
 * RegenConfirmDialog — shown when the analyst clicks "Regenerate" on a board
 * that has local edits (i.e. hasUnsyncedEdits === true).
 *
 * Three choices:
 *   [Sync to graph first]        — delegates to the existing sync skill path
 *   [Discard local edits and regenerate] — proceeds with overwrite
 *   [Cancel]                     — default focus, closes with no action
 *
 * Closes on Escape. Never surfaces CLI commands — labels are user-facing prose.
 */
import { useEffect, useRef, useCallback } from 'react';

export interface RegenConfirmDialogProps {
  boardName: string;
  onSyncFirst: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export default function RegenConfirmDialog({
  boardName,
  onSyncFirst,
  onDiscard,
  onCancel,
}: RegenConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Auto-focus Cancel on mount (default safe choice)
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="restore-confirm-overlay"
      onClick={(e) => {
        // Close when clicking the backdrop (not the dialog)
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="restore-confirm-dialog regen-confirm-dialog" role="dialog" aria-modal="true">
        <p>
          <strong>{boardName}</strong> has unsaved local changes.
        </p>
        <p className="restore-confirm-note">
          The board was edited since it was last generated from the graph. Regenerating
          will replace the board with the current graph state.
        </p>
        <div className="restore-confirm-actions">
          <button
            className="regen-confirm-btn regen-confirm-btn--sync"
            onClick={onSyncFirst}
          >
            Save changes to graph first
          </button>
          <button
            className="regen-confirm-btn regen-confirm-btn--discard"
            onClick={onDiscard}
          >
            Discard local edits and regenerate
          </button>
          <button
            ref={cancelRef}
            className="regen-confirm-btn regen-confirm-btn--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

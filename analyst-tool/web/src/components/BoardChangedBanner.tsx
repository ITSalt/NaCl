import React from 'react';
import { useStore } from '../state/store.js';

/**
 * CMP-BOARD-CHANGED-BANNER
 *
 * Non-destructive overlay shown when an external write changes the currently-open
 * board (originId != own token). The analyst can reload (fetches fresh scene +
 * remounts canvas) or dismiss (keeps local edits, no fetch).
 *
 * Positioned absolutely over the canvas — the analyst can still see their edits
 * while deciding. z-index 9999 keeps it above Excalidraw's own overlays.
 */
export function BoardChangedBanner(): React.ReactElement | null {
  const pending = useStore((s) => s.pendingBoardChange);
  const confirm = useStore((s) => s.confirmBoardReload);
  const dismiss = useStore((s) => s.dismissBoardChange);

  if (!pending) return null;

  return (
    <div
      data-testid="board-changed-banner"
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'var(--surface-elevated, #fff)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        padding: '10px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        whiteSpace: 'nowrap',
      }}
    >
      <span>Изменено на сервере — Перезагрузить?</span>
      <button
        data-testid="board-changed-banner-reload"
        onClick={confirm}
        style={{
          padding: '4px 12px',
          borderRadius: 4,
          border: '1px solid var(--border, #e5e7eb)',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Перезагрузить
      </button>
      <button
        data-testid="board-changed-banner-dismiss"
        onClick={dismiss}
        style={{
          padding: '4px 12px',
          borderRadius: 4,
          border: '1px solid var(--border, #e5e7eb)',
          cursor: 'pointer',
        }}
      >
        Закрыть
      </button>
    </div>
  );
}

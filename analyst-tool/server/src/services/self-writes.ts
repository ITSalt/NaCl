/**
 * self-writes — short-TTL marker set used to suppress fs-watcher events
 * triggered by the tool's own writeBoard() calls.
 *
 * Without this filter, a single user-driven canvas edit produces a feedback
 * loop:
 *   1. CanvasHost debounced PUT → boards.writeBoard() writes file
 *   2. chokidar fires 'change' → broadcast 'tree.changed' on WS
 *   3. Web app does GET /api/v1/boards (full list) and updates store
 *   4. State change re-renders Excalidraw, which fires onChange → another PUT
 *
 * mark(boardName) is called right after a successful self-write; fs-watcher
 * checks isRecent(boardName) and drops the event if it lands within
 * SUPPRESSION_WINDOW_MS. External writes (skills, manual file edits) are
 * unaffected — they never call mark().
 */

const SUPPRESSION_WINDOW_MS = 2000;

const recent = new Map<string, number>();

export function markSelfWrite(boardName: string): void {
  recent.set(boardName, Date.now());
}

export function isRecentSelfWrite(boardName: string): boolean {
  const ts = recent.get(boardName);
  if (ts === undefined) return false;
  if (Date.now() - ts > SUPPRESSION_WINDOW_MS) {
    recent.delete(boardName);
    return false;
  }
  return true;
}

/** Test-only helper. */
export function _resetSelfWrites(): void {
  recent.clear();
}

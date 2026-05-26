/**
 * ws-mock.ts — WebSocket message injection helpers for UC-020 live-update tests.
 *
 * The frontend exposes `window.__injectWsMessage(msg)` (set in api/ws.ts) and
 * `window.__originId` (the stable per-client UUID). These helpers call those
 * hooks via `page.evaluate(...)`.
 *
 * No live WebSocket or server is needed — messages are dispatched directly into
 * the in-process handler map.
 */

import type { Page } from '@playwright/test';

/** Injects a synthetic board.changed message for the given board channel. */
export async function injectBoardChanged(
  page: Page,
  boardName: string,
  opts: { mtime?: number; originId?: string | null } = {},
): Promise<void> {
  const mtime = opts.mtime ?? Date.now();
  const originId = opts.hasOwnProperty('originId') ? opts.originId : 'other-client';
  await page.evaluate(
    ({ channel, type, board, mtime, originId }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (typeof w.__injectWsMessage === 'function') {
        w.__injectWsMessage({ type, channel, payload: { board, mtime, originId }, board, mtime, originId });
      }
    },
    { channel: `board:${boardName}`, type: 'board.changed', board: boardName, mtime, originId },
  );
}

/** Injects a synthetic tree.changed message on the boards channel. */
export async function injectTreeChanged(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.__injectWsMessage === 'function') {
      w.__injectWsMessage({ type: 'tree.changed', channel: 'boards' });
    }
  });
}

/** Returns the stable originId that this page tab generated at startup. */
export async function getPageOriginId(page: Page): Promise<string> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__originId as string;
  });
}

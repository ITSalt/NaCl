/**
 * fs-watcher restart tests.
 * Verifies that after restart(newDir), events come from the new directory only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { start } from './fs-watcher.js';

/**
 * Wait for a condition to become true, polling every 50 ms up to timeoutMs.
 */
function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(interval);
        reject(new Error('waitFor timed out'));
      }
    }, 50);
  });
}

describe('fs-watcher restart', () => {
  it('detects add events in dir A before restart', async () => {
    const dirA = await mkdtemp(join(tmpdir(), 'nacl-watcher-test-a-'));
    const events: string[] = [];

    const stop = start(dirA, (ev) => {
      events.push(`${ev.type}:${ev.boardName}`);
    });

    try {
      await writeFile(join(dirA, 'a.excalidraw'), '{}', 'utf-8');
      await waitFor(() => events.some((e) => e.includes('a')));
      assert.ok(events.some((e) => e.includes('a')), `expected add event for a, got: ${JSON.stringify(events)}`);
    } finally {
      await stop();
      await rm(dirA, { recursive: true, force: true });
    }
  });

  it('after restart, events come from new dir B, not old dir A', async () => {
    const dirA = await mkdtemp(join(tmpdir(), 'nacl-watcher-test-a2-'));
    const dirB = await mkdtemp(join(tmpdir(), 'nacl-watcher-test-b-'));
    const events: string[] = [];

    const stop = start(dirA, (ev) => {
      events.push(`${ev.type}:${ev.boardName}:${ev.mtime ? 'ok' : 'no-mtime'}`);
    });

    try {
      // Restart on dir B
      await stop.handle.restart(dirB);

      // Write to dir A — should be ignored
      await writeFile(join(dirA, 'stale.excalidraw'), '{}', 'utf-8');
      // Give it a moment; if watcher leaked, we'd catch 'stale' event
      await new Promise((r) => setTimeout(r, 400));

      const beforeB = events.filter((e) => e.includes('stale'));
      assert.equal(beforeB.length, 0, `stale event from dir A should not appear after restart, got: ${JSON.stringify(events)}`);

      // Write to dir B — should be received
      await writeFile(join(dirB, 'b.excalidraw'), '{}', 'utf-8');
      await waitFor(() => events.some((e) => e.includes('b')));
      assert.ok(events.some((e) => e.includes('b')), `expected event for b.excalidraw, got: ${JSON.stringify(events)}`);
    } finally {
      await stop();
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });
});

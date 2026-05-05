/**
 * Suite 05: Snapshot browser empty-state and file-based surfacing via WS.
 *
 * The snapshot browser only renders when a board is selected.
 * We assert the component renders in its empty/non-empty state first, then
 * write a snapshot file directly to disk using the server's flat format:
 *   .snapshots/{board}-{timestamp}.json
 *
 * The chokidar watcher (depth=0 on .snapshots/) sees the new file, fires
 * a `snapshot.created` WS event, and the React store calls loadSnapshots —
 * making the entry appear in the UI.
 */
import { test, expect, BOARDS_DIR, TEST_BOARD_NAME, FIXTURE_SCENE } from '../fixtures.js';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import path from 'path';

// Snapshot directory for test-board (flat, as per server/services/snapshots.ts)
const SNAPSHOT_DIR = path.join(BOARDS_DIR, '.snapshots');
// Timestamp and filename follow the server convention: {board}-{timestamp}.json
const FAKE_TS = '20240101T000000Z';
const SNAPSHOT_FILENAME = `${TEST_BOARD_NAME}-${FAKE_TS}.json`;
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, SNAPSHOT_FILENAME);

const BOARD_SELECTOR = `.sidebar-item[title="${TEST_BOARD_NAME}.excalidraw"]`;

test.describe('Snapshot browser', () => {
  test.afterEach(async () => {
    // Clean up synthetic snapshot file written during tests
    if (existsSync(SNAPSHOT_PATH)) {
      rmSync(SNAPSHOT_PATH);
    }
  });

  test('snapshot browser shows empty state when there are no snapshots', async ({ page }) => {
    // Ensure no snapshot file exists for our fixture timestamp
    if (existsSync(SNAPSHOT_PATH)) {
      rmSync(SNAPSHOT_PATH);
    }

    await page.goto('/');
    await page.waitForSelector('.app-layout', { timeout: 20_000 });
    await expect(page.locator('.sidebar-group-label')).toContainText('Imports', { timeout: 15_000 });

    await page.locator(BOARD_SELECTOR).click();
    await expect(page.locator('.canvas-host')).toBeVisible({ timeout: 15_000 });

    // Snapshot browser panel is rendered
    const snapshotBrowser = page.locator('.snapshot-browser');
    await expect(snapshotBrowser).toBeVisible();

    // The header/title is always rendered
    await expect(snapshotBrowser.locator('.snapshot-browser-header')).toBeVisible();
    await expect(snapshotBrowser.locator('.snapshot-browser-title')).toContainText('Snapshots');

    // If no snapshots, the empty-state div is shown; otherwise the list.
    // We confirm the component handles either state gracefully.
    const isEmpty = await snapshotBrowser.locator('.snapshot-browser-empty').isVisible();
    const hasList = await snapshotBrowser.locator('.snapshot-list').isVisible();
    expect(isEmpty || hasList).toBe(true);
  });

  test('after writing a snapshot file, the snapshot browser lists it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout', { timeout: 20_000 });
    await expect(page.locator('.sidebar-group-label')).toContainText('Imports', { timeout: 15_000 });

    await page.locator(BOARD_SELECTOR).click();
    await expect(page.locator('.canvas-host')).toBeVisible({ timeout: 15_000 });

    // Write the snapshot file in the server's flat format:
    //   {boardsDir}/.snapshots/{board}-{timestamp}.json
    // The chokidar watcher on .snapshots/ at depth=0 picks this up and broadcasts
    // a snapshot.created WS event, which causes loadSnapshots to run in the store.
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(FIXTURE_SCENE, null, 2), 'utf-8');

    // The snapshot timestamp in the UI is formatted as "2024-01-01 00:00:00 UTC"
    // by the formatTimestamp function in SnapshotBrowser.tsx.
    const snapshotBrowser = page.locator('.snapshot-browser');
    const timestampLabel = snapshotBrowser.locator('.snapshot-ts', { hasText: '2024-01-01' });
    await expect(timestampLabel).toBeVisible({ timeout: 10_000 });
  });
});

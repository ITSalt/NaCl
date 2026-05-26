/**
 * Suite 02: Canvas renders and dirty-state tracking.
 *
 * Approach for "dirty" detection:
 * - We PUT a modified scene directly to the API from the test.
 * - The server marks the board dirty (its hash now diverges from the synced
 *   baseline meta written by the ensureTestBoard fixture).
 * - The edit is out-of-band, and writeBoard suppresses the self-write watcher
 *   echo, so we reload the page to re-fetch the recomputed board list, then
 *   assert the 🟡 dot appears in the sidebar.
 *
 * This avoids having to inject an Excalidraw API hook and is more reliable
 * than simulating mouse drags inside the canvas iframe.
 */
import { test, expect, TEST_BOARD_NAME, FIXTURE_SCENE } from '../fixtures.js';

// The board-classifier strips the "-board" suffix for displayName.
// The sidebar item's title attribute contains the full filename.
const BOARD_SELECTOR = `.sidebar-item[title="${TEST_BOARD_NAME}.excalidraw"]`;

test.describe('Canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout', { timeout: 20_000 });
    // Wait for boards to load from API
    await expect(page.locator('.sidebar-group-label')).toContainText('Imports', { timeout: 15_000 });
  });

  test('selecting test-board renders elements on the canvas', async ({ page }) => {
    await page.locator(BOARD_SELECTOR).click();

    // Canvas host should appear (no longer shows the placeholder)
    await expect(page.locator('.canvas-host')).toBeVisible({ timeout: 15_000 });

    // Excalidraw renders a .excalidraw container once the board is loaded
    await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 15_000 });
  });

  test('editing the canvas via API marks the board as dirty (🟡)', async ({ page, request }) => {
    // Select test-board first
    await page.locator(BOARD_SELECTOR).click();
    await expect(page.locator('.canvas-host')).toBeVisible({ timeout: 15_000 });

    // Mutate the scene via API — add a new element to trigger hash mismatch
    const modifiedScene = {
      ...FIXTURE_SCENE,
      elements: [
        ...FIXTURE_SCENE.elements,
        {
          id: 'rect-e2e-dirty',
          type: 'rectangle',
          x: 600, y: 100, width: 100, height: 60,
          angle: 0,
          strokeColor: '#e03131',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          seed: 9999,
          version: 1,
          versionNonce: 9999,
          isDeleted: false,
          groupIds: [],
          boundElements: [],
          updated: Date.now(),
          link: null,
          locked: false,
        },
      ],
    };

    const apiRes = await request.put(
      `http://127.0.0.1:3583/api/v1/boards/${TEST_BOARD_NAME}`,
      {
        data: { scene: modifiedScene },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    expect(apiRes.status()).toBe(200);

    // The edit was made out-of-band (APIRequestContext). writeBoard suppresses
    // the fs-watcher self-write echo, so no board.changed WS event reaches this
    // already-loaded page (external edits don't live-update clients today — see
    // boards.ts self-write coordination). Reload to re-fetch the board list,
    // which the server recomputes as dirty: the board's hash now diverges from
    // the synced baseline written by the ensureTestBoard fixture.
    await page.reload();
    await page.waitForSelector('.app-layout', { timeout: 20_000 });
    await expect(page.locator('.sidebar-group-label')).toContainText('Imports', { timeout: 15_000 });

    const testBoardBtn = page.locator(BOARD_SELECTOR);
    await expect(testBoardBtn.locator('.sidebar-item-dot')).toContainText('🟡', { timeout: 8_000 });
  });
});

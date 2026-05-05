/**
 * Suite 04: Status bar labels and import-board button-disable logic.
 */
import { test, expect, TEST_BOARD_NAME } from '../fixtures.js';

const BOARD_SELECTOR = `.sidebar-item[title="${TEST_BOARD_NAME}.excalidraw"]`;

test.describe('Status bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout', { timeout: 20_000 });
    // Select test-board so the status bar is populated
    await expect(page.locator('.sidebar-group-label')).toContainText('Imports', { timeout: 15_000 });
    await page.locator(BOARD_SELECTOR).click();
    await expect(page.locator('.canvas-host')).toBeVisible({ timeout: 15_000 });
  });

  test('status bar shows last generated / last synced labels', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toBeVisible();

    // Both label texts should be present somewhere in the status bar
    await expect(statusBar).toContainText('last generated:');
    await expect(statusBar).toContainText('last synced:');

    // Board name should appear
    await expect(statusBar).toContainText(TEST_BOARD_NAME);
  });

  test('Regenerate button is disabled for import boards', async ({ page }) => {
    /**
     * test-board is classified as an 'import' board (name ends with -board).
     * The status bar disables the Regenerate button for import boards and
     * shows the title tooltip "Imports cannot be regenerated; sync them instead."
     *
     * We also route-intercept POST /api/v1/skills/regenerate to confirm
     * the button doesn't fire even if clicked programmatically.
     */
    let regenerateCalled = false;
    await page.route('**/api/v1/skills/regenerate', (route) => {
      regenerateCalled = true;
      void route.abort();
    });

    const regenBtn = page.locator('.skill-btn', { hasText: 'Regenerate' });
    await expect(regenBtn).toBeDisabled();

    // Attempt a programmatic click — should be ignored because disabled
    await regenBtn.click({ force: true });
    // Small wait to allow any erroneous fetch to fire
    await page.waitForTimeout(200);
    expect(regenerateCalled).toBe(false);
  });
});

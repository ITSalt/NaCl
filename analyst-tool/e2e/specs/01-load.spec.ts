/**
 * Suite 01: App loads and sidebar tree is visible.
 */
import { test, expect } from '../fixtures.js';

test.describe('App loads', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for React to hydrate — the app-layout div is rendered by React, not in the HTML shell
    await page.waitForSelector('.app-layout', { timeout: 20_000 });
  });

  test('loads the app and shows the sidebar', async ({ page }) => {
    // Header is present
    await expect(page.locator('.app-title')).toContainText('NaCl Analyst Tool', { timeout: 15_000 });

    // Sidebar element rendered
    await expect(page.locator('.sidebar')).toBeVisible();

    // Board tree has at least one group label — waits for API response
    await expect(page.locator('.sidebar-group-label').first()).toBeVisible({ timeout: 15_000 });
  });

  test('shows test-board under the Imports group', async ({ page }) => {
    // Wait for boards to load from API
    await expect(page.locator('.sidebar-group-label')).toContainText('Imports', { timeout: 15_000 });

    // Find the Imports group and check test-board is present
    const importsGroup = page.locator('.sidebar-group', { has: page.locator('.sidebar-group-label', { hasText: 'Imports' }) });
    await expect(importsGroup).toBeVisible();

    // displayName for test-board is "test" (the classifier strips the -board suffix)
    const testBoardBtn = importsGroup.locator('.sidebar-item[title="test-board.excalidraw"]');
    await expect(testBoardBtn).toBeVisible();
  });
});

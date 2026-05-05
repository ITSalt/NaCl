/**
 * Suite 03: Search bar finds board elements by text.
 *
 * The test-board.excalidraw fixture contains an element with text "Decision".
 * The search endpoint `/api/v1/search?q=Decision` should return a board hit
 * for test-board. Clicking it selects the board.
 *
 * Note: Neo4j graph search is skipped — it requires a running Neo4j instance.
 * The search service falls back to board-only results when Neo4j is unavailable,
 * so this test still exercises the full browser-to-server flow.
 */
import { test, expect, TEST_BOARD_NAME } from '../fixtures.js';

const BOARD_SELECTOR = `.sidebar-item[title="${TEST_BOARD_NAME}.excalidraw"]`;

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout', { timeout: 20_000 });
    await expect(page.locator('.sidebar-group-label')).toContainText('Imports', { timeout: 15_000 });
  });

  test('search finds "Decision" text in test-board', async ({ page }) => {
    // Focus the global search input
    const searchInput = page.locator('.sidebar-search--global .sidebar-search-input');
    await searchInput.click();
    await searchInput.fill('Decision');

    // Dropdown should appear with a result referencing test-board
    const dropdown = page.locator('.search-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    // At least one result row should mention test-board
    const resultRow = dropdown.locator('.search-result-row', { hasText: 'test-board' });
    await expect(resultRow).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a search result selects the board', async ({ page }) => {
    const searchInput = page.locator('.sidebar-search--global .sidebar-search-input');
    await searchInput.click();
    await searchInput.fill('Decision');

    const dropdown = page.locator('.search-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    const resultRow = dropdown.locator('.search-result-row', { hasText: 'test-board' });
    await expect(resultRow).toBeVisible({ timeout: 5_000 });
    await resultRow.click();

    // After clicking, the board should be selected and the canvas visible
    await expect(page.locator('.canvas-host')).toBeVisible({ timeout: 15_000 });

    // The sidebar item for test-board should have the active class
    const activeBoardBtn = page.locator(`${BOARD_SELECTOR}.sidebar-item--active`);
    await expect(activeBoardBtn).toBeVisible({ timeout: 5_000 });
  });
});

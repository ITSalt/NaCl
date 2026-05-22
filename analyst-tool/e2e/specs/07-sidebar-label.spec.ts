/**
 * Suite 07: Sidebar renders `label` as a subtitle below `displayName`.
 *
 * These tests stub the `/api/v1/boards` response via page.route() so they are
 * fully deterministic and do not depend on a specific project state or Neo4j.
 *
 * TC-1: subtitle shows when label is present
 * TC-2: no subtitle when label is null
 * TC-3: filter box matches by label
 * TC-4: layout doesn't break — Regenerate button stays visible
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

const ACTIVITY_BOARD = {
  name: 'activity-UC-003',
  path: '/fake/boards/activity-UC-003.excalidraw',
  kind: 'activity',
  relatedId: 'UC-003',
  displayName: 'UC-003',
  label: 'Regenerate Board from Graph',
  group: 'Activities (UC)',
  mtime: '2026-01-01T00:00:00.000Z',
  syncStatus: 'synced',
  lastGeneratedAt: '2026-01-01T00:00:00.000Z',
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
  hasUnsyncedEdits: false,
};

const DOMAIN_MODEL_BOARD = {
  name: 'domain-model',
  path: '/fake/boards/domain-model.excalidraw',
  kind: 'domain-model',
  relatedId: null,
  displayName: 'Domain Model',
  label: null,
  group: 'Domain Model',
  mtime: '2026-01-01T00:00:00.000Z',
  syncStatus: 'synced',
  lastGeneratedAt: null,
  lastSyncedAt: null,
  hasUnsyncedEdits: false,
};

const STUB_BOARDS = [ACTIVITY_BOARD, DOMAIN_MODEL_BOARD];

// Stub both /boards and /renderable so the sidebar renders without error
async function stubApis(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/boards', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_BOARDS),
    }),
  );
  await page.route('**/api/v1/renderable', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadWithStubs(page: import('@playwright/test').Page): Promise<void> {
  await stubApis(page);
  await page.goto('/');
  await page.waitForSelector('.app-layout', { timeout: 20_000 });
  // Wait for at least one sidebar group to confirm the stubbed boards rendered
  await expect(page.locator('.sidebar-group-label').first()).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Sidebar label subtitle', () => {
  test('TC-1: subtitle shows when label is present', async ({ page }) => {
    await loadWithStubs(page);

    // The activity board has a non-null label — subtitle span must be present
    const activityRow = page.locator('.sidebar-item[title="activity-UC-003.excalidraw"]');
    await expect(activityRow).toBeVisible({ timeout: 10_000 });

    const subtitle = activityRow.locator('[data-testid="sidebar-item-label"]');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toHaveText('Regenerate Board from Graph');
  });

  test('TC-2: no subtitle when label is null', async ({ page }) => {
    await loadWithStubs(page);

    // The domain-model board has label: null — subtitle span must be absent
    const domainRow = page.locator('.sidebar-item[title="domain-model.excalidraw"]');
    await expect(domainRow).toBeVisible({ timeout: 10_000 });

    const subtitle = domainRow.locator('[data-testid="sidebar-item-label"]');
    await expect(subtitle).toHaveCount(0);
  });

  test('TC-3: filter matches by label', async ({ page }) => {
    await loadWithStubs(page);

    // Wait for both groups
    await expect(page.locator('.sidebar-item[title="activity-UC-003.excalidraw"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.sidebar-item[title="domain-model.excalidraw"]')).toBeVisible({ timeout: 10_000 });

    // Type a substring that matches only the activity board's label
    const filterInput = page.locator('.sidebar-search:not(.sidebar-search--global) .sidebar-search-input');
    await filterInput.fill('Regenerate Board');

    // Activity board (matched by label) must stay visible
    await expect(page.locator('.sidebar-item[title="activity-UC-003.excalidraw"]')).toBeVisible({ timeout: 5_000 });

    // Domain model board (no label, displayName doesn't match) must be hidden
    await expect(page.locator('.sidebar-item[title="domain-model.excalidraw"]')).toHaveCount(0);
  });

  test('TC-4: Regenerate button stays visible when subtitle is present', async ({ page }) => {
    await loadWithStubs(page);

    const activityRow = page.locator('.sidebar-item-row', {
      has: page.locator('.sidebar-item[title="activity-UC-003.excalidraw"]'),
    });
    await expect(activityRow).toBeVisible({ timeout: 10_000 });

    // Hover the row to trigger the CSS that shows the regen button
    await activityRow.hover();

    const regenBtn = activityRow.locator('.sidebar-item-regen');
    await expect(regenBtn).toBeVisible({ timeout: 5_000 });

    // Verify the button is actually in the viewport (not pushed off-screen)
    const box = await regenBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});

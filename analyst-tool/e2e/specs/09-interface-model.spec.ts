/**
 * Suite 09: Interface-model board surfaces in the correct sidebar group
 * and the ↺ Regenerate button posts `POST /skills/regenerate { board: "interface-model" }`.
 *
 * All tests use page.route() stubs — no live stack required.
 *
 * TC-1: interface-model board appears under "Interface Model" group (not "Other")
 * TC-2: ↺ Regenerate button is present for interface-model (canRegen = true)
 * TC-3: clicking ↺ Regenerate triggers POST /skills/regenerate with board = "interface-model"
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

const INTERFACE_MODEL_BOARD = {
  name: 'interface-model',
  path: '/fake/boards/interface-model.excalidraw',
  kind: 'interface-model',
  relatedId: null,
  displayName: 'Interface Model',
  label: null,
  group: 'Interface Model',
  mtime: '2026-01-01T00:00:00.000Z',
  syncStatus: 'synced',
  lastGeneratedAt: '2026-01-01T00:00:00.000Z',
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
  hasUnsyncedEdits: false,
};

const STUB_BOARDS = [INTERFACE_MODEL_BOARD];

const STUB_SCENE = {
  type: 'excalidraw',
  version: 2,
  elements: [],
  appState: { viewBackgroundColor: '#ffffff', gridSize: null },
  files: {},
};

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
  // Board load (needed so selectBoard doesn't throw)
  await page.route('**/api/v1/boards/interface-model', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scene: STUB_SCENE, meta: {}, mtime: '2026-01-01T00:00:00.000Z' }),
      });
    }
    return route.fallback();
  });
  // Regenerate skill endpoint
  await page.route('**/api/v1/skills/regenerate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runId: 'test-run-001' }),
    }),
  );
  // Runs status (needed by the store after regenerate)
  await page.route('**/api/v1/runs/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runId: 'test-run-001', kind: 'regenerate', board: 'interface-model', phase: 'completed' }),
    }),
  );
  // Projects endpoints
  await page.route('**/api/v1/projects/active', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        project: { id: 'test-proj', name: 'Test Project', root: '/tmp/test', createdAt: '2026-01-01T00:00:00.000Z', lastUsed: '2026-01-01T00:00:00.000Z' },
        source: 'registry',
        resolvedConfig: { port: 3582, host: '127.0.0.1', boardsDir: '/tmp/boards', repoRoot: '/tmp/test', projectId: 'test-proj', source: 'registry' },
      }),
    }),
  );
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [], activeProjectId: 'test-proj', source: 'registry', unregisteredCwdProjectId: null }),
    }),
  );
}

async function loadWithStubs(page: import('@playwright/test').Page): Promise<void> {
  await stubApis(page);
  await page.goto('/');
  await page.waitForSelector('.app-layout', { timeout: 20_000 });
  await expect(page.locator('.sidebar-group-label').first()).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Interface-model board in sidebar', () => {
  test('TC-1: interface-model appears under "Interface Model" group', async ({ page }) => {
    await loadWithStubs(page);

    // The "Interface Model" group header must exist
    const groupLabel = page.locator('.sidebar-group-label', { hasText: 'Interface Model' });
    await expect(groupLabel).toBeVisible({ timeout: 10_000 });

    // The board row must be inside that group, not "Other"
    const interfaceGroup = page.locator('.sidebar-group', {
      has: page.locator('.sidebar-group-label', { hasText: 'Interface Model' }),
    });
    const boardBtn = interfaceGroup.locator('.sidebar-item[title="interface-model.excalidraw"]');
    await expect(boardBtn).toBeVisible({ timeout: 10_000 });

    // Confirm it is NOT in the "Other" group
    const otherGroup = page.locator('.sidebar-group', {
      has: page.locator('.sidebar-group-label', { hasText: 'Other' }),
    });
    await expect(otherGroup).toHaveCount(0);
  });

  test('TC-2: Regenerate button is present for interface-model', async ({ page }) => {
    await loadWithStubs(page);

    const boardRow = page.locator('.sidebar-item-row', {
      has: page.locator('.sidebar-item[title="interface-model.excalidraw"]'),
    });
    await expect(boardRow).toBeVisible({ timeout: 10_000 });
    await boardRow.hover();

    const regenBtn = boardRow.locator('.sidebar-item-regen');
    await expect(regenBtn).toBeVisible({ timeout: 5_000 });
    await expect(regenBtn).not.toBeDisabled();
  });

  test('TC-3: clicking Regenerate posts POST /skills/regenerate { board: "interface-model" }', async ({ page }) => {
    const regenRequests: string[] = [];

    await stubApis(page);
    // Intercept regenerate calls to capture request body
    await page.route('**/api/v1/skills/regenerate', async (route) => {
      const body = route.request().postDataJSON() as { board?: string };
      regenRequests.push(body.board ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ runId: 'test-run-001' }),
      });
    });

    await page.goto('/');
    await page.waitForSelector('.app-layout', { timeout: 20_000 });
    await expect(page.locator('.sidebar-group-label').first()).toBeVisible({ timeout: 15_000 });

    const boardRow = page.locator('.sidebar-item-row', {
      has: page.locator('.sidebar-item[title="interface-model.excalidraw"]'),
    });
    await boardRow.hover();

    const regenBtn = boardRow.locator('.sidebar-item-regen');
    await expect(regenBtn).toBeVisible({ timeout: 5_000 });
    await regenBtn.click();

    // Wait for the request to be captured
    await page.waitForTimeout(500);

    expect(regenRequests).toContain('interface-model');
  });
});

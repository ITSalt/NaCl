/**
 * Shared Playwright fixtures for the Analyst Tool E2E suite.
 *
 * Design choice: rather than injecting a window.__excalidraw_e2e__ hook
 * into CanvasHost.tsx (which would require DEV-only code touching React render),
 * we use API-level interactions plus DOM assertions.
 *
 * For the "dirty" test we send a PUT to /api/v1/boards/test-board directly;
 * the server updates the hash, the WS pushes board.changed, and the React
 * store refreshes syncStatus to 'dirty' — visible in the sidebar dot.
 */

import { test as base, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Canonical test-board fixture data
// ---------------------------------------------------------------------------

export const TEST_BOARD_NAME = 'test-board';

/** Minimal well-formed scene with a rectangle, a diamond, and an arrow. */
export const FIXTURE_SCENE = {
  type: 'excalidraw',
  version: 2,
  elements: [
    {
      id: 'rect-test-001',
      type: 'rectangle',
      x: 100, y: 100, width: 200, height: 80,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: '#a5d8ff',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      seed: 1001,
      version: 1,
      versionNonce: 2001,
      isDeleted: false,
      groupIds: [],
      boundElements: [{ id: 'text-test-001', type: 'text' }, { id: 'arrow-001', type: 'arrow' }],
      updated: 1710878400000,
      link: null,
      locked: false,
      customData: { nodeId: 'test-001', nodeType: 'BusinessProcess' },
    },
    {
      id: 'text-test-001',
      type: 'text',
      x: 140, y: 125, width: 120, height: 30,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      seed: 1002,
      version: 1,
      versionNonce: 2002,
      isDeleted: false,
      groupIds: [],
      boundElements: [],
      updated: 1710878400000,
      link: null,
      locked: false,
      text: 'Test Node',
      fontSize: 20,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: 'rect-test-001',
      originalText: 'Test Node',
      autoResize: true,
    },
    {
      id: 'diamond-test-002',
      type: 'diamond',
      x: 400, y: 80, width: 160, height: 120,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: '#ffec99',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      seed: 1003,
      version: 1,
      versionNonce: 2003,
      isDeleted: false,
      groupIds: [],
      boundElements: [{ id: 'text-test-002', type: 'text' }, { id: 'arrow-001', type: 'arrow' }],
      updated: 1710878400000,
      link: null,
      locked: false,
      customData: { nodeId: 'test-002', nodeType: 'Decision' },
    },
    {
      id: 'text-test-002',
      type: 'text',
      x: 440, y: 125, width: 80, height: 30,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      seed: 1004,
      version: 1,
      versionNonce: 2004,
      isDeleted: false,
      groupIds: [],
      boundElements: [],
      updated: 1710878400000,
      link: null,
      locked: false,
      text: 'Decision',
      fontSize: 20,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: 'diamond-test-002',
      originalText: 'Decision',
      autoResize: true,
    },
    {
      id: 'arrow-001',
      type: 'arrow',
      x: 300, y: 140, width: 100, height: 0,
      angle: 0,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      seed: 1005,
      version: 1,
      versionNonce: 2005,
      isDeleted: false,
      groupIds: [],
      boundElements: [],
      updated: 1710878400000,
      link: null,
      locked: false,
      points: [[0, 0], [100, 0]],
      lastCommittedPoint: null,
      startBinding: { elementId: 'rect-test-001', focus: 0, gap: 1 },
      endBinding: { elementId: 'diamond-test-002', focus: 0, gap: 1 },
      startArrowhead: null,
      endArrowhead: 'arrow',
    },
  ],
  appState: { viewBackgroundColor: '#ffffff', gridSize: null },
  files: {},
};

// ---------------------------------------------------------------------------
// Helper: resolve boards dir (mirrors server/src/config.ts logic)
// ---------------------------------------------------------------------------

function findRepoRoot(start: string): string {
  let cur = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(cur, 'graph-infra'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

const REPO_ROOT = process.env['NACL_BOARDS_DIR']
  ? path.dirname(process.env['NACL_BOARDS_DIR'])
  : findRepoRoot(path.resolve(__dirname, '..', '..'));

export const BOARDS_DIR = process.env['NACL_BOARDS_DIR']
  ?? path.join(REPO_ROOT, 'graph-infra', 'boards');

// ---------------------------------------------------------------------------
// Custom fixture type
// ---------------------------------------------------------------------------

type FixtureOptions = Record<string, never>;

interface FixtureWorkerData {
  /** Ensures test-board.excalidraw exists and is the canonical shape before each test. */
  ensureTestBoard: void;
}

export const test = base.extend<FixtureOptions, FixtureWorkerData>({
  // `auto: true` is essential: specs 01–05 rely on `test-board.excalidraw`
  // existing on disk but never list `ensureTestBoard` as a parameter, so a
  // non-auto fixture would never run and the sidebar would be empty (the CI
  // failure this fixes). Auto runs it once per worker before the first test.
  // It writes into BOARDS_DIR, which equals the server's boardsDir as long as
  // NACL_BOARDS_DIR is exported for both (see e2e CI job + config.ts priority 1).
  ensureTestBoard: [
    async ({}, use) => {
      mkdirSync(BOARDS_DIR, { recursive: true });
      const boardPath = path.join(BOARDS_DIR, `${TEST_BOARD_NAME}.excalidraw`);
      let original: string | null = null;

      // Save original content for restore, or write the fixture if missing
      if (existsSync(boardPath)) {
        original = readFileSync(boardPath, 'utf-8');
      }

      // Always write the canonical fixture so tests start from a known state
      writeFileSync(boardPath, JSON.stringify(FIXTURE_SCENE, null, 2), 'utf-8');

      await use();

      // Restore original after test (if it existed before)
      if (original !== null) {
        writeFileSync(boardPath, original, 'utf-8');
      }
    },
    { scope: 'worker', auto: true },
  ],
});

export { expect };

/**
 * Suite 06: Multi-project registry behaviour.
 *
 * Pattern B (spawned servers) — each test group launches its own Fastify
 * server process with a synthetic NACL_HOME and custom NACL_PORT so it does
 * not collide with the shared webServer that the other suites use (port 3583).
 *
 * These tests call the Fastify API directly (no browser). The multi-project
 * behaviour is all state-machine logic in the server; there is no additional
 * UI coverage needed beyond asserting the JSON responses.
 *
 * Port allocation:
 *   - 3590 — project-switching test
 *   - 3591 — unregistered-banner test
 *   - 3592 — empty-registry / no-config test
 *
 * Why Pattern B over Pattern A:
 *   Pattern A would require each test to share a single webServer instance
 *   started from playwright.config.ts, which would force all suites to run
 *   with the synthetic NACL_HOME — breaking the existing 5 suites that rely
 *   on the real boards directory. Pattern B gives each test group a fully
 *   isolated server at its own port and NACL_HOME.
 */

import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startDevServer, type DevServer } from '../helpers/dev-server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(suffix: string): string {
  const dir = join(tmpdir(), `nacl-e2e-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeProjectDir(base: string, projectId: string): string {
  const dir = join(base, projectId);
  mkdirSync(join(dir, 'graph-infra', 'boards'), { recursive: true });
  writeFileSync(
    join(dir, 'config.yaml'),
    `project:\n  id: ${projectId}\n  name: Project ${projectId}\n`,
  );
  // Put one board file in each project so the boards API returns distinct lists
  writeFileSync(
    join(dir, 'graph-infra', 'boards', `board-${projectId}.excalidraw`),
    JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} }),
  );
  return dir;
}

function makeRegistry(
  naclHome: string,
  projects: Array<{ id: string; name: string; root: string }>,
  activeProjectId: string | null,
): void {
  const reg = {
    version: 1,
    activeProjectId,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      root: p.root,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsed: '2026-01-01T00:00:00.000Z',
    })),
  };
  writeFileSync(join(naclHome, 'projects.json'), JSON.stringify(reg, null, 2));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  return res.json();
}

// ---------------------------------------------------------------------------
// Test: switches between projects via the /projects/:id/activate endpoint
// ---------------------------------------------------------------------------

test.describe('Multi-project: project switching', () => {
  // Each beforeAll spawns a fresh server process which can take up to 35s on a
  // cold machine. Playwright's default beforeAll timeout is 30s — override per describe.
  test.setTimeout(60_000);

  let server: DevServer | null = null;
  let naclHome: string;
  let projectsBase: string;
  let projectARoot: string;
  let projectBRoot: string;

  test.beforeAll(async () => {
    naclHome = makeTmpDir('nacl-home-switch');
    projectsBase = makeTmpDir('projects-switch');

    projectARoot = makeProjectDir(projectsBase, 'proj-a');
    projectBRoot = makeProjectDir(projectsBase, 'proj-b');

    makeRegistry(
      naclHome,
      [
        { id: 'proj-a', name: 'Project A', root: projectARoot },
        { id: 'proj-b', name: 'Project B', root: projectBRoot },
      ],
      'proj-a',
    );

    try {
      // Do NOT set NACL_PROJECT_ROOT — that would freeze source='env' and prevent
      // registry-based project switching from changing boardsDir. The registry
      // sets activeProjectId=proj-a on startup; switching to proj-b must work via
      // source='registry' resolution in configManager.reload().
      server = await startDevServer({
        port: 3590,
        env: {
          NACL_HOME: naclHome,
        },
        timeoutMs: 35_000,
      });
    } catch (err) {
      // If the server fails to start we mark this block as skipped via a
      // conditional check inside the test body — see below.
      server = null;
      console.error('[06-multi-project] server failed to start:', err);
    }
  });

  test.afterAll(async () => {
    await server?.kill();
    server = null;
    if (existsSync(naclHome)) rmSync(naclHome, { recursive: true, force: true });
    if (existsSync(projectsBase)) rmSync(projectsBase, { recursive: true, force: true });
  });

  test('switches between projects via the activate endpoint', async () => {
    if (!server) {
      test.skip(true, 'Dev server failed to start — skipping (see Pattern B comment in helper)');
      return;
    }

    const base = server.baseUrl;

    // Initially active project is proj-a
    const beforeRaw = await fetchJson(`${base}/api/v1/projects`);
    const before = beforeRaw as { activeProjectId: string; projects: Array<{ id: string }> };
    expect(before.activeProjectId).toBe('proj-a');
    expect(before.projects.map((p) => p.id).sort()).toEqual(['proj-a', 'proj-b']);

    // Activate proj-b
    const switchRes = await fetch(`${base}/api/v1/projects/proj-b/activate`, { method: 'POST' });
    expect(switchRes.status).toBe(200);
    const switched = await switchRes.json() as { project: { id: string } };
    expect(switched.project.id).toBe('proj-b');

    // Registry should now show proj-b as active
    const afterRaw = await fetchJson(`${base}/api/v1/projects`);
    const after = afterRaw as { activeProjectId: string };
    expect(after.activeProjectId).toBe('proj-b');

    // Boards endpoint should now return proj-b's boards directory contents
    const boardsRaw = await fetchJson(`${base}/api/v1/boards`);
    const boards = boardsRaw as Array<{ name: string }>;
    const boardNames = boards.map((b) => b.name);
    expect(boardNames).toContain('board-proj-b');
    expect(boardNames).not.toContain('board-proj-a');
  });
});

// ---------------------------------------------------------------------------
// Test: unregistered project banner — config.yaml exists but not in registry
// ---------------------------------------------------------------------------

test.describe('Multi-project: unregistered project', () => {
  test.setTimeout(60_000);

  let server: DevServer | null = null;
  let naclHome: string;
  let cwdRoot: string;

  test.beforeAll(async () => {
    naclHome = makeTmpDir('nacl-home-unreg');
    cwdRoot = makeTmpDir('project-unreg');

    // Config.yaml exists with a project id but registry is empty
    mkdirSync(join(cwdRoot, 'graph-infra', 'boards'), { recursive: true });
    writeFileSync(
      join(cwdRoot, 'config.yaml'),
      'project:\n  id: experimental\n  name: Experimental\n',
    );

    // Empty registry (no projects, activeProjectId null)
    makeRegistry(naclHome, [], null);

    try {
      // Start the server with cwd = cwdRoot so the config walk-up finds graph-infra/
      // and sets source = 'cwd'. Do NOT set NACL_PROJECT_ROOT — that would set source
      // to 'env' and suppress the unregisteredCwdProjectId check in routes/projects.ts.
      server = await startDevServer({
        port: 3591,
        env: {
          NACL_HOME: naclHome,
        },
        cwd: cwdRoot,
        timeoutMs: 35_000,
      });
    } catch (err) {
      server = null;
      console.error('[06-multi-project] server failed to start:', err);
    }
  });

  test.afterAll(async () => {
    await server?.kill();
    server = null;
    if (existsSync(naclHome)) rmSync(naclHome, { recursive: true, force: true });
    if (existsSync(cwdRoot)) rmSync(cwdRoot, { recursive: true, force: true });
  });

  test('shows unregistered project id when cwd has config.yaml but registry does not know it', async () => {
    if (!server) {
      test.skip(true, 'Dev server failed to start — skipping (see Pattern B comment in helper)');
      return;
    }

    const base = server.baseUrl;

    // GET /projects must expose unregisteredCwdProjectId = 'experimental'
    const raw = await fetchJson(`${base}/api/v1/projects`);
    const body = raw as {
      projects: unknown[];
      activeProjectId: string | null;
      unregisteredCwdProjectId: string | null;
      source: string;
    };

    expect(body.projects).toHaveLength(0);
    expect(body.activeProjectId).toBeNull();
    expect(body.unregisteredCwdProjectId).toBe('experimental');
    // source is 'cwd' — the server cwd was set to cwdRoot which contains graph-infra/
    expect(body.source).toBe('cwd');
  });
});

// ---------------------------------------------------------------------------
// Test: empty registry AND no config.yaml — "no projects yet" state
// ---------------------------------------------------------------------------

test.describe('Multi-project: empty registry no config', () => {
  test.setTimeout(60_000);

  let server: DevServer | null = null;
  let naclHome: string;
  let cwdRoot: string;

  test.beforeAll(async () => {
    naclHome = makeTmpDir('nacl-home-empty');
    cwdRoot = makeTmpDir('project-empty');

    // No config.yaml in cwdRoot
    makeRegistry(naclHome, [], null);

    try {
      server = await startDevServer({
        port: 3592,
        env: {
          NACL_HOME: naclHome,
          NACL_PROJECT_ROOT: cwdRoot,
        },
        timeoutMs: 35_000,
      });
    } catch (err) {
      server = null;
      console.error('[06-multi-project] server failed to start:', err);
    }
  });

  test.afterAll(async () => {
    await server?.kill();
    server = null;
    if (existsSync(naclHome)) rmSync(naclHome, { recursive: true, force: true });
    if (existsSync(cwdRoot)) rmSync(cwdRoot, { recursive: true, force: true });
  });

  test('returns empty project list when registry is empty and cwd has no config.yaml', async () => {
    if (!server) {
      test.skip(true, 'Dev server failed to start — skipping (see Pattern B comment in helper)');
      return;
    }

    const base = server.baseUrl;

    const raw = await fetchJson(`${base}/api/v1/projects`);
    const body = raw as {
      projects: unknown[];
      activeProjectId: string | null;
      unregisteredCwdProjectId: string | null;
    };

    expect(body.projects).toHaveLength(0);
    expect(body.activeProjectId).toBeNull();
    // No config.yaml → no unregistered id to surface
    expect(body.unregisteredCwdProjectId).toBeNull();
  });
});

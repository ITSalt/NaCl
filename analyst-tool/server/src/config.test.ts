/**
 * Tests for the hot-reloadable ConfigManager.
 *
 * Each test isolates env variables so tests don't interfere with each other.
 * The module cache is cleared between logical groups via dynamic imports.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Test infra
// ---------------------------------------------------------------------------

let baseDir: string;

before(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'nacl-config-test-'));
});

after(async () => {
  await rm(baseDir, { recursive: true, force: true });
  // Clean up env
  delete process.env['NACL_BOARDS_DIR'];
  delete process.env['NACL_PROJECT_ROOT'];
  delete process.env['NACL_HOME'];
});

beforeEach(async () => {
  delete process.env['NACL_BOARDS_DIR'];
  delete process.env['NACL_PROJECT_ROOT'];
  delete process.env['NACL_HOME'];
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeEmptyRegistry(home: string): Promise<void> {
  await mkdir(home, { recursive: true });
  await writeFile(
    join(home, 'projects.json'),
    JSON.stringify({ version: 1, activeProjectId: null, projects: [] }, null, 2),
    'utf-8',
  );
}

async function makeRegistryWithActiveProject(
  home: string,
  project: {
    id: string;
    root: string;
    name?: string;
  },
): Promise<void> {
  await mkdir(home, { recursive: true });
  const registry = {
    version: 1,
    activeProjectId: project.id,
    projects: [
      {
        id: project.id,
        name: project.name ?? 'Test Project',
        root: project.root,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
      },
    ],
  };
  await writeFile(join(home, 'projects.json'), JSON.stringify(registry, null, 2), 'utf-8');
}

async function importConfig() {
  return import('./config.js');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfigManager: NACL_BOARDS_DIR wins for boardsDir', () => {
  it('NACL_BOARDS_DIR env overrides any other source', async () => {
    process.env['NACL_BOARDS_DIR'] = '/custom/boards/dir';
    const { getConfig } = await importConfig();
    const cfg = getConfig();
    assert.equal(cfg.boardsDir, '/custom/boards/dir');
  });
});

describe('ConfigManager: NACL_PROJECT_ROOT env', () => {
  it('NACL_PROJECT_ROOT sets repoRoot and derives projectId from basename', async () => {
    process.env['NACL_PROJECT_ROOT'] = '/some/path/my-project';
    // Point NACL_HOME to empty registry so no active project interferes
    const home = join(baseDir, 'empty-home-' + Date.now());
    await makeEmptyRegistry(home);
    process.env['NACL_HOME'] = home;

    const { configManager } = await importConfig();
    const cfg = await configManager.reload();

    assert.equal(cfg.repoRoot, '/some/path/my-project');
    assert.equal(cfg.projectId, 'my-project');
    assert.equal(cfg.source, 'env');
  });

  it('NACL_PROJECT_ROOT loses to NACL_BOARDS_DIR for boardsDir', async () => {
    process.env['NACL_PROJECT_ROOT'] = '/some/project';
    process.env['NACL_BOARDS_DIR'] = '/explicit/boards';
    const home = join(baseDir, 'empty-home2-' + Date.now());
    await makeEmptyRegistry(home);
    process.env['NACL_HOME'] = home;

    const { configManager } = await importConfig();
    const cfg = await configManager.reload();

    assert.equal(cfg.boardsDir, '/explicit/boards');
    assert.equal(cfg.repoRoot, '/some/project');
  });
});

describe('ConfigManager: active project in registry', () => {
  it('boardsDir and projectId come from active project when registry has one', async () => {
    const home = join(baseDir, 'registry-home-' + Date.now());
    const projectRoot = join(baseDir, 'my-project-root');
    await mkdir(projectRoot, { recursive: true });
    await makeRegistryWithActiveProject(home, { id: 'test-proj', root: projectRoot });
    process.env['NACL_HOME'] = home;

    const { configManager } = await importConfig();
    const cfg = await configManager.reload();

    assert.equal(cfg.repoRoot, projectRoot);
    assert.equal(cfg.projectId, 'test-proj');
    assert.equal(cfg.boardsDir, join(projectRoot, 'graph-infra', 'boards'));
    assert.equal(cfg.source, 'registry');
  });
});

describe('ConfigManager: reload emits change event', () => {
  it('emits change when reloaded config differs', async () => {
    const home1 = join(baseDir, 'change-home1-' + Date.now());
    await makeEmptyRegistry(home1);
    process.env['NACL_HOME'] = home1;

    const { configManager } = await importConfig();
    const initial = await configManager.reload();

    // Now switch to a registry with an active project
    const home2 = join(baseDir, 'change-home2-' + Date.now());
    const newRoot = join(baseDir, 'new-project-root');
    await mkdir(newRoot, { recursive: true });
    await makeRegistryWithActiveProject(home2, { id: 'new-proj', root: newRoot });
    process.env['NACL_HOME'] = home2;

    let emittedNext: unknown = null;
    let emittedPrev: unknown = null;
    configManager.onConfigChange((next, prev) => {
      emittedNext = next;
      emittedPrev = prev;
    });

    const next = await configManager.reload();
    assert.ok(emittedNext !== null, 'change event should have fired');
    assert.deepEqual(emittedNext, next);
    assert.deepEqual(emittedPrev, initial);
  });

  it('does not emit change when config is identical', async () => {
    const home = join(baseDir, 'no-change-home-' + Date.now());
    await makeEmptyRegistry(home);
    process.env['NACL_HOME'] = home;

    const { configManager } = await importConfig();
    await configManager.reload();

    let changeCount = 0;
    configManager.onConfigChange(() => { changeCount++; });

    await configManager.reload();
    assert.equal(changeCount, 0, 'should not emit change if config is the same');
  });
});

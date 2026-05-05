/**
 * bootstrap tests — verify that syncOnStartup correctly reads config.yaml
 * and calls syncProjectRoot only for known project ids.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let baseDir: string;

before(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'nacl-bootstrap-test-'));
});

after(async () => {
  await rm(baseDir, { recursive: true, force: true });
  delete process.env['NACL_HOME'];
  delete process.env['NACL_BOARDS_DIR'];
  delete process.env['NACL_PROJECT_ROOT'];
});

beforeEach(async () => {
  delete process.env['NACL_HOME'];
  delete process.env['NACL_BOARDS_DIR'];
  delete process.env['NACL_PROJECT_ROOT'];
});

async function makeHome(suffix = ''): Promise<string> {
  const home = join(baseDir, 'home-' + Date.now() + suffix);
  await mkdir(home, { recursive: true });
  return home;
}

async function writeRegistry(home: string, data: unknown): Promise<void> {
  await writeFile(join(home, 'projects.json'), JSON.stringify(data, null, 2), 'utf-8');
}

async function makeProjectRoot(suffix = ''): Promise<string> {
  const dir = join(baseDir, 'project-' + Date.now() + suffix);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncOnStartup: config.yaml with known id', () => {
  it('calls syncProjectRoot when project.id matches a registry entry', async () => {
    const home = await makeHome('known');
    const projectRoot = await makeProjectRoot('known');

    // Set up registry with a known project
    await writeRegistry(home, {
      version: 1,
      activeProjectId: null,
      projects: [
        {
          id: 'known-proj',
          name: 'Known Project',
          root: '/old/path',
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
        },
      ],
    });

    // Write config.yaml in the project root
    await writeFile(
      join(projectRoot, 'config.yaml'),
      'project:\n  id: known-proj\n  name: Known Project\n',
      'utf-8',
    );

    process.env['NACL_HOME'] = home;
    process.env['NACL_PROJECT_ROOT'] = projectRoot;

    // Re-evaluate config and run bootstrap
    const { configManager } = await import('../config.js');
    await configManager.reload();

    const { syncOnStartup } = await import('./bootstrap.js');
    await syncOnStartup();

    // Verify that the registry was updated
    const { loadRegistry } = await import('./project-registry.js');
    const reg = await loadRegistry();
    const proj = reg.projects.find((p) => p.id === 'known-proj')!;
    assert.ok(proj, 'project should still exist');
    assert.equal(proj.root, projectRoot, 'root should be updated to projectRoot');
  });
});

describe('syncOnStartup: config.yaml with unknown id', () => {
  it('does not write to registry when project.id is unknown', async () => {
    const home = await makeHome('unknown');
    const projectRoot = await makeProjectRoot('unknown');

    await writeRegistry(home, {
      version: 1,
      activeProjectId: null,
      projects: [],
    });

    await writeFile(
      join(projectRoot, 'config.yaml'),
      'project:\n  id: no-such-project\n',
      'utf-8',
    );

    process.env['NACL_HOME'] = home;
    process.env['NACL_PROJECT_ROOT'] = projectRoot;

    const { configManager } = await import('../config.js');
    await configManager.reload();

    const { syncOnStartup } = await import('./bootstrap.js');
    // Should not throw
    await syncOnStartup();

    const { loadRegistry } = await import('./project-registry.js');
    const reg = await loadRegistry();
    assert.equal(reg.projects.length, 0, 'no projects should be added');
  });
});

describe('syncOnStartup: missing config.yaml', () => {
  it('does not throw when config.yaml is absent', async () => {
    const home = await makeHome('nofile');
    const projectRoot = await makeProjectRoot('nofile');
    // No config.yaml written

    await writeRegistry(home, {
      version: 1,
      activeProjectId: null,
      projects: [],
    });

    process.env['NACL_HOME'] = home;
    process.env['NACL_PROJECT_ROOT'] = projectRoot;

    const { configManager } = await import('../config.js');
    await configManager.reload();

    const { syncOnStartup } = await import('./bootstrap.js');
    // Must not throw
    await assert.doesNotReject(() => syncOnStartup());
  });
});

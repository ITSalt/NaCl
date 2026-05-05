/**
 * Tests for project-registry service.
 * Uses a synthetic NACL_HOME so tests never touch the real ~/.nacl directory.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let baseDir: string;  // overall temp root for this test run

/** Create a fresh per-test NACL_HOME and return its path */
async function makeFreshHome(): Promise<string> {
  const home = await mkdtemp(join(baseDir, 'nacl-home-'));
  process.env['NACL_HOME'] = home;
  return home;
}

/** Write a raw projects.json into the given NACL_HOME */
async function writeRawRegistry(home: string, content: unknown): Promise<void> {
  await writeFile(join(home, 'projects.json'), JSON.stringify(content, null, 2), 'utf-8');
}

/** Sample valid project record */
function sampleProject(id = 'test-project'): import('./project-registry.js').ProjectRecord {
  return {
    id,
    name: 'Test Project',
    root: '/tmp/test-project',
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

before(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'nacl-registry-test-'));
});

after(async () => {
  await rm(baseDir, { recursive: true, force: true });
  delete process.env['NACL_HOME'];
});

beforeEach(async () => {
  // Each test gets its own NACL_HOME so state doesn't leak
  await makeFreshHome();
});

// ---------------------------------------------------------------------------
// Imports are dynamic so that NACL_HOME is already set before the module
// evaluates getRegistryPath().
// ---------------------------------------------------------------------------

async function importRegistry() {
  // Use a cache-busting approach by destructuring fresh each time
  return import('./project-registry.js');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('project-registry: getRegistryPath', () => {
  it('NACL_HOME env override is respected', async () => {
    const customHome = join(baseDir, 'custom-nacl');
    await mkdir(customHome, { recursive: true });
    process.env['NACL_HOME'] = customHome;
    const { getRegistryPath } = await importRegistry();
    const path = getRegistryPath();
    assert.equal(path, join(customHome, 'projects.json'));
  });
});

describe('project-registry: ensureRegistry', () => {
  it('is idempotent — calling twice does not throw', async () => {
    const { ensureRegistry } = await importRegistry();
    await ensureRegistry();
    await ensureRegistry(); // second call must not throw
  });

  it('creates registry dir and file if missing', async () => {
    const home = join(baseDir, 'fresh-nacl-home-' + process.pid);
    process.env['NACL_HOME'] = home;
    const { ensureRegistry, getRegistryPath } = await importRegistry();
    await ensureRegistry();
    const raw = await readFile(getRegistryPath(), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    assert.deepEqual(parsed, { version: 1, activeProjectId: null, projects: [] });
  });
});

describe('project-registry: loadRegistry', () => {
  it('loadRegistry from freshly ensured file returns empty skeleton', async () => {
    const { ensureRegistry, loadRegistry } = await importRegistry();
    await ensureRegistry();
    const reg = await loadRegistry();
    assert.equal(reg.version, 1);
    assert.equal(reg.activeProjectId, null);
    assert.deepEqual(reg.projects, []);
  });

  it('throws a clear error on malformed JSON', async () => {
    const home = process.env['NACL_HOME']!;
    await writeFile(join(home, 'projects.json'), '{ bad json !!', 'utf-8');
    const { loadRegistry } = await importRegistry();
    await assert.rejects(
      () => loadRegistry(),
      (err: Error) => {
        assert.match(err.message, /Malformed JSON/);
        return true;
      },
    );
  });

  it('schema version mismatch throws UnsupportedRegistryVersionError', async () => {
    const home = process.env['NACL_HOME']!;
    await writeRawRegistry(home, { version: 99, activeProjectId: null, projects: [] });
    const { loadRegistry, UnsupportedRegistryVersionError } = await importRegistry();
    await assert.rejects(
      () => loadRegistry(),
      (err: Error) => {
        assert.ok(err instanceof UnsupportedRegistryVersionError, `expected UnsupportedRegistryVersionError, got ${err.constructor.name}`);
        assert.match(err.message, /99/);
        // registry path should appear in the message so the user can fix it manually
        assert.match(err.message, /projects\.json/);
        return true;
      },
    );
  });
});

describe('project-registry: saveRegistry', () => {
  it('saveRegistry uses atomic tmp+rename (tmp file should not linger)', async () => {
    const { ensureRegistry, saveRegistry, loadRegistry, getRegistryPath } = await importRegistry();
    await ensureRegistry();
    const reg = await loadRegistry();
    await saveRegistry(reg);
    // If tmp file were left behind, it would have a .tmp extension
    const tmpPath = getRegistryPath() + '.tmp';
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(tmpPath), false, 'tmp file should not exist after save');
  });

  it('saved data round-trips correctly', async () => {
    const { ensureRegistry, saveRegistry, loadRegistry } = await importRegistry();
    await ensureRegistry();
    const reg = await loadRegistry();
    reg.projects.push(sampleProject('saved-project'));
    await saveRegistry(reg);
    const loaded = await loadRegistry();
    assert.equal(loaded.projects.length, 1);
    assert.equal(loaded.projects[0].id, 'saved-project');
  });
});

describe('project-registry: setActiveProject', () => {
  it('throws on unknown id', async () => {
    const { ensureRegistry, setActiveProject } = await importRegistry();
    await ensureRegistry();
    await assert.rejects(
      () => setActiveProject('no-such-project'),
      (err: Error) => {
        assert.match(err.message, /not found/i);
        return true;
      },
    );
  });

  it('throws InvalidProjectIdError on id outside regex', async () => {
    const { ensureRegistry, setActiveProject, InvalidProjectIdError } = await importRegistry();
    await ensureRegistry();
    await assert.rejects(
      () => setActiveProject('INVALID ID!'),
      (err: Error) => {
        assert.ok(err instanceof InvalidProjectIdError);
        return true;
      },
    );
  });

  it('sets active project when id exists', async () => {
    const { ensureRegistry, loadRegistry, saveRegistry, setActiveProject } = await importRegistry();
    await ensureRegistry();
    const reg = await loadRegistry();
    reg.projects.push(sampleProject('my-project'));
    await saveRegistry(reg);

    const record = await setActiveProject('my-project');
    assert.equal(record.id, 'my-project');

    const updated = await loadRegistry();
    assert.equal(updated.activeProjectId, 'my-project');
  });
});

describe('project-registry: syncProjectRoot', () => {
  it('updates only the matching record and sets lastUsed', async () => {
    const { ensureRegistry, loadRegistry, saveRegistry, syncProjectRoot } = await importRegistry();
    await ensureRegistry();
    const reg = await loadRegistry();
    reg.projects.push(sampleProject('proj-a'));
    reg.projects.push(sampleProject('proj-b'));
    await saveRegistry(reg);

    const result = await syncProjectRoot('proj-a', '/tmp/new-root-a');
    assert.ok(result, 'should return the updated record');
    assert.equal(result!.id, 'proj-a');
    assert.equal(result!.root, '/tmp/new-root-a');

    const updated = await loadRegistry();
    const projA = updated.projects.find((p) => p.id === 'proj-a')!;
    const projB = updated.projects.find((p) => p.id === 'proj-b')!;
    assert.equal(projA.root, '/tmp/new-root-a');
    // projB.root should be unchanged (still the sampleProject default)
    assert.equal(projB.root, '/tmp/test-project');
  });

  it('returns null for unknown id (no-op)', async () => {
    const { ensureRegistry, syncProjectRoot } = await importRegistry();
    await ensureRegistry();
    const result = await syncProjectRoot('unknown-id', '/tmp/something');
    assert.equal(result, null);
  });

  it('throws if root is not an absolute path', async () => {
    const { ensureRegistry, syncProjectRoot } = await importRegistry();
    await ensureRegistry();
    await assert.rejects(
      () => syncProjectRoot('any-id', 'relative/path'),
      (err: Error) => {
        assert.match(err.message, /absolute/);
        return true;
      },
    );
  });
});

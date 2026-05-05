/**
 * registry-watcher tests.
 *
 * Each test manages its own NACL_HOME to avoid interference with other test files
 * that also manipulate NACL_HOME at the process level.
 * A fake broadcaster is injected to verify broadcast calls without a live WS.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(interval);
        reject(new Error('waitFor timed out'));
      }
    }, 50);
  });
}

/** Write a minimal valid registry to the given path */
async function writeRegistry(path: string, extra: Partial<{ activeProjectId: string | null; projects: unknown[] }> = {}): Promise<void> {
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      activeProjectId: extra.activeProjectId ?? null,
      projects: extra.projects ?? [],
    }, null, 2),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Tests — each test manages its own tmpdir + NACL_HOME
// ---------------------------------------------------------------------------

describe('registry-watcher: external edit triggers broadcast', () => {
  it('broadcasts projects.changed when registry file is modified externally', async () => {
    const testHome = await mkdtemp(join(tmpdir(), 'nacl-regwatcher-ext-'));
    const registryPath = join(testHome, 'projects.json');
    const savedHome = process.env['NACL_HOME'];

    try {
      process.env['NACL_HOME'] = testHome;

      // Write initial empty registry
      await writeRegistry(registryPath);

      const broadcasts: Array<{ channel: string; payload: Record<string, unknown> }> = [];
      const fakeBroadcaster = (channel: string, payload: Record<string, unknown>) => {
        broadcasts.push({ channel, payload });
      };

      const { start, stop, whenReady } = await import('./registry-watcher.js');
      start(fakeBroadcaster);
      await whenReady();

      try {
        // External edit: add a synthetic project
        const syntheticProject = {
          id: 'external-proj',
          name: 'External Project',
          root: join(tmpdir(), 'ext-proj'),
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
        };
        await writeRegistry(registryPath, { projects: [syntheticProject] });

        await waitFor(() => broadcasts.some((b) => b.payload['type'] === 'projects.changed'), 3000);

        const evt = broadcasts.find((b) => b.payload['type'] === 'projects.changed');
        assert.ok(evt, 'expected a projects.changed broadcast');
        assert.equal(evt.channel, 'projects');
        const projects = evt.payload['projects'] as unknown[];
        assert.ok(Array.isArray(projects), 'projects should be an array');
      } finally {
        await stop();
      }
    } finally {
      if (savedHome !== undefined) {
        process.env['NACL_HOME'] = savedHome;
      } else {
        delete process.env['NACL_HOME'];
      }
      await rm(testHome, { recursive: true, force: true });
    }
  });
});

describe('registry-watcher: internal save does not double-emit', () => {
  it('at most one broadcast within 500ms after saveRegistry', async () => {
    const testHome = await mkdtemp(join(tmpdir(), 'nacl-regwatcher-int-'));
    const savedHome = process.env['NACL_HOME'];

    try {
      process.env['NACL_HOME'] = testHome;

      const { ensureRegistry, saveRegistry, loadRegistry } = await import('./project-registry.js');
      await ensureRegistry();

      const broadcasts: Array<{ channel: string; payload: Record<string, unknown> }> = [];
      const fakeBroadcaster = (channel: string, payload: Record<string, unknown>) => {
        broadcasts.push({ channel, payload });
      };

      const { start, stop, whenReady } = await import('./registry-watcher.js');
      start(fakeBroadcaster);
      await whenReady();

      try {
        // Trigger an internal save (atomic tmp+rename)
        const reg = await loadRegistry();
        await saveRegistry(reg);

        // Wait 500ms and count broadcasts
        await new Promise((r) => setTimeout(r, 500));

        const projectsChangedCount = broadcasts.filter((b) => b.payload['type'] === 'projects.changed').length;
        assert.ok(
          projectsChangedCount <= 1,
          `expected at most 1 projects.changed broadcast, got ${projectsChangedCount}`,
        );
      } finally {
        await stop();
      }
    } finally {
      if (savedHome !== undefined) {
        process.env['NACL_HOME'] = savedHome;
      } else {
        delete process.env['NACL_HOME'];
      }
      await rm(testHome, { recursive: true, force: true });
    }
  });
});

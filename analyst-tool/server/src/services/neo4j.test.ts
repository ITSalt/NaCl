/**
 * neo4j.test.ts — tests for the neo4j service.
 *
 * Uses a fake Driver so no real database is required.
 * Verifies query construction: parameter binding, LIMIT clause, label safety,
 * per-project config reading, and reloadDriver() behaviour.
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We'll import after setting up the fake driver
let setDriver: (d: unknown) => void;
let clearDriver: () => void;
let findNodesByLabel: (label: string, limit?: number) => Promise<import('./neo4j.js').GraphNode[]>;
let findNodesById: (id: string) => Promise<import('./neo4j.js').GraphNode[]>;
let findNodesByText: (query: string, limit?: number) => Promise<import('./neo4j.js').GraphNode[]>;
let readGraphConfig: (root: string) => Promise<{ boltPort: number; user: string; password: string } | null>;
let reloadDriver: () => Promise<void>;
let getDriverAsync: (repoRoot?: string) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Fake Driver infrastructure
// ---------------------------------------------------------------------------

interface CapturedRun {
  cypher: string;
  params: Record<string, unknown>;
}

const capturedRuns: CapturedRun[] = [];

function makeRecordFake(props: Record<string, unknown>, labels: string[], identity: number) {
  return {
    get(key: string) {
      if (key === 'n') {
        return {
          labels,
          properties: props,
          identity: { toString: () => String(identity) },
        };
      }
      return null;
    },
  };
}

function makeFakeDriver(
  rows: { props: Record<string, unknown>; labels: string[]; identity?: number }[],
): unknown {
  const records = rows.map((r, i) => makeRecordFake(r.props, r.labels, r.identity ?? i));

  return {
    session() {
      return {
        async run(cypher: string, params: Record<string, unknown>) {
          capturedRuns.push({ cypher, params });
          return { records };
        },
        async close() { /* no-op */ },
      };
    },
    async close() { /* no-op */ },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

before(async () => {
  const mod = await import('./neo4j.js');
  setDriver = mod.setDriver as (d: unknown) => void;
  clearDriver = mod.clearDriver;
  findNodesByLabel = mod.findNodesByLabel;
  findNodesById = mod.findNodesById;
  findNodesByText = mod.findNodesByText;
  readGraphConfig = mod.readGraphConfig;
  reloadDriver = mod.reloadDriver;
  getDriverAsync = mod.getDriverAsync as (repoRoot?: string) => Promise<unknown>;
});

after(() => {
  clearDriver();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findNodesByLabel', () => {
  it('passes label in Cypher and $limit as neo4j integer', async () => {
    capturedRuns.length = 0;
    setDriver(makeFakeDriver([
      { props: { id: 'UC-001', name: 'Login' }, labels: ['UseCase'] },
    ]));

    const nodes = await findNodesByLabel('UseCase', 5);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].labels[0], 'UseCase');

    assert.equal(capturedRuns.length, 1);
    assert.ok(capturedRuns[0].cypher.includes('UseCase'), 'Cypher should contain label name');
    assert.ok(capturedRuns[0].cypher.includes('LIMIT'), 'Cypher should contain LIMIT');
    // neo4j.int wraps integers — check the toNumber method is available or raw value
    const limitParam = capturedRuns[0].params['limit'] as { toNumber?: () => number } | number;
    const limitVal = typeof limitParam === 'object' && limitParam.toNumber ? limitParam.toNumber() : limitParam as number;
    assert.equal(limitVal, 5);
  });

  it('rejects labels with invalid characters (returns empty array)', async () => {
    capturedRuns.length = 0;
    setDriver(makeFakeDriver([]));

    // Labels with spaces or special chars should be rejected
    const nodes = await findNodesByLabel('Use Case With Space');
    assert.equal(nodes.length, 0);
    assert.equal(capturedRuns.length, 0, 'should not call driver for invalid label');
  });

  it('applies default limit when none given', async () => {
    capturedRuns.length = 0;
    setDriver(makeFakeDriver([]));

    await findNodesByLabel('Skill');
    assert.equal(capturedRuns.length, 1);
    const limitParam = capturedRuns[0].params['limit'] as { toNumber?: () => number } | number;
    const limitVal = typeof limitParam === 'object' && limitParam.toNumber ? limitParam.toNumber() : limitParam as number;
    assert.ok(limitVal > 0 && limitVal <= 100);
  });
});

describe('findNodesById', () => {
  it('passes id as a parameter, not interpolated into Cypher', async () => {
    capturedRuns.length = 0;
    setDriver(makeFakeDriver([
      { props: { nodeId: 'UC-001', name: 'Login' }, labels: ['UseCase'] },
    ]));

    const nodes = await findNodesById('UC-001');
    assert.equal(nodes.length, 1);

    assert.equal(capturedRuns.length, 1);
    // id must be passed as a parameter, not embedded in Cypher
    assert.equal(capturedRuns[0].params['id'], 'UC-001');
    assert.ok(!capturedRuns[0].cypher.includes('UC-001'), 'id must not be interpolated into Cypher');
  });

  it('derives id from nodeId property when id field is absent', async () => {
    capturedRuns.length = 0;
    setDriver(makeFakeDriver([
      { props: { nodeId: 'BP-042', title: 'Billing' }, labels: ['Process'] },
    ]));

    const nodes = await findNodesById('BP-042');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].id, 'BP-042');
  });
});

describe('findNodesByText', () => {
  it('passes query as $q parameter', async () => {
    capturedRuns.length = 0;
    setDriver(makeFakeDriver([
      { props: { name: 'Decision Node', id: 'D-001' }, labels: ['Decision'] },
    ]));

    const nodes = await findNodesByText('Decision', 10);
    assert.equal(nodes.length, 1);

    assert.equal(capturedRuns.length, 1);
    // Query text must be passed as parameter
    assert.ok('q' in capturedRuns[0].params, 'must bind $q parameter');
    assert.equal(capturedRuns[0].params['q'], 'decision'); // lowercased
    assert.ok(!capturedRuns[0].cypher.includes('Decision'), 'text must not be interpolated into Cypher');
  });

  it('respects limit cap at 100', async () => {
    capturedRuns.length = 0;
    setDriver(makeFakeDriver([]));

    await findNodesByText('any', 9999);
    const limitParam = capturedRuns[0].params['limit'] as { toNumber?: () => number } | number;
    const limitVal = typeof limitParam === 'object' && limitParam.toNumber ? limitParam.toNumber() : limitParam as number;
    assert.ok(limitVal <= 100, 'limit must be capped at 100');
  });
});

// ---------------------------------------------------------------------------
// readGraphConfig — per-project config.yaml parsing
// ---------------------------------------------------------------------------

describe('readGraphConfig', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'nacl-neo4j-cfg-test-'));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('returns null when config.yaml is absent', async () => {
    const result = await readGraphConfig(tmpRoot);
    assert.equal(result, null);
  });

  it('returns null when config.yaml has no graph block', async () => {
    await writeFile(join(tmpRoot, 'config.yaml'), 'project:\n  id: test\n', 'utf-8');
    const result = await readGraphConfig(tmpRoot);
    assert.equal(result, null);
  });

  it('reads neo4j_bolt_port from config.yaml', async () => {
    await writeFile(
      join(tmpRoot, 'config.yaml'),
      'project:\n  id: test\ngraph:\n  neo4j_bolt_port: 7686\n',
      'utf-8',
    );
    const result = await readGraphConfig(tmpRoot);
    assert.ok(result !== null);
    assert.equal(result?.boltPort, 7686);
    assert.equal(result?.user, 'neo4j');
    assert.equal(result?.password, 'neo4j_graph_dev');
  });

  it('reads neo4j_password from config.yaml', async () => {
    await writeFile(
      join(tmpRoot, 'config.yaml'),
      'graph:\n  neo4j_bolt_port: 9001\n  neo4j_password: secret123\n',
      'utf-8',
    );
    const result = await readGraphConfig(tmpRoot);
    assert.ok(result !== null);
    assert.equal(result?.boltPort, 9001);
    assert.equal(result?.password, 'secret123');
  });
});

// ---------------------------------------------------------------------------
// getDriverAsync — per-project driver creation
// ---------------------------------------------------------------------------

describe('getDriverAsync: per-project bolt port', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'nacl-neo4j-driver-test-'));
    // Always clear the module-level _driver before each test
    clearDriver();
    delete process.env['NEO4J_URI'];
  });

  afterEach(async () => {
    clearDriver();
    await rm(tmpRoot, { recursive: true, force: true });
    delete process.env['NEO4J_URI'];
  });

  it('creates driver from config.yaml bolt port when NEO4J_URI is not set', async () => {
    await writeFile(
      join(tmpRoot, 'config.yaml'),
      'graph:\n  neo4j_bolt_port: 7686\n',
      'utf-8',
    );

    // getDriverAsync returns a Driver object — we can't inspect its URI from
    // the outside, but we can verify it doesn't throw and returns an object.
    const driver = await getDriverAsync(tmpRoot);
    assert.ok(driver !== null && typeof driver === 'object', 'should return a driver');
    // Close immediately to avoid lingering connection attempts
    if (driver && typeof (driver as { close?: () => Promise<void> }).close === 'function') {
      await (driver as { close: () => Promise<void> }).close().catch(() => undefined);
    }
    // Reset so next test gets a fresh driver
    clearDriver();
  });

  it('env NEO4J_URI override takes priority over config.yaml', async () => {
    process.env['NEO4J_URI'] = 'bolt://example:1234';
    await writeFile(
      join(tmpRoot, 'config.yaml'),
      'graph:\n  neo4j_bolt_port: 7686\n',
      'utf-8',
    );

    // Should not throw — env var overrides config.yaml
    const driver = await getDriverAsync(tmpRoot);
    assert.ok(driver !== null && typeof driver === 'object');
    if (driver && typeof (driver as { close?: () => Promise<void> }).close === 'function') {
      await (driver as { close: () => Promise<void> }).close().catch(() => undefined);
    }
    clearDriver();
  });
});

// ---------------------------------------------------------------------------
// reloadDriver — driver reset on project switch
// ---------------------------------------------------------------------------

describe('reloadDriver', () => {
  afterEach(() => {
    clearDriver();
    delete process.env['NEO4J_URI'];
  });

  it('does not throw when no driver is active', async () => {
    clearDriver();
    await assert.doesNotReject(() => reloadDriver());
  });

  it('after reloadDriver(), getDriverAsync lazy-inits a fresh driver', async () => {
    // Prime a driver
    process.env['NEO4J_URI'] = 'bolt://localhost:3587';
    const d1 = await getDriverAsync();
    assert.ok(d1 !== null);

    // Reload should close d1 and null out _driver
    await reloadDriver();

    // Next call creates a fresh driver
    const d2 = await getDriverAsync();
    assert.ok(d2 !== null);

    clearDriver();
  });
});

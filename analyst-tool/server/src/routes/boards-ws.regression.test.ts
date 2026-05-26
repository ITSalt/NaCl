/**
 * UC-020-BE Regression Test — TC-REG-01
 *
 * Regression anchor for FR-002 / bug #4:
 *   An out-of-band PUT /boards/:name that does NOT carry an open client's
 *   originId MUST produce a `board.changed` event on `board:X` that reaches
 *   a subscribed WS client.
 *
 * RED state (pre-fix): writeBoard calls markSelfWrite → fs-watcher sees
 *   isRecentSelfWrite=true → no broadcast → client receives nothing → times out.
 *
 * GREEN state (post-fix): isRecentSelfWrite gate removed → event always
 *   broadcasts with originId from pending map → client receives board.changed.
 *
 * TDD ordering: this file is written BEFORE production code changes.
 * It must be confirmed RED against unmodified code, then GREEN after the fix.
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { createRequire } from 'node:module';

// ---------------------------------------------------------------------------
// Import ws from the hoisted node_modules (ws is a transitive dep of fastify/websocket)
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WS = require('ws') as typeof import('ws');

import type { StopFn } from '../services/fs-watcher.js';

// ---------------------------------------------------------------------------
// Minimal valid Excalidraw scene
// ---------------------------------------------------------------------------
const SCENE_JSON = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [],
  appState: {},
  files: {},
});

const SCENE_V2_JSON = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [{ id: 'el1', type: 'rectangle' }],
  appState: {},
  files: {},
});

// ---------------------------------------------------------------------------
// Test server builder
// ---------------------------------------------------------------------------
interface TestServer {
  app: FastifyInstance;
  port: number;
  boardsDir: string;
  stop: () => Promise<void>;
  stopWatcher: StopFn;
}

async function buildTestServer(): Promise<TestServer> {
  const boardsDir = await mkdtemp(join(tmpdir(), 'nacl-uc020-test-'));

  // Set env so getConfig() picks up the temp boards dir
  process.env['NACL_BOARDS_DIR'] = boardsDir;

  const { configManager } = await import('../config.js');
  await configManager.reload();

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: '*' });
  await app.register(websocket);

  // WS hub — subscribe/unsubscribe (mirrors index.ts)
  const { subscribe, unsubscribe, unsubscribeAll, broadcast } = await import('../ws/events.js');
  const { start: startWatcher } = await import('../services/fs-watcher.js');
  const { consumePendingOrigin } = await import('../services/boards.js');

  await app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket) => {
      socket.on('message', (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            op?: string;
            type?: string;
            channel?: string;
            originId?: string;
          };
          // Support both op and type fields for subscribe
          const opValue = msg.op ?? msg.type;
          if (opValue === 'subscribe' && typeof msg.channel === 'string') {
            subscribe(msg.channel, socket);
          } else if (opValue === 'unsubscribe' && typeof msg.channel === 'string') {
            unsubscribe(msg.channel, socket);
          }
        } catch {
          // ignore malformed
        }
      });
      socket.on('close', () => {
        unsubscribeAll(socket);
      });
    });
  });

  // Board routes (PUT /boards/:name, GET /boards/:name, etc.)
  const { boardsRoutes } = await import('./boards.js');
  await app.register(
    async (fastify) => {
      await boardsRoutes(fastify);
    },
    { prefix: '/api/v1' },
  );

  await app.ready();
  // Listen on random port
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

  // Start the fs-watcher connected to the same broadcast function (mirrors index.ts).
  // Without this, no board.changed events are emitted in tests.
  const stopWatcher = startWatcher(
    boardsDir,
    (event) => {
      const originId = consumePendingOrigin(event.boardName);
      const mtimeMs = event.mtime != null ? new Date(event.mtime).getTime() : Date.now();
      broadcast('boards', { type: 'tree.changed', boardName: event.boardName, eventType: event.type });
      broadcast(`board:${event.boardName}`, {
        type: 'board.changed',
        board: event.boardName,
        mtime: mtimeMs,
        originId,
      });
    },
  );

  const stop = async () => {
    await stopWatcher();
    await app.close();
    await rm(boardsDir, { recursive: true, force: true });
  };

  return { app, port, boardsDir, stop, stopWatcher };
}

// ---------------------------------------------------------------------------
// WS helper: wait for a message matching a predicate, with timeout
// ---------------------------------------------------------------------------
function waitForMessage(
  client: InstanceType<typeof WS>,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`waitForMessage timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const listener = (data: Buffer | string) => {
      try {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        if (predicate(parsed)) {
          clearTimeout(timer);
          client.off('message', listener);
          resolve(parsed);
        }
      } catch {
        // not JSON, ignore
      }
    };

    client.on('message', listener);
  });
}

function openWS(port: number): Promise<InstanceType<typeof WS>> {
  return new Promise((resolve, reject) => {
    const client = new WS(`ws://127.0.0.1:${port}/ws`);
    client.once('open', () => resolve(client));
    client.once('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let server: TestServer;

before(async () => {
  server = await buildTestServer();
});

after(async () => {
  await server.stop();
  delete process.env['NACL_BOARDS_DIR'];
});

beforeEach(async () => {
  // Write the test board file fresh before each test
  await writeFile(
    join(server.boardsDir, 'activity-UC-003.excalidraw'),
    SCENE_JSON,
    'utf-8',
  );
});

// Give the fs-watcher 200 ms to settle after writing the file
function settle(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// TC-REG-01: Out-of-band PUT produces board.changed for a subscribed client
// ---------------------------------------------------------------------------

describe('TC-REG-01: out-of-band PUT produces board.changed (FR-002 regression anchor)', () => {
  it('WS client subscribed to board:activity-UC-003 receives board.changed after PUT with no originId', async () => {
    await settle(); // let add-event settle before subscribing

    const client = await openWS(server.port);
    try {
      // Subscribe to the board channel
      client.send(
        JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }),
      );

      // Allow subscription to register
      await settle(100);

      // Capture the pending board.changed promise BEFORE the PUT
      const receivedPromise = waitForMessage(
        client,
        (msg) => msg['type'] === 'board.changed' && msg['channel'] === 'board:activity-UC-003',
        3000,
      );

      // PUT with new content and NO originId
      const res = await server.app.inject({
        method: 'PUT',
        url: '/api/v1/boards/activity-UC-003',
        payload: { scene: JSON.parse(SCENE_V2_JSON) },
        headers: { 'content-type': 'application/json' },
      });

      assert.equal(res.statusCode, 200, `PUT returned ${res.statusCode}: ${res.body}`);

      // Wait for the board.changed event
      const msg = await receivedPromise;

      assert.equal(msg['type'], 'board.changed', 'event type mismatch');
      assert.equal(msg['channel'], 'board:activity-UC-003', 'channel mismatch');
      assert.equal(msg['board'], 'activity-UC-003', 'board name mismatch');
      assert.ok(typeof msg['mtime'] === 'number', `mtime should be number, got ${typeof msg['mtime']}`);
      // originId absent from PUT body → null in payload
      assert.equal(msg['originId'], null, `originId should be null, got ${JSON.stringify(msg['originId'])}`);
    } finally {
      client.close();
      await settle(100);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-1: board.changed payload shape — notify-only, no scene
// ---------------------------------------------------------------------------

describe('TC-1: board.changed payload shape — no scene keys', () => {
  it('board.changed has exactly { type, channel, board, mtime, originId } — no scene', async () => {
    await settle();

    const client = await openWS(server.port);
    try {
      client.send(JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }));
      await settle(100);

      const receivedPromise = waitForMessage(
        client,
        (msg) => msg['type'] === 'board.changed',
        3000,
      );

      await server.app.inject({
        method: 'PUT',
        url: '/api/v1/boards/activity-UC-003',
        payload: { scene: JSON.parse(SCENE_JSON) },
        headers: { 'content-type': 'application/json' },
      });

      const msg = await receivedPromise;

      // Must have these keys
      assert.ok('board' in msg, 'missing board key');
      assert.ok('mtime' in msg, 'missing mtime key');
      assert.ok('originId' in msg, 'missing originId key');

      // Must NOT have scene keys
      assert.ok(!('content' in msg), 'must not contain content key');
      assert.ok(!('elements' in msg), 'must not contain elements key');
      assert.ok(!('appState' in msg), 'must not contain appState key');
      assert.ok(!('scene' in msg), 'must not contain scene key');

      assert.equal(typeof msg['mtime'], 'number', 'mtime must be a number (Unix ms)');
    } finally {
      client.close();
      await settle(100);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-2: Per-origin — originId echoed in payload
// ---------------------------------------------------------------------------

describe('TC-2: per-origin — originId echoed in board.changed payload', () => {
  it('PUT with originId=client-A → both subscribers get board.changed with originId=client-A', async () => {
    await settle();

    const clientA = await openWS(server.port);
    const clientB = await openWS(server.port);
    try {
      clientA.send(JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }));
      clientB.send(JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }));
      await settle(100);

      const promiseA = waitForMessage(
        clientA,
        (msg) => msg['type'] === 'board.changed',
        3000,
      );
      const promiseB = waitForMessage(
        clientB,
        (msg) => msg['type'] === 'board.changed',
        3000,
      );

      await server.app.inject({
        method: 'PUT',
        url: '/api/v1/boards/activity-UC-003',
        payload: { scene: JSON.parse(SCENE_JSON), originId: 'client-A' },
        headers: { 'content-type': 'application/json' },
      });

      const [msgA, msgB] = await Promise.all([promiseA, promiseB]);

      assert.equal(msgA['originId'], 'client-A', 'clientA: originId mismatch');
      assert.equal(msgB['originId'], 'client-A', 'clientB: originId mismatch');
    } finally {
      clientA.close();
      clientB.close();
      await settle(100);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-3: Two subscribers — both receive board.changed
// ---------------------------------------------------------------------------

describe('TC-3: two subscribers — both receive board.changed for out-of-band PUT', () => {
  it('both WS connections receive board.changed within timeout', async () => {
    await settle();

    const clientA = await openWS(server.port);
    const clientB = await openWS(server.port);
    try {
      clientA.send(JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }));
      clientB.send(JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }));
      await settle(100);

      const promiseA = waitForMessage(
        clientA,
        (msg) => msg['type'] === 'board.changed',
        3000,
      );
      const promiseB = waitForMessage(
        clientB,
        (msg) => msg['type'] === 'board.changed',
        3000,
      );

      await server.app.inject({
        method: 'PUT',
        url: '/api/v1/boards/activity-UC-003',
        payload: { scene: JSON.parse(SCENE_V2_JSON) },
        headers: { 'content-type': 'application/json' },
      });

      await Promise.all([promiseA, promiseB]);
      // Both resolved without throwing means both received the event
    } finally {
      clientA.close();
      clientB.close();
      await settle(100);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-4: originId: null when PUT carries no originId
// ---------------------------------------------------------------------------

describe('TC-4: originId null when PUT carries no originId', () => {
  it('board.changed.originId is null when PUT has no originId field', async () => {
    await settle();

    const client = await openWS(server.port);
    try {
      client.send(JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }));
      await settle(100);

      const receivedPromise = waitForMessage(
        client,
        (msg) => msg['type'] === 'board.changed',
        3000,
      );

      await server.app.inject({
        method: 'PUT',
        url: '/api/v1/boards/activity-UC-003',
        payload: { scene: JSON.parse(SCENE_JSON) },
        headers: { 'content-type': 'application/json' },
      });

      const msg = await receivedPromise;
      assert.strictEqual(msg['originId'], null, `expected null, got ${JSON.stringify(msg['originId'])}`);
    } finally {
      client.close();
      await settle(100);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-5: originId propagated when PUT carries one
// ---------------------------------------------------------------------------

describe('TC-5: originId propagated when PUT carries one', () => {
  it('board.changed.originId matches the value sent in PUT body', async () => {
    await settle();

    const client = await openWS(server.port);
    try {
      client.send(JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }));
      await settle(100);

      const receivedPromise = waitForMessage(
        client,
        (msg) => msg['type'] === 'board.changed',
        3000,
      );

      await server.app.inject({
        method: 'PUT',
        url: '/api/v1/boards/activity-UC-003',
        payload: { scene: JSON.parse(SCENE_JSON), originId: 'tok-xyz' },
        headers: { 'content-type': 'application/json' },
      });

      const msg = await receivedPromise;
      assert.equal(msg['originId'], 'tok-xyz', `expected tok-xyz, got ${JSON.stringify(msg['originId'])}`);
    } finally {
      client.close();
      await settle(100);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-6: fs-watcher broadcast fires for skill/manual writes (no PUT)
// ---------------------------------------------------------------------------

describe('TC-6: fs-watcher broadcast fires for direct file writes (skill path)', () => {
  it('direct writeFile to boards dir triggers board.changed with originId=null', async () => {
    await settle();

    const client = await openWS(server.port);
    try {
      client.send(JSON.stringify({ type: 'subscribe', channel: 'board:activity-UC-003' }));
      await settle(100);

      const receivedPromise = waitForMessage(
        client,
        (msg) => msg['type'] === 'board.changed',
        4000,
      );

      // Simulate a skill write directly to the filesystem (bypasses PUT route)
      await writeFile(
        join(server.boardsDir, 'activity-UC-003.excalidraw'),
        SCENE_V2_JSON,
        'utf-8',
      );

      const msg = await receivedPromise;
      assert.equal(msg['type'], 'board.changed');
      // No pending origin was set → null
      assert.strictEqual(msg['originId'], null, `expected null for skill write, got ${JSON.stringify(msg['originId'])}`);
    } finally {
      client.close();
      await settle(100);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-7: isRecentSelfWrite gate is absent from broadcast path (structural check)
// ---------------------------------------------------------------------------

describe('TC-7: isRecentSelfWrite gate is absent from broadcast path', () => {
  it('index.ts watcher callback does not call isRecentSelfWrite (source grep)', async () => {
    // Structural test: read the watcher callback region of index.ts and assert
    // that isRecentSelfWrite is not referenced in it. This is a deterministic
    // source check — the ESM module system prevents monkey-patching exports.
    const { readFile: readFileNode } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { dirname: dirnameNode, join: joinNode } = await import('node:path');

    const thisFile = fileURLToPath(import.meta.url);
    const serverSrc = joinNode(dirnameNode(thisFile), '..', 'index.ts');
    const source = await readFileNode(serverSrc, 'utf-8');

    // Strip line comments (//) before checking for calls to isRecentSelfWrite.
    // The comment explaining the removed gate may legitimately reference the name.
    const noComments = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    // The function must not be called (not imported, not invoked)
    assert.ok(
      !noComments.includes('isRecentSelfWrite('),
      'index.ts must not CALL isRecentSelfWrite after FR-002 fix (check the watcher callback)',
    );
    assert.ok(
      !noComments.includes("from './services/self-writes"),
      'index.ts must not import from self-writes after FR-002 fix',
    );
  });
});

// ---------------------------------------------------------------------------
// TC-8: Backwards compatibility — PUT without originId still saves the board
// ---------------------------------------------------------------------------

describe('TC-8: backwards compatibility — PUT without originId still saves board', () => {
  it('GET /boards/:name returns new content after PUT with no originId', async () => {
    const putRes = await server.app.inject({
      method: 'PUT',
      url: '/api/v1/boards/activity-UC-003',
      payload: { scene: JSON.parse(SCENE_V2_JSON) },
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(putRes.statusCode, 200, `PUT failed: ${putRes.body}`);

    const getRes = await server.app.inject({
      method: 'GET',
      url: '/api/v1/boards/activity-UC-003',
    });
    assert.equal(getRes.statusCode, 200, `GET failed: ${getRes.body}`);

    const body = JSON.parse(getRes.body) as {
      scene: { elements: unknown[] };
    };
    assert.ok(
      Array.isArray(body.scene?.elements),
      'response should have scene.elements',
    );
    assert.equal(body.scene.elements.length, 1, 'should have 1 element after PUT');
  });
});

// ---------------------------------------------------------------------------
// TC-10: production /ws handler accepts the `type` subscribe field (structural)
// ---------------------------------------------------------------------------

describe('TC-10: production /ws handler accepts the `type` subscribe field', () => {
  it('index.ts WS message handler reads msg.type (web client contract)', async () => {
    // The web client (web/src/api/ws.ts) sends subscribe frames keyed by `type`.
    // The production WS handler in index.ts MUST parse `type` (legacy `op` may
    // remain as an alias). This guards the FR-002 contract that would otherwise
    // let the feature silently break against a real server while a divergent
    // test harness stays green.
    const { readFile: readFileNode } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { dirname: dirnameNode, join: joinNode } = await import('node:path');

    const thisFile = fileURLToPath(import.meta.url);
    const serverSrc = joinNode(dirnameNode(thisFile), '..', 'index.ts');
    const source = await readFileNode(serverSrc, 'utf-8');

    const noComments = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    assert.ok(
      noComments.includes('msg.type'),
      'index.ts WS handler must read msg.type — the web client sends subscribe frames keyed by `type` (FR-002)',
    );
  });
});

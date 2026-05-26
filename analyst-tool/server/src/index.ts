import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { configManager, getConfig, ensureRegistry } from './config.js';
import { boardsRoutes } from './routes/boards.js';
import { skillsRoutes } from './routes/skills.js';
import { runsRoutes } from './routes/runs.js';
import { diagnosticsRoutes } from './routes/diagnostics.js';
import { snapshotsRoutes } from './routes/snapshots.js';
import { searchRoutes } from './routes/search.js';
import { projectsRoutes } from './routes/projects.js';
import { versionRoutes } from './routes/version.js';
import { renderRoutes } from './routes/render.js';
import { getVersionInfo } from './services/version.js';
import { start as startWatcher } from './services/fs-watcher.js';
import { consumePendingOrigin } from './services/boards.js';
import { start as startRegistryWatcher, stop as stopRegistryWatcher } from './services/registry-watcher.js';
import { getPacer, shutdown as shutdownPinch } from './services/pinch.js';
import { subscribe, unsubscribe, unsubscribeAll, broadcast } from './ws/events.js';
import { syncOnStartup } from './services/bootstrap.js';
import { registerStaticServing } from './static.js';
import { reloadDriver } from './services/neo4j.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
    ) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

// ---------------------------------------------------------------------------
// startServer — exported for use by the CLI binary (nacl-analyst-tool.js)
// ---------------------------------------------------------------------------

export interface StartServerOptions {
  port: number;
  host: string;
  /** When true, serve web/dist/ as static files (production mode). */
  serveStatic: boolean;
  /** When true, caller intends to open the browser (handled by the CLI). */
  openBrowser: boolean;
}

/**
 * Starts the Fastify server and all background services.
 * Returns a `stop` function that cleanly shuts everything down.
 */
export async function startServer(options: StartServerOptions): Promise<() => Promise<void>> {
  const { port, host, serveStatic } = options;

  // ── bootstrap: ensure registry + load active project ────────────────────
  await ensureRegistry();
  await configManager.reload();

  const resolvedConfig = getConfig();
  // Log resolved source so operators can verify
  process.stdout.write(
    `[config] source=${resolvedConfig.source} repoRoot=${resolvedConfig.repoRoot} ` +
    `projectId=${resolvedConfig.projectId} boardsDir=${resolvedConfig.boardsDir}\n`,
  );

  // Sync project root for any known project.id found in config.yaml
  await syncOnStartup();

  const server = Fastify({ logger: true });

  // In dev mode the browser hits Vite at :3582 which proxies to :3583.
  // In prod mode everything is on one port — allow same-origin requests.
  const allowedOrigins = serveStatic
    ? false // same-origin; no CORS header needed
    : (['http://localhost:3582', `http://${host}:3582`] as string[]);

  await server.register(cors, { origin: allowedOrigins });
  await server.register(websocket);

  // ── health ────────────────────────────────────────────────────────────────
  server.get('/api/v1/health', async () => ({
    status: 'ok',
    version: getVersion(),
    uptime: process.uptime(),
  }));

  // ── WebSocket hub ─────────────────────────────────────────────────────────
  await server.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket) => {
      socket.on('message', (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            op?: string;
            type?: string;
            channel?: string;
            originId?: string;
          };
          // FR-002: the web client sends `type`; older callers used `op`. Accept both.
          // `originId` may ride along on subscribe; suppression is client-side, so it is
          // parsed-and-ignored here (the server tags board.changed from the PUT origin).
          const action = msg.type ?? msg.op;
          if (action === 'subscribe' && typeof msg.channel === 'string') {
            subscribe(msg.channel, socket);
          } else if (action === 'unsubscribe' && typeof msg.channel === 'string') {
            unsubscribe(msg.channel, socket);
          }
        } catch {
          // ignore malformed messages
        }
      });

      socket.on('close', () => {
        unsubscribeAll(socket);
      });
    });
  });

  // ── API routes ────────────────────────────────────────────────────────────
  await server.register(
    async (fastify) => {
      await boardsRoutes(fastify);
      fastify.register(skillsRoutes, { prefix: '/skills' });
      await runsRoutes(fastify);
      await diagnosticsRoutes(fastify);
      await snapshotsRoutes(fastify);
      await searchRoutes(fastify);
      await projectsRoutes(fastify);
      await versionRoutes(fastify);
      fastify.register(renderRoutes, { prefix: '/render' });
    },
    { prefix: '/api/v1' },
  );

  // === Wave 6.B: production static serving ===
  if (serveStatic) {
    await registerStaticServing(server);
  }
  // === end Wave 6.B ===

  // ── background services ───────────────────────────────────────────────────
  getPacer();

  const watcherStop = startWatcher(
    getConfig().boardsDir,
    (event) => {
      // Consume the originId set by writeBoard (null for external/skill writes).
      // The isRecentSelfWrite gate has been removed: every write produces a
      // board.changed broadcast. Clients suppress their own echo client-side
      // using the originId they sent on subscribe (FR-002 / UC-020-BE).
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
    (snapEvent) => {
      broadcast(`board:${snapEvent.boardName}`, {
        type: 'snapshot.created',
        boardName: snapEvent.boardName,
        timestamp: snapEvent.timestamp,
      });
    },
  );

  // Subscribe to config changes: broadcast boards.cleared before watcher restart when repoRoot changes
  configManager.onConfigChange((next, prev) => {
    if (next.repoRoot !== prev.repoRoot) {
      // Signal the UI to clear its board/run/snapshot state before new tree events arrive
      broadcast('boards', { type: 'boards.cleared' });
      server.log.info(`[config] repoRoot changed — emitted boards.cleared`);
      // Reset the Neo4j driver so the next query uses the new project's bolt config
      reloadDriver().catch((err: unknown) => {
        server.log.error({ err }, '[config] Failed to reload Neo4j driver');
      });
    }
    if (next.boardsDir !== prev.boardsDir) {
      server.log.info(`[config] boardsDir changed — restarting fs-watcher on ${next.boardsDir}`);
      watcherStop.handle.restart(next.boardsDir).catch((err: unknown) => {
        server.log.error({ err }, '[config] Failed to restart fs-watcher');
      });
    }
  });

  // Start the registry file watcher so external edits (e.g. from nacl-init) are surfaced over WS
  startRegistryWatcher(broadcast);

  // ── listen ────────────────────────────────────────────────────────────────
  await server.listen({ port, host });

  // Print build identity to the console so the operator can confirm the build
  // they're running. Matches the line surfaced by /api/v1/version and the UI.
  const v = getVersionInfo();
  server.log.info(`[build] analyst-tool-server v${v.version} (sha=${v.gitSha}) startedAt=${v.startedAt}`);

  // ── stop function ─────────────────────────────────────────────────────────
  const stop = async (): Promise<void> => {
    server.log.info('Shutting down');
    await watcherStop();
    await stopRegistryWatcher();
    await shutdownPinch();
    await server.close();
  };

  return stop;
}

// === Wave 6.B: production entrypoint ===
// Only boot automatically when running under `npm run dev` (NACL_DEV=true).
// When the CLI binary imports this module it calls startServer() itself.
if (process.env['NACL_DEV'] === 'true') {
  const cfg = getConfig();
  const stop = await startServer({
    port: cfg.port,
    host: cfg.host,
    serveStatic: false,
    openBrowser: false,
  });

  process.on('SIGTERM', () => void stop().then(() => process.exit(0)));
  process.on('SIGINT',  () => void stop().then(() => process.exit(0)));
}
// === end Wave 6.B ===

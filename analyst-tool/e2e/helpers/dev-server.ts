/**
 * dev-server.ts — programmatic spawn/wait/kill helper for Pattern B isolation.
 *
 * Pattern A (single shared webServer in playwright.config.ts) would inject
 * synthetic env vars into the shared server, polluting the existing 5 suites
 * that rely on the real boards directory. Pattern B avoids that by spawning a
 * dedicated server process per test group with its own env and port.
 *
 * Each DevServer instance:
 *   1. Spawns `tsx watch src/index.ts` (or compiled) with custom env vars.
 *   2. Polls `GET http://127.0.0.1:<port>/api/v1/health` until 200 or timeout.
 *   3. Exposes `baseUrl` for direct API calls in tests.
 *   4. Provides `kill()` for cleanup in afterAll.
 *
 * Tests call the Fastify API directly on port 3583+ — they do NOT load a
 * browser UI, so there is no Vite involved. This is intentional: the multi-
 * project tests are API/state tests, not rendering tests.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to analyst-tool root and server
const TOOL_ROOT = join(__dirname, '..', '..');
const SERVER_DIR = join(TOOL_ROOT, 'server');
const SERVER_ENTRY = join(SERVER_DIR, 'src', 'index.ts');

export interface DevServerOptions {
  /** Port for Fastify to listen on. Default: 3583. */
  port?: number;
  /** Extra environment variables merged on top of process.env. */
  env?: Record<string, string>;
  /** Working directory for the server process. Default: SERVER_DIR. */
  cwd?: string;
  /** Milliseconds to wait for the health endpoint. Default: 30 000. */
  timeoutMs?: number;
}

export interface DevServer {
  /** Base URL for the Fastify server, e.g. http://127.0.0.1:3590 */
  baseUrl: string;
  /** Gracefully terminate the server process. */
  kill(): Promise<void>;
}

/**
 * Spawns an isolated Fastify dev server and waits until it is healthy.
 *
 * @example
 * const server = await startDevServer({ port: 3590, env: { NACL_HOME: '/tmp/test-home' } });
 * // ... use server.baseUrl ...
 * await server.kill();
 */
export async function startDevServer(opts: DevServerOptions = {}): Promise<DevServer> {
  const port = opts.port ?? 3583;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    // Override the port via the server's own env var convention.
    // The server currently hard-codes 3583 in resolveConfig() — we override via
    // NACL_PORT which is read in the startup shim below. If the server doesn't
    // honour NACL_PORT we use a wrapper script approach instead.
    NACL_DEV: 'true',
    PORT: String(port),
    NACL_PORT: String(port),
    // Suppress browser open
    NACL_NO_OPEN: 'true',
  };

  // tsx is a devDep of the root analyst-tool workspace (hoisted)
  const tsxBin = join(TOOL_ROOT, 'node_modules', '.bin', 'tsx');

  const child: ChildProcess = spawn(
    tsxBin,
    ['watch', '--no-cache', SERVER_ENTRY],
    {
      env,
      cwd: opts.cwd ?? SERVER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    },
  );

  // Forward server stderr to parent process stderr for easier debugging
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[dev-server:${port}] ${chunk.toString()}`);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const healthUrl = `${baseUrl}/api/v1/health`;

  // Poll health endpoint
  const deadline = Date.now() + timeoutMs;
  let healthy = false;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.status === 200) {
        healthy = true;
        break;
      }
    } catch {
      // not ready yet
    }
    await sleep(300);
  }

  if (!healthy) {
    child.kill();
    throw new Error(
      `dev-server on port ${port} did not become healthy within ${timeoutMs}ms`,
    );
  }

  return {
    baseUrl,
    kill(): Promise<void> {
      return new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        // Force-kill after 5 s
        setTimeout(() => {
          if (child.exitCode === null) {
            child.kill('SIGKILL');
          }
        }, 5_000).unref();
      });
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

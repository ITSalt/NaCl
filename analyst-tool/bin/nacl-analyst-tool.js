#!/usr/bin/env node
// Wave 6.B: CLI entry-point for the nacl-analyst-tool binary.
// ESM — requires Node 18+. No external deps beyond the built server.

import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { openBrowser } from './open-browser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from the workspace root package.json.
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version ?? '0.0.0';

function readGitSha() {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 1000,
    }).trim();
    if (!sha) return 'unknown';
    try {
      const status = execSync('git status --porcelain', {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
        timeout: 1000,
      });
      return status.length > 0 ? `${sha}-dirty` : sha;
    } catch {
      return sha;
    }
  } catch {
    return 'unknown';
  }
}
const GIT_SHA = readGitSha();

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port:     { type: 'string',  short: 'p', default: '3582' },
    host:     { type: 'string',               default: '127.0.0.1' },
    'no-open': { type: 'boolean',              default: false },
    help:     { type: 'boolean', short: 'h', default: false },
    version:  { type: 'boolean', short: 'V', default: false },
  },
  allowPositionals: false,
  strict: true,
});

if (values.version) {
  process.stdout.write(`nacl-analyst-tool v${VERSION}\n`);
  process.exit(0);
}

if (values.help) {
  process.stdout.write(`
nacl-analyst-tool v${VERSION}

Usage:
  nacl-analyst-tool [options]

Options:
  -p, --port <n>   Port to listen on (default: 3582)
      --host <addr> Host to bind to (default: 127.0.0.1)
      --no-open    Do not open the browser automatically
  -h, --help       Show this help message
  -V, --version    Print the version and exit

Description:
  Starts the NaCl Analyst Tool — a local web application for browsing and
  editing Excalidraw boards with NaCl skill integration.

  The server binds to http://<host>:<port> and serves the web UI at /.
  API endpoints are available at /api/v1/... and WebSocket at /ws.

Examples:
  nacl-analyst-tool                     # start on default port 3582
  nacl-analyst-tool --port 4000         # start on port 4000
  nacl-analyst-tool --no-open           # start without opening the browser
`);
  process.exit(0);
}

const port = parseInt(values.port, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  process.stderr.write(`[nacl-analyst-tool] Invalid port: ${values.port}\n`);
  process.exit(1);
}

const host = values.host;
const shouldOpen = !values['no-open'];

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// Import the built server. When installed via npm link or npm install -g .,
// this resolves to <analyst-tool>/server/dist/index.js.
const serverPath = join(__dirname, '..', 'server', 'dist', 'index.js');

let startServer;
try {
  const serverModule = await import(serverPath);
  startServer = serverModule.startServer;
  if (typeof startServer !== 'function') {
    throw new Error('startServer is not a function — rebuild the server with `npm run build --workspace=server`');
  }
} catch (err) {
  process.stderr.write(`[nacl-analyst-tool] Failed to load server: ${err.message}\n`);
  process.stderr.write(`  Expected built output at: ${serverPath}\n`);
  process.stderr.write(`  Run: npm run build --workspace=server\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// Build identity, printed first so the operator can confirm which build is
// running before any [config]/[bootstrap] noise scrolls past.
process.stdout.write(`[nacl-analyst-tool] v${VERSION} (sha=${GIT_SHA})\n`);

let stopServer;
try {
  stopServer = await startServer({ port, host, serveStatic: true, openBrowser: false });
} catch (err) {
  process.stderr.write(`[nacl-analyst-tool] Server failed to start: ${err.message}\n`);
  process.exit(1);
}

const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
process.stdout.write(`[nacl-analyst-tool] Listening on ${url}\n`);

if (shouldOpen) {
  openBrowser(url);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const shutdown = async (signal) => {
  process.stdout.write(`\n[nacl-analyst-tool] Received ${signal}, shutting down\n`);
  try {
    if (typeof stopServer === 'function') {
      await stopServer();
    }
  } catch (err) {
    process.stderr.write(`[nacl-analyst-tool] Error during shutdown: ${err.message}\n`);
  }
  process.exit(0);
};

process.on('SIGINT',  () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

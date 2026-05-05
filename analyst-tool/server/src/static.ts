// Wave 6.B: static file serving for production (serveStatic === true).
// Registers @fastify/static with SPA fallback and appropriate cache headers.

import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the path to `web/dist` relative to this file.
 * Works both from `server/src/` (dev, ts-node) and from `server/dist/`
 * (compiled output), and also after `npm link` where the real file lives
 * inside the cloned repo directory.
 *
 * From server/dist/static.js the layout is:
 *   analyst-tool/
 *     server/dist/static.js   ← __dirname
 *     web/dist/               ← two levels up, then web/dist
 */
function resolveWebDist(): string {
  return join(__dirname, '..', '..', 'web', 'dist');
}

export async function registerStaticServing(fastify: FastifyInstance): Promise<void> {
  const root = resolveWebDist();

  if (!existsSync(root)) {
    fastify.log.warn(`[static] web/dist not found at ${root} — static serving disabled. Run: npm run build --workspace=web`);
    return;
  }

  await fastify.register(fastifyStatic, {
    root,
    prefix: '/',
    // Serve index.html for directory requests.
    index: 'index.html',
    // Apply cache headers based on file path.
    setHeaders(res, filePath) {
      if (filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  });

  // SPA fallback: any GET that doesn't match /api or /ws returns index.html
  // so that React Router can handle client-side navigation.
  // This wildcard must be registered AFTER @fastify/static to take lower priority.
  fastify.setNotFoundHandler(async (request, reply) => {
    if (
      request.method === 'GET' &&
      !request.url.startsWith('/api') &&
      !request.url.startsWith('/ws')
    ) {
      return reply
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .sendFile('index.html');
    }

    // Non-GET or API/WS paths: standard 404.
    await reply.status(404).send({ error: 'Not Found' });
  });
}

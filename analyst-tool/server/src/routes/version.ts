/**
 * /api/v1/version — read-only build identity.
 *
 * Used by the web UI to verify that the bundle it loaded talks to the server
 * build the user expects. No auth; no caching headers (the response is small
 * and the value changes on each restart).
 */
import type { FastifyInstance } from 'fastify';
import { getVersionInfo } from '../services/version.js';

export async function versionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/version', async () => {
    return getVersionInfo();
  });
}

/**
 * search route — GET /api/v1/search?q=...&limit=20
 *
 * Validates q: 1–256 chars, no control characters.
 * Default limit=20, max 100.
 * Delegates to search service which combines board + graph results.
 */
import type { FastifyInstance } from 'fastify';
import { search } from '../services/search.js';

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { q?: string; limit?: string };
  }>('/search', async (req, reply) => {
    const q = req.query.q ?? '';
    const rawLimit = req.query.limit;

    // Validate q
    if (q.length === 0 || q.length > 256) {
      return reply.status(400).send({
        error: { code: 'invalid_query', message: 'q must be 1–256 characters' },
      });
    }
    if (CONTROL_CHAR_RE.test(q)) {
      return reply.status(400).send({
        error: { code: 'invalid_query', message: 'q must not contain control characters' },
      });
    }

    // Parse limit
    let limit = 20;
    if (rawLimit !== undefined) {
      const parsed = parseInt(rawLimit, 10);
      if (isNaN(parsed) || parsed < 1) {
        return reply.status(400).send({
          error: { code: 'invalid_limit', message: 'limit must be a positive integer' },
        });
      }
      limit = Math.min(parsed, 100);
    }

    try {
      const results = await search(q, { limit });
      return reply.status(200).send(results);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: { code: 'internal', message: 'Internal server error' },
      });
    }
  });
}

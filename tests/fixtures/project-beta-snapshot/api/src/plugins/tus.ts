// Synthetic reconstruction of the project-beta TUS plugin gap.
// Source episodes:
//   - project-beta-postmortem.md § 3.2 (TECH-008 Fastify 5 content-type parser SPEC MISSING)
//   - project-beta-postmortem.md `15c6a20 fix: TUS Location header uses https behind Caddy reverse proxy`
//
// At wave-tip this file mounts @tus/server WITHOUT:
//   - addContentTypeParser for `application/offset+octet-stream`
//   - `respectForwardedHeaders` / X-Forwarded-Proto handling
//
// The latter only surfaces under PROD_GOLDEN_PATH (W3 stage) — health
// pings to `/api/health` are 200 OK, but the Location header returned
// to the browser is http://… not https://… and the client cannot
// continue the upload.

import type { FastifyInstance } from 'fastify';

export async function tusPlugin(app: FastifyInstance): Promise<void> {
  // BUG 1: missing `app.addContentTypeParser('application/offset+octet-stream', ...)`
  // → Fastify 5 rejects every TUS PATCH with HTTP 415.
  //
  // BUG 2: missing `respectForwardedHeaders` — TUS Location header
  // built from request hostname, ignoring X-Forwarded-Proto. Returns
  // http behind Caddy → browser blocks (mixed content).
  app.get('/api/uploads', async (_req, reply) => {
    return reply.code(501).send({ message: 'TUS server not yet registered' });
  });
}

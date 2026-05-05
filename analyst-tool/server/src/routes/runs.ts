import type { FastifyInstance } from 'fastify';
import { listRecent, getByRunId } from '../services/run-queue.js';

export async function runsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { limit?: string } }>('/runs', async (req) => {
    const raw = parseInt(req.query.limit ?? '50', 10);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 50;
    return listRecent(limit);
  });

  fastify.get<{ Params: { runId: string } }>('/runs/:runId', async (req, reply) => {
    const { runId } = req.params;
    const status = getByRunId(runId);
    if (!status) {
      return reply.status(404).send({ error: { code: 'not_found', message: `Run "${runId}" not found` } });
    }
    return status;
  });
}

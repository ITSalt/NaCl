import type { FastifyInstance } from 'fastify';
import { listBoards, readBoard, writeBoard } from '../services/boards.js';
import { computeBoardHash } from '../services/meta.js';
import { discoverRenderable } from '../services/renderable.js';
import { getDriverAsync } from '../services/neo4j.js';
import { getConfig } from '../config.js';

const BOARD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function validateName(name: string): boolean {
  return BOARD_NAME_RE.test(name);
}

export async function boardsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/boards', async (_req, reply) => {
    try {
      const boards = await listBoards();
      return boards;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to list boards' });
    }
  });

  // List of boards that the graph says could be rendered right now —
  // includes ones that have not been rendered to disk yet. The frontend
  // diffs this against /boards to show "available to generate" placeholders
  // in the sidebar.
  fastify.get('/renderable', async (_req, reply) => {
    try {
      const driver = await getDriverAsync(getConfig().repoRoot);
      const items = await discoverRenderable(driver);
      return items;
    } catch (err) {
      fastify.log.error(err);
      // Empty list (not 500) when the graph is unreachable — keeps UI usable.
      return reply.status(200).send([]);
    }
  });

  fastify.get<{ Params: { name: string } }>('/boards/:name', async (req, reply) => {
    const { name } = req.params;
    if (!validateName(name)) {
      return reply.status(400).send({ error: 'Invalid board name' });
    }
    try {
      const result = await readBoard(name);
      return result;
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      return reply.status(e.statusCode ?? 500).send({ error: e.message ?? 'Failed to read board' });
    }
  });

  fastify.put<{
    Params: { name: string };
    Body: { scene: { elements: unknown[]; [key: string]: unknown }; originId?: string };
  }>(
    '/boards/:name',
    {
      schema: {
        body: {
          type: 'object',
          required: ['scene'],
          properties: {
            scene: {
              type: 'object',
              required: ['elements'],
              properties: {
                elements: { type: 'array' },
              },
            },
            originId: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { name } = req.params;
      if (!validateName(name)) {
        return reply.status(400).send({ error: 'Invalid board name' });
      }
      try {
        const { originId } = req.body;
        const result = await writeBoard(name, req.body.scene, { originId });
        return result;
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return reply.status(e.statusCode ?? 500).send({ error: e.message ?? 'Failed to write board' });
      }
    },
  );

  fastify.get<{ Params: { name: string } }>('/boards/:name/status', async (req, reply) => {
    const { name } = req.params;
    if (!validateName(name)) {
      return reply.status(400).send({ error: 'Invalid board name' });
    }
    try {
      const { scene, meta } = await readBoard(name);
      let unsyncedEdits = false;
      if (meta.contentHashAtLastSync !== null) {
        const currentHash = computeBoardHash(scene);
        unsyncedEdits = currentHash !== meta.contentHashAtLastSync;
      }
      const syncStatus =
        meta.lastSyncedAt === null ? 'never-synced' : unsyncedEdits ? 'dirty' : 'synced';
      return {
        syncStatus,
        lastGeneratedAt: meta.lastGeneratedAt,
        lastSyncedAt: meta.lastSyncedAt,
        hasUnsyncedEdits: unsyncedEdits,
        meta,
      };
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      return reply.status(e.statusCode ?? 500).send({ error: e.message ?? 'Failed to get status' });
    }
  });
}

import type { FastifyInstance } from 'fastify';
import { listSnapshots, readSnapshot, restoreSnapshot } from '../services/snapshots.js';
import { readBoard } from '../services/boards.js';
import { diffScenes } from '../services/diff.js';
import { broadcast } from '../ws/events.js';

const BOARD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TIMESTAMP_RE = /^[A-Za-z0-9._-]+$/;

function validateName(name: string): boolean {
  return BOARD_NAME_RE.test(name);
}

function validateTimestamp(ts: string): boolean {
  return TIMESTAMP_RE.test(ts);
}

export async function snapshotsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /boards/:name/snapshots — list snapshots for a board
  fastify.get<{ Params: { name: string } }>('/boards/:name/snapshots', async (req, reply) => {
    const { name } = req.params;
    if (!validateName(name)) {
      return reply.status(400).send({ error: 'Invalid board name' });
    }
    try {
      const entries = await listSnapshots(name);
      return entries;
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      return reply.status(e.statusCode ?? 500).send({ error: e.message ?? 'Failed to list snapshots' });
    }
  });

  // GET /boards/:name/snapshots/:timestamp — get a snapshot scene
  fastify.get<{ Params: { name: string; timestamp: string } }>(
    '/boards/:name/snapshots/:timestamp',
    async (req, reply) => {
      const { name, timestamp } = req.params;
      if (!validateName(name)) {
        return reply.status(400).send({ error: 'Invalid board name' });
      }
      if (!validateTimestamp(timestamp)) {
        return reply.status(400).send({ error: 'Invalid snapshot timestamp' });
      }
      try {
        const scene = await readSnapshot(name, timestamp);
        void reply.header('X-Snapshot-Board', name);
        void reply.header('X-Snapshot-Timestamp', timestamp);
        return scene;
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return reply.status(e.statusCode ?? 500).send({ error: e.message ?? 'Failed to read snapshot' });
      }
    },
  );

  // GET /boards/:name/snapshots/:timestamp/diff?against=current|<otherTimestamp>
  fastify.get<{
    Params: { name: string; timestamp: string };
    Querystring: { against?: string };
  }>(
    '/boards/:name/snapshots/:timestamp/diff',
    async (req, reply) => {
      const { name, timestamp } = req.params;
      const against = req.query.against ?? 'current';

      if (!validateName(name)) {
        return reply.status(400).send({ error: 'Invalid board name' });
      }
      if (!validateTimestamp(timestamp)) {
        return reply.status(400).send({ error: 'Invalid snapshot timestamp' });
      }
      if (against !== 'current' && !validateTimestamp(against)) {
        return reply.status(400).send({ error: 'Invalid "against" parameter' });
      }

      try {
        const olderScene = await readSnapshot(name, timestamp);

        let newerScene;
        if (against === 'current') {
          const { scene } = await readBoard(name);
          newerScene = scene;
        } else {
          newerScene = await readSnapshot(name, against);
        }

        const result = diffScenes(olderScene, newerScene);
        return result;
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return reply.status(e.statusCode ?? 500).send({ error: e.message ?? 'Failed to compute diff' });
      }
    },
  );

  // POST /boards/:name/snapshots/:timestamp/restore
  fastify.post<{ Params: { name: string; timestamp: string } }>(
    '/boards/:name/snapshots/:timestamp/restore',
    async (req, reply) => {
      const { name, timestamp } = req.params;
      if (!validateName(name)) {
        return reply.status(400).send({ error: 'Invalid board name' });
      }
      if (!validateTimestamp(timestamp)) {
        return reply.status(400).send({ error: 'Invalid snapshot timestamp' });
      }
      try {
        const result = await restoreSnapshot(name, timestamp);

        // Broadcast board.changed so clients reload
        broadcast(`board:${name}`, { type: 'board.changed', mtime: result.mtime });
        // Broadcast tree.changed so board list refreshes
        broadcast('boards', { type: 'tree.changed', boardName: name, eventType: 'change' });

        return result;
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return reply.status(e.statusCode ?? 500).send({ error: e.message ?? 'Failed to restore snapshot' });
      }
    },
  );
}

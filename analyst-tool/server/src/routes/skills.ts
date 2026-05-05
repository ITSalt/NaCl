import type { FastifyInstance } from 'fastify';
import { enqueue, enqueueBatch } from '../services/run-queue.js';
import type { SkillKind } from '../services/skill-runner.js';
import { listBoards } from '../services/boards.js';
import { discoverRenderable, type RenderableBoard } from '../services/renderable.js';
import { getDriverAsync } from '../services/neo4j.js';
import { getConfig } from '../config.js';

const BOARD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const skillBodySchema = {
  type: 'object',
  required: ['board'],
  properties: {
    board: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

const batchBodySchema = {
  type: 'object',
  required: ['op'],
  properties: {
    op: { type: 'string', enum: ['regenerate', 'sync'] },
    boards: { type: 'array', items: { type: 'string' }, minItems: 1 },
    all: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

function registerSkillRoute(fastify: FastifyInstance, kind: SkillKind): void {
  fastify.post<{ Body: { board: string } }>(
    `/${kind}`,
    { schema: { body: skillBodySchema } },
    async (req, reply) => {
      const { board } = req.body;

      if (!BOARD_NAME_RE.test(board)) {
        return reply.status(400).send({
          error: { code: 'invalid_board_name', message: `Invalid board name: "${board}"` },
        });
      }

      try {
        const handle = enqueue({ kind, board });
        // Fire-and-track: return runId immediately; progress comes via WS.
        // Attach a no-op catch so Node doesn't surface an unhandled rejection.
        handle.promise.catch(() => { /* handled inside run-queue / skill-runner */ });
        return reply.status(200).send({ runId: handle.runId });
      } catch (err) {
        const e = err as {
          statusCode?: number;
          code?: string;
          message?: string;
          activeRunId?: string;
        };

        if (e.statusCode === 409 && e.code === 'busy') {
          return reply.status(409).send({
            error: {
              code: 'busy',
              message: e.message ?? 'A run of this kind is already active',
              activeRunId: e.activeRunId,
            },
          });
        }

        if (e.statusCode === 400) {
          return reply.status(400).send({
            error: { code: e.code ?? 'bad_request', message: e.message ?? 'Bad request' },
          });
        }

        fastify.log.error(err);
        return reply.status(500).send({
          error: { code: 'internal', message: 'Internal server error' },
        });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Batch endpoint
// ---------------------------------------------------------------------------

interface BatchBody {
  op: 'regenerate' | 'sync';
  boards?: string[];
  all?: boolean;
}

export async function skillsRoutes(fastify: FastifyInstance): Promise<void> {
  registerSkillRoute(fastify, 'regenerate');
  registerSkillRoute(fastify, 'sync');
  registerSkillRoute(fastify, 'analyze');

  fastify.post<{ Body: BatchBody }>(
    '/batch',
    { schema: { body: batchBodySchema } },
    async (req, reply) => {
      const { op, boards: explicitBoards, all } = req.body;

      if (!all && (!explicitBoards || explicitBoards.length === 0)) {
        return reply.status(400).send({
          error: { code: 'bad_request', message: 'Either all:true or a non-empty boards array is required' },
        });
      }

      // ── Graph-driven "Regen All" ────────────────────────────────────────────
      if (op === 'regenerate' && all) {
        // Step 1: try to discover renderable boards from the graph
        let discovered: RenderableBoard[] = [];
        try {
          const driver = await getDriverAsync(getConfig().repoRoot);
          discovered = await discoverRenderable(driver);
        } catch {
          // getDriverAsync should never throw, but be defensive
          discovered = [];
        }

        if (discovered.length > 0) {
          // Build board name list from discovery
          const eligible = discovered.map((r) => r.board);
          const reqs = eligible.map((board) => ({ kind: op as SkillKind, board }));
          try {
            const { batchId, runIds } = enqueueBatch(reqs);
            return reply.status(200).send({
              batchId,
              runIds,
              source: 'graph',
              discovered,
            });
          } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({
              error: { code: 'internal', message: 'Internal server error' },
            });
          }
        }

        // Step 2: graph empty or unreachable — fall back to file-system list
        const boardList = await listBoards();
        const { classifyBoard } = await import('../services/board-classifier.js');
        const skipped: { board: string; reason: string }[] = [];
        const eligible: string[] = [];

        for (const b of boardList) {
          const cls = classifyBoard(b.name);
          if (cls.kind === 'import' || cls.kind === 'other') {
            skipped.push({ board: b.name, reason: `Board kind "${cls.kind}" does not support regenerate` });
          } else {
            eligible.push(b.name);
          }
        }

        if (eligible.length === 0) {
          return reply.status(200).send({
            batchId: null,
            runIds: [],
            source: discovered.length === 0 ? 'graph' : 'fs',
            skipped,
            message: 'Nothing to regenerate — graph has no entities and boards directory is empty',
          });
        }

        const reqs = eligible.map((board) => ({ kind: op as SkillKind, board }));
        try {
          const { batchId, runIds } = enqueueBatch(reqs);
          return reply.status(200).send({ batchId, runIds, source: 'fs', skipped });
        } catch (err) {
          fastify.log.error(err);
          return reply.status(500).send({
            error: { code: 'internal', message: 'Internal server error' },
          });
        }
      }

      // ── Explicit board list or sync-all ────────────────────────────────────
      // Resolve board names
      let boardNames: string[];
      if (all) {
        // op === 'sync' with all:true — enumerate existing files
        const boardList = await listBoards();
        boardNames = boardList.map((b) => b.name);
      } else {
        boardNames = explicitBoards!;
      }

      // Validate all explicit board names up front — reject on any invalid name
      if (!all) {
        for (const name of boardNames) {
          if (!BOARD_NAME_RE.test(name)) {
            return reply.status(400).send({
              error: { code: 'invalid_board_name', message: `Invalid board name: "${name}"` },
            });
          }
        }
      }

      // For regenerate: skip boards that are import or other kind
      const skipped: { board: string; reason: string }[] = [];
      const eligible: string[] = [];

      if (op === 'regenerate') {
        const { classifyBoard } = await import('../services/board-classifier.js');
        for (const name of boardNames) {
          const cls = classifyBoard(name);
          if (cls.kind === 'import' || cls.kind === 'other') {
            skipped.push({
              board: name,
              reason: `Board kind "${cls.kind}" does not support regenerate`,
            });
          } else {
            eligible.push(name);
          }
        }
      } else {
        eligible.push(...boardNames);
      }

      if (eligible.length === 0) {
        return reply.status(200).send({
          batchId: null,
          runIds: [],
          skipped,
          message: 'No eligible boards for this operation',
        });
      }

      const reqs = eligible.map((board) => ({ kind: op as SkillKind, board }));

      try {
        const { batchId, runIds } = enqueueBatch(reqs);
        return reply.status(200).send({ batchId, runIds, skipped });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({
          error: { code: 'internal', message: 'Internal server error' },
        });
      }
    },
  );
}

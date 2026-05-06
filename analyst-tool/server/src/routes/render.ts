/**
 * render.ts — POST /api/v1/render/markdown
 *
 * Resolves the active project's driver + root, calls the Markdown dispatcher,
 * writes the output file, and returns { path, bytes }.
 *
 * Request body: { subtype: RenderMdKind, relatedId?: string }
 * Response:     { path: string, bytes: number }
 */
import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getConfig } from '../config.js';
import { getDriverAsync } from '../services/neo4j.js';
import { renderMarkdown, type RenderMdKind, MissingSourceFileError } from '../render/markdown/index.js';

const VALID_SUBTYPES: RenderMdKind[] = [
  'entity',
  'uc',
  'form',
  'domain-model',
  'uc-index',
  'traceability',
];

const renderMdBodySchema = {
  type: 'object',
  required: ['subtype'],
  properties: {
    subtype: { type: 'string', enum: VALID_SUBTYPES },
    relatedId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

interface RenderMdBody {
  subtype: RenderMdKind;
  relatedId?: string;
}

export async function renderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RenderMdBody }>(
    '/markdown',
    { schema: { body: renderMdBodySchema } },
    async (req, reply) => {
      const { subtype, relatedId } = req.body;

      try {
        const currentConfig = getConfig();
        const driver = await getDriverAsync(currentConfig.repoRoot);

        const { path: outPath, content } = await renderMarkdown(
          subtype,
          relatedId ?? null,
          driver,
          currentConfig.repoRoot,
        );

        // Ensure the target directory exists, then write
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, content, 'utf-8');

        return reply.status(200).send({
          path: outPath,
          bytes: Buffer.byteLength(content, 'utf-8'),
        });
      } catch (err) {
        if (err instanceof MissingSourceFileError) {
          return reply.status(409).send({
            code: 'missing_source_file',
            nodeLabel: err.nodeLabel,
            nodeId: err.nodeId,
            message: err.message,
          });
        }

        const e = err as { statusCode?: number; code?: string; message?: string };

        if (e.statusCode === 400 || e.statusCode === 404) {
          return reply.status(e.statusCode).send({
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

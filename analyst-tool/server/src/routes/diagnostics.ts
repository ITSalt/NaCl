/**
 * /api/v1/diagnostics — read-only snapshot of pacer + run-queue state.
 *
 * Surfaces what's blocking progress when a batch appears stuck:
 *   - pacer.stats() — queueDepth, globalActive, inWaveCooldown, windowOpen
 *   - run-queue active map — which runIds are claimed per skill kind
 *   - last 20 ring-buffer entries
 */
import type { FastifyInstance } from 'fastify';
import { getPacerStats } from '../services/pinch.js';
import { listActive, listRecent } from '../services/run-queue.js';
import { listBatches } from '../services/run-queue.js';
import { getConfig } from '../config.js';

export async function diagnosticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/diagnostics', async () => {
    const cfg = getConfig();
    return {
      timestamp: new Date().toISOString(),
      config: {
        repoRoot: cfg.repoRoot,
        boardsDir: cfg.boardsDir,
        projectId: cfg.projectId,
      },
      pacer: getPacerStats(),
      activeRuns: listActive(),
      recentRuns: listRecent(20),
      batches: listBatches().slice(-5),
    };
  });
}

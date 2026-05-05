/**
 * routes/projects.ts — Project registry REST endpoints.
 *
 * Mounted under /api/v1:
 *   GET  /projects           — list all projects + active id + source
 *   GET  /projects/active    — active project record + resolvedConfig
 *   POST /projects/:id/activate — switch active project (only mutating op)
 *
 * No create/update/delete — registration is solely handled by nacl-init (Wave 6.E).
 *
 * WS event vocabulary (channel: 'projects'):
 *   { type: 'projects.changed', projects, activeProjectId }
 *     — emitted when registry contents change (external edit or activate).
 *   { type: 'active.changed', activeProjectId, source }
 *     — emitted when only the active project changes (lighter event for UI redraws).
 *
 * Additional cross-channel event:
 *   channel 'boards': { type: 'boards.cleared' }
 *     — emitted when repoRoot changes so the UI clears its sidebar before
 *       the new fs-watcher starts producing tree.changed events.
 */
import type { FastifyInstance } from 'fastify';
import {
  loadRegistry,
  setActiveProject,
  InvalidProjectIdError,
  type ProjectRecord,
} from '../services/project-registry.js';
import { configManager, type ResolvedConfig } from '../config.js';
import { broadcast } from '../ws/events.js';
import { readCwdProjectId } from '../services/bootstrap.js';

// Pinch's project-id invariant: /^[a-z0-9_-]{1,64}$/
const PROJECT_ID_RE = /^[a-z0-9_-]{1,64}$/;

function isValidId(id: string): boolean {
  return PROJECT_ID_RE.test(id);
}

// ---------------------------------------------------------------------------
// Helper — emit projects.changed on the projects channel
// ---------------------------------------------------------------------------

async function broadcastProjectsChanged(): Promise<void> {
  try {
    const reg = await loadRegistry();
    broadcast('projects', {
      type: 'projects.changed',
      projects: reg.projects,
      activeProjectId: reg.activeProjectId,
    });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /projects ──────────────────────────────────────────────────────────
  fastify.get('/projects', async (_req, reply) => {
    try {
      const reg = await loadRegistry();
      const resolvedCfg = configManager.current();

      let unregisteredCwdProjectId: string | null = null;
      if (resolvedCfg.source === 'cwd') {
        const cwdId = await readCwdProjectId(resolvedCfg.repoRoot);
        if (cwdId && !reg.projects.some((p) => p.id === cwdId)) {
          unregisteredCwdProjectId = cwdId;
        }
      }

      return reply.send({
        projects: reg.projects,
        activeProjectId: reg.activeProjectId,
        source: resolvedCfg.source,
        unregisteredCwdProjectId,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: { code: 'internal_error', message: String(err) } });
    }
  });

  // ── GET /projects/active ───────────────────────────────────────────────────
  fastify.get('/projects/active', async (_req, reply) => {
    try {
      const reg = await loadRegistry();
      const resolvedCfg = configManager.current();

      let project: ProjectRecord | null = null;
      if (reg.activeProjectId) {
        project = reg.projects.find((p) => p.id === reg.activeProjectId) ?? null;
      }

      // source === 'cwd' and id not in registry → project is null but resolvedConfig still loads
      if (resolvedCfg.source === 'cwd' && !project) {
        project = null;
      }

      return reply.send({
        project,
        source: resolvedCfg.source,
        resolvedConfig: resolvedCfg,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: { code: 'internal_error', message: String(err) } });
    }
  });

  // ── POST /projects/:id/activate ────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/projects/:id/activate', async (req, reply) => {
    const { id } = req.params;

    if (!isValidId(id)) {
      return reply.status(400).send({
        error: { code: 'invalid_project_id', message: `Invalid project id: "${id}". Must match /^[a-z0-9_-]{1,64}$/` },
      });
    }

    let project: ProjectRecord;
    try {
      project = await setActiveProject(id);
    } catch (err) {
      if (err instanceof InvalidProjectIdError) {
        return reply.status(400).send({
          error: { code: 'invalid_project_id', message: (err as Error).message },
        });
      }
      // Not found
      return reply.status(404).send({
        error: { code: 'unknown_project', message: `Project "${id}" not found in registry` },
      });
    }

    const resolvedConfig: ResolvedConfig = await configManager.reload();

    // Emit WS: active.changed (lightweight)
    broadcast('projects', {
      type: 'active.changed',
      activeProjectId: id,
      source: resolvedConfig.source,
    });

    // Also emit projects.changed (full list refresh)
    await broadcastProjectsChanged();

    return reply.send({ project, resolvedConfig });
  });
}

// ---------------------------------------------------------------------------
// Exported broadcaster — used by the registry watcher
// ---------------------------------------------------------------------------

export { broadcastProjectsChanged };

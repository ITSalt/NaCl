/**
 * render/index — public entry point for the local Excalidraw renderer.
 *
 * Dispatches to the appropriate sub-renderer based on `kind`.
 * All four renderers produce deterministic output from the same graph state —
 * two consecutive calls with the same driver produce zero git diff.
 */
import type { Driver } from 'neo4j-driver';
import type { ExcalidrawScene } from './elements.js';
import { renderDomainModel } from './excalidraw/domain-model.js';
import { renderContextMap } from './excalidraw/context-map.js';
import { renderActivity } from './excalidraw/activity.js';
import { renderBaProcess } from './excalidraw/ba-process.js';

export type { ExcalidrawScene };

export type RenderKind = 'domain-model' | 'context-map' | 'activity' | 'process';

/**
 * Render an Excalidraw scene from the project's Neo4j graph.
 *
 * @param kind      Board kind (from classifyBoard)
 * @param relatedId UseCase id for 'activity', BusinessProcess id for 'process'; null otherwise
 * @param driver    Neo4j Driver configured for the active project
 */
export async function renderBoard(
  kind: RenderKind | string,
  relatedId: string | null,
  driver: Driver,
): Promise<ExcalidrawScene> {
  switch (kind) {
    case 'domain-model':
      return renderDomainModel(driver);

    case 'context-map':
      return renderContextMap(driver);

    case 'activity': {
      if (!relatedId) {
        throw Object.assign(
          new Error('activity board requires relatedId (UseCase id)'),
          { statusCode: 400, code: 'missing_related_id' },
        );
      }
      return renderActivity(driver, relatedId);
    }

    case 'process': {
      if (!relatedId) {
        throw Object.assign(
          new Error('process board requires relatedId (BusinessProcess id)'),
          { statusCode: 400, code: 'missing_related_id' },
        );
      }
      return renderBaProcess(driver, relatedId);
    }

    default:
      throw Object.assign(
        new Error(`renderBoard: unsupported kind "${kind}"`),
        { statusCode: 400, code: 'unsupported_render_kind' },
      );
  }
}

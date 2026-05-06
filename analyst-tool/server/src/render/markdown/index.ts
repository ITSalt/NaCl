/**
 * render/markdown/index — public dispatcher for all markdown renderers.
 *
 * Mirrors the shape of render/index.ts (Excalidraw dispatcher).
 *
 * The caller is responsible for writing the output file.
 */
import type { Driver } from 'neo4j-driver';
import { renderEntityMd } from './entity.js';
import { renderUcMd } from './uc.js';
import { renderFormMd } from './form.js';
import { renderDomainModelMd } from './domain-model.js';
import { renderUcIndexMd } from './uc-index.js';
import { renderTraceabilityMd } from './traceability.js';

export { MissingSourceFileError } from './errors.js';

export type RenderMdKind =
  | 'entity'
  | 'uc'
  | 'form'
  | 'domain-model'
  | 'uc-index'
  | 'traceability';

export interface RenderMdResult {
  /** Absolute target file path (computed from subtype + relatedId + projectRoot). */
  path: string;
  /** Rendered Markdown string. */
  content: string;
}

/**
 * Render a Markdown document from the project's Neo4j graph.
 *
 * @param kind        Document kind
 * @param relatedId   Entity id for 'entity', UC id for 'uc', Form id for 'form'; null for singletons
 * @param driver      Neo4j Driver configured for the active project
 * @param projectRoot Absolute project root (used to compose the output path)
 */
export async function renderMarkdown(
  kind: RenderMdKind | string,
  relatedId: string | null,
  driver: Driver,
  projectRoot: string,
): Promise<RenderMdResult> {
  switch (kind) {
    case 'entity': {
      if (!relatedId) {
        throw Object.assign(
          new Error('entity renderer requires relatedId (DomainEntity id)'),
          { statusCode: 400, code: 'missing_related_id' },
        );
      }
      return renderEntityMd(driver, relatedId, projectRoot);
    }

    case 'uc': {
      if (!relatedId) {
        throw Object.assign(
          new Error('uc renderer requires relatedId (UseCase id)'),
          { statusCode: 400, code: 'missing_related_id' },
        );
      }
      return renderUcMd(driver, relatedId, projectRoot);
    }

    case 'form': {
      if (!relatedId) {
        throw Object.assign(
          new Error('form renderer requires relatedId (Form id)'),
          { statusCode: 400, code: 'missing_related_id' },
        );
      }
      return renderFormMd(driver, relatedId, projectRoot);
    }

    case 'domain-model':
      return renderDomainModelMd(driver, projectRoot);

    case 'uc-index':
      return renderUcIndexMd(driver, projectRoot);

    case 'traceability':
      return renderTraceabilityMd(driver, projectRoot);

    default:
      throw Object.assign(
        new Error(`renderMarkdown: unsupported kind "${kind}"`),
        { statusCode: 400, code: 'unsupported_render_md_kind' },
      );
  }
}

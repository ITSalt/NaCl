/**
 * renderable — pure service that discovers which boards CAN be rendered from
 * the active project's Neo4j graph right now.
 *
 * Returns an empty array (never throws) when the graph is unreachable or empty.
 *
 * Cypher used (all read-only, parametrized or label-safe):
 *   domain-model : MATCH (n:DomainEntity) RETURN count(n) AS c
 *   context-map  : MATCH (n:Module)       RETURN count(n) AS c
 *   activity     : MATCH (uc:UseCase) WHERE EXISTS { (uc)-[:HAS_STEP]->(:ActivityStep) }
 *                  RETURN uc.id AS id ORDER BY uc.id
 *   process      : MATCH (bp:BusinessProcess) WHERE EXISTS { (bp)-[:HAS_STEP]->(:WorkflowStep) }
 *                  RETURN bp.id AS id ORDER BY bp.id
 */
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RenderableBoardKind = 'domain-model' | 'context-map' | 'activity' | 'process';

export interface RenderableBoard {
  /** Canonical filename without .excalidraw extension. */
  board: string;
  kind: RenderableBoardKind;
  relatedId: string | null;
  /** Human-readable explanation of why this board is renderable. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Run a single-row COUNT query. Returns the count, or -1 on error. */
async function countQuery(driver: Driver, cypher: string): Promise<number> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher);
    const record = result.records[0];
    if (!record) return 0;
    const raw = record.get('c') as { toNumber?: () => number } | number | null;
    if (raw === null || raw === undefined) return 0;
    return typeof raw === 'object' && raw.toNumber ? raw.toNumber() : (raw as number);
  } finally {
    await session.close();
  }
}

/** Run a multi-row id query. Returns array of id strings, or [] on error. */
async function idQuery(driver: Driver, cypher: string): Promise<string[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher);
    return result.records.map((r) => {
      const raw = r.get('id') as unknown;
      return String(raw ?? '');
    }).filter((id) => id.length > 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover which boards can be rendered from the graph reachable via `driver`.
 *
 * Driver is passed as a parameter (dependency injection) so callers can
 * provide a per-project driver with the correct bolt port/credentials.
 *
 * Never throws — on any error returns an empty array.
 */
export async function discoverRenderable(driver: Driver): Promise<RenderableBoard[]> {
  const results: RenderableBoard[] = [];

  try {
    // ── domain-model ─────────────────────────────────────────────────────────
    const entityCount = await countQuery(
      driver,
      'MATCH (n:DomainEntity) RETURN count(n) AS c',
    );
    if (entityCount > 0) {
      results.push({
        board: 'domain-model',
        kind: 'domain-model',
        relatedId: null,
        reason: `${entityCount} :DomainEntity node${entityCount !== 1 ? 's' : ''}`,
      });
    }

    // ── context-map ───────────────────────────────────────────────────────────
    const moduleCount = await countQuery(
      driver,
      'MATCH (n:Module) RETURN count(n) AS c',
    );
    if (moduleCount > 0) {
      results.push({
        board: 'context-map',
        kind: 'context-map',
        relatedId: null,
        reason: `${moduleCount} :Module node${moduleCount !== 1 ? 's' : ''}`,
      });
    }

    // ── activity-<UC-ID> ──────────────────────────────────────────────────────
    // Only UseCases that already have at least one ActivityStep — render skill
    // errors on UseCases without steps.
    const ucIds = await idQuery(
      driver,
      'MATCH (uc:UseCase) WHERE EXISTS { (uc)-[:HAS_STEP]->(:ActivityStep) } RETURN uc.id AS id ORDER BY uc.id',
    );
    for (const ucId of ucIds) {
      results.push({
        board: `activity-${ucId}`,
        kind: 'activity',
        relatedId: ucId,
        reason: `UseCase ${ucId}`,
      });
    }

    // ── process-<BP-ID> ───────────────────────────────────────────────────────
    // Only BusinessProcesses that already have at least one WorkflowStep.
    const bpIds = await idQuery(
      driver,
      'MATCH (bp:BusinessProcess) WHERE EXISTS { (bp)-[:HAS_STEP]->(:WorkflowStep) } RETURN bp.id AS id ORDER BY bp.id',
    );
    for (const bpId of bpIds) {
      results.push({
        board: `process-${bpId}`,
        kind: 'process',
        relatedId: bpId,
        reason: `BusinessProcess ${bpId}`,
      });
    }
  } catch {
    // Graph unreachable (ECONNREFUSED, auth failure, etc.) — return whatever
    // we managed to collect before the error; usually an empty array.
    return results;
  }

  return results;
}

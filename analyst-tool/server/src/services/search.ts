/**
 * search — combines board element search and graph node search.
 *
 * Board search: iterates all .excalidraw files, matches elements by text or
 * customData.nodeId / customData.sourceDoc. Case-insensitive substring.
 * Scoring: exact-match > prefix > substring.
 *
 * Graph search: calls neo4j.ts named queries. Tries findNodesById if the
 * query looks like a typed ID (UC-\d+, BP-\d+ etc.), otherwise findNodesByText.
 * If Neo4j is unreachable, logs the error and returns only board results.
 */
import { listBoards, readBoard } from './boards.js';
import {
  findNodesById,
  findNodesByText,
  type GraphNode,
} from './neo4j.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BoardSearchResult = {
  source: 'board';
  boardName: string;
  elementId: string;
  nodeId: string | null;
  snippet: string;
  score: number;
};

export type GraphSearchResult = {
  source: 'graph';
  node: GraphNode;
  matchedField: string;
  snippet: string;
  score: number;
};

export type SearchResult = BoardSearchResult | GraphSearchResult;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const SCORE_EXACT   = 100;
const SCORE_PREFIX  = 60;
const SCORE_SUBSTR  = 30;
const SCORE_NONE    = 0;

function scoreText(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n)         return SCORE_EXACT;
  if (h.startsWith(n)) return SCORE_PREFIX;
  if (h.includes(n))   return SCORE_SUBSTR;
  return SCORE_NONE;
}

// ---------------------------------------------------------------------------
// Board search
// ---------------------------------------------------------------------------

/** Extract all text-like strings from a single element for matching. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function elementTexts(el: Record<string, any>): { field: string; value: string }[] {
  const results: { field: string; value: string }[] = [];

  const push = (field: string, v: unknown) => {
    if (typeof v === 'string' && v.trim().length > 0) {
      results.push({ field, value: v.trim() });
    }
  };

  push('text', el['text']);
  push('originalText', el['originalText']);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  push('nodeId',     el['customData']?.['nodeId']);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  push('sourceDoc',  el['customData']?.['sourceDoc']);

  return results;
}

async function searchBoards(
  query: string,
  limit: number,
): Promise<BoardSearchResult[]> {
  const boards = await listBoards();
  const results: BoardSearchResult[] = [];

  for (const boardItem of boards) {
    if (results.length >= limit * 3) break; // over-fetch then sort+trim

    let scene: Awaited<ReturnType<typeof readBoard>>['scene'];
    try {
      ({ scene } = await readBoard(boardItem.name));
    } catch {
      continue;
    }

    for (const el of scene.elements ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const texts = elementTexts(el);
      let bestScore = SCORE_NONE;
      let bestSnippet = '';

      for (const { value } of texts) {
        const s = scoreText(value, query);
        if (s > bestScore) {
          bestScore = s;
          bestSnippet = value.slice(0, 80);
        }
      }

      if (bestScore > SCORE_NONE) {
        results.push({
          source: 'board',
          boardName: boardItem.name,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          elementId: el['id'] ?? '',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          nodeId: (el['customData']?.['nodeId'] as string | undefined) ?? null,
          snippet: bestSnippet,
          score: bestScore,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Graph search
// ---------------------------------------------------------------------------

/** ID-like patterns: UC-123, BP-123, FR-456, etc. */
const ID_PATTERN = /^[A-Z]{1,6}-\d+$/i;

async function searchGraph(
  query: string,
  limit: number,
): Promise<GraphSearchResult[]> {
  let nodes: GraphNode[];

  if (ID_PATTERN.test(query.trim())) {
    nodes = await findNodesById(query.trim());
  } else {
    nodes = await findNodesByText(query, limit);
  }

  const results: GraphSearchResult[] = [];
  for (const node of nodes.slice(0, limit)) {
    const { matchedField, snippet, score } = bestMatchInNode(node, query);
    results.push({ source: 'graph', node, matchedField, snippet, score });
  }
  return results;
}

function bestMatchInNode(
  node: GraphNode,
  query: string,
): { matchedField: string; snippet: string; score: number } {
  const candidateFields = ['name', 'title', 'label', 'description', 'id', 'nodeId', 'uc_id', 'bp_id'];
  let best = { matchedField: '', snippet: '', score: SCORE_NONE };

  for (const field of candidateFields) {
    const raw = node.properties[field];
    if (typeof raw !== 'string') continue;
    const s = scoreText(raw, query);
    if (s > best.score) {
      best = { matchedField: field, snippet: raw.slice(0, 80), score: s };
    }
  }

  // If still nothing (id match path), fall back to stringified id
  if (best.score === SCORE_NONE && node.id) {
    best = { matchedField: 'id', snippet: node.id, score: SCORE_SUBSTR };
  }

  return best;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function search(
  query: string,
  opts?: { limit?: number },
): Promise<SearchResult[]> {
  const limit = Math.min(opts?.limit ?? 20, 100);

  const [boardResults, graphResults] = await Promise.all([
    searchBoards(query, limit),
    searchGraph(query, limit).catch((err: unknown) => {
      // Neo4j unreachable — log and continue with board results only
      console.error('[search] Neo4j query failed:', err instanceof Error ? err.message : String(err));
      return [] as GraphSearchResult[];
    }),
  ]);

  // Merge and sort by score
  const merged: SearchResult[] = [...boardResults, ...graphResults];
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, limit);
}

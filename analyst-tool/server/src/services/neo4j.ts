/**
 * neo4j — thin service wrapping neo4j-driver.
 *
 * Exposes three named, parametrized queries. No raw Cypher reaches the driver
 * from outside this file. Accepts a Driver via dependency injection so tests
 * can pass a fake without a real database.
 *
 * Connection resolution order (highest priority first):
 *   1. NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD env vars (CI / testing override)
 *   2. Active project's config.yaml graph.neo4j_bolt_port / graph.neo4j_password
 *   3. Defaults: bolt://localhost:3587, neo4j, neo4j_graph_dev
 *
 * Call reloadDriver() when the active project changes (e.g. in configManager.onConfigChange).
 * The next query call will lazy-init a fresh driver with the new project's creds.
 */
import neo4j from 'neo4j-driver';
import type { Driver, Session } from 'neo4j-driver';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

interface GraphConfig {
  neo4j_bolt_port?: number;
  neo4j_user?: string;
  neo4j_password?: string;
}

interface ConfigYamlGraphShape {
  graph?: GraphConfig;
}

// ---------------------------------------------------------------------------
// Per-project config helper
// ---------------------------------------------------------------------------

/**
 * Reads graph.neo4j_bolt_port / graph.neo4j_user / graph.neo4j_password from
 * <repoRoot>/config.yaml. Never throws — returns null on any error or if the
 * file has no graph block.
 */
export async function readGraphConfig(
  repoRoot: string,
): Promise<{ boltPort: number; user: string; password: string } | null> {
  const yamlPath = join(repoRoot, 'config.yaml');
  if (!existsSync(yamlPath)) return null;
  try {
    const raw = await readFile(yamlPath, 'utf-8');
    const parsed = parseYaml(raw) as ConfigYamlGraphShape | null;
    const g = parsed?.graph;
    if (!g) return null;
    return {
      boltPort: typeof g.neo4j_bolt_port === 'number' ? g.neo4j_bolt_port : 3587,
      user:     typeof g.neo4j_user === 'string'     ? g.neo4j_user     : 'neo4j',
      password: typeof g.neo4j_password === 'string' ? g.neo4j_password : 'neo4j_graph_dev',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Driver singleton (lazy-init)
// ---------------------------------------------------------------------------

let _driver: Driver | null = null;
let _externalDriver: Driver | null = null;

/** Override the driver — used in tests via DI. */
export function setDriver(driver: Driver): void {
  _externalDriver = driver;
}

export function clearDriver(): void {
  _externalDriver = null;
  if (_driver) {
    void _driver.close().catch(() => undefined);
    _driver = null;
  }
}

/** Async variant — awaits the close. Use in test teardown to avoid leaking handles. */
export async function closeDriver(): Promise<void> {
  _externalDriver = null;
  if (_driver) {
    const d = _driver;
    _driver = null;
    try {
      await d.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Close and nullify the global driver so the next query call lazy-inits with
 * the current active project's config. Call this from configManager.onConfigChange
 * whenever repoRoot changes.
 *
 * Does NOT affect _externalDriver (tests keep their injected fake).
 */
export async function reloadDriver(): Promise<void> {
  if (_driver) {
    const d = _driver;
    _driver = null;
    try {
      await d.close();
    } catch {
      // ignore — driver may already be dead
    }
  }
}

/**
 * Get (or lazy-init) the active driver.
 *
 * Priority:
 *   1. _externalDriver (set via setDriver — tests / DI)
 *   2. Existing _driver if already created
 *   3. New driver using env-var overrides (CI) or active project's config.yaml
 *
 * Note: this function is synchronous. For the per-project bolt port, callers
 * that need an async init should use getDriverAsync() instead. The synchronous
 * path uses only env vars + defaults so existing behaviour is preserved.
 */
export function getDriver(): Driver {
  if (_externalDriver) return _externalDriver;
  if (_driver) return _driver;

  // Priority 1: env-var overrides (CI / testing). These override config.yaml.
  const uri  = process.env['NEO4J_URI']      ?? 'bolt://localhost:3587';
  const user = process.env['NEO4J_USER']     ?? 'neo4j';
  const pass = process.env['NEO4J_PASSWORD'] ?? 'neo4j_graph_dev';

  _driver = neo4j.driver(uri, neo4j.auth.basic(user, pass), {
    // Disable certificate verification for local dev
    encrypted: false,
    // Short timeouts — without these, a missing Neo4j keeps connections in a
    // pending state for the default 60s and can hold the test process open.
    connectionTimeout: 2000,
    connectionAcquisitionTimeout: 3000,
  });
  return _driver;
}

/**
 * Async variant of getDriver that reads the active project's config.yaml when
 * no env-var override is present. Preferred for per-project bolt port support.
 *
 * If env vars are set they take absolute priority (CI override).
 */
export async function getDriverAsync(repoRoot?: string): Promise<Driver> {
  if (_externalDriver) return _externalDriver;
  if (_driver) return _driver;

  // Priority 1: env-var overrides (highest priority — CI / testing)
  if (process.env['NEO4J_URI']) {
    const uri  = process.env['NEO4J_URI'];
    const user = process.env['NEO4J_USER']     ?? 'neo4j';
    const pass = process.env['NEO4J_PASSWORD'] ?? 'neo4j_graph_dev';
    _driver = neo4j.driver(uri, neo4j.auth.basic(user, pass), {
      encrypted: false,
      connectionTimeout: 2000,
      connectionAcquisitionTimeout: 3000,
    });
    return _driver;
  }

  // Priority 2: active project's config.yaml
  let boltPort = 3587;
  let user     = 'neo4j';
  let pass     = 'neo4j_graph_dev';

  if (repoRoot) {
    const cfg = await readGraphConfig(repoRoot);
    if (cfg) {
      boltPort = cfg.boltPort;
      user     = cfg.user;
      pass     = cfg.password;
    }
  }

  // env-var user/pass overrides still apply even without NEO4J_URI
  user = process.env['NEO4J_USER']     ?? user;
  pass = process.env['NEO4J_PASSWORD'] ?? pass;

  const uri = `bolt://localhost:${boltPort}`;
  _driver = neo4j.driver(uri, neo4j.auth.basic(user, pass), {
    encrypted: false,
    connectionTimeout: 2000,
    connectionAcquisitionTimeout: 3000,
  });
  return _driver;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function withSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

/** Convert a neo4j record's node field to a plain GraphNode. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGraphNode(record: any, key = 'n'): GraphNode {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const node = record.get(key);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const labels: string[] = Array.isArray(node.labels) ? node.labels as string[] : [];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
  const rawProps: Record<string, unknown> = node.properties ?? {};

  // neo4j-driver wraps integers; flatten them to JS numbers/strings
  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawProps)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    properties[k] = neo4j.isInt(v as any) ? (v as { toNumber(): number }).toNumber() : v;
  }

  // Derive a stable id from well-known id fields
  const id = String(
    properties['id'] ??
    properties['nodeId'] ??
    properties['uc_id'] ??
    properties['bp_id'] ??
    node.identity?.toString() ??
    '',
  );

  return { id, labels, properties };
}

// ---------------------------------------------------------------------------
// Named, parametrized queries — the only entry points for outside code
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Find graph nodes by label (exact match, case-sensitive). */
export async function findNodesByLabel(
  label: string,
  limit?: number,
): Promise<GraphNode[]> {
  const cap = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  // Label names come from the whitelist enforced in search.ts, but we still
  // validate here: labels are alphanumeric identifiers.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) {
    return [];
  }

  return withSession(async (session) => {
    // Label cannot be parameterized in Cypher — we've validated the pattern above.
    const result = await session.run(
      `MATCH (n:\`${label}\`) RETURN n LIMIT $limit`,
      { limit: neo4j.int(cap) },
    );
    return result.records.map((r) => toGraphNode(r));
  });
}

/**
 * Find graph nodes by id — matches `n.id`, `n.nodeId`, `n.uc_id`, `n.bp_id`.
 * Exact match on any of those fields.
 */
export async function findNodesById(id: string): Promise<GraphNode[]> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n)
       WHERE n.id = $id
          OR n.nodeId = $id
          OR n.uc_id = $id
          OR n.bp_id = $id
       RETURN n LIMIT $limit`,
      { id, limit: neo4j.int(DEFAULT_LIMIT) },
    );
    return result.records.map((r) => toGraphNode(r));
  });
}

/**
 * Find graph nodes whose common name fields contain the query string.
 * Case-insensitive CONTAINS on `name`, `title`, `label`, `description`.
 */
export async function findNodesByText(
  query: string,
  limit?: number,
): Promise<GraphNode[]> {
  const cap = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const q = query.toLowerCase();

  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n)
       WHERE toLower(coalesce(n.name, ''))        CONTAINS $q
          OR toLower(coalesce(n.title, ''))       CONTAINS $q
          OR toLower(coalesce(n.label, ''))       CONTAINS $q
          OR toLower(coalesce(n.description, '')) CONTAINS $q
       RETURN n LIMIT $limit`,
      { q, limit: neo4j.int(cap) },
    );
    return result.records.map((r) => toGraphNode(r));
  });
}

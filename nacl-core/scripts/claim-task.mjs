// Canonical claim-lock Cypher for multi-user (remote-mode) task coordination.
//
// Why this exists: when several developers share ONE graph, two of them asking "what's next?"
// must not both grab the same Task. The lock is a single-statement conditional write — atomic
// under Neo4j's per-write locking, so no external coordinator is needed. The exact Cypher and
// the result interpretation are deterministic, so they live here as a tested tool rather than as
// copy-pasted prose across nacl-tl-next / -full / -ship (where divergence is exactly how the
// nacl-ids right()-vs-lpad bug happened). Skills run the emitted query via mcp__neo4j__write-cypher
// and interpret rows with the same rule pinned here. ONLY used in remote mode; local mode keeps
// the existing single-user dual-write fence.
//
//   claim-task.mjs claim   --task <id> --dev <id> [--ttl-hours 4]   → prints the claim Cypher
//   claim-task.mjs release --task <id> --dev <id>                   → prints the release Cypher
//   (--json also prints the params object)

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Atomic conditional claim. Succeeds (returns my id as owner) only if the task is unclaimed
 * or its claim has expired; otherwise returns the CURRENT owner so the caller backs off.
 * Stamps developer_id provenance. Returns a parameterized query + params.
 */
export function buildClaimQuery({ ttlHours = 4 } = {}) {
  const query =
    'MATCH (t:Task {id:$taskId})\n' +
    'WHERE t.claimed_by IS NULL OR t.claimed_by = $dev OR t.claim_expires_at < datetime()\n' +
    'SET t.claimed_by = $dev, t.claimed_at = datetime(),\n' +
    `    t.claim_expires_at = datetime() + duration({hours: ${Number(ttlHours)}}),\n` +
    '    t.updated_by = $dev, t.updated_at = datetime()\n' +
    'RETURN t.claimed_by AS owner';
  return { query, paramKeys: ['taskId', 'dev'] };
}

/** Release my claim (no-op if I don't hold it). */
export function buildReleaseQuery() {
  const query =
    'MATCH (t:Task {id:$taskId})\n' +
    'WHERE t.claimed_by = $dev\n' +
    'SET t.claimed_by = NULL, t.claim_expires_at = NULL, t.updated_by = $dev, t.updated_at = datetime()\n' +
    'RETURN t.claimed_by AS owner';
  return { query, paramKeys: ['taskId', 'dev'] };
}

/**
 * Interpret claim rows. A claim is ACQUIRED iff the write matched (one row) and the owner is me.
 * If owner is someone else → held by them. If no rows → the SET WHERE failed → still held by other.
 * @returns {{acquired:boolean, owner:(string|null)}}
 */
export function interpretClaim(rows, dev) {
  const owner = rows && rows.length ? (rows[0].owner ?? null) : null;
  return { acquired: owner === dev, owner };
}

// CLI — symlink-safe main check.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, ...rest] = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') opt.json = true;
    else if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[++i];
  }
  if (!['claim', 'release'].includes(action) || !opt.task || !opt.dev) {
    process.stderr.write('usage: claim-task.mjs <claim|release> --task <id> --dev <id> [--ttl-hours N] [--json]\n');
    process.exit(2);
  }
  const built = action === 'claim' ? buildClaimQuery({ ttlHours: opt['ttl-hours'] ?? 4 }) : buildReleaseQuery();
  process.stdout.write(built.query + '\n');
  if (opt.json) process.stdout.write(JSON.stringify({ taskId: opt.task, dev: opt.dev }) + '\n');
}

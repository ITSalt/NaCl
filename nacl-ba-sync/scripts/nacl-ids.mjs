// Deterministic BA-layer ID formatter for nacl-ba-sync.
//
// Why this exists: five node types each format their next id by hand with the Cypher
// `right(prefix + toString(n), width)` idiom (GPR-01, BP-001, OBJ-001, ROL-01,
// {BP}-S01). Re-typing the prefix/width per type each sync is a padding-bug source that
// silently corrupts ids graph-wide. This module is the single authority: the skill still
// reads `next_int` from the graph via MCP (max(...)+1), then asks this script for the
// formatted id. Pinned by nacl-ids.test.mjs.
//
//   nacl-ids.mjs <kind> <next_int> [parentId]
//   kinds: process-group|GPR (w2) · business-process|BP (w3) · entity|OBJ (w3)
//          role|ROL (w2) · workflow-step|STEP (w2, needs parentId e.g. BP-001)
//
// NOTE: `padN` reproduces Cypher `right(zeros+str, width)` EXACTLY, including its quirk —
// when n has more digits than `width`, the HIGH digits are truncated (right('00100',2)
// → '00'). This is the documented historical behaviour; reproduced, not "fixed".

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KINDS = {
  'process-group':   { prefix: 'GPR-', width: 2 },
  'business-process':{ prefix: 'BP-',  width: 3 },
  'entity':          { prefix: 'OBJ-', width: 3 },
  'role':            { prefix: 'ROL-', width: 2 },
  'workflow-step':   { parented: true, width: 2 },
};
const ALIASES = { GPR: 'process-group', BP: 'business-process', OBJ: 'entity', ROL: 'role', STEP: 'workflow-step', WS: 'workflow-step' };

// right(zeros(width) + String(n), width)
function padN(n, width) {
  return ('0'.repeat(width) + String(n)).slice(-width);
}

/**
 * @param {string} kind  canonical name or alias (GPR/BP/OBJ/ROL/STEP)
 * @param {number} n     the next integer (skill computes max(existing)+1)
 * @param {string} [parentId]  required for workflow-step, e.g. "BP-001"
 * @returns {string} the formatted id
 */
export function naclId(kind, n, parentId) {
  const key = ALIASES[kind] ?? kind;
  const spec = KINDS[key];
  if (!spec) throw new Error(`unknown kind "${kind}" (expected ${Object.keys(KINDS).join('|')} or an alias)`);
  if (!Number.isInteger(n) || n < 1) throw new Error(`next_int must be a positive integer, got ${n}`);
  if (spec.parented) {
    if (!parentId) throw new Error(`kind "${key}" requires a parentId (e.g. BP-001)`);
    return `${parentId}-S${padN(n, spec.width)}`;
  }
  return `${spec.prefix}${padN(n, spec.width)}`;
}

// CLI
// Symlink-safe main check (skills invoke via the ~/.claude/skills symlink).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, nRaw, parentId] = process.argv.slice(2);
  if (!kind || nRaw === undefined) {
    process.stderr.write('usage: nacl-ids.mjs <kind> <next_int> [parentId]\n');
    process.exit(2);
  }
  try {
    process.stdout.write(naclId(kind, Number(nRaw), parentId) + '\n');
  } catch (e) {
    process.stderr.write(`nacl-ids error: ${e.message}\n`);
    process.exit(1);
  }
}

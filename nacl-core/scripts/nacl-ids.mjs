// Deterministic BA-layer ID formatter — the single authority for ALL skills that mint BA
// ids (nacl-ba-sync, nacl-ba-process, nacl-ba-entities, nacl-ba-roles).
//
// Why this exists: each node type formatted its next id by hand — and the skills DISAGREED:
// nacl-ba-process/-entities/-roles used `apoc.text.lpad(toString(n), width, '0')` (canonical
// left-pad) while nacl-ba-sync used `right('0…'+toString(n), width)` (truncates high digits
// at n≥10^width: right('00100',2) → '00'). Same node type, two formats. This module ends
// the divergence with one canonical left-pad. Each skill still reads `next_int` from the
// graph via MCP (max(...)+1), then asks this script for the formatted id. Pinned by
// nacl-ids.test.mjs.
//
//   nacl-ids.mjs <kind> <next_int> [parentId]
//   kinds: process-group|GPR (w2) · business-process|BP (w3) · entity|OBJ (w3)
//          role|ROL (w2) · workflow-step|STEP (w2, needs parentId e.g. BP-001)

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

// canonical left-pad — equals apoc.text.lpad(toString(n), width, '0'); never truncates.
function padN(n, width) {
  return String(n).padStart(width, '0');
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

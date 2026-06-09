// Deterministic wave planner for nacl-tl-plan Phase 2.
//
// Why this exists: Phase 2 ("Wave Planning") states wave assignment as prose
// CONSTRAINTS (Wave 0 = TECH, BE-before-FE, dependency-chain ordering, parallel
// independents) but no single numbering formula — so each agent invents its own
// assignment, a variance + correctness source (a missed DEPENDS_ON edge silently
// produces an FE-before-its-dependency wave). This module is the single authority:
// it turns the constraints into one defined, reproducible scheme and emits the
// task→wave map + the BE→BE dependency edges the skill then writes via MCP. It
// never opens Neo4j; the skill feeds it the Step 1.3 query result as JSON.
//
// Scheme (chosen so every documented constraint holds, and same input → same output):
//   - depth(uc)      = 0 for a UC with no deps, else 1 + max(depth(dep))   (topological level)
//   - TECH tasks     -> wave 0
//   - UC###-BE       -> wave 1 + 2*depth(uc)
//   - UC###-FE       -> wave 2 + 2*depth(uc)   (= BE wave + 1; api-contract-first)
//   Guarantees: BE(uc) < FE(uc); if B depends on A then depth(B) ≥ depth(A)+1 so
//   BE(B) ≥ BE(A)+2 > BE(A); independents at equal depth share a wave. SYNC and QA
//   are task PHASES (phase_sync/phase_qa), not waves, so they are not assigned here.
//   Priority does not move a UC between waves (independents share a wave regardless);
//   it only orders tasks WITHIN a wave: high > medium > low, then id.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * @param {{
 *   ucs: Array<{id:string, module?:string, priority?:string, depends_on?:string[], tasks?:string[]}>,
 *   tech?: Array<string | {id:string, title?:string}>,
 * }} input
 * @returns {{ waves: Array<{number:number,name:string}>,
 *             tasks: Array<{task_id:string,type:string,uc?:string,wave:number,priority?:string}>,
 *             task_deps: Array<{from:string,to:string}> }}
 */
export function planWaves(input) {
  const ucs = Array.isArray(input?.ucs) ? input.ucs : [];
  const tech = Array.isArray(input?.tech) ? input.tech : [];

  const byId = new Map();
  for (const uc of ucs) {
    if (!uc || typeof uc.id !== 'string') throw new Error('each uc needs a string id');
    if (byId.has(uc.id)) throw new Error(`duplicate uc id: ${uc.id}`);
    byId.set(uc.id, uc);
  }

  // depth() with cycle detection — memoized DFS over DEPENDS_ON.
  const depth = new Map();
  const visiting = new Set();
  const computeDepth = (id, stack = []) => {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) throw new Error(`dependency cycle: ${[...stack, id].join(' -> ')}`);
    const uc = byId.get(id);
    if (!uc) throw new Error(`uc "${id}" is referenced as a dependency but not defined`);
    visiting.add(id);
    const deps = Array.isArray(uc.depends_on) ? uc.depends_on : [];
    let d = 0;
    for (const dep of deps) d = Math.max(d, 1 + computeDepth(dep, [...stack, id]));
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const uc of ucs) computeDepth(uc.id);

  const tasks = [];
  const usedWaves = new Set();

  // Wave 0: TECH (only emitted when TECH tasks exist).
  for (const t of tech) {
    const id = typeof t === 'string' ? t : t?.id;
    if (typeof id !== 'string') throw new Error('each tech entry needs an id');
    tasks.push({ task_id: id, type: 'TECH', wave: 0 });
    usedWaves.add(0);
  }

  // UC BE/FE tasks.
  const taskDeps = [];
  for (const uc of ucs) {
    const d = depth.get(uc.id);
    const kinds = Array.isArray(uc.tasks) && uc.tasks.length ? uc.tasks : ['BE', 'FE'];
    const priority = uc.priority ?? 'medium';
    for (const kind of kinds) {
      const wave = kind === 'BE' ? 1 + 2 * d : kind === 'FE' ? 2 + 2 * d : null;
      if (wave === null) throw new Error(`unknown task kind "${kind}" for ${uc.id} (expected BE|FE)`);
      tasks.push({ task_id: `${uc.id}-${kind}`, type: kind, uc: uc.id, wave, priority });
      usedWaves.add(wave);
    }
    // BE→BE dependency edges (only when both ends actually have a BE task).
    const hasBE = (x) => {
      const u = byId.get(x);
      const k = Array.isArray(u?.tasks) && u.tasks.length ? u.tasks : ['BE', 'FE'];
      return k.includes('BE');
    };
    if (hasBE(uc.id)) {
      for (const dep of (uc.depends_on ?? [])) {
        if (hasBE(dep)) taskDeps.push({ from: `${uc.id}-BE`, to: `${dep}-BE` });
      }
    }
  }

  // Stable ordering: by wave, then priority (high→low), then task_id.
  tasks.sort((a, b) =>
    a.wave - b.wave ||
    (PRIORITY_RANK[a.priority ?? 'medium'] ?? 1) - (PRIORITY_RANK[b.priority ?? 'medium'] ?? 1) ||
    a.task_id.localeCompare(b.task_id));
  taskDeps.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const waves = [...usedWaves].sort((a, b) => a - b)
    .map((n) => ({ number: n, name: n === 0 ? 'Infrastructure (TECH)' : `Wave ${n}` }));

  return { waves, tasks, task_deps: taskDeps };
}

// CLI: `node wave-plan.mjs '<json>'` or `… | node wave-plan.mjs`. Prints the plan as JSON.
// runMain handles invocation through a symlink (how skills call it): import.meta.url is
// the realpath, argv[1] is the symlink — compare both as realpaths.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fromArg = process.argv[2];
  const read = fromArg
    ? Promise.resolve(fromArg)
    : new Promise((res) => { let s = ''; process.stdin.on('data', (c) => (s += c)); process.stdin.on('end', () => res(s)); });
  read.then((raw) => {
    try {
      const out = planWaves(JSON.parse(raw));
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    } catch (e) {
      process.stderr.write(`wave-plan error: ${e.message}\n`);
      process.exit(1);
    }
  });
}

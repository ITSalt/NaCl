// Deterministic wave planner for nacl-tl-plan — covers BOTH planning paths.
//
// Why this exists: wave assignment is stated in Phase 2 as prose CONSTRAINTS (Wave 0 =
// TECH, BE-before-FE, dependency-chain ordering, parallel independents) but no single
// numbering formula — so each agent invents its own assignment, a variance + correctness
// source (a missed dependency edge silently produces an FE-before-its-dependency wave).
// This module is the single authority. It never opens Neo4j; the skill feeds it the
// query result as JSON and writes the resulting Wave/Task nodes via MCP.
//
// Two modes (auto-detected by payload; an explicit `plan`/`assign` subcommand also works):
//   plan   — from-scratch: input is UCs; the tool derives TECH + UC###-BE/UC###-FE tasks
//            and their dependency edges, then assigns waves.
//   assign — incremental / --feature / any custom task set: input is an EXPLICIT task DAG
//            (the agent decides WHAT the tasks are and how they depend — the creative part;
//            the tool owns only the deterministic wave NUMBERS). Supports `waveStart` so a
//            feature plan lands on global waves (e.g. 30-34) above an existing sequence.
//
// Scheme:
//   plan:   depth(uc) = DEPENDS_ON topological level; TECH -> waveStart+0;
//           UC###-BE -> waveStart + 1 + 2*depth; UC###-FE -> BE wave + 1.
//   assign: level(task) = topological level over the task's explicit depends_on (plus an
//           implied BE->FE edge for two tasks that share the exact same `uc`);
//           wave(task) = waveStart + level. Guarantees no task precedes a dependency.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Generic topological level with cycle + undefined-dependency detection.
function topoLevels(ids, depsOf, what = 'node') {
  const idset = new Set(ids);
  const level = new Map();
  const visiting = new Set();
  const compute = (id, stack = []) => {
    if (level.has(id)) return level.get(id);
    if (visiting.has(id)) throw new Error(`dependency cycle: ${[...stack, id].join(' -> ')}`);
    if (!idset.has(id)) throw new Error(`${what} "${id}" is referenced as a dependency but not defined`);
    visiting.add(id);
    let d = 0;
    for (const dep of depsOf(id)) d = Math.max(d, 1 + compute(dep, [...stack, id]));
    visiting.delete(id);
    level.set(id, d);
    return d;
  };
  for (const id of ids) compute(id);
  return level;
}

const waveList = (numbers) => [...new Set(numbers)].sort((a, b) => a - b)
  .map((n) => ({ number: n, name: n === 0 ? 'Infrastructure (TECH)' : `Wave ${n}` }));

/**
 * From-scratch planning. input: { ucs:[{id,module,priority,depends_on[],tasks[]}], tech:[], waveStart?:0 }
 */
export function planWaves(input) {
  const ucs = Array.isArray(input?.ucs) ? input.ucs : [];
  const tech = Array.isArray(input?.tech) ? input.tech : [];
  const waveStart = Number.isInteger(input?.waveStart) ? input.waveStart : 0;

  const byId = new Map();
  for (const uc of ucs) {
    if (!uc || typeof uc.id !== 'string') throw new Error('each uc needs a string id');
    if (byId.has(uc.id)) throw new Error(`duplicate uc id: ${uc.id}`);
    byId.set(uc.id, uc);
  }
  const depth = topoLevels(ucs.map((u) => u.id), (id) => byId.get(id).depends_on ?? [], 'uc');

  const tasks = [];
  const used = [];
  for (const t of tech) {
    const id = typeof t === 'string' ? t : t?.id;
    if (typeof id !== 'string') throw new Error('each tech entry needs an id');
    tasks.push({ task_id: id, type: 'TECH', wave: waveStart });
    used.push(waveStart);
  }
  const taskDeps = [];
  const hasBE = (x) => { const u = byId.get(x); const k = Array.isArray(u?.tasks) && u.tasks.length ? u.tasks : ['BE', 'FE']; return k.includes('BE'); };
  for (const uc of ucs) {
    const d = depth.get(uc.id);
    const kinds = Array.isArray(uc.tasks) && uc.tasks.length ? uc.tasks : ['BE', 'FE'];
    const priority = uc.priority ?? 'medium';
    for (const kind of kinds) {
      const wave = kind === 'BE' ? waveStart + 1 + 2 * d : kind === 'FE' ? waveStart + 2 + 2 * d : null;
      if (wave === null) throw new Error(`unknown task kind "${kind}" for ${uc.id} (expected BE|FE)`);
      tasks.push({ task_id: `${uc.id}-${kind}`, type: kind, uc: uc.id, wave, priority });
      used.push(wave);
    }
    if (hasBE(uc.id)) for (const dep of (uc.depends_on ?? [])) if (hasBE(dep)) taskDeps.push({ from: `${uc.id}-BE`, to: `${dep}-BE` });
  }
  tasks.sort((a, b) => a.wave - b.wave || (PRIORITY_RANK[a.priority ?? 'medium'] ?? 1) - (PRIORITY_RANK[b.priority ?? 'medium'] ?? 1) || a.task_id.localeCompare(b.task_id));
  taskDeps.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { mode: 'plan', waves: waveList(used), tasks, task_deps: taskDeps };
}

/**
 * Explicit task-DAG planning (incremental / --feature / custom).
 * input: { waveStart?:0, tasks:[{id, kind?, uc?, depends_on?:[]}] }
 */
export function assignWaves(input) {
  const raw = Array.isArray(input?.tasks) ? input.tasks : [];
  const waveStart = Number.isInteger(input?.waveStart) ? input.waveStart : 0;
  const byId = new Map();
  for (const t of raw) {
    if (!t || typeof t.id !== 'string') throw new Error('each task needs a string id');
    if (byId.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
    byId.set(t.id, { ...t, depends_on: [...(t.depends_on ?? [])] });
  }
  // Implied BE->FE edge for two tasks sharing the EXACT same `uc` string (safety net:
  // backend before frontend for the same surface, even if the caller forgot the edge).
  const tasks = [...byId.values()];
  for (const fe of tasks) {
    if (fe.kind !== 'FE' || !fe.uc) continue;
    for (const be of tasks) {
      if (be.kind === 'BE' && be.uc === fe.uc && !fe.depends_on.includes(be.id)) fe.depends_on.push(be.id);
    }
  }
  const level = topoLevels(tasks.map((t) => t.id), (id) => byId.get(id).depends_on, 'task');

  const out = tasks.map((t) => ({ task_id: t.id, type: t.kind ?? null, uc: t.uc ?? null, wave: waveStart + level.get(t.id) }));
  out.sort((a, b) => a.wave - b.wave || a.task_id.localeCompare(b.task_id));
  const taskDeps = [];
  for (const t of tasks) for (const dep of t.depends_on) taskDeps.push({ from: t.id, to: dep });
  taskDeps.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { mode: 'assign', waveStart, waves: waveList(out.map((t) => t.wave)), tasks: out, task_deps: taskDeps };
}

// Route by payload (tasks → assign, ucs → plan) unless an explicit mode is given.
export function run(input, mode) {
  if (mode === 'assign') return assignWaves(input);
  if (mode === 'plan') return planWaves(input);
  return Array.isArray(input?.tasks) ? assignWaves(input) : planWaves(input);
}

// CLI: `node wave-plan.mjs [plan|assign] '<json>'` (or pipe JSON on stdin). Prints JSON.
// Symlink-safe main check (skills invoke via the ~/.claude/skills symlink — argv[1] is the
// symlink, import.meta.url is the realpath, so compare both as realpaths).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let mode;
  if (args[0] === 'plan' || args[0] === 'assign') mode = args.shift();
  const fromArg = args[0];
  const read = fromArg
    ? Promise.resolve(fromArg)
    : new Promise((res) => { let s = ''; process.stdin.on('data', (c) => (s += c)); process.stdin.on('end', () => res(s)); });
  read.then((rawJson) => {
    try {
      process.stdout.write(JSON.stringify(run(JSON.parse(rawJson), mode), null, 2) + '\n');
    } catch (e) {
      process.stderr.write(`wave-plan error: ${e.message}\n`);
      process.exit(1);
    }
  });
}

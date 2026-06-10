// Reproducible benchmark for the skill-tools pilot. Run from repo root:
//   node bench/skill-tools/bench.mjs [git-base]     (git-base defaults to "main")
//
// Two stated hypotheses, both objectively measured here:
//   H1 (determinism): every pure tool produces BYTE-IDENTICAL output across N=20 runs
//     over its fixture matrix. This is the core claim — the extraction removes the
//     run-to-run derivation variance an agent has when it re-derives the procedure.
//   H2 (carried-procedure size): the tool's typical OUTPUT is far smaller than the
//     inline procedural block removed from SKILL.md (the bash/Cypher/prose the agent
//     previously had to internalise and execute every invocation). Measured as chars
//     and a chars/4 token estimate from `git diff <base>`.
//
// Writes results/summary.json + results/summary.md and prints a table. No network.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BASE = process.argv[2] || 'main';
const N = 20;
const est = (chars) => Math.round(chars / 4); // chars/4 token proxy (label: estimate)

// --- H1: determinism matrix (pure invocations only; side-effecting health-check excluded) ---
const MATRIX = [
  { tool: 'ship/branch.sh',          run: ['bash', ['nacl-core/scripts/branch.sh', 'slug', 'fix: Add Lecture Breadcrumb!!']] },
  { tool: 'ship/branch.sh',          run: ['bash', ['nacl-core/scripts/branch.sh', 'guard', 'feature/x', 'main', 'feature-branch']] },
  { tool: 'plan/wave-plan.mjs',      run: ['node', ['nacl-tl-plan/scripts/wave-plan.mjs', '{"tech":["TECH-001"],"ucs":[{"id":"UC001","priority":"high","depends_on":[]},{"id":"UC002","depends_on":["UC001"]},{"id":"UC003","depends_on":["UC001"]}]}']] },
  { tool: 'sa-validate/classify-findings.mjs', run: ['node', ['nacl-core/scripts/classify-findings.mjs', '{"findings":[{"check":"L1.1","severity":"CRITICAL"},{"check":"L4.1","severity":"CRITICAL","flags":{"field_category":"display"}},{"check":"L2.1","severity":"WARNING"}]}']] },
  { tool: 'ba-sync/nacl-ids.mjs',    run: ['node', ['nacl-core/scripts/nacl-ids.mjs', 'workflow-step', '7', 'BP-001']] },
  { tool: 'release/wait-for-ci.sh',  run: ['bash', ['nacl-core/scripts/wait-for-ci.sh', 'classify', 'completed', 'failure']] },
];

const h1 = [];
for (const { tool, run } of MATRIX) {
  const [bin, args] = run;
  const outs = new Set();
  let sample = '';
  for (let i = 0; i < N; i++) {
    // capture stdout only; tools may print a status token to stderr by design
    sample = execFileSync(bin, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    outs.add(sample);
  }
  h1.push({
    tool,
    invocation: `${bin} ${args[0].split('/').pop()} …`,
    runs: N,
    distinct_outputs: outs.size,
    deterministic: outs.size === 1,
    output_chars: sample.trim().length,
    output_tok_est: est(sample.trim().length),
  });
}

// --- H2: removed inline procedure vs added invocation, per SKILL.md, from git diff ---
const SKILLS = [
  'nacl-tl-ship/SKILL.md',
  'nacl-tl-plan/SKILL.md',
  'nacl-sa-validate/SKILL.md',
  'nacl-tl-release/SKILL.md',
  'nacl-ba-sync/SKILL.md',
];
const charsOfDiffSide = (diff, sign) =>
  diff.split('\n')
    .filter((l) => l.startsWith(sign) && !l.startsWith(sign + sign + sign))
    .reduce((n, l) => n + (l.length - 1), 0); // drop the leading +/- marker

const h2 = [];
for (const file of SKILLS) {
  let diff = '';
  try {
    diff = execFileSync('git', ['diff', BASE, '--', file], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    diff = ''; // base ref unavailable (e.g. shallow clone) — report zeros, harness still runs
  }
  const removed = charsOfDiffSide(diff, '-');
  const added = charsOfDiffSide(diff, '+');
  h2.push({
    file,
    removed_inline_chars: removed,
    removed_tok_est: est(removed),
    added_invocation_chars: added,
    added_tok_est: est(added),
    net_chars: added - removed,
  });
}

// --- report ---
const allDet = h1.every((r) => r.deterministic);
const lines = [];
lines.push('# Skill-tools benchmark results', '');
lines.push(`Base ref: \`${BASE}\` · runs per tool: ${N} · token estimate = chars / 4`, '');
lines.push('## H1 — determinism (byte-identical output across N runs)', '');
lines.push('| tool | runs | distinct outputs | deterministic | output chars (tok est) |');
lines.push('|------|-----:|-----------------:|:-------------:|------------------------:|');
for (const r of h1) lines.push(`| ${r.tool} | ${r.runs} | ${r.distinct_outputs} | ${r.deterministic ? '✅' : '❌'} | ${r.output_chars} (${r.output_tok_est}) |`);
lines.push('', `**H1 verdict: ${allDet ? 'HOLDS' : 'FAILED'}** — ${h1.filter((r) => r.deterministic).length}/${h1.length} tools byte-identical across ${N} runs.`, '');
lines.push('## H2 — carried-procedure size removed from SKILL.md (git diff)', '');
lines.push('| SKILL.md | removed inline chars (tok est) | added invocation chars (tok est) | net |');
lines.push('|----------|-------------------------------:|---------------------------------:|----:|');
for (const r of h2) lines.push(`| ${r.file} | ${r.removed_inline_chars} (${r.removed_tok_est}) | ${r.added_invocation_chars} (${r.added_tok_est}) | ${r.net_chars} |`);
const totRem = h2.reduce((n, r) => n + r.removed_inline_chars, 0);
lines.push('', `Removed inline procedural text totals ${totRem} chars (~${est(totRem)} tok est). Note: the static`,
  'SKILL.md delta is modest by design — the compounding win is at RUNTIME, where each invocation',
  'now emits a fixed small token (H1 column) instead of the agent re-deriving the procedure.', '');

const md = lines.join('\n');
mkdirSync(join(HERE, 'results'), { recursive: true });
writeFileSync(join(HERE, 'results', 'summary.md'), md + '\n');
writeFileSync(join(HERE, 'results', 'summary.json'), JSON.stringify({ base: BASE, runs: N, h1, h2 }, null, 2) + '\n');
process.stdout.write(md + '\n');
process.exit(allDet ? 0 : 1);

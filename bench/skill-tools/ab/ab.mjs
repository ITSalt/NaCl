// Comparative A/B harness for the skill-tools pilot — confirms the benchmark CLAIM
// (extraction removes derivation variance) by running the OTHER arm the static bench
// can't: the prose path. Two arms differ ONLY in skill text; everything else is held
// constant. Programmatic `claude -p` calls are paced through itsalt-pinch (mandatory
// wrapper — never a raw spawn). Tier A = isolated single-turn decision A/B.
//
// Usage:
//   node ab.mjs --smoke                       # 1 paced Haiku call, validate the pipe
//   node ab.mjs --models haiku,opus --n 12 --tools slug,wave-plan,classify-findings
//
// Output: results/tierA-<stamp>.json + a printed table. Ground truth = the tool output.

import { Pacer } from 'itsalt-pinch';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { planWaves } from '../../../nacl-tl-plan/scripts/wave-plan.mjs';
import { classifyFindings } from '../../../nacl-sa-validate/scripts/classify-findings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const P = (rel) => join(REPO, rel); // absolute path resolved at runtime (not in source)

const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-8',
};

// ---------- the three decision cases ----------
const SLUG_MSG = 'Fix: Cast lectureId & Handle 404!! (urgent) — see PR#42 for the long backstory here';
const WAVE_INPUT = {
  tech: ['TECH-001', 'TECH-002'],
  ucs: [
    { id: 'UC001', priority: 'high', depends_on: [] },
    { id: 'UC002', depends_on: ['UC001'] },
    { id: 'UC003', depends_on: ['UC001'] },
    { id: 'UC004', depends_on: ['UC002', 'UC003'] },
    { id: 'UC005', depends_on: [], tasks: ['BE'] },
  ],
};
// Engineered boundary: exactly 5 WARNINGs (→ WARN) + 2 CRITICALs that are BOTH exempt.
// Ground truth = WARN. By-hand failure modes: count exempt criticals as FAIL, or miscount 5→PASS.
const FINDINGS_INPUT = {
  findings: [
    { check: 'L4.1', severity: 'CRITICAL', flags: { field_category: 'display' } },
    { check: 'L6.1', severity: 'CRITICAL', flags: { shared: true } },
    { check: 'L2.1', severity: 'WARNING' }, { check: 'L2.2', severity: 'WARNING' },
    { check: 'L2.3', severity: 'WARNING' }, { check: 'L3.1', severity: 'WARNING' },
    { check: 'L3.2', severity: 'WARNING' }, { check: 'L1.5', severity: 'INFO' },
  ],
};

const slugTruth = execFileSync('bash', [P('nacl-tl-ship/scripts/branch.sh'), 'slug', SLUG_MSG], { encoding: 'utf8' }).trim();
const waveTruth = planWaves(WAVE_INPUT);
const findingsTruth = classifyFindings(FINDINGS_INPUT).overall; // 'WARN'

const WAVE_RULES = `Wave assignment rules:
- Wave 0 is always the TECH tasks (TECH-001, TECH-002).
- For the same UC, the -BE task is in an EARLIER wave than its -FE task.
- If UC-B depends on UC-A, then UC-B-BE is in a LATER wave than UC-A-BE.
- UCs with no mutual dependency may share a wave.
Tasks to place: for each UC create <id>-BE and <id>-FE, EXCEPT UC005 is backend-only (BE only); plus TECH-001, TECH-002.`;

const SEVERITY_RULES = `Severity → overall status:
- Any CRITICAL finding ⇒ overall FAIL.
- 5 or more WARNING findings ⇒ overall WARN.
- Otherwise ⇒ overall PASS. INFO never affects the status.
Mandatory exemption filters (an exempt finding does NOT count):
- check L4.1 is exempt when field_category != 'input' (display/action fields).
- check L6.1 is exempt when shared = true (intentionally shared entities).`;

const wavePlanMap = (plan) => Object.fromEntries(plan.tasks.map((t) => [t.task_id, t.wave]));
const waveInvariantsOk = (map) => {
  if (!map || typeof map !== 'object') return false;
  for (const k of ['TECH-001', 'TECH-002']) if (map[k] !== 0) return false;
  for (const id of ['UC001', 'UC002', 'UC003', 'UC004']) {
    if (!(map[`${id}-BE`] < map[`${id}-FE`])) return false;
  }
  const dep = [['UC002', 'UC001'], ['UC003', 'UC001'], ['UC004', 'UC002'], ['UC004', 'UC003']];
  for (const [b, a] of dep) if (!(map[`${b}-BE`] > map[`${a}-BE`])) return false;
  return true;
};

const CASES = {
  slug: {
    truth: slugTruth,
    oldPrompt: `Convert this git commit message into a branch slug using EXACTLY these steps, in order:
1) lowercase everything
2) replace every character that is not a-z or 0-9 with a hyphen
3) collapse any run of hyphens into a single hyphen
4) remove a leading or trailing hyphen
5) cut the result to the first 50 characters
Message: "${SLUG_MSG}"
Output ONLY the resulting slug on a single line. No quotes, no code, no explanation.`,
    newPrompt: `Use the Bash tool to run EXACTLY this command, then output ONLY its stdout (the slug) on a single line, nothing else:
bash ${P('nacl-tl-ship/scripts/branch.sh')} slug "${SLUG_MSG}"`,
    normalize: (txt) => (txt.trim().split('\n').find((l) => l.trim()) || '').trim().replace(/^["'`]|["'`]$/g, ''),
    correct: (norm) => norm === slugTruth,
  },
  'wave-plan': {
    truth: JSON.stringify(wavePlanMap(waveTruth)),
    oldPrompt: `${WAVE_RULES}\n\nOutput ONLY a JSON object mapping each task id to its integer wave number. No prose, no code fences.`,
    newPrompt: `Use the Bash tool to run EXACTLY this command:
node ${P('nacl-tl-plan/scripts/wave-plan.mjs')} '${JSON.stringify(WAVE_INPUT)}'
Then output ONLY a JSON object mapping each task_id (from the "tasks" array) to its "wave". No prose, no code fences.`,
    normalize: (txt) => {
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try { const o = JSON.parse(m[0]); return JSON.stringify(Object.fromEntries(Object.entries(o).sort())); }
      catch { return null; }
    },
    correct: (norm) => { try { return waveInvariantsOk(JSON.parse(norm)); } catch { return false; } },
  },
  'classify-findings': {
    truth: findingsTruth,
    oldPrompt: `${SEVERITY_RULES}\n\nFindings:\n${JSON.stringify(FINDINGS_INPUT.findings, null, 0)}\n\nOutput ONLY one word: PASS, WARN, or FAIL.`,
    newPrompt: `Use the Bash tool to run EXACTLY this command, then output ONLY the value of the "overall" field from its JSON stdout (one word: PASS, WARN, or FAIL):
node ${P('nacl-sa-validate/scripts/classify-findings.mjs')} '${JSON.stringify(FINDINGS_INPUT)}'`,
    normalize: (txt) => (txt.toUpperCase().match(/\b(PASS|WARN|FAIL)\b/) || [])[1] || null,
    correct: (norm) => norm === findingsTruth,
  },
};

// ---------- claude -p result parsing ----------
function parseClaude(stdout) {
  // `claude -p --output-format json` → { result, usage:{input_tokens,output_tokens,...}, total_cost_usd }
  try {
    const j = JSON.parse(stdout);
    return {
      text: typeof j.result === 'string' ? j.result : JSON.stringify(j.result ?? ''),
      inTok: j.usage?.input_tokens ?? 0,
      outTok: j.usage?.output_tokens ?? 0,
      cost: j.total_cost_usd ?? 0,
      ok: true,
    };
  } catch {
    return { text: stdout, inTok: 0, outTok: 0, cost: 0, ok: false };
  }
}

// ---------- build + run ----------
const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const SMOKE = argv.includes('--smoke');
const N = SMOKE ? 1 : Number(flag('n', 12));
const modelKeys = SMOKE ? ['haiku'] : flag('models', 'haiku,opus').split(',');
const toolKeys = SMOKE ? ['slug'] : flag('tools', 'slug,wave-plan,classify-findings').split(',');
const arms = SMOKE ? ['new'] : (flag('arms', 'old,new').split(','));

const tasks = [];
for (const model of modelKeys) for (const tool of toolKeys) for (const arm of arms) for (let i = 0; i < N; i++) {
  const c = CASES[tool];
  // NOTE: the runner appends the prompt as the LAST arg, and `--allowedTools` is
  // variadic (it would swallow the prompt). Keep a single-value flag (`--model`)
  // immediately before the prompt, so put `--allowedTools Bash` first.
  const extra = arm === 'new'
    ? ['--allowedTools', 'Bash', '--model', MODELS[model]]
    : ['--model', MODELS[model]];
  tasks.push({
    prompt: arm === 'old' ? c.oldPrompt : c.newPrompt,
    projectId: 'nacl-ab',
    cwd: REPO,
    args: extra,
    metadata: { model, tool, arm, i },
  });
}

console.log(`A/B Tier-A: ${tasks.length} paced calls (${modelKeys.join('+')} × ${toolKeys.join(',')} × ${arms.join('/')} × N=${N})`);
console.log(`Ground truth — slug: "${slugTruth}" | findings: ${findingsTruth} | wave: invariant-checked`);

const pacer = new Pacer({
  workingWindow: { start: '06:00', end: '22:00', tz: 'Europe/Moscow' },
  pacing: { spawnDelayMs: { min: 15000, max: 18000 }, waveEveryN: 40 },
  // maxActiveProjects MUST be > 1 even with a single project: pinch keeps a project
  // "active" for a 10-min activityWindow after its last task, so maxActiveProjects:1
  // makes the one project block its OWN next task (activeCount 1 < 1 == false) →
  // ~1 task / 10 min livelock. 3 (the invariant cap) → 1 < 3 always admits.
  limits: { maxGlobalParallelSessions: 3, maxParallelPerProject: 3, maxActiveProjects: 3 },
  runner: { claudeBinary: 'claude', args: ['--print', '--output-format', 'json'], taskTimeoutMs: 180000 },
  hooks: {
    onStarted: (e) => console.log(`▶ ${e.taskId} (waited ${Math.round(e.waitedMs / 1000)}s)`),
    onFinished: (e) => console.log(`✓ ${e.taskId} exit=${e.exitCode} ${Math.round(e.durationMs / 1000)}s`),
    onBlocked: (e) => console.log(`⏸ ${e.reason}${e.msUntilRetry ? ` retry in ${Math.round(e.msUntilRetry / 1000)}s` : ''}`),
  },
});

const results = await pacer.runBatch(tasks);
await pacer.drain();
await pacer.shutdown();

// attach metadata by index (runBatch preserves order)
const rows = results.map((r, idx) => {
  const meta = tasks[idx].metadata;
  const c = CASES[meta.tool];
  const parsed = parseClaude(r.stdout);
  const norm = parsed.ok || r.exitCode === 0 ? c.normalize(parsed.text) : null;
  return { ...meta, exitCode: r.exitCode, outTok: parsed.outTok, inTok: parsed.inTok, cost: parsed.cost,
           jsonOk: parsed.ok, norm, correct: norm != null && c.correct(norm), durationMs: r.durationMs };
});

if (SMOKE) {
  console.log('\n=== SMOKE RESULT ===');
  console.log(JSON.stringify(rows[0], null, 2));
  const r = rows[0];
  console.log(r.jsonOk && r.exitCode === 0 ? '\nPIPE OK ✅ (paced claude→json→parse→normalize works)' : '\nPIPE PROBLEM ❌ — inspect raw stdout below:');
  if (!r.jsonOk) console.log(results[0].stdout.slice(0, 800), '\n--- stderr ---\n', results[0].stderr.slice(0, 800));
  process.exit(r.jsonOk && r.exitCode === 0 ? 0 : 1);
}

// ---------- aggregate per (model, tool, arm) ----------
const agg = {};
for (const r of rows) {
  const k = `${r.model}|${r.tool}|${r.arm}`;
  (agg[k] ??= { model: r.model, tool: r.tool, arm: r.arm, n: 0, distinct: new Set(), correct: 0, outTok: 0, cost: 0, fails: 0 });
  const a = agg[k];
  a.n++; a.distinct.add(r.norm); a.correct += r.correct ? 1 : 0; a.outTok += r.outTok; a.cost += r.cost;
  if (r.exitCode !== 0) a.fails++;
}
const summary = Object.values(agg).map((a) => ({
  model: a.model, tool: a.tool, arm: a.arm, n: a.n,
  distinct_outputs: a.distinct.size, correct: a.correct, correct_pct: Math.round((a.correct / a.n) * 100),
  exec_fails: a.fails, mean_out_tok: Math.round(a.outTok / a.n), total_cost_usd: Number(a.cost.toFixed(4)),
}));

console.log('\n| model | tool | arm | N | distinct | correct% | mean out tok | cost $ |');
console.log('|-------|------|-----|---|---------:|---------:|-------------:|-------:|');
for (const s of summary.sort((x, y) => x.model.localeCompare(y.model) || x.tool.localeCompare(y.tool) || x.arm.localeCompare(y.arm))) {
  console.log(`| ${s.model} | ${s.tool} | ${s.arm} | ${s.n} | ${s.distinct_outputs} | ${s.correct_pct}% | ${s.mean_out_tok} | ${s.total_cost_usd} |`);
}

mkdirSync(join(HERE, 'results'), { recursive: true });
const stamp = flag('stamp', 'run');
writeFileSync(join(HERE, 'results', `tierA-${stamp}.json`),
  JSON.stringify({ groundTruth: { slug: slugTruth, findings: findingsTruth }, summary, rows }, null, 2) + '\n');
console.log(`\nwrote results/tierA-${stamp}.json`);

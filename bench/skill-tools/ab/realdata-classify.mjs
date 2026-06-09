// Real-data prose-vs-tool check for classify-findings, using the ACTUAL findings from a
// live nacl-sa-validate run on family-cinema. Reproduces what the agent would decide
// WITHOUT the tool (prose path) on the most illustrative parameters — exemption logic
// (L4.1 field_category=null, L6.1 shared=false/true) and the WARN/PASS threshold — and
// compares to the tool's deterministic verdict (computed directly = ground truth).
//
// Prose arm only; N runs per (scenario × model) via itsalt-pinch. Tool = oracle.

import { Pacer } from 'itsalt-pinch';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { classifyFindings } from '../../../nacl-sa-validate/scripts/classify-findings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const MODELS = { haiku: 'claude-haiku-4-5-20251001', opus: 'claude-opus-4-8' };
const N = Number((process.argv.indexOf('--n') >= 0 && process.argv[process.argv.indexOf('--n') + 1]) || 6);

const real = JSON.parse(readFileSync(join(HERE, 'realdata-findings.json'), 'utf8')).findings;
const warnings = real.filter((f) => f.severity === 'WARNING'); // the 9 real warnings (incl L6.1 shared:false)

// Scenario C — derived boundary from real check names: 5 warnings, but L6.1 made exempt
// (shared:true) → 4 non-exempt → PASS. Tightest test of exemption-flip + <5 threshold.
const boundary = [
  { check: 'L6.1', severity: 'WARNING', flags: { shared: true } },
  { check: 'L2.3', severity: 'WARNING' },
  { check: 'L3.3', severity: 'WARNING' },
  { check: 'L3.4', severity: 'WARNING' },
  { check: 'L5.4', severity: 'WARNING' },
];

const SCENARIOS = [
  { id: 'A-real-full', findings: real, note: '18 real findings (9C/9W)' },
  { id: 'B-crit-resolved', findings: warnings, note: '9 real warnings only' },
  { id: 'C-derived-boundary', findings: boundary, note: '5 warnings, L6.1 exempt → 4 non-exempt' },
];

// Explicit restatement (spells out the null/absent handling — easier for the model).
const RULES_EXPLICIT = `Severity → overall status:
- Any non-exempt CRITICAL finding ⇒ overall FAIL.
- 5 or more non-exempt WARNING findings ⇒ overall WARN.
- Otherwise ⇒ PASS. INFO never affects status.
Mandatory exemption filters (an EXEMPT finding does NOT count toward status):
- check L4.1 is exempt only when field_category != 'input' (display/action). If field_category is null or absent, treat as 'input' → NOT exempt.
- check L6.1 is exempt only when shared = true. If shared is false or absent → NOT exempt.
- No other check has an exemption here.`;

// Faithful to the actual SKILL.md (verbatim tables, Cypher coalesce filters — the model
// must itself infer "exempt = the filter does NOT hold"). This is what the real skill gives.
const RULES_FAITHFUL = `From the validation skill's Severity table (Report threshold column):
| CRITICAL | Specification is broken | Any CRITICAL --> overall FAIL |
| WARNING  | Should fix, not blocking | 5+ WARNINGs --> overall WARN |
| INFO     | Observation | Does not affect overall status |

From the skill's exemption-property table — "Checks L4-L6 contain WHERE filters that exempt
nodes; these filters MUST be applied; an exempt finding is excluded from the status":
| Check | Mandatory filter | Purpose |
| L4.1 | AND coalesce(ff.field_category, 'input') = 'input' | Exempt display/action fields from MAPS_TO requirement |
| L6.1 | AND coalesce(de.shared, false) = false | Exempt intentionally shared cross-module entities |`;

const RULES = process.argv.includes('--faithful') ? RULES_FAITHFUL : RULES_EXPLICIT;
const scFilter = process.argv.indexOf('--scenario') >= 0 ? process.argv[process.argv.indexOf('--scenario') + 1] : null;

const oracleOf = (findings) => {
  const r = classifyFindings({ findings });
  return { overall: r.overall, critical: r.counts.critical, warning: r.counts.warning, exempted: r.findings.filter((f) => f.exempt).map((f) => f.check).sort() };
};

const ACTIVE = scFilter ? SCENARIOS.filter((s) => s.id.startsWith(scFilter)) : SCENARIOS;
const tasks = [];
for (const model of Object.keys(MODELS)) for (const sc of ACTIVE) for (let i = 0; i < N; i++) {
  tasks.push({
    prompt: `${RULES}\n\nFindings (JSON):\n${JSON.stringify(sc.findings)}\n\nApply the rules. Output ONLY a JSON object: {"overall":"PASS|WARN|FAIL","critical":<non-exempt CRITICAL count>,"warning":<non-exempt WARNING count>,"exempted":[<check ids you exempted>]}`,
    projectId: 'nacl-realdata',
    cwd: REPO,
    args: ['--model', MODELS[model]],
    metadata: { model, scenario: sc.id, i },
  });
}

const VARIANT = process.argv.includes('--faithful') ? 'faithful' : 'explicit';
console.log(`prose-vs-tool on REAL data [${VARIANT} rules]: ${tasks.length} calls (${Object.keys(MODELS).join('+')} × ${ACTIVE.length} scenarios × N=${N})`);
for (const sc of ACTIVE) console.log(`  oracle ${sc.id}: ${JSON.stringify(oracleOf(sc.findings))}`);

const pacer = new Pacer({
  workingWindow: { start: '06:00', end: '22:00', tz: 'Europe/Moscow' },
  pacing: { spawnDelayMs: { min: 15000, max: 18000 }, waveEveryN: 40 },
  limits: { maxGlobalParallelSessions: 3, maxParallelPerProject: 3, maxActiveProjects: 3 },
  runner: { claudeBinary: 'claude', args: ['--print', '--output-format', 'json'], taskTimeoutMs: 180000 },
  hooks: { onFinished: (e) => console.log(`✓ ${e.taskId} ${Math.round(e.durationMs / 1000)}s`) },
});

const results = await pacer.runBatch(tasks);
await pacer.drain(); await pacer.shutdown();

const parse = (stdout) => { try { const j = JSON.parse(stdout); const m = String(j.result || '').match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } };
const rows = results.map((r, i) => {
  const meta = tasks[i].metadata;
  const oracle = oracleOf(SCENARIOS.find((s) => s.id === meta.scenario).findings);
  const a = parse(r.stdout);
  const exemptMatch = a && JSON.stringify((a.exempted || []).slice().sort()) === JSON.stringify(oracle.exempted);
  return {
    ...meta, parsed: !!a,
    overall_ok: a && a.overall === oracle.overall,
    crit_ok: a && Number(a.critical) === oracle.critical,
    warn_ok: a && Number(a.warning) === oracle.warning,
    exempt_ok: !!exemptMatch,
    answer: a ? `${a.overall}|C${a.critical}|W${a.warning}|ex[${(a.exempted || []).join(',')}]` : 'PARSE_FAIL',
  };
});

const agg = {};
for (const r of rows) {
  const k = `${r.model}|${r.scenario}`;
  (agg[k] ??= { model: r.model, scenario: r.scenario, n: 0, overall: 0, crit: 0, warn: 0, exempt: 0, distinct: new Set() });
  const a = agg[k]; a.n++; a.overall += r.overall_ok ? 1 : 0; a.crit += r.crit_ok ? 1 : 0; a.warn += r.warn_ok ? 1 : 0; a.exempt += r.exempt_ok ? 1 : 0; a.distinct.add(r.answer);
}
const pct = (x, n) => `${Math.round((x / n) * 100)}%`;
console.log('\n| model | scenario | N | overall✓ | crit-count✓ | warn-count✓ | exemption✓ | distinct | tool(oracle) |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const a of Object.values(agg)) {
  const oracle = oracleOf(SCENARIOS.find((s) => s.id === a.scenario).findings);
  const o = `${oracle.overall}|C${oracle.critical}|W${oracle.warning}`;
  console.log(`| ${a.model} | ${a.scenario} | ${a.n} | ${pct(a.overall, a.n)} | ${pct(a.crit, a.n)} | ${pct(a.warn, a.n)} | ${pct(a.exempt, a.n)} | ${a.distinct.size} | ${o} |`);
}
mkdirSync(join(HERE, 'results'), { recursive: true });
const fname = `realdata-prose-${VARIANT}${scFilter ? '-' + scFilter : ''}.json`;
writeFileSync(join(HERE, 'results', fname), JSON.stringify({ variant: VARIANT, scenarios: ACTIVE.map((s) => ({ id: s.id, oracle: oracleOf(s.findings) })), rows }, null, 2) + '\n');
console.log(`\nwrote results/${fname}`);

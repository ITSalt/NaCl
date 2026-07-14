// Deterministic findings classifier for nacl-sa-validate.
//
// Why this exists: two deterministic reductions were done by hand across ~40 L1–L13 /
// XL6–XL9 check results: (1) the overall-status rollup from the Severity table
// ("any CRITICAL → FAIL; 5+ WARNING → WARN; else PASS") — miscounting "5+" or missing
// one CRITICAL silently changes the gate verdict; and (2) the mandatory exemption
// filters (the L4–L6/L9/L10/XL8 `coalesce(...)` WHERE clauses) that "MUST be included
// verbatim — omitting them causes false positives." Those filters live in the Cypher
// (applied at query time); this module re-applies the property-based ones as a
// defense-in-depth net AND owns the rollup, so the gate verdict is reproducible.
// It never opens Neo4j; the skill runs the queries via MCP and feeds the rows in.
//
// Contract is unchanged: the same three overall tokens the skill has always emitted.
//   overall: 'FAIL' (≥1 non-exempt CRITICAL) | 'WARN' (≥5 non-exempt WARNING) | 'PASS'
// Source of truth: the Severity table (Report threshold column) and the
// "Exemption-property reference" table in SKILL.md. Pinned by classify-findings.test.mjs.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WARN_THRESHOLD = 5; // "5+ WARNINGs → overall WARN" (Severity table)
const coalesce = (v, d) => (v === undefined || v === null ? d : v);

// Property-based exemption predicates, keyed by LAYER then check id. A finding is exempt
// when its node's flags satisfy the predicate — mirrors the verbatim `coalesce(...)` WHERE
// filter. LAYER matters: nacl-ba-validate reuses check ids L4.1/L5.1/L6.1 for entirely
// different (BA-layer) checks that have NO exemptions — so the SA rules must NOT apply to
// them. Default layer is 'sa' (back-compat). 'ba' has no exemption rules.
const EXEMPTION_RULES = {
  sa: {
    'L3.7':  { reason: 'requirement legitimately unanchorable (anchor_exempt = true)', test: (f) => coalesce(f.anchor_exempt, false) === true },
    'L4.1':  { reason: 'display/action field (field_category != input)', test: (f) => coalesce(f.field_category, 'input') !== 'input' },
    'L5.1':  { reason: 'backend-only UC (has_ui = false)',               test: (f) => coalesce(f.has_ui, true) === false },
    'L6.1':  { reason: 'intentionally shared entity (shared = true)',    test: (f) => coalesce(f.shared, false) === true },
    'L9.1':  { reason: 'grandfathered FR (decision_exempt = true)',      test: (f) => coalesce(f.decision_exempt, false) === true },
    'L10.2': { reason: 'formless screen (formless = true)',              test: (f) => coalesce(f.formless, false) === true },
    'L10.6': { reason: 'terminal state (terminal = true)',               test: (f) => coalesce(f.terminal, false) === true },
    'XL8.2': { reason: 'infrastructure-only role (system_only = true)',  test: (f) => coalesce(f.system_only, false) === true },
  },
  ba: {}, // BA-layer L1-L8 / XL1-XL5 have no property exemptions
};

const SEVERITIES = new Set(['CRITICAL', 'WARNING', 'INFO']);

/**
 * @param {{ findings: Array<{check:string, severity:string, flags?:object}> }} input
 * @returns {{ findings: Array<{check:string,severity:string,exempt:boolean,exempt_reason?:string}>,
 *             counts: {critical:number,warning:number,info:number,exempt:number},
 *             overall: 'PASS'|'WARN'|'FAIL' }}
 */
export function classifyFindings(input) {
  const raw = Array.isArray(input?.findings) ? input.findings : [];
  const layer = input?.layer ?? 'sa';
  const rules = EXEMPTION_RULES[layer];
  if (!rules) throw new Error(`unknown layer "${layer}" (expected sa|ba)`);
  const counts = { critical: 0, warning: 0, info: 0, exempt: 0 };
  const findings = raw.map((f) => {
    const severity = String(f.severity || '').toUpperCase();
    if (!SEVERITIES.has(severity)) throw new Error(`unknown severity "${f.severity}" on check ${f.check}`);
    const rule = rules[f.check];
    const exempt = rule ? rule.test(f.flags ?? {}) : false;
    const out = { check: f.check, severity, exempt };
    if (exempt) {
      counts.exempt += 1;
      out.exempt_reason = rule.reason;
    } else if (severity === 'CRITICAL') counts.critical += 1;
    else if (severity === 'WARNING') counts.warning += 1;
    else counts.info += 1;
    return out;
  });

  const overall = counts.critical > 0 ? 'FAIL' : counts.warning >= WARN_THRESHOLD ? 'WARN' : 'PASS';
  return { findings, counts, overall };
}

// CLI: `node classify-findings.mjs '<json>'` or `… | node classify-findings.mjs`.
// Prints the full JSON to stdout and the bare overall token to stderr (for `… 2>&1 | tail`).
// Symlink-safe main check (skills invoke via the ~/.claude/skills symlink).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fromArg = process.argv[2];
  const read = fromArg
    ? Promise.resolve(fromArg)
    : new Promise((res) => { let s = ''; process.stdin.on('data', (c) => (s += c)); process.stdin.on('end', () => res(s)); });
  read.then((raw) => {
    try {
      const out = classifyFindings(JSON.parse(raw));
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      process.stderr.write(out.overall + '\n');
    } catch (e) {
      process.stderr.write(`classify-findings error: ${e.message}\n`);
      process.exit(1);
    }
  });
}

// Deterministic per-PR pre-merge gate classifier for nacl-tl-release Step 2.
//
// Why this exists: the Step-2 pre-merge gate used to run ONE query for every PR —
// `MATCH (t:Task) WHERE t.id IN [<UC list>]` — and HALT with "MISSING TASK NODE" if no
// Task node was found. That assumes every PR is a planned feature with UC-keyed Task
// nodes. The bug-fix path (nacl-tl-fix → nacl-tl-ship) deliberately records a fix as a
// `Decision` node (DEC-NNN), NOT a Task node (L0/L1 code-only fixes write no graph node
// at all). So every `fix:` PR halted the release. This module makes the verdict
// type-aware: feature PRs gate on the Task node (unchanged); fix PRs gate on the
// `Decision` the fix produced (L2/L3-spec-gap) or a code-only `Fix-level` marker (L0/L1),
// and HALT only on genuine unrecorded drift — never merely because a Task node is absent.
//
// It never opens Neo4j; the skill runs the queries via MCP / reads the PR trailers and
// feeds the rows in. The PR's fix linkage arrives as the `Fix-level:` / `Fix-decision:`
// trailer written by nacl-tl-fix Step 8 (squash-safe; the deterministic PR→graph link).
//
// Contract (frozen — pinned by classify-pr-merge.test.mjs):
//   verdict: 'MERGE' | 'USER_GATE' | 'HALT'
//   detail:  null
//          | 'UNVERIFIED' | 'BLOCKED'                                  (USER_GATE)
//          | 'MISSING_TASK_NODE' | 'REGRESSION'                        (HALT, feature path)
//          | 'UNRECORDED_SPEC_DRIFT' | 'FIX_PROOF_INCONSISTENT'        (HALT, fix path)
//   proof:   human-readable graph-proof string for the merge-plan "Graph proof" column.
// Source of truth: nacl-tl-release/SKILL.md Step 2 "Pre-merge graph-proof gate".

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIX_LEVELS = new Set(['L0', 'L1', 'L2', 'L3-spec-gap']);
const SPEC_CHANGING = new Set(['L2', 'L3-spec-gap']);
const coalesce = (v, d) => (v === undefined || v === null ? d : v);
const isNone = (s) => String(s).trim().toLowerCase() === 'none';

const verdict = (v, detail, proof) => ({ verdict: v, detail: detail ?? null, proof });

/**
 * Classify one release-candidate PR's pre-merge gate verdict.
 *
 * @param {object} pr
 * @param {string}   pr.prefix            conventional-commit type from the PR title ('feat'|'fix'|'chore'|…)
 * @param {string[]} [pr.fixLevels]       levels from the `Fix-level:` trailer(s) (bundled PRs may carry many)
 * @param {string[]} [pr.fixDecisions]    DEC ids from the `Fix-decision:` trailer ([] or ['none'] = none)
 * @param {Array<{id:string,status:string}>} [pr.decisions]  graph rows for the listed DEC ids
 * @param {string|null} [pr.taskStatus]   feature path: 'done'|'verified-pending'|'blocked'|'failed'|'regression'
 * @param {boolean}  [pr.taskNodeMissing] feature path: the Task-node query returned no row
 * @param {boolean}  [pr.specUpdateCommitPresent]  fix path: a spec-update commit is in the PR (claims a spec change)
 * @param {boolean}  [pr.gapcheckNoDrift] L0/L1 corroboration: status.json phases.spec.kind === 'gapcheck-no-drift'
 * @param {Array<{id:string,status:string}>} [pr.sourceMatchedDecisions]  SHA-match fallback (older PRs, no trailer)
 * @returns {{verdict:'MERGE'|'USER_GATE'|'HALT', detail:string|null, proof:string}}
 */
export function classifyPrMerge(pr) {
  const prefix = String(pr?.prefix || '').toLowerCase();
  const levels = (pr?.fixLevels ?? []).map((l) => String(l).trim());
  for (const l of levels) {
    if (!FIX_LEVELS.has(l)) throw new Error(`unknown Fix-level "${l}" (expected L0|L1|L2|L3-spec-gap)`);
  }
  // A PR is a FIX PR if titled `fix:` OR it carries a `Fix-level:` trailer (a fix PR always
  // carries one). Everything else takes the feature path. (Trailer wins over a non-fix title.)
  const isFix = prefix === 'fix' || levels.length > 0;
  return isFix ? classifyFix(pr, levels) : classifyFeature(pr);
}

function classifyFeature(pr) {
  if (pr?.taskNodeMissing) {
    return verdict('HALT', 'MISSING_TASK_NODE', 'no Task node in graph');
  }
  const status = String(pr?.taskStatus ?? '').toLowerCase();
  switch (status) {
    case 'done':
      return verdict('MERGE', null, 'Task done');
    case 'verified-pending':
      return verdict('USER_GATE', 'UNVERIFIED', 'Task verified-pending (UNVERIFIED dev status)');
    case 'blocked':
      return verdict('USER_GATE', 'BLOCKED', 'Task blocked');
    case 'failed':
    case 'regression':
      return verdict('HALT', 'REGRESSION', 'Task REGRESSION — excluded from merge plan');
    default:
      throw new Error(`unknown feature Task status "${pr?.taskStatus}" (expected done|verified-pending|blocked|failed|regression, or taskNodeMissing)`);
  }
}

function classifyFix(pr, levels) {
  const listed = (pr?.fixDecisions ?? []).map((d) => String(d).trim()).filter((d) => d && !isNone(d));
  const specChanging = levels.some((l) => SPEC_CHANGING.has(l));
  const codeOnly = levels.length > 0 && levels.every((l) => l === 'L0' || l === 'L1');

  // No `Fix-level:` trailer — older fix PR predating trailer support. Best-effort fallback.
  if (levels.length === 0) {
    const matched = (pr?.sourceMatchedDecisions ?? []).filter((d) => coalesce(d?.status, '') === 'accepted');
    if (matched.length > 0) {
      return verdict('MERGE', null, `Decision ${matched.map((d) => d.id).join(', ')} accepted (matched by source SHA — no trailer)`);
    }
    if (pr?.specUpdateCommitPresent) {
      return verdict('HALT', 'UNRECORDED_SPEC_DRIFT', 'fix PR has a spec-update commit but no accepted Decision and no Fix-level trailer');
    }
    return verdict('MERGE', null, 'code-only fix (no trailer; no spec-update commit) — advisory: pre-trailer PR');
  }

  if (specChanging) {
    // Inconsistent producer output: claims a spec change but names no Decision.
    if (listed.length === 0) {
      return verdict('HALT', 'FIX_PROOF_INCONSISTENT', `Fix-level ${levels.join('+')} claims a spec change but Fix-decision is "none"`);
    }
    const rows = pr?.decisions ?? [];
    const byId = new Map(rows.map((d) => [d.id, coalesce(d.status, null)]));
    const bad = listed.filter((id) => byId.get(id) !== 'accepted'); // missing OR not accepted
    if (bad.length > 0) {
      return verdict('HALT', 'UNRECORDED_SPEC_DRIFT', `Decision(s) not accepted/missing: ${bad.join(', ')}`);
    }
    return verdict('MERGE', null, `Decision ${listed.join(', ')} accepted`);
  }

  if (codeOnly) {
    // Inconsistent: a code-only level must not name a Decision.
    if (listed.length > 0) {
      return verdict('HALT', 'FIX_PROOF_INCONSISTENT', `Fix-level ${levels.join('+')} is code-only but names Fix-decision ${listed.join(', ')}`);
    }
    const lvl = levels.join('+');
    const corroborated = pr?.gapcheckNoDrift ? ' (status.json: gapcheck-no-drift confirmed)' : '';
    return verdict('MERGE', null, `code-only (${lvl})${corroborated}`);
  }

  // Unreachable: every level is in FIX_LEVELS, so it is either spec-changing or code-only.
  throw new Error(`indeterminate fix levels: ${JSON.stringify(levels)}`);
}

// CLI: `node classify-pr-merge.mjs '<json>'` or `… | node classify-pr-merge.mjs`.
// Accepts one PR object or an array of PRs; prints the full JSON and the bare verdict(s)
// to stderr (for `… 2>&1 | tail`). Symlink-safe main check (skills invoke via the
// ~/.claude/skills symlink — same guard as classify-findings.mjs).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fromArg = process.argv[2];
  const read = fromArg
    ? Promise.resolve(fromArg)
    : new Promise((res) => { let s = ''; process.stdin.on('data', (c) => (s += c)); process.stdin.on('end', () => res(s)); });
  read.then((raw) => {
    try {
      const parsed = JSON.parse(raw);
      const out = Array.isArray(parsed) ? parsed.map(classifyPrMerge) : classifyPrMerge(parsed);
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      const tokens = Array.isArray(out) ? out.map((o) => o.verdict) : [out.verdict];
      process.stderr.write(tokens.join(' ') + '\n');
    } catch (e) {
      process.stderr.write(`classify-pr-merge error: ${e.message}\n`);
      process.exit(1);
    }
  });
}

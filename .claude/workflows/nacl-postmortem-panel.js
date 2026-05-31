export const meta = {
  name: 'nacl-postmortem-panel',
  description: 'Post-mortem of a project built end-to-end via nacl-* skills: 5 parallel auditors → evidence verify → deterministic GAP→skill synthesis → retrospective artifact. Opt-in workflow producer of the skill-postmortem-algorithm deliverable.',
  whenToUse: 'A project built end-to-end through nacl-* skills, with a git dev→fix boundary (feature commits stopped, a wave of fix commits started). Goal: for each post-"done" bug, find which skill gate let it through. RARE/read-only/high-stakes — the one NaCl workflow whose 15× cost amortizes. Requires CC 2.1.154+. The prose recipe (memory skill-postmortem-algorithm) is the portable fallback when workflows are unavailable.',
  phases: [
    { title: 'Boundary', detail: 'resolve the dev→fix boundary commit (cheap pre-step)' },
    { title: 'Audit', detail: 'five parallel auditors: shape / fix-categorization / spec-drill / cross-UC / qa-SKIPs' },
    { title: 'Verify', detail: 'adversarial re-read of each quoted spec/code span — drop only on positive counter-evidence' },
    { title: 'Synthesize', detail: 'deterministic GAP→owning-skill table + dedup + write retrospective' },
  ],
}

// ---------------------------------------------------------------------------
// GAP_TO_SKILL — the deterministic bucket→owning-skill mapping (A4).
// Verbatim from nacl-tl-core/references/project-gap-closure.md "Ten GAP
// categories" + gate-fire-catalog.md (G1–G11). This is a fixed lookup, NOT an
// agent re-derivation: auditors tag each finding with one of these category
// keys (or 'unmapped'), and owner+gate are resolved deterministically here.
// ---------------------------------------------------------------------------
const GAP_TO_SKILL = {
  review_repo_checks:        { owners: ['nacl-tl-review'],                    gates: ['G1'],        label: 'repo-checks RED on wave-tip (lint/typecheck/test)' },
  sync_wire_evidence:        { owners: ['nacl-tl-sync'],                      gates: ['G2'],        label: 'BE/FE wire mismatch passed on TS types alone' },
  qa_stage_missing:          { owners: ['nacl-tl-qa'],                        gates: ['G3'],        label: 'a mandatory QA stage was NOT_RUN (e.g. provider-key skip)' },
  release_readiness:         { owners: ['nacl-tl-release'],                   gates: ['G4'],        label: 'graph-stale / missing prod-golden-path at release' },
  artifact_drift:            { owners: ['nacl-tl-conductor'],                 gates: ['G5'],        label: 'cross-artifact reconciliation drift' },
  external_contract_missing: { owners: ['nacl-sa-architect', 'nacl-tl-plan'], gates: ['G2'],        label: 'external/provider contract never specified' },
  ui_reachability_missing:   { owners: ['nacl-sa-ui', 'nacl-tl-review'],      gates: ['G7'],        label: 'UC declares no reachable entrypoint (nav-actions)' },
  runtime_contract_missing:  { owners: ['nacl-sa-uc'],                        gates: ['G8'],        label: 'queue/long-running/recoverable runtime contract absent' },
  clean_checkout_failure:    { owners: ['nacl-tl-deliver', 'nacl-tl-deploy'], gates: ['G6'],        label: 'builds on dev box but not on a clean checkout' },
  spec_first_violation:      { owners: ['nacl-tl-fix', 'nacl-tl-stubs'],      gates: ['G9', 'G10'], label: 'code-first fix without spec / stub closed by absence' },
}
const GAP_KEYS = Object.keys(GAP_TO_SKILL)

// Resolve a finding's GAP category → owners + gates, deterministically.
function resolveOwner(gapCategory) {
  if (gapCategory && GAP_TO_SKILL[gapCategory]) {
    const e = GAP_TO_SKILL[gapCategory]
    return { gapCategory, owners: e.owners, gates: e.gates, label: e.label, mapped: true }
  }
  // Honest fallback: not every post-done bug is a skill-gate failure (a genuinely
  // new requirement, an asset/content bug). Surface it as unmapped rather than
  // forcing a false attribution.
  return { gapCategory: 'unmapped', owners: [], gates: [], label: 'no NaCl gate would have caught this (new requirement / out-of-scope)', mapped: false }
}

// ---------------------------------------------------------------------------
// Schemas — structured output (validated objects, no prose parsing).
// ---------------------------------------------------------------------------
const COMMIT_REF = {
  type: 'object', additionalProperties: false,
  properties: { sha: { type: 'string' }, subject: { type: 'string' } },
  required: ['sha', 'subject'],
}

const SHAPE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    stack: { type: 'string' },
    artifactLocation: { type: 'string', enum: ['graph', 'prose', 'mixed', 'unknown'] },
    tasksDone: { type: 'array', items: { type: 'string' } },
    tasksSkipped: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['stack', 'artifactLocation'],
}

const CATEGORIZATION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    totalFixCommits: { type: 'number' },
    buckets: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          bucket: { type: 'string' }, // fix-type: api-contract / ui-missing / config-infra / db-migration / stub-leak / domain-logic / auth / asset-build / ci-unblock / other
          count: { type: 'number' },
          examples: { type: 'array', items: COMMIT_REF },
        },
        required: ['bucket', 'count', 'examples'],
      },
    },
  },
  required: ['totalFixCommits', 'buckets'],
}

const CASE_ITEM = {
  type: 'object', additionalProperties: false,
  properties: {
    sha: { type: 'string' },
    description: { type: 'string' },
    specPath: { type: 'string' },         // .tl/tasks/<TASK>/<file> the spec lived in (or "(none)")
    specQuote: { type: 'string' },         // verbatim — what the spec said
    codeNeededQuote: { type: 'string' },   // verbatim — what the code actually needed
    trichotomy: { type: 'string', enum: ['SPEC_WRONG', 'SPEC_MISSING', 'SPEC_RIGHT_DEV_DRIFTED'] },
    gapCategory: { type: 'string', enum: GAP_KEYS.concat(['unmapped']) },
    whyMissed: { type: 'string' },         // requirements-traceability: which gate should have caught it + why it didn't
  },
  required: ['sha', 'description', 'trichotomy', 'gapCategory'],
}

const SPECDRILL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { cases: { type: 'array', items: CASE_ITEM } },
  required: ['cases'],
}

const CROSSUC_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          description: { type: 'string' },
          ucFrom: { type: 'string' },
          ucTo: { type: 'string' },
          evidence: { type: 'string' },
          gapCategory: { type: 'string', enum: GAP_KEYS.concat(['unmapped']) },
        },
        required: ['description', 'evidence', 'gapCategory'],
      },
    },
  },
  required: ['findings'],
}

const QASKIP_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    skips: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          uc: { type: 'string' },
          stage: { type: 'string' },
          reason: { type: 'string' },
          providerKeyMissing: { type: 'boolean' },
          evidence: { type: 'string' },
        },
        required: ['stage', 'reason'],
      },
    },
  },
  required: ['skips'],
}

// FIX #2 — verifier schema: refute ONLY with positive counter-evidence; uncertain → KEEP.
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    refuted: { type: 'boolean' },        // true ONLY with positive evidence the case is wrong
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    needs_context: { type: 'boolean' },  // could not confirm either way → KEEP
    quoteConfirmed: { type: 'boolean' },  // the spec/code quote was found verbatim by re-reading the file
    reasoning: { type: 'string' },
  },
  required: ['refuted', 'reasoning'],
}

// ---------------------------------------------------------------------------
// Args (A7). The tool-level `args` object is the source of truth; everything is
// optional with fixture-pointing defaults so a bare run is a hermetic dry-run.
// (On CC 2.1.156 args reaches the script as the global `args`; if a future
// version regresses scriptPath arg-passing, pass the script inline with args,
// or bake projectPath here.)
// ---------------------------------------------------------------------------
const a = args || {}
const projectPath = a.projectPath || 'bench/fixtures/postmortem/sample-project'
const project = a.project || projectPath.split('/').filter(Boolean).pop() || 'project'
const boundaryHint = a.boundaryHint || null   // {sha, subject} if the caller already knows it
const artifactOut = a.artifactOut || `docs/retrospectives/${project}-postmortem.md`
const ghAvailable = a.ghAvailable !== false   // include PR descriptions when gh is usable
const mo = a.modelOverrides || {}

// A5 — cost tiering. Mechanical-ish auditors on Sonnet; pure git/file scans may
// drop to Haiku; judgment-heavy spec-drill / cross-UC / synthesis on Opus.
const M = {
  boundary: mo.boundary || 'haiku',
  shape: mo.shape || 'sonnet',
  categorize: mo.categorize || 'sonnet',
  specdrill: mo.specdrill || 'opus',
  crossuc: mo.crossuc || 'opus',
  qaskip: mo.qaskip || 'haiku',
  verify: mo.verify || 'sonnet',
  synth: mo.synth || 'opus',
  write: mo.write || 'sonnet',
}

// FIX #1 — repo access. Auditors MUST read .tl/, the code, and git freely.
const repoAccessNote = `The target project is a git repo at \`${projectPath}\`. You have full read access — use \`git -C ${projectPath} log/show/diff\`, read \`${projectPath}/.tl/tasks/<TASK>/\` spec files, and read the actual source. Quote VERBATIM from files you actually open; never paraphrase a spec or a commit — a paraphrased "quote" is treated as unverified. Cross-file, cross-UC, and missing-requirement defects are the whole point of this audit; do not restrict yourself to commit subjects.`

log(`nacl-postmortem-panel: project=${project} path=${projectPath} out=${artifactOut}`)

// ---------------------------------------------------------------------------
// Phase: Boundary — resolve the dev→fix boundary once so all five parallel
// auditors share it (they cannot depend on each other under the barrier).
// ---------------------------------------------------------------------------
phase('Boundary')
let boundary = boundaryHint
if (!boundary) {
  boundary = await agent(
    `Resolve the dev→fix boundary in the git history of the project at \`${projectPath}\`.\n` +
    `Read \`git -C ${projectPath} log --oneline --reverse\` (and dates). The boundary is where feature/FR commits stop and a wave of fix/bugfix/test-debt commits begins (look for the transition from feat(...)/FR-... to fix(...)/test(...)/docs(fix)... clusters, often after a "done"/"staging"/"release" marker).\n` +
    `Return the boundary commit and a one-line justification.`,
    {
      label: 'boundary', phase: 'Boundary', model: M.boundary,
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          sha: { type: 'string' }, subject: { type: 'string' },
          justification: { type: 'string' },
          fixCommitsAfter: { type: 'number' },
        },
        required: ['sha', 'subject'],
      },
    }
  )
}
const boundaryRef = boundary && boundary.sha ? boundary.sha : 'HEAD~50'
const boundaryNote = `The dev→fix boundary is commit \`${boundaryRef}\`${boundary && boundary.subject ? ` ("${boundary.subject}")` : ''}. "Post-done bugs" are the fix-wave commits AFTER this boundary; analyse \`git -C ${projectPath} log ${boundaryRef}..HEAD\`.`
log(`Boundary: ${boundaryRef} ${boundary && boundary.subject ? `(${boundary.subject})` : ''}`)

// ---------------------------------------------------------------------------
// Phase: Audit — five parallel auditors (barrier: synthesis needs all five).
// ---------------------------------------------------------------------------
phase('Audit')
const [shape, categorization, specdrill, crossuc, qaskips] = await parallel([
  // #1 Project shape (boundary already resolved above).
  () => agent(
    `AUDITOR 1 — project shape. ${repoAccessNote}\n${boundaryNote}\n\n` +
    `Report: the stack; where BA/SA artifacts live (graph vs prose vs mixed); which \`.tl/tasks/*\` were completed vs skipped. Read \`${projectPath}/.tl/\` and config to determine this.`,
    { label: 'audit:shape', phase: 'Audit', model: M.shape, schema: SHAPE_SCHEMA }
  ),
  // #2 Fix-commit categorization.
  () => agent(
    `AUDITOR 2 — fix-commit categorization. ${repoAccessNote}\n${boundaryNote}\n\n` +
    `Categorize EVERY fix-wave commit (after the boundary) into buckets: api-contract, ui-missing, config-infra, db-migration, stub-leak, domain-logic, auth, asset-build, ci-unblock, other. Give counts and 2-3 VERBATIM-subject examples per non-empty bucket.${ghAvailable ? ' Include PR descriptions (`gh pr view`) where they clarify intent.' : ''}`,
    { label: 'audit:categorize', phase: 'Audit', model: M.categorize, schema: CATEGORIZATION_SCHEMA }
  ),
  // #3 Spec-artifact drill — the load-bearing trichotomy. FIX #3 (requirements traceability via whyMissed).
  () => agent(
    `AUDITOR 3 — spec-artifact drill. ${repoAccessNote}\n${boundaryNote}\n\n` +
    `For each NOTABLE fix-wave commit, locate the spec it should have been governed by in \`${projectPath}/.tl/tasks/<TASK>/\` (api-contract.md, impl-brief*.md, task*.md, acceptance.md). Open the file and QUOTE VERBATIM what the spec said (specQuote) vs what the code actually needed (codeNeededQuote). Classify each: SPEC_WRONG (spec said something incorrect) / SPEC_MISSING (spec was silent on the needed behaviour) / SPEC_RIGHT_DEV_DRIFTED (spec was correct, the dev diverged). ` +
    `Then (requirements traceability) set whyMissed: which gate SHOULD have caught it and why it didn't, and tag gapCategory with one of: ${GAP_KEYS.join(', ')}, or 'unmapped' if no NaCl gate applies.`,
    { label: 'audit:spec-drill', phase: 'Audit', model: M.specdrill, schema: SPECDRILL_SCHEMA }
  ),
  // #4 Cross-UC connectivity — invisible to per-UC review.
  () => agent(
    `AUDITOR 4 — cross-UC connectivity. ${repoAccessNote}\n${boundaryNote}\n\n` +
    `Find fixes that close a CROSS-UC gap: "UC-X declares/produces an entry but UC-Y has no button/route/handler to reach or consume it." These are invisible to per-UC review. For each, cite the two UCs and the evidence (the fix commit + the code path). Tag gapCategory (likely ui_reachability_missing or runtime_contract_missing, or 'unmapped').`,
    { label: 'audit:cross-uc', phase: 'Audit', model: M.crossuc, schema: CROSSUC_SCHEMA }
  ),
  // #5 nacl-tl-qa SKIPs — missing-provider-key skips are "almost always a top-3 root cause".
  () => agent(
    `AUDITOR 5 — QA SKIPs. ${repoAccessNote}\n${boundaryNote}\n\n` +
    `Scan \`${projectPath}/.tl/tasks/*/qa-*.md\` and status.json files for any QA stage recorded as NOT_RUN / skipped / "no provider key" / SKIP. For each, record the UC, the stage, the reason, and set providerKeyMissing=true when the skip was due to a missing provider/API key in the QA environment (this is almost always a top-3 root cause). Quote the evidence line.`,
    { label: 'audit:qa-skips', phase: 'Audit', model: M.qaskip, schema: QASKIP_SCHEMA }
  ),
])

const cases = (specdrill && specdrill.cases) || []
log(`Audit: shape=${shape ? 'ok' : 'FAIL'} buckets=${categorization ? categorization.buckets.length : 0} spec-cases=${cases.length} cross-uc=${crossuc ? crossuc.findings.length : 0} qa-skips=${qaskips ? qaskips.skips.length : 0}`)

// ---------------------------------------------------------------------------
// Phase: Verify (FIX #2) — re-read each quoted spec/code span. Drop a case
// ONLY on high-confidence positive counter-evidence; uncertain → KEEP + flag.
// Pipeline (no barrier): each case verifies as soon as it is ready.
// ---------------------------------------------------------------------------
phase('Verify')
const verifiedCases = (await parallel(
  cases.map((c) => async () => {
    const verdict = await agent(
      `You are adversarially verifying a post-mortem case by RE-READING the actual files — do not trust the paraphrase.\n` +
      `Project repo: \`${projectPath}\`. Fix commit: ${c.sha} — ${c.description}\n` +
      `Claimed spec file: ${c.specPath || '(none)'}\nClaimed spec quote: "${c.specQuote || ''}"\nClaimed code-needed: "${c.codeNeededQuote || ''}"\nClassification: ${c.trichotomy}; GAP: ${c.gapCategory}\n\n` +
      `${repoAccessNote}\n\n` +
      `Open the spec file at the stated path and \`git -C ${projectPath} show ${c.sha}\`. Confirm the spec quote appears verbatim (set quoteConfirmed) and that the trichotomy classification holds. ` +
      `Set refuted=true ONLY if you found POSITIVE EVIDENCE the case is wrong (the quote does not exist, or the classification is clearly mis-assigned) at HIGH confidence. If you cannot confirm either way, set needs_context=true and refuted=false — KEEP the case. Never refute on uncertainty.`,
      { label: `verify:${c.sha.slice(0, 7)}`, phase: 'Verify', model: M.verify, schema: VERDICT_SCHEMA }
    )
    if (verdict && verdict.refuted && verdict.confidence === 'high') {
      log(`  ✗ refuted case ${c.sha.slice(0, 7)} "${c.description}" (high, evidence-backed) — dropped`)
      return null
    }
    const kept = Object.assign({}, c, {
      verified: !!(verdict && verdict.quoteConfirmed && !verdict.needs_context),
      needs_context: !!(verdict && verdict.needs_context),
    })
    if (verdict && (verdict.needs_context || verdict.refuted)) {
      log(`  ⚠ kept case ${c.sha.slice(0, 7)} (refuted=${!!verdict.refuted} conf=${verdict.confidence || '?'} needs_context=${!!verdict.needs_context})`)
    }
    return kept
  })
)).filter(Boolean)
log(`Verify: ${verifiedCases.length}/${cases.length} cases survived`)

// ---------------------------------------------------------------------------
// Phase: Synthesize — deterministic GAP→owning-skill resolution (JS table, A4),
// dedup (Opus barrier), then the writer renders the retrospective artifact.
// ---------------------------------------------------------------------------
phase('Synthesize')

// Resolve owner+gate for every case via the fixed table (no agent decides this).
const attributed = verifiedCases.map((c) => Object.assign({}, c, resolveOwner(c.gapCategory)))
// Per-skill rollup (mechanical).
const bySkill = {}
for (const c of attributed) {
  for (const owner of (c.owners.length ? c.owners : ['(unmapped)'])) {
    ;(bySkill[owner] = bySkill[owner] || []).push(c)
  }
}
const skillRollup = Object.entries(bySkill).map(([skill, cs]) => ({ skill, count: cs.length, gates: [...new Set(cs.flatMap((c) => c.gates))], shas: cs.map((c) => c.sha.slice(0, 7)) }))
log(`Synthesize: ${attributed.length} attributed case(s) across ${skillRollup.length} skill(s); ${attributed.filter((c) => !c.mapped).length} unmapped`)

// One Opus agent writes the retrospective in the EXACT structure of the prose
// recipe (so workflow output and recipe output are structurally interchangeable).
await agent(
  `Write the post-mortem retrospective to \`${artifactOut}\` for the project "${project}" (repo at \`${projectPath}\`).\n` +
  `Match THIS structure exactly (the skill-postmortem-algorithm deliverable), in this order:\n` +
  `  1. TL;DR — headline finding + bucket percentages.\n` +
  `  2. A table, one row per fix case: \`SHA · description · bucket · owning skill · why missed\`.\n` +
  `  3. Per-case sections with VERBATIM spec quotes (no paraphrase — the quotes below were re-read and verified).\n` +
  `  4. Per-skill diagnosis (which cases hit it, the systemic gap, a recommendation — do NOT edit skills here).\n` +
  `  5. Cross-cutting patterns.\n` +
  `  6. Recommended next steps — one bullet per proposed skill PR.\n` +
  `Use \`date -u +%Y-%m-%dT%H:%M:%SZ\` via Bash for any timestamp (do not invent it). Honour no-private-info: this is the user's own project, names are fine, but no local /Users/ paths or dump metadata in the artifact.\n\n` +
  `PROJECT SHAPE:\n${JSON.stringify(shape, null, 2)}\n\n` +
  `FIX-COMMIT BUCKETS:\n${JSON.stringify(categorization, null, 2)}\n\n` +
  `VERIFIED CASES (each already mapped to owning skill + gate via the canonical GAP table; "verified" means the quote was re-read, "needs_context" means kept-but-unconfirmed):\n${JSON.stringify(attributed, null, 2)}\n\n` +
  `CROSS-UC FINDINGS:\n${JSON.stringify((crossuc && crossuc.findings) || [], null, 2)}\n\n` +
  `QA SKIPS (flag provider-key skips as a likely top-3 root cause):\n${JSON.stringify((qaskips && qaskips.skips) || [], null, 2)}\n\n` +
  `PER-SKILL ROLLUP (deterministic, from the GAP→skill table — use these owning-skill attributions verbatim, do not re-derive them):\n${JSON.stringify(skillRollup, null, 2)}`,
  { label: 'write:retrospective', phase: 'Synthesize', model: M.write }
)

return {
  project,
  artifact: artifactOut,
  boundary: boundaryRef,
  totalCases: cases.length,
  verifiedCases: verifiedCases.length,
  unmappedCases: attributed.filter((c) => !c.mapped).length,
  skillRollup,
  qaSkips: (qaskips && qaskips.skips) || [],
  crossUc: (crossuc && crossuc.findings) || [],
}

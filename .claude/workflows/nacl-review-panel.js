export const meta = {
  name: 'nacl-review-panel',
  description: 'Code-review critic-panel: deterministic gates → parallel per-category reviewers → adversarial verify → JS headline. Drop-in alternative producer of nacl-tl-review output.',
  whenToUse: 'When you would run /nacl-tl-review UC### --be|--fe (or TECH), and want a fan-out critic panel with false-positive filtering. Requires CC 2.1.154+. The markdown nacl-tl-review skill remains the canonical fallback.',
  phases: [
    { title: 'Context', detail: 'fetch pinned diff + read task spec files' },
    { title: 'Gates', detail: 'repo-checks / stubs+independence / nav-actions / baseline (parallel)' },
    { title: 'Review', detail: 'one reviewer agent per checklist category (8 BE / 10 FE)' },
    { title: 'Verify', detail: 'adversarial skeptic per BLOCKER/CRITICAL finding — refute or keep' },
    { title: 'Synthesize', detail: 'JS headline decision table + write review artifact' },
  ],
}

// ---------------------------------------------------------------------------
// Checklist categories — verbatim from nacl-tl-review/SKILL.md.
// Full bullets live in nacl-tl-core/references/{review,fe-review}-checklist.md;
// reviewer agents are pointed at those files for detail.
// ---------------------------------------------------------------------------
const BE_DIMENSIONS = [
  { key: 'correctness', name: 'Code Correctness', hint: 'logic vs requirements, edge cases (empty/null/boundary), async/await, unhandled rejections, error propagation' },
  { key: 'quality', name: 'Code Quality', hint: 'naming, single-responsibility, nesting depth, DRY, no unjustified any, strict mode' },
  { key: 'errors', name: 'Error Handling', hint: 'no swallowed errors, actionable messages, logged with context, sanitized user-facing errors' },
  { key: 'testing', name: 'Testing', hint: 'new code tested, happy+error+edge, AAA, independent tests, behavior-focused names' },
  { key: 'security', name: 'Security', hint: 'no hardcoded secrets, input validated, injection prevented (parameterized queries), authz on endpoints' },
  { key: 'performance', name: 'Performance', hint: 'no N+1, pagination, no sync blocking, no leaks (listeners/intervals)' },
  { key: 'docs', name: 'Documentation', hint: 'JSDoc on public APIs, WHY-comments on complex logic, no TODO without ticket' },
  { key: 'git', name: 'Git and Commits', hint: 'conventional format, atomic logical commits, TDD phases visible (test→feat→refactor)' },
]

const FE_DIMENSIONS = [
  { key: 'architecture', name: 'Component Architecture', hint: 'logic in hooks/utils, <150 lines, one component/file, typed props, composition, no prop drilling >3' },
  { key: 'typescript', name: 'TypeScript Quality', hint: 'no any in props/state/responses, no unjustified as, correct event typing, constrained generics, Zod for external data' },
  { key: 'state', name: 'State Management', hint: 'TanStack Query for server state, no redundant state, Zustand for global, no useEffect for derived state' },
  { key: 'api', name: 'API Integration', hint: 'no fetch() in components, error+loading states, types match api-contract, cache invalidation, optimistic updates' },
  { key: 'forms', name: 'Forms and Validation', hint: 'Zod+RHF validation, field-level errors, disable on submit, controlled pattern, reset on success' },
  { key: 'a11y', name: 'Accessibility', hint: 'accessible names, alt text, keyboard nav, semantic HTML, focus management, SR announcements' },
  { key: 'responsive', name: 'Responsive Design', hint: 'mobile-first, no horizontal scroll, 44px touch targets, no fixed widths, consistent breakpoints' },
  { key: 'fe-performance', name: 'Performance', hint: 'no needless re-renders, virtualized lists, lazy heavy components, justified memo/callback, bundle impact' },
  { key: 'rtl', name: 'Testing (RTL)', hint: 'covers acceptance, getByRole>getByTestId, userEvent not fireEvent, edge cases, waitFor/findBy, behavior not impl' },
  { key: 'stubs-cleanup', name: 'Stubs/Mocks Cleanup', hint: 'no TODO/STUB/MOCK in components, no hardcoded mock data, no placeholder text, no commented code, no console.log, no MSW in prod paths' },
]

// ---------------------------------------------------------------------------
// Schemas — structured output forces validated objects (no parsing).
// ---------------------------------------------------------------------------
const FINDING_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    severity: { type: 'string', enum: ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'] },
    file: { type: 'string' },
    line: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    fix: { type: 'string' },
    rationale: { type: 'string' },
    categories: { type: 'array', items: { type: 'string' } }, // set by the dedup pass when one issue spans categories
    verified: { type: 'boolean' },
  },
  required: ['severity', 'file', 'title', 'description'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string' },
    triState: { type: 'string', enum: ['PASS', 'PARTIAL', 'FAIL'] },
    findings: { type: 'array', items: FINDING_ITEM },
  },
  required: ['category', 'triState', 'findings'],
}

const DEDUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { findings: { type: 'array', items: FINDING_ITEM } },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean' }, // true ONLY with positive evidence the finding is wrong
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    needs_context: { type: 'boolean' }, // could not confirm either way → KEEP the finding
    reasoning: { type: 'string' },
  },
  required: ['refuted', 'reasoning'],
}

const GATE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    repoChecks: { type: 'string', enum: ['GREEN', 'RED', 'UNRUN', 'UNRUNNABLE'] },
    repoChecksEvidence: { type: 'string' },
    stubsDecision: { type: 'string', enum: ['PROCEED', 'FLAG', 'BLOCK'] },
    stubsDetail: { type: 'string' },
    independenceMajor: { type: 'boolean' },
    independenceOverlapPct: { type: 'number' },
    navActions: { type: 'string', enum: ['GREEN', 'BLOCKED_MISSING', 'BLOCKED_NO_ENTRYPOINT', 'EXEMPT', 'UNRUNNABLE'] },
    navActionsEvidence: { type: 'string' },
    testRunner: { type: 'string', enum: ['RAN', 'NO_INFRA', 'RUNNER_BROKEN'] },
    baselineResolved: { type: 'boolean' },
    newFailures: { type: 'number' },
    postfixFailures: { type: 'number' },
    testImportsChangedFiles: { type: 'boolean' },
  },
  required: ['repoChecks', 'stubsDecision', 'navActions', 'testRunner'],
}

// ---------------------------------------------------------------------------
// assignHeadline — JS port of nacl-tl-review SKILL.md Step 8b precedence table.
// First matching row wins. This is the core win over prose: ~12 rows of
// precedence + the P4 rule become a deterministic, testable function instead
// of something an agent re-derives on every run.
// ---------------------------------------------------------------------------
function assignHeadline(g, findings) {
  const has = (sev) => findings.some((f) => f.severity === sev)
  // 1–4: blocking gates (order matters)
  if (g.repoChecks !== 'GREEN') {
    const tag = g.repoChecks === 'RED' ? 'repo-checks-RED' : g.repoChecks === 'UNRUN' ? 'repo-checks-UNRUN' : 'repo-checks-UNRUNNABLE'
    return { headline: `REVIEW APPLIED — BLOCKED (${tag})`, approvedAllowed: false }
  }
  if (g.navActions === 'BLOCKED_MISSING') return { headline: 'REVIEW APPLIED — BLOCKED (nav-actions-missing)', approvedAllowed: false }
  if (g.navActions === 'BLOCKED_NO_ENTRYPOINT') return { headline: 'REVIEW APPLIED — BLOCKED (nav-actions-no-natural-entrypoint-evidence)', approvedAllowed: false }
  if (g.stubsDecision === 'BLOCK') return { headline: 'REVIEW APPLIED — BLOCKED (critical stubs)', approvedAllowed: false }
  // 5–6: runner halts
  if (g.testRunner === 'NO_INFRA') return { headline: 'REVIEW HALTED — NO_INFRA', approvedAllowed: false }
  if (g.testRunner === 'RUNNER_BROKEN') return { headline: 'REVIEW HALTED — RUNNER_BROKEN', approvedAllowed: false }
  // 7: regression (baseline resolved, new failures introduced)
  if (g.baselineResolved && (g.newFailures || 0) > 0) return { headline: 'REVIEW INCOMPLETE — REGRESSION', approvedAllowed: false }
  // 8: pre-existing failures only (postfix ⊆ baseline, postfix>0)
  if (g.baselineResolved && (g.newFailures || 0) === 0 && (g.postfixFailures || 0) > 0) return { headline: 'REVIEW APPLIED — BLOCKED (pre-existing failures)', approvedAllowed: false }
  // 9: tests passed but test author overlap > 50%
  if (g.independenceMajor) return { headline: 'REVIEW APPLIED — UNVERIFIED (test author overlap)', approvedAllowed: false }
  // 10: tests passed but no test imports the changed files
  if (g.testImportsChangedFiles === false) return { headline: 'REVIEW APPLIED — UNVERIFIED (no test covers change)', approvedAllowed: false }
  // 11: postfix failures but baseline could not be resolved
  if (!g.baselineResolved && (g.postfixFailures || 0) > 0) return { headline: 'REVIEW APPLIED — UNVERIFIED (no baseline)', approvedAllowed: false }
  // 12: fully clean
  return { headline: 'REVIEW COMPLETE', approvedAllowed: true }
}

// P4 rule + calibration: APPROVED only when headline is REVIEW COMPLETE AND no
// surviving BLOCKER *and no surviving CRITICAL*. A CRITICAL is "should fix before
// approval" — letting it through was the family-cinema over-approval failure.
function computeVerdict(headline, approvedAllowed, findings) {
  const blockers = findings.filter((f) => f.severity === 'BLOCKER').length
  const criticals = findings.filter((f) => f.severity === 'CRITICAL').length
  if (approvedAllowed && headline === 'REVIEW COMPLETE' && blockers === 0 && criticals === 0) return 'APPROVED'
  return 'CHANGES REQUESTED'
}

function actionRequired(verdict, findings) {
  if (verdict === 'APPROVED') return 'none'
  const b = findings.filter((f) => f.severity === 'BLOCKER').length
  const c = findings.filter((f) => f.severity === 'CRITICAL').length
  const parts = []
  if (b) parts.push(`${b} blocker${b > 1 ? 's' : ''}`)
  if (c) parts.push(`${c} critical issue${c > 1 ? 's' : ''}`)
  return parts.length ? `address ${parts.join(', ')}` : 'address review findings'
}

// ---------------------------------------------------------------------------
// Args (all optional; defaults aim at the bench fixture for a hermetic dry-run)
// ---------------------------------------------------------------------------
const a = args || {}
const taskId = a.taskId || 'UC001'
const mode = a.mode || 'be' // 'be' | 'fe' | 'tech'
const gateMode = a.gateMode || 'provided' // 'provided' | 'live'
const genericMode = a.genericMode === true
const root = a.root || 'bench/fixtures/review-panel'
const diffPath = a.diffPath || `${root}/diff.patch`
const baseRef = a.baseRef || 'main'
const headRef = a.headRef || 'HEAD'
const repoPath = a.repoPath || '.'
const specPaths = a.specPaths || { task: `${root}/task-be.md`, acceptance: `${root}/acceptance.md`, result: `${root}/result-be.md` }
const artifactOut = a.artifactOut || `${root}/review-${mode}.md`
const mo = a.modelOverrides || {}
// Requirements-traceability is its own reviewer (catches missing-requirement defects
// the per-category reviewers don't, e.g. the REQ-037-05 miss). Skipped in genericMode (no spec).
const REQUIREMENTS_DIM = { key: 'requirements', name: 'Requirements Traceability', kind: 'requirements', hint: 'each REQ / acceptance criterion actually implemented in the diff + repo' }
const BASE_DIMENSIONS = mode === 'fe' ? FE_DIMENSIONS : BE_DIMENSIONS
const DIMENSIONS = genericMode ? BASE_DIMENSIONS : [REQUIREMENTS_DIM].concat(BASE_DIMENSIONS)
const checklistRef = mode === 'fe' ? 'nacl-tl-core/references/fe-review-checklist.md' : 'nacl-tl-core/references/review-checklist.md'

log(`nacl-review-panel: task=${taskId} mode=${mode} gateMode=${genericMode ? 'generic' : gateMode} dimensions=${DIMENSIONS.length}`)

// ---------------------------------------------------------------------------
// Phase: Context — resolve the pinned diff + the spec text once.
// ---------------------------------------------------------------------------
phase('Context')
let context
if (a.diffText) {
  // Diff supplied directly (guaranteed verbatim — preferred for large real diffs
  // that an LLM context agent might truncate when echoing them back).
  context = { diffText: a.diffText, changedFiles: a.changedFiles || [], summary: a.summary || '(summary not provided)' }
  log(`Context: provided inline (${context.changedFiles.length} changed file(s), ${context.diffText.length} chars)`)
} else {
  const specFiles = genericMode ? [] : [specPaths.task, specPaths.acceptance, specPaths.result].filter(Boolean)
  const fileMode = !genericMode && (a.diffPath || gateMode === 'provided')
  const diffSource = fileMode
    ? `The diff under review is in the file \`${diffPath}\`. Read it.`
    : `Run \`git -C ${repoPath} diff ${baseRef}..${headRef}\` to get the pinned diff.`
  const specInstruction = specFiles.length ? `Then read the task spec file(s): ${specFiles.map((f) => `\`${f}\``).join(', ')}.` : 'There are no NaCl spec files in generic mode.'
  context = await agent(
    `You are gathering review context. ${diffSource} ${specInstruction}\n` +
    `Return: the list of changed files with +added/-removed counts; a 4-6 sentence summary of what the change ` +
    `is supposed to do and its key requirements; ` +
    (fileMode
      ? `and an empty string for diffText (downstream reviewers read the diff file directly).`
      : `and the FULL diff text verbatim in diffText.`),
    {
      label: 'context',
      phase: 'Context',
      model: mo.context || 'haiku',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          diffText: { type: 'string' },
          changedFiles: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
        required: ['changedFiles', 'summary'],
      },
    }
  )
  context.diffText = context.diffText || ''
  log(`Context: ${context.changedFiles.length} changed file(s)`)
}

// How reviewers receive the diff: inline it for small/git-sourced diffs; for a
// real patch file, tell them to read it directly (verbatim, no echo fidelity risk).
const inlineDiff = !!a.diffText || genericMode || !(a.diffPath || gateMode === 'provided')
const diffForPrompt = inlineDiff
  ? `Diff under review:\n\`\`\`diff\n${context.diffText}\n\`\`\``
  : `Read the FULL verbatim diff under review from the file \`${diffPath}\` (source of truth — do not trust the summary for code-level details).`

// FIX #1: reviewers and verifiers MUST be able to read the surrounding repo — the
// family-cinema run showed that diff-only scope blinds the panel to cross-file and
// missing-requirement defects (the worst bugs). Give them the repo root and tell
// them to follow the diff's dependencies.
const repoAccessNote = `The CHANGE under review is the diff, but you MUST judge it in context: the target repository is at \`${repoPath}\`. Read the files the diff depends on — imports, called functions, types, the runtime/service that produces the data, DB migrations, the API contract, and the consumers of any value the diff changes — using paths under \`${repoPath}\`. Cross-file and missing-integration defects are exactly what this review must catch; do NOT restrict yourself to the diff hunks.`

// ---------------------------------------------------------------------------
// Phase: Gates — deterministic, mechanical, run ONCE (Haiku where it's pure
// shell/git/Cypher). In generic mode they are skipped entirely.
// ---------------------------------------------------------------------------
let gates
if (genericMode) {
  gates = { repoChecks: 'GREEN', stubsDecision: 'PROCEED', navActions: 'EXEMPT', testRunner: 'RAN', baselineResolved: true, newFailures: 0, postfixFailures: 0, testImportsChangedFiles: true }
  log('Gates: skipped (generic mode)')
} else if (gateMode === 'provided') {
  gates = Object.assign(
    { repoChecks: 'GREEN', stubsDecision: 'PROCEED', navActions: 'EXEMPT', testRunner: 'RAN', baselineResolved: true, newFailures: 0, postfixFailures: 0, testImportsChangedFiles: true },
    a.providedGates || {}
  )
  log(`Gates: provided (repoChecks=${gates.repoChecks} navActions=${gates.navActions} newFailures=${gates.newFailures})`)
} else {
  // LIVE: run the four deterministic gates in parallel. Barrier is correct here —
  // we need ALL gate results to decide short-circuit.
  phase('Gates')
  const gateResults = await parallel([
    () => agent(
      `Run the repo-wide check gate on the wave-tip commit, LITERALLY (no npm substitution, keep -r):\n` +
      `\`pnpm -r lint\`, then \`pnpm -r typecheck\`, then \`pnpm -r test\` in ${repoPath}.\n` +
      `GREEN = all three exit 0. RED = any exits non-zero. UNRUN = a script is missing/crashed. UNRUNNABLE = no pnpm / no workspace root.\n` +
      `Return repoChecks and a short repoChecksEvidence string like 'repo-checks-GREEN:<sha>'.`,
      { label: 'gate:repo-checks', phase: 'Gates', model: mo.gates || 'haiku', schema: GATE_SCHEMA }
    ),
    () => agent(
      `Stub gate + test-author independence for ${taskId} in ${repoPath}.\n` +
      `Read .tl/stub-registry.json (filter this task) and scan changed files (${context.changedFiles.join(', ')}) for TODO/FIXME/STUB/MOCK/HACK.\n` +
      `BLOCK on CRITICAL or orphaned stubs; if >3 WARNING stubs, each comment must match (UC|TECH|FR|BUG)-?\\d+|https?:// else BLOCK.\n` +
      `Then compute test-author overlap: git log --format=%ae on test files vs production files; independenceMajor=true if overlap>50%.\n` +
      `Return stubsDecision, stubsDetail, independenceMajor, independenceOverlapPct.`,
      { label: 'gate:stubs+independence', phase: 'Gates', model: mo.gates || 'haiku', schema: GATE_SCHEMA }
    ),
    () => agent(
      `Nav-actions consumer check (W7) for affected UC(s) ${JSON.stringify(a.affectedUcIds || [taskId])}.\n` +
      `Run the nav_actions_consumer_check query from nacl-sa-ui/references/reachability.cypher §4 against the project Neo4j, ` +
      `then read QA evidence (.tl/tasks/${taskId}/qa-*.md) for a natural-entrypoint path.\n` +
      `GREEN = both conditions hold; BLOCKED_MISSING = no HAS_INBOUND_ACTION; BLOCKED_NO_ENTRYPOINT = no natural-entrypoint QA evidence; ` +
      `EXEMPT = actor=SYSTEM / has_ui=false / entrypoint_type deep-link|embed; UNRUNNABLE = no graph reachable.\n` +
      `Return navActions and navActionsEvidence.`,
      { label: 'gate:nav-actions', phase: 'Gates', model: mo.gates || 'sonnet', schema: GATE_SCHEMA }
    ),
    () => agent(
      `Baseline test gate for ${taskId} in ${repoPath}. Resolve baseline ref (priority: --base ${a.base || '(none)'}; ` +
      `.tl/tasks/${taskId}/baseline-failures-${mode}.json; else git merge-base HEAD ${baseRef}).\n` +
      `Run declared scripts.test postfix (working tree) and on the baseline via \`git worktree add\` (remove the worktree on every exit path).\n` +
      `testRunner: RAN / NO_INFRA (scripts.test undeclared) / RUNNER_BROKEN. Compute newFailures = postfix − baseline (set arithmetic). ` +
      `If no baseline resolves, baselineResolved=false and do NOT classify failures. Also report testImportsChangedFiles.\n` +
      `Return testRunner, baselineResolved, newFailures, postfixFailures, testImportsChangedFiles.`,
      { label: 'gate:baseline', phase: 'Gates', model: mo.gates || 'sonnet', schema: GATE_SCHEMA }
    ),
  ])
  // Merge the four partial gate objects (nulls = agent failure → treat as UNRUN/blocking).
  const merged = {}
  for (const r of gateResults) if (r) Object.assign(merged, r)
  gates = {
    repoChecks: merged.repoChecks || 'UNRUN',
    repoChecksEvidence: merged.repoChecksEvidence,
    stubsDecision: merged.stubsDecision || 'BLOCK',
    stubsDetail: merged.stubsDetail,
    independenceMajor: merged.independenceMajor || false,
    independenceOverlapPct: merged.independenceOverlapPct,
    navActions: merged.navActions || 'UNRUNNABLE',
    navActionsEvidence: merged.navActionsEvidence,
    testRunner: merged.testRunner || 'RUNNER_BROKEN',
    baselineResolved: merged.baselineResolved || false,
    newFailures: merged.newFailures || 0,
    postfixFailures: merged.postfixFailures || 0,
    testImportsChangedFiles: merged.testImportsChangedFiles !== false,
  }
  log(`Gates (live): repoChecks=${gates.repoChecks} stubs=${gates.stubsDecision} nav=${gates.navActions} runner=${gates.testRunner} newFailures=${gates.newFailures}`)
}

// Short-circuit: if a blocking gate fired, the panel is pointless — skip it.
const blockingHeadline = genericMode ? null : assignHeadline(gates, [])
const shortCircuit = !genericMode && blockingHeadline.headline !== 'REVIEW COMPLETE' &&
  // UNVERIFIED-family headlines still warrant the panel (quality review continues);
  // only hard BLOCKED / HALTED / REGRESSION short-circuit.
  /BLOCKED|HALTED|REGRESSION/.test(blockingHeadline.headline)

let verifiedFindings = []
if (shortCircuit) {
  log(`Short-circuit: ${blockingHeadline.headline} — skipping the critic panel.`)
} else {
  // -------------------------------------------------------------------------
  // Phase: Review + Verify — pipeline (NO barrier): each category's findings
  // are adversarially verified the moment that category finishes.
  // -------------------------------------------------------------------------
  phase('Review')
  const perDim = await pipeline(
    DIMENSIONS,
    // Stage 1: one reviewer agent per checklist category (+ a requirements reviewer).
    (dim) => {
      const specRefs = (genericMode ? [] : [specPaths.task, specPaths.acceptance, specPaths.result]).filter(Boolean)
      const common =
        `Change summary: ${context.summary}\nChanged files: ${context.changedFiles.join(', ')}\n\n` +
        `${diffForPrompt}\n\n${repoAccessNote}\n\n` +
        `Set the category field to "${dim.name}". Return triState (PASS/PARTIAL/FAIL) and a findings array. ` +
        `Each finding: severity (BLOCKER=must fix / CRITICAL=should fix before approval / MAJOR=should fix later / ` +
        `MINOR=nice to have), file, line, title, description, fix, rationale. Be specific and constructive. ` +
        `Do NOT invent commit/CI/PR-metadata findings (the artifact is a squashed diff) and do NOT pad with ` +
        `stylistic nitpicks. If nothing is wrong, return an empty findings array with triState PASS.`
      const prompt = dim.kind === 'requirements'
        ? `You are verifying REQUIREMENTS TRACEABILITY for ${taskId}. Read the task spec(s): ` +
          `${specRefs.map((f) => `\`${f}\``).join(', ') || '(none provided)'} and extract EVERY requirement / ` +
          `acceptance criterion (REQ-xxx, FC/SC/EH ids, numbered must-haves).\n\n${common}\n\n` +
          `For EACH requirement decide — by reading the diff AND the repo end-to-end — whether it is actually ` +
          `implemented and reachable. Report a finding for every requirement that is MISSING or only ` +
          `PARTIALLY/incorrectly implemented: BLOCKER if a core functional/security requirement is entirely ` +
          `absent, CRITICAL if partial/incorrect, MAJOR if a minor requirement is missing. Title like ` +
          `"REQ-xxx not implemented". triState PASS only if every requirement is fully met.`
        : `You are a senior code reviewer reviewing ONLY the "${dim.name}" category for ${taskId}.\n` +
          `Focus: ${dim.hint}.\nFull checklist for this category: ${checklistRef} (read the matching section).\n\n` +
          `${common}\n` +
          `Report only issues that belong to THIS category; report at most the 3-4 most important.`
      return agent(prompt, { label: `review:${dim.key}`, phase: 'Review', model: mo.dimensions || undefined, schema: FINDINGS_SCHEMA })
    },
    // Stage 2: adversarially verify each BLOCKER/CRITICAL finding (false-positive killer).
    async (review, dim) => {
      const out = { category: review.category, triState: review.triState, findings: [] }
      for (const f of review.findings) {
        // MINOR findings pass through unverified (cheap, low-stakes); BLOCKER/CRITICAL/MAJOR are adversarially checked.
        if (f.severity === 'MINOR') { out.findings.push(f); continue }
        const verdict = await agent(
          `You are adversarially checking a ${f.severity} code-review finding. Confirm or refute it with EVIDENCE — read the actual code, don't guess.\n\n` +
          `Finding: ${f.title}\nFile: ${f.file}:${f.line || '?'}\nClaim: ${f.description}\nRationale given: ${f.rationale || '(none)'}\n\n` +
          `${diffForPrompt}\n\n${repoAccessNote}\n\n` +
          `Read the referenced file(s) and their dependencies under \`${repoPath}\` to test the claim: is the code path reachable, does the code actually do what's claimed, is it guarded/handled elsewhere, is the requirement really unmet?\n` +
          `Set refuted=true ONLY if you found POSITIVE EVIDENCE the finding is wrong (you read the guard/handler/consumer/requirement that makes it a non-issue). If you cannot confirm either way after looking, set needs_context=true and refuted=false — KEEP the finding. NEVER refute on mere uncertainty; never refute a BLOCKER without high-confidence, evidence-backed proof. Cite what you read in reasoning.`,
          { label: `verify:${dim.key}:${f.severity}`, phase: 'Verify', model: mo.verify || 'sonnet', schema: VERDICT_SCHEMA }
        )
        // FIX #2: drop ONLY on high-confidence, evidence-backed refutation. Uncertain /
        // medium / low confidence → KEEP. (A medium-confidence refute previously dropped a
        // real BLOCKER on family-cinema.) Mark kept-but-unconfirmed findings needs-context.
        if (verdict && verdict.refuted && verdict.confidence === 'high') {
          log(`  ✗ refuted ${f.severity} "${f.title}" (high, evidence-backed) — dropped`)
        } else {
          if (verdict && (verdict.refuted || verdict.needs_context)) {
            log(`  ⚠ kept ${f.severity} "${f.title}" (refuted=${!!verdict.refuted} conf=${verdict.confidence || '?'} needs_context=${!!verdict.needs_context})`)
          }
          out.findings.push(Object.assign({}, f, { verified: !(verdict && verdict.needs_context), needs_context: !!(verdict && verdict.needs_context) }))
        }
      }
      return out
    }
  )
  verifiedFindings = perDim.filter(Boolean).flatMap((d) => d.findings)
  log(`Review+Verify: ${verifiedFindings.length} finding(s) survived across ${DIMENSIONS.length} categories`)
}

// ---------------------------------------------------------------------------
// Phase: Synthesize — pure-JS headline/verdict, then one writer agent.
// ---------------------------------------------------------------------------
phase('Synthesize')

// Dedup + merge across categories (barrier). Fan-out lets independent reviewers
// report the SAME root cause from several categories; collapsing them restores
// the natural dedup a single-agent (markdown skill) reviewer does implicitly.
if (verifiedFindings.length > 1) {
  const deduped = await agent(
    `These code-review findings came from independent per-category reviewers, so the SAME root issue may appear ` +
    `several times (e.g. one SQL-injection reported by Security, Correctness, AND the controller reviewer). ` +
    `Merge findings that describe the same root cause at the same code location into ONE finding: keep the ` +
    `HIGHEST severity, union the rationale, and set "categories" to the list of categories it spanned. ` +
    `Drop exact duplicates. Do NOT invent new findings, do NOT escalate/demote severity except as a result of ` +
    `merging, and keep every genuinely distinct issue.\n\n` +
    `Findings:\n${JSON.stringify(verifiedFindings, null, 2)}\n\nReturn the merged findings array.`,
    { label: 'synth:dedup', phase: 'Synthesize', model: mo.dedup || undefined, schema: DEDUP_SCHEMA }
  )
  if (deduped && Array.isArray(deduped.findings)) {
    log(`Dedup: ${verifiedFindings.length} → ${deduped.findings.length} finding(s)`)
    verifiedFindings = deduped.findings
  }
}

if (genericMode) {
  // No NaCl contract — emit a plain findings report.
  const counts = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'].map((s) => `${s}: ${verifiedFindings.filter((f) => f.severity === s).length}`).join(', ')
  log(`Generic review complete — ${counts}`)
  await agent(
    `Write a concise code-review findings report to \`${artifactOut}\` for a generic diff review (no NaCl contract).\n` +
    `Summary: ${context.summary}\nChanged files: ${context.changedFiles.join(', ')}\n` +
    `Findings (already adversarially verified; severities BLOCKER/CRITICAL/MAJOR/MINOR):\n${JSON.stringify(verifiedFindings, null, 2)}\n` +
    `Group by severity, one section each; for each finding show file:line, description, recommended fix, rationale. ` +
    `Open with a one-line tally (${counts}).`,
    { label: 'write:generic-report', phase: 'Synthesize', model: mo.synth || undefined }
  )
  return { mode: 'generic', findings: verifiedFindings, counts }
}

const { headline, approvedAllowed } = assignHeadline(gates, verifiedFindings)
const verdict = computeVerdict(headline, approvedAllowed, verifiedFindings)
const action = actionRequired(verdict, verifiedFindings)
const statusLine = `Workflow status: \`${headline}\`. Code judgment: \`${verdict}\`. Action required: ${action === 'none' ? 'none' : action}.`
log(statusLine)

// One writer agent renders the artifact using the canonical template and updates tracking.
await agent(
  `Write the code-review artifact to \`${artifactOut}\` using the template at ` +
  `\`nacl-tl-core/templates/review-template.md\` (match its structure/frontmatter exactly).\n\n` +
  `THE FIRST CONTENT LINE OF THE SUMMARY SECTION MUST BE, VERBATIM:\n${statusLine}\n\n` +
  `Task: ${taskId} (${mode}). Change summary: ${context.summary}\nChanged files: ${context.changedFiles.join(', ')}\n` +
  `Gate evidence: ${JSON.stringify({ repoChecks: gates.repoChecksEvidence || gates.repoChecks, navActions: gates.navActionsEvidence || gates.navActions, stubs: gates.stubsDecision, independenceMajor: gates.independenceMajor, newFailures: gates.newFailures })}\n` +
  `Verified findings (severities BLOCKER/CRITICAL/MAJOR/MINOR):\n${JSON.stringify(verifiedFindings, null, 2)}\n\n` +
  `Render all sections per template (acceptance verification, the ${DIMENSIONS.length}-category checklist with PASS/PARTIAL/FAIL, ` +
  `issues by severity, test verification, TDD compliance, positive observations, final decision). ` +
  `Use \`date -u +%Y-%m-%dT%H:%M:%SZ\` via Bash for timestamps (do not invent them). ` +
  `Set frontmatter result to ${verdict === 'APPROVED' ? 'approved' : (verifiedFindings.some((f) => f.severity === 'BLOCKER') ? 'rejected' : 'needs_rework')}.\n` +
  `Then, if a status.json exists for this task, update the matching phase ` +
  `(${mode === 'be' ? 'phases.review_be' : mode === 'fe' ? 'phases.review_fe' : 'status'}) to ` +
  `${verdict === 'APPROVED' ? 'approved' : 'in_progress'}, and append a REVIEW line to changelog.md. ` +
  `In gateMode=provided / fixture runs the status.json may not exist — that is fine, skip it.`,
  { label: 'write:review-artifact', phase: 'Synthesize', model: mo.synth || undefined }
)

return {
  taskId,
  mode,
  headline,
  verdict,
  statusLine,
  findingCounts: {
    blocker: verifiedFindings.filter((f) => f.severity === 'BLOCKER').length,
    critical: verifiedFindings.filter((f) => f.severity === 'CRITICAL').length,
    major: verifiedFindings.filter((f) => f.severity === 'MAJOR').length,
    minor: verifiedFindings.filter((f) => f.severity === 'MINOR').length,
  },
  findings: verifiedFindings,
  gates,
  artifact: artifactOut,
}

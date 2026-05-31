# NaCl dynamic workflows (additive, optional)

JavaScript orchestration scripts for Claude Code's **dynamic workflows** runtime. These sit
**alongside** the markdown `nacl-*` skills — they do **not** replace them. The markdown skills
remain canonical and are the fallback on any environment where workflows are unavailable.

## Requirements

- **Claude Code ≥ 2.1.154** (dynamic workflows). Max/Team/Enterprise: on by default.
  Pro: enable the **Dynamic workflows** row in `/config`.
- Workflows spawn many subagents and cost **meaningfully more tokens** than the equivalent
  markdown-skill run. Start narrow; watch `/workflows` for per-phase token totals.
- A NaCl-aware environment (the `nacl-*` skills + `nacl-tl-core/` references present) for the
  non-generic paths.

## When to prefer a workflow over the skill

Reach for a workflow only when the work is **LLM-judgment-heavy AND parallelizable AND benefits
from independent perspectives / adversarial verification** (review, audit, finding-triage,
diagnosis). Mechanical query/file/git work stays deterministic inside a single gate agent.
See `docs/research/workflows-for-nacl.md` for the full decision rule and scenario taxonomy.

## Workflows

### `nacl-review-panel` — code-review critic panel

A drop-in alternative **producer** of `nacl-tl-review` output. Deterministic gates (repo-checks,
stubs+independence, nav-actions, baseline) run once and gate everything; the 8 BE / 10 FE
checklist categories then fan out as parallel reviewer agents; every BLOCKER/CRITICAL finding is
adversarially verified (false-positive killer); a pure-JS decision table assigns the headline
(P4 rule enforced) and one writer agent renders the artifact. **Output contract is identical to
the markdown skill** — same headline vocabulary, combined status line, artifact filenames.

**Phase-1 fixture dry-run (hermetic — no real pnpm/git/Cypher):**

```
Run the nacl-review-panel workflow with args:
{
  "taskId": "UC001",
  "mode": "be",
  "gateMode": "provided",
  "root": "bench/fixtures/review-panel",
  "providedGates": { "repoChecks": "GREEN", "stubsDecision": "PROCEED", "navActions": "EXEMPT",
                     "testRunner": "RAN", "baselineResolved": true, "newFailures": 0,
                     "postfixFailures": 0, "testImportsChangedFiles": true }
}
```

Expected: SQLi BLOCKER survives → `CHANGES REQUESTED`; the spurious "missing authz" finding is
refuted and dropped; `bench/fixtures/review-panel/review-be.md` written.

**Generic review of any repo (no NaCl `.tl/` needed):**

```
{ "genericMode": true, "gateMode": "live", "repoPath": ".", "baseRef": "main", "headRef": "HEAD",
  "artifactOut": "review-findings.md" }
```

**Live NaCl head-to-head (Path A):** `gateMode:"live"`, point `root`/`specPaths`/`repoPath` at a
real project's `.tl/tasks/<UC>/`, pin the wave-tip SHA, and compare against `/nacl-tl-review UC### --be`.

### `args` reference

| key | default | meaning |
|-----|---------|---------|
| `taskId` | `UC001` | task under review |
| `mode` | `be` | `be` \| `fe` \| `tech` (selects 8 BE / 10 FE checklist) |
| `gateMode` | `provided` | `provided` (gate results from `providedGates`) \| `live` (run real gates) |
| `genericMode` | `false` | skip NaCl gates + headline contract; review an arbitrary `git diff` |
| `root` / `diffPath` / `specPaths` | fixture | where to find the diff + spec files |
| `repoPath` / `baseRef` / `headRef` | `.` / `main` / `HEAD` | git source for live/generic diff |
| `providedGates` | all-GREEN | gate results for `gateMode:"provided"` |
| `modelOverrides` | gates=haiku, rest inherit | `{ context, gates, dimensions, verify, synth }` → `haiku`\|`sonnet`\|`opus` |
| `artifactOut` | `<root>/review-<mode>.md` | where to write the review artifact |

### `nacl-postmortem-panel` — skill-gap post-mortem

The one NaCl audit that justifies a workflow: **rare, read-only, high-stakes**, genuinely helped by
independent specialist perspectives. Five **parallel** auditors (project shape / fix-commit
categorization / spec-artifact drill / cross-UC connectivity / `nacl-tl-qa` SKIPs) → an evidence
**verify** stage (re-reads each quoted span; drops a case only on high-confidence counter-evidence) →
a deterministic **GAP→owning-skill** synthesis (`GAP_TO_SKILL` JS table citing G1–G11) → one writer
agent. **Output is structurally identical to the prose recipe** (`skill-postmortem-algorithm`): the
`docs/retrospectives/<project>-postmortem.md` deliverable. See `nacl-postmortem/SKILL.md`.

**Trigger:** a finished `nacl-*`-built project with a git **dev→fix boundary**.

**Fixture dry-run (hermetic, labeled ground truth):**

```
bench/fixtures/postmortem/build-fixture.sh /tmp/pm-fixture
# Run the nacl-postmortem-panel workflow with args:
{ "projectPath": "/tmp/pm-fixture", "project": "pm-fixture",
  "artifactOut": "/tmp/pm-fixture-postmortem.md", "ghAvailable": false,
  "modelOverrides": { "specdrill": "sonnet", "crossuc": "sonnet", "synth": "sonnet" } }
```

Expected: boundary = the "declared done" commit; the 3 fix cases recovered with one each of
`SPEC_RIGHT_DEV_DRIFTED` / `SPEC_MISSING` / `SPEC_WRONG`; the `LIVE_PROVIDER_SMOKE` missing-key skip
flagged; the qa-skip case mapped to `nacl-tl-qa` (G3). See `bench/fixtures/postmortem/GROUND-TRUTH.md`.

**Real run (A-Val-2):** point `projectPath` at a finished project; compare the artifact against a
single-agent prose-recipe run on the same git history (same root-cause skill gaps? cost?).

#### `args` reference

| key | default | meaning |
|-----|---------|---------|
| `projectPath` | fixture | abs path to the audited git repo |
| `project` | basename | name used in the artifact + default out path |
| `boundaryHint` | auto | `{sha,subject}` to skip auto-resolution of the dev→fix boundary |
| `artifactOut` | `docs/retrospectives/<project>-postmortem.md` | where to write the retrospective |
| `ghAvailable` | `true` | include PR descriptions (`gh pr view`) in categorization |
| `modelOverrides` | tiered (A5) | `{ boundary, shape, categorize, specdrill, crossuc, qaskip, verify, synth, write }` → `haiku`\|`sonnet`\|`opus` |

## Known gotcha — `args` vs `scriptPath`

Observed on CC 2.1.156: when a workflow is launched via the Workflow tool's `scriptPath`,
the tool-level `args` object did **not** reach the script's `args` global (the script fell
back to its defaults). Until confirmed otherwise, for a parameterised run either pass the
script **inline** (the `script` param) with `args`, or bake the run config into the script
(replace `const a = args || {}` with a literal config object). The Phase-2 head-to-head used
the baked-config approach (`/tmp/nacl-review-panel-uc037be.js`).

## Saving as a slash command

After a good run, `/workflows` → select the run → press `s` to save it as `/<name>` for reuse.

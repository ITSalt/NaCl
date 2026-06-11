# Code over prompt: extracting deterministic logic from agent skills, and measuring it

*How NaCl 2.19.0 moved five hand-derived decisions into tested tools — and the 240-call A/B
that proves the prose path was the bug.*

## Terms (before we use them)

- **Skill** — a folder with a `SKILL.md`: instructions to an agent in natural language, plus
  optional scripts. The agent loads it by description when relevant.
- **Tool** — a deterministic script the skill *calls* instead of performing the procedure by
  reasoning.
- **Prose path** — the procedure described in `SKILL.md` words; the agent executes it by
  reasoning, fresh, every run.
- **distinct** — how many different outputs a model produced over N identical runs (1 = fully
  deterministic).
- **Ground truth / oracle** — the expected answer derived from the spec *by hand*, not from
  the tool (otherwise the test is circular).

## The thesis, and its mechanism

In June 2026 Anthropic's Agent-Skills guidance settled on a rule worth taking literally:
**use scripts for deterministic operations, and natural language only for genuine judgment
calls.** The mechanism behind it is the part that matters for autonomous agents: when a
deterministic procedure lives in prose, the agent doesn't *recall* it — it **re-derives and
re-executes it by reasoning, every single run**. Reasoning is not reproducible between runs
or between models. Across a long autonomous loop, that is a steady drip of variance and
silent error. A script has no interpretation layer: it either runs or it doesn't.

NaCl — a graph-based BA/SA/TL methodology built entirely out of `nacl-*` skills — already had
exactly **one** tool built this way, `classify-status.mjs`, whose own header says it: *"an
agent re-deriving that order each run is a variance + cost source."* The obvious question was
whether that pattern generalizes, and by how much. 2.19.0 is the answer.

## Five extractions

Five decisions that were prose the agent re-derived each run became single-authority,
test-pinned scripts:

| Decision | Tool | Shape of the logic |
|---|---|---|
| branch slug + base-branch guard | `branch.sh` | text transform + safety precondition |
| execution-wave assignment | `wave-plan.mjs` | topological sort |
| validation severity rollup + exemptions | `classify-findings.mjs` | decision table |
| post-merge CI watch + health probe | `wait-for-ci.sh` / `health-check.sh` | polling loops |
| BA id formatting | `nacl-ids.mjs` | formatter |

Every one is a **behaviour-neutral** refactor: the tool reproduces the documented behaviour
exactly, pinned by a co-located test. What changes is *how* the answer is derived (a tool
call), never *what* is emitted.

## How to look: the measurement

Claims about determinism should be measured, not asserted. We built a reproducible A/B
harness that runs the same decision two ways, holding everything constant except the skill
text:

- **OLD** — the prose rules in the prompt; the model computes the answer by hand.
- **NEW** — "run this script; report its output."

`{Haiku 4.5, Opus 4.8} × {slug, wave-plan, classify-findings} × {old, new} × N=20` = **240
`claude -p` calls**, paced through `itsalt-pinch` (which caps automation at a human-plausible
rate — *automate yourself, not around Anthropic*). The tool's output is ground truth, pinned
by tests written from the spec.

Run it yourself: `node bench/skill-tools/ab/ab.mjs --models haiku,opus --n 20`.

### Result (240/240, $16)

| Tool | Model | OLD prose (distinct · correct) | NEW tool |
|---|---|---|---|
| slug | Haiku | **3 · 90%** | 1 · 100% |
| | Opus | 1 · 100% | 1 · 100% |
| wave-plan | Haiku | **2 · 5%** | 1 · 100% |
| | Opus | **4 · 20%** | 1 · 100% |
| classify-findings | Haiku | 1 · 100% | 1 · 100% |
| | Opus | **2 · 40%** | 1 · 100% |

Four readings, each with its mechanism:

1. **The tool arm was perfect and the models deferred.** 6/6 cells `1 distinct · 100%`, both
   models, and never once did the NEW arm re-derive instead of running the script. The "run
   this command" instruction works.
2. **An algorithm collapses by hand.** Wave assignment — a topological sort with dependency
   edges — was 5% (Haiku) / 20% (Opus) correct, 2–4 different layouts. Drop one dependency
   edge and a frontend task lands before the backend it needs.
3. **A boundary rule trips even the strong model.** On the validation rollup, Opus was **40%**
   correct at the "5 warnings + exempt criticals" boundary, where several boolean exemption
   filters must be applied exactly.
4. **Stronger isn't safer.** On that rollup, Opus (40%) did *worse* by hand than Haiku (100%).
   The lesson isn't "Opus is weaker" — it's that **you cannot predict which (model × rule)
   pair silently fails.** Removing that unpredictability is the whole value of a tool.
   (Bonus: the prose arm also spends *more* output tokens — Opus's by-hand wave answer ran
   3280 tokens vs the tool's 409. Reasoning is both wronger and dearer.)

### Honest boundary

On *easy* inputs a strong model matches the tool (Opus, slug: `1 · 100%`). There, the tool
buys guaranteed determinism and fewer tokens, not more accuracy. The gap widens on
algorithmic/boundary rules and weaker models — so we report it where it's real, not as "the
tool is always more accurate."

## Re-verified on a live project

A benchmark on synthetic inputs invites the objection "but on real data, in a real run, the
agent does better." So we checked. On a live `/nacl-sa-validate` run against the `family-cinema`
project, the actual invocation **called `classify-findings.mjs`** — verifiable in the session
transcript as a real `Bash` tool-use, not a string the agent claimed. Re-running the tool on
the *exact recorded input* reproduced the verdict byte-for-byte and matched an independent,
hand-derived oracle (9 non-exempt CRITICAL → `FAIL`; the two exemption-flagged findings
correctly *not* exempt).

Then we ran the other arm on that real data. With a deliberately explicit rule statement both
models matched the tool 100% — an honest result that *refines* the benchmark rather than
contradicting it: prose accuracy is a function of how explicitly the rule is phrased. With the
**verbatim skill prose** (the actual `coalesce(...)` filter tables, no hand-holding) on a
boundary case, the weaker model **flipped the gate `PASS → WARN` 1 run in 6** by missing one
exemption. The tool returned `PASS` deterministically every time.

## The twist: the same bug was framework-wide

The most useful finding came from a live `--feature` plan. `wave-plan.mjs` had been wired only
into the from-scratch planning path; the **incremental** path that a mature project actually
uses bypassed the tool entirely, and the agent re-derived the waves. Grepping all 127 session
transcripts confirmed the tool had **never executed**. So we generalized the tool (an `assign`
mode that offsets a feature's tasks onto the existing wave sequence) and routed the
incremental path through it — then audited the other four tools for the same shape. They had
it:

- **deploy** and **deliver** reimplemented `gh run watch` + retrying health `curl` by hand.
- **ba-validate** rolled up severity by hand.
- **hotfix** and **conductor** slugified branch names by hand.
- and a quiet **correctness** divergence: `ba-sync` formatted ids with a `right()` idiom that
  *truncates* the high digits past the pad width (`GPR-00` for the 100th group), while the
  three BA-modelling skills used the canonical `apoc.text.lpad`. Same id type, two answers.

2.19.0 consolidates the cross-skill tools into one home (`nacl-core/scripts/`), wires every
consumer, and ends the id divergence by adopting the canonical left-pad everywhere. A tool
helps only where the skill actually routes to it — so the audit (which path calls which tool)
is itself a permanent part of the discipline.

## Take it to your own project

Determinism isn't worth much if you can't tell whether the tool is *right*. The release ships
`VERIFICATION-PLAYBOOK.md`: write an independent oracle by hand from the spec (with edge cases
and real data), confirm the tool matches it on 100%, run the prose arm N≥20, and accept the
tool as "accurate **and** better" only when all three hold — it matches the oracle, it's
deterministic *and* the model actually deferred to it, and the prose arm errs or varies on at
least one edge case. Where you can, add a downstream check (does the wave plan actually respect
every dependency? is the slug a valid branch name?) — the strongest "really better".

The point isn't to script everything. It's to put determinism where it belongs, and to keep
the prose for the judgment that genuinely needs it — and then to *measure* the line between
them instead of guessing at it.

---

*NaCl is an open framework of `nacl-*` agent skills for graph-based BA/SA/TL work. 2.19.0 and
the full benchmark are in the repo under `bench/skill-tools/`.*
